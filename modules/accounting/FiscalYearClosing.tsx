import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import { 
  Lock, 
  Unlock, 
  AlertTriangle, 
  CheckCircle, 
  Calculator, 
  Calendar, 
  ArrowRight, 
  RefreshCw, 
  ShieldAlert, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  ChevronLeft, 
  Wrench, 
  Zap, 
  FileText,
  DollarSign,
  TrendingDown
} from 'lucide-react';

const FiscalYearClosing: React.FC = () => {
  const { closeFinancialYear, reopenFinancialYear, settings, organization, currentUser, currentSelectedOrgId, accounts } = useAccounting();
  const { showToast } = useToast();

  const currentYear = new Date().getFullYear();
  const [activeTab, setActiveTab] = useState<'wizard' | 'quick_close' | 'reopen'>('wizard');
  const [wizardStep, setWizardStep] = useState<number>(1); // 1: Diagnostics, 2: Depreciation, 3: Tax Provision, 4: Retained Earnings Closing

  const [year, setYear] = useState<number>(currentYear - 1 > 2020 ? currentYear - 1 : 2026);
  const [closingDate, setClosingDate] = useState<string>(`${year}-12-31`);
  const [reopenYearVal, setReopenYearVal] = useState(settings?.lastClosedYear || year);
  const [loading, setLoading] = useState<boolean>(false);
  const [completedSuccess, setCompletedSuccess] = useState<boolean>(false);

  // حالة الفحص والمؤشرات (Diagnostics)
  const [diagLoading, setDiagLoading] = useState<boolean>(false);
  const [unpostedCount, setUnpostedCount] = useState<number>(0);
  const [trialDiff, setTrialDiff] = useState<number>(0);
  const [activeAssets, setActiveAssets] = useState<any[]>([]);
  const [totalAnnualDepreciation, setTotalAnnualDepreciation] = useState<number>(0);
  const [depAlreadyPosted, setDepAlreadyPosted] = useState<boolean>(false);
  const [netProfitEstimate, setNetProfitEstimate] = useState<number>(0);
  const [taxProvisionEstimate, setTaxProvisionEstimate] = useState<number>(0);

  // تحديث تاريخ الإقفال عند تغيير السنة
  useEffect(() => {
    setClosingDate(`${year}-12-31`);
  }, [year]);

  // تشغيل الفحص المالي الشامل للسنة المختارة
  const runDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || session?.user?.user_metadata?.org_id || (organization as any)?.id;

      // 1. فحص القيود المسودة غير المرحلة
      let qDraft = supabase
        .from('journal_entries')
        .select('id', { count: 'exact' })
        .eq('status', 'draft')
        .gte('transaction_date', `${year}-01-01`)
        .lte('transaction_date', `${year}-12-31`);
      if (userOrgId) qDraft = qDraft.eq('organization_id', userOrgId);
      const { count: drafts } = await qDraft;
      setUnpostedCount(drafts || 0);

      // 2. فحص توازن ميزان المراجعة
      let qLines = supabase
        .from('journal_lines')
        .select('debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', `${year}-12-31`);
      if (userOrgId) qLines = qLines.eq('journal_entries.organization_id', userOrgId);
      const { data: lines } = await qLines;

      let totalDr = 0;
      let totalCr = 0;
      (lines || []).forEach(l => {
        totalDr += Number(l.debit || 0);
        totalCr += Number(l.credit || 0);
      });
      setTrialDiff(Math.abs(totalDr - totalCr));

      // 3. فحص الأصول وحساب الإهلاك السنوي
      let qAssets = supabase
        .from('assets')
        .select('*');
      if (userOrgId) qAssets = qAssets.eq('organization_id', userOrgId);
      const { data: assetRows } = await qAssets;

      let depSum = 0;
      const validAssets = (assetRows || []).map(a => {
        const cost = Number(a.purchase_cost || a.purchaseCost || 0);
        const salvage = Number(a.salvage_value || a.salvageValue || 0);
        const life = Number(a.useful_life_years || a.usefulLife || 5);
        const annualDep = life > 0 ? (cost - salvage) / life : 0;
        depSum += annualDep;
        return { ...a, calculatedAnnualDep: annualDep };
      });
      setActiveAssets(validAssets);
      setTotalAnnualDepreciation(depSum);

      // 4. التحقق هل تم ترحيل قيد إهلاك مسبق لهذه السنة
      let qDepEntry = supabase
        .from('journal_entries')
        .select('id')
        .eq('status', 'posted')
        .ilike('reference', `%DEP%${year}%`);
      if (userOrgId) qDepEntry = qDepEntry.eq('organization_id', userOrgId);
      const { data: depEntry } = await qDepEntry;
      setDepAlreadyPosted(Boolean(depEntry && depEntry.length > 0));

      // 5. تقدير صافي الربح والضريبة
      let qPnl = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, reference, organization_id)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.transaction_date', `${year}-01-01`)
        .lte('journal_entries.transaction_date', `${year}-12-31`);
      if (userOrgId) qPnl = qPnl.eq('journal_entries.organization_id', userOrgId);
      const { data: pnlLines } = await qPnl;

      let rev = 0;
      let exp = 0;
      const accountMap = new Map(accounts.map(a => [a.id, a]));
      ((pnlLines as any[]) || []).forEach((l: any) => {
        const je = Array.isArray(l.journal_entries) ? l.journal_entries[0] : l.journal_entries;
        if (je?.reference?.startsWith('CLOSE-')) return;
        const acc = accountMap.get(l.account_id);
        const code = String(acc?.code || '');
        const bal = Number(l.debit || 0) - Number(l.credit || 0);
        if (code.startsWith('4')) rev += -bal;
        else if (code.startsWith('5')) exp += bal;
      });

      const netProfit = rev - exp;
      setNetProfitEstimate(netProfit);
      setTaxProvisionEstimate(netProfit > 0 ? netProfit * 0.225 : 0);

    } catch (e: any) {
      console.error('Diagnostic error:', e);
      showToast('خطأ أثناء تشغيل الفحص: ' + e.message, 'error');
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, [year, currentSelectedOrgId]);

  // توليد وترحيل قيد الإهلاك السنوي الآلي
  const handleGenerateDepreciationEntry = async () => {
    if (totalAnnualDepreciation <= 0) {
      showToast('لا توجد مبالغ إهلاك سنوية مستحقة للاحتساب.', 'info');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من توليد وترحيل قيد الإهلاك السنوي لعام ${year} بمبلغ إجمالي ${totalAnnualDepreciation.toLocaleString()} ج.م؟`)) {
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || session?.user?.user_metadata?.org_id || (organization as any)?.id;

      // العثور على حساب مصروف الإهلاك (533) ومجمع الإهلاك (1119)
      const depExpAccount = accounts.find(a => String(a.code).startsWith('533') || a.name.includes('مصروف إهلاك'));
      const accDepAccount = accounts.find(a => String(a.code).startsWith('1119') || a.name.includes('مجمع إهلاك'));

      if (!depExpAccount || !accDepAccount) {
        throw new Error('يرجى التأكد من وجود حساب مصروف الإهلاك (533) وحساب مجمع الإهلاك (1119) في شجرة الحسابات.');
      }

      // إنشاء القيد في journal_entries
      const { data: entry, error: entryErr } = await supabase
        .from('journal_entries')
        .insert({
          organization_id: userOrgId,
          reference: `DEP-${year}`,
          entry_type: 'depreciation',
          transaction_date: closingDate,
          description: `إثبات قسط الإهلاك السنوي للأصول الثابتة عن السنة المالية ${year}`,
          status: 'posted'
        })
        .select()
        .single();

      if (entryErr) throw entryErr;

      // إنشاء أسطر القيد
      const lines = [
        {
          journal_entry_id: entry.id,
          account_id: depExpAccount.id,
          debit: totalAnnualDepreciation,
          credit: 0,
          description: `مصروف إهلاك الأصول السنوي عن عام ${year}`
        },
        {
          journal_entry_id: entry.id,
          account_id: accDepAccount.id,
          debit: 0,
          credit: totalAnnualDepreciation,
          description: `مجمع إهلاك الأصول السنوي عن عام ${year}`
        }
      ];

      const { error: linesErr } = await supabase.from('journal_lines').insert(lines);
      if (linesErr) throw linesErr;

      showToast(`تم إنشاء وترحيل قيد الإهلاك السنوي بنجاح برقم مرجعي DEP-${year} ✅`, 'success');
      setDepAlreadyPosted(true);
      runDiagnostics();
    } catch (err: any) {
      console.error('Depreciation entry error:', err);
      showToast('فشل إنشاء قيد الإهلاك: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // تنفيذ الإقفال الختامي النهائي
  const handleExecuteClosing = async () => {
    if (!year || year < 2000 || year > 2099) {
      showToast('يرجى إدخال سنة مالية صحيحة.', 'error');
      return;
    }

    if (!window.confirm(`هل أنت متأكد تماماً من الإقفال الختامي للسنة المالية ${year}؟\n\n• سيتم تصفير حسابات الإيرادات والمصروفات بالكامل.\n• ترحيل صافي أرباح/خسائر العام إلى حساب الأرباح المبقاة (32).\n• قفل الحركات وإصدار قيد الإقفال CLOSE-${year}.`)) {
      return;
    }

    setLoading(true);
    try {
      const success = await closeFinancialYear(year, closingDate);
      if (success) {
        setCompletedSuccess(true);
      }
    } catch (error: any) {
      showToast('فشل الإقفال: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // إعادة فتح سنة مغلقة
  const handleReopen = async () => {
    if (!reopenYearVal) {
      showToast('يرجى تحديد السنة المراد إعادة فتحها.', 'error');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من إعادة فتح السنة المالية ${reopenYearVal}؟\n\n• سيتم إلغاء قيد الإقفال السنوي.\n• السماح بتعديل وإضافة القيود في هذه السنة مؤقتاً.\n• يجب إعادة إقفال السنة فور الانتهاء من التعديلات.`)) {
      return;
    }

    setLoading(true);
    try {
      const success = await reopenFinancialYear(Number(reopenYearVal));
      if (success) {
        showToast(`تم فتح السنة ${reopenYearVal} بنجاح، يمكنك الآن تعديل وإضافة الحركات.`, 'success');
        runDiagnostics();
      }
    } catch (error: any) {
      showToast('فشل إعادة فتح السنة: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (completedSuccess) {
    return (
      <div className="max-w-2xl mx-auto mt-10 p-8 bg-white rounded-3xl shadow-xl text-center border border-slate-100 animate-in zoom-in" dir="rtl">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <CheckCircle size={44} />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-2">تم إقفال السنة المالية {year} بنجاح!</h2>
        <p className="text-slate-500 mb-6 leading-relaxed text-sm">
          تم تصفير حسابات المصروفات والإيرادات، وترحيل صافي النتيجة لحساب الأرباح المبقاة (32)، وتوليد قيد الإقفال الآلي <span className="font-mono font-bold text-indigo-600">CLOSE-{year}</span> بنجاح.
        </p>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-emerald-900 text-xs font-bold mb-8 text-right space-y-2">
          <p className="flex items-center gap-2"><Sparkles size={16} /> السنة المالية الجديدة مفتوحة وجاهزة لاستقبال الحركات مباشرة.</p>
          <p className="flex items-center gap-2"><Sparkles size={16} /> كافة أرصدة الأصول والالتزامات وحقوق الملكية تم تدويرها تلقائياً كأرصدة تراكمية مستمرة.</p>
        </div>

        <div className="flex gap-4 justify-center">
          <button 
            onClick={() => { setCompletedSuccess(false); setWizardStep(1); }} 
            className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition"
          >
            إجراء عملية أخرى
          </button>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg"
          >
            تحديث النظام
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in pb-12" dir="rtl">
      {/* الرأس واختيار الأنماط */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <Lock size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              معالج قيود التسويات الختامية والإقفال السنوي
              <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-2.5 py-0.5 rounded-full">
                Year-End Closing Wizard
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              تسوية إهلاك الأصول الآلي، مراجعة المخصصات، ترحيل الأرباح المبقاة وقفل السنة المالية
            </p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
          <button 
            onClick={() => setActiveTab('wizard')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition ${activeTab === 'wizard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            🧙‍♂️ معالج الإقفال الموجه
          </button>
          <button 
            onClick={() => setActiveTab('quick_close')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition ${activeTab === 'quick_close' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            ⚡ إقفال مباشر
          </button>
          <button 
            onClick={() => setActiveTab('reopen')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition ${activeTab === 'reopen' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            🔓 إعادة فتح سنة
          </button>
        </div>
      </div>

      {/* 1. معالج الإقفال الموجه متعدد المراحل */}
      {activeTab === 'wizard' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
          {/* خطوات المعالج */}
          <div className="grid grid-cols-4 gap-2 border-b border-slate-100 pb-6">
            {[
              { num: 1, title: 'الفحص المالي', desc: 'توازن الميزان والقيود' },
              { num: 2, title: 'إهلاك الأصول', desc: 'قيد الإهلاك الآلي' },
              { num: 3, title: 'تسوية الضرائب', desc: 'مخصص ضريبة الدخل' },
              { num: 4, title: 'الإقفال الختامي', desc: 'ترحيل الأرباح وقفل السنة' }
            ].map(s => {
              const isActive = wizardStep === s.num;
              const isPast = wizardStep > s.num;
              return (
                <button
                  key={s.num}
                  onClick={() => setWizardStep(s.num)}
                  className={`text-right p-3 rounded-2xl transition border ${
                    isActive 
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold' 
                      : isPast 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium' 
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs mb-1">
                    <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center font-mono text-[11px] ${
                      isPast ? 'bg-emerald-600 text-white' : isActive ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-700'
                    }`}>
                      {isPast ? '✓' : s.num}
                    </span>
                    <span className="font-bold">{s.title}</span>
                  </div>
                  <p className="text-[10px] opacity-80 truncate">{s.desc}</p>
                </button>
              );
            })}
          </div>

          {/* الخطوة 1: الفحص المالي والمطابقة */}
          {wizardStep === 1 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">المرحلة الأولى: فحص ومطابقة ميزان المراجعة والقيود</h3>
                  <p className="text-xs text-slate-500">التأكد من اكتمال العمليات وترحيل القيود وتوازن الحسابات قبل الإقفال</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">السنة المالية:</span>
                  <select
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className="border border-slate-300 rounded-xl px-3 py-1.5 font-black text-indigo-700 text-sm focus:outline-none"
                  >
                    {[2027, 2026, 2025, 2024, 2023].map(y => (
                      <option key={y} value={y}>سنة {y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* فحص توازن الميزان */}
                <div className={`p-5 rounded-2xl border ${trialDiff === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {trialDiff === 0 ? <CheckCircle2 className="text-emerald-600" size={20} /> : <AlertTriangle className="text-red-600" size={20} />}
                    <span className="text-xs font-bold text-slate-800">توازن ميزان المراجعة</span>
                  </div>
                  <p className="text-xl font-black font-mono">
                    {trialDiff === 0 ? 'متطابق (0.00 ج.م)' : `فارق: ${trialDiff.toLocaleString()} ج.م`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {trialDiff === 0 ? 'إجمالي المدين يساوي إجمالي الدائن تماماً.' : 'يجب معالجة الفارق قبل الإقفال.'}
                  </p>
                </div>

                {/* فحص القيود المسودة */}
                <div className={`p-5 rounded-2xl border ${unpostedCount === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {unpostedCount === 0 ? <CheckCircle2 className="text-emerald-600" size={20} /> : <AlertTriangle className="text-amber-600" size={20} />}
                    <span className="text-xs font-bold text-slate-800">مسودات القيود</span>
                  </div>
                  <p className="text-xl font-black font-mono">
                    {unpostedCount === 0 ? 'لا توجد مسودات معلقة' : `${unpostedCount} قيد مسودة`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {unpostedCount === 0 ? 'جميع القيود في السنة المالية مرحلة.' : 'يوصى بترحيل أو حذف القيود المسودة.'}
                  </p>
                </div>

                {/* مؤشر الجاهزية */}
                <div className="p-5 rounded-2xl border bg-slate-50 border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="text-indigo-600" size={20} />
                    <span className="text-xs font-bold text-slate-800">جاهزية الإقفال</span>
                  </div>
                  <p className="text-xl font-black text-indigo-700">
                    {trialDiff === 0 && unpostedCount === 0 ? 'مكتملة 100%' : 'تتطلب مراجعة'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    يمكنك الانتقال لخطوة إهلاك الأصول.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  onClick={() => setWizardStep(2)}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm"
                >
                  المرحلة التالية: إهلاك الأصول السنوي
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}

          {/* الخطوة 2: احتساب وإثبات إهلاك الأصول السنوي */}
          {wizardStep === 2 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">المرحلة الثانية: معالج احتساب وإثبات إهلاك الأصول السنوي</h3>
                  <p className="text-xs text-slate-500">احتساب قسط الإهلاك السنوي لجميع الأصول المسجلة وتوليد قيد الإهلاك آلياً</p>
                </div>

                {depAlreadyPosted && (
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> تم ترحيل قيد الإهلاك لعام {year} مسبقاً
                  </span>
                )}
              </div>

              {/* جدول الأصول المحتسب إهلاكها */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">اسم الأصل</th>
                      <th className="p-3 text-left">التكلفة</th>
                      <th className="p-3 text-left">الخردة</th>
                      <th className="p-3 text-center">العمر (سنوات)</th>
                      <th className="p-3 text-left bg-indigo-50/60 text-indigo-950 font-black">قسط الإهلاك السنوي ({year})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeAssets.length > 0 ? (
                      activeAssets.map((asset: any) => (
                        <tr key={asset.id}>
                          <td className="p-3 font-medium text-slate-800">{asset.name}</td>
                          <td className="p-3 text-left font-mono">{Number(asset.purchase_cost || asset.purchaseCost || 0).toLocaleString()} ج.م</td>
                          <td className="p-3 text-left font-mono">{Number(asset.salvage_value || asset.salvageValue || 0).toLocaleString()} ج.م</td>
                          <td className="p-3 text-center font-mono">{asset.useful_life_years || asset.usefulLife || 5}</td>
                          <td className="p-3 text-left font-mono font-bold text-indigo-700 bg-indigo-50/30">
                            {Number(asset.calculatedAnnualDep || 0).toLocaleString()} ج.م
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 font-medium">
                          لا توجد أصول مسجلة في سجل الأصول الثابتة.
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-100 font-black">
                      <td colSpan={4} className="p-3">إجمالي قسط الإهلاك السنوي المطلوب إثباته:</td>
                      <td className="p-3 text-left font-mono text-base text-indigo-900">
                        {totalAnnualDepreciation.toLocaleString()} ج.م
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* زر توليد قيد الإهلاك */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-800">قيد اليومية المقترح للإهلاك:</p>
                  <p className="text-xs text-slate-500 font-mono">
                    من حـ/ مصروف إهلاك الأصول (533) إلى حـ/ مجمع إهلاك الأصول الثابتة (1119)
                  </p>
                </div>

                <button
                  onClick={handleGenerateDepreciationEntry}
                  disabled={loading || depAlreadyPosted || totalAnnualDepreciation <= 0}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-indigo-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                  {depAlreadyPosted ? 'تم توليد قيد الإهلاك مسبقاً' : 'توليد وترحيل قيد الإهلاك السنوي الآن'}
                </button>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setWizardStep(1)}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  السابق
                </button>
                <button
                  onClick={() => setWizardStep(3)}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm"
                >
                  المرحلة التالية: تسوية الضرائب والمخصصات
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}

          {/* الخطوة 3: تسوية مخصص ضرائب الدخل */}
          {wizardStep === 3 && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h3 className="text-lg font-black text-slate-900">المرحلة الثالثة: تقدير وتسوية ضريبة الدخل السنوية</h3>
                <p className="text-xs text-slate-500">احتساب الضريبة التقديرية بناءً على صافي أرباح العام الخاضعة للضريبة</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                  <span className="text-xs font-bold text-slate-500">صافي ربح العام المقدر (قبل الضريبة)</span>
                  <h4 className="text-2xl font-black font-mono text-slate-900">
                    {netProfitEstimate.toLocaleString()} ج.م
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    محسوب من إجمالي الإيرادات مطروحاً منه كافة تكاليف ومصروفات السنة {year}.
                  </p>
                </div>

                <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-200 space-y-3">
                  <span className="text-xs font-bold text-indigo-700">مخصص ضريبة الدخل التقديري (22.5%)</span>
                  <h4 className="text-2xl font-black font-mono text-indigo-900">
                    {taxProvisionEstimate.toLocaleString()} ج.م
                  </h4>
                  <p className="text-xs text-indigo-600 leading-relaxed">
                    النسبة القانونية القياسية لضريبة أرباح الشركات المساهمة والتجارية.
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} /> ملاحظة المحاسب القانوني:
                </p>
                <p className="leading-relaxed">
                  إذا كان لديك إقرار ضريبي نهائي أو تسويات معتمدة من مراقب الحسابات، يرجى تسجيل قيد مخصص الضريبة من شاشة دفتر اليومية قبل تنفيذ الإقفال الختامي النهائي.
                </p>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setWizardStep(2)}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  السابق
                </button>
                <button
                  onClick={() => setWizardStep(4)}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm"
                >
                  المرحلة الأخيرة: الإقفال النهائي وترحيل الأرباح
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}

          {/* الخطوة 4: الإقفال الختامي وترحيل الأرباح المبقاة */}
          {wizardStep === 4 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="bg-red-50 border border-red-200 p-6 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-red-800 font-black text-base">
                  <Lock size={20} />
                  تنفيذ قيد الإقفال السنوي وترحيل النتيجة إلى حساب الأرباح المبقاة (32)
                </div>
                <p className="text-xs text-red-700 leading-relaxed">
                  سيقوم النظام آلياً بتوليد قيد الإقفال السنوي <span className="font-mono font-bold">CLOSE-{year}</span>، وتصفير كافة حسابات الإيرادات والمصروفات، وترحيل صافي الربح وقفل السنة ضد التعديل.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">السنة المالية المقفلة</label>
                  <input
                    type="text"
                    value={year}
                    readOnly
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 font-black text-slate-800 bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ قيد الإقفال</label>
                  <input
                    type="date"
                    value={closingDate}
                    onChange={e => setClosingDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 font-bold text-slate-800"
                  />
                </div>
              </div>

              <button
                onClick={handleExecuteClosing}
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-base transition shadow-lg shadow-red-100 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? <RefreshCw size={20} className="animate-spin" /> : <Lock size={20} />}
                {loading ? 'جاري معالجة القيود وترحيل الأرصدة...' : `تنفيذ الإقفال النهائي لسنة ${year} الآن`}
              </button>

              <div className="flex justify-start pt-4 border-t border-slate-100">
                <button
                  onClick={() => setWizardStep(3)}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  السابق
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. الإقفال المباشر السريع */}
      {activeTab === 'quick_close' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={24} />
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-bold text-sm mb-1">تعليمات الإقفال المباشر السريع:</p>
              <ul className="list-disc list-inside space-y-1 opacity-90">
                <li>سيتم فوراً تصفير حسابات المصروفات (5xxx) والإيرادات (4xxx) بقيد <span className="font-mono font-bold">CLOSE-{year}</span>.</li>
                <li>ترحيل صافي الدخل مباشرة لحساب الأرباح المبقاة (32).</li>
                <li>بدء السنة الجديدة بأرصدة الأصول والالتزامات المستمرة تلقائياً.</li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">السنة المالية</label>
              <input
                type="number" 
                value={year} 
                onChange={e => setYear(parseInt(e.target.value, 10) || 0)} 
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-lg focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">تاريخ قيد الإقفال</label>
              <input 
                type="date" 
                value={closingDate} 
                onChange={e => setClosingDate(e.target.value)} 
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <button 
              onClick={handleExecuteClosing} 
              disabled={loading}
              className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-base shadow-xl shadow-red-100 hover:bg-red-700 transition flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : <Lock size={20} />}
              {loading ? 'جاري معالجة القيود وترحيل الأرصدة...' : 'تنفيذ الإقفال المباشر للسنة'}
            </button>
          </div>
        </div>
      )}

      {/* 3. إعادة فتح سنة مغلقة */}
      {activeTab === 'reopen' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex gap-3">
            <ShieldAlert className="text-blue-600 shrink-0 mt-0.5" size={24} />
            <div className="text-xs text-blue-800 space-y-1">
              <p className="font-bold text-sm mb-1">إعادة فتح سنة مالية مغلقة (للتصحيح والتعديل):</p>
              <ul className="list-disc list-inside space-y-1 opacity-90">
                <li>تتيح لك إعادة فتح آخر سنة مغلقة لإجراء تسويات أو تعديل قيود محاسبية.</li>
                <li>يتم حذف قيد الإقفال السابق تلقائياً وفك الحظر عن التاريخ المحدد.</li>
                <li>يجب إعادة تنفيذ الإقفال بمجرد الانتهاء من التسويات المطلوبة.</li>
              </ul>
            </div>
          </div>

          <div className="max-w-xs">
            <label className="block text-sm font-bold text-slate-700 mb-2">السنة المغلقة المراد إعادة فتحها</label>
            <input
              type="number" 
              value={reopenYearVal || ''} 
              onChange={e => setReopenYearVal(parseInt(e.target.value, 10) || 0)} 
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-lg focus:border-blue-500 outline-none"
              placeholder="2024"
            />
          </div>

          <div className="border-t border-slate-100 pt-6">
            <button 
              onClick={handleReopen} 
              disabled={loading || !reopenYearVal}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-base shadow-xl shadow-slate-200 hover:bg-slate-800 transition flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : <Unlock size={20} />}
              {loading ? 'جاري معالجة فتح السنة...' : 'إعادة فتح السنة المالية'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiscalYearClosing;
