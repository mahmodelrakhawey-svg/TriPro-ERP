import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  PieChart, 
  ArrowRightLeft, 
  Layers, 
  CheckCircle2, 
  RefreshCw, 
  Printer, 
  Sparkles, 
  HelpCircle,
  BarChart3,
  Calendar,
  Zap,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

export const CFODashboard: React.FC = () => {
  const { accounts, settings, organization, currentUser, currentSelectedOrgId, selectedFiscalYear } = useAccounting();
  const { showToast } = useToast();

  const currentYear = selectedFiscalYear || new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [loading, setLoading] = useState<boolean>(false);
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);
  const [cumulativeLines, setCumulativeLines] = useState<any[]>([]);

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || session?.user?.user_metadata?.org_id || (organization as any)?.id;

      // 1. حركات السنة لبيان الدخل والمبيعات والتكلفة
      let qPeriod = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, reference, organization_id)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.transaction_date', startDate)
        .lte('journal_entries.transaction_date', endDate);
      if (userOrgId) qPeriod = qPeriod.eq('journal_entries.organization_id', userOrgId);
      const { data: periodData, error: err1 } = await qPeriod;
      if (err1) throw err1;
      setLedgerLines(periodData || []);

      // 2. الأرصدة التراكمية حتى نهاية السنة لحسابات المركز المالي
      let qCum = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', endDate);
      if (userOrgId) qCum = qCum.eq('journal_entries.organization_id', userOrgId);
      const { data: cumData, error: err2 } = await qCum;
      if (err2) throw err2;
      setCumulativeLines(cumData || []);

    } catch (err: any) {
      console.error('Error fetching CFO dashboard data:', err);
      showToast('خطأ أثناء جلب مؤشرات السيولة: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [year, currentSelectedOrgId]);

  // حساب المؤشرات والنسب التنفيذية
  const metrics = useMemo(() => {
    // 1. أرصدة المركز المالي (الأصول والخصوم)
    const bsBalances: Record<string, number> = {};
    cumulativeLines.forEach(line => {
      bsBalances[line.account_id] = (bsBalances[line.account_id] || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0);
    });

    // 2. حركات الدخل (المبيعات والتكلفة والمصروفات)
    const pnlBalances: Record<string, number> = {};
    ledgerLines.forEach(line => {
      if (line.journal_entries?.reference?.startsWith('CLOSE-')) return;
      pnlBalances[line.account_id] = (pnlBalances[line.account_id] || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0);
    });

    let totalCash = 0;
    let totalReceivables = 0;
    let totalInventory = 0;
    let totalOtherCurrentAssets = 0;

    let totalPayables = 0;
    let totalOtherCurrentLiabilities = 0;

    let totalNonCurrentAssets = 0;
    let totalNonCurrentLiabilities = 0;

    let totalRevenues = 0;
    let totalCogs = 0;
    let totalOperatingExpenses = 0;

    accounts.forEach(acc => {
      const code = String(acc.code || '').trim();
      const name = String(acc.name || '').trim().toLowerCase();
      const type = (acc.type || '').toLowerCase();

      const bsVal = bsBalances[acc.id] || 0;
      const pnlVal = pnlBalances[acc.id] || 0;

      // أصول متداولة
      if (code.startsWith('12') || (code.startsWith('1') && !code.startsWith('11'))) {
        if (name.includes('نقد') || name.includes('صندوق') || name.includes('بنك') || code.startsWith('121')) {
          totalCash += bsVal;
        } else if (name.includes('عميل') || name.includes('عملاء') || code.startsWith('122')) {
          totalReceivables += bsVal;
        } else if (name.includes('مخزون') || code.startsWith('123')) {
          totalInventory += bsVal;
        } else {
          totalOtherCurrentAssets += bsVal;
        }
      } else if (code.startsWith('11')) {
        // أصول غير متداولة
        const isContra = code.startsWith('1119') || code.startsWith('1129') || name.includes('مجمع إهلاك');
        totalNonCurrentAssets += isContra ? -Math.abs(bsVal) : bsVal;
      }

      // التزامات متداولة
      if (code.startsWith('21') || (code.startsWith('2') && !code.startsWith('22'))) {
        const liabilityAmt = -bsVal; // دائن
        if (name.includes('مورد') || code.startsWith('211')) {
          totalPayables += liabilityAmt;
        } else {
          totalOtherCurrentLiabilities += liabilityAmt;
        }
      } else if (code.startsWith('22')) {
        totalNonCurrentLiabilities += -bsVal;
      }

      // إيرادات
      if (code.startsWith('4') || type.includes('revenue')) {
        totalRevenues += -pnlVal;
      }

      // تكلفة ومصروفات تشغيلية
      if (code.startsWith('51') || code.startsWith('501') || name.includes('تكلفة')) {
        totalCogs += pnlVal;
      } else if (code.startsWith('52') || code.startsWith('53') || (code.startsWith('5') && !code.startsWith('55'))) {
        totalOperatingExpenses += pnlVal;
      }
    });

    const totalCurrentAssets = totalCash + totalReceivables + totalInventory + totalOtherCurrentAssets;
    const totalCurrentLiabilities = totalPayables + totalOtherCurrentLiabilities;
    const netWorkingCapital = totalCurrentAssets - totalCurrentLiabilities;

    // النسب المالية
    const currentRatio = totalCurrentLiabilities > 0 ? totalCurrentAssets / totalCurrentLiabilities : (totalCurrentAssets > 0 ? 99 : 0);
    const quickAssets = totalCash + totalReceivables;
    const quickRatio = totalCurrentLiabilities > 0 ? quickAssets / totalCurrentLiabilities : (quickAssets > 0 ? 99 : 0);
    const cashRatio = totalCurrentLiabilities > 0 ? totalCash / totalCurrentLiabilities : (totalCash > 0 ? 99 : 0);

    // دورة التحول النقدي (Cash Conversion Cycle - CCC)
    // DIO: فترة بقاء المخزون بالأيام
    const dio = totalCogs > 0 ? (totalInventory / totalCogs) * 365 : 0;
    // DSO: فترة تحصيل العملاء بالأيام
    const dso = totalRevenues > 0 ? (totalReceivables / totalRevenues) * 365 : 0;
    // DPO: فترة سداد الموردين بالأيام
    const dpo = totalCogs > 0 ? (totalPayables / totalCogs) * 365 : 0;
    // CCC: صافي دورة التحول النقدي
    const ccc = Math.max(0, dio + dso - dpo);

    // فترة الأمان الدفاعية (Defensive Interval Period - بالأيام)
    // كم يوماً تكفي السيولة المتاحة لتغطية النفقات التشغيلية دون أية مبيعات جديدة
    const dailyOpEx = (totalCogs + totalOperatingExpenses) / 365;
    const defensiveDays = dailyOpEx > 0 ? quickAssets / dailyOpEx : 365;

    // مؤشر السلامة المالية (Health Score out of 100)
    let score = 50;
    if (currentRatio >= 1.5 && currentRatio <= 3.0) score += 15;
    else if (currentRatio >= 1.2) score += 8;
    else score -= 15;

    if (quickRatio >= 1.0) score += 15;
    else if (quickRatio >= 0.8) score += 5;
    else score -= 10;

    if (netWorkingCapital > 0) score += 10;
    else score -= 20;

    if (ccc <= 60) score += 10;
    else if (ccc <= 90) score += 5;

    const healthScore = Math.min(100, Math.max(10, score));

    return {
      totalCash,
      totalReceivables,
      totalInventory,
      totalCurrentAssets,
      totalPayables,
      totalCurrentLiabilities,
      netWorkingCapital,
      totalNonCurrentAssets,
      totalNonCurrentLiabilities,
      totalRevenues,
      totalCogs,
      totalOperatingExpenses,
      currentRatio,
      quickRatio,
      cashRatio,
      dio,
      dso,
      dpo,
      ccc,
      defensiveDays,
      healthScore
    };
  }, [accounts, cumulativeLines, ledgerLines]);

  const formatMoney = (val: number) => {
    return Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      {/* شريط العنوان واختيار السنة */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-100">
            <Activity size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900">
                لوحة قيادة المدير المالي (CFO) وإدارة السيولة
              </h1>
              <span className="bg-cyan-50 text-cyan-700 border border-cyan-200 text-xs font-black px-2.5 py-0.5 rounded-full">
                Executive CCC
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              تحليل دورة التحول النقدي، مؤشرات رأس المال العامل، وفترة الأمان الدفاعية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <Calendar size={18} className="text-slate-500" />
            <span className="text-xs font-bold text-slate-700">السنة المالية:</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-transparent font-black text-cyan-700 text-sm focus:outline-none cursor-pointer"
            >
              {[2027, 2026, 2025, 2024, 2023].map((y) => (
                <option key={y} value={y}>سنة {y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold hover:bg-slate-800 transition shadow-sm"
          >
            <Printer size={16} />
            طباعة اللوحة
          </button>

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition"
            title="تحديث البيانات"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* بطاقات المؤشرات التنفيذية العليا */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* 1. دورة التحول النقدي */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500">دورة التحول النقدي (CCC)</span>
              <h3 className="text-3xl font-black text-slate-900 mt-2 font-mono">
                {metrics.ccc.toFixed(0)} <span className="text-sm font-bold text-slate-500">يوماً</span>
              </h3>
              <p className="text-xs text-cyan-600 font-bold mt-2 flex items-center gap-1">
                <Clock size={14} /> فجوة التمويل التشغيلي
              </p>
            </div>
            <div className="p-3 bg-cyan-50 text-cyan-600 rounded-xl">
              <Clock size={24} />
            </div>
          </div>
          <div className="mt-4 bg-slate-100 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full ${metrics.ccc <= 60 ? 'bg-emerald-500' : metrics.ccc <= 90 ? 'bg-amber-500' : 'bg-red-500'}`} 
              style={{ width: `${Math.min(100, (metrics.ccc / 120) * 100)}%` }}
            ></div>
          </div>
        </div>

        {/* 2. صافي رأس المال العامل */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500">صافي رأس المال العامل (NWC)</span>
              <h3 className="text-2xl font-black text-slate-900 mt-2 font-mono">
                {formatMoney(metrics.netWorkingCapital)} <span className="text-xs font-bold text-slate-500">ج.م</span>
              </h3>
              <p className={`text-xs font-bold mt-2 flex items-center gap-1 ${metrics.netWorkingCapital >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {metrics.netWorkingCapital >= 0 ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {metrics.netWorkingCapital >= 0 ? 'فائض تشغيلي مريح' : 'عجز في السيولة التشغيلية'}
              </p>
            </div>
            <div className={`p-3 rounded-xl ${metrics.netWorkingCapital >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              <DollarSign size={24} />
            </div>
          </div>
          <div className="mt-4 text-[11px] text-slate-400 font-medium">
            الأصول المتداولة: {formatMoney(metrics.totalCurrentAssets)} ج.م
          </div>
        </div>

        {/* 3. نسبة التداول والسيولة السريعة */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500">نسبة التداول (Current Ratio)</span>
              <h3 className="text-3xl font-black text-slate-900 mt-2 font-mono">
                {metrics.currentRatio.toFixed(2)}
              </h3>
              <p className="text-xs text-blue-600 font-bold mt-2">
                السيولة السريعة: <span className="font-mono font-black">{metrics.quickRatio.toFixed(2)}</span>
              </p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <ShieldCheck size={24} />
            </div>
          </div>
          <div className="mt-4 text-[11px] text-slate-400 font-medium">
            المعيار الأمثل: 1.5 - 2.0 ضعف
          </div>
        </div>

        {/* 4. فترة الأمان الدفاعية */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-500">فترة الأمان الدفاعية (DIP)</span>
              <h3 className="text-3xl font-black text-slate-900 mt-2 font-mono">
                {metrics.defensiveDays.toFixed(0)} <span className="text-sm font-bold text-slate-500">يوماً</span>
              </h3>
              <p className="text-xs text-indigo-600 font-bold mt-2">
                قدرة الصمود دون مبيعات جديدة
              </p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Zap size={24} />
            </div>
          </div>
          <div className="mt-4 text-[11px] text-slate-400 font-medium">
            النقدية وشبه النقدية: {formatMoney(metrics.totalCash + metrics.totalReceivables)} ج.م
          </div>
        </div>
      </div>

      {/* مخطط دورة التحول النقدي التفاعلي (CCC Flow Timeline) */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Clock className="text-cyan-600" size={20} />
              تفصيل دورة التحول النقدي (Cash Conversion Cycle = DIO + DSO - DPO)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              المدة الزمنية بالأيام من لحظة دفع النقد للموردين حتى استرداده نقداً من تحصيل العملاء
            </p>
          </div>
          <div className="bg-cyan-50 border border-cyan-200 px-4 py-2 rounded-2xl">
            <span className="text-xs font-bold text-cyan-800">إجمالي دورة السيولة: </span>
            <span className="text-base font-black text-cyan-950 font-mono">{metrics.ccc.toFixed(1)} يوماً</span>
          </div>
        </div>

        {/* المخطط الزمني */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 1. فترة بقاء المخزون DIO */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 relative">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-600">1. بقاء المخزون (DIO)</span>
              <span className="text-xs font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-lg">+ يضاف</span>
            </div>
            <h4 className="text-2xl font-black text-slate-900 font-mono mb-1">
              {metrics.dio.toFixed(1)} <span className="text-xs font-bold text-slate-500">يوماً</span>
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              المدة المقدرة لبقاء المواد الخام والإنتاج التام في المستودع قبل بيعه.
            </p>
            <div className="text-xs font-medium text-slate-600 border-t border-slate-200 pt-2 flex justify-between">
              <span>قيمة المخزون:</span>
              <span className="font-mono font-bold">{formatMoney(metrics.totalInventory)} ج.م</span>
            </div>
          </div>

          {/* 2. فترة تحصيل العملاء DSO */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 relative">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-600">2. تحصيل العملاء (DSO)</span>
              <span className="text-xs font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-lg">+ يضاف</span>
            </div>
            <h4 className="text-2xl font-black text-slate-900 font-mono mb-1">
              {metrics.dso.toFixed(1)} <span className="text-xs font-bold text-slate-500">يوماً</span>
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              متوسط الفترة الزمنية لتحصيل الفواتير ومستحقات العملاء نقداً.
            </p>
            <div className="text-xs font-medium text-slate-600 border-t border-slate-200 pt-2 flex justify-between">
              <span>أرصدة العملاء:</span>
              <span className="font-mono font-bold">{formatMoney(metrics.totalReceivables)} ج.م</span>
            </div>
          </div>

          {/* 3. فترة سداد الموردين DPO */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 relative">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-600">3. سداد الموردين (DPO)</span>
              <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg">- يطرح</span>
            </div>
            <h4 className="text-2xl font-black text-slate-900 font-mono mb-1">
              {metrics.dpo.toFixed(1)} <span className="text-xs font-bold text-slate-500">يوماً</span>
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              فترة الائتمان الممنوحة من الموردين قبل الاضطرار للسداد الفعلي.
            </p>
            <div className="text-xs font-medium text-slate-600 border-t border-slate-200 pt-2 flex justify-between">
              <span>أرصدة الموردين:</span>
              <span className="font-mono font-bold">{formatMoney(metrics.totalPayables)} ج.م</span>
            </div>
          </div>
        </div>

        {/* مؤشر النتيجة النهائية */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-2xl flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">الخلاصة التنفيذية لدورة التحول:</span>
            <p className="text-sm font-medium text-slate-200">
              تحتاج الشركة إلى تمويل تشغيلي مستمر لتغطية <span className="text-white font-black">{metrics.ccc.toFixed(0)} يوماً</span> بين الدفع للموردين والتحصيل من العملاء.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400">تقييم الكفاءة النقدية:</span>
            <div className="text-base font-black text-emerald-400 flex items-center gap-1.5 mt-0.5">
              <Sparkles size={16} /> {metrics.ccc <= 60 ? 'كفاءة ممتازة' : metrics.ccc <= 90 ? 'كفاءة جيدة' : 'تتطلب تحسين التحصيل'}
            </div>
          </div>
        </div>
      </div>

      {/* هيكل رأس المال العامل ومؤشر السلامة المالية */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* هيكل رأس المال العامل */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Layers className="text-indigo-600" size={18} />
            تكوين رأس المال العامل (Working Capital Components)
          </h3>
          <p className="text-xs text-slate-500">
            مقارنة حجم مكونات السيولة المتداولة والالتزامات قصيرة الأجل
          </p>

          <div className="space-y-3 pt-2">
            {/* النقدية */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700">النقدية وما في حكمها</span>
                <span className="font-mono text-emerald-700">{formatMoney(metrics.totalCash)} ج.م</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full" 
                  style={{ width: `${metrics.totalCurrentAssets > 0 ? (metrics.totalCash / metrics.totalCurrentAssets) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {/* العملاء */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700">العملاء وأوراق القبض</span>
                <span className="font-mono text-blue-700">{formatMoney(metrics.totalReceivables)} ج.م</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full" 
                  style={{ width: `${metrics.totalCurrentAssets > 0 ? (metrics.totalReceivables / metrics.totalCurrentAssets) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {/* المخزون */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700">المخزون السلعي</span>
                <span className="font-mono text-amber-700">{formatMoney(metrics.totalInventory)} ج.م</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 rounded-full" 
                  style={{ width: `${metrics.totalCurrentAssets > 0 ? (metrics.totalInventory / metrics.totalCurrentAssets) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {/* الموردون (التزامات) */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-red-700">الموردون والالتزامات المتداولة</span>
                <span className="font-mono text-red-700">({formatMoney(metrics.totalCurrentLiabilities)}) ج.م</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-500 rounded-full" 
                  style={{ width: `${metrics.totalCurrentAssets > 0 ? (metrics.totalCurrentLiabilities / metrics.totalCurrentAssets) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* مؤشر السلامة ومخاطر التعثر */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <ShieldCheck className="text-emerald-600" size={18} />
              مؤشر الملاءة والسلامة المالية
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              تقييم مركب للقدرة على الوفاء ومخاطر التعثر
            </p>
          </div>

          <div className="text-center my-4">
            <div className="relative inline-flex items-center justify-center">
              <div className="w-32 h-32 rounded-full border-8 border-slate-100 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-3xl font-black text-slate-900 font-mono">{metrics.healthScore}</span>
                  <span className="text-xs text-slate-400 block font-bold">من 100</span>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <span className="text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full">
                {metrics.healthScore >= 75 ? 'ملاءة ممتازة ومنطقة أمان' : metrics.healthScore >= 50 ? 'منطقة متابعة مستقرة' : 'حذر ومخاطر سيولة'}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">توصية المدير المالي:</p>
            <p className="leading-relaxed">
              {metrics.dso > 60 
                ? 'يوصى بتسريع وتيرة التحصيل من العملاء لتقليص دورة النقد.'
                : 'الأداء النقدي والتشغيلي متزن ومتوافق مع المعايير المستهدفة.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CFODashboard;
