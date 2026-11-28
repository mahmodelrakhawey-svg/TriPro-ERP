import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BankingProvider, useBankingDomain } from '../../context/domains/BankingContext';
import {
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_CASH_ACC_ID,
  TEST_BANK_ACC_ID,
  makeProfile,
  makeTransferPayload,
} from '../helpers/factories';
import { createSupabaseChain } from '../helpers/mockSupabase';

const {
  HOISTED_ORG_ID,
  HOISTED_USER_ID,
  mockRpc,
  mockFrom,
  mockInvalidateGeneralLedger,
} = vi.hoisted(() => ({
  HOISTED_ORG_ID: '11111111-1111-4111-8111-111111111111',
  HOISTED_USER_ID: '22222222-2222-4222-8222-222222222222',
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockInvalidateGeneralLedger: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: HOISTED_USER_ID, user_metadata: { org_id: HOISTED_ORG_ID } } } },
        error: null,
      }),
    },
  },
}));

vi.mock('../../services/queryClient', () => ({
  invalidateGeneralLedger: (...args: any[]) => mockInvalidateGeneralLedger(...args),
}));

vi.mock('../../services/tenantContext', () => ({
  getActiveOrgIdSync: vi.fn((explicit?: string | null) => explicit || HOISTED_ORG_ID),
  resolveActiveOrgId: vi.fn(async (explicit?: string | null) => explicit || HOISTED_ORG_ID),
}));

describe('🏦 BankingContext — Treasury Transfers & Error Handling', () => {
  const mockShowToast = vi.fn();
  const mockLogActivity = vi.fn();
  const mockRefreshAllData = vi.fn().mockResolvedValue(undefined);

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BankingProvider
      orgId={TEST_ORG_ID}
      currentUser={makeProfile() as any}
      logActivity={mockLogActivity}
      showToast={mockShowToast}
      refreshAllData={mockRefreshAllData}
      isDemo={false}
    >
      {children}
    </BankingProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createSupabaseChain({ data: [], error: null }));
    mockRpc.mockResolvedValue({ data: 'je-transfer-1', error: null });
  });

  it('ينفذ addTransfer عبر RPC add_treasury_transfer بالمعاملات الصحيحة ويحدّث السجل', async () => {
    const { result } = renderHook(() => useBankingDomain(), { wrapper });

    await act(async () => {
      await result.current.addTransfer(makeTransferPayload({ amount: 7500 }));
    });

    expect(mockRpc).toHaveBeenCalledWith('add_treasury_transfer', {
      p_from_account_id: TEST_CASH_ACC_ID,
      p_to_account_id: TEST_BANK_ACC_ID,
      p_amount: 7500,
      p_transfer_date: '2026-11-28',
      p_notes: 'تحويل نقدية إلى البنك',
      p_org_id: TEST_ORG_ID,
      p_user_id: TEST_USER_ID,
    });
    expect(mockInvalidateGeneralLedger).toHaveBeenCalledWith(TEST_ORG_ID);
    expect(mockRefreshAllData).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('بنجاح'), 'success');
  });

  it('يمنع تكرار إرسال نفس التحويل خلال 3.5 ثوانٍ (Double-Submit Guard)', async () => {
    const { result } = renderHook(() => useBankingDomain(), { wrapper });
    const payload = makeTransferPayload({ amount: 1200 });

    await act(async () => {
      await result.current.addTransfer(payload);
      await result.current.addTransfer(payload);
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('يستخرج رسالة خطأ PostgrestError الحقيقية بدلاً من [object Object] ويسمح بإعادة المحاولة عند الفشل', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'P0001',
        details: null,
        hint: null,
        message: 'TRIPRO_SECURITY_ALERT: إعادة احتساب أرصدة النظام تقتصر على المدراء والمحاسبين المعتمدين.',
      },
    });

    const { result } = renderHook(() => useBankingDomain(), { wrapper });
    const payload = makeTransferPayload({ amount: 3000 });

    let caughtErr: any = null;
    await act(async () => {
      try {
        await result.current.addTransfer(payload);
      } catch (err) {
        caughtErr = err;
      }
    });
    expect(caughtErr).toMatchObject({ code: 'P0001' });

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('TRIPRO_SECURITY_ALERT'),
      'error'
    );
    expect(mockShowToast).not.toHaveBeenCalledWith(
      expect.stringContaining('[object Object]'),
      'error'
    );

    // بعد الفشل يجب تصفير قفل التكرار لتمكين المستخدم من إعادة المحاولة فوراً
    mockRpc.mockResolvedValueOnce({ data: 'je-retry-ok', error: null });
    await act(async () => {
      await result.current.addTransfer(payload);
    });
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('ينفذ updateTransfer و deleteTransfer عبر الـ RPCs المخصصة ويجلب البيانات المحدثة', async () => {
    const { result } = renderHook(() => useBankingDomain(), { wrapper });

    await act(async () => {
      await result.current.updateTransfer('je-1', makeTransferPayload({ amount: 9000 }));
      await result.current.deleteTransfer('je-1');
    });

    expect(mockRpc).toHaveBeenCalledWith('update_treasury_transfer', {
      p_journal_entry_id: 'je-1',
      p_from_account_id: TEST_CASH_ACC_ID,
      p_to_account_id: TEST_BANK_ACC_ID,
      p_amount: 9000,
      p_transfer_date: '2026-11-28',
      p_notes: 'تحويل نقدية إلى البنك',
    });
    expect(mockRpc).toHaveBeenCalledWith('delete_treasury_transfer', {
      p_journal_entry_id: 'je-1',
    });
    expect(mockInvalidateGeneralLedger).toHaveBeenCalledWith(TEST_ORG_ID);
  });
});
