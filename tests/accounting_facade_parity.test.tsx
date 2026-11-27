import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AccountingProvider, useAccounting } from '../context/AccountingContext';
import { resolveSystemAccount } from '../context/domains/domainUtils';

const MOCK_AUTH_STATE = {
  currentUser: {
    id: 'demo-user-id',
    username: 'demo@demo.com',
    name: 'Demo Admin',
    role: 'demo',
    organization_id: 'org-default-offline',
  },
  can: () => true,
};

const MOCK_TOAST_STATE = {
  showToast: vi.fn(),
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => MOCK_AUTH_STATE,
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => MOCK_TOAST_STATE,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

describe('Phase 4 AccountingFacade Parity & Domain Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the full AccountingContext contract with all domain-delegated and core methods defined', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AccountingProvider>{children}</AccountingProvider>
    );

    const { result } = renderHook(() => useAccounting(), { wrapper });
    const ctx = result.current;

    const requiredMethods: Array<keyof typeof ctx> = [
      'refreshData',
      'refreshCustomers',
      'refreshSuppliers',
      'refreshSalesAndPurchases',
      'refreshBanking',
      'refreshBankingAndShift',
      'refreshAccountsAndLedger',
      'refreshLedger',
      'refreshSettings',
      'refreshEmployees',
      'updateSettings',
      'fetchEntriesPaged',
      'addEntry',
      'getSystemAccount',
      'updateVoucher',
      'addPaymentVoucher',
      'getAccountBalanceInPeriod',
      'addAccount',
      'updateAccount',
      'deleteAccount',
      'saveBudget',
      'exportJournalToCSV',
      'closeFinancialYear',
      'reopenFinancialYear',
      'recalculateAllBalances',
      'addOpeningBalanceTransaction',
      'createMissingSystemAccounts',
      'recalculateStock',
      'addProduct',
      'updateProduct',
      'deleteProduct',
      'addStockTransfer',
      'approveStockTransfer',
      'cancelStockTransfer',
      'addWarehouse',
      'updateWarehouse',
      'deleteWarehouse',
      'addWastage',
      'produceItem',
      'addCustomer',
      'updateCustomer',
      'deleteCustomer',
      'addSupplier',
      'updateSupplier',
      'deleteSupplier',
      'approveInvoice',
      'unpostSalesInvoice',
      'deleteSalesInvoice',
      'unpostSalesReturn',
      'deleteSalesReturn',
      'approvePurchaseInvoice',
      'unpostPurchaseInvoice',
      'deletePurchaseInvoice',
      'unpostPurchaseReturn',
      'deletePurchaseReturn',
      'convertPoToInvoice',
      'addAsset',
      'updateAsset',
      'deleteAsset',
      'runDepreciation',
      'revaluateAsset',
      'addCheque',
      'updateCheque',
      'deleteCheque',
      'updateChequeStatus',
      'addTransfer',
      'updateTransfer',
      'deleteTransfer',
      'restoreItem',
      'permanentDeleteItem',
      'clearTransactions',
      'emptyRecycleBin',
      'purgeDeletedRecords',
      'refreshSaasSchema',
      'exportData',
      'deleteOrganization',
      'addEmployee',
      'updateEmployee',
      'deleteEmployee',
      'runPayroll',
      'runPayrollAccrual',
      'payAccruedPayroll',
      'cancelPayrollAccrual',
      'finalizeProductionOrder',
      'openTableSession',
      'reserveTable',
      'cancelReservation',
      'transferTableSession',
      'mergeTableSessions',
      'createRestaurantOrder',
      'getOpenTableOrder',
      'completeRestaurantOrder',
      'processSplitPayment',
      'addRestaurantTable',
      'updateRestaurantTable',
      'deleteRestaurantTable',
      'updateKitchenOrderStatus',
      'startShift',
      'closeCurrentShift',
      'getCurrentShiftSummary',
    ];

    for (const key of requiredMethods) {
      expect(typeof ctx[key], `Expected useAccounting().${String(key)} to be a function`).toBe('function');
    }
  });

  it('resolveSystemAccount resolves LC & LG accounts consistently across both GL and Core contexts', () => {
    const accounts = [
      { id: 'acc-lg', code: '1248', name: 'غطاء خطابات الضمان', type: 'ASSET' },
      { id: 'acc-lc', code: '1246', name: 'اعتمادات مستندية', type: 'ASSET' },
    ] as any[];

    expect(resolveSystemAccount(accounts, {}, 'LETTER_OF_GUARANTEE_MARGIN')?.id).toBe('acc-lg');
    expect(resolveSystemAccount(accounts, {}, 'LETTER_OF_CREDIT_GOODS')?.id).toBe('acc-lc');
  });
});
