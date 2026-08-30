import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { BarChart2, Search, Download, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import * as XLSX from 'xlsx';

const ItemSalesAnalysis = () => {
  const { currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const { showToast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'profit' | 'revenue' | 'quantity'>('profit');

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  const fetchData = async () => {
    if (startDate > endDate) {
        showToast('تاريخ البداية يجب أن يكون قبل تاريخ النهاية', 'warning');
        return;
    }
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setItems([
            { id: 'dp1', name: 'لابتوب HP ProBook', sku: 'HP-PB-450', quantity: 25, revenue: 625000, cost: 525000, profit: 100000, margin: 16 },
            { id: 'dp2', name: 'طابعة ليزر Canon', sku: 'CN-LBP-6030', quantity: 15, revenue: 127500, cost: 90000, profit: 37500, margin: 29.4 },
            { id: 'dp3', name: 'ماوس لاسلكي Logitech', sku: 'LOG-M170', quantity: 50, revenue: 17500, cost: 10000, profit: 7500, margin: 42.8 },
        ]);
        setLoading(false);
        return;
    }

    try {
      // تحسين: استخدام getSession لسرعة الأداء وتجنب مكالمات الشبكة الزائدة
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId) return;

      // 1. جلب بنود الفواتير (غير المسودة) مع تفاصيل المنتج
      const { data: invItems, error: invError } = await supabase
        .from('invoice_items')
        .select(`
          quantity,
          total,
          cost,
          product_id,
          products (name, sku, purchase_price, weighted_average_cost),
          invoices!inner (invoice_date, status, invoice_number)
        `)
        .eq('invoices.organization_id', userOrgId) // 🔒 فلترة المبيعات حسب المنظمة
        .gte('invoices.invoice_date', startDate)
        .lte('invoices.invoice_date', endDate)
        .neq('invoices.status', 'draft');

      if (invError) console.error('Error fetching invoice items:', invError);

      // 2. جلب مبيعات نقاط البيع والكاشير والتجزئة والهايبر ماركت والمطاعم (POS Orders)
      const { data: posItems, error: posError } = await supabase
        .from('order_items')
        .select(`
          quantity,
          total_price,
          unit_cost,
          product_id,
          products (name, sku, purchase_price, weighted_average_cost),
          orders!inner (created_at, status)
        `)
        .eq('orders.organization_id', userOrgId)
        .in('orders.status', ['COMPLETED', 'PAID'])
        .gte('orders.created_at', `${startDate}T00:00:00`)
        .lte('orders.created_at', `${endDate}T23:59:59`);

      if (posError) console.error('Error fetching POS order items:', posError);

      // 3. جلب مبيعات وصرف الصيدليات والعيادات (إن وجدت)
      let himsItems: any[] = [];
      try {
        const { data: himsData } = await supabase
          .from('hims_billing_items')
          .select('quantity, total_price, product_id, products(name, sku, purchase_price, weighted_average_cost), hims_billing!inner(created_at, organization_id)')
          .eq('hims_billing.organization_id', userOrgId)
          .not('product_id', 'is', null)
          .gte('hims_billing.created_at', `${startDate}T00:00:00`)
          .lte('hims_billing.created_at', `${endDate}T23:59:59`);
        if (himsData) himsItems = himsData;
      } catch (himsErr) {
        // Safe ignore if hims module not installed
      }

      // تجميع البيانات من جميع القنوات حسب الصنف
      const productStats: Record<string, any> = {};

      const processItem = (pid: string, prodInfo: any, qty: number, revenue: number, unitCost: number) => {
        if (!pid) return;
        if (!productStats[pid]) {
          productStats[pid] = {
            id: pid,
            name: prodInfo?.name || 'صنف غير محدد',
            sku: prodInfo?.sku || '-',
            quantity: 0,
            revenue: 0,
            cost: 0
          };
        }

        const validQty = Number(qty) || 0;
        const validRev = Number(revenue) || 0;
        const fallbackCost = Number(unitCost || prodInfo?.weighted_average_cost || prodInfo?.purchase_price || 0);
        const validCost = fallbackCost * validQty;

        productStats[pid].quantity += validQty;
        productStats[pid].revenue += validRev;
        productStats[pid].cost += validCost;
      };

      // معالجة فواتير المبيعات
      invItems?.forEach((item: any) => {
        processItem(item.product_id, item.products, item.quantity, item.total, item.cost);
      });

      // معالجة مبيعات الكاشير والهايبر ماركت
      posItems?.forEach((item: any) => {
        processItem(item.product_id, item.products, item.quantity, item.total_price, item.unit_cost);
      });

      // معالجة مبيعات الصيدلية والخدمات الطبية
      himsItems?.forEach((item: any) => {
        processItem(item.product_id, item.products, item.quantity, item.total_price, item.products?.weighted_average_cost);
      });

      let reportData = Object.values(productStats).map(p => ({
        ...p,
        profit: p.revenue - p.cost,
        margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0
      }));

      // الترتيب حسب الخيار المحدد
      reportData.sort((a, b) => b[sortBy] - a[sortBy]);

      setItems(reportData);

    } catch (error) {
      console.error('Error fetching sales analysis:', error);
      showToast('حدث خطأ أثناء جلب البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, sortBy]);

  const filteredItems = useMemo(() => {
    return items.filter(i => 
      i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      i.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  const exportToExcel = () => {
    const data = filteredItems.map(i => ({
      'الصنف': i.name,
      'الكود': i.sku,
      'الكمية المباعة': i.quantity,
      'إجمالي المبيعات': i.revenue,
      'إجمالي التكلفة': i.cost,
      'الربح': i.profit,
      'هامش الربح %': `${i.margin.toFixed(2)}%`
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تحليل المبيعات");
    XLSX.writeFile(wb, "ItemSalesAnalysis.xlsx");
  };

  const totalRevenue = items.reduce((sum, i) => sum + i.revenue, 0);
  const totalProfit = items.reduce((sum, i) => sum + i.profit, 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <BarChart2 className="text-blue-600" /> تحليل مبيعات الأصناف والربحية
            </h2>
            <p className="text-slate-500 text-sm">تقرير تفصيلي للأصناف الأكثر ربحية ومبيعاً</p>
        </div>
        <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
            <Download size={18} /> تصدير Excel
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 no-print">
          <div className="w-full md:w-auto">
              <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div className="w-full md:w-auto">
              <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div className="w-full md:w-auto min-w-[200px]">
              <label className="block text-sm font-bold text-slate-700 mb-1">بحث</label>
              <div className="relative">
                  <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث باسم الصنف..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
              </div>
          </div>
          <div className="w-full md:w-auto">
              <label className="block text-sm font-bold text-slate-700 mb-1">ترتيب حسب</label>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full border rounded-lg p-2 bg-white"
              >
                  <option value="profit">الأعلى ربحية</option>
                  <option value="revenue">الأعلى مبيعاً (قيمة)</option>
                  <option value="quantity">الأكثر مبيعاً (كمية)</option>
              </select>
          </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500 font-bold">إجمالي المبيعات</p>
              <p className="text-2xl font-black text-blue-600">{totalRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500 font-bold">إجمالي الأرباح</p>
              <p className="text-2xl font-black text-emerald-600">{totalProfit.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm text-slate-500 font-bold">متوسط هامش الربح</p>
              <p className={`text-2xl font-black ${avgMargin >= 20 ? 'text-emerald-600' : avgMargin > 0 ? 'text-blue-600' : 'text-red-600'}`}>{avgMargin.toFixed(1)}%</p>
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-700 font-bold text-sm">
                <tr>
                    <th className="p-4">الصنف</th>
                    <th className="p-4 text-center">الكمية المباعة</th>
                    <th className="p-4 text-center">إجمالي المبيعات</th>
                    <th className="p-4 text-center">إجمالي التكلفة</th>
                    <th className="p-4 text-center text-emerald-700">الربح</th>
                    <th className="p-4 text-center">الهامش %</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr>
                ) : filteredItems.length > 0 ? (
                    filteredItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-4 font-bold text-slate-800">
                                {item.name}
                                <span className="block text-xs text-slate-400 font-normal">{item.sku}</span>
                            </td>
                            <td className="p-4 text-center font-bold">{item.quantity}</td>
                            <td className="p-4 text-center">{item.revenue.toLocaleString()}</td>
                            <td className="p-4 text-center text-slate-500">{item.cost.toLocaleString()}</td>
                            <td className="p-4 text-center font-black text-emerald-600 bg-emerald-50/30">{item.profit.toLocaleString()}</td>
                            <td className="p-4 text-center">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${item.margin > 20 ? 'bg-emerald-100 text-emerald-700' : item.margin > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                    {item.margin.toFixed(1)}% 
                                    {item.margin > 20 && <ArrowUpRight size={12} className="inline ml-1" />}
                                    {item.margin < 0 && <ArrowDownRight size={12} className="inline ml-1" />}
                                </span>
                            </td>
                        </tr>
                    ))
                ) : (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد مبيعات في هذه الفترة</td></tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default ItemSalesAnalysis;
