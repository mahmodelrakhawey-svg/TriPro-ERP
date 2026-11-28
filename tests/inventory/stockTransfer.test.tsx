import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StockTransfer, {
  getStockTransferDraft,
  clearStockTransferDraft,
} from '../../modules/inventory/StockTransfer';
import {
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_WAREHOUSE_ID,
  TEST_WAREHOUSE_2_ID,
} from '../helpers/factories';
import { createSupabaseChain } from '../helpers/mockSupabase';

const mockShowToast = vi.fn();
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
    from: vi.fn(() => createSupabaseChain({ data: [], error: null })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

const mockStockTransferAccountingState = {
  warehouses: [
    { id: TEST_WAREHOUSE_ID, name: 'مخزن المصنع' },
    { id: TEST_WAREHOUSE_2_ID, name: 'مخزن الفرع' },
  ],
  products: [
    {
      id: 'p-1',
      name: 'سكر أبيض',
      unit: 'كجم',
      warehouse_stock: { [TEST_WAREHOUSE_ID]: 50, [TEST_WAREHOUSE_2_ID]: 10 },
    },
  ],
  recalculateStock: vi.fn(),
  currentUser: { id: TEST_USER_ID, organization_id: TEST_ORG_ID },
  currentSelectedOrgId: TEST_ORG_ID,
};

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => mockStockTransferAccountingState,
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../services/tenantContext', () => ({
  getActiveOrgIdSync: () => TEST_ORG_ID,
  resolveActiveOrgId: async () => TEST_ORG_ID,
}));

describe('🚚 StockTransfer — Warehouse Guards & Drafts', () => {
  beforeEach(() => {
    storageMap.clear();
    vi.clearAllMocks();
  });

  it('يرفض التحويل لنفس المستودع ويرفض التحويل بدون أصناف', () => {
    const { container } = render(
      <MemoryRouter>
        <StockTransfer />
      </MemoryRouter>
    );

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(2);

    // نفس المستودع في المصدر والوجهة
    fireEvent.change(selects[0], { target: { value: TEST_WAREHOUSE_ID } });
    fireEvent.change(selects[1], { target: { value: TEST_WAREHOUSE_ID } });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    expect(mockShowToast).toHaveBeenCalledWith('لا يمكن التحويل من وإلى نفس المستودع', 'error');

    // مستودعان مختلفان لكن بدون أصناف
    fireEvent.change(selects[1], { target: { value: TEST_WAREHOUSE_2_ID } });
    fireEvent.submit(form);
    expect(mockShowToast).toHaveBeenCalledWith('يجب إضافة صنف واحد على الأقل للتحويل', 'warning');
  });

  it('يحفظ ويسترجع ويمسح مسودة التحويل المخزني بنجاح', () => {
    storageMap.set('tripro_stock_transfer_draft_v2', {
      formData: {
        fromWarehouseId: TEST_WAREHOUSE_ID,
        toWarehouseId: TEST_WAREHOUSE_2_ID,
        notes: 'تحويل يومي',
      },
      items: [{ productId: 'p-1', baseQuantity: 10, quantity: 10 }],
    });

    const draft = getStockTransferDraft();
    expect(draft?.formData?.fromWarehouseId).toBe(TEST_WAREHOUSE_ID);
    expect(draft?.items).toHaveLength(1);

    clearStockTransferDraft();
    expect(getStockTransferDraft()).toBeNull();
  });
});
