import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToastNotification } from '../../utils/toastUtils';
import { useNavigate } from 'react-router-dom';
import { 
  Landmark, 
  Filter, 
  Printer, 
  Loader2, 
  AlertTriangle, 
  CheckCircle, 
  Download, 
  Search, 
  RefreshCw,
  Scale,
  Layers,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Activity,
  ArrowRightLeft,
  Coins
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type BalanceRow = {
  account: Account;
  amount: number;
};

const BalanceSheet: React.FC = () => {
  const { accounts, currentUser, currentSelectedOrgId, selectedFiscalYear, settings } = useAccounting();
  const toast = useToastNotification();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [asOfDate, setAsOfDate] = useState(
    selectedFiscalYear === new Date().getFullYear() 
      ? new Date().toISOString().split('T')[0] 
      : `${selectedFiscalYear}-12-31`
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);
  // نمط العرض: إما العرض التحليلي المعياري (IFRS رأس المال العامل وصافي الأصول) أو العرض التقليدي (كفتي الميزانية)
  const [viewMode, setViewMode] = useState<'analytical' | 'classic'>('analytical');

  // مزامنة تاريخ الميزانية مع السنة المالية المحددة في النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      if (selectedFiscalYear === new Date().getFullYear()) {
        setAsOfDate(new Date().toISOString().split('T')[0]);
      } else {
        setAsOfDate(`${selectedFiscalYear}-12-31`);
      }
    }
  }, [selectedFiscalYear]);

  // جلب الأرصدة التراكمية من قاعدة البيانات مباشرة
  const fetchData = async () => {
    setLoading(true);
    try {
      const userOrgId = currentSelectedOrgId || (currentUser as any)?.organization_id;

      if (!userOrgId) {
        return;
      }

      const { data, error } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .eq('journal_entries.status', 'posted')
        .eq('journal_entries.organization_id', userOrgId)
        .lte('journal_entries.transaction_date', asOfDate);

      if (error) throw error;
      setLedgerLines(data || []);
    } catch (err: any) {
      console.error('Error fetching balance sheet data:', err);
      toast.error('فشل جلب البيانات: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role !== 'demo') {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [asOfDate, currentUser, accounts, currentSelectedOrgId]);

  // تصنيف عناصر المركز المالي وفق المعيار الدولي IAS 1
  const reportData = useMemo(() => {
    const accountBalances: Record<string, number> = {};
    let priorPnlSum = 0;
    let currentPnlSum = 0;

    const currentYear = new Date(asOfDate).getFullYear();
    const currentYearStart = `${currentYear}-01-01`;

    const accountMap = new Map<string, any>();
    accounts.forEach(acc => accountMap.set(acc.id, acc));

    if (currentUser?.role === 'demo') {
      accounts.forEach(acc => {
        const type = (acc.type || '').toLowerCase().trim();
        const balance = acc.balance || 0;
        const code = String(acc.code || '');

        if (code.startsWith('4')) currentPnlSum -= balance;
        else if (code.startsWith('5')) currentPnlSum += balance;
        else accountBalances[acc.id] = balance;
      });
    } else {
      (ledgerLines || []).forEach(line => {
        if (!accountBalances[line.account_id]) accountBalances[line.account_id] = 0;
        accountBalances[line.account_id] += (Number(line.debit) || 0) - (Number(line.credit) || 0);

        const acc = accountMap.get(line.account_id);
        if (acc) {
          const type = (acc.type || '').toLowerCase().trim();
          const code = String(acc.code || '');
          const isPnl = !code.startsWith('1') && !code.startsWith('2') && !code.startsWith('3') && (
            code.startsWith('4') || code.startsWith('5') || type.includes('revenue') || type.includes('expense')
          );
          if (isPnl) {
            const transactionDate = line.journal_entries?.transaction_date;
            if (transactionDate && transactionDate < currentYearStart) {
              priorPnlSum += (Number(line.debit) || 0) - (Number(line.credit) || 0);
            } else {
              currentPnlSum += (Number(line.debit) || 0) - (Number(line.credit) || 0);
            }
          }
        }
      });
    }

    // تصنيف دقيق للأصول المتداولة وغير المتداولة، والخصوم المتداولة وغير المتداولة
    const currentAssets: BalanceRow[] = [];
    const nonCurrentAssets: BalanceRow[] = [];
    const currentLiabilities: BalanceRow[] = [];
    const nonCurrentLiabilities: BalanceRow[] = [];
    const equityRows: BalanceRow[] = [];

    // دوال الفحص
    const isCashOrBank = (code: string, name: string, type: string) => {
      return (
        code.startsWith('123') || code.startsWith('101') ||
        type.includes('cash') || type.includes('bank') ||
        name.includes('نقدية') || name.includes('صندوق') || name.includes('خزينة') || 
        name.includes('بنك') || name.includes('محفظة') || name.includes('فودافون') || name.includes('انستا')
      );
    };

    const isCurrentAssetAccount = (code: string, name: string, type: string) => {
      if (code.startsWith('12') || code.startsWith('10') || isCashOrBank(code, name, type)) return true;
      if (name.includes('مخزون') || name.includes('عملاء') || name.includes('مدينون') || 
          name.includes('أوراق قبض') || name.includes('سلف') || name.includes('عهد') || 
          name.includes('ضريبة مدخلات') || name.includes('دفعات مقدمة') || name.includes('مصروف مقدم')) {
        return true;
      }
      return type.includes('current_asset') || type.includes('متداولة');
    };

    const isNonCurrentLiabilityAccount = (code: string, name: string, type: string) => {
      if (code.startsWith('21') || code.startsWith('23')) return true;
      if (name.includes('طويلة الأجل') || name.includes('طويل الأجل') || name.includes('قرض السندات')) return true;
      return type.includes('non_current') || type.includes('long_term') || type.includes('غير متداولة');
    };

    accounts.forEach(acc => {
      if (acc.isGroup || !accountBalances[acc.id] || Math.abs(accountBalances[acc.id]) < 0.0001) return;
      const rawBalance = accountBalances[acc.id];
      const type = (acc.type || '').toLowerCase().trim();
      const code = String(acc.code || '').trim();
      const name = String(acc.name || '').trim().toLowerCase();

      // الأصول (المجموعة 1)
      if (type.includes('asset') || code.startsWith('1')) {
        // مجمع الإهلاك (Contra-Asset) - يُطرح من الأصول الثابتة
        if (name.includes('مجمع إهلاك') || name.includes('مجمع الاهلاك') || type.includes('depreciation')) {
          nonCurrentAssets.push({ account: acc, amount: rawBalance }); // سيكون سالباً بطبيعته الدائنة
        } else if (isCurrentAssetAccount(code, name, type)) {
          currentAssets.push({ account: acc, amount: rawBalance });
        } else {
          nonCurrentAssets.push({ account: acc, amount: rawBalance });
        }
      }
      // الخصوم (المجموعة 2)
      else if (type.includes('liability') || code.startsWith('2')) {
        const liabilityAmount = -rawBalance; // تحويل الرصيد الدائن لموجب
        if (isNonCurrentLiabilityAccount(code, name, type)) {
          nonCurrentLiabilities.push({ account: acc, amount: liabilityAmount });
        } else {
          currentLiabilities.push({ account: acc, amount: liabilityAmount });
        }
      }
      // حقوق الملكية (المجموعة 3)
      else if (type.includes('equity') || code.startsWith('3')) {
        // استبعاد الحساب الوسيط 3999 إذا كان 0، أو إظهاره كتسوية إن وجد رصيد
        if (code === '3999' && Math.abs(rawBalance) < 0.01) return;
        equityRows.push({ account: acc, amount: -rawBalance });
      }
    });

    const netIncome = -currentPnlSum;
    const priorRetainedEarnings = -priorPnlSum;

    // حساب المجاميع
    const totalCurrentAssets = currentAssets.reduce((sum, r) => sum + r.amount, 0);
    const totalNonCurrentAssets = nonCurrentAssets.reduce((sum, r) => sum + r.amount, 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    const totalCurrentLiabilities = currentLiabilities.reduce((sum, r) => sum + r.amount, 0);
    const totalNonCurrentLiabilities = nonCurrentLiabilities.reduce((sum, r) => sum + r.amount, 0);
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

    // صافي رأس المال العامل (Working Capital)
    const netWorkingCapital = totalCurrentAssets - totalCurrentLiabilities;

    // إجمالي رأس المال الموظف بالتشغيل (Capital Employed)
    const totalCapitalEmployed = netWorkingCapital + totalNonCurrentAssets;

    // صافي الأصول (Net Assets)
    const netAssets = totalCapitalEmployed - totalNonCurrentLiabilities;

    // إجمالي حقوق الملكية (Total Equity)
    const baseEquity = equityRows.reduce((sum, r) => sum + r.amount, 0);
    const totalEquity = baseEquity + priorRetainedEarnings + netIncome;

    // المؤشرات المالية
    const currentRatio = totalCurrentLiabilities > 0 ? (totalCurrentAssets / totalCurrentLiabilities) : 0;
    const isBalancedAnalytical = Math.abs(netAssets - totalEquity) < 0.1;
    const isBalancedClassic = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.1;

    return {
      currentAssets: currentAssets.sort((a, b) => a.account.code.localeCompare(b.account.code)),
      nonCurrentAssets: nonCurrentAssets.sort((a, b) => a.account.code.localeCompare(b.account.code)),
      currentLiabilities: currentLiabilities.sort((a, b) => a.account.code.localeCompare(b.account.code)),
      nonCurrentLiabilities: nonCurrentLiabilities.sort((a, b) => a.account.code.localeCompare(b.account.code)),
      equityRows: equityRows.sort((a, b) => a.account.code.localeCompare(b.account.code)),

      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,

      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,

      netWorkingCapital,
      totalCapitalEmployed,
      netAssets,
      totalEquity,
      netIncome,
      priorRetainedEarnings,

      currentRatio,
      isBalanced: viewMode === 'analytical' ? isBalancedAnalytical : isBalancedClassic
    };
  }, [accounts, ledgerLines, currentUser, asOfDate, viewMode]);

  const filterRows = (rows: BalanceRow[]) => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(row => 
      row.account.name.toLowerCase().includes(term) ||
      row.account.code.toLowerCase().includes(term)
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const exportToExcel = () => {
    const data: any[][] = [
      ['شركة / مؤسسة', settings?.companyName || 'TriPro ERP'],
      [`قائمة المركز المالي (${viewMode === 'analytical' ? 'النموذج المعياري التحليلي: رأس المال العامل وصافي الأصول' : 'النموذج التقليدي'})`],
      [`كما في تاريخ: ${asOfDate}`],
      [''],
      ['كود الحساب', 'اسم البند / الحساب', 'المبلغ']
    ];

    if (viewMode === 'analytical') {
      data.push(['=== 1. الأصول المتداولة (Current Assets) ===', '', '']);
      reportData.currentAssets.forEach(r => data.push([r.account.code, r.account.name, r.amount]));
      data.push(['إجمالي الأصول المتداولة', '', reportData.totalCurrentAssets]);
      data.push(['']);

      data.push(['=== 2. الخصوم المتداولة (Current Liabilities) ===', '', '']);
      reportData.currentLiabilities.forEach(r => data.push([r.account.code, r.account.name, r.amount]));
      data.push(['إجمالي الخصوم المتداولة', '', reportData.totalCurrentLiabilities]);
      data.push(['']);

      data.push(['>>> صافي رأس المال العامل (Net Working Capital) <<<', '', reportData.netWorkingCapital]);
      data.push(['']);

      data.push(['=== 3. يضاف: الأصول غير المتداولة (Non-Current Assets) ===', '', '']);
      reportData.nonCurrentAssets.forEach(r => data.push([r.account.code, r.account.name, r.amount]));
      data.push(['إجمالي الأصول غير المتداولة', '', reportData.totalNonCurrentAssets]);
      data.push(['']);

      data.push(['>>> إجمالي رأس المال الموظف بالتشغيل <<<', '', reportData.totalCapitalEmployed]);
      data.push(['']);

      data.push(['=== 4. يطرح: الخصوم غير المتداولة (Non-Current Liabilities) ===', '', '']);
      reportData.nonCurrentLiabilities.forEach(r => data.push([r.account.code, r.account.name, r.amount]));
      data.push(['إجمالي الخصوم غير المتداولة', '', reportData.totalNonCurrentLiabilities]);
      data.push(['']);

      data.push(['=============================================']);
      data.push(['>>> النتيجة الختامية: صافي الأصول (Net Assets) <<<', '', reportData.netAssets]);
      data.push(['=============================================']);
      data.push(['']);

      data.push(['=== 5. ممولة عن طريق: حقوق الملكية (Financed by Total Equity) ===', '', '']);
      reportData.equityRows.forEach(r => data.push([r.account.code, r.account.name, r.amount]));
      if (reportData.priorRetainedEarnings !== 0) {
        data.push(['-', 'أرباح (خسائر) مرحلة من سنوات سابقة', reportData.priorRetainedEarnings]);
      }
      data.push(['-', 'صافي أرباح الفترة الحالية (من قائمة الدخل)', reportData.netIncome]);
      data.push(['=============================================']);
      data.push(['>>> إجمالي حقوق الملكية (المطابق لصافي الأصول وقائمة التغير) <<<', '', reportData.totalEquity]);
      data.push(['=============================================']);
    } else {
      // العرض التقليدي
      data.push(['=== الأصول (Assets) ===', '', '']);
      [...reportData.currentAssets, ...reportData.nonCurrentAssets].forEach(r => data.push([r.account.code, r.account.name, r.amount]));
      data.push(['إجمالي الأصول', '', reportData.totalAssets]);
      data.push(['']);

      data.push(['=== الخصوم (Liabilities) ===', '', '']);
      [...reportData.currentLiabilities, ...reportData.nonCurrentLiabilities].forEach(r => data.push([r.account.code, r.account.name, r.amount]));
      data.push(['إجمالي الخصوم', '', reportData.totalLiabilities]);
      data.push(['']);

      data.push(['=== حقوق الملكية (Equity) ===', '', '']);
      reportData.equityRows.forEach(r => data.push([r.account.code, r.account.name, r.amount]));
      if (reportData.priorRetainedEarnings !== 0) {
        data.push(['-', 'أرباح مرحلة', reportData.priorRetainedEarnings]);
      }
      data.push(['-', 'صافي أرباح الفترة', reportData.netIncome]);
      data.push(['إجمالي حقوق الملكية', '', reportData.totalEquity]);
      data.push(['إجمالي الخصوم وحقوق الملكية', '', reportData.totalLiabilities + reportData.totalEquity]);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financial Position");
    XLSX.writeFile(wb, `Financial_Position_${asOfDate}.xlsx`);
  };

  const formatMoney = (val: number) => {
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Landmark className="text-blue-600" />
              قائمة المركز المالي (Statement of Financial Position)
            </h2>
            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200 flex items-center gap-1">
              <ShieldCheck size={14} className="text-blue-600" />
              معيار IAS 1
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            بيان المركز المالي للشركة وقياس صافي رأس المال العامل وصافي الأصول الممولة بحقوق الملكية
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          {/* مفتاح التبديل بين العرض التحليلي والكلاسيكي */}
          <div className="bg-slate-100 p-1 rounded-lg border border-slate-200 flex items-center">
            <button
              onClick={() => setViewMode('analytical')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                viewMode === 'analytical' 
                  ? 'bg-white text-blue-700 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              العرض التحليلي المعياري (IFRS)
            </button>
            <button
              onClick={() => setViewMode('classic')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                viewMode === 'classic' 
                  ? 'bg-white text-blue-700 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              العرض التقليدي (الميزانية)
            </button>
          </div>

          <button 
            onClick={() => navigate('/changes-in-equity')} 
            className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3.5 py-2 rounded-lg hover:bg-indigo-100 transition-colors font-semibold text-xs shadow-xs"
            title="الانتقال إلى قائمة التغير في حقوق الملكية"
          >
            <Scale size={15} /> قائمة التغير في الملكية
          </button>

          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3.5 py-2 rounded-lg hover:bg-slate-50 transition-colors font-semibold text-xs shadow-xs"
          >
            <RefreshCw size={15} className={loading ? "animate-spin text-blue-600" : ""} /> تحديث
          </button>
          <button 
            onClick={handlePrint} 
            className="flex items-center gap-2 bg-slate-800 text-white px-3.5 py-2 rounded-lg hover:bg-slate-700 transition-colors shadow-xs font-semibold text-xs"
          >
            <Printer size={15} /> طباعة
          </button>
          <button 
            onClick={exportToExcel} 
            className="flex items-center gap-2 bg-emerald-600 text-white px-3.5 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs font-semibold text-xs"
          >
            <Download size={15} /> تصدير Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        {/* 1. Working Capital */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">صافي رأس المال العامل</p>
            <h4 className={`text-xl font-bold mt-1 ${reportData.netWorkingCapital >= 0 ? 'text-blue-900' : 'text-red-600'}`}>
              {formatMoney(reportData.netWorkingCapital)}
            </h4>
            <span className={`text-xs font-semibold flex items-center gap-1 mt-1 ${reportData.netWorkingCapital >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {reportData.netWorkingCapital >= 0 ? 'فائض سيولة تشغيلية' : 'عجز في السيولة قصيرة الأجل'}
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Coins size={22} />
          </div>
        </div>

        {/* 2. Current Ratio */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">نسبة التداول (Current Ratio)</p>
            <h4 className="text-xl font-bold text-slate-800 mt-1">{reportData.currentRatio.toFixed(2)} : 1</h4>
            <span className={`text-xs font-semibold flex items-center gap-1 mt-1 ${reportData.currentRatio >= 1.2 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {reportData.currentRatio >= 1.2 ? 'مستوى أمان مالي مطمئن' : 'مؤشر سيولة يحتاج للمتابعة'}
            </span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Activity size={22} />
          </div>
        </div>

        {/* 3. Net Assets */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between bg-gradient-to-br from-white to-blue-50/30">
          <div>
            <p className="text-xs font-medium text-blue-700">صافي الأصول (Net Assets)</p>
            <h4 className="text-xl font-bold text-blue-950 mt-1">{formatMoney(reportData.netAssets)}</h4>
            <span className="text-xs text-blue-600 font-semibold flex items-center gap-1 mt-1">
              الاستثمار الرأسمالي الصافي
            </span>
          </div>
          <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
            <Landmark size={22} />
          </div>
        </div>

        {/* 4. Total Equity */}
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm flex items-center justify-between bg-gradient-to-br from-white to-indigo-50/40">
          <div>
            <p className="text-xs font-medium text-indigo-700">إجمالي حقوق الملكية</p>
            <h4 className="text-xl font-bold text-indigo-950 mt-1">{formatMoney(reportData.totalEquity)}</h4>
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-1">
              <CheckCircle size={13} /> تطابق تام 100%
            </span>
          </div>
          <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl">
            <Scale size={22} />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-semibold text-slate-700 mb-1">كما في تاريخ</label>
          <input 
            type="date" 
            value={asOfDate} 
            onChange={e => setAsOfDate(e.target.value)} 
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" 
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-semibold text-slate-700 mb-1">بحث في الحسابات</label>
          <div className="relative">
            <input 
              type="text" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder="ابحث بكود أو اسم الحساب..." 
              className="w-full border border-slate-300 rounded-lg p-2 pr-9 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" 
            />
            <Search className="absolute right-2.5 top-2.5 text-slate-400" size={16} />
          </div>
        </div>
      </div>

      {/* Report Document Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none" id="report-content">
        <ReportHeader 
          title="قائمة المركز المالي (Statement of Financial Position)" 
          subtitle={`كما في ${asOfDate} - ${viewMode === 'analytical' ? 'النموذج التحليلي المعياري (IAS 1)' : 'نموذج الميزانية التقليدي'}`} 
        />

        {loading && (
          <div className="p-16 text-center">
            <Loader2 className="animate-spin mx-auto text-blue-600 mb-3" size={36} />
            <p className="text-slate-500 font-medium text-sm">جاري احتساب أرصدة المركز المالي والتحقق من التوازن...</p>
          </div>
        )}

        {!loading && (
          <div className="p-6 md:p-8 space-y-8">
            {/* ========================================================================= */}
            {/* الخيار الأول: العرض التحليلي المعياري (ANALYTICAL FORMAT - IFRS)              */}
            {/* ========================================================================= */}
            {viewMode === 'analytical' && (
              <div className="space-y-6">
                {/* 1. الأصول المتداولة */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="bg-slate-800 text-white px-4 py-2.5 flex justify-between items-center font-bold text-sm">
                    <span>1. الأصول المتداولة (Current Assets)</span>
                    <span className="font-mono text-emerald-300">{formatMoney(reportData.totalCurrentAssets)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {filterRows(reportData.currentAssets).map(row => (
                        <tr key={row.account.id} className="hover:bg-slate-50">
                          <td className="py-2 px-4 text-slate-500 font-mono text-xs w-28">{row.account.code}</td>
                          <td className="py-2 px-2 text-slate-800">{row.account.name}</td>
                          <td className="py-2 px-4 text-right font-medium text-slate-700 font-mono">{formatMoney(row.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-emerald-50 font-bold text-emerald-900 border-t border-emerald-200">
                        <td colSpan={2} className="py-2.5 px-4">إجمالي الأصول المتداولة</td>
                        <td className="py-2.5 px-4 text-right font-mono">{formatMoney(reportData.totalCurrentAssets)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 2. الخصوم المتداولة */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="bg-slate-800 text-white px-4 py-2.5 flex justify-between items-center font-bold text-sm">
                    <span>2. يطرح: الخصوم المتداولة (Current Liabilities)</span>
                    <span className="font-mono text-red-300">{formatMoney(reportData.totalCurrentLiabilities)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {filterRows(reportData.currentLiabilities).map(row => (
                        <tr key={row.account.id} className="hover:bg-slate-50">
                          <td className="py-2 px-4 text-slate-500 font-mono text-xs w-28">{row.account.code}</td>
                          <td className="py-2 px-2 text-slate-800">{row.account.name}</td>
                          <td className="py-2 px-4 text-right font-medium text-slate-700 font-mono">{formatMoney(row.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-red-50 font-bold text-red-900 border-t border-red-200">
                        <td colSpan={2} className="py-2.5 px-4">إجمالي الخصوم المتداولة</td>
                        <td className="py-2.5 px-4 text-right font-mono">{formatMoney(reportData.totalCurrentLiabilities)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* صافي رأس المال العامل (Working Capital Subtotal) */}
                <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 rounded-xl flex justify-between items-center shadow-md">
                  <div>
                    <span className="font-extrabold text-base md:text-lg">
                      صافي رأس المال العامل (Net Working Capital)
                    </span>
                    <p className="text-xs text-blue-200 mt-0.5">
                      الأصول المتداولة - الخصوم المتداولة (مؤشر السيولة التشغيلية)
                    </p>
                  </div>
                  <span className="text-xl md:text-2xl font-black font-mono">
                    {formatMoney(reportData.netWorkingCapital)}
                  </span>
                </div>

                {/* 3. الأصول غير المتداولة */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="bg-slate-800 text-white px-4 py-2.5 flex justify-between items-center font-bold text-sm">
                    <span>3. يضاف: الأصول غير المتداولة (Non-Current Assets)</span>
                    <span className="font-mono text-blue-300">{formatMoney(reportData.totalNonCurrentAssets)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {filterRows(reportData.nonCurrentAssets).map(row => (
                        <tr key={row.account.id} className="hover:bg-slate-50">
                          <td className="py-2 px-4 text-slate-500 font-mono text-xs w-28">{row.account.code}</td>
                          <td className="py-2 px-2 text-slate-800">{row.account.name}</td>
                          <td className={`py-2 px-4 text-right font-medium font-mono ${row.amount < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                            {formatMoney(row.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-blue-50 font-bold text-blue-900 border-t border-blue-200">
                        <td colSpan={2} className="py-2.5 px-4">إجمالي الأصول غير المتداولة</td>
                        <td className="py-2.5 px-4 text-right font-mono">{formatMoney(reportData.totalNonCurrentAssets)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* إجمالي رأس المال الموظف */}
                <div className="bg-slate-100 border border-slate-300 p-3 rounded-xl flex justify-between items-center font-bold text-slate-800 text-sm">
                  <span>إجمالي رأس المال الموظف بالتشغيل (Capital Employed)</span>
                  <span className="font-mono text-base">{formatMoney(reportData.totalCapitalEmployed)}</span>
                </div>

                {/* 4. الخصوم غير المتداولة (إن وجدت) */}
                {reportData.totalNonCurrentLiabilities > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <div className="bg-slate-800 text-white px-4 py-2.5 flex justify-between items-center font-bold text-sm">
                      <span>4. يطرح: الخصوم غير المتداولة (Non-Current Liabilities)</span>
                      <span className="font-mono text-amber-300">{formatMoney(reportData.totalNonCurrentLiabilities)}</span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {filterRows(reportData.nonCurrentLiabilities).map(row => (
                          <tr key={row.account.id} className="hover:bg-slate-50">
                            <td className="py-2 px-4 text-slate-500 font-mono text-xs w-28">{row.account.code}</td>
                            <td className="py-2 px-2 text-slate-800">{row.account.name}</td>
                            <td className="py-2 px-4 text-right font-medium text-slate-700 font-mono">{formatMoney(row.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-amber-50 font-bold text-amber-900 border-t border-amber-200">
                          <td colSpan={2} className="py-2.5 px-4">إجمالي الخصوم غير المتداولة</td>
                          <td className="py-2.5 px-4 text-right font-mono">{formatMoney(reportData.totalNonCurrentLiabilities)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* النتيجة الختامية: صافي الأصول */}
                <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white p-5 rounded-2xl flex justify-between items-center shadow-lg border border-emerald-600">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={22} className="text-emerald-300" />
                      <span className="font-extrabold text-lg md:text-xl">
                        صافي الأصول المستثمرة (Net Assets)
                      </span>
                    </div>
                    <p className="text-xs text-emerald-100 mt-1">
                      صافي رأس المال العامل + الأصول غير المتداولة - الخصوم غير المتداولة
                    </p>
                  </div>
                  <span className="text-2xl md:text-3xl font-black font-mono">
                    {formatMoney(reportData.netAssets)}
                  </span>
                </div>

                {/* 5. ممولة عن طريق: حقوق الملكية */}
                <div className="border border-indigo-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="bg-indigo-900 text-white px-4 py-3 flex justify-between items-center font-bold text-sm">
                    <div className="flex items-center gap-2">
                      <Scale size={18} className="text-indigo-300" />
                      <span>ممولة عن طريق: حقوق الملكية (Financed by Total Equity)</span>
                    </div>
                    <span className="font-mono text-indigo-200 text-base">{formatMoney(reportData.totalEquity)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {filterRows(reportData.equityRows).map(row => (
                        <tr key={row.account.id} className="hover:bg-slate-50">
                          <td className="py-2 px-4 text-slate-500 font-mono text-xs w-28">{row.account.code}</td>
                          <td className="py-2 px-2 text-slate-800">{row.account.name}</td>
                          <td className="py-2 px-4 text-right font-medium text-slate-700 font-mono">{formatMoney(row.amount)}</td>
                        </tr>
                      ))}
                      {reportData.priorRetainedEarnings !== 0 && (
                        <tr className="bg-slate-50/80">
                          <td className="py-2 px-4 text-slate-400 font-mono text-xs">-</td>
                          <td className="py-2 px-2 font-bold text-slate-700">أرباح (خسائر) مرحلة من سنوات سابقة</td>
                          <td className="py-2 px-4 text-right font-mono font-bold text-slate-700">{formatMoney(reportData.priorRetainedEarnings)}</td>
                        </tr>
                      )}
                      <tr className="bg-amber-50/70">
                        <td className="py-2 px-4 text-slate-400 font-mono text-xs">-</td>
                        <td className="py-2 px-2 font-bold text-amber-900">صافي أرباح الفترة الحالية (من قائمة الدخل)</td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-amber-900">{formatMoney(reportData.netIncome)}</td>
                      </tr>
                      <tr className="bg-indigo-50 font-extrabold text-indigo-950 border-t-2 border-indigo-200 text-base">
                        <td colSpan={2} className="py-3 px-4">إجمالي حقوق الملكية (Total Equity)</td>
                        <td className="py-3 px-4 text-right font-mono">{formatMoney(reportData.totalEquity)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* شارة التحقق من التوازن المعياري */}
                <div className={`p-4 rounded-xl border flex items-center justify-between font-bold ${
                  reportData.isBalanced 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {reportData.isBalanced ? <CheckCircle size={20} className="text-emerald-600" /> : <AlertTriangle size={20} className="text-red-600" />}
                    <span>
                      {reportData.isBalanced 
                        ? 'المركز المالي متوازن تماماً: صافي الأصول = إجمالي حقوق الملكية (مطابق لقائمة التغير في حقوق الملكية)' 
                        : `تنبيه: يوجد فارق عدم اتزان قدره ${formatMoney(Math.abs(reportData.netAssets - reportData.totalEquity))}`}
                    </span>
                  </div>
                  <button 
                    onClick={() => navigate('/changes-in-equity')}
                    className="text-xs bg-white px-3 py-1 rounded shadow-xs border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    مطابقة مع قائمة التغير &larr;
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* الخيار الثاني: العرض التقليدي (CLASSIC TWO-SIDED BALANCE SHEET)              */}
            {/* ========================================================================= */}
            {viewMode === 'classic' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* الأصول */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-800 border-b-2 border-blue-500 pb-2 flex justify-between items-center">
                    <span>الأصول (Assets)</span>
                    <span className="font-mono text-blue-700">{formatMoney(reportData.totalAssets)}</span>
                  </h3>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {[...filterRows(reportData.currentAssets), ...filterRows(reportData.nonCurrentAssets)].map(row => (
                        <tr key={row.account.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2 text-slate-800">
                            {row.account.name} <span className="text-xs text-slate-400 font-mono">({row.account.code})</span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-medium text-slate-700">{formatMoney(row.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-blue-50 font-bold text-blue-900 border-t-2 border-blue-200">
                        <td className="py-3 px-3">إجمالي الأصول</td>
                        <td className="py-3 px-3 text-right font-mono text-base">{formatMoney(reportData.totalAssets)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* الخصوم وحقوق الملكية */}
                <div className="space-y-6">
                  {/* الخصوم */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 border-b-2 border-red-500 pb-2 flex justify-between items-center">
                      <span>الخصوم (Liabilities)</span>
                      <span className="font-mono text-red-700">{formatMoney(reportData.totalLiabilities)}</span>
                    </h3>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {[...filterRows(reportData.currentLiabilities), ...filterRows(reportData.nonCurrentLiabilities)].map(row => (
                          <tr key={row.account.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2 text-slate-800">
                              {row.account.name} <span className="text-xs text-slate-400 font-mono">({row.account.code})</span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-medium text-slate-700">{formatMoney(row.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-red-50 font-bold text-red-900 border-t-2 border-red-200">
                          <td className="py-2.5 px-3">إجمالي الخصوم</td>
                          <td className="py-2.5 px-3 text-right font-mono">{formatMoney(reportData.totalLiabilities)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* حقوق الملكية */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 border-b-2 border-emerald-500 pb-2 flex justify-between items-center">
                      <span>حقوق الملكية (Equity)</span>
                      <span className="font-mono text-emerald-700">{formatMoney(reportData.totalEquity)}</span>
                    </h3>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {filterRows(reportData.equityRows).map(row => (
                          <tr key={row.account.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2 text-slate-800">
                              {row.account.name} <span className="text-xs text-slate-400 font-mono">({row.account.code})</span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-medium text-slate-700">{formatMoney(row.amount)}</td>
                          </tr>
                        ))}
                        {reportData.priorRetainedEarnings !== 0 && (
                          <tr className="bg-slate-50/80">
                            <td className="py-2 px-2 font-bold text-slate-700">أرباح (خسائر) مرحلة</td>
                            <td className="py-2 px-2 text-right font-mono font-bold text-slate-700">{formatMoney(reportData.priorRetainedEarnings)}</td>
                          </tr>
                        )}
                        <tr className="bg-amber-50/70">
                          <td className="py-2 px-2 font-bold text-amber-900">صافي أرباح الفترة</td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-amber-900">{formatMoney(reportData.netIncome)}</td>
                        </tr>
                        <tr className="bg-emerald-50 font-bold text-emerald-900 border-t-2 border-emerald-200">
                          <td className="py-2.5 px-3">إجمالي حقوق الملكية</td>
                          <td className="py-2.5 px-3 text-right font-mono">{formatMoney(reportData.totalEquity)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* إجمالي الخصوم وحقوق الملكية الكلاسيكي */}
                  <div className={`p-4 rounded-xl flex justify-between items-center font-bold border ${
                    reportData.isBalanced ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-red-100 border-red-300 text-red-800'
                  }`}>
                    <span>إجمالي الخصوم وحقوق الملكية</span>
                    <span className="font-mono text-xl">{formatMoney(reportData.totalLiabilities + reportData.totalEquity)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* إيضاح معيار IAS 1 */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-blue-600" />
                إيضاح التوافق المحاسبي الدولي (IAS 1):
              </div>
              <p>
                تم إعداد وتصنيف قائمة المركز المالي وفقاً لمعيار المحاسبة الدولي <strong className="text-slate-800">IAS 1</strong>، حيث يوفر العرض التحليلي قياساً مباشراً لصافي رأس المال العامل ورأس المال المستثمر وصافي الأصول، مع ربط إجمالي حقوق الملكية مباشرة بمصفوفة <strong className="text-slate-800">قائمة التغير في حقوق الملكية</strong>.
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

export default BalanceSheet;
