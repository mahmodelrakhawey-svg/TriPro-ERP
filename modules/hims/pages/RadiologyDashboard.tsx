import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Card, Typography, Empty, message, Modal, Form, Input, Divider, Space, Tooltip } from 'antd';
import { CameraOutlined, FileImageOutlined, SendOutlined, CheckCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';

const { Title, Text } = Typography;

export const RadiologyDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchOrders = async () => {
    const orgId = currentUser?.organization_id;
    if (!orgId) return;

    setLoading(true);
    const { data } = await supabase
      .from('hims_radiology_orders') 
      .select('*, hims_visits(id, doctor_id, hims_patients(id, full_name), hims_billing(payment_status, insurance_provider_id))')
      .eq('organization_id', orgId)
      .eq('status', 'pending');
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const handleSubmitReport = async (values: any) => {
    if (!selectedOrder) return;
    
    setLoading(true);
    try {
      // استدعاء الـ RPC الاحترافي الذي أنشأناه في SQL
      // يقوم بتحديث الحالة + تسجيل التقرير + إخطار الطبيب آلياً
      const { error } = await supabase.rpc('hims_complete_radiology', {
        p_order_id: selectedOrder.id,
        p_report: values.report_text,
        p_images: [] // مجهز لاستقبال روابط الصور مستقبلاً
      });

      if (error) throw error;

      message.success('تم اعتماد تقرير الأشعة وإخطار الطبيب المعالج فوراً ✅');
      setSelectedOrder(null);
      form.resetFields();
      fetchOrders();
    } catch (err: any) {
      message.error('فشل في حفظ التقرير: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openReportModal = (order: any) => {
    setSelectedOrder(order);
    form.setFieldsValue({
      patient_name: order.hims_visits?.hims_patients?.full_name,
      scan_type: order.scan_type
    });
  };


  const columns = [
    { 
      title: 'بيانات الحالة', 
      render: (r: any) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.hims_visits?.hims_patients?.full_name}</Text>
          <Text type="secondary" className="text-xs">زيارة: {r.hims_visits?.id.substring(0,8)}</Text>
        </Space>
      )
    },
    { 
      title: 'نوع الفحص', 
      dataIndex: 'scan_type',
      render: (t: string) => <Tag color="blue" className="font-bold">{t}</Tag>
    },
    { 
      title: 'حالة السداد بالخزينة', 
      render: (record: any) => {
        const visitBilling = record.hims_visits?.hims_billing;
        const billing = Array.isArray(visitBilling) ? visitBilling[0] : visitBilling;
        if (billing?.insurance_provider_id) {
          return <Tag color="green">موافقة تأمينية 🛡️</Tag>;
        }
        const isPaid = billing?.payment_status === 'paid';
        return isPaid ? (
          <Tag color="success">مدفوع بالخزينة ✅</Tag>
        ) : (
          <Tag color="error">غير مدفوع (توجيه للصندوق) ⚠️</Tag>
        );
      }
    },
    { title: 'إجراء', render: (record: any) => {
      const visitBilling = record.hims_visits?.hims_billing;
      const billing = Array.isArray(visitBilling) ? visitBilling[0] : visitBilling;
      const isPaid = billing?.payment_status === 'paid' || billing?.insurance_provider_id;
      return record.status === 'pending' ? (
        <Tooltip title={!isPaid ? "يجب سداد قيمة الأشعة بالخزينة أولاً" : ""}>
          <Button 
            type="primary"
            icon={<CameraOutlined />} 
            onClick={() => openReportModal(record)}
            className={isPaid ? "bg-indigo-600 border-none font-bold" : ""}
            disabled={!isPaid}
          >
            كتابة التقرير
          </Button>
        </Tooltip>
      ) : (
        <Tag color="green">مكتمل</Tag>
      );
    }}
  ];

  return (
    <div className="p-6 rtl text-right">
      <Card className="rounded-3xl shadow-sm border-none min-h-[500px]">
        <Title level={3}><FileImageOutlined /> وحدة الأشعة والتشخيص التصويري</Title>
        <Table 
          dataSource={orders} 
          columns={columns} 
          rowKey="id" 
          loading={loading}
          locale={{ emptyText: <Empty description="لا توجد طلبات أشعة بانتظار التقارير" /> }} 
        />
      </Card>

      <Modal
        title={<b><FileTextOutlined /> تحرير تقرير شعاعي متخصص</b>}
        open={!!selectedOrder}
        onCancel={() => setSelectedOrder(null)}
        onOk={() => form.submit()}
        confirmLoading={loading}
        okText="اعتماد وإرسال للطبيب"
        cancelText="إلغاء"
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitReport} className="pt-4">
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl mb-4 border border-slate-100">
             <Form.Item name="patient_name" label="المريض" className="mb-0"><Input readOnly variant="borderless" className="font-bold text-indigo-700" /></Form.Item>
             <Form.Item name="scan_type" label="الفحص" className="mb-0"><Input readOnly variant="borderless" className="font-bold text-indigo-700" /></Form.Item>
          </div>
          
          <Form.Item 
            name="report_text" 
            label="التقرير الطبي النهائي" 
            rules={[{ required: true, message: 'يرجى كتابة التقرير' }]}
          >
            <Input.TextArea rows={12} placeholder="اكتب الوصف التفصيلي للحالة، الاستنتاج الطبي، والتوصيات..." className="rounded-xl" />
          </Form.Item>
          
          <p className="text-[10px] text-slate-400 italic">* بمجرد الاعتماد، سيظهر التقرير لحظياً في شاشة الطبيب المعالج.</p>
        </Form>
      </Modal>
    </div>
  );
};