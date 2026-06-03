import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Table, Card, Tag, Button, Row, Col, Typography, Badge, message, Modal, List, Empty, Tooltip } from 'antd';
import { MedicineBoxOutlined, SendOutlined, HistoryOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

export const PharmacyDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const fetchPendingPrescriptions = async () => {
    if (!currentUser) return;
    setLoading(true);
    const { data } = await supabase
      .from('hims_prescriptions')
      .select('*, hims_visits!inner(hims_patients(id, full_name, national_id, phone))')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    setPrescriptions(data || []);
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
            onClick={() => setSelectedOrder(record)}
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
        onOk={() => dispenseMedication(selectedOrder.id)}
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
            </div>
            <Typography.Text strong className="block mb-2">قائمة الأدوية المطلوبة:</Typography.Text>
            <List
              dataSource={selectedOrder.medications}
              renderItem={(item: any) => (
                <List.Item className="flex justify-between border-b-slate-50">
                  <span className="text-base"><MedicineBoxOutlined className="ml-2 text-emerald-500" /> <b>{item.drug_name}</b></span>
                  <Tag color="blue" className="px-3 rounded-full">العدد: {item.qty}</Tag>
                  <Tag color="orange">{item.frequency}</Tag>
                </List.Item>
              )}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};