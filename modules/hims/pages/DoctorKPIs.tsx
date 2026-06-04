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
    // نستخدم الرؤية v_hims_doctor_profitability التي تم تأسيسها في المحرك الموحد
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
      title: 'الطبيب',
      render: (r: any) => (
        <div className="flex items-center gap-3">
          <Avatar icon={<UserOutlined />} className="bg-blue-100 text-blue-600" />
          <div>
            <div className="font-bold">{r.doctor_name}</div>
            <div className="text-xs text-slate-400">{r.specialization}</div>
          </div>
        </div>
      )
    },
    { title: 'إجمالي الزيارات', dataIndex: 'total_visits', align: 'center' as const },
    { 
      title: 'الإيرادات المولدة', 
      dataIndex: 'total_revenue', 
      render: (v: number) => <b className="text-emerald-600">{v.toLocaleString()} EGP</b> 
    },
    { 
      title: 'التحصيل النقدي', 
      render: (r: any) => (
        <Progress 
          percent={Math.round((r.patient_collections / r.total_revenue) * 100)} 
          size="small" 
          status={r.patient_collections > r.total_revenue * 0.7 ? 'success' : 'normal'}
        />
      ) 
    },
    {
        title: 'ذمم التأمين',
        dataIndex: 'insurance_receivables',
        render: (v: number) => <Tag color="orange">{v.toLocaleString()} EGP</Tag>
    }
  ];

  return (
    <div className="p-6 rtl text-right bg-slate-50 min-h-screen">
      <Typography.Title level={2} className="mb-6">
        <ExperimentOutlined className="text-indigo-600" /> لوحة قيادة أداء الطاقم الطبي
      </Typography.Title>

      <Row gutter={[16, 16]} className="mb-8">
        <Col span={8}>
          <Card className="rounded-2xl border-none shadow-sm">
            <Statistic title="أعلى طبيب إنتاجية" value={stats[0]?.doctor_name || '...'} prefix={<RiseOutlined className="text-green-500" />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="rounded-2xl border-none shadow-sm">
            <Statistic title="إجمالي العوائد الطبية" value={stats.reduce((acc, c) => acc + c.total_revenue, 0)} suffix="EGP" prefix={<DollarOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="rounded-2xl border-none shadow-sm">
            <Statistic title="متوسط قيمة التذكرة" value={Math.round(stats.reduce((acc, c) => acc + c.total_revenue, 0) / (stats.reduce((acc, c) => acc + c.total_visits, 0) || 1))} suffix="EGP" />
          </Card>
        </Col>
      </Row>

      <Card className="rounded-3xl border-none shadow-lg overflow-hidden" title="تحليل الربحية حسب الطبيب">
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