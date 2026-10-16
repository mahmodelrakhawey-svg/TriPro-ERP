import { describe, it, expect } from 'vitest';
import { createCustomerSchema } from '../../utils/validationSchemas';
import { getItemEffectivePrice } from '../../modules/retail/hooks/usePosCart';
import type { Customer, Product } from '../../types';

describe('Customer Pricing Tier Linking & Automatic Price Resolution (ربط فئات تسعير العملاء)', () => {
  describe('Customer Schema Validation', () => {
    it('يقبل فئات التسعير المعتمدة (retail, wholesale, half) ويحدد retail كافتراضي', () => {
      const validCustomer = {
        name: 'شركة النور للتجارة',
        pricing_tier: 'wholesale' as const,
      };

      const result = createCustomerSchema.safeParse(validCustomer);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pricing_tier).toBe('wholesale');
      }

      const defaultCustomer = {
        name: 'عميل نقدي صالة',
      };
      const defResult = createCustomerSchema.safeParse(defaultCustomer);
      expect(defResult.success).toBe(true);
      if (defResult.success) {
        expect(defResult.data.pricing_tier).toBe('retail');
      }
    });

    it('يرفض فئات التسعير غير الصالحة', () => {
      const invalidCustomer = {
        name: 'عميل غير صالح',
        pricing_tier: 'vip_discount_unknown',
      };

      const result = createCustomerSchema.safeParse(invalidCustomer);
      expect(result.success).toBe(false);
    });
  });

  describe('Automatic Price Tier Resolution in POS and Invoicing', () => {
    const mockProduct: Product = {
      id: 'prod-001',
      name: 'جبنة موزاريلا كيري 1 كجم',
      sales_price: 150,
      price: 150,
      wholesale_price: 120,
      half_wholesale_price: 135,
      cost: 100,
      product_type: 'STOCK',
    };

    it('يُحدد سعر الجملة (120) تلقائياً عند ربط العميل بفئة الجملة wholesale', () => {
      const wholesaleCustomer: Customer = {
        id: 'cust-ws',
        name: 'محل البركة لتجارة الأغذية',
        pricing_tier: 'wholesale',
      };

      const price = getItemEffectivePrice(
        mockProduct as any,
        undefined,
        wholesaleCustomer.pricing_tier as any
      );

      expect(price).toBe(120);
    });

    it('يُحدد سعر النصف جملة (135) تلقائياً عند ربط العميل بفئة نصف الجملة half', () => {
      const halfWsCustomer: Customer = {
        id: 'cust-half',
        name: 'سوبرماركت المدينة',
        pricing_tier: 'half',
      };

      const price = getItemEffectivePrice(
        mockProduct as any,
        undefined,
        halfWsCustomer.pricing_tier as any
      );

      expect(price).toBe(135);
    });

    it('يُحدد سعر القطاعي الافتراضي (150) عند ربط العميل بفئة retail أو عدم التحديد', () => {
      const retailCustomer: Customer = {
        id: 'cust-ret',
        name: 'محمد أحمد (مستهلك عادي)',
        pricing_tier: 'retail',
      };

      const price = getItemEffectivePrice(
        mockProduct as any,
        undefined,
        retailCustomer.pricing_tier as any
      );

      expect(price).toBe(150);
    });

    it('يعود تلقائياً لسعر البيع الأساسي إذا كان سعر الجملة غير مسجل (0 أو null)', () => {
      const productWithoutWholesale: Product = {
        id: 'prod-002',
        name: 'شيبسي عائلي',
        sales_price: 25,
        price: 25,
        wholesale_price: 0,
        half_wholesale_price: 0,
        cost: 18,
        product_type: 'STOCK',
      };

      const price = getItemEffectivePrice(
        productWithoutWholesale as any,
        undefined,
        'wholesale'
      );

      expect(price).toBe(25);
    });
  });
});
