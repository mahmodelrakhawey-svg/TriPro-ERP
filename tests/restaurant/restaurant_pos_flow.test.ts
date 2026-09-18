import { describe, it, expect, vi, beforeEach } from 'vitest';
import { posService } from '../../modules/restaurant/services/posService';
import { supabase } from '../../supabaseClient';

// Mock Supabase RPC
vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * دالة مساعدة لحساب إجماليات طلب المطعم بنفس المنطق المعتمد في OrderSummary.tsx
 */
export function calculateRestaurantTotals(params: {
  items: Array<{ unitPrice: number; quantity: number; savedQuantity?: number }>;
  discount?: { type: 'percentage' | 'fixed'; value: number };
  loyaltyDiscountAmount?: number;
  isServiceEnabled?: boolean;
  servicePercent?: number;
  isTaxEnabled?: boolean;
  vatPercent?: number;
  deliveryFee?: number;
}) {
  const subtotal = params.items.reduce(
    (sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
    0
  );

  const discountAmount =
    params.discount?.type === 'fixed'
      ? params.discount.value
      : subtotal * ((params.discount?.value || 0) / 100);

  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
  const loyaltyAmount = params.loyaltyDiscountAmount || 0;
  const subtotalAfterLoyalty = Math.max(0, subtotalAfterDiscount - loyaltyAmount);

  const serviceRate = params.isServiceEnabled ? params.servicePercent ?? 12 : 0;
  const serviceCharge = params.isServiceEnabled ? subtotalAfterLoyalty * (serviceRate / 100) : 0;

  const vatRate = params.isTaxEnabled ? params.vatPercent ?? 14 : 0;
  // في قانون ضريبة القيمة المضافة للمطاعم: تطبق الضريبة على (المبلغ بعد الخصم + رسم الخدمة)
  const tax = params.isTaxEnabled ? (subtotalAfterLoyalty + serviceCharge) * (vatRate / 100) : 0;

  const deliveryFee = params.deliveryFee || 0;
  const total = subtotalAfterLoyalty + serviceCharge + tax + deliveryFee;

  const newItemsTotal = params.items.reduce((sum, item) => {
    const newQty = Math.max(0, (Number(item.quantity) || 0) - (Number(item.savedQuantity) || 0));
    return sum + (Number(item.unitPrice) || 0) * newQty;
  }, 0);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    subtotalAfterDiscount: Math.round(subtotalAfterDiscount * 100) / 100,
    serviceCharge: Math.round(serviceCharge * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    deliveryFee: Math.round(deliveryFee * 100) / 100,
    total: Math.round(total * 100) / 100,
    newItemsTotal: Math.round(newItemsTotal * 100) / 100,
  };
}

describe('🍽️ Restaurant POS & Accounting Engine Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. حسابات الطلبات وضريبة المطاعم ورسوم الخدمة', () => {
    it('يحسب طلب صالة (Dine-in) مع رسم خدمة 12% وضريبة 14% بدقة', () => {
      const items = [
        { unitPrice: 150, quantity: 2 }, // وجبة رئيسية = 300
        { unitPrice: 30, quantity: 3 },  // مشروبات = 90
      ];

      const totals = calculateRestaurantTotals({
        items,
        isServiceEnabled: true,
        servicePercent: 12,
        isTaxEnabled: true,
        vatPercent: 14,
      });

      // Subtotal = 390
      expect(totals.subtotal).toBe(390);

      // Service Charge = 390 * 12% = 46.8
      expect(totals.serviceCharge).toBe(46.8);

      // Tax = (390 + 46.8) * 14% = 436.8 * 0.14 = 61.152 -> 61.15
      expect(totals.tax).toBe(61.15);

      // Total = 390 + 46.8 + 61.152 = 497.95
      expect(totals.total).toBe(497.95);
    });

    it('يحسب طلب تيك أواي أو توصيل مع إلغاء رسم الخدمة وإضافة مصاريف التوصيل', () => {
      const items = [{ unitPrice: 200, quantity: 1 }];

      const totals = calculateRestaurantTotals({
        items,
        isServiceEnabled: false, // لا توجد خدمة صالة في التيك أواي
        isTaxEnabled: true,
        vatPercent: 14,
        deliveryFee: 25,
      });

      expect(totals.subtotal).toBe(200);
      expect(totals.serviceCharge).toBe(0);
      // Tax = 200 * 14% = 28
      expect(totals.tax).toBe(28);
      // Total = 200 + 0 + 28 + 25 = 253
      expect(totals.total).toBe(253);
    });

    it('يطبق خصم النسبة المئوية بدقة قبل احتساب الخدمة والضريبة', () => {
      const items = [{ unitPrice: 500, quantity: 1 }];

      const totals = calculateRestaurantTotals({
        items,
        discount: { type: 'percentage', value: 10 }, // خصم 10%
        isServiceEnabled: true,
        servicePercent: 12,
        isTaxEnabled: true,
        vatPercent: 14,
      });

      expect(totals.subtotal).toBe(500);
      expect(totals.discountAmount).toBe(50);
      expect(totals.subtotalAfterDiscount).toBe(450);

      // Service = 450 * 12% = 54
      expect(totals.serviceCharge).toBe(54);

      // Tax = (450 + 54) * 14% = 504 * 0.14 = 70.56
      expect(totals.tax).toBe(70.56);

      // Total = 450 + 54 + 70.56 = 574.56
      expect(totals.total).toBe(574.56);
    });

    it('يميز بين الأصناف المحفوظة في المطبخ والأصناف الجديدة لمنع التكرار', () => {
      const items = [
        { unitPrice: 100, quantity: 3, savedQuantity: 2 }, // 1 صنف جديد
        { unitPrice: 50, quantity: 1, savedQuantity: 1 },  // تم إرساله للمطبخ سابقاً
      ];

      const totals = calculateRestaurantTotals({ items });
      expect(totals.subtotal).toBe(350); // (100*3) + (50*1)
      expect(totals.newItemsTotal).toBe(100); // 1 * 100 فقط غير مرسل للمطبخ
    });
  });

  describe('2. تكامل دوال قاعدة البيانات لخدمة نقاط البيع (posService RPC)', () => {
    it('يقوم ببدء وردية جديدة عبر استدعاء start_pos_shift بنجاح', async () => {
      const mockShift = { id: 'shift-999', status: 'open', opening_balance: 1000 };
      (supabase.rpc as any).mockResolvedValue({ data: mockShift, error: null });

      const result = await posService.startShift(1000, 'acc-treasury-1', 'usr-1', 'org-1');

      expect(supabase.rpc).toHaveBeenCalledWith('start_pos_shift', {
        p_opening_balance: 1000,
        p_resume_existing: true,
        p_treasury_account_id: 'acc-treasury-1',
        p_user_id: 'usr-1',
        p_org_id: 'org-1',
        p_terminal_id: null,
      });
      expect(result).toEqual(mockShift);
    });

    it('يقوم بإنشاء طلب مطعم جديد عبر استدعاء create_restaurant_order', async () => {
      (supabase.rpc as any).mockResolvedValue({ data: 'order-101', error: null });

      const orderData = {
        sessionId: 'shift-999',
        userId: 'usr-1',
        orderType: 'DINE_IN' as const,
        items: [{ id: 'prod-1', qty: 2, price: 50 }],
        warehouseId: 'wh-kitchen',
        orgId: 'org-1',
        notes: 'بدون شطة',
      };

      const orderId = await posService.createOrder(orderData);

      expect(supabase.rpc).toHaveBeenCalledWith('create_restaurant_order', {
        p_session_id: 'shift-999',
        p_user_id: 'usr-1',
        p_order_type: 'DINE_IN',
        p_notes: 'بدون شطة',
        p_items: orderData.items,
        p_customer_id: null,
        p_warehouse_id: 'wh-kitchen',
        p_delivery_info: null,
        p_org_id: 'org-1',
      });
      expect(orderId).toBe('order-101');
    });

    it('يقوم بإتمام الدفع وخصم المخزون عبر complete_restaurant_order', async () => {
      (supabase.rpc as any).mockResolvedValue({ data: null, error: null });

      await expect(
        posService.completeOrder('order-101', 350, 'cash-acc-1', 'wh-kitchen', 'org-1')
      ).resolves.not.toThrow();

      expect(supabase.rpc).toHaveBeenCalledWith('complete_restaurant_order', {
        p_order_id: 'order-101',
        p_payment_method: 'CASH',
        p_amount: 350,
        p_cash_account_id: 'cash-acc-1',
        p_org_id: 'org-1',
        p_warehouse_id: 'wh-kitchen',
      });
    });

    it('يقوم بإغلاق الوردية وترحيل القيود عبر close_shift', async () => {
      (supabase.rpc as any).mockResolvedValue({ data: null, error: null });

      await expect(
        posService.closeShift('shift-999', 2500, 'org-1', 'إغلاق نهاية اليوم')
      ).resolves.not.toThrow();

      expect(supabase.rpc).toHaveBeenCalledWith('close_shift', {
        p_shift_id: 'shift-999',
        p_actual_cash: 2500,
        p_notes: 'إغلاق نهاية اليوم',
        p_org_id: 'org-1',
      });
    });
  });
});
