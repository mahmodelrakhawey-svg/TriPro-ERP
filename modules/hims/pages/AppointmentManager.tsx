import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Card, Typography, message, Space, Modal, Form, Select, DatePicker, TimePicker, Input, Row, Col, Statistic } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, UserAddOutlined, CheckCircleOutlined, CloseCircleOutlined, UserOutlined, MedicineBoxOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export const AppointmentManager: React.FC = () => {
  const { currentUser } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [isBookingModalVisible, setIsBookingModalVisible] = useState(false);
  const [form] = Form.useForm();

  const orgId = currentUser?.organization_id;

  const fetchAppointments = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hims_appointments')
        .select('*, hims_patients(id, full_name, phone, national_id), hims_doctors(id, specialization, profile:profile_id(full_name))')
        .eq('organization_id', orgId)
        .eq('appointment_date', dayjs().format('YYYY-MM-DD'))
        .order('queue_number', { ascending: true });

      if (error) throw error;
      setAppointments(data || []);
    } catch (err: any) {
      message.error('خطأ في تحميل المواعيد: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientsAndDoctors = async () => {
    if (!orgId) return;
    try {
      const [patRes, docRes] = await Promise.all([
        supabase.from('hims_patients').select('id, full_name, national_id').eq('organization_id', orgId).order('full_name'),
        supabase.from('hims_doctors').select('id, specialization, profile:profile_id(full_name)').eq('organization_id', orgId).eq('is_active', true)
      ]);

      if (patRes.error) throw patRes.error;
      if (docRes.error) throw docRes.error;

      setPatients(patRes.data || []);
      setDoctors(docRes.data || []);
    } catch (err: any) {
      console.error('Failed to fetch metadata:', err);
    }
  };

  useEffect(() => {
    if (orgId) {
      fetchAppointments();
      fetchPatientsAndDoctors();
    }
  }, [orgId]);

  const handleBookAppointment = async (values: any) => {
    if (!orgId) return;
    setBookingLoading(true);
    try {
      const payload = {
        organization_id: orgId,
        patient_id: values.patient_id,
        doctor_id: values.doctor_id,
        appointment_date: values.appointment_date.format('YYYY-MM-DD'),
        appointment_time: values.appointment_time.format('HH:mm:ss'),
        priority: values.priority || 'normal',
        notes: values.notes || '',
        status: 'scheduled'
      };

      const { error } = await supabase.from('hims_appointments').insert([payload]);
      if (error) throw error;

      message.success('تم حجز الموعد بنجاح وجدولة رقم الدور تلقائياً ✅');
      setIsBookingModalVisible(false);
      form.resetFields();
      fetchAppointments();
    } catch (err: any) {
      // قد يكون هذا بسبب تضارب المواعيد المرفوض من قبل الـ trigger في قاعدة البيانات
      Modal.error({
        title: 'فشل حجز الموعد ⚠️',
        content: err.message || 'حدث خطأ أثناء الاتصال بقاعدة البيانات.'
      });
    } finally {
      setBookingLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setLoading(true);
    try {
      // 1. جلب بيانات الموعد أولاً
      const { data: appointment, error: fetchErr } = await supabase
        .from('hims_appointments')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr || !appointment) throw new Error('لم يتم العثور على بيانات الموعد');

      // 2. تحديث حالة الموعد
      const { error: updateErr } = await supabase
        .from('hims_appointments')
        .update({ status })
        .eq('id', id);

      if (updateErr) throw updateErr;

      // 3. إذا كانت الحالة 'arrived' (تسجيل حضور)، نقوم تلقائياً بإنشاء زيارة عيادة نشطة وتوجيهها لطابور الطبيب
      if (status === 'arrived') {
        const { error: visitErr } = await supabase.from('hims_visits').insert([{
          patient_id: appointment.patient_id,
          doctor_id: appointment.doctor_id,
          visit_type: 'outpatient',
          chief_complaint: appointment.notes || 'حضور بموعد مسبق',
          status: 'triaged',
          organization_id: appointment.organization_id
        }]);

        if (visitErr) throw visitErr;
        message.success('تم تسجيل الحضور وتحويل المريض فوراً لسطح مكتب الطبيب المعالج 🏥✅');
      } else if (status === 'cancelled') {
        message.warning('تم إلغاء الموعد المختار ❌');
      } else {
        message.success('تم تحديث حالة الموعد بنجاح');
      }

      fetchAppointments();
    } catch (err: any) {
      message.error('خطأ في معالجة الطلب: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityTag = (priority: string) => {
    switch (priority) {
      case 'emergency': return <Tag color="red" className="font-bold">🚨 طارئ جداً</Tag>;
      case 'urgent': return <Tag color="orange" className="font-bold">⚠️ عاجل</Tag>;
      default: return <Tag color="blue">عادي</Tag>;
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'scheduled': return <Tag color="blue">مجدول</Tag>;
      case 'arrived': return <Tag color="cyan">حضر (بانتظار الطبيب)</Tag>;
      case 'in_consultation': return <Tag color="orange">قيد الكشف</Tag>;
      case 'completed': return <Tag color="green">مكتمل</Tag>;
      case 'cancelled': return <Tag color="red">ملغي</Tag>;
      default: return <Tag>{status}</Tag>;
    }
  };

  const columns = [
    { 
      title: 'رقم الدور', 
      dataIndex: 'queue_number', 
      render: (n: number) => <Tag color="geekblue" className="rounded-full px-3 font-bold text-sm">{n || '-'}</Tag> 
    },
    { 
      title: 'المريض', 
      dataIndex: ['hims_patients', 'full_name'],
      render: (name: string, record: any) => (
        <div>
          <b className="text-slate-800">{name}</b>
          <div className="text-xs text-slate-400">الهوية: {record.hims_patients?.national_id || 'غير مسجلة'}</div>
        </div>
      )
    },
    { 
      title: 'العيادة / الطبيب', 
      render: (record: any) => {
        const docName = record.hims_doctors?.profile?.full_name || 'طبيب غير مسمى';
        const spec = record.hims_doctors?.specialization || '';
        return (
          <div>
            <b className="text-indigo-600">{docName}</b>
            <div className="text-xs text-slate-500">{spec}</div>
          </div>
        );
      }
    },
    { 
      title: 'الوقت المحجوز', 
      dataIndex: 'appointment_time',
      render: (t: string) => <Tag icon={<ClockCircleOutlined />} color="default">{t.substring(0, 5)}</Tag>
    },
    { 
      title: 'الأولوية', 
      dataIndex: 'priority', 
      render: (p: string) => getPriorityTag(p) 
    },
    { 
      title: 'الحالة', 
      dataIndex: 'status', 
      render: (s: string) => getStatusTag(s) 
    },
    { 
      title: 'ملاحظات', 
      dataIndex: 'notes', 
      ellipsis: true,
      render: (txt: string) => <span className="text-xs text-slate-500">{txt || '-'}</span>
    },
    { 
      title: 'إجراءات الاستقبال', 
      render: (record: any) => (
        <Space>
          {record.status === 'scheduled' && (
            <>
              <Button 
                type="primary" 
                size="small" 
                icon={<CheckCircleOutlined />}
                className="bg-emerald-600 border-none font-bold"
                onClick={() => updateStatus(record.id, 'arrived')}
              >
                تسجيل حضور ودخول العيادة
              </Button>
              <Button 
                danger 
                size="small" 
                icon={<CloseCircleOutlined />}
                onClick={() => updateStatus(record.id, 'cancelled')}
              >
                إلغاء
              </Button>
            </>
          )}
          {record.status === 'arrived' && (
            <Tag color="cyan">تم التحويل لطابور الطبيب</Tag>
          )}
          {record.status === 'in_consultation' && (
            <Tag color="orange">المريض داخل العيادة الآن</Tag>
          )}
          {record.status === 'completed' && (
            <Tag color="green">تم تقديم الخدمة بنجاح</Tag>
          )}
          {record.status === 'cancelled' && (
            <span className="text-red-500 text-xs italic">موعد ملغي</span>
          )}
        </Space>
      )
    }
  ];

  // إحصائيات اليوم
  const stats = {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === 'scheduled').length,
    arrived: appointments.filter(a => a.status === 'arrived' || a.status === 'in_consultation').length,
    completed: appointments.filter(a => a.status === 'completed').length,
  };

  return (
    <div className="p-6 rtl text-right space-y-6 bg-slate-50 min-h-screen">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="rounded-2xl border-none shadow-sm bg-white">
            <Statistic title="إجمالي حجز اليوم" value={stats.total} prefix={<CalendarOutlined className="text-blue-500" />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="rounded-2xl border-none shadow-sm bg-white">
            <Statistic title="مجدول (انتظار حضور)" value={stats.scheduled} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="rounded-2xl border-none shadow-sm bg-white">
            <Statistic title="حضر / في الكشف" value={stats.arrived} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="rounded-2xl border-none shadow-sm bg-white">
            <Statistic title="حالات مكتملة" value={stats.completed} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card 
        className="rounded-3xl shadow-sm border-none bg-white overflow-hidden"
        title={
          <div className="flex justify-between items-center py-2">
            <Title level={4} style={{ margin: 0 }} className="flex items-center gap-2">
              <CalendarOutlined className="text-indigo-600" /> إدارة وحجز مواعيد اليوم
            </Title>
            <Button 
              type="primary" 
              icon={<UserAddOutlined />} 
              shape="round" 
              size="large" 
              className="bg-indigo-600 hover:bg-indigo-700 shadow-md border-none font-bold"
              onClick={() => setIsBookingModalVisible(true)}
            >
              حجز موعد جديد
            </Button>
          </div>
        }
      >
        <Table 
          dataSource={appointments} 
          columns={columns} 
          loading={loading} 
          rowKey="id" 
          pagination={{ pageSize: 10 }}
          className="border rounded-2xl overflow-hidden"
        />
      </Card>

      {/* مودال حجز موعد جديد */}
      <Modal
        title={<b><UserAddOutlined /> جدولة موعد طبي جديد</b>}
        open={isBookingModalVisible}
        onCancel={() => setIsBookingModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={bookingLoading}
        width={650}
        okText="تأكيد الحجز"
        cancelText="إلغاء"
      >
        <Form form={form} layout="vertical" onFinish={handleBookAppointment} className="pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item 
              name="patient_id" 
              label="المريض" 
              rules={[{ required: true, message: 'يرجى اختيار المريض' }]}
            >
              <Select 
                showSearch 
                placeholder="ابحث باسم المريض..."
                optionFilterProp="children"
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
                options={patients.map(p => ({ label: `${p.full_name} (${p.national_id || ''})`, value: p.id }))}
              />
            </Form.Item>
            
            <Form.Item 
              name="doctor_id" 
              label="الطبيب / العيادة" 
              rules={[{ required: true, message: 'يرجى اختيار الطبيب المعالج' }]}
            >
              <Select 
                showSearch 
                placeholder="اختر العيادة أو الطبيب..."
                optionFilterProp="children"
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
                options={doctors.map(d => ({ 
                  label: `${d.profile?.full_name || 'طبيب غير مسمى'} (${d.specialization})`, 
                  value: d.id 
                }))}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Form.Item 
              name="appointment_date" 
              label="تاريخ الموعد" 
              initialValue={dayjs()}
              rules={[{ required: true, message: 'حدد التاريخ' }]}
            >
              <DatePicker className="w-full" format="YYYY-MM-DD" />
            </Form.Item>

            <Form.Item 
              name="appointment_time" 
              label="الوقت" 
              initialValue={dayjs()}
              rules={[{ required: true, message: 'حدد وقت الزيارة' }]}
            >
              <TimePicker className="w-full" format="HH:mm" />
            </Form.Item>

            <Form.Item 
              name="priority" 
              label="الأولوية" 
              initialValue="normal"
              rules={[{ required: true }]}
            >
              <Select options={[
                { label: '🔵 عادي', value: 'normal' },
                { label: '🟠 عاجل', value: 'urgent' },
                { label: '🔴 حالة طارئة', value: 'emergency' }
              ]} />
            </Form.Item>
          </div>

          <Form.Item 
            name="notes" 
            label="الشكوى والسبب الرئيسي للزيارة"
          >
            <Input.TextArea rows={3} placeholder="اكتب الشكوى المرضية الأساسية..." className="rounded-xl" />
          </Form.Item>

          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-2">
            <InfoCircleOutlined className="text-amber-500 mt-1" />
            <Text type="secondary" className="text-xs font-bold text-amber-700 leading-relaxed">
              تنبيه الحجز الذكي: يقوم النظام تلقائياً بالتأكد من عدم وجود تعارض في جدول الطبيب المعالج ومنع الحجوزات المتداخلة لضمان الكفاءة التشغيلية التامة.
            </Text>
          </div>
        </Form>
      </Modal>
    </div>
  );
};