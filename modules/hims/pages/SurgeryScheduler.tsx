import React, { useEffect, useState } from 'react';
import { Card, Calendar, Badge, Modal, Button } from 'antd';
import dayjs from 'dayjs';
import { supabase } from '@/supabaseClient';

export const SurgeryScheduler: React.FC = () => {
  const [surgeries, setSurgeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSurgeries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hims_surgeries')
      .select('*, doctor:lead_surgeon_id(profiles(full_name))')
      .order('scheduled_start', { ascending: true });
    setSurgeries(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchSurgeries(); }, []);

  const getListData = (value: dayjs.Dayjs) => {
    return surgeries.filter(s => 
      dayjs(s.scheduled_start).isSame(value, 'day')
    ).map(s => ({
      type: s.status === 'completed' ? 'success' : s.status === 'in_progress' ? 'processing' : 'warning',
      content: `${s.surgery_name} (${s.doctor?.profiles.full_name || 'طبيب'})`
    }));
  };

  const dateCellRender = (value: dayjs.Dayjs) => {
    const listData = getListData(value);
    return (
      <ul className="list-none p-0 m-0 overflow-hidden">
        {listData.map((item) => (
          <li key={item.content}>
            <Badge status={item.type as any} text={item.content} className="text-[10px]" />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="p-6 rtl text-right">
      <Card 
        className="rounded-3xl shadow-sm border-none" 
        title={<b className="text-xl">📅 جدول غرف العمليات</b>}
        extra={
          <Button type="primary" onClick={fetchSurgeries} loading={loading}>تحديث الجدول</Button>
        }
      >
        <Calendar cellRender={dateCellRender} />
      </Card>
    </div>
  );
};