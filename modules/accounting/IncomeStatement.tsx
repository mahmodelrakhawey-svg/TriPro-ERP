import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { 
  FileText, 
  Printer, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  Loader2, 
  RefreshCw, 
  Layers, 
  PieChart, 
  DollarSign, 
  ShieldCheck,
  Briefcase,
  Landmark,
  PiggyBank
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

interface AccountLine {
  id: string;
  code: string;
  name: string;
  value: number;
}

const IncomeStatement = () => {
  const { accounts, settings, currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(fiscalYearRange.endDate);
  const [showLogo, setShowLogo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  // دالة لجلب البيانات من قاعدة البيانات مباشرة لضمان الدقة والشمولية
  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setLoading(false);
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
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, reference, organization_id)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.transaction_date', startDate)
        .lte('journal_entries.transaction_date', endDate);

      if (userOrgId) {
        query = query.eq('journal_entries.organization_id', userOrgId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLedgerLines(data || []);
    } catch (err: any) {
      console.error('Error fetching income statement data:', err);
      showToast('فشل جلب البيانات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, accounts, currentUser]); // إضافة الاعتمادات الناقصة

  const reportData = useMemo(() => {
    // 1. تصفية حسابات الأرباح والخسائر حصراً واستبعاد الأصول والخصوم وحقوق الملكية
    const pnlAccounts = accounts.filter(a => {
      const code = String(a.code || '').trim();
      if (code.startsWith('1') || code.startsWith('2') || code.startsWith('3')) {
        return false;
      }
      const type = (a.type || '').toLowerCase();
      return (
        code.startsWith('4') || 
        code.startsWith('5') ||
        type.includes('revenue') || 
        type.includes('income') || 
        type.includes('expense') || 
        type.includes('cost') ||
        type.includes('إيراد') || 
        type.includes('مصروف') ||
        type.includes('تكلفة')
      );
    });

    // 2. حساب رصيد كل حساب من حركات اليومية المسجلة
    const accountBalances: Record<string, number> = {};
    
    if (currentUser?.role === 'demo') {
      accounts.forEach(acc => {
        const type = String(acc.type || '').toLowerCase();
        const isDebitNature = type.includes('asset') || type.includes('expense') || type.includes('أصول') || type.includes('مصروفات') || type.includes('تكلفة');
        if (isDebitNature) {
          accountBalances[acc.id] = acc.balance || 0;
        } else {
          accountBalances[acc.id] = -(acc.balance || 0);
        }
      });
    } else {
      (ledgerLines || []).filter(Boolean).forEach(line => {
        if (line.journal_entries?.reference?.startsWith('CLOSE-')) return;
        if (accountBalances[line.account_id] === undefined) accountBalances[line.account_id] = 0;
        accountBalances[line.account_id] += (Number(line.debit) || 0) - (Number(line.credit) || 0);
      });
    }

    // دوال مساعدة للتمييز الدقيق بين الفئات الثلاث وفق معيار IFRS 18
    const isFinanceAccount = (code: string, name: string) => {
      return (
        code.startsWith('423') || // فوائد بنكية دائنة
        code === '5342' ||        // فوائد قروض وسندات
        name.includes('فوائد دائنة') ||
        name.includes('فوائد بنكية دائنة') ||
        name.includes('عائد ودائع') ||
        name.includes('عائد تمويل') ||
        name.includes('إيراد تمويل') ||
        name.includes('فائدة قرض') ||
        name.includes('فوائد قروض') ||
        name.includes('فوائد مدينة') ||
        name.includes('تكلفة تمويل') ||
        name.includes('تكاليف تمويل') ||
        name.includes('مصروف تمويل') ||
        name.includes('فائدة قرض السندات') ||
        name.includes('مرابحة تمويلية')
      );
    };

    const isInvestingAccount = (code: string, name: string) => {
      return (
        code.startsWith('424') || // إيراد استثمارات
        name.includes('إيراد استثمارات') ||
        name.includes('ايراد استثمارات') ||
        name.includes('أرباح استثمارات') ||
        name.includes('توزيعات أرباح') ||
        name.includes('أرباح بيع أصول') ||
        name.includes('ارباح بيع اصول') ||
        name.includes('أرباح رأسمالية') ||
        name.includes('ارباح راسمالية') ||
        name.includes('خسائر بيع أصول') ||
        name.includes('خسائر بيع اصول') ||
        name.includes('خسائر رأسمالية') ||
        name.includes('خسائر راسمالية')
      );
    };

    const isTaxAccount = (code: string, name: string) => {
      return (
        name.includes('ضريبة دخل') ||
        name.includes('ضريبه دخل') ||
        name.includes('ضرائب الدخل') ||
        name.includes('مخصص ضريبة الدخل') ||
        (code.startsWith('55') && name.includes('ضريب'))
      );
    };

    const isCogsAccount = (code: string, name: string) => {
      return (
        code.startsWith('51') ||
        code.startsWith('501') ||
        name.includes('تكلفة المبيعات') ||
        name.includes('تكلفة البضاعة') ||
        name.includes('تكلفة البضاعه') ||
        name.includes('تكلفة الإنتاج') ||
        name.includes('تكلفة تشغيل') ||
        name.includes('أجور عمال الإنتاج') ||
        name.includes('اجور عمال')
      );
    };

    const isSellingAccount = (code: string, name: string) => {
      return (
        code.startsWith('52') ||
        name.includes('بيع وتوزيع') ||
        name.includes('بيع وتسويق') ||
        name.includes('مصروفات تسويق') ||
        name.includes('مصروفات مبيعات') ||
        name.includes('دعاية وإعلان') ||
        name.includes('معارض')
      );
    };

    // 1. الفئة التشغيلية (Operating Category)
    const operatingRevenues: AccountLine[] = [];
    const cogs: AccountLine[] = [];
    const otherOperatingIncome: AccountLine[] = [];
    const sellingExpenses: AccountLine[] = [];
    const adminExpenses: AccountLine[] = [];

    // 2. الفئة الاستثمارية (Investing Category)
    const investingIncome: AccountLine[] = [];
    const investingExpenses: AccountLine[] = [];

    // 3. الفئة التمويلية (Financing Category)
    const financeIncome: AccountLine[] = [];
    const financeCosts: AccountLine[] = [];

    // 4. ضرائب الدخل (Income Taxes)
    const taxExpenses: AccountLine[] = [];

    pnlAccounts.forEach(acc => {
      const balance = accountBalances[acc.id] || 0;
      if (Math.abs(balance) < 0.0001) return;

      const code = String(acc.code || '').trim();
      const name = String(acc.name || '').trim().toLowerCase();
      const type = String(acc.type || '').toLowerCase();

      const isRevenueNature = code.startsWith('4') || type.includes('revenue') || type.includes('income') || type.includes('إيراد');
      // الإيرادات بطبيعتها دائنة (حركة سالبة) -> تقلب موجبة. المصروفات مدينة (حركة موجبة) -> موجبة
      const val = isRevenueNature ? -balance : balance;

      // أ. الفئة التمويلية (Financing Category)
      if (isFinanceAccount(code, name)) {
        if (isRevenueNature || name.includes('دائن') || name.includes('عائد') || name.includes('إيراد')) {
          financeIncome.push({ id: acc.id, code: acc.code, name: acc.name, value: isRevenueNature ? val : -val });
        } else {
          financeCosts.push({ id: acc.id, code: acc.code, name: acc.name, value: val });
        }
        return;
      }

      // ب. الفئة الاستثمارية (Investing Category)
      if (isInvestingAccount(code, name)) {
        if (isRevenueNature || name.includes('أرباح') || name.includes('ارباح') || name.includes('إيراد') || name.includes('توزيعات')) {
          investingIncome.push({ id: acc.id, code: acc.code, name: acc.name, value: isRevenueNature ? val : -val });
        } else {
          investingExpenses.push({ id: acc.id, code: acc.code, name: acc.name, value: val });
        }
        return;
      }

      // ج. ضرائب الدخل (Income Tax)
      if (isTaxAccount(code, name)) {
        taxExpenses.push({ id: acc.id, code: acc.code, name: acc.name, value: val });
        return;
      }

      // د. الفئة التشغيلية (Operating Category)
      if (isRevenueNature) {
        if (code.startsWith('41') || name.includes('مبيعات') || !code.startsWith('42')) {
          operatingRevenues.push({ id: acc.id, code: acc.code, name: acc.name, value: val });
        } else {
          otherOperatingIncome.push({ id: acc.id, code: acc.code, name: acc.name, value: val });
        }
      } else {
        if (isCogsAccount(code, name)) {
          cogs.push({ id: acc.id, code: acc.code, name: acc.name, value: val });
        } else if (isSellingAccount(code, name)) {
          sellingExpenses.push({ id: acc.id, code: acc.code, name: acc.name, value: val });
        } else {
          adminExpenses.push({ id: acc.id, code: acc.code, name: acc.name, value: val });
        }
      }
    });

    // ترتيب الحسابات تصاعدياً بالأكواد
    const sortByCode = (a: AccountLine, b: AccountLine) => (a.code || '').localeCompare(b.code || '');
    operatingRevenues.sort(sortByCode);
    cogs.sort(sortByCode);
    otherOperatingIncome.sort(sortByCode);
    sellingExpenses.sort(sortByCode);
    adminExpenses.sort(sortByCode);
    investingIncome.sort(sortByCode);
    investingExpenses.sort(sortByCode);
    financeIncome.sort(sortByCode);
    financeCosts.sort(sortByCode);
    taxExpenses.sort(sortByCode);

    // المجاميع الإلزامية وفق معيار IFRS 18
    // 1. التشغيلي
    const totalOperatingRevenues = operatingRevenues.reduce((sum, r) => sum + r.value, 0);
    const totalCogs = cogs.reduce((sum, c) => sum + c.value, 0);
    const grossProfit = totalOperatingRevenues - totalCogs;
    const totalOtherOperatingIncome = otherOperatingIncome.reduce((sum, o) => sum + o.value, 0);
    const totalSellingExpenses = sellingExpenses.reduce((sum, s) => sum + s.value, 0);
    const totalAdminExpenses = adminExpenses.reduce((sum, a) => sum + a.value, 0);
    const totalOperatingExpenses = totalSellingExpenses + totalAdminExpenses;
    
    // المجموع الإلزامي الأول (Mandatory Subtotal 1): الربح التشغيلي
    const operatingProfit = grossProfit + totalOtherOperatingIncome - totalOperatingExpenses;

    // 2. الاستثماري
    const totalInvestingIncome = investingIncome.reduce((sum, i) => sum + i.value, 0);
    const totalInvestingExpenses = investingExpenses.reduce((sum, e) => sum + e.value, 0);
    const netInvesting = totalInvestingIncome - totalInvestingExpenses;

    // المجموع الإلزامي الثاني (Mandatory Subtotal 2): الربح قبل التمويل وضرائب الدخل
    const profitBeforeFinancingAndTax = operatingProfit + netInvesting;

    // 3. التمويلي
    const totalFinanceIncome = financeIncome.reduce((sum, f) => sum + f.value, 0);
    const totalFinanceCosts = financeCosts.reduce((sum, c) => sum + c.value, 0);
    const netFinancing = totalFinanceIncome - totalFinanceCosts;

    // المجموع الإلزامي الثالث (Mandatory Subtotal 3): الربح قبل الضرائب
    const profitBeforeTax = profitBeforeFinancingAndTax + netFinancing;

    // 4. الضرائب وصافي الربح النهائي
    const totalTaxExpenses = taxExpenses.reduce((sum, t) => sum + t.value, 0);
    const netIncome = profitBeforeTax - totalTaxExpenses;

    // المؤشرات والنسب التحليلية
    const grossMargin = totalOperatingRevenues > 0 ? (grossProfit / totalOperatingRevenues) * 100 : 0;
    const operatingMargin = totalOperatingRevenues > 0 ? (operatingProfit / totalOperatingRevenues) * 100 : 0;
    const netMargin = totalOperatingRevenues > 0 ? (netIncome / totalOperatingRevenues) * 100 : 0;

    return {
      operatingRevenues,
      cogs,
      otherOperatingIncome,
      sellingExpenses,
      adminExpenses,
      investingIncome,
      investingExpenses,
      financeIncome,
      financeCosts,
      taxExpenses,

      totalOperatingRevenues,
      totalCogs,
      grossProfit,
      totalOtherOperatingIncome,
      totalSellingExpenses,
      totalAdminExpenses,
      totalOperatingExpenses,

      operatingProfit,
      totalInvestingIncome,
      totalInvestingExpenses,
      netInvesting,
      profitBeforeFinancingAndTax,

      totalFinanceIncome,
      totalFinanceCosts,
      netFinancing,
      profitBeforeTax,

      totalTaxExpenses,
      netIncome,

      grossMargin,
      operatingMargin,
      netMargin
    };
  }, [accounts, ledgerLines, currentUser]);

  const handlePrint = () => {
    window.print();
  };

  const exportToExcel = () => {
    const data: any[][] = [
      ['شركة / مؤسسة', settings?.companyName || 'TriPro ERP'],
      ['قائمة الدخل الشامل (وفق معيار التقرير المالي الدولي IFRS 18)'],
      [`عن الفترة من: ${startDate} إلى: ${endDate}`],
      [''],
      ['كود الحساب', 'اسم الحساب / البند', 'القيمة'],
      ['=== 1. الفئة التشغيلية (Operating Category) ===', '', ''],
      ['-- إيرادات النشاط الرئيسي --', '', ''],
      ...reportData.operatingRevenues.map(r => [r.code, r.name, r.value]),
      ['إجمالي إيرادات النشاط الرئيسي', '', reportData.totalOperatingRevenues],
      [''],
      ['-- تكلفة المبيعات (COGS) --', '', ''],
      ...reportData.cogs.map(c => [c.code, c.name, c.value]),
      ['إجمالي تكلفة المبيعات', '', reportData.totalCogs],
      [''],
      ['مجمل الربح (Gross Profit)', '', reportData.grossProfit],
      [''],
      ['-- إيرادات تشغيلية أخرى --', '', ''],
      ...reportData.otherOperatingIncome.map(o => [o.code, o.name, o.value]),
      ['إجمالي إيرادات تشغيلية أخرى', '', reportData.totalOtherOperatingIncome],
      [''],
      ['-- مصروفات البيع والتسويق --', '', ''],
      ...reportData.sellingExpenses.map(s => [s.code, s.name, s.value]),
      ['إجمالي مصروفات البيع والتسويق', '', reportData.totalSellingExpenses],
      [''],
      ['-- المصروفات الإدارية والعمومية --', '', ''],
      ...reportData.adminExpenses.map(a => [a.code, a.name, a.value]),
      ['إجمالي المصروفات الإدارية والعمومية', '', reportData.totalAdminExpenses],
      ['إجمالي المصروفات التشغيلية', '', reportData.totalOperatingExpenses],
      [''],
      ['>>> المجموع الإلزامي 1: الربح التشغيلي (Operating Profit) <<<', '', reportData.operatingProfit],
      [''],
      ['=== 2. الفئة الاستثمارية (Investing Category) ===', '', ''],
      ...reportData.investingIncome.map(i => [i.code, i.name, i.value]),
      ...reportData.investingExpenses.map(e => [e.code, e.name, -e.value]),
      ['صافي عوائد الأنشطة الاستثمارية', '', reportData.netInvesting],
      [''],
      ['>>> المجموع الإلزامي 2: الربح قبل التمويل وضريبة الدخل (Profit before Financing and Tax) <<<', '', reportData.profitBeforeFinancingAndTax],
      [''],
      ['=== 3. الفئة التمويلية (Financing Category) ===', '', ''],
      ['-- إيرادات التمويل والفوائد الدائنة --', '', ''],
      ...reportData.financeIncome.map(f => [f.code, f.name, f.value]),
      ['-- تكاليف ومصروفات التمويل --', '', ''],
      ...reportData.financeCosts.map(c => [c.code, c.name, c.value]),
      ['صافي تكلفة / إيراد التمويل', '', reportData.netFinancing],
      [''],
      ['>>> المجموع الإلزامي 3: الربح قبل الضرائب (Profit before Tax) <<<', '', reportData.profitBeforeTax],
      [''],
      ['=== ضرائب الدخل (Income Taxes) ===', '', ''],
      ...reportData.taxExpenses.map(t => [t.code, t.name, t.value]),
      ['إجمالي مصروف ضريبة الدخل', '', reportData.totalTaxExpenses],
      [''],
      ['===================================================='],
      ['>>> صافي ربح / (خسارة) الفترة النهائي <<<', '', reportData.netIncome],
      ['====================================================']
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Income Statement IFRS 18");
    XLSX.writeFile(wb, `Income_Statement_IFRS18_${startDate}_${endDate}.xlsx`);
  };

  const formatMoney = (val: number) => {
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header & Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="text-emerald-600" />
              قائمة الدخل الشامل (الأرباح والخسائر)
            </h2>
            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200 flex items-center gap-1">
              <ShieldCheck size={14} className="text-blue-600" />
              معيار IFRS 18
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            تقرير الأداء المالي مبوباً وفق الفئات المحددة (تشغيلية، استثمارية، تمويلية) والمجاميع الفرعية الإلزامية
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors font-semibold text-sm shadow-sm"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-blue-600" : ""} /> تحديث
          </button>
          <button 
            onClick={handlePrint} 
            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors shadow-sm font-semibold text-sm"
          >
            <Printer size={18} /> طباعة
          </button>
          <button 
            onClick={exportToExcel} 
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-semibold text-sm"
          >
            <Download size={18} /> تصدير Excel
          </button>
        </div>
      </div>

      {/* KPI Cards Bar (IFRS 18 Highlights) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        {/* 1. Revenues */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">إيرادات النشاط التشغيلي</p>
            <h4 className="text-xl font-bold text-slate-800 mt-1">{formatMoney(reportData.totalOperatingRevenues)}</h4>
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-1">
              النشاط الرئيسي
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Briefcase size={22} />
          </div>
        </div>

        {/* 2. Gross Profit */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">مجمل الربح (Gross Profit)</p>
            <h4 className="text-xl font-bold text-slate-800 mt-1">{formatMoney(reportData.grossProfit)}</h4>
            <span className="text-xs text-blue-600 font-semibold flex items-center gap-1 mt-1">
              هامش: {reportData.grossMargin.toFixed(1)}%
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <PieChart size={22} />
          </div>
        </div>

        {/* 3. Operating Profit */}
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm flex items-center justify-between bg-gradient-to-br from-white to-blue-50/40">
          <div>
            <p className="text-xs font-medium text-blue-700">الربح التشغيلي (IFRS 18)</p>
            <h4 className={`text-xl font-bold mt-1 ${reportData.operatingProfit >= 0 ? 'text-blue-900' : 'text-red-600'}`}>
              {formatMoney(reportData.operatingProfit)}
            </h4>
            <span className="text-xs text-blue-700 font-semibold flex items-center gap-1 mt-1">
              هامش: {reportData.operatingMargin.toFixed(1)}%
            </span>
          </div>
          <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
            <Layers size={22} />
          </div>
        </div>

        {/* 4. Net Profit */}
        <div className={`p-4 rounded-xl border shadow-sm flex items-center justify-between ${
          reportData.netIncome >= 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'
        }`}>
          <div>
            <p className={`text-xs font-medium ${reportData.netIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              صافي الربح للفترة
            </p>
            <h4 className={`text-xl font-bold mt-1 ${reportData.netIncome >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
              {formatMoney(reportData.netIncome)}
            </h4>
            <span className={`text-xs font-semibold flex items-center gap-1 mt-1 ${reportData.netIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              صافي الهامش: {reportData.netMargin.toFixed(1)}%
            </span>
          </div>
          <div className={`p-3 rounded-xl ${reportData.netIncome >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            <DollarSign size={22} />
          </div>
        </div>
      </div>

      {/* Date Filter & Options */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-semibold text-slate-700 mb-1">من تاريخ</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" 
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-semibold text-slate-700 mb-1">إلى تاريخ</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" 
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input 
            type="checkbox" 
            id="showLogo" 
            checked={showLogo} 
            onChange={e => setShowLogo(e.target.checked)} 
            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" 
          />
          <label htmlFor="showLogo" className="text-sm font-semibold text-slate-700 cursor-pointer">
            إظهار الشعار الرسمي عند الطباعة
          </label>
        </div>
      </div>

      {/* Report Document Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none" id="report-content">
        <ReportHeader 
          title="قائمة الدخل الشامل (وفق معيار التقرير المالي الدولي IFRS 18)" 
          subtitle={`عن الفترة المحاسبية من ${startDate} إلى ${endDate}`} 
        />

        {loading && (
          <div className="p-16 text-center">
            <Loader2 className="animate-spin mx-auto text-blue-600 mb-3" size={36} />
            <p className="text-slate-500 font-medium text-sm">جاري تجميع حركات الحسابات وتصنيفها معيارياً...</p>
          </div>
        )}

        {!loading && (
          <div className="p-6 md:p-8 space-y-8">
            {/* ========================================================================= */}
            {/* 1. الفئة التشغيلية (OPERATING CATEGORY)                                    */}
            {/* ========================================================================= */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase size={18} className="text-emerald-400" />
                  <h3 className="font-bold text-base">1. الفئة التشغيلية (Operating Category - IFRS 18)</h3>
                </div>
                <span className="text-xs text-slate-300">الأنشطة الإنتاجية والتجارية والخدمية الأساسية</span>
              </div>

              <div className="p-5 space-y-6">
                {/* 1.1 إيرادات النشاط الرئيسي */}
                <div>
                  <h4 className="text-sm font-bold text-emerald-800 mb-2 flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp size={16} className="text-emerald-600" />
                      إيرادات النشاط الرئيسي (المبيعات والخدمات)
                    </span>
                    <span className="text-xs text-slate-500 font-normal">كود 41 وما في حكمه</span>
                  </h4>
                  <table className="w-full text-sm">
                    <tbody>
                      {reportData.operatingRevenues.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-2 text-center text-slate-400 italic">لا توجد إيرادات مبيعات مسجلة خلال الفترة</td>
                        </tr>
                      ) : (
                        reportData.operatingRevenues.map(r => (
                          <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                            <td className="py-1.5 text-slate-500 font-mono text-xs w-28">{r.code}</td>
                            <td className="py-1.5 text-slate-800">{r.name}</td>
                            <td className="py-1.5 text-right font-medium text-slate-700">{formatMoney(r.value)}</td>
                          </tr>
                        ))
                      )}
                      <tr className="bg-emerald-50/70 font-bold text-emerald-900 border-t border-emerald-200">
                        <td colSpan={2} className="py-2 px-3">إجمالي إيرادات النشاط الرئيسي</td>
                        <td className="py-2 px-3 text-right">{formatMoney(reportData.totalOperatingRevenues)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 1.2 تكلفة المبيعات (COGS) */}
                <div>
                  <h4 className="text-sm font-bold text-amber-800 mb-2 flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <TrendingDown size={16} className="text-amber-600" />
                      تكلفة المبيعات والإنتاج (Cost of Goods Sold)
                    </span>
                    <span className="text-xs text-slate-500 font-normal">كود 51 والتكاليف المباشرة</span>
                  </h4>
                  <table className="w-full text-sm">
                    <tbody>
                      {reportData.cogs.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-2 text-center text-slate-400 italic">لا توجد تكاليف بضاعة مباعة مسجلة خلال الفترة</td>
                        </tr>
                      ) : (
                        reportData.cogs.map(c => (
                          <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                            <td className="py-1.5 text-slate-500 font-mono text-xs w-28">{c.code}</td>
                            <td className="py-1.5 text-slate-800">{c.name}</td>
                            <td className="py-1.5 text-right font-medium text-slate-700">{formatMoney(c.value)}</td>
                          </tr>
                        ))
                      )}
                      <tr className="bg-amber-50/70 font-bold text-amber-900 border-t border-amber-200">
                        <td colSpan={2} className="py-2 px-3">إجمالي تكلفة المبيعات (COGS)</td>
                        <td className="py-2 px-3 text-right">{formatMoney(reportData.totalCogs)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* مجمل الربح (Gross Profit Subtotal) */}
                <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-lg flex justify-between items-center font-bold text-blue-900">
                  <div className="flex items-center gap-2">
                    <PieChart size={18} className="text-blue-600" />
                    <span>مجمل الربح (Gross Profit)</span>
                    <span className="text-xs font-normal text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full mr-2">
                      هامش {reportData.grossMargin.toFixed(1)}%
                    </span>
                  </div>
                  <span className="text-lg font-black">{formatMoney(reportData.grossProfit)}</span>
                </div>

                {/* 1.3 إيرادات تشغيلية أخرى */}
                {reportData.otherOperatingIncome.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-emerald-800 mb-2 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                      <span>إيرادات تشغيلية أخرى (حوافز، خدمات متفرقة، تأجير تشغيلي)</span>
                      <span className="text-xs text-slate-500 font-normal">كود 42 التشغيلي</span>
                    </h4>
                    <table className="w-full text-sm">
                      <tbody>
                        {reportData.otherOperatingIncome.map(o => (
                          <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                            <td className="py-1.5 text-slate-500 font-mono text-xs w-28">{o.code}</td>
                            <td className="py-1.5 text-slate-800">{o.name}</td>
                            <td className="py-1.5 text-right font-medium text-slate-700">{formatMoney(o.value)}</td>
                          </tr>
                        ))}
                        <tr className="bg-emerald-50/50 font-bold text-emerald-800">
                          <td colSpan={2} className="py-1.5 px-3">إجمالي الإيرادات التشغيلية الأخرى</td>
                          <td className="py-1.5 px-3 text-right">{formatMoney(reportData.totalOtherOperatingIncome)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 1.4 المصروفات التشغيلية (بيع وتسويق + عمومية وإدارية) */}
                <div>
                  <h4 className="text-sm font-bold text-red-800 mb-2 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <TrendingDown size={16} className="text-red-600" />
                      المصروفات التشغيلية (بيع، تسويق، إدارة وعموميات)
                    </span>
                    <span className="text-xs text-slate-500 font-normal">أكواد 52 و 53 التشغيلية</span>
                  </h4>

                  {/* مصروفات البيع والتسويق */}
                  {reportData.sellingExpenses.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-bold text-slate-600 mb-1 px-1">مصروفات البيع والتسويق:</p>
                      <table className="w-full text-sm">
                        <tbody>
                          {reportData.sellingExpenses.map(s => (
                            <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                              <td className="py-1 text-slate-500 font-mono text-xs w-28 pr-4">{s.code}</td>
                              <td className="py-1 text-slate-700">{s.name}</td>
                              <td className="py-1 text-right font-medium text-slate-700">{formatMoney(s.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* المصروفات الإدارية والعمومية */}
                  {reportData.adminExpenses.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-bold text-slate-600 mb-1 px-1">المصروفات العمومية والإدارية:</p>
                      <table className="w-full text-sm">
                        <tbody>
                          {reportData.adminExpenses.map(a => (
                            <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                              <td className="py-1 text-slate-500 font-mono text-xs w-28 pr-4">{a.code}</td>
                              <td className="py-1 text-slate-700">{a.name}</td>
                              <td className="py-1 text-right font-medium text-slate-700">{formatMoney(a.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="bg-red-50/70 border-t border-red-200 flex justify-between items-center py-2 px-3 font-bold text-red-900 text-sm rounded">
                    <span>إجمالي المصروفات التشغيلية</span>
                    <span>{formatMoney(reportData.totalOperatingExpenses)}</span>
                  </div>
                </div>

                {/* المجموع الإلزامي 1: الربح التشغيلي (Mandatory Subtotal 1: Operating Profit) */}
                <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 rounded-xl flex justify-between items-center shadow-md">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={20} className="text-blue-300" />
                      <span className="font-extrabold text-base md:text-lg">
                        المجموع الإلزامي الأول: الربح التشغيلي (Operating Profit)
                      </span>
                    </div>
                    <p className="text-xs text-blue-200 mt-1">
                      مجمل الربح + الإيرادات التشغيلية الأخرى - إجمالي المصروفات التشغيلية (معيار IFRS 18)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl md:text-2xl font-black font-mono">
                      {formatMoney(reportData.operatingProfit)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 2. الفئة الاستثمارية (INVESTING CATEGORY)                                    */}
            {/* ========================================================================= */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark size={18} className="text-purple-400" />
                  <h3 className="font-bold text-base">2. الفئة الاستثمارية (Investing Category - IFRS 18)</h3>
                </div>
                <span className="text-xs text-slate-300">عوائد الأصول المستقلة والاستثمارات المالية وأرباح التخارج</span>
              </div>

              <div className="p-5 space-y-4">
                {reportData.investingIncome.length === 0 && reportData.investingExpenses.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg text-center text-sm text-slate-500 border border-dashed border-slate-200">
                    لا توجد عوائد أو خسائر استثمارية مسجلة خلال الفترة (0.00)
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {reportData.investingIncome.map(i => (
                        <tr key={i.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                          <td className="py-1.5 text-slate-500 font-mono text-xs w-28">{i.code}</td>
                          <td className="py-1.5 text-slate-800">{i.name} (إيراد/أرباح استثمارية)</td>
                          <td className="py-1.5 text-right font-medium text-emerald-700">+{formatMoney(i.value)}</td>
                        </tr>
                      ))}
                      {reportData.investingExpenses.map(e => (
                        <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                          <td className="py-1.5 text-slate-500 font-mono text-xs w-28">{e.code}</td>
                          <td className="py-1.5 text-slate-800">{e.name} (خسائر أصول/استثمارات)</td>
                          <td className="py-1.5 text-right font-medium text-red-600">-{formatMoney(e.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="flex justify-between items-center bg-purple-50 p-2.5 rounded-lg border border-purple-100 text-sm font-bold text-purple-900">
                  <span>صافي عوائد الأنشطة الاستثمارية</span>
                  <span className="font-mono">{formatMoney(reportData.netInvesting)}</span>
                </div>

                {/* المجموع الإلزامي 2: الربح قبل التمويل وضريبة الدخل */}
                <div className="bg-gradient-to-r from-purple-800 to-slate-800 text-white p-4 rounded-xl flex justify-between items-center shadow-md">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={20} className="text-purple-300" />
                      <span className="font-extrabold text-base md:text-lg">
                        المجموع الإلزامي الثاني: الربح قبل التمويل وضرائب الدخل
                      </span>
                    </div>
                    <p className="text-xs text-purple-200 mt-1">
                      الربح التشغيلي + صافي عوائد الأنشطة الاستثمارية (Profit before Financing and Tax)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl md:text-2xl font-black font-mono">
                      {formatMoney(reportData.profitBeforeFinancingAndTax)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 3. الفئة التمويلية (FINANCING CATEGORY)                                    */}
            {/* ========================================================================= */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PiggyBank size={18} className="text-amber-400" />
                  <h3 className="font-bold text-base">3. الفئة التمويلية (Financing Category - IFRS 18)</h3>
                </div>
                <span className="text-xs text-slate-300">عوائد وتكاليف التمويل والفوائد الدائنة والمدينة</span>
              </div>

              <div className="p-5 space-y-4">
                {reportData.financeIncome.length === 0 && reportData.financeCosts.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg text-center text-sm text-slate-500 border border-dashed border-slate-200">
                    لا توجد إيرادات أو تكاليف تمويل مسجلة خلال الفترة (0.00)
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {reportData.financeIncome.map(f => (
                        <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                          <td className="py-1.5 text-slate-500 font-mono text-xs w-28">{f.code}</td>
                          <td className="py-1.5 text-slate-800">{f.name} (إيرادات تمويل / فوائد دائنة)</td>
                          <td className="py-1.5 text-right font-medium text-emerald-700">+{formatMoney(f.value)}</td>
                        </tr>
                      ))}
                      {reportData.financeCosts.map(c => (
                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                          <td className="py-1.5 text-slate-500 font-mono text-xs w-28">{c.code}</td>
                          <td className="py-1.5 text-slate-800">{c.name} (تكاليف تمويل / فوائد قروض)</td>
                          <td className="py-1.5 text-right font-medium text-red-600">-{formatMoney(c.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="flex justify-between items-center bg-amber-50 p-2.5 rounded-lg border border-amber-100 text-sm font-bold text-amber-900">
                  <span>صافي تكلفة / إيراد التمويل</span>
                  <span className="font-mono">{formatMoney(reportData.netFinancing)}</span>
                </div>

                {/* المجموع الإلزامي 3: الربح قبل الضرائب */}
                <div className="bg-gradient-to-r from-slate-800 to-cyan-900 text-white p-4 rounded-xl flex justify-between items-center shadow-md">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={20} className="text-cyan-300" />
                      <span className="font-extrabold text-base md:text-lg">
                        المجموع الإلزامي الثالث: الربح قبل الضرائب (Profit before Tax)
                      </span>
                    </div>
                    <p className="text-xs text-cyan-200 mt-1">
                      الربح قبل التمويل والضرائب + صافي إيراد / (تكاليف) التمويل (معيار IFRS 18)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl md:text-2xl font-black font-mono">
                      {formatMoney(reportData.profitBeforeTax)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 4. ضرائب الدخل (INCOME TAXES)                                             */}
            {/* ========================================================================= */}
            {reportData.taxExpenses.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 px-5 py-2.5 border-b border-slate-200 flex justify-between items-center">
                  <span className="font-bold text-sm text-slate-700">ضرائب الدخل (Income Tax Expense)</span>
                  <span className="text-xs text-slate-500">معيار المحاسبة الدولي IAS 12</span>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <tbody>
                      {reportData.taxExpenses.map(t => (
                        <tr key={t.id} className="border-b border-slate-50">
                          <td className="py-1.5 text-slate-500 font-mono text-xs w-28">{t.code}</td>
                          <td className="py-1.5 text-slate-800">{t.name}</td>
                          <td className="py-1.5 text-right font-medium text-red-600">-{formatMoney(t.value)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold text-slate-800 bg-slate-50">
                        <td colSpan={2} className="py-2 px-2">إجمالي مصروف ضريبة الدخل</td>
                        <td className="py-2 px-2 text-right">{formatMoney(reportData.totalTaxExpenses)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* 5. صافي ربح / (خسارة) الفترة النهائي (NET PROFIT / LOSS)                  */}
            {/* ========================================================================= */}
            <div className={`p-6 rounded-2xl border-2 text-center transition-all shadow-md ${
              reportData.netIncome >= 0 
                ? 'bg-gradient-to-b from-emerald-50 to-white border-emerald-300 text-emerald-900' 
                : 'bg-gradient-to-b from-red-50 to-white border-red-300 text-red-900'
            }`}>
              <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-white shadow-xs border">
                <ShieldCheck size={14} className={reportData.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'} />
                النتيجة الختامية للفترة المالية
              </div>
              <h3 className="text-xl font-bold mb-2">
                صافي {reportData.netIncome >= 0 ? 'الربح المحقق للفترة' : 'الخسارة عن الفترة'} (Net Income)
              </h3>
              <p className="text-4xl font-black dir-ltr font-mono tracking-tight my-2">
                {formatMoney(reportData.netIncome)}
              </p>
              <p className="text-xs text-slate-500 max-w-lg mx-auto mt-2">
                يمثل صافي النتيجة الختامية للأداء المالي بعد استيفاء كافة التكاليف والمصروفات التشغيلية والاستثمارية والتمويلية وضريبة الدخل.
              </p>
            </div>

            {/* إشعار التوافق المعياري الدولي (IFRS 18 Disclosure) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-blue-600" />
                إيضاح التوافق المحاسبي الدولي:
              </div>
              <p>
                تم إعداد وتصنيف قائمة الدخل وفقاً لمتطلبات معيار التقرير المالي الدولي <strong className="text-slate-800">IFRS 18 (عرض القوائم المالية والإفصاح عنها)</strong> الصادر عن مجلس معايير المحاسبة الدولية (IASB)، مع إبراز الفئات الثلاث المحددة (التشغيلية، الاستثمارية، التمويلية) والمجاميع الإلزامية الفرعية الثلاثة (الربح التشغيلي، والربح قبل التمويل وضرائب الدخل، والربح قبل الضرائب)، بما يحقق الاتساق المباشر مع قائمة التدفقات النقدية (معيار IAS 7).
              </p>
            </div>
          </div>
        )}

        {/* توقيعات الطباعة الرسمية */}
        <div className="p-8 border-t border-slate-200 mt-8 hidden print:block">
          <div className="flex justify-between text-sm text-slate-600 pt-6">
            <div className="text-center w-1/3">
              <p className="font-bold mb-10">المحاسب المسؤول</p>
              <div className="border-t border-slate-400 w-3/4 mx-auto"></div>
            </div>
            <div className="text-center w-1/3">
              <p className="font-bold mb-10">المدير المالي</p>
              <div className="border-t border-slate-400 w-3/4 mx-auto"></div>
            </div>
            <div className="text-center w-1/3">
              <p className="font-bold mb-10">المدير العام / الاعتماد</p>
              <div className="border-t border-slate-400 w-3/4 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomeStatement;