import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Tag, Button, message, Typography, Badge, Space, Modal, Form, Input, InputNumber, Select } from 'antd';
import { CheckCircleOutlined, ToolOutlined, ClearOutlined, HomeOutlined, PlusOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';

export const WardBedManager: React.FC = () => {
  const { currentUser } = useAuth();
  const [beds, setBeds] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isWardModalVisible, setIsWardModalVisible] = useState(false);
  const [isBedModalVisible, setIsBedModalVisible] = useState(false);
  const [wardForm] = Form.useForm();
  const [bedForm] = Form.useForm();

  const fetchBedsStatus = async () => {
    if (!currentUser?.organization_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('hims_beds')
      .select('*, ward:ward_id(name, floor)')
      .eq('organization_id', currentUser.organization_id)
      .order('bed_number', { ascending: true });

    if (error) message.error('فشل جلب حالة الأسرة');
    else setBeds(data || []);
    setLoading(false);
  };

  const fetchWards = async () => {
    if (!currentUser?.organization_id) return;
    const { data } = await supabase
      .from('hims_wards')
      .select('*')
      .eq('organization_id', currentUser.organization_id)
      .order('name', { ascending: true });
    setWards(data || []);
  };

  useEffect(() => { 
    fetchBedsStatus(); 
    fetchWards();
  }, [currentUser]);

  const handleMarkReady = async (bedId: string) => {
    setLoading(true);
    // 🧼 استدعاء محرك كفاءة تشغيل الأسرة في SQL
    const { error } = await supabase.rpc('hims_mark_bed_ready', {
      p_bed_id: bedId
    });

    if (error) {
      message.error('فشل تحديث حالة السرير: ' + error.message);
    } else {
      message.success('تم تأكيد جاهزية السرير ✅ هو الآن متاح للاستقبال.');
      fetchBedsStatus();
    }
    setLoading(false);
  };

  const handleCreateWard = async (values: any) => {
    setLoading(true);
    const { error } = await supabase.from('hims_wards').insert([{
      ...values,
      organization_id: currentUser?.organization_id
    }]);

    if (error) {
      message.error('فشل إضافة الجناح: ' + error.message);
    } else {
      message.success('تم إضافة الجناح بنجاح ✅');
      setIsWardModalVisible(false);
      wardForm.resetFields();
      fetchWards();
    }
    setLoading(false);
  };

  const handleCreateBed = async (values: any) => {
    setLoading(true);
    const { error } = await supabase.from('hims_beds').insert([{
      ...values,
      organization_id: currentUser?.organization_id,
      status: 'available'
    }]);

    if (error) {
      message.error('فشل إضافة السرير: ' + error.message);
    } else {
      message.success('تم إضافة السرير بنجاح ✅');
      setIsBedModalVisible(false);
      bedForm.resetFields();
      fetchBedsStatus();
    }
    setLoading(false);
  };

  const columns = [
    { 
      title: 'رقم السرير', 
      dataIndex: 'bed_number', 
      key: 'bed_number',
      render: (text: string) => <b className="text-blue-700">{text}</b>
    },
    { 
      title: 'الجناح / القسم', 
      render: (r: any) => <span>{r.ward?.name} (الطابق: {r.ward?.floor})</span> 
    },
    { 
      title: 'الحالة الحالية', 
      dataIndex: 'status', 
      render: (status: string) => {
        const colors: any = {
          available: 'success',
          occupied: 'error',
          cleaning: 'warning',
          maintenance: 'default'
        };
        const labels: any = {
          available: 'متاح',
          occupied: 'مشغول',
          cleaning: 'جاري التنظيف',
          maintenance: 'صيانة'
        };
        return <Tag color={colors[status]}>{labels[status]}</Tag>;
      }
    },
    {
      title: 'إجراءات التجهيز',
      key: 'action',
      render: (record: any) => (
        <Space>
          {record.status === 'cleaning' && (
            <Button 
              type="primary" 
              icon={<CheckCircleOutlined />} 
              className="bg-emerald-600 border-none"
              onClick={() => handleMarkReady(record.id)}
              loading={loading}
            >
              تأكيد جاهزية السرير
            </Button>
          )}
          {record.status === 'available' && (
             <Button icon={<ToolOutlined />} size="small">طلب صيانة</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6 rtl text-right">
      <div className="mb-6 flex justify-between items-center">
        <Typography.Title level={2}>
          <HomeOutlined className="text-indigo-600" /> إدارة حالات الأسرة والأجنحة
        </Typography.Title>
        <Space>
          <Button onClick={() => setIsWardModalVisible(true)} icon={<PlusOutlined />} className="bg-indigo-50 text-indigo-700 border-indigo-200">إضافة جناح</Button>
          <Button onClick={() => setIsBedModalVisible(true)} type="primary" icon={<PlusOutlined />} className="bg-indigo-600">إضافة سرير</Button>
          <Button onClick={fetchBedsStatus} icon={<ClearOutlined />}>تحديث الحالة</Button>
        </Space>
      </div>

      <Card className="rounded-3xl shadow-lg border-none overflow-hidden">
        <Table 
          dataSource={beds} 
          columns={columns} 
          rowKey="id" 
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* مودال إضافة جناح */}
      <Modal title="إضافة جناح / قسم جديد" open={isWardModalVisible} onCancel={() => setIsWardModalVisible(false)} onOk={() => wardForm.submit()} confirmLoading={loading}>
        <Form form={wardForm} layout="vertical" onFinish={handleCreateWard}>
          <Form.Item name="name" label="اسم الجناح" rules={[{ required: true, message: 'يرجى إدخال اسم الجناح' }]}>
            <Input placeholder="مثال: جناح العمليات، قسم الباطنة" />
          </Form.Item>
          <Form.Item name="floor" label="الطابق">
            <Input placeholder="مثال: الأرضي، الأول..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* مودال إضافة سرير */}
      <Modal title="إضافة سرير جديد" open={isBedModalVisible} onCancel={() => setIsBedModalVisible(false)} onOk={() => bedForm.submit()} confirmLoading={loading}>
        <Form form={bedForm} layout="vertical" onFinish={handleCreateBed}>
          <Form.Item name="ward_id" label="الجناح / القسم" rules={[{ required: true }]}>
            <Select placeholder="اختر الجناح التابع له السرير">
              {wards.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="bed_number" label="رقم السرير" rules={[{ required: true }]}>
                <Input placeholder="مثال: B-101" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="daily_rate" label="تكلفة الإقامة اليومية (EGP)" initialValue={0}>
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};