import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Table, Tag, Badge, Typography, Row, Col, Progress } from 'antd';
import { AlertOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

export const ERTriageBoard: React.FC = () => {
  const [cases, setCases] = useState<any[]>([]);

  const fetchERQueue = async () => {
    const { data } = await supabase
      .from('hims_visits')
      .select('*, hims_patients(full_name, dob)')
      .eq('visit_type', 'emergency')
      .neq('status', 'discharged')
      .order('triage_level', { ascending: true });
    setCases(data || []);
  };

  useEffect(() => {
    fetchERQueue();
    const interval = setInterval(fetchERQueue, 10000); // تحديث كل 10 ثواني
    return () => clearInterval(interval);
  }, []);

  const getTriageTag = (level: string) => {
    const config: any = {
      level_1_resuscitation: { color: '#f5222d', label: 'إنعاش فوري 🔴' },
      level_2_emergent: { color: '#fa8c16', label: 'طارئ جداً 🟠' },
      level_3_urgent: { color: '#fadb14', label: 'عاجل 🟡' },
      level_5_non_urgent: { color: '#52c41a', label: 'مستقر 🟢' }
    };
    return <Tag color={config[level]?.color} className="font-bold">{config[level]?.label || level}</Tag>;
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen rtl text-right">
      <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
        <Typography.Title level={2} style={{ color: '#fff', margin: 0 }}>
          <AlertOutlined className="text-red-500 animate-pulse" /> لوحة المراقبة الحية للطوارئ (ER Board)
        </Typography.Title>
        <div className="flex gap-4">
          <Badge status="error" text={<span className="text-white">حالات حرجة: {cases.filter(c => c.triage_level === 'level_1_resuscitation').length}</span>} />
          <Badge status="processing" text={<span className="text-white">إجمالي الحالات: {cases.length}</span>} />
        </div>
      </div>

      <Row gutter={[24, 24]}>
        {cases.map((c) => (
          <Col key={c.id} xs={24} md={12} lg={8}>
            <Card 
              className="rounded-2xl border-none bg-slate-800 text-white shadow-2xl overflow-hidden"
              styles={{ body: { padding: '20px' } }}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-black text-white m-0 flex items-center gap-2">
                    <UserOutlined className="text-blue-400" /> {c.hims_patients?.full_name}
                  </h3>
                  <p className="text-slate-400 text-xs mt-1">العمر: {dayjs().diff(c.hims_patients?.dob, 'year')} سنة</p>
                </div>
                {getTriageTag(c.triage_level)}
              </div>

              <div className="bg-slate-700/50 p-3 rounded-xl mb-4 border border-slate-600">
                <p className="text-xs text-slate-400 mb-1 font-bold">الشكوى الرئيسية:</p>
                <p className="text-sm italic">"{c.chief_complaint || 'لم يتم التسجيل'}"</p>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-rose-400 font-bold">
                  <ClockCircleOutlined /> 
                  <span>{dayjs(c.check_in_time).format('HH:mm')}</span>
                </div>
                <Tag color={c.status === 'in_consultation' ? 'processing' : 'default'}>
                  {c.status === 'triaged' ? 'بانتظار الطبيب' : 'قيد الفحص'}
                </Tag>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};