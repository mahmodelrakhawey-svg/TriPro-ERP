import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  GeneralLedgerProvider,
  useGeneralLedgerDomain,
} from '../../context/domains/GeneralLedgerContext';
import { TEST_ORG_ID, TEST_USER_ID } from '../helpers/factories';
import { createSupabaseChain } from '../helpers/mockSupabase';

const { mockRpc, mockFrom, mockInvalidateGeneralLedger } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockInvalidateGeneralLedger: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock('../../services/queryClient', () => ({
  queryClient: {
    fetchQuery: vi.fn(async ({ queryFn }: any) => queryFn()),
    setQueriesData: vi.fn(),
    invalidateQueries: vi.fn(),
  },
  QUERY_KEYS: {
    generalLedger: (orgId: string, year: number) => ['general_ledger', orgId, year],
  },
  STALE_TIMES: { TRANSACTIONS: 60000 },
  invalidateGeneralLedger: (...args: any[]) => mockInvalidateGeneralLedger(...args),
}));

vi.mock('../../services/balanceService', () => ({
  fetchCompleteDataset: vi.fn().mockResolvedValue([]),
}));

describe('📒 GeneralLedgerContext — Balance Guard & GL Posting', () => {
  const mockShowToast = vi.fn();
  const mockLogActivity = vi.fn();

  const initialAccounts = [
    { id: 'acc-cash', code: '1231', name: 'الخزينة الرئيسية', type: 'ASSET', isGroup: false },
    { id: 'acc-rev', code: '4101', name: 'إيرادات المبيعات', type: 'REVENUE', isGroup: false },
  ] as any[];

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <GeneralLedgerProvider
      orgId={TEST_ORG_ID}
      currentUser={{ id: TEST_USER_ID, role: 'admin', organization_id: TEST_ORG_ID } as any}
      initialAccounts={initialAccounts}
      showToast={mockShowToast}
      logActivity={mockLogActivity}
      isDemo={false}
    >
      {children}
    </GeneralLedgerProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createSupabaseChain({ data: [], error: null }));
    mockRpc.mockResolvedValue({ data: 'je-1', error: null });
  });

  it('يرفض addEntry أي قيد غير متوازن (المدين لا يساوي الدائن) قبل استدعاء قاعدة البيانات', async () => {
    const { result } = renderHook(() => useGeneralLedgerDomain(), { wrapper });

    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current.addEntry({
          date: '2026-11-28',
          description: 'قيد غير متوازن',
          lines: [
            { accountId: 'acc-cash', debit: 1000, credit: 0 },
            { accountId: 'acc-rev', debit: 0, credit: 900 },
          ],
        });
      } catch (err) {
        caught = err;
      }
    });

    expect((caught as Error)?.message).toContain('القيد المحاسبي غير متوازن');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('غير متوازن'), 'error');
  });

  it('يرحّل القيد المتوازن عبر RPC add_journal_entry مع تمرير p_org_id ويمسح كاش الأستاذ', async () => {
    const { result } = renderHook(() => useGeneralLedgerDomain(), { wrapper });

    await act(async () => {
      await result.current.addEntry({
        date: '2026-11-28',
        reference: 'JE-500',
        description: 'إثبات مبيعات نقدية',
        lines: [
          { accountId: 'acc-cash', debit: 1500, credit: 0 },
          { accountId: 'acc-rev', debit: 0, credit: 1500 },
        ],
      });
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'add_journal_entry',
      expect.objectContaining({
        p_org_id: TEST_ORG_ID,
        reference: 'JE-500',
        status: 'posted',
      })
    );
    expect(mockInvalidateGeneralLedger).toHaveBeenCalledWith(TEST_ORG_ID);
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('بنجاح'), 'success');
  });
});
