import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SalesProvider, useSalesDomain } from '../context/domains/SalesContext';
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

describe('Sales Domain Hardening & Security (اختبار أمان ونطاق المبيعات)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يستدعي post_sales_invoice RPC عند اعتماد فاتورة المبيعات مع المنظمة والمستودع', async () => {
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

    const activityLogger = vi.fn();
    const toastLogger = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SalesProvider
        orgId="org-lenza-01"
        logActivity={activityLogger}
        showToast={toastLogger}
      >
        {children}
      </SalesProvider>
    );

    const { result } = renderHook(() => useSalesDomain(), { wrapper });

    await act(async () => {
      const res = await result.current.approveInvoice('inv-999', 'org-lenza-01', 'wh-main');
      expect(res).toBe(true);
    });

    expect(supabase.rpc).toHaveBeenCalledWith('post_sales_invoice', {
      p_invoice_id: 'inv-999',
      p_org_id: 'org-lenza-01',
      p_warehouse_id: 'wh-main'
    });
    expect(activityLogger).toHaveBeenCalledWith('اعتماد فاتورة مبيعات', expect.stringContaining('inv-999'));
    expect(toastLogger).toHaveBeenCalledWith(expect.stringContaining('بنجاح'), 'success');
  });

  it('يستدعي unpost_sales_invoice RPC عند إلغاء ترحيل فاتورة المبيعات', async () => {
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
      <SalesProvider orgId="org-lenza-01">
        {children}
      </SalesProvider>
    );

    const { result } = renderHook(() => useSalesDomain(), { wrapper });

    await act(async () => {
      const res = await result.current.unpostSalesInvoice('inv-999', 'org-lenza-01');
      expect(res).toBe(true);
    });

    expect(supabase.rpc).toHaveBeenCalledWith('unpost_sales_invoice', {
      p_invoice_id: 'inv-999',
      p_org_id: 'org-lenza-01'
    });
  });
});
