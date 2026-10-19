import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SupplierProvider, useSupplierDomain } from '../context/domains/SupplierContext';
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

describe('Supplier Domain Hardening & Security (اختبار أمان ونطاق الموردين)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يعزل بيانات المنظمة ويسجل created_by و updated_by عند إضافة مورد', async () => {
    const mockUser = {
      id: 'usr-200',
      full_name: 'سارة مدير المشتريات',
      organization_id: 'org-lenza-01'
    };

    const insertedSupplier = {
      id: 'sup-new',
      name: 'شركة مطاحن الخير',
      phone: '01055556666',
      organization_id: 'org-lenza-01',
      created_by: 'usr-200',
      updated_by: 'usr-200'
    };

    const singleMock = vi.fn().mockResolvedValue({ data: insertedSupplier, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });

    const rangeFetchMock = vi.fn().mockResolvedValue({ data: [insertedSupplier], error: null });
    const selectFetchMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ range: rangeFetchMock }),
          range: rangeFetchMock
        }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          range: rangeFetchMock
        }),
        range: rangeFetchMock
      }),
      range: rangeFetchMock
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'suppliers') {
        return {
          insert: insertMock,
          select: selectFetchMock
        };
      }
      return {
        select: selectFetchMock
      };
    });

    const activityLogger = vi.fn();
    const toastLogger = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SupplierProvider
        orgId="org-lenza-01"
        currentUser={mockUser as any}
        logActivity={activityLogger}
        showToast={toastLogger}
      >
        {children}
      </SupplierProvider>
    );

    const { result } = renderHook(() => useSupplierDomain(), { wrapper });

    await act(async () => {
      const added = await result.current.addSupplier({ name: 'شركة مطاحن الخير', phone: '01055556666' });
      expect(added).toBeDefined();
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'شركة مطاحن الخير',
        organization_id: 'org-lenza-01',
        created_by: 'usr-200',
        updated_by: 'usr-200'
      })
    );

    expect(activityLogger).toHaveBeenCalledWith('إضافة مورد', expect.stringContaining('شركة مطاحن الخير'));
    expect(toastLogger).toHaveBeenCalledWith(expect.stringContaining('بنجاح'), 'success');
  });

  it('يطبق الحذف الآمن للمورد مع سبب الحذف وعزل المنظمة', async () => {
    const mockUser = {
      id: 'usr-200',
      full_name: 'سارة مدير المشتريات',
      organization_id: 'org-lenza-01'
    };

    const eqOrgMock = vi.fn().mockResolvedValue({ error: null });
    const eqIdMock = vi.fn().mockReturnValue({ eq: eqOrgMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqIdMock });

    const rangeFetchMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const selectFetchMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ range: rangeFetchMock }),
          range: rangeFetchMock
        }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          range: rangeFetchMock
        }),
        range: rangeFetchMock
      }),
      range: rangeFetchMock
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'suppliers') {
        return {
          update: updateMock,
          select: selectFetchMock
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              range: rangeFetchMock
            }),
            range: rangeFetchMock
          })
        })
      };
    });

    const activityLogger = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SupplierProvider
        orgId="org-lenza-01"
        currentUser={mockUser as any}
        logActivity={activityLogger}
      >
        {children}
      </SupplierProvider>
    );

    const { result } = renderHook(() => useSupplierDomain(), { wrapper });

    await act(async () => {
      await result.current.deleteSupplier('sup-888', 'إنهاء التعاقد السنوي');
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deletion_reason: 'إنهاء التعاقد السنوي',
        updated_by: 'usr-200'
      })
    );
    expect(eqIdMock).toHaveBeenCalledWith('id', 'sup-888');
    expect(eqOrgMock).toHaveBeenCalledWith('organization_id', 'org-lenza-01');
    expect(activityLogger).toHaveBeenCalledWith('حذف مورد', expect.stringContaining('sup-888'));
  });

  it('يستدعي post_purchase_invoice RPC عند اعتماد فاتورة المشتريات مع المنظمة والمستودع', async () => {
    (supabase.rpc as any).mockResolvedValue({ error: null });
    const rangeFetchMock = vi.fn().mockResolvedValue({ data: [], error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ range: rangeFetchMock }),
            range: rangeFetchMock
          }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            range: rangeFetchMock
          }),
          range: rangeFetchMock
        }),
        range: rangeFetchMock
      })
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SupplierProvider orgId="org-lenza-01">
        {children}
      </SupplierProvider>
    );

    const { result } = renderHook(() => useSupplierDomain(), { wrapper });

    await act(async () => {
      await result.current.approvePurchaseInvoice('pi-100', 'org-lenza-01', 'wh-main');
    });

    expect(supabase.rpc).toHaveBeenCalledWith('post_purchase_invoice', {
      p_invoice_id: 'pi-100',
      p_org_id: 'org-lenza-01',
      p_warehouse_id: 'wh-main'
    });
  });
});
