import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import SalesReturnForm from '../../modules/sales/SalesReturnForm';
import { renderWithRouter } from '../helpers/renderWithContext';
import {
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_CUSTOMER_ID,
  TEST_WAREHOUSE_ID,
} from '../helpers/factories';
import { createSupabaseChain } from '../helpers/mockSupabase';

const mockShowToast = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

const mockSalesReturnAccountingState = {
  customers: [{ id: TEST_CUSTOMER_ID, name: 'عميل التجزئة' }],
  products: [{ id: 'p-1', name: 'تورتة فانيليا', sales_price: 250, sku: 'SKU-1' }],
  currentUser: { id: TEST_USER_ID, role: 'admin', organization_id: TEST_ORG_ID },
  currentSelectedOrgId: TEST_ORG_ID,
  warehouses: [{ id: TEST_WAREHOUSE_ID, name: 'المستودع الرئيسي' }],
  settings: { enableTax: true, vatRate: 14 },
  accounts: [],
  getSystemAccount: vi.fn(),
  addEntry: vi.fn(),
  refreshData: vi.fn(),
  unpostSalesReturn: vi.fn(),
  deleteSalesReturn: vi.fn(),
};

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => mockSalesReturnAccountingState,
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock('../../services/tenantContext', () => ({
  getActiveOrgIdSync: () => TEST_ORG_ID,
  resolveActiveOrgId: async () => TEST_ORG_ID,
  isValidUUID: (v?: string | null) => Boolean(v && v.length === 36),
  ensureDocumentJournalOrgSync: vi.fn(),
}));

describe('↩️ SalesReturnForm — Validation & Original Invoice Lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createSupabaseChain<any>({ data: [], error: null }));
    mockRpc.mockImplementation(() =>
      createSupabaseChain<any>({ data: null as any, error: null }, { data: null, error: null })
    );
  });

  it('يرفض حفظ مرتجع مبيعات بدون عميل أو بنود ويعرض تنبيه التحقق', async () => {
    renderWithRouter(<SalesReturnForm />);

    const saveBtn = await screen.findByRole('button', { name: /حفظ وترحيل/ });
    fireEvent.click(saveBtn);
    expect(mockShowToast).toHaveBeenCalledWith('الرجاء اختيار العميل', 'warning');
  });

  it('يعرض زر جلب فاتورة أصلية ويمنع جلب فاتورة غير موجودة برسالة مناسبة', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'invoices') {
        return createSupabaseChain<any>(
          { data: [], error: null },
          { data: null, error: { message: 'not found' } }
        );
      }
      return createSupabaseChain<any>({ data: [], error: null });
    });

    renderWithRouter(<SalesReturnForm />);

    const searchInput = await screen.findByPlaceholderText(/أدخل رقم الفاتورة/i);
    fireEvent.change(searchInput, { target: { value: 'INV-99999' } });

    const fetchBtn = screen.getByRole('button', { name: /جلب الأصناف|بحث/i });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalled();
    });
  });
});
