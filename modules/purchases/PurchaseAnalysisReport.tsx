import { logger } from '../../utils/logger';
import { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { BarChart2, Download, Printer, Loader2, Filter, Truck, Package, TrendingUp, TrendingDown, Minus, ArrowUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

type SupplierAnalysis = {
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  orderCount: number;
};

type ItemAnalysis = {
  productId: string;
  productName: string;
  productSku: string;
  totalQuantity: number;
  totalAmount: number;
};

// ===== نوع بيانات تقرير مقارنة آخر سعرين شراء =====
type PriceComparisonRow = {
  productId: string;
  productName: string;
  productSku: string;
  // آخر عملية شراء
  lastPrice: number;
  lastDate: string;
  lastSupplier: string;
  lastQty: number;
  lastInvoice: string;
  // ما قبل الأخيرة
  prevPrice: number;
  prevDate: string;
  prevSupplier: string;
  prevQty: number;
  prevInvoice: string;
  // المقارنة
  diff: number;        // الفرق المطلق
  diffPct: number;     // نسبة التغيير %
};

export default function PurchaseAnalysisReport() {
  const { currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [activeTab, setActiveTab] = useState<'analysis' | 'price_compare'>('analysis');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'diff' | 'diffPct'>('diffPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [bySupplier, setBySupplier] = useState<SupplierAnalysis[]>([]);
  const [byItem, setByItem] = useState<ItemAnalysis[]>([]);
  const [priceComparison, setPriceComparison] = useState<PriceComparisonRow[]>([]);

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const fetchReport = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
      setBySupplier([
        { supplierId: 'd1', supplierName: 'شركة التوريدات العالمية', totalAmount: 150000, orderCount: 12 },
        { supplierId: 'd2', supplierName: 'مصنع الجودة', totalAmount: 85000, orderCount: 5 }
      ]);
      setByItem([
        { productId: 'p1', productName: 'لابتوب HP', productSku: 'HP-001', totalQuantity: 10, totalAmount: 250000 },
        { productId: 'p2', productName: 'طابعة Canon', productSku: 'CN-002', totalQuantity: 5, totalAmount: 42500 }
      ]);
      setPriceComparison([
        {
          productId: 'p1', productName: 'لابتوب HP', productSku: 'HP-001',
          lastPrice: 26500, lastDate: '2026-09-15', lastSupplier: 'شركة التوريدات العالمية', lastQty: 2, lastInvoice: 'PINV-045',
          prevPrice: 25000, prevDate: '2026-07-10', prevSupplier: 'شركة التوريدات العالمية', prevQty: 3, prevInvoice: 'PINV-030',
          diff: 1500, diffPct: 6.0
        },
        {
          productId: 'p2', productName: 'طابعة Canon', productSku: 'CN-002',
          lastPrice: 8200, lastDate: '2026-09-20', lastSupplier: 'مصنع الجودة', lastQty: 1, lastInvoice: 'PINV-047',
          prevPrice: 8500, prevDate: '2026-06-05', prevSupplier: 'مصنع الجودة', prevQty: 2, prevInvoice: 'PINV-022',
          diff: -300, diffPct: -3.53
        },
        {
          productId: 'p3', productName: 'شاشة Dell 24"', productSku: 'DL-024',
          lastPrice: 5800, lastDate: '2026-10-01', lastSupplier: 'مصنع الجودة', lastQty: 4, lastInvoice: 'PINV-050',
          prevPrice: 5800, prevDate: '2026-08-15', prevSupplier: 'شركة التوريدات العالمية', prevQty: 4, prevInvoice: 'PINV-038',
          diff: 0, diffPct: 0
        }
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = user?.user_metadata?.org_id;

      if (!userOrgId) return;

      // ===================== تحليل المشتريات (التبويب الأول) =====================
      const { data, error } = await supabase
        .from('purchase_invoice_items')
        .select(`
          quantity,
          unit_price,
          purchase_invoices!purchase_invoice_items_purchase_invoice_id_fkey!inner (
            id,
            invoice_date,
            status,
            supplier_id,
            organization_id,
            suppliers (name)
          ),
          products:product_id (id, name, sku)
        `)
        .eq('purchase_invoices.organization_id', userOrgId)
        .gte('purchase_invoices.invoice_date', startDate)
        .lte('purchase_invoices.invoice_date', endDate)
        .in('purchase_invoices.status', ['posted', 'paid']);

      if (error) throw error;

      const supplierMap: Record<string, SupplierAnalysis> = {};
      const itemMap: Record<string, ItemAnalysis> = {};
      const processedOrders = new Set<string>();

      data?.forEach((item: Record<string, any>) => {
        if (!item.purchase_invoices || !item.products) return;

        const supplierId = item.purchase_invoices.supplier_id;
        const supplierName = item.purchase_invoices.suppliers?.name || 'مورد غير محدد';
        const productId = item.products.id;
        const productName = item.products.name;
        const productSku = item.products.sku || '-';
        const amount = item.quantity * item.unit_price;

        if (!supplierMap[supplierId]) {
          supplierMap[supplierId] = { supplierId, supplierName, totalAmount: 0, orderCount: 0 };
        }
        supplierMap[supplierId].totalAmount += amount;
        if (!processedOrders.has(item.purchase_invoices.id)) {
          supplierMap[supplierId].orderCount++;
          processedOrders.add(item.purchase_invoices.id);
        }

        if (!itemMap[productId]) {
          itemMap[productId] = { productId, productName, productSku, totalQuantity: 0, totalAmount: 0 };
        }
        itemMap[productId].totalQuantity += item.quantity;
        itemMap[productId].totalAmount += amount;
      });

      setBySupplier(Object.values(supplierMap).sort((a, b) => b.totalAmount - a.totalAmount));
      setByItem(Object.values(itemMap).sort((a, b) => b.totalAmount - a.totalAmount));

      // ===================== مقارنة آخر سعرين شراء (التبويب الثاني) =====================
      // نجلب جميع بنود المشتريات المرحّلة بدون فلتر تاريخ لأننا نريد آخر عمليتي شراء لكل صنف
      const { data: allItems, error: allErr } = await supabase
        .from('purchase_invoice_items')
        .select(`
          id,
          quantity,
          unit_price,
          product_id,
          purchase_invoice_id,
          purchase_invoices!purchase_invoice_items_purchase_invoice_id_fkey!inner (
            id,
            invoice_number,
            invoice_date,
            status,
            organization_id,
            suppliers (name)
          ),
          products:product_id (id, name, sku)
        `)
        .eq('purchase_invoices.organization_id', userOrgId)
        .in('purchase_invoices.status', ['posted', 'paid'])
        .order('purchase_invoices(invoice_date)', { ascending: false });

      if (allErr) throw allErr;

      // تجميع: لكل صنف نحتفظ بآخر عمليتي شراء (حسب تاريخ الفاتورة تنازلياً)
      const productPurchasesMap: Record<string, Array<{
        price: number; date: string; supplier: string; qty: number; invoice: string;
      }>> = {};

      (allItems || []).forEach((item: Record<string, any>) => {
        if (!item.products || !item.purchase_invoices) return;
        const pid = item.product_id;
        if (!productPurchasesMap[pid]) productPurchasesMap[pid] = [];
        // نكتفي بآخر سعرين فقط لكل صنف
        if (productPurchasesMap[pid].length < 2) {
          productPurchasesMap[pid].push({
            price: Number(item.unit_price || 0),
            date: item.purchase_invoices.invoice_date || '',
            supplier: item.purchase_invoices.suppliers?.name || 'غير محدد',
            qty: Number(item.quantity || 0),
            invoice: item.purchase_invoices.invoice_number || '-',
          });
        }
      });

      // بناء صفوف المقارنة (فقط الأصناف التي لها عمليتا شراء على الأقل)
      const rows: PriceComparisonRow[] = [];
      Object.entries(productPurchasesMap).forEach(([pid, purchases]) => {
        // نحتاج على الأقل عمليتين
        if (purchases.length < 2) return;

        // ابحث عن بيانات الصنف
        const anyItem = (allItems || []).find((i: Record<string, unknown>) => i.product_id === pid) as Record<string, any> | undefined;
        if (!anyItem?.products) return;

        const prod = Array.isArray(anyItem.products) ? anyItem.products[0] : anyItem.products;
        if (!prod) return;

        const [last, prev] = purchases; // مرتّبان تنازلياً (الأحدث أولاً)
        const diff = last.price - prev.price;
        const diffPct = prev.price !== 0 ? (diff / prev.price) * 100 : 0;

        rows.push({
          productId: pid,
          productName: prod.name || 'صنف',
          productSku: prod.sku || '-',
          lastPrice: last.price,
          lastDate: last.date,
          lastSupplier: last.supplier,
          lastQty: last.qty,
          lastInvoice: last.invoice,
          prevPrice: prev.price,
          prevDate: prev.date,
          prevSupplier: prev.supplier,
          prevQty: prev.qty,
          prevInvoice: prev.invoice,
          diff,
          diffPct,
        });
      });

      // ترتيب افتراضي: الأعلى زيادة أولاً
      rows.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
      setPriceComparison(rows);

    } catch (err) {
      logger.error("Error fetching purchase analysis:", err);
      showToast("حدث خطأ: " + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // فلترة وترتيب صفوف المقارنة
  const filteredComparison = priceComparison
    .filter(r =>
      r.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.productSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.lastSupplier.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let av = 0, bv = 0;
      if (sortBy === 'name')    { av = a.productName.localeCompare(b.productName); bv = 0; return sortDir === 'asc' ? av : -av; }
      if (sortBy === 'diff')    { av = a.diff; bv = b.diff; }
      if (sortBy === 'diffPct') { av = a.diffPct; bv = b.diffPct; }
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  const handleSort = (col: 'name' | 'diff' | 'diffPct') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  // ملخص إحصائيات المقارنة
  const priceStats = {
    increased: filteredComparison.filter(r => r.diff > 0).length,
    decreased: filteredComparison.filter(r => r.diff < 0).length,
    unchanged: filteredComparison.filter(r => r.diff === 0).length,
    avgChange: filteredComparison.length > 0
      ? filteredComparison.reduce((s, r) => s + r.diffPct, 0) / filteredComparison.length
      : 0,
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    if (activeTab === 'analysis') {
      const supplierData = bySupplier.map(s => ({
        'اسم المورد': s.supplierName,
        'إجمالي قيمة المشتريات': s.totalAmount,
        'عدد الفواتير': s.orderCount,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supplierData), "تحليل حسب المورد");

      const itemData = byItem.map(i => ({
        'اسم الصنف': i.productName,
        'الكود': i.productSku,
        'إجمالي الكمية المشتراة': i.totalQuantity,
        'إجمالي قيمة المشتريات': i.totalAmount,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemData), "تحليل حسب الصنف");
      XLSX.writeFile(wb, `Purchase_Analysis_${startDate}_${endDate}.xlsx`);
    } else {
      const rows = filteredComparison.map(r => ({
        'الصنف': r.productName,
        'الكود': r.productSku,
        // آخر شراء
        'آخر سعر شراء': r.lastPrice,
        'تاريخ آخر شراء': r.lastDate,
        'مورد آخر شراء': r.lastSupplier,
        'كمية آخر شراء': r.lastQty,
        'رقم فاتورة آخر شراء': r.lastInvoice,
        // ما قبل الأخيرة
        'سعر الشراء السابق': r.prevPrice,
        'تاريخ الشراء السابق': r.prevDate,
        'مورد الشراء السابق': r.prevSupplier,
        'كمية الشراء السابق': r.prevQty,
        'رقم فاتورة الشراء السابق': r.prevInvoice,
        // المقارنة
        'الفرق (ج.م)': r.diff,
        'نسبة التغيير %': parseFloat(r.diffPct.toFixed(2)),
        'الحكم': r.diff > 0 ? 'ارتفع السعر 🔺' : r.diff < 0 ? 'انخفض السعر 🔻' : 'بدون تغيير ➖',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "مقارنة أسعار الشراء");
      XLSX.writeFile(wb, `Price_Comparison_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 animate-in fade-in space-y-6 print:p-0">
      <ReportHeader />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart2 className="text-purple-600" /> تحليل المشتريات ومقارنة الأسعار
          </h1>
          <p className="text-slate-500 text-sm mt-1">تحليل المشتريات حسب المورد والصنف، ومقارنة آخر سعرين شراء لكل صنف</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm">
            <Download size={16} /> تصدير Excel
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      {/* Print title */}
      <div className="hidden print:block text-center mb-6">
        <h1 className="text-2xl font-bold">
          {activeTab === 'analysis' ? 'تقرير تحليل المشتريات' : 'تقرير مقارنة آخر سعرين شراء'}
        </h1>
        <p className="text-sm text-slate-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 no-print">
        <button
          onClick={() => setActiveTab('analysis')}
          className={`px-5 py-2.5 text-sm font-bold rounded-t-lg border-b-2 transition-all ${
            activeTab === 'analysis'
              ? 'border-purple-600 text-purple-700 bg-purple-50'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart2 size={15} className="inline ml-1" />
          تحليل المشتريات
        </button>
        <button
          onClick={() => setActiveTab('price_compare')}
          className={`px-5 py-2.5 text-sm font-bold rounded-t-lg border-b-2 transition-all ${
            activeTab === 'price_compare'
              ? 'border-orange-500 text-orange-700 bg-orange-50'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ArrowUpDown size={15} className="inline ml-1" />
          مقارنة آخر سعرين شراء
          {priceComparison.length > 0 && (
            <span className="mr-1.5 bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {priceComparison.length}
            </span>
          )}
        </button>
      </div>

      {/* Date Filter (tab 1 only) */}
      {activeTab === 'analysis' && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 no-print">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500" />
            </div>
            <button onClick={fetchReport} disabled={loading}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 font-bold shadow-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Filter size={18} />}
              عرض التقرير
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-center p-12"><Loader2 className="animate-spin text-purple-600 mx-auto" size={32} /></div>
      ) : activeTab === 'analysis' ? (
        /* ===================== التبويب الأول: تحليل المشتريات ===================== */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Analysis by Supplier */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <h3 className="text-lg font-bold text-slate-800 p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
              <Truck size={18} className="text-purple-600" /> تحليل حسب المورد
            </h3>
            <table className="w-full text-right text-sm">
              <thead className="text-slate-600 font-bold bg-slate-50">
                <tr>
                  <th className="p-3">المورد</th>
                  <th className="p-3 text-center">عدد الفواتير</th>
                  <th className="p-3 text-left">إجمالي القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bySupplier.map(s => (
                  <tr key={s.supplierId} className="hover:bg-purple-50">
                    <td className="p-3 font-medium text-slate-800">{s.supplierName}</td>
                    <td className="p-3 text-center font-mono">{s.orderCount}</td>
                    <td className="p-3 text-left font-bold text-purple-700">{s.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {bySupplier.length === 0 && (
                  <tr><td colSpan={3} className="p-8 text-center text-slate-400">لا توجد مشتريات في هذه الفترة</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Analysis by Item */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <h3 className="text-lg font-bold text-slate-800 p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
              <Package size={18} className="text-purple-600" /> تحليل حسب الصنف
            </h3>
            <table className="w-full text-right text-sm">
              <thead className="text-slate-600 font-bold bg-slate-50">
                <tr>
                  <th className="p-3">الصنف</th>
                  <th className="p-3 text-center">الكمية</th>
                  <th className="p-3 text-left">إجمالي القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byItem.map(i => (
                  <tr key={i.productId} className="hover:bg-purple-50">
                    <td className="p-3 font-medium text-slate-800">
                      {i.productName}
                      <span className="block text-xs text-slate-400 font-mono">{i.productSku}</span>
                    </td>
                    <td className="p-3 text-center font-mono">{i.totalQuantity}</td>
                    <td className="p-3 text-left font-bold text-purple-700">{i.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {byItem.length === 0 && (
                  <tr><td colSpan={3} className="p-8 text-center text-slate-400">لا توجد مشتريات في هذه الفترة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ===================== التبويب الثاني: مقارنة آخر سعرين شراء ===================== */
        <div className="space-y-4">
          {/* بطاقات الملخص */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm text-center">
              <p className="text-xs text-slate-500 mb-1">إجمالي الأصناف</p>
              <p className="text-2xl font-black text-slate-800">{filteredComparison.length}</p>
            </div>
            <div className="bg-rose-50 rounded-xl p-4 border border-rose-200 shadow-sm text-center">
              <TrendingUp size={20} className="text-rose-600 mx-auto mb-1" />
              <p className="text-xs text-rose-600 mb-1">ارتفع سعرها</p>
              <p className="text-2xl font-black text-rose-700">{priceStats.increased}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 shadow-sm text-center">
              <TrendingDown size={20} className="text-emerald-600 mx-auto mb-1" />
              <p className="text-xs text-emerald-600 mb-1">انخفض سعرها</p>
              <p className="text-2xl font-black text-emerald-700">{priceStats.decreased}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm text-center">
              <Minus size={20} className="text-slate-400 mx-auto mb-1" />
              <p className="text-xs text-slate-500 mb-1">بدون تغيير</p>
              <p className="text-2xl font-black text-slate-600">{priceStats.unchanged}</p>
            </div>
          </div>

          {/* شريط البحث والترتيب */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 no-print">
            <div className="flex flex-col md:flex-row gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-600 mb-1">بحث بالصنف أو الكود أو المورد</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="اكتب للبحث..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={fetchReport} disabled={loading}
                  className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-bold text-sm flex items-center gap-2 shadow-sm">
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <Filter size={16} />}
                  تحديث
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              * يعرض هذا التقرير آخر سعرين للشراء لكل صنف من جميع الفواتير المرحّلة — بغض النظر عن نطاق تاريخ التحليل
            </p>
          </div>

          {/* الجدول الرئيسي */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-gradient-to-l from-orange-50 to-amber-50 text-slate-700 border-b border-orange-100">
                    <th className="p-3 font-bold" rowSpan={2}>
                      <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-orange-600">
                        الصنف <ArrowUpDown size={12} />
                      </button>
                    </th>
                    {/* آخر شراء */}
                    <th colSpan={4} className="p-2 text-center font-bold text-blue-700 border-r border-blue-100 bg-blue-50">
                      🟦 آخر عملية شراء (الأحدث)
                    </th>
                    {/* ما قبل الأخيرة */}
                    <th colSpan={4} className="p-2 text-center font-bold text-slate-600 border-r border-slate-200 bg-slate-50">
                      ⬜ الشراء السابق
                    </th>
                    {/* المقارنة */}
                    <th colSpan={2} className="p-2 text-center font-bold text-orange-700 bg-orange-50">
                      📊 المقارنة
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-100 text-[11px]">
                    {/* آخر شراء */}
                    <th className="p-2 text-center border-r border-blue-100">السعر</th>
                    <th className="p-2 text-center border-r border-blue-100">الكمية</th>
                    <th className="p-2 text-center border-r border-blue-100">المورد</th>
                    <th className="p-2 text-center border-r border-blue-200">التاريخ</th>
                    {/* الشراء السابق */}
                    <th className="p-2 text-center border-r border-slate-200">السعر</th>
                    <th className="p-2 text-center border-r border-slate-200">الكمية</th>
                    <th className="p-2 text-center border-r border-slate-200">المورد</th>
                    <th className="p-2 text-center border-r border-slate-300">التاريخ</th>
                    {/* المقارنة */}
                    <th className="p-2 text-center border-r border-orange-100">
                      <button onClick={() => handleSort('diff')} className="flex items-center gap-1 hover:text-orange-600 mx-auto">
                        الفرق <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="p-2 text-center">
                      <button onClick={() => handleSort('diffPct')} className="flex items-center gap-1 hover:text-orange-600 mx-auto">
                        النسبة% <ArrowUpDown size={11} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredComparison.map(row => {
                    const isUp = row.diff > 0;
                    const isDown = row.diff < 0;
                    const rowBg = isUp ? 'hover:bg-rose-50' : isDown ? 'hover:bg-emerald-50' : 'hover:bg-slate-50';
                    return (
                      <tr key={row.productId} className={`transition ${rowBg}`}>
                        {/* الصنف */}
                        <td className="p-3 font-bold text-slate-800">
                          {row.productName}
                          <span className="block text-[10px] text-slate-400 font-mono font-normal">{row.productSku}</span>
                        </td>
                        {/* آخر شراء */}
                        <td className="p-2 text-center font-mono font-bold text-blue-700 border-r border-blue-50">
                          {row.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center font-mono text-slate-600 border-r border-blue-50">{row.lastQty}</td>
                        <td className="p-2 text-center text-slate-600 border-r border-blue-50 max-w-[80px] truncate" title={row.lastSupplier}>
                          {row.lastSupplier.length > 12 ? row.lastSupplier.slice(0, 12) + '...' : row.lastSupplier}
                          <span className="block text-[10px] text-slate-400 font-mono">{row.lastInvoice}</span>
                        </td>
                        <td className="p-2 text-center font-mono text-slate-500 border-r border-blue-100 text-[11px]">{row.lastDate}</td>
                        {/* الشراء السابق */}
                        <td className="p-2 text-center font-mono text-slate-600 border-r border-slate-100">
                          {row.prevPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center font-mono text-slate-500 border-r border-slate-100">{row.prevQty}</td>
                        <td className="p-2 text-center text-slate-500 border-r border-slate-100 max-w-[80px] truncate" title={row.prevSupplier}>
                          {row.prevSupplier.length > 12 ? row.prevSupplier.slice(0, 12) + '...' : row.prevSupplier}
                          <span className="block text-[10px] text-slate-400 font-mono">{row.prevInvoice}</span>
                        </td>
                        <td className="p-2 text-center font-mono text-slate-400 border-r border-slate-200 text-[11px]">{row.prevDate}</td>
                        {/* المقارنة */}
                        <td className={`p-2 text-center font-mono font-bold border-r border-orange-100 ${isUp ? 'text-rose-600' : isDown ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {isUp ? '+' : ''}{row.diff.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center">
                          {isUp ? (
                            <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold text-[11px]">
                              <TrendingUp size={11} /> +{row.diffPct.toFixed(1)}%
                            </span>
                          ) : isDown ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[11px]">
                              <TrendingDown size={11} /> {row.diffPct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold text-[11px]">
                              <Minus size={11} /> 0%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredComparison.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-12 text-center text-slate-400">
                        {priceComparison.length === 0
                          ? 'لا توجد أصناف بها عمليتا شراء أو أكثر بعد. يجب أن يكون لكل صنف فاتورتا شراء مرحّلتان على الأقل.'
                          : 'لا توجد نتائج تطابق البحث'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}