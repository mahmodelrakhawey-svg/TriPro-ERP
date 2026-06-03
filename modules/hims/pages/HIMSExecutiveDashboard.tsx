import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Row, Col, Statistic, Progress, Table, Typography, Tag, Spin } from 'antd';
import { UserOutlined, BankOutlined, DollarOutlined, ExperimentOutlined, AlertOutlined, RiseOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '@/context/AuthContext';

export const HIMSExecutiveDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState({
    totalPatients: 0,
    occupancyRate: 0,
    dailyRevenue: 0,
    pendingLabs: 0,
    criticalCases: 0
  });
  const [loading, setLoading] = useState(false);
  const [revenueData, setRevenueByDept] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    if (!currentUser?.organization_id) return;
    setLoading(true);
    
    const { data, error } = await supabase.rpc('get_hims_executive_stats', { p_org_id: currentUser.organization_id });
    if (!error && data) {
      setStats(data);
    }

    // بيانات وهمية للرسم البياني ريثما يمتلئ النظام ببيانات حقيقية متنوعة
    setRevenueByDept([
      { name: 'الأدوية', value: 35, color: '#10b981' },
      { name: 'الخدمات الطبية', value: 45, color: '#3b82f6' },
      { name: 'الإقامة', value: 20, color: '#f59e0b' }
    ]);

    setLoading(false);
  };

  useEffect(() => { fetchDashboardData(); }, [currentUser?.organization_id]);

  if (loading) return <div className="h-screen flex items-center justify-center"><Spin size="large" tip="جاري تحليل مؤشرات الأداء..." /></div>;

  return (
    <div className="p-6 bg-slate-50 min-h-screen rtl text-right">
      <Typography.Title level={2} className="mb-8 font-black">
        <BankOutlined className="text-indigo-600" /> مركز الإدارة الاستراتيجية للمستشفى
      </Typography.Title>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={6}>
          <Card className="rounded-3xl shadow-sm border-none">
            <Statistic 
              title="إيرادات اليوم (مبدئي)" 
              value={stats.dailyRevenue} 
              prefix={<DollarOutlined className="text-emerald-500" />} 
              suffix="EGP" 
              styles={{ content: { fontWeight: 900 } }}
            />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="rounded-3xl shadow-sm border-none">
            <Statistic 
              title="حالات الطوارئ النشطة" 
              value={stats.criticalCases} 
              prefix={<AlertOutlined className="text-rose-500" />} 
              styles={{ content: { color: '#e11d48', fontWeight: 900 } }}
            />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="rounded-3xl shadow-sm border-none">
            <Typography.Text className="text-slate-400 block mb-2">نسبة إشغال الأسرة</Typography.Text>
            <Progress percent={stats.occupancyRate} status="active" strokeColor="#6366f1" strokeWidth={12} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="rounded-3xl shadow-sm border-none">
            <Statistic 
              title="تحاليل بانتظار النتائج" 
              value={stats.pendingLabs} 
              prefix={<ExperimentOutlined className="text-amber-500" />} 
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={24} className="mt-8">
        <Col span={16}>
          <Card title="مراقبة تدفق المرضى" className="rounded-3xl shadow-sm border-none">
             <div className="h-64 flex items-center justify-center text-slate-300 italic border-dashed border-2 rounded-2xl">
               [هنا سيتم ربط مخطط Recharts البياني لتوزيع الحالات حسب القسم]
             </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="توزيع التكاليف" className="rounded-3xl shadow-sm border-none">
             <div className="space-y-4">
               <div className="flex justify-between"><span>الأدوية</span><Tag color="green">35%</Tag></div>
               <Progress percent={35} showInfo={false} strokeColor="#10b981" />
               <div className="flex justify-between"><span>الخدمات الطبية</span><Tag color="blue">45%</Tag></div>
               <Progress percent={45} showInfo={false} strokeColor="#3b82f6" />
               <div className="flex justify-between"><span>الإقامة</span><Tag color="orange">20%</Tag></div>
               <Progress percent={20} showInfo={false} strokeColor="#f59e0b" />
             </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};