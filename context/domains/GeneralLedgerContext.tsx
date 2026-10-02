/**
 * ==============================================================================
 * TriPro ERP — General Ledger & Financial Reports Domain Context & Hook
 * context/domains/GeneralLedgerContext.tsx
 * ==============================================================================
 * مخصص لإدارة قيود اليومية، شجرة الحسابات، ميزان المراجعة، السجلات المالية، والسنوات المالية.
 * يدعم الاستخدام المباشر عبر GeneralLedgerProvider أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { JournalEntry, Account, CostCenter, Budget } from '../../types';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import { closeFinancialYearEngine, reopenFinancialYearEngine } from '../../services/financialYearService';

export interface FiscalYearRange {
  startDate: string;
  endDate: string;
}

export type JournalEntryItem = JournalEntry & Record<string, unknown>;

export interface GeneralLedgerDomainState {
  entries: JournalEntryItem[];
  accounts: Account[];
  costCenters: CostCenter[];
  budgets: Budget[];
  fiscalYearRange: FiscalYearRange;
  selectedFiscalYear: number;
  setSelectedFiscalYear: (year: number) => void;
  addEntry: (entry: Record<string, unknown>) => Promise<void>;
  fetchEntriesPaged: (page: number, pageSize: number) => Promise<{ data: JournalEntryItem[]; count: number }>;
  getAccountBalanceInPeriod: (id: string, start: string, end: string) => Promise<number>;
  saveBudget: (budget: Record<string, unknown>) => Promise<void>;
  exportJournalToCSV: () => void | Promise<void>;
  closeFinancialYear: (year: number, date: string) => Promise<boolean>;
  reopenFinancialYear: (year: number) => Promise<boolean>;
  recalculateAllBalances: () => Promise<void>;
  refreshLedger?: () => Promise<void>;
}

export const GeneralLedgerContext = createContext<GeneralLedgerDomainState | null>(null);

export interface GeneralLedgerProviderProps {
  children: React.ReactNode;
  orgId?: string;
  initialEntries?: JournalEntryItem[];
  initialAccounts?: Account[];
  initialCostCenters?: CostCenter[];
  initialBudgets?: Budget[];
  initialYear?: number;
}

export const GeneralLedgerProvider: React.FC<GeneralLedgerProviderProps> = ({
  children,
  orgId,
  initialEntries = [],
  initialAccounts = [],
  initialCostCenters = [],
  initialBudgets = [],
  initialYear = new Date().getFullYear(),
}) => {
  const [entries, setEntries] = useState<JournalEntryItem[]>(initialEntries);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [costCenters, setCostCenters] = useState<CostCenter[]>(initialCostCenters);
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<number>(initialYear);

  const fiscalYearRange: FiscalYearRange = {
    startDate: `${selectedFiscalYear}-01-01`,
    endDate: `${selectedFiscalYear}-12-31`
  };

  const fetchLedgerData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [accRes, entRes, ccRes, budRes] = await Promise.all([
        supabase
          .from('accounts')
          .select('*')
          .eq('organization_id', orgId)
          .order('code'),
        supabase
          .from('journal_entries')
          .select('*, journal_lines(*)')
          .eq('organization_id', orgId)
          .gte('transaction_date', fiscalYearRange.startDate)
          .lte('transaction_date', fiscalYearRange.endDate)
          .order('transaction_date', { ascending: false })
          .limit(1000),
        supabase
          .from('cost_centers')
          .select('*')
          .eq('organization_id', orgId)
          .order('code'),
        supabase
          .from('budgets')
          .select('*')
          .eq('organization_id', orgId)
      ]);

      if (accRes.error) {
        logger.error('Error fetching accounts in GeneralLedgerProvider:', accRes.error);
      } else {
        setAccounts((accRes.data as Account[]) || []);
      }

      if (entRes.error) {
        logger.error('Error fetching entries in GeneralLedgerProvider:', entRes.error);
      } else {
        setEntries((entRes.data as JournalEntryItem[]) || []);
      }

      if (ccRes.error) {
        logger.error('Error fetching cost centers in GeneralLedgerProvider:', ccRes.error);
      } else {
        setCostCenters((ccRes.data as CostCenter[]) || []);
      }

      if (budRes.error) {
        logger.error('Error fetching budgets in GeneralLedgerProvider:', budRes.error);
      } else {
        setBudgets((budRes.data as Budget[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching ledger data:', err);
    }
  }, [orgId, fiscalYearRange.startDate, fiscalYearRange.endDate]);

  useEffect(() => {
    if (orgId) {
      fetchLedgerData();
    }
  }, [orgId, fetchLedgerData]);

  const addEntry = useCallback(async (entry: Record<string, unknown>): Promise<void> => {
    const targetOrgId = (entry.p_org_id || entry.organization_id || orgId) as string | undefined;
    const lines = (entry.lines as Record<string, unknown>[]) || [];
    const sanitizedLines = lines
      .filter((l) => {
        const accId = l.accountId || l.account_id;
        return accId && typeof accId === 'string' && accId.trim() !== '' && (Number(l.debit) > 0 || Number(l.credit) > 0);
      })
      .map((l) => ({
        accountId: l.accountId || l.account_id,
        account_id: l.accountId || l.account_id,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        description: l.description || entry.description || ''
      }));

    if (sanitizedLines.length === 0) {
      logger.warn('addEntry: No valid lines to post journal entry');
      return;
    }

    const payload: Record<string, unknown> = {
      date: entry.date || new Date().toISOString().split('T')[0],
      description: entry.description || null,
      reference: entry.reference || null,
      status: entry.status || 'posted',
      lines: sanitizedLines,
      p_org_id: targetOrgId
    };

    const { error } = await supabase.rpc('add_journal_entry', payload);
    if (error) throw error;
    await fetchLedgerData();
  }, [orgId, fetchLedgerData]);

  const fetchEntriesPaged = useCallback(async (page: number, pageSize: number): Promise<{ data: JournalEntryItem[]; count: number }> => {
    if (!orgId) return { data: [], count: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from('journal_entries')
      .select('*, journal_lines(*)', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('transaction_date', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error('Error fetching paged entries:', error);
      return { data: [], count: 0 };
    }

    return { data: (data as JournalEntryItem[]) || [], count: count || 0 };
  }, [orgId]);

  const getAccountBalanceInPeriod = useCallback(async (id: string, start: string, end: string): Promise<number> => {
    const { data, error } = await supabase.rpc('get_account_balance_in_period', {
      p_account_id: id,
      p_start_date: start,
      p_end_date: end,
      p_org_id: orgId
    });
    if (error) {
      logger.error('Error getting account balance in period:', error);
      return 0;
    }
    return Number(data) || 0;
  }, [orgId]);

  const saveBudget = useCallback(async (budget: Record<string, unknown>): Promise<void> => {
    const { error } = await supabase.from('budgets').upsert(budget);
    if (error) throw error;
    await fetchLedgerData();
  }, [fetchLedgerData]);

  const closeFinancialYear = useCallback(async (year: number, date: string): Promise<boolean> => {
    if (!orgId) return false;
    const res = await closeFinancialYearEngine({ supabase, year, closingDate: date, targetOrgId: orgId });
    if (res.success) {
      await fetchLedgerData();
      return true;
    }
    return false;
  }, [orgId, fetchLedgerData]);

  const reopenFinancialYear = useCallback(async (year: number): Promise<boolean> => {
    if (!orgId) return false;
    const res = await reopenFinancialYearEngine({ supabase, year, targetOrgId: orgId });
    if (res.success) {
      await fetchLedgerData();
      return true;
    }
    return false;
  }, [orgId, fetchLedgerData]);

  const recalculateAllBalances = useCallback(async (): Promise<void> => {
    await supabase.rpc('recalculate_all_balances');
    await fetchLedgerData();
  }, [fetchLedgerData]);

  const exportJournalToCSV = useCallback(async (): Promise<void> => {
    try {
      let query = supabase
        .from('journal_entries')
        .select(`
          id,
          transaction_date,
          reference,
          description,
          status,
          journal_lines (
            debit,
            credit,
            description,
            account_id
          )
        `)
        .order('transaction_date', { ascending: false });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) return;

      const headers = ['رقم القيد', 'التاريخ', 'المرجع', 'البيان', 'الحالة', 'مدين', 'دائن', 'شرح السطر'];
      const rows = (data as Record<string, unknown>[]).flatMap((entry) => {
        const lines = (entry.journal_lines as Record<string, unknown>[]) || [];
        return lines.map((line) => [
          entry.id,
          entry.transaction_date,
          entry.reference || '',
          entry.description || '',
          entry.status,
          line.debit,
          line.credit,
          line.description || ''
        ]);
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `journal_entries_${selectedFiscalYear}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      logger.error('Failed to export journal to CSV:', err);
    }
  }, [orgId, selectedFiscalYear]);

  return (
    <GeneralLedgerContext.Provider
      value={{
        entries,
        accounts,
        costCenters,
        budgets,
        fiscalYearRange,
        selectedFiscalYear,
        setSelectedFiscalYear,
        addEntry,
        fetchEntriesPaged,
        getAccountBalanceInPeriod,
        saveBudget,
        exportJournalToCSV,
        closeFinancialYear,
        reopenFinancialYear,
        recalculateAllBalances,
        refreshLedger: fetchLedgerData,
      }}
    >
      {children}
    </GeneralLedgerContext.Provider>
  );
};

export const useGeneralLedgerDomain = (): GeneralLedgerDomainState => {
  let context: GeneralLedgerDomainState | null = null;
  try {
    context = useContext(GeneralLedgerContext);
  } catch {
    // If called outside React component tree (e.g. unit tests), fallback to useAccounting
  }
  if (context) return context;

  // Fallback to unified AccountingContext
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    entries: (acc.entries as JournalEntryItem[]) || [],
    accounts: (acc.accounts as Account[]) || [],
    costCenters: (acc.costCenters as CostCenter[]) || [],
    budgets: (acc.budgets as Budget[]) || [],
    fiscalYearRange: (acc.fiscalYearRange as FiscalYearRange) || {
      startDate: `${new Date().getFullYear()}-01-01`,
      endDate: `${new Date().getFullYear()}-12-31`,
    },
    selectedFiscalYear: Number(acc.selectedFiscalYear) || new Date().getFullYear(),
    setSelectedFiscalYear: acc.setSelectedFiscalYear as (year: number) => void,
    addEntry: acc.addEntry as (entry: Record<string, unknown>) => Promise<void>,
    fetchEntriesPaged: acc.fetchEntriesPaged as (page: number, pageSize: number) => Promise<{ data: JournalEntryItem[]; count: number }>,
    getAccountBalanceInPeriod: acc.getAccountBalanceInPeriod as (id: string, start: string, end: string) => Promise<number>,
    saveBudget: acc.saveBudget as (budget: Record<string, unknown>) => Promise<void>,
    exportJournalToCSV: acc.exportJournalToCSV as () => void | Promise<void>,
    closeFinancialYear: acc.closeFinancialYear as (year: number, date: string) => Promise<boolean>,
    reopenFinancialYear: acc.reopenFinancialYear as (year: number) => Promise<boolean>,
    recalculateAllBalances: acc.recalculateAllBalances as () => Promise<void>,
    refreshLedger: acc.refreshData as () => Promise<void>,
  };
};

export default useGeneralLedgerDomain;
