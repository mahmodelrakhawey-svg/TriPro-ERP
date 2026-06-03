import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Card, Typography, message, Space } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, UserAddOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import dayjs from 'dayjs';

export const AppointmentManager: React.FC = () => {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAppointments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hims_appointments')
      .select('*, hims_patients(full_name), hims_doctors(specialization)')
      .eq('appointment_date', dayjs().format('YYYY-MM-DD'))
      .order('queue_number', { ascending: true });
    setAppointments(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAppointments(); }, []);

  const columns = [
    { title: 'رقم الدور', dataIndex: 'queue_number', render: (n: number) => <Tag color="blue" className="rounded-full px-3">{n}</Tag> },
    { title: 'المريض', dataIndex: ['hims_patients', 'full_name'] },
    { title: 'العيادة', dataIndex: ['hims_doctors', 'specialization'] },
    { title: 'الوقت', dataIndex: 'appointment_time' },
    { title: 'الحالة', dataIndex: 'status', render: (s: string) => (
      <Tag color={s === 'arrived' ? 'green' : 'orange'}>
        {s === 'scheduled' ? 'مجدول' : s === 'arrived' ? 'حضر' : 'في الكشف'}
      </Tag>
    )},
    { title: 'إجراءات', render: (record: any) => (
      <Space>
        <Button type="primary" size="small" onClick={() => updateStatus(record.id, 'arrived')}>تسجيل حضور</Button>
      </Space>
    )}
  ];

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('hims_appointments').update({ status }).eq('id', id);
    if (!error) { message.success('تم تحديث حالة الموعد'); fetchAppointments(); }
  };

  return (
    <div className="p-6 rtl text-right">
      <Card className="rounded-3xl shadow-sm border-none">
        <div className="flex justify-between items-center mb-6">
          <Typography.Title level={3}><CalendarOutlined /> إدارة مواعيد اليوم</Typography.Title>
          <Button type="primary" icon={<UserAddOutlined />} shape="round" size="large">حجز موعد جديد</Button>
        </div>
        <Table dataSource={appointments} columns={columns} loading={loading} rowKey="id" />
      </Card>
    </div>
  );
};