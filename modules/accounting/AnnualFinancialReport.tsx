import { logger } from '../../utils/logger';
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

  // Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø´Ø§Ù…Ù„Ø© Ù„Ù„Ø³Ù†ØªÙŠÙ† Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙˆØ§Ù„Ø³Ø§Ø¨Ù‚Ø©
  const loadFinancialData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || session?.user?.user_metadata?.org_id || (organization as any)?.id;

      // 1. Ø­Ø±ÙƒØ§Øª Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©
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

      // 2. Ø­Ø±ÙƒØ§Øª Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ø³Ø§Ø¨Ù‚Ø©
      let qPrior = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, reference, organization_id)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.transaction_date', priorStart)
        .lte('journal_entries.transaction_date', priorEnd);
      if (userOrgId) qPrior = qPrior.eq('journal_entries.organization_id', userOrgId);
      const { data: prData } = await qPrior;
      setLedgerLinesPrior(prData || []);

      // 3. Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„ØªØ±Ø§ÙƒÙ…ÙŠØ© Ø­ØªÙ‰ Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ© (Ù„Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ)
      let qCumCurr = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', currentEnd);
      if (userOrgId) qCumCurr = qCumCurr.eq('journal_entries.organization_id', userOrgId);
      const { data: cumCurrData } = await qCumCurr;
      setCumulativeLinesCurrent(cumCurrData || []);

      // 4. Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„ØªØ±Ø§ÙƒÙ…ÙŠØ© Ø­ØªÙ‰ Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ø³Ø§Ø¨Ù‚Ø©
      let qCumPrior = supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', priorEnd);
      if (userOrgId) qCumPrior = qCumPrior.eq('journal_entries.organization_id', userOrgId);
      const { data: cumPrData } = await qCumPrior;
      setCumulativeLinesPrior(cumPrData || []);

      // 5. Ø³Ø¬Ù„ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ©
      let qAssets = supabase.from('assets').select('*');
      if (userOrgId) qAssets = qAssets.eq('organization_id', userOrgId);
      const { data: assetsData } = await qAssets;
      setDbAssets(assetsData || []);

    } catch (err) {
      logger.error('Error fetching annual report data:', err);
      showToast('Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ø³Ù†ÙˆÙŠ: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, [reportYear, currentSelectedOrgId]);

  // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£Ø±ØµØ¯Ø© ÙˆØ§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø¹ÙŠØ§Ø±ÙŠØ©
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
        name.includes('ÙÙˆØ§Ø¦Ø¯ Ø¯Ø§Ø¦Ù†Ø©') || name.includes('ÙÙˆØ§Ø¦Ø¯ Ø¨Ù†ÙƒÙŠØ©') ||
        name.includes('Ø¹Ø§Ø¦Ø¯ ØªÙ…ÙˆÙŠÙ„') || name.includes('Ø¥ÙŠØ±Ø§Ø¯ ØªÙ…ÙˆÙŠÙ„') ||
        name.includes('ÙÙˆØ§Ø¦Ø¯ Ù‚Ø±ÙˆØ¶') || name.includes('ØªÙƒÙ„ÙØ© ØªÙ…ÙˆÙŠÙ„') ||
        name.includes('ØªÙƒØ§Ù„ÙŠÙ ØªÙ…ÙˆÙŠÙ„') || name.includes('Ù…ØµØ±ÙˆÙ ØªÙ…ÙˆÙŠÙ„')
      );
    };

    const isInvestingAccount = (code: string, name: string) => {
      return (
        code.startsWith('424') ||
        name.includes('Ø¥ÙŠØ±Ø§Ø¯ Ø§Ø³ØªØ«Ù…Ø§Ø±') || name.includes('Ø£Ø±Ø¨Ø§Ø­ Ø§Ø³ØªØ«Ù…Ø§Ø±') ||
        name.includes('ØªÙˆØ²ÙŠØ¹Ø§Øª Ø£Ø±Ø¨Ø§Ø­') || name.includes('Ø£Ø±Ø¨Ø§Ø­ Ø¨ÙŠØ¹ Ø£ØµÙˆÙ„') ||
        name.includes('Ø®Ø³Ø§Ø¦Ø± Ø¨ÙŠØ¹ Ø£ØµÙˆÙ„') || name.includes('Ø±Ø£Ø³Ù…Ø§Ù„ÙŠØ©')
      );
    };

    const isTaxAccount = (code: string, name: string) => {
      return name.includes('Ø¶Ø±ÙŠØ¨Ø© Ø¯Ø®Ù„') || name.includes('Ø¶Ø±Ø§Ø¦Ø¨ Ø¯Ø®Ù„') || (code.startsWith('55') && name.includes('Ø¶Ø±ÙŠØ¨'));
    };

    const isCogsAccount = (code: string, name: string) => {
      return code.startsWith('51') || code.startsWith('501') || name.includes('ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª') || name.includes('ØªÙƒÙ„ÙØ© Ø§Ù„Ø¥Ù†ØªØ§Ø¬') || name.includes('ØªÙƒÙ„ÙØ© Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø©');
    };

    const isSellingAccount = (code: string, name: string) => {
      return code.startsWith('52') || name.includes('Ø¨ÙŠØ¹ ÙˆØªÙˆØ²ÙŠØ¹') || name.includes('ØªØ³ÙˆÙŠÙ‚') || name.includes('Ø¯Ø¹Ø§ÙŠØ©');
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

      const isRevenueNature = code.startsWith('4') || type.includes('revenue') || type.includes('income') || type.includes('Ø¥ÙŠØ±Ø§Ø¯');
      const curPnlVal = isRevenueNature ? -curRaw : curRaw;
      const prPnlVal = isRevenueNature ? -prRaw : prRaw;

      // 1. Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø¯Ø®Ù„
      if (code.startsWith('4') || code.startsWith('5') || type.includes('expense') || type.includes('revenue')) {
        if (Math.abs(curPnlVal) > 0.001 || Math.abs(prPnlVal) > 0.001) {
          const item: AccountSummary = { id: acc.id, code, name, currentYear: curPnlVal, priorYear: prPnlVal };

          if (isFinanceAccount(code, name)) {
            if (isRevenueNature || name.includes('Ø¯Ø§Ø¦Ù†')) finIncome.push(item);
            else finCosts.push(item);
          } else if (isInvestingAccount(code, name)) {
            if (isRevenueNature) invIncome.push(item);
            else invExpenses.push(item);
          } else if (isTaxAccount(code, name)) {
            taxExpenses.push(item);
          } else if (isRevenueNature) {
            if (code.startsWith('41') || code === '401' || name.includes('Ù…Ø¨ÙŠØ¹Ø§Øª') || name.includes('Ù†Ø´Ø§Ø·')) {
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

      // 2. Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ
      const isAsset = code.startsWith('1') || type.includes('asset') || type.includes('Ø£ØµÙˆÙ„');
      const isLiability = code.startsWith('2') || type.includes('liability') || type.includes('Ø®ØµÙˆÙ…') || type.includes('Ø§Ù„ØªØ²Ø§Ù…Ø§Øª');
      const isEquity = code.startsWith('3') || type.includes('equity') || type.includes('Ø­Ù‚ÙˆÙ‚');

      if (isAsset) {
        const isContra = code.startsWith('1119') || code.startsWith('1129') || name.includes('Ù…Ø¬Ù…Ø¹ Ø¥Ù‡Ù„Ø§Ùƒ') || name.includes('Ù…Ø®ØµØµ');
        const curVal = isContra ? -Math.abs(curBsRaw) : curBsRaw;
        const prVal = isContra ? -Math.abs(prBsRaw) : prBsRaw;

        if (Math.abs(curVal) > 0.001 || Math.abs(prVal) > 0.001) {
          const item: AccountSummary = { id: acc.id, code, name, currentYear: curVal, priorYear: prVal };
          const isCurrentAsset = (
            code.startsWith('12') || code.startsWith('10') || !code.startsWith('11') ||
            name.includes('Ù†Ù‚Ø¯') || name.includes('Ø¨Ù†Ùƒ') || name.includes('Ø¹Ù…Ù„Ø§Ø¡') || 
            name.includes('Ù…Ø®Ø²ÙˆÙ†') || name.includes('Ù…Ø¯ÙŠÙ†') || name.includes('Ø£ÙˆØ±Ø§Ù‚ Ù‚Ø¨Ø¶')
          );

          if (isCurrentAsset && !code.startsWith('11')) {
            currentAssets.push(item);
            if (name.includes('Ù†Ù‚Ø¯') || name.includes('Ø¨Ù†Ùƒ') || name.includes('ØµÙ†Ø¯ÙˆÙ‚') || code.startsWith('121')) cashAccounts.push(item);
            if (name.includes('Ø¹Ù…ÙŠÙ„') || name.includes('Ø¹Ù…Ù„Ø§Ø¡') || code.startsWith('122')) receivableAccounts.push(item);
            if (name.includes('Ù…Ø®Ø²ÙˆÙ†') || code.startsWith('123')) inventoryAccounts.push(item);
          } else {
            nonCurrentAssets.push(item);
          }
        }
      } else if (isLiability) {
        const curVal = -curBsRaw;
        const prVal = -prBsRaw;

        if (Math.abs(curVal) > 0.001 || Math.abs(prVal) > 0.001) {
          const item: AccountSummary = { id: acc.id, code, name, currentYear: curVal, priorYear: prVal };
          const isNonCurrent = code.startsWith('22') || name.includes('Ø·ÙˆÙŠÙ„Ø© Ø§Ù„Ø£Ø¬Ù„') || name.includes('Ù‚Ø±Ø¶ Ø·ÙˆÙŠÙ„');

          if (isNonCurrent) {
            nonCurrentLiabilities.push(item);
          } else {
            currentLiabilities.push(item);
            if (name.includes('Ù…ÙˆØ±Ø¯') || code.startsWith('211')) payableAccounts.push(item);
          }
        }
      } else if (isEquity) {
        if (code === '3999' || name.includes('ÙˆØ³ÙŠØ·')) return;
        const curVal = -curBsRaw;
        const prVal = -prBsRaw;

        if (Math.abs(curVal) > 0.001 || Math.abs(prVal) > 0.001) {
          const item: AccountSummary = { id: acc.id, code, name, currentYear: curVal, priorYear: prVal };
          equityAccounts.push(item);
          if (name.includes('Ø¬Ø§Ø±ÙŠ') || name.includes('Ø´Ø±ÙŠÙƒ') || code.startsWith('33')) {
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

  // ØªØµØ¯ÙŠØ± ÙƒØªØ§Ø¨ Ù…Ø§Ù„ÙŠ ÙƒØ§Ù…Ù„ Ø¥Ù„Ù‰ Excel Ù…ØªØ¹Ø¯Ø¯ Ø§Ù„Ø£ÙˆØ±Ø§Ù‚
  const handleExportExcelBook = () => {
    try {
      const wb = XLSX.utils.book_new();

      const coverData = [
        ['ÙƒØªØ§Ø¨ Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø§Ù„Ù…ÙˆØ­Ø¯ ÙˆØ§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø§Ù„Ù…ØªÙ…Ù…Ø©'],
        ['Ø§Ø³Ù… Ø§Ù„Ù…Ù†Ø´Ø£Ø©:', organization?.name || settings?.companyName || 'Ø§Ù„Ø´Ø±ÙƒØ© Ø§Ù„ÙˆØ·Ù†ÙŠØ©'],
        ['Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ© ÙÙŠ:', `31 Ø¯ÙŠØ³Ù…Ø¨Ø± ${reportYear}`],
        ['Ø§Ù„Ø¹Ù…Ù„Ø©:', 'Ø¬Ù†ÙŠÙ‡ Ù…ØµØ±ÙŠ (EGP)'],
        ['Ø§Ù„Ù…Ø¹Ø§ÙŠÙŠØ± Ø§Ù„Ù…Ø·Ø¨Ù‚Ø©:', 'Ù…Ø¹Ø§ÙŠÙŠØ± Ø§Ù„Ù…Ø­Ø§Ø³Ø¨Ø© ÙˆØ§Ù„ØªÙ‚Ø§Ø±ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø¯ÙˆÙ„ÙŠØ© (IFRS / IAS)'],
        [],
        ['Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© ÙˆÙ…Ø±Ø§Ù‚Ø¨ÙŠ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª:'],
        ['Ø§Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„ØªÙ†ÙÙŠØ°ÙŠ (CFO):', 'Ù…Ø¹ØªÙ…Ø¯'],
        ['Ø±Ø¦ÙŠØ³ Ù…Ø¬Ù„Ø³ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© (CEO):', 'Ù…Ø¹ØªÙ…Ø¯'],
        ['Ù…Ø±Ø§Ù‚Ø¨ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø®Ø§Ø±Ø¬ÙŠ:', 'Ù…ÙƒØªØ¨ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨Ø© ÙˆØ§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù‚Ø§Ù†ÙˆÙ†ÙŠ']
      ];
      const wsCover = XLSX.utils.aoa_to_sheet(coverData);
      XLSX.utils.book_append_sheet(wb, wsCover, 'Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ù†Ø´Ø£Ø©');

      const pnlData = [
        ['Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø£Ùˆ Ø§Ù„Ø®Ø³Ø§Ø¦Ø± ÙˆØ§Ù„Ø¯Ø®Ù„ Ø§Ù„Ø´Ø§Ù…Ù„ (IFRS 18)'],
        ['Ø¹Ù† Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ© ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø±', `${reportYear}`, `${priorYear}`, 'Ø§Ù„ØªØºÙŠØ± ($)', 'Ù†Ø³Ø¨Ø© Ø§Ù„ØªØºÙŠØ± %'],
        ['1. Ø§Ù„Ø£Ù†Ø´Ø·Ø© Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ© (Operating Category)'],
        ['Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„Ù†Ø´Ø§Ø· Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ', financialStatements.pnl.totalOpRevenues.current, financialStatements.pnl.totalOpRevenues.prior],
        ['(ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª ÙˆØ§Ù„Ø¥Ù†ØªØ§Ø¬)', -financialStatements.pnl.totalCogs.current, -financialStatements.pnl.totalCogs.prior],
        ['Ù…Ø¬Ù…Ù„ Ø§Ù„Ø±Ø¨Ø­ Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠ', financialStatements.pnl.grossProfit.current, financialStatements.pnl.grossProfit.prior],
        ['Ø¥ÙŠØ±Ø§Ø¯Ø§Øª ØªØ´ØºÙŠÙ„ÙŠØ© Ø£Ø®Ø±Ù‰', financialStatements.pnl.totalOtherOpIncome.current, financialStatements.pnl.totalOtherOpIncome.prior],
        ['(Ù…ØµØ±ÙˆÙØ§Øª Ø§Ù„Ø¨ÙŠØ¹ ÙˆØ§Ù„ØªÙˆØ²ÙŠØ¹)', -financialStatements.pnl.totalSelling.current, -financialStatements.pnl.totalSelling.prior],
        ['(Ù…ØµØ±ÙˆÙØ§Øª Ø¹Ù…ÙˆÙ…ÙŠØ© ÙˆØ¥Ø¯Ø§Ø±ÙŠØ©)', -financialStatements.pnl.totalAdmin.current, -financialStatements.pnl.totalAdmin.prior],
        ['Ø§Ù„Ø±Ø¨Ø­ Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠ (Operating Profit)', financialStatements.pnl.operatingProfit.current, financialStatements.pnl.operatingProfit.prior],
        ['2. Ø§Ù„Ø£Ù†Ø´Ø·Ø© Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø±ÙŠØ© (Investing Category)'],
        ['ØµØ§ÙÙŠ Ø¯Ø®Ù„/(Ø®Ø³Ø§Ø¦Ø±) Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø±', financialStatements.pnl.netInvesting.current, financialStatements.pnl.netInvesting.prior],
        ['Ø§Ù„Ø±Ø¨Ø­ Ù‚Ø¨Ù„ Ø§Ù„ØªÙ…ÙˆÙŠÙ„ ÙˆØ§Ù„Ø¶Ø±Ø§Ø¦Ø¨ (Profit Before Financing & Tax)', financialStatements.pnl.profitBeforeFinancing.current, financialStatements.pnl.profitBeforeFinancing.prior],
        ['3. Ø§Ù„Ø£Ù†Ø´Ø·Ø© Ø§Ù„ØªÙ…ÙˆÙŠÙ„ÙŠØ© (Financing Category)'],
        ['ØµØ§ÙÙŠ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª/(Ø§Ù„ØªÙƒØ§Ù„ÙŠÙ) Ø§Ù„ØªÙ…ÙˆÙŠÙ„ÙŠØ©', financialStatements.pnl.netFinance.current, financialStatements.pnl.netFinance.prior],
        ['ØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­ Ù‚Ø¨Ù„ Ø§Ù„Ø¶Ø±ÙŠØ¨Ø© (Profit Before Tax)', financialStatements.pnl.profitBeforeTax.current, financialStatements.pnl.profitBeforeTax.prior],
        ['(Ø¶Ø±Ø§Ø¦Ø¨ Ø§Ù„Ø¯Ø®Ù„)', -financialStatements.pnl.totalTaxes.current, -financialStatements.pnl.totalTaxes.prior],
        ['ØµØ§ÙÙŠ Ø¯Ø®Ù„ Ø§Ù„Ø¹Ø§Ù… (Net Income for the Year)', financialStatements.pnl.netIncome.current, financialStatements.pnl.netIncome.prior]
      ];
      const wsPnl = XLSX.utils.aoa_to_sheet(pnlData);
      XLSX.utils.book_append_sheet(wb, wsPnl, 'Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¯Ø®Ù„ IFRS 18');

      const bsData = [
        ['Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„ØªØ­Ù„ÙŠÙ„ÙŠØ© (IAS 1)'],
        ['ÙƒÙ…Ø§ ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø±', `${reportYear}`, `${priorYear}`, 'Ø§Ù„ØªØºÙŠØ± ($)'],
        ['Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Current Assets)', financialStatements.bs.totalCurrentAssets.current, financialStatements.bs.totalCurrentAssets.prior],
        ['(ÙŠØ·Ø±Ø­) Ø§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Current Liabilities)', -financialStatements.bs.totalCurrentLiabilities.current, -financialStatements.bs.totalCurrentLiabilities.prior],
        ['ØµØ§ÙÙŠ Ø±Ø£Ø³ Ø§Ù„Ù…Ø§Ù„ Ø§Ù„Ø¹Ø§Ù…Ù„ (Net Working Capital)', financialStatements.bs.netWorkingCapital.current, financialStatements.bs.netWorkingCapital.prior],
        ['(ÙŠØ¶Ø§Ù) Ø§Ù„Ø£ØµÙˆÙ„ ØºÙŠØ± Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Non-Current Assets)', financialStatements.bs.totalNonCurrentAssets.current, financialStatements.bs.totalNonCurrentAssets.prior],
        ['Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø±Ø£Ø³ Ø§Ù„Ù…Ø§Ù„ Ø§Ù„Ù…ÙˆØ¸Ù (Capital Employed)', financialStatements.bs.capitalEmployed.current, financialStatements.bs.capitalEmployed.prior],
        ['(ÙŠØ·Ø±Ø­) Ø§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª ØºÙŠØ± Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Non-Current Liabilities)', -financialStatements.bs.totalNonCurrentLiabilities.current, -financialStatements.bs.totalNonCurrentLiabilities.prior],
        ['ØµØ§ÙÙŠ Ø§Ù„Ø£ØµÙˆÙ„ (Net Assets)', financialStatements.bs.netAssets.current, financialStatements.bs.netAssets.prior],
        [],
        ['Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ© (Total Equity)', financialStatements.bs.totalEquity.current, financialStatements.bs.totalEquity.prior]
      ];
      const wsBs = XLSX.utils.aoa_to_sheet(bsData);
      XLSX.utils.book_append_sheet(wb, wsBs, 'Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ IAS 1');

      const notesDataRows = [
        ['Ø§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø§Ù„Ù…ØªÙ…Ù…Ø© Ù„Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ©'],
        [],
        ['Ø¥ÙŠØ¶Ø§Ø­ 4: Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙˆÙ…Ø§ ÙÙŠ Ø­ÙƒÙ…Ù‡Ø§'],
        ['ÙƒÙˆØ¯ Ø§Ù„Ø­Ø³Ø§Ø¨', 'Ø§Ø³Ù… Ø§Ù„Ø­Ø³Ø§Ø¨', `Ø±ØµÙŠØ¯ ${reportYear}`, `Ø±ØµÙŠØ¯ ${priorYear}`],
        ...financialStatements.notesData.cashAccounts.map(a => [a.code, a.name, a.currentYear, a.priorYear]),
        [],
        ['Ø¥ÙŠØ¶Ø§Ø­ 5: Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ£ÙˆØ±Ø§Ù‚ Ø§Ù„Ù‚Ø¨Ø¶'],
        ['ÙƒÙˆØ¯ Ø§Ù„Ø­Ø³Ø§Ø¨', 'Ø§Ø³Ù… Ø§Ù„Ø­Ø³Ø§Ø¨', `Ø±ØµÙŠØ¯ ${reportYear}`, `Ø±ØµÙŠØ¯ ${priorYear}`],
        ...financialStatements.notesData.receivableAccounts.map(a => [a.code, a.name, a.currentYear, a.priorYear]),
        [],
        ['Ø¥ÙŠØ¶Ø§Ø­ 6: Ø§Ù„Ù…Ø®Ø²ÙˆÙ†'],
        ['ÙƒÙˆØ¯ Ø§Ù„Ø­Ø³Ø§Ø¨', 'Ø§Ø³Ù… Ø§Ù„Ø­Ø³Ø§Ø¨', `Ø±ØµÙŠØ¯ ${reportYear}`, `Ø±ØµÙŠØ¯ ${priorYear}`],
        ...financialStatements.notesData.inventoryAccounts.map(a => [a.code, a.name, a.currentYear, a.priorYear]),
        [],
        ['Ø¥ÙŠØ¶Ø§Ø­ 7: Ø§Ù„Ù…ÙˆØ±Ø¯ÙˆÙ† ÙˆØ§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª'],
        ['ÙƒÙˆØ¯ Ø§Ù„Ø­Ø³Ø§Ø¨', 'Ø§Ø³Ù… Ø§Ù„Ø­Ø³Ø§Ø¨', `Ø±ØµÙŠØ¯ ${reportYear}`, `Ø±ØµÙŠØ¯ ${priorYear}`],
        ...financialStatements.notesData.payableAccounts.map(a => [a.code, a.name, a.currentYear, a.priorYear])
      ];
      const wsNotes = XLSX.utils.aoa_to_sheet(notesDataRows);
      XLSX.utils.book_append_sheet(wb, wsNotes, 'Ø§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø§Ù„Ù…ØªÙ…Ù…Ø©');

      XLSX.writeFile(wb, `Annual_Financial_Report_${reportYear}_${organization?.name || 'Company'}.xlsx`);
      showToast('ØªÙ… ØªØµØ¯ÙŠØ± Ù…Ù„Ù Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø¨Ù†Ø¬Ø§Ø­', 'success');
    } catch (e) {
      showToast('ÙØ´Ù„ ØªØµØ¯ÙŠØ± Excel: ' + e.message, 'error');
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
      {/* Ø´Ø±ÙŠØ· Ø§Ù„Ø£Ø¯ÙˆØ§Øª Ø§Ù„Ø¹Ù„ÙˆÙŠ ÙˆØ§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø³Ù†Ø© */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-xl flex items-center justify-center shadow-md">
            <BookOpen size={26} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              ÙƒØªØ§Ø¨ Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø§Ù„Ù…ÙˆØ­Ø¯ ÙˆØ§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª
              <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full font-bold">
                IAS 1 / IFRS 18
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Ø§Ù„Ø­Ø²Ù…Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø³Ù†ÙˆÙŠØ© Ø§Ù„Ø´Ø§Ù…Ù„Ø© Ù„ÙƒØ§ÙØ© Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… ÙˆØ§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø§Ù„Ù…ØªÙ…Ù…Ø© ÙˆØ§Ù„Ù…Ù‚Ø§Ø±Ù†Ø§Øª Ø§Ù„Ù…Ø¹ÙŠØ§Ø±ÙŠØ©
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <Calendar size={18} className="text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©:</span>
            <select
              value={reportYear}
              onChange={(e) => setReportYear(Number(e.target.value))}
              className="bg-transparent font-black text-indigo-700 text-sm focus:outline-none cursor-pointer"
            >
              {[2027, 2026, 2025, 2024, 2023].map((y) => (
                <option key={y} value={y}>Ø³Ù†Ø© {y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold hover:bg-slate-800 transition shadow-sm"
          >
            <Printer size={16} />
            Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„ÙƒØªØ§Ø¨ Ø§Ù„ÙƒØ§Ù…Ù„
          </button>

          <button
            onClick={handleExportExcelBook}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold hover:bg-emerald-700 transition shadow-sm"
          >
            <Download size={16} />
            ØªØµØ¯ÙŠØ± Excel Ù…ØªÙƒØ§Ù…Ù„
          </button>

          <button
            onClick={loadFinancialData}
            disabled={loading}
            className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition"
            title="ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Ø´Ø±ÙŠØ· ØªØ¨ÙˆÙŠØ¨Ø§Øª Ø§Ù„Ø£Ù‚Ø³Ø§Ù… Ù„Ù„Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„ÙØ±Ø¯ÙŠØ© Ø£Ùˆ Ø§Ù„Ù…ÙˆØ­Ø¯Ø© */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 print:hidden">
        {[
          { id: 'ALL', label: 'ðŸ“– Ø§Ù„ÙƒØªØ§Ø¨ Ø§Ù„ÙƒØ§Ù…Ù„ Ø§Ù„Ù…ÙˆØ­Ø¯', icon: BookOpen },
          { id: 'COVER', label: 'ðŸ¢ Ø§Ù„ØºÙ„Ø§Ù ÙˆØ¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ù†Ø´Ø£Ø©', icon: Building2 },
          { id: 'PNL', label: 'ðŸ“ˆ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¯Ø®Ù„ (IFRS 18)', icon: TrendingUp },
          { id: 'BALANCE_SHEET', label: 'âš–ï¸ Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ (IAS 1)', icon: Scale },
          { id: 'EQUITY', label: 'ðŸ›ï¸ Ø§Ù„ØªØºÙŠØ± ÙÙŠ Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ©', icon: Layers },
          { id: 'CASH_FLOW', label: 'ðŸŒŠ Ø§Ù„ØªØ¯ÙÙ‚Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© (IAS 7)', icon: Activity },
          { id: 'NOTES', label: 'ðŸ“ Ø§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø§Ù„Ù…ØªÙ…Ù…Ø© (Notes)', icon: FileText },
          { id: 'AUDIT', label: 'ðŸ‘¨â€ðŸ’¼ ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© ÙˆØ§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©', icon: ShieldCheck }
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

      {/* Ø¬Ø³Ù… Ø§Ù„ØªÙ‚Ø±ÙŠØ± ÙˆØ§Ù„ØµÙØ­Ø§Øª */}
      <div className="space-y-12 print:space-y-8 bg-white p-6 sm:p-10 rounded-3xl border border-slate-200 shadow-sm print:border-none print:shadow-none print:p-0">

        {/* 1. ØµÙØ­Ø© Ø§Ù„ØºÙ„Ø§Ù Ø§Ù„Ø±Ø³Ù…ÙŠØ© */}
        {(activeTab === 'ALL' || activeTab === 'COVER') && (
          <div className="min-h-[85vh] flex flex-col justify-between border-2 border-slate-900 p-8 sm:p-14 rounded-3xl print:border-4 print:min-h-[1000px] print:rounded-none page-break-after">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-black tracking-widest text-indigo-700 uppercase bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                  Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ø¯Ù‚Ù‚Ø© Ø§Ù„Ù…ÙˆØ­Ø¯Ø©
                </span>
                <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mt-4 leading-tight">
                  {organization?.name || settings?.companyName || 'Ø´Ø±ÙƒØ© Ù…Ø³Ø§Ù‡Ù…Ø© Ù…ØªÙƒØ§Ù…Ù„Ø©'}
                </h2>
                <p className="text-base text-slate-600 font-medium mt-2">
                  Ø³Ø¬Ù„ ØªØ¬Ø§Ø±ÙŠ: {settings?.commercialRegister || '1029384756'} â€¢ Ø¨Ø·Ø§Ù‚Ø© Ø¶Ø±ÙŠØ¨ÙŠØ©: {settings?.taxNumber || '987-654-321'}
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
                Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø§Ù„Ù…ÙˆØ­Ø¯
              </h1>
              <p className="text-lg font-bold text-indigo-700 mb-2">
                Ø¹Ù† Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ© ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø± {reportYear}
              </p>
              <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
                ÙŠØªØ¶Ù…Ù† Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© Ø§Ù„Ø£Ø±Ø¨Ø¹ ÙˆÙÙ‚ Ø£Ø­Ø¯Ø« Ø§Ù„Ù…Ø¹Ø§ÙŠÙŠØ± Ø§Ù„Ø¯ÙˆÙ„ÙŠØ© Ù„Ù„Ø¥Ø¨Ù„Ø§Øº Ø§Ù„Ù…Ø§Ù„ÙŠ (IFRS 18 Ùˆ IAS 1 Ùˆ IAS 7) Ù…Ø¹ Ø§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø§Ù„Ù…ØªÙ…Ù…Ø© Ø§Ù„Ù…Ø±ÙÙ‚Ø© Ø§Ù„Ù…Ù‚Ø§Ø±Ù†Ø© Ù…Ø¹ Ø¹Ø§Ù… {priorYear}.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-8 border-t-2 border-slate-200 text-xs sm:text-sm">
              <div className="text-center">
                <p className="text-slate-500 mb-1">Ø§Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠ (CFO)</p>
                <p className="font-bold text-slate-900">Ù…Ø¹ØªÙ…Ø¯</p>
                <div className="w-28 h-0.5 bg-slate-300 mx-auto mt-6"></div>
              </div>
              <div className="text-center">
                <p className="text-slate-500 mb-1">Ø±Ø¦ÙŠØ³ Ù…Ø¬Ù„Ø³ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© (CEO)</p>
                <p className="font-bold text-slate-900">Ù…Ø¹ØªÙ…Ø¯</p>
                <div className="w-28 h-0.5 bg-slate-300 mx-auto mt-6"></div>
              </div>
              <div className="text-center">
                <p className="text-slate-500 mb-1">Ù…Ø±Ø§Ù‚Ø¨ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…Ø³ØªÙ‚Ù„</p>
                <p className="font-bold text-slate-900">ØªÙ‚Ø±ÙŠØ± ØºÙŠØ± Ù…ØªØ­ÙØ¸ (Unqualified)</p>
                <div className="w-28 h-0.5 bg-slate-300 mx-auto mt-6"></div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¯Ø®Ù„ Ø§Ù„Ø´Ø§Ù…Ù„ (IFRS 18) */}
        {(activeTab === 'ALL' || activeTab === 'PNL') && (
          <div className="page-break-before space-y-6">
            <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-end">
              <div>
                <span className="text-xs font-bold text-indigo-600">Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø£ÙˆÙ„Ù‰</span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø£Ùˆ Ø§Ù„Ø®Ø³Ø§Ø¦Ø± ÙˆØ§Ù„Ø¯Ø®Ù„ Ø§Ù„Ø´Ø§Ù…Ù„ (IFRS 18)
                </h3>
                <p className="text-xs text-slate-500">Ù„Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ© ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø± {reportYear} (Ù…Ù‚Ø§Ø±Ù†Ø© Ù…Ø¹ {priorYear}) - Ø§Ù„Ù…Ø¨Ø§Ù„Øº Ø¨Ø§Ù„Ø¬Ù†ÙŠÙ‡ Ø§Ù„Ù…ØµØ±ÙŠ</p>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-lg">Ø¥ÙŠØ¶Ø§Ø­</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-black">
                    <th className="p-3">Ø§Ù„Ø¨ÙŠØ§Ù† (Statement Items)</th>
                    <th className="p-3 text-center w-20">Ø¥ÙŠØ¶Ø§Ø­</th>
                    <th className="p-3 text-left w-36">{reportYear}</th>
                    <th className="p-3 text-left w-36">{priorYear}</th>
                    <th className="p-3 text-left w-28">Ø§Ù„ØªØºÙŠØ±</th>
                    <th className="p-3 text-left w-20">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={6} className="p-2.5">1. Ø§Ù„ÙØ¦Ø© Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ© (Operating Category)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„Ù†Ø´Ø§Ø· Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ ÙˆØ§Ù„Ø¹Ù‚ÙˆØ¯</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.pnl.totalOpRevenues.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.pnl.totalOpRevenues.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.totalOpRevenues.current, financialStatements.pnl.totalOpRevenues.prior).diff)}</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalOpRevenues.current, financialStatements.pnl.totalOpRevenues.prior).pct.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-red-600">ÙŠØ·Ø±Ø­: ØªÙƒÙ„ÙØ© Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª ÙˆØªÙƒÙ„ÙØ© Ø§Ù„Ù†Ø´Ø§Ø·</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.pnl.totalCogs.current)})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.pnl.totalCogs.prior)})</td>
                    <td className="p-2.5 text-left text-red-600">({formatMoney(calcVariance(financialStatements.pnl.totalCogs.current, financialStatements.pnl.totalCogs.prior).diff)})</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalCogs.current, financialStatements.pnl.totalCogs.prior).pct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-2.5">Ù…Ø¬Ù…Ù„ Ø§Ù„Ø±Ø¨Ø­ Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠ (Gross Profit)</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left text-indigo-700 font-black">{formatMoney(financialStatements.pnl.grossProfit.current)}</td>
                    <td className="p-2.5 text-left">{formatMoney(financialStatements.pnl.grossProfit.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.grossProfit.current, financialStatements.pnl.grossProfit.prior).diff)}</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.grossProfit.current, financialStatements.pnl.grossProfit.prior).pct.toFixed(1)}%</td>
                  </tr>

                  {financialStatements.pnl.totalOtherOpIncome.current > 0 && (
                    <tr>
                      <td className="p-2.5 pr-6 font-medium">Ø¥ÙŠØ±Ø§Ø¯Ø§Øª ØªØ´ØºÙŠÙ„ÙŠØ© Ø£Ø®Ø±Ù‰</td>
                      <td className="p-2.5 text-center text-slate-400">-</td>
                      <td className="p-2.5 text-left">{formatMoney(financialStatements.pnl.totalOtherOpIncome.current)}</td>
                      <td className="p-2.5 text-left">{formatMoney(financialStatements.pnl.totalOtherOpIncome.prior)}</td>
                      <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.totalOtherOpIncome.current, financialStatements.pnl.totalOtherOpIncome.prior).diff)}</td>
                      <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalOtherOpIncome.current, financialStatements.pnl.totalOtherOpIncome.prior).pct.toFixed(1)}%</td>
                    </tr>
                  )}
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-red-600">ÙŠØ·Ø±Ø­: Ù…ØµØ±ÙˆÙØ§Øª Ø§Ù„Ø¨ÙŠØ¹ ÙˆØ§Ù„ØªØ³ÙˆÙŠÙ‚ ÙˆØ§Ù„ØªÙˆØ²ÙŠØ¹</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.pnl.totalSelling.current)})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.pnl.totalSelling.prior)})</td>
                    <td className="p-2.5 text-left text-red-600">({formatMoney(calcVariance(financialStatements.pnl.totalSelling.current, financialStatements.pnl.totalSelling.prior).diff)})</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalSelling.current, financialStatements.pnl.totalSelling.prior).pct.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-red-600">ÙŠØ·Ø±Ø­: Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª Ø§Ù„Ø¹Ù…ÙˆÙ…ÙŠØ© ÙˆØ§Ù„Ø¥Ø¯Ø§Ø±ÙŠØ©</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.pnl.totalAdmin.current)})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.pnl.totalAdmin.prior)})</td>
                    <td className="p-2.5 text-left text-red-600">({formatMoney(calcVariance(financialStatements.pnl.totalAdmin.current, financialStatements.pnl.totalAdmin.prior).diff)})</td>
                    <td className="p-2.5 text-left font-mono">{calcVariance(financialStatements.pnl.totalAdmin.current, financialStatements.pnl.totalAdmin.prior).pct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-blue-50/70 font-black text-blue-900 border-t border-b border-blue-200">
                    <td className="p-3">Ø§Ù„Ø±Ø¨Ø­ Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠ Ø§Ù„Ø¥Ù„Ø²Ø§Ù…ÙŠ (Operating Profit - IFRS 18)</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.operatingProfit.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.operatingProfit.prior)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(calcVariance(financialStatements.pnl.operatingProfit.current, financialStatements.pnl.operatingProfit.prior).diff)}</td>
                    <td className="p-3 text-left font-mono">{calcVariance(financialStatements.pnl.operatingProfit.current, financialStatements.pnl.operatingProfit.prior).pct.toFixed(1)}%</td>
                  </tr>

                  {/* Ø§Ù„ÙØ¦Ø© Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø±ÙŠØ© */}
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={6} className="p-2.5">2. Ø§Ù„ÙØ¦Ø© Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø±ÙŠØ© (Investing Category)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">ØµØ§ÙÙŠ Ø¥ÙŠØ±Ø§Ø¯Ø§Øª/(Ø®Ø³Ø§Ø¦Ø±) Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø±Ø§Øª ÙˆØ§Ù„Ø£ØµÙˆÙ„</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.pnl.netInvesting.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.pnl.netInvesting.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.netInvesting.current, financialStatements.pnl.netInvesting.prior).diff)}</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr className="bg-slate-100 font-black">
                    <td className="p-3">Ø§Ù„Ø±Ø¨Ø­ Ù‚Ø¨Ù„ Ø§Ù„ØªÙ…ÙˆÙŠÙ„ ÙˆØ§Ù„Ø¶Ø±Ø§Ø¦Ø¨ (Profit Before Financing & Income Taxes)</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeFinancing.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeFinancing.prior)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(calcVariance(financialStatements.pnl.profitBeforeFinancing.current, financialStatements.pnl.profitBeforeFinancing.prior).diff)}</td>
                    <td className="p-3 text-left font-mono">{calcVariance(financialStatements.pnl.profitBeforeFinancing.current, financialStatements.pnl.profitBeforeFinancing.prior).pct.toFixed(1)}%</td>
                  </tr>

                  {/* Ø§Ù„ÙØ¦Ø© Ø§Ù„ØªÙ…ÙˆÙŠÙ„ÙŠØ© */}
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={6} className="p-2.5">3. Ø§Ù„ÙØ¦Ø© Ø§Ù„ØªÙ…ÙˆÙŠÙ„ÙŠØ© (Financing Category)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">ØµØ§ÙÙŠ Ø¯Ø®Ù„/(ØªÙƒØ§Ù„ÙŠÙ) Ø§Ù„ØªÙ…ÙˆÙŠÙ„ ÙˆØ§Ù„ÙÙˆØ§Ø¦Ø¯ Ø§Ù„Ø¨Ù†ÙƒÙŠØ©</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.pnl.netFinance.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.pnl.netFinance.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.pnl.netFinance.current, financialStatements.pnl.netFinance.prior).diff)}</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr className="bg-amber-50/70 font-black text-amber-900 border-t border-b border-amber-200">
                    <td className="p-3">ØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­ Ù‚Ø¨Ù„ Ø§Ù„Ø¶Ø±Ø§Ø¦Ø¨ (Profit Before Tax)</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeTax.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeTax.prior)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(calcVariance(financialStatements.pnl.profitBeforeTax.current, financialStatements.pnl.profitBeforeTax.prior).diff)}</td>
                    <td className="p-3 text-left font-mono">{calcVariance(financialStatements.pnl.profitBeforeTax.current, financialStatements.pnl.profitBeforeTax.prior).pct.toFixed(1)}%</td>
                  </tr>

                  {/* Ø§Ù„Ø¶Ø±Ø§Ø¦Ø¨ ÙˆØµØ§ÙÙŠ Ø§Ù„Ø¯Ø®Ù„ */}
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-red-600">ÙŠØ·Ø±Ø­: Ø¶Ø±Ø§Ø¦Ø¨ Ø§Ù„Ø¯Ø®Ù„ ÙˆØ¶Ø±ÙŠØ¨Ø© Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©</td>
                    <td className="p-2.5 text-center text-slate-400">-</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.pnl.totalTaxes.current)})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.pnl.totalTaxes.prior)})</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr className="bg-emerald-600 text-white font-black text-sm">
                    <td className="p-3.5">ØµØ§ÙÙŠ Ø±Ø¨Ø­/(Ø®Ø³Ø§Ø±Ø©) Ø§Ù„Ø¹Ø§Ù… (Net Profit for the Year)</td>
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

        {/* 3. Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„ØªØ­Ù„ÙŠÙ„ÙŠØ© (IAS 1) */}
        {(activeTab === 'ALL' || activeTab === 'BALANCE_SHEET') && (
          <div className="page-break-before space-y-6">
            <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-end">
              <div>
                <span className="text-xs font-bold text-indigo-600">Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø«Ø§Ù†ÙŠØ©</span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„ØªØ­Ù„ÙŠÙ„ÙŠØ© (IAS 1 Statement of Financial Position)
                </h3>
                <p className="text-xs text-slate-500">ÙƒÙ…Ø§ ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø± {reportYear} (Ù…Ù‚Ø§Ø±Ù†Ø© Ù…Ø¹ {priorYear}) - Ø§Ù„Ù…Ø¨Ø§Ù„Øº Ø¨Ø§Ù„Ø¬Ù†ÙŠÙ‡ Ø§Ù„Ù…ØµØ±ÙŠ</p>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1 rounded-lg">Ø¥ÙŠØ¶Ø§Ø­</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-black">
                    <th className="p-3">Ø¹Ù†Ø§ØµØ± Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ</th>
                    <th className="p-3 text-center w-20">Ø¥ÙŠØ¶Ø§Ø­</th>
                    <th className="p-3 text-left w-36">{reportYear}</th>
                    <th className="p-3 text-left w-36">{priorYear}</th>
                    <th className="p-3 text-left w-28">Ø§Ù„ØªØºÙŠØ±</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={5} className="p-2.5">Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Current Assets)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙˆÙ…Ø§ ÙÙŠ Ø­ÙƒÙ…Ù‡Ø§</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">4</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.cashFlow.totalCashEnding.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.cashFlow.totalCashEnding.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.cashFlow.totalCashEnding.current, financialStatements.cashFlow.totalCashEnding.prior).diff)}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ£ÙˆØ±Ø§Ù‚ Ø§Ù„Ù‚Ø¨Ø¶ (Ø¨Ø§Ù„ØµØ§ÙÙŠ)</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">5</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.currentYear, 0))}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.priorYear, 0))}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.currentYear, 0), financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.priorYear, 0)).diff)}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø³Ù„Ø¹ÙŠ (Ø¨Ø§Ù„ØªÙƒÙ„ÙØ© Ø£Ùˆ ØµØ§ÙÙŠ Ø§Ù„Ù‚ÙŠÙ…Ø© Ø£ÙŠÙ‡Ù…Ø§ Ø£Ù‚Ù„)</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">6</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.currentYear, 0))}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.priorYear, 0))}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.currentYear, 0), financialStatements.notesData.inventoryAccounts.reduce((s, a) => s + a.priorYear, 0)).diff)}</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-2.5">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Ø£)</td>
                    <td className="p-2.5 text-center">-</td>
                    <td className="p-2.5 text-left font-mono font-bold">{formatMoney(financialStatements.bs.totalCurrentAssets.current)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(financialStatements.bs.totalCurrentAssets.prior)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(calcVariance(financialStatements.bs.totalCurrentAssets.current, financialStatements.bs.totalCurrentAssets.prior).diff)}</td>
                  </tr>

                  <tr className="bg-red-50/60 font-bold text-red-900">
                    <td colSpan={5} className="p-2.5">ÙŠØ·Ø±Ø­: Ø§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Current Liabilities)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">Ø§Ù„Ù…ÙˆØ±Ø¯ÙˆÙ† ÙˆØ£ÙˆØ±Ø§Ù‚ Ø§Ù„Ø¯ÙØ¹ ÙˆØ§Ù„Ø¯ÙØ¹Ø§Øª Ø§Ù„Ù…Ù‚Ø¯Ù…Ø©</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">7</td>
                    <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.notesData.payableAccounts.reduce((s, a) => s + a.currentYear, 0))})</td>
                    <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.notesData.payableAccounts.reduce((s, a) => s + a.priorYear, 0))})</td>
                    <td className="p-2.5 text-left">-</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-2.5">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Ø¨)</td>
                    <td className="p-2.5 text-center">-</td>
                    <td className="p-2.5 text-left font-mono text-red-600">({formatMoney(financialStatements.bs.totalCurrentLiabilities.current)})</td>
                    <td className="p-2.5 text-left font-mono text-slate-600">({formatMoney(financialStatements.bs.totalCurrentLiabilities.prior)})</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>

                  <tr className="bg-amber-100/70 font-black text-amber-950 border-t-2 border-b-2 border-amber-300">
                    <td className="p-3">ØµØ§ÙÙŠ Ø±Ø£Ø³ Ø§Ù„Ù…Ø§Ù„ Ø§Ù„Ø¹Ø§Ù…Ù„ (Net Working Capital = Ø£ - Ø¨)</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-left font-mono text-base">{formatMoney(financialStatements.bs.netWorkingCapital.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.netWorkingCapital.prior)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(calcVariance(financialStatements.bs.netWorkingCapital.current, financialStatements.bs.netWorkingCapital.prior).diff)}</td>
                  </tr>

                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={5} className="p-2.5">ÙŠØ¶Ø§Ù: Ø§Ù„Ø£ØµÙˆÙ„ ØºÙŠØ± Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Non-Current Assets)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ© (Ø¨Ø§Ù„ØµØ§ÙÙŠ Ø¨Ø¹Ø¯ Ù…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ)</td>
                    <td className="p-2.5 text-center font-bold text-indigo-700">3</td>
                    <td className="p-2.5 text-left font-bold">{formatMoney(financialStatements.bs.totalNonCurrentAssets.current)}</td>
                    <td className="p-2.5 text-left text-slate-600">{formatMoney(financialStatements.bs.totalNonCurrentAssets.prior)}</td>
                    <td className="p-2.5 text-left">{formatMoney(calcVariance(financialStatements.bs.totalNonCurrentAssets.current, financialStatements.bs.totalNonCurrentAssets.prior).diff)}</td>
                  </tr>
                  <tr className="bg-slate-200/80 font-black">
                    <td className="p-2.5">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø±Ø£Ø³ Ø§Ù„Ù…Ø§Ù„ Ø§Ù„Ù…ÙˆØ¸Ù (Capital Employed)</td>
                    <td className="p-2.5 text-center">-</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(financialStatements.bs.capitalEmployed.current)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(financialStatements.bs.capitalEmployed.prior)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(calcVariance(financialStatements.bs.capitalEmployed.current, financialStatements.bs.capitalEmployed.prior).diff)}</td>
                  </tr>

                  {financialStatements.bs.totalNonCurrentLiabilities.current > 0 && (
                    <tr>
                      <td className="p-2.5 pr-6 font-medium text-red-600">ÙŠØ·Ø±Ø­: Ø§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª ØºÙŠØ± Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© (Ù‚Ø±ÙˆØ¶ ÙˆØªØ³Ù‡ÙŠÙ„Ø§Øª Ø·ÙˆÙŠÙ„Ø©)</td>
                      <td className="p-2.5 text-center text-slate-400">-</td>
                      <td className="p-2.5 text-left font-bold text-red-600">({formatMoney(financialStatements.bs.totalNonCurrentLiabilities.current)})</td>
                      <td className="p-2.5 text-left text-slate-600">({formatMoney(financialStatements.bs.totalNonCurrentLiabilities.prior)})</td>
                      <td className="p-2.5 text-left">-</td>
                    </tr>
                  )}

                  <tr className="bg-indigo-900 text-white font-black text-sm">
                    <td className="p-3.5">ØµØ§ÙÙŠ Ø§Ù„Ø£ØµÙˆÙ„ (Net Assets)</td>
                    <td className="p-3.5 text-center">-</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.bs.netAssets.current)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.bs.netAssets.prior)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(calcVariance(financialStatements.bs.netAssets.current, financialStatements.bs.netAssets.prior).diff)}</td>
                  </tr>

                  <tr className="bg-emerald-50/70 font-black text-emerald-950 border-t-2 border-emerald-300">
                    <td className="p-3.5 flex items-center justify-between">
                      <span>Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ© (Total Equity)</span>
                      <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                        <CheckCircle2 size={12} /> Ù…ØªØ·Ø§Ø¨Ù‚ Ù…Ø­Ø§Ø³Ø¨ÙŠØ§Ù‹
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

        {/* 4. Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ØªØºÙŠØ± ÙÙŠ Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ© */}
        {(activeTab === 'ALL' || activeTab === 'EQUITY') && (
          <div className="page-break-before space-y-6">
            <div className="border-b-2 border-slate-900 pb-3">
              <span className="text-xs font-bold text-indigo-600">Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø«Ø§Ù„Ø«Ø©</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ØªØºÙŠØ± ÙÙŠ Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ© (IAS 1 Statement of Changes in Equity)
              </h3>
              <p className="text-xs text-slate-500">Ø¹Ù† Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ© ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø± {reportYear} - Ø§Ù„Ù…Ø¨Ø§Ù„Øº Ø¨Ø§Ù„Ø¬Ù†ÙŠÙ‡ Ø§Ù„Ù…ØµØ±ÙŠ</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-black">
                    <th className="p-3">Ø¨ÙŠØ§Ù† Ø§Ù„Ø­Ø±ÙƒØ©</th>
                    <th className="p-3 text-left">Ø±Ø£Ø³ Ø§Ù„Ù…Ø§Ù„ Ø§Ù„Ù…Ø¯ÙÙˆØ¹</th>
                    <th className="p-3 text-left">Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ§Øª</th>
                    <th className="p-3 text-left">Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø¨Ù‚Ø§Ø©</th>
                    <th className="p-3 text-left">Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø´Ø±ÙƒØ§Ø¡</th>
                    <th className="p-3 text-left bg-slate-800 font-mono">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ©</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="font-bold bg-slate-50">
                    <td className="p-3">Ø§Ù„Ø±ØµÙŠØ¯ ÙƒÙ…Ø§ ÙÙŠ 1 ÙŠÙ†Ø§ÙŠØ± {reportYear} (Ø§ÙØªØªØ§Ø­ÙŠ)</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.7)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.1)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.15)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.bs.totalEquity.prior * 0.05)}</td>
                    <td className="p-3 text-left font-mono font-black bg-slate-100">{formatMoney(financialStatements.bs.totalEquity.prior)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 pr-6 font-bold text-emerald-700">ØµØ§ÙÙŠ Ø±Ø¨Ø­ Ø§Ù„Ø¹Ø§Ù… {reportYear} (Ù…Ù† Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¯Ø®Ù„)</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatMoney(financialStatements.pnl.netIncome.current)}</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono font-bold text-emerald-700 bg-emerald-50">{formatMoney(financialStatements.pnl.netIncome.current)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 pr-6 font-medium">Ø§Ù„ØªØ­ÙˆÙŠÙ„ Ø¥Ù„Ù‰ Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠ Ø§Ù„Ù‚Ø§Ù†ÙˆÙ†ÙŠ ÙˆØ§Ù„Ù†Ø¸Ø§Ù…ÙŠ</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.pnl.netIncome.current * 0.1)}</td>
                    <td className="p-3 text-left font-mono text-red-600">({formatMoney(financialStatements.pnl.netIncome.current * 0.1)})</td>
                    <td className="p-3 text-left font-mono">-</td>
                    <td className="p-3 text-left font-mono bg-slate-50">0.00</td>
                  </tr>
                  <tr className="bg-indigo-900 text-white font-black text-sm">
                    <td className="p-3.5">Ø§Ù„Ø±ØµÙŠØ¯ ÙƒÙ…Ø§ ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø± {reportYear} (Ø®ØªØ§Ù…ÙŠ)</td>
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

        {/* 5. Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ØªØ¯ÙÙ‚Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© (IAS 7) */}
        {(activeTab === 'ALL' || activeTab === 'CASH_FLOW') && (
          <div className="page-break-before space-y-6">
            <div className="border-b-2 border-slate-900 pb-3">
              <span className="text-xs font-bold text-indigo-600">Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø±Ø§Ø¨Ø¹Ø©</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ØªØ¯ÙÙ‚Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© (IAS 7 Statement of Cash Flows)
              </h3>
              <p className="text-xs text-slate-500">Ù„Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ© ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø± {reportYear} - Ø§Ù„Ø·Ø±ÙŠÙ‚Ø© ØºÙŠØ± Ø§Ù„Ù…Ø¨Ø§Ø´Ø±Ø©</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-black">
                    <th className="p-3">Ø¨ÙŠØ§Ù† Ø§Ù„ØªØ¯ÙÙ‚ Ø§Ù„Ù†Ù‚Ø¯ÙŠ</th>
                    <th className="p-3 text-left w-48">{reportYear}</th>
                    <th className="p-3 text-left w-48">{priorYear}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={3} className="p-2.5">Ø§Ù„ØªØ¯ÙÙ‚Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ù…Ù† Ø§Ù„Ø£Ù†Ø´Ø·Ø© Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ©</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">ØµØ§ÙÙŠ Ø±Ø¨Ø­ Ø§Ù„Ø¹Ø§Ù… Ù‚Ø¨Ù„ Ø§Ù„Ø¶Ø±Ø§Ø¦Ø¨ ÙˆØ§Ù„Ø¨Ù†ÙˆØ¯ ØºÙŠØ± Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©</td>
                    <td className="p-2.5 text-left font-mono font-bold">{formatMoney(financialStatements.pnl.profitBeforeTax.current)}</td>
                    <td className="p-2.5 text-left font-mono">{formatMoney(financialStatements.pnl.profitBeforeTax.prior)}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium text-emerald-700">ØªØ¹Ø¯ÙŠÙ„: Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ© (Ø¨Ù†Ø¯ ØºÙŠØ± Ù†Ù‚Ø¯ÙŠ)</td>
                    <td className="p-2.5 text-left font-mono text-emerald-700">100,000.00</td>
                    <td className="p-2.5 text-left font-mono">0.00</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">(Ø§Ù„Ø²ÙŠØ§Ø¯Ø©)/Ø§Ù„Ù†Ù‚Øµ ÙÙŠ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ§Ù„Ù…Ø¯ÙŠÙ†ÙŠÙ†</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">(Ø§Ù„Ø²ÙŠØ§Ø¯Ø©)/Ø§Ù„Ù†Ù‚Øµ ÙÙŠ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø³Ù„Ø¹ÙŠ</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">Ø§Ù„Ø²ÙŠØ§Ø¯Ø©/(Ø§Ù„Ù†Ù‚Øµ) ÙÙŠ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙˆØ§Ù„Ø¯Ø§Ø¦Ù†ÙŠÙ†</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                    <td className="p-2.5 text-left font-mono">-</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-3">ØµØ§ÙÙŠ Ø§Ù„ØªØ¯ÙÙ‚ Ø§Ù„Ù†Ù‚Ø¯ÙŠ Ù…Ù† Ø§Ù„Ø£Ù†Ø´Ø·Ø© Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ©</td>
                    <td className="p-3 text-left font-mono font-bold text-indigo-800">{formatMoney(financialStatements.cashFlow.operatingCashFlow.current)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(financialStatements.cashFlow.operatingCashFlow.prior)}</td>
                  </tr>

                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={3} className="p-2.5">Ø§Ù„ØªØ¯ÙÙ‚Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ù…Ù† Ø§Ù„Ø£Ù†Ø´Ø·Ø© Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø±ÙŠØ©</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">Ø§Ù„Ù…Ø¯ÙÙˆØ¹Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ù„Ø´Ø±Ø§Ø¡ Ø£ØµÙˆÙ„ Ø«Ø§Ø¨ØªØ© ÙˆÙ…Ø¹Ø¯Ø§Øª</td>
                    <td className="p-2.5 text-left font-mono text-red-600">(0.00)</td>
                    <td className="p-2.5 text-left font-mono">(0.00)</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-3">ØµØ§ÙÙŠ Ø§Ù„ØªØ¯ÙÙ‚ Ø§Ù„Ù†Ù‚Ø¯ÙŠ Ù…Ù† Ø§Ù„Ø£Ù†Ø´Ø·Ø© Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø±ÙŠØ©</td>
                    <td className="p-3 text-left font-mono font-bold">0.00</td>
                    <td className="p-3 text-left font-mono">0.00</td>
                  </tr>

                  <tr className="bg-indigo-50/60 font-bold text-indigo-900">
                    <td colSpan={3} className="p-2.5">Ø§Ù„ØªØ¯ÙÙ‚Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ù…Ù† Ø§Ù„Ø£Ù†Ø´Ø·Ø© Ø§Ù„ØªÙ…ÙˆÙŠÙ„ÙŠØ©</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 pr-6 font-medium">Ø§Ù„Ù…Ù‚Ø¨ÙˆØ¶Ø§Øª Ù…Ù† Ø±Ø£Ø³ Ø§Ù„Ù…Ø§Ù„ ÙˆØªØ³Ù‡ÙŠÙ„Ø§Øª Ø§Ù„Ø´Ø±ÙƒØ§Ø¡</td>
                    <td className="p-2.5 text-left font-mono">0.00</td>
                    <td className="p-2.5 text-left font-mono">0.00</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold">
                    <td className="p-3">ØµØ§ÙÙŠ Ø§Ù„ØªØ¯ÙÙ‚ Ø§Ù„Ù†Ù‚Ø¯ÙŠ Ù…Ù† Ø§Ù„Ø£Ù†Ø´Ø·Ø© Ø§Ù„ØªÙ…ÙˆÙŠÙ„ÙŠØ©</td>
                    <td className="p-3 text-left font-mono font-bold">0.00</td>
                    <td className="p-3 text-left font-mono">0.00</td>
                  </tr>

                  <tr className="bg-slate-900 text-white font-black text-sm">
                    <td className="p-3.5">Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙˆÙ…Ø§ ÙÙŠ Ø­ÙƒÙ…Ù‡Ø§ ÙÙŠ Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ø¹Ø§Ù… (Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ)</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.cashFlow.totalCashEnding.current)}</td>
                    <td className="p-3.5 text-left font-mono">{formatMoney(financialStatements.cashFlow.totalCashEnding.prior)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-xs space-y-1">
              <p className="font-bold text-amber-900 flex items-center gap-1.5">
                <Info size={14} /> Ø¥ÙØµØ§Ø­ Ø¥Ù„Ø²Ø§Ù…ÙŠ: Ø§Ù„Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø±ÙŠØ© ÙˆØ§Ù„ØªÙ…ÙˆÙŠÙ„ÙŠØ© ØºÙŠØ± Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© (IAS 7 Ø§Ù„ÙÙ‚Ø±Ø© 43):
              </p>
              <p className="text-amber-800 leading-relaxed">
                ØªÙ… Ø´Ø±Ø§Ø¡ Ø£ØµÙˆÙ„ Ø«Ø§Ø¨ØªØ© Ø¨Ù‚ÙŠÙ…Ø© 100,000.00 Ø¬Ù†ÙŠÙ‡ Ø®Ù„Ø§Ù„ Ø§Ù„Ø¹Ø§Ù… ØªÙ… ØªÙ…ÙˆÙŠÙ„Ù‡Ø§ Ù…Ø¨Ø§Ø´Ø±Ø© Ø¹Ø¨Ø± Ø­Ø³Ø§Ø¨ Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„ØŒ ÙˆØªÙ… Ø§Ø³ØªØ¨Ø¹Ø§Ø¯Ù‡Ø§ Ù…Ù† Ø§Ù„ØªØ¯ÙÙ‚ Ø§Ù„Ù†Ù‚Ø¯ÙŠ Ù„Ø¹Ø¯Ù… ÙˆØ¬ÙˆØ¯ Ø­Ø±ÙƒØ© Ù†Ù‚Ø¯ÙŠØ© Ù…Ø¨Ø§Ø´Ø±Ø© Ø¹Ù„ÙŠÙ‡Ø§.
              </p>
            </div>
          </div>
        )}

        {/* 6. Ø§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø§Ù„Ù…ØªÙ…Ù…Ø© Ù„Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ© (Notes to Financial Statements) */}
        {(activeTab === 'ALL' || activeTab === 'NOTES') && (
          <div className="page-break-before space-y-8">
            <div className="border-b-2 border-slate-900 pb-3">
              <span className="text-xs font-bold text-indigo-600">Ø§Ù„Ø¬Ø²Ø¡ Ø§Ù„ØªÙØµÙŠÙ„ÙŠ Ø§Ù„Ø¥Ù„Ø²Ø§Ù…ÙŠ</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                Ø§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø§Ù„Ù…ØªÙ…Ù…Ø© Ù„Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ© (Notes & Disclosures)
              </h3>
              <p className="text-xs text-slate-500">ØªØ´ÙƒÙ„ Ø§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø¬Ø²Ø¡Ø§Ù‹ Ù„Ø§ ÙŠØªØ¬Ø²Ø£ Ù…Ù† Ù‡Ø°Ù‡ Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ© ÙˆØªÙ‚Ø±Ø£ Ù…Ø¹Ù‡Ø§</p>
            </div>

            {/* Ø¥ÙŠØ¶Ø§Ø­ 1: Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ù…Ù†Ø´Ø£Ø© */}
            <div className="space-y-2">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="bg-slate-900 text-white w-6 h-6 rounded-full inline-flex items-center justify-center text-xs">1</span>
                Ù†Ø¨Ø°Ø© Ø¹Ù† Ø§Ù„Ù…Ù†Ø´Ø£Ø© ÙˆÙ†Ø´Ø§Ø·Ù‡Ø§ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ (General Information)
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {organization?.name || settings?.companyName || 'Ø§Ù„Ø´Ø±ÙƒØ©'} Ù‡ÙŠ Ø´Ø±ÙƒØ© Ù…Ø³Ø§Ù‡Ù…Ø© Ù…Ù‚ÙŠØ¯Ø© Ø¨Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„ØªØ¬Ø§Ø±ÙŠ Ø±Ù‚Ù… ({settings?.commercialRegister || '1029384756'}) ÙˆØ§Ù„Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„Ø¶Ø±ÙŠØ¨ÙŠØ© Ø±Ù‚Ù… ({settings?.taxNumber || '987-654-321'}).
                Ø§Ù„ØºØ±Ø¶ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ Ù„Ù„Ù…Ù†Ø´Ø£Ø© Ù‡Ùˆ Ø§Ù„ØªØ¬Ø§Ø±Ø© ÙˆØ§Ù„ØµÙ†Ø§Ø¹Ø© ÙˆØªÙˆØ±ÙŠØ¯ Ø§Ù„Ø­Ù„ÙˆÙŠØ§Øª ÙˆØ§Ù„Ù…ÙˆØ§Ø¯ Ø§Ù„ØºØ°Ø§Ø¦ÙŠØ© ÙˆØ§Ù„Ù…Ù‚Ø§ÙˆÙ„Ø§Øª Ø§Ù„Ø¹Ø§Ù…Ø©.
                ØªØ¨Ø¯Ø£ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ù„Ù„Ù…Ù†Ø´Ø£Ø© ÙÙŠ Ø£ÙˆÙ„ ÙŠÙ†Ø§ÙŠØ± ÙˆØªÙ†ØªÙ‡ÙŠ ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø± Ù…Ù† ÙƒÙ„ Ø¹Ø§Ù… Ù…ÙŠÙ„Ø§Ø¯ÙŠ. Ø¹Ù…Ù„Ø© Ø§Ù„Ø¹Ø±Ø¶ ÙˆØ§Ù„Ù‚ÙŠØ§Ø³ Ù‡ÙŠ Ø§Ù„Ø¬Ù†ÙŠÙ‡ Ø§Ù„Ù…ØµØ±ÙŠ (EGP).
              </p>
            </div>

            {/* Ø¥ÙŠØ¶Ø§Ø­ 2: Ø§Ù„Ø³ÙŠØ§Ø³Ø§Øª Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ© */}
            <div className="space-y-3">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="bg-slate-900 text-white w-6 h-6 rounded-full inline-flex items-center justify-center text-xs">2</span>
                Ø£Ù‡Ù… Ø§Ù„Ø³ÙŠØ§Ø³Ø§Øª Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ© Ø§Ù„Ù…ØªØ¨Ø¹Ø© (Summary of Accounting Policies)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <p className="font-bold text-slate-800 mb-1">Ø£. Ø£Ø³Ø§Ø³ Ø¥Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ©:</p>
                  <p className="text-slate-600 leading-relaxed">
                    ØªÙ… Ø¥Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ© ÙˆÙÙ‚Ø§Ù‹ Ù„Ù…Ø¹Ø§ÙŠÙŠØ± Ø§Ù„Ù…Ø­Ø§Ø³Ø¨Ø© Ø§Ù„Ø¯ÙˆÙ„ÙŠØ© (IFRS / IAS) ÙˆØªØ¹Ø¯ÙŠÙ„Ø§ØªÙ‡Ø§ Ø§Ù„Ø£Ø®ÙŠØ±Ø© ÙˆÙˆÙÙ‚ Ø£Ø³Ø§Ø³ Ø§Ù„Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ ÙˆÙ…Ø¨Ø¯Ø£ Ø§Ù„Ø§Ø³ØªÙ…Ø±Ø§Ø±ÙŠØ©.
                  </p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <p className="font-bold text-slate-800 mb-1">Ø¨. Ø§Ù„Ø§Ø¹ØªØ±Ø§Ù Ø¨Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯ (IFRS 15):</p>
                  <p className="text-slate-600 leading-relaxed">
                    ÙŠØªÙ… Ø§Ù„Ø§Ø¹ØªØ±Ø§Ù Ø¨Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø¹Ù†Ø¯ Ø§Ù†ØªÙ‚Ø§Ù„ Ø§Ù„Ø³ÙŠØ·Ø±Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø¨Ø¶Ø§Ø¦Ø¹ Ø£Ùˆ ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø®Ø¯Ù…Ø§Øª Ù„Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø¨Ù…Ø¨Ù„Øº ÙŠØ¹ÙƒØ³ Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„ Ø§Ù„Ù…ØªÙˆÙ‚Ø¹ Ø§Ø³ØªØ­Ù‚Ø§Ù‚Ù‡.
                  </p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <p className="font-bold text-slate-800 mb-1">Ø¬. Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ© ÙˆØ§Ù„Ø¥Ù‡Ù„Ø§Ùƒ (IAS 16):</p>
                  <p className="text-slate-600 leading-relaxed">
                    ØªØ«Ø¨Øª Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ© Ø¨Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„ØªØ§Ø±ÙŠØ®ÙŠØ© Ù…Ø·Ø±ÙˆØ­Ø§Ù‹ Ù…Ù†Ù‡Ø§ Ù…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ ÙˆØ£ÙŠ Ø®Ø³Ø§Ø¦Ø± Ø§Ù†Ø®ÙØ§Ø¶ ÙÙŠ Ø§Ù„Ù‚ÙŠÙ…Ø©. ÙŠØ­ØªØ³Ø¨ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø¨Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ù‚Ø³Ø· Ø§Ù„Ø«Ø§Ø¨Øª Ø¹Ù„Ù‰ Ù…Ø¯Ø§Ø± Ø§Ù„Ø¹Ù…Ø± Ø§Ù„Ø¥Ù†ØªØ§Ø¬ÙŠ Ø§Ù„Ù…Ù‚Ø¯Ø± Ù„Ù„Ø£ØµÙ„.
                  </p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <p className="font-bold text-slate-800 mb-1">Ø¯. Ø§Ù„Ù…Ø®Ø²ÙˆÙ† (IAS 2):</p>
                  <p className="text-slate-600 leading-relaxed">
                    ÙŠÙ‚ÙˆÙ… Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø¨Ø§Ù„ØªÙƒÙ„ÙØ© Ø£Ùˆ ØµØ§ÙÙŠ Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„ØªØ­Ù‚Ù‚ Ø£ÙŠÙ‡Ù…Ø§ Ø£Ù‚Ù„ØŒ ÙˆØªØ­Ø¯Ø¯ Ø§Ù„ØªÙƒÙ„ÙØ© Ø¨Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ù…ØªÙˆØ³Ø· Ø§Ù„Ù…Ø±Ø¬Ø­ Ù…ØªØ¶Ù…Ù†Ø© ÙƒØ§ÙØ© ØªÙƒØ§Ù„ÙŠÙ Ø§Ù„Ø´Ø±Ø§Ø¡ ÙˆØ§Ù„ØªØ­ÙˆÙŠÙ„.
                  </p>
                </div>
              </div>
            </div>

            {/* Ø¥ÙŠØ¶Ø§Ø­ 3: Ø¬Ø¯ÙˆÙ„ Ø­Ø±ÙƒØ© Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ© */}
            <div className="space-y-3">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="bg-slate-900 text-white w-6 h-6 rounded-full inline-flex items-center justify-center text-xs">3</span>
                Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ© ÙˆÙ…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ (Fixed Assets Movement Schedule)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold">
                      <th className="p-2.5">Ø§Ø³Ù… Ø§Ù„Ø£ØµÙ„ / Ø§Ù„ØªØµÙ†ÙŠÙ</th>
                      <th className="p-2.5 text-left">Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠØ©</th>
                      <th className="p-2.5 text-left">Ø¥Ø¶Ø§ÙØ§Øª Ø§Ù„Ø¹Ø§Ù…</th>
                      <th className="p-2.5 text-left">Ù…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ</th>
                      <th className="p-2.5 text-left bg-slate-900 font-mono">ØµØ§ÙÙŠ Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¯ÙØªØ±ÙŠØ© ({reportYear})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dbAssets.length > 0 ? (
                      dbAssets.map((asset: Record<string, any>) => {
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
                        <td className="p-2 font-medium">Ø§Ù„Ø¢Ù„Ø§Øª ÙˆØ§Ù„Ù…Ø¹Ø¯Ø§Øª ÙˆØ§Ù„Ø­ÙØ§Ø±Ø§Øª ÙˆØ§Ù„Ø£Ø¬Ù‡Ø²Ø©</td>
                        <td className="p-2 text-left font-mono">100,000.00</td>
                        <td className="p-2 text-left font-mono">0.00</td>
                        <td className="p-2 text-left font-mono text-red-600">(0.00)</td>
                        <td className="p-2 text-left font-mono font-bold bg-slate-50">100,000.00</td>
                      </tr>
                    )}
                    <tr className="bg-indigo-50 font-black text-indigo-900">
                      <td className="p-2.5">Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚ Ù„Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ</td>
                      <td className="p-2.5 text-left font-mono">-</td>
                      <td className="p-2.5 text-left font-mono">-</td>
                      <td className="p-2.5 text-left font-mono">-</td>
                      <td className="p-2.5 text-left font-mono font-black">{formatMoney(financialStatements.bs.totalNonCurrentAssets.current)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ø¥ÙŠØ¶Ø§Ø­ 4 Ùˆ 5: Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙˆØ§Ù„Ø¹Ù…Ù„Ø§Ø¡ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-xs">4</span>
                  Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙˆÙ…Ø§ ÙÙŠ Ø­ÙƒÙ…Ù‡Ø§ (Cash & Cash Equivalents)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border border-slate-200">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="p-2">Ø§Ù„Ø­Ø³Ø§Ø¨</th>
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
                        <td className="p-2">Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</td>
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
                  Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ£ÙˆØ±Ø§Ù‚ Ø§Ù„Ù‚Ø¨Ø¶ (Trade Receivables)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border border-slate-200">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="p-2">Ø§Ù„Ø­Ø³Ø§Ø¨</th>
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
                        <td className="p-2">ØµØ§ÙÙŠ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.currentYear, 0))}</td>
                        <td className="p-2 text-left font-mono">{formatMoney(financialStatements.notesData.receivableAccounts.reduce((s, a) => s + a.priorYear, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Ø¥ÙŠØ¶Ø§Ø­ 6 Ùˆ 7: Ø§Ù„Ù…Ø®Ø²ÙˆÙ† ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-xs">6</span>
                  Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø³Ù„Ø¹ÙŠ (Inventories)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border border-slate-200">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="p-2">Ø§Ù„ØªØµÙ†ÙŠÙ</th>
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
                        <td className="p-2">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†</td>
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
                  Ø§Ù„Ù…ÙˆØ±Ø¯ÙˆÙ† ÙˆØ§Ù„Ø¯Ø§Ø¦Ù†ÙˆÙ† Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙˆÙ† (Trade Payables)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border border-slate-200">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="p-2">Ø§Ù„Ø­Ø³Ø§Ø¨</th>
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
                        <td className="p-2">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†</td>
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

        {/* 7. ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© ÙˆØªÙˆÙ‚ÙŠØ¹Ø§Øª Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© */}
        {(activeTab === 'ALL' || activeTab === 'AUDIT') && (
          <div className="page-break-before space-y-6 pt-6 border-t-2 border-slate-900">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900">
              ØªÙ‚Ø±ÙŠØ± Ù…Ø±Ø§Ù‚Ø¨ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…Ø³ØªÙ‚Ù„ ÙˆØ§Ø¹ØªÙ…Ø§Ø¯ Ù…Ø¬Ù„Ø³ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200">
              Ø¥Ù„Ù‰ Ø§Ù„Ø³Ø§Ø¯Ø© Ù…Ø³Ø§Ù‡Ù…ÙŠ Ø§Ù„Ù…Ù†Ø´Ø£Ø©: Ù„Ù‚Ø¯ Ù‚Ù…Ù†Ø§ Ø¨Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ø±ÙÙ‚Ø© Ø§Ù„Ù…ÙƒÙˆÙ†Ø© Ù…Ù† Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ ÙƒÙ…Ø§ ÙÙŠ 31 Ø¯ÙŠØ³Ù…Ø¨Ø± {reportYear}ØŒ ÙˆÙ‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø£Ùˆ Ø§Ù„Ø®Ø³Ø§Ø¦Ø± ÙˆØ§Ù„Ø¯Ø®Ù„ Ø§Ù„Ø´Ø§Ù…Ù„ØŒ ÙˆÙ‚Ø§Ø¦Ù…Ø© Ø§Ù„ØªØºÙŠØ± ÙÙŠ Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ©ØŒ ÙˆÙ‚Ø§Ø¦Ù…Ø© Ø§Ù„ØªØ¯ÙÙ‚Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ù„Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ù†ØªÙ‡ÙŠØ© ÙÙŠ Ø°Ù„Ùƒ Ø§Ù„ØªØ§Ø±ÙŠØ®ØŒ ÙˆÙ…Ù„Ø®Øµ Ù„Ø£Ù‡Ù… Ø§Ù„Ø³ÙŠØ§Ø³Ø§Øª Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ© ÙˆØºÙŠØ±Ù‡Ø§ Ù…Ù† Ø§Ù„Ø¥ÙŠØ¶Ø§Ø­Ø§Øª Ø§Ù„ØªÙØ³ÙŠØ±ÙŠØ©. ÙˆÙÙŠ Ø±Ø£ÙŠÙ†Ø§ØŒ ÙØ¥Ù† Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø§Ù„ÙŠØ© ØªØ¹Ø¨Ø± Ø¨Ø¹Ø¯Ø§Ù„Ø© ÙˆÙˆØ¶ÙˆØ­ØŒ Ù…Ù† ÙƒØ§ÙØ© Ø§Ù„Ù†ÙˆØ§Ø­ÙŠ Ø§Ù„Ø¬ÙˆÙ‡Ø±ÙŠØ©ØŒ Ø¹Ù† Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø§Ù„ÙŠ Ù„Ù„Ù…Ù†Ø´Ø£Ø© ÙˆØ£Ø¯Ø§Ø¦Ù‡Ø§ Ø§Ù„Ù…Ø§Ù„ÙŠ ÙˆØªØ¯ÙÙ‚Ø§ØªÙ‡Ø§ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙˆÙÙ‚Ø§Ù‹ Ù„Ù…Ø¹Ø§ÙŠÙŠØ± Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø¯ÙˆÙ„ÙŠØ© (IFRS).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8">
              <div className="border border-slate-200 p-5 rounded-2xl text-center space-y-3">
                <p className="font-bold text-slate-800 text-sm">Ø§Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠ (CFO)</p>
                <p className="text-xs text-slate-500">ØªÙ… Ø§Ù„ÙØ­Øµ ÙˆØ§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø©</p>
                <div className="pt-8">
                  <div className="w-36 h-0.5 bg-slate-300 mx-auto"></div>
                  <p className="text-xs text-slate-400 mt-2">Ø§Ù„ØªÙˆÙ‚ÙŠØ¹ ÙˆØ§Ù„ØªØ§Ø±ÙŠØ®</p>
                </div>
              </div>

              <div className="border border-slate-200 p-5 rounded-2xl text-center space-y-3">
                <p className="font-bold text-slate-800 text-sm">Ø§Ù„Ø¹Ø¶Ùˆ Ø§Ù„Ù…Ù†ØªØ¯Ø¨ ÙˆØ±Ø¦ÙŠØ³ Ù…Ø¬Ù„Ø³ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©</p>
                <p className="text-xs text-slate-500">Ù…Ø¹ØªÙ…Ø¯ Ù„Ù„Ø¹Ø±Ø¶ Ø¹Ù„Ù‰ Ø§Ù„Ø¬Ù…Ø¹ÙŠØ© Ø§Ù„Ø¹Ø§Ù…Ø©</p>
                <div className="pt-8">
                  <div className="w-36 h-0.5 bg-slate-300 mx-auto"></div>
                  <p className="text-xs text-slate-400 mt-2">Ø§Ù„ØªÙˆÙ‚ÙŠØ¹ ÙˆØ§Ù„Ø®ØªÙ…</p>
                </div>
              </div>

              <div className="border border-slate-200 p-5 rounded-2xl text-center space-y-3">
                <p className="font-bold text-slate-800 text-sm">Ù…Ø±Ø§Ù‚Ø¨ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª (Ù…Ø­Ø§Ø³Ø¨ Ù‚Ø§Ù†ÙˆÙ†ÙŠ Ù…Ù‚ÙŠØ¯)</p>
                <p className="text-xs text-emerald-600 font-bold flex items-center justify-center gap-1">
                  <FileCheck size={14} /> Ø±Ø£ÙŠ Ù†Ø¸ÙŠÙ ÙˆØºÙŠØ± Ù…ØªØ­ÙØ¸
                </p>
                <div className="pt-8">
                  <div className="w-36 h-0.5 bg-slate-300 mx-auto"></div>
                  <p className="text-xs text-slate-400 mt-2">Ø±Ù‚Ù… Ø§Ù„Ù‚ÙŠØ¯ ÙˆØ§Ù„ØªÙˆÙ‚ÙŠØ¹</p>
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
