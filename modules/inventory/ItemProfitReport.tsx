import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { Download, Printer, Loader2, Filter, DollarSign } from 'lucide-react';
import * as XLSX from 'xlsx';

type ItemProfit = {
  id: string;
  name: string;
  sku: string;
  quantitySold: number;
  avgSellingPrice: number;
  currentCost: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  margin: number;
};

const ItemProfitReport = () => {
  const { currentUser } = useAccounting();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ItemProfit[]>([]);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [showLossOnly, setShowLossOnly] = useState(false);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setReportData([
            { id: 'dp1', name: 'لابتوب HP ProBook', sku: 'HP-PB-450', quantitySold: 25, avgSellingPrice: 25000, currentCost: 21000, totalRevenue: 625000, totalCost: 525000, grossProfit: 100000, margin: 16 },
            { id: 'dp2', name: 'طابعة ليزر Canon', sku: 'CN-LBP-6030', quantitySold: 15, avgSellingPrice: 8500, currentCost: 6000, totalRevenue: 127500, totalCost: 90000, grossProfit: 37500, margin: 29.4 },
            { id: 'dp3', name: 'ماوس لاسلكي Logitech', sku: 'LOG-M170', quantitySold: 50, avgSellingPrice: 350, currentCost: 200, totalRevenue: 17500, totalCost: 10000, grossProfit: 7500, margin: 42.8 },
        ]);
        setLoading(false);
        return;
    }

    try {
      // 1. جلب بنود فواتير المبيعات خلال الفترة مع بيانات المنتج (بما في ذلك التكلفة)
      const { data: items, error } = await supabase
        .from('invoice_items')
        .select('quantity, total, cost, product_id, products(name, sku, purchase_price), invoices!inner(invoice_date)')
        .gte('invoices.invoice_date', startDate)
        .lte('invoices.invoice_date', endDate);

      if (error) throw error;

      // 2. تجميع البيانات
      const productMap: Record<string, ItemProfit> = {};

      items?.forEach((item: any) => {
        if (!item.product_id || !item.products) return;

        if (!productMap[item.product_id]) {
          productMap[item.product_id] = {
            id: item.product_id,
            name: item.products.name,
            sku: item.products.sku || '-',
            quantitySold: 0,
            avgSellingPrice: 0,
            currentCost: Number(item.cost || item.products.purchase_price || 0), // نستخدم التكلفة التاريخية أو الحالية كبديل
            totalRevenue: 0,
            totalCost: 0,
            grossProfit: 0,
            margin: 0
          };
        }

        const qty = Number(item.quantity);
        const revenue = Number(item.total);
        
        productMap[item.product_id].quantitySold += qty;
        productMap[item.product_id].totalRevenue += revenue;
      });

      // 3. حساب الأرباح والهوامش
      const processedData = Object.values(productMap).map(p => {
          const totalCost = p.quantitySold * p.currentCost;
          const grossProfit = p.totalRevenue - totalCost;
          const margin = p.totalRevenue > 0 ? (grossProfit / p.totalRevenue) * 100 : 0;
          const avgSellingPrice = p.quantitySold > 0 ? p.totalRevenue / p.quantitySold : 0;

          return {
              ...p,
              totalCost,
              grossProfit,
              margin,
              avgSellingPrice
          };
      }).sort((a, b) => b.grossProfit - a.grossProfit); // ترتيب حسب الأعلى ربحية

      setReportData(processedData);

    } catch (error: any) {
      console.error('Error fetching item profits:', error);
      alert('حدث خطأ أثناء جلب البيانات: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const displayedData = reportData.filter(item => showLossOnly ? item.margin < 0 : true);

  const handleExportExcel = () => {
    const data = displayedData.map(p => ({
        'اسم الصنف': p.name,
        'الكود (SKU)': p.sku,
        'الكمية المباعة': p.quantitySold,
        'متوسط سعر البيع': p.avgSellingPrice,
        'التكلفة الحالية': p.currentCost,
        'إجمالي الإيراد': p.totalRevenue,
        'إجمالي التكلفة': p.totalCost,
        'مجمل الربح': p.grossProfit,
        'هامش الربح %': `${p.margin.toFixed(2)}%`
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Profits");
    XLSX.writeFile(wb, `Item_Profits_${startDate}_to_${endDate}.xlsx`);
  };

  const totalRevenueAll = displayedData.reduce((sum, p) => sum + p.totalRevenue, 0);
  const totalCostAll = displayedData.reduce((sum, p) => sum + p.totalCost, 0);
  const totalProfitAll = totalRevenueAll - totalCostAll;

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <DollarSign className="text-emerald-600" /> تقرير أرباح الأصناف
            </h2>
            <p className="text-slate-500">تحليل الربحية والهوامش لكل صنف بناءً على التكلفة الحالية</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={displayedData.length === 0} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm disabled:opacity-50">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 no-print">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
            <div className="pb-2">
                <label className={`flex items-center gap-2 cursor-pointer px-3 py-2.5 rounded-lg border transition-all ${showLossOnly ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                    <input 
                        type="checkbox" 
                        checked={showLossOnly} 
                        onChange={(e) => setShowLossOnly(e.target.checked)} 
                        className="w-4 h-4 text-red-600 rounded focus:ring-red-500 border-gray-300"
                    />
                    <span className={`text-sm font-bold ${showLossOnly ? 'text-red-700' : 'text-slate-600'}`}>عرض الخسائر فقط</span>
                </label>
            </div>
            <div className="flex justify-end">
                <button 
                    onClick={fetchData}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-2.5 rounded-lg hover:bg-emerald-700 font-bold shadow-md disabled:opacity-50 transition-all"
                >
                    {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />}
                    تحديث التقرير
                </button>
            </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-bold text-slate-500 mb-1">إجمالي الإيرادات</p>
              <h3 className="text-2xl font-black text-blue-600">{totalRevenueAll.toLocaleString()}</h3>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-bold text-slate-500 mb-1">إجمالي التكلفة التقديرية</p>
              <h3 className="text-2xl font-black text-red-600">{totalCostAll.toLocaleString()}</h3>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-bold text-slate-500 mb-1">مجمل الربح</p>
              <h3 className="text-2xl font-black text-emerald-600">{totalProfitAll.toLocaleString()}</h3>
          </div>
      </div>

      {/* Report Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                    <th className="p-4">الصنف</th>
                    <th className="p-4 text-center">الكمية</th>
                    <th className="p-4 text-center">متوسط البيع</th>
                    <th className="p-4 text-center">إجمالي التكلفة</th>
                    <th className="p-4 text-center">الإيراد</th>
                    <th className="p-4 text-center">الربح</th>
                    <th className="p-4 text-center">الهامش %</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {displayedData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-800">
                            {item.name}
                            <span className="block text-xs text-slate-400 font-normal">{item.sku}</span>
                        </td>
                        <td className="p-4 text-center font-bold">{item.quantitySold.toLocaleString()}</td>
                        <td className="p-4 text-center">{item.avgSellingPrice.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                        <td className="p-4 text-center text-slate-500">{item.totalCost.toLocaleString()}</td>
                        <td className="p-4 text-center font-bold text-blue-600">{item.totalRevenue.toLocaleString()}</td>
                        <td className="p-4 text-center font-black text-emerald-600">{item.grossProfit.toLocaleString()}</td>
                        <td className="p-4 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${item.margin >= 20 ? 'bg-emerald-100 text-emerald-700' : item.margin > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                {item.margin.toFixed(1)}%
                            </span>
                        </td>
                    </tr>
                ))}
                {displayedData.length === 0 && !loading && (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد مبيعات خلال هذه الفترة</td></tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default ItemProfitReport;
