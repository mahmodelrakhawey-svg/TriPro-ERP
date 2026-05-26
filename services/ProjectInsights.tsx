import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Alert, Card, Progress, Statistic, Row, Col, Tag, Spin } from 'antd';
import { RocketOutlined, WarningOutlined, CheckCircleOutlined, DashboardOutlined } from '@ant-design/icons';

interface ProjectInsightsProps {
  projectId: string;
}

export const ProjectInsights: React.FC<ProjectInsightsProps> = ({ projectId }) => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [liquidity, setLiquidity] = useState<any>(null);
  const [healthScore, setHealthScore] = useState<number>(0);

  useEffect(() => {
    const fetchInsights = async () => {
      setLoading(true);
      // 🚀 استدعاء العقول الثلاثة في قاعدة البيانات
      const [evmRes, liqRes, healthRes] = await Promise.all([
        supabase.rpc('get_project_evm_metrics', { p_project_id: projectId }),
        supabase.rpc('get_project_liquidity_warning', { p_project_id: projectId }),
        supabase.rpc('get_project_health_score', { p_project_id: projectId })
      ]);

      setMetrics(evmRes.data);
      setLiquidity(liqRes.data);
      setHealthScore(healthRes.data || 0);
      setLoading(false);
    };

    if (projectId) fetchInsights();
  }, [projectId]);

  if (loading) return <Spin tip="جاري تحليل البيانات المالية..." className="w-full p-10" />;

  return (
    <div className="p-4 space-y-6">
      {/* 🚨 نظام الإنذار المبكر */}
      {liquidity?.risk_level === 'CRITICAL 🔴' && (
        <Alert
          message="تحذير نفاذ السيولة"
          description={liquidity.message}
          type="error"
          showIcon
          icon={<WarningOutlined />}
          className="shadow-md border-r-4 border-red-500"
        />
      )}

      <Row gutter={16}>
        <Col span={8}>
          <Card className="hover:shadow-lg transition-shadow">
            <Statistic 
              title="مؤشر أداء التكلفة (CPI)" 
              value={metrics?.cpi} 
              precision={2}
              prefix={<DashboardOutlined />}
              valueStyle={{ color: metrics?.cpi >= 1 ? '#3f8600' : '#cf1322' }}
            />
            <Tag color={metrics?.cpi >= 1 ? 'green' : 'red'} className="mt-2">
              {metrics?.cost_status}
            </Tag>
          </Card>
        </Col>

        <Col span={8}>
          <Card className="hover:shadow-lg transition-shadow">
            <Statistic 
              title="معدل الحرق اليومي" 
              value={liquidity?.current_burn_rate_daily} 
              suffix="EGP"
              prefix={<RocketOutlined />}
            />
            <div className="text-gray-400 text-xs mt-2">
              متبقي {liquidity?.estimated_days_until_empty} يوم سيولة
            </div>
          </Card>
        </Col>

        <Col span={8}>
          <Card className="text-center hover:shadow-lg transition-shadow">
            <div className="text-gray-500 mb-2 font-bold">صحة المشروع العامة</div>
            <Progress 
              type="dashboard" 
              percent={healthScore} 
              strokeColor={{ '0%': '#ff4d4f', '100%': '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 📉 تحليل القيمة المكتسبة */}
      <Card title="ميزانية العقد المخططة مقابل الصرف الفعلي" className="shadow-sm">
         <Row gutter={16}>
            <Col span={12}>
               <Statistic title="الميزانية الكلية (BAC)" value={metrics?.bac} suffix="EGP" />
               <Progress percent={Math.round((metrics?.actual_cost / metrics?.bac) * 100)} status="active" />
               <span className="text-xs text-gray-400">إجمالي المصروف الفعلي</span>
            </Col>
            <Col span={12}>
               <Statistic title="القيمة المنجزة (EV)" value={metrics?.earned_value} suffix="EGP" />
               <Progress percent={Math.round((metrics?.earned_value / metrics?.bac) * 100)} strokeColor="#52c41a" />
               <span className="text-xs text-gray-400">قيمة الأعمال المعتمدة</span>
            </Col>
         </Row>
      </Card>
    </div>
  );
};