import { describe, it, expect } from 'vitest';
import { calculateInvoiceTotals, InvoiceItemCalculationInput } from '../../utils/invoiceCalculations';

describe('Sales Invoice Financial Calculations & Tax Integrity', () => {
  it('يجب حساب المجموع الفرعي والضريبة 14% بدقة لصنف واحد دون خصم', () => {
    const items: InvoiceItemCalculationInput[] = [
      { quantity: 10, unitPrice: 50, taxRate: 0.14 }
    ];

    const result = calculateInvoiceTotals(items);

    expect(result.subtotal).toBe(500.00);
    expect(result.totalItemsDiscount).toBe(0);
    expect(result.vatAmount).toBe(70.00); // 500 * 14%
    expect(result.grandTotal).toBe(570.00);
  });

  it('يجب حساب الخصم التجاري للصنف والضريبة على الصافي', () => {
    const items: InvoiceItemCalculationInput[] = [
      { quantity: 4, unitPrice: 250, discountPercent: 10, taxRate: 0.14 } // 1000 - 100 = 900
    ];

    const result = calculateInvoiceTotals(items);

    expect(result.subtotal).toBe(1000.00);
    expect(result.totalItemsDiscount).toBe(100.00);
    expect(result.taxableAmount).toBe(900.00);
    expect(result.vatAmount).toBe(126.00); // 900 * 14%
    expect(result.grandTotal).toBe(1026.00);
  });

  it('يجب حساب ضريبة أرباح تجارية وصناعية (خصم وتحصيل 1%) وخصمها من الإجمالي المستحق', () => {
    const items: InvoiceItemCalculationInput[] = [
      { quantity: 1, unitPrice: 10000, taxRate: 0.14 }
    ];

    const result = calculateInvoiceTotals(items, 0, 0.01); // 1% Withholding

    expect(result.subtotal).toBe(10000.00);
    expect(result.vatAmount).toBe(1400.00); // 14%
    expect(result.withholdingTaxAmount).toBe(100.00); // 1%
    // المستحق: 10000 + 1400 - 100 = 11300
    expect(result.grandTotal).toBe(11300.00);
  });

  it('يجب التعامل مع كسور التقريب بدقة (Decimal Precision Handling)', () => {
    const items: InvoiceItemCalculationInput[] = [
      { quantity: 3.333, unitPrice: 15.75, taxRate: 0.14 }
    ];

    const result = calculateInvoiceTotals(items);

    expect(result.subtotal).toBeCloseTo(52.49, 2);
    expect(result.vatAmount).toBeCloseTo(7.35, 2);
    expect(result.grandTotal).toBeCloseTo(59.84, 2);
  });

  it('يجب أن يدعم تعدد الأصناف وتطبيق رسوم التوصيل', () => {
    const items: InvoiceItemCalculationInput[] = [
      { quantity: 2, unitPrice: 100, taxRate: 0.14 }, // 200 + 28 = 228
      { quantity: 1, unitPrice: 300, discountAmount: 50, taxRate: 0.14 }, // (300-50=250) + 35 = 285
    ];

    const result = calculateInvoiceTotals(items, 0, 0, 30); // 30 EGP delivery fee

    expect(result.subtotal).toBe(500.00);
    expect(result.totalItemsDiscount).toBe(50.00);
    expect(result.taxableAmount).toBe(450.00);
    expect(result.vatAmount).toBe(63.00); // (200*0.14=28) + (250*0.14=35) = 63
    expect(result.deliveryFee).toBe(30.00);
    expect(result.grandTotal).toBe(543.00); // 450 + 63 + 30
  });
});
