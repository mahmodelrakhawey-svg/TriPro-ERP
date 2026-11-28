import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MultiUomStockReport from '../modules/sales/MultiUomStockReport';

const {
  mockSelectCalls,
  mockFrom,
  mockShowToast,
  mockFetchUoms,
} = vi.hoisted(() => ({
  mockSelectCalls: [] as Array<{ table: string; columns: string }>,
  mockFrom: vi.fn(),
  mockShowToast: vi.fn(),
  mockFetchUoms: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('../context/AccountingContext', () => ({
  useAccounting: () => ({
    warehouses: [{ id: 'wh-1', name: 'المستودع الرئيسي' }],
    settings: {
      companyName: 'شركة اختبار',
      address: 'القاهرة',
      taxNumber: '123456789',
      phone: '01000000000',
    },
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

vi.mock('../services/tenantContext', () => ({
  getActiveOrgIdSync: () => 'org-test-1111',
  resolveActiveOrgId: vi.fn(async () => 'org-test-1111'),
}));

vi.mock('../services/uomService', () => ({
  fetchUoms: mockFetchUoms,
}));

describe('MultiUomStockReport schema compatibility & UOM calculations', () => {
  beforeEach(() => {
    mockSelectCalls.length = 0;
    vi.clearAllMocks();
  });

  it('uses valid products & uoms schema columns in fallback without requesting nonexistent symbol or product_uom_conversions', async () => {
    mockFetchUoms.mockResolvedValue([
      {
        id: 'uom-piece',
        category_id: 'cat-count',
        name: 'قطعة',
        uom_type: 'reference',
        ratio: 1,
        is_base: true,
      },
      {
        id: 'uom-carton',
        category_id: 'cat-count',
        name: 'كرتونة',
        uom_type: 'bigger',
        ratio: 12,
        is_base: false,
      },
    ]);

    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, any> = {
        select: vi.fn((columns: string) => {
          mockSelectCalls.push({ table, columns });
          return chain;
        }),
        eq: vi.fn(() => chain),
        ilike: vi.fn(() => chain),
        range: vi.fn(async () => {
          if (table === 'v_inventory_multi_uom') {
            return { data: [], error: null };
          }
          if (table === 'products') {
            return {
              data: [
                {
                  id: 'prod-1',
                  name: 'شوكولاتة سادة',
                  sku: 'SKU-01',
                  stock: 24,
                  unit: 'قطعة',
                  base_uom_id: 'uom-piece',
                  purchase_uom_id: 'uom-carton',
                  sale_uom_id: 'uom-piece',
                  warehouse_stock: { 'wh-1': 24 },
                },
              ],
              error: null,
            };
          }
          return { data: [], error: null };
        }),
      };
      return chain;
    });

    render(<MultiUomStockReport />);

    await waitFor(() => {
      expect(screen.getByText('شوكولاتة سادة')).toBeTruthy();
    });

    expect(screen.getByText('كرتونة')).toBeTruthy();
    expect(screen.getByText((2).toLocaleString())).toBeTruthy();
    expect(mockShowToast).not.toHaveBeenCalled();

    const productSelect = mockSelectCalls.find(c => c.table === 'products');
    expect(productSelect).toBeDefined();
    expect(productSelect?.columns).not.toContain('product_uom_conversions');
    expect(productSelect?.columns).not.toContain('symbol');
    expect(mockFetchUoms).toHaveBeenCalledWith('org-test-1111');
  });

  it('renders rows returned from v_inventory_multi_uom view without falling back to products', async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, any> = {
        select: vi.fn((columns: string) => {
          mockSelectCalls.push({ table, columns });
          return chain;
        }),
        eq: vi.fn(() => chain),
        ilike: vi.fn(() => chain),
        range: vi.fn(async () => {
          if (table === 'v_inventory_multi_uom') {
            return {
              data: [
                {
                  product_id: 'prod-2',
                  product_name: 'دقيق فاخر',
                  base_stock: 50,
                  base_uom_name: 'كجم',
                  alternative_stock: 2,
                  alternative_uom_name: 'شيكارة 25 كجم',
                },
              ],
              error: null,
            };
          }
          return { data: [], error: null };
        }),
      };
      return chain;
    });

    render(<MultiUomStockReport />);

    await waitFor(() => {
      expect(screen.getByText('دقيق فاخر')).toBeTruthy();
    });

    expect(screen.getByText('شيكارة 25 كجم')).toBeTruthy();
    expect(screen.getByText((50).toLocaleString())).toBeTruthy();
    expect(mockFetchUoms).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
