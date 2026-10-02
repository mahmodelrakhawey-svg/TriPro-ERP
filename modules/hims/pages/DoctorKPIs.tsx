import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Row, Col, Table, Statistic, Typography, Tag, Progress, Avatar } from 'antd';
import { UserOutlined, RiseOutlined, FallOutlined, DollarOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';

export const DoctorKPIs: React.FC = () => {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDoctorStats = async () => {
    setLoading(true);
    // Ù†Ø³ØªØ®Ø¯Ù… Ø§Ù„Ø±Ø¤ÙŠØ© v_hims_doctor_profitability Ø§Ù„ØªÙŠ ØªÙ… ØªØ£Ø³ÙŠØ³Ù‡Ø§ ÙÙŠ Ø§Ù„Ù…Ø­Ø±Ùƒ Ø§Ù„Ù…ÙˆØ­Ø¯
    const { data, error } = await supabase
      .from('v_hims_doctor_profitability')
      .select('*')
      .eq('organization_id', currentUser?.organization_id);

    if (!error) setStats(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchDoctorStats(); }, [currentUser]);

  const columns = [
    {
      title: 'Ø§Ù„Ø·Ø¨ÙŠØ¨',
      render: (r: Record<string, any>) => (
        <div className="flex items-center gap-3">
          <Avatar icon={<UserOutlined />} className="bg-blue-100 text-blue-600" />
          <div>
            <div className="font-bold">{r.doctor_name}</div>
            <div className="text-xs text-slate-400">{r.specialization}</div>
          </div>
        </div>
      )
    },
    { title: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø²ÙŠØ§Ø±Ø§Øª', dataIndex: 'total_visits', align: 'center' as const },
    { 
      title: 'Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„Ù…ÙˆÙ„Ø¯Ø©', 
      dataIndex: 'total_revenue', 
      render: (v: number) => <b className="text-emerald-600">{v.toLocaleString()} EGP</b> 
    },
    { 
      title: 'Ø§Ù„ØªØ­ØµÙŠÙ„ Ø§Ù„Ù†Ù‚Ø¯ÙŠ', 
      render: (r: Record<string, any>) => (
        <Progress 
          percent={Math.round((r.patient_collections / r.total_revenue) * 100)} 
          size="small" 
          status={r.patient_collections > r.total_revenue * 0.7 ? 'success' : 'normal'}
        />
      ) 
    },
    {
        title: 'Ø°Ù…Ù… Ø§Ù„ØªØ£Ù…ÙŠÙ†',
        dataIndex: 'insurance_receivables',
        render: (v: number) => <Tag color="orange">{v.toLocaleString()} EGP</Tag>
    }
  ];

  const topDoctor = [...stats].sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))[0];
  const topDoctorName = topDoctor && (topDoctor.total_revenue > 0 || topDoctor.total_visits > 0)
    ? `${topDoctor.doctor_name} (${topDoctor.specialization || ''})`
    : 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø²ÙŠØ§Ø±Ø§Øª Ø¨Ø¹Ø¯';

  return (
    <div className="p-6 rtl text-right bg-slate-50 min-h-screen">
      <Typography.Title level={2} className="mb-6">
        <ExperimentOutlined className="text-indigo-600" /> Ù„ÙˆØ­Ø© Ù‚ÙŠØ§Ø¯Ø© Ø£Ø¯Ø§Ø¡ Ø§Ù„Ø·Ø§Ù‚Ù… Ø§Ù„Ø·Ø¨ÙŠ
      </Typography.Title>

      <Row gutter={[16, 16]} className="mb-8">
        <Col span={8}>
          <Card className="rounded-2xl border-none shadow-sm">
            <Statistic title="Ø£Ø¹Ù„Ù‰ Ø·Ø¨ÙŠØ¨ Ø¥Ù†ØªØ§Ø¬ÙŠØ©" value={topDoctorName} prefix={<RiseOutlined className="text-green-500" />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="rounded-2xl border-none shadow-sm">
            <Statistic title="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¹ÙˆØ§Ø¦Ø¯ Ø§Ù„Ø·Ø¨ÙŠØ©" value={stats.reduce((acc, c) => acc + c.total_revenue, 0)} suffix="EGP" prefix={<DollarOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="rounded-2xl border-none shadow-sm">
            <Statistic title="Ù…ØªÙˆØ³Ø· Ù‚ÙŠÙ…Ø© Ø§Ù„ØªØ°ÙƒØ±Ø©" value={Math.round(stats.reduce((acc, c) => acc + c.total_revenue, 0) / (stats.reduce((acc, c) => acc + c.total_visits, 0) || 1))} suffix="EGP" />
          </Card>
        </Col>
      </Row>

      <Card className="rounded-3xl border-none shadow-lg overflow-hidden" title="ØªØ­Ù„ÙŠÙ„ Ø§Ù„Ø±Ø¨Ø­ÙŠØ© Ø­Ø³Ø¨ Ø§Ù„Ø·Ø¨ÙŠØ¨">
        <Table 
          dataSource={stats} 
          columns={columns} 
          loading={loading} 
          rowKey="doctor_id"
          pagination={false}
        />
      </Card>
    </div>
  );
};
