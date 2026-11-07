import { describe, it, expect, beforeEach } from 'vitest';
import { channelPricingService } from '../../services/channelPricingService';

describe('🏷️ ChannelPricingService (تسعير القنوات المتعددة: صالة، تيك أواي، توصيل، وتطبيقات التوصيل)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('يجب أن يعيد السعر الأساسي الافتراضي إذا لم يتم ضبط قواعد تسعير للقناة', () => {
    const basePrice = 120;
    const price = channelPricingService.getEffectivePrice('prod-pizza', basePrice, 'DINE_IN');
    expect(price).toBe(120);
  });

  it('يجب تطبيق السعر المخصص الثابت (customPrice) عند تحديده لقناة معينة', () => {
    const basePrice = 100;
    // تحديد سعر مخصص للتوصيل المنزلي 115 ج
    channelPricingService.setProductChannelPrice('prod-burger', 'DELIVERY', {
      customPrice: 115
    });

    // في الصالة: السعر الأساسي 100
    expect(channelPricingService.getEffectivePrice('prod-burger', basePrice, 'DINE_IN')).toBe(100);

    // في التوصيل: السعر المخصص 115
    expect(channelPricingService.getEffectivePrice('prod-burger', basePrice, 'DELIVERY')).toBe(115);
  });

  it('يجب تطبيق نسبة الزيادة المئوية (markupPct) بدقة مع التقريب لرقمين عشريين لمنصات وتطبيقات التوصيل', () => {
    const basePrice = 150;
    // تطبيق زيادة 15% لتطبيقات التوصيل (طلبات / جاهز / تويو)
    channelPricingService.setProductChannelPrice('prod-combo', 'AGGREGATORS', {
      markupPct: 15
    });

    // 150 * 1.15 = 172.50
    const calculatedPrice = channelPricingService.getEffectivePrice('prod-combo', basePrice, 'AGGREGATORS');
    expect(calculatedPrice).toBe(172.5);
  });

  it('يجب أن يفضل السعر المخصص الثابت (customPrice) على النسبة المئوية إذا تم تحديدهما معاً', () => {
    const basePrice = 200;
    channelPricingService.setProductChannelPrice('prod-steak', 'TAKEAWAY', {
      customPrice: 220,
      markupPct: 25 // 200 + 25% = 250
    });

    // الأولوية للسعر المخصص المباشر
    const price = channelPricingService.getEffectivePrice('prod-steak', basePrice, 'TAKEAWAY');
    expect(price).toBe(220);
  });

  it('يجب عزل قواعد التسعير بين الأصناف المختلفة وعدم تداخلها', () => {
    channelPricingService.setProductChannelPrice('prod-1', 'DELIVERY', { customPrice: 50 });
    channelPricingService.setProductChannelPrice('prod-2', 'DELIVERY', { customPrice: 90 });

    expect(channelPricingService.getEffectivePrice('prod-1', 40, 'DELIVERY')).toBe(50);
    expect(channelPricingService.getEffectivePrice('prod-2', 75, 'DELIVERY')).toBe(90);
    // صنف ثالث ليس له قواعد تسعير
    expect(channelPricingService.getEffectivePrice('prod-3', 30, 'DELIVERY')).toBe(30);
  });
});
