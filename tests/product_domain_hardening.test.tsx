import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ProductProvider, useProductDomain } from '../context/domains/ProductContext';
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

describe('Product & Inventory Domain Hardening & Security (اختبار أمان ونطاق المنتجات)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يعزل بيانات المنظمة ويسجل created_by و updated_by وينظف supplier_id الفارغ عند إضافة صنف', async () => {
    const mockUser = {
      id: 'usr-300',
      full_name: 'كريم أمين المخزن',
      organization_id: 'org-lenza-01'
    };

    const insertedProduct = {
      id: 'p-new',
      name: 'كيك شوكولاتة فاخر',
      price: 180,
      cost: 100,
      organization_id: 'org-lenza-01',
      created_by: 'usr-300',
      updated_by: 'usr-300'
    };

    const singleMock = vi.fn().mockResolvedValue({ data: insertedProduct, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });

    const rangeFetchMock = vi.fn().mockResolvedValue({ data: [insertedProduct], error: null });
    const isMock = vi.fn();
    const eqMock = vi.fn();
    const orderMock = vi.fn().mockReturnValue({ range: rangeFetchMock, limit: vi.fn().mockResolvedValue({ data: [], error: null }) });
    isMock.mockReturnValue({ order: orderMock, range: rangeFetchMock, eq: eqMock });
    eqMock.mockReturnValue({ is: isMock, range: rangeFetchMock, eq: eqMock, order: orderMock });
    const selectFetchMock = vi.fn().mockReturnValue({ eq: eqMock, range: rangeFetchMock, order: orderMock });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'products') {
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
      <ProductProvider
        orgId="org-lenza-01"
        currentUser={mockUser as any}
        logActivity={activityLogger}
        showToast={toastLogger}
      >
        {children}
      </ProductProvider>
    );

    const { result } = renderHook(() => useProductDomain(), { wrapper });

    await act(async () => {
      const added = await result.current.addProduct({
        name: 'كيك شوكولاتة فاخر',
        price: 180,
        supplier_id: ''
      });
      expect(added).toBeDefined();
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'كيك شوكولاتة فاخر',
        organization_id: 'org-lenza-01',
        created_by: 'usr-300',
        updated_by: 'usr-300'
      })
    );

    // supplier_id should have been deleted because it was empty string
    expect(insertMock.mock.calls[0][0].supplier_id).toBeUndefined();

    expect(activityLogger).toHaveBeenCalledWith('إضافة صنف', expect.stringContaining('كيك شوكولاتة فاخر'));
    expect(toastLogger).toHaveBeenCalledWith(expect.stringContaining('بنجاح'), 'success');
  });

  it('يطبق الحذف الآمن للصنف مع عزل المنظمة', async () => {
    const mockUser = {
      id: 'usr-300',
      full_name: 'كريم أمين المخزن',
      organization_id: 'org-lenza-01'
    };

    const eqOrgMock = vi.fn().mockResolvedValue({ error: null });
    const eqIdMock = vi.fn().mockReturnValue({ eq: eqOrgMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqIdMock });

    const rangeFetchMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const isMock = vi.fn();
    const eqMock = vi.fn();
    const orderMock = vi.fn().mockReturnValue({ range: rangeFetchMock, limit: vi.fn().mockResolvedValue({ data: [], error: null }) });
    isMock.mockReturnValue({ order: orderMock, range: rangeFetchMock, eq: eqMock });
    eqMock.mockReturnValue({ is: isMock, range: rangeFetchMock, eq: eqMock, order: orderMock });
    const selectFetchMock = vi.fn().mockReturnValue({ eq: eqMock, range: rangeFetchMock, order: orderMock });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'products') {
        return {
          update: updateMock,
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
      <ProductProvider
        orgId="org-lenza-01"
        currentUser={mockUser as any}
        logActivity={activityLogger}
        showToast={toastLogger}
      >
        {children}
      </ProductProvider>
    );

    const { result } = renderHook(() => useProductDomain(), { wrapper });

    await act(async () => {
      await result.current.deleteProduct('p-999');
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        updated_by: 'usr-300'
      })
    );
    expect(eqIdMock).toHaveBeenCalledWith('id', 'p-999');
    expect(eqOrgMock).toHaveBeenCalledWith('organization_id', 'org-lenza-01');
    expect(activityLogger).toHaveBeenCalledWith('حذف صنف', expect.stringContaining('p-999'));
    expect(toastLogger).toHaveBeenCalledWith(expect.stringContaining('سلة المحذوفات'), 'success');
  });

  it('يستدعي recalculate_stock_rpc عند إعادة احتساب المخزون', async () => {
    (supabase.rpc as any).mockResolvedValue({ error: null });
    const rangeFetchMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const isMock = vi.fn();
    const eqMock = vi.fn();
    const orderMock = vi.fn().mockReturnValue({ range: rangeFetchMock, limit: vi.fn().mockResolvedValue({ data: [], error: null }) });
    isMock.mockReturnValue({ order: orderMock, range: rangeFetchMock, eq: eqMock });
    eqMock.mockReturnValue({ is: isMock, range: rangeFetchMock, eq: eqMock, order: orderMock });
    const selectFetchMock = vi.fn().mockReturnValue({ eq: eqMock, range: rangeFetchMock, order: orderMock });

    (supabase.from as any).mockReturnValue({
      select: selectFetchMock
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProductProvider orgId="org-lenza-01">
        {children}
      </ProductProvider>
    );

    const { result } = renderHook(() => useProductDomain(), { wrapper });

    await act(async () => {
      await result.current.recalculateStock('p-50');
    });

    expect(supabase.rpc).toHaveBeenCalledWith('recalculate_stock_rpc', {
      p_product_id: 'p-50',
      p_org_id: 'org-lenza-01'
    });
  });
});
