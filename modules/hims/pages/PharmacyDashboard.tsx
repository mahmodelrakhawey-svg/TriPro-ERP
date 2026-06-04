import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Table, Card, Tag, Button, Row, Col, Typography, Badge, message, Modal, List, Empty, Tooltip, Divider, Statistic, Input } from 'antd';
import { MedicineBoxOutlined, SendOutlined, HistoryOutlined, CheckCircleOutlined, BarcodeOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

export const PharmacyDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [checkedMeds, setCheckedMeds] = useState<any[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');

  const fetchPendingPrescriptions = async () => {
    if (!currentUser) return;
    setLoading(true);
    const { data } = await supabase
      .from('hims_prescriptions')
      .select('*, hims_visits!inner(hims_patients(id, full_name, national_id, phone, allergies))')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    setPrescriptions(data || []);
    setLoading(false);
  };

  // مراجعة الصلاحية والمخزون قبل الصرف
  const handleReviewOrder = async (order: any) => {
    setLoading(true);
    const productIds = order.medications.map((m: any) => m.product_id).filter(Boolean); // تأكد من وجود product_id
    const { data: products } = await supabase.from('products').select('id, name, stock, sales_price, expiry_date, barcode').in('id', productIds);
    
    const enriched = order.medications.map((med: any) => ({
      ...med,
      current_stock: products?.find(p => p.id === med.product_id)?.stock || 0,
      price: products?.find(p => p.id === med.product_id)?.sales_price || 0,
      expiry_date: products?.find(p => p.id === med.product_id)?.expiry_date || null,
      is_scanned: false // حالة جديدة لتتبع ما إذا تم مسحه بالباركود
    }));
    
    setCheckedMeds(enriched);
    setSelectedOrder(order);
    setLoading(false);
  };

  useEffect(() => { fetchPendingPrescriptions(); }, [currentUser]);

  const dispenseMedication = async (orderId: string) => {
    if (!orderId || orderId === "") return message.error("عذراً، معرف الروشتة غير صالح");
    
    setLoading(true);
    // استدعاء RPC لمعالجة الصرف (خصم مخزون + تحديث حالة الروشتة + إضافة تكلفة للفاتورة)
    const { error } = await supabase.rpc('hims_dispense_prescription', {
      p_prescription_id: orderId
    });

    if (error) {
      message.error('فشل عملية الصرف: ' + error.message);
    } else {
      message.success('تم صرف العلاج وتحديث المخزون وقيود التكلفة بنجاح ✅');
      setSelectedOrder(null);
      fetchPendingPrescriptions();
    }
    setLoading(false);
  };

  // 🚀 دالة معالجة مسح الباركود
  const handleBarcodeScan = async () => {
    if (!barcodeInput) return;
    setLoading(true);
    try {
      // 1. البحث عن المنتج بالباركود
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, name, stock, sales_price, expiry_date')
        .eq('barcode', barcodeInput)
        .single();

      if (productError || !product) {
        message.error('لم يتم العثور على دواء بهذا الباركود.');
        return;
      }

      // 2. التحقق مما إذا كان الدواء ضمن الروشتة الحالية
      const existingMedIndex = checkedMeds.findIndex(med => med.product_id === product.id);
      if (existingMedIndex === -1) {
        message.warning(`الدواء "${product.name}" ليس ضمن الروشتة الحالية.`);
        return;
      }

      // 3. تحديث حالة الدواء في قائمة الصرف (تم مسحه)
      const updatedMeds = [...checkedMeds];
      updatedMeds[existingMedIndex] = {
        ...updatedMeds[existingMedIndex],
        is_scanned: true,
        current_stock: product.stock,
        expiry_date: product.expiry_date
      };
      setCheckedMeds(updatedMeds);
      message.success(`تم مسح الدواء "${product.name}" بنجاح.`);
    } catch (error: any) { message.error('خطأ في مسح الباركود: ' + error.message); }
    finally { setLoading(false); setBarcodeInput(''); }
  };

  const columns = [
    { title: 'التوقيت', dataIndex: 'created_at', render: (d: string) => dayjs(d).format('HH:mm') },
    { title: 'المريض', dataIndex: ['hims_visits', 'hims_patients', 'full_name'] },
    { 
      title: 'بيانات الهوية', 
      render: (_: any, record: any) => (
        <Typography.Text type="secondary" className="text-xs">
          {record.hims_visits?.hims_patients?.national_id || 'بدون رقم هوية'}
        </Typography.Text>
      ) 
    },
    { title: 'التشخيص الطبي', dataIndex: 'diagnosis', ellipsis: true },
    { 
      title: 'عدد الأصناف', 
      dataIndex: 'medications', 
      render: (meds: any[]) => <Badge count={meds?.length} showZero color="blue" /> 
    },
    { 
      title: 'إجراء', 
      render: (record: any) => (
        <Tooltip title="فتح تفاصيل الروشتة لتجهيز العلاج">
          <Button 
            type="primary" 
            icon={<MedicineBoxOutlined />} 
            onClick={() => handleReviewOrder(record)}
            className="bg-emerald-600 border-none rounded-lg font-bold"
          >
            تحضير وصرف
          </Button>
        </Tooltip>
      ) 
    }
  ];

  return (
    <div className="p-6 rtl text-right bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <Typography.Title level={2} className="m-0">
          <MedicineBoxOutlined className="text-emerald-600" /> صيدلية المستشفى الداخلية
        </Typography.Title>
        <Button icon={<HistoryOutlined />} onClick={fetchPendingPrescriptions}>تحديث القائمة</Button>
      </div>

      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Card className="rounded-3xl shadow-sm border-none overflow-hidden">
            {prescriptions.length === 0 && !loading ? (
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE} 
                description="لا توجد روشتات بانتظار الصرف حالياً"
                className="py-10"
              />
            ) : (
              <Table 
                dataSource={prescriptions} 
                columns={columns} 
                rowKey="id" 
                loading={loading}
                pagination={{ pageSize: 8 }}
                locale={{ emptyText: "جاري جلب البيانات من نظام الطبيب..." }}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title={<b>تفاصيل صرف الروشتة الإلكترونية</b>}
        open={!!selectedOrder}
        onCancel={() => setSelectedOrder(null)}
        onOk={() => Modal.confirm({ title: 'تأكيد الصرف', content: 'سيتم خصم الأدوية من المخزن وترحيل قيمتها لفاتورة المريض، هل أنت متأكد؟', onOk: () => dispenseMedication(selectedOrder.id) })}
        okText="تأكيد الصرف النهائي"
        cancelText="إغلاق"
        confirmLoading={loading}
        width={600}
      >
        {selectedOrder && (
          <div className="py-4">
            <div className="bg-blue-50 p-4 rounded-2xl mb-6 border border-blue-100">
              <Typography.Title level={5} className="m-0 text-blue-800">
                المريض: {selectedOrder.hims_visits?.hims_patients?.full_name}
              </Typography.Title>
              <div className="flex gap-4 mt-2">
                <Tag color="cyan">هاتف: {selectedOrder.hims_visits?.hims_patients?.phone || 'غير مسجل'}</Tag>
                <Tag color="blue">تاريخ: {dayjs(selectedOrder.created_at).format('YYYY/MM/DD')}</Tag>
              </div>
              
              {/* 🚨 تنبيه الحساسية في الصيدلية */}
              {selectedOrder.hims_visits?.hims_patients?.allergies?.length > 0 && (
                <div className="mt-4 p-3 bg-white/50 rounded-xl border border-volcano-200">
                  <b className="text-volcano-600 flex items-center gap-2">
                    <SafetyCertificateOutlined /> تنبيه الحساسية للصيدلي:
                  </b>
                  <div className="text-volcano-500 font-bold mt-1">
                    {selectedOrder.hims_visits.hims_patients.allergies.join('، ')}
                  </div>
                </div>
              )}
            </div>
            <Typography.Text strong className="block mb-2">قائمة الأدوية المطلوبة:</Typography.Text>
            
            {/* 🚀 حقل مسح الباركود */}
            <Input 
              placeholder="امسح باركود الدواء هنا..." 
              prefix={<BarcodeOutlined />} 
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onPressEnter={handleBarcodeScan}
              className="mb-4 rounded-lg"
              disabled={loading}
            />
            <Table
              className="mb-4"
              dataSource={checkedMeds}
              pagination={false}
              size="small"
              rowKey="product_id"
              columns={[
                { title: 'الدواء', dataIndex: 'drug_name', render: (n) => <b>{n}</b> },
                { title: 'المطلوب', dataIndex: 'qty', align: 'center' },
                { title: 'المخزن', dataIndex: 'current_stock', render: (s, r) => <Tag color={s >= r.qty ? 'green' : 'red'}>{s}</Tag> }, // ✅ عرض المخزون الفعلي
                { title: 'الصلاحية', dataIndex: 'expiry_date', render: (d, r) => { // ✅ عرض الصلاحية
                  if (!d) return <Tag>غير محدد</Tag>;
                  const isExpired = dayjs(d).isBefore(dayjs(), 'day');
                  return <Tag color={isExpired ? 'red' : 'green'}>{dayjs(d).format('YYYY-MM-DD')}</Tag>;
                }},
                { title: 'الحالة', render: (_, r) => ( // ✅ حالة المسح
                  r.is_scanned ? <Tag color="blue" icon={<CheckCircleOutlined />}>تم المسح</Tag> : <Tag>بانتظار المسح</Tag>
                )},
                { title: 'الإجمالي', render: (_, r) => <Typography.Text strong>{(r.qty * r.price).toLocaleString()} EGP</Typography.Text> }
                // ✅ يمكن إضافة عمود للتحقق من أن كل الأدوية المطلوبة تم مسحها قبل تفعيل زر الصرف
                // disabled={checkedMeds.some(med => !med.is_scanned)}
              ]}
            />
            <Divider />
            <div className="flex justify-between items-center bg-slate-900 p-4 rounded-xl text-white">
              <Statistic 
                title={<span className="text-slate-400">إجمالي قيمة الصرفية</span>} 
                value={checkedMeds.reduce((acc, curr) => acc + (curr.qty * curr.price), 0)} 
                precision={2} 
                suffix="EGP" 
                styles={{ content: { color: '#fff', fontWeight: 900 } }}
              />
              <BarcodeOutlined style={{ fontSize: 40, opacity: 0.3 }} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};