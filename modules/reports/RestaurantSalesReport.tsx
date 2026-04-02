import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { BarChart3, Download, Printer, Loader2, Filter, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

type ReportItem = {
  item_name: string;
  category_name: string;
  quantity: number;
  total_sales: number;
};

const RestaurantSalesReport = () => {
  const { currentUser, settings } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportItem[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setReportData([
            { item_name: 'بيتزا سوبريم', category_name: 'بيتزا', quantity: 50, total_sales: 2500 },
            { item_name: 'برجر دجاج', category_name: 'سندوتشات', quantity: 30, total_sales: 1200 },
            { item_name: 'بيبسي', category_name: 'مشروبات', quantity: 100, total_sales: 500 },
        ]);
        setLoading(false);
        return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId) {
        showToast('لم يتم العثور على معرف المنظمة', 'error');
        return;
      }

      const { data, error } = await supabase.rpc('get_restaurant_sales_report', {
        p_org_id: userOrgId, // المعامل الجديد الضروري للعزل
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
        'الصنف': item.item_name,
        'القسم': item.category_name,
        'الكمية المباعة': item.quantity,
        'إجمالي المبيعات': item.total_sales
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Restaurant Sales");
    XLSX.writeFile(wb, `Restaurant_Sales_${startDate}_to_${endDate}.xlsx`);
  };

  const totalSales = reportData.reduce((sum, item) => sum + (Number(item.total_sales) || 0), 0);
  const totalQty = reportData.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="text-blue-600" /> تقرير مبيعات المطعم
            </h2>
            <p className="text-slate-500">تحليل مبيعات الأصناف والوجبات خلال فترة محددة</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={reportData.length === 0} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm disabled:opacity-50">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 no-print">
        <div className="flex flex-wrap items-end gap-4">
            <div className="w-full md:w-auto"><label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label><div className="relative"><Calendar className="absolute right-3 top-2.5 text-slate-400" size={18} /><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" /></div></div>
            <div className="w-full md:w-auto"><label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label><div className="relative"><Calendar className="absolute right-3 top-2.5 text-slate-400" size={18} /><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500" /></div></div>
            <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold shadow-md disabled:opacity-50 transition-all h-[42px]">{loading ? <Loader2 className="animate-spin" size={18} /> : <Filter size={18} />} تحديث</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <div className="hidden print:block"><ReportHeader title="تقرير مبيعات المطعم" subtitle={`الفترة من ${startDate} إلى ${endDate}`} /></div>
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200"><tr><th className="p-4 w-16 text-center">#</th><th className="p-4">الصنف</th><th className="p-4">القسم</th><th className="p-4 text-center">الكمية المباعة</th><th className="p-4 text-center">إجمالي المبيعات</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
                {reportData.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors"><td className="p-4 text-center font-bold text-slate-400">{index + 1}</td><td className="p-4 font-bold text-slate-800">{item.item_name}</td><td className="p-4 text-slate-500">{item.category_name}</td><td className="p-4 text-center font-bold text-blue-600">{(item.quantity || 0).toLocaleString()}</td><td className="p-4 text-center font-black text-emerald-600">{(item.total_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
                ))}
                {reportData.length === 0 && !loading && (<tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد مبيعات خلال هذه الفترة</td></tr>)}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-lg border-t border-slate-200"><tr><td colSpan={3} className="p-4 text-left text-slate-600">الإجمالي الكلي:</td><td className="p-4 text-center text-blue-700">{totalQty.toLocaleString()}</td><td className="p-4 text-center text-emerald-700">{totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })} {settings?.currency || 'SAR'}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
};
export default RestaurantSalesReport;