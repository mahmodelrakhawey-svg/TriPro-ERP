import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Card, Modal, List, Badge, Typography, Space, Tooltip, Alert, Input } from 'antd';
import { MedicineBoxOutlined, WarningOutlined, CheckCircleOutlined, BarcodeOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useToastNotification } from '@/utils/toastUtils';
import { useAccounting } from '@/context/AccountingContext';
import { format } from 'date-fns';

const { Text, Title } = Typography;

export default function ClinicalPharmacy() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPresc, setSelectedPresc] = useState(null);
  const [detailsModalVisible, setDetailsModal] = useState(false);
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const { currentUser } = useAccounting();
  const toast = useToastNotification();

  useEffect(() => {
    fetchPendingPrescriptions();
  }, []);

  const fetchPendingPrescriptions = async () => {
    const orgId = currentUser?.organization_id;
    if (!orgId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('hims_prescriptions')
      .select(`
        *,
        patient:visit_id(hims_patients(full_name)),
        doctor:doctor_id(profile_id(full_name))
      `)
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) toast.error('فشل جلب الوصفات الطبية');
    else setPrescriptions(data || []);
    setLoading(false);
  };

  const handleBarcodeSearch = async (value: string) => {
    const orgId = currentUser?.organization_id;
    if (!orgId) return;

    const code = value.trim();
    if (!code) return;

    // البحث عن الروشتة عبر معرفها (الذي يطبع كباركود)
    const { data, error } = await supabase
      .from('hims_prescriptions')
      .select(`*, patient:visit_id(hims_patients(full_name)), doctor:doctor_id(profile_id(full_name))`)
      .eq('organization_id', orgId)
      .or(`id.eq.${code},diagnosis.ilike.%${code}%`) // دعم البحث بالمعرف أو النص
      .single();

    if (data) {
      handleViewDetails(data);
      setBarcodeSearch('');
    } else {
      toast.error('لم يتم العثور على روشتة بهذا الكود ❌');
    }
  };

  const checkMedicationStatus = async (medications) => {
    // جلب بيانات المخزون والصلاحية الحالية للأدوية المطلوبة
    const productIds = medications.map(m => m.product_id);
    const { data: products } = await supabase
      .from('products')
      .select('id, name, stock, expiry_date')
      .in('id', productIds);

    return medications.map(med => {
      const product = products?.find(p => p.id === med.product_id);
      const isExpired = product?.expiry_date && new Date(product.expiry_date) < new Date();
      const hasShortage = (product?.stock || 0) < med.qty;
      
      return {
        ...med,
        product_name: product?.name || 'صنف غير معروف',
        current_stock: product?.stock || 0,
        expiry_date: product?.expiry_date,
        isValid: !isExpired && !hasShortage,
        error: isExpired ? 'منتهي الصلاحية' : hasShortage ? 'عجز في المخزون' : null
      };
    });
  };

  const handleViewDetails = async (presc) => {
    const checkedMeds = await checkMedicationStatus(presc.medications);
    setSelectedPresc({ ...presc, checkedMeds });
    setDetailsModal(true);
  };

  const dispenseMedication = async () => {
    try {
      // التحقق النهائي من الصلاحية قبل الاستدعاء
      const invalidItems = selectedPresc.checkedMeds.filter(m => !m.isValid);
      if (invalidItems.length > 0) {
        return toast.warning('لا يمكن الصرف: توجد أصناف غير صالحة طبياً أو مخزنياً');
      }

      const { error } = await supabase.rpc('hims_dispense_prescription', {
        p_prescription_id: selectedPresc.id
      });

      if (error) throw error;

      toast.success('تم صرف الوصفة الطبية وتحديث المخزون بنجاح');
      setDetailsModal(false);
      fetchPendingPrescriptions();
    } catch (error: any) {
      toast.error(error.message || 'فشل في عملية الصرف');
    }
  };

  const columns = [
    { title: 'التاريخ', dataIndex: 'created_at', render: (date) => format(new Date(date), 'yyyy-MM-dd HH:mm') },
    { title: 'المريض', render: (_, r) => r.patient?.hims_patients?.full_name },
    { title: 'الطبيب المعالج', render: (_, r) => r.doctor?.profile_id?.full_name },
    { title: 'التشخيص', dataIndex: 'diagnosis', ellipsis: true },
    { 
      title: 'الحالة', 
      dataIndex: 'status',
      render: () => <Tag color="blue">قيد الانتظار</Tag>
    },
    {
      title: 'الإجراء',
      render: (_, r) => (
        <Button type="primary" icon={<MedicineBoxOutlined />} onClick={() => handleViewDetails(r)}>
          مراجعة وصرف
        </Button>
      )
    }
  ];

  return (
    <div className="p-6">
      <Title level={2}><MedicineBoxOutlined /> الصيدلية السريرية</Title>
      
      <Card className="mb-6 shadow-sm">
        <Space size="large">
          <Badge status="processing" text="وصفات بانتظار الصرف" />
          <Input 
            prefix={<BarcodeOutlined className="text-blue-500" />} 
            placeholder="امسح باركود الروشتة هنا..." 
            className="w-80 rounded-xl"
            value={barcodeSearch}
            onChange={e => setBarcodeSearch(e.target.value)}
            onPressEnter={() => handleBarcodeSearch(barcodeSearch)}
          />
        </Space>
      </Card>

      <Table 
        columns={columns} 
        dataSource={prescriptions} 
        loading={loading}
        rowKey="id"
        bordered
      />

      <Modal
        title="تفاصيل الوصفة والتحقق من الأمان"
        open={detailsModalVisible}
        onCancel={() => setDetailsModal(false)}
        width={800}
        footer={[
          <Button key="back" onClick={() => setDetailsModal(false)}>إلغاء</Button>,
          <Button 
            key="submit" 
            type="primary" 
            danger 
            icon={<CheckCircleOutlined />} 
            onClick={dispenseMedication}
            disabled={selectedPresc?.checkedMeds?.some(m => !m.isValid)}
          >
            تأكيد الصرف النهائي
          </Button>
        ]}
      >
        {selectedPresc && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded">
              <Text strong>المريض: {selectedPresc.patient?.hims_patients?.full_name}</Text>
              <Text strong>رقم الزيارة: {selectedPresc.visit_id.substring(0,8)}</Text>
            </div>

            <List
              header={<Text strong>الأدوية المطلوبة:</Text>}
              dataSource={selectedPresc.checkedMeds}
              renderItem={(item: any) => (
                <List.Item className={`border-l-4 ${item.isValid ? 'border-green-500' : 'border-red-500'}`}>
                  <div className="w-full flex justify-between items-center">
                    <div>
                      <Text strong>{item.product_name}</Text>
                      <br />
                      <Text type="secondary">{item.dosage} - {item.frequency}</Text>
                    </div>
                    <div className="text-left">
                      <Space direction="vertical" align="end">
                        <Tag color={item.isValid ? 'green' : 'red'}>
                          المطلوب: {item.qty} | المتوفر: {item.current_stock}
                        </Tag>
                        {!item.isValid && (
                          <Tooltip title={item.error}>
                            <Text type="danger"><WarningOutlined /> {item.error}</Text>
                          </Tooltip>
                        )}
                        {item.expiry_date && (
                          <Text type={new Date(item.expiry_date) < new Date() ? 'danger' : 'secondary'}>
                            الصلاحية: {item.expiry_date}
                          </Text>
                        )}
                      </Space>
                    </div>
                  </div>
                </List.Item>
              )}
            />

            {selectedPresc.checkedMeds.some(m => !m.isValid) && (
              <Alert description="تنبيه: لا يمكن صرف هذه الوصفة لوجود أخطاء في الصلاحية أو الكمية." type="error" showIcon />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}