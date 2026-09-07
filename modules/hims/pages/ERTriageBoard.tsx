import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Table, Tag, Badge, Typography, Row, Col, Progress, Empty } from 'antd';
import { AlertOutlined, ClockCircleOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

export const ERTriageBoard: React.FC = () => {
  const { currentUser } = useAuth();
  const [cases, setCases] = useState<any[]>([]);

  const fetchERQueue = async () => {
    if (!currentUser?.organization_id) return;
    const { data } = await supabase
      .from('hims_visits')
      .select('*, hims_patients(full_name, dob)')
      .eq('visit_type', 'emergency')
      .eq('organization_id', currentUser.organization_id)
      .neq('status', 'discharged')
      .order('triage_level', { ascending: true });
    setCases(data || []);
  };

  useEffect(() => {
    if (currentUser?.organization_id) {
      fetchERQueue();
      const interval = setInterval(fetchERQueue, 10000); // تحديث كل 10 ثواني
      return () => clearInterval(interval);
    }
  }, [currentUser?.organization_id]);

  const getTriageTag = (level: string) => {
    const config: any = {
      level_1_resuscitation: { color: '#f5222d', label: 'إنعاش فوري 🔴' },
      level_2_emergent: { color: '#fa8c16', label: 'طارئ جداً 🟠' },
      level_3_urgent: { color: '#fadb14', label: 'عاجل 🟡' },
      level_5_non_urgent: { color: '#52c41a', label: 'مستقر 🟢' }
    };
    return <Tag color={config[level]?.color} className="font-bold">{config[level]?.label || level}</Tag>;
  };

  const getWaitingTime = (checkInTime: string) => {
    const diffInMinutes = dayjs().diff(dayjs(checkInTime), 'minute');
    if (diffInMinutes < 60) {
      return `${diffInMinutes} دقيقة`;
    }
    const hours = Math.floor(diffInMinutes / 60);
    const mins = diffInMinutes % 60;
    return `${hours} ساعة و ${mins} دقيقة`;
  };

  const isWaitCritical = (level: string, checkInTime: string) => {
    const diffInMinutes = dayjs().diff(dayjs(checkInTime), 'minute');
    if (level === 'level_1_resuscitation' && diffInMinutes > 0) return true;
    if (level === 'level_2_emergent' && diffInMinutes > 15) return true;
    if (level === 'level_3_urgent' && diffInMinutes > 30) return true;
    if (level === 'level_5_non_urgent' && diffInMinutes > 120) return true;
    return false;
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen rtl text-right text-white">
      <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
        <Typography.Title level={2} style={{ color: '#fff', margin: 0 }}>
          <AlertOutlined className="text-red-500 animate-pulse" /> لوحة المراقبة الحية للطوارئ (ER Board)
        </Typography.Title>
        <div className="flex gap-4">
          <Badge status="error" text={<span className="text-white">حالات حرجة: {cases.filter(c => c.triage_level === 'level_1_resuscitation').length}</span>} />
          <Badge status="processing" text={<span className="text-white">إجمالي الحالات النشطة: {cases.length}</span>} />
        </div>
      </div>

      {cases.length > 0 ? (
        <Row gutter={[24, 24]}>
          {cases.map((c) => {
            const critical = isWaitCritical(c.triage_level, c.check_in_time) && c.status === 'triaged';
            return (
              <Col key={c.id} xs={24} md={12} lg={8}>
                <Card 
                  className={`rounded-2xl border-none text-white shadow-2xl overflow-hidden transition-all duration-300 ${
                    critical 
                      ? 'bg-gradient-to-br from-red-950/80 via-slate-800 to-slate-800 border-2 border-red-500 shadow-red-950/30' 
                      : 'bg-slate-800'
                  }`}
                  styles={{ body: { padding: '20px' } }}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-black text-white m-0 flex items-center gap-2">
                        <UserOutlined className="text-blue-400" /> {c.hims_patients?.full_name}
                      </h3>
                      <p className="text-slate-400 text-xs mt-1">العمر: {c.hims_patients?.dob ? dayjs().diff(c.hims_patients?.dob, 'year') : 'غير معروف'} سنة</p>
                    </div>
                    {getTriageTag(c.triage_level)}
                  </div>

                  <div className="bg-slate-700/50 p-3 rounded-xl mb-4 border border-slate-600">
                    <p className="text-xs text-slate-400 mb-1 font-bold">الشكوى الرئيسية:</p>
                    <p className="text-sm italic text-slate-200">"{c.chief_complaint || 'لم يتم التسجيل'}"</p>
                  </div>

                  <div className="flex justify-between items-center mb-3 text-xs border-b border-slate-700/40 pb-2">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <ClockCircleOutlined />
                      <span>دخول: {dayjs(c.check_in_time).format('HH:mm')}</span>
                    </div>
                    <div className={`font-bold flex items-center gap-1 ${critical ? 'text-red-500 animate-pulse' : 'text-amber-500'}`}>
                      {critical && <WarningOutlined />}
                      <span>الانتظار: {getWaitingTime(c.check_in_time)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <Tag color={c.status === 'in_consultation' ? 'processing' : 'default'} className="rounded-lg px-2.5 py-0.5">
                      {c.status === 'triaged' ? 'بانتظار الطبيب' : 'قيد الفحص'}
                    </Tag>
                    {critical && (
                      <span className="text-[10px] text-red-400 font-bold bg-red-950/40 px-2 py-0.5 rounded-full border border-red-500/20">
                        تنبيه: تأخر الفحص! 🚨
                      </span>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-800 rounded-3xl p-12 border border-slate-700 border-dashed text-center">
          <Empty 
            description={<span className="text-slate-400 text-lg">لا توجد حالات طوارئ نشطة حالياً بقسم الاستقبال 👍</span>}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      )}
    </div>
  );
};