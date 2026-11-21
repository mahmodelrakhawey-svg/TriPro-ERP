import { logger } from '../../utils/logger';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  ArrowRightLeft, TrendingUp, Calendar, Warehouse, Package, 
  Search, Download, Printer, Loader2, Filter, Sparkles, 
  AlertTriangle, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight, 
  Layers, Sliders, RefreshCw, Info, FileSpreadsheet, ChevronRight, 
  TrendingDown, ShieldAlert, Zap, Box, BarChart3, HelpCircle, Eye,
  PlusCircle, Play, RotateCcw
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Cell 
} from 'recharts';
import * as XLSX from 'xlsx';
import ProductSearchSelect, { getProductWarehouseStock } from '../../components/ProductSearchSelect';
import ReportHeader from '../../components/ReportHeader';
import { fetchCompleteDataset } from '../../services/balanceService';

// يوم في الأسبوع باللغة العربية
const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export interface DailyPoint {
  date: string;
  dayName: string;
  dayOfWeek: number;
  quantity: number;
  transferCount: number;
  transferNumbers: string[];
  notes: string[];
  deviationFromAvg: number;
  isPeak: boolean;
  status: 'above' | 'below' | 'exact' | 'zero';
}

export interface ItemVelocitySummary {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  unit: string;
  totalTransferred: number;
  activeDaysCount: number;
  totalDaysCount: number;
  dailyAverageAllDays: number;
  dailyAverageActiveDays: number;
  peakDailyQty: number;
  peakDate: string;
  minDailyQty: number;
  stdDev: number;
  volatilityRate: number; // CV = stdDev / avg
  volatilityLabel: 'منتظم ومستقر' | 'متوسط الاستقرار' | 'شديد التذبذب';
  trend: 'increasing' | 'stable' | 'decreasing';
  trendPct: number;
  currentSourceStock: number;
  currentDestStock: number;
  daysOfSupply: number;
  projectedNeed7d: number;
  projectedNeed14d: number;
  projectedNeed30d: number;
  deficit7d: number;
  deficit30d: number;
  urgencyStatus: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  dailyPoints: DailyPoint[];
}

export interface DayOfWeekStat {
  dayName: string;
  dayIndex: number;
  totalQty: number;
  avgQty: number;
  occurrences: number;
}

const DailyTransferVelocityReport: React.FC = () => {
  const { 
    currentUser, 
    warehouses, 
    products, 
    categories, 
    selectedFiscalYear, 
    fiscalYearRange,
    settings 
  } = useAccounting();
  const { showToast } = useToast();

  // الفلاتر الرئيسية
  const [fromWarehouseId, setFromWarehouseId] = useState<string>('ALL');
  const [toWarehouseId, setToWarehouseId] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>(() => {
    // افتراضياً آخر 30 يوماً
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [avgMethod, setAvgMethod] = useState<'calendar_days' | 'active_days'>('calendar_days');
  const [statusFilter, setStatusFilter] = useState<'posted' | 'all'>('posted');

  // محرك التنبؤ بالمستقبل
  const [planningHorizonDays, setPlanningHorizonDays] = useState<number>(14); // الافتراضي 14 يوماً
  const [safetyBufferPct, setSafetyBufferPct] = useState<number>(15); // الافتراضي 15% مخزون أمان

  // نمط العرض (تبويبات)
  const [activeTab, setActiveTab] = useState<'single_item' | 'all_items'>('single_item');

  // وضع المحاكاة التوضيحي (Interactive Simulation Mode)
  const [simulationMode, setSimulationMode] = useState<boolean>(false);
  const navigate = useNavigate();

  // بيانات التقرير والتحميل
  const [loading, setLoading] = useState<boolean>(false);
  const [rawTransfers, setRawTransfers] = useState<Array<Record<string, any>>>([]);

  // مزامنة التواريخ مع السنة المالية عند تغييرها
  useEffect(() => {
    if (selectedFiscalYear) {
      const yearStart = `${selectedFiscalYear}-01-01`;
      const yearEnd = `${selectedFiscalYear}-12-31`;
      // إذا كان النطاق الحالي خارج السنة المختارة، نعيد ضبطه
      if (startDate < yearStart || endDate > yearEnd) {
        setStartDate(yearStart);
        setEndDate(yearEnd);
      }
    }
  }, [selectedFiscalYear]);

  // جلب البيانات من الخادم
  const fetchTransfers = async () => {
    setLoading(true);

    // 1. وضع المحاكاة والعرض التجريبي (Demo Mode or Simulation Active)
    if (currentUser?.role === 'demo' || simulationMode) {
      const demoData = generateLinzaDemoTransfers(
        startDate, 
        endDate, 
        warehouses, 
        products,
        fromWarehouseId,
        toWarehouseId,
        selectedCategory
      );
      setRawTransfers(demoData);
      setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      const dataset = await fetchCompleteDataset<any>(async (from, to) => {
        let query = supabase
          .from('stock_transfers')
          .select(`
            id,
            transfer_number,
            transfer_date,
            from_warehouse_id,
            to_warehouse_id,
            status,
            notes,
            organization_id,
            stock_transfer_items (
              id,
              quantity,
              uom_id,
              product_id,
              products (id, name, sku, unit, category_id, warehouse_stock, stock)
            )
          `)
          .gte('transfer_date', startDate)
          .lte('transfer_date', endDate)
          .order('transfer_date', { ascending: false });

        if (userOrgId) {
          query = query.eq('organization_id', userOrgId);
        }

        if (statusFilter === 'posted') {
          query = query.neq('status', 'cancelled');
        }

        if (fromWarehouseId !== 'ALL') {
          query = query.eq('from_warehouse_id', fromWarehouseId);
        }

        if (toWarehouseId !== 'ALL') {
          query = query.eq('to_warehouse_id', toWarehouseId);
        }

        return query.range(from, to);
      });

      const flattened: Array<Record<string, any>> = [];
      (dataset || []).forEach(transfer => {
        const isCancelled = transfer.status === 'cancelled';
        if (statusFilter === 'posted' && isCancelled) return;
        if (transfer.stock_transfer_items && Array.isArray(transfer.stock_transfer_items)) {
          transfer.stock_transfer_items.forEach((item: Record<string, unknown>) => {
            if (selectedProductId !== 'ALL' && (item.product_id as string) !== selectedProductId) return;
            flattened.push({
              id: item.id,
              quantity: item.quantity,
              uom_id: item.uom_id,
              product_id: item.product_id,
              products: item.products,
              stock_transfers: {
                id: transfer.id,
                transfer_number: transfer.transfer_number,
                transfer_date: transfer.transfer_date,
                from_warehouse_id: transfer.from_warehouse_id,
                to_warehouse_id: transfer.to_warehouse_id,
                status: transfer.status,
                notes: transfer.notes,
                organization_id: transfer.organization_id
              }
            });
          });
        }
      });

      setRawTransfers(flattened);
    } catch (error: unknown) {
      logger.error('Error fetching transfer velocity data:', error);
      const errMsg = error instanceof Error ? error.message : 'حدث خطأ أثناء تحميل بيانات التحويلات';
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, [startDate, endDate, fromWarehouseId, toWarehouseId, selectedProductId, statusFilter, simulationMode, selectedCategory]);

  // توليد قائمة بجميع أيام الفترة المحددة بالتسلسل (YYYY-MM-DD)
  const allDaysList = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [];
    const days: string[] = [];
    const curr = new Date(startDate);
    const stop = new Date(endDate);
    while (curr <= stop) {
      days.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [startDate, endDate]);

  // معالجة وتحليل البيانات لجميع الأصناف
  const itemsSummaries = useMemo<ItemVelocitySummary[]>(() => {
    if (!allDaysList.length) return [];

    // تجميع الحركات حسب الصنف
    const itemMap = new Map<string, {
      product: Record<string, any>;
      dailyQuantities: Map<string, { qty: number; transferNumbers: Set<string>; notes: Set<string> }>;
    }>();

    rawTransfers.forEach(record => {
      const prod = record.products;
      if (!prod) return;
      const pid = prod.id || record.product_id;
      if (!pid) return;

      // تحديد اسم التصنيف بدقة بالاعتماد على category_id أو category
      const prodCategoryName = categories.find(c => c.id === prod.category_id || c.name === prod.category)?.name || prod.category || 'عام';

      // تصفية حسب التصنيف إن وجد
      if (selectedCategory !== 'ALL' && prodCategoryName !== selectedCategory) {
        return;
      }

      if (!itemMap.has(pid)) {
        itemMap.set(pid, {
          product: prod,
          dailyQuantities: new Map()
        });
      }

      const itemEntry = itemMap.get(pid)!;
      const dateStr = record.stock_transfers?.transfer_date;
      if (!dateStr) return;

      const qty = Number(record.quantity) || 0;
      const tNum = record.stock_transfers?.transfer_number;
      const note = record.stock_transfers?.notes;

      if (!itemEntry.dailyQuantities.has(dateStr)) {
        itemEntry.dailyQuantities.set(dateStr, {
          qty: 0,
          transferNumbers: new Set(),
          notes: new Set()
        });
      }

      const dayData = itemEntry.dailyQuantities.get(dateStr)!;
      dayData.qty += qty;
      if (tNum) dayData.transferNumbers.add(tNum);
      if (note && note.trim()) dayData.notes.add(note.trim());
    });

    const totalDaysCount = allDaysList.length;

    // تحويل البيانات لمصفوفة ملخصات الأصناف
    const summaries: ItemVelocitySummary[] = [];

    itemMap.forEach((entry, pid) => {
      const prod = entry.product;
      let totalTransferred = 0;
      let peakDailyQty = 0;
      let peakDate = '';
      let minDailyQty = Infinity;
      let activeDaysCount = 0;

      // حساب كميات كل يوم
      const rawDailyList: { date: string; qty: number; transferNumbers: string[]; notes: string[] }[] = [];

      allDaysList.forEach(dStr => {
        const dData = entry.dailyQuantities.get(dStr);
        const qty = dData ? dData.qty : 0;
        totalTransferred += qty;
        if (qty > 0) {
          activeDaysCount++;
          if (qty > peakDailyQty) {
            peakDailyQty = qty;
            peakDate = dStr;
          }
          if (qty < minDailyQty) {
            minDailyQty = qty;
          }
        }
        rawDailyList.push({
          date: dStr,
          qty,
          transferNumbers: dData ? Array.from(dData.transferNumbers) : [],
          notes: dData ? Array.from(dData.notes) : []
        });
      });

      if (minDailyQty === Infinity) minDailyQty = 0;

      const dailyAverageAllDays = totalDaysCount > 0 ? (totalTransferred / totalDaysCount) : 0;
      const dailyAverageActiveDays = activeDaysCount > 0 ? (totalTransferred / activeDaysCount) : 0;
      const baselineAvg = avgMethod === 'active_days' ? dailyAverageActiveDays : dailyAverageAllDays;

      // حساب الانحراف المعياري وسلوك الصنف (Standard Deviation & Volatility)
      let sumSquaredDiff = 0;
      rawDailyList.forEach(item => {
        const diff = item.qty - dailyAverageAllDays;
        sumSquaredDiff += diff * diff;
      });
      const variance = totalDaysCount > 0 ? (sumSquaredDiff / totalDaysCount) : 0;
      const stdDev = Math.sqrt(variance);
      const volatilityRate = dailyAverageAllDays > 0 ? (stdDev / dailyAverageAllDays) : 0;

      let volatilityLabel: 'منتظم ومستقر' | 'متوسط الاستقرار' | 'شديد التذبذب' = 'منتظم ومستقر';
      if (volatilityRate > 0.75) {
        volatilityLabel = 'شديد التذبذب';
      } else if (volatilityRate > 0.35) {
        volatilityLabel = 'متوسط الاستقرار';
      }

      // تحليل الاتجاه (Trend): مقارنة النصف الأول بالنصف الثاني من الفترة
      const halfIndex = Math.floor(allDaysList.length / 2);
      const firstHalfTotal = rawDailyList.slice(0, halfIndex).reduce((acc, curr) => acc + curr.qty, 0);
      const secondHalfTotal = rawDailyList.slice(halfIndex).reduce((acc, curr) => acc + curr.qty, 0);
      const halfDays = halfIndex > 0 ? halfIndex : 1;
      const firstHalfAvg = firstHalfTotal / halfDays;
      const secondHalfAvg = secondHalfTotal / (allDaysList.length - halfIndex || 1);

      let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      let trendPct = 0;
      if (firstHalfAvg > 0) {
        trendPct = Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100);
        if (trendPct >= 15) trend = 'increasing';
        else if (trendPct <= -15) trend = 'decreasing';
      } else if (secondHalfAvg > 0) {
        trend = 'increasing';
        trendPct = 100;
      }

      // تجهيز نقاط الرسم البياني لكل يوم
      const dailyPoints: DailyPoint[] = rawDailyList.map(item => {
        const dateObj = new Date(item.date);
        const dayOfWeek = dateObj.getDay();
        const dayName = ARABIC_DAYS[dayOfWeek];
        const deviationFromAvg = Math.round((item.qty - baselineAvg) * 10) / 10;
        let status: 'above' | 'below' | 'exact' | 'zero' = 'zero';
        if (item.qty === 0) status = 'zero';
        else if (item.qty > baselineAvg) status = 'above';
        else if (item.qty < baselineAvg) status = 'below';
        else status = 'exact';

        return {
          date: item.date,
          dayName,
          dayOfWeek,
          quantity: item.qty,
          transferCount: item.transferNumbers.length,
          transferNumbers: item.transferNumbers,
          notes: item.notes,
          deviationFromAvg,
          isPeak: item.qty === peakDailyQty && peakDailyQty > 0,
          status
        };
      });

      // الرصيد الحالي بالمخازن
      const fullProd = products.find(p => p.id === pid) || prod;
      const currentSourceStock = fromWarehouseId !== 'ALL' 
        ? getProductWarehouseStock(fullProd, fromWarehouseId) 
        : Number(fullProd.stock ?? 0);
      const currentDestStock = toWarehouseId !== 'ALL' 
        ? getProductWarehouseStock(fullProd, toWarehouseId) 
        : 0;

      // الأيام المتبقية قبل نفاد المخزون المصدر
      const daysOfSupply = baselineAvg > 0 ? (currentSourceStock / baselineAvg) : 999;

      // التنبؤ بالاحتياجات المستقبلية
      const projectedNeed7d = Math.ceil(baselineAvg * 7 * (1 + safetyBufferPct / 100));
      const projectedNeed14d = Math.ceil(baselineAvg * 14 * (1 + safetyBufferPct / 100));
      const projectedNeed30d = Math.ceil(baselineAvg * 30 * (1 + safetyBufferPct / 100));

      const deficit7d = currentSourceStock < projectedNeed7d ? (projectedNeed7d - currentSourceStock) : 0;
      const deficit30d = currentSourceStock < projectedNeed30d ? (projectedNeed30d - currentSourceStock) : 0;

      let urgencyStatus: 'CRITICAL' | 'WARNING' | 'HEALTHY' = 'HEALTHY';
      if (daysOfSupply < 7 || deficit7d > 0) {
        urgencyStatus = 'CRITICAL';
      } else if (daysOfSupply < 15 || deficit30d > 0) {
        urgencyStatus = 'WARNING';
      }

      summaries.push({
        productId: pid,
        productName: prod.name || 'صنف غير معروف',
        sku: prod.sku || '-',
        category: categories.find(c => c.id === prod.category_id || c.name === prod.category)?.name || prod.category || 'عام',
        unit: prod.unit || 'وحدة',
        totalTransferred,
        activeDaysCount,
        totalDaysCount,
        dailyAverageAllDays: Math.round(dailyAverageAllDays * 100) / 100,
        dailyAverageActiveDays: Math.round(dailyAverageActiveDays * 100) / 100,
        peakDailyQty,
        peakDate,
        minDailyQty,
        stdDev: Math.round(stdDev * 100) / 100,
        volatilityRate: Math.round(volatilityRate * 100) / 100,
        volatilityLabel,
        trend,
        trendPct,
        currentSourceStock,
        currentDestStock,
        daysOfSupply: Math.round(daysOfSupply * 10) / 10,
        projectedNeed7d,
        projectedNeed14d,
        projectedNeed30d,
        deficit7d,
        deficit30d,
        urgencyStatus,
        dailyPoints
      });
    });

    // فرز الأصناف حسب إجمالي الكمية المحولة تنازلياً
    return summaries.sort((a, b) => b.totalTransferred - a.totalTransferred);
  }, [rawTransfers, allDaysList, selectedCategory, avgMethod, products, fromWarehouseId, toWarehouseId, safetyBufferPct]);

  // الصنف المختار حالياً للعرض التفصيلي
  const activeItemSummary = useMemo<ItemVelocitySummary | null>(() => {
    if (!itemsSummaries.length) return null;
    if (selectedProductId !== 'ALL') {
      const found = itemsSummaries.find(i => i.productId === selectedProductId);
      if (found) return found;
    }
    // إذا كان المختار ALL، نأخذ أعلى صنف تم تحويله كصنف افتراضي للعرض التفصيلي
    return itemsSummaries[0];
  }, [itemsSummaries, selectedProductId]);

  // إذا تم اختيار صنف من القائمة المنسدلة، تحويل التبويب تلقائياً للتحليل التفصيلي
  useEffect(() => {
    if (selectedProductId !== 'ALL') {
      setActiveTab('single_item');
    }
  }, [selectedProductId]);

  // حساب نمط أيام الأسبوع للصنف النشط (أي أيام الأسبوع تشهد أعلى سحب)
  const dayOfWeekStats = useMemo<DayOfWeekStat[]>(() => {
    if (!activeItemSummary) return [];
    const stats: DayOfWeekStat[] = ARABIC_DAYS.map((dayName, idx) => ({
      dayName,
      dayIndex: idx,
      totalQty: 0,
      avgQty: 0,
      occurrences: 0
    }));

    activeItemSummary.dailyPoints.forEach(p => {
      const s = stats[p.dayOfWeek];
      if (s) {
        s.totalQty += p.quantity;
        s.occurrences += 1;
      }
    });

    stats.forEach(s => {
      s.avgQty = s.occurrences > 0 ? Math.round((s.totalQty / s.occurrences) * 10) / 10 : 0;
    });

    return stats;
  }, [activeItemSummary]);

  // حساب محاكي التنبؤ للاحتياج المستقبلي للصنف النشط
  const forecastSimulation = useMemo(() => {
    if (!activeItemSummary) return null;
    const baseDailyRate = avgMethod === 'active_days' 
      ? activeItemSummary.dailyAverageActiveDays 
      : activeItemSummary.dailyAverageAllDays;

    const baseNeed = Math.round(baseDailyRate * planningHorizonDays * 10) / 10;
    const bufferQty = Math.round((baseNeed * (safetyBufferPct / 100)) * 10) / 10;
    const totalRequired = Math.ceil(baseNeed + bufferQty);
    const available = activeItemSummary.currentSourceStock;
    const balanceAfterHorizon = Math.round((available - totalRequired) * 10) / 10;
    const isDeficit = balanceAfterHorizon < 0;
    const shortageQty = isDeficit ? Math.abs(balanceAfterHorizon) : 0;
    const coverageDays = baseDailyRate > 0 ? Math.round((available / baseDailyRate) * 10) / 10 : 999;

    return {
      baseDailyRate,
      planningHorizonDays,
      safetyBufferPct,
      baseNeed,
      bufferQty,
      totalRequired,
      available,
      balanceAfterHorizon,
      isDeficit,
      shortageQty,
      coverageDays
    };
  }, [activeItemSummary, planningHorizonDays, safetyBufferPct, avgMethod]);

  // إحصائيات عامة لكافة الأصناف
  const aggregateKpis = useMemo(() => {
    const totalTransfersQty = itemsSummaries.reduce((acc, curr) => acc + curr.totalTransferred, 0);
    const totalActiveItems = itemsSummaries.length;
    const criticalItems = itemsSummaries.filter(i => i.urgencyStatus === 'CRITICAL').length;
    const warningItems = itemsSummaries.filter(i => i.urgencyStatus === 'WARNING').length;

    return {
      totalTransfersQty,
      totalActiveItems,
      criticalItems,
      warningItems
    };
  }, [itemsSummaries]);

  // أزرار الفترات الزمنية السريعة
  const handleQuickDate = (type: '7d' | '14d' | '30d' | 'this_month' | 'last_month' | 'fiscal_year') => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (type === '7d') {
      start.setDate(today.getDate() - 6);
    } else if (type === '14d') {
      start.setDate(today.getDate() - 13);
    } else if (type === '30d') {
      start.setDate(today.getDate() - 29);
    } else if (type === 'this_month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (type === 'last_month') {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (type === 'fiscal_year') {
      const year = selectedFiscalYear || today.getFullYear();
      start = new Date(Number(year), 0, 1);
      end = new Date(Number(year), 11, 31);
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // تصدير البيانات إلى Excel
  const handleExportExcel = () => {
    if (!itemsSummaries.length) {
      showToast('لا توجد بيانات متاحة للتصدير', 'warning');
      return;
    }

    const fromWhName = warehouses.find(w => w.id === fromWarehouseId)?.name || 'جميع المستودعات';
    const toWhName = warehouses.find(w => w.id === toWarehouseId)?.name || 'جميع المستودعات';

    // 1. ورقة مصفوفة الأصناف وتوقعات الاحتياج
    const matrixRows = [
      ['تقرير معدل التحويل والصرف اليومي بين المخازن وتحليل سلوك الأصناف'],
      ['من مخزن:', fromWhName, 'إلى مخزن:', toWhName],
      ['الفترة من:', startDate, 'إلى:', endDate],
      ['طريقة احتساب المتوسط:', avgMethod === 'active_days' ? 'على أيام الصرف الفعلية فقط' : 'على كامل أيام الفترة'],
      ['أفق التخطيط المستقبلي:', `${planningHorizonDays} يوماً`, 'نسبة مخزون الأمان:', `${safetyBufferPct}%`],
      [''],
      [
        '#',
        'كود الصنف (SKU)',
        'اسم الصنف',
        'التصنيف',
        'الوحدة',
        'إجمالي المنصرف',
        'متوسط الصرف اليومي',
        'أيام الصرف النشطة',
        'أعلى صرف في يوم',
        'تاريخ الذروة',
        'الرصيد بمخزن المصدر',
        'أيام التغطية المتبقية',
        `احتياج ${planningHorizonDays} يوم القادمة`,
        'حالة العجز / الأمان',
        'نمط وسلوك الاستهلاك'
      ]
    ];

    itemsSummaries.forEach((item, idx) => {
      matrixRows.push([
        (idx + 1).toString(),
        item.sku,
        item.productName,
        item.category,
        item.unit,
        item.totalTransferred.toString(),
        (avgMethod === 'active_days' ? item.dailyAverageActiveDays : item.dailyAverageAllDays).toString(),
        `${item.activeDaysCount} من ${item.totalDaysCount}`,
        item.peakDailyQty.toString(),
        item.peakDate || '-',
        item.currentSourceStock.toString(),
        item.daysOfSupply > 365 ? 'أكثر من سنة' : `${item.daysOfSupply} يوم`,
        item.projectedNeed14d.toString(),
        item.urgencyStatus === 'CRITICAL' ? 'خطر نفاد وشيك' : item.urgencyStatus === 'WARNING' ? 'رصيد منخفض' : 'آمن ومستقر',
        item.volatilityLabel
      ]);
    });

    // 2. ورقة السجل اليومي المفصل للصنف النشط
    const dailyRows = [
      ['السجل اليومي المفصل لتحويلات الصنف'],
      ['اسم الصنف:', activeItemSummary?.productName || '-', 'الكود:', activeItemSummary?.sku || '-'],
      ['من مخزن:', fromWhName, 'إلى مخزن:', toWhName],
      ['الفترة من:', startDate, 'إلى:', endDate],
      ['متوسط الصرف اليومي:', (activeItemSummary ? (avgMethod === 'active_days' ? activeItemSummary.dailyAverageActiveDays : activeItemSummary.dailyAverageAllDays) : 0).toString()],
      [''],
      ['التاريخ', 'اليوم', 'الكمية المحولة', 'الانحراف عن المتوسط', 'عدد سندات التحويل', 'أرقام السندات', 'ملاحظات التحويل']
    ];

    activeItemSummary?.dailyPoints.forEach(p => {
      dailyRows.push([
        p.date,
        p.dayName,
        p.quantity.toString(),
        p.deviationFromAvg > 0 ? `+${p.deviationFromAvg}` : p.deviationFromAvg.toString(),
        p.transferCount.toString(),
        p.transferNumbers.join(', ') || '-',
        p.notes.join(' | ') || '-'
      ]);
    });

    const wb = XLSX.utils.book_new();
    const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows);
    const wsDaily = XLSX.utils.aoa_to_sheet(dailyRows);

    XLSX.utils.book_append_sheet(wb, wsMatrix, 'مصفوفة الأصناف والتنبؤ');
    XLSX.utils.book_append_sheet(wb, wsDaily, 'السجل اليومي للصنف');

    XLSX.writeFile(wb, `Daily_Transfer_Velocity_${startDate}_to_${endDate}.xlsx`);
    showToast('تم تصدير ملف الإكسيل بنجاح ✅', 'success');
  };

  const getWarehouseName = (id: string) => {
    if (id === 'ALL') return 'جميع المستودعات';
    return warehouses.find(w => w.id === id)?.name || 'غير معروف';
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12 print:p-0">
      {/* ترويسة الطباعة الرسمية */}
      <div className="hidden print:block">
        <ReportHeader 
          title="تقرير معدل التحويل والصرف اليومي وسلوك استهلاك الأصناف" 
          subtitle={`من: ${getWarehouseName(fromWarehouseId)} | إلى: ${getWarehouseName(toWarehouseId)} | للفترة: ${startDate} إلى ${endDate}`} 
        />
      </div>

      {/* رأس الصفحة والإجراءات السريعة (يخفى في الطباعة) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl shadow-md shadow-amber-500/20">
              <ArrowRightLeft size={22} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                معدل التحويل والصرف اليومي بين المخازن
                <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <Sparkles size={12} className="text-amber-600" /> تحليل وسلوك الصنف
                </span>
              </h2>
              <p className="text-slate-500 text-xs mt-0.5">
                تتبع كميات الصرف اليومية، حساب متوسط الاستهلاك اليومي، والتنبؤ الذكي باحتياجات الإنتاج ومخزون الأمان
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <button
            onClick={() => setSimulationMode(!simulationMode)}
            className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              simulationMode
                ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
            }`}
            title="تشغيل / إيقاف بيانات المحاكاة التجريبية لمصنع الحلواني"
          >
            <Sparkles size={14} className={simulationMode ? 'animate-spin' : ''} />
            {simulationMode ? 'إلغاء وضع المحاكاة' : 'وضع المحاكاة (عرض تجريبي)'}
          </button>

          <button
            onClick={fetchTransfers}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-sm"
            title="تحديث البيانات"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : ''} />
            تحديث
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-500/20"
            title="تصدير إلى Excel"
          >
            <FileSpreadsheet size={15} />
            تصدير إكسيل
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-md shadow-slate-800/20"
            title="طباعة التقرير"
          >
            <Printer size={15} />
            طباعة
          </button>
        </div>
      </div>

      {/* لوحة الفلاتر الديناميكية الذكية (تخفى في الطباعة) */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 space-y-4 print:hidden">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-800 font-black text-sm">
            <Filter size={16} className="text-amber-500" />
            <span>فلاتر ومحددات التقرير</span>
          </div>

          {/* أزرار سريعة لاختيار الفترات */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 font-bold ml-1">فترات سريعة:</span>
            <button
              onClick={() => handleQuickDate('7d')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 transition"
            >
              آخر 7 أيام
            </button>
            <button
              onClick={() => handleQuickDate('14d')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 transition"
            >
              آخر 14 يوماً
            </button>
            <button
              onClick={() => handleQuickDate('30d')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 transition"
            >
              آخر 30 يوماً
            </button>
            <button
              onClick={() => handleQuickDate('this_month')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 transition"
            >
              هذا الشهر
            </button>
            <button
              onClick={() => handleQuickDate('last_month')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 transition"
            >
              الشهر السابق
            </button>
            <button
              onClick={() => handleQuickDate('fiscal_year')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 transition"
            >
              السنة المالية
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* من مخزن (Source Warehouse) */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
              <Warehouse size={13} className="text-amber-600" /> من مخزن (المصدر):
            </label>
            <select
              value={fromWarehouseId}
              onChange={(e) => setFromWarehouseId(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
            >
              <option value="ALL">📦 جميع المستودعات المصدر</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* إلى مخزن (Destination Warehouse) */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
              <Warehouse size={13} className="text-emerald-600" /> إلى مخزن (المستلم):
            </label>
            <select
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
            >
              <option value="ALL">📥 جميع المستودعات المستلمة</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* من تاريخ */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-blue-600" /> من تاريخ:
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* إلى تاريخ */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-blue-600" /> إلى تاريخ:
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* طريقة احتساب المتوسط اليومي */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
              <Sliders size={13} className="text-indigo-600" /> أساس احتساب المتوسط:
            </label>
            <select
              value={avgMethod}
              onChange={(e) => setAvgMethod(e.target.value as any)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            >
              <option value="calendar_days">كامل أيام الفترة ({allDaysList.length} يوم)</option>
              <option value="active_days">أيام الصرف الفعلية فقط (النشطة)</option>
            </select>
          </div>
        </div>

        {/* سطر البحث المتقدم واختيار الصنف والتصنيف */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
              <Package size={13} className="text-purple-600" /> الصنف المحدد للتحليل التفصيلي:
            </label>
            <ProductSearchSelect
              products={products}
              value={selectedProductId === 'ALL' ? '' : selectedProductId}
              onChange={(id) => setSelectedProductId(id || 'ALL')}
              placeholder="ابحث باسم الصنف أو الباركود أو الكود... (اتركه فارغاً لعرض كل الأصناف المحولة)"
              showAllOption={true}
              allOptionLabel="📦 جميع الأصناف المحولة (عرض مصفوفة المقارنة)"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
              <Layers size={13} className="text-slate-600" /> تصنيف الصنف:
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:bg-white transition"
            >
              <option value="ALL">جميع التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id || c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* لوحة المؤشرات الإجمالية (KPI Summary Badges) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* إجمالي المنصرف */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold">إجمالي الكمية المنقولة</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              {aggregateKpis.totalTransfersQty.toLocaleString('ar-EG')}
              <span className="text-xs text-slate-400 font-medium mr-1.5">وحدة/كجم</span>
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              خلال الفترة من {startDate} إلى {endDate}
            </p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Box size={24} />
          </div>
        </div>

        {/* عدد الأصناف المتحركة */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold">الأصناف المتحركة بالتحويل</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              {aggregateKpis.totalActiveItems}
              <span className="text-xs text-slate-400 font-medium mr-1.5">صنف</span>
            </h3>
            <p className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
              <CheckCircle2 size={12} /> نشطة الصرف بين المخازن
            </p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Package size={24} />
          </div>
        </div>

        {/* متوسط الصرف للصنف النشط */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold">
              متوسط الصرف اليومي {activeItemSummary ? `(${activeItemSummary.productName.slice(0, 14)}...)` : ''}
            </p>
            <h3 className="text-2xl font-black text-amber-600 mt-1">
              {activeItemSummary ? (avgMethod === 'active_days' ? activeItemSummary.dailyAverageActiveDays : activeItemSummary.dailyAverageAllDays) : 0}
              <span className="text-xs text-slate-400 font-medium mr-1.5">{activeItemSummary?.unit || 'وحدة'}/يوم</span>
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              {avgMethod === 'active_days' ? 'على أيام الصرف النشطة' : `على مدار ${allDaysList.length} يوماً`}
            </p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <TrendingUp size={24} />
          </div>
        </div>

        {/* رادار الخطر والتنبيه المبكر */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold">حالة التغطية والمخاطر</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xl font-black ${aggregateKpis.criticalItems > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {aggregateKpis.criticalItems} حرج
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-sm font-bold text-amber-600">{aggregateKpis.warningItems} تحذير</span>
            </div>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              مقارنة بأرصدة مخزن المصدر
            </p>
          </div>
          <div className={`p-3 rounded-xl ${aggregateKpis.criticalItems > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <ShieldAlert size={24} />
          </div>
        </div>
      </div>

      {/* شريط التبديل بين التبويبات (عرض الصنف التفصيلي vs مصفوفة مقارنة كافة الأصناف) */}
      <div className="flex items-center justify-between border-b border-slate-200 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('single_item')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-black text-sm transition ${
              activeTab === 'single_item'
                ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 size={16} />
            التحليل التفصيلي للصنف وسلوك السحب
            {activeItemSummary && (
              <span className="text-xs bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                {activeItemSummary.productName}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('all_items')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-black text-sm transition ${
              activeTab === 'all_items'
                ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={16} />
            مصفوفة مقارنة كافة الأصناف والتنبؤ
            <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
              {itemsSummaries.length} صنف
            </span>
          </button>
        </div>

        {activeTab === 'single_item' && itemsSummaries.length > 1 && (
          <div className="text-xs text-slate-500 font-bold flex items-center gap-2 py-2">
            <span>اختر صنفاً آخر:</span>
            <select
              value={activeItemSummary?.productId || ''}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="text-xs font-bold px-2 py-1 bg-white border border-slate-300 rounded-lg focus:outline-none"
            >
              {itemsSummaries.map((it) => (
                <option key={it.productId} value={it.productId}>
                  {it.productName} ({it.totalTransferred} {it.unit})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-slate-200 shadow-sm">
          <Loader2 className="animate-spin mx-auto text-amber-600 mb-3" size={32} />
          <h4 className="text-base font-bold text-slate-700">جاري تحليل حركات وسجلات الصرف اليومي...</h4>
          <p className="text-xs text-slate-400 mt-1">يتم احتساب المتوسطات والانحراف المعياري ومعدلات التغطية بدقة</p>
        </div>
      ) : itemsSummaries.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 md:p-12 border border-slate-200/80 shadow-sm space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <ArrowRightLeft size={32} />
            </div>
            <h4 className="text-xl font-black text-slate-800">
              لم يتم العثور على حركات تحويل مخزني مطابقة للفلاتر المختارة
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              هذا التقرير يستند إلى <strong className="text-slate-700">سندات التحويل المخزني المعتمدة</strong> بين المخازن. لم يتم تسجيل أو اعتماد أي تحويلات في النظام بين <strong className="text-slate-700">({getWarehouseName(fromWarehouseId)})</strong> و <strong className="text-slate-700">({getWarehouseName(toWarehouseId)})</strong> خلال الفترة من <strong className="text-slate-700">{startDate}</strong> إلى <strong className="text-slate-700">{endDate}</strong>.
            </p>

            {/* أزرار الإجراءات السريعة */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <button
                onClick={() => navigate('/stock-transfer', { state: { fromWarehouseId, toWarehouseId } })}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20"
              >
                <PlusCircle size={16} /> تسجيل تحويل مخزني جديد الآن
              </button>

              <button
                onClick={() => setSimulationMode(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-purple-500/20"
              >
                <Sparkles size={16} /> تجربة التقرير ببيانات المحاكاة الفورية
              </button>

              {(fromWarehouseId !== 'ALL' || toWarehouseId !== 'ALL' || selectedCategory !== 'ALL' || selectedProductId !== 'ALL') && (
                <button
                  onClick={() => {
                    setFromWarehouseId('ALL');
                    setToWarehouseId('ALL');
                    setSelectedCategory('ALL');
                    setSelectedProductId('ALL');
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  <RotateCcw size={14} /> عرض جميع المستودعات والتصنيفات
                </button>
              )}
            </div>
          </div>

          {/* دليل إرشادي تفاعلي يوضح كيفية التعامل مع التقرير */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6">
            <h5 className="text-xs font-black text-slate-700 mb-4 flex items-center gap-2">
              <HelpCircle size={16} className="text-amber-500" />
              كيف يعمل التقرير وكيف تتعامل معه في دورة العمل اليومية؟
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center font-black text-xs">
                  1
                </div>
                <h6 className="font-bold text-slate-800 text-xs">تسجيل الصرف المخزني</h6>
                <p className="text-[11px] text-slate-500 leading-normal">
                  عند صرف الخامات من مخزن المواد الخام إلى صالة الإنتاج (مثلاً 15 قطعة دقيق اليوم، و17 قطعة غداً)، سجل العملية من شاشة <strong>"تحويل مخزني جديد"</strong>.
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="w-7 h-7 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center font-black text-xs">
                  2
                </div>
                <h6 className="font-bold text-slate-800 text-xs">اعتماد وترحيل السند</h6>
                <p className="text-[11px] text-slate-500 leading-normal">
                  تأكد من اعتماد التحويل (ترحيله) لخصم الكميات من مخزن المواد الخام وإضافتها إلى رصيد صالة التشغيل.
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center font-black text-xs">
                  3
                </div>
                <h6 className="font-bold text-slate-800 text-xs">قراءة التحليلات والتنبؤ الذكي</h6>
                <p className="text-[11px] text-slate-500 leading-normal">
                  افتح هذا التقرير ليقوم النظام تلقائياً برسم المنحنى الزمني، واحتساب متوسط الصرف اليومي، وتحليل استقرار الصنف، وحساب احتياجك للأيام القادمة.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'single_item' && activeItemSummary ? (
        /* ============================================================== */
        /* التبويب الأول: التحليل التفصيلي للصنف وسلوك السحب اليومي */
        /* ============================================================== */
        <div className="space-y-6">
          {/* بطاقة معلومات الصنف ومؤشرات سلوك السحب */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-slate-800">{activeItemSummary.productName}</h3>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono font-bold">
                    SKU: {activeItemSummary.sku}
                  </span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-bold">
                    {activeItemSummary.category}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  التحويل من: <span className="font-bold text-slate-700">{getWarehouseName(fromWarehouseId)}</span> إلى: <span className="font-bold text-slate-700">{getWarehouseName(toWarehouseId)}</span>
                </p>
              </div>

              {/* شارات سلوك الصنف والاتجاه */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* شارة الاستقرار والتذبذب */}
                <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  activeItemSummary.volatilityLabel === 'منتظم ومستقر'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : activeItemSummary.volatilityLabel === 'متوسط الاستقرار'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  <Zap size={14} />
                  <span>السلوك: {activeItemSummary.volatilityLabel}</span>
                  <span className="text-[10px] opacity-75">(CV: {activeItemSummary.volatilityRate})</span>
                </div>

                {/* شارة اتجاه السحب */}
                <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  activeItemSummary.trend === 'increasing'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : activeItemSummary.trend === 'decreasing'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}>
                  {activeItemSummary.trend === 'increasing' ? (
                    <TrendingUp size={14} className="text-red-600" />
                  ) : activeItemSummary.trend === 'decreasing' ? (
                    <TrendingDown size={14} className="text-blue-600" />
                  ) : (
                    <Info size={14} className="text-slate-500" />
                  )}
                  <span>
                    الاتجاه: {activeItemSummary.trend === 'increasing' ? 'صاعد (زيادة سحب)' : activeItemSummary.trend === 'decreasing' ? 'هابط (تراجع سحب)' : 'مستقر'}
                  </span>
                  {activeItemSummary.trendPct !== 0 && (
                    <span className="text-[10px] font-mono">({activeItemSummary.trendPct > 0 ? `+${activeItemSummary.trendPct}%` : `${activeItemSummary.trendPct}%`})</span>
                  )}
                </div>

                {/* شارة كفاية الرصيد بالمخزن المصدر */}
                <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  activeItemSummary.daysOfSupply < 7
                    ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                    : activeItemSummary.daysOfSupply < 15
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  <ShieldAlert size={14} />
                  <span>
                    الرصيد يكفي: {activeItemSummary.daysOfSupply > 365 ? 'أكثر من سنة' : `${activeItemSummary.daysOfSupply} يوم`}
                  </span>
                </div>
              </div>
            </div>

            {/* شبكة الإحصائيات الدقيقة للصنف */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-5">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 font-bold block">إجمالي المنصرف</span>
                <span className="text-lg font-black text-slate-800">
                  {activeItemSummary.totalTransferred} {activeItemSummary.unit}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">خلال الفترة</span>
              </div>

              <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-100">
                <span className="text-[11px] text-amber-800 font-bold block">متوسط الصرف اليومي</span>
                <span className="text-lg font-black text-amber-700">
                  {avgMethod === 'active_days' ? activeItemSummary.dailyAverageActiveDays : activeItemSummary.dailyAverageAllDays}
                  <span className="text-xs mr-1">{activeItemSummary.unit}/يوم</span>
                </span>
                <span className="text-[10px] text-amber-600 block mt-0.5">
                  {avgMethod === 'active_days' ? 'على الأيام النشطة' : 'على كامل الفترة'}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 font-bold block">أعلى يوم صرف (الذروة)</span>
                <span className="text-lg font-black text-purple-700">
                  {activeItemSummary.peakDailyQty} {activeItemSummary.unit}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {activeItemSummary.peakDate || '-'}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 font-bold block">أيام الصرف النشطة</span>
                <span className="text-lg font-black text-slate-800">
                  {activeItemSummary.activeDaysCount} <span className="text-xs text-slate-400 font-normal">/ {activeItemSummary.totalDaysCount} يوم</span>
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  نسبة النشاط: {Math.round((activeItemSummary.activeDaysCount / activeItemSummary.totalDaysCount) * 100)}%
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 font-bold block">رصيد المخزن المصدر</span>
                <span className={`text-lg font-black ${activeItemSummary.currentSourceStock <= 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {activeItemSummary.currentSourceStock} {activeItemSummary.unit}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">متاح حالياً للسحب</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[11px] text-slate-500 font-bold block">رصيد المخزن المستلم</span>
                <span className="text-lg font-black text-emerald-700">
                  {activeItemSummary.currentDestStock} {activeItemSummary.unit}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">متاح بصالة التشغيل</span>
              </div>
            </div>
          </div>

          {/* الرسوم البيانية التفاعلية للصنف */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. مخطط السلاسل الزمنية لمعدل الصرف اليومي (أعمدة + خط متوسط) */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <BarChart3 size={16} className="text-amber-500" />
                    المسار الزمني لكميات الصرف اليومية للصنف
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    الأعمدة تمثل كمية كل يوم، والخط الأحمر المتقطع يمثل متوسط الصرف اليومي ({avgMethod === 'active_days' ? activeItemSummary.dailyAverageActiveDays : activeItemSummary.dailyAverageAllDays} {activeItemSummary.unit})
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-3 h-3 bg-amber-500 rounded-sm"></span>
                    <span>كمية الصرف اليومي</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-red-600">
                    <span className="w-3.5 h-0.5 bg-red-500"></span>
                    <span>المتوسط المرجعي</span>
                  </div>
                </div>
              </div>

              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeItemSummary.dailyPoints} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10, fill: '#64748b' }} 
                      tickFormatter={(d) => {
                        const parts = d.split('-');
                        return `${parts[2]}/${parts[1]}`;
                      }}
                      interval={Math.ceil(activeItemSummary.dailyPoints.length / 15)}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as DailyPoint;
                          const baseline = avgMethod === 'active_days' ? activeItemSummary.dailyAverageActiveDays : activeItemSummary.dailyAverageAllDays;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-800 min-w-[200px]">
                              <div className="flex justify-between items-center border-b border-slate-800 pb-1 font-bold">
                                <span>{data.dayName}</span>
                                <span className="font-mono text-amber-400">{data.date}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm pt-1">
                                <span className="text-slate-300">الكمية المنصرفة:</span>
                                <span className="font-black text-amber-400">{data.quantity} {activeItemSummary.unit}</span>
                              </div>
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-400">مقارنة بالمتوسط:</span>
                                <span className={`font-bold ${data.deviationFromAvg > 0 ? 'text-emerald-400' : data.deviationFromAvg < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                  {data.deviationFromAvg > 0 ? `+${data.deviationFromAvg}` : data.deviationFromAvg} {activeItemSummary.unit}
                                </span>
                              </div>
                              {data.transferNumbers.length > 0 && (
                                <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-1">
                                  سندات التحويل: {data.transferNumbers.join(', ')}
                                </div>
                              )}
                              {data.isPeak && (
                                <div className="text-[10px] bg-purple-900/60 text-purple-300 px-1.5 py-0.5 rounded text-center font-bold">
                                  ⭐ أعلى يوم صرف في الفترة (الذروة)
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {/* خط المتوسط اليومي المرجعي */}
                    <ReferenceLine 
                      y={avgMethod === 'active_days' ? activeItemSummary.dailyAverageActiveDays : activeItemSummary.dailyAverageAllDays} 
                      stroke="#ef4444" 
                      strokeDasharray="4 4" 
                      strokeWidth={2}
                      label={{ 
                        value: `متوسط: ${avgMethod === 'active_days' ? activeItemSummary.dailyAverageActiveDays : activeItemSummary.dailyAverageAllDays}`, 
                        fill: '#ef4444', 
                        fontSize: 10,
                        position: 'insideTopLeft'
                      }}
                    />
                    <Bar dataKey="quantity" radius={[4, 4, 0, 0]}>
                      {activeItemSummary.dailyPoints.map((entry, index) => {
                        const baseline = avgMethod === 'active_days' ? activeItemSummary.dailyAverageActiveDays : activeItemSummary.dailyAverageAllDays;
                        let barColor = '#3b82f6'; // أزرق افتراضي
                        if (entry.isPeak) barColor = '#a855f7'; // بنفسجي للذروة
                        else if (entry.quantity === 0) barColor = '#e2e8f0'; // رمادي لعدم الصرف
                        else if (entry.quantity >= baseline) barColor = '#f59e0b'; // كهرماني لفوق المتوسط
                        return <Cell key={`cell-${index}`} fill={barColor} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. مخطط نمط السحب حسب أيام الأسبوع (Day of Week Distribution) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
              <div>
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Calendar size={16} className="text-indigo-500" />
                  نمط الاستهلاك حسب أيام الأسبوع
                </h4>
                <p className="text-[11px] text-slate-400">
                  متوسط كميات الصرف لكل يوم لاكتشاف أيام الذروة الأسبوعية
                </p>
              </div>

              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayOfWeekStats} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis dataKey="dayName" type="category" tick={{ fontSize: 11, fill: '#334155', fontWeight: 'bold' }} width={60} />
                    <Tooltip 
                      formatter={(val: unknown) => [`${val} ${activeItemSummary.unit}`, 'متوسط الصرف']}
                      labelFormatter={(lbl) => `يوم ${lbl}`}
                    />
                    <Bar dataKey="avgQty" fill="#6366f1" radius={[0, 4, 4, 0]}>
                      {dayOfWeekStats.map((entry, index) => {
                        // إبراز أعلى يوم في الأسبوع بلون مختلف
                        const isMax = entry.avgQty === Math.max(...dayOfWeekStats.map(s => s.avgQty));
                        return <Cell key={`dow-${index}`} fill={isMax ? '#ec4899' : '#6366f1'} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* محرك التنبؤ باحتياجات الإنتاج المستقبلية ومخزون الأمان (Predictive Simulator) */}
          {forecastSimulation && (
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-xl border border-slate-700/60 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-700/60 pb-4">
                <div>
                  <h4 className="text-lg font-black flex items-center gap-2 text-amber-400">
                    <Sparkles size={20} />
                    محرك التنبؤ الذكي بالاحتياجات المستقبلية ومخزون الأمان للصنف
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    محاكاة متقدمة لحساب كميات الصرف المتوقعة ومقارنتها برصيد مخزن المواد الخام لتفادي توقف خطوط الإنتاج
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">معدل الصرف المحسوب:</span>
                  <span className="px-2.5 py-1 bg-slate-800 text-amber-400 rounded-lg font-mono font-bold border border-slate-700">
                    {forecastSimulation.baseDailyRate} {activeItemSummary.unit} / يوم
                  </span>
                </div>
              </div>

              {/* أدوات التحكم في المحاكاة (Sliders & Horizon selectors) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-800/60 p-4 rounded-xl border border-slate-700/40">
                {/* 1. أفق التخطيط المستقبلي */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Clock size={14} className="text-amber-400" />
                      أفق التخطيط المستقبلي (الأيام القادمة):
                    </label>
                    <span className="text-sm font-black text-amber-400 font-mono">
                      {planningHorizonDays} يوماً
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[7, 14, 21, 30, 45, 60].map(days => (
                      <button
                        key={days}
                        onClick={() => setPlanningHorizonDays(days)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition border ${
                          planningHorizonDays === days
                            ? 'bg-amber-500 text-slate-900 border-amber-400 shadow-md shadow-amber-500/20'
                            : 'bg-slate-700/70 hover:bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                      >
                        {days} يوم
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. نسبة مخزون الأمان (Safety Buffer %) */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <ShieldAlert size={14} className="text-emerald-400" />
                      هامش أمان لتذبذب الإنتاج (Safety Buffer):
                    </label>
                    <span className="text-sm font-black text-emerald-400 font-mono">
                      {safetyBufferPct}% (+{forecastSimulation.bufferQty} {activeItemSummary.unit})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[0, 10, 15, 20, 25, 30].map(pct => (
                      <button
                        key={pct}
                        onClick={() => setSafetyBufferPct(pct)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition border ${
                          safetyBufferPct === pct
                            ? 'bg-emerald-500 text-slate-900 border-emerald-400 shadow-md shadow-emerald-500/20'
                            : 'bg-slate-700/70 hover:bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* نتائج المحاكاة وتنبيه العجز أو الأمان */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80">
                  <span className="text-xs text-slate-400 font-bold block">الاحتياج الأساسي المتوقع</span>
                  <div className="text-2xl font-black text-slate-100 mt-1">
                    {forecastSimulation.baseNeed} <span className="text-xs text-slate-400">{activeItemSummary.unit}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    = {forecastSimulation.baseDailyRate} × {planningHorizonDays} يوم
                  </span>
                </div>

                <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80">
                  <span className="text-xs text-slate-400 font-bold block">إجمالي المطلوب (شامل الأمان)</span>
                  <div className="text-2xl font-black text-amber-400 mt-1">
                    {forecastSimulation.totalRequired} <span className="text-xs text-slate-400">{activeItemSummary.unit}</span>
                  </div>
                  <span className="text-[11px] text-emerald-400 block mt-1">
                    شامل {forecastSimulation.bufferQty} {activeItemSummary.unit} احتياطي
                  </span>
                </div>

                <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80">
                  <span className="text-xs text-slate-400 font-bold block">الرصيد الفعلي بمخزن المصدر</span>
                  <div className="text-2xl font-black text-slate-100 mt-1">
                    {forecastSimulation.available} <span className="text-xs text-slate-400">{activeItemSummary.unit}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    يكفي تقريباً: {forecastSimulation.coverageDays > 365 ? 'سنة+' : `${forecastSimulation.coverageDays} يوماً`}
                  </span>
                </div>

                {/* بطاقة العجز / الفائض */}
                <div className={`p-4 rounded-xl border ${
                  forecastSimulation.isDeficit 
                    ? 'bg-red-950/60 border-red-500/80 text-red-200' 
                    : 'bg-emerald-950/60 border-emerald-500/80 text-emerald-200'
                }`}>
                  <span className="text-xs font-bold block">
                    {forecastSimulation.isDeficit ? '🚨 عجز متوقع في الرصيد' : '✅ الرصيد يغطي بالكامل'}
                  </span>
                  <div className="text-2xl font-black mt-1">
                    {forecastSimulation.isDeficit ? (
                      <span className="text-red-400">-{forecastSimulation.shortageQty} {activeItemSummary.unit}</span>
                    ) : (
                      <span className="text-emerald-400">+{forecastSimulation.balanceAfterHorizon} {activeItemSummary.unit}</span>
                    )}
                  </div>
                  <span className="text-[11px] block mt-1">
                    {forecastSimulation.isDeficit ? 'كمية يجب توفيرها وشراؤها فوراً' : 'فائض أمان بعد انقضاء الفترة'}
                  </span>
                </div>
              </div>

              {/* رسالة التوصية الذكية للمدير */}
              <div className={`p-4 rounded-xl flex items-start gap-3 ${
                forecastSimulation.isDeficit
                  ? 'bg-red-900/40 border border-red-700/60 text-red-100'
                  : 'bg-emerald-900/40 border border-emerald-700/60 text-emerald-100'
              }`}>
                {forecastSimulation.isDeficit ? (
                  <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={20} />
                ) : (
                  <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={20} />
                )}
                <div>
                  <h5 className="text-sm font-bold">
                    {forecastSimulation.isDeficit 
                      ? `توصية ذكية عاجلة لإدارة المشتريات والإنتاج:` 
                      : `مؤشر التوريد ممتاز ومطمئن:`}
                  </h5>
                  <p className="text-xs mt-1 leading-relaxed opacity-90">
                    {forecastSimulation.isDeficit ? (
                      <>
                        استناداً إلى متوسط السحب اليومي البالغ ({forecastSimulation.baseDailyRate} {activeItemSummary.unit}/يوم)، 
                        فإن رصيد مخزن المواد الخام الحالي ({forecastSimulation.available} {activeItemSummary.unit}) سينفد تماماً خلال ({forecastSimulation.coverageDays}) يوماً فقط! 
                        لتغطية خطة الإنتاج للـ ({planningHorizonDays}) يوماً القادمة، 
                        <strong> يُوصى بإصدار أمر شراء عاجل بكمية لا تقل عن ({forecastSimulation.shortageQty} {activeItemSummary.unit})</strong> لتفادي تعطيل صالة الإنتاج والتشغيل.
                      </>
                    ) : (
                      <>
                        رصيد مخزن المواد الخام الحالي ({forecastSimulation.available} {activeItemSummary.unit}) كافٍ تماماً ويغطي الخطة التشغيلية للـ ({planningHorizonDays}) يوماً القادمة 
                        مع هامش أمان بنسبة ({safetyBufferPct}%)، وسيتبقى فائض أمان مقداره ({forecastSimulation.balanceAfterHorizon} {activeItemSummary.unit}). 
                        لا توجد حاجة ملحة لطلب كميات إضافية حالياً.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* جدول السجل اليومي المفصل للصنف (يوم بيوم) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Calendar size={16} className="text-amber-500" />
                  السجل اليومي المفصل لحركات وتحويلات الصنف (يوم بيوم)
                </h4>
                <p className="text-[11px] text-slate-400">
                  تفصيل كامل لكافة أيام الفترة المحددة ({activeItemSummary.dailyPoints.length} يوم) متضمناً أيام الصرف والكميات والانحراف
                </p>
              </div>

              <div className="text-xs text-slate-500 font-bold bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                إجمالي الأيام: {activeItemSummary.dailyPoints.length} | الأيام النشطة: {activeItemSummary.activeDaysCount}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">#</th>
                    <th className="p-3.5">التاريخ</th>
                    <th className="p-3.5">يوم الأسبوع</th>
                    <th className="p-3.5 text-center">الكمية المنقولة</th>
                    <th className="p-3.5 text-center">الانحراف عن المتوسط</th>
                    <th className="p-3.5 text-center">سندات التحويل</th>
                    <th className="p-3.5">ملاحظات التحويل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeItemSummary.dailyPoints.map((point, idx) => (
                    <tr 
                      key={point.date} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        point.isPeak 
                          ? 'bg-purple-50/50' 
                          : point.quantity === 0 
                          ? 'bg-slate-50/30 text-slate-400' 
                          : ''
                      }`}
                    >
                      <td className="p-3.5 font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-3.5 font-mono font-bold text-slate-700">{point.date}</td>
                      <td className="p-3.5 font-bold">{point.dayName}</td>
                      <td className="p-3.5 text-center">
                        {point.quantity > 0 ? (
                          <span className={`inline-flex items-center gap-1 font-black px-2.5 py-1 rounded-lg ${
                            point.isPeak
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : point.quantity >= (avgMethod === 'active_days' ? activeItemSummary.dailyAverageActiveDays : activeItemSummary.dailyAverageAllDays)
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {point.isPeak && '⭐ '}
                            {point.quantity} {activeItemSummary.unit}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-mono">-</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        {point.quantity > 0 ? (
                          <span className={`inline-flex items-center gap-0.5 font-bold text-[11px] px-2 py-0.5 rounded-full ${
                            point.deviationFromAvg > 0
                              ? 'text-emerald-700 bg-emerald-50'
                              : point.deviationFromAvg < 0
                              ? 'text-rose-700 bg-rose-50'
                              : 'text-slate-600 bg-slate-100'
                          }`}>
                            {point.deviationFromAvg > 0 ? (
                              <ArrowUpRight size={12} className="text-emerald-600" />
                            ) : point.deviationFromAvg < 0 ? (
                              <ArrowDownRight size={12} className="text-rose-600" />
                            ) : null}
                            {point.deviationFromAvg > 0 ? `+${point.deviationFromAvg}` : point.deviationFromAvg} {activeItemSummary.unit}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[11px]">لا يوجد صرف</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        {point.transferNumbers.length > 0 ? (
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {point.transferNumbers.map(num => (
                              <span key={num} className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                {num}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-500 text-xs max-w-xs truncate">
                        {point.notes.length > 0 ? point.notes.join(' | ') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ============================================================== */
        /* التبويب الثاني: مصفوفة مقارنة كافة الأصناف والتنبؤ */
        /* ============================================================== */
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Layers size={16} className="text-amber-500" />
                  مصفوفة مقارنة الأصناف المحولة وتحليل سرعة الصرف والتنبؤ
                </h4>
                <p className="text-[11px] text-slate-400">
                  مقارنة شاملة لجميع الأصناف المنقولة بين المخزنين مع متوسطات الاستهلاك وتوقعات التغطية
                </p>
              </div>

              <div className="text-xs text-slate-500 font-bold bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                إجمالي الأصناف: {itemsSummaries.length}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">#</th>
                    <th className="p-3.5">الصنف</th>
                    <th className="p-3.5">التصنيف</th>
                    <th className="p-3.5 text-center">إجمالي المنصرف</th>
                    <th className="p-3.5 text-center">متوسط الصرف اليومي</th>
                    <th className="p-3.5 text-center">أعلى يوم صرف</th>
                    <th className="p-3.5 text-center">رصيد مخزن المصدر</th>
                    <th className="p-3.5 text-center">أيام التغطية</th>
                    <th className="p-3.5 text-center">احتياج 7 أيام</th>
                    <th className="p-3.5 text-center">احتياج 30 يوماً</th>
                    <th className="p-3.5 text-center">حالة الصنف</th>
                    <th className="p-3.5 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemsSummaries.map((item, idx) => {
                    const baseline = avgMethod === 'active_days' ? item.dailyAverageActiveDays : item.dailyAverageAllDays;
                    return (
                      <tr key={item.productId} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-800">{item.productName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</div>
                        </td>
                        <td className="p-3.5">
                          <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-black text-slate-800">
                          {item.totalTransferred} <span className="text-[10px] text-slate-400 font-normal">{item.unit}</span>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                            {baseline} <span className="text-[10px] text-amber-700 font-normal">{item.unit}/يوم</span>
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="font-bold text-purple-700">{item.peakDailyQty} {item.unit}</div>
                          <div className="text-[10px] text-slate-400">{item.peakDate || '-'}</div>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`font-bold ${item.currentSourceStock <= 0 ? 'text-red-600 font-black' : 'text-slate-700'}`}>
                            {item.currentSourceStock} {item.unit}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            item.daysOfSupply < 7
                              ? 'bg-red-100 text-red-800'
                              : item.daysOfSupply < 15
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {item.daysOfSupply > 365 ? 'أكثر من سنة' : `${item.daysOfSupply} يوم`}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-700">
                          {item.projectedNeed7d} {item.unit}
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-700">
                          {item.projectedNeed30d} {item.unit}
                        </td>
                        <td className="p-3.5 text-center">
                          {item.urgencyStatus === 'CRITICAL' ? (
                            <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                              <AlertTriangle size={11} /> عجز وشيك
                            </span>
                          ) : item.urgencyStatus === 'WARNING' ? (
                            <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                              <Clock size={11} /> رصيد منخفض
                            </span>
                          ) : (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                              <CheckCircle2 size={11} /> آمن ومستقر
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => {
                              setSelectedProductId(item.productId);
                              setActiveTab('single_item');
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="فحص الصنف وسلوك السحب التفصيلي"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==============================================================================
// دالة توليد بيانات محاكاة تجريبية لشركة لينزا للحلواني (Linza Confectionery Demo)
// ==============================================================================
function generateLinzaDemoTransfers(
  startDate: string, 
  endDate: string, 
  warehouses: Array<Record<string, any>>, 
  products: Array<Record<string, any>>,
  selectedFromWhId?: string,
  selectedToWhId?: string,
  selectedCategoryName?: string
) {
  let rawWh = (selectedFromWhId && selectedFromWhId !== 'ALL')
    ? warehouses.find(w => w.id === selectedFromWhId)
    : warehouses.find(w => (w.name as string)?.includes('خام') || (w.name as string)?.includes('المواد الخام'));
  if (!rawWh) rawWh = warehouses[0] || { id: 'wh-raw', name: 'المستودع المركزي للمواد الخام' };

  let prodWh = (selectedToWhId && selectedToWhId !== 'ALL')
    ? warehouses.find(w => w.id === selectedToWhId)
    : warehouses.find(w => (w.name as string)?.includes('الدور') || (w.name as string)?.includes('إنتاج') || (w.name as string)?.includes('تشغيل') || (w.name as string)?.includes('صالة'));
  if (!prodWh || prodWh.id === rawWh.id) prodWh = warehouses[1] || { id: 'wh-prod', name: 'مستودع تشغيل الدور الثاني - صالة التورت والجاتوه والجانش' };

  const cat = (selectedCategoryName && selectedCategoryName !== 'ALL') ? selectedCategoryName : 'خامات الحلويات الأولية';

  // قائمة أصناف تجريبية تمثل مصنع لينزا بدقة
  const linzaProducts = [
    { id: 'lenza-p1', name: 'دقيق فاخر استخراج 72%', sku: 'RM-FLOUR-72', unit: 'شيكارة', category: cat, stock: 120 },
    { id: 'lenza-p2', name: 'سكر ناعم بلوري ممتاز', sku: 'RM-SUGAR-W', unit: 'كجم', category: cat, stock: 240 },
    { id: 'lenza-p3', name: 'زبدة نيوزيلندي طبيعي فاخرة', sku: 'RM-NZ-BUTTER', unit: 'قالب', category: cat, stock: 85 },
    { id: 'lenza-p4', name: 'شيكولاتة خام بلجيكي داكنة', sku: 'RM-CHOC-BELG', unit: 'كجم', category: cat, stock: 45 },
    { id: 'lenza-p5', name: 'كريمة خفق نباتي ممتازة', sku: 'RM-WHIP-CREAM', unit: 'لتر', category: cat, stock: 95 },
    { id: 'lenza-p6', name: 'مسحوق فانيليا فاخرة', sku: 'RM-VANILLA-P', unit: 'عبوة', category: cat, stock: 18 },
    { id: 'lenza-p7', name: 'فستق حلبي محمص ومجروش', sku: 'RM-PISTACHIO', unit: 'كجم', category: cat, stock: 30 }
  ];

  const results: Array<Record<string, any>> = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const curr = new Date(start);

  let transferSeq = 1001;

  while (curr <= end) {
    const dateStr = curr.toISOString().split('T')[0];
    const dayOfWeek = curr.getDay(); // 0 = الأحد, 5 = الجمعة

    // تباين يومي واقعي: الخميس والجمعة أيام ذروة إنتاج حلويات، والأحد راحة أو سحب قليل
    linzaProducts.forEach((prod, pIdx) => {
      let baseQty = 0;
      if (prod.sku === 'RM-FLOUR-72') {
        // مثال العميل: 15 قطعة في يوم و 17 في يوم آخر
        if (dayOfWeek === 0) baseQty = 8; // الأحد سحب خفيف
        else if (dayOfWeek === 4) baseQty = 26; // الخميس ذروة تحضير
        else if (dayOfWeek === 5) baseQty = 22; // الجمعة
        else baseQty = 15 + ((curr.getDate() + pIdx) % 5); // 15, 17, 19, 16...
      } else if (prod.sku === 'RM-SUGAR-W') {
        if (dayOfWeek === 0) baseQty = 5;
        else baseQty = 12 + ((curr.getDate() * 2) % 8); // 12 إلى 18
      } else if (prod.sku === 'RM-NZ-BUTTER') {
        if (dayOfWeek === 0) baseQty = 0; // لا يتم صرف الزبدة يوم الأحد
        else baseQty = 8 + ((curr.getDate()) % 6); // 8 إلى 14
      } else if (prod.sku === 'RM-CHOC-BELG') {
        if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 4) {
          baseQty = 7 + ((curr.getDate()) % 8); // أيام تصنيع الشوكولاتة
        } else {
          baseQty = 0;
        }
      } else if (prod.sku === 'RM-WHIP-CREAM') {
        baseQty = 10 + ((curr.getDate() + 3) % 10);
      } else if (prod.sku === 'RM-VANILLA-P') {
        // الفانيليا تصرف كل 2-3 أيام بكمية 1 أو 2
        baseQty = (curr.getDate() % 3 === 0) ? 2 : 0;
      } else {
        baseQty = (curr.getDate() % 2 === 0) ? 5 : 0;
      }

      if (baseQty > 0) {
        results.push({
          id: `demo-ti-${transferSeq}-${pIdx}`,
          quantity: baseQty,
          product_id: prod.id,
          products: {
            ...prod,
            warehouse_stock: {
              [rawWh.id]: prod.stock,
              [prodWh.id]: Math.round(prod.stock * 0.2)
            }
          },
          stock_transfers: {
            id: `demo-st-${transferSeq}`,
            transfer_number: `TRN-LZ-${transferSeq}`,
            transfer_date: dateStr,
            from_warehouse_id: rawWh.id,
            to_warehouse_id: prodWh.id,
            status: 'posted',
            notes: `صرف خامات تشغيل لصالة الحلواني (وردية ${dayOfWeek === 4 ? 'صباحي ومسائي مكثف' : 'عادية'})`,
            organization_id: 'org-demo'
          }
        });
      }
    });

    transferSeq++;
    curr.setDate(curr.getDate() + 1);
  }

  return results;
}

export default DailyTransferVelocityReport;
