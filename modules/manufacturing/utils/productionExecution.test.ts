import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completeOrderLifecycle, cleanupFailedProductionOrder } from './productionExecution';
import { supabase } from '../../../supabaseClient';

const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
let mockProgressRows: Array<{ id: string; step_id: string; status: string; produced_qty?: number }> = [];
let mockBomRows: Array<{ product_id: string; raw_material_id: string; quantity_required: number; uom_id: string | null; shrinkage_pct: number | null }> = [];
let mrInserted = false;

vi.mock('../../../supabaseClient', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'mfg_order_progress') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: mockProgressRows, error: null })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(async () => ({ data: mockProgressRows, error: null })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }
      if (table === 'mfg_routings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        };
      }
      if (table === 'mfg_material_requests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
          insert: vi.fn(async () => {
            mrInserted = true;
            return { error: null };
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }
      if (table === 'mfg_material_request_items') {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }
      if (table === 'bill_of_materials') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: mockBomRows, error: null })),
            })),
          })),
        };
      }
      if (table === 'mfg_production_orders') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }
      return {};
    }),
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      return { data: null, error: null };
    }),
  },
}));

describe('⚙️ productionExecution (Shared Manufacturing Lifecycle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    mockProgressRows = [];
    mockBomRows = [];
    mrInserted = false;
  });

  it('يكمل فقط الكمية المتبقية للمراحل غير المكتملة ثم يغلق الأمر عبر mfg_finalize_order', async () => {
    mockProgressRows = [
      { id: 'prog-done', step_id: 'st-1', status: 'completed', produced_qty: 10 },
      { id: 'prog-active', step_id: 'st-2', status: 'active', produced_qty: 4 },
      { id: 'prog-pending', step_id: 'st-3', status: 'pending', produced_qty: 0 },
    ];

    await completeOrderLifecycle({
      orderId: 'ord-1',
      orderNumber: 'WO-100',
      productId: 'prod-1',
      quantity: 10,
      orgId: 'org-1',
      productionDate: '2026-11-27',
      qcNotes: 'اعتماد',
      skipRecalc: false,
    });

    expect(rpcCalls.map((c) => c.fn)).toEqual([
      'mfg_start_production_order',
      'mfg_complete_step',
      'mfg_start_step',
      'mfg_complete_step',
      'mfg_finalize_order',
    ]);
    // prog-active needed remaining 6 units; prog-pending needed full 10 units
    expect(rpcCalls[1].params).toEqual({ p_progress_id: 'prog-active', p_qty: 6 });
    expect(rpcCalls[3].params).toEqual({ p_progress_id: 'prog-pending', p_qty: 10 });
    expect(rpcCalls[4].params).toMatchObject({ p_order_id: 'ord-1', p_final_status: 'completed', p_skip_recalc: false });
  });

  it('يتبع مسار طلب الصرف الآلي عند عدم وجود مسار تشغيل مع توفر BOM', async () => {
    mockBomRows = [
      { product_id: 'prod-bom', raw_material_id: 'raw-1', quantity_required: 0.5, uom_id: null, shrinkage_pct: 0 },
    ];

    await completeOrderLifecycle({
      orderId: 'ord-2',
      orderNumber: 'WO-200',
      productId: 'prod-bom',
      quantity: 8,
      orgId: 'org-1',
      productionDate: '2026-11-27',
      qcNotes: 'BOM fallback',
      skipRecalc: true,
    });

    expect(mrInserted).toBe(true);
    expect(rpcCalls.map((c) => c.fn)).toEqual([
      'mfg_start_production_order',
      'mfg_issue_material_request',
      'mfg_finalize_order',
    ]);
  });

  it('ينظف أمر التشغيل الفاشل بأمان عند الاستدعاء', async () => {
    await cleanupFailedProductionOrder('ord-fail');
    expect(supabase.from).toHaveBeenCalledWith('mfg_order_progress');
    expect(supabase.from).toHaveBeenCalledWith('mfg_material_requests');
    expect(supabase.from).toHaveBeenCalledWith('mfg_production_orders');
  });
});
