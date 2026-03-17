import React, { useState } from 'react';
import { FileSpreadsheet, Search, Download, TrendingUp, AlertCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import * as XLSX from 'xlsx';

const RestaurantSalesReport = () => {
    const { showToast } = useToast();
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportData, setReportData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchReport = async () => {
        setLoading(true);
        try {
            // تحديد بداية ونهاية اليوم لضمان دقة التقرير
            const start = `${startDate}T00:00:00`;
            const end = `${endDate}T23:59:59`;

            const { data, error } = await supabase.rpc('get_restaurant_sales_report', {
                p_start_date: start,
                p_end_date: end
            });

            if (error) throw error;
            setReportData(data || []);
            if (data && data.length === 0) showToast('لا توجد مبيعات في الفترة المحددة', 'info');
        } catch (error: any) {
            console.error('Error fetching report:', error);
            showToast('فشل جلب التقرير: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const exportToExcel = () => {
        if (reportData.length === 0) return;

        const ws = XLSX.utils.json_to_sheet(reportData.map(item => ({
            'الصنف': item.product_name,
            'التصنيف': item.category_name,
            'الكمية المباعة': item.quantity_sold,
            'إجمالي المبيعات': item.total_sales,
            'إجمالي التكلفة': item.total_cost,
            'مجمل الربح': item.gross_profit,
            'هامش الربح %': item.profit_margin_percent
        })));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "تقرير مبيعات المطعم");
        XLSX.writeFile(wb, `Restaurant_Sales_${startDate}_${endDate}.xlsx`);
    };

    // حساب الإجماليات لبطاقات الملخص
    const totals = reportData.reduce((acc, item) => ({
        sales: acc.sales + (item.total_sales || 0),
        cost: acc.cost + (item.total_cost || 0),
        profit: acc.profit + (item.gross_profit || 0)
    }), { sales: 0, cost: 0, profit: 0 });

    return (
        <div className="p-6 space-y-6 animate-in fade-in" dir="rtl">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="text-emerald-600" /> تقرير ربحية الأصناف
                    </h2>
                    <p className="text-slate-500 text-sm">تحليل أداء المبيعات، التكاليف، وهوامش الربح لكل صنف.</p>
                </div>
                
                <div className="flex items-end gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">من تاريخ</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-lg p-2 text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">إلى تاريخ</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-lg p-2 text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                    <button onClick={fetchReport} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 h-[38px] transition-colors">
                        {loading ? 'جاري التحميل...' : <><Search size={16} /> عرض</>}
                    </button>
                    <button onClick={exportToExcel} disabled={reportData.length === 0} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg font-bold hover:bg-emerald-100 flex items-center gap-2 h-[38px] disabled:opacity-50 transition-colors">
                        <Download size={16} /> تصدير
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {reportData.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-xl shadow-sm border-r-4 border-blue-500 flex flex-col justify-between">
                        <p className="text-slate-500 text-sm font-bold">إجمالي المبيعات</p>
                        <p className="text-3xl font-black text-slate-800 mt-2">{totals.sales.toLocaleString()} <span className="text-sm font-medium text-slate-400">SAR</span></p>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border-r-4 border-red-500 flex flex-col justify-between">
                        <p className="text-slate-500 text-sm font-bold">إجمالي التكلفة (COGS)</p>
                        <p className="text-3xl font-black text-slate-800 mt-2">{totals.cost.toLocaleString()} <span className="text-sm font-medium text-slate-400">SAR</span></p>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border-r-4 border-emerald-500 flex flex-col justify-between">
                        <p className="text-slate-500 text-sm font-bold">صافي الربح</p>
                        <div className="flex items-end gap-2 mt-2">
                            <p className="text-3xl font-black text-emerald-600">{totals.profit.toLocaleString()} <span className="text-sm font-medium text-slate-400">SAR</span></p>
                            <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full mb-1">
                                هامش {totals.sales > 0 ? ((totals.profit / totals.sales) * 100).toFixed(1) : 0}%
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Data Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-right">
                    <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-b border-slate-200">
                        <tr>
                            <th className="p-4 w-1/4">اسم الصنف</th>
                            <th className="p-4">التصنيف</th>
                            <th className="p-4 text-center">الكمية المباعة</th>
                            <th className="p-4">إيراد المبيعات</th>
                            <th className="p-4">التكلفة</th>
                            <th className="p-4">الربح</th>
                            <th className="p-4 text-center">النسبة %</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {reportData.map((item, idx) => (
                            <tr key={idx} className="hover:bg-blue-50 transition-colors text-sm group">
                                <td className="p-4 font-bold text-slate-800 group-hover:text-blue-700">{item.product_name}</td>
                                <td className="p-4 text-slate-500">{item.category_name}</td>
                                <td className="p-4 text-center font-mono font-bold bg-slate-50/50">{item.quantity_sold}</td>
                                <td className="p-4 font-mono font-bold">{item.total_sales.toLocaleString()}</td>
                                <td className="p-4 font-mono text-red-600">{item.total_cost.toLocaleString()}</td>
                                <td className="p-4 font-mono font-bold text-emerald-600">{item.gross_profit.toLocaleString()}</td>
                                <td className="p-4 text-center">
                                    <span className={`px-2 py-1 rounded-md text-xs font-bold inline-block min-w-[50px] ${item.profit_margin_percent >= 30 ? 'bg-emerald-100 text-emerald-700' : item.profit_margin_percent > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                        {item.profit_margin_percent}%
                                    </span>
                                </td>
                            </tr>
                        ))}
                        {reportData.length === 0 && (
                            <tr>
                                <td colSpan={7} className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                                    <FileSpreadsheet size={48} className="mb-2 opacity-20" />
                                    <p>{loading ? 'جاري تحليل البيانات...' : 'حدد الفترة واضغط "عرض" لاستخراج التقرير'}</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default RestaurantSalesReport;