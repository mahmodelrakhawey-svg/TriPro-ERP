import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WastageManager from '../../modules/inventory/WastageManager';
import { TEST_ORG_ID, TEST_USER_ID, TEST_WAREHOUSE_ID } from '../helpers/factories';

const mockShowToast = vi.fn();
const mockRecalculateStock = vi.fn().mockResolvedValue(undefined);
const mockAddEntry = vi.fn().mockResolvedValue(undefined);
const mockInsertHeader = vi.fn();
const mockInsertItems = vi.fn();

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => ({
    warehouses: [{ id: TEST_WAREHOUSE_ID, name: 'مخزن الخامات الرئيسي' }],
    products: [
      { id: 'prod-1', name: 'كريمة خفق', weighted_average_cost: 120, purchase_price: 100 },
      { id: 'prod-2', name: 'شوكولاتة خام', weighted_average_cost: 200, purchase_price: 180 },
    ],
    recalculateStock: mockRecalculateStock,
    addEntry: mockAddEntry,
    accounts: [
      { id: 'acc-inv', code: '10302', name: 'مخزون الإنتاج التام' },
      { id: 'acc-wst', code: '5121', name: 'مصروفات الهالك والتالف' },
    ],
    getSystemAccount: (key: string) => {
      if (key === 'INVENTORY_FINISHED_GOODS') return { id: 'acc-inv', code: '10302', name: 'مخزون' };
      if (key === 'WASTAGE_EXPENSE') return { id: 'acc-wst', code: '5121', name: 'مصروفات هالك' };
      return null;
    },
    settings: {},
    currentUser: { id: TEST_USER_ID, organization_id: TEST_ORG_ID },
    currentSelectedOrgId: TEST_ORG_ID,
  }),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../services/tenantContext', () => ({
  getActiveOrgIdSync: () => TEST_ORG_ID,
  resolveActiveOrgId: async () => TEST_ORG_ID,
}));

vi.mock('../../components/ProductSearchSelect', () => ({
  default: ({ onChange }: { onChange: (id: string, p: any) => void }) => (
    <button
      type="button"
      onClick={() => onChange('prod-1', { id: 'prod-1', name: 'كريمة خفق', weighted_average_cost: 120 })}
    >
      إضافة صنف تجريبي
    </button>
  ),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'stock_adjustments') {
        return {
          insert: (payload: any) => {
            mockInsertHeader(payload);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'adj-wst-1' }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'stock_adjustment_items') {
        return {
          insert: async (payload: any) => {
            mockInsertItems(payload);
            return { error: null };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  },
}));

describe('🗑️ WastageManager — Inventory Wastage & GL Posting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يرفض الاعتماد قبل اختيار المستودع أو إضافة أصناف', () => {
    const { container } = render(<WastageManager />);
    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    expect(mockShowToast).toHaveBeenCalledWith('يرجى اختيار المستودع وإضافة أصناف', 'warning');
    expect(mockInsertHeader).not.toHaveBeenCalled();
  });

  it('يسجل الهالك بكمية سالبة ويحدّث أرصدة المخزون وينشئ قيد الخسارة المحاسبي', async () => {
    const { container } = render(<WastageManager />);

    const warehouseSelect = container.querySelector('select')!;
    fireEvent.change(warehouseSelect, { target: { value: TEST_WAREHOUSE_ID } });

    fireEvent.click(screen.getByText('إضافة صنف تجريبي'));
    // محاولة إضافة نفس الصنف مرة أخرى تمنع التكرار
    fireEvent.click(screen.getByText('إضافة صنف تجريبي'));
    expect(mockShowToast).toHaveBeenCalledWith('الصنف موجود بالفعل في جدول الهوالك', 'warning');

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockInsertHeader).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouse_id: TEST_WAREHOUSE_ID,
          organization_id: TEST_ORG_ID,
          status: 'posted',
        })
      );
      expect(mockInsertItems).toHaveBeenCalledWith([
        expect.objectContaining({
          stock_adjustment_id: 'adj-wst-1',
          product_id: 'prod-1',
          quantity: -1,
          type: 'out',
          organization_id: TEST_ORG_ID,
        }),
      ]);
      expect(mockRecalculateStock).toHaveBeenCalledTimes(1);
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'posted',
          lines: [
            expect.objectContaining({ accountId: 'acc-wst', debit: 120, credit: 0 }),
            expect.objectContaining({ accountId: 'acc-inv', debit: 0, credit: 120 }),
          ],
        })
      );
    });
  });
});
