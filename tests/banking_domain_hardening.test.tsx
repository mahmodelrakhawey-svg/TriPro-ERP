import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BankingProvider, useBankingDomain } from '../context/domains/BankingContext';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  const mockFrom = vi.fn();
  const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return {
    supabase: {
      from: mockFrom,
      rpc: mockRpc
    }
  };
});

describe('Banking & Treasury Domain Hardening & Security (اختبار أمان ونطاق البنوك والخزينة)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يعزل بيانات المنظمة ويسجل created_by عند إضافة شيك', async () => {
    const mockUser = {
      id: 'usr-400',
      full_name: 'محمود أمين الخزينة',
      organization_id: 'org-lenza-01'
    };

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const orderMock = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) });
    const isMock = vi.fn().mockReturnValue({ order: orderMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock, is: isMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock, order: orderMock });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'cheques') {
        return {
          insert: insertMock,
          select: selectMock
        };
      }
      return {
        select: selectMock
      };
    });

    const activityLogger = vi.fn();
    const toastLogger = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BankingProvider
        orgId="org-lenza-01"
        currentUser={mockUser as any}
        logActivity={activityLogger}
        showToast={toastLogger}
      >
        {children}
      </BankingProvider>
    );

    const { result } = renderHook(() => useBankingDomain(), { wrapper });

    await act(async () => {
      await result.current.addCheque({
        cheque_number: 'CHQ-7788',
        amount: 25000,
        due_date: '2026-11-01'
      });
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cheque_number: 'CHQ-7788',
        organization_id: 'org-lenza-01',
        created_by: 'usr-400'
      })
    );

    expect(activityLogger).toHaveBeenCalledWith('تسجيل شيك', expect.stringContaining('CHQ-7788'));
    expect(toastLogger).toHaveBeenCalledWith(expect.stringContaining('بنجاح'), 'success');
  });

  it('يستدعي cash_or_collect_cheque RPC عند صرف أو تحصيل الشيك', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: { success: true }, error: null });

    const orderMock = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) });
    const isMock = vi.fn().mockReturnValue({ order: orderMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock, is: isMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock, order: orderMock });

    (supabase.from as any).mockReturnValue({
      select: selectMock
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BankingProvider orgId="org-lenza-01">
        {children}
      </BankingProvider>
    );

    const { result } = renderHook(() => useBankingDomain(), { wrapper });

    await act(async () => {
      await result.current.updateChequeStatus('chq-10', 'cashed', '2026-10-15', 'acc-bank-1');
    });

    expect(supabase.rpc).toHaveBeenCalledWith('cash_or_collect_cheque', {
      p_cheque_id: 'chq-10',
      p_status: 'cashed',
      p_bank_account_id: 'acc-bank-1',
      p_action_date: '2026-10-15',
      p_user_id: null
    });
  });
});
