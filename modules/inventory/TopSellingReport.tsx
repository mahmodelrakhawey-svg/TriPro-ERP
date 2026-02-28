import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { TrendingUp, Download, Printer, Loader2, Filter, Package } from 'lucide-react';
import * as XLSX from 'xlsx';

type TopProduct = {
  id: string;
  name: string;
  sku: string;
  totalQuantity: number;
  totalRevenue: number;
};

const TopSellingReport = () => {
  const { currentUser } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<TopProduct[]>([]);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [sortBy, setSortBy] = useState<'quantity' | 'revenue'>('revenue');

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, sortBy]);

  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setReportData([
            { id: 'dp1', name: 'لابتوب HP ProBook', sku: 'HP-PB-450', totalQuantity: 25, totalRevenue: 625000 },
            { id: 'dp2', name: 'طابعة ليزر Canon', sku: 'CN-LBP-6030', totalQuantity: 15, totalRevenue: 127500 },
            { id: 'dp3', name: 'ورق تصوير A4 (كرتونة)', sku: 'PPR-A4', totalQuantity: 150, totalRevenue: 127500 },
        ]);
        setLoading(false);
        return;
    }

    try {
      // 1. جلب بنود فواتير المبيعات خلال الفترة
      const { data: items, error } = await supabase
        .from('invoice_items')
        .select('quantity, total, product_id, products:product_id(name, sku), invoices!inner(invoice_date)')
        .gte('invoices.invoice_date', startDate)
        .lte('invoices.invoice_date', endDate);

      if (error) throw error;

      // 2. تجميع البيانات
      const productMap: Record<string, TopProduct> = {};

      items?.forEach((item: any) => {
        if (!item.product_id || !item.products) return;

        if (!productMap[item.product_id]) {
          productMap[item.product_id] = {
            id: item.product_id,
            name: item.products.name,
            sku: item.products.sku || '-',
            totalQuantity: 0,
            totalRevenue: 0
          };
        }

        productMap[item.product_id].totalQuantity += Number(item.quantity);
        productMap[item.product_id].totalRevenue += Number(item.total);
      });

      // 3. تحويل إلى مصفوفة وترتيبها
      const sortedData = Object.values(productMap).sort((a, b) => {
        if (sortBy === 'quantity') {
          return b.totalQuantity - a.totalQuantity;
        } else {
          return b.totalRevenue - a.totalRevenue;
        }
      });

      setReportData(sortedData);

    } catch (error: any) {
      console.error('Error fetching top selling products:', error);
      showToast('حدث خطأ أثناء جلب البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const data = reportData.map(p => ({
        'اسم الصنف': p.name,
        'الكود (SKU)': p.sku,
        'الكمية المباعة': p.totalQuantity,
        'إجمالي الإيراد': p.totalRevenue
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Top Selling");
    XLSX.writeFile(wb, `Top_Selling_Products_${startDate}_to_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="text-emerald-600" /> تقرير الأصناف الأكثر مبيعاً
            </h2>
            <p className="text-slate-500">تحليل أداء المنتجات وتحديد الأكثر طلباً وربحية</p>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                />
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                />
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">ترتيب حسب</label>
                <select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value as 'quantity' | 'revenue')}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 bg-white"
                >
                    <option value="revenue">إجمالي الإيراد (القيمة)</option>
                    <option value="quantity">الكمية المباعة (العدد)</option>
                </select>
            </div>
        </div>
        <div className="mt-4 flex justify-end">
            <button 
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-2.5 rounded-lg hover:bg-emerald-700 font-bold shadow-md disabled:opacity-50 transition-all"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />}
                تحديث التقرير
            </button>
        </div>
      </div>

      {/* ترويسة الطباعة */}
      <div className="hidden print:block text-center mb-8 border-b-2 border-slate-800 pb-4">
          <h1 className="text-3xl font-bold mb-2">تقرير الأصناف الأكثر مبيعاً</h1>
          <p className="text-sm text-slate-500 mt-2">عن الفترة من {startDate} إلى {endDate}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                    <th className="p-4 w-16 text-center">#</th>
                    <th className="p-4">اسم الصنف</th>
                    <th className="p-4">الكود (SKU)</th>
                    <th className="p-4 text-center">الكمية المباعة</th>
                    <th className="p-4 text-center">إجمالي الإيراد</th>
                    <th className="p-4 text-center">النسبة</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {reportData.map((product, index) => {
                    const totalRevenueAll = reportData.reduce((sum, p) => sum + p.totalRevenue, 0);
                    const percentage = totalRevenueAll > 0 ? (product.totalRevenue / totalRevenueAll) * 100 : 0;
                    
                    return (
                        <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-center font-bold text-slate-400">{index + 1}</td>
                            <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                                <Package size={16} className="text-slate-400" />
                                {product.name}
                            </td>
                            <td className="p-4 font-mono text-slate-500">{product.sku}</td>
                            <td className="p-4 text-center font-bold text-blue-600 bg-blue-50/30">
                                {product.totalQuantity.toLocaleString()}
                            </td>
                            <td className="p-4 text-center font-black text-emerald-600 bg-emerald-50/30">
                                {product.totalRevenue.toLocaleString()}
                            </td>
                            <td className="p-4 text-center w-32">
                                <div className="flex items-center gap-2 justify-center">
                                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${percentage}%` }}></div>
                                    </div>
                                    <span className="text-xs text-slate-500">{percentage.toFixed(1)}%</span>
                                </div>
                            </td>
                        </tr>
                    );
                })}

                {reportData.length === 0 && !loading && (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد مبيعات خلال هذه الفترة</td></tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default TopSellingReport;
