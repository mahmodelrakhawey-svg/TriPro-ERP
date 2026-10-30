import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getLiveShiftFinancials, 
  calculateClosingShiftSummary 
} from '../../modules/retail/services/posShiftService';

// Mock Dexie offline DB
vi.mock('../../services/offlineService', () => ({
  isValidUUID: (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str),
  db: {
    queuedOrders: {
      toArray: vi.fn()
    }
  }
}));

describe('🛒 POS Shift Financials Lifecycle (حسابات نقدية ومطابقة وردية الكاشير)', () => {
  const mockValidShiftId = '11111111-2222-3333-4444-555555555555';
  const mockUserId = '99999999-8888-7777-6666-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('تحسب getLiveShiftFinancials نقدية الدرج الحية بناءً على رد RPC بنجاح', async () => {
    const mockSupabase: any = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          cash_sales: 3500,
          cash_returns: 200,
          safe_drops: 500,
          expected_cash: 3800 // 1000 + 3500 - 200 - 500 = 3800
        },
        error: null
      })
    };

    const shift = {
      id: mockValidShiftId,
      opening_balance: 1000,
      start_time: '2026-10-30T08:00:00Z'
    };

    const result = await getLiveShiftFinancials(mockSupabase, shift, mockUserId, 500);

    expect(result.cashSales).toBe(3500);
    expect(result.cashReturns).toBe(200);
    expect(result.cashDrops).toBe(500);
    expect(result.drawerCash).toBe(3800);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('get_shift_summary', {
      p_shift_id: mockValidShiftId
    });
  });

  it('تعتمد getLiveShiftFinancials على أوامر الأوفلاين المحلية عند انقطاع الإنترنت ومعرف غير صالح', async () => {
    const { db } = await import('../../services/offlineService');
    (db.queuedOrders.toArray as any).mockResolvedValue([
      { payload: { shift_id: 'offline-shift-local-1', total: 450, payment_method: 'CASH' } },
      { payload: { shift_id: 'offline-shift-local-1', total: 250, payment_method: 'CASH' } },
      { payload: { shift_id: 'offline-shift-local-1', total: 600, payment_method: 'CARD' } }, // لا يُحسب في الدرج النقدي
      { payload: { shift_id: 'other-shift-2', total: 999, payment_method: 'CASH' } }
    ]);

    const mockSupabase: any = { rpc: vi.fn() };

    const shift = {
      id: 'offline-shift-local-1', // غير صالح كـ UUID
      opening_balance: 500
    };

    const result = await getLiveShiftFinancials(mockSupabase, shift, mockUserId, 100);

    // النقدية المتوقعة = الرصيد الافتتاحي (500) + مبيعات الكاش (450 + 250 = 700) - المسحوبات (100) = 1100
    expect(result.cashSales).toBe(700);
    expect(result.cashDrops).toBe(100);
    expect(result.drawerCash).toBe(1100);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('تحسب calculateClosingShiftSummary إجمالي المبيعات، ومبيعات الفيزا والكاش بدقة متناهية', async () => {
    const mockSupabase: any = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          opening_balance: 500,
          total_sales: 8000,
          cash_sales: 5000,
          card_sales: 3000,
          cash_returns: 0,
          cash_drops: 1000,
          expected_cash: 4500 // 500 + 5000 - 1000 = 4500
        },
        error: null
      }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      })
    };

    const shift = {
      id: mockValidShiftId,
      opening_balance: 500,
      start_time: '2026-10-30T09:00:00Z'
    };

    const { summary, calculatedExpectedCash } = await calculateClosingShiftSummary(
      mockSupabase,
      shift,
      mockUserId,
      1000
    );

    expect(summary.total_sales).toBe(8000);
    expect(summary.cash_sales).toBe(5000);
    expect(summary.card_sales).toBe(3000);
    expect(calculatedExpectedCash).toBe(4500);

    // محاكاة الجرد الفعلي للكاشير واكتشاف العجز أو الزيادة
    const actualCashCounted = 4450; // عجز 50 جنيه
    const variance = actualCashCounted - calculatedExpectedCash;
    expect(variance).toBe(-50);
  });
});
