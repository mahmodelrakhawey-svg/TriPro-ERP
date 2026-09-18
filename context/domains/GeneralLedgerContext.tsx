/**
 * ==============================================================================
 * TriPro ERP — General Ledger & Financial Reports Domain Context & Hook
 * context/domains/GeneralLedgerContext.tsx
 * ==============================================================================
 * مخصص لإدارة قيود اليومية، شجرة الحسابات، ميزان المراجعة، السجلات المالية، والسنوات المالية.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة بنمط Facade.
 * ==============================================================================
 */

import { useAccounting } from '../AccountingContext';

export interface GeneralLedgerDomainState {
  entries: any[];
  accounts: any[];
  costCenters: any[];
  budgets: any[];
  fiscalYearRange: { startDate: string; endDate: string };
  selectedFiscalYear: number;
  setSelectedFiscalYear: (year: number) => void;
  addEntry: (entry: any) => Promise<void>;
  fetchEntriesPaged: (page: number, pageSize: number) => Promise<{ data: any[]; count: number }>;
  getAccountBalanceInPeriod: (id: string, start: string, end: string) => Promise<number>;
  saveBudget: (budget: any) => Promise<void>;
  exportJournalToCSV: () => void;
  closeFinancialYear: (year: number, date: string) => Promise<boolean>;
  reopenFinancialYear: (year: number) => Promise<boolean>;
  recalculateAllBalances: () => Promise<void>;
}

export const useGeneralLedgerDomain = (): GeneralLedgerDomainState => {
  const acc = useAccounting() as any;
  return {
    entries: acc.entries || [],
    accounts: acc.accounts || [],
    costCenters: acc.costCenters || [],
    budgets: acc.budgets || [],
    fiscalYearRange: acc.fiscalYearRange,
    selectedFiscalYear: acc.selectedFiscalYear,
    setSelectedFiscalYear: acc.setSelectedFiscalYear,
    addEntry: acc.addEntry,
    fetchEntriesPaged: acc.fetchEntriesPaged,
    getAccountBalanceInPeriod: acc.getAccountBalanceInPeriod,
    saveBudget: acc.saveBudget,
    exportJournalToCSV: acc.exportJournalToCSV,
    closeFinancialYear: acc.closeFinancialYear,
    reopenFinancialYear: acc.reopenFinancialYear,
    recalculateAllBalances: acc.recalculateAllBalances,
  };
};

export default useGeneralLedgerDomain;
