﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { useMemo, useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Gauge, TrendingUp, Activity, Printer, Download, Target, Loader2, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';

const FinancialRatios = () => {
  const { accounts, entries, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [loadingData, setLoadingData] = useState(false); // For fetching ledger lines
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);

  // Fetch ledger data for the specified period
  const fetchLedgerData = async () => {
    setLoadingData(true);
    if (currentUser?.role === 'demo') {
        // For demo, we'll use the existing `entries` data but filter it by date
        setLedgerLines(entries.filter(e => e.status === 'posted' && e.date >= startDate && e.date <= endDate).flatMap(entry => entry.lines.map(line => ({
            ...line,
            journal_entries: { transaction_date: entry.date, status: entry.status }
        }))));
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
  }, [startDate, endDate, accounts, currentUser]); // Re-fetch when period or accounts change

  const ratios = useMemo(() => {
    if (!accounts || accounts.length === 0 || loadingData) return null; // Wait for ledger data

    // تجميع أرصدة الفترة والأرصدة التراكمية من واقع القيود لضمان الدقة المطلقة
    const periodAccountBalances: Record<string, number> = {};
    const cumulativeAccountBalances: Record<string, number> = {};

    ledgerLines.forEach(line => {
        const accId = line.account_id;
        const amount = (line.debit - line.credit);
        const transDate = line.journal_entries?.transaction_date;

        cumulativeAccountBalances[accId] = (cumulativeAccountBalances[accId] || 0) + amount;
        if (transDate >= startDate) {
            periodAccountBalances[accId] = (periodAccountBalances[accId] || 0) + amount;
        }
    });

    // 1. تجميع الأرصدة حسب التصنيف
    let currentAssets = 0;
    let currentLiabilities = 0;
    let totalLiabilities = 0; // جديد: لإجمالي الخصوم
    let inventory = 0;
    let totalAssets = 0;
    let totalEquity = 0;
    let sales = 0;
    let cogs = 0;
    let totalExpenses = 0;
    let netIncome = 0;

    accounts.forEach(acc => {
        if (acc.isGroup) return;

        // استخدام الأرصدة المحسوبة من القيود بدلاً من عمود الجدول لضمان مطابقة ميزان المراجعة
        const balance = cumulativeAccountBalances[acc.id] || 0;
        const periodBalance = periodAccountBalances[acc.id] || 0;

        const type = String(acc.type || '').toUpperCase();
        const subType = String(acc.sub_type || '').toLowerCase();
        const code = String(acc.code || '');

        // أصول
        if (type.includes('ASSET') || type.includes('أصول') || code.startsWith('1')) {
            totalAssets += balance;
            if (subType === 'current' || code.startsWith('12') || code.startsWith('103') || code.startsWith('111')) {
                currentAssets += balance;
            }
            if (code.startsWith('103') || subType === 'inventory') {
                inventory += balance;
            }
        }

        // خصوم
        if (type.includes('LIABILITY') || type.includes('خصوم') || code.startsWith('2')) {
            totalLiabilities += -balance;
            // الخصوم المتداولة تشمل الموردين (201) والالتزامات المتداولة (22)
            if (subType === 'current' || code.startsWith('22') || code.startsWith('201')) {
                currentLiabilities += -balance;
            }
        }

        // حقوق ملكية
        if (type.includes('EQUITY') || type.includes('ملكية') || code.startsWith('3')) {
            totalEquity += -balance;
        }

        // إيرادات
        if (type.includes('REVENUE') || type.includes('إيراد') || code.startsWith('4')) {
            sales += -periodBalance;
        }

        // مصروفات
        if (type.includes('EXPENSE') || type.includes('مصروف') || code.startsWith('5')) {
            totalExpenses += periodBalance;
            if (code.startsWith('51') || subType === 'cogs') {
                cogs += periodBalance;
            }
        }
    });

    // حساب صافي الدخل يدوياً لضمان الدقة
    netIncome = sales - totalExpenses;

    // 2. حساب النسب
    // معالجة القسمة على صفر: إذا كانت الخصوم 0 والأصول موجبة، فالنسبة ممتازة (نضع رقم كبير)
    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : (currentAssets > 0 ? 999 : 0);
    const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : (currentAssets > 0 ? 999 : 0);
    
    const grossProfitMargin = sales > 0 ? ((sales - cogs) / sales) * 100 : 0;
    const netProfitMargin = sales > 0 ? (netIncome / sales) * 100 : 0;
    const roa = totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0; // العائد على الأصول
    const roe = totalEquity > 0 ? (netIncome / totalEquity) * 100 : 0; // العائد على حقوق الملكية
    const debtToEquity = totalEquity > 0 ? (totalLiabilities / totalEquity) : 0; // تم التعديل لاستخدام totalLiabilities
    const inventoryTurnover = cogs > 0 && inventory > 0 ? cogs / inventory : 0; // جديد: معدل دوران المخزون

    // حساب نقطة التعادل
    const variableCosts = cogs; // التكاليف المتغيرة (تكلفة البضاعة)
    const fixedCosts = Math.max(0, totalExpenses - variableCosts); // التكاليف الثابتة (باقي المصروفات)
    
    const contributionMarginRatio = sales > 0 ? (sales - variableCosts) / sales : 0;
    const breakEvenPoint = contributionMarginRatio > 0 ? fixedCosts / contributionMarginRatio : 0;

    return {
        currentRatio,
        quickRatio,
        grossProfitMargin,
        netProfitMargin,
        roa,
        roe,
        debtToEquity,
        inventoryTurnover, // جديد
        workingCapital: currentAssets - currentLiabilities,
        fixedCosts,
        variableCosts,
        breakEvenPoint,
        sales
    };
  }, [accounts, ledgerLines, loadingData]); // Depend on ledgerLines and loadingData

  // حساب مقارنة الأداء السنوي
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  const comparisonData = useMemo(() => {
    if (!entries || entries.length === 0) return [];

    const calcYearData = (year: number) => {
        let revenue = 0;
        let expenses = 0;
        const start = `${year}-01-01`;
        const end = `${year}-12-31`;

        entries.forEach(entry => {
            // دعم مسمى التاريخ البرمجي وتاريخ المعاملة المحاسبي
            const entryDate = entry.transaction_date || entry.date;
            if (entry.status === 'posted' && entryDate >= start && entryDate <= end) {
                entry.lines.forEach(line => {
                    const acc = accounts.find(a => a.id === line.accountId);
                    if (!acc) return;
                    
                    const type = (acc.type || '').toLowerCase();
                    const code = acc.code || '';

                    if (type === 'revenue' || type === 'income' || type === 'إيرادات' || code.startsWith('4')) {
                        revenue += (line.credit - line.debit);
                    } else if (type === 'expense' || type === 'expenses' || type === 'مصروفات' || code.startsWith('5')) {
                        expenses += (line.debit - line.credit);
                    }
                });
            }
        });
        return { revenue, expenses, netIncome: revenue - expenses };
    };

    const curr = calcYearData(currentYear);
    const prev = calcYearData(prevYear);

    // إذا كانت البيانات صفرية في السنتين، قد نحتاج للتأكد من وجود قيود مرحلة
    if (curr.revenue === 0 && prev.revenue === 0 && entries.length > 0) {
        console.warn("تحذير: لا توجد قيود 'مرحلة' Posted لقراءتها في مقارنة السنوات.");
    }

    return [
        { name: 'الإيرادات', [currentYear]: curr.revenue, [prevYear]: prev.revenue },
        { name: 'المصروفات', [currentYear]: curr.expenses, [prevYear]: prev.expenses },
        { name: 'صافي الربح', [currentYear]: curr.netIncome, [prevYear]: prev.netIncome },
    ];
  }, [entries, accounts, currentYear, prevYear]);

  const RatioCard = ({ title, value, suffix = '', ideal, description, color = 'blue' }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
        {/* إصلاح الألوان الديناميكية لضمان الثبات */}
        <div className="absolute top-0 right-0 w-1 h-full" style={{ backgroundColor: 
            color === 'blue' ? '#3b82f6' : 
            color === 'indigo' ? '#6366f1' : 
            color === 'emerald' ? '#10b981' : 
            color === 'teal' ? '#14b8a6' : 
            color === 'cyan' ? '#06b6d4' : 
            color === 'sky' ? '#0ea5e9' : 
            color === 'purple' ? '#a855f7' : 
            color === 'pink' ? '#ec4899' : 
            color === 'fuchsia' ? '#d946ef' : '#3b82f6' 
        }}></div>
        <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">{title}</h3>
        <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-black text-slate-800">{(value || 0).toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
            <span className="text-sm font-bold text-slate-400 mb-1">{suffix}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">المثالي: {ideal}</span>
            {/* مؤشر بسيط للحالة - تم تعديل المنطق ليكون أكثر دقة */}
            {(value !== null && value !== undefined) && (
                <span className={`px-2 py-0.5 rounded-full ${
                    // Working Capital: Good if > 0
                    (title === 'رأس المال العامل' && value > 0) ? 'bg-emerald-100 text-emerald-700' :
                    (title === 'رأس المال العامل' && value <= 0) ? 'bg-red-100 text-red-700' :
                    // Break-even Point: Good if sales > breakEvenPoint
                    (title === 'نقطة التعادل (Break-even Point)' && ratios && ratios.sales > value) ? 'bg-emerald-100 text-emerald-700' :
                    (title === 'نقطة التعادل (Break-even Point)' && ratios && ratios.sales <= value && value > 0) ? 'bg-red-100 text-red-700' :
                    // Other ratios: Use generic comparison
                    (value >= parseFloat(ideal) || (ideal === '-' && value > 0)) ? 'bg-emerald-100 text-emerald-700' :
                    'bg-amber-100 text-amber-700'
                }`}>
                    {(title === 'رأس المال العامل' && value > 0) ? 'جيد' :
                     (title === 'رأس المال العامل' && value <= 0) ? 'ضعيف' :
                     (title === 'نقطة التعادل (Break-even Point)' && ratios && ratios.sales > value) ? 'جيد' :
                     (title === 'نقطة التعادل (Break-even Point)' && ratios && ratios.sales <= value && value > 0) ? 'مرتفع' :
                     (value >= parseFloat(ideal) || (ideal === '-' && value > 0)) ? 'جيد' : 'منخفض'}
                </span>
            )}
        </div>
        <p className="text-xs text-slate-400 mt-3 leading-relaxed border-t border-slate-50 pt-2">{description}</p>
    </div>
  );

  // --- استدعاء دالة RPC لجلب البيانات التاريخية ---
  const [historicalData, setHistoricalData] = useState<{ profitabilityData: any[], liquidityData: any[] }>({ profitabilityData: [], liquidityData: [] });
  const [loadingCharts, setLoadingCharts] = useState(true);

  useEffect(() => {
    if (accounts.length === 0) return; // لا تسحب البيانات التاريخية حتى يجهز الدليل المحاسبي
  
    const fetchHistoricalData = async () => {
      setLoadingCharts(true);
      try {
        // تحسين: استدعاء الدالة بدون بارامترات لأن قاعدة البيانات تعرف المنظمة من الجلسة تلقائياً عبر get_my_org()
        const { data, error } = await supabase.rpc('get_historical_ratios');
        if (error) throw error;

        // التحقق من أن البيانات كائن يحتوي على المصفوفات المطلوبة قبل التحديث
        if (data && !Array.isArray(data)) {
          setHistoricalData(data);
        }
      } catch (error) {
        console.error("Error fetching historical ratios:", error);
        // يمكنك إضافة رسالة خطأ للمستخدم هنا
      } finally {
        setLoadingCharts(false);
      }
    };

    fetchHistoricalData();
  }, [accounts.length]); // إعادة المحاولة إذا تغير عدد الحسابات (حمّلت البيانات)

  const handleExportExcel = () => {
    if (!ratios) return;
    const data = [
        ['التحليل المالي والنسب'],
        ['تاريخ التقرير:', new Date().toLocaleDateString('ar-EG')],
        [],
        ['المؤشر', 'القيمة', 'الوحدة', 'المعدل المثالي'],
        ['النسبة المتداولة (Current Ratio)', ratios.currentRatio.toFixed(2), 'مرة', '1.5 - 2.0'],
        ['النسبة السريعة (Quick Ratio)', ratios.quickRatio.toFixed(2), 'مرة', '1.0'],
        ['رأس المال العامل', ratios.workingCapital.toLocaleString(), 'ج.م', '> 0'],
        ['هامش مجمل الربح', ratios.grossProfitMargin.toFixed(2), '%', '> 20%'],
        ['هامش صافي الربح', ratios.netProfitMargin.toFixed(2), '%', '> 10%'],
        ['العائد على الأصول (ROA)', ratios.roa.toFixed(2), '%', '> 5%'],
        ['العائد على الملكية (ROE)', ratios.roe.toFixed(2), '%', '> 15%'],
        ['نسبة الدين إلى حقوق الملكية', ratios.debtToEquity.toFixed(2), 'مرة', '< 1.0'],
        ['نقطة التعادل (Break-even Point)', ratios.breakEvenPoint.toLocaleString(), 'ج.م', `< ${ratios.sales.toLocaleString()}`],
        ['التكاليف الثابتة', ratios.fixedCosts.toLocaleString(), 'ج.م', '-'],
        ['التكاليف المتغيرة', ratios.variableCosts.toLocaleString(), 'ج.م', '-'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financial Ratios");
    XLSX.writeFile(wb, `Financial_Ratios_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // منع اختفاء الأرقام: إذا كانت الحسابات لا تزال فارغة، نظهر مؤشر تحميل بدلاً من أصفار
  if (accounts.length === 0 || !ratios) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4 animate-in fade-in">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
        <p className="text-slate-500 font-bold italic">جاري موازنة النسب المالية والبيانات التاريخية...</p>
      </div>
    );
  }

  // تحديد حالة التحميل الكلية
  const overallLoading = loadingData || loadingCharts;

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm print:hidden animate-in fade-in">
        <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                <Gauge className="text-indigo-600" size={32} /> التحليل المالي والنسب
            </h1>
            <p className="text-slate-500 mt-1 font-medium">مؤشرات الأداء المالي لتقييم صحة المنشأة واتخاذ القرارات</p>
        </div>
        <div className="flex gap-2 items-center">
            <div className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors font-bold text-sm">
                <RefreshCw size={16} className={overallLoading ? "animate-spin" : ""} /> تحديث
            </div>
            <div className="flex items-center gap-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">من</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
            </div>
            <div className="flex items-center gap-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">إلى</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
            </div>
            <button onClick={handleExportExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg hover:bg-emerald-700 transition-all">
                <Download size={18}/> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg hover:bg-slate-700 transition-all">
                <Printer size={18}/> طباعة
            </button>
        </div>
      </div>

      <div className="hidden print:block text-center mb-8 border-b-2 border-slate-800 pb-4">
          <h1 className="text-3xl font-bold mb-2">تقرير التحليل المالي والنسب</h1>
          <p className="text-sm text-slate-500 mt-2">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
      </div>

      {/* Liquidity Ratios */}
      <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Activity className="text-blue-500" /> نسب السيولة (Liquidity)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <RatioCard 
                  title="النسبة المتداولة (Current Ratio)" 
                  value={ratios.currentRatio} 
                  ideal="1.5 - 2.0" 
                  description="قدرة الشركة على سداد التزاماتها قصيرة الأجل باستخدام أصولها المتداولة."
                  color="blue"
              />
              <RatioCard 
                  title="النسبة السريعة (Quick Ratio)" 
                  value={ratios.quickRatio} 
                  ideal="1.0" 
                  description="قدرة السداد الفوري دون الاعتماد على بيع المخزون (الأصول الأكثر سيولة)."
                  color="indigo"
              />
              <RatioCard 
                  title="رأس المال العامل" 
                  value={ratios.workingCapital} 
                  suffix="ج.م"
                  ideal="> 0" 
                  description="السيولة الفائضة المتاحة للعمليات اليومية (الأصول المتداولة - الخصوم المتداولة)."
                  color="emerald"
              />
          </div>
      </div>

      {/* Profitability Ratios */}
      <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp className="text-emerald-500" /> نسب الربحية (Profitability)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <RatioCard 
                  title="هامش مجمل الربح" 
                  value={ratios.grossProfitMargin} 
                  suffix="%"
                  ideal="> 20%" 
                  description="النسبة المئوية للربح بعد خصم تكلفة البضاعة المباعة فقط."
                  color="emerald"
              />
              <RatioCard 
                  title="هامش صافي الربح" 
                  value={ratios.netProfitMargin} 
                  suffix="%"
                  ideal="> 10%" 
                  description="الربح النهائي لكل جنيه مبيعات بعد خصم كافة المصروفات."
                  color="teal"
              />
              <RatioCard 
                  title="العائد على الأصول (ROA)" 
                  value={ratios.roa} 
                  suffix="%"
                  ideal="> 5%" 
                  description="مدى كفاءة الإدارة في استخدام الأصول لتوليد الأرباح."
                  color="cyan"
              />
              <RatioCard 
                  title="العائد على الملكية (ROE)" 
                  value={ratios.roe} 
                  suffix="%"
                  ideal="> 15%" 
                  description="العائد الذي يحققه المستثمرون على أموالهم المستثمرة."
                  color="sky"
              />
          </div>
      </div>

      {/* Break-even Analysis */}
      <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Target className="text-purple-600" /> تحليل نقطة التعادل (Break-even)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <RatioCard 
                  title="التكاليف الثابتة (Fixed Costs)" 
                  value={ratios.fixedCosts} 
                  suffix="ج.م"
                  ideal="-" 
                  description="المصروفات التشغيلية التي لا تتغير مع حجم المبيعات (رواتب، إيجار...)."
                  color="purple"
              />
              <RatioCard 
                  title="التكاليف المتغيرة (Variable Costs)" 
                  value={ratios.variableCosts} 
                  suffix="ج.م"
                  ideal="-" 
                  description="التكاليف المرتبطة مباشرة بالإنتاج والمبيعات (تكلفة البضاعة المباعة)."
                  color="pink"
              />
              <RatioCard 
                  title="نقطة التعادل (Break-even Point)" 
                  value={ratios.breakEvenPoint} 
                  suffix="ج.م"
                  ideal={`أقل من المبيعات الفعلية (${ratios.sales.toLocaleString()})`} 
                  description="حجم المبيعات اللازم لتغطية كافة التكاليف (لا ربح ولا خسارة)."
                  color="fuchsia"
            />
              {/* جديد: معدل دوران المخزون */}
              <RatioCard 
                  title="معدل دوران المخزون" 
                  value={ratios.inventoryTurnover} 
                  suffix="مرة"
                  ideal="> 5" 
                  description="عدد المرات التي يتم فيها بيع واستبدال المخزون خلال الفترة (كفاءة إدارة المخزون)."
                  color="sky"               
              />
          </div>
      </div>

      {/* Year-over-Year Comparison Chart */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <TrendingUp className="text-blue-600" /> مقارنة الأداء السنوي ({currentYear} vs {prevYear})
          </h3>
          <div className="h-80 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} />
                      <YAxis tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(val) => `${val / 1000}k`} />
                      <Tooltip formatter={(value: number) => value.toLocaleString()} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Legend />
                      <Bar dataKey={currentYear} name={`السنة الحالية (${currentYear})`} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey={prevYear} name={`السنة السابقة (${prevYear})`} fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
              </ResponsiveContainer>
          </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-6">تطور هوامش الربحية</h3>
              <div className="h-64 w-full" dir="ltr">
                {loadingCharts ? (
                    <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-blue-500" /></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historicalData.profitabilityData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} />
                          <YAxis tick={{fill: '#64748b', fontSize: 12}} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="ربحية" stroke="#10b981" strokeWidth={3} dot={{r: 4}} name="هامش صافي الربح %" />
                      </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-6">مؤشر السيولة</h3>
              <div className="h-64 w-full" dir="ltr">
                {loadingCharts ? (
                    <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-blue-500" /></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={historicalData.liquidityData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} />
                          <YAxis tick={{fill: '#64748b', fontSize: 12}} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="سيولة" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} name="النسبة المتداولة" />
                      </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
          </div>
      </div>
    </div>
  );
};

export default FinancialRatios;
