import type { Product } from '../../../types';
import type { PromotionRule } from '../../retail/services/promotionEngine';

export type SalesPricingTier = 'retail' | 'wholesale' | 'half';

export interface MatchedUomBarcodeInfo {
  uom_name?: string;
  customPrice?: number;
  uom_id?: string;
}

/**
 * Finds an active hypermarket promotion rule applicable to a given product or category on a date.
 */
export function findMatchingPromoRule(
  retailPromotions: PromotionRule[],
  productInput: Product | Record<string, unknown>,
  refDate?: string
): PromotionRule | undefined {
  const product = productInput as Record<string, unknown>;
  if (!retailPromotions || retailPromotions.length === 0) return undefined;
  const now = refDate || new Date().toISOString().split('T')[0];
  return retailPromotions.find((p) => {
    if (!p.is_active) return false;
    if (p.start_date && p.start_date > now) return false;
    if (p.end_date && p.end_date < now) return false;
    if (p.product_id && p.product_id === product.id) return true;
    if (p.category_id && product.category_id && p.category_id === product.category_id) return true;
    return false;
  });
}

/**
 * Filters sales catalog products by name, SKU, barcode, secondary barcode, or unit barcodes.
 */
export function filterSalesProducts(products: Product[], searchTerm: string): Product[] {
  if (!searchTerm.trim()) return [];
  const term = searchTerm.trim().toLowerCase();
  return products
    .filter((p) => {
      const rec = p as unknown as Record<string, unknown>;
      const barcode2 = typeof rec.barcode2 === 'string' ? rec.barcode2.toLowerCase() : '';
      const unitBarcodes = Array.isArray(rec.unit_barcodes)
        ? (rec.unit_barcodes as Array<Record<string, unknown>>)
        : [];
      return (
        p.name.toLowerCase().includes(term) ||
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        (p.barcode && p.barcode.toLowerCase().includes(term)) ||
        barcode2.includes(term) ||
        unitBarcodes.some(
          (ub) => typeof ub.barcode === 'string' && ub.barcode.toLowerCase().includes(term)
        )
      );
    })
    .slice(0, 8);
}

/**
 * Checks whether a product offer price is active on a given date.
 */
export function isSalesOfferActive(
  productInput: Product | Record<string, unknown>,
  targetDateInput?: string
): boolean {
  const product = productInput as Record<string, unknown>;
  const targetDate = targetDateInput || new Date().toISOString().split('T')[0];
  const offerPrice = Number(product.offer_price || product.offerPrice || 0);
  if (offerPrice > 0) {
    const start = (product.offer_start_date || product.offerStartDate) as string | undefined;
    const end = (product.offer_end_date || product.offerEndDate) as string | undefined;
    if (start && end) {
      return targetDate >= start && targetDate <= end;
    }
    if (end) {
      return targetDate <= end;
    }
    return true;
  }
  return false;
}

/**
 * Resolves unit base selling price accounting for active offers and pricing tier (retail/wholesale/half).
 */
export function getSalesProductPrice(
  productInput: Product | Record<string, unknown>,
  pricingTier: SalesPricingTier,
  invDate?: string
): number {
  const product = productInput as Record<string, unknown>;
  if (isSalesOfferActive(product, invDate)) {
    return Number(product.offer_price || product.offerPrice);
  }
  const price = Number(product.sales_price || product.price || 0);
  if (pricingTier === 'wholesale') {
    const wsPrice = Number(product.wholesale_price ?? product.wholesalePrice);
    return wsPrice > 0 ? wsPrice : price;
  }
  if (pricingTier === 'half') {
    const halfWsPrice = Number(product.half_wholesale_price ?? product.halfWholesalePrice);
    return halfWsPrice > 0 ? halfWsPrice : price;
  }
  return price;
}

/**
 * Reprices existing sales line items when the user switches pricing tiers.
 */
export function repriceSalesItemsForTier<T extends Record<string, unknown>>(
  prevItems: T[],
  products: Product[],
  uoms: Array<{ id: string; ratio?: number }>,
  newTier: SalesPricingTier,
  invDate?: string
): T[] {
  return prevItems.map((item) => {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return item;
    const basePrice = getSalesProductPrice(
      prod as unknown as Record<string, unknown>,
      newTier,
      invDate
    );
    const selectedUom = uoms.find((u) => u.id === item.uomId);
    const unitPrice = selectedUom
      ? Number((basePrice * (selectedUom.ratio || 1)).toFixed(4))
      : basePrice;
    const discount = Number(item.discount || 0);
    const qty = Number(item.quantity || 0);
    const total = Number((qty * unitPrice - discount).toFixed(2));
    return {
      ...item,
      unitPrice,
      unit_price: unitPrice,
      total,
    };
  });
}

/**
 * Matches a scanned barcode or SKU against catalog products and unit-specific barcodes.
 */
export function findProductByBarcodeOrUnit(
  products: Product[],
  rawCode: string
): { product?: Product; matchedUomInfo?: MatchedUomBarcodeInfo } {
  const code = rawCode.trim().toLowerCase();
  let matchedUomInfo: MatchedUomBarcodeInfo | undefined;

  let product = products.find((p) => {
    const rec = p as unknown as Record<string, unknown>;
    const barcode2 = typeof rec.barcode2 === 'string' ? rec.barcode2.trim().toLowerCase() : '';
    return (
      (p.barcode && p.barcode.trim().toLowerCase() === code) ||
      (p.sku && p.sku.trim().toLowerCase() === code) ||
      barcode2 === code
    );
  });

  if (!product) {
    for (const p of products) {
      const unitBarcodes = (p as unknown as Record<string, unknown>).unit_barcodes;
      if (Array.isArray(unitBarcodes)) {
        const foundUom = (unitBarcodes as Array<Record<string, unknown>>).find(
          (ub) => typeof ub.barcode === 'string' && ub.barcode.trim().toLowerCase() === code
        );
        if (foundUom) {
          product = p;
          matchedUomInfo = {
            uom_name: typeof foundUom.uom_name === 'string' ? foundUom.uom_name : undefined,
            customPrice:
              foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : undefined,
            uom_id: typeof foundUom.uom_id === 'string' ? foundUom.uom_id : undefined,
          };
          break;
        }
      }
    }
  } else {
    const unitBarcodes = (product as unknown as Record<string, unknown>).unit_barcodes;
    if (Array.isArray(unitBarcodes)) {
      const foundUom = (unitBarcodes as Array<Record<string, unknown>>).find(
        (ub) => typeof ub.barcode === 'string' && ub.barcode.trim().toLowerCase() === code
      );
      if (foundUom) {
        matchedUomInfo = {
          uom_name: typeof foundUom.uom_name === 'string' ? foundUom.uom_name : undefined,
          customPrice:
            foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : undefined,
          uom_id: typeof foundUom.uom_id === 'string' ? foundUom.uom_id : undefined,
        };
      }
    }
  }

  return { product, matchedUomInfo };
}

/**
 * Builds A4 or thermal print payload for a sales invoice.
 */
export function buildSalesPrintData(params: {
  invoiceNumber: string;
  date: string;
  customerId: string;
  customers: Array<{ id: string; name?: string }>;
  status: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  isThermal: boolean;
  items: Array<Record<string, unknown>>;
  products: Product[];
  uoms: Array<{ id: string; name?: string }>;
}) {
  const {
    invoiceNumber,
    date,
    customerId,
    customers,
    status,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    currency,
    isThermal,
    items,
    products,
    uoms,
  } = params;

  return {
    invoiceNumber: invoiceNumber || 'مسودة',
    date,
    customerName: customers.find((c) => c.id === customerId)?.name || 'عميل نقدي',
    status,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    currency: currency || 'EGP',
    isThermal,
    items: items.map((item) => {
      const pid = (item.productId || item.product_id) as string | undefined;
      const uid = (item.uomId || item.uom_id) as string | undefined;
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice ?? item.unit_price ?? 0);
      return {
        productName:
          (item.productName as string) ||
          (item.product_name as string) ||
          products.find((p) => p.id === pid)?.name ||
          'صنف',
        uomName: uoms.find((u) => u.id === uid)?.name || '',
        quantity: qty,
        unitPrice,
        total: Number(item.total ?? qty * unitPrice),
      };
    }),
  };
}
