import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting as useOrg } from '@/context/AccountingContext';
import { useToast } from '@/context/ToastContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface EfficiencyData {
  work_center_name: string;
  tasks_completed: number;
  total_standard_minutes: number;
  total_actual_minutes: number;
  efficiency_percentage: number;
}

const WorkCenterEfficiencyTable = () => {
  const { organization } = useOrg();
  const { showToast } = useToast();
  const orgId = organization?.id;
  const [data, setData] = useState<EfficiencyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!orgId) return;
      const { data: efficiencyData, error } = await supabase
        .from('v_mfg_work_center_efficiency')
        .select('*')
        .eq('organization_id', orgId);
      
      if (error) {
        showToast('خطأ في جلب بيانات الكفاءة', 'error');
      } else {
        setData(efficiencyData || []);
      }
      setLoading(false);
    };
    fetchData();
  }, [orgId]);

  if (loading) return <div className="p-4 text-center">جاري تحميل بيانات الكفاءة...</div>;

  return (
    <div className="space-y-6" dir="rtl">
      {/* الرسم البياني التحليلي */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold mb-6 text-gray-800 flex items-center gap-2">تحليل كفاءة الإنتاج اللحظي</h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="work_center_name" tick={{fontSize: 12}} />
              <YAxis unit="%" />
              <Tooltip formatter={(value) => [`${value}%`, 'الكفاءة']} />
              <Bar dataKey="efficiency_percentage" radius={[4, 4, 0, 0]} name="نسبة الكفاءة">
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.efficiency_percentage < 70 ? '#ef4444' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* الجدول التفصيلي */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <h2 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">بيانات التشغيل التفصيلية</h2>
        <table className="min-w-full table-auto">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">مركز العمل</th>
            <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">المهام</th>
            <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">الوقت المعياري (د)</th>
            <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">الوقت الفعلي (د)</th>
            <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">نسبة الكفاءة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((item, idx) => (
            <tr key={idx} className={item.efficiency_percentage < 70 ? 'bg-red-50' : 'hover:bg-gray-50'}>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.work_center_name}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{item.tasks_completed}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{Math.round(item.total_standard_minutes)}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{Math.round(item.total_actual_minutes)}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.efficiency_percentage < 70 ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'}`}>
                  {item.efficiency_percentage}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
};

export default WorkCenterEfficiencyTable;