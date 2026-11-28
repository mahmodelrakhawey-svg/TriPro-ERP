import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1', user_metadata: { org_id: '11111111-1111-1111-1111-111111111111' } } } },
        error: null,
      }),
    },
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const sampleAccounts = [
  { id: 'acc-cash', code: '1231', name: 'الصندوق', type: 'asset', sub_type: 'cash', isGroup: false },
  { id: 'acc-ap', code: '201', name: 'الموردين', type: 'liability', sub_type: 'payable', isGroup: false },
  { id: 'acc-eq', code: '311', name: 'رأس المال', type: 'equity', isGroup: false },
  { id: 'acc-rev', code: '411', name: 'المبيعات', type: 'revenue', isGroup: false },
  { id: 'acc-cogs', code: '511', name: 'تكلفة المبيعات', type: 'expense', sub_type: 'cogs', isGroup: false },
];

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => ({
    accounts: sampleAccounts,
    entries: [],
    currentUser: { id: 'user-1', role: 'admin', organization_id: '11111111-1111-1111-1111-111111111111' },
    organization: { id: '11111111-1111-1111-1111-111111111111', name: 'منشأة اختبار' },
    selectedFiscalYear: 2026,
    fiscalYearRange: { startDate: '2026-01-01', endDate: '2026-12-31' },
  }),
}));

import FinancialRatios from '../../modules/reports/FinancialRatios';

describe('FinancialRatios — Server RPC Fast Path & Deterministic Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يستخدم get_trial_balance_summary_rpc دون سحب journal_lines عند نجاح الـ RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { account_id: 'acc-cash', opening_balance: 0, period_debit: 5000, period_credit: 0, closing_balance: 5000 },
        { account_id: 'acc-rev', opening_balance: 0, period_debit: 0, period_credit: 5000, closing_balance: -5000 },
      ],
      error: null,
    });

    render(<FinancialRatios />);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('get_trial_balance_summary_rpc', {
        p_org_id: '11111111-1111-1111-1111-111111111111',
        p_start_date: '2026-01-01',
        p_end_date: '2026-12-31',
      });
    });

    expect(mockFrom).not.toHaveBeenCalledWith('journal_lines');
  });

  it('يعود لمسار journal_lines الاحتياطي بترتيب حتمي على id عند تعذر الـ RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC missing' } });

    const orderSpy = vi.fn();
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: (...args: any[]) => {
        orderSpy(...args);
        return builder;
      },
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValue(builder);

    render(<FinancialRatios />);

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('journal_lines');
      expect(orderSpy).toHaveBeenCalledWith('id', { ascending: true });
    });
  });
});
