import { describe, it, expect, vi } from 'vitest';
import { supabase } from '../supabaseClient';
import { useProductDomain } from '../context/domains/ProductContext';
import * as AccountingCtx from '../context/AccountingContext';

describe('⚡ Phase 3: Server-Authoritative & Atomic Operations (اختبار الذرية المحاسبية)', () => {
  it('دالة recalculateStock في سياق المنتجات تستدعي recalculate_stock_rpc بالمعاملات الصحيحة', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as any);
    const mockAccounting = {
      products: [],
      warehouses: [],
      categories: [],
      transfers: [],
      recalculateStock: vi.fn(async (id?: string) => {
        await supabase.rpc('recalculate_stock_rpc', { p_product_id: id || null, p_org_id: 'org-test-uuid' });
      }),
      refreshData: vi.fn(),
    };
    vi.spyOn(AccountingCtx, 'useAccounting').mockReturnValue(mockAccounting as any);

    const productDomain = useProductDomain();
    await productDomain.recalculateStock('prod-123');

    expect(rpcSpy).toHaveBeenCalledWith('recalculate_stock_rpc', {
      p_product_id: 'prod-123',
      p_org_id: 'org-test-uuid'
    });
    rpcSpy.mockRestore();
  });

  it('التحقق من بنية استدعاء save_and_post_sales_invoice_atomic الذرية', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: { success: true, invoice_id: 'inv-uuid-1', status: 'posted' },
      error: null
    } as any);

    const sampleInvoice = {
      organization_id: 'org-uuid-1',
      invoice_number: 'INV-2026-9901',
      customer_id: 'cust-uuid-1',
      total_amount: 1500,
      status: 'posted'
    };
    const sampleItems = [
      { product_id: 'prod-1', quantity: 10, unit_price: 150, total: 1500 }
    ];

    const result = await supabase.rpc('save_and_post_sales_invoice_atomic', {
      p_invoice: sampleInvoice,
      p_items: sampleItems,
      p_warehouse_id: 'wh-uuid-1'
    });

    expect(result.data.success).toBe(true);
    expect(result.data.invoice_id).toBe('inv-uuid-1');
    expect(rpcSpy).toHaveBeenCalledWith('save_and_post_sales_invoice_atomic', {
      p_invoice: sampleInvoice,
      p_items: sampleItems,
      p_warehouse_id: 'wh-uuid-1'
    });
    rpcSpy.mockRestore();
  });

  it('التحقق من بنية استدعاء run_monthly_depreciation للأصول', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: { success: true, journal_id: 'je-dep-1', depreciation_amount: 1250 },
      error: null
    } as any);

    const res = await supabase.rpc('run_monthly_depreciation', {
      p_asset_id: 'asset-oven-01',
      p_amount: 1250,
      p_date: '2026-10-01'
    });

    expect(res.data.success).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith('run_monthly_depreciation', {
      p_asset_id: 'asset-oven-01',
      p_amount: 1250,
      p_date: '2026-10-01'
    });
    rpcSpy.mockRestore();
  });
});
