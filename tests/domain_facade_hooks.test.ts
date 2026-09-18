import { describe, it, expect, vi } from 'vitest';
import * as AccountingCtx from '../context/AccountingContext';
import { useSalesDomain } from '../context/domains/SalesContext';
import { useBankingDomain } from '../context/domains/BankingContext';
import { useGeneralLedgerDomain } from '../context/domains/GeneralLedgerContext';

describe('Modular Domain Hooks Facade Pattern (اختبار تكامل خطافات النطاقات)', () => {
  it('يجب تصدير كافة الـ Domain Hooks بنجاح عبر AccountingContext دون أي كسر للمسارات', () => {
    expect(AccountingCtx.useProductDomain).toBeDefined();
    expect(AccountingCtx.useCustomerDomain).toBeDefined();
    expect(AccountingCtx.useSupplierDomain).toBeDefined();
    expect(AccountingCtx.useSettingsDomain).toBeDefined();
    expect(AccountingCtx.useSalesDomain).toBeDefined();
    expect(AccountingCtx.useBankingDomain).toBeDefined();
    expect(AccountingCtx.useGeneralLedgerDomain).toBeDefined();
  });

  it('يجب أن يسترجع useSalesDomain فواتير المبيعات والعملاء والمناديب بدقة عند ربطه', () => {
    const mockAccounting = {
      invoices: [{ id: 'inv-1', total: 5000 }],
      customers: [{ id: 'cust-1', name: 'شركة النور للمقاولات' }],
      salespeople: [{ id: 'sp-1', name: 'أحمد محمود' }],
      approveInvoice: vi.fn(),
      unpostSalesInvoice: vi.fn(),
      deleteSalesInvoice: vi.fn(),
      addCustomer: vi.fn(),
    };
    vi.spyOn(AccountingCtx, 'useAccounting').mockReturnValue(mockAccounting as any);

    const sales = useSalesDomain();
    expect(sales.invoices).toHaveLength(1);
    expect(sales.invoices[0].total).toBe(5000);
    expect(sales.customers).toHaveLength(1);
    expect(sales.salespeople).toHaveLength(1);
  });

  it('يجب أن يسترجع useBankingDomain الشيكات والسندات بدقة', () => {
    const mockAccounting = {
      cheques: [{ id: 'chq-1', amount: 12000, status: 'COLLECTED' }],
      vouchers: [{ id: 'vch-1', amount: 3500 }],
      addCheque: vi.fn(),
      updateCheque: vi.fn(),
      deleteCheque: vi.fn(),
      updateChequeStatus: vi.fn(),
      addPaymentVoucher: vi.fn(),
      updateVoucher: vi.fn(),
      addTransfer: vi.fn(),
      updateTransfer: vi.fn(),
      deleteTransfer: vi.fn(),
    };
    vi.spyOn(AccountingCtx, 'useAccounting').mockReturnValue(mockAccounting as any);

    const banking = useBankingDomain();
    expect(banking.cheques).toHaveLength(1);
    expect(banking.cheques[0].amount).toBe(12000);
    expect(banking.vouchers).toHaveLength(1);
  });

  it('يجب أن يسترجع useGeneralLedgerDomain القيود المحاسبية ومراكز التكلفة بدقة', () => {
    const mockAccounting = {
      entries: [{ id: 'ent-1', debit: 5000, credit: 5000 }],
      costCenters: [{ id: 'cc-1', name: 'مشروع برج الأندلس' }],
      accounts: [{ id: 'acc-1', name: 'الخزينة الرئيسية' }],
      budgets: [],
      fiscalYearRange: { startDate: '2026-01-01', endDate: '2026-12-31' },
      selectedFiscalYear: 2026,
      setSelectedFiscalYear: vi.fn(),
      addEntry: vi.fn(),
      fetchEntriesPaged: vi.fn(),
      getAccountBalanceInPeriod: vi.fn(),
      saveBudget: vi.fn(),
      exportJournalToCSV: vi.fn(),
      closeFinancialYear: vi.fn(),
      reopenFinancialYear: vi.fn(),
      recalculateAllBalances: vi.fn(),
    };
    vi.spyOn(AccountingCtx, 'useAccounting').mockReturnValue(mockAccounting as any);

    const ledger = useGeneralLedgerDomain();
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.costCenters).toHaveLength(1);
    expect(ledger.selectedFiscalYear).toBe(2026);
  });
});
