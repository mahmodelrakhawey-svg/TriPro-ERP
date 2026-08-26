/**
 * ==============================================================================
 * Multi-Channel Pricing Engine
 * TriPro ERP — services/channelPricingService.ts
 * ==============================================================================
 */

import { secureStorage } from '../utils/securityMiddleware';

export type SalesChannelType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'AGGREGATORS';

export interface ProductChannelPrice {
  productId: string;
  channel: SalesChannelType;
  customPrice?: number; // سعر مخصص محدد
  markupPct?: number;   // أو نسبة زيادة مئوية فوق السعر الأساسي (مثلاً +15% للمنصات)
}

const LOCAL_CHANNEL_PRICING_KEY = 'tripro_channel_pricing_v1';

class ChannelPricingService {
  public getChannelPrices(): Record<string, Record<SalesChannelType, { customPrice?: number; markupPct?: number }>> {
    const saved = secureStorage.getItem<Record<string, Record<SalesChannelType, { customPrice?: number; markupPct?: number }>>>(LOCAL_CHANNEL_PRICING_KEY);
    if (saved && typeof saved === 'object') return saved;
    return {};
  }

  public setProductChannelPrice(productId: string, channel: SalesChannelType, data: { customPrice?: number; markupPct?: number }): void {
    const all = this.getChannelPrices();
    if (!all[productId]) all[productId] = {} as any;
    all[productId][channel] = data;
    secureStorage.setItem(LOCAL_CHANNEL_PRICING_KEY, all);
  }

  /**
   * حساب السعر الفعلي للصنف بناءً على قناة الطلب
   */
  public getEffectivePrice(productId: string, basePrice: number, channel: SalesChannelType): number {
    const all = this.getChannelPrices();
    const productRules = all[productId];
    if (!productRules || !productRules[channel]) return basePrice;

    const rule = productRules[channel];
    if (rule.customPrice !== undefined && rule.customPrice > 0) {
      return rule.customPrice;
    }
    if (rule.markupPct !== undefined && rule.markupPct !== 0) {
      const calculated = basePrice * (1 + rule.markupPct / 100);
      return Number(calculated.toFixed(2));
    }
    return basePrice;
  }
}

export const channelPricingService = new ChannelPricingService();
