import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SalesProvider, useSalesDomain } from '../context/domains/SalesContext';
import { SupplierProvider, useSupplierDomain } from '../context/domains/SupplierContext';
import { GeneralLedgerProvider, useGeneralLedgerDomain } from '../context/domains/GeneralLedgerContext';
import { BankingProvider, useBankingDomain } from '../context/domains/BankingContext';
import { restoreRecycleItem, permanentDeleteRecycleItem } from '../services/systemMaintenanceService';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

describe('Phase 3 Domain Delegation & System Maintenance Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SalesProvider delegates unpostSalesReturn & deleteSalesReturn with org isolation', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SalesProvider orgId="org-phase3-sales" currentUser={{ id: 'u1', organization_id: 'org-phase3-sales', role: 'admin' } as any}>
        {children}
      </SalesProvider>
    );

    const { result } = renderHook(() => useSalesDomain(), { wrapper });

    await act(async () => {
      const okUnpost = await result.current.unpostSalesReturn('sr-10');
      const okDel = await result.current.deleteSalesReturn('sr-11');
      expect(okUnpost).toBe(true);
      expect(okDel).toBe(true);
    });

    expect(supabase.rpc).toHaveBeenCalledWith('unpost_sales_return', { p_return_id: 'sr-10', p_org_id: 'org-phase3-sales' });
    expect(supabase.rpc).toHaveBeenCalledWith('delete_sales_return', { p_return_id: 'sr-11', p_org_id: 'org-phase3-sales' });
  });

  it('SupplierProvider delegates unpostPurchaseReturn & deletePurchaseReturn with org isolation', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SupplierProvider orgId="org-phase3-sup" currentUser={{ id: 'u1', organization_id: 'org-phase3-sup', role: 'admin' } as any}>
        {children}
      </SupplierProvider>
    );

    const { result } = renderHook(() => useSupplierDomain(), { wrapper });

    await act(async () => {
      expect(await result.current.unpostPurchaseReturn('pr-10')).toBe(true);
      expect(await result.current.deletePurchaseReturn('pr-11')).toBe(true);
    });

    expect(supabase.rpc).toHaveBeenCalledWith('unpost_purchase_return', { p_return_id: 'pr-10', p_org_id: 'org-phase3-sup' });
    expect(supabase.rpc).toHaveBeenCalledWith('delete_purchase_return', { p_return_id: 'pr-11', p_org_id: 'org-phase3-sup' });
  });

  it('GeneralLedgerProvider supports addOpeningBalanceTransaction & createMissingSystemAccounts', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: true, error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const showToast = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GeneralLedgerProvider orgId="org-phase3-gl" showToast={showToast}>
        {children}
      </GeneralLedgerProvider>
    );

    const { result } = renderHook(() => useGeneralLedgerDomain(), { wrapper });

    await act(async () => {
      await result.current.addOpeningBalanceTransaction('cust-1', 'customer', 2500, '2026-01-01', 'عميل أول');
      await result.current.createMissingSystemAccounts();
    });

    expect(supabase.rpc).toHaveBeenCalledWith('add_opening_balance', {
      p_id: 'cust-1',
      p_type: 'customer',
      p_amount: 2500,
      p_date: '2026-01-01',
      p_name: 'عميل أول',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('create_missing_system_accounts');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('الرصيد الافتتاحي'), 'success');
  });

  it('BankingProvider creates payment voucher with journal rollback if entry creation fails', async () => {
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    const deleteMock = vi.fn().mockReturnValue({ eq: deleteEqMock });
    const insertSingleMock = vi.fn().mockResolvedValue({ data: { id: 'pv-new-1' }, error: null });
    const orderMock = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) });
    const selectEqReturn = { order: orderMock, is: vi.fn().mockReturnValue({ order: orderMock }) };

    const paymentVouchersMock = {
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ maybeSingle: insertSingleMock }) }),
      delete: deleteMock,
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(selectEqReturn) }),
    };

    (supabase.rpc as any).mockRejectedValue(new Error('rpc missing'));
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'payment_vouchers') {
        return paymentVouchersMock;
      }
      if (table === 'journal_entries') {
        return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: new Error('je blocked') }) }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(selectEqReturn) }),
      };
    });

    const orgUuid = '11111111-1111-4111-8111-111111111111';
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BankingProvider
        orgId={orgUuid}
        accounts={[{ id: 'acc-sup', code: '201', name: 'الموردين', type: 'LIABILITY' } as any]}
        suppliers={[{ id: 'sup-1', name: 'مورد الدقيق' } as any]}
      >
        {children}
      </BankingProvider>
    );

    const { result } = renderHook(() => useBankingDomain(), { wrapper });

    await expect(
      result.current.addPaymentVoucher({
        supplier_id: 'sup-1',
        treasury_account_id: 'acc-cash',
        amount: 500,
        date: '2026-11-27',
      })
    ).rejects.toThrow('فشل إنشاء القيد المحاسبي');

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'pv-new-1');
  });

  it('systemMaintenanceService enforces recycle-bin table allowlist and cleans up asset entries', async () => {
    const blocked = await restoreRecycleItem({
      supabaseClient: supabase,
      table: 'journal_entries',
      id: 'je-1',
      orgId: 'org-1',
    });
    expect(blocked.success).toBe(false);

    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const inMock = vi.fn().mockResolvedValue({ error: null });
    const delEqMock = vi.fn().mockReturnThis();
    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'journal_entries') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({ data: [{ id: 'je-asset-1' }], error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ in: inMock }),
          delete: vi.fn().mockReturnValue({ in: inMock }),
        };
      }
      if (table === 'journal_lines') {
        return { delete: vi.fn().mockReturnValue({ in: inMock }) };
      }
      if (table === 'asset_audits' || table === 'asset_transfers') {
        return { delete: vi.fn().mockReturnValue({ eq: eqMock }) };
      }
      return {
        delete: vi.fn().mockReturnValue({ eq: delEqMock }),
      };
    });

    const deleted = await permanentDeleteRecycleItem({
      supabaseClient: supabase,
      table: 'assets',
      id: 'asset-1234-5678',
      orgId: 'org-1',
    });
    expect(deleted.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('recalculate_all_system_balances', { p_org_id: 'org-1' });
  });
});
