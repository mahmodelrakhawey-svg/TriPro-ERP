import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Card, Typography, Space, message, Badge, Tooltip, Row, Col } from 'antd';
import { ExperimentOutlined, ScanOutlined, CheckCircleOutlined, SyncOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export const LabSpecimenTracking: React.FC = () => {
  const [specimens, setSpecimens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSpecimens = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hims_lab_specimens')
      .select('*, lab_order:lab_order_id(hims_lab_tests(test_name), hims_visits(hims_patients(full_name)))')
      .order('created_at', { ascending: false });
    
    if (error) message.error('خطأ في جلب بيانات العينات');
    else setSpecimens(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchSpecimens(); }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    setLoading(true);
    const { error } = await supabase.rpc('hims_update_specimen_status', {
      p_specimen_id: id,
      p_status: newStatus
    });

    if (error) message.error('فشل تحديث الحالة: ' + error.message);
    else {
      message.success('تم تحديث حالة العينة وتوثيق الوقت بنجاح ✅');
      fetchSpecimens();
    }
    setLoading(false);
  };

  const columns = [
    { 
      title: 'باركود العينة', 
      dataIndex: 'barcode_id', 
      render: (id: string) => <Tag color="black" className="font-mono"><ScanOutlined /> {id || 'PENDING'}</Tag> 
    },
    { 
      title: 'المريض والفحص', 
      render: (record: any) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.lab_order?.hims_visits?.hims_patients?.full_name}</Text>
          <Text type="secondary" className="text-xs">{record.lab_order?.hims_lab_tests?.test_name}</Text>
        </Space>
      )
    },
    { 
      title: 'الحالة الحالية', 
      dataIndex: 'status',
      render: (status: string) => {
        const config: any = {
          pending_collection: { color: 'default', text: 'بانتظار السحب', icon: <ClockCircleOutlined /> },
          collected: { color: 'blue', text: 'تم السحب', icon: <SyncOutlined spin /> },
          received_in_lab: { color: 'purple', text: 'وصلت المختبر', icon: <ExperimentOutlined /> },
          completed: { color: 'green', text: 'تم الفحص', icon: <CheckCircleOutlined /> }
        };
        return <Tag color={config[status]?.color} icon={config[status]?.icon}>{config[status]?.text}</Tag>;
      }
    },
    { 
      title: 'توقيت السحب', 
      dataIndex: 'collected_at', 
      render: (d: string) => d ? dayjs(d).format('HH:mm:ss') : '-' 
    },
    { 
      title: 'إجراءات التتبع', 
      render: (record: any) => (
        <Space>
          {record.status === 'pending_collection' && (
            <Button size="small" type="primary" onClick={() => updateStatus(record.id, 'collected')}>إثبات السحب</Button>
          )}
          {record.status === 'collected' && (
            <Button size="small" className="bg-purple-600 text-white border-none" onClick={() => updateStatus(record.id, 'received_in_lab')}>تأكيد الاستلام بالمختبر</Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div className="p-6 rtl text-right bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <Title level={2}><ExperimentOutlined className="text-blue-600" /> رادار تتبع العينات المخبرية</Title>
        <Button icon={<SyncOutlined />} onClick={fetchSpecimens}>تحديث اللوحة</Button>
      </div>

      <Row gutter={[16, 16]} className="mb-6">
        <Col span={6}>
          <Card size="small" className="rounded-2xl shadow-sm"><Badge status="default" text="بانتظار السحب" /><Title level={4} className="m-0">{specimens.filter(s => s.status === 'pending_collection').length}</Title></Card>
        </Col>
        <Col span={6}>
          <Card size="small" className="rounded-2xl shadow-sm"><Badge status="processing" text="تحت النقل" /><Title level={4} className="m-0">{specimens.filter(s => s.status === 'collected').length}</Title></Card>
        </Col>
        <Col span={6}>
          <Card size="small" className="rounded-2xl shadow-sm"><Badge status="warning" text="بالمختبر" /><Title level={4} className="m-0">{specimens.filter(s => s.status === 'received_in_lab').length}</Title></Card>
        </Col>
      </Row>

      <Card className="rounded-3xl shadow-sm border-none overflow-hidden">
        <Table dataSource={specimens} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>
    </div>
  );
};