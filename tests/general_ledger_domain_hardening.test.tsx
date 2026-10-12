import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { GeneralLedgerProvider, useGeneralLedgerDomain } from '../context/domains/GeneralLedgerContext';

// Mock Supabase
vi.mock('../supabaseClient', () => {
  const mockFrom = vi.fn();
  const mockRpc = vi.fn();
  return {
    supabase: {
      from: mockFrom,
      rpc: mockRpc,
    },
  };
});

import { supabase } from '../supabaseClient';

describe('General Ledger Domain Hardening & Multi-tenancy', () => {
  const mockOrgId = 'org-gl-test-123';
  const mockUser = {
    id: 'user-gl-1',
    organization_id: mockOrgId,
    name: 'محاسب عام',
    role: 'accountant'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يجب أن يرفض addEntry القيد غير المتوازن ويرمي استثناء قبل الوصول لقاعدة البيانات', async () => {
    const showToast = vi.fn();
    const logActivity = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GeneralLedgerProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        showToast={showToast}
        logActivity={logActivity}
      >
        {children}
      </GeneralLedgerProvider>
    );

    const { result } = renderHook(() => useGeneralLedgerDomain(), { wrapper });

    const unbalancedEntry = {
      reference: 'JE-TEST-UNBALANCED',
      date: '2026-10-12',
      description: 'قيد غير متوازن للاختبار',
      lines: [
        { accountId: 'acc-1', debit: 1000, credit: 0, description: 'مدين' },
        { accountId: 'acc-2', debit: 0, credit: 800, description: 'دائن ناقص' },
      ]
    };

    await expect(result.current.addEntry(unbalancedEntry)).rejects.toThrow('القيد المحاسبي غير متوازن');
    expect(supabase.rpc).not.toHaveBeenCalledWith('add_journal_entry', expect.anything());
  });

  it('يجب أن ينفذ addEntry القيد المتوازن بنجاح مع ربط منظمة المستخدم وسجل التدقيق', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: { success: true }, error: null });
    // Mock fetchLedgerData sub-queries
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const showToast = vi.fn();
    const logActivity = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GeneralLedgerProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        showToast={showToast}
        logActivity={logActivity}
      >
        {children}
      </GeneralLedgerProvider>
    );

    const { result } = renderHook(() => useGeneralLedgerDomain(), { wrapper });

    const balancedEntry = {
      reference: 'JE-TEST-BALANCED',
      date: '2026-10-12',
      description: 'قيد متوازن للاختبار',
      lines: [
        { accountId: 'acc-1', debit: 500, credit: 0, description: 'مدين' },
        { accountId: 'acc-2', debit: 0, credit: 500, description: 'دائن' },
      ]
    };

    await act(async () => {
      await result.current.addEntry(balancedEntry);
    });

    expect(supabase.rpc).toHaveBeenCalledWith('add_journal_entry', expect.objectContaining({
      reference: 'JE-TEST-BALANCED',
      p_org_id: mockOrgId,
    }));
    expect(logActivity).toHaveBeenCalledWith('إنشاء قيد يومية', expect.stringContaining('JE-TEST-BALANCED'));
  });

  it('يجب أن يسترجع getSystemAccount الحساب المطلوب وفقاً للإعدادات أو الأكواد الافتراضية', () => {
    const mockAccounts = [
      { id: 'acc-cash', code: '1231', name: 'الخزينة الرئيسية' },
      { id: 'acc-cust', code: '1221', name: 'العملاء' },
      { id: 'acc-supp', code: '201', name: 'الموردين' },
    ];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GeneralLedgerProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        initialAccounts={mockAccounts as any}
        settings={{ account_mappings: { CASH: 'acc-cash' } }}
      >
        {children}
      </GeneralLedgerProvider>
    );

    const { result } = renderHook(() => useGeneralLedgerDomain(), { wrapper });

    const cashAccount = result.current.getSystemAccount?.('CASH');
    expect(cashAccount?.id).toBe('acc-cash');

    const customerAccount = result.current.getSystemAccount?.('CUSTOMERS');
    expect(customerAccount?.id).toBe('acc-cust');
  });
});
