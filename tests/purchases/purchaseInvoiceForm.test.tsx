import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PurchaseInvoiceForm from '../../modules/purchases/PurchaseInvoiceForm';
import {
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_SUPPLIER_ID,
  TEST_WAREHOUSE_ID,
} from '../helpers/factories';
import { createSupabaseChain } from '../helpers/mockSupabase';

const mockShowToast = vi.fn();
const mockApprovePurchaseInvoice = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => createSupabaseChain<any>({ data: [], error: null })),
    rpc: vi.fn(() => createSupabaseChain<any>({ data: 'PUR-0001' as any, error: null }, { data: null, error: null })),
  },
}));

const mockPurchaseAccountingState = {
  products: [{ id: 'p-1', name: 'دقيق فاخر', purchase_price: 80 }],
  warehouses: [{ id: TEST_WAREHOUSE_ID, name: 'المخزن الرئيسي', is_primary: true }],
  suppliers: [{ id: TEST_SUPPLIER_ID, name: 'شركة المطاحن' }],
  approvePurchaseInvoice: mockApprovePurchaseInvoice,
  unpostPurchaseInvoice: vi.fn(),
  deletePurchaseInvoice: vi.fn(),
  settings: { vatRate: 14, enableTax: true },
  can: () => true,
  currentUser: { id: TEST_USER_ID, role: 'admin', organization_id: TEST_ORG_ID },
  addDemoPurchaseInvoice: vi.fn(),
  accounts: [{ id: 'acc-cash', code: '1231', name: 'الخزينة الرئيسية', is_group: false }],
  currentSelectedOrgId: TEST_ORG_ID,
  addProduct: vi.fn(),
  updateProduct: vi.fn(),
  categories: [],
  getSystemAccount: vi.fn(),
  refreshData: vi.fn(),
};

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => mockPurchaseAccountingState,
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../services/uomService', () => ({
  fetchUoms: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/sequenceService', () => ({
  getNextDocumentNumber: vi.fn().mockResolvedValue('PUR-000101'),
}));

vi.mock('../../services/tenantContext', () => ({
  getActiveOrgIdSync: () => TEST_ORG_ID,
  resolveActiveOrgId: async () => TEST_ORG_ID,
}));

vi.mock('../../components/SupplierSearchSelect', () => ({
  default: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange(TEST_SUPPLIER_ID)}>
      اختيار المورد التجريبي
    </button>
  ),
}));

describe('📦 PurchaseInvoiceForm — Validation & Guard Rails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يرفض حفظ الفاتورة بدون مورد أو مستودع أو بنود ويوجه المستخدم برسائل واضحة', () => {
    const { container, getByText } = render(
      <MemoryRouter>
        <PurchaseInvoiceForm />
      </MemoryRouter>
    );

    const saveDraftBtn = getByText(/حفظ كمسودة/);
    fireEvent.click(saveDraftBtn);
    expect(mockShowToast).toHaveBeenCalledWith('يرجى اختيار أو إضافة المورد أولاً ⚠️', 'warning');

    // اختيار المورد ثم محاولة الحفظ بدون مستودع أو بنود
    fireEvent.click(getByText('اختيار المورد التجريبي'));
    fireEvent.click(saveDraftBtn);

    const lastMsg = mockShowToast.mock.calls[mockShowToast.mock.calls.length - 1]?.[0] as string;
    expect(lastMsg).toMatch(/المستودع|بند واحد/);
    expect(mockApprovePurchaseInvoice).not.toHaveBeenCalled();
    expect(container.firstChild).toBeTruthy();
  });
});
