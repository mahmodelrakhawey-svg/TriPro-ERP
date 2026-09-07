import React, { useEffect, useState } from 'react';
import { Form, Input, DatePicker, Select, Button, message, Card } from 'antd';
import { supabase } from '@/supabaseClient';
import { CalendarOutlined } from '@ant-design/icons';

export const SurgeryBookingForm: React.FC<{ visitId: string, onSuccess: () => void }> = ({ visitId, onSuccess }) => {
  const [form] = Form.useForm();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDoctors = async () => {
      const { data } = await supabase
        .from('hims_doctors')
        .select('id, profiles(full_name), specialization')
        .eq('is_active', true);
      setDoctors(data || []);
    };
    fetchDoctors();
  }, []);

  const onFinish = async (values: any) => {
    setLoading(true);
    const payload = {
      visit_id: visitId,
      surgery_name: values.surgery_name,
      lead_surgeon_id: values.doctor_id,
      room_number: values.room_number,
      scheduled_start: values.scheduled_start.toISOString(),
      status: 'scheduled'
    };

    const { error } = await supabase.from('hims_surgeries').insert([payload]);

    if (error) {
      message.error('خطأ في حجز العملية: ' + error.message);
    } else {
      message.success('تم جدولة العملية بنجاح ✅');
      form.resetFields();
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <Card title={<b><CalendarOutlined /> حجز موعد عملية جراحية</b>} className="rounded-2xl">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="surgery_name" label="نوع العملية" rules={[{ required: true }]}>
          <Input placeholder="مثال: استئصال الزائدة الدودية" />
        </Form.Item>

        <div className="grid grid-cols-2 gap-4">
          <Form.Item name="doctor_id" label="الجراح المسؤول" rules={[{ required: true }]}>
            <Select placeholder="اختر الطبيب">
              {doctors.map(doc => (
                <Select.Option key={doc.id} value={doc.id}>{doc.profiles?.full_name} ({doc.specialization})</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="room_number" label="رقم الغرفة">
            <Input placeholder="غرفة عمليات 1" />
          </Form.Item>
        </div>

        <Form.Item name="scheduled_start" label="موعد العملية" rules={[{ required: true }]}>
          <DatePicker showTime className="w-full" />
        </Form.Item>

        <Button type="primary" htmlType="submit" block size="large" className="bg-indigo-600 rounded-xl" loading={loading}>
          تأكيد حجز العملية
        </Button>
      </Form>
    </Card>
  );
};