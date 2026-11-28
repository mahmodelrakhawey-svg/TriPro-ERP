import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
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

  it('يضيف صنفاً بالبحث ويعيد احتساب الضريبة والخصم الإجمالي والإجمالي النهائي ويتيح فتح نافذة صنف جديد', async () => {
    const { getByPlaceholderText, getByText, getAllByText } = render(
      <MemoryRouter>
        <PurchaseInvoiceForm />
      </MemoryRouter>
    );

    const searchInput = getByPlaceholderText('ابحث بالاسم، الكود، أو الباركود واضغط Enter...');
    fireEvent.change(searchInput, { target: { value: 'دقيق' } });

    await waitFor(() => {
      expect(getByText('دقيق فاخر')).toBeTruthy();
    });

    fireEvent.click(getByText('دقيق فاخر'));

    // بعد إضافة الصنف (سعر 80 وكمية 1 وضريبة 14% => 80 + 11.20 = 91.20)
    const fmt = (n: number) =>
      n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    await waitFor(() => {
      expect(getByText(/إجمالي الفاتورة النهائي المستحق:/)).toBeTruthy();
    });
    expect(getAllByText(new RegExp(fmt(91.2))).length).toBeGreaterThan(0);

    // تبديل نوع الخصم الإجمالي إلى نسبة مئوية 10%
    fireEvent.click(getByText('نسبة مئوية (%)'));
    const discountInputs = document.querySelectorAll('input[placeholder="0.00"]');
    const overallDiscountInput = discountInputs[discountInputs.length - 1] as HTMLInputElement;
    fireEvent.change(overallDiscountInput, { target: { value: '10' } });

    // 80 - 8 = 72، ضريبة 14% على 72 = 10.08، الإجمالي = 82.08
    await waitFor(() => {
      expect(getAllByText(new RegExp(fmt(82.08))).length).toBeGreaterThan(0);
    });

    // فتح نافذة إضافة صنف جديد داخل شاشة المشتريات
    fireEvent.click(getByText('إضافة صنف جديد'));
    await waitFor(() => {
      expect(getByText('حفظ واعتماد الصنف')).toBeTruthy();
    });
  });
});
