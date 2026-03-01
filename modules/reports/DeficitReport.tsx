import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { AlertTriangle, Filter, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const DeficitReport = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const chartData = useMemo(() => {
    const userDeficits: { [key: string]: { name: string, totalDeficit: number, count: number } } = {};

    logs.forEach(log => {
      const userId = log.rejected_by;
      const userName = log.rejected_by_profile?.full_name || 'مستخدم غير معروف';
      if (!userDeficits[userId]) {
        userDeficits[userId] = { name: userName, totalDeficit: 0, count: 0 };
      }
      userDeficits[userId].totalDeficit += Math.abs(log.difference);
      userDeficits[userId].count += 1;
    });

    return Object.values(userDeficits).sort((a, b) => b.totalDeficit - a.totalDeficit).slice(0, 10);
  }, [logs]);

  useEffect(() => {
    fetchLogs();
  }, [startDate, endDate]);

  const fetchLogs = async () => {
    if (startDate > endDate) {
        showToast('تاريخ البداية يجب أن يكون قبل تاريخ النهاية', 'warning');
        return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rejected_cash_closings') // Make sure the foreign key to profiles is set up correctly
        .select('*, rejected_by_profile:profiles(full_name), treasury_account:accounts(name)')
        .gte('rejection_date', startDate)
        .lte('rejection_date', `${endDate}T23:59:59`)
        .order('rejection_date', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.error('Error fetching deficit logs:', err);
      showToast('فشل تحميل السجلات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="text-red-600" /> تقرير محاولات الإقفال بعجز
          </h2>
          <p className="text-slate-500">سجل بالمحاولات التي تم رفضها بسبب تجاوز العجز للحد المسموح به.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-end gap-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <button onClick={fetchLogs} disabled={loading} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 font-bold flex items-center gap-2">
          {loading ? <Loader2 className="animate-spin" /> : <Filter />}
          تحديث
        </button>
      </div>

      {chartData.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-4">أكثر الموظفين تسجيلاً للعجز (حسب القيمة)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis type="number" stroke="#888888" />
              <YAxis dataKey="name" type="category" width={80} stroke="#888888" />
              <Tooltip 
                cursor={{fill: 'rgba(239, 246, 255, 0.5)'}}
                contentStyle={{ backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px' }}
                labelStyle={{ fontWeight: 'bold' }}
                formatter={(value) => [Number(value || 0).toLocaleString(), 'إجمالي العجز']}
              />
              <Bar dataKey="totalDeficit" fill="#ef4444" background={{ fill: '#f1f5f9' }} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
            <tr>
              <th className="p-4">التاريخ والوقت</th>
              <th className="p-4">المستخدم</th>
              <th className="p-4">الصندوق</th>
              <th className="p-4">رصيد النظام</th>
              <th className="p-4">الرصيد الفعلي</th>
              <th className="p-4">قيمة العجز</th>
              <th className="p-4">الحد المسموح</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-red-600" /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد سجلات مطابقة.</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} className="hover:bg-red-50/50">
                  <td className="p-4 text-slate-600">{new Date(log.rejection_date).toLocaleString('ar-EG')}</td>
                  <td className="p-4 font-bold text-slate-800">{log.rejected_by_profile?.full_name || 'مستخدم غير معروف'}</td>
                  <td className="p-4 text-slate-700">{log.treasury_account?.name || 'صندوق محذوف'}</td>
                  <td className="p-4 font-mono text-blue-600">{log.system_balance.toLocaleString()}</td>
                  <td className="p-4 font-mono text-slate-600">{log.actual_balance.toLocaleString()}</td>
                  <td className="p-4 font-mono font-bold text-red-600">{Math.abs(log.difference).toLocaleString()}</td>
                  <td className="p-4 font-mono text-amber-600">{log.max_allowed_deficit.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DeficitReport;