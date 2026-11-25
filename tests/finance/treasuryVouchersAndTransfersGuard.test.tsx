import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockShowToast = vi.fn();
const mockAddEntry = vi.fn();
const mockAddTransfer = vi.fn();
const mockRpc = vi.fn();
const mockVoucherUpdate = vi.fn();

const CASH_ACC_ID = '11111111-1111-4111-8111-111111111111';
const BANK_ACC_ID = '22222222-2222-4222-8222-222222222222';
const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333';

const singleVoucher = {
  id: 'pv-1',
  voucher_number: 'PV-100',
  payment_date: '2026-11-25',
  supplier_id: SUPPLIER_ID,
  amount: 500,
  treasury_account_id: CASH_ACC_ID,
  notes: 'دفعة لمورد',
  payment_method: 'cash',
  currency: 'EGP',
  exchange_rate: 1,
  related_journal_entry_id: 'je-existing-1',
};

const createChain = (
  resolvedArrayValue: { data: any; error: any } = { data: [], error: null },
  resolvedSingleValue: { data: any; error: any } = { data: null, error: null }
) => {
  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve(resolvedSingleValue);
        }
        if (prop === 'then') {
          return (resolve: any, reject: any) => Promise.resolve(resolvedArrayValue).then(resolve, reject);
        }
        return () => chain;
      },
    }
  );
  return chain;
};

vi.mock('../../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'u1', user_metadata: { org_id: 'org-1' } } } },
        error: null,
      }),
    },
    rpc: (...args: any[]) => mockRpc(...args),
    from: (table: string) => {
      if (table === 'payment_vouchers') {
        return {
          select: () => createChain({ data: [], error: null }, { data: singleVoucher, error: null }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () => mockVoucherUpdate(),
              }),
            }),
          }),
        };
      }
      if (table === 'accounts') {
        return createChain({
          data: [
            { id: 'acc-group-123', code: '123', name: 'النقدية وما في حكمها', is_group: true },
            { id: CASH_ACC_ID, code: '1231', name: 'خزينة رئيسية', is_group: false },
          ],
          error: null,
        });
      }
      if (table === 'employees') {
        return createChain({
          data: [{ id: 'emp-1', full_name: 'أحمد علي', department: 'المبيعات', status: 'active', basic_salary: 5000 }],
          error: null,
        });
      }
      if (table === 'organizations') {
        return createChain({ data: { id: 'org-1' }, error: null });
      }
      return createChain({ data: [], error: null });
    },
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'u1', role: 'admin', name: 'المدير', organization_id: 'org-1' },
  }),
}));

vi.mock('../../services/auditService', () => ({
  logDocumentAction: vi.fn(),
}));

vi.mock('../../components/DocumentAuditTimeline', () => ({
  default: () => null,
}));

vi.mock('../../components/SupplierSearchSelect', () => ({
  default: () => <div data-testid="supplier-select" />,
}));

vi.mock('../../modules/finance/reports/PaymentVoucherPrint', () => ({
  PaymentVoucherPrint: () => null,
}));

const today = new Date().toISOString().split('T')[0];

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => ({
    addEntry: mockAddEntry,
    addTransfer: mockAddTransfer,
    updateTransfer: vi.fn(),
    deleteTransfer: vi.fn(),
    refreshData: vi.fn(),
    vouchers: [
      { id: 'pv-1', type: 'payment', voucherNumber: 'PV-100', amount: 500 },
    ],
    updateVoucher: vi.fn(),
    costCenters: [],
    getSystemAccount: (key: string) => (key === 'SUPPLIERS' ? { id: 'acc-sup', code: '201', name: 'الموردين' } : null),
    accounts: [
      { id: 'acc-group-123', code: '123', name: 'النقدية وما في حكمها', is_group: true, balance: 100000 },
      { id: CASH_ACC_ID, code: '1231', name: 'خزينة رئيسية', is_group: false, balance: 50000 },
      { id: BANK_ACC_ID, code: '1232', name: 'بنك مصر', is_group: false, balance: 25000 },
    ],
    entries: [
      {
        id: 'trf-existing',
        reference: 'TRF-001',
        transaction_date: today,
        description: 'تحويل سابق',
        journal_lines: [
          { account_id: CASH_ACC_ID, debit: 0, credit: 1000 },
          { account_id: BANK_ACC_ID, debit: 1000, credit: 0 },
        ],
      },
    ],
    suppliers: [{ id: SUPPLIER_ID, name: 'مورد تجريبي', opening_balance: 0 }],
    can: () => true,
    addDemoPaymentVoucher: vi.fn(),
    isDemo: false,
    organization: { id: 'org-1', name: 'شركة الاختبار' },
    currentUser: { id: 'u1', role: 'admin', organization_id: 'org-1' },
  }),
}));

import PaymentVoucherForm from '../../modules/finance/components/PaymentVoucherForm';
import TransferForm from '../../modules/finance/components/TransferForm';
import EmployeeAdvances from '../../modules/hr/components/EmployeeAdvances';

describe('🛡️ Treasury Vouchers, Cash Transfers & Employee Advances Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'get_current_company_settings') {
        return { maybeSingle: () => Promise.resolve({ data: {}, error: null }) };
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('TransferForm: يستبعد الحسابات التجميعية (123) ويمنع التحويل المكرر المتطابق في نفس اليوم عند رفض التأكيد', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <MemoryRouter>
        <TransferForm />
      </MemoryRouter>
    );

    // التأكد من عدم وجود الحساب التجميعي 123 في قائمة الخزائن
    expect(screen.queryByText(/النقدية وما في حكمها \(123\)/)).toBeNull();
    expect(screen.getAllByText(/خزينة رئيسية \(1231\)/).length).toBeGreaterThan(0);

    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: CASH_ACC_ID } });
    fireEvent.change(selects[1], { target: { value: BANK_ACC_ID } });

    const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '1000' } });

    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
    });
    // لم يتم استدعاء addTransfer لأن المستخدم رفض التكرار
    expect(mockAddTransfer).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('EmployeeAdvances: يستبعد الحساب التجميعي (123) من خزائن الصرف', async () => {
    render(
      <MemoryRouter>
        <EmployeeAdvances />
      </MemoryRouter>
    );

    // فتح نافذة تسجيل سلفة جديدة
    const newBtn = await screen.findByText(/تسجيل سلفة جديدة/);
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.queryByText(/النقدية وما في حكمها/)).toBeNull();
      expect(screen.getAllByText(/خزينة رئيسية/).length).toBeGreaterThan(0);
    });
  });

  it('PaymentVoucherForm: لا ينشئ قيداً مكرراً عبر addEntry إذا فشل RPC التعديل لسند مرتبط بقيد مسبقاً', async () => {
    mockVoucherUpdate.mockResolvedValue({
      data: { id: 'pv-1', related_journal_entry_id: 'je-existing-1' },
      error: null,
    });
    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'get_current_company_settings') {
        return { maybeSingle: () => Promise.resolve({ data: {}, error: null }) };
      }
      if (fnName === 'approve_payment_voucher') {
        return Promise.resolve({ data: null, error: { message: 'RPC update failure' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/payment-voucher', state: { voucherToEdit: { id: 'pv-1' } } }]}>
        <PaymentVoucherForm />
      </MemoryRouter>
    );

    // انتظار تحميل بيانات السند
    await waitFor(() => {
      const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement;
      expect(Number(amountInput?.value)).toBe(500);
    });

    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('تعذر تحديث القيد المحاسبي للسند عبر الخادم'), 'error');
    });

    // يجب ألا يُستدعى addEntry إطلاقاً لمنع تكرار القيد
    expect(mockAddEntry).not.toHaveBeenCalled();
  });
});
