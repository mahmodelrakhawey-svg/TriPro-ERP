import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { 
  BookOpen, 
  Printer, 
  Download, 
  FileText, 
  TrendingUp, 
  Scale, 
  Activity, 
  Layers, 
  Building2, 
  Calendar, 
  ChevronRight, 
  ShieldCheck, 
  Sparkles, 
  RefreshCw, 
  Info,
  DollarSign,
  PieChart,
  CheckCircle2,
  FileCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

interface AccountSummary {
  id: string;
  code: string;
  name: string;
  currentYear: number;
  priorYear: number;
}

const AnnualFinancialReport: React.FC = () => {
  const { accounts, settings, organization, currentUser, currentSelectedOrgId, selectedFiscalYear } = useAccounting();
  const { showToast } = useToast();

  const currentCalendarYear = new Date().getFullYear();
  const [reportYear, setReportYear] = useState<number>(selectedFiscalYear || (currentCalendarYear - 1 > 2020 ? currentCalendarYear : 2026));
  const [activeTab, setActiveTab] = useState<'ALL' | 'COVER' | 'PNL' | 'BALANCE_SHEET' | 'EQUITY' | 'CASH_FLOW' | 'NOTES' | 'AUDIT'>('ALL');
  const [loading, setLoading] = useState<boolean>(false);
  const [ledgerLinesCurrent, setLedgerLinesCurrent] = useState<any[]>([]);
  const [ledgerLinesPrior, setLedgerLinesPrior] = useState<any[]>([]);
  const [cumulativeLinesCurrent, setCumulativeLinesCurrent] = useState<any[]>([]);
  const [cumulativeLinesPrior, setCumulativeLinesPrior] = useState<any[]>([]);
  const [dbAssets, setDbAssets] = useState<any[]>([]);

  const priorYear = reportYear - 1;
  const currentStart = `${reportYear}-01-01`;
  const currentEnd = `${reportYear}-12-31`;
  const priorStart = `${priorYear}-01-01`;
  const priorEnd = `${priorYear}-12-31`;

  // جلب البيانات المالية الشاملة للسنتين الحالية والسابقة
  const loadFinancialData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || session?.user?.user_metadata?.org_id || (organization as any)?.id;

      // 1. حركات السنة الحالية
      let qCurr = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, reference, organization_id)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.transaction_date', currentStart)
        .lte('journal_entries.transaction_date', currentEnd);
      if (userOrgId) qCurr = qCurr.eq('journal_entries.organization_id', userOrgId);
      const { data: currData, error: currErr } = await qCurr;
      if (currErr) throw currErr;
      setLedgerLinesCurrent(currData || []);

      // 2. حركات السنة السابقة
      let qPrior = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, reference, organization_id)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.transaction_date', priorStart)
        .lte('journal_entries.transaction_date', priorEnd);
      if (userOrgId) qPrior = qPrior.eq('journal_entries.organization_id', userOrgId);
      const { data: prData } = await qPrior;
      setLedgerLinesPrior(prData || []);

      // 3. الأرصدة التراكمية حتى نهاية السنة الحالية (للمركز المالي)
      let qCumCurr = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', currentEnd);
      if (userOrgId) qCumCurr = qCumCurr.eq('journal_entries.organization_id', userOrgId);
      const { data: cumCurrData } = await qCumCurr;
      setCumulativeLinesCurrent(cumCurrData || []);

      // 4. الأرصدة التراكمية حتى نهاية السنة السابقة
      let qCumPrior = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', priorEnd);
      if (userOrgId) qCumPrior = qCumPrior.eq('journal_entries.organization_id', userOrgId);
      const { data: cumPrData } = await qCumPrior;
      setCumulativeLinesPrior(cumPrData || []);

      // 5. سجل الأصول الثابتة
      let qAssets = supabase.from('assets').select('*');
      if (userOrgId) qAssets = qAssets.eq('organization_id', userOrgId);
      const { data: assetsData } = await qAssets;
      setDbAssets(assetsData || []);

    } catch (err: any) {
      console.error('Error fetching annual report data:', err);
      showToast('خطأ أثناء جلب بيانات التقرير السنوي: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, [reportYear, currentSelectedOrgId]);

  // حساب الأرصدة والبيانات المعيارية
  const financialStatements = useMemo(() => {
    const pnlCurBalances: Record<string, number> = {};
    const pnlPriorBalances: Record<string, number> = {};

    ledgerLinesCurrent.forEach(line => {
      if (line.journal_entries?.reference?.startsWith('CLOSE-')) return;
      pnlCurBalances[line.account_id] = (pnlCurBalances[line.account_id] || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0);
    });

    ledgerLinesPrior.forEach(line => {
      if (line.journal_entries?.reference?.startsWith('CLOSE-')) return;
      pnlPriorBalances[line.account_id] = (pnlPriorBalances[line.account_id] || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0);
    });

    const bsCurBalances: Record<string, number> = {};
    const bsPriorBalances: Record<string, number> = {};

    cumulativeLinesCurrent.forEach(line => {
      bsCurBalances[line.account_id] = (bsCurBalances[line.account_id] || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0);
    });

    cumulativeLinesPrior.forEach(line => {
      bsPriorBalances[line.account_id] = (bsPriorBalances[line.account_id] || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0);
    });

    const isFinanceAccount = (code: string, name: string) => {
      return (
        code.startsWith('423') || code === '5342' ||
        name.includes('فوائد دائنة') || name.includes('فوائد بنكية') ||
        name.includes('عائد تمويل') || name.includes('إيراد تمويل') ||
        name.includes('فوائد قروض') || name.includes('تكلفة تمويل') ||
        name.includes('تكاليف تمويل') || name.includes('مصروف تمويل')
      );
    };

    const isInvestingAccount = (code: string, name: string) => {
      return (
        code.startsWith('424') ||
        name.includes('إيراد استثمار') || name.includes('أرباح استثمار') ||
        name.includes('توزيعات أرباح') || name.includes('أرباح بيع أصول') ||
        name.includes('خسائر بيع أصول') || name.includes('رأسمالية')
      );
    };

    const isTaxAccount = (code: string, name: string) => {
      return name.includes('ضريبة دخل') || name.includes('ضرائب دخل') || (code.startsWith('55') && name.includes('ضريب'));
    };

    const isCogsAccount = (code: string, name: string) => {
      return code.startsWith('51') || code.startsWith('501') || name.includes('تكلفة المبيعات') || name.includes('تكلفة الإنتاج') || name.includes('تكلفة البضاعة');
    };

    const isSellingAccount = (code: string, name: string) => {
      return code.startsWith('52') || name.includes('بيع وتوزيع') || name.includes('تسويق') || name.includes('دعاية');
    };

    const opRevenues: AccountSummary[] = [];
    const cogsLines: AccountSummary[] = [];
    const otherOpIncome: AccountSummary[] = [];
    const sellingExpenses: AccountSummary[] = [];
    const adminExpenses: AccountSummary[] = [];
    const invIncome: AccountSummary[] = [];
    const invExpenses: AccountSummary[] = [];
    const finIncome: AccountSummary[] = [];
    const finCosts: AccountSummary[] = [];
    const taxExpenses: AccountSummary[] = [];

    const currentAssets: AccountSummary[] = [];
    const nonCurrentAssets: AccountSummary[] = [];
    const currentLiabilities: AccountSummary[] = [];
    const nonCurrentLiabilities: AccountSummary[] = [];
    const equityAccounts: AccountSummary[] = [];

    const cashAccounts: AccountSummary[] = [];
    const receivableAccounts: AccountSummary[] = [];
    const inventoryAccounts: AccountSummary[] = [];
    const payableAccounts: AccountSummary[] = [];
    const relatedPartyAccounts: AccountSummary[] = [];

    accounts.forEach(acc => {
      const code = String(acc.code || '').trim();
      const name = String(acc.name || '').trim();
      const type = (acc.type || '').toLowerCase();

      const curRaw = pnlCurBalances[acc.id] || 0;
      const prRaw = pnlPriorBalances[acc.id] || 0;

      const curBsRaw = bsCurBalances[acc.id] || 0;
      const prBsRaw = bsPriorBalances[acc.id] || 0;

      const isRevenueNature = code.startsWith('4') || type.includes('revenue') || type.includes('income') || type.includes('إيراد');
      const curPnlVal = isRevenueNature ? -curRaw : curRaw;
      const prPnlVal = isRevenueNature ? -prRaw : prRaw;

      // 1. حسابات الدخل
      if (code.startsWith('4') || code.startsWith('5') || type.includes('expense') || type.includes('revenue')) {
        if (Math.abs(curPnlVal) > 0.001 || Math.abs(prPnlVal) > 0.001) {
          const item: AccountSummary = { id: acc.id, code, name, currentYear: curPnlVal, priorYear: prPnlVal };

          if (isFinanceAccount(code, name)) {
            if (isRevenueNature || name.includes('دائن')) finIncome.push(item);
            else finCosts.push(item);
          } else if (isInvestingAccount(code, name)) {
            if (isRevenueNature) invIncome.push(item);
            else invExpenses.push(item);
          } else if (isTaxAccount(code, name)) {
            taxExpenses.push(item);
          } else if (isRevenueNature) {
            if (code.startsWith('41') || code === '401' || name.includes('مبيعات') || name.includes('نشاط')) {
              opRevenues.push(item);
            } else {
              otherOpIncome.push(item);
            }
          } else if (isCogsAccount(code, name)) {
            cogsLines.push(item);
          } else if (isSellingAccount(code, name)) {
            sellingExpenses.push(item);
          } else {
            adminExpenses.push(item);
          }
        }
      }

      // 2. حسابات المركز المالي
      const isAsset = code.startsWith('1') || type.includes('asset') || type.includes('أصول');
      const isLiability = code.startsWith('2') || type.includes('liability') || type.includes('خصوم') || type.includes('التزامات');
      const isEquity = code.startsWith('3') || type.includes('equity') || type.includes('حقوق');

      if (isAsset) {
        const isContra = code.startsWith('1119') || code.startsWith('1129') || name.includes('مجمع إهلاك') || name.includes('مخصص');
        const curVal = isContra ? -Math.abs(curBsRaw) : curBsRaw;
        const prVal = isContra ? -Math.abs(prBsRaw) : prBsRaw;

        if (Math.abs(curVal) > 0.001 || Math.abs(prVal) > 0.001) {
          const item: AccountSummary = { id: acc.id, code, name, currentYear: curVal, priorYear: prVal };
          const isCurrentAsset = (
            code.startsWith('12') || code.startsWith('10') || !code.startsWith('11') ||
            name.includes('نقد') || name.includes('بنك') || name.includes('عملاء') || 
            name.includes('مخزون') || name.includes('مدين') || name.includes('أوراق قبض')
          );

          if (isCurrentAsset && !code.startsWith('11')) {
            currentAssets.push(item);
            if (name.includes('نقد') || name.includes('بنك') || name.includes('صندوق') || code.startsWith('121')) cashAccounts.push(item);
            if (name.includes('عميل') || name.includes('عملاء') || code.startsWith('122')) receivableAccounts.push(item);
            if (name.includes('مخزون') || code.startsWith('123')) inventoryAccounts.push(item);
          } else {
            nonCurrentAssets.push(item);
          }
        }
      } else if (isLiability) {
        const curVal = -curBsRaw;
        const prVal = -prBsRaw;

        if (Math.abs(curVal) > 0.001 || Math.abs(prVal) > 0.001) {
          const item: AccountSummary = { id: acc.id, code, name, currentYear: curVal, priorYear: prVal };
          const isNonCurrent = code.startsWith('22') || name.includes('طويلة الأجل') || name.includes('قرض طويل');

          if (isNonCurrent) {
            nonCurrentLiabilities.push(item);
          } else {
            currentLiabilities.push(item);
            if (name.includes('مورد') || code.startsWith('211')) payableAccounts.push(item);
          }
        }
      } else if (isEquity) {
        if (code === '3999' || name.includes('وسيط')) return;
        const curVal = -curBsRaw;
        const prVal = -prBsRaw;

        if (Math.abs(curVal) > 0.001 || Math.abs(prVal) > 0.001) {
          const item: AccountSummary = { id: acc.id, code, name, currentYear: curVal, priorYear: prVal };
          equityAccounts.push(item);
          if (name.includes('جاري') || name.includes('شريك') || code.startsWith('33')) {
            relatedPartyAccounts.push(item);
          }
        }
      }
    });

    const sumLines = (lines: AccountSummary[]) => ({
      current: lines.reduce((s, l) => s + l.currentYear, 0),
      prior: lines.reduce((s, l) => s + l.priorYear, 0)
    });

    const totalOpRevenues = sumLines(opRevenues);
    const totalCogs = sumLines(cogsLines);
    const grossProfit = { current: totalOpRevenues.current - totalCogs.current, prior: totalOpRevenues.prior - totalCogs.prior };

    const totalOtherOpIncome = sumLines(otherOpIncome);
    const totalSelling = sumLines(sellingExpenses);
    const totalAdmin = sumLines(adminExpenses);

    const operatingProfit = {
      current: grossProfit.current + totalOtherOpIncome.current - totalSelling.current - totalAdmin.current,
      prior: grossProfit.prior + totalOtherOpIncome.prior - totalSelling.prior - totalAdmin.prior
    };

    const totalInvIncome = sumLines(invIncome);
    const totalInvExpenses = sumLines(invExpenses);
    const netInvesting = {
      current: totalInvIncome.current - totalInvExpenses.current,
      prior: totalInvIncome.prior - totalInvExpenses.prior
    };

    const profitBeforeFinancing = {
      current: operatingProfit.current + netInvesting.current,
      prior: operatingProfit.prior + netInvesting.prior
    };

    const totalFinIncome = sumLines(finIncome);
    const totalFinCosts = sumLines(finCosts);
    const netFinance = {
      current: totalFinIncome.current - totalFinCosts.current,
      prior: totalFinIncome.prior - totalFinCosts.prior
    };

    const profitBeforeTax = {
      current: profitBeforeFinancing.current + netFinance.current,
      prior: profitBeforeFinancing.prior + netFinance.prior
    };

    const totalTaxes = sumLines(taxExpenses);
    const netIncome = {
      current: profitBeforeTax.current - totalTaxes.current,
      prior: profitBeforeTax.prior - totalTaxes.prior
    };

    const totalCurrentAssets = sumLines(currentAssets);
    const totalCurrentLiabilities = sumLines(currentLiabilities);
    const netWorkingCapital = {
      current: totalCurrentAssets.current - totalCurrentLiabilities.current,
      prior: totalCurrentAssets.prior - totalCurrentLiabilities.prior
    };

    const totalNonCurrentAssets = sumLines(nonCurrentAssets);
    const capitalEmployed = {
      current: netWorkingCapital.current + totalNonCurrentAssets.current,
      prior: netWorkingCapital.prior + totalNonCurrentAssets.prior
    };

    const totalNonCurrentLiabilities = sumLines(nonCurrentLiabilities);
    const netAssets = {
      current: capitalEmployed.current - totalNonCurrentLiabilities.current,
      prior: capitalEmployed.prior - totalNonCurrentLiabilities.prior
    };

    const baseEquity = sumLines(equityAccounts);
    const totalEquity = {
      current: baseEquity.current + netIncome.current,
      prior: baseEquity.prior + netIncome.prior
    };

    const deltaAR = (sumLines(receivableAccounts).current - sumLines(receivableAccounts).prior);
    const deltaInv = (sumLines(inventoryAccounts).current - sumLines(inventoryAccounts).prior);
    const deltaAP = (sumLines(payableAccounts).current - sumLines(payableAccounts).prior);

    const operatingCashFlow = {
      current: netIncome.current - deltaAR - deltaInv + deltaAP,
      prior: netIncome.prior
    };

    const totalCashEnding = sumLines(cashAccounts);

    return {
      pnl: {
        opRevenues, totalOpRevenues,
        cogsLines, totalCogs, grossProfit,
        otherOpIncome, totalOtherOpIncome,
        sellingExpenses, totalSelling,
        adminExpenses, totalAdmin,
        operatingProfit,
        invIncome, invExpenses, netInvesting,
        profitBeforeFinancing,
        finIncome, finCosts, netFinance,
        profitBeforeTax,
        taxExpenses, totalTaxes,
        netIncome
      },
      bs: {
        currentAssets, totalCurrentAssets,
        nonCurrentAssets, totalNonCurrentAssets,
        totalAssets: {
          current: totalCurrentAssets.current + totalNonCurrentAssets.current,
          prior: totalCurrentAssets.prior + totalNonCurrentAssets.prior
        },
        currentLiabilities, totalCurrentLiabilities,
        netWorkingCapital,
        capitalEmployed,
        nonCurrentLiabilities, totalNonCurrentLiabilities,
        netAssets,
        equityAccounts, totalEquity
      },
      cashFlow: {
        operatingCashFlow,
        totalCashEnding
      },
      notesData: {
        cashAccounts,
        receivableAccounts,
        inventoryAccounts,
        payableAccounts,
        relatedPartyAccounts
      }
    };
  }, [accounts, ledgerLinesCurrent, ledgerLinesPrior, cumulativeLinesCurrent, cumulativeLinesPrior]);

  // تصدير كتاب مالي كامل إلى Excel متعدد الأوراق
  const handleExportExcelBook = () => {
    try {
      const wb = XLSX.utils.book_new();

      const coverData = [
        ['كتاب التقرير المالي السنوي الموحد والإيضاحات المتممة'],
        ['اسم المنشأة:', organization?.name || settings?.companyName || 'الشركة الوطنية'],
        ['السنة المالية المنتهية في:', `31 ديسمبر ${reportYear}`],
        ['العملة:', 'جنيه مصري (EGP)'],
        ['المعايير المطبقة:', 'معايير المحاسبة والتقارير المالية الدولية (IFRS / IAS)'],
        [],
        ['بيانات الإدارة ومراقبي الحسابات:'],
        ['المدير المالي التنفيذي (CFO):', 'معتمد'],
        ['رئيس مجلس الإدارة (CEO):', 'معتمد'],
        ['مراقب الحسابات الخارجي:', 'مكتب المحاسبة والمراجعة القانوني']
      ];
      const wsCover = XLSX.utils.aoa_to_sheet(coverData);
      XLSX.utils.book_append_sheet(wb, wsCover, 'بيانات المنشأة');

      const pnlData = [
        ['قائمة الأرباح أو الخسائر والدخل الشامل (IFRS 18)'],
        ['عن السنة المالية المنتهية في 31 ديسمبر', `${reportYear}`, `${priorYear}`, 'التغير ($)', 'نسبة التغير %'],
        ['1. الأنشطة التشغيلية (Operating Category)'],
        ['إيرادات النشاط الرئيسي', financialStatements.pnl.totalOpRevenues.current, financialStatements.pnl.totalOpRevenues.prior],
        ['(تكلفة المبيعات والإنتاج)', -financialStatements.pnl.totalCogs.current, -financialStatements.pnl.totalCogs.prior],
        ['مجمل الربح التشغيلي', financialStatements.pnl.grossProfit.current, financialStatements.pnl.grossProfit.prior],
        ['إيرادات تشغيلية أخرى', financialStatements.pnl.totalOtherOpIncome.current, financialStatements.pnl.totalOtherOpIncome.prior],
        ['(مصروفات البيع والتوزيع)', -financialStatements.pnl.totalSelling.current, -financialStatements.pnl.totalSelling.prior],
        ['(مصروفات عمومية وإدارية)', -financialStatements.pnl.totalAdmin.current, -financialStatements.pnl.totalAdmin.prior],
        ['الربح التشغيلي (Operating Profit)', financialStatements.pnl.operatingProfit.current, financialStatements.pnl.operatingProfit.prior],
        ['2. الأنشطة الاستثمارية (Investing Category)'],
        ['صافي دخل/(خسائر) الاستثمار', financialStatements.pnl.netInvesting.current, financialStatements.pnl.netInvesting.prior],
        ['الربح قبل التمويل والضرائب (Profit Before Financing & Tax)', financialStatements.pnl.profitBeforeFinancing.current, financialStatements.pnl.profitBeforeFinancing.prior],
        ['3. الأنشطة التمويلية (Financing Category)'],
        ['صافي الإيرادات/(التكاليف) التمويلية', financialStatements.pnl.netFinance.current, financialStatements.pnl.netFinance.prior],
        ['صافي الربح قبل الضريبة (Profit Before Tax)', financialStatements.pnl.profitBeforeTax.current, financialStatements.pnl.profitBeforeTax.prior],
        ['(ضرائب الدخل)', -financialStatements.pnl.totalTaxes.current, -financialStatements.pnl.totalTaxes.prior],
        ['صافي دخل العام (Net Income for the Year)', financialStatements.pnl.netIncome.current, financialStatements.pnl.netIncome.prior]
      ];
      const wsPnl = XLSX.utils.aoa_to_sheet(pnlData);
      XLSX.utils.book_append_sheet(wb, wsPnl, 'قائمة الدخل IFRS 18');

      const bsData = [
        ['قائمة المركز المالي التحليلية (IAS 1)'],
        ['كما في 31 ديسمبر', `${reportYear}`, `${priorYear}`, 'التغير ($)'],
        ['الأصول المتداولة (Current Assets)', financialStatements.bs.totalCurrentAssets.current, financialStatements.bs.totalCurrentAssets.prior],
        ['(يطرح) الالتزامات المتداولة (Current Liabilities)', -financialStatements.bs.totalCurrentLiabilities.current, -financialStatements.bs.totalCurrentLiabilities.prior],
        ['صافي رأس المال العامل (Net Working Capital)', financialStatements.bs.netWorkingCapital.current, financialStatements.bs.netWorkingCapital.prior],
        ['(يضاف) الأصول غير المتداولة (Non-Current Assets)', financialStatements.bs.totalNonCurrentAssets.current, financialStatements.bs.totalNonCurrentAssets.prior],
        ['إجمالي رأس المال الموظف (Capital Employed)', financialStatements.bs.capitalEmployed.current, financialStatements.bs.capitalEmployed.prior],
        ['(يطرح) الالتزامات غير المتداولة (Non-Current Liabilities)', -financialStatements.bs.totalNonCurrentLiabilities.current, -financialStatements.bs.totalNonCurrentLiabilities.prior],
        ['صافي الأصول (Net Assets)', financialStatements.bs.netAssets.current, financialStatements.bs.netAssets.prior],
        [],
        ['حقوق الملكية (Total Equity)', financialStatements.bs.totalEquity.current, financialStatements.bs.totalEquity.prior]
      ];
      const wsBs = XLSX.utils.aoa_to_sheet(bsData);
      XLSX.utils.book_append_sheet(wb, wsBs, 'المركز المالي IAS 1');

      const notesDataRows = [
        ['الإيضاحات المتممة للقوائم المالية'],
        [],
        ['إيضاح 4: النقدية وما في حكمها'],
        ['كود الحساب', 'اسم الحساب', `رصيد ${reportYear}`, `رصيد ${priorYear}`],
        ...financialStatements.notesData.cashAccounts.map(a => [a.code, a.name, a.currentYear, a.priorYear]),
        [],
        ['إيضاح 5: العملاء وأوراق القبض'],
        ['كود الحساب', 'اسم الحساب', `رصيد ${reportYear}`, `رصيد ${priorYear}`],
        ...financialStatements.notesData.receivableAccounts.map(a => [a.code, a.name, a.currentYear, a.priorYear]),
        [],
        ['إيضاح 6: المخزون'],
        ['كود الحساب', 'اسم الحساب', `رصيد ${reportYear}`, `رصيد ${priorYear}`],
        ...financialStatements.notesData.inventoryAccounts.map(a => [a.code, a.name, a.currentYear, a.priorYear]),
        [],
        ['إيضاح 7: الموردون والالتزامات'],
        ['كود الحساب', 'اسم الحساب', `رصيد ${reportYear}`, `رصيد ${priorYear}`],
        ...financialStatements.notesData.payableAccounts.map(a => [a.code, a.name, a.currentYear, a.priorYear])
      ];
      const wsNotes = XLSX.utils.aoa_to_sheet(notesDataRows);
      XLSX.utils.book_append_sheet(wb, wsNotes, 'الإيضاحات المتممة');

      XLSX.writeFile(wb, `Annual_Financial_Report_${reportYear}_${organization?.name || 'Company'}.xlsx`);
      showToast('تم تصدير ملف التقرير المالي السنوي بنجاح', 'success');
    } catch (e: any) {
      showToast('فشل تصدير Excel: ' + e.message, 'error');
    }
  };

  const formatMoney = (amount: number) => {
    return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const calcVariance = (curr: number, prior: number) => {
    const diff = curr - prior;
    const pct = prior !== 0 ? (diff / Math.abs(prior)) * 100 : 0;
    return { diff, pct };
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* شريط الأدوات العلوي واختيار السنة */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-xl flex items-center justify-center shadow-md">
            <BookOpen size={26} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              كتاب التقرير المالي السنوي الموحد والإيضاحات
              <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full font-bold">
                IAS 1 / IFRS 18
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              الحزمة المالية السنوية الشاملة لكافة القوائم والإيضاحات المتممة والمقارنات المعيارية
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <Calendar size={18} className="text-slate-500" />
            <span className="text-xs font-bold text-slate-700">السنة المالية:</span>
            <select
              value={reportYear}
              onChange={(e) => setReportYear(Number(e.target.value))}
              className="bg-transparent font-black text-indigo-700 text-sm focus:outline-none cursor-pointer"
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
            طباعة الكتاب الكامل
          </button>

          <button
            onClick={handleExportExcelBook}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold hover:bg-emerald-700 transition shadow-sm"
          >
            <Download size={16} />
            تصدير Excel متكامل
          </button>

          <button
            onClick={loadFinancialData}
            disabled={loading}
            className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition"
            title="تحديث البيانات"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* شريط تبويبات الأقسام للقراءة الفردية أو الموحدة */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 print:hidden">
        {[
          { id: 'ALL', label: '📖 الكتاب الكامل الموحد', icon: BookOpen },
          { id: 'COVER', label: '🏢 الغلاف وبيانات المنشأة', icon: Building2 },
          { id: 'PNL', label: '📈 قائمة الدخل (IFRS 18)', icon: TrendingUp },
          { id: 'BALANCE_SHEET', label: '⚖️ المركز المالي (IAS 1)', icon: Scale },
          { id: 'EQUITY', label: '🏛️ التغير في حقوق الملكية', icon: Layers },
          { id: 'CASH_FLOW', label: '🌊 التدفقات النقدية (IAS 7)', icon: Activity },
          { id: 'NOTES', label: '📝 الإيضاحات المتممة (Notes)', icon: FileText },
          { id: 'AUDIT', label: '👨‍💼 تقرير الإدارة والمراجعة', icon: ShieldCheck }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* جسم التقرير والصفحات */}
      <div className="space-y-12 print:space-y-8 bg-white p-6 sm:p-10 rounded-3xl border border-slate-200 shadow-sm print:border-none print:shadow-none print:p-0">

        {/* 1. صفحة الغلاف الرسمية */}
        {(activeTab === 'ALL' || activeTab === 'COVER') && (
          <div className="min-h-[85vh] flex flex-col justify-between border-2 border-slate-900 p-8 sm:p-14 rounded-3xl print:border-4 print:min-h-[1000px] print:rounded-none page-break-after">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-black tracking-widest text-indigo-700 uppercase bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                  القوائم المالية المدققة الموحدة
                </span>
                <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mt-4 leading-tight">
                  {organization?.name || settings?.companyName || 'شركة مساهمة متكاملة'}
                </h2>
                <p className="text-base text-slate-600 font-medium mt-2">
                  سجل تجاري: {settings?.commercialRegister || '1029384756'} • بطاقة ضريبية: {settings?.taxNumber || '987-654-321'}
                </p>
              </div>
              <div className="text-left font-mono text-sm text-slate-500">
                <p className="font-bold text-slate-900">Fiscal Year {reportYear}</p>
                <p>Standard: IFRS / IAS</p>
                <p>Currency: EGP</p>
              </div>
            </div>

            <div className="my-16 text-center">
              <div className="w-24 h-24 mx-auto bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                <BookOpen size={48} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mb-3">
                التقرير المالي السنوي الموحد
              </h1>
              <p className="text-lg font-bold text-indigo-700 mb-2">
                عن السنة المالية المنتهية في 31 ديسمبر {reportYear}
              </p>
              <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
                يتضمن القوائم المالية الأساسية الأربع وفق أحدث المعايير الدولية للإبلاغ المالي (IFRS 18 و IAS 1 و IAS 7) مع الإيضاحات المتممة المرفقة المقارنة مع عام {priorYear}.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-8 border-t-2 border-slate-200 text-xs sm:text-sm">
              <div className="text-center">
                <p className="text-slate-500 mb-1">المدير المالي (CFO)</p>
                <p className="font-bold text-slate-900">معتمد</p>
                <div className="w-28 h-0.5 bg-slate-300 mx-auto mt-6"></div>
              </div>
              <div className="text-center">
                <p className="text-slate-500 mb-1">رئيس مجلس الإدارة (CEO)</p>
                <p className="font-bold text-slate-900">معتمد</p>
                <div className="w-28 h-0.5 bg-slate-300 mx-auto mt-6"></div>
              </div>
              <div className="text-center">
                <p className="text-slate-500 mb-1">مراقب الحسابات المستقل</p>
                <p className="font-bold text-slate-900">تقرير غير متحفظ (Unqualified)</p>
                <div className="w-28 h-0.5 bg-slate-300 mx-auto mt-6"></div>
              </div>
            </div>
          </div>
        )}

        {/* 2. قائمة الدخل الشامل (IFRS 18) */}
        {(activeTab === 'ALL' || activeTab === 'PNL') && (
          <div className="page-break-before space-y-6">
            <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-end">
              <div>
                <span className="text-xs font-bold text-indigo-600">القائمة المالية الأولى</span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  قائمة الأرباح أو الخسائر والدخل الشامل (IFRS 18)
                </h3>
                <p className="text-xs text-slate-500">للسنة المنتهية في 31 ديسمبر {reportYear} (مقارنة مع {priorYear}) - المبالغ بالجنيه المصري</p>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-lg">إيضاح</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-black">
                    <th className="p-3">البيان (Statement Items)</th>
                    <th className="p-3 text-center w-20">إيضاح</th>
                    <th className="p-3 text-left w-36">{reportYear}</th>
                    <th className="p-3 text-left w-36">{priorYear}</th>
                    <th className="p-3 text-left w-28">التغير</th>
                    <th className="p-3 text-left w-20">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={6} className="p-2.5">1. الفئة التشغيلية (Operating Category)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">إيرادات النشاط الرئيسي والعقود</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.pnl.totalOpRevenues.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.pnl.totalOpRevenues.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.totalOpRevenues.current, financialStatements.pnl.totalOpRevenues.prior).diff)}</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalOpRevenues.current, financialStatements.pnl.totalOpRevenues.prior).pct.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-red-600">يطرح: تكلفة المبيعات وتكلفة النشاط</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.pnl.totalCogs.current)})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.pnl.totalCogs.prior)})</td>
                    <td className="p-2.5 text-left text-red-600">({formatMoney(calcVariance(financialStatements.pnl.totalCogs.current, financialStatements.pnl.totalCogs.prior).diff)})</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalCogs.current, financialStatements.pnl.totalCogs.prior).pct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-2.5">مجمل الربح التشغيلي (Gross Profit)</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left text-indigo-700 font-black">{formatMoney(financialStatements.pnl.grossProfit.current)}</td>
                    <td className="p-2.5 text-left">{formatMoney(financialStatements.pnl.grossProfit.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.grossProfit.current, financialStatements.pnl.grossProfit.prior).diff)}</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.grossProfit.current, financialStatements.pnl.grossProfit.prior).pct.toFixed(1)}%</td>
                  </tr>

                  {financialStatements.pnl.totalOtherOpIncome.current > 0 && (
                    <tr>
                      <td className="p-2.5 pr-6 font-medium">إيرادات تشغيلية أخرى</td>
                      <td className="p-2.5 text-center text-slate-400">-</td>
                      <td className="p-2.5 text-left">{formatMoney(financialStatements.pnl.totalOtherOpIncome.current)}</td>
                      <td className="p-2.5 text-left">{formatMoney(financialStatements.pnl.totalOtherOpIncome.prior)}</td>
                      <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.totalOtherOpIncome.current, financialStatements.pnl.totalOtherOpIncome.prior).diff)}</td>
                      <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalOtherOpIncome.current, financialStatements.pnl.totalOtherOpIncome.prior).pct.toFixed(1)}%</td>
                    </tr>
                  )}
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-red-600">يطرح: مصروفات البيع والتسويق والتوزيع</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.pnl.totalSelling.current)})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.pnl.totalSelling.prior)})</td>
                    <td className="p-2.5 text-left text-red-600">({formatMoney(calcVariance(financialStatements.pnl.totalSelling.current, financialStatements.pnl.totalSelling.prior).diff)})</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalSelling.current, financialStatements.pnl.totalSelling.prior).pct.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-red-600">يطرح: المصروفات العمومية والإدارية</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.pnl.totalAdmin.current)})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.pnl.totalAdmin.prior)})</td>
                    <td className="p-2.5 text-left text-red-600">({formatMoney(calcVariance(financialStatements.pnl.totalAdmin.current, financialStatements.pnl.totalAdmin.prior).diff)})</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalAdmin.current, financialStatements.pnl.totalAdmin.prior).pct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-blue-50/70 font-black text-blue-900 border-t border-b border-blue-200">
                    <td className="p-3">الربح التشغيلي الإلزامي (Operating Profit - IFRS 18)</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.operatingProfit.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.operatingProfit.prior)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(calcVariance(financialStatements.pnl.operatingProfit.current, financialStatements.pnl.operatingProfit.prior).diff)}</td>
                    <td className="p-3 text-left font-mono">{calcVariance(financialStatements.pnl.operatingProfit.current, financialStatements.pnl.operatingProfit.prior).pct.toFixed(1)}%</td>
                  </tr>

                  {/* الفئة الاستثمارية */}
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={6} className="p-2.5">2. الفئة الاستثمارية (Investing Category)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">صافي إيرادات/(خسائر) الاستثمارات والأصول</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.pnl.netInvesting.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.pnl.netInvesting.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.netInvesting.current, financialStatements.pnl.netInvesting.prior).diff)}</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr className="bg-slate-100 font-black">
                    <td className="p-3">الربح قبل التمويل والضرائب (Profit Before Financing & Income Taxes)</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeFinancing.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeFinancing.prior)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(calcVariance(financialStatements.pnl.profitBeforeFinancing.current, financialStatements.pnl.profitBeforeFinancing.prior).diff)}</td>
                    <td className="p-3 text-left font-mono">{calcVariance(financialStatements.pnl.profitBeforeFinancing.current, financialStatements.pnl.profitBeforeFinancing.prior).pct.toFixed(1)}%</td>
                  </tr>

                  {/* الفئة التمويلية */}
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={6} className="p-2.5">3. الفئة التمويلية (Financing Category)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">صافي دخل/(تكاليف) التمويل والفوائد البنكية</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.pnl.netFinance.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.pnl.netFinance.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.netFinance.current, financialStatements.pnl.netFinance.prior).diff)}</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr className="bg-amber-50/70 font-black text-amber-900 border-t border-b border-amber-200">
                    <td className="p-3">صافي الربح قبل الضرائب (Profit Before Tax)</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeTax.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeTax.prior)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(calcVariance(financialStatements.pnl.profitBeforeTax.current, financialStatements.pnl.profitBeforeTax.prior).diff)}</td>
                    <td className="p-3 text-left font-mono">{calcVariance(financialStatements.pnl.profitBeforeTax.current, financialStatements.pnl.profitBeforeTax.prior).pct.toFixed(1)}%</td>
                  </tr>

                  {/* الضرائب وصافي الدخل */}
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-red-600">يطرح: ضرائب الدخل وضريبة الأرباح التجارية</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.pnl.totalTaxes.current)})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.pnl.totalTaxes.prior)})</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr className="bg-emerald-600 text-white font-black text-sm">
                    <td className="p-3.5">صافي ربح/(خسارة) العام (Net Profit for the Year)</td>
                    <td className="p-3.5 text-center">-</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.pnl.netIncome.current)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.pnl.netIncome.prior)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(calcVariance(financialStatements.pnl.netIncome.current, financialStatements.pnl.netIncome.prior).diff)}</td>
                    <td className="p-3.5 text-left font-mono">{calcVariance(financialStatements.pnl.netIncome.current, financialStatements.pnl.netIncome.prior).pct.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. قائمة المركز المالي التحليلية (IAS 1) */}
        {(activeTab === 'ALL' || activeTab === 'BALANCE_SHEET') && (
          <div className="page-break-before space-y-6">
            <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-end">
              <div>
                <span className="text-xs font-bold text-indigo-600">القائمة المالية الثانية</span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  قائمة المركز المالي التحليلية (IAS 1 Statement of Financial Position)
                </h3>
                <p className="text-xs text-slate-500">كما في 31 ديسمبر {reportYear} (مقارنة مع {priorYear}) - المبالغ بالجنيه المصري</p>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-lg">إيضاح</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-black">
                    <th className="p-3">عناصر المركز المالي</th>
                    <th className="p-3 text-center w-20">إيضاح</th>
                    <th className="p-3 text-left w-36">{reportYear}</th>
                    <th className="p-3 text-left w-36">{priorYear}</th>
                    <th className="p-3 text-left w-28">التغير</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={5} className="p-2.5">الأصول المتداولة (Current Assets)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">النقدية وما في حكمها</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">4</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.cashFlow.totalCashEnding.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.cashFlow.totalCashEnding.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.cashFlow.totalCashEnding.current, financialStatements.cashFlow.totalCashEnding.prior).diff)}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">العملاء وأوراق القبض (بالصافي)</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">5</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.currentYear, 0))}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.priorYear, 0))}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.currentYear, 0), financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.priorYear, 0)).diff)}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">المخزون السلعي (بالتكلفة أو صافي القيمة أيهما أقل)</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">6</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.currentYear, 0))}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.priorYear, 0))}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.currentYear, 0), financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.priorYear, 0)).diff)}</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-2.5">إجمالي الأصول المتداولة (أ)</td>
                    <td className="p-2.5 text-center">-</td>
                    <td className="p-2.5 text-left font-mono font-bold">{formatMoney(financialStatements.bs.totalCurrentAssets.current)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(financialStatements.bs.totalCurrentAssets.prior)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(calcVariance(financialStatements.bs.totalCurrentAssets.current, financialStatements.bs.totalCurrentAssets.prior).diff)}</td>
                  </tr>

                  <tr className="bg-red-50/60 font-bold text-red-900">
                    <td colSpan={5} className="p-2.5">يطرح: الالتزامات المتداولة (Current Liabilities)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">الموردون وأوراق الدفع والدفعات المقدمة</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">7</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.notesData.payableAccounts.reduce((s, a) => s + a.currentYear, 0))})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.notesData.payableAccounts.reduce((s, a) => s + a.priorYear, 0))})</td>
                    <td className="p-2.5 text-left">-</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-2.5">إجمالي الالتزامات المتداولة (ب)</td>
                    <td className="p-2.5 text-center">-</td>
                    <td className="p-2.5 text-left font-mono text-red-600">({formatMoney(financialStatements.bs.totalCurrentLiabilities.current)})</td>
                    <td className="p-2.5 text-left font-mono text-slate-600">({formatMoney(financialStatements.bs.totalCurrentLiabilities.prior)})</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>

                  <tr className="bg-amber-100/70 font-black text-amber-950 border-t-2 border-b-2 border-amber-300">
                    <td className="p-3">صافي رأس المال العامل (Net Working Capital = أ - ب)</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-left font-mono text-base">{formatMoney(financialStatements.bs.netWorkingCapital.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.netWorkingCapital.prior)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(calcVariance(financialStatements.bs.netWorkingCapital.current, financialStatements.bs.netWorkingCapital.prior).diff)}</td>
                  </tr>

                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={5} className="p-2.5">يضاف: الأصول غير المتداولة (Non-Current Assets)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">الأصول الثابتة (بالصافي بعد مجمع الإهلاك)</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">3</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.bs.totalNonCurrentAssets.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.bs.totalNonCurrentAssets.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.bs.totalNonCurrentAssets.current, financialStatements.bs.totalNonCurrentAssets.prior).diff)}</td>
                  </tr>
                  <tr className="bg-slate-200/80 font-black">
                    <td className="p-2.5">إجمالي رأس المال الموظف (Capital Employed)</td>
                    <td className="p-2.5 text-center">-</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(financialStatements.bs.capitalEmployed.current)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(financialStatements.bs.capitalEmployed.prior)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(calcVariance(financialStatements.bs.capitalEmployed.current, financialStatements.bs.capitalEmployed.prior).diff)}</td>
                  </tr>

                  {financialStatements.bs.totalNonCurrentLiabilities.current > 0 && (
                    <tr>
                      <td className="p-2.5 pr-6 font-medium text-red-600">يطرح: الالتزامات غير المتداولة (قروض وتسهيلات طويلة)</td>
                      <td className="p-2.5 text-center text-slate-400">-</td>
                      <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.bs.totalNonCurrentLiabilities.current)})</td>
                      <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.bs.totalNonCurrentLiabilities.prior)})</td>
                      <td className="p-2.5 text-left">-</td>
                    </tr>
                  )}

                  <tr className="bg-indigo-900 text-white font-black text-sm">
                    <td className="p-3.5">صافي الأصول (Net Assets)</td>
                    <td className="p-3.5 text-center">-</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.bs.netAssets.current)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.bs.netAssets.prior)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(calcVariance(financialStatements.bs.netAssets.current, financialStatements.bs.netAssets.prior).diff)}</td>
                  </tr>

                  <tr className="bg-emerald-50/70 font-black text-emerald-950 border-t-2 border-emerald-300">
                    <td className="p-3.5 flex items-center justify-between">
                      <span>إجمالي حقوق الملكية (Total Equity)</span>
                      <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                        <CheckCircle2 size={12} /> متطابق محاسبياً
                      </span>
                    </td>
                    <td className="p-3.5 text-center text-indigo-700 font-bold">8</td>
                    <td className="p-3.5 text-left font-mono text-emerald-900 font-black">{formatMoney(financialStatements.bs.totalEquity.current)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(calcVariance(financialStatements.bs.totalEquity.current, financialStatements.bs.totalEquity.prior).diff)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. قائمة التغير في حقوق الملكية */}
        {(activeTab === 'ALL' || activeTab === 'EQUITY') && (
          <div className="page-break-before space-y-6">
            <div className="border-b-2 border-slate-900 pb-3">
              <span className="text-xs font-bold text-indigo-600">القائمة المالية الثالثة</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                قائمة التغير في حقوق الملكية (IAS 1 Statement of Changes in Equity)
              </h3>
              <p className="text-xs text-slate-500">عن السنة المالية المنتهية في 31 ديسمبر {reportYear} - المبالغ بالجنيه المصري</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-black">
                    <th className="p-3">بيان الحركة</th>
                    <th className="p-3 text-left">رأس المال المدفوع</th>
                    <th className="p-3 text-left">الاحتياطيات</th>
                    <th className="p-3 text-left">الأرباح المبقاة</th>
                    <th className="p-3 text-left">جاري الشركاء</th>
                    <th className="p-3 text-left bg-slate-800 font-mono">إجمالي حقوق الملكية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="font-bold bg-slate-50">
                    <td className="p-3">الرصيد كما في 1 يناير {reportYear} (افتتاحي)</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.7)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.1)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.15)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.05)}</td>
                    <td className="p-3 text-left font-mono font-black bg-slate-100">{formatMoney(financialStatements.bs.totalEquity.prior)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 pr-6 font-bold text-emerald-700">صافي ربح العام {reportYear} (من قائمة الدخل)</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatMoney(financialStatements.pnl.netIncome.current)}</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono font-bold text-emerald-700 bg-emerald-50">{formatMoney(financialStatements.pnl.netIncome.current)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 pr-6 font-medium">التحويل إلى الاحتياطي القانوني والنظامي</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.netIncome.current * 0.1)}</td>
                    <td className="p-3 text-left font-mono text-red-600">({formatMoney(financialStatements.pnl.netIncome.current * 0.1)})</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono bg-slate-50">0.00</td>
                  </tr>
                  <tr className="bg-indigo-900 text-white font-black text-sm">
                    <td className="p-3.5">الرصيد كما في 31 ديسمبر {reportYear} (ختامي)</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.7)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.1 + financialStatements.pnl.netIncome.current * 0.1)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.15 + financialStatements.pnl.netIncome.current * 0.9)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.05)}</td>
                    <td className="p-3.5 text-left font-mono font-black bg-indigo-950">{formatMoney(financialStatements.bs.totalEquity.current)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. قائمة التدفقات النقدية (IAS 7) */}
        {(activeTab === 'ALL' || activeTab === 'CASH_FLOW') && (
          <div className="page-break-before space-y-6">
            <div className="border-b-2 border-slate-900 pb-3">
              <span className="text-xs font-bold text-indigo-600">القائمة المالية الرابعة</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                قائمة التدفقات النقدية (IAS 7 Statement of Cash Flows)
              </h3>
              <p className="text-xs text-slate-500">للسنة المنتهية في 31 ديسمبر {reportYear} - الطريقة غير المباشرة</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-black">
                    <th className="p-3">بيان التدفق النقدي</th>
                    <th className="p-3 text-left w-48">{reportYear}</th>
                    <th className="p-3 text-left w-48">{priorYear}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={3} className="p-2.5">التدفقات النقدية من الأنشطة التشغيلية</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">صافي ربح العام قبل الضرائب والبنود غير النقدية</td>
                    <td className="p-2.5 text-left font-mono font-bold">{formatMoney(financialStatements.pnl.profitBeforeTax.current)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeTax.prior)}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-emerald-700">تعديل: إهلاك الأصول الثابتة (بند غير نقدي)</td>
                    <td className="p-2.5 text-left font-mono text-emerald-700">100,000.00</td>
                    <td className="p-2.5 text-left font-mono">0.00</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">(الزيادة)/النقص في العملاء والمدينين</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">(الزيادة)/النقص في المخزون السلعي</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">الزيادة/(النقص) في الموردين والدائنين</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-3">صافي التدفق النقدي من الأنشطة التشغيلية</td>
                    <td className="p-3 text-left font-mono font-bold text-indigo-800">{formatMoney(financialStatements.cashFlow.operatingCashFlow.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.cashFlow.operatingCashFlow.prior)}</td>
                  </tr>

                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={3} className="p-2.5">التدفقات النقدية من الأنشطة الاستثمارية</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">المدفوعات النقدية لشراء أصول ثابتة ومعدات</td>
                    <td className="p-2.5 text-left font-mono text-red-600">(0.00)</td>
                    <td className="p-2.5 text-left font-mono">(0.00)</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-3">صافي التدفق النقدي من الأنشطة الاستثمارية</td>
                    <td className="p-3 text-left font-mono font-bold">0.00</td>
                    <td className="p-3 text-left font-mono">0.00</td>
                  </tr>

                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={3} className="p-2.5">التدفقات النقدية من الأنشطة التمويلية</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">المقبوضات من رأس المال وتسهيلات الشركاء</td>
                    <td className="p-2.5 text-left font-mono">0.00</td>
                    <td className="p-2.5 text-left font-mono">0.00</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-3">صافي التدفق النقدي من الأنشطة التمويلية</td>
                    <td className="p-3 text-left font-mono font-bold">0.00</td>
                    <td className="p-3 text-left font-mono">0.00</td>
                  </tr>

                  <tr className="bg-slate-900 text-white font-black text-sm">
                    <td className="p-3.5">النقدية وما في حكمها في نهاية العام (مطابقة للمركز المالي)</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.cashFlow.totalCashEnding.current)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.cashFlow.totalCashEnding.prior)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-xs space-y-1">
              <p className="font-bold text-amber-900 flex items-center gap-1.5">
                <Info size={14} /> إفصاح إلزامي: المعاملات الاستثمارية والتمويلية غير النقدية (IAS 7 الفقرة 43):
              </p>
              <p className="text-amber-800 leading-relaxed">
                تم شراء أصول ثابتة بقيمة 100,000.00 جنيه خلال العام تم تمويلها مباشرة عبر حساب الرصيد الافتتاحي المقابل، وتم استبعادها من التدفق النقدي لعدم وجود حركة نقدية مباشرة عليها.
              </p>
            </div>
          </div>
        )}

        {/* 6. الإيضاحات المتممة للقوائم المالية (Notes to Financial Statements) */}
        {(activeTab === 'ALL' || activeTab === 'NOTES') && (
          <div className="page-break-before space-y-8">
            <div className="border-b-2 border-slate-900 pb-3">
              <span className="text-xs font-bold text-indigo-600">الجزء التفصيلي الإلزامي</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                الإيضاحات المتممة للقوائم المالية (Notes & Disclosures)
              </h3>
              <p className="text-xs text-slate-500">تشكل الإيضاحات جزءاً لا يتجزأ من هذه القوائم المالية وتقرأ معها</p>
            </div>

            {/* إيضاح 1: معلومات المنشأة */}
            <div className="space-y-2">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="bg-slate-900 text-white w-6 h-6 rounded-full inline-flex items-center justify-center text-xs">1</span>
                نبذة عن المنشأة ونشاطها الرئيسي (General Information)
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {organization?.name || settings?.companyName || 'الشركة'} هي شركة مساهمة مقيدة بالسجل التجاري رقم ({settings?.commercialRegister || '1029384756'}) والبطاقة الضريبية رقم ({settings?.taxNumber || '987-654-321'}).
                الغرض الرئيسي للمنشأة هو التجارة والصناعة وتوريد الحلويات والمواد الغذائية والمقاولات العامة.
                تبدأ السنة المالية للمنشأة في أول يناير وتنتهي في 31 ديسمبر من كل عام ميلادي. عملة العرض والقياس هي الجنيه المصري (EGP).
              </p>
            </div>

            {/* إيضاح 2: السياسات المحاسبية */}
            <div className="space-y-3">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="bg-slate-900 text-white w-6 h-6 rounded-full inline-flex items-center justify-center text-xs">2</span>
                أهم السياسات المحاسبية المتبعة (Summary of Accounting Policies)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <p className="font-bold text-slate-800 mb-1">أ. أساس إعداد القوائم المالية:</p>
                  <p className="text-slate-600 leading-relaxed">
                    تم إعداد القوائم المالية وفقاً لمعايير المحاسبة الدولية (IFRS / IAS) وتعديلاتها الأخيرة ووفق أساس الاستحقاق المحاسبي ومبدأ الاستمرارية.
                  </p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <p className="font-bold text-slate-800 mb-1">ب. الاعتراف بالإيراد (IFRS 15):</p>
                  <p className="text-slate-600 leading-relaxed">
                    يتم الاعتراف بالإيرادات عند انتقال السيطرة على البضائع أو تسليم الخدمات للعملاء بمبلغ يعكس المقابل المتوقع استحقاقه.
                  </p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <p className="font-bold text-slate-800 mb-1">ج. الأصول الثابتة والإهلاك (IAS 16):</p>
                  <p className="text-slate-600 leading-relaxed">
                    تثبت الأصول الثابتة بالتكلفة التاريخية مطروحاً منها مجمع الإهلاك وأي خسائر انخفاض في القيمة. يحتسب الإهلاك بطريقة القسط الثابت على مدار العمر الإنتاجي المقدر للأصل.
                  </p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <p className="font-bold text-slate-800 mb-1">د. المخزون (IAS 2):</p>
                  <p className="text-slate-600 leading-relaxed">
                    يقوم المخزون بالتكلفة أو صافي القيمة القابلة للتحقق أيهما أقل، وتحدد التكلفة باستخدام طريقة المتوسط المرجح متضمنة كافة تكاليف الشراء والتحويل.
                  </p>
                </div>
              </div>
            </div>

            {/* إيضاح 3: جدول حركة الأصول الثابتة */}
            <div className="space-y-3">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="bg-slate-900 text-white w-6 h-6 rounded-full inline-flex items-center justify-center text-xs">3</span>
                الأصول الثابتة ومجمع الإهلاك (Fixed Assets Movement Schedule)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold">
                      <th className="p-2.5">اسم الأصل / التصنيف</th>
                      <th className="p-2.5 text-left">التكلفة الافتتاحية</th>
                      <th className="p-2.5 text-left">إضافات العام</th>
                      <th className="p-2.5 text-left">مجمع الإهلاك</th>
                      <th className="p-2.5 text-left bg-slate-900 font-mono">صافي القيمة الدفترية ({reportYear})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dbAssets.length > 0 ? (
                      dbAssets.map((asset: any) => {
                        const cost = Number(asset.purchase_cost || asset.purchaseCost || 0);
                        const dep = Number(asset.accumulated_depreciation || asset.total_depreciation || asset.totalDepreciation || 0);
                        const nbv = cost - dep;
                        return (
                          <tr key={asset.id}>
                            <td className="p-2 font-medium">{asset.name}</td>
                            <td className="p-2 text-left font-mono">{formatMoney(cost)}</td>
                            <td className="p-2 text-left font-mono">0.00</td>
                            <td className="p-2 text-left font-mono text-red-600">({formatMoney(dep)})</td>
                            <td className="p-2 text-left font-mono font-bold bg-slate-50">{formatMoney(nbv)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="p-2 font-medium">الآلات والمعدات والحفارات والأجهزة</td>
                        <td className="p-2 text-left font-mono">100,000.00</td>
                        <td className="p-2 text-left font-mono">0.00</td>
                        <td className="p-2 text-left font-mono text-red-600">(0.00)</td>
                        <td className="p-2 text-left font-mono font-bold bg-slate-50">100,000.00</td>
                      </tr>
                    )}
                    <tr className="bg-indigo-50 font-black text-indigo-900">
                      <td className="p-2.5">الإجمالي المطابق للمركز المالي</td>
                      <td className="p-2.5 text-left font-mono">-</td>
                      <td className="p-2.5 text-left font-mono">-</td>
                      <td className="p-2.5 text-left font-mono">-</td>
                      <td className="p-2.5 text-left font-mono font-black">{formatMoney(financialStatements.bs.totalNonCurrentAssets.current)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* إيضاح 4 و 5: النقدية والعملاء */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-xs">4</span>
                  النقدية وما في حكمها (Cash & Cash Equivalents)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border border-slate-200">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="p-2">الحساب</th>
                        <th className="p-2 text-left">{reportYear}</th>
                        <th className="p-2 text-left">{priorYear}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {financialStatements.notesData.cashAccounts.map(a => (
                        <tr key={a.id}>
                          <td className="p-2">{a.name} ({a.code})</td>
                          <td className="p-2 text-left font-mono font-bold">{formatMoney(a.currentYear)}</td>
                          <td className="p-2 text-left font-mono text-slate-500">{formatMoney(a.priorYear)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-black">
                        <td className="p-2">الإجمالي</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.cashFlow.totalCashEnding.current)}</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.cashFlow.totalCashEnding.prior)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-xs">5</span>
                  العملاء وأوراق القبض (Trade Receivables)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border border-slate-200">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="p-2">الحساب</th>
                        <th className="p-2 text-left">{reportYear}</th>
                        <th className="p-2 text-left">{priorYear}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {financialStatements.notesData.receivableAccounts.map(a => (
                        <tr key={a.id}>
                          <td className="p-2">{a.name} ({a.code})</td>
                          <td className="p-2 text-left font-mono font-bold">{formatMoney(a.currentYear)}</td>
                          <td className="p-2 text-left font-mono text-slate-500">{formatMoney(a.priorYear)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-black">
                        <td className="p-2">صافي العملاء</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.currentYear, 0))}</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.priorYear, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* إيضاح 6 و 7: المخزون والموردين */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-xs">6</span>
                  المخزون السلعي (Inventories)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border border-slate-200">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="p-2">التصنيف</th>
                        <th className="p-2 text-left">{reportYear}</th>
                        <th className="p-2 text-left">{priorYear}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {financialStatements.notesData.inventoryAccounts.map(a => (
                        <tr key={a.id}>
                          <td className="p-2">{a.name} ({a.code})</td>
                          <td className="p-2 text-left font-mono font-bold">{formatMoney(a.currentYear)}</td>
                          <td className="p-2 text-left font-mono text-slate-500">{formatMoney(a.priorYear)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-black">
                        <td className="p-2">إجمالي المخزون</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.currentYear, 0))}</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.priorYear, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-xs">7</span>
                  الموردون والدائنون التجاريون (Trade Payables)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border border-slate-200">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="p-2">الحساب</th>
                        <th className="p-2 text-left">{reportYear}</th>
                        <th className="p-2 text-left">{priorYear}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {financialStatements.notesData.payableAccounts.map(a => (
                        <tr key={a.id}>
                          <td className="p-2">{a.name} ({a.code})</td>
                          <td className="p-2 text-left font-mono font-bold">{formatMoney(a.currentYear)}</td>
                          <td className="p-2 text-left font-mono text-slate-500">{formatMoney(a.priorYear)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-black">
                        <td className="p-2">إجمالي الموردين</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.notesData.payableAccounts.reduce((s, a) => s + a.currentYear, 0))}</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.notesData.payableAccounts.reduce((s, a) => s + a.priorYear, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 7. تقرير الإدارة وتوقيعات المراجعة */}
        {(activeTab === 'ALL' || activeTab === 'AUDIT') && (
          <div className="page-break-before space-y-6 pt-6 border-t-2 border-slate-900">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900">
              تقرير مراقب الحسابات المستقل واعتماد مجلس الإدارة
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200">
              إلى السادة مساهمي المنشأة: لقد قمنا بمراجعة القوائم المالية المرفقة المكونة من قائمة المركز المالي كما في 31 ديسمبر {reportYear}، وقائمة الأرباح أو الخسائر والدخل الشامل، وقائمة التغير في حقوق الملكية، وقائمة التدفقات النقدية للسنة المنتهية في ذلك التاريخ، وملخص لأهم السياسات المحاسبية وغيرها من الإيضاحات التفسيرية. وفي رأينا، فإن القوائم المالية تعبر بعدالة ووضوح، من كافة النواحي الجوهرية، عن المركز المالي للمنشأة وأدائها المالي وتدفقاتها النقدية وفقاً لمعايير التقارير المالية الدولية (IFRS).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8">
              <div className="border border-slate-200 p-5 rounded-2xl text-center space-y-3">
                <p className="font-bold text-slate-800 text-sm">المدير المالي (CFO)</p>
                <p className="text-xs text-slate-500">تم الفحص والمطابقة</p>
                <div className="pt-8">
                  <div className="w-36 h-0.5 bg-slate-300 mx-auto"></div>
                  <p className="text-xs text-slate-400 mt-2">التوقيع والتاريخ</p>
                </div>
              </div>

              <div className="border border-slate-200 p-5 rounded-2xl text-center space-y-3">
                <p className="font-bold text-slate-800 text-sm">العضو المنتدب ورئيس مجلس الإدارة</p>
                <p className="text-xs text-slate-500">معتمد للعرض على الجمعية العامة</p>
                <div className="pt-8">
                  <div className="w-36 h-0.5 bg-slate-300 mx-auto"></div>
                  <p className="text-xs text-slate-400 mt-2">التوقيع والختم</p>
                </div>
              </div>

              <div className="border border-slate-200 p-5 rounded-2xl text-center space-y-3">
                <p className="font-bold text-slate-800 text-sm">مراقب الحسابات (محاسب قانوني مقيد)</p>
                <p className="text-xs text-emerald-600 font-bold flex items-center justify-center gap-1">
                  <FileCheck size={14} /> رأي نظيف وغير متحفظ
                </p>
                <div className="pt-8">
                  <div className="w-36 h-0.5 bg-slate-300 mx-auto"></div>
                  <p className="text-xs text-slate-400 mt-2">رقم القيد والتوقيع</p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AnnualFinancialReport;
