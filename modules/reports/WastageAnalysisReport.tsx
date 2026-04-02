import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { BarChart, Loader2, Filter, Trash2, Printer } from 'lucide-react';
import ReportHeader from '../../components/ReportHeader';
import { useAccounting } from '../../context/AccountingContext';

// تعريف نوع البيانات المتوقع من التقرير
type WastageReasonAnalysis = {
  reason: string;
  occurrence_count: number;
  total_wasted_quantity: number;
  total_wasted_cost: number;
};

const WastageAnalysisReport = () => {
  const { showToast } = useToast();
  const { settings } = useAccounting();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<WastageReasonAnalysis[]>([]);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // دالة لجلب بيانات التقرير
  const generateReport = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = user?.user_metadata?.org_id;

      if (!userOrgId) {
        showToast('تعذر تحديد المنظمة التابع لها. يرجى تسجيل الدخول مرة أخرى.', 'error');
        return;
      }

      const { data, error } = await supabase.rpc('analyze_wastage_reasons', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_org_id: userOrgId // تمرير معرف المنظمة لضمان فصل البيانات داخل الدالة
      });

      if (error) throw error;

      setReportData(data as WastageReasonAnalysis[]);
      if (!data || data.length === 0) {
        showToast('لا توجد بيانات هدر في الفترة المحددة.', 'info');
      }
    } catch (error: any) {
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
