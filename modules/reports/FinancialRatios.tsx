﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { useMemo, useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { 
  Gauge, TrendingUp, Activity, Printer, Download, Target, Loader2, RefreshCw, 
  Sparkles, ShieldCheck, AlertTriangle, CheckCircle2, Info, ArrowUpRight, 
  ArrowDownRight, Sliders, Layers, BarChart3, Clock, DollarSign, Wallet, 
  PieChart, ChevronRight, Check, AlertCircle, HelpCircle, Zap
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, LineChart, Line, AreaChart, Area, Cell, RadialBarChart, RadialBar 
} from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';

const FinancialRatios = () => {
  const { accounts, entries, currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(fiscalYearRange.endDate);
  const [loadingData, setLoadingData] = useState(false);
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'ratios' | 'dupont' | 'simulator' | 'charts'>('overview');

  // سيناريوهات المحاكي التفاعلي (What-If Simulator)
  const [simSalesChange, setSimSalesChange] = useState<number>(0); // %
  const [simCogsChange, setSimCogsChange] = useState<number>(0);   // %
  const [simFixedCostChange, setSimFixedCostChange] = useState<number>(0); // %

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  // جلب حركات اليومية للفترة المحددة
  const fetchLedgerData = async () => {
    setLoadingData(true);
    if (currentUser?.role === 'demo') {
      const filteredEntries = entries.filter(
        e => e.status === 'posted' && 
        (e.transaction_date || e.date) >= startDate && 
        (e.transaction_date || e.date) <= endDate
      );
      const lines = filteredEntries.flatMap(entry => {
        const entryLines = entry.journal_lines || entry.lines || [];
        return entryLines.map((line: any) => ({
          ...line,
          accountId: line.account_id || line.accountId,
          journal_entries: { transaction_date: entry.transaction_date || entry.date, status: entry.status }
        }));
      });
      setLedgerLines(lines);
      setLoadingData(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      const userRole = session?.user?.user_metadata?.role;

      if (!userOrgId && userRole !== 'super_admin') {
        throw new Error('تعذر تحديد المنظمة التابع لها. يرجى تسجيل الدخول مرة أخرى.');
      }

      let query = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', endDate);

      if (userOrgId) {
        query = query.eq('journal_entries.organization_id', userOrgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLedgerLines(data || []);
    } catch (err: any) {
      console.error('Error fetching ledger data for financial ratios:', err);
      showToast('فشل جلب البيانات: ' + err.message, 'error');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchLedgerData();
  }, [startDate, endDate, accounts, currentUser]);

  // الحسابات المالية الدقيقة والشاملة
  const financialData = useMemo(() => {
    if (!accounts || accounts.length === 0 || loadingData) return null;

    const periodAccountBalances: Record<string, number> = {};
    const cumulativeAccountBalances: Record<string, number> = {};

    (ledgerLines || []).filter(Boolean).forEach(line => {
      const accId = line.account_id || line.accountId;
      const amount = (Number(line.debit) || 0) - (Number(line.credit) || 0);
      const transDate = line.journal_entries?.transaction_date;

      cumulativeAccountBalances[accId] = (cumulativeAccountBalances[accId] || 0) + amount;
      if (transDate >= startDate) {
        periodAccountBalances[accId] = (periodAccountBalances[accId] || 0) + amount;
      }
    });

    let currentAssets = 0;
    let cashAndEquivalents = 0;
    let accountsReceivable = 0;
    let inventory = 0;
    let nonCurrentAssets = 0;
    let totalAssets = 0;

    let currentLiabilities = 0;
    let accountsPayable = 0;
    let nonCurrentLiabilities = 0;
    let totalLiabilities = 0;

    let totalEquity = 0;
    let sales = 0;
    let cogs = 0;
    let totalExpenses = 0;

    accounts.forEach(acc => {
      if (acc.isGroup) return;

      const balance = cumulativeAccountBalances[acc.id] || 0;
      const periodBalance = periodAccountBalances[acc.id] || 0;

      const type = String(acc.type || '').toUpperCase();
      const subType = String(acc.sub_type || '').toLowerCase();
      const code = String(acc.code || '');

      // الأصول (Assets)
      if (type.includes('ASSET') || type.includes('أصول') || code.startsWith('1')) {
        totalAssets += balance;

        const isCash = code.startsWith('123') || subType === 'cash' || subType === 'bank';
        const isRec = code.startsWith('122') || subType === 'receivable' || subType === 'customer';
        const isInv = code.startsWith('103') || code.startsWith('121') || subType === 'inventory';
        const isCurr = subType === 'current' || code.startsWith('12') || isCash || isRec || isInv;

        if (isCash) cashAndEquivalents += balance;
        if (isRec) accountsReceivable += balance;
        if (isInv) inventory += balance;

        if (isCurr) {
          currentAssets += balance;
        } else {
          nonCurrentAssets += balance;
        }
      }

      // الخصوم (Liabilities)
      if (type.includes('LIABILITY') || type.includes('خصوم') || code.startsWith('2')) {
        const val = -balance;
        totalLiabilities += val;

        const isPay = code.startsWith('201') || code.startsWith('222') || subType === 'payable' || subType === 'vendor';
        const isCurrLiab = subType === 'current' || code.startsWith('22') || code.startsWith('201') || isPay;

        if (isPay) accountsPayable += val;
        if (isCurrLiab) {
          currentLiabilities += val;
        } else {
          nonCurrentLiabilities += val;
        }
      }

      // حقوق الملكية (Equity)
      if (type.includes('EQUITY') || type.includes('ملكية') || code.startsWith('3')) {
        totalEquity += -balance;
      }

      // الإيرادات (Revenues)
      if (type.includes('REVENUE') || type.includes('إيراد') || code.startsWith('4')) {
        sales += -periodBalance;
      }

      // المصروفات (Expenses)
      if (type.includes('EXPENSE') || type.includes('مصروف') || code.startsWith('5')) {
        totalExpenses += periodBalance;
        if (code.startsWith('51') || subType === 'cogs') {
          cogs += periodBalance;
        }
      }
    });

    // احتساب صافي الدخل ونتائج الأعمال
    const grossProfit = sales - cogs;
    const operatingExpenses = Math.max(0, totalExpenses - cogs);
    const netIncome = sales - totalExpenses;

    // حساب عدد أيام الفترة الزمنية
    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    const periodDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    // 1. نسب السيولة (Liquidity Ratios)
    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : (currentAssets > 0 ? 99.9 : 0);
    const quickAssets = Math.max(0, currentAssets - inventory);
    const quickRatio = currentLiabilities > 0 ? quickAssets / currentLiabilities : (quickAssets > 0 ? 99.9 : 0);
    const cashRatio = currentLiabilities > 0 ? cashAndEquivalents / currentLiabilities : (cashAndEquivalents > 0 ? 99.9 : 0);
    const workingCapital = currentAssets - currentLiabilities;
    const workingCapitalRatio = sales > 0 ? (workingCapital / sales) * 100 : 0;

    // 2. نسب الربحية (Profitability Ratios)
    const grossProfitMargin = sales > 0 ? (grossProfit / sales) * 100 : 0;
    const operatingProfitMargin = sales > 0 ? (grossProfit - operatingExpenses) / sales * 100 : 0;
    const netProfitMargin = sales > 0 ? (netIncome / sales) * 100 : 0;
    const roa = totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0;
    const roe = totalEquity > 0 ? (netIncome / totalEquity) * 100 : 0;

    // 3. نسب النشاط ودورة التشغيل (Activity & Operating Cycle)
    const inventoryTurnover = (cogs > 0 && inventory > 0) ? cogs / inventory : 0;
    const dsi = inventoryTurnover > 0 ? Math.round(periodDays / inventoryTurnover) : 0; // Days Sales in Inventory

    const receivablesTurnover = (sales > 0 && accountsReceivable > 0) ? sales / accountsReceivable : 0;
    const dso = receivablesTurnover > 0 ? Math.round(periodDays / receivablesTurnover) : 0; // Days Sales Outstanding

    const payablesTurnover = (cogs > 0 && accountsPayable > 0) ? cogs / accountsPayable : 0;
    const dpo = payablesTurnover > 0 ? Math.round(periodDays / payablesTurnover) : 0; // Days Payable Outstanding

    const cashConversionCycle = Math.max(0, dsi + dso - dpo); // CCC بالأيام
    const assetTurnover = totalAssets > 0 ? sales / totalAssets : 0;

    // 4. نسب الرافعة المالية وهيكل التمويل (Leverage & Solvency)
    const debtToEquity = totalEquity > 0 ? (totalLiabilities / totalEquity) : 0;
    const debtToAssets = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
    const equityMultiplier = totalEquity > 0 ? (totalAssets / totalEquity) : 1;

    // 5. تحليل نقطة التعادل وهامش الأمان (Break-Even & Margin of Safety)
    const variableCosts = cogs;
    const fixedCosts = operatingExpenses;
    const contributionMargin = sales - variableCosts;
    const contributionMarginRatio = sales > 0 ? contributionMargin / sales : 0;
    const breakEvenPoint = contributionMarginRatio > 0 ? fixedCosts / contributionMarginRatio : 0;
    const marginOfSafetyValue = Math.max(0, sales - breakEvenPoint);
    const marginOfSafetyRatio = sales > 0 ? (marginOfSafetyValue / sales) * 100 : 0;

    // 6. مؤشر السلامة المالية والصحة العامة للمنشأة (Financial Health Index 0-100)
    let healthScore = 50; // base score
    if (netIncome > 0) healthScore += 15; else healthScore -= 20;
    if (netProfitMargin >= 10) healthScore += 10;
    if (currentRatio >= 1.5 && currentRatio <= 3.0) healthScore += 15;
    else if (currentRatio > 3.0) healthScore += 8; // سيولة مفرطة ليست مثالية 100%
    else if (currentRatio < 1.0) healthScore -= 20;
    
    if (marginOfSafetyRatio >= 30) healthScore += 10;
    if (inventoryTurnover >= 3) healthScore += 10; else if (inventoryTurnover < 1 && inventory > 0) healthScore -= 5;
    if (debtToEquity < 1.5) healthScore += 10; else healthScore -= 10;
    healthScore = Math.min(100, Math.max(10, healthScore));

    return {
      periodDays,
      currentAssets,
      cashAndEquivalents,
      accountsReceivable,
      inventory,
      nonCurrentAssets,
      totalAssets,
      currentLiabilities,
      accountsPayable,
      nonCurrentLiabilities,
      totalLiabilities,
      totalEquity,
      sales,
      cogs,
      grossProfit,
      operatingExpenses,
      netIncome,
      // Ratios
      currentRatio,
      quickRatio,
      cashRatio,
      workingCapital,
      workingCapitalRatio,
      grossProfitMargin,
      operatingProfitMargin,
      netProfitMargin,
      roa,
      roe,
      inventoryTurnover,
      dsi,
      receivablesTurnover,
      dso,
      payablesTurnover,
      dpo,
      cashConversionCycle,
      assetTurnover,
      debtToEquity,
      debtToAssets,
      equityMultiplier,
      // Break-even
      fixedCosts,
      variableCosts,
      contributionMargin,
      contributionMarginRatio,
      breakEvenPoint,
      marginOfSafetyValue,
      marginOfSafetyRatio,
      healthScore
    };
  }, [accounts, ledgerLines, loadingData, startDate, endDate]);

  // حساب محاكي السيناريوهات (What-If Simulation Engine)
  const simulationResults = useMemo(() => {
    if (!financialData) return null;
    const baseSales = financialData.sales;
    const baseCogs = financialData.cogs;
    const baseFixed = financialData.fixedCosts;

    const simSales = Math.max(0, baseSales * (1 + simSalesChange / 100));
    const simCogs = Math.max(0, baseCogs * (1 + simCogsChange / 100));
    const simFixed = Math.max(0, baseFixed * (1 + simFixedCostChange / 100));

    const simVariable = simCogs;
    const simGrossProfit = simSales - simCogs;
    const simTotalExpenses = simCogs + simFixed;
    const simNetIncome = simSales - simTotalExpenses;
    const simNetMargin = simSales > 0 ? (simNetIncome / simSales) * 100 : 0;

    const simContribution = simSales - simVariable;
    const simContributionRatio = simSales > 0 ? simContribution / simSales : 0;
    const simBreakEven = simContributionRatio > 0 ? simFixed / simContributionRatio : 0;
    const simMarginOfSafety = Math.max(0, simSales - simBreakEven);
    const simMarginOfSafetyRatio = simSales > 0 ? (simMarginOfSafety / simSales) * 100 : 0;

    const netProfitDelta = simNetIncome - financialData.netIncome;
    const netProfitDeltaPercent = financialData.netIncome !== 0 ? (netProfitDelta / Math.abs(financialData.netIncome)) * 100 : 0;

    return {
      simSales,
      simCogs,
      simFixed,
      simGrossProfit,
      simNetIncome,
      simNetMargin,
      simBreakEven,
      simMarginOfSafety,
      simMarginOfSafetyRatio,
      netProfitDelta,
      netProfitDeltaPercent
    };
  }, [financialData, simSalesChange, simCogsChange, simFixedCostChange]);

  // استدعاء البيانات التاريخية للرسوم البيانية
  const [historicalData, setHistoricalData] = useState<{ profitabilityData: any[], liquidityData: any[] }>({ profitabilityData: [], liquidityData: [] });
  const [loadingCharts, setLoadingCharts] = useState(true);

  useEffect(() => {
    if (!accounts || accounts.length === 0) return;
    const fetchHistoricalData = async () => {
      setLoadingCharts(true);
      try {
        const { data, error } = await supabase.rpc('get_historical_ratios');
        if (error) throw error;
        if (data && !Array.isArray(data)) {
          setHistoricalData(data);
        }
      } catch (error) {
        console.error("Error fetching historical ratios:", error);
      } finally {
        setLoadingCharts(false);
      }
    };
    fetchHistoricalData();
  }, [accounts.length]);

  // مقارنة الأداء السنوي
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  const comparisonData = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    const calcYearData = (year: number) => {
      let revenue = 0;
      let expenses = 0;
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;

      (entries || []).forEach(entry => {
        const entryDate = entry.transaction_date || entry.date;
        if (entry.status === 'posted' && entryDate >= start && entryDate <= end) {
          (entry.journal_lines || entry.lines || []).forEach((line: any) => {
            const acc = accounts.find(a => a.id === (line.account_id || line.accountId));
            if (!acc) return;
            const type = (acc.type || '').toLowerCase();
            const code = acc.code || '';
            const debit = Number(line.debit) || 0;
            const credit = Number(line.credit) || 0;

            if (type === 'revenue' || type === 'income' || type.includes('إيراد') || code.startsWith('4')) {
              revenue += (credit - debit);
            } else if (type === 'expense' || type === 'expenses' || type.includes('مصروف') || code.startsWith('5')) {
              expenses += (debit - credit);
            }
          });
        }
      });
      return { revenue, expenses, netIncome: revenue - expenses };
    };

    const curr = calcYearData(currentYear);
    const prev = calcYearData(prevYear);

    return [
      { name: 'الإيرادات والمبيعات', [currentYear]: curr.revenue, [prevYear]: prev.revenue },
      { name: 'المصروفات والتكاليف', [currentYear]: curr.expenses, [prevYear]: prev.expenses },
      { name: 'صافي الربح', [currentYear]: curr.netIncome, [prevYear]: prev.netIncome },
    ];
  }, [entries, accounts, currentYear, prevYear]);

  // تصدير Excel شامل واحترافي
  const handleExportExcel = () => {
    if (!financialData) return;
    const f = financialData;
    const data = [
      ['تقرير المستشار والمدير المالي التنفيذي (Virtual CFO Analysis Report)'],
      ['المنشأة:', (currentUser as any)?.organization_name || (currentUser as any)?.organization_id || 'TriPro Enterprise'],
      ['الفترة المالية:', `من ${startDate} إلى ${endDate}`],
      ['تاريخ التقرير:', new Date().toLocaleDateString('ar-EG')],
      ['درجة السلامة المالية الإجمالية:', `${f.healthScore}/100`],
      [],
      ['1. المؤشرات والنسب المالية الأساسية'],
      ['المجموعة', 'المؤشر المالي', 'القيمة الفعلية', 'الوحدة', 'المعيار المستهدف (Benchmark)', 'التقييم التشخيصي', 'الشرح والتفسير المالي'],
      ['السيولة', 'النسبة المتداولة (Current Ratio)', f.currentRatio.toFixed(2), 'مرة', '1.5 - 2.5', f.currentRatio > 3.5 ? 'سيولة مفرطة (أموال معطلة)' : f.currentRatio >= 1.5 ? 'مثالي' : 'منخفض', 'قدرة سداد الالتزامات المتداولة بالأصول المتداولة'],
      ['السيولة', 'النسبة السريعة (Quick Ratio)', f.quickRatio.toFixed(2), 'مرة', '1.0 - 1.5', f.quickRatio >= 1.0 ? 'ممتاز' : 'منخفض', 'القدرة على السداد الفوري بدون انتظار بيع المخزون'],
      ['السيولة', 'نسبة النقدية الفورية (Cash Ratio)', f.cashRatio.toFixed(2), 'مرة', '> 0.2', f.cashRatio >= 0.2 ? 'آمن' : 'ضعيف', 'نسبة النقدية الجاهزة بالصناديق والبنوك إلى الالتزامات'],
      ['السيولة', 'رأس المال العامل الصافي', f.workingCapital.toLocaleString(), 'ج.م', '> 0', f.workingCapital > 0 ? 'موجب' : 'سالب', 'حجم السيولة الفائضة المتبقية لتمويل العمليات اليومية'],
      ['الربحية', 'هامش مجمل الربح (Gross Margin)', f.grossProfitMargin.toFixed(2), '%', '> 20%', f.grossProfitMargin >= 20 ? 'قوي' : 'يحتاج ترشيد', 'كفاءة التسعير والتحكم في تكلفة البضاعة المباشرة'],
      ['الربحية', 'هامش صافي الربح (Net Margin)', f.netProfitMargin.toFixed(2), '%', '> 10%', f.netProfitMargin >= 10 ? 'ممتاز' : f.netProfitMargin > 0 ? 'مقبول' : 'خسائر', 'صافي الأرباح الصافية المحققة من كل جنيه مبيعات'],
      ['الربحية', 'العائد على الأصول (ROA)', f.roa.toFixed(2), '%', '> 5%', f.roa >= 5 ? 'كفء' : 'منخفض', 'كفاءة إدارة وتشغيل إجمالي الأصول في خلق أرباح'],
      ['الربحية', 'العائد على الملكية (ROE)', f.roe.toFixed(2), '%', '> 15%', f.roe >= 15 ? 'ممتاز' : 'منخفض', 'العائد السنوي الذي يجنيه المستثمرون والملاك على أموالهم'],
      ['النشاط والتشغيل', 'معدل دوران المخزون', f.inventoryTurnover.toFixed(2), 'مرة', '> 4 مرات', f.inventoryTurnover >= 4 ? 'سريع' : 'بطيء / راكد', 'عدد مرات بيع وتجديد المخزون خلال الفترة'],
      ['النشاط والتشغيل', 'فترة بقاء المخزون (DSI)', `${f.dsi}`, 'يوم', '< 90 يوم', f.dsi <= 90 ? 'ممتاز' : 'ركود بالمخزن', 'متوسط عدد الأيام اللازمة لتصريف وبيع بضاعة المخزن'],
      ['النشاط والتشغيل', 'فترة تحصيل العملاء (DSO)', `${f.dso}`, 'يوم', '< 60 يوم', f.dso <= 60 ? 'تحصيل سريع' : 'متأخرات', 'متوسط فترة تحصيل مستحقات المبيعات من العملاء'],
      ['النشاط والتشغيل', 'دورة التحويل النقدي (CCC)', `${f.cashConversionCycle}`, 'يوم', '< 90 يوم', f.cashConversionCycle <= 90 ? 'سريعة' : 'طويلة', 'الفترة الإجمالية من إنفاق النقد حتى استرداده من العملاء'],
      ['الرافعة المالية', 'نسبة الدين إلى حقوق الملكية (D/E)', f.debtToEquity.toFixed(2), 'مرة', '< 1.5', f.debtToEquity <= 1.5 ? 'هيكل آمن' : 'اعتماد عالي عالديون', 'حجم التمويل الخارجي مقارنة برأس مال الملاك'],
      ['نقطة التعادل', 'التكاليف الثابتة', f.fixedCosts.toLocaleString(), 'ج.م', '-', 'مصروفات تشغيلية', 'التكاليف العامة التي لا تتغير بتغير حجم المبيعات'],
      ['نقطة التعادل', 'التكاليف المتغيرة', f.variableCosts.toLocaleString(), 'ج.م', '-', 'تكلفة المبيعات', 'التكاليف المرتبطة مباشرة بالإنتاج والمبيعات'],
      ['نقطة التعادل', 'نقطة التعادل المالية', f.breakEvenPoint.toLocaleString(), 'ج.م', `< ${f.sales.toLocaleString()}`, f.sales > f.breakEvenPoint ? 'مغطاة بنجاح' : 'تحت نقطة التعادل', 'المبيعات الدنيا المطلوبة لتغطية كافة التكاليف'],
      ['نقطة التعادل', 'هامش الأمان (Margin of Safety)', `${f.marginOfSafetyRatio.toFixed(1)}%`, '%', '> 25%', f.marginOfSafetyRatio >= 25 ? 'أمان ممتاز' : 'منطقة خطرة', 'النسبة التي يمكن للمبيعات أن تنخفض بها دون حدوث خسائر'],
      [],
      ['2. تفكيك تحليل دوبونت المالي (DuPont 3-Step Analysis)'],
      ['المعيار', 'القيمة', 'الدور المالي'],
      ['هامش صافي الربح (Net Profit Margin)', `${f.netProfitMargin.toFixed(2)}%`, 'يقيس كفاءة إدارة التكاليف والربحية التشغيلية'],
      ['معدل دوران الأصول (Asset Turnover)', `${f.assetTurnover.toFixed(2)} مرة`, 'يقيس كفاءة استغلال الأصول في توليد الإيرادات'],
      ['مضاعف الرافعة المالية (Equity Multiplier)', `${f.equityMultiplier.toFixed(2)} مرة`, 'يقيس درجة الاعتماد على أموال الغير في تمويل الأصول'],
      ['العائد على حقوق الملكية النهائي (ROE)', `${f.roe.toFixed(2)}%`, 'حاصل ضرب العناصر الثلاثة السابقة معاً'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير المدير المالي");
    XLSX.writeFile(wb, `Financial_CFO_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير تقرير المدير المالي بنجاح', 'success');
  };

  // المكون المطور لبطاقات النسب المالية الذكية
  const SmartRatioCard = ({ 
    title, 
    value, 
    formattedValue,
    suffix = '', 
    ideal, 
    description, 
    category,
    statusType,
    statusText,
    icon: IconComponent
  }: {
    title: string;
    value: number;
    formattedValue?: string;
    suffix?: string;
    ideal: string;
    description: string;
    category?: string;
    statusType: 'ideal' | 'good' | 'excessive' | 'warning' | 'critical';
    statusText: string;
    icon?: any;
  }) => {
    const getBadgeStyle = () => {
      switch (statusType) {
        case 'ideal':
          return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'good':
          return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'excessive':
          return 'bg-indigo-50 text-indigo-700 border-indigo-200';
        case 'warning':
          return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'critical':
          return 'bg-rose-50 text-rose-700 border-rose-200';
        default:
          return 'bg-slate-50 text-slate-700 border-slate-200';
      }
    };

    const getBorderAccent = () => {
      switch (statusType) {
        case 'ideal': return 'border-r-4 border-r-emerald-500';
        case 'good': return 'border-r-4 border-r-blue-500';
        case 'excessive': return 'border-r-4 border-r-indigo-500';
        case 'warning': return 'border-r-4 border-r-amber-500';
        case 'critical': return 'border-r-4 border-r-rose-500';
        default: return 'border-r-4 border-r-slate-300';
      }
    };

    return (
      <div className={`bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 hover:shadow-md transition-all relative flex flex-col justify-between ${getBorderAccent()}`}>
        <div>
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</span>
            {IconComponent && (
              <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400">
                <IconComponent size={16} />
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
              {formattedValue || (value !== undefined && value !== null ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0')}
            </span>
            {suffix && <span className="text-sm font-bold text-slate-500">{suffix}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
            <span className="text-slate-400 font-medium">المثالي: <b className="text-slate-600">{ideal}</b></span>
            <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] ${getBadgeStyle()}`}>
              {statusText}
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2.5">
          {description}
        </p>
      </div>
    );
  };

  if (accounts.length === 0 || !financialData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4 animate-in fade-in">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
        <p className="text-slate-600 font-bold">جاري تحميل موازين الحسابات وتحليل النسب المالية والتشخيص الذكي...</p>
      </div>
    );
  }

  const f = financialData;

  // توليد التشخيص والتوصيات التنفيذية (CFO AI Diagnostic Engine)
  const isLiquidityExcessive = f.currentRatio > 3.5;
  const isInventorySlow = f.inventoryTurnover < 2.0 && f.inventory > 0;
  const isROALow = f.roa < 4.0;
  const isBreakEvenSafe = f.sales > f.breakEvenPoint * 1.5;

  return (
    <div className="space-y-6 animate-in fade-in pb-16">
      {/* رأس الصفحة وشريط الأدوات والتحكم */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Gauge size={28} />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                المدير والمحلل المالي الذكي (Virtual CFO)
                <span className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase">
                  AI Financial Advisor
                </span>
              </h1>
              <p className="text-slate-500 text-sm mt-0.5 font-medium">
                مركز التحليل المالي التنفيذي، كشف السلامة المالية، ومحاكاة القرارات الاستراتيجية
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500">الفترة:</span>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer" 
            />
            <span className="text-slate-400 text-xs">إلى</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer" 
            />
          </div>

          <button 
            onClick={fetchLedgerData}
            title="تحديث البيانات"
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          >
            <RefreshCw size={16} className={loadingData ? "animate-spin text-indigo-600" : ""} />
          </button>

          <button 
            onClick={handleExportExcel} 
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm hover:bg-emerald-700 transition-all font-bold text-sm"
          >
            <Download size={16} /> تصدير تقرير CFO
          </button>

          <button 
            onClick={() => window.print()} 
            className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm hover:bg-slate-800 transition-all font-bold text-sm"
          >
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      {/* عنوان الطباعة الرسمي */}
      <div className="hidden print:block text-center border-b-2 border-slate-900 pb-4 mb-6">
        <h1 className="text-2xl font-black text-slate-900">تقرير التحليل المالي والتشخيص التنفيذي</h1>
        <p className="text-sm text-slate-600 mt-1">الفترة من: {startDate} إلى {endDate} | تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
      </div>

      {/* شريط التبويبات الرئيسي (Tabs Navigation) */}
      <div className="flex gap-2 p-1.5 bg-slate-100/80 rounded-2xl overflow-x-auto print:hidden">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'overview' 
              ? 'bg-white text-indigo-700 shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Sparkles size={16} /> تشخيص المستشار المالي والتوصيات
        </button>

        <button
          onClick={() => setActiveTab('ratios')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'ratios' 
              ? 'bg-white text-indigo-700 shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Layers size={16} /> جميع النسب والمؤشرات المالية
        </button>

        <button
          onClick={() => setActiveTab('dupont')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'dupont' 
              ? 'bg-white text-indigo-700 shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <PieChart size={16} /> تفكيك دوبونت وهيكل التكاليف
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'simulator' 
              ? 'bg-white text-indigo-700 shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Sliders size={16} /> محاكي القرارات (What-If Simulator)
        </button>

        <button
          onClick={() => setActiveTab('charts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'charts' 
              ? 'bg-white text-indigo-700 shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <BarChart3 size={16} /> الاتجاهات والمقارنات التاريخية
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* التبويب الأول: تشخيص المستشار المالي التنفيذي (Overview & Insights) */}
      {/* ------------------------------------------------------------- */}
      {(activeTab === 'overview' || typeof window === 'undefined') && (
        <div className="space-y-6 animate-in fade-in">
          {/* بطاقة التقييم الشامل للصحة المالية */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between">
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <ShieldCheck size={16} /> مؤشر السلامة المالية الكلي
                  </span>
                  <span className="text-[11px] bg-indigo-500/30 border border-indigo-400/30 px-2.5 py-0.5 rounded-full font-semibold">
                    CFO Scorecard
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-black tracking-tight">{f.healthScore}</span>
                  <span className="text-xl font-bold text-slate-400">/ 100</span>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-3 mb-4 overflow-hidden p-0.5">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${
                      f.healthScore >= 80 ? 'bg-gradient-to-r from-emerald-400 to-teal-300' :
                      f.healthScore >= 60 ? 'bg-gradient-to-r from-blue-400 to-indigo-300' :
                      f.healthScore >= 40 ? 'bg-gradient-to-r from-amber-400 to-yellow-300' : 'bg-gradient-to-r from-rose-500 to-red-400'
                    }`}
                    style={{ width: `${f.healthScore}%` }}
                  />
                </div>

                <div className="text-sm font-bold mb-1">
                  {f.healthScore >= 80 ? '🌟 ملاءة مالية ممتازة وأمان فائق' :
                   f.healthScore >= 60 ? '🛡️ وضع مالي مستقر وجيد' :
                   f.healthScore >= 40 ? '⚠️ يحتاج إلى تحسين كفاءة تشغيل الأصول' : '🚨 مخاطر مالية تتطلب معالجة فورية'}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  الشركة تتمتع بملاءة قوية وقدرة مؤكدة على تغطية التزاماتها، مع وجود فرصة ذهبية لرفع العائد على الاستثمار عبر تسريع دوران المخزون.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-6 border-t border-slate-800 mt-6 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">هامش الأمان</span>
                  <b className="text-emerald-400 text-sm">{f.marginOfSafetyRatio.toFixed(1)}%</b>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">رأس المال العامل</span>
                  <b className="text-blue-300 text-sm">{(f.workingCapital / 1000).toLocaleString(undefined, {maximumFractionDigits: 0})} ألف ج.م</b>
                </div>
              </div>
            </div>

            {/* بطاقة التشخيص التفصيلي للمدير المالي */}
            <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 text-slate-900 font-extrabold text-lg">
                  <Sparkles className="text-indigo-600" size={22} />
                  تشخيص المستشار المالي للأداء الحالي (Financial Diagnosis)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                  {/* بند السيولة */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <b className="text-slate-800 flex items-center gap-1.5">
                        <Activity size={14} className="text-blue-600" /> السيولة والملاءة قصيرة الأجل
                      </b>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isLiquidityExcessive ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isLiquidityExcessive ? 'سيولة معطلة' : 'متوازنة'}
                      </span>
                    </div>
                    <p className="text-slate-600">
                      النسبة المتداولة ({f.currentRatio.toFixed(2)}) تشير إلى قدرة سداد فائقة للأقساط والموردين، ولكن تجاوزها للحد الطبيعي (1.5 - 2.5) يعني وجود أموال راكدة لم تستغل في التوسع التجاري.
                    </p>
                  </div>

                  {/* بند الربحية */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <b className="text-slate-800 flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-emerald-600" /> الربحية وهوامش التشغيل
                      </b>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                        هامش صافي {f.netProfitMargin.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-slate-600">
                      هامش مجمل الربح ({f.grossProfitMargin.toFixed(1)}%) وصافي الربح ({f.netProfitMargin.toFixed(1)}%) في مستويات صحية ومربحة جداً، مما يثبت صحة سياسة التسعير وتغطية المصروفات الإدارية.
                    </p>
                  </div>

                  {/* بند كفاءة الأصول والمخزون */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <b className="text-slate-800 flex items-center gap-1.5">
                        <Clock size={14} className="text-amber-600" /> كفاءة تشغيل المخزون والأصول
                      </b>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isInventorySlow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isInventorySlow ? 'دوران بطيء' : 'دوران كفء'}
                      </span>
                    </div>
                    <p className="text-slate-600">
                      دوران المخزون ({f.inventoryTurnover.toFixed(2)} مرة) وفترة البقاء ({f.dsi} يوم) هي السبب الرئيسي لانخفاض العائد على الأصول (ROA = {f.roa.toFixed(2)}%) بسبب تجميد رأس المال في المخزن.
                    </p>
                  </div>

                  {/* بند نقطة التعادل */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <b className="text-slate-800 flex items-center gap-1.5">
                        <Target size={14} className="text-purple-600" /> نقطة التعادل وهامش الأمان
                      </b>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                        أمان {f.marginOfSafetyRatio.toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-slate-600">
                      مبيعاتك الحالية ({f.sales.toLocaleString()} ج.م) تتجاوز نقطة التعادل ({f.breakEvenPoint.toLocaleString(undefined, {maximumFractionDigits: 0})} ج.م) بفارق كبير يمنح الشركة درع حماية ضد تقلبات السوق.
                    </p>
                  </div>
                </div>
              </div>

              {/* التوصيات الاستراتيجية المباشرة */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-indigo-600" /> توصيات المدير المالي التنفيذية لتعظيم الأرباح:
                </h4>
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-600">
                  <li className="flex items-center gap-1.5 bg-indigo-50/50 p-2 rounded-xl border border-indigo-100/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    <span>تنشيط عروض المخزون الراكد لتسريع دورة النقد.</span>
                  </li>
                  <li className="flex items-center gap-1.5 bg-emerald-50/50 p-2 rounded-xl border border-emerald-100/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <span>استثمار الفوائض النقدية لرفع العائد على الأصول (ROA).</span>
                  </li>
                  <li className="flex items-center gap-1.5 bg-blue-50/50 p-2 rounded-xl border border-blue-100/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    <span>الحفاظ على هامش الأمان الحالي لضمان استقرار التدفقات.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* لمحة سريعة على أهم 4 مقاييس حيوية */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block mb-1">المبيعات المحققة</span>
              <div className="text-2xl font-black text-slate-900">{f.sales.toLocaleString()} <span className="text-xs font-normal text-slate-400">ج.م</span></div>
              <span className="text-[11px] text-emerald-600 font-bold mt-1 inline-flex items-center gap-1">
                <ArrowUpRight size={14} /> نقطة التعادل: {f.breakEvenPoint.toLocaleString(undefined, {maximumFractionDigits: 0})} ج.م
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block mb-1">صافي الربح الصافي</span>
              <div className="text-2xl font-black text-emerald-600">{f.netIncome.toLocaleString()} <span className="text-xs font-normal text-slate-400">ج.م</span></div>
              <span className="text-[11px] text-slate-500 font-bold mt-1 block">
                هامش صافي: <b className="text-slate-800">{f.netProfitMargin.toFixed(1)}%</b>
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block mb-1">السيولة السريعة الفورية</span>
              <div className="text-2xl font-black text-blue-600">{f.quickRatio.toFixed(2)} <span className="text-xs font-normal text-slate-400">مرة</span></div>
              <span className="text-[11px] text-slate-500 font-bold mt-1 block">
                رأس مال عامل: <b className="text-slate-800">{(f.workingCapital / 1000).toLocaleString(undefined, {maximumFractionDigits: 0})}k</b>
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-bold text-slate-400 block mb-1">فترة بقاء المخزون (DSI)</span>
              <div className="text-2xl font-black text-amber-600">{f.dsi} <span className="text-xs font-normal text-slate-400">يوم</span></div>
              <span className="text-[11px] text-amber-700 font-bold mt-1 block">
                معدل الدوران: {f.inventoryTurnover.toFixed(2)} مرة
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* التبويب الثاني: جميع النسب المالية والمؤشرات (All Ratios) */}
      {/* ------------------------------------------------------------- */}
      {(activeTab === 'ratios' || typeof window === 'undefined') && (
        <div className="space-y-8 animate-in fade-in">
          {/* 1. نسب السيولة والملاءة قصيرة الأجل */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Activity className="text-blue-600" size={20} /> 1. نسب السيولة والملاءة قصيرة الأجل (Liquidity & Solvency)
              </h2>
              <span className="text-xs font-bold text-slate-400">تقيس قدرة المنشأة على الوفاء بالتزاماتها الفورية وتجنب التعثر</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <SmartRatioCard 
                title="النسبة المتداولة (Current Ratio)" 
                value={f.currentRatio} 
                suffix="مرة"
                ideal="1.5 - 2.5" 
                statusType={f.currentRatio > 3.5 ? 'excessive' : f.currentRatio >= 1.5 ? 'ideal' : f.currentRatio >= 1.0 ? 'warning' : 'critical'}
                statusText={f.currentRatio > 3.5 ? 'سيولة مفرطة (أموال معطلة)' : f.currentRatio >= 1.5 ? 'مثالي' : 'منخفض'}
                description="الأصول المتداولة ÷ الخصوم المتداولة. تقيس قدرة الشركة على سداد ديونها قصيرة الأجل بالأصول السائلة."
                icon={Wallet}
              />

              <SmartRatioCard 
                title="النسبة السريعة (Quick Ratio)" 
                value={f.quickRatio} 
                suffix="مرة"
                ideal="1.0 - 1.5" 
                statusType={f.quickRatio >= 1.0 ? 'ideal' : f.quickRatio >= 0.8 ? 'warning' : 'critical'}
                statusText={f.quickRatio >= 1.0 ? 'ممتاز' : 'منخفض'}
                description="(الأصول المتداولة - المخزون) ÷ الخصوم المتداولة. قدرة السداد الفوري دون اشتراط بيع المخزون."
                icon={Zap}
              />

              <SmartRatioCard 
                title="النسبة النقدية الفورية (Cash Ratio)" 
                value={f.cashRatio} 
                suffix="مرة"
                ideal="> 0.20" 
                statusType={f.cashRatio >= 0.2 ? 'ideal' : 'warning'}
                statusText={f.cashRatio >= 0.2 ? 'آمن وفوري' : 'منخفض'}
                description="النقدية وما في حكمها بالبنوك والصناديق ÷ الخصوم المتداولة. السيولة الحاضرة لتغطية أي طارئ فوراً."
                icon={DollarSign}
              />

              <SmartRatioCard 
                title="صافي رأس المال العامل" 
                value={f.workingCapital} 
                suffix="ج.م"
                ideal="> 0" 
                statusType={f.workingCapital > 0 ? 'ideal' : 'critical'}
                statusText={f.workingCapital > 0 ? 'فائض تشغيلي جيد' : 'عجز في رأس المال'}
                description="الأصول المتداولة - الخصوم المتداولة. فائض السيولة المتاح يومياً لدعم العمليات التجارية والتوسع."
                icon={Layers}
              />
            </div>
          </div>

          {/* 2. نسب الربحية وهيكل العوائد */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <TrendingUp className="text-emerald-600" size={20} /> 2. نسب الربحية وهيكل العوائد (Profitability & Returns)
              </h2>
              <span className="text-xs font-bold text-slate-400">تقيس كفاءة تسعير المنتجات وتحويل المبيعات والأصول إلى أرباح صافية</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <SmartRatioCard 
                title="هامش مجمل الربح (Gross Margin)" 
                value={f.grossProfitMargin} 
                suffix="%"
                ideal="> 20%" 
                statusType={f.grossProfitMargin >= 20 ? 'ideal' : f.grossProfitMargin >= 10 ? 'warning' : 'critical'}
                statusText={f.grossProfitMargin >= 20 ? 'قوي' : 'يحتاج مراجعة'}
                description="(المبيعات - تكلفة البضاعة) ÷ المبيعات. يقيس كفاءة التسعير وجودة إدارة تكلفة الشراء والإنتاج."
                icon={TrendingUp}
              />

              <SmartRatioCard 
                title="هامش صافي الربح (Net Margin)" 
                value={f.netProfitMargin} 
                suffix="%"
                ideal="> 10%" 
                statusType={f.netProfitMargin >= 10 ? 'ideal' : f.netProfitMargin > 0 ? 'good' : 'critical'}
                statusText={f.netProfitMargin >= 10 ? 'ممتاز' : f.netProfitMargin > 0 ? 'مقبول' : 'خسارة'}
                description="صافي الربح النهائي ÷ المبيعات. نصيب كل جنيه مبيعات من الأرباح الصافية بعد جميع التكاليف."
                icon={PieChart}
              />

              <SmartRatioCard 
                title="العائد على الأصول (ROA)" 
                value={f.roa} 
                suffix="%"
                ideal="> 5%" 
                statusType={f.roa >= 5 ? 'ideal' : f.roa >= 2 ? 'warning' : 'critical'}
                statusText={f.roa >= 5 ? 'كفء' : 'منخفض'}
                description="صافي الربح ÷ إجمالي الأصول. يقيس كفاءة الإدارة في استغلال ممتلكات وأصول الشركة لتوليد أرباح."
                icon={Gauge}
              />

              <SmartRatioCard 
                title="العائد على الملكية (ROE)" 
                value={f.roe} 
                suffix="%"
                ideal="> 15%" 
                statusType={f.roe >= 15 ? 'ideal' : f.roe >= 8 ? 'warning' : 'critical'}
                statusText={f.roe >= 15 ? 'ممتاز' : 'منخفض'}
                description="صافي الربح ÷ حقوق الملكية. العائد الفعلي الذي يحققه المستثمرون والشركاء على أموالهم المستثمرة."
                icon={Sparkles}
              />
            </div>
          </div>

          {/* 3. نسب النشاط وكفاءة دورة التشغيل */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Clock className="text-amber-600" size={20} /> 3. نسب النشاط وكفاءة دورة التشغيل (Operating Cycle & Efficiency)
              </h2>
              <span className="text-xs font-bold text-slate-400">تقيس سرعة تحويل المخزون والعملاء إلى تدفقات نقدية داخلية</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <SmartRatioCard 
                title="معدل دوران المخزون" 
                value={f.inventoryTurnover} 
                suffix="مرة"
                ideal="> 4.0" 
                statusType={f.inventoryTurnover >= 4 ? 'ideal' : f.inventoryTurnover >= 2 ? 'good' : 'warning'}
                statusText={f.inventoryTurnover >= 4 ? 'سريع وكفء' : f.inventoryTurnover > 0 ? 'بطيء' : 'غير متوفر'}
                description="تكلفة البضاعة المباعة ÷ رصيد المخزون. عدد مرات تفريغ واستبدال المخزون بالكامل خلال الفترة."
                icon={Activity}
              />

              <SmartRatioCard 
                title="فترة بقاء المخزون (DSI)" 
                value={f.dsi} 
                suffix="يوم"
                ideal="< 90 يوم" 
                statusType={f.dsi <= 90 && f.dsi > 0 ? 'ideal' : f.dsi <= 180 ? 'warning' : 'critical'}
                statusText={f.dsi <= 90 && f.dsi > 0 ? 'دوران سريع' : f.dsi > 0 ? 'ركود بالمخزن' : 'غير محدد'}
                description="365 ÷ دوران المخزون. متوسط عدد الأيام التي تقضيها البضاعة في المستودع قبل بيعها."
                icon={Clock}
              />

              <SmartRatioCard 
                title="معدل دوران الأصول الكلي" 
                value={f.assetTurnover} 
                suffix="مرة"
                ideal="> 1.0" 
                statusType={f.assetTurnover >= 1.0 ? 'ideal' : f.assetTurnover >= 0.5 ? 'good' : 'warning'}
                statusText={f.assetTurnover >= 1.0 ? 'كفاءة عالية' : 'مقبول'}
                description="المبيعات ÷ إجمالي الأصول. يقيس قدرة كل جنيه مستثمر في الأصول على توليد مبيعات."
                icon={BarChart3}
              />

              <SmartRatioCard 
                title="دورة التحويل النقدي (CCC)" 
                value={f.cashConversionCycle} 
                suffix="يوم"
                ideal="< 90 يوم" 
                statusType={f.cashConversionCycle <= 90 ? 'ideal' : 'warning'}
                statusText={f.cashConversionCycle <= 90 ? 'دورة ممتازة' : 'دورة طويلة'}
                description="فترة المخزون + فترة تحصيل العملاء - فترة سداد الموردين. سرعة استرجاع النقد المدفوع في العمليات."
                icon={RefreshCw}
              />
            </div>
          </div>

          {/* 4. تحليل نقطة التعادل والرافعة المالية */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Target className="text-purple-600" size={20} /> 4. تحليل نقطة التعادل والرافعة المالية (Break-Even & Leverage)
              </h2>
              <span className="text-xs font-bold text-slate-400">تقيس حدود الأمان التجاري وهيكل الديون إلى حقوق الملكية</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <SmartRatioCard 
                title="نقطة التعادل (Break-even)" 
                value={f.breakEvenPoint} 
                suffix="ج.م"
                ideal={`أقل من ${f.sales.toLocaleString()} ج.م`} 
                statusType={f.sales > f.breakEvenPoint ? 'ideal' : 'critical'}
                statusText={f.sales > f.breakEvenPoint ? 'مغطاة بنجاح' : 'دون نقطة التعادل'}
                description="التكاليف الثابتة ÷ نسبة هامش المساهمة. حجم المبيعات الإلزامي لتغطية كافة التكاليف دون ربح أو خسارة."
                icon={Target}
              />

              <SmartRatioCard 
                title="هامش الأمان (Margin of Safety)" 
                value={f.marginOfSafetyRatio} 
                suffix="%"
                ideal="> 25%" 
                statusType={f.marginOfSafetyRatio >= 25 ? 'ideal' : f.marginOfSafetyRatio > 0 ? 'warning' : 'critical'}
                statusText={f.marginOfSafetyRatio >= 25 ? 'منطقة أمان عالية' : 'حذر'}
                description="نسبة التراجع المسموح به في المبيعات قبل أن تبدأ المنشأة في تكبد خسائر فعلية."
                icon={ShieldCheck}
              />

              <SmartRatioCard 
                title="نسبة الدين إلى حقوق الملكية (D/E)" 
                value={f.debtToEquity} 
                suffix="مرة"
                ideal="< 1.5" 
                statusType={f.debtToEquity <= 1.5 ? 'ideal' : f.debtToEquity <= 2.5 ? 'warning' : 'critical'}
                statusText={f.debtToEquity <= 1.5 ? 'هيكل تمويل آمن' : 'مخاطر رافعة'}
                description="إجمالي الخصوم ÷ حقوق الملكية. تقيس مدى اعتماد الشركة على الديون مقابل أموال الملاك."
                icon={Layers}
              />

              <SmartRatioCard 
                title="مضاعف الرافعة المالية (Equity Multiplier)" 
                value={f.equityMultiplier} 
                suffix="مرة"
                ideal="1.0 - 2.5" 
                statusType={f.equityMultiplier <= 2.5 ? 'ideal' : 'warning'}
                statusText={f.equityMultiplier <= 2.5 ? 'متوازن' : 'مرتفع'}
                description="إجمالي الأصول ÷ حقوق الملكية. ركن أساسي في تحليل دوبونت لمعرفة أثر الاقتراض على تعظيم العائد."
                icon={Sliders}
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* التبويب الثالث: تفكيك دوبونت وهيكل التكاليف (DuPont & Cost Breakdown) */}
      {/* ------------------------------------------------------------- */}
      {(activeTab === 'dupont' || typeof window === 'undefined') && (
        <div className="space-y-6 animate-in fade-in">
          {/* شرح ومخطط تفكيك دوبونت (DuPont 3-Factor Breakdown) */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 mb-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <PieChart className="text-indigo-600" size={24} /> تحليل دوبونت المالي (DuPont 3-Step Analysis)
                </h3>
                <p className="text-slate-500 text-xs mt-1">
                  تفكيك العائد على حقوق الملكية (ROE) إلى عوامله الثلاثة لمعرفة المحرك الحقيقي لأرباح الشركة
                </p>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-2 rounded-2xl text-xs font-black">
                ROE = {f.roe.toFixed(2)}%
              </div>
            </div>

            {/* شجرة دوبونت التفاعلية */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
              {/* الركيزة 1: هامش صافي الربح */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">1. كفاءة الربحية</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">هامش الربح</span>
                  </div>
                  <div className="text-3xl font-black text-slate-900 mb-1">{f.netProfitMargin.toFixed(2)}%</div>
                  <span className="text-xs text-slate-400 font-bold block mb-3">صافي الربح ÷ المبيعات</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    يقيس قدرة الشركة على التحكم في تكاليف الإنتاج والمصروفات الإدارية وتحقيق أقصى ربح من كل صفقة بيع.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] font-bold text-slate-500">
                  صافي الربح: {f.netIncome.toLocaleString()} ج.م
                </div>
              </div>

              {/* الركيزة 2: معدل دوران الأصول */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">2. كفاءة التشغيل</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">دوران الأصول</span>
                  </div>
                  <div className="text-3xl font-black text-slate-900 mb-1">{f.assetTurnover.toFixed(2)} <span className="text-sm font-normal text-slate-400">مرة</span></div>
                  <span className="text-xs text-slate-400 font-bold block mb-3">المبيعات ÷ إجمالي الأصول</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    يقيس مدى سرعة وكفاءة استغلال أصول ومخزون المنشأة لتوليد تدفقات مبيعات مرتفعة.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] font-bold text-slate-500">
                  المبيعات: {f.sales.toLocaleString()} ج.م
                </div>
              </div>

              {/* الركيزة 3: الرافعة المالية */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">3. الهيكل التمويلي</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">الرافعة المالية</span>
                  </div>
                  <div className="text-3xl font-black text-slate-900 mb-1">{f.equityMultiplier.toFixed(2)} <span className="text-sm font-normal text-slate-400">مرة</span></div>
                  <span className="text-xs text-slate-400 font-bold block mb-3">الأصول ÷ حقوق الملكية</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    يقيس نسبة تمويل الأصول عبر الديون الخارجية بدلاً من حقوق المساهمين فقط لتعظيم العائد.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] font-bold text-slate-500">
                  حقوق الملكية: {f.totalEquity.toLocaleString()} ج.م
                </div>
              </div>
            </div>

            {/* معادلة التحليل الصريحة */}
            <div className="mt-6 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-indigo-600" />
                <span>معادلة دوبونت لشركتك:</span>
                <span className="text-indigo-900 font-black">
                  {f.netProfitMargin.toFixed(2)}% (هامش) × {f.assetTurnover.toFixed(2)} (دوران) × {f.equityMultiplier.toFixed(2)} (رافعة) = {f.roe.toFixed(2)}% (ROE)
                </span>
              </div>
              <span className="text-slate-500">
                {f.assetTurnover < 0.5 ? '💡 نصيحة المدير المالي: تحسين دوران الأصول والمخزون سيضاعف ROE فوراً.' : 'الأداء متوازن.'}
              </span>
            </div>
          </div>

          {/* هيكل التكاليف ونقطة التعادل */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
              <h4 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                <Layers className="text-blue-600" size={18} /> تفكيك هيكل التكاليف والمصروفات
              </h4>
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span className="text-slate-600">التكاليف المتغيرة (تكلفة البضاعة COGS)</span>
                    <span className="text-slate-900">{f.variableCosts.toLocaleString()} ج.م ({f.sales > 0 ? ((f.variableCosts / f.sales) * 100).toFixed(1) : 0}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(100, f.sales > 0 ? (f.variableCosts / f.sales) * 100 : 0)}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span className="text-slate-600">التكاليف الثابتة (المصروفات التشغيلية والإدارية)</span>
                    <span className="text-slate-900">{f.fixedCosts.toLocaleString()} ج.م ({f.sales > 0 ? ((f.fixedCosts / f.sales) * 100).toFixed(1) : 0}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: `${Math.min(100, f.sales > 0 ? (f.fixedCosts / f.sales) * 100 : 0)}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span className="text-slate-600">صافي هامش الربح المتبقي</span>
                    <span className="text-emerald-600 font-black">{f.netIncome.toLocaleString()} ج.م ({f.netProfitMargin.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, f.netProfitMargin))}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                  <Target className="text-emerald-600" size={18} /> مؤشرات هامش الأمان التجاري
                </h4>
                <div className="grid grid-cols-2 gap-4 text-xs mb-4">
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/60">
                    <span className="text-slate-400 font-bold block mb-1">المبيعات الفعلية</span>
                    <b className="text-slate-900 text-base">{f.sales.toLocaleString()} ج.م</b>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/60">
                    <span className="text-slate-400 font-bold block mb-1">نقطة التعادل المطلوبة</span>
                    <b className="text-purple-700 text-base">{f.breakEvenPoint.toLocaleString(undefined, {maximumFractionDigits: 0})} ج.م</b>
                  </div>
                </div>
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 leading-relaxed font-medium">
                  🎉 <b>وضع ممتاز:</b> مبيعاتك الحالية تتجاوز نقطة التعادل بمقدار <b>{f.marginOfSafetyValue.toLocaleString(undefined, {maximumFractionDigits: 0})} ج.م</b>، مما يمنحك هامش أمان بنسبة <b>{f.marginOfSafetyRatio.toFixed(1)}%</b> ضد أي ركود محتمل في السوق.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* التبويب الرابع: محاكي القرارات والسيناريوهات (What-If Simulator) */}
      {/* ------------------------------------------------------------- */}
      {(activeTab === 'simulator' || typeof window === 'undefined') && simulationResults && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Sliders className="text-indigo-600" size={24} /> محاكي القرارات والسيناريوهات المالية (What-If Decision Simulator)
                </h3>
                <p className="text-slate-500 text-xs mt-1">
                  حرّك المؤشرات لتجربة أثر القرارات التجارية على الأرباح ونقطة التعادل قبل تطبيقها في الواقع
                </p>
              </div>

              <button 
                onClick={() => {
                  setSimSalesChange(0);
                  setSimCogsChange(0);
                  setSimFixedCostChange(0);
                }}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-all"
              >
                إعادة ضبط المحاكي
              </button>
            </div>

            {/* أدوات التحكم في السلايدرز */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-2xl bg-slate-50 border border-slate-200/60 mb-6">
              {/* تعديل المبيعات */}
              <div>
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-slate-700">تغير حجم المبيعات:</span>
                  <span className={`px-2 py-0.5 rounded-md ${simSalesChange > 0 ? 'bg-emerald-100 text-emerald-700' : simSalesChange < 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'}`}>
                    {simSalesChange > 0 ? `+${simSalesChange}%` : `${simSalesChange}%`}
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-50" 
                  max="100" 
                  step="5" 
                  value={simSalesChange} 
                  onChange={e => setSimSalesChange(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-bold">
                  <span>-50%</span>
                  <span>0%</span>
                  <span>+100%</span>
                </div>
              </div>

              {/* تعديل تكلفة البضاعة COGS */}
              <div>
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-slate-700">تغير تكلفة البضاعة (COGS):</span>
                  <span className={`px-2 py-0.5 rounded-md ${simCogsChange < 0 ? 'bg-emerald-100 text-emerald-700' : simCogsChange > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'}`}>
                    {simCogsChange > 0 ? `+${simCogsChange}%` : `${simCogsChange}%`}
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-30" 
                  max="30" 
                  step="2" 
                  value={simCogsChange} 
                  onChange={e => setSimCogsChange(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-bold">
                  <span>-30% (توفير)</span>
                  <span>0%</span>
                  <span>+30% (غلاء)</span>
                </div>
              </div>

              {/* تعديل التكاليف الثابتة */}
              <div>
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-slate-700">تغير المصروفات الثابتة:</span>
                  <span className={`px-2 py-0.5 rounded-md ${simFixedCostChange < 0 ? 'bg-emerald-100 text-emerald-700' : simFixedCostChange > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'}`}>
                    {simFixedCostChange > 0 ? `+${simFixedCostChange}%` : `${simFixedCostChange}%`}
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-30" 
                  max="30" 
                  step="2" 
                  value={simFixedCostChange} 
                  onChange={e => setSimFixedCostChange(Number(e.target.value))}
                  className="w-full accent-purple-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-bold">
                  <span>-30% (ترشيد)</span>
                  <span>0%</span>
                  <span>+30% (توسع)</span>
                </div>
              </div>
            </div>

            {/* مقارنة النتائج: الوضع الحالي vs السيناريو المتوقع */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs font-bold text-slate-400 block mb-1">صافي الربح المتوقع</span>
                <div className="text-2xl font-black text-emerald-600">
                  {simulationResults.simNetIncome.toLocaleString(undefined, {maximumFractionDigits: 0})} <span className="text-xs font-normal text-slate-400">ج.م</span>
                </div>
                <div className="text-xs font-bold mt-2 flex items-center gap-1">
                  {simulationResults.netProfitDelta >= 0 ? (
                    <span className="text-emerald-600 flex items-center gap-0.5">
                      <ArrowUpRight size={14} /> +{simulationResults.netProfitDelta.toLocaleString(undefined, {maximumFractionDigits: 0})} ج.م (+{simulationResults.netProfitDeltaPercent.toFixed(1)}%)
                    </span>
                  ) : (
                    <span className="text-rose-600 flex items-center gap-0.5">
                      <ArrowDownRight size={14} /> {simulationResults.netProfitDelta.toLocaleString(undefined, {maximumFractionDigits: 0})} ج.م ({simulationResults.netProfitDeltaPercent.toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs font-bold text-slate-400 block mb-1">المبيعات بعد المحاكاة</span>
                <div className="text-2xl font-black text-slate-900">
                  {simulationResults.simSales.toLocaleString(undefined, {maximumFractionDigits: 0})} <span className="text-xs font-normal text-slate-400">ج.م</span>
                </div>
                <span className="text-xs text-slate-500 font-bold mt-2 block">
                  الحالي: {f.sales.toLocaleString()} ج.م
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs font-bold text-slate-400 block mb-1">نقطة التعادل الجديدة</span>
                <div className="text-2xl font-black text-purple-700">
                  {simulationResults.simBreakEven.toLocaleString(undefined, {maximumFractionDigits: 0})} <span className="text-xs font-normal text-slate-400">ج.م</span>
                </div>
                <span className="text-xs text-slate-500 font-bold mt-2 block">
                  الحالية: {f.breakEvenPoint.toLocaleString(undefined, {maximumFractionDigits: 0})} ج.م
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs font-bold text-slate-400 block mb-1">هامش الأمان المتوقع</span>
                <div className="text-2xl font-black text-blue-600">
                  {simulationResults.simMarginOfSafetyRatio.toFixed(1)}%
                </div>
                <span className="text-xs text-slate-500 font-bold mt-2 block">
                  الحالي: {f.marginOfSafetyRatio.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* التبويب الخامس: الاتجاهات والرسوم البيانية (Trends & Historical Charts) */}
      {/* ------------------------------------------------------------- */}
      {(activeTab === 'charts' || typeof window === 'undefined') && (
        <div className="space-y-6 animate-in fade-in">
          {/* مقارنة الأداء السنوي */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <TrendingUp className="text-blue-600" /> مقارنة الأداء السنوي المقارن ({currentYear} vs {prevYear})
            </h3>
            <div className="h-80 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(val) => `${val >= 1000 ? val / 1000 + 'k' : val}`} />
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()} ج.م`} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend />
                  <Bar dataKey={currentYear} name={`السنة الحالية (${currentYear})`} fill="#4f46e5" radius={[6, 6, 0, 0]} />
                  <Bar dataKey={prevYear} name={`السنة السابقة (${prevYear})`} fill="#94a3b8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* الرسوم البيانية التاريخية لهوامش الربحية والسيولة */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <TrendingUp className="text-emerald-600" size={18} /> تطور هوامش الربحية عبر الفترات
              </h3>
              <div className="h-64 w-full" dir="ltr">
                {loadingCharts ? (
                  <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-emerald-500" /></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalData.profitabilityData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip formatter={(val: any) => `${val}%`} />
                      <Legend />
                      <Line type="monotone" dataKey="ربحية" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} name="هامش صافي الربح %" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Activity className="text-blue-600" size={18} /> تطور مؤشر السيولة المتداولة
              </h3>
              <div className="h-64 w-full" dir="ltr">
                {loadingCharts ? (
                  <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-blue-500" /></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={historicalData.liquidityData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip formatter={(val: any) => `${val} مرة`} />
                      <Legend />
                      <Bar dataKey="سيولة" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={36} name="النسبة المتداولة (Current Ratio)" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialRatios;

