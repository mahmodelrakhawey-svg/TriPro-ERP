import { logger } from '../../utils/logger';
import { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { 
  BarChart2, Download, Printer, Loader2, Filter, Truck, Package, 
  TrendingUp, TrendingDown, Minus, ArrowUpDown, RefreshCw, X, AlertTriangle, Layers, Calendar
} from 'lucide-react';
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

// ===== نوع بيانات تقرير مقارنة آخر سعرين شراء المطور =====
export type PriceComparisonRow = {
  productId: string;
  productName: string;
  productSku: string;
  categoryId: string;
  categoryName: string;
  baseUnit: string;        // الوحدة الأساسية للمخزن (المعيار الموحد للمقارنة العادلة)

  // آخر عملية شراء (الأحدث)
  lastPrice: number;       // السعر المكتوب في الفاتورة للوحدة المشتراة
  lastUomName: string;     // اسم وحدة الشراء المسجلة بالفاتورة
  lastNormalizedPrice: number; // السعر المحول للوحدة الأساسية (الموحد)
  lastDate: string;
  lastSupplierId: string;
  lastSupplier: string;
  lastQty: number;
  lastInvoice: string;

  // ما قبل الأخيرة
  prevPrice: number;       // السعر المكتوب في الفاتورة للوحدة المشتراة
  prevUomName: string;     // اسم وحدة الشراء المسجلة بالفاتورة
  prevNormalizedPrice: number; // السعر المحول للوحدة الأساسية (الموحد)
  prevDate: string;
  prevSupplierId: string;
  prevSupplier: string;
  prevQty: number;
  prevInvoice: string;

  // المقارنة الموحدة والعادلة (المحسوبة بناءً على السعر الموحد لكل وحدة أساسية)
  diff: number;            // الفرق المطلق لكل وحدة أساسية (ج.م)
  diffPct: number;         // نسبة التغيير الحقيقية %
  isDifferentUom: boolean; // هل كانت وحدتا الشراء مختلفتين؟ (لتنبيه المستخدم وشفافية الحساب)
};

export default function PurchaseAnalysisReport() {
  const { currentUser, selectedFiscalYear, fiscalYearRange, suppliers, categories } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [activeTab, setActiveTab] = useState<'analysis' | 'price_compare'>('analysis');

  // فلاتر تقرير مقارنة الأسعار المتقدمة
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [changeFilter, setChangeFilter] = useState<'all' | 'increased' | 'decreased' | 'unchanged'>('all');
  const [uomFilter, setUomFilter] = useState<'all' | 'same_uom' | 'different_uom'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'diff' | 'diffPct' | 'date'>('diffPct');
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
          productId: 'p1', productName: 'بيض مائدة طازج', productSku: 'EGG-001', categoryId: 'c1', categoryName: 'خامات أولية',
          baseUnit: 'بيضة',
          lastPrice: 120, lastUomName: 'طبق (30 بيضة)', lastNormalizedPrice: 4.00,
          lastDate: '2026-10-02', lastSupplierId: 's1', lastSupplier: 'مزارع الدلتا', lastQty: 50, lastInvoice: 'PINV-102',
          prevPrice: 112, prevUomName: 'طبق (30 بيضة)', prevNormalizedPrice: 3.7333,
          prevDate: '2026-09-18', prevSupplierId: 's1', prevSupplier: 'مزارع الدلتا', prevQty: 40, prevInvoice: 'PINV-091',
          diff: 0.2667, diffPct: 7.14, isDifferentUom: false
        },
        {
          productId: 'p2', productName: 'دقيق فاخر 72%', productSku: 'FL-002', categoryId: 'c1', categoryName: 'خامات أولية',
          baseUnit: 'كجم',
          lastPrice: 850, lastUomName: 'شيكارة (50 كجم)', lastNormalizedPrice: 17.00,
          lastDate: '2026-09-28', lastSupplierId: 's2', lastSupplier: 'مطاحن الإسكندرية', lastQty: 20, lastInvoice: 'PINV-098',
          prevPrice: 18, prevUomName: 'كجم', prevNormalizedPrice: 18.00,
          prevDate: '2026-09-05', prevSupplierId: 's3', prevSupplier: 'مورد التجزئة', prevQty: 100, prevInvoice: 'PINV-085',
          diff: -1.00, diffPct: -5.56, isDifferentUom: true
        },
        {
          productId: 'p3', productName: 'شيكولاتة خام بلجيكي', productSku: 'CH-003', categoryId: 'c1', categoryName: 'خامات أولية',
          baseUnit: 'كجم',
          lastPrice: 350, lastUomName: 'كجم', lastNormalizedPrice: 350.00,
          lastDate: '2026-10-01', lastSupplierId: 's4', lastSupplier: 'شركة الفاخر للحلويات', lastQty: 15, lastInvoice: 'PINV-100',
          prevPrice: 350, prevUomName: 'كجم', prevNormalizedPrice: 350.00,
          prevDate: '2026-08-20', prevSupplierId: 's4', prevSupplier: 'شركة الفاخر للحلويات', prevQty: 10, prevInvoice: 'PINV-076',
          diff: 0, diffPct: 0, isDifferentUom: false
        }
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = user?.user_metadata?.org_id;

      if (!userOrgId) return;

      // 1. جلب جدول الوحدات (UOMs) لحساب النسب التناسبية وتوحيد المقارنة بدقة رياضية
      const { data: uomsData } = await supabase
        .from('uoms')
        .select('id, name, ratio, uom_type, category_id, is_base')
        .eq('organization_id', userOrgId);

      const uomMap = new Map<string, { name: string; ratio: number; uom_type: string }>();
      (uomsData || []).forEach(u => {
        let r = Number(u.ratio) || 1;
        if (r <= 0) r = 1;
        uomMap.set(u.id, { name: u.name || '', ratio: r, uom_type: u.uom_type || 'base' });
      });

      // 2. تحليل المشتريات (التبويب الأول)
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
        const amount = Number(item.quantity || 0) * Number(item.unit_price || 0);

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
        itemMap[productId].totalQuantity += Number(item.quantity || 0);
        itemMap[productId].totalAmount += amount;
      });

      setBySupplier(Object.values(supplierMap).sort((a, b) => b.totalAmount - a.totalAmount));
      setByItem(Object.values(itemMap).sort((a, b) => b.totalAmount - a.totalAmount));

      // 3. مقارنة آخر سعرين شراء (التبويب الثاني المحكم والمنضبط)
      // نجلب بنود الفواتير مع كافة بيانات الصنف والوحدات والمورد
      const { data: allItems, error: allErr } = await supabase
        .from('purchase_invoice_items')
        .select(`
          id,
          quantity,
          unit_price,
          uom_id,
          product_id,
          purchase_invoice_id,
          purchase_invoices!purchase_invoice_items_purchase_invoice_id_fkey!inner (
            id,
            invoice_number,
            invoice_date,
            status,
            supplier_id,
            organization_id,
            suppliers (id, name)
          ),
          products:product_id (
            id, 
            name, 
            sku, 
            unit, 
            base_uom_id, 
            category_id,
            item_categories:category_id (id, name)
          )
        `)
        .eq('purchase_invoices.organization_id', userOrgId)
        .in('purchase_invoices.status', ['posted', 'paid'])
        .order('purchase_invoices(invoice_date)', { ascending: false });

      if (allErr) throw allErr;

      // تجميع آخر عمليتي شراء لكل صنف
      const productPurchasesMap: Record<string, Array<{
        price: number;
        uomId: string | null;
        date: string;
        supplierId: string;
        supplier: string;
        qty: number;
        invoice: string;
      }>> = {};

      (allItems || []).forEach((item: Record<string, any>) => {
        if (!item.products || !item.purchase_invoices) return;
        const pid = item.product_id;
        if (!productPurchasesMap[pid]) productPurchasesMap[pid] = [];
        if (productPurchasesMap[pid].length < 2) {
          productPurchasesMap[pid].push({
            price: Number(item.unit_price || 0),
            uomId: item.uom_id || null,
            date: item.purchase_invoices.invoice_date || '',
            supplierId: item.purchase_invoices.supplier_id || '',
            supplier: item.purchase_invoices.suppliers?.name || 'غير محدد',
            qty: Number(item.quantity || 0),
            invoice: item.purchase_invoices.invoice_number || '-',
          });
        }
      });

      // بناء صفوف المقارنة الموحدة تناسبياً
      const rows: PriceComparisonRow[] = [];
      Object.entries(productPurchasesMap).forEach(([pid, purchases]) => {
        if (purchases.length < 2) return;

        const anyItem = (allItems || []).find((i: Record<string, unknown>) => i.product_id === pid) as Record<string, any> | undefined;
        if (!anyItem?.products) return;

        const prod = Array.isArray(anyItem.products) ? anyItem.products[0] : anyItem.products;
        if (!prod) return;

        const baseUnitName = (prod.unit || 'وحدة').trim();
        const baseUomId = prod.base_uom_id;

        const [last, prev] = purchases;

        // دالة استخراج اسم الوحدة ومعامل التحويل للوحدة الأساسية
        const getUomInfo = (uomId: string | null) => {
          if (!uomId) {
            return { name: baseUnitName, ratio: 1 };
          }
          const found = uomMap.get(uomId);
          if (!found) {
            return { name: baseUnitName, ratio: 1 };
          }
          // إذا كانت الوحدة هي الوحدة الأساسية
          if (baseUomId && uomId === baseUomId) {
            return { name: found.name || baseUnitName, ratio: 1 };
          }
          // إذا كانت وحدة أكبر (كالكرتونة التي تحتوي 30 بيضة) -> ratio = 30
          // فالسعر المحول للبيضة = سعر الكرتونة / 30
          // وإذا كانت وحدة أصغر (كالجرام من الكيلو) -> ratio = 1000 أو 0.001
          let r = found.ratio;
          if (found.uom_type === 'smaller' && r > 1) {
            r = 1 / r;
          }
          return { name: found.name, ratio: r > 0 ? r : 1 };
        };

        const lastUom = getUomInfo(last.uomId);
        const prevUom = getUomInfo(prev.uomId);

        // السعر المحول للوحدة الأساسية = السعر المدفوع / معامل الوحدة
        // مثال: كرتونة بـ 120 جنيه وبها 30 بيضة -> سعر البيضة = 120 / 30 = 4 جنيه
        const lastNormPrice = lastUom.ratio > 0 ? last.price / lastUom.ratio : last.price;
        const prevNormPrice = prevUom.ratio > 0 ? prev.price / prevUom.ratio : prev.price;

        const diff = Number((lastNormPrice - prevNormPrice).toFixed(4));
        const diffPct = prevNormPrice > 0 ? Number(((diff / prevNormPrice) * 100).toFixed(2)) : 0;
        const isDifferentUom = (lastUom.name !== prevUom.name);

        const catData = Array.isArray(prod.item_categories) ? prod.item_categories[0] : prod.item_categories;

        rows.push({
          productId: pid,
          productName: prod.name || 'صنف',
          productSku: prod.sku || '-',
          categoryId: prod.category_id || '',
          categoryName: catData?.name || 'عام',
          baseUnit: baseUnitName,

          // الأحدث
          lastPrice: last.price,
          lastUomName: lastUom.name,
          lastNormalizedPrice: Number(lastNormPrice.toFixed(4)),
          lastDate: last.date,
          lastSupplierId: last.supplierId,
          lastSupplier: last.supplier,
          lastQty: last.qty,
          lastInvoice: last.invoice,

          // السابق
          prevPrice: prev.price,
          prevUomName: prevUom.name,
          prevNormalizedPrice: Number(prevNormPrice.toFixed(4)),
          prevDate: prev.date,
          prevSupplierId: prev.supplierId,
          prevSupplier: prev.supplier,
          prevQty: prev.qty,
          prevInvoice: prev.invoice,

          // المقارنة العادلة
          diff,
          diffPct,
          isDifferentUom,
        });
      });

      // ترتيب افتراضي
      rows.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
      setPriceComparison(rows);

    } catch (err: any) {
      logger.error("Error fetching purchase analysis:", err);
      showToast("حدث خطأ: " + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // فلترة متقدمة وشاملة للصفوف
  const filteredComparison = useMemo(() => {
    return priceComparison
      .filter(r => {
        // فلتر البحث النصي (الاسم، الكود، المورد، رقم الفاتورة)
        const matchSearch = !searchTerm || (
          r.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.productSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.lastSupplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.prevSupplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.lastInvoice.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.prevInvoice.toLowerCase().includes(searchTerm.toLowerCase())
        );

        // فلتر المورد (سواء كان في الشراء الأخير أو السابق)
        const matchSupplier = supplierFilter === 'all' || 
          r.lastSupplierId === supplierFilter || 
          r.prevSupplierId === supplierFilter;

        // فلتر تصنيف الصنف
        const matchCategory = categoryFilter === 'all' || r.categoryId === categoryFilter;

        // فلتر نوع التغير السعري
        const matchChange = 
          changeFilter === 'all' ? true :
          changeFilter === 'increased' ? r.diff > 0 :
          changeFilter === 'decreased' ? r.diff < 0 :
          r.diff === 0;

        // فلتر تطابق وحدات الشراء
        const matchUom = 
          uomFilter === 'all' ? true :
          uomFilter === 'different_uom' ? r.isDifferentUom :
          !r.isDifferentUom;

        return matchSearch && matchSupplier && matchCategory && matchChange && matchUom;
      })
      .sort((a, b) => {
        let av = 0, bv = 0;
        if (sortBy === 'name')    { return sortDir === 'asc' ? a.productName.localeCompare(b.productName) : b.productName.localeCompare(a.productName); }
        if (sortBy === 'date')    { return sortDir === 'asc' ? a.lastDate.localeCompare(b.lastDate) : b.lastDate.localeCompare(a.lastDate); }
        if (sortBy === 'diff')    { av = a.diff; bv = b.diff; }
        if (sortBy === 'diffPct') { av = a.diffPct; bv = b.diffPct; }
        return sortDir === 'desc' ? bv - av : av - bv;
      });
  }, [priceComparison, searchTerm, supplierFilter, categoryFilter, changeFilter, uomFilter, sortBy, sortDir]);

  const handleSort = (col: 'name' | 'diff' | 'diffPct' | 'date') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSupplierFilter('all');
    setCategoryFilter('all');
    setChangeFilter('all');
    setUomFilter('all');
    setSortBy('diffPct');
    setSortDir('desc');
  };

  const hasActiveFilters = Boolean(
    searchTerm || supplierFilter !== 'all' || categoryFilter !== 'all' || changeFilter !== 'all' || uomFilter !== 'all'
  );

  // إحصائيات المقارنة الفورية
  const priceStats = useMemo(() => {
    const list = filteredComparison;
    return {
      total: list.length,
      increased: list.filter(r => r.diff > 0).length,
      decreased: list.filter(r => r.diff < 0).length,
      unchanged: list.filter(r => r.diff === 0).length,
      diffUoms: list.filter(r => r.isDifferentUom).length,
    };
  }, [filteredComparison]);

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
        'التصنيف': r.categoryName,
        'الوحدة الأساسية (المعيار الموحد)': r.baseUnit,
        
        // الأحدث
        'سعر الفاتورة الأحدث': r.lastPrice,
        'وحدة الفاتورة الأحدث': r.lastUomName,
        'السعر الموحد للأحدث (لكل وحدة أساسية)': r.lastNormalizedPrice,
        'كمية الأحدث': r.lastQty,
        'مورد الأحدث': r.lastSupplier,
        'تاريخ الأحدث': r.lastDate,
        'فاتورة الأحدث': r.lastInvoice,

        // السابق
        'سعر الفاتورة السابقة': r.prevPrice,
        'وحدة الفاتورة السابقة': r.prevUomName,
        'السعر الموحد للسابق (لكل وحدة أساسية)': r.prevNormalizedPrice,
        'كمية السابق': r.prevQty,
        'مورد السابق': r.prevSupplier,
        'تاريخ السابق': r.prevDate,
        'فاتورة السابق': r.prevInvoice,

        // المقارنة الموحدة
        'فرق السعر الموحد (ج.م)': r.diff,
        'نسبة التغير الحقيقية %': `${r.diffPct}%`,
        'حالة وحدات الشراء': r.isDifferentUom ? 'تم توحيد وحدات مختلفة تناسبياً' : 'نفس وحدة الشراء',
        'الحكم': r.diff > 0 ? 'ارتفاع في السعر' : r.diff < 0 ? 'انخفاض في السعر' : 'ثبات السعر',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "مقارنة الأسعار الموحدة");
      XLSX.writeFile(wb, `Normalized_Price_Comparison_${new Date().toISOString().split('T')[0]}.xlsx`);
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
          <p className="text-slate-500 text-sm mt-1">
            مقارنة عادلة ومحكمة لآخر سعرين شراء مع توحيد وحدات القياس تناسبياً (مثال: طبق البيض مقابل البيضة / الشيكارة مقابل الكيلو)
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm transition">
            <Download size={16} /> تصدير Excel
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm transition">
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      {/* Print title */}
      <div className="hidden print:block text-center mb-6">
        <h1 className="text-2xl font-bold">
          {activeTab === 'analysis' ? 'تقرير تحليل المشتريات' : 'تقرير مقارنة آخر سعرين شراء الموحد تناسبياً'}
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
          مقارنة آخر سعرين شراء (موحد الوحدات)
          {priceComparison.length > 0 && (
            <span className="mr-1.5 bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
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
        /* ===================== التبويب الثاني: مقارنة آخر سعرين شراء (الموحد والمحكم) ===================== */
        <div className="space-y-4">
          
          {/* تنبيه تعليمي لمعادلة المقارنة العادلة */}
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3 shadow-xs no-print">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <div className="space-y-1">
              <p className="font-black text-amber-950 text-sm">
                🛡️ نظام المقارنة العادل والموحد تناسبياً (Unified Proportional Comparison)
              </p>
              <p className="text-slate-700 leading-relaxed">
                يقوم النظام تلقائياً بتحويل أسعار الشراء إلى <strong>سعر الوحدة الأساسية للمخزن</strong> (مثلاً: سعر البيضة الواحدة أو سعر الكيلوجرام الواحد) قبل إجراء المقارنة. إذا اشتريت مرة بالكرتونة ومرة بالبيضة أو بالشيكارة وبالكيلو، يقوم النظام بقسمة سعر الكرتونة على عدد وحداتها تلقائياً لتظهر نسبة التغير الحقيقية بدون أي فروق وهمية.
              </p>
            </div>
          </div>

          {/* بطاقات الملخص والإحصاء */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 no-print">
            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs text-center">
              <p className="text-xs text-slate-500 font-bold mb-1">إجمالي الأصناف</p>
              <p className="text-2xl font-black text-slate-800">{priceStats.total}</p>
            </div>
            <div className="bg-rose-50 rounded-xl p-3.5 border border-rose-200 shadow-xs text-center">
              <div className="flex items-center justify-center gap-1 text-rose-600 mb-1 font-bold text-xs">
                <TrendingUp size={15} /> ارتفع سعرها
              </div>
              <p className="text-2xl font-black text-rose-700">{priceStats.increased}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3.5 border border-emerald-200 shadow-xs text-center">
              <div className="flex items-center justify-center gap-1 text-emerald-600 mb-1 font-bold text-xs">
                <TrendingDown size={15} /> انخفض سعرها
              </div>
              <p className="text-2xl font-black text-emerald-700">{priceStats.decreased}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 shadow-xs text-center">
              <div className="flex items-center justify-center gap-1 text-slate-500 mb-1 font-bold text-xs">
                <Minus size={15} /> بدون تغيير
              </div>
              <p className="text-2xl font-black text-slate-600">{priceStats.unchanged}</p>
            </div>
            <div className="bg-indigo-50 rounded-xl p-3.5 border border-indigo-200 shadow-xs text-center col-span-2 sm:col-span-1">
              <div className="flex items-center justify-center gap-1 text-indigo-700 mb-1 font-bold text-xs">
                <Layers size={15} /> وحدات موحدة
              </div>
              <p className="text-2xl font-black text-indigo-800">{priceStats.diffUoms}</p>
            </div>
          </div>

          {/* لوحة الفلاتر المتقدمة والشاملة */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 no-print">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Filter size={14} className="text-orange-500" /> فلاتر التقرير المتقدمة
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 transition"
                >
                  <X size={13} /> إعادة ضبط الفلاتر
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* 1. البحث النصي */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">بحث سريع (صنف / كود / مورد / رقم فاتورة)</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="اكتب اسم الصنف أو كوده أو اسم المورد..."
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* 2. فلتر المورد */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">فلترة حسب المورد</label>
                <select
                  value={supplierFilter}
                  onChange={e => setSupplierFilter(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-orange-500 bg-slate-50 focus:bg-white font-bold"
                >
                  <option value="all">كل الموردين ({suppliers?.length || 0})</option>
                  {(suppliers || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* 3. فلتر التصنيف */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">فلترة حسب التصنيف</label>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-orange-500 bg-slate-50 focus:bg-white font-bold"
                >
                  <option value="all">كل التصنيفات ({categories?.length || 0})</option>
                  {(categories || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* 4. فلتر حالة السعر */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">حالة تغير السعر</label>
                <select
                  value={changeFilter}
                  onChange={e => setChangeFilter(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-orange-500 bg-slate-50 focus:bg-white font-bold"
                >
                  <option value="all">جميع الحالات</option>
                  <option value="increased">🔺 السعر ارتفع فقط</option>
                  <option value="decreased">🔻 السعر انخفض فقط</option>
                  <option value="unchanged">➖ السعر ثابت بدون تغيير</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
              <div className="flex items-center gap-3">
                <span className="font-bold">تطابق وحدات الفاتورة:</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="uomFilter"
                    checked={uomFilter === 'all'}
                    onChange={() => setUomFilter('all')}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  <span>الكل</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="uomFilter"
                    checked={uomFilter === 'same_uom'}
                    onChange={() => setUomFilter('same_uom')}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  <span>نفس الوحدة فقط</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-indigo-700 font-bold">
                  <input
                    type="radio"
                    name="uomFilter"
                    checked={uomFilter === 'different_uom'}
                    onChange={() => setUomFilter('different_uom')}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  <span>وحدات شراء مختلفة (تم توحيدها)</span>
                </label>
              </div>
              <button
                type="button"
                onClick={fetchReport}
                disabled={loading}
                className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                تحديث البيانات
              </button>
            </div>
          </div>

          {/* الجدول الرئيسي المطور */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-gradient-to-l from-orange-50 via-amber-50 to-slate-50 text-slate-700 border-b border-orange-100">
                    <th className="p-3 font-bold" rowSpan={2}>
                      <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-orange-600">
                        الصنف والتصنيف <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="p-3 text-center font-bold bg-amber-50/50 border-r border-amber-100" rowSpan={2} title="الوحدة المعتمدة في كارت الصنف بالمخزن والتي يتم التوحيد عليها">
                      الوحدة الأساسية (المعيار)
                    </th>
                    {/* آخر شراء */}
                    <th colSpan={5} className="p-2 text-center font-bold text-blue-700 border-r border-blue-100 bg-blue-50/70">
                      🟦 آخر عملية شراء (الأحدث)
                    </th>
                    {/* ما قبل الأخيرة */}
                    <th colSpan={5} className="p-2 text-center font-bold text-slate-600 border-r border-slate-200 bg-slate-50">
                      ⬜ الشراء السابق
                    </th>
                    {/* المقارنة */}
                    <th colSpan={2} className="p-2 text-center font-bold text-orange-700 bg-orange-50/70">
                      📊 المقارنة العادلة (للوحدة الأساسية)
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                    {/* آخر شراء */}
                    <th className="p-2 text-center border-r border-blue-100">سعر الفاتورة</th>
                    <th className="p-2 text-center border-r border-blue-100">وحدة الشراء</th>
                    <th className="p-2 text-center border-r border-blue-100 font-bold text-blue-900 bg-blue-100/40" title="السعر الفعلي المحسوب لكل وحدة أساسية">السعر الموحد</th>
                    <th className="p-2 text-center border-r border-blue-100">الكمية</th>
                    <th className="p-2 text-center border-r border-blue-200">المورد والتاريخ</th>

                    {/* الشراء السابق */}
                    <th className="p-2 text-center border-r border-slate-200">سعر الفاتورة</th>
                    <th className="p-2 text-center border-r border-slate-200">وحدة الشراء</th>
                    <th className="p-2 text-center border-r border-slate-200 font-bold text-slate-800 bg-slate-100" title="السعر الفعلي المحسوب لكل وحدة أساسية">السعر الموحد</th>
                    <th className="p-2 text-center border-r border-slate-200">الكمية</th>
                    <th className="p-2 text-center border-r border-slate-300">المورد والتاريخ</th>

                    {/* المقارنة */}
                    <th className="p-2 text-center border-r border-orange-100">
                      <button onClick={() => handleSort('diff')} className="flex items-center gap-1 hover:text-orange-600 mx-auto font-bold">
                        الفرق (ج.م) <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="p-2 text-center">
                      <button onClick={() => handleSort('diffPct')} className="flex items-center gap-1 hover:text-orange-600 mx-auto font-bold">
                        نسبة التغير % <ArrowUpDown size={11} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredComparison.map(row => {
                    const isUp = row.diff > 0;
                    const isDown = row.diff < 0;
                    const rowBg = isUp ? 'hover:bg-rose-50/60' : isDown ? 'hover:bg-emerald-50/60' : 'hover:bg-slate-50';

                    return (
                      <tr key={row.productId} className={`transition ${rowBg}`}>
                        {/* الصنف والتصنيف */}
                        <td className="p-3 font-bold text-slate-800">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{row.productName}</span>
                            {row.isDifferentUom && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="تم توحيد وحدات شراء مختلفة بنجاح وفق معادلة تناسبية">
                                موحد تناسبياً ⚖️
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-normal mt-0.5">
                            <span className="font-mono">{row.productSku}</span>
                            <span>•</span>
                            <span className="text-slate-500 font-bold">{row.categoryName}</span>
                          </div>
                        </td>

                        {/* الوحدة الأساسية للمخزن */}
                        <td className="p-2 text-center font-bold text-slate-700 border-r border-amber-50 bg-amber-50/20">
                          <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-[11px]">
                            {row.baseUnit}
                          </span>
                        </td>

                        {/* آخر عملية شراء (الأحدث) */}
                        <td className="p-2 text-center font-mono font-bold text-slate-700 border-r border-blue-50">
                          {row.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center border-r border-blue-50">
                          <span className="text-slate-600 font-bold bg-blue-50/60 px-1.5 py-0.5 rounded text-[11px]">
                            {row.lastUomName}
                          </span>
                        </td>
                        <td className="p-2 text-center font-mono font-black text-blue-700 border-r border-blue-50 bg-blue-50/30">
                          {row.lastNormalizedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          <span className="block text-[9px] text-blue-500 font-normal">/{row.baseUnit}</span>
                        </td>
                        <td className="p-2 text-center font-mono text-slate-600 border-r border-blue-50">
                          {row.lastQty}
                        </td>
                        <td className="p-2 text-center border-r border-blue-100 max-w-[120px]">
                          <span className="font-bold text-slate-700 truncate block text-[11px]" title={row.lastSupplier}>
                            {row.lastSupplier}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            {row.lastInvoice} • {row.lastDate}
                          </span>
                        </td>

                        {/* عملية الشراء السابقة */}
                        <td className="p-2 text-center font-mono font-bold text-slate-700 border-r border-slate-100">
                          {row.prevPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center border-r border-slate-100">
                          <span className="text-slate-600 font-bold bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            {row.prevUomName}
                          </span>
                        </td>
                        <td className="p-2 text-center font-mono font-black text-slate-800 border-r border-slate-100 bg-slate-50">
                          {row.prevNormalizedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          <span className="block text-[9px] text-slate-400 font-normal">/{row.baseUnit}</span>
                        </td>
                        <td className="p-2 text-center font-mono text-slate-600 border-r border-slate-100">
                          {row.prevQty}
                        </td>
                        <td className="p-2 text-center border-r border-slate-200 max-w-[120px]">
                          <span className="font-bold text-slate-700 truncate block text-[11px]" title={row.prevSupplier}>
                            {row.prevSupplier}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            {row.prevInvoice} • {row.prevDate}
                          </span>
                        </td>

                        {/* المقارنة العادلة */}
                        <td className={`p-2 text-center font-mono font-black border-r border-orange-100 text-[12px] ${isUp ? 'text-rose-600' : isDown ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {isUp ? '+' : ''}{row.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          <span className="block text-[9px] font-normal text-slate-400">ج.م/{row.baseUnit}</span>
                        </td>
                        <td className="p-2 text-center">
                          {isUp ? (
                            <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-black text-[11px]" title="زيادة في التكلفة الحقيقية">
                              <TrendingUp size={11} /> +{row.diffPct.toFixed(1)}%
                            </span>
                          ) : isDown ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black text-[11px]" title="انخفاض ووفر في التكلفة">
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
                      <td colSpan={13} className="p-12 text-center text-slate-400 font-bold">
                        {priceComparison.length === 0
                          ? 'لا توجد أصناف مسجل لها عمليتا شراء مرحّلتان على الأقل بعد.'
                          : 'لا توجد نتائج تطابق معايير الفلاتر المحددة حالياً. يمكنك تغيير خيارات الفلترة أو الضغط على "إعادة ضبط الفلاتر".'}
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