import { describe, it, expect } from 'vitest';
import { purchaseInvoiceItemSchema } from '../../utils/validationSchemas';

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number; // e.g. 14 for 14%
}

export function calculatePurchaseInvoiceTotals(
  items: PurchaseItemInput[],
  enableGlobalTax: boolean,
  globalVatRate: number = 14,
  extraDiscount: number = 0,
  shippingCost: number = 0
) {
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  // Per-item tax calculation honoring taxRate override or global setting
  const taxAmount = items.reduce((sum, item) => {
    const itemSubtotal = item.quantity * item.unitPrice;
    const effectiveTaxRate = item.taxRate !== undefined
      ? item.taxRate
      : (enableGlobalTax ? globalVatRate : 0);
    return sum + (itemSubtotal * (effectiveTaxRate / 100));
  }, 0);

  const totalAmount = Math.max(0, subtotal + taxAmount - extraDiscount + shippingCost);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100
  };
}

describe('Purchase Invoice VAT Calculation with Item Overrides', () => {
  it('should calculate VAT for specific items even when global tax is disabled (Linza company scenario)', () => {
    // 3 items: Item 1 & 2 have tax_rate_override=14, Item 3 has no tax (0 or undefined)
    const items: PurchaseItemInput[] = [
      { productId: 'item-1', quantity: 2, unitPrice: 100, taxRate: 14 }, // subtotal: 200, tax: 28
      { productId: 'item-2', quantity: 1, unitPrice: 50, taxRate: 14 },  // subtotal: 50, tax: 7
      { productId: 'item-3', quantity: 5, unitPrice: 20, taxRate: 0 }    // subtotal: 100, tax: 0
    ];

    const result = calculatePurchaseInvoiceTotals(
      items,
      false, // enableGlobalTax = false
      14     // globalVatRate
    );

    expect(result.subtotal).toBe(350);
    expect(result.taxAmount).toBe(35); // 28 + 7 = 35
    expect(result.totalAmount).toBe(385); // 350 + 35
  });

  it('should calculate zero tax when global tax is disabled and items have no override', () => {
    const items: PurchaseItemInput[] = [
      { productId: 'item-1', quantity: 2, unitPrice: 100, taxRate: 0 },
      { productId: 'item-2', quantity: 1, unitPrice: 50 }
    ];

    const result = calculatePurchaseInvoiceTotals(items, false, 14);

    expect(result.subtotal).toBe(250);
    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(250);
  });

  it('should allow custom taxRate values (e.g. 5% or 10%) per item', () => {
    const items: PurchaseItemInput[] = [
      { productId: 'item-1', quantity: 10, unitPrice: 10, taxRate: 5 }, // 100 * 5% = 5
      { productId: 'item-2', quantity: 4, unitPrice: 25, taxRate: 10 }  // 100 * 10% = 10
    ];

    const result = calculatePurchaseInvoiceTotals(items, false, 14);

    expect(result.subtotal).toBe(200);
    expect(result.taxAmount).toBe(15);
    expect(result.totalAmount).toBe(215);
  });

  it('validates purchaseInvoiceItemSchema allows taxRate', () => {
    const validItem = {
      productId: 'p-1',
      quantity: 5,
      unitPrice: 20,
      taxRate: 14
    };

    const parsed = purchaseInvoiceItemSchema.safeParse(validItem);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.taxRate).toBe(14);
    }
  });

  it('rejects invalid taxRate in purchaseInvoiceItemSchema', () => {
    const invalidItem = {
      productId: 'p-1',
      quantity: 5,
      unitPrice: 20,
      taxRate: 150 // max 100
    };

    const parsed = purchaseInvoiceItemSchema.safeParse(invalidItem);
    expect(parsed.success).toBe(false);
  });

  it('validates purchaseInvoiceItemSchema allows discount and discountPercent', () => {
    const validWithDiscount = {
      productId: 'p-1',
      quantity: 10,
      unitPrice: 100,
      discount: 50,
      discountPercent: 5,
      taxRate: 14
    };

    const parsed = purchaseInvoiceItemSchema.safeParse(validWithDiscount);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.discount).toBe(50);
      expect(parsed.data.discountPercent).toBe(5);
    }
  });
});

describe('Advanced Purchase Invoice Discounts & Tax Compliance (ETA)', () => {
  it('should accurately calculate item-level discounts and tax', async () => {
    const { calculatePurchaseInvoiceTotals } = await import('../../modules/purchases/purchaseInvoiceUtils');
    
    // 2 items:
    // Item 1: 10 units @ 100 = 1000, discount 100 -> net 900, tax 14% = 126
    // Item 2: 5 units @ 200 = 1000, discountPercent 10% (100) -> net 900, tax 14% = 126
    const items = [
      { quantity: 10, unitPrice: 100, discount: 100, taxRate: 14 },
      { quantity: 5, unitPrice: 200, discountPercent: 10, taxRate: 14 }
    ];

    const result = calculatePurchaseInvoiceTotals(items, {
      discountType: 'fixed',
      discountValue: 0,
      enableTax: true,
      globalVatRate: 14
    });

    expect(result.grossTotal).toBe(2000);
    expect(result.itemsDiscountTotal).toBe(200);
    expect(result.subtotalBeforeInvoiceDiscount).toBe(1800);
    expect(result.invoiceDiscountAmount).toBe(0);
    expect(result.taxableBase).toBe(1800);
    expect(result.taxAmount).toBe(252);
    expect(result.totalAmount).toBe(2052);
  });

  it('should accurately apply invoice-level discount and adjust tax base accordingly', async () => {
    const { calculatePurchaseInvoiceTotals } = await import('../../modules/purchases/purchaseInvoiceUtils');
    
    // 1 item: 10 units @ 100 = 1000, no item discount.
    // Invoice-level discount: 200 (fixed)
    // Net taxable base = 800
    // Tax 14% on 800 = 112
    // Total = 912
    const items = [
      { quantity: 10, unitPrice: 100, taxRate: 14 }
    ];

    const result = calculatePurchaseInvoiceTotals(items, {
      discountType: 'fixed',
      discountValue: 200,
      enableTax: true,
      globalVatRate: 14
    });

    expect(result.grossTotal).toBe(1000);
    expect(result.subtotalBeforeInvoiceDiscount).toBe(1000);
    expect(result.invoiceDiscountAmount).toBe(200);
    expect(result.taxableBase).toBe(800);
    expect(result.taxAmount).toBe(112);
    expect(result.totalAmount).toBe(912);
    expect(result.totalDiscount).toBe(200);
  });

  it('should support percentage invoice-level discount combined with item discounts', async () => {
    const { calculatePurchaseInvoiceTotals } = await import('../../modules/purchases/purchaseInvoiceUtils');
    
    // Item 1: 10 @ 100 = 1000, item discount 200 -> net 800
    // Item 2: 2 @ 100 = 200, item discount 0 -> net 200
    // Net before invoice discount = 1000
    // Invoice discount 10% -> 100
    // Taxable base = 900
    // Tax 14% on 900 = 126
    // Grand total = 1026
    // Total discounts = 200 + 100 = 300
    const items = [
      { quantity: 10, unitPrice: 100, discount: 200, taxRate: 14 },
      { quantity: 2, unitPrice: 100, discount: 0, taxRate: 14 }
    ];

    const result = calculatePurchaseInvoiceTotals(items, {
      discountType: 'percentage',
      discountValue: 10,
      enableTax: true,
      globalVatRate: 14
    });

    expect(result.grossTotal).toBe(1200);
    expect(result.itemsDiscountTotal).toBe(200);
    expect(result.subtotalBeforeInvoiceDiscount).toBe(1000);
    expect(result.invoiceDiscountAmount).toBe(100);
    expect(result.taxableBase).toBe(900);
    expect(result.taxAmount).toBe(126);
    expect(result.totalAmount).toBe(1026);
    expect(result.totalDiscount).toBe(300);
  });
});

