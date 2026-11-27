import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { SalesProvider, useSalesDomain } from '../context/domains/SalesContext';

const { mockRpc, mockFrom, mockShowToast } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockShowToast: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

vi.mock('../services/approvalWorkflowService', () => ({
  ApprovalWorkflowService: {
    checkAndSubmit: vi.fn(async () => ({ requires_approval: false })),
  },
}));

describe('SalesContext post_sales_invoice UUID guard', () => {
  const validOrgId = '11111111-1111-1111-1111-111111111111';
  const validInvoiceId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => {
      const chain: Record<string, any> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(async () => ({ data: [], error: null })),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      return chain;
    });
  });

  it('normalizes empty string warehouseId and orgId to null before calling post_sales_invoice', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SalesProvider
        orgId={validOrgId}
        currentUser={{ id: 'user-1', organization_id: validOrgId, role: 'admin', name: 'Admin' } as any}
        showToast={mockShowToast}
      >
        {children}
      </SalesProvider>
    );

    const { result } = renderHook(() => useSalesDomain(), { wrapper });

    await act(async () => {
      await result.current.approveInvoice(validInvoiceId, '', '');
    });

    expect(mockRpc).toHaveBeenCalledWith('post_sales_invoice', {
      p_invoice_id: validInvoiceId,
      p_org_id: validOrgId,
      p_warehouse_id: null,
    });
  });
});
