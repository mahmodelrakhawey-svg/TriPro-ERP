export interface PromotionRule {
  id: string;
  name: string;
  type: 'BOGO' | 'TIERED_QTY' | 'BUNDLE' | 'CATEGORY_DISCOUNT' | 'MIN_SPEND';
  is_active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  product_id?: string | null; // For single product offer or main product in bundle
  product_name?: string;
  secondary_product_id?: string | null; // For bundle: second product (صنف ب)
  secondary_product_name?: string;
  category_id?: string | null; // For category offers
  // Specific parameters:
  buy_qty?: number; // e.g. Buy 2
  get_free_qty?: number; // e.g. Get 1 Free
  tiered_qty?: number; // e.g. 3 pieces
  tiered_fixed_price?: number; // for 100 EGP total
  bundle_fixed_price?: number; // Special fixed price for (Product A + Product B)
  discount_percentage?: number; // 10%
  min_spend_amount?: number; // Min spend 500 EGP
  discount_amount?: number; // Flat discount 50 EGP
}

export interface EvaluatedCartDiscount {
  promoId: string;
  promoName: string;
  discountAmount: number;
  affectedProductId?: string;
}

export const evaluatePromotions = (
  cartItems: Array<{
    product: { id: string; name: string; sales_price: number; category_id?: string | null };
    quantity: number;
    price: number;
  }>,
  promotions: PromotionRule[]
): {
  totalPromoDiscount: number;
  appliedPromotions: EvaluatedCartDiscount[];
} => {
  let totalPromoDiscount = 0;
  const appliedPromotions: EvaluatedCartDiscount[] = [];
  const now = new Date().toISOString().split('T')[0];

  const activePromos = promotions.filter(p => {
    if (!p.is_active) return false;
    if (p.start_date && p.start_date > now) return false;
    if (p.end_date && p.end_date < now) return false;
    return true;
  });

  for (const promo of activePromos) {
    // 1. BOGO: Buy X Get Y Free (e.g. Buy 2 Get 1 Free = in 3 items, 1 is free)
    if (promo.type === 'BOGO' && promo.product_id && promo.buy_qty && promo.get_free_qty) {
      const match = cartItems.find(item => item.product.id === promo.product_id);
      if (match) {
        const bundleSize = promo.buy_qty + promo.get_free_qty;
        const completeBundles = Math.floor(match.quantity / bundleSize);
        if (completeBundles > 0) {
          const freeItemsCount = completeBundles * promo.get_free_qty;
          const discount = freeItemsCount * match.price;
          totalPromoDiscount += discount;
          appliedPromotions.push({
            promoId: promo.id,
            promoName: `عرض ${promo.name}: حصلت على ${freeItemsCount} مجاناً!`,
            discountAmount: discount,
            affectedProductId: promo.product_id
          });
        }
      }
    }

    // 2. TIERED_QTY: Buy X for Special Price (e.g. 3 pieces for 100 EGP)
    if (promo.type === 'TIERED_QTY' && promo.product_id && promo.tiered_qty && promo.tiered_fixed_price) {
      const match = cartItems.find(item => item.product.id === promo.product_id);
      if (match && match.quantity >= promo.tiered_qty) {
        const tierSets = Math.floor(match.quantity / promo.tiered_qty);
        const regularPriceForSets = tierSets * promo.tiered_qty * match.price;
        const promoPriceForSets = tierSets * promo.tiered_fixed_price;
        const discount = Math.max(0, regularPriceForSets - promoPriceForSets);
        if (discount > 0) {
          totalPromoDiscount += discount;
          appliedPromotions.push({
            promoId: promo.id,
            promoName: `عرض خاص ${promo.name}: ${promo.tiered_qty} قطع بـ ${promo.tiered_fixed_price} ج.م`,
            discountAmount: discount,
            affectedProductId: promo.product_id
          });
        }
      }
    }

    // 3. CATEGORY_DISCOUNT: Discount percentage on all items in category
    if (promo.type === 'CATEGORY_DISCOUNT' && promo.category_id && promo.discount_percentage) {
      const matchingItems = cartItems.filter(item => item.product.category_id === promo.category_id);
      let catDiscount = 0;
      for (const item of matchingItems) {
        const itemDiscount = (item.price * item.quantity) * (promo.discount_percentage / 100);
        catDiscount += itemDiscount;
      }
      if (catDiscount > 0) {
        totalPromoDiscount += catDiscount;
        appliedPromotions.push({
          promoId: promo.id,
          promoName: `خصم ${promo.discount_percentage}% على قسم ${promo.name}`,
          discountAmount: catDiscount
        });
      }
    }

    // 4. MIN_SPEND: Flat or percentage discount when subtotal exceeds min_spend_amount
    if (promo.type === 'MIN_SPEND' && promo.min_spend_amount) {
      const currentCartSubtotal = cartItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);
      if (currentCartSubtotal >= promo.min_spend_amount) {
        let spendDiscount = 0;
        if (promo.discount_amount && promo.discount_amount > 0) {
          spendDiscount = promo.discount_amount;
        } else if (promo.discount_percentage && promo.discount_percentage > 0) {
          spendDiscount = (currentCartSubtotal * promo.discount_percentage) / 100;
        }
        if (spendDiscount > 0) {
          totalPromoDiscount += spendDiscount;
          appliedPromotions.push({
            promoId: promo.id,
            promoName: `عرض ${promo.name}: خصم ${spendDiscount.toFixed(2)} ج.م عند الشراء بأكثر من ${promo.min_spend_amount} ج.م`,
            discountAmount: spendDiscount
          });
        }
      }
    }

    // 5. BUNDLE: Buy Product A + Product B together at a discount or special fixed price
    if (promo.type === 'BUNDLE' && promo.product_id && promo.secondary_product_id) {
      const matchA = cartItems.find(item => item.product.id === promo.product_id);
      const matchB = cartItems.find(item => item.product.id === promo.secondary_product_id);

      if (matchA && matchB && matchA.quantity > 0 && matchB.quantity > 0) {
        const bundleCount = Math.min(Math.floor(matchA.quantity), Math.floor(matchB.quantity));
        if (bundleCount > 0) {
          let discountPerBundle = 0;
          if (promo.bundle_fixed_price && promo.bundle_fixed_price > 0) {
            const regularPairPrice = matchA.price + matchB.price;
            discountPerBundle = Math.max(0, regularPairPrice - promo.bundle_fixed_price);
          } else if (promo.discount_percentage && promo.discount_percentage > 0) {
            discountPerBundle = (matchB.price * promo.discount_percentage) / 100;
          } else if (promo.discount_amount && promo.discount_amount > 0) {
            discountPerBundle = promo.discount_amount;
          }

          const bundleDiscount = discountPerBundle * bundleCount;
          if (bundleDiscount > 0) {
            totalPromoDiscount += bundleDiscount;
            appliedPromotions.push({
              promoId: promo.id,
              promoName: `عرض الحزمة (${promo.name}): وفرت ${bundleDiscount.toFixed(2)} ج.م عند شراء (${matchA.product.name} + ${matchB.product.name})`,
              discountAmount: bundleDiscount,
              affectedProductId: promo.secondary_product_id
            });
          }
        }
      }
    }
  }

  return { totalPromoDiscount, appliedPromotions };
};
