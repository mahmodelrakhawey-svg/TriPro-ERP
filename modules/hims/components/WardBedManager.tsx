import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Table, Button, Card, Modal, Form, Input, InputNumber, Select, Row, Col, Tag, message, Typography, Divider } from 'antd';
import { PlusOutlined, BankOutlined, DesktopOutlined } from '@ant-design/icons';
import { useAccounting } from '@/context/AccountingContext';

export const WardBedManager: React.FC = () => {
  const { organization } = useAccounting();
  const [wards, setWards] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isWardModalOpen, setIsWardModalOpen] = useState(false);
  const [isBedModalOpen, setIsBedModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    const { data: wardsData } = await supabase.from('hims_wards').select('*').order('name');
    const { data: bedsData } = await supabase.from('hims_beds').select('*, hims_wards(name)').order('bed_number');
    setWards(wardsData || []);
    setBeds(bedsData || []);
    setLoading(false);
  };

  useEffect(() => { 
    if (organization?.id) fetchData(); 
  }, [organization?.id]); // 🔄 التحديث فور توفر هوية المنظمة

  const handleAddWard = async (values: any) => {
    const { error } = await supabase.from('hims_wards').insert([{ 
      name: values.name,
      ward_type: values.ward_type,
      organization_id: organization?.id 
    }]);

    if (error) message.error(error.message);
    else {
      message.success('تم إضافة الجناح بنجاح ✅');
      setIsWardModalOpen(false);
      fetchData();
    }
  };

  const handleAddBed = async (values: any) => {
    const { error } = await supabase.from('hims_beds').insert([{ 
      ward_id: values.ward_id,
      bed_number: values.bed_number,
      daily_rate: values.daily_rate,
      organization_id: organization?.id, 
      status: 'available' 
    }]);

    if (error) message.error(error.message);
    else {
      message.success('تم إضافة السرير بنجاح ✅');
      setIsBedModalOpen(false);
      fetchData();
    }
  };

  return (
    <div className="p-6 rtl text-right">
      <Typography.Title level={2}><BankOutlined /> إدارة الأجنحة والأسرة 🏥</Typography.Title>
      <p className="text-slate-500 mb-6">قم بتعريف الأجنحة الطبية وتوزيع الأسرة عليها لتتمكن من تسكين المرضى.</p>

      <Row gutter={24}>
        {/* الأجنحة */}
        <Col lg={8} xs={24}>
          <Card title="الأجنحة والأقسام" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => {
            form.resetFields(); // 🧹 تنظيف الحقول قبل الفتح
            setIsWardModalOpen(true);
          }}>جناح جديد</Button>}>
            <Table 
              dataSource={wards} 
              pagination={false}
              columns={[
                { title: 'اسم الجناح', dataIndex: 'name' },
                { title: 'النوع', dataIndex: 'ward_type', render: (t) => <Tag>{t === 'general' ? 'عام' : 'خاص'}</Tag> }
              ]} 
              rowKey="id" 
            />
          </Card>
        </Col>

        {/* الأسرة */}
        <Col lg={16} xs={24}>
          <Card title="سجل الأسرة" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => {
            form.resetFields(); // 🧹 تنظيف الحقول قبل الفتح
            setIsBedModalOpen(true);
          }} disabled={wards.length === 0}>سرير جديد</Button>}>
            <Table 
              dataSource={beds} 
              loading={loading}
              columns={[
                { title: 'رقم السرير', dataIndex: 'bed_number', render: (n) => <b className="text-blue-600">سرير {n}</b> },
                { title: 'الجناح', dataIndex: ['hims_wards', 'name'] },
                { title: 'الحالة', dataIndex: 'status', render: (s) => <Tag color={s === 'available' ? 'green' : 'red'}>{s === 'available' ? 'متاح' : 'مشغول'}</Tag> },
                { title: 'السعر اليومي', dataIndex: 'daily_rate', render: (v) => `${v} EGP` }
              ]} 
              rowKey="id" 
            />
          </Card>
        </Col>
      </Row>

      {/* مودال إضافة جناح */}
      <Modal title="إضافة جناح جديد" open={isWardModalOpen} onCancel={() => setIsWardModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleAddWard}>
          <Form.Item name="name" label="اسم الجناح" rules={[{ required: true }]}><Input placeholder="مثال: جناح الباطنة" /></Form.Item>
          <Form.Item name="ward_type" label="نوع الجناح" initialValue="general">
            <Select options={[{ label: 'عام', value: 'general' }, { label: 'خاص / VIP', value: 'private' }, { label: 'عناية مركزة', value: 'icu' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* مودال إضافة سرير */}
      <Modal title="إضافة سرير جديد" open={isBedModalOpen} onCancel={() => setIsBedModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleAddBed}>
          <Form.Item name="ward_id" label="الجناح التابع له" rules={[{ required: true }]}>
            <Select 
              placeholder="اختر الجناح"
              options={wards.map(w => ({ label: w.name, value: w.id }))}
            />
          </Form.Item>
          <Form.Item name="bed_number" label="رقم السرير" rules={[{ required: true }]}><Input placeholder="مثال: 101" /></Form.Item>
          <Form.Item name="daily_rate" label="تكلفة الإقامة اليومية" initialValue={500}><InputNumber className="w-full" suffix="EGP" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};