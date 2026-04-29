import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FileBarChart, Loader2, Calendar } from 'lucide-react';

const WIPMonthlySummaryReport = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const orgId = (currentUser as any)?.organization_id;
      if (!orgId) return;
      try {
        const { data: result, error } = await supabase.from('v_mfg_wip_monthly_summary').select('*').eq('organization_id', orgId);
        if (error) throw error;
        setData(result || []);
      } catch (error: any) {
        showToast(error.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></div>;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileBarChart className="text-purple-600" /> تقرير ملخص WIP الشهري
          </h1>
          <p className="text-gray-500 text-sm">تحليل قيمة الإنتاج تحت التشغيل حسب الشهر والمنتج</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-400 uppercase mb-6">توزيع قيمة WIP شهرياً</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
                <Bar dataKey="monthly_material_cost" name="تكلفة المواد" fill="#3b82f6" stackId="a" />
                <Bar dataKey="monthly_labor_cost" name="تكلفة العمالة" fill="#10b981" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b">
              <tr className="text-xs text-gray-500 font-bold"><th className="p-4">الشهر</th><th className="p-4">المنتج</th><th className="p-4">مركز العمل</th><th className="p-4 text-center">تكلفة المواد</th><th className="p-4 text-center">تكلفة العمالة</th><th className="p-4 text-center font-black">إجمالي قيمة WIP</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors text-sm">
                  <td className="p-4 font-bold flex items-center gap-2"><Calendar size={14} className="text-gray-400" /> {row.month}</td>
                  <td className="p-4">{row.product_name}</td><td className="p-4 text-gray-600">{row.work_center_name}</td>
                  <td className="p-4 text-center">{row.monthly_material_cost}</td><td className="p-4 text-center">{row.monthly_labor_cost}</td>
                  <td className="p-4 text-center font-black text-purple-700">{row.total_monthly_wip_value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default WIPMonthlySummaryReport;