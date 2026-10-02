import { logger } from '../../utils/logger';
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

  // Ø­Ø§Ù„Ø© Ø§Ù„ÙØ­Øµ ÙˆØ§Ù„Ù…Ø¤Ø´Ø±Ø§Øª (Diagnostics)
  const [diagLoading, setDiagLoading] = useState<boolean>(false);
  const [unpostedCount, setUnpostedCount] = useState<number>(0);
  const [trialDiff, setTrialDiff] = useState<number>(0);
  const [activeAssets, setActiveAssets] = useState<any[]>([]);
  const [totalAnnualDepreciation, setTotalAnnualDepreciation] = useState<number>(0);
  const [depAlreadyPosted, setDepAlreadyPosted] = useState<boolean>(false);
  const [netProfitEstimate, setNetProfitEstimate] = useState<number>(0);
  const [taxProvisionEstimate, setTaxProvisionEstimate] = useState<number>(0);

  // ØªØ­Ø¯ÙŠØ« ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± Ø§Ù„Ø³Ù†Ø©
  useEffect(() => {
    setClosingDate(`${year}-12-31`);
  }, [year]);

  // ØªØ´ØºÙŠÙ„ Ø§Ù„ÙØ­Øµ Ø§Ù„Ù…Ø§Ù„ÙŠ Ø§Ù„Ø´Ø§Ù…Ù„ Ù„Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø®ØªØ§Ø±Ø©
  const runDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || session?.user?.user_metadata?.org_id || (organization as any)?.id;

      // 1. ÙØ­Øµ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø³ÙˆØ¯Ø© ØºÙŠØ± Ø§Ù„Ù…Ø±Ø­Ù„Ø©
      let qDraft = supabase
        .from('journal_entries')
        .select('id', { count: 'exact' })
        .eq('status', 'draft')
        .gte('transaction_date', `${year}-01-01`)
        .lte('transaction_date', `${year}-12-31`);
      if (userOrgId) qDraft = qDraft.eq('organization_id', userOrgId);
      const { count: drafts } = await qDraft;
      setUnpostedCount(drafts || 0);

      // 2. ÙØ­Øµ ØªÙˆØ§Ø²Ù† Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©
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

      // 3. ÙØ­Øµ Ø§Ù„Ø£ØµÙˆÙ„ ÙˆØ­Ø³Ø§Ø¨ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø³Ù†ÙˆÙŠ
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

      // 4. Ø§Ù„ØªØ­Ù‚Ù‚ Ù‡Ù„ ØªÙ… ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø¥Ù‡Ù„Ø§Ùƒ Ù…Ø³Ø¨Ù‚ Ù„Ù‡Ø°Ù‡ Ø§Ù„Ø³Ù†Ø©
      let qDepEntry = supabase
        .from('journal_entries')
        .select('id')
        .eq('status', 'posted')
        .ilike('reference', `%DEP%${year}%`);
      if (userOrgId) qDepEntry = qDepEntry.eq('organization_id', userOrgId);
      const { data: depEntry } = await qDepEntry;
      setDepAlreadyPosted(Boolean(depEntry && depEntry.length > 0));

      // 5. ØªÙ‚Ø¯ÙŠØ± ØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­ ÙˆØ§Ù„Ø¶Ø±ÙŠØ¨Ø©
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

    } catch (e) {
      logger.error('Diagnostic error:', e);
      showToast('Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªØ´ØºÙŠÙ„ Ø§Ù„ÙØ­Øµ: ' + e.message, 'error');
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, [year, currentSelectedOrgId]);

  // ØªÙˆÙ„ÙŠØ¯ ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø§Ù„Ø¢Ù„ÙŠ
  const handleGenerateDepreciationEntry = async () => {
    if (totalAnnualDepreciation <= 0) {
      showToast('Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø¨Ø§Ù„Øº Ø¥Ù‡Ù„Ø§Ùƒ Ø³Ù†ÙˆÙŠØ© Ù…Ø³ØªØ­Ù‚Ø© Ù„Ù„Ø§Ø­ØªØ³Ø§Ø¨.', 'info');
      return;
    }

    if (!window.confirm(`Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† ØªÙˆÙ„ÙŠØ¯ ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø³Ù†ÙˆÙŠ Ù„Ø¹Ø§Ù… ${year} Ø¨Ù…Ø¨Ù„Øº Ø¥Ø¬Ù…Ø§Ù„ÙŠ ${totalAnnualDepreciation.toLocaleString()} Ø¬.Ù…ØŸ`)) {
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = currentSelectedOrgId || session?.user?.user_metadata?.org_id || (organization as any)?.id;

      // Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø­Ø³Ø§Ø¨ Ù…ØµØ±ÙˆÙ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ (533) ÙˆÙ…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ (1119)
      const depExpAccount = accounts.find(a => String(a.code).startsWith('533') || a.name.includes('Ù…ØµØ±ÙˆÙ Ø¥Ù‡Ù„Ø§Ùƒ'));
      const accDepAccount = accounts.find(a => String(a.code).startsWith('1119') || a.name.includes('Ù…Ø¬Ù…Ø¹ Ø¥Ù‡Ù„Ø§Ùƒ'));

      if (!depExpAccount || !accDepAccount) {
        throw new Error('ÙŠØ±Ø¬Ù‰ Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† ÙˆØ¬ÙˆØ¯ Ø­Ø³Ø§Ø¨ Ù…ØµØ±ÙˆÙ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ (533) ÙˆØ­Ø³Ø§Ø¨ Ù…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ (1119) ÙÙŠ Ø´Ø¬Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª.');
      }

      // Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù‚ÙŠØ¯ ÙÙŠ journal_entries
      const { data: entry, error: entryErr } = await supabase
        .from('journal_entries')
        .insert({
          organization_id: userOrgId,
          reference: `DEP-${year}`,
          entry_type: 'depreciation',
          transaction_date: closingDate,
          description: `Ø¥Ø«Ø¨Ø§Øª Ù‚Ø³Ø· Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø³Ù†ÙˆÙŠ Ù„Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ© Ø¹Ù† Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© ${year}`,
          status: 'posted'
        })
        .select()
        .single();

      if (entryErr) throw entryErr;

      // Ø¥Ù†Ø´Ø§Ø¡ Ø£Ø³Ø·Ø± Ø§Ù„Ù‚ÙŠØ¯
      const lines = [
        {
          journal_entry_id: entry.id,
          account_id: depExpAccount.id,
          debit: totalAnnualDepreciation,
          credit: 0,
          description: `Ù…ØµØ±ÙˆÙ Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø¹Ù† Ø¹Ø§Ù… ${year}`
        },
        {
          journal_entry_id: entry.id,
          account_id: accDepAccount.id,
          debit: 0,
          credit: totalAnnualDepreciation,
          description: `Ù…Ø¬Ù…Ø¹ Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø¹Ù† Ø¹Ø§Ù… ${year}`
        }
      ];

      const { error: linesErr } = await supabase.from('journal_lines').insert(lines);
      if (linesErr) throw linesErr;

      showToast(`ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø¨Ù†Ø¬Ø§Ø­ Ø¨Ø±Ù‚Ù… Ù…Ø±Ø¬Ø¹ÙŠ DEP-${year} âœ…`, 'success');
      setDepAlreadyPosted(true);
      runDiagnostics();
    } catch (err) {
      logger.error('Depreciation entry error:', err);
      showToast('ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ØªÙ†ÙÙŠØ° Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø®ØªØ§Ù…ÙŠ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ
  const handleExecuteClosing = async () => {
    if (!year || year < 2000 || year > 2099) {
      showToast('ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø³Ù†Ø© Ù…Ø§Ù„ÙŠØ© ØµØ­ÙŠØ­Ø©.', 'error');
      return;
    }

    if (!window.confirm(`Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ ØªÙ…Ø§Ù…Ø§Ù‹ Ù…Ù† Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø®ØªØ§Ù…ÙŠ Ù„Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© ${year}ØŸ\n\nâ€¢ Ø³ÙŠØªÙ… ØªØµÙÙŠØ± Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª ÙˆØ§Ù„Ù…ØµØ±ÙˆÙØ§Øª Ø¨Ø§Ù„ÙƒØ§Ù…Ù„.\nâ€¢ ØªØ±Ø­ÙŠÙ„ ØµØ§ÙÙŠ Ø£Ø±Ø¨Ø§Ø­/Ø®Ø³Ø§Ø¦Ø± Ø§Ù„Ø¹Ø§Ù… Ø¥Ù„Ù‰ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø¨Ù‚Ø§Ø© (32).\nâ€¢ Ù‚ÙÙ„ Ø§Ù„Ø­Ø±ÙƒØ§Øª ÙˆØ¥ØµØ¯Ø§Ø± Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‚ÙØ§Ù„ CLOSE-${year}.`)) {
      return;
    }

    setLoading(true);
    try {
      const success = await closeFinancialYear(year, closingDate);
      if (success) {
        setCompletedSuccess(true);
      }
    } catch (error) {
      showToast('ÙØ´Ù„ Ø§Ù„Ø¥Ù‚ÙØ§Ù„: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­ Ø³Ù†Ø© Ù…ØºÙ„Ù‚Ø©
  const handleReopen = async () => {
    if (!reopenYearVal) {
      showToast('ÙŠØ±Ø¬Ù‰ ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø±Ø§Ø¯ Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­Ù‡Ø§.', 'error');
      return;
    }

    if (!window.confirm(`Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© ${reopenYearVal}ØŸ\n\nâ€¢ Ø³ÙŠØªÙ… Ø¥Ù„ØºØ§Ø¡ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø³Ù†ÙˆÙŠ.\nâ€¢ Ø§Ù„Ø³Ù…Ø§Ø­ Ø¨ØªØ¹Ø¯ÙŠÙ„ ÙˆØ¥Ø¶Ø§ÙØ© Ø§Ù„Ù‚ÙŠÙˆØ¯ ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„Ø³Ù†Ø© Ù…Ø¤Ù‚ØªØ§Ù‹.\nâ€¢ ÙŠØ¬Ø¨ Ø¥Ø¹Ø§Ø¯Ø© Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø³Ù†Ø© ÙÙˆØ± Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ Ù…Ù† Ø§Ù„ØªØ¹Ø¯ÙŠÙ„Ø§Øª.`)) {
      return;
    }

    setLoading(true);
    try {
      const success = await reopenFinancialYear(Number(reopenYearVal));
      if (success) {
        showToast(`ØªÙ… ÙØªØ­ Ø§Ù„Ø³Ù†Ø© ${reopenYearVal} Ø¨Ù†Ø¬Ø§Ø­ØŒ ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø¢Ù† ØªØ¹Ø¯ÙŠÙ„ ÙˆØ¥Ø¶Ø§ÙØ© Ø§Ù„Ø­Ø±ÙƒØ§Øª.`, 'success');
        runDiagnostics();
      }
    } catch (error) {
      showToast('ÙØ´Ù„ Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­ Ø§Ù„Ø³Ù†Ø©: ' + error.message, 'error');
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
        <h2 className="text-3xl font-black text-slate-900 mb-2">ØªÙ… Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© {year} Ø¨Ù†Ø¬Ø§Ø­!</h2>
        <p className="text-slate-500 mb-6 leading-relaxed text-sm">
          ØªÙ… ØªØµÙÙŠØ± Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª ÙˆØ§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§ØªØŒ ÙˆØªØ±Ø­ÙŠÙ„ ØµØ§ÙÙŠ Ø§Ù„Ù†ØªÙŠØ¬Ø© Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø¨Ù‚Ø§Ø© (32)ØŒ ÙˆØªÙˆÙ„ÙŠØ¯ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø¢Ù„ÙŠ <span className="font-mono font-bold text-indigo-600">CLOSE-{year}</span> Ø¨Ù†Ø¬Ø§Ø­.
        </p>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-emerald-900 text-xs font-bold mb-8 text-right space-y-2">
          <p className="flex items-center gap-2"><Sparkles size={16} /> Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ù…ÙØªÙˆØ­Ø© ÙˆØ¬Ø§Ù‡Ø²Ø© Ù„Ø§Ø³ØªÙ‚Ø¨Ø§Ù„ Ø§Ù„Ø­Ø±ÙƒØ§Øª Ù…Ø¨Ø§Ø´Ø±Ø©.</p>
          <p className="flex items-center gap-2"><Sparkles size={16} /> ÙƒØ§ÙØ© Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø£ØµÙˆÙ„ ÙˆØ§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª ÙˆØ­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ© ØªÙ… ØªØ¯ÙˆÙŠØ±Ù‡Ø§ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ÙƒØ£Ø±ØµØ¯Ø© ØªØ±Ø§ÙƒÙ…ÙŠØ© Ù…Ø³ØªÙ…Ø±Ø©.</p>
        </div>

        <div className="flex gap-4 justify-center">
          <button 
            onClick={() => { setCompletedSuccess(false); setWizardStep(1); }} 
            className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition"
          >
            Ø¥Ø¬Ø±Ø§Ø¡ Ø¹Ù…Ù„ÙŠØ© Ø£Ø®Ø±Ù‰
          </button>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg"
          >
            ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù†Ø¸Ø§Ù…
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in pb-12" dir="rtl">
      {/* Ø§Ù„Ø±Ø£Ø³ ÙˆØ§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø£Ù†Ù…Ø§Ø· */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <Lock size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              Ù…Ø¹Ø§Ù„Ø¬ Ù‚ÙŠÙˆØ¯ Ø§Ù„ØªØ³ÙˆÙŠØ§Øª Ø§Ù„Ø®ØªØ§Ù…ÙŠØ© ÙˆØ§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø³Ù†ÙˆÙŠ
              <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-2.5 py-0.5 rounded-full">
                Year-End Closing Wizard
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              ØªØ³ÙˆÙŠØ© Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø¢Ù„ÙŠØŒ Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù…Ø®ØµØµØ§ØªØŒ ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø¨Ù‚Ø§Ø© ÙˆÙ‚ÙÙ„ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©
            </p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
          <button 
            onClick={() => setActiveTab('wizard')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition ${activeTab === 'wizard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            ðŸ§™â€â™‚ï¸ Ù…Ø¹Ø§Ù„Ø¬ Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ù…ÙˆØ¬Ù‡
          </button>
          <button 
            onClick={() => setActiveTab('quick_close')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition ${activeTab === 'quick_close' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            âš¡ Ø¥Ù‚ÙØ§Ù„ Ù…Ø¨Ø§Ø´Ø±
          </button>
          <button 
            onClick={() => setActiveTab('reopen')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition ${activeTab === 'reopen' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            ðŸ”“ Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­ Ø³Ù†Ø©
          </button>
        </div>
      </div>

      {/* 1. Ù…Ø¹Ø§Ù„Ø¬ Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ù…ÙˆØ¬Ù‡ Ù…ØªØ¹Ø¯Ø¯ Ø§Ù„Ù…Ø±Ø§Ø­Ù„ */}
      {activeTab === 'wizard' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
          {/* Ø®Ø·ÙˆØ§Øª Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬ */}
          <div className="grid grid-cols-4 gap-2 border-b border-slate-100 pb-6">
            {[
              { num: 1, title: 'Ø§Ù„ÙØ­Øµ Ø§Ù„Ù…Ø§Ù„ÙŠ', desc: 'ØªÙˆØ§Ø²Ù† Ø§Ù„Ù…ÙŠØ²Ø§Ù† ÙˆØ§Ù„Ù‚ÙŠÙˆØ¯' },
              { num: 2, title: 'Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„', desc: 'Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø¢Ù„ÙŠ' },
              { num: 3, title: 'ØªØ³ÙˆÙŠØ© Ø§Ù„Ø¶Ø±Ø§Ø¦Ø¨', desc: 'Ù…Ø®ØµØµ Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ø¯Ø®Ù„' },
              { num: 4, title: 'Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø®ØªØ§Ù…ÙŠ', desc: 'ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ ÙˆÙ‚ÙÙ„ Ø§Ù„Ø³Ù†Ø©' }
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
                      {isPast ? 'âœ“' : s.num}
                    </span>
                    <span className="font-bold">{s.title}</span>
                  </div>
                  <p className="text-[10px] opacity-80 truncate">{s.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Ø§Ù„Ø®Ø·ÙˆØ© 1: Ø§Ù„ÙØ­Øµ Ø§Ù„Ù…Ø§Ù„ÙŠ ÙˆØ§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø© */}
          {wizardStep === 1 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰: ÙØ­Øµ ÙˆÙ…Ø·Ø§Ø¨Ù‚Ø© Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© ÙˆØ§Ù„Ù‚ÙŠÙˆØ¯</h3>
                  <p className="text-xs text-slate-500">Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø§ÙƒØªÙ…Ø§Ù„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠÙˆØ¯ ÙˆØªÙˆØ§Ø²Ù† Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ù‚Ø¨Ù„ Ø§Ù„Ø¥Ù‚ÙØ§Ù„</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©:</span>
                  <select
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className="border border-slate-300 rounded-xl px-3 py-1.5 font-black text-indigo-700 text-sm focus:outline-none"
                  >
                    {[2027, 2026, 2025, 2024, 2023].map(y => (
                      <option key={y} value={y}>Ø³Ù†Ø© {y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* ÙØ­Øµ ØªÙˆØ§Ø²Ù† Ø§Ù„Ù…ÙŠØ²Ø§Ù† */}
                <div className={`p-5 rounded-2xl border ${trialDiff === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {trialDiff === 0 ? <CheckCircle2 className="text-emerald-600" size={20} /> : <AlertTriangle className="text-red-600" size={20} />}
                    <span className="text-xs font-bold text-slate-800">ØªÙˆØ§Ø²Ù† Ù…ÙŠØ²Ø§Ù† Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©</span>
                  </div>
                  <p className="text-xl font-black font-mono">
                    {trialDiff === 0 ? 'Ù…ØªØ·Ø§Ø¨Ù‚ (0.00 Ø¬.Ù…)' : `ÙØ§Ø±Ù‚: ${trialDiff.toLocaleString()} Ø¬.Ù…`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {trialDiff === 0 ? 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¯ÙŠÙ† ÙŠØ³Ø§ÙˆÙŠ Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¯Ø§Ø¦Ù† ØªÙ…Ø§Ù…Ø§Ù‹.' : 'ÙŠØ¬Ø¨ Ù…Ø¹Ø§Ù„Ø¬Ø© Ø§Ù„ÙØ§Ø±Ù‚ Ù‚Ø¨Ù„ Ø§Ù„Ø¥Ù‚ÙØ§Ù„.'}
                  </p>
                </div>

                {/* ÙØ­Øµ Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø³ÙˆØ¯Ø© */}
                <div className={`p-5 rounded-2xl border ${unpostedCount === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {unpostedCount === 0 ? <CheckCircle2 className="text-emerald-600" size={20} /> : <AlertTriangle className="text-amber-600" size={20} />}
                    <span className="text-xs font-bold text-slate-800">Ù…Ø³ÙˆØ¯Ø§Øª Ø§Ù„Ù‚ÙŠÙˆØ¯</span>
                  </div>
                  <p className="text-xl font-black font-mono">
                    {unpostedCount === 0 ? 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø³ÙˆØ¯Ø§Øª Ù…Ø¹Ù„Ù‚Ø©' : `${unpostedCount} Ù‚ÙŠØ¯ Ù…Ø³ÙˆØ¯Ø©`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {unpostedCount === 0 ? 'Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù‚ÙŠÙˆØ¯ ÙÙŠ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ù…Ø±Ø­Ù„Ø©.' : 'ÙŠÙˆØµÙ‰ Ø¨ØªØ±Ø­ÙŠÙ„ Ø£Ùˆ Ø­Ø°Ù Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ù…Ø³ÙˆØ¯Ø©.'}
                  </p>
                </div>

                {/* Ù…Ø¤Ø´Ø± Ø§Ù„Ø¬Ø§Ù‡Ø²ÙŠØ© */}
                <div className="p-5 rounded-2xl border bg-slate-50 border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="text-indigo-600" size={20} />
                    <span className="text-xs font-bold text-slate-800">Ø¬Ø§Ù‡Ø²ÙŠØ© Ø§Ù„Ø¥Ù‚ÙØ§Ù„</span>
                  </div>
                  <p className="text-xl font-black text-indigo-700">
                    {trialDiff === 0 && unpostedCount === 0 ? 'Ù…ÙƒØªÙ…Ù„Ø© 100%' : 'ØªØªØ·Ù„Ø¨ Ù…Ø±Ø§Ø¬Ø¹Ø©'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ù„Ø®Ø·ÙˆØ© Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  onClick={() => setWizardStep(2)}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm"
                >
                  Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ§Ù„ÙŠØ©: Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø³Ù†ÙˆÙŠ
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Ø§Ù„Ø®Ø·ÙˆØ© 2: Ø§Ø­ØªØ³Ø§Ø¨ ÙˆØ¥Ø«Ø¨Ø§Øª Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø³Ù†ÙˆÙŠ */}
          {wizardStep === 2 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø«Ø§Ù†ÙŠØ©: Ù…Ø¹Ø§Ù„Ø¬ Ø§Ø­ØªØ³Ø§Ø¨ ÙˆØ¥Ø«Ø¨Ø§Øª Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø³Ù†ÙˆÙŠ</h3>
                  <p className="text-xs text-slate-500">Ø§Ø­ØªØ³Ø§Ø¨ Ù‚Ø³Ø· Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø³Ù†ÙˆÙŠ Ù„Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ù…Ø³Ø¬Ù„Ø© ÙˆØªÙˆÙ„ÙŠØ¯ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø¢Ù„ÙŠØ§Ù‹</p>
                </div>

                {depAlreadyPosted && (
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> ØªÙ… ØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ù„Ø¹Ø§Ù… {year} Ù…Ø³Ø¨Ù‚Ø§Ù‹
                  </span>
                )}
              </div>

              {/* Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ù…Ø­ØªØ³Ø¨ Ø¥Ù‡Ù„Ø§ÙƒÙ‡Ø§ */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Ø§Ø³Ù… Ø§Ù„Ø£ØµÙ„</th>
                      <th className="p-3 text-left">Ø§Ù„ØªÙƒÙ„ÙØ©</th>
                      <th className="p-3 text-left">Ø§Ù„Ø®Ø±Ø¯Ø©</th>
                      <th className="p-3 text-center">Ø§Ù„Ø¹Ù…Ø± (Ø³Ù†ÙˆØ§Øª)</th>
                      <th className="p-3 text-left bg-indigo-50/60 text-indigo-950 font-black">Ù‚Ø³Ø· Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø³Ù†ÙˆÙŠ ({year})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeAssets.length > 0 ? (
                      activeAssets.map((asset: Record<string, any>) => (
                        <tr key={asset.id}>
                          <td className="p-3 font-medium text-slate-800">{asset.name}</td>
                          <td className="p-3 text-left font-mono">{Number(asset.purchase_cost || asset.purchaseCost || 0).toLocaleString()} Ø¬.Ù…</td>
                          <td className="p-3 text-left font-mono">{Number(asset.salvage_value || asset.salvageValue || 0).toLocaleString()} Ø¬.Ù…</td>
                          <td className="p-3 text-center font-mono">{asset.useful_life_years || asset.usefulLife || 5}</td>
                          <td className="p-3 text-left font-mono font-bold text-indigo-700 bg-indigo-50/30">
                            {Number(asset.calculatedAnnualDep || 0).toLocaleString()} Ø¬.Ù…
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 font-medium">
                          Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£ØµÙˆÙ„ Ù…Ø³Ø¬Ù„Ø© ÙÙŠ Ø³Ø¬Ù„ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ©.
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-100 font-black">
                      <td colSpan={4} className="p-3">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ù‚Ø³Ø· Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨ Ø¥Ø«Ø¨Ø§ØªÙ‡:</td>
                      <td className="p-3 text-left font-mono text-base text-indigo-900">
                        {totalAnnualDepreciation.toLocaleString()} Ø¬.Ù…
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Ø²Ø± ØªÙˆÙ„ÙŠØ¯ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-800">Ù‚ÙŠØ¯ Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ø§Ù„Ù…Ù‚ØªØ±Ø­ Ù„Ù„Ø¥Ù‡Ù„Ø§Ùƒ:</p>
                  <p className="text-xs text-slate-500 font-mono">
                    Ù…Ù† Ø­Ù€/ Ù…ØµØ±ÙˆÙ Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ (533) Ø¥Ù„Ù‰ Ø­Ù€/ Ù…Ø¬Ù…Ø¹ Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ© (1119)
                  </p>
                </div>

                <button
                  onClick={handleGenerateDepreciationEntry}
                  disabled={loading || depAlreadyPosted || totalAnnualDepreciation <= 0}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-indigo-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                  {depAlreadyPosted ? 'ØªÙ… ØªÙˆÙ„ÙŠØ¯ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ù…Ø³Ø¨Ù‚Ø§Ù‹' : 'ØªÙˆÙ„ÙŠØ¯ ÙˆØªØ±Ø­ÙŠÙ„ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ Ø§Ù„Ø³Ù†ÙˆÙŠ Ø§Ù„Ø¢Ù†'}
                </button>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setWizardStep(1)}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Ø§Ù„Ø³Ø§Ø¨Ù‚
                </button>
                <button
                  onClick={() => setWizardStep(3)}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm"
                >
                  Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ§Ù„ÙŠØ©: ØªØ³ÙˆÙŠØ© Ø§Ù„Ø¶Ø±Ø§Ø¦Ø¨ ÙˆØ§Ù„Ù…Ø®ØµØµØ§Øª
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Ø§Ù„Ø®Ø·ÙˆØ© 3: ØªØ³ÙˆÙŠØ© Ù…Ø®ØµØµ Ø¶Ø±Ø§Ø¦Ø¨ Ø§Ù„Ø¯Ø®Ù„ */}
          {wizardStep === 3 && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h3 className="text-lg font-black text-slate-900">Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø«Ø§Ù„Ø«Ø©: ØªÙ‚Ø¯ÙŠØ± ÙˆØªØ³ÙˆÙŠØ© Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ø¯Ø®Ù„ Ø§Ù„Ø³Ù†ÙˆÙŠØ©</h3>
                <p className="text-xs text-slate-500">Ø§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„ØªÙ‚Ø¯ÙŠØ±ÙŠØ© Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ ØµØ§ÙÙŠ Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ø¹Ø§Ù… Ø§Ù„Ø®Ø§Ø¶Ø¹Ø© Ù„Ù„Ø¶Ø±ÙŠØ¨Ø©</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                  <span className="text-xs font-bold text-slate-500">ØµØ§ÙÙŠ Ø±Ø¨Ø­ Ø§Ù„Ø¹Ø§Ù… Ø§Ù„Ù…Ù‚Ø¯Ø± (Ù‚Ø¨Ù„ Ø§Ù„Ø¶Ø±ÙŠØ¨Ø©)</span>
                  <h4 className="text-2xl font-black font-mono text-slate-900">
                    {netProfitEstimate.toLocaleString()} Ø¬.Ù…
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Ù…Ø­Ø³ÙˆØ¨ Ù…Ù† Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ù…Ø·Ø±ÙˆØ­Ø§Ù‹ Ù…Ù†Ù‡ ÙƒØ§ÙØ© ØªÙƒØ§Ù„ÙŠÙ ÙˆÙ…ØµØ±ÙˆÙØ§Øª Ø§Ù„Ø³Ù†Ø© {year}.
                  </p>
                </div>

                <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-200 space-y-3">
                  <span className="text-xs font-bold text-indigo-700">Ù…Ø®ØµØµ Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ø¯Ø®Ù„ Ø§Ù„ØªÙ‚Ø¯ÙŠØ±ÙŠ (22.5%)</span>
                  <h4 className="text-2xl font-black font-mono text-indigo-900">
                    {taxProvisionEstimate.toLocaleString()} Ø¬.Ù…
                  </h4>
                  <p className="text-xs text-indigo-600 leading-relaxed">
                    Ø§Ù„Ù†Ø³Ø¨Ø© Ø§Ù„Ù‚Ø§Ù†ÙˆÙ†ÙŠØ© Ø§Ù„Ù‚ÙŠØ§Ø³ÙŠØ© Ù„Ø¶Ø±ÙŠØ¨Ø© Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ø´Ø±ÙƒØ§Øª Ø§Ù„Ù…Ø³Ø§Ù‡Ù…Ø© ÙˆØ§Ù„ØªØ¬Ø§Ø±ÙŠØ©.
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Ù…Ù„Ø§Ø­Ø¸Ø© Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ Ø§Ù„Ù‚Ø§Ù†ÙˆÙ†ÙŠ:
                </p>
                <p className="leading-relaxed">
                  Ø¥Ø°Ø§ ÙƒØ§Ù† Ù„Ø¯ÙŠÙƒ Ø¥Ù‚Ø±Ø§Ø± Ø¶Ø±ÙŠØ¨ÙŠ Ù†Ù‡Ø§Ø¦ÙŠ Ø£Ùˆ ØªØ³ÙˆÙŠØ§Øª Ù…Ø¹ØªÙ…Ø¯Ø© Ù…Ù† Ù…Ø±Ø§Ù‚Ø¨ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§ØªØŒ ÙŠØ±Ø¬Ù‰ ØªØ³Ø¬ÙŠÙ„ Ù‚ÙŠØ¯ Ù…Ø®ØµØµ Ø§Ù„Ø¶Ø±ÙŠØ¨Ø© Ù…Ù† Ø´Ø§Ø´Ø© Ø¯ÙØªØ± Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ù‚Ø¨Ù„ ØªÙ†ÙÙŠØ° Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø®ØªØ§Ù…ÙŠ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ.
                </p>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setWizardStep(2)}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Ø§Ù„Ø³Ø§Ø¨Ù‚
                </button>
                <button
                  onClick={() => setWizardStep(4)}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm"
                >
                  Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø£Ø®ÙŠØ±Ø©: Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Ø§Ù„Ø®Ø·ÙˆØ© 4: Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø®ØªØ§Ù…ÙŠ ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø¨Ù‚Ø§Ø© */}
          {wizardStep === 4 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="bg-red-50 border border-red-200 p-6 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-red-800 font-black text-base">
                  <Lock size={20} />
                  ØªÙ†ÙÙŠØ° Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø³Ù†ÙˆÙŠ ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù†ØªÙŠØ¬Ø© Ø¥Ù„Ù‰ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø¨Ù‚Ø§Ø© (32)
                </div>
                <p className="text-xs text-red-700 leading-relaxed">
                  Ø³ÙŠÙ‚ÙˆÙ… Ø§Ù„Ù†Ø¸Ø§Ù… Ø¢Ù„ÙŠØ§Ù‹ Ø¨ØªÙˆÙ„ÙŠØ¯ Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø³Ù†ÙˆÙŠ <span className="font-mono font-bold">CLOSE-{year}</span>ØŒ ÙˆØªØµÙÙŠØ± ÙƒØ§ÙØ© Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª ÙˆØ§Ù„Ù…ØµØ±ÙˆÙØ§ØªØŒ ÙˆØªØ±Ø­ÙŠÙ„ ØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­ ÙˆÙ‚ÙÙ„ Ø§Ù„Ø³Ù†Ø© Ø¶Ø¯ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ù‚ÙÙ„Ø©</label>
                  <input
                    type="text"
                    value={year}
                    readOnly
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 font-black text-slate-800 bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">ØªØ§Ø±ÙŠØ® Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‚ÙØ§Ù„</label>
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
                {loading ? 'Ø¬Ø§Ø±ÙŠ Ù…Ø¹Ø§Ù„Ø¬Ø© Ø§Ù„Ù‚ÙŠÙˆØ¯ ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ø£Ø±ØµØ¯Ø©...' : `ØªÙ†ÙÙŠØ° Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ Ù„Ø³Ù†Ø© ${year} Ø§Ù„Ø¢Ù†`}
              </button>

              <div className="flex justify-start pt-4 border-t border-slate-100">
                <button
                  onClick={() => setWizardStep(3)}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Ø§Ù„Ø³Ø§Ø¨Ù‚
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ø§Ù„Ø³Ø±ÙŠØ¹ */}
      {activeTab === 'quick_close' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={24} />
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-bold text-sm mb-1">ØªØ¹Ù„ÙŠÙ…Ø§Øª Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ø§Ù„Ø³Ø±ÙŠØ¹:</p>
              <ul className="list-disc list-inside space-y-1 opacity-90">
                <li>Ø³ÙŠØªÙ… ÙÙˆØ±Ø§Ù‹ ØªØµÙÙŠØ± Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª (5xxx) ÙˆØ§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª (4xxx) Ø¨Ù‚ÙŠØ¯ <span className="font-mono font-bold">CLOSE-{year}</span>.</li>
                <li>ØªØ±Ø­ÙŠÙ„ ØµØ§ÙÙŠ Ø§Ù„Ø¯Ø®Ù„ Ù…Ø¨Ø§Ø´Ø±Ø© Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø¨Ù‚Ø§Ø© (32).</li>
                <li>Ø¨Ø¯Ø¡ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ø¨Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø£ØµÙˆÙ„ ÙˆØ§Ù„Ø§Ù„ØªØ²Ø§Ù…Ø§Øª Ø§Ù„Ù…Ø³ØªÙ…Ø±Ø© ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹.</li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©</label>
              <input
                type="number" 
                value={year} 
                onChange={e => setYear(parseInt(e.target.value, 10) || 0)} 
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-lg focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">ØªØ§Ø±ÙŠØ® Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‚ÙØ§Ù„</label>
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
              {loading ? 'Ø¬Ø§Ø±ÙŠ Ù…Ø¹Ø§Ù„Ø¬Ø© Ø§Ù„Ù‚ÙŠÙˆØ¯ ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ø£Ø±ØµØ¯Ø©...' : 'ØªÙ†ÙÙŠØ° Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ù„Ù„Ø³Ù†Ø©'}
            </button>
          </div>
        </div>
      )}

      {/* 3. Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­ Ø³Ù†Ø© Ù…ØºÙ„Ù‚Ø© */}
      {activeTab === 'reopen' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex gap-3">
            <ShieldAlert className="text-blue-600 shrink-0 mt-0.5" size={24} />
            <div className="text-xs text-blue-800 space-y-1">
              <p className="font-bold text-sm mb-1">Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­ Ø³Ù†Ø© Ù…Ø§Ù„ÙŠØ© Ù…ØºÙ„Ù‚Ø© (Ù„Ù„ØªØµØ­ÙŠØ­ ÙˆØ§Ù„ØªØ¹Ø¯ÙŠÙ„):</p>
              <ul className="list-disc list-inside space-y-1 opacity-90">
                <li>ØªØªÙŠØ­ Ù„Ùƒ Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­ Ø¢Ø®Ø± Ø³Ù†Ø© Ù…ØºÙ„Ù‚Ø© Ù„Ø¥Ø¬Ø±Ø§Ø¡ ØªØ³ÙˆÙŠØ§Øª Ø£Ùˆ ØªØ¹Ø¯ÙŠÙ„ Ù‚ÙŠÙˆØ¯ Ù…Ø­Ø§Ø³Ø¨ÙŠØ©.</li>
                <li>ÙŠØªÙ… Ø­Ø°Ù Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø³Ø§Ø¨Ù‚ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ÙˆÙÙƒ Ø§Ù„Ø­Ø¸Ø± Ø¹Ù† Ø§Ù„ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…Ø­Ø¯Ø¯.</li>
                <li>ÙŠØ¬Ø¨ Ø¥Ø¹Ø§Ø¯Ø© ØªÙ†ÙÙŠØ° Ø§Ù„Ø¥Ù‚ÙØ§Ù„ Ø¨Ù…Ø¬Ø±Ø¯ Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ Ù…Ù† Ø§Ù„ØªØ³ÙˆÙŠØ§Øª Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©.</li>
              </ul>
            </div>
          </div>

          <div className="max-w-xs">
            <label className="block text-sm font-bold text-slate-700 mb-2">Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…ØºÙ„Ù‚Ø© Ø§Ù„Ù…Ø±Ø§Ø¯ Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­Ù‡Ø§</label>
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
              {loading ? 'Ø¬Ø§Ø±ÙŠ Ù…Ø¹Ø§Ù„Ø¬Ø© ÙØªØ­ Ø§Ù„Ø³Ù†Ø©...' : 'Ø¥Ø¹Ø§Ø¯Ø© ÙØªØ­ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiscalYearClosing;
