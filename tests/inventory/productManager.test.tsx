import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProductManager, { Item } from '../../modules/inventory/ProductManager';
import {
  isOfferActive,
  isOfferExpired,
  countRawItemsNeedingSync,
  countFinishedGoodsItemsNeedingSync,
} from '../../modules/inventory/utils/productAccountSyncUtils';
import {
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_WAREHOUSE_ID,
} from '../helpers/factories';
import { createSupabaseChain } from '../helpers/mockSupabase';

const mockShowToast = vi.fn();
const mockRefresh = vi.fn();

const mockProducts = [
  {
    id: 'prod-1',
    name: 'تورتة شوكولاتة فاخرة',
    sku: 'SKU-00001',
    barcode: '6221000000011',
    sales_price: 450,
    purchase_price: 220,
    weighted_average_cost: 225,
    stock: 12,
    product_type: 'MANUFACTURED',
    inventory_account_id: 'acc-inv-fg',
    cogs_account_id: 'acc-cogs',
    sales_account_id: 'acc-sales',
    image_url: null,
    category_id: 'cat-1',
    requires_serial: false,
    warehouse_stock: { [TEST_WAREHOUSE_ID]: 12 },
  },
  {
    id: 'prod-2',
    name: 'دقيق فاخر 50 كجم',
    sku: 'SKU-00002',
    barcode: '6221000000022',
    sales_price: 1200,
    purchase_price: 950,
    stock: 30,
    product_type: 'RAW_MATERIAL',
    inventory_account_id: 'acc-inv-general',
    cogs_account_id: 'acc-cogs',
    sales_account_id: 'acc-sales',
    image_url: null,
    category_id: 'cat-2',
    requires_serial: false,
    warehouse_stock: { [TEST_WAREHOUSE_ID]: 30 },
  },
];

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => createSupabaseChain({ data: [], error: null })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/img.png' } })),
      })),
    },
  },
}));

vi.mock('../../components/usePagination', () => ({
  usePagination: () => ({
    data: mockProducts,
    loading: false,
    page: 1,
    setPage: vi.fn(),
    totalPages: 1,
    totalCount: mockProducts.length,
    refresh: mockRefresh,
  }),
}));

vi.mock('../../services/uomService', () => ({
  fetchUoms: vi.fn().mockResolvedValue([]),
}));

const mockAccountingState: any = {
  accounts: [
    { id: 'acc-inv-general', code: '103', name: 'المخزون العام', type: 'Asset' },
    { id: 'acc-inv-raw', code: '10301', name: 'مخزون المواد الخام', type: 'Asset' },
    { id: 'acc-inv-fg', code: '10302', name: 'مخزون الإنتاج التام', type: 'Asset' },
  ],
  getSystemAccount: vi.fn((key: string) => {
    if (key === 'INVENTORY_RAW_MATERIALS') return { id: 'acc-inv-raw', code: '10301' };
    if (key === 'INVENTORY_FINISHED_GOODS') return { id: 'acc-inv-fg', code: '10302' };
    if (key === 'INVENTORY') return { id: 'acc-inv-general', code: '103' };
    return null;
  }),
  refreshData: vi.fn(),
  deleteProduct: vi.fn(),
  updateProduct: vi.fn(),
  currentUser: { id: TEST_USER_ID, role: 'demo', organization_id: TEST_ORG_ID },
  products: mockProducts,
  warehouses: [{ id: TEST_WAREHOUSE_ID, name: 'المخزن الرئيسي' }],
  can: () => true,
  categories: [
    { id: 'cat-1', name: 'التورتات الغربية الفاخرة' },
    { id: 'cat-2', name: 'خامات الحلويات الأولية' },
  ],
  addProduct: vi.fn(),
  addEntry: vi.fn(),
  settings: {},
  recalculateStock: vi.fn(),
  currentSelectedOrgId: TEST_ORG_ID,
  suppliers: [],
};

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => mockAccountingState,
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

function renderProductManager() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProductManager />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('📦 ProductManager — Baseline Rendering, Filters & Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccountingState.currentUser = {
      id: TEST_USER_ID,
      role: 'demo',
      organization_id: TEST_ORG_ID,
    };
  });

  it('يعرض الشريط العلوي والأصناف والفلاتر ويدعم البحث وتحديد الأصناف', async () => {
    const { container } = renderProductManager();

    expect(screen.getByText('إدارة الأصناف (المنضبطة)')).toBeTruthy();
    expect(screen.getByText('تورتة شوكولاتة فاخرة')).toBeTruthy();
    expect(screen.getByText('دقيق فاخر 50 كجم')).toBeTruthy();

    // شارة توجيه خامات المخزون تظهر عداد 1 صنف خام يحتاج التوجيه
    expect(screen.getByText('توجيه خامات المخزون (10301)')).toBeTruthy();

    // البحث باسم الصنف
    const searchInput = screen.getByPlaceholderText('بحث باسم الصنف أو الكود (SKU)...');
    fireEvent.change(searchInput, { target: { value: 'تورتة' } });
    expect(screen.getByText('تورتة شوكولاتة فاخرة')).toBeTruthy();
    expect(screen.queryByText('دقيق فاخر 50 كجم')).toBeNull();

    // مسح البحث للعودة لكل الأصناف
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('دقيق فاخر 50 كجم')).toBeTruthy();

    // تحديد الكل يظهر أزرار الإجراءات الجماعية
    const selectAllBtn = container.querySelector('thead button')!;
    expect(selectAllBtn).toBeTruthy();
    fireEvent.click(selectAllBtn);
    expect(screen.getByText('تطبيق عرض (2)')).toBeTruthy();
    expect(screen.getByText('تعديل الأسعار (2)')).toBeTruthy();
    expect(screen.getByText('طباعة باركود (2)')).toBeTruthy();
  });

  it('يفتح نافذة إضافة صنف جديد ويعرض حقول الفلاتر الأربعة', async () => {
    renderProductManager();

    expect(screen.getByText('فلترة حسب نوع الصنف')).toBeTruthy();
    expect(screen.getByText('فلترة حسب التصنيف')).toBeTruthy();
    expect(screen.getByText('المستودع / المخزن')).toBeTruthy();
    expect(screen.getByText('مسار ومراحل التصنيع (BOM/Routing)')).toBeTruthy();

    const addBtn = screen.getByRole('button', { name: /صنف جديد/ });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('إضافة صنف جديد')).toBeTruthy();
    });
  });

  it('يتحقق من حالة العروض السارية والمنتهية وعدد الأصناف المحتاجة لتوجيه الحسابات', () => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

    const activeOfferItem = {
      ...(mockProducts[0] as unknown as Item),
      offer_price: 399,
      offer_start_date: yesterday,
      offer_end_date: today,
    };
    const expiredOfferItem = {
      ...(mockProducts[0] as unknown as Item),
      offer_price: 399,
      offer_start_date: twoDaysAgo,
      offer_end_date: yesterday,
    };

    expect(isOfferActive(activeOfferItem)).toBe(true);
    expect(isOfferExpired(activeOfferItem)).toBe(false);
    expect(isOfferActive(expiredOfferItem)).toBe(false);
    expect(isOfferExpired(expiredOfferItem)).toBe(true);

    const rawNeed = countRawItemsNeedingSync(
      mockProducts,
      mockAccountingState.getSystemAccount,
      {}
    );
    expect(rawNeed).toBe(1);

    const fgNeed = countFinishedGoodsItemsNeedingSync(
      mockProducts,
      mockAccountingState.categories,
      mockAccountingState.getSystemAccount,
      {}
    );
    expect(fgNeed).toBe(0);
  });
});
