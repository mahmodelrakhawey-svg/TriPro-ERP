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
  priorAmount?: number;
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
  const [priorLedgerLines, setPriorLedgerLines] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'analytical' | 'classic'>('analytical');
  const [isComparative, setIsComparative] = useState(false);

  // حساب تاريخ الفترة المقارنة (نهاية السنة السابقة أو نفس اليوم من السنة السابقة)
  const asOfYear = parseInt(asOfDate.slice(0, 4), 10) || new Date().getFullYear();
  const priorAsOfDate = `${asOfYear - 1}${asOfDate.slice(4)}`;

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
        setLoading(false);
        return;
      }

      // 1. أرصدة التاريخ المحدد
      const { data, error } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .eq('journal_entries.status', 'posted')
        .eq('journal_entries.organization_id', userOrgId)
        .lte('journal_entries.transaction_date', asOfDate);

      if (error) throw error;
      setLedgerLines(data || []);

      // 2. أرصدة التاريخ المقارن (إذا تم تفعيل العرض المقارن)
      if (isComparative) {
        const { data: priorData, error: priorErr } = await supabase
          .from('journal_lines')
          .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
          .eq('journal_entries.status', 'posted')
          .eq('journal_entries.organization_id', userOrgId)
          .lte('journal_entries.transaction_date', priorAsOfDate);

        if (priorErr) throw priorErr;
        setPriorLedgerLines(priorData || []);
      }
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
  }, [asOfDate, currentUser, accounts, currentSelectedOrgId, isComparative]);

  // تصنيف عناصر المركز المالي وفق المعيار الدولي IAS 1
  const reportData = useMemo(() => {
    const accountBalances: Record<string, number> = {};
    const priorAccountBalances: Record<string, number> = {};
    let priorPnlSum = 0;
    let currentPnlSum = 0;
    let priorPeriodPnlSum = 0;

    const currentYear = new Date(asOfDate).getFullYear();
    const currentYearStart = `${currentYear}-01-01`;
    const priorYearStart = `${currentYear - 1}-01-01`;

    const accountMap = new Map<string, any>();
    accounts.forEach(acc => accountMap.set(acc.id, acc));

    if (currentUser?.role === 'demo') {
      accounts.forEach(acc => {
        const type = (acc.type || '').toLowerCase().trim();
        const balance = acc.balance || 0;
        const code = String(acc.code || '');

        if (code.startsWith('4')) currentPnlSum -= balance;
        else if (code.startsWith('5')) currentPnlSum += balance;
        else {
          accountBalances[acc.id] = balance;
          priorAccountBalances[acc.id] = balance * 0.9;
        }
      });
    } else {
      // حركات الفترة الحالية
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

      // حركات الفترة المقارنة
      (priorLedgerLines || []).forEach(line => {
        if (!priorAccountBalances[line.account_id]) priorAccountBalances[line.account_id] = 0;
        priorAccountBalances[line.account_id] += (Number(line.debit) || 0) - (Number(line.credit) || 0);

        const acc = accountMap.get(line.account_id);
        if (acc) {
          const type = (acc.type || '').toLowerCase().trim();
          const code = String(acc.code || '');
          const isPnl = !code.startsWith('1') && !code.startsWith('2') && !code.startsWith('3') && (
            code.startsWith('4') || code.startsWith('5') || type.includes('revenue') || type.includes('expense')
          );
          if (isPnl) {
            const transactionDate = line.journal_entries?.transaction_date;
            if (transactionDate && transactionDate >= priorYearStart && transactionDate <= priorAsOfDate) {
              priorPeriodPnlSum += (Number(line.debit) || 0) - (Number(line.credit) || 0);
            }
          }
        }
      });
    }

    const currentAssets: BalanceRow[] = [];
    const nonCurrentAssets: BalanceRow[] = [];
    const currentLiabilities: BalanceRow[] = [];
    const nonCurrentLiabilities: BalanceRow[] = [];
    const equityRows: BalanceRow[] = [];

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
      const curBal = accountBalances[acc.id] || 0;
      const prBal = priorAccountBalances[acc.id] || 0;
      if (acc.isGroup || (Math.abs(curBal) < 0.0001 && Math.abs(prBal) < 0.0001)) return;

      const type = (acc.type || '').toLowerCase().trim();
      const code = String(acc.code || '').trim();
      const name = String(acc.name || '').trim().toLowerCase();

      // الأصول (المجموعة 1)
      if (type.includes('asset') || code.startsWith('1')) {
        if (name.includes('مجمع إهلاك') || name.includes('مجمع الاهلاك') || type.includes('depreciation')) {
          nonCurrentAssets.push({ account: acc, amount: curBal, priorAmount: prBal });
        } else if (isCurrentAssetAccount(code, name, type)) {
          currentAssets.push({ account: acc, amount: curBal, priorAmount: prBal });
        } else {
          nonCurrentAssets.push({ account: acc, amount: curBal, priorAmount: prBal });
        }
      }
      // الخصوم (المجموعة 2)
      else if (type.includes('liability') || code.startsWith('2')) {
        const curLiability = -curBal;
        const prLiability = -prBal;
        if (isNonCurrentLiabilityAccount(code, name, type)) {
          nonCurrentLiabilities.push({ account: acc, amount: curLiability, priorAmount: prLiability });
        } else {
          currentLiabilities.push({ account: acc, amount: curLiability, priorAmount: prLiability });
        }
      }
      // حقوق الملكية (المجموعة 3)
      else if (type.includes('equity') || code.startsWith('3')) {
        if (code === '3999' && Math.abs(curBal) < 0.01) return;
        equityRows.push({ account: acc, amount: -curBal, priorAmount: -prBal });
      }
    });

    const netIncome = -currentPnlSum;
    const priorRetainedEarnings = -priorPnlSum;
    const priorPeriodNetIncome = -priorPeriodPnlSum;

    // حساب المجاميع
    const sumRows = (rows: BalanceRow[]) => ({
      current: rows.reduce((sum, r) => sum + r.amount, 0),
      prior: rows.reduce((sum, r) => sum + (r.priorAmount || 0), 0)
    });

    const totalCurrentAssets = sumRows(currentAssets).current;
    const priorTotalCurrentAssets = sumRows(currentAssets).prior;

    const totalNonCurrentAssets = sumRows(nonCurrentAssets).current;
    const priorTotalNonCurrentAssets = sumRows(nonCurrentAssets).prior;

    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
    const priorTotalAssets = priorTotalCurrentAssets + priorTotalNonCurrentAssets;

    const totalCurrentLiabilities = sumRows(currentLiabilities).current;
    const priorTotalCurrentLiabilities = sumRows(currentLiabilities).prior;

    const totalNonCurrentLiabilities = sumRows(nonCurrentLiabilities).current;
    const priorTotalNonCurrentLiabilities = sumRows(nonCurrentLiabilities).prior;

    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
    const priorTotalLiabilities = priorTotalCurrentLiabilities + priorTotalNonCurrentLiabilities;

    // صافي رأس المال العامل (Working Capital = Current Assets - Current Liabilities)
    const netWorkingCapital = totalCurrentAssets - totalCurrentLiabilities;
    const priorNetWorkingCapital = priorTotalCurrentAssets - priorTotalCurrentLiabilities;

    // رأس المال الموظف (Capital Employed = Net Working Capital + Non-Current Assets)
    const capitalEmployed = netWorkingCapital + totalNonCurrentAssets;
    const priorCapitalEmployed = priorNetWorkingCapital + priorTotalNonCurrentAssets;

    // صافي الأصول (Net Assets = Capital Employed - Non-Current Liabilities)
    const netAssets = capitalEmployed - totalNonCurrentLiabilities;
    const priorNetAssets = priorCapitalEmployed - priorTotalNonCurrentLiabilities;

    // إجمالي حقوق الملكية
    const baseEquity = sumRows(equityRows).current;
    const priorBaseEquity = sumRows(equityRows).prior;

    const totalEquity = baseEquity + priorRetainedEarnings + netIncome;
    const priorTotalEquity = priorBaseEquity + priorPeriodNetIncome;

    const isBalanced = Math.abs(netAssets - totalEquity) < 0.1 || Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.1;
    const balanceDifference = Math.abs(netAssets - totalEquity);

    return {
      currentAssets,
      priorTotalCurrentAssets,
      nonCurrentAssets,
      priorTotalNonCurrentAssets,
      currentLiabilities,
      priorTotalCurrentLiabilities,
      nonCurrentLiabilities,
      priorTotalNonCurrentLiabilities,
      equityRows,
      priorBaseEquity,

      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      priorTotalAssets,

      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,
      priorTotalLiabilities,

      netWorkingCapital,
      priorNetWorkingCapital,
      capitalEmployed,
      priorCapitalEmployed,
      netAssets,
      priorNetAssets,

      priorRetainedEarnings,
      netIncome,
      totalEquity,
      priorTotalEquity,

      isBalanced,
      balanceDifference
    };
  }, [accounts, ledgerLines, priorLedgerLines, asOfDate, currentUser]);

  const handlePrint = () => {
    window.print();
  };

  const exportToExcel = () => {
    const headers = isComparative
      ? ['كود الحساب', 'اسم الحساب / البند', `الرصيد في (${asOfDate})`, `الرصيد المقارن (${priorAsOfDate})`, 'التغير ($)', 'نسبة التغير %']
      : ['كود الحساب', 'اسم الحساب / البند', 'القيمة'];

    const formatRow = (code: string, name: string, cur: number, prior?: number) => {
      if (!isComparative) return [code, name, cur];
      const p = prior || 0;
      const diff = cur - p;
      const pct = p !== 0 ? (diff / Math.abs(p)) * 100 : 0;
      return [code, name, cur, p, diff, `${pct.toFixed(1)}%`];
    };

    const data: any[][] = [
      ['شركة / مؤسسة', settings?.companyName || 'TriPro ERP'],
      ['قائمة المركز المالي (Statement of Financial Position - IAS 1)'],
      [`كما في تاريخ: ${asOfDate}` + (isComparative ? ` (مقارنة مع ${priorAsOfDate})` : '')],
      ['النمط المعروض:', viewMode === 'analytical' ? 'النموذج التحليلي المعياري (IFRS - صافي رأس المال العامل وصافي الأصول)' : 'النموذج التقليدي (الميزانية العمومية)'],
      [''],
      headers
    ];

    if (viewMode === 'analytical') {
      data.push(['=== 1. الأصول المتداولة (Current Assets) ===']);
      reportData.currentAssets.forEach(r => data.push(formatRow(r.account.code, r.account.name, r.amount, r.priorAmount)));
      data.push(formatRow('', 'إجمالي الأصول المتداولة', reportData.totalCurrentAssets, reportData.priorTotalCurrentAssets));
      data.push(['']);

      data.push(['=== 2. يطرح: الخصوم المتداولة (Current Liabilities) ===']);
      reportData.currentLiabilities.forEach(r => data.push(formatRow(r.account.code, r.account.name, r.amount, r.priorAmount)));
      data.push(formatRow('', 'إجمالي الخصوم المتداولة', reportData.totalCurrentLiabilities, reportData.priorTotalCurrentLiabilities));
      data.push(['']);

      data.push(formatRow('', '>>> صافي رأس المال العامل (Net Working Capital) <<<', reportData.netWorkingCapital, reportData.priorNetWorkingCapital));
      data.push(['']);

      data.push(['=== 3. يضاف: الأصول غير المتداولة (Non-Current Assets) ===']);
      reportData.nonCurrentAssets.forEach(r => data.push(formatRow(r.account.code, r.account.name, r.amount, r.priorAmount)));
      data.push(formatRow('', 'إجمالي الأصول غير المتداولة', reportData.totalNonCurrentAssets, reportData.priorTotalNonCurrentAssets));
      data.push(['']);

      data.push(formatRow('', '>>> إجمالي رأس المال الموظف (Capital Employed) <<<', reportData.capitalEmployed, reportData.priorCapitalEmployed));
      data.push(['']);

      if (reportData.totalNonCurrentLiabilities > 0 || (reportData.priorTotalNonCurrentLiabilities || 0) > 0) {
        data.push(['=== 4. يطرح: الخصوم غير المتداولة (Non-Current Liabilities) ===']);
        reportData.nonCurrentLiabilities.forEach(r => data.push(formatRow(r.account.code, r.account.name, r.amount, r.priorAmount)));
        data.push(formatRow('', 'إجمالي الخصوم غير المتداولة', reportData.totalNonCurrentLiabilities, reportData.priorTotalNonCurrentLiabilities));
        data.push(['']);
      }

      data.push(formatRow('', '>>> النتيجة الختامية: صافي الأصول (Net Assets) <<<', reportData.netAssets, reportData.priorNetAssets));
      data.push(['']);

      data.push(['=== 5. ممولة عن طريق: حقوق الملكية (Financed by Total Equity) ===']);
      reportData.equityRows.forEach(r => data.push(formatRow(r.account.code, r.account.name, r.amount, r.priorAmount)));
      if (reportData.priorRetainedEarnings !== 0) {
        data.push(formatRow('-', 'أرباح (خسائر) مرحلة من سنوات سابقة', reportData.priorRetainedEarnings));
      }
      data.push(formatRow('-', 'صافي أرباح الفترة الحالية', reportData.netIncome));
      data.push(formatRow('', '>>> إجمالي حقوق الملكية (Total Equity) <<<', reportData.totalEquity, reportData.priorTotalEquity));
    } else {
      data.push(['=== الأصول (Assets) ===']);
      [...reportData.currentAssets, ...reportData.nonCurrentAssets].forEach(r => data.push(formatRow(r.account.code, r.account.name, r.amount, r.priorAmount)));
      data.push(formatRow('', 'إجمالي الأصول', reportData.totalAssets, reportData.priorTotalAssets));
      data.push(['']);

      data.push(['=== الخصوم (Liabilities) ===']);
      [...reportData.currentLiabilities, ...reportData.nonCurrentLiabilities].forEach(r => data.push(formatRow(r.account.code, r.account.name, r.amount, r.priorAmount)));
      data.push(formatRow('', 'إجمالي الخصوم', reportData.totalLiabilities, reportData.priorTotalLiabilities));
      data.push(['']);

      data.push(['=== حقوق الملكية (Equity) ===']);
      reportData.equityRows.forEach(r => data.push(formatRow(r.account.code, r.account.name, r.amount, r.priorAmount)));
      data.push(formatRow('-', 'صافي أرباح الفترة', reportData.netIncome));
      data.push(formatRow('', 'إجمالي حقوق الملكية', reportData.totalEquity, reportData.priorTotalEquity));
      data.push(formatRow('', 'إجمالي الخصوم وحقوق الملكية', reportData.totalLiabilities + reportData.totalEquity, reportData.priorTotalLiabilities + reportData.priorTotalEquity));
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financial Position");
    XLSX.writeFile(wb, `Financial_Position_${asOfDate}.xlsx`);
  };

  const formatMoney = (val: number) => {
    return Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const filterRows = (rows: BalanceRow[]) => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(r => 
      r.account.name.toLowerCase().includes(term) || 
      r.account.code.toLowerCase().includes(term)
    );
  };

  const renderBalanceRow = (row: BalanceRow) => {
    const curVal = row.amount;
    const prVal = row.priorAmount || 0;
    const diff = curVal - prVal;
    const pct = prVal !== 0 ? (diff / Math.abs(prVal)) * 100 : 0;

    return (
      <tr key={row.account.id} className="hover:bg-slate-50 border-b border-slate-50">
        <td className="py-2 px-4 text-slate-500 font-mono text-xs w-28">{row.account.code}</td>
        <td className="py-2 px-2 text-slate-800">{row.account.name}</td>
        <td className="py-2 px-4 text-left font-medium text-slate-700 font-mono w-36">{formatMoney(curVal)}</td>
        {isComparative && (
          <>
            <td className="py-2 px-4 text-left font-medium text-slate-500 font-mono w-36">{formatMoney(prVal)}</td>
            <td className="py-2 px-4 text-left font-mono text-xs w-28">{formatMoney(diff)}</td>
            <td className="py-2 px-4 text-left font-mono text-xs w-20">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}
              </span>
            </td>
          </>
        )}
      </tr>
    );
  };

  const renderSubtotalRow = (title: string, curVal: number, prVal: number, bgClass: string, textClass: string) => {
    const diff = curVal - prVal;
    const pct = prVal !== 0 ? (diff / Math.abs(prVal)) * 100 : 0;

    return (
      <tr className={`${bgClass} ${textClass} font-bold border-t`}>
        <td colSpan={2} className="py-2.5 px-4">{title}</td>
        <td className="py-2.5 px-4 text-left font-mono">{formatMoney(curVal)}</td>
        {isComparative && (
          <>
            <td className="py-2.5 px-4 text-left font-mono text-slate-600">{formatMoney(prVal)}</td>
            <td className="py-2.5 px-4 text-left font-mono text-xs">{formatMoney(diff)}</td>
            <td className="py-2.5 px-4 text-left font-mono text-xs">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pct >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                {pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}
              </span>
            </td>
          </>
        )}
      </tr>
    );
  };

  const renderTableHeader = () => {
    return (
      <thead>
        <tr className="border-b border-slate-200 text-xs text-slate-400 font-bold bg-slate-50/50">
          <th className="py-2 px-4 text-right w-28">كود الحساب</th>
          <th className="py-2 px-2 text-right">اسم الحساب</th>
          <th className="py-2 px-4 text-left w-36">الرصيد في ({asOfDate})</th>
          {isComparative && (
            <>
              <th className="py-2 px-4 text-left w-36 text-slate-500">المقارن ({priorAsOfDate})</th>
              <th className="py-2 px-4 text-left w-28">التغير</th>
              <th className="py-2 px-4 text-left w-20">%</th>
            </>
          )}
        </tr>
      </thead>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12" dir="rtl">
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

          {/* زر تفعيل العرض المقارن */}
          <button
            onClick={() => setIsComparative(!isComparative)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition shadow-xs border ${
              isComparative 
                ? 'bg-indigo-600 text-white border-indigo-700' 
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <ArrowRightLeft size={15} />
            {isComparative ? 'إلغاء المقارنة' : 'عرض مقارن سنوي'}
          </button>

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

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        {/* 1. Working Capital */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">صافي رأس المال العامل (NWC)</p>
            <h4 className="text-xl font-bold text-slate-800 mt-1">{formatMoney(reportData.netWorkingCapital)}</h4>
            <span className={`text-xs font-semibold flex items-center gap-1 mt-1 ${reportData.netWorkingCapital >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {reportData.netWorkingCapital >= 0 ? <TrendingUp size={13} /> : <AlertTriangle size={13} />}
              {reportData.netWorkingCapital >= 0 ? 'سيولة تشغيلية كافية' : 'عجز في رأس المال العامل'}
            </span>
          </div>
          <div className={`p-3 rounded-xl ${reportData.netWorkingCapital >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            <Coins size={22} />
          </div>
        </div>

        {/* 2. Current Ratio */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">معدل التداول (Current Ratio)</p>
            <h4 className="text-xl font-bold text-slate-800 mt-1">
              {reportData.totalCurrentLiabilities > 0 
                ? (reportData.totalCurrentAssets / reportData.totalCurrentLiabilities).toFixed(2) 
                : '∞'}
            </h4>
            <span className="text-xs text-blue-600 font-semibold flex items-center gap-1 mt-1">
              النسبة المعيارية: 1.5 - 2.0
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Activity size={22} />
          </div>
        </div>

        {/* 3. Net Assets */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">صافي الأصول (Net Assets)</p>
            <h4 className="text-xl font-bold text-slate-800 mt-1">{formatMoney(reportData.netAssets)}</h4>
            <span className="text-xs text-slate-500 flex items-center gap-1 mt-1">
              رأس المال الموظف مطروحاً منه القروض
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
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">كما في تاريخ</label>
            <input 
              type="date" 
              value={asOfDate} 
              onChange={e => setAsOfDate(e.target.value)} 
              className="border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold" 
            />
          </div>
          <div className="w-64">
            <label className="block text-xs font-bold text-slate-700 mb-1">بحث في الحسابات</label>
            <div className="relative">
              <input 
                type="text" 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                placeholder="ابحث بكود أو اسم الحساب..." 
                className="w-full border border-slate-300 rounded-lg p-2 pr-9 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" 
              />
              <Search className="absolute right-2.5 top-2.5 text-slate-400" size={15} />
            </div>
          </div>
        </div>

        {isComparative && (
          <div className="bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg text-xs text-indigo-900 font-bold">
            مقارنة نشطة مع رصيد: {priorAsOfDate}
          </div>
        )}
      </div>

      {/* Report Document Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none" id="report-content">
        <ReportHeader 
          title="قائمة المركز المالي (Statement of Financial Position)" 
          subtitle={`كما في ${asOfDate} - ${viewMode === 'analytical' ? 'النموذج التحليلي المعياري (IAS 1)' : 'نموذج الميزانية التقليدي'}` + (isComparative ? ` (مقارنة مع ${priorAsOfDate})` : '')} 
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
                    {renderTableHeader()}
                    <tbody className="divide-y divide-slate-100">
                      {filterRows(reportData.currentAssets).map(row => renderBalanceRow(row))}
                      {renderSubtotalRow('إجمالي الأصول المتداولة (أ)', reportData.totalCurrentAssets, reportData.priorTotalCurrentAssets, 'bg-emerald-50 font-bold', 'text-emerald-900')}
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
                    {renderTableHeader()}
                    <tbody className="divide-y divide-slate-100">
                      {filterRows(reportData.currentLiabilities).map(row => renderBalanceRow(row))}
                      {renderSubtotalRow('إجمالي الخصوم المتداولة (ب)', reportData.totalCurrentLiabilities, reportData.priorTotalCurrentLiabilities, 'bg-red-50 font-bold', 'text-red-900')}
                    </tbody>
                  </table>
                </div>

                {/* صافي رأس المال العامل */}
                <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 rounded-xl flex justify-between items-center shadow-md">
                  <div>
                    <span className="font-extrabold text-base md:text-lg">
                      صافي رأس المال العامل (Net Working Capital)
                    </span>
                    <p className="text-xs text-blue-200 mt-0.5">
                      الأصول المتداولة مطروحاً منها الخصوم المتداولة (أ - ب)
                    </p>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-xl md:text-2xl font-black block">
                      {formatMoney(reportData.netWorkingCapital)}
                    </span>
                    {isComparative && (
                      <span className="text-xs text-blue-200 block">السابق: {formatMoney(reportData.priorNetWorkingCapital)}</span>
                    )}
                  </div>
                </div>

                {/* 3. الأصول غير المتداولة */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="bg-slate-800 text-white px-4 py-2.5 flex justify-between items-center font-bold text-sm">
                    <span>3. يضاف: الأصول غير المتداولة (Non-Current Assets)</span>
                    <span className="font-mono text-blue-300">{formatMoney(reportData.totalNonCurrentAssets)}</span>
                  </div>
                  <table className="w-full text-sm">
                    {renderTableHeader()}
                    <tbody className="divide-y divide-slate-100">
                      {filterRows(reportData.nonCurrentAssets).map(row => renderBalanceRow(row))}
                      {renderSubtotalRow('إجمالي الأصول غير المتداولة (ج)', reportData.totalNonCurrentAssets, reportData.priorTotalNonCurrentAssets, 'bg-blue-50 font-bold', 'text-blue-900')}
                    </tbody>
                  </table>
                </div>

                {/* إجمالي رأس المال الموظف */}
                <div className="bg-slate-100 border border-slate-300 p-3.5 rounded-xl flex justify-between items-center font-bold text-slate-900">
                  <div>
                    <span className="text-base">إجمالي رأس المال الموظف (Capital Employed)</span>
                    <p className="text-xs text-slate-500 font-normal">صافي رأس المال العامل + الأصول غير المتداولة</p>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-lg font-black block">{formatMoney(reportData.capitalEmployed)}</span>
                    {isComparative && (
                      <span className="text-xs text-slate-500 block">السابق: {formatMoney(reportData.priorCapitalEmployed)}</span>
                    )}
                  </div>
                </div>

                {/* 4. الخصوم غير المتداولة */}
                {reportData.totalNonCurrentLiabilities > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <div className="bg-slate-800 text-white px-4 py-2.5 flex justify-between items-center font-bold text-sm">
                      <span>4. يطرح: الخصوم غير المتداولة (Non-Current Liabilities)</span>
                      <span className="font-mono text-amber-300">{formatMoney(reportData.totalNonCurrentLiabilities)}</span>
                    </div>
                    <table className="w-full text-sm">
                      {renderTableHeader()}
                      <tbody className="divide-y divide-slate-100">
                        {filterRows(reportData.nonCurrentLiabilities).map(row => renderBalanceRow(row))}
                        {renderSubtotalRow('إجمالي الخصوم غير المتداولة (د)', reportData.totalNonCurrentLiabilities, reportData.priorTotalNonCurrentLiabilities, 'bg-amber-50 font-bold', 'text-amber-900')}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* النتيجة الختامية: صافي الأصول */}
                <div className="bg-indigo-900 text-white p-4 rounded-xl flex justify-between items-center shadow-md">
                  <div>
                    <span className="font-extrabold text-base md:text-lg">
                      صافي الأصول (Net Assets = Capital Employed - Non-Current Liabilities)
                    </span>
                    <p className="text-xs text-indigo-200 mt-0.5">
                      القيمة الصافية لمنشأة الأعمال والمطابقة تماماً لحقوق الملكية
                    </p>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-2xl md:text-3xl font-black block">
                      {formatMoney(reportData.netAssets)}
                    </span>
                    {isComparative && (
                      <span className="text-xs text-indigo-200 block">السابق: {formatMoney(reportData.priorNetAssets)}</span>
                    )}
                  </div>
                </div>

                {/* 5. ممولة عن طريق: حقوق الملكية */}
                <div className="border-2 border-indigo-300 rounded-xl overflow-hidden shadow-xs bg-indigo-50/20">
                  <div className="bg-indigo-950 text-white px-4 py-2.5 flex justify-between items-center font-bold text-sm">
                    <div className="flex items-center gap-2">
                      <Scale size={16} className="text-indigo-300" />
                      <span>5. ممولة عن طريق: حقوق الملكية (Financed by Total Equity)</span>
                    </div>
                    <button 
                      onClick={() => navigate('/changes-in-equity')}
                      className="text-xs text-indigo-300 hover:text-white underline font-normal"
                    >
                      عرض مصفوفة التغير في حقوق الملكية
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    {renderTableHeader()}
                    <tbody className="divide-y divide-slate-100">
                      {filterRows(reportData.equityRows).map(row => renderBalanceRow(row))}
                      {reportData.priorRetainedEarnings !== 0 && (
                        <tr className="bg-slate-50/80">
                          <td className="py-2 px-4 text-slate-400 font-mono text-xs w-28">-</td>
                          <td className="py-2 px-2 font-bold text-slate-700">أرباح (خسائر) مرحلة من سنوات سابقة</td>
                          <td className="py-2 px-4 text-left font-mono font-bold text-slate-700">{formatMoney(reportData.priorRetainedEarnings)}</td>
                          {isComparative && <td colSpan={3} className="py-2 px-4 text-slate-400 text-xs">-</td>}
                        </tr>
                      )}
                      <tr className="bg-amber-50/60 font-bold text-amber-900">
                        <td className="py-2 px-4 text-amber-600 font-mono text-xs w-28">-</td>
                        <td className="py-2 px-2">صافي أرباح الفترة الحالية (من قائمة الدخل)</td>
                        <td className="py-2 px-4 text-left font-mono">{formatMoney(reportData.netIncome)}</td>
                        {isComparative && <td colSpan={3} className="py-2 px-4 text-slate-400 text-xs">-</td>}
                      </tr>
                      {renderSubtotalRow('إجمالي حقوق الملكية (المطابق لصافي الأصول)', reportData.totalEquity, reportData.priorTotalEquity, 'bg-indigo-100 font-black', 'text-indigo-950')}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* الخيار الثاني: العرض التقليدي (CLASSIC BALANCE SHEET)                         */}
            {/* ========================================================================= */}
            {viewMode === 'classic' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* الجانب الأيمن: الأصول */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 border-b-2 border-blue-600 pb-2 flex justify-between items-center">
                      <span>الأصول المتداولة (Current Assets)</span>
                      <span className="font-mono text-blue-700">{formatMoney(reportData.totalCurrentAssets)}</span>
                    </h3>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {filterRows(reportData.currentAssets).map(row => (
                          <tr key={row.account.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2 text-slate-800">
                              {row.account.name} <span className="text-xs text-slate-400 font-mono">({row.account.code})</span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-medium text-slate-700">{formatMoney(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-slate-800 border-b-2 border-blue-600 pb-2 flex justify-between items-center">
                      <span>الأصول غير المتداولة (Non-Current Assets)</span>
                      <span className="font-mono text-blue-700">{formatMoney(reportData.totalNonCurrentAssets)}</span>
                    </h3>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {filterRows(reportData.nonCurrentAssets).map(row => (
                          <tr key={row.account.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2 text-slate-800">
                              {row.account.name} <span className="text-xs text-slate-400 font-mono">({row.account.code})</span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-medium text-slate-700">{formatMoney(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* إجمالي الأصول الكلاسيكي */}
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex justify-between items-center font-bold text-blue-900">
                    <span>إجمالي الأصول (Total Assets)</span>
                    <span className="font-mono text-xl">{formatMoney(reportData.totalAssets)}</span>
                  </div>
                </div>

                {/* الجانب الأيسر: الخصوم وحقوق الملكية */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 border-b-2 border-red-500 pb-2 flex justify-between items-center">
                      <span>الخصوم المتداولة (Current Liabilities)</span>
                      <span className="font-mono text-red-700">{formatMoney(reportData.totalCurrentLiabilities)}</span>
                    </h3>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {filterRows(reportData.currentLiabilities).map(row => (
                          <tr key={row.account.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2 text-slate-800">
                              {row.account.name} <span className="text-xs text-slate-400 font-mono">({row.account.code})</span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-medium text-slate-700">{formatMoney(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {reportData.totalNonCurrentLiabilities > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 border-b-2 border-amber-500 pb-2 flex justify-between items-center">
                        <span>الخصوم غير المتداولة (Non-Current Liabilities)</span>
                        <span className="font-mono text-amber-700">{formatMoney(reportData.totalNonCurrentLiabilities)}</span>
                      </h3>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {filterRows(reportData.nonCurrentLiabilities).map(row => (
                            <tr key={row.account.id} className="hover:bg-slate-50">
                              <td className="py-2 px-2 text-slate-800">
                                {row.account.name} <span className="text-xs text-slate-400 font-mono">({row.account.code})</span>
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-medium text-slate-700">{formatMoney(row.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

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
