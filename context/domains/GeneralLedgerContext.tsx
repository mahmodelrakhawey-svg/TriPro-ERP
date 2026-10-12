/**
 * ==============================================================================
 * TriPro ERP — General Ledger & Financial Reports Domain Context & Hook
 * context/domains/GeneralLedgerContext.tsx
 * ==============================================================================
 * مخصص لإدارة قيود اليومية، شجرة الحسابات، ميزان المراجعة، السجلات المالية، والسنوات المالية.
 * يدعم الاستخدام المباشر عبر GeneralLedgerProvider أو عبر واجهة AccountingContext الموحدة بنمط Facade.
 * مزود بالحماية الكاملة لعزل بيانات المنظمات (Multi-Tenancy) وسجل التدقيق (Audit Log)
 * والتحقق الصارم من توازن القيود المحاسبية.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { JournalEntry, Account, CostCenter, Budget } from '../../types';
import type { UserProfile } from '../AccountingContext';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import { closeFinancialYearEngine, reopenFinancialYearEngine } from '../../services/financialYearService';
import { validateEntryBalance } from '../../utils/financialSafety';
import { SYSTEM_ACCOUNTS } from '../accountingConstants';

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
  addAccount: (acc: Partial<Account>) => Promise<any>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  getSystemAccount: (key: string) => Account | undefined;
  saveBudget: (budget: Record<string, unknown>) => Promise<void>;
  exportJournalToCSV: () => void | Promise<void>;
  closeFinancialYear: (year: number, date: string) => Promise<boolean>;
  reopenFinancialYear: (year: number) => Promise<boolean>;
  recalculateAllBalances: () => Promise<void>;
  refreshLedger: () => Promise<void>;
  refreshAccounts?: () => Promise<void>;
  refreshEntries?: () => Promise<void>;
}

export const GeneralLedgerContext = createContext<GeneralLedgerDomainState | null>(null);

export interface GeneralLedgerProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  settings?: any;
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
  initialEntries?: JournalEntryItem[];
  initialAccounts?: Account[];
  initialCostCenters?: CostCenter[];
  initialBudgets?: Budget[];
  initialYear?: number;
  fiscalYearRange?: FiscalYearRange;
}

const EMPTY_ENTRIES: JournalEntryItem[] = [];
const EMPTY_ACCOUNTS: Account[] = [];
const EMPTY_COST_CENTERS: CostCenter[] = [];
const EMPTY_BUDGETS: Budget[] = [];

export const GeneralLedgerProvider: React.FC<GeneralLedgerProviderProps> = ({
  children,
  orgId,
  currentUser,
  settings,
  logActivity,
  showToast,
  isDemo = false,
  initialEntries = EMPTY_ENTRIES,
  initialAccounts = EMPTY_ACCOUNTS,
  initialCostCenters = EMPTY_COST_CENTERS,
  initialBudgets = EMPTY_BUDGETS,
  initialYear = new Date().getFullYear(),
  fiscalYearRange: propFiscalRange,
}) => {
  const [entries, setEntries] = useState<JournalEntryItem[]>(initialEntries);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [costCenters, setCostCenters] = useState<CostCenter[]>(initialCostCenters);
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<number>(initialYear);

  const targetOrgId = orgId || currentUser?.organization_id;

  const fiscalYearRange: FiscalYearRange = useMemo(() => {
    if (propFiscalRange && propFiscalRange.startDate && propFiscalRange.endDate) {
      return propFiscalRange;
    }
    return {
      startDate: `${selectedFiscalYear}-01-01`,
      endDate: `${selectedFiscalYear}-12-31`
    };
  }, [propFiscalRange, selectedFiscalYear]);

  // مزامنة البيانات الأولية مع تحديثات المكون الأب
  useEffect(() => {
    if (initialAccounts.length > 0) setAccounts(initialAccounts);
  }, [initialAccounts]);

  useEffect(() => {
    if (initialEntries.length > 0) setEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    if (initialCostCenters.length > 0) setCostCenters(initialCostCenters);
  }, [initialCostCenters]);

  useEffect(() => {
    if (initialBudgets.length > 0) setBudgets(initialBudgets);
  }, [initialBudgets]);

  const fetchLedgerData = useCallback(async () => {
    const effectiveOrg = targetOrgId;
    if (!effectiveOrg || effectiveOrg === 'org-default-offline') return;
    try {
      const [accRes, entRes, ccRes, budRes] = await Promise.all([
        supabase
          .from('accounts')
          .select('*')
          .eq('organization_id', effectiveOrg)
          .order('code'),
        supabase
          .from('journal_entries')
          .select('*, journal_lines(*)')
          .eq('organization_id', effectiveOrg)
          .gte('transaction_date', fiscalYearRange.startDate)
          .lte('transaction_date', fiscalYearRange.endDate)
          .order('transaction_date', { ascending: false })
          .limit(1000),
        supabase
          .from('cost_centers')
          .select('*')
          .eq('organization_id', effectiveOrg)
          .order('name'),
        supabase
          .from('budgets')
          .select('*')
          .eq('organization_id', effectiveOrg)
      ]);

      if (accRes.error) {
        logger.error('Error fetching accounts in GeneralLedgerProvider:', accRes.error);
      } else if (accRes.data) {
        setAccounts(accRes.data.map((acc: Record<string, any>) => ({
          ...acc,
          isGroup: Boolean(acc.is_group ?? acc.isGroup),
          type: acc.type ? acc.type.toUpperCase() : acc.type
        })) as Account[]);
      }

      if (entRes.error) {
        logger.error('Error fetching entries in GeneralLedgerProvider:', entRes.error);
      } else if (entRes.data) {
        setEntries((entRes.data as JournalEntryItem[]) || []);
      }

      if (ccRes.error) {
        logger.error('Error fetching cost centers in GeneralLedgerProvider:', ccRes.error);
      } else if (ccRes.data) {
        setCostCenters((ccRes.data as CostCenter[]) || []);
      }

      if (budRes.error) {
        logger.error('Error fetching budgets in GeneralLedgerProvider:', budRes.error);
      } else if (budRes.data) {
        setBudgets((budRes.data as Budget[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching ledger data:', err);
    }
  }, [targetOrgId, fiscalYearRange.startDate, fiscalYearRange.endDate]);

  useEffect(() => {
    if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchLedgerData();
    }
  }, [targetOrgId, fetchLedgerData]);

  const addEntry = useCallback(async (entry: Record<string, unknown>): Promise<void> => {
    const effectiveOrg = (entry.p_org_id || entry.organization_id || targetOrgId) as string | undefined;
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
      p_org_id: effectiveOrg
    };

    const balanceCheck = validateEntryBalance({
      reference: (entry.reference as string) || 'JE-DRAFT',
      date: payload.date as string,
      lines: sanitizedLines as any
    });

    if (!balanceCheck.isBalanced) {
      const errMsg = `القيد المحاسبي غير متوازن: إجمالي المدين (${balanceCheck.totalDebit}) لا يساوي إجمالي الدائن (${balanceCheck.totalCredit}) بفارق ${balanceCheck.difference}`;
      logger.error('addEntry balance error:', errMsg);
      showToast?.(errMsg, 'error');
      throw new Error(errMsg);
    }

    const { error } = await supabase.rpc('add_journal_entry', payload);
    if (error) {
      showToast?.('فشل ترحيل القيد المحاسبي: ' + error.message, 'error');
      throw error;
    }

    showToast?.('تم تسجيل وترحيل القيد المحاسبي بنجاح ✅', 'success');
    logActivity?.('إنشاء قيد يومية', `قيد مرجعي: ${(payload.reference as string) || 'عام'}`);
    await fetchLedgerData();
  }, [targetOrgId, logActivity, showToast, fetchLedgerData]);

  const addAccount = useCallback(async (acc: Partial<Account>): Promise<any> => {
    const effectiveOrg = targetOrgId;
    const { data, error } = await supabase
      .from('accounts')
      .insert({ ...acc, organization_id: effectiveOrg })
      .select()
      .single();

    if (error) {
      showToast?.('فشل إضافة الحساب: ' + error.message, 'error');
      throw error;
    }

    showToast?.('تمت إضافة الحساب بنجاح ✅', 'success');
    logActivity?.('إضافة حساب', `حساب: ${acc.name || acc.code}`);
    await fetchLedgerData();
    return data;
  }, [targetOrgId, logActivity, showToast, fetchLedgerData]);

  const updateAccount = useCallback(async (id: string, updates: Partial<Account>): Promise<void> => {
    const effectiveOrg = targetOrgId;
    let query = supabase.from('accounts').update(updates).eq('id', id);
    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }
    const { error } = await query;
    if (error) {
      showToast?.('فشل تحديث الحساب: ' + error.message, 'error');
      throw error;
    }

    showToast?.('تم تعديل بيانات الحساب بنجاح ✅', 'success');
    logActivity?.('تعديل حساب', `حساب رقم: ${id}`);
    await fetchLedgerData();
  }, [targetOrgId, logActivity, showToast, fetchLedgerData]);

  const deleteAccount = useCallback(async (id: string, _reason?: string): Promise<{ success: boolean; message?: string }> => {
    const effectiveOrg = targetOrgId;
    let query = supabase.from('accounts').delete().eq('id', id);
    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }
    const { error } = await query;
    if (error) {
      showToast?.('فشل حذف الحساب: ' + error.message, 'error');
    } else {
      showToast?.('تم حذف الحساب بنجاح', 'info');
      logActivity?.('حذف حساب', `حساب رقم: ${id}`);
    }
    await fetchLedgerData();
    return { success: !error, message: error?.message };
  }, [targetOrgId, logActivity, showToast, fetchLedgerData]);

  const getSystemAccount = useCallback((key: string): Account | undefined => {
    const mappingId = settings?.account_mappings?.[key];
    if (mappingId) {
      const mapped = accounts.find(a => a.id === mappingId);
      if (mapped) return mapped;
    }
    const defaultCode = SYSTEM_ACCOUNTS[key as keyof typeof SYSTEM_ACCOUNTS];
    if (defaultCode) {
      const matchByExactCode = accounts.find(a => a.code === defaultCode);
      if (matchByExactCode) return matchByExactCode;
      const matchByPrefix = accounts.find(a => a.code?.startsWith(defaultCode));
      if (matchByPrefix) return matchByPrefix;
    }
    // Fallback بالاسم والكلمات المفتاحية القياسية
    if (key === 'CUSTOMERS' || key === 'AR' || key === 'CUSTOMER') {
      return accounts.find(a => a.name?.includes('العملاء') || a.name?.includes('عملاء') || a.name?.toLowerCase().includes('customer') || a.name?.toLowerCase().includes('receivable') || a.code === '1221' || a.code === '1103' || a.code === '121' || a.code?.startsWith('122') || a.code?.startsWith('1103'));
    }
    if (key === 'SUPPLIERS' || key === 'AP' || key === 'SUPPLIER') {
      return accounts.find(a => a.name?.includes('الموردين') || a.name?.includes('موردين') || a.name?.toLowerCase().includes('supplier') || a.name?.toLowerCase().includes('payable') || a.code === '201' || a.code === '2101' || a.code === '221' || a.code?.startsWith('201') || a.code?.startsWith('2101'));
    }
    if (key === 'CASH' || key === 'TREASURY') {
      return accounts.find(a => a.name?.includes('الخزينة') || a.name?.includes('النقدية') || a.name?.includes('الصندوق') || a.name?.toLowerCase().includes('cash') || a.code === '1231' || a.code === '10101' || a.code === '123' || a.code?.startsWith('1231') || a.code?.startsWith('10101'));
    }
    if (key === 'VAT' || key === 'VAT_OUTPUT') {
      return accounts.find(a => (a.name?.includes('القيمة المضافة') || a.name?.includes('ضريبة المبيعات') || a.code === '2231' || a.code === '2105' || a.code?.startsWith('2231')) && !a.name?.includes('مدخلات') && !a.name?.includes('مشتريات'));
    }
    if (key === 'VAT_INPUT') {
      return accounts.find(a => a.name?.includes('مدخلات') || a.name?.includes('مشتريات') || a.code === '1241' || a.code === '1105');
    }
    if (key === 'OPENING_BALANCES') {
      return accounts.find(a => a.name?.includes('أرصدة افتتاحية') || a.name?.includes('افتتاحي') || a.name?.includes('افتتاحية') || a.name?.toLowerCase().includes('opening') || a.code === '3999' || a.code === '313' || a.code?.startsWith('39') || a.code?.startsWith('300'));
    }
    if (key === 'INVENTORY_FINISHED_GOODS' || key === 'INVENTORY') {
      return accounts.find(a => a.code === '10302' || a.code === '1213' || a.code === '103' || a.code === '122' || a.code === '121' || a.name?.includes('بضائع بغرض البيع') || a.name?.includes('منتج تام') || a.name?.includes('تام الصنع') || a.name?.includes('المخزون') || a.name?.includes('مخزون'));
    }
    if (key === 'INVENTORY_RAW_MATERIALS') {
      return accounts.find(a => a.code === '10301' || a.code === '1211' || a.code === '103' || a.name?.includes('خامات') || a.name?.includes('مواد خام') || a.name?.includes('المخزون') || a.name?.includes('مخزون'));
    }
    if (key === 'COGS') {
      return accounts.find(a => a.code === '511' || a.code === '311' || a.code?.startsWith('51') || a.name?.includes('تكلفة المبيعات') || a.name?.includes('تكلفة البضاعة'));
    }
    if (key === 'SALES_REVENUE') {
      return accounts.find(a => a.code === '411' || a.code === '41' || a.code?.startsWith('41') || a.name?.includes('المبيعات') || a.name?.includes('إيراد المبيعات'));
    }
    if (key === 'NOTES_RECEIVABLE') {
      return accounts.find(a => a.name?.includes('أوراق القبض') || a.name?.includes('أوراق قبض') || a.name?.includes('شيكات واردة') || a.name?.includes('تحت التحصيل') || a.code === '1222' || a.code?.startsWith('10103') || a.code?.startsWith('1231'));
    }
    if (key === 'NOTES_PAYABLE') {
      return accounts.find(a => a.name?.includes('أوراق الدفع') || a.name?.includes('أوراق دفع') || a.name?.includes('شيكات صادرة') || a.code === '222' || a.code?.startsWith('20102') || a.code?.startsWith('2202'));
    }
    if (key === 'BANK_ACCOUNTS' || key === 'BANK_MAIN') {
      return accounts.find(a => a.name?.includes('بنك') || a.name?.toLowerCase().includes('bank') || a.code?.startsWith('1232') || a.code?.startsWith('10102'));
    }
    if (key === 'INVENTORY_ADJUSTMENTS' || key === 'WASTAGE_EXPENSE' || key === 'INVENTORY_REVALUATION') {
      return accounts.find(a => (a.code === '512' || a.code === '5121' || a.name?.includes('تسويات الجرد') || a.name?.includes('عجز المخزون') || a.name?.includes('الهالك والفاقد') || a.name?.includes('تكلفة الهالك')) && !a.name?.includes('ضريب') && !a.code?.startsWith('223') && !a.code?.startsWith('124'));
    }
    if (key === 'CASH_SHORTAGE') {
      return accounts.find(a => (a.code === '541' || a.name?.includes('عجز الصندوق') || a.name?.includes('عجز الخزينة')) && !a.name?.includes('ضريب') && !a.code?.startsWith('223'));
    }
    if (key === 'REVENUE_OTHER' || key === 'OTHER_REVENUE') {
      return accounts.find(a => (a.code === '421' || a.code === '441' || a.name?.includes('إيرادات متنوعة') || a.name?.includes('إيرادات أخرى')) && !a.name?.includes('ضريب'));
    }
    return undefined;
  }, [settings, accounts]);

  const fetchEntriesPaged = useCallback(async (page: number, pageSize: number): Promise<{ data: JournalEntryItem[]; count: number }> => {
    const effectiveOrg = targetOrgId;
    if (!effectiveOrg) return { data: [], count: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from('journal_entries')
      .select('*, journal_lines(*)', { count: 'exact' })
      .eq('organization_id', effectiveOrg)
      .order('transaction_date', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error('Error fetching paged entries:', error);
      return { data: [], count: 0 };
    }

    return { data: (data as JournalEntryItem[]) || [], count: count || 0 };
  }, [targetOrgId]);

  const getAccountBalanceInPeriod = useCallback(async (id: string, start: string, end: string): Promise<number> => {
    const effectiveOrg = targetOrgId;
    const { data, error } = await supabase.rpc('get_account_balance_in_period', {
      p_account_id: id,
      p_start_date: start,
      p_end_date: end,
      p_org_id: effectiveOrg
    });
    if (error) {
      logger.error('Error getting account balance in period:', error);
      return 0;
    }
    return Number(data) || 0;
  }, [targetOrgId]);

  const saveBudget = useCallback(async (budget: Record<string, unknown>): Promise<void> => {
    const { error } = await supabase.from('budgets').upsert(budget);
    if (error) {
      showToast?.('فشل حفظ الموازنة: ' + error.message, 'error');
      throw error;
    }
    showToast?.('تم حفظ الموازنة بنجاح ✅', 'success');
    await fetchLedgerData();
  }, [showToast, fetchLedgerData]);

  const closeFinancialYear = useCallback(async (year: number, date: string): Promise<boolean> => {
    const effectiveOrg = targetOrgId;
    if (!effectiveOrg) return false;
    const res = await closeFinancialYearEngine({ supabase, year, closingDate: date, targetOrgId: effectiveOrg });
    if (res.success) {
      showToast?.(`تم إغلاق السنة المالية ${year} بنجاح ✅`, 'success');
      logActivity?.('إغلاق سنة مالية', `السنة: ${year}`);
      await fetchLedgerData();
      return true;
    }
    showToast?.(`تعذر إغلاق السنة المالية ${year}`, 'error');
    return false;
  }, [targetOrgId, logActivity, showToast, fetchLedgerData]);

  const reopenFinancialYear = useCallback(async (year: number): Promise<boolean> => {
    const effectiveOrg = targetOrgId;
    if (!effectiveOrg) return false;
    const res = await reopenFinancialYearEngine({ supabase, year, targetOrgId: effectiveOrg });
    if (res.success) {
      showToast?.(`تم إعادة فتح السنة المالية ${year} بنجاح ✅`, 'success');
      logActivity?.('إعادة فتح سنة مالية', `السنة: ${year}`);
      await fetchLedgerData();
      return true;
    }
    showToast?.(`تعذر إعادة فتح السنة المالية ${year}`, 'error');
    return false;
  }, [targetOrgId, logActivity, showToast, fetchLedgerData]);

  const recalculateAllBalances = useCallback(async (): Promise<void> => {
    const effectiveOrg = targetOrgId;
    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      await supabase.rpc('recalculate_all_system_balances', { p_org_id: effectiveOrg });
    } else {
      await supabase.rpc('recalculate_all_balances');
    }
    showToast?.('تمت إعادة احتساب أرصدة الحسابات بنجاح ✅', 'success');
    await fetchLedgerData();
  }, [targetOrgId, showToast, fetchLedgerData]);

  const exportJournalToCSV = useCallback(async (): Promise<void> => {
    const effectiveOrg = targetOrgId;
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

      if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
        query = query.eq('organization_id', effectiveOrg);
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
  }, [targetOrgId, selectedFiscalYear]);

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
        addAccount,
        updateAccount,
        deleteAccount,
        getSystemAccount,
        saveBudget,
        exportJournalToCSV,
        closeFinancialYear,
        reopenFinancialYear,
        recalculateAllBalances,
        refreshLedger: fetchLedgerData,
        refreshAccounts: fetchLedgerData,
        refreshEntries: fetchLedgerData,
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
    addAccount: acc.addAccount as (acc: Partial<Account>) => Promise<any>,
    updateAccount: acc.updateAccount as (id: string, updates: Partial<Account>) => Promise<void>,
    deleteAccount: acc.deleteAccount as (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>,
    getSystemAccount: acc.getSystemAccount as (key: string) => Account | undefined,
    saveBudget: acc.saveBudget as (budget: Record<string, unknown>) => Promise<void>,
    exportJournalToCSV: acc.exportJournalToCSV as () => void | Promise<void>,
    closeFinancialYear: acc.closeFinancialYear as (year: number, date: string) => Promise<boolean>,
    reopenFinancialYear: acc.reopenFinancialYear as (year: number) => Promise<boolean>,
    recalculateAllBalances: acc.recalculateAllBalances as () => Promise<void>,
    refreshLedger: acc.refreshData as () => Promise<void>,
  };
};

export default useGeneralLedgerDomain;
