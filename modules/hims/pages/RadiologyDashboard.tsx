import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Card, Typography, Empty, message } from 'antd';
import { CameraOutlined, FileImageOutlined } from '@ant-design/icons';
import NotificationService from '@/services/notificationService'; // Assuming this path
import { supabase } from '@/supabaseClient';

export const RadiologyDashboard: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('hims_radiology_orders') 
      .select('*, hims_visits(doctor_id, hims_patients(id, full_name)), organization_id, scan_type') // Added doctor_id, patient_id, organization_id, scan_type
      .eq('status', 'pending');
    setOrders(data || []);
  };

  useEffect(() => { fetchOrders(); }, []);

  const submitResult = async (order: any) => {
    // In a real scenario, this would involve uploading images/reports and updating the order status.
    // For now, we'll just simulate completion and create a notification.
    const { error } = await supabase
      .from('hims_radiology_orders')
      .update({ status: 'completed', result_url: 'simulated_report_url' }) // Simulate result upload
      .eq('id', order.id);

    if (error) {
      message.error('فشل رفع التقرير: ' + error.message);
    } else {
      message.success('تم رفع تقرير الأشعة بنجاح ✅');
      // 🚀 إنشاء إخطار للطبيب بأن نتيجة الأشعة جاهزة
      if (order.hims_visits?.doctor_id) {
        await NotificationService.createNotification(
          order.hims_visits.doctor_id,
          order.organization_id,
          'نتيجة أشعة جديدة جاهزة',
          `نتيجة فحص ${order.scan_type} للمريض ${order.hims_visits.hims_patients.full_name} جاهزة.`,
          'radiology_result_ready',
          'medium',
          `/hims/doctor-desktop?patientId=${order.hims_visits.hims_patients.id}`,
          order.id
        );
        message.info('تم إخطار الطبيب بنتيجة الأشعة.');
      }
      fetchOrders();
    }
  };

  const columns = [
    { title: 'المريض', dataIndex: ['hims_visits', 'hims_patients', 'full_name'] },
    { title: 'نوع الفحص', dataIndex: 'scan_type' },
    { title: 'الحالة', render: (record: any) => <Tag color={record.status === 'pending' ? 'magenta' : 'green'}>{record.status === 'pending' ? 'قيد الانتظار' : 'مكتمل'}</Tag> },
    { title: 'إجراء', render: (record: any) => (
      record.status === 'pending' ? (
        <Button icon={<CameraOutlined />} onClick={() => submitResult(record)}>رفع التقرير/الصور</Button>
      ) : (
        <Tag color="green">مكتمل</Tag>
      )
    )}
  ];

  return (
    <div className="p-6 rtl text-right">
      <Card className="rounded-3xl shadow-sm border-none min-h-[500px]">
        <Typography.Title level={3}><FileImageOutlined /> وحدة الأشعة (Diagnostics)</Typography.Title>
        <Table dataSource={orders} columns={columns} rowKey="id" locale={{ emptyText: <Empty description="لا يوجد طلبات أشعة معلقة" /> }} />
      </Card>
    </div>
  );
};