import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Tabs, Card, Typography, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, ExperimentOutlined, CameraOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';

const { Title } = Typography;

export const HIMSServicesManager: React.FC = () => {
  const { currentUser } = useAuth();
  const [labTests, setLabTests] = useState<any[]>([]);
  const [radTypes, setRadTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'lab' | 'rad'>('lab');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchOrgId = async () => {
    if (!currentUser) return null;
    if ((currentUser as any).organization_id) return (currentUser as any).organization_id;
    const { data } = await supabase.from('profiles').select('organization_id').eq('id', currentUser.id).single();
    return data?.organization_id;
  };

  const fetchData = async () => {
    const orgId = await fetchOrgId();
    if (!orgId) return;
    setLoading(true);
    const [labRes, radRes] = await Promise.all([
      supabase.from('hims_lab_tests').select('*').eq('organization_id', orgId).order('test_name'),
      supabase.from('hims_radiology_types').select('*').eq('organization_id', orgId).order('name')
    ]);
    setLabTests(labRes.data || []);
    setRadTypes(radRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [currentUser]);

  const handleSave = async (values: any) => {
    const orgId = await fetchOrgId();
    if (!orgId) return message.error("لم يتم العثور على معرف المؤسسة");

    setLoading(true);
    const table = activeTab === 'lab' ? 'hims_lab_tests' : 'hims_radiology_types';
    const payload = { ...values, organization_id: orgId };

    try {
      if (editingItem) {
        const { error } = await supabase.from(table).update(payload).eq('id', editingItem.id);
        if (error) throw error;
        message.success("تم التحديث بنجاح");
      } else {
        const { error } = await supabase.from(table).insert([payload]);
        if (error) throw error;
        message.success("تمت الإضافة بنجاح");
      }
      setIsModalVisible(false);
      form.resetFields();
      setEditingItem(null);
      fetchData();
    } catch (err: any) {
      message.error("فشل الحفظ: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, type: 'lab' | 'rad') => {
    const table = type === 'lab' ? 'hims_lab_tests' : 'hims_radiology_types';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) message.error("فشل الحذف");
    else { message.success("تم الحذف"); fetchData(); }
  };

  const labColumns = [
    { title: 'اسم التحليل', dataIndex: 'test_name' },
    { title: 'السعر', dataIndex: 'price', render: (v: number) => `${v.toLocaleString()} EGP` },
    { title: 'المعدل الطبيعي', dataIndex: 'normal_range' },
    { title: 'الوحدة', dataIndex: 'unit' },
    {
      title: 'إجراءات',
      render: (_: any, record: any) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => { setEditingItem(record); form.setFieldsValue(record); setIsModalVisible(true); }} />
          <Popconfirm title="حذف هذا النوع؟" onConfirm={() => handleDelete(record.id, 'lab')}><Button danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      )
    }
  ];

  const radColumns = [
    { title: 'نوع الأشعة', dataIndex: 'name' },
    { title: 'السعر', dataIndex: 'price', render: (v: number) => `${v.toLocaleString()} EGP` },
    {
      title: 'إجراءات',
      render: (_: any, record: any) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => { setEditingItem(record); form.setFieldsValue(record); setIsModalVisible(true); }} />
          <Popconfirm title="حذف؟" onConfirm={() => handleDelete(record.id, 'rad')}><Button danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="p-6 rtl text-right bg-slate-50 min-h-screen">
      <Card className="rounded-3xl shadow-sm border-none">
        <div className="flex justify-between items-center mb-6">
          <Title level={2}>إعدادات الخدمات الطبية</Title>
          <Button type="primary" icon={<PlusOutlined />} size="large" className="rounded-xl bg-blue-600 h-12 font-bold" onClick={() => { setEditingItem(null); form.resetFields(); setIsModalVisible(true); }}>
            إضافة {activeTab === 'lab' ? 'تحليل' : 'أشعة'} جديد
          </Button>
        </div>
        <Tabs activeKey={activeTab} onChange={(k) => setActiveTab(k as any)} items={[
          { key: 'lab', label: <span><ExperimentOutlined /> قائمة التحاليل</span>, children: <Table dataSource={labTests} columns={labColumns} rowKey="id" /> },
          { key: 'rad', label: <span><CameraOutlined /> قائمة الأشعة</span>, children: <Table dataSource={radTypes} columns={radColumns} rowKey="id" /> }
        ]} />
      </Card>

      <Modal title={<b>{editingItem ? 'تعديل الخدمة' : 'إضافة خدمة جديدة'}</b>} open={isModalVisible} onCancel={() => setIsModalVisible(false)} onOk={() => form.submit()} confirmLoading={loading} okText="حفظ" cancelText="إلغاء">
        <Form form={form} layout="vertical" onFinish={handleSave} className="pt-4">
          <Form.Item name={activeTab === 'lab' ? 'test_name' : 'name'} label="الاسم" rules={[{ required: true }]}>
            <Input placeholder="الاسم بالعربي..." />
          </Form.Item>
          <Form.Item name="code" label="الكود التعريفي"><Input placeholder="مثلاً: LAB-001" /></Form.Item>
          <Form.Item name="price" label="السعر (EGP)" rules={[{ required: true }]}><InputNumber className="w-full" min={0} /></Form.Item>
          {activeTab === 'lab' && (
            <>
              <Form.Item name="normal_range" label="المعدل الطبيعي"><Input placeholder="12 - 16" /></Form.Item>
              <Form.Item name="unit" label="الوحدة"><Input placeholder="g/dL" /></Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
};