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
      message.warning('لا يمكن تحديد المنظمة، يرجى إعادة تسجيل الدخول.');
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
    } catch (err: any) {
      message.error('خطأ في جلب بيانات العمليات: ' + (err?.message || ''));
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
    } catch (err: any) {
      message.error('خطأ في جلب بيانات الأطباء والزيارات: ' + (err?.message || ''));
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchSurgeries();
      fetchMetaData();
    }
  }, [orgId, fetchSurgeries, fetchMetaData]);

  const handleSchedule = async (values: any) => {
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
      // هنا نلتقط خطأ التضارب المرسل من Trigger قاعدة البيانات
      Modal.error({
        title: 'تضارب في الجدولة ⚠️',
        content: error.message,
      });
    } else {
      Modal.success({ title: 'تمت الجدولة بنجاح ✅' });
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
      surgeon: s.doctor?.profiles?.full_name || 'طبيب غير محدد'
    }));
  };

  const dateCellRender = (value: dayjs.Dayjs) => {
    const listData = getListData(value);
    return (
      <ul className="list-none p-0 m-0 overflow-hidden">
        {listData.map((item) => (
          <li key={item.id}>
            <Tooltip title={`الغرفة: ${item.room} | الجراح: ${item.surgeon}`}>
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
        {/* العمود الأيسر: التقويم العام */}
        <div className="lg:col-span-2">
          <Card 
            className="rounded-3xl shadow-lg border-none" 
            title={
              <Space>
                <CalendarOutlined className="text-indigo-600" />
                <b className="text-xl">نظام جدولة غرف العمليات</b>
              </Space>
            }
            extra={
              <Space>
                <Button icon={<RefreshCw size={16} />} onClick={fetchSurgeries}>تحديث</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)} className="bg-indigo-600">حجز عملية جديدة</Button>
              </Space>
            }
          >
            <Alert 
              title="نظام حماية التضارب نشط" 
              description="يقوم النظام تلقائياً بمنع حجز نفس الغرفة أو نفس الجراح في أوقات متداخلة لضمان سلامة سير العمل."
              type="info" 
              showIcon 
              icon={<InfoCircleOutlined />}
              className="mb-6 rounded-2xl"
            />
            <Calendar cellRender={dateCellRender} />
          </Card>
        </div>

        {/* العمود الأيمن: عمليات اليوم والتحكم في التنفيذ */}
        <div className="lg:col-span-1">
          <Card title={<b>عمليات اليوم الجارية 🏥</b>} className="rounded-3xl shadow-lg border-none h-full">
            <div className="space-y-4">
              {surgeries.filter(s => dayjs(s.scheduled_start).isSame(dayjs(), 'day')).length > 0 ? (
                surgeries.filter(s => dayjs(s.scheduled_start).isSame(dayjs(), 'day')).map((item: any) => (
                  <div key={item.id} className="flex flex-col items-start border-b border-slate-100 p-4 last:border-none hover:bg-slate-50 transition-colors rounded-xl bg-white shadow-sm">
                    <div className="flex justify-between w-full mb-2">
                      <Text strong className="text-indigo-700">{item.surgery_name}</Text>
                      <Tag color={item.status === 'completed' ? 'green' : 'orange'}>
                        {item.status === 'completed' ? 'مكتملة' : 'مجدولة'}
                      </Tag>
                    </div>
                    <div className="text-xs text-slate-500 mb-4 space-y-1">
                      <div><UserOutlined className="ml-1 text-blue-400" /> الجراح: <b>{item.doctor?.profiles?.full_name || 'غير معروف'}</b></div>
                      <div><ClockCircleOutlined className="ml-1 text-blue-400" /> التوقيت: {dayjs(item.scheduled_start).format('HH:mm')}</div>
                    </div>
                    {item.status === 'scheduled' && (
                      <Button 
                        block 
                        type="primary" 
                        icon={<MedicineBoxOutlined />} 
                        onClick={() => setExecutionModal({ visible: true, surgeryId: item.id })}
                        className="bg-emerald-600 border-none h-10 font-bold rounded-lg"
                      >بدء التنفيذ وصرف المستهلكات</Button>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-400 italic">لا توجد عمليات مجدولة لليوم</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        title={<b><PlusOutlined /> جدولة إجراء جراحي جديد</b>}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={loading}
        width={700}
        okText="تأكيد الحجز"
        cancelText="إلغاء"
      >
        <Form form={form} layout="vertical" onFinish={handleSchedule} className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="visit_id" label="المريض (من الزيارات الحالية)" rules={[{ required: true }]}>
              <Select placeholder="اختر المريض">
                {pendingVisits.map(v => (
                  <Select.Option key={v.id} value={v.id}>{v.hims_patients?.full_name} ({v.visit_type})</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="surgery_name" label="اسم العملية" rules={[{ required: true }]}>
              <Input placeholder="مثال: قسطرة قلبية، استئصال..." />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="doctor_id" label="الجراح المسؤول" rules={[{ required: true }]}>
              <Select placeholder="اختر الجراح">
                {doctors.map(d => (
                  <Select.Option key={d.id} value={d.id}>{d.profile?.full_name} ({d.specialization})</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="room_number" label="غرفة العمليات" rules={[{ required: true }]}>
              <Select placeholder="اختر الغرفة">
                {['OR-1', 'OR-2', 'OR-3', 'OR-4', 'Minor-Ops'].map(r => (
                  <Select.Option key={r} value={r}>{r}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item name="times" label="وقت البداية والنهاية المتوقع" rules={[{ required: true }]}>
            <DatePicker.RangePicker showTime className="w-full" format="YYYY-MM-DD HH:mm" />
          </Form.Item>

          <Form.Item name="anaesthetist" label="طبيب التخدير (اختياري)">
            <Input placeholder="اسم طبيب التخدير..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* واجهة التنفيذ الذكية لربط المخزن بالعمليات */}
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