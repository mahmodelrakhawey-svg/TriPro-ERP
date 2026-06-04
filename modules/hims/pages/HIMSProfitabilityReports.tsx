import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Tag, Progress, Divider, Button } from 'antd';
import { RiseOutlined, UserOutlined, BankOutlined, FilePdfOutlined, PieChartOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { himsService } from '../../../services/himsService';
import { useAccounting } from '../../../context/AccountingContext';

const { Title, Text } = Typography;

export const HIMSProfitabilityReports: React.FC = () => {
  const { settings } = useAccounting();
  const [doctorStats, setDoctorStats] = useState<any[]>([]);
  const [deptStats, setDeptStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [docs, depts] = await Promise.all([
        himsService.getDoctorProfitability(),
        himsService.getDeptProfitability()
      ]);
      setDoctorStats(docs || []);
      setDeptStats(depts || []);
    } catch (e) { console.error('Error fetching profitability data:', e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="p-6 bg-slate-50 min-h-screen rtl text-right">
      <div className="flex justify-between items-center mb-8">
        <div>
          <Title level={2} className="font-black m-0">
            <RiseOutlined className="text-emerald-500" /> تقارير تحليل الربحية الطبية
          </Title>
          <Text type="secondary">تحليل الإيرادات حسب الطبيب والقسم لضمان الكفاءة المالية</Text>
        </div>
        <Button icon={<FilePdfOutlined />} type="primary" className="bg-slate-800 border-none rounded-xl">تصدير التقرير المالي</Button>
      </div>

      <Row gutter={[24, 24]}>
        <Col lg={16} xs={24}>
          <Card title={<b><UserOutlined /> أداء الأطباء (حسب الإيراد)</b>} className="rounded-3xl shadow-sm border-none">
            <div className="h-80" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={doctorStats.slice(0, 5)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="doctor_name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total_revenue" radius={[4, 4, 0, 0]}>
                    {doctorStats.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table 
              dataSource={doctorStats} 
              size="small" 
              pagination={{ pageSize: 5 }}
              className="mt-6"
              rowKey="doctor_id"
              columns={[
                { title: 'الطبيب', dataIndex: 'doctor_name', render: (t) => <b>{t}</b> },
                { title: 'التخصص', dataIndex: 'specialization' },
                { title: 'الزيارات', dataIndex: 'total_visits', align: 'center' },
                { title: 'الإيراد الكلي', dataIndex: 'total_revenue', render: (v) => <Text strong className="text-emerald-600">{v?.toLocaleString()} {settings?.currency || 'EGP'}</Text> },
                { title: 'نسبة التحصيل', render: (_, r) => <Progress percent={Math.round((r.patient_collections / (r.total_revenue || 1)) * 100)} size="small" /> }
              ]}
            />
          </Card>
        </Col>

        <Col lg={8} xs={24}>
          <Card title={<b><BankOutlined /> ربحية الأقسام</b>} className="rounded-3xl shadow-sm border-none h-full">
            <div className="space-y-6">
              {deptStats.map((dept, idx) => (
                <div key={idx}>
                  <div className="flex justify-between mb-2">
                    <Text strong>{dept.department_name}</Text>
                    <Text type="secondary">{dept.total_revenue?.toLocaleString()} {settings?.currency || 'EGP'}</Text>
                  </div>
                  <Progress 
                    percent={Math.round((dept.total_revenue / (deptStats.reduce((a,b) => a + b.total_revenue, 0) || 1)) * 100)} 
                    strokeColor={COLORS[idx % COLORS.length]}
                  />
                </div>
              ))}
              
              {deptStats.length === 0 && <div className="text-center py-10 opacity-30 italic">لا توجد بيانات كافية حالياً</div>}

              <Divider />
              <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                <Statistic 
                  title="إجمالي المحفظة المالية" 
                  value={deptStats.reduce((acc, curr) => acc + (curr.total_revenue || 0), 0)} 
                  suffix={settings?.currency || 'EGP'}
                  prefix={<PieChartOutlined />}
                  styles={{ content: { color: '#4f46e5', fontWeight: 900 } }}
                />
                <p className="text-[10px] text-indigo-400 mt-2 font-bold">بناءً على الفواتير المعتمدة والمرحلة</p>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};