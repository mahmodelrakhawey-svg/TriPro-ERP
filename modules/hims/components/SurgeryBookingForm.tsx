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

  const onFinish = async (values: Record<string, any>) => {
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
      message.error('Ø®Ø·Ø£ ÙÙŠ Ø­Ø¬Ø² Ø§Ù„Ø¹Ù…Ù„ÙŠØ©: ' + error.message);
    } else {
      message.success('ØªÙ… Ø¬Ø¯ÙˆÙ„Ø© Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­ âœ…');
      form.resetFields();
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <Card title={<b><CalendarOutlined /> Ø­Ø¬Ø² Ù…ÙˆØ¹Ø¯ Ø¹Ù…Ù„ÙŠØ© Ø¬Ø±Ø§Ø­ÙŠØ©</b>} className="rounded-2xl">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="surgery_name" label="Ù†ÙˆØ¹ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©" rules={[{ required: true }]}>
          <Input placeholder="Ù…Ø«Ø§Ù„: Ø§Ø³ØªØ¦ØµØ§Ù„ Ø§Ù„Ø²Ø§Ø¦Ø¯Ø© Ø§Ù„Ø¯ÙˆØ¯ÙŠØ©" />
        </Form.Item>

        <div className="grid grid-cols-2 gap-4">
          <Form.Item name="doctor_id" label="Ø§Ù„Ø¬Ø±Ø§Ø­ Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„" rules={[{ required: true }]}>
            <Select placeholder="Ø§Ø®ØªØ± Ø§Ù„Ø·Ø¨ÙŠØ¨">
              {doctors.map(doc => (
                <Select.Option key={doc.id} value={doc.id}>{doc.profiles?.full_name} ({doc.specialization})</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="room_number" label="Ø±Ù‚Ù… Ø§Ù„ØºØ±ÙØ©">
            <Input placeholder="ØºØ±ÙØ© Ø¹Ù…Ù„ÙŠØ§Øª 1" />
          </Form.Item>
        </div>

        <Form.Item name="scheduled_start" label="Ù…ÙˆØ¹Ø¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©" rules={[{ required: true }]}>
          <DatePicker showTime className="w-full" />
        </Form.Item>

        <Button type="primary" htmlType="submit" block size="large" className="bg-indigo-600 rounded-xl" loading={loading}>
          ØªØ£ÙƒÙŠØ¯ Ø­Ø¬Ø² Ø§Ù„Ø¹Ù…Ù„ÙŠØ©
        </Button>
      </Form>
    </Card>
  );
};
