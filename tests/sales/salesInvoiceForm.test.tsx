import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SalesInvoiceForm, {
  getSalesInvoiceDraft,
  clearSalesInvoiceDraft,
} from '../../modules/sales/SalesInvoiceForm';
import {
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_CUSTOMER_ID,
  TEST_WAREHOUSE_ID,
} from '../helpers/factories';
import { createSupabaseChain } from '../helpers/mockSupabase';

const mockShowToast = vi.fn();
const mockApproveInvoice = vi.fn();

const storageMap = new Map<string, any>();

vi.mock('../../utils/securityMiddleware', () => ({
  secureStorage: {
    getItem: vi.fn((k: string, def?: any) => (storageMap.has(k) ? storageMap.get(k) : def ?? null)),
    setItem: vi.fn((k: string, v: any) => storageMap.set(k, v)),
    removeItem: vi.fn((k: string) => storageMap.delete(k)),
  },
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => createSupabaseChain<any>({ data: [], error: null })),
    rpc: vi.fn(() => createSupabaseChain<any>({ data: 'INV-0001' as any, error: null }, { data: null, error: null })),
  },
}));

const mockAccountingState = {
  products: [{ id: '77777777-7777-4777-8777-777777777771', name: 'تورتة شوكولاتة', sales_price: 300, warehouse_stock: { [TEST_WAREHOUSE_ID]: 10 } }],
  warehouses: [{ id: TEST_WAREHOUSE_ID, name: 'المستودع الرئيسي', is_primary: true }],
  salespeople: [],
  accounts: [
    { id: 'acc-cash', code: '1231', name: 'الخزينة الرئيسية', type: 'asset', is_group: false, isGroup: false },
    { id: 'acc-bank', code: '1232', name: 'البنك الأهلي', type: 'asset', is_group: false, isGroup: false },
  ],
  approveInvoice: mockApproveInvoice,
  unpostSalesInvoice: vi.fn(),
  deleteSalesInvoice: vi.fn(),
  addCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  settings: { vatRate: 14, enableTax: true },
  can: () => true,
  currentUser: { id: TEST_USER_ID, role: 'admin', organization_id: TEST_ORG_ID },
  customers: [{ id: TEST_CUSTOMER_ID, name: 'عميل تجريبي', phone: '01000000000' }],
  invoices: [],
  getSystemAccount: vi.fn(),
  addEntry: vi.fn(),
  addDemoInvoice: vi.fn(),
  postDemoSalesInvoice: vi.fn(),
  currentSelectedOrgId: TEST_ORG_ID,
  organization: { id: TEST_ORG_ID, name: 'شركة لينزا' },
  organizations: [{ id: TEST_ORG_ID, name: 'شركة لينزا' }],
  selectedFiscalYear: 2026,
};

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => mockAccountingState,
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../services/uomService', () => ({
  fetchUoms: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/sequenceService', () => ({
  getNextDocumentNumber: vi.fn().mockResolvedValue('INV-000101'),
}));

vi.mock('../../services/tenantContext', () => ({
  getActiveOrgIdSync: () => TEST_ORG_ID,
  resolveActiveOrgId: async () => TEST_ORG_ID,
  isValidUUID: (v?: string | null) => Boolean(v && v.length === 36),
}));

vi.mock('../../modules/sales/components/SalesInvoiceExcelImporter', () => ({
  SalesInvoiceExcelImporter: () => null,
}));

describe('🛒 SalesInvoiceForm — Rendering, Validation & Drafts', () => {
  beforeEach(() => {
    storageMap.clear();
    vi.clearAllMocks();
  });

  it('يرفض حفظ فاتورة فارغة بدون عميل أو بنود ويعرض تنبيه التحقق', async () => {
    const { container } = render(
      <React.Suspense fallback={<div>loading</div>}>
        <MemoryRouter>
          <SalesInvoiceForm />
        </MemoryRouter>
      </React.Suspense>
    );

    const form = await vi.waitFor(() => {
      const f = container.querySelector('form');
      if (!f) throw new Error('form not rendered yet');
      return f;
    });
    expect(form).toBeTruthy();
    fireEvent.submit(form);

    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'warning');
    expect(mockApproveInvoice).not.toHaveBeenCalled();
  });

  it('يدعم حفظ واسترجاع ومسح مسودة الفاتورة حتى مع JSON المتسلسل', () => {
    storageMap.set(
      'tripro_sales_invoice_draft_v2',
      JSON.stringify({
        formData: { customerId: TEST_CUSTOMER_ID, notes: 'مسودة تجربة' },
        items: [{ productId: 'p-1', quantity: 2, unitPrice: 150 }],
        pricingTier: 'wholesale',
      })
    );

    const restored = getSalesInvoiceDraft();
    expect(restored?.formData?.customerId).toBe(TEST_CUSTOMER_ID);
    expect(restored?.items).toHaveLength(1);
    expect(restored?.pricingTier).toBe('wholesale');

    clearSalesInvoiceDraft();
    expect(getSalesInvoiceDraft()).toBeNull();
  });

  it('يرفض التحصيل النقدي بدون اختيار خزينة أو بنك عند استرجاع مسودة بها دفعة مدفوعة', async () => {
    storageMap.set('tripro_sales_invoice_draft_v2', {
      formData: {
        customerId: TEST_CUSTOMER_ID,
        warehouseId: TEST_WAREHOUSE_ID,
        date: '2026-11-28',
        dueDate: '2026-12-10',
        paidAmount: 200,
        treasuryId: '',
      },
      items: [
        {
          id: 'line-1',
          productId: '77777777-7777-4777-8777-777777777771',
          productName: 'تورتة شوكولاتة',
          quantity: 2,
          unitPrice: 300,
          total: 600,
        },
      ],
    });

    const { container } = render(
      <React.Suspense fallback={<div>loading</div>}>
        <MemoryRouter>
          <SalesInvoiceForm />
        </MemoryRouter>
      </React.Suspense>
    );

    const form = await vi.waitFor(() => {
      const f = container.querySelector('form');
      if (!f) throw new Error('form not rendered yet');
      return f;
    });

    expect(screen.getAllByText(/تورتة شوكولاتة/).length).toBeGreaterThan(0);
    fireEvent.submit(form);
    expect(mockShowToast).toHaveBeenCalledWith(
      'يرجى اختيار الخزينة أو البنك لاستلام المبلغ المدفوع',
      'warning'
    );
  });
});
