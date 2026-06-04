import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Row, Col, Statistic, Progress, Table, Typography, Tag, Spin, message } from 'antd';
import { UserOutlined, BankOutlined, DollarOutlined, ExperimentOutlined, AlertOutlined, RiseOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useAuth } from '@/context/AuthContext';

export const HIMSExecutiveDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState({
    totalPatients: 0,
    occupancyRate: 0,
    dailyRevenue: 0,
    insuranceReceivables: 0,
    pendingLabs: 0,
    criticalCases: 0,
    revenueByDept: [],
    cashflowForecast: { forecast_data: [] } as any
  });
  const [loading, setLoading] = useState(false);
  const [costDistribution, setCostDistribution] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    if (!currentUser?.organization_id) return;
    setLoading(true);

    const { data, error } = await supabase.rpc('get_hims_executive_stats', { p_org_id: currentUser.organization_id });
    if (data) {
      setStats({
        ...data,
        revenueByDept: data.revenueByDept || [],
        cashflowForecast: {
          ...(data.cashflowForecast || {}),
          forecast_data: data.cashflowForecast?.forecast_data || []
        }
      });
    } else if (error) {
      message.error('فشل جلب إحصائيات الإدارة: ' + error.message);
    }

    // توزيع التكاليف المعياري (يمكن تحويله لبيانات حقيقية لاحقاً من v_hims_revenue_breakdown)
    setCostDistribution([
      { name: 'الأدوية', value: 35 },
      { name: 'الخدمات', value: 45 },
      { name: 'الإقامة', value: 20 }
    ]);

    setLoading(false);
  };

  useEffect(() => { fetchDashboardData(); }, [currentUser?.organization_id]);

  if (loading) return <div className="h-screen flex items-center justify-center"><Spin size="large" description="جاري تحليل مؤشرات الأداء..." /></div>;

  return (
    <div className="p-6 bg-slate-50 min-h-screen rtl text-right">
      <Typography.Title level={2} className="mb-8 font-black">
        <BankOutlined className="text-indigo-600" /> مركز الإدارة الاستراتيجية للمستشفى
      </Typography.Title>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={6}>
          <Card className="rounded-3xl shadow-sm border-none">
            <Statistic 
              title="إيرادات اليوم" 
              value={stats.dailyRevenue} 
              prefix={<DollarOutlined className="text-emerald-500" />} 
              suffix="EGP" 
              valueStyle={{ fontWeight: 900 }}
            />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="rounded-3xl shadow-sm border-none">
            <Statistic 
              title="ذمم التأمين المعلقة" 
              value={stats.insuranceReceivables} 
              prefix={<RiseOutlined className="text-blue-500" />} 
              suffix="EGP"
              valueStyle={{ color: '#1d4ed8', fontWeight: 900 }}
            />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="rounded-3xl shadow-sm border-none">
            <Typography.Text className="text-slate-400 block mb-2">نسبة إشغال الأسرة</Typography.Text>
            <Progress percent={stats.occupancyRate} status="active" strokeColor="#6366f1" size={12} />
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

      {/* 🚀 محرك التنبؤ بالتدفق النقدي الذكي */}
      <Row className="mt-8">
        <Col span={24}>
          <Card 
            title={<b className="text-indigo-700">🔮 التنبؤ بالتدفق النقدي والسيولة (30 يوماً القادمة)</b>} 
            className="rounded-3xl shadow-md border-none bg-white"
            extra={<Tag color="purple">ذكاء اصطناعي مالي نشط</Tag>}
          >
            <div className="h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.cashflowForecast?.forecast_data || []}>
                  <defs>
                    <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{fontSize: 10}} />
                  <YAxis tick={{fontSize: 10}} />
                  <Tooltip labelClassName="font-bold" />
                  <Area type="monotone" dataKey="expected_balance" stroke="#6366f1" fillOpacity={1} fill="url(#colorCash)" strokeWidth={3} name="السيولة المتوقعة" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-400 mt-4 italic">* يتم حساب التوقعات بناءً على متوسط التحصيل النقدي ومواعيد استحقاق مطالبات شركات التأمين.</p>
          </Card>
        </Col>
      </Row>

      <Row gutter={24} className="mt-8">
        <Col span={16}>
          <Card title="تحليل إيرادات الأقسام (حقيقي)" className="rounded-3xl shadow-sm border-none">
             <div className="h-64" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.revenueByDept || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} name="الإيراد" />
                  </BarChart>
                </ResponsiveContainer>
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