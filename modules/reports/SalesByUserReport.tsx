
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { UserCheck, Download, Printer, Loader2, Filter, Calendar, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

type ReportItem = {
  user_id: string;
  user_name: string;
  total_orders: number;
  total_sales: number;
};

const SalesByUserReport = () => {
  const { currentUser, settings } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportItem[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    setLoading(true);
    
    // إذا كان المستخدم "ديمو" نعرض بيانات وهمية للتجربة
    if (currentUser?.role === 'demo') {
        setReportData([
            { user_id: '1', user_name: 'أحمد محمد (كاشير 1)', total_orders: 45, total_sales: 4500.50 },
            { user_id: '2', user_name: 'سارة علي (كاشير 2)', total_orders: 38, total_sales: 3200.75 },
            { user_id: '3', user_name: 'محمود حسن (كاشير 3)', total_orders: 12, total_sales: 1200.00 },
        ]);
setLoading(false);
return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) {
        showToast('لم يتم العثور على معرف المنظمة', 'error');        return;
      }

      // هنا نقوم باستدعاء الدالة البرمجية التي تحل مشكلة الربط بين الجداول
      const { data, error } = await supabase.rpc('get_sales_by_user_report', {
        p_org_id: userOrgId,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;
      setReportData(data || []);
    } catch (error: any) {
      console.error('Error fetching report:', error);
      showToast('حدث خطأ أثناء جلب البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const handleExportExcel = () => {
    const data = reportData.map(item => ({
        'اسم المستخدم / الكاشير': item.user_name,
        'عدد الطلبات': item.total_orders,
        'إجمالي المبيعات': item.total_sales
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales By User");
    XLSX.writeFile(wb, `Sales_By_User_${startDate}_to_${endDate}.xlsx`);
  };

  const totalSales = reportData.reduce((sum, item) => sum + (Number(item.total_sales) || 0), 0);
  const totalOrders = reportData.reduce((sum, item) => sum + (Number(item.total_orders) || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Users className="text-blue-600" /> تقرير مبيعات الكاشير
            </h2>
            <p className="text-slate-500">تحليل المبيعات حسب المستخدمين خلال فترة محددة</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={reportData.length === 0} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm disabled:opacity-50 transition-all">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm transition-all">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 no-print">
        <div className="flex flex-wrap items-end gap-4">
            <div className="w-full md:w-auto">
                <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
                <div className="relative">
                    <Calendar className="absolute right-3 top-2.5 text-slate-400" size={18} />
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" />
                </div>
            </div>
            <div className="w-full md:w-auto">
                <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
                <div className="relative">
                    <Calendar className="absolute right-3 top-2.5 text-slate-400" size={18} />
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" />
                </div>
            </div>
            <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold shadow-md disabled:opacity-50 transition-all h-[42px]">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Filter size={18} />} تحديث
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <div className="hidden print:block"><ReportHeader title="تقرير مبيعات المستخدمين" subtitle={`الفترة من ${startDate} إلى ${endDate}`} /></div>
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-4 w-16 text-center">#</th><th className="p-4">اسم المستخدم / الكاشير</th><th className="p-4 text-center">عدد الطلبات</th><th className="p-4 text-center">إجمالي المبيعات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {reportData.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-center font-bold text-slate-400">{index + 1}</td>
                        <td className="p-4 font-bold text-slate-800">{item.user_name}</td>
                        <td className="p-4 text-center font-bold text-blue-600">{(item.total_orders || 0).toLocaleString()}</td>
                        <td className="p-4 text-center font-black text-emerald-600">{(item.total_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                ))}
                {reportData.length === 0 && !loading && (<tr><td colSpan={4} className="p-8 text-center text-slate-400 font-bold">لا توجد عمليات بيع مسجلة لهذا المستخدم خلال الفترة</td></tr>)}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-lg border-t border-slate-200">
                <tr><td colSpan={2} className="p-4 text-left text-slate-600">الإجمالي الكلي:</td><td className="p-4 text-center text-blue-700">{totalOrders.toLocaleString()}</td><td className="p-4 text-center text-emerald-700">{totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })} {settings?.currency || 'SAR'}</td></tr>
            </tfoot>
        </table>
      </div>
    </div>
  );
};
export default SalesByUserReport;
