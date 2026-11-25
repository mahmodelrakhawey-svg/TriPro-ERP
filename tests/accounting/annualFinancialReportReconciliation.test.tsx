import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockRpc = vi.fn();
const mockAssetsSelect = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1', user_metadata: { org_id: '11111111-1111-1111-1111-111111111111' } } } },
        error: null,
      }),
    },
    rpc: (...args: any[]) => mockRpc(...args),
    from: (table: string) => {
      if (table === 'assets') {
        return {
          select: () => ({
            eq: () => mockAssetsSelect(),
          }),
        };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      };
    },
  },
}));

vi.mock('../../services/tenantContext', () => ({
  getActiveOrgIdSync: () => '11111111-1111-1111-1111-111111111111',
  resolveActiveOrgId: vi.fn().mockResolvedValue('11111111-1111-1111-1111-111111111111'),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../components/ReportHeader', () => ({
  default: () => <div data-testid="report-header" />,
}));

const sampleAccounts = [
  { id: 'acc-10301', code: '10301', name: 'مخزون المواد الخام', type: 'asset' },
  { id: 'acc-1112', code: '1112', name: 'المباني والإنشاءات', type: 'asset' },
  { id: 'acc-1221', code: '1221', name: 'العملاء', type: 'asset' },
  { id: 'acc-123202', code: '123202', name: 'بنك مصر', type: 'asset' },
  { id: 'acc-1241', code: '1241', name: 'ضريبة القيمة المضافة (مدخلات)', type: 'asset' },
  { id: 'acc-201', code: '201', name: 'الموردين', type: 'liability' },
  { id: 'acc-2251', code: '2251', name: 'رواتب وأجور مستحقة', type: 'liability' },
  { id: 'acc-332', code: '332', name: 'جارى الشريك الحاج محمود', type: 'equity' },
  { id: 'acc-3999', code: '3999', name: 'الأرصدة الافتتاحية (حساب وسيط)', type: 'equity' },
  { id: 'acc-411', code: '411', name: 'إيراد مبيعات بضاعة', type: 'revenue' },
  { id: 'acc-511', code: '511', name: 'تكلفة البضاعة المباعة', type: 'expense' },
  { id: 'acc-531', code: '531', name: 'الرواتب والأجور', type: 'expense' },
];

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => ({
    accounts: sampleAccounts,
    settings: { companyName: 'حلواني لينزا', taxNumber: '987-654-321', commercialRegister: '1029384756' },
    organization: { id: '11111111-1111-1111-1111-111111111111', name: 'حلواني لينزا' },
    currentUser: { id: 'user-1', role: 'admin', organization_id: '11111111-1111-1111-1111-111111111111' },
    currentSelectedOrgId: '11111111-1111-1111-1111-111111111111',
    selectedFiscalYear: 2026,
  }),
}));

import AnnualFinancialReport from '../../modules/accounting/AnnualFinancialReport';

describe('📊 AnnualFinancialReport — Dual-Engine RPC & Zero-Imbalance Reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssetsSelect.mockResolvedValue({ data: [], error: null });

    // الأرصدة المتزنة تماماً:
    // الأصول: مخزون (12,000,000) + مباني (5,000,000) + عملاء (500,000) + بنك (1,604,455.62) + ضريبة مدخلات (144,933.74) = 19,249,389.36
    // الخصوم: موردين (10,000,000) + رواتب مستحقة (1,360,347.34) = 11,360,347.34
    // صافي الأصول = 7,889,042.02
    // صافي الربح = مبيعات (20,000,000) - تكلفة (6,000,000) - رواتب (5,376,433.48) = 8,623,566.52
    // جاري الشريك (332) = مدين 734,524.50 => حقوق الملكية (-734,524.50)
    // إجمالي حقوق الملكية = 8,623,566.52 - 734,524.50 = 7,889,042.02 (تطابق 100%!)
    const tbRows = [
      { account_id: 'acc-10301', opening_balance: 0, period_debit: 12000000, period_credit: 0, closing_balance: 12000000 },
      { account_id: 'acc-1112', opening_balance: 0, period_debit: 5000000, period_credit: 0, closing_balance: 5000000 },
      { account_id: 'acc-1221', opening_balance: 0, period_debit: 500000, period_credit: 0, closing_balance: 500000 },
      { account_id: 'acc-123202', opening_balance: 0, period_debit: 1604455.62, period_credit: 0, closing_balance: 1604455.62 },
      { account_id: 'acc-1241', opening_balance: 0, period_debit: 144933.74, period_credit: 0, closing_balance: 144933.74 },
      { account_id: 'acc-201', opening_balance: 0, period_debit: 0, period_credit: 10000000, closing_balance: -10000000 },
      { account_id: 'acc-2251', opening_balance: 0, period_debit: 0, period_credit: 1360347.34, closing_balance: -1360347.34 },
      { account_id: 'acc-332', opening_balance: 0, period_debit: 734524.50, period_credit: 0, closing_balance: 734524.50 },
      { account_id: 'acc-3999', opening_balance: 0, period_debit: 7456379.97, period_credit: 7456379.97, closing_balance: 0 },
      { account_id: 'acc-411', opening_balance: 0, period_debit: 0, period_credit: 20000000, closing_balance: -20000000 },
      { account_id: 'acc-511', opening_balance: 0, period_debit: 6000000, period_credit: 0, closing_balance: 6000000 },
      { account_id: 'acc-531', opening_balance: 0, period_debit: 5376433.48, period_credit: 0, closing_balance: 5376433.48 },
    ];

    const pnlCurrentRows = [
      { account_id: 'acc-411', net_movement: -20000000 },
      { account_id: 'acc-511', net_movement: 6000000 },
      { account_id: 'acc-531', net_movement: 5376433.48 },
    ];

    mockRpc.mockImplementation((fnName: string, params: Record<string, unknown>) => {
      if (fnName === 'get_trial_balance_summary_rpc') {
        return Promise.resolve({ data: tbRows, error: null });
      }
      if (fnName === 'get_income_statement_summary_rpc') {
        if (String(params.p_start_date).startsWith('2026')) {
          return Promise.resolve({ data: pnlCurrentRows, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });
  });

  it('يستخدم دوال الخادم الموحدة RPC ويطابق صافي الأصول وحقوق الملكية بنسبة 100% دون أي فارق توازن', async () => {
    render(
      <MemoryRouter>
        <AnnualFinancialReport />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('get_trial_balance_summary_rpc', expect.objectContaining({
        p_start_date: '2026-01-01',
        p_end_date: '2026-12-31',
      }));
      expect(mockRpc).toHaveBeenCalledWith('get_income_statement_summary_rpc', expect.objectContaining({
        p_start_date: '2026-01-01',
        p_end_date: '2026-12-31',
      }));
    });

    // يجب أن يظهر شارة "متطابق محاسبياً" ولا يظهر "فارق توازن"
    await waitFor(() => {
      expect(screen.getByText(/متطابق محاسبياً/)).toBeTruthy();
    });
    expect(screen.queryByText(/فارق توازن/)).toBeNull();

    // التحقق من صافي الربح (8,623,566.52) وصافي الأصول وحقوق الملكية (7,889,042.02)
    expect(screen.getAllByText('8,623,566.52').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7,889,042.02').length).toBeGreaterThan(0);

    // التحقق من عدم وجود النص الوهمي الثابت القديم (100,000.00 جنيه)
    expect(screen.queryByText(/تم شراء أصول ثابتة بقيمة 100,000.00 جنيه/)).toBeNull();

    // التحقق من مطابقة التدفق النقدي لنهاية العام (1,604,455.62)
    expect(screen.getAllByText('1,604,455.62').length).toBeGreaterThan(0);
  });
});
