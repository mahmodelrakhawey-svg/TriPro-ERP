import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SalesProvider, useSalesDomain } from '../../context/domains/SalesContext';
import { TEST_ORG_ID, TEST_USER_ID, TEST_WAREHOUSE_ID } from '../helpers/factories';
import { createSupabaseChain } from '../helpers/mockSupabase';

const {
  mockRpc,
  mockFrom,
  mockCheckAndSubmit,
  mockInvalidateSalesInvoices,
  mockInvalidateGeneralLedger,
} = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockCheckAndSubmit: vi.fn(),
  mockInvalidateSalesInvoices: vi.fn(),
  mockInvalidateGeneralLedger: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock('../../services/approvalWorkflowService', () => ({
  ApprovalWorkflowService: {
    checkAndSubmit: (...args: any[]) => mockCheckAndSubmit(...args),
  },
}));

vi.mock('../../services/queryClient', () => ({
  queryClient: {
    fetchQuery: vi.fn(async ({ queryFn }: any) => queryFn()),
    invalidateQueries: vi.fn(),
  },
  QUERY_KEYS: {
    salesInvoices: (orgId: string) => ['sales_invoices', orgId],
  },
  STALE_TIMES: { TRANSACTIONS: 60000 },
  invalidateSalesInvoices: (...args: any[]) => mockInvalidateSalesInvoices(...args),
  invalidateGeneralLedger: (...args: any[]) => mockInvalidateGeneralLedger(...args),
}));

vi.mock('../../services/balanceService', () => ({
  fetchCompleteDataset: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/tenantContext', () => ({
  getActiveOrgIdSync: vi.fn((explicit?: string | null) => explicit || null),
}));

describe('🛒 SalesContext — Invoice Approval, Org Sync & Error Handling', () => {
  const mockShowToast = vi.fn();
  const mockLogActivity = vi.fn();

  const stableUser = {
    id: TEST_USER_ID,
    role: 'admin',
    full_name: 'محاسب المبيعات',
    organization_id: TEST_ORG_ID,
  } as any;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SalesProvider
      orgId={TEST_ORG_ID}
      currentUser={stableUser}
      showToast={mockShowToast}
      logActivity={mockLogActivity}
      isDemo={false}
    >
      {children}
    </SalesProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckAndSubmit.mockResolvedValue({ requires_approval: false });
    mockFrom.mockImplementation(() =>
      createSupabaseChain(
        { data: [], error: null },
        { data: { id: 'inv-1', invoice_number: 'INV-100', total_amount: 1000 }, error: null }
      )
    );
    mockRpc.mockResolvedValue({ data: true, error: null });
  });

  it('يرحّل الفاتورة عبر post_sales_invoice مع تمرير p_org_id و p_warehouse_id ويمسح الكاش', async () => {
    const { result } = renderHook(() => useSalesDomain(), { wrapper });

    let ok = false;
    await act(async () => {
      ok = await result.current.approveInvoice('inv-1', undefined, TEST_WAREHOUSE_ID);
    });

    expect(ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('post_sales_invoice', {
      p_invoice_id: 'inv-1',
      p_org_id: TEST_ORG_ID,
      p_warehouse_id: TEST_WAREHOUSE_ID,
    });
    expect(mockInvalidateSalesInvoices).toHaveBeenCalledWith(TEST_ORG_ID);
    expect(mockInvalidateGeneralLedger).toHaveBeenCalledWith(TEST_ORG_ID);
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('بنجاح'), 'success');
  });

  it('يوقف الترحيل ويعيد false إذا تطلبت الفاتورة موافقة مسار الاعتمادات', async () => {
    mockCheckAndSubmit.mockResolvedValueOnce({
      requires_approval: true,
      workflow_name: 'اعتماد المدير المالي',
    });

    const { result } = renderHook(() => useSalesDomain(), { wrapper });

    let ok = true;
    await act(async () => {
      ok = await result.current.approveInvoice('inv-1');
    });

    expect(ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalledWith('post_sales_invoice', expect.anything());
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('اعتماد المدير المالي'),
      'warning'
    );
  });

  it('يعرض رسالة الخطأ عند فشل post_sales_invoice ويرمي الاستثناء', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'رصيد المخزون غير كافٍ' },
    });

    const { result } = renderHook(() => useSalesDomain(), { wrapper });

    let caught: any = null;
    await act(async () => {
      try {
        await result.current.approveInvoice('inv-1');
      } catch (err) {
        caught = err;
      }
    });

    expect(caught?.message).toBe('رصيد المخزون غير كافٍ');
    expect(mockShowToast).toHaveBeenCalledWith(
      'فشل اعتماد فاتورة المبيعات: رصيد المخزون غير كافٍ',
      'error'
    );
  });
});
