import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { FileBarChart, Calendar, DollarSign, Users, Loader2, ArrowRight, Download, TrendingUp } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ProjectLaborSummary {
  project_id: string;
  project_name: string;
  total_labor_cost: number;
  total_hours: number;
  worker_count: number;
}

const LaborCostReport = () => {
  const { organization } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ProjectLaborSummary[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  useEffect(() => {
    if (organization?.id) fetchReport();
  }, [selectedMonth, organization?.id]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

      // جلب سجلات الحضور المعتمدة للفترة المحددة
      const { data, error } = await supabase
        .from('v_project_site_attendance')
        .select('project_id, project_name, total_day_cost, hours_worked, employee_id')
        .eq('organization_id', organization?.id)
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate)
        .eq('status', 'approved');

      if (error) throw error;

      // تجميع البيانات يدوياً لضمان الدقة وتجنب استعلامات SQL المعقدة
      const summaryMap: Record<string, ProjectLaborSummary> = {};
      const projectWorkers: Record<string, Set<string>> = {};

      (data || []).forEach(row => {
        if (!summaryMap[row.project_id]) {
          summaryMap[row.project_id] = {
            project_id: row.project_id,
            project_name: row.project_name,
            total_labor_cost: 0,
            total_hours: 0,
            worker_count: 0
          };
          projectWorkers[row.project_id] = new Set();
        }
        summaryMap[row.project_id].total_labor_cost += Number(row.total_day_cost);
        summaryMap[row.project_id].total_hours += Number(row.hours_worked);
        projectWorkers[row.project_id].add(row.employee_id);
      });

      const finalData = Object.values(summaryMap).map(item => ({
        ...item,
        worker_count: projectWorkers[item.project_id].size
      }));

      setReportData(finalData);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const data = reportData.map(r => ({
      'اسم المشروع': r.project_name,
      'إجمالي تكلفة العمالة': r.total_labor_cost,
      'إجمالي الساعات المنفذة': r.total_hours,
      'عدد العمال المشاركين': r.worker_count
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تكاليف العمالة");
    XLSX.writeFile(wb, `Labor_Cost_Report_${selectedMonth}.xlsx`);
  };

  const totalMonthlyCost = reportData.reduce((sum, item) => sum + item.total_labor_cost, 0);

  return (
    <div className="p-6 bg-slate-50 min-h-screen rtl text-right animate-in fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <FileBarChart className="text-indigo-600" /> تقارير حضور الموقع وتكاليف العمالة
          </h1>
          <p className="text-slate-500 font-medium">تحليل مالي للعمالة المباشرة وتأثيرها على ميزانيات المشاريع</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white border-2 border-indigo-100 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
            <Calendar size={18} className="text-indigo-500" />
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="outline-none font-bold text-slate-700 bg-transparent" />
          </div>
          <button onClick={exportToExcel} className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
            <Download size={18} /> تصدير Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><DollarSign size={24} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">إجمالي تكلفة العمالة</p>
            <h3 className="text-2xl font-black text-slate-800">{totalMonthlyCost.toLocaleString()} ج.م</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><Users size={24} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">إجمالي القوى العاملة</p>
            <h3 className="text-2xl font-black text-slate-800">{reportData.reduce((sum, i) => sum + i.worker_count, 0)} عامل</h3>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-5 text-slate-500 font-black text-sm">المشروع</th>
              <th className="p-5 text-slate-500 font-black text-sm text-center">إجمالي التكلفة</th>
              <th className="p-5 text-slate-500 font-black text-sm text-center">ساعات العمل</th>
              <th className="p-5 text-slate-500 font-black text-sm text-center">عدد العمال</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={4} className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-500" size={32} /></td></tr>
            ) : reportData.length === 0 ? (
              <tr><td colSpan={4} className="p-20 text-center text-slate-400 font-bold">لا توجد بيانات حضور معتمدة لهذا الشهر</td></tr>
            ) : reportData.map((item) => (
              <tr key={item.project_id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="p-5 font-black text-slate-700">{item.project_name}</td>
                <td className="p-5 text-center font-black text-indigo-600 text-lg">{item.total_labor_cost.toLocaleString()} ج.م</td>
                <td className="p-5 text-center font-bold text-slate-500">{item.total_hours} س</td>
                <td className="p-5 text-center">
                  <span className="bg-blue-50 text-blue-600 px-4 py-1 rounded-full text-xs font-black">{item.worker_count}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LaborCostReport;