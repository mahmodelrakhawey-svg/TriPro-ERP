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
  PiggyBank,
  ArrowRightLeft
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

interface AccountLine {
  id: string;
  code: string;
  name: string;
  value: number;
  priorValue?: number;
}

const IncomeStatement: React.FC = () => {
  const { accounts, settings, currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(fiscalYearRange.endDate);
  const [showLogo, setShowLogo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);
  const [priorLedgerLines, setPriorLedgerLines] = useState<any[]>([]);
  const [isComparative, setIsComparative] = useState(false);

  // حساب تواريخ الفترة المقارنة (السنة السابقة)
  const startYear = parseInt(startDate.slice(0, 4), 10) || new Date().getFullYear();
  const endYear = parseInt(endDate.slice(0, 4), 10) || new Date().getFullYear();
  const priorStartDate = `${startYear - 1}${startDate.slice(4)}`;
  const priorEndDate = `${endYear - 1}${endDate.slice(4)}`;

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

      // 1. استعلام الفترة الحالية
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

      // 2. استعلام الفترة المقارنة (إذا تم تفعيل العرض المقارن)
      if (isComparative) {
        let priorQuery = supabase
          .from('journal_lines')
          .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, reference, organization_id)')
          .eq('journal_entries.status', 'posted')
          .gte('journal_entries.transaction_date', priorStartDate)
          .lte('journal_entries.transaction_date', priorEndDate);

        if (userOrgId) {
          priorQuery = priorQuery.eq('journal_entries.organization_id', userOrgId);
        }

        const { data: priorData, error: priorErr } = await priorQuery;
        if (priorErr) throw priorErr;
        setPriorLedgerLines(priorData || []);
      }
    } catch (err: any) {
      console.error('Error fetching income statement data:', err);
      showToast('فشل جلب البيانات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, accounts, currentUser, isComparative]);

  const reportData = useMemo(() => {
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

    const accountBalances: Record<string, number> = {};
    const priorAccountBalances: Record<string, number> = {};
    
    if (currentUser?.role === 'demo') {
      accounts.forEach(acc => {
        const type = String(acc.type || '').toLowerCase();
        const isDebitNature = type.includes('asset') || type.includes('expense') || type.includes('أصول') || type.includes('مصروفات') || type.includes('تكلفة');
        if (isDebitNature) {
          accountBalances[acc.id] = acc.balance || 0;
          priorAccountBalances[acc.id] = (acc.balance || 0) * 0.9;
        } else {
          accountBalances[acc.id] = -(acc.balance || 0);
          priorAccountBalances[acc.id] = -(acc.balance || 0) * 0.9;
        }
      });
    } else {
      (ledgerLines || []).filter(Boolean).forEach(line => {
        if (line.journal_entries?.reference?.startsWith('CLOSE-')) return;
        if (accountBalances[line.account_id] === undefined) accountBalances[line.account_id] = 0;
        accountBalances[line.account_id] += (Number(line.debit) || 0) - (Number(line.credit) || 0);
      });

      (priorLedgerLines || []).filter(Boolean).forEach(line => {
        if (line.journal_entries?.reference?.startsWith('CLOSE-')) return;
        if (priorAccountBalances[line.account_id] === undefined) priorAccountBalances[line.account_id] = 0;
        priorAccountBalances[line.account_id] += (Number(line.debit) || 0) - (Number(line.credit) || 0);
      });
    }

    const isFinanceAccount = (code: string, name: string) => {
      return (
        code.startsWith('423') || 
        code === '5342' ||
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
        name.includes('مرابحة تمويلية')
      );
    };

    const isInvestingAccount = (code: string, name: string) => {
      return (
        code.startsWith('424') ||
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

    const operatingRevenues: AccountLine[] = [];
    const cogs: AccountLine[] = [];
    const otherOperatingIncome: AccountLine[] = [];
    const sellingExpenses: AccountLine[] = [];
    const adminExpenses: AccountLine[] = [];
    const investingIncome: AccountLine[] = [];
    const investingExpenses: AccountLine[] = [];
    const financeIncome: AccountLine[] = [];
    const financeCosts: AccountLine[] = [];
    const taxExpenses: AccountLine[] = [];

    pnlAccounts.forEach(acc => {
      const balance = accountBalances[acc.id] || 0;
      const priorBalance = priorAccountBalances[acc.id] || 0;
      if (Math.abs(balance) < 0.0001 && Math.abs(priorBalance) < 0.0001) return;

      const code = String(acc.code || '').trim();
      const name = String(acc.name || '').trim().toLowerCase();
      const type = String(acc.type || '').toLowerCase();

      const isRevenueNature = code.startsWith('4') || type.includes('revenue') || type.includes('income') || type.includes('إيراد');
      const val = isRevenueNature ? -balance : balance;
      const priorVal = isRevenueNature ? -priorBalance : priorBalance;

      if (isFinanceAccount(code, name)) {
        if (isRevenueNature || name.includes('دائن') || name.includes('عائد') || name.includes('إيراد')) {
          financeIncome.push({ id: acc.id, code: acc.code, name: acc.name, value: isRevenueNature ? val : -val, priorValue: isRevenueNature ? priorVal : -priorVal });
        } else {
          financeCosts.push({ id: acc.id, code: acc.code, name: acc.name, value: val, priorValue: priorVal });
        }
        return;
      }

      if (isInvestingAccount(code, name)) {
        if (isRevenueNature || name.includes('أرباح') || name.includes('ارباح') || name.includes('إيراد') || name.includes('توزيعات')) {
          investingIncome.push({ id: acc.id, code: acc.code, name: acc.name, value: isRevenueNature ? val : -val, priorValue: isRevenueNature ? priorVal : -priorVal });
        } else {
          investingExpenses.push({ id: acc.id, code: acc.code, name: acc.name, value: val, priorValue: priorVal });
        }
        return;
      }

      if (isTaxAccount(code, name)) {
        taxExpenses.push({ id: acc.id, code: acc.code, name: acc.name, value: val, priorValue: priorVal });
        return;
      }

      if (isRevenueNature) {
        if (code.startsWith('41') || name.includes('مبيعات') || !code.startsWith('42')) {
          operatingRevenues.push({ id: acc.id, code: acc.code, name: acc.name, value: val, priorValue: priorVal });
        } else {
          otherOperatingIncome.push({ id: acc.id, code: acc.code, name: acc.name, value: val, priorValue: priorVal });
        }
      } else {
        if (isCogsAccount(code, name)) {
          cogs.push({ id: acc.id, code: acc.code, name: acc.name, value: val, priorValue: priorVal });
        } else if (isSellingAccount(code, name)) {
          sellingExpenses.push({ id: acc.id, code: acc.code, name: acc.name, value: val, priorValue: priorVal });
        } else {
          adminExpenses.push({ id: acc.id, code: acc.code, name: acc.name, value: val, priorValue: priorVal });
        }
      }
    });

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

    // حساب المجاميع الحالية والسابقة
    const sumLines = (lines: AccountLine[]) => ({
      current: lines.reduce((sum, r) => sum + r.value, 0),
      prior: lines.reduce((sum, r) => sum + (r.priorValue || 0), 0)
    });

    const totalOperatingRevenues = sumLines(operatingRevenues).current;
    const priorTotalOperatingRevenues = sumLines(operatingRevenues).prior;

    const totalCogs = sumLines(cogs).current;
    const priorTotalCogs = sumLines(cogs).prior;

    const grossProfit = totalOperatingRevenues - totalCogs;
    const priorGrossProfit = priorTotalOperatingRevenues - priorTotalCogs;

    const totalOtherOperatingIncome = sumLines(otherOperatingIncome).current;
    const priorTotalOtherOperatingIncome = sumLines(otherOperatingIncome).prior;

    const totalSellingExpenses = sumLines(sellingExpenses).current;
    const priorTotalSellingExpenses = sumLines(sellingExpenses).prior;

    const totalAdminExpenses = sumLines(adminExpenses).current;
    const priorTotalAdminExpenses = sumLines(adminExpenses).prior;

    const totalOperatingExpenses = totalSellingExpenses + totalAdminExpenses;
    const priorTotalOperatingExpenses = priorTotalSellingExpenses + priorTotalAdminExpenses;
    
    const operatingProfit = grossProfit + totalOtherOperatingIncome - totalOperatingExpenses;
    const priorOperatingProfit = priorGrossProfit + priorTotalOtherOperatingIncome - priorTotalOperatingExpenses;

    const totalInvestingIncome = sumLines(investingIncome).current;
    const priorTotalInvestingIncome = sumLines(investingIncome).prior;

    const totalInvestingExpenses = sumLines(investingExpenses).current;
    const priorTotalInvestingExpenses = sumLines(investingExpenses).prior;

    const netInvesting = totalInvestingIncome - totalInvestingExpenses;
    const priorNetInvesting = priorTotalInvestingIncome - priorTotalInvestingExpenses;

    const profitBeforeFinancingAndTax = operatingProfit + netInvesting;
    const priorProfitBeforeFinancingAndTax = priorOperatingProfit + priorNetInvesting;

    const totalFinanceIncome = sumLines(financeIncome).current;
    const priorTotalFinanceIncome = sumLines(financeIncome).prior;

    const totalFinanceCosts = sumLines(financeCosts).current;
    const priorTotalFinanceCosts = sumLines(financeCosts).prior;

    const netFinancing = totalFinanceIncome - totalFinanceCosts;
    const priorNetFinancing = priorTotalFinanceIncome - priorTotalFinanceCosts;

    const profitBeforeTax = profitBeforeFinancingAndTax + netFinancing;
    const priorProfitBeforeTax = priorProfitBeforeFinancingAndTax + priorNetFinancing;

    const totalTaxExpenses = sumLines(taxExpenses).current;
    const priorTotalTaxExpenses = sumLines(taxExpenses).prior;

    const netIncome = profitBeforeTax - totalTaxExpenses;
    const priorNetIncome = priorProfitBeforeTax - priorTotalTaxExpenses;

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
      priorTotalOperatingRevenues,
      totalCogs,
      priorTotalCogs,
      grossProfit,
      priorGrossProfit,
      totalOtherOperatingIncome,
      priorTotalOtherOperatingIncome,
      totalSellingExpenses,
      priorTotalSellingExpenses,
      totalAdminExpenses,
      priorTotalAdminExpenses,
      totalOperatingExpenses,
      priorTotalOperatingExpenses,

      operatingProfit,
      priorOperatingProfit,
      totalInvestingIncome,
      priorTotalInvestingIncome,
      totalInvestingExpenses,
      priorTotalInvestingExpenses,
      netInvesting,
      priorNetInvesting,
      profitBeforeFinancingAndTax,
      priorProfitBeforeFinancingAndTax,

      totalFinanceIncome,
      priorTotalFinanceIncome,
      totalFinanceCosts,
      priorTotalFinanceCosts,
      netFinancing,
      priorNetFinancing,
      profitBeforeTax,
      priorProfitBeforeTax,

      totalTaxExpenses,
      priorTotalTaxExpenses,
      netIncome,
      priorNetIncome,

      grossMargin,
      operatingMargin,
      netMargin
    };
  }, [accounts, ledgerLines, priorLedgerLines, currentUser]);

  const handlePrint = () => {
    window.print();
  };

  const exportToExcel = () => {
    const headers = isComparative 
      ? ['كود الحساب', 'اسم الحساب / البند', `الفترة الحالية (${startDate})`, `الفترة المقارنة (${priorStartDate})`, 'التغير ($)', 'نسبة التغير %']
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
      ['قائمة الدخل الشامل (وفق معيار التقرير المالي الدولي IFRS 18)'],
      [`عن الفترة من: ${startDate} إلى: ${endDate}` + (isComparative ? ` (مقارنة مع ${priorStartDate} إلى ${priorEndDate})` : '')],
      [''],
      headers,
      ['=== 1. الفئة التشغيلية (Operating Category) ==='],
      ['-- إيرادات النشاط الرئيسي --'],
      ...reportData.operatingRevenues.map(r => formatRow(r.code, r.name, r.value, r.priorValue)),
      formatRow('', 'إجمالي إيرادات النشاط الرئيسي', reportData.totalOperatingRevenues, reportData.priorTotalOperatingRevenues),
      [''],
      ['-- تكلفة المبيعات (COGS) --'],
      ...reportData.cogs.map(c => formatRow(c.code, c.name, c.value, c.priorValue)),
      formatRow('', 'إجمالي تكلفة المبيعات', reportData.totalCogs, reportData.priorTotalCogs),
      [''],
      formatRow('', 'مجمل الربح (Gross Profit)', reportData.grossProfit, reportData.priorGrossProfit),
      [''],
      ['-- إيرادات تشغيلية أخرى --'],
      ...reportData.otherOperatingIncome.map(o => formatRow(o.code, o.name, o.value, o.priorValue)),
      formatRow('', 'إجمالي إيرادات تشغيلية أخرى', reportData.totalOtherOperatingIncome, reportData.priorTotalOtherOperatingIncome),
      [''],
      ['-- مصروفات البيع والتسويق --'],
      ...reportData.sellingExpenses.map(s => formatRow(s.code, s.name, s.value, s.priorValue)),
      formatRow('', 'إجمالي مصروفات البيع والتسويق', reportData.totalSellingExpenses, reportData.priorTotalSellingExpenses),
      [''],
      ['-- المصروفات الإدارية والعمومية --'],
      ...reportData.adminExpenses.map(a => formatRow(a.code, a.name, a.value, a.priorValue)),
      formatRow('', 'إجمالي المصروفات الإدارية والعمومية', reportData.totalAdminExpenses, reportData.priorTotalAdminExpenses),
      formatRow('', 'إجمالي المصروفات التشغيلية', reportData.totalOperatingExpenses, reportData.priorTotalOperatingExpenses),
      [''],
      formatRow('', '>>> المجموع الإلزامي 1: الربح التشغيلي (Operating Profit) <<<', reportData.operatingProfit, reportData.priorOperatingProfit),
      [''],
      ['=== 2. الفئة الاستثمارية (Investing Category) ==='],
      ...reportData.investingIncome.map(i => formatRow(i.code, i.name, i.value, i.priorValue)),
      ...reportData.investingExpenses.map(e => formatRow(e.code, e.name, -e.value, -(e.priorValue || 0))),
      formatRow('', 'صافي عوائد الأنشطة الاستثمارية', reportData.netInvesting, reportData.priorNetInvesting),
      [''],
      formatRow('', '>>> المجموع الإلزامي 2: الربح قبل التمويل وضريبة الدخل <<<', reportData.profitBeforeFinancingAndTax, reportData.priorProfitBeforeFinancingAndTax),
      [''],
      ['=== 3. الفئة التمويلية (Financing Category) ==='],
      ...reportData.financeIncome.map(f => formatRow(f.code, f.name, f.value, f.priorValue)),
      ...reportData.financeCosts.map(c => formatRow(c.code, c.name, c.value, c.priorValue)),
      formatRow('', 'صافي تكلفة / إيراد التمويل', reportData.netFinancing, reportData.priorNetFinancing),
      [''],
      formatRow('', '>>> المجموع الإلزامي 3: الربح قبل الضرائب (Profit before Tax) <<<', reportData.profitBeforeTax, reportData.priorProfitBeforeTax),
      [''],
      ['=== ضرائب الدخل (Income Taxes) ==='],
      ...reportData.taxExpenses.map(t => formatRow(t.code, t.name, t.value, t.priorValue)),
      formatRow('', 'إجمالي مصروف ضريبة الدخل', reportData.totalTaxExpenses, reportData.priorTotalTaxExpenses),
      [''],
      formatRow('', '>>> صافي ربح / (خسارة) الفترة النهائي <<<', reportData.netIncome, reportData.priorNetIncome)
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Income Statement IFRS 18");
    XLSX.writeFile(wb, `Income_Statement_IFRS18_${startDate}_${endDate}.xlsx`);
  };

  const formatMoney = (val: number) => {
    return Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const renderAccountRow = (item: AccountLine, isExpense = false) => {
    const curVal = item.value;
    const prVal = item.priorValue || 0;
    const diff = curVal - prVal;
    const pct = prVal !== 0 ? (diff / Math.abs(prVal)) * 100 : 0;

    return (
      <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/80">
        <td className="py-1.5 text-slate-500 font-mono text-xs w-24">{item.code}</td>
        <td className="py-1.5 text-slate-800">{item.name}</td>
        <td className={`py-1.5 text-left font-medium ${isExpense ? 'text-red-700' : 'text-slate-700'} w-36`}>
          {formatMoney(curVal)}
        </td>
        {isComparative && (
          <>
            <td className="py-1.5 text-left font-medium text-slate-500 w-36">{formatMoney(prVal)}</td>
            <td className="py-1.5 text-left font-mono text-xs w-28">{formatMoney(diff)}</td>
            <td className="py-1.5 text-left font-mono text-xs w-20">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                isExpense 
                  ? (diff <= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')
                  : (diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')
              }`}>
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
        <td colSpan={2} className="py-2 px-3">{title}</td>
        <td className="py-2 px-3 text-left font-mono">{formatMoney(curVal)}</td>
        {isComparative && (
          <>
            <td className="py-2 px-3 text-left font-mono text-slate-600">{formatMoney(prVal)}</td>
            <td className="py-2 px-3 text-left font-mono text-xs">{formatMoney(diff)}</td>
            <td className="py-2 px-3 text-left font-mono text-xs">
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
        <tr className="border-b border-slate-200 text-xs text-slate-400 font-bold">
          <th className="py-1 text-right w-24">كود الحساب</th>
          <th className="py-1 text-right">اسم الحساب</th>
          <th className="py-1 text-left w-36">الفترة الحالية ({startDate.slice(0, 4)})</th>
          {isComparative && (
            <>
              <th className="py-1 text-left w-36 text-slate-500">الفترة السابقة ({priorStartDate.slice(0, 4)})</th>
              <th className="py-1 text-left w-28">التغير</th>
              <th className="py-1 text-left w-20">%</th>
            </>
          )}
        </tr>
      </thead>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12" dir="rtl">
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
        <div className="flex flex-wrap items-center gap-2">
          {/* زر تفعيل العرض المقارن */}
          <button
            onClick={() => setIsComparative(!isComparative)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm border ${
              isComparative 
                ? 'bg-indigo-600 text-white border-indigo-700' 
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <ArrowRightLeft size={16} />
            {isComparative ? 'إلغاء العرض المقارن' : 'عرض مقارن مع العام السابق'}
          </button>

          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 transition-colors font-semibold text-xs shadow-sm"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-blue-600" : ""} /> تحديث
          </button>
          <button 
            onClick={handlePrint} 
            className="flex items-center gap-2 bg-slate-800 text-white px-3.5 py-2 rounded-xl hover:bg-slate-700 transition-colors shadow-sm font-semibold text-xs"
          >
            <Printer size={16} /> طباعة
          </button>
          <button 
            onClick={exportToExcel} 
            className="flex items-center gap-2 bg-emerald-600 text-white px-3.5 py-2 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm font-semibold text-xs"
          >
            <Download size={16} /> تصدير Excel
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
            {isComparative ? (
              <span className="text-[11px] text-slate-500 font-mono">
                السابق: {formatMoney(reportData.priorTotalOperatingRevenues)}
              </span>
            ) : (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-1">النشاط الرئيسي</span>
            )}
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
            <p className="text-xs font-medium text-blue-700 font-bold">الربح التشغيلي (IFRS 18)</p>
            <h4 className="text-xl font-black text-blue-950 mt-1">{formatMoney(reportData.operatingProfit)}</h4>
            <span className="text-xs text-blue-700 font-semibold flex items-center gap-1 mt-1">
              هامش: {reportData.operatingMargin.toFixed(1)}%
            </span>
          </div>
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md">
            <Layers size={22} />
          </div>
        </div>

        {/* 4. Net Income */}
        <div className={`p-4 rounded-xl border shadow-sm flex items-center justify-between ${reportData.netIncome >= 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'}`}>
          <div>
            <p className="text-xs font-medium text-slate-600">صافي ربح / (خسارة) العام</p>
            <h4 className={`text-xl font-black mt-1 ${reportData.netIncome >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
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
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">من تاريخ</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              className="border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              className="border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold" 
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
            <label htmlFor="showLogo" className="text-xs font-bold text-slate-700 cursor-pointer">
              إظهار الشعار الرسمي عند الطباعة
            </label>
          </div>
        </div>

        {isComparative && (
          <div className="bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg text-xs text-indigo-900 font-bold">
            مقارنة نشطة مع: {priorStartDate} إلى {priorEndDate}
          </div>
        )}
      </div>

      {/* Report Document Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none" id="report-content">
        <ReportHeader 
          title="قائمة الدخل الشامل (وفق معيار التقرير المالي الدولي IFRS 18)" 
          subtitle={`عن الفترة المحاسبية من ${startDate} إلى ${endDate}` + (isComparative ? ` (مقارنة مع سنة ${priorStartDate.slice(0, 4)})` : '')} 
        />

        {loading && (
          <div className="p-16 text-center">
            <Loader2 className="animate-spin mx-auto text-blue-600 mb-3" size={36} />
            <p className="text-slate-500 font-medium text-sm">جاري تجميع حركات الحسابات وتصنيفها معيارياً...</p>
          </div>
        )}

        {!loading && (
          <div className="p-6 md:p-8 space-y-8">
            {/* 1. الفئة التشغيلية (OPERATING CATEGORY) */}
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
                    {renderTableHeader()}
                    <tbody>
                      {reportData.operatingRevenues.length === 0 ? (
                        <tr>
                          <td colSpan={isComparative ? 6 : 3} className="py-2 text-center text-slate-400 italic">لا توجد إيرادات مبيعات مسجلة خلال الفترة</td>
                        </tr>
                      ) : (
                        reportData.operatingRevenues.map(r => renderAccountRow(r))
                      )}
                      {renderSubtotalRow('إجمالي إيرادات النشاط الرئيسي', reportData.totalOperatingRevenues, reportData.priorTotalOperatingRevenues, 'bg-emerald-50/70', 'text-emerald-900')}
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
                    {renderTableHeader()}
                    <tbody>
                      {reportData.cogs.length === 0 ? (
                        <tr>
                          <td colSpan={isComparative ? 6 : 3} className="py-2 text-center text-slate-400 italic">لا توجد تكاليف بضاعة مباعة مسجلة خلال الفترة</td>
                        </tr>
                      ) : (
                        reportData.cogs.map(c => renderAccountRow(c, true))
                      )}
                      {renderSubtotalRow('إجمالي تكلفة المبيعات (COGS)', reportData.totalCogs, reportData.priorTotalCogs, 'bg-amber-50/70', 'text-amber-900')}
                    </tbody>
                  </table>
                </div>

                {/* مجمل الربح */}
                <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-lg flex justify-between items-center font-bold text-blue-900">
                  <div className="flex items-center gap-2">
                    <PieChart size={18} className="text-blue-600" />
                    <span>مجمل الربح (Gross Profit)</span>
                    <span className="text-xs font-normal text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full mr-2">
                      هامش {reportData.grossMargin.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-lg font-black">{formatMoney(reportData.grossProfit)}</span>
                    {isComparative && (
                      <span className="text-xs text-slate-500 mr-3 block">السابق: {formatMoney(reportData.priorGrossProfit)}</span>
                    )}
                  </div>
                </div>

                {/* 1.3 إيرادات تشغيلية أخرى */}
                {reportData.otherOperatingIncome.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-emerald-800 mb-2 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                      <span>إيرادات تشغيلية أخرى (حوافز، خدمات متفرقة، تأجير تشغيلي)</span>
                      <span className="text-xs text-slate-500 font-normal">كود 42 التشغيلي</span>
                    </h4>
                    <table className="w-full text-sm">
                      {renderTableHeader()}
                      <tbody>
                        {reportData.otherOperatingIncome.map(o => renderAccountRow(o))}
                        {renderSubtotalRow('إجمالي الإيرادات التشغيلية الأخرى', reportData.totalOtherOperatingIncome, reportData.priorTotalOtherOperatingIncome, 'bg-emerald-50/50', 'text-emerald-800')}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 1.4 المصروفات التشغيلية */}
                <div>
                  <h4 className="text-sm font-bold text-red-800 mb-2 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <TrendingDown size={16} className="text-red-600" />
                      المصروفات التشغيلية (بيع، تسويق، إدارة وعموميات)
                    </span>
                    <span className="text-xs text-slate-500 font-normal">أكواد 52 و 53 التشغيلية</span>
                  </h4>

                  {reportData.sellingExpenses.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-bold text-slate-600 mb-1 px-1">مصروفات البيع والتسويق:</p>
                      <table className="w-full text-sm">
                        {renderTableHeader()}
                        <tbody>
                          {reportData.sellingExpenses.map(s => renderAccountRow(s, true))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {reportData.adminExpenses.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-bold text-slate-600 mb-1 px-1">المصروفات العمومية والإدارية:</p>
                      <table className="w-full text-sm">
                        {renderTableHeader()}
                        <tbody>
                          {reportData.adminExpenses.map(a => renderAccountRow(a, true))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="bg-red-50/70 border-t border-red-200 flex justify-between items-center py-2 px-3 font-bold text-red-900 text-sm rounded">
                    <span>إجمالي المصروفات التشغيلية</span>
                    <span className="font-mono">{formatMoney(reportData.totalOperatingExpenses)}</span>
                  </div>
                </div>

                {/* المجموع الإلزامي 1: الربح التشغيلي */}
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
                  <div className="text-left font-mono">
                    <span className="text-xl md:text-2xl font-black block">
                      {formatMoney(reportData.operatingProfit)}
                    </span>
                    {isComparative && (
                      <span className="text-xs text-blue-200 block">السابق: {formatMoney(reportData.priorOperatingProfit)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. الفئة الاستثمارية */}
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
                    {renderTableHeader()}
                    <tbody>
                      {reportData.investingIncome.map(i => renderAccountRow(i))}
                      {reportData.investingExpenses.map(e => renderAccountRow(e, true))}
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
                  <div className="text-left font-mono">
                    <span className="text-xl md:text-2xl font-black block">
                      {formatMoney(reportData.profitBeforeFinancingAndTax)}
                    </span>
                    {isComparative && (
                      <span className="text-xs text-purple-200 block">السابق: {formatMoney(reportData.priorProfitBeforeFinancingAndTax)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. الفئة التمويلية */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PiggyBank size={18} className="text-amber-400" />
                  <h3 className="font-bold text-base">3. الفئة التمويلية (Financing Category - IFRS 18)</h3>
                </div>
                <span className="text-xs text-slate-300">عائدات الودائع والفوائد البنكية، مقابل فوائد وتكاليف القروض</span>
              </div>

              <div className="p-5 space-y-4">
                {reportData.financeIncome.length === 0 && reportData.financeCosts.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg text-center text-sm text-slate-500 border border-dashed border-slate-200">
                    لا توجد إيرادات أو تكاليف تمويلية مسجلة خلال الفترة (0.00)
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    {renderTableHeader()}
                    <tbody>
                      {reportData.financeIncome.map(f => renderAccountRow(f))}
                      {reportData.financeCosts.map(c => renderAccountRow(c, true))}
                    </tbody>
                  </table>
                )}

                <div className="flex justify-between items-center bg-amber-50 p-2.5 rounded-lg border border-amber-100 text-sm font-bold text-amber-900">
                  <span>صافي تكلفة / إيراد التمويل</span>
                  <span className="font-mono">{formatMoney(reportData.netFinancing)}</span>
                </div>

                {/* المجموع الإلزامي 3: الربح قبل الضرائب */}
                <div className="bg-gradient-to-r from-amber-700 to-amber-900 text-white p-4 rounded-xl flex justify-between items-center shadow-md">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={20} className="text-amber-300" />
                      <span className="font-extrabold text-base md:text-lg">
                        المجموع الإلزامي الثالث: الربح قبل الضرائب (Profit before Tax)
                      </span>
                    </div>
                    <p className="text-xs text-amber-200 mt-1">
                      الربح قبل التمويل والضرائب + صافي تكلفة/إيراد التمويل (معيار IFRS 18)
                    </p>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-xl md:text-2xl font-black block">
                      {formatMoney(reportData.profitBeforeTax)}
                    </span>
                    {isComparative && (
                      <span className="text-xs text-amber-200 block">السابق: {formatMoney(reportData.priorProfitBeforeTax)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 4. ضرائب الدخل وصافي الربح */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="p-5 space-y-4">
                {reportData.taxExpenses.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 mb-2 border-b border-slate-200 pb-1 flex justify-between">
                      <span>ضرائب الدخل (Income Taxes)</span>
                      <span className="text-xs text-slate-500 font-normal">كود 55</span>
                    </h4>
                    <table className="w-full text-sm">
                      {renderTableHeader()}
                      <tbody>
                        {reportData.taxExpenses.map(t => renderAccountRow(t, true))}
                        {renderSubtotalRow('إجمالي مصروف ضريبة الدخل', reportData.totalTaxExpenses, reportData.priorTotalTaxExpenses, 'bg-slate-100', 'text-slate-800')}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* النتيجة النهائية: صافي دخل العام */}
                <div className={`p-5 rounded-2xl flex justify-between items-center shadow-lg ${
                  reportData.netIncome >= 0 
                    ? 'bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white' 
                    : 'bg-gradient-to-r from-red-600 to-rose-800 text-white'
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <DollarSign size={24} className="text-emerald-200" />
                      <h3 className="text-lg md:text-xl font-black">
                        صافي ربح / (خسارة) الفترة النهائي (Net Profit / Loss for the Period)
                      </h3>
                    </div>
                    <p className="text-xs text-emerald-100 mt-1">
                      النتيجة المحاسبية النهائية الشاملة وفق المعيار الدولي IFRS 18
                    </p>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-2xl md:text-3xl font-black block">
                      {formatMoney(reportData.netIncome)}
                    </span>
                    {isComparative && (
                      <span className="text-xs text-emerald-100 block">السابق: {formatMoney(reportData.priorNetIncome)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default IncomeStatement;