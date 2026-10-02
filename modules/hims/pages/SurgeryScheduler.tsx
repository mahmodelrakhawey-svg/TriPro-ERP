import React, { useEffect, useState, useCallback } from 'react';
import { Card, Calendar, Badge, Modal, Button, Form, Select, DatePicker, Input, Space, Typography, Tag, Tooltip, Alert, Divider, message } from 'antd';
import { CalendarOutlined, PlusOutlined, UserOutlined, ClockCircleOutlined, InfoCircleOutlined, MedicineBoxOutlined, ReloadOutlined } from '@ant-design/icons';
import { RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { SurgeryExecutionForm } from '../components/SurgeryExecutionForm';
import { getOrgId } from '../himsHelpers';
import { HimsSurgery, HimsDoctor, HimsVisit } from '../hims.types';

const { Text } = Typography;

export const SurgeryScheduler: React.FC = () => {
  const { currentUser } = useAuth();
  const [surgeries, setSurgeries] = useState<HimsSurgery[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [executionModal, setExecutionModal] = useState<{ visible: boolean, surgeryId: string }>({ visible: false, surgeryId: '' });
  const [doctors, setDoctors] = useState<any[]>([]);  // partial data from query: id, specialization, profile
  const [pendingVisits, setPendingVisits] = useState<any[]>([]);  // partial data from query: id, hims_patients(full_name), visit_type
  const [form] = Form.useForm();

  const orgId = getOrgId(currentUser);

  const fetchSurgeries = useCallback(async () => {
    if (!orgId) {
      message.warning('Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…Ù†Ø¸Ù…Ø©ØŒ ÙŠØ±Ø¬Ù‰ Ø¥Ø¹Ø§Ø¯Ø© ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hims_surgeries')
        .select('*, doctor:lead_surgeon_id(profiles(full_name)), hims_visits(id, hims_patients(id, full_name))')
        .eq('organization_id', orgId)
        .order('scheduled_start', { ascending: true });
      if (error) throw error;
      setSurgeries(data || []);
    } catch (err) {
      message.error('Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª: ' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const fetchMetaData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [docsRes, visitsRes] = await Promise.all([
        supabase
          .from('hims_doctors')
          .select('id, specialization, profile:profile_id(full_name)')
          .eq('organization_id', orgId)
          .eq('is_active', true),
        supabase
          .from('hims_visits')
          .select('id, hims_patients(full_name), visit_type')
          .eq('organization_id', orgId)
          .neq('status', 'discharged'),
      ]);

      if (docsRes.error) throw docsRes.error;
      if (visitsRes.error) throw visitsRes.error;

      setDoctors(docsRes.data || []);
      setPendingVisits(visitsRes.data || []);
    } catch (err) {
      message.error('Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø£Ø·Ø¨Ø§Ø¡ ÙˆØ§Ù„Ø²ÙŠØ§Ø±Ø§Øª: ' + (err?.message || ''));
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchSurgeries();
      fetchMetaData();
    }
  }, [orgId, fetchSurgeries, fetchMetaData]);

  const handleSchedule = async (values: Record<string, any>) => {
    setLoading(true);
    const payload = {
      organization_id: currentUser?.organization_id,
      visit_id: values.visit_id,
      lead_surgeon_id: values.doctor_id,
      surgery_name: values.surgery_name,
      room_number: values.room_number,
      scheduled_start: values.times[0].toISOString(),
      scheduled_end: values.times[1].toISOString(),
      anaesthetist_name: values.anaesthetist,
      status: 'scheduled'
    };

    const { error } = await supabase
      .from('hims_surgeries')
      .insert([payload]);

    if (error) {
      // Ù‡Ù†Ø§ Ù†Ù„ØªÙ‚Ø· Ø®Ø·Ø£ Ø§Ù„ØªØ¶Ø§Ø±Ø¨ Ø§Ù„Ù…Ø±Ø³Ù„ Ù…Ù† Trigger Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
      Modal.error({
        title: 'ØªØ¶Ø§Ø±Ø¨ ÙÙŠ Ø§Ù„Ø¬Ø¯ÙˆÙ„Ø© âš ï¸',
        content: error.message,
      });
    } else {
      Modal.success({ title: 'ØªÙ…Øª Ø§Ù„Ø¬Ø¯ÙˆÙ„Ø© Ø¨Ù†Ø¬Ø§Ø­ âœ…' });
      setIsModalVisible(false);
      form.resetFields();
      fetchSurgeries();
    }
    setLoading(false);
  };

  const getListData = (value: dayjs.Dayjs) => {
    return surgeries.filter(s => 
      dayjs(s.scheduled_start).isSame(value, 'day')
    ).map(s => ({
      id: s.id,
      type: s.status === 'completed' ? 'success' : s.status === 'in_progress' ? 'processing' : 'warning',
      content: `${dayjs(s.scheduled_start).format('HH:mm')} - ${s.surgery_name}`,
      room: s.room_number,
      surgeon: s.doctor?.profiles?.full_name || 'Ø·Ø¨ÙŠØ¨ ØºÙŠØ± Ù…Ø­Ø¯Ø¯'
    }));
  };

  const dateCellRender = (value: dayjs.Dayjs) => {
    const listData = getListData(value);
    return (
      <ul className="list-none p-0 m-0 overflow-hidden">
        {listData.map((item) => (
          <li key={item.id}>
            <Tooltip title={`Ø§Ù„ØºØ±ÙØ©: ${item.room} | Ø§Ù„Ø¬Ø±Ø§Ø­: ${item.surgeon}`}>
              <Badge status={item.type as any} text={item.content} className="text-[10px] block truncate" />
            </Tooltip>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="p-6 rtl text-right">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ø§Ù„Ø¹Ù…ÙˆØ¯ Ø§Ù„Ø£ÙŠØ³Ø±: Ø§Ù„ØªÙ‚ÙˆÙŠÙ… Ø§Ù„Ø¹Ø§Ù… */}
        <div className="lg:col-span-2">
          <Card 
            className="rounded-3xl shadow-lg border-none" 
            title={
              <Space>
                <CalendarOutlined className="text-indigo-600" />
                <b className="text-xl">Ù†Ø¸Ø§Ù… Ø¬Ø¯ÙˆÙ„Ø© ØºØ±Ù Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª</b>
              </Space>
            }
            extra={
              <Space>
                <Button icon={<RefreshCw size={16} />} onClick={fetchSurgeries}>ØªØ­Ø¯ÙŠØ«</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)} className="bg-indigo-600">Ø­Ø¬Ø² Ø¹Ù…Ù„ÙŠØ© Ø¬Ø¯ÙŠØ¯Ø©</Button>
              </Space>
            }
          >
            <Alert 
              title="Ù†Ø¸Ø§Ù… Ø­Ù…Ø§ÙŠØ© Ø§Ù„ØªØ¶Ø§Ø±Ø¨ Ù†Ø´Ø·" 
              description="ÙŠÙ‚ÙˆÙ… Ø§Ù„Ù†Ø¸Ø§Ù… ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¨Ù…Ù†Ø¹ Ø­Ø¬Ø² Ù†ÙØ³ Ø§Ù„ØºØ±ÙØ© Ø£Ùˆ Ù†ÙØ³ Ø§Ù„Ø¬Ø±Ø§Ø­ ÙÙŠ Ø£ÙˆÙ‚Ø§Øª Ù…ØªØ¯Ø§Ø®Ù„Ø© Ù„Ø¶Ù…Ø§Ù† Ø³Ù„Ø§Ù…Ø© Ø³ÙŠØ± Ø§Ù„Ø¹Ù…Ù„."
              type="info" 
              showIcon 
              icon={<InfoCircleOutlined />}
              className="mb-6 rounded-2xl"
            />
            <Calendar cellRender={dateCellRender} />
          </Card>
        </div>

        {/* Ø§Ù„Ø¹Ù…ÙˆØ¯ Ø§Ù„Ø£ÙŠÙ…Ù†: Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„ÙŠÙˆÙ… ÙˆØ§Ù„ØªØ­ÙƒÙ… ÙÙŠ Ø§Ù„ØªÙ†ÙÙŠØ° */}
        <div className="lg:col-span-1">
          <Card title={<b>Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„ÙŠÙˆÙ… Ø§Ù„Ø¬Ø§Ø±ÙŠØ© ðŸ¥</b>} className="rounded-3xl shadow-lg border-none h-full">
            <div className="space-y-4">
              {surgeries.filter(s => dayjs(s.scheduled_start).isSame(dayjs(), 'day')).length > 0 ? (
                surgeries.filter(s => dayjs(s.scheduled_start).isSame(dayjs(), 'day')).map((item: Record<string, any>) => (
                  <div key={item.id} className="flex flex-col items-start border-b border-slate-100 p-4 last:border-none hover:bg-slate-50 transition-colors rounded-xl bg-white shadow-sm">
                    <div className="flex justify-between w-full mb-2">
                      <Text strong className="text-indigo-700">{item.surgery_name}</Text>
                      <Tag color={item.status === 'completed' ? 'green' : 'orange'}>
                        {item.status === 'completed' ? 'Ù…ÙƒØªÙ…Ù„Ø©' : 'Ù…Ø¬Ø¯ÙˆÙ„Ø©'}
                      </Tag>
                    </div>
                    <div className="text-xs text-slate-500 mb-4 space-y-1">
                      <div><UserOutlined className="ml-1 text-blue-400" /> Ø§Ù„Ø¬Ø±Ø§Ø­: <b>{item.doctor?.profiles?.full_name || 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ'}</b></div>
                      <div><ClockCircleOutlined className="ml-1 text-blue-400" /> Ø§Ù„ØªÙˆÙ‚ÙŠØª: {dayjs(item.scheduled_start).format('HH:mm')}</div>
                    </div>
                    {item.status === 'scheduled' && (
                      <Button 
                        block 
                        type="primary" 
                        icon={<MedicineBoxOutlined />} 
                        onClick={() => setExecutionModal({ visible: true, surgeryId: item.id })}
                        className="bg-emerald-600 border-none h-10 font-bold rounded-lg"
                      >Ø¨Ø¯Ø¡ Ø§Ù„ØªÙ†ÙÙŠØ° ÙˆØµØ±Ù Ø§Ù„Ù…Ø³ØªÙ‡Ù„ÙƒØ§Øª</Button>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-400 italic">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ù…Ù„ÙŠØ§Øª Ù…Ø¬Ø¯ÙˆÙ„Ø© Ù„Ù„ÙŠÙˆÙ…</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        title={<b><PlusOutlined /> Ø¬Ø¯ÙˆÙ„Ø© Ø¥Ø¬Ø±Ø§Ø¡ Ø¬Ø±Ø§Ø­ÙŠ Ø¬Ø¯ÙŠØ¯</b>}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={loading}
        width={700}
        okText="ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø­Ø¬Ø²"
        cancelText="Ø¥Ù„ØºØ§Ø¡"
      >
        <Form form={form} layout="vertical" onFinish={handleSchedule} className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="visit_id" label="Ø§Ù„Ù…Ø±ÙŠØ¶ (Ù…Ù† Ø§Ù„Ø²ÙŠØ§Ø±Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©)" rules={[{ required: true }]}>
              <Select placeholder="Ø§Ø®ØªØ± Ø§Ù„Ù…Ø±ÙŠØ¶">
                {pendingVisits.map(v => (
                  <Select.Option key={v.id} value={v.id}>{v.hims_patients?.full_name} ({v.visit_type})</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="surgery_name" label="Ø§Ø³Ù… Ø§Ù„Ø¹Ù…Ù„ÙŠØ©" rules={[{ required: true }]}>
              <Input placeholder="Ù…Ø«Ø§Ù„: Ù‚Ø³Ø·Ø±Ø© Ù‚Ù„Ø¨ÙŠØ©ØŒ Ø§Ø³ØªØ¦ØµØ§Ù„..." />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="doctor_id" label="Ø§Ù„Ø¬Ø±Ø§Ø­ Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„" rules={[{ required: true }]}>
              <Select placeholder="Ø§Ø®ØªØ± Ø§Ù„Ø¬Ø±Ø§Ø­">
                {doctors.map(d => (
                  <Select.Option key={d.id} value={d.id}>{d.profile?.full_name} ({d.specialization})</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="room_number" label="ØºØ±ÙØ© Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª" rules={[{ required: true }]}>
              <Select placeholder="Ø§Ø®ØªØ± Ø§Ù„ØºØ±ÙØ©">
                {['OR-1', 'OR-2', 'OR-3', 'OR-4', 'Minor-Ops'].map(r => (
                  <Select.Option key={r} value={r}>{r}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item name="times" label="ÙˆÙ‚Øª Ø§Ù„Ø¨Ø¯Ø§ÙŠØ© ÙˆØ§Ù„Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ù…ØªÙˆÙ‚Ø¹" rules={[{ required: true }]}>
            <DatePicker.RangePicker showTime className="w-full" format="YYYY-MM-DD HH:mm" />
          </Form.Item>

          <Form.Item name="anaesthetist" label="Ø·Ø¨ÙŠØ¨ Ø§Ù„ØªØ®Ø¯ÙŠØ± (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)">
            <Input placeholder="Ø§Ø³Ù… Ø·Ø¨ÙŠØ¨ Ø§Ù„ØªØ®Ø¯ÙŠØ±..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„ØªÙ†ÙÙŠØ° Ø§Ù„Ø°ÙƒÙŠØ© Ù„Ø±Ø¨Ø· Ø§Ù„Ù…Ø®Ø²Ù† Ø¨Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª */}
      <SurgeryExecutionForm 
        surgeryId={executionModal.surgeryId} 
        visible={executionModal.visible} 
        onCancel={() => setExecutionModal({ visible: false, surgeryId: '' })}
        onSuccess={() => {
          setExecutionModal({ visible: false, surgeryId: '' });
          fetchSurgeries();
        }}
      />
    </div>
  );
};
