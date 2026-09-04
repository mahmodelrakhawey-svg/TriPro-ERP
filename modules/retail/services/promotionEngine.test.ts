import { describe, it, expect } from 'vitest';
import { evaluatePromotions, PromotionRule } from './promotionEngine';

describe('🎁 Promotion Engine Evaluation Tests', () => {
  it('يجب تطبيق عرض BOGO (اشترِ 2 واحصل على 1 مجاناً) بشكل صحيح', () => {
    const promo: PromotionRule = {
      id: 'promo-bogo',
      name: 'عرض الصيف',
      type: 'BOGO',
      is_active: true,
      product_id: 'prod-1',
      buy_qty: 2,
      get_free_qty: 1,
    };

    const cart = [
      { product: { id: 'prod-1', name: 'عصير برتقال', sales_price: 30 }, quantity: 3, price: 30 },
    ];

    const result = evaluatePromotions(cart, [promo]);
    // عند شراء 3 قطع (2 + 1 مجاناً)، الخصم = 1 * 30 = 30 ج.م
    expect(result.totalPromoDiscount).toBe(30);
    expect(result.appliedPromotions.length).toBe(1);
    expect(result.appliedPromotions[0].discountAmount).toBe(30);
  });

  it('يجب تطبيق عرض TIERED_QTY (3 قطع بسعر 70 ج.م بدلاً من 90) بشكل صحيح', () => {
    const promo: PromotionRule = {
      id: 'promo-tiered',
      name: 'عرض خاص 3 قطع',
      type: 'TIERED_QTY',
      is_active: true,
      product_id: 'prod-2',
      tiered_qty: 3,
      tiered_fixed_price: 70,
    };

    const cart = [
      { product: { id: 'prod-2', name: 'شوكولاتة فاخرة', sales_price: 30 }, quantity: 3, price: 30 },
    ];

    const result = evaluatePromotions(cart, [promo]);
    // السعر العادي لـ 3 قطع = 90 ج.م، سعر العرض = 70 ج.م، الخصم = 20 ج.م
    expect(result.totalPromoDiscount).toBe(20);
    expect(result.appliedPromotions.length).toBe(1);
  });

  it('يجب تطبيق عرض CATEGORY_DISCOUNT (خصم 20% على قسم معين) بشكل صحيح', () => {
    const promo: PromotionRule = {
      id: 'promo-cat',
      name: 'قسم المنظفات',
      type: 'CATEGORY_DISCOUNT',
      is_active: true,
      category_id: 'cat-clean',
      discount_percentage: 20,
    };

    const cart = [
      { product: { id: 'prod-3', name: 'مسحوق غسيل', sales_price: 100, category_id: 'cat-clean' }, quantity: 2, price: 100 },
      { product: { id: 'prod-4', name: 'أرز', sales_price: 50, category_id: 'cat-food' }, quantity: 1, price: 50 },
    ];

    const result = evaluatePromotions(cart, [promo]);
    // إجمالي قسم المنظفات: 2 * 100 = 200 ج.م. الخصم 20% = 40 ج.م
    expect(result.totalPromoDiscount).toBe(40);
  });

  it('يجب تطبيق عرض MIN_SPEND (خصم 50 ج.م عند إنفاق أكثر من 300 ج.م) بشكل صحيح', () => {
    const promo: PromotionRule = {
      id: 'promo-spend',
      name: 'خصم المشتريات الكبيرة',
      type: 'MIN_SPEND',
      is_active: true,
      min_spend_amount: 300,
      discount_amount: 50,
    };

    const cart = [
      { product: { id: 'prod-1', name: 'صنف 1', sales_price: 200 }, quantity: 2, price: 200 }, // Total = 400
    ];

    const result = evaluatePromotions(cart, [promo]);
    expect(result.totalPromoDiscount).toBe(50);
  });

  it('يجب تطبيق عرض الحزمة BUNDLE (صنف أ + صنف ب بسعر ثابت مخفض) بشكل صحيح', () => {
    // صنف أ سعره 100، صنف ب سعره 80 (المجموع العادي 180)، العرض: الاثنين معاً بـ 140 (الخصم 40)
    const promo: PromotionRule = {
      id: 'promo-bundle-1',
      name: 'عرض شاي + سكر',
      type: 'BUNDLE',
      is_active: true,
      product_id: 'prod-tea',
      secondary_product_id: 'prod-sugar',
      bundle_fixed_price: 140,
    };

    const cart = [
      { product: { id: 'prod-tea', name: 'شاي فاخر', sales_price: 100 }, quantity: 1, price: 100 },
      { product: { id: 'prod-sugar', name: 'سكر أبيض', sales_price: 80 }, quantity: 1, price: 80 },
    ];

    const result = evaluatePromotions(cart, [promo]);
    expect(result.totalPromoDiscount).toBe(40);
    expect(result.appliedPromotions.length).toBe(1);
    expect(result.appliedPromotions[0].promoName).toContain('عرض شاي + سكر');
  });

  it('يجب تطبيق عرض الحزمة BUNDLE (خصم 50% على الصنف الثاني عند شراء الصنف الأول) بشكل صحيح', () => {
    // صنف أ سعره 100، صنف ب سعره 60. خصم 50% على صنف ب = 30 ج.م
    const promo: PromotionRule = {
      id: 'promo-bundle-2',
      name: 'اشترِ حذاء واحصل على الجوارب بنصف السعر',
      type: 'BUNDLE',
      is_active: true,
      product_id: 'prod-shoes',
      secondary_product_id: 'prod-socks',
      discount_percentage: 50,
    };

    const cart = [
      { product: { id: 'prod-shoes', name: 'حذاء رياضي', sales_price: 500 }, quantity: 2, price: 500 },
      { product: { id: 'prod-socks', name: 'جوارب رياضية', sales_price: 60 }, quantity: 2, price: 60 },
    ];

    const result = evaluatePromotions(cart, [promo]);
    // تم شراء حزمتين: الخصم = 2 * (60 * 50%) = 60 ج.م
    expect(result.totalPromoDiscount).toBe(60);
    expect(result.appliedPromotions.length).toBe(1);
  });
});
