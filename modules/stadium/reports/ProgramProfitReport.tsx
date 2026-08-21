import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import { TrendingUp, BarChart3, Award, DollarSign, Download } from 'lucide-react';
import { format, startOfYear, endOfYear } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import * as XLSX from 'xlsx';

interface ProgramProfit {
  id: string;
  name: string;
  coachName: string;
  coachRatePercent: number;
  enrollmentsCount: number;
  totalRevenue: number;
  coachCost: number;
  netProfit: number;
  marginPercent: number;
  isAccrued: boolean;
}

const ProgramProfitReport: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [dateFrom, setDateFrom] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfYear(new Date()), 'yyyy-MM-dd'));
  
  const [stats, setStats] = useState<ProgramProfit[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    if (orgId) {
      fetchProfitability();
    }
  }, [orgId, dateFrom, dateTo]);

  const fetchProfitability = async () => {
    try {
      setLoading(true);
      
      // 1. Get programs with coach details & commission_rate
      const { data: programs, error: progError } = await supabase
        .from('stadium_training_programs')
        .select(`id, name, coach_id, stadium_coaches(id, full_name, commission_rate)`)
        .eq('organization_id', orgId);
        
      if (progError) throw progError;
      if (!programs || programs.length === 0) {
        setStats([]);
        return;
      }

      // 2. Get enrollments for revenue
      const { data: enrollments, error: enrollError } = await supabase
        .from('stadium_program_enrollments')
        .select('program_id, amount_paid, enrollment_date, created_at')
        .eq('organization_id', orgId)
        .neq('status', 'cancelled');

      if (enrollError) throw enrollError;

      // 3. Get coach payments for cost
      const { data: payments, error: payError } = await supabase
        .from('stadium_coach_payments')
        .select('program_id, amount_paid, payment_date')
        .eq('organization_id', orgId);

      if (payError) throw payError;

      // Filter data for the date range
      const filteredEnrollments = (enrollments || []).filter(e => {
        const d = e.enrollment_date || (e.created_at ? e.created_at.split('T')[0] : '');
        if (!d) return true;
        return d >= dateFrom && d <= dateTo;
      });

      const filteredPayments = (payments || []).filter(p => {
        const d = p.payment_date ? p.payment_date.split('T')[0] : '';
        if (!d) return true;
        return d >= dateFrom && d <= dateTo;
      });

      // Calculate stats
      const calculatedStats = programs.map(prog => {
        const progEnrollments = filteredEnrollments.filter(e => e.program_id === prog.id);
        const progPayments = filteredPayments.filter(p => p.program_id === prog.id);
        
        const totalRevenue = progEnrollments.reduce((sum, e) => sum + (Number(e.amount_paid) || 0), 0);
        const paidCost = progPayments.reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);
        
        // حساب عمولة المدرب المستحقة من نسبة العمولة
        const rawRate = Number((prog as any).stadium_coaches?.commission_rate) || 0;
        const coachRatePercent = rawRate <= 1 ? rawRate * 100 : rawRate;
        const normalizedRate = coachRatePercent / 100;
        const estimatedCost = totalRevenue * normalizedRate;
        
        // تكلفة المدرب: إما المنصرف فعلياً أو المحسوب من نسبة العمولة
        const coachCost = paidCost > 0 ? paidCost : estimatedCost;
        const isAccrued = paidCost === 0 && estimatedCost > 0;
        const netProfit = totalRevenue - coachCost;
        
        let marginPercent = 0;
        if (totalRevenue > 0) {
          marginPercent = (netProfit / totalRevenue) * 100;
        }

        return {
          id: prog.id,
          name: prog.name,
          coachName: (prog as any).stadium_coaches?.full_name || 'بدون مدرب',
          coachRatePercent,
          enrollmentsCount: progEnrollments.length,
          totalRevenue,
          coachCost,
          netProfit,
          marginPercent,
          isAccrued,
        };
      });

      // Sort by net profit descending
      calculatedStats.sort((a, b) => b.netProfit - a.netProfit);
      setStats(calculatedStats);
      setCurrentPage(1);
    } catch (error: any) {
      console.error('Error fetching program profitability:', error);
      toast.error('حدث خطأ أثناء حساب الربحية');
    } finally {
      setLoading(false);
    }
  };


  const totalCount = stats.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentData = stats.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const chartData = currentData.map(s => ({
    name: s.name.substring(0, 15) + (s.name.length > 15 ? '...' : ''),
    'الإيرادات': s.totalRevenue,
    'تكلفة المدرب': s.coachCost,
  }));

  const handleExport = () => {
    const exportData = stats.map(item => ({
      'البرنامج': item.name,
      'المدرب': item.coachName,
      'عدد المشتركين': item.enrollmentsCount,
      'الإيرادات (ج.م)': item.totalRevenue,
      'تكلفة المدرب (ج.م)': item.coachCost,
      'صافي الربح (ج.م)': item.netProfit,
      'هامش الربح (%)': item.marginPercent.toFixed(1) + '%'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ربحية البرامج");
    XLSX.writeFile(wb, `Program_Profitability_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const getMarginColor = (margin: number) => {
    if (margin > 50) return 'text-green-600 bg-green-50';
    if (margin >= 20) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-emerald-600" />
          تقرير ربحية البرامج التدريبية
        </h1>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 px-2 border-l border-gray-200">
            <input 
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)}
              className="border-none bg-gray-50 rounded text-sm py-1 px-2 focus:ring-1 focus:ring-emerald-500"
            />
            <span className="text-gray-400">-</span>
            <input 
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)}
              className="border-none bg-gray-50 rounded text-sm py-1 px-2 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md hover:bg-emerald-100 transition text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            تصدير
          </button>
        </div>
      </div>

      {stats.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 h-80 min-w-0">
          <h3 className="text-sm font-semibold text-gray-600 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            الإيرادات مقابل التكاليف لكل برنامج
          </h3>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
              <RechartsTooltip cursor={{fill: '#f9fafb'}} formatter={(value) => [`${value} ج.م`]} />
              <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
              <Bar dataKey="الإيرادات" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="تكلفة المدرب" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}


      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">البرنامج</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">المدرب</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-center">المشتركين</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">الإيرادات</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">تكلفة المدرب</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">صافي الربح</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">هامش الربح</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">جاري التحميل...</td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">لا توجد برامج مسجلة</td>
                </tr>
              ) : (
                currentData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-gray-400" />
                        {row.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div>{row.coachName}</div>
                      {row.coachRatePercent > 0 && (
                        <span className="text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                          عمولة {row.coachRatePercent}%
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600 font-medium">{row.enrollmentsCount}</td>
                    <td className="px-6 py-4 font-medium text-emerald-600">{row.totalRevenue.toFixed(2)}</td>
                    <td className="px-6 py-4 font-medium text-red-500">
                      <div>{row.coachCost.toFixed(2)}</div>
                      {row.isAccrued && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded block">
                          مستحق (حسب النسبة)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-gray-400" />
                        {row.netProfit.toFixed(2)}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${getMarginColor(row.marginPercent)}`}>
                        {row.marginPercent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {currentData.length > 0 && (
              <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-gray-900 text-left">الإجمالي:</td>
                  <td className="px-6 py-4 text-emerald-600">{currentData.reduce((s, r) => s + r.totalRevenue, 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-red-500">{currentData.reduce((s, r) => s + r.coachCost, 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-gray-900">{currentData.reduce((s, r) => s + r.netProfit, 0).toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
            >
              السابق
            </button>
            <span className="text-sm text-gray-600">صفحة {currentPage} من {totalPages}</span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgramProfitReport;
