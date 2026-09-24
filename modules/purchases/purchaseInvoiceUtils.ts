/**
 * TriPro ERP — Purchase Invoice Calculation Utilities
 * 
 * Provides robust item-level and overall invoice discount calculations,
 * fully compliant with Egyptian Tax Authority (ETA / مصلحة الضرائب المصرية)
 * e-invoicing standards and statutory accounting standards.
 */

export interface PurchaseInvoiceItemCalculationInput {
  productId?: string | null;
  productName?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;          // خصم البند كقيمة نقدية (ج.م)
  discountPercent?: number;   // خصم البند كنسبة مئوية (%)
  taxRate?: number;           // نسبة الضريبة المطبقة على الصنف (%)
}

export interface PurchaseInvoiceCalculationResult {
  // إجمالي أسعار الأصناف قبل أي خصم
  grossTotal: number;
  // إجمالي الخصومات على مستوى الأصناف
  itemsDiscountTotal: number;
  // الصافي بعد خصومات الأصناف وقبل الخصم الإجمالي
  subtotalBeforeInvoiceDiscount: number;
  // قيمة الخصم الإجمالي على الفاتورة
  invoiceDiscountAmount: number;
  // الوعاء الخاضع للضريبة (الصافي بعد الخصم الإجمالي)
  taxableBase: number;
  // إجمالي الضريبة المحسوبة
  taxAmount: number;
  // إجمالي كافة الخصومات (أصناف + فاتورة)
  totalDiscount: number;
  // إجمالي الفاتورة النهائي المستحق شاملاً الضريبة
  totalAmount: number;
  // تفاصيل البنود بعد الحساب
  computedItems: Array<{
    gross: number;
    itemDiscount: number;
    netBeforeInvoiceDiscount: number;
    effectiveTaxRate: number;
    itemTax: number;
    lineTotal: number;
  }>;
}

export function calculatePurchaseInvoiceTotals(
  items: PurchaseInvoiceItemCalculationInput[],
  options: {
    discountType?: 'fixed' | 'percentage';
    discountValue?: number;
    enableTax?: boolean;
    globalVatRate?: number;
    shippingCost?: number;
  } = {}
): PurchaseInvoiceCalculationResult {
  const {
    discountType = 'fixed',
    discountValue = 0,
    enableTax = false,
    globalVatRate = 14,
    shippingCost = 0
  } = options;

  let grossTotal = 0;
  let itemsDiscountTotal = 0;

  // 1. حساب خصومات وقيم كل بند بشكل فردي
  const preComputedItems = items.map(item => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const gross = qty * price;

    // حساب خصم البند: إما قيمة مباشرة أو نسبة مئوية
    let itemDiscount = 0;
    if (item.discount !== undefined && Number(item.discount) > 0) {
      itemDiscount = Number(item.discount);
    } else if (item.discountPercent !== undefined && Number(item.discountPercent) > 0) {
      itemDiscount = gross * (Number(item.discountPercent) / 100);
    }

    // الخصم لا يتجاوز إجمالي البند
    itemDiscount = Math.min(itemDiscount, gross);
    const netBeforeInvoiceDiscount = Math.max(0, gross - itemDiscount);

    grossTotal += gross;
    itemsDiscountTotal += itemDiscount;

    const effectiveTaxRate = item.taxRate !== undefined
      ? Math.max(0, Number(item.taxRate))
      : (enableTax ? Math.max(0, Number(globalVatRate)) : 0);

    return {
      gross,
      itemDiscount,
      netBeforeInvoiceDiscount,
      effectiveTaxRate
    };
  });

  const subtotalBeforeInvoiceDiscount = Math.max(0, grossTotal - itemsDiscountTotal);

  // 2. حساب الخصم الإجمالي على الفاتورة (Invoice-Level Discount)
  const rawDiscountVal = Math.max(0, Number(discountValue) || 0);
  let invoiceDiscountAmount = 0;
  if (discountType === 'percentage') {
    invoiceDiscountAmount = subtotalBeforeInvoiceDiscount * (Math.min(100, rawDiscountVal) / 100);
  } else {
    invoiceDiscountAmount = rawDiscountVal;
  }
  // الخصم الإجمالي لا يتجاوز الصافي المتبقي
  invoiceDiscountAmount = Math.min(invoiceDiscountAmount, subtotalBeforeInvoiceDiscount);

  const taxableBase = Math.max(0, subtotalBeforeInvoiceDiscount - invoiceDiscountAmount);

  // 3. توزيع الخصم الإجمالي تناسبياً على بنود الفاتورة وحساب الضريبة (معايير مصلحة الضرائب ETA)
  let totalTax = 0;
  const computedItems = preComputedItems.map(item => {
    // نسبة مساهمة البند في الخصم الإجمالي
    const share = subtotalBeforeInvoiceDiscount > 0
      ? item.netBeforeInvoiceDiscount / subtotalBeforeInvoiceDiscount
      : 0;
    const itemApportionedInvoiceDiscount = invoiceDiscountAmount * share;
    const itemTaxableBase = Math.max(0, item.netBeforeInvoiceDiscount - itemApportionedInvoiceDiscount);
    const itemTax = itemTaxableBase * (item.effectiveTaxRate / 100);
    const lineTotal = item.netBeforeInvoiceDiscount + itemTax;

    totalTax += itemTax;

    return {
      gross: round2(item.gross),
      itemDiscount: round2(item.itemDiscount),
      netBeforeInvoiceDiscount: round2(item.netBeforeInvoiceDiscount),
      effectiveTaxRate: item.effectiveTaxRate,
      itemTax: round2(itemTax),
      lineTotal: round2(lineTotal)
    };
  });

  const totalDiscount = itemsDiscountTotal + invoiceDiscountAmount;
  const totalAmount = Math.max(0, taxableBase + totalTax + (Number(shippingCost) || 0));

  return {
    grossTotal: round2(grossTotal),
    itemsDiscountTotal: round2(itemsDiscountTotal),
    subtotalBeforeInvoiceDiscount: round2(subtotalBeforeInvoiceDiscount),
    invoiceDiscountAmount: round2(invoiceDiscountAmount),
    taxableBase: round2(taxableBase),
    taxAmount: round2(totalTax),
    totalDiscount: round2(totalDiscount),
    totalAmount: round2(totalAmount),
    computedItems
  };
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
