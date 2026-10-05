import { logger } from '../../utils/logger';
import { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { 
  BarChart2, Download, Printer, Loader2, Filter, Truck, Package, 
  TrendingUp, TrendingDown, Minus, ArrowUpDown, RefreshCw, X, AlertTriangle, Layers, ShieldAlert, CheckCircle2
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

  // 🛡️ صمام الأمان وكاشف الأخطاء الشاذة (Anomaly Detection)
  isAnomaly: boolean;      // هل هناك فرق شاذ ناتج عن إدخال سعر العبوة/الشيكارة بدلاً من سعر الكيلو/القطعة؟
  anomalyReason: string;   // سبب التحذير الذكي
};

// دالة ذكية لاستخراج المضاعف من نص اسم الوحدة إذا تعذر وجوده أو كُتب في الاسم (مثل: "شيكاره 25 كيلو" أو "طبق (30 بيضة)" أو "كرتونه 2 جردل *6 كيلو")
function extractMultiplierFromName(name: string): number | null {
  if (!name) return null;
  const clean = name.trim();

  // 1. فحص وجود عملية ضرب صريحة (مثال: 2 * 6 أو 2 × 6 أو 2x6)
  const multMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:[xX*×*]|في)\s*(\d+(?:\.\d+)?)/);
  if (multMatch) {
    const v1 = parseFloat(multMatch[1]);
    const v2 = parseFloat(multMatch[2]);
    if (v1 > 0 && v2 > 0) return v1 * v2;
  }

  // 2. رقم داخل أقواس: (30 بيضة) أو (24) أو (12 قطعة)
  const parenMatch = clean.match(/\(\s*(\d+(?:\.\d+)?)\s*[^)]*\)/);
  if (parenMatch && parenMatch[1]) {
    const val = parseFloat(parenMatch[1]);
    if (val > 1) return val;
  }

  // 3. رقم يتبعه وحدة قياس أو اسم وحدة (كجم، كيلو، ك، جرام، جم، قطعة، قطع، علبة، علب، بيضة، بيض، لتر، مل، قرص)
  const unitSuffixMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:كجم|كيلو|كيلوجرام|ك|جرام|جم|قطعة|قطعه|قطع|علبة|علبه|علب|بيضة|بيضه|بيض|لتر|مل|لترات|قرص|حبة|حبه|حبات|جردل|كيس)/i);
  if (unitSuffixMatch && unitSuffixMatch[1]) {
    const val = parseFloat(unitSuffixMatch[1]);
    if (val > 1) return val;
  }

  // 4. وحدة قياس يتبعها رقم (دستة 12، كرتونة 24، شيكارة 50، صفيحة 10)
  const prefixMatch = clean.match(/(?:دستة|دسته|كرتونة|كرتونه|شيكارة|شيكاره|صفيحة|صفيحه|باكت|طرد|صندوق|برميل|جالون|كيس|طبق)\s*(\d+(?:\.\d+)?)/i);
  if (prefixMatch && prefixMatch[1]) {
    const val = parseFloat(prefixMatch[1]);
    if (val > 1) return val;
  }

  // 5. كلمات دالة على أعداد معروفة
  if (/^دست[ةه]$/.test(clean)) return 12;
  if (/^طن$/.test(clean)) return 1000;

  return null;
}

// دالة حساب السعر الموحد للوحدة الأساسية (المعيار) بدقة رياضية متكاملة
function computeNormalizedPrice(
  price: number,
  uom: { name: string; ratio: number; uom_type: string },
  baseUnit: string
): { normalizedPrice: number; effectiveRatio: number; uomName: string } {
  if (!price || price <= 0) {
    return { normalizedPrice: 0, effectiveRatio: 1, uomName: uom.name || baseUnit || 'وحدة' };
  }

  let ratio = Number(uom.ratio) || 1;
  const name = (uom.name || baseUnit || 'وحدة').trim();
  const uomType = uom.uom_type || '';

  // إذا كانت النسبة 1 ولكن الاسم يحتوي صراحة على مضاعف رقمي (مثل: شيكاره 25 كيلو أو طبق 30 بيضة)
  if (ratio === 1) {
    const parsed = extractMultiplierFromName(name);
    if (parsed && parsed > 1) {
      ratio = parsed;
    }
  }

  if (ratio <= 0) ratio = 1;

  let normPrice = price;

  if (uomType === 'smaller') {
    if (ratio > 1) normPrice = price * ratio;
    else if (ratio < 1 && ratio > 0) normPrice = price / ratio;
  } else {
    // bigger أو reference أو عام
    if (ratio > 1) normPrice = price / ratio;
    else if (ratio < 1 && ratio > 0) normPrice = price * (1 / ratio);
  }

  return {
    normalizedPrice: Number(normPrice.toFixed(4)),
    effectiveRatio: ratio,
    uomName: name,
  };
}

export default function PurchaseAnalysisReport() {
  const { currentUser, currentSelectedOrgId, effectiveOrgId, selectedFiscalYear, fiscalYearRange, suppliers, categories } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [activeTab, setActiveTab] = useState<'analysis' | 'price_compare'>('price_compare');

  // فلاتر تقرير مقارنة الأسعار المتقدمة
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [changeFilter, setChangeFilter] = useState<'all' | 'increased' | 'decreased' | 'unchanged'>('all');
  const [uomFilter, setUomFilter] = useState<'all' | 'same_uom' | 'different_uom'>('all');
  const [anomalyFilter, setAnomalyFilter] = useState<'all' | 'normal_only' | 'anomalies_only'>('normal_only'); // افتراضياً عرض الفروق الطبيعية فقط لحمايتك من الحرج
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
          diff: 0.2667, diffPct: 7.14, isDifferentUom: false, isAnomaly: false, anomalyReason: ''
        },
        {
          productId: 'p2', productName: 'كريم شانتيه هايبر المتحده', productSku: '10101-0077', categoryId: 'c1', categoryName: 'خامات الحلويات الأولية',
          baseUnit: 'kg',
          lastPrice: 8100, lastUomName: 'شيكاره 25 كيلو', lastNormalizedPrice: 324.00,
          lastDate: '2026-09-30', lastSupplierId: 's2', lastSupplier: 'أشرف سعفان', lastQty: 1, lastInvoice: 'PUR-286017',
          prevPrice: 324, prevUomName: 'كجم', prevNormalizedPrice: 324.00,
          prevDate: '2026-09-29', prevSupplierId: 's2', prevSupplier: 'أشرف سعفان', prevQty: 25, prevInvoice: 'PUR-286004',
          diff: 0.00, diffPct: 0.0, isDifferentUom: true, isAnomaly: false, anomalyReason: ''
        },
        {
          productId: 'p3', productName: 'لوز امريكي', productSku: '10101-0081', categoryId: 'c1', categoryName: 'خامات الحلويات الأولية',
          baseUnit: 'kg',
          lastPrice: 12250, lastUomName: 'شيكارة 25 كجم', lastNormalizedPrice: 490.00,
          lastDate: '2026-10-04', lastSupplierId: 's3', lastSupplier: 'شركة مكة', lastQty: 5, lastInvoice: 'PUR-286053',
          prevPrice: 520, prevUomName: 'كجم', prevNormalizedPrice: 520.00,
          prevDate: '2026-09-28', prevSupplierId: 's3', prevSupplier: 'شركة مكة', prevQty: 50, prevInvoice: 'PUR-285990',
          diff: -30.00, diffPct: -5.77, isDifferentUom: true, isAnomaly: false, anomalyReason: ''
        }
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = 
        effectiveOrgId || 
        currentSelectedOrgId || 
        (currentUser as any)?.organization_id || 
        user?.user_metadata?.org_id;

      // 1. جلب جدول الوحدات (UOMs) لحساب النسب التناسبية وتوحيد المقارنة بدقة رياضية
      let uomsQuery = supabase
        .from('uoms')
        .select('id, name, ratio, uom_type, category_id, is_base, organization_id');

      if (userOrgId) {
        uomsQuery = uomsQuery.or(`organization_id.eq.${userOrgId},organization_id.is.null`);
      }

      let { data: uomsData } = await uomsQuery;
      // إذا لم يُرجع نتائج نكرر بدون شرط المنظمة لضمان جلب كافة الوحدات العامة والمشتركة
      if (!uomsData || uomsData.length === 0) {
        const { data: fallbackUoms } = await supabase.from('uoms').select('*');
        uomsData = fallbackUoms || [];
      }

      const uomMap = new Map<string, { id: string; name: string; ratio: number; uom_type: string }>();
      (uomsData || []).forEach(u => {
        let r = Number(u.ratio) || 1;
        if (r <= 0) r = 1;
        uomMap.set(u.id, { id: u.id, name: (u.name || '').trim(), ratio: r, uom_type: u.uom_type || 'bigger' });
      });

      // 2. تحليل المشتريات (التبويب الأول)
      let analysisQuery = supabase
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
        .gte('purchase_invoices.invoice_date', startDate)
        .lte('purchase_invoices.invoice_date', endDate)
        .in('purchase_invoices.status', ['posted', 'paid']);

      if (userOrgId) {
        analysisQuery = analysisQuery.eq('purchase_invoices.organization_id', userOrgId);
      }

      const { data, error } = await analysisQuery;
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
      // نجلب بنود الفواتير مع ربط جدول الوحدات uoms:uom_id مباشرة لحل اسم الوحدة ومضاعفها الفعلي
      let allItemsQuery = supabase
        .from('purchase_invoice_items')
        .select(`
          id,
          quantity,
          unit_price,
          uom_id,
          product_id,
          purchase_invoice_id,
          uoms:uom_id (
            id,
            name,
            ratio,
            uom_type
          ),
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
            purchase_uom_id,
            category_id,
            item_categories:category_id (id, name)
          )
        `)
        .in('purchase_invoices.status', ['posted', 'paid']);

      if (userOrgId) {
        allItemsQuery = allItemsQuery.eq('purchase_invoices.organization_id', userOrgId);
      }

      const { data: allItems, error: allErr } = await allItemsQuery;
      if (allErr) throw allErr;

      // فرز البنود تنازلياً حسب تاريخ الفاتورة ورقمها في الذاكرة لضمان التقاط آخر عمليتي شراء حقيقيتين 100%
      const sortedItems = [...(allItems || [])].sort((a: any, b: any) => {
        const invA: any = Array.isArray(a.purchase_invoices) ? a.purchase_invoices[0] : a.purchase_invoices;
        const invB: any = Array.isArray(b.purchase_invoices) ? b.purchase_invoices[0] : b.purchase_invoices;
        const dateA = invA?.invoice_date || '';
        const dateB = invB?.invoice_date || '';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        const numA = invA?.invoice_number || a.id || '';
        const numB = invB?.invoice_number || b.id || '';
        return numB.localeCompare(numA);
      });

      // تجميع آخر عمليتي شراء لكل صنف
      const productPurchasesMap: Record<string, Array<{
        price: number;
        uomId: string | null;
        uomDirect: { id: string; name: string; ratio: number; uom_type: string } | null;
        date: string;
        supplierId: string;
        supplier: string;
        qty: number;
        invoice: string;
      }>> = {};

      sortedItems.forEach((item: Record<string, any>) => {
        if (!item.products || !item.purchase_invoices) return;
        const pid = item.product_id;
        if (!productPurchasesMap[pid]) productPurchasesMap[pid] = [];
        if (productPurchasesMap[pid].length < 2) {
          const uomRel = Array.isArray(item.uoms) ? item.uoms[0] : item.uoms;
          const invObj: any = Array.isArray(item.purchase_invoices) ? item.purchase_invoices[0] : item.purchase_invoices;
          const supObj: any = Array.isArray(invObj?.suppliers) ? invObj.suppliers[0] : invObj?.suppliers;

          productPurchasesMap[pid].push({
            price: Number(item.unit_price || 0),
            uomId: item.uom_id || null,
            uomDirect: uomRel ? {
              id: uomRel.id,
              name: (uomRel.name || '').trim(),
              ratio: Number(uomRel.ratio) || 1,
              uom_type: uomRel.uom_type || 'bigger',
            } : null,
            date: invObj?.invoice_date || '',
            supplierId: invObj?.supplier_id || '',
            supplier: supObj?.name || 'غير محدد',
            qty: Number(item.quantity || 0),
            invoice: invObj?.invoice_number || '-',
          });
        }
      });

      // بناء صفوف المقارنة الموحدة تناسبياً
      const rows: PriceComparisonRow[] = [];
      Object.entries(productPurchasesMap).forEach(([pid, purchases]) => {
        if (purchases.length < 2) return;

        const anyItem = sortedItems.find((i: Record<string, unknown>) => i.product_id === pid) as Record<string, any> | undefined;
        if (!anyItem?.products) return;

        const prod = Array.isArray(anyItem.products) ? anyItem.products[0] : anyItem.products;
        if (!prod) return;

        const baseUnitName = (prod.unit || 'وحدة').trim();
        const baseUomId = prod.base_uom_id;

        const [last, prev] = purchases;

        // دالة تحديد الوحدة الدقيقة للبند مع معامل التحويل
        const resolveUom = (p: { uomId: string | null; uomDirect: { id: string; name: string; ratio: number; uom_type: string } | null }) => {
          // 1. الكائن المباشر المجلوب من الفاتورة عبر uoms:uom_id
          if (p.uomDirect && p.uomDirect.name) {
            return p.uomDirect;
          }
          // 2. البحث في خريطة الوحدات الشاملة بمعرف uom_id
          if (p.uomId && uomMap.has(p.uomId)) {
            return uomMap.get(p.uomId)!;
          }
          // 3. الوحدة الأساسية للصنف
          if (baseUomId && uomMap.has(baseUomId)) {
            const baseObj = uomMap.get(baseUomId)!;
            return { id: baseObj.id, name: baseObj.name || baseUnitName, ratio: 1, uom_type: 'reference' };
          }
          // 4. الوحدة النصية المحفوظة مع الصنف
          return { id: '', name: baseUnitName, ratio: 1, uom_type: 'reference' };
        };

        const lastUomInfo = resolveUom(last);
        const prevUomInfo = resolveUom(prev);

        const lastNorm = computeNormalizedPrice(last.price, lastUomInfo, baseUnitName);
        const prevNorm = computeNormalizedPrice(prev.price, prevUomInfo, baseUnitName);

        const lastNormPrice = lastNorm.normalizedPrice;
        const prevNormPrice = prevNorm.normalizedPrice;

        const diff = Number((lastNormPrice - prevNormPrice).toFixed(4));
        const diffPct = prevNormPrice > 0 ? Number(((diff / prevNormPrice) * 100).toFixed(2)) : 0;
        const isDifferentUom = (lastNorm.uomName.trim().toLowerCase() !== prevNorm.uomName.trim().toLowerCase());

        // 🛡️ كاشف الفروق الشاذة الذكي (Anomaly Detection):
        // إذا كان التغير السعري كبيراً جداً بدون توحيد وحدات، أو إذا كان الفرق كبيراً بشكل غير طبيعي
        let isAnomaly = false;
        let anomalyReason = '';

        if (diffPct >= 100 && !isDifferentUom) {
          isAnomaly = true;
          const multiple = Math.round(lastNormPrice / prevNormPrice);
          anomalyReason = `تنبيه: فرق شاذ (+${diffPct.toFixed(0)}%). الأرجح أن سعر الفاتورة (${last.price.toLocaleString()} ج.م) يمثل سعر كرتونة/شيكارة كاملة (حوالي ${multiple} أضعاف الوحدة) تم إدخالها بالخطأ كوحدة فردية.`;
        } else if (diffPct <= -60 && !isDifferentUom) {
          isAnomaly = true;
          const multiple = Math.round(prevNormPrice / lastNormPrice);
          anomalyReason = `تنبيه: فرق شاذ (${diffPct.toFixed(0)}%). الأرجح أن الفاتورة السابقة كانت مسجلة بسعر كرتونة/طرد كامل (حوالي ${multiple} أضعاف الوحدة) بينما الحالية مسجلة بسعر التجزئة.`;
        }

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
          lastUomName: lastNorm.uomName,
          lastNormalizedPrice: lastNormPrice,
          lastDate: last.date,
          lastSupplierId: last.supplierId,
          lastSupplier: last.supplier,
          lastQty: last.qty,
          lastInvoice: last.invoice,

          // السابق
          prevPrice: prev.price,
          prevUomName: prevNorm.uomName,
          prevNormalizedPrice: prevNormPrice,
          prevDate: prev.date,
          prevSupplierId: prev.supplierId,
          prevSupplier: prev.supplier,
          prevQty: prev.qty,
          prevInvoice: prev.invoice,

          // المقارنة العادلة
          diff,
          diffPct,
          isDifferentUom,
          isAnomaly,
          anomalyReason,
        });
      });

      // ترتيب افتراضي: الفروق الأكثر تأثيراً أولاً مع وضع الشواذ في النهاية إذا فُعّل عرضها
      rows.sort((a, b) => {
        if (a.isAnomaly !== b.isAnomaly) return a.isAnomaly ? 1 : -1;
        return Math.abs(b.diffPct) - Math.abs(a.diffPct);
      });
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

        // 🛡️ فلتر صمام الأمان (استبعاد الشواذ لحمايتك)
        const matchAnomaly = 
          anomalyFilter === 'all' ? true :
          anomalyFilter === 'normal_only' ? !r.isAnomaly :
          r.isAnomaly;

        return matchSearch && matchSupplier && matchCategory && matchChange && matchUom && matchAnomaly;
      })
      .sort((a, b) => {
        let av = 0, bv = 0;
        if (sortBy === 'name')    { return sortDir === 'asc' ? a.productName.localeCompare(b.productName) : b.productName.localeCompare(a.productName); }
        if (sortBy === 'date')    { return sortDir === 'asc' ? a.lastDate.localeCompare(b.lastDate) : b.lastDate.localeCompare(a.lastDate); }
        if (sortBy === 'diff')    { av = a.diff; bv = b.diff; }
        if (sortBy === 'diffPct') { av = a.diffPct; bv = b.diffPct; }
        return sortDir === 'desc' ? bv - av : av - bv;
      });
  }, [priceComparison, searchTerm, supplierFilter, categoryFilter, changeFilter, uomFilter, anomalyFilter, sortBy, sortDir]);

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
    setAnomalyFilter('normal_only');
    setSortBy('diffPct');
    setSortDir('desc');
  };

  const hasActiveFilters = Boolean(
    searchTerm || supplierFilter !== 'all' || categoryFilter !== 'all' || changeFilter !== 'all' || uomFilter !== 'all' || anomalyFilter !== 'normal_only'
  );

  // إحصائيات المقارنة الفورية
  const priceStats = useMemo(() => {
    const list = priceComparison;
    return {
      total: list.length,
      normalTotal: list.filter(r => !r.isAnomaly).length,
      increased: list.filter(r => !r.isAnomaly && r.diff > 0).length,
      decreased: list.filter(r => !r.isAnomaly && r.diff < 0).length,
      unchanged: list.filter(r => !r.isAnomaly && r.diff === 0).length,
      anomalies: list.filter(r => r.isAnomaly).length,
      diffUoms: list.filter(r => r.isDifferentUom).length,
    };
  }, [priceComparison]);

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
        'حالة الصنف': r.isAnomaly ? `⚠️ فرق شاذ محتمل: ${r.anomalyReason}` : (r.diff > 0 ? 'ارتفاع في السعر' : r.diff < 0 ? 'انخفاض في السعر' : 'ثبات السعر'),
        'حالة وحدات الشراء': r.isDifferentUom ? 'تم توحيد وحدات مختلفة تناسبياً' : 'نفس وحدة الشراء',
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
            مقارنة دقيقة ومحكمة لآخر سعرين شراء مع كشف الأخطاء الشاذة الناتجة عن إدخال سعر العبوة/الشيكارة بدلاً من سعر الوحدة
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
          {activeTab === 'analysis' ? 'تقرير تحليل المشتريات' : 'تقرير مقارنة آخر سعرين شراء (المعتمد المنضبط)'}
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
          مقارنة آخر سعرين شراء (المعتمد)
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
          
          {/* صمام الأمان: صندوق توضيحي لكشف الأخطاء الشاذة */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-amber-50 border border-blue-200/80 rounded-2xl p-4 text-xs text-slate-800 shadow-xs space-y-2 no-print">
            <div className="flex items-center gap-2 text-indigo-900 font-black text-sm">
              <ShieldAlert className="text-indigo-600" size={20} />
              <span>🛡️ صمام الأمان وكاشف الأخطاء الشاذة (Safety Filter & Outlier Protection)</span>
            </div>
            <p className="leading-relaxed text-slate-600">
              التقرير يقوم الآن بكشف أي اختلاف ناتج عن <strong>خطأ في إدخال وحدة الفاتورة</strong> (مثلاً: إدخال سعر شيكارة كريم شانتيه 8,100 ج.م كوحدة كجم بينما السابق 324 ج.م / كجم).
              بشكل افتراضي، يُظهر التقرير <strong>الأسعار الحقيقية الطبيعية فقط</strong> لحمايتك من أي حرج أو أرقام وهمية، مع إمكانية عرض الفواتير التي تحتاج مراجعة وتصحيح.
            </p>
          </div>

          {/* بطاقات الملخص والإحصاء */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 no-print">
            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs text-center">
              <p className="text-xs text-slate-500 font-bold mb-1">المقارنات الطبيعية المعتمدة</p>
              <p className="text-2xl font-black text-slate-800">{priceStats.normalTotal}</p>
              <span className="text-[10px] text-slate-400 font-bold">من أصل {priceStats.total} صنف</span>
            </div>
            <div className="bg-rose-50 rounded-xl p-3.5 border border-rose-200 shadow-xs text-center">
              <div className="flex items-center justify-center gap-1 text-rose-600 mb-1 font-bold text-xs">
                <TrendingUp size={15} /> ارتفاع طبيعي حقيقي
              </div>
              <p className="text-2xl font-black text-rose-700">{priceStats.increased}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3.5 border border-emerald-200 shadow-xs text-center">
              <div className="flex items-center justify-center gap-1 text-emerald-600 mb-1 font-bold text-xs">
                <TrendingDown size={15} /> انخفاض حقيقي
              </div>
              <p className="text-2xl font-black text-emerald-700">{priceStats.decreased}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 shadow-xs text-center">
              <div className="flex items-center justify-center gap-1 text-slate-500 mb-1 font-bold text-xs">
                <Minus size={15} /> أسعار ثابتة
              </div>
              <p className="text-2xl font-black text-slate-600">{priceStats.unchanged}</p>
            </div>
            <div 
              onClick={() => setAnomalyFilter(anomalyFilter === 'anomalies_only' ? 'normal_only' : 'anomalies_only')}
              className={`p-3.5 rounded-xl border shadow-xs text-center cursor-pointer transition-all col-span-2 sm:col-span-1 ${
                anomalyFilter === 'anomalies_only' 
                  ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-300' 
                  : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
              }`}
              title="اضغط لعرض الفواتير التي يوجد بها خطأ في إدخال سعر العبوة/الشيكارة لمراجعتها وتصحيحها"
            >
              <div className="flex items-center justify-center gap-1 mb-1 font-bold text-xs">
                <AlertTriangle size={15} /> أخطاء إدخال بحاجة لتصحيح
              </div>
              <p className="text-2xl font-black">{priceStats.anomalies}</p>
              <span className="text-[10px] font-bold block opacity-90">(انقر لعرضها ومراجعتها)</span>
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
                  <X size={13} /> استعادة الوضع الافتراضي المنضبط
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

            {/* صف فلاتر صمام الأمان وتطابق الوحدات */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                {/* خيار صمام الأمان */}
                <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 ml-1">عرض البيانات:</span>
                  <button
                    type="button"
                    onClick={() => setAnomalyFilter('normal_only')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                      anomalyFilter === 'normal_only' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <CheckCircle2 size={13} /> الفروق الحقيقية الطبيعية فقط (آمن للإدارة)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnomalyFilter('anomalies_only')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                      anomalyFilter === 'anomalies_only' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    <AlertTriangle size={13} /> الفواتير الشاذة للمراجعة والتصحيح ({priceStats.anomalies})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnomalyFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      anomalyFilter === 'all' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    الكل بلا استثناء
                  </button>
                </div>

                {/* خيار تطابق الوحدات */}
                <div className="flex items-center gap-2 text-slate-500 font-bold">
                  <span>الوحدات:</span>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="uomFilter" checked={uomFilter === 'all'} onChange={() => setUomFilter('all')} />
                    <span>الكل</span>
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="uomFilter" checked={uomFilter === 'same_uom'} onChange={() => setUomFilter('same_uom')} />
                    <span>نفس الوحدة</span>
                  </label>
                </div>
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
                      📊 المقارنة المعتمدة
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
                    const rowBg = row.isAnomaly 
                      ? 'bg-amber-50/70 hover:bg-amber-100/60'
                      : isUp ? 'hover:bg-rose-50/60' : isDown ? 'hover:bg-emerald-50/60' : 'hover:bg-slate-50';

                    return (
                      <tr key={row.productId} className={`transition ${rowBg}`}>
                        {/* الصنف والتصنيف */}
                        <td className="p-3 font-bold text-slate-800">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{row.productName}</span>
                            {row.isAnomaly ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-200 text-amber-900 border border-amber-300 shadow-2xs" title={row.anomalyReason}>
                                <AlertTriangle size={11} /> خطأ إدخال محتمل
                              </span>
                            ) : row.isDifferentUom ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="تم توحيد وحدات شراء مختلفة بنجاح وفق معادلة تناسبية">
                                موحد تناسبياً ⚖️
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-normal mt-0.5">
                            <span className="font-mono">{row.productSku}</span>
                            <span>•</span>
                            <span className="text-slate-500 font-bold">{row.categoryName}</span>
                          </div>
                          {row.isAnomaly && (
                            <div className="text-[10px] text-amber-900 font-medium bg-white/80 p-1 rounded mt-1 border border-amber-200">
                              💡 {row.anomalyReason}
                            </div>
                          )}
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
                        <td className={`p-2 text-center font-mono font-black border-r border-orange-100 text-[12px] ${
                          row.isAnomaly ? 'text-amber-800' : isUp ? 'text-rose-600' : isDown ? 'text-emerald-600' : 'text-slate-400'
                        }`}>
                          {isUp ? '+' : ''}{row.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          <span className="block text-[9px] font-normal text-slate-400">ج.م/{row.baseUnit}</span>
                        </td>
                        <td className="p-2 text-center">
                          {row.isAnomaly ? (
                            <span className="inline-flex items-center gap-1 bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full font-black text-[11px]" title={row.anomalyReason}>
                              <AlertTriangle size={11} /> {row.diffPct > 0 ? `+${row.diffPct.toFixed(0)}%` : `${row.diffPct.toFixed(0)}%`} ⚠️
                            </span>
                          ) : isUp ? (
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
                          : 'لا توجد نتائج تطابق معايير الفلاتر المحددة حالياً. يمكنك تغيير خيارات الفلترة أو الضغط على "استعادة الوضع الافتراضي".'}
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