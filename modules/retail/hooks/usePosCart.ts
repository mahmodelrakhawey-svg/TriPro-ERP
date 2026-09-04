/**
 * TriPro ERP — POS Cart Custom Hook
 * إدارة حالة وعمليات سلة المشتريات لنقاط البيع والتجزئة والهايبرماركت
 */

import { useState } from 'react';
import type { CachedProduct } from '../../../services/offlineService';

export interface PosCartItem {
  product: CachedProduct;
  quantity: number;
  weight?: number; // In case of weight scale product
  uomName?: string;
  customPrice?: number;
  uomId?: string;
}

export type PricingTier = 'retail' | 'wholesale' | 'half';

/**
 * 🏷️ دالة التحقق من سريان عرض كارت الصنف (Item Card Offer)
 */
export function isItemOfferActive(product: CachedProduct): boolean {
  const today = new Date().toISOString().split('T')[0];
  const offerPrice = Number(product.offer_price || 0);
  if (offerPrice > 0) {
    if (product.offer_start_date && product.offer_end_date) {
      return today >= product.offer_start_date && today <= product.offer_end_date;
    }
    if (product.offer_end_date) {
      return today <= product.offer_end_date;
    }
    return true;
  }
  return false;
}

/**
 * 🏷️ دالة تحديد السعر الفعلي للصنف مع الأخذ في الحسبان فئة التسعير وسعر العرض والحد الأدنى
 */
export function getItemEffectivePrice(
  product: CachedProduct,
  customPrice?: number,
  pricingTier: PricingTier = 'retail'
): number {
  let finalPrice = 0;
  if (customPrice !== undefined && customPrice > 0) {
    finalPrice = customPrice;
  } else if (isItemOfferActive(product)) {
    finalPrice = Number(product.offer_price);
  } else if (pricingTier === 'wholesale' && Number(product.wholesale_price || 0) > 0) {
    finalPrice = Number(product.wholesale_price);
  } else if (pricingTier === 'half' && Number(product.half_wholesale_price || 0) > 0) {
    finalPrice = Number(product.half_wholesale_price);
  } else {
    finalPrice = Number(product.sales_price || 0);
  }

  // 🛑 تطبيق الحد الأدنى لسعر البيع المسموح به كحماية (Price Floor)
  const minPrice = Number(product.min_sales_price || 0);
  if (minPrice > 0 && finalPrice < minPrice) {
    finalPrice = minPrice;
  }

  return finalPrice;
}

export function usePosCart(initialItems: PosCartItem[] = []) {
  const [cart, setCart] = useState<PosCartItem[]>(initialItems);
  const [pricingTier, setPricingTier] = useState<PricingTier>('retail');

  // Add Product to Cart with age-restriction check
  const addToCart = (
    product: CachedProduct,
    weight?: number,
    multiplier: number = 1,
    uomName?: string,
    customPrice?: number,
    uomId?: string
  ): boolean => {
    // 🔞 تحقق من تقييد العمر قبل إضافة الصنف للسلة
    if ((product as any).age_restricted) {
      const confirmed = window.confirm(
        `⚠️ تنبيه: هذا الصنف مقيد بالعمر (+18)\n\n` +
        `الصنف: ${product.name}\n\n` +
        `هل تأكدت من أن عمر العميل 18 سنة فأكبر؟\n` +
        `اضغط "موافق" للمتابعة أو "إلغاء" لإلغاء العملية.`
      );
      if (!confirmed) return false;
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id && item.uomId === uomId);
      if (existing) {
        if (weight !== undefined) {
          return prev.map(item =>
            (item.product.id === product.id && item.uomId === uomId)
              ? { ...item, quantity: item.quantity + multiplier, weight: (item.weight || 0) + (weight * multiplier) }
              : item
          );
        } else {
          return prev.map(item =>
            (item.product.id === product.id && item.uomId === uomId)
              ? { ...item, quantity: item.quantity + multiplier }
              : item
          );
        }
      }
      return [
        ...prev,
        {
          product,
          quantity: multiplier,
          weight: weight !== undefined ? weight * multiplier : undefined,
          uomName,
          customPrice,
          uomId
        }
      ];
    });

    return true;
  };

  // Update Cart Quantity
  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // Remove Item from Cart
  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  };

  // Clear Cart
  const clearCart = () => {
    setCart([]);
  };

  return {
    cart,
    setCart,
    pricingTier,
    setPricingTier,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getItemEffectivePrice: (product: CachedProduct, customPrice?: number) =>
      getItemEffectivePrice(product, customPrice, pricingTier),
    isItemOfferActive
  };
}
