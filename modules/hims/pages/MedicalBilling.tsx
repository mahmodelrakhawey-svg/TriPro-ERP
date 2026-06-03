import React, { useState, useEffect } from 'react';
import { HospitalBillingEngine } from '../components/HospitalBillingEngine';
import { Search } from 'lucide-react';
import { Card, Select, Empty, Spin } from 'antd';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

const MedicalBilling: React.FC = () => {
  const [visitId, setVisitId] = useState<string>('');
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { currentUser } = useAuth();

  const handleSearch = async (value: string) => {
    if (!value || value.length < 2) return;
    setLoading(true);
    
    // جلب الزيارات التي تطابق البحث (باسم المريض) وغير المغلقة مالياً
    const { data } = await supabase
      .from('hims_visits')
      .select('id, created_at, hims_patients!inner(full_name)')
      .eq('organization_id', currentUser?.organization_id)
      .ilike('hims_patients.full_name', `%${value}%`)
      .neq('status', 'discharged') // الزيارات التي لا تزال جارية أو بانتظار الخروج
      .limit(20);

    setVisits(data || []);
    setLoading(false);
  };

  return (
    <div className="p-6 rtl text-right space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black text-slate-800">صندوق المحاسبة الطبية 🧾</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card title="البحث عن زيارة نشطة" className="rounded-2xl shadow-sm">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">ابحث باسم المريض:</label>
              <Select
                showSearch
                className="w-full"
                placeholder="اكتب اسم المريض هنا..."
                filterOption={false}
                onSearch={handleSearch}
                onChange={(val) => setVisitId(val)}
                notFoundContent={loading ? <Spin size="small" /> : <Empty description="لا توجد زيارات مطابقة" />}
                options={visits.map(v => ({
                  label: `${v.hims_patients?.full_name} (${dayjs(v.created_at).format('DD/MM HH:mm')})`,
                  value: v.id
                }))}
              />
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {visitId ? (
            <HospitalBillingEngine visitId={visitId} />
          ) : (
            <Card className="rounded-3xl border-dashed border-2 flex items-center justify-center p-20 text-slate-400">
              <Empty description="يرجى إدخال رقم زيارة لعرض الفاتورة" />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default MedicalBilling;