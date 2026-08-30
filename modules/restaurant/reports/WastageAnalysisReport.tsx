import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { BarChart, Loader2, Filter, Trash2, Printer } from 'lucide-react';
import ReportHeader from '../../../components/ReportHeader';
import { useAccounting } from '../../../context/AccountingContext';

// تعريف نوع البيانات المتوقع من التقرير
type WastageReasonAnalysis = {
  reason: string;
  occurrence_count: number;
  total_wasted_quantity: number;
  total_wasted_cost: number;
};

const WastageAnalysisReport = () => {
  const { showToast } = useToast();
  const { settings, currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<WastageReasonAnalysis[]>([]);
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  // دالة لجلب بيانات التقرير
  const generateReport = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      const userRole = session?.user?.user_metadata?.role || currentUser?.role;

      if (currentUser?.role === 'demo') {
        setReportData([
          { reason: 'تالف أثناء التحضير والتجهيز', occurrence_count: 8, total_wasted_quantity: 14.5, total_wasted_cost: 450 },
          { reason: 'انتهاء فترة الصلاحية', occurrence_count: 3, total_wasted_quantity: 6, total_wasted_cost: 320 },
          { reason: 'هالك تخزين وسوء تبريد', occurrence_count: 2, total_wasted_quantity: 5, total_wasted_cost: 210 },
          { reason: 'أخطاء تشغيل وطلبات ملغاة', occurrence_count: 5, total_wasted_quantity: 7, total_wasted_cost: 180 }
        ]);
        setLoading(false);
        return;
      }

      // 1. محاولة استدعاء الدالة المخزنة (RPC) أولاً
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('analyze_wastage_reasons', {
          p_start_date: startDate,
          p_end_date: endDate,
          p_org_id: userOrgId
        });

        if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
          setReportData(rpcData as WastageReasonAnalysis[]);
          setLoading(false);
          return;
        }
      } catch (rpcErr) {
        // Fallback to direct calculation if RPC is missing
      }

      // 2. الحساب الديناميكي المباشر من جداول حركات الهالك والتسويات المخزنية الرسمية
      let adjustmentsQuery = supabase
        .from('stock_adjustments')
        .select(`
          id, reason, notes, adjustment_date,
          stock_adjustment_items (
            product_id, quantity,
            products (id, name, purchase_price, weighted_average_cost, cost)
          )
        `)
        .gte('adjustment_date', startDate)
        .lte('adjustment_date', endDate);

      if (userOrgId && userRole !== 'super_admin') {
        adjustmentsQuery = adjustmentsQuery.eq('organization_id', userOrgId);
      }

      const { data: adjData, error: adjError } = await adjustmentsQuery;

      const reasonMap: Record<string, { count: number; qty: number; cost: number }> = {};

      if (adjData && !adjError) {
        adjData.forEach((adj: any) => {
          const reasonKey = (adj.reason || adj.notes || 'هالك عام').trim();
          if (!reasonMap[reasonKey]) {
            reasonMap[reasonKey] = { count: 0, qty: 0, cost: 0 };
          }
          reasonMap[reasonKey].count += 1;

          const items = adj.stock_adjustment_items || [];
          items.forEach((it: any) => {
            const qty = Math.abs(Number(it.quantity) || 0);
            const unitCost = Number(it.products?.purchase_price || it.products?.weighted_average_cost || it.products?.cost || 0);
            reasonMap[reasonKey].qty += qty;
            reasonMap[reasonKey].cost += (qty * unitCost);
          });
        });
      }

      const formattedData: WastageReasonAnalysis[] = Object.entries(reasonMap).map(([reason, stats]) => ({
        reason,
        occurrence_count: stats.count,
        total_wasted_quantity: stats.qty,
        total_wasted_cost: stats.cost
      })).sort((a, b) => b.total_wasted_cost - a.total_wasted_cost);

      setReportData(formattedData);

      if (formattedData.length === 0) {
        showToast('لا توجد بيانات هدر مسجلة في الفترة المحددة.', 'info');
      }
    } catch (error: any) {
      console.error('Error generating wastage report:', error);
      showToast('حدث خطأ أثناء جلب التقرير: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Trash2 className="text-red-600" /> تقرير تحليل أسباب الهدر
        </h2>
        <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-slate-700 text-white px-4 py-2 rounded-lg hover:bg-slate-800 font-bold text-sm shadow-sm"
        >
            <Printer size={16} /> طباعة التقرير
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <button onClick={generateReport} disabled={loading} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 font-bold flex items-center gap-2">
            {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />}
            عرض التقرير
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <ReportHeader title="تحليل أسباب الهدر والتالف" subtitle={`للفترة من ${startDate} إلى ${endDate}`} />
        
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-700 font-bold">
                <tr>
                <th className="p-4">سبب الهدر</th>
                <th className="p-4 text-center">عدد المرات</th>
                <th className="p-4 text-center">إجمالي الكمية</th>
                <th className="p-4 text-center">إجمالي التكلفة</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {reportData.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-800">{row.reason}</td>
                    <td className="p-4 text-center font-mono">{row.occurrence_count}</td>
                    <td className="p-4 text-center font-mono">{row.total_wasted_quantity.toLocaleString()}</td>
                    <td className="p-4 text-center font-black text-red-600">{row.total_wasted_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })} {settings.currency}</td>
                </tr>
                ))}
                {reportData.length === 0 && !loading && (
                <tr><td colSpan={4} className="p-8 text-center text-slate-400">اختر فترة زمنية ثم اضغط "عرض التقرير"</td></tr>
                )}
            </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default WastageAnalysisReport;
