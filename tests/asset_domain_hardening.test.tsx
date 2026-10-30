import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { AssetProvider, useAssetDomain } from '../context/domains/AssetContext';

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

describe('Asset Domain Hardening & Multi-tenancy (اختبار متانة نطاق الأصول الثابتة)', () => {
  const mockOrgId = 'org-asset-test-999';
  const mockUser = {
    id: 'user-asset-mgr',
    organization_id: mockOrgId,
    name: 'مدير الأصول',
    role: 'accountant'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const mockChain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'asset-uuid-1234',
          name: 'فرن حلويات دوار',
          purchase_cost: 85000,
          purchase_date: '2026-01-15',
          asset_account_id: 'acc-asset-1'
        },
        error: null
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'asset-uuid-1234',
          name: 'فرن حلويات دوار',
          purchase_cost: 85000,
          current_value: 85000,
          asset_account_id: 'acc-asset-1'
        },
        error: null
      }),
      or: vi.fn().mockReturnThis(),
    };
    (supabase.from as any).mockReturnValue(mockChain);
    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
  });

  it('يجب أن يعزل بيانات المنشأة ويضيف الأصل مع تنظيف الحسابات الفارغة', async () => {
    const showToast = vi.fn();
    const logActivity = vi.fn();
    const addEntry = vi.fn().mockResolvedValue(true);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AssetProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        showToast={showToast}
        logActivity={logActivity}
        addEntry={addEntry}
      >
        {children}
      </AssetProvider>
    );

    const { result } = renderHook(() => useAssetDomain(), { wrapper });

    await act(async () => {
      await result.current.addAsset({
        name: 'عجانة صناعية 50 كجم',
        purchase_cost: 45000,
        asset_account_id: 'acc-101',
        accumulated_depreciation_account_id: '', // يجب تنظيفه إلى null
        depreciation_expense_account_id: '',
        create_journal_entry: false
      });
    });

    expect(supabase.from).toHaveBeenCalledWith('assets');
    const insertCalls = (supabase.from('assets').insert as any).mock.calls;
    expect(insertCalls.length).toBeGreaterThan(0);
    const payload = insertCalls[0][0];
    expect(payload.organization_id).toBe(mockOrgId);
    expect(payload.accumulated_depreciation_account_id).toBeNull();
    expect(payload.depreciation_expense_account_id).toBeNull();
    expect(logActivity).toHaveBeenCalledWith('ADD_ASSET', expect.stringContaining('عجانة'));
  });

  it('يجب أن يُنشئ قيد يومية آلي عند تفعيل create_journal_entry مع ربط المعرف المرجعي', async () => {
    const showToast = vi.fn();
    const addEntry = vi.fn().mockResolvedValue(true);
    const getSystemAccount = vi.fn().mockReturnValue({ id: 'acc-opening-bal' });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AssetProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        showToast={showToast}
        addEntry={addEntry}
        getSystemAccount={getSystemAccount}
      >
        {children}
      </AssetProvider>
    );

    const { result } = renderHook(() => useAssetDomain(), { wrapper });

    await act(async () => {
      await result.current.addAsset({
        name: 'فرن حلويات دوار',
        purchase_cost: 85000,
        asset_account_id: 'acc-asset-fixed',
        create_journal_entry: true,
        credit_account_id: 'acc-treasury-main'
      });
    });

    expect(addEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'posted',
        p_org_id: mockOrgId,
        lines: expect.arrayContaining([
          expect.objectContaining({ debit: 85000, credit: 0 }),
          expect.objectContaining({ debit: 0, credit: 85000 })
        ])
      })
    );
  });

  it('يجب أن يستدعي runDepreciation الدالة المخزنة run_monthly_depreciation بنجاح', async () => {
    const showToast = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AssetProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        showToast={showToast}
      >
        {children}
      </AssetProvider>
    );

    const { result } = renderHook(() => useAssetDomain(), { wrapper });

    await act(async () => {
      await result.current.runDepreciation('asset-123', 2500, '2026-03-31');
    });

    expect(supabase.rpc).toHaveBeenCalledWith('run_monthly_depreciation', {
      p_asset_id: 'asset-123',
      p_amount: 2500,
      p_date: '2026-03-31'
    });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('تم تنفيذ الإهلاك'), 'success');
  });

  it('يجب أن يقوم deleteAsset بالحذف الآمن وإلغاء ترحيل قيود الأصل وإعادة احتساب الأرصدة', async () => {
    const showToast = vi.fn();
    const logActivity = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AssetProvider
        orgId={mockOrgId}
        currentUser={mockUser as any}
        showToast={showToast}
        logActivity={logActivity}
      >
        {children}
      </AssetProvider>
    );

    const { result } = renderHook(() => useAssetDomain(), { wrapper });

    await act(async () => {
      await result.current.deleteAsset('asset-prod-99');
    });

    expect(supabase.from).toHaveBeenCalledWith('assets');
    expect(supabase.from).toHaveBeenCalledWith('journal_entries');
    expect(supabase.rpc).toHaveBeenCalledWith('recalculate_all_system_balances', {
      p_org_id: mockOrgId
    });
  });
});
