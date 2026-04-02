import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, Calendar, Filter, Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

const SalesByUserReport = () => {
  const { settings, currentUser } = useAccounting();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      if (currentUser?.role === 'demo') {
          setReportData([
              { name: 'أحمد محمد', ordersCount: 45, totalSales: 15200 },
              { name: 'سارة علي', ordersCount: 32, totalSales: 9800 },
              { name: 'مدير النظام', ordersCount: 12, totalSales: 4500 },
          ]);
          setLoading(false);
          return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      // جلب الطلبات المكتملة وتجميعها حسب المستخدم
      const { data: orders, error } = await supabase
        .from('orders')
        .select('grand_total, user_id, profiles(full_name)')
        .eq('organization_id', userOrgId)
        .eq('status', 'COMPLETED')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (error) throw error;

      const userStats: Record<string, { name: string, ordersCount: number, totalSales: number }> = {};

      orders?.forEach((order: any) => {
        const userId = order.user_id;
        const userName = order.profiles?.full_name || 'مستخدم غير معروف';
        
        if (!userStats[userId]) {
            userStats[userId] = { name: userName, ordersCount: 0, totalSales: 0 };
        }
        
        userStats[userId].ordersCount += 1;
        userStats[userId].totalSales += Number(order.grand_total || 0);
      });

      const formattedData = Object.values(userStats).sort((a, b) => b.totalSales - a.totalSales);
      setReportData(formattedData);

    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reportData.map(d => ({
        'المستخدم/الكاشير': d.name,
        'عدد الطلبات': d.ordersCount,
        'إجمالي المبيعات': d.totalSales
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales By User");
    XLSX.writeFile(wb, `Sales_By_User_${startDate}.xlsx`);
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="text-indigo-600" /> تقرير مبيعات المستخدمين (الكاشير)
        </h2>
        <button onClick={exportExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700">
            <Download size={18} /> تصدير Excel
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-lg p-2" />
        </div>
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-lg p-2" />
        </div>
        <button onClick={fetchReport} disabled={loading} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 flex items-center gap-2">
            {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />} عرض
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <ReportHeader title="تقرير أداء الكاشير والمستخدمين" subtitle={`للفترة من ${startDate} إلى ${endDate}`} />
        
        <div className="h-80 mt-6 print:hidden">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(val: number) => val.toLocaleString()} />
                    <Bar dataKey="totalSales" name="إجمالي المبيعات" radius={[4, 4, 0, 0]}>
                        {reportData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>

        <table className="w-full text-right mt-6 border-t">
            <thead className="bg-slate-50">
                <tr>
                    <th className="p-3">المستخدم</th>
                    <th className="p-3 text-center">عدد الطلبات</th>
                    <th className="p-3 text-center">إجمالي المبيعات</th>
                </tr>
            </thead>
            <tbody className="divide-y">
                {reportData.map((row, idx) => (
                    <tr key={idx}>
                        <td className="p-3 font-bold text-slate-700">{row.name}</td>
                        <td className="p-3 text-center font-mono">{row.ordersCount}</td>
                        <td className="p-3 text-center font-bold text-emerald-600">{row.totalSales.toLocaleString()} {settings.currency}</td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesByUserReport;