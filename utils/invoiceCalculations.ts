/**
 * ==============================================================================
 * TriPro ERP — Canonical Invoice & Tax Calculations Engine
 * utils/invoiceCalculations.ts
 * ==============================================================================
 * المحرك الحسابي الموحد للفواتير والضرائب
 * يضمن:
 * 1. حساب ضريبة القيمة المضافة المصرية القياسية 14% (Egyptian VAT)
 * 2. معالجة الخصومات على مستوى البند (خصم نسبة مئوية أو قيمة ثابتة)
 * 3. توزيع الخصم العام الإجمالي على الوعاء الخاضع للضريبة
 * 4. تطبيق ضريبة الخصم والإضافة من المنبع (1% Withholding Tax - WHT)
 * 5. تفادي انحرافات الفاصلة العائمة (IEEE 754 Floating-Point Drift) بالتقريب الدقيق لأقرب قرشين.
 * ==============================================================================
 */

/**
 * مدخلات حساب بند الفاتورة الفردي
 */
export interface InvoiceItemCalculationInput {
  /** الكمية المباعة أو المشتراة */
  quantity: number;
  /** سعر الوحدة قبل الضريبة والخصم */
  unitPrice: number;
  /** نسبة الخصم للبند (مثال: 10 لخصم 10%) */
  discountPercent?: number;
  /** قيمة الخصم المباشرة للبند بالعملة المحلية */
  discountAmount?: number;
  /** معدل الضريبة العشري (الافتراضي 0.14 لضريبة القيمة المضافة 14%) */
  taxRate?: number;
}

/**
 * المخرجات التفصيلية لحساب بند الفاتورة
 */
export interface CalculatedInvoiceItem {
  /** المبلغ الإجمالي للبند قبل الخصم (الكمية × السعر) */
  grossAmount: number;
  /** قيمة الخصم المطبقة على البند */
  itemDiscount: number;
  /** الصافي بعد خصم البند (الوعاء الضريبي للبند) */
  netAmount: number;
  /** قيمة الضريبة المحسوبة للبند */
  itemTax: number;
  /** إجمالي قيمة البند شاملة الضريبة */
  itemTotal: number;
}

/**
 * نتيجة الحسابات الكاملة للفاتورة شاملة الضرائب والخصومات
 */
export interface InvoiceTotalsResult {
  /** إجمالي المبيعات/المشتريات قبل أي خصم */
  subtotal: number;
  /** مجموع خصومات البنود الفردية */
  totalItemsDiscount: number;
  /** الصافي بعد خصومات البنود */
  netAfterItemsDiscount: number;
  /** قيمة الخصم الإضافي العام المطبق على الفاتورة */
  overallDiscountAmount: number;
  /** الوعاء الخاضع لضريبة القيمة المضافة (Taxable Base) */
  taxableAmount: number;
  /** إجمالي ضريبة القيمة المضافة المحسوبة */
  totalTax: number;
  /** الاسم المماثل لإجمالي الضريبة (Alias for vatAmount) */
  vatAmount: number;
  /** ضريبة الخصم والإضافة من المنبع (WHT) إن وجدت */
  withholdingTaxAmount: number;
  /** رسوم التوصيل أو الشحن المضافة */
  deliveryFee: number;
  /** المبلغ الإجمالي النهائي المستحق للسداد */
  grandTotal: number;
  /** تفاصيل البنود بعد الحساب */
  items: CalculatedInvoiceItem[];
  /** الاسم المماثل لقائمة البنود المحسوبة (Alias for calculatedItems) */
  calculatedItems: CalculatedInvoiceItem[];
}

/**
 * دالة مساعدة لتقريب القيم المالية لأقرب منزلتين عشريتين (قرش)
 * تمنع أخطاء التقريب الحسابي مثل 19.999999999999996
 *
 * @param value القيمة العددية المراد تقريبها
 * @returns القيمة بعد التقريب لأقرب خانتين عشريتين
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * حساب إجماليات الفاتورة بالكامل وفق المعايير المحاسبية والضريبية المعتمدة
 *
 * @param items قائمة بنود الفاتورة مع الكميات والأسعار والخصومات
 * @param overallDiscountPercent نسبة الخصم العام الإضافي على الفاتورة (0 إلى 100)
 * @param withholdingTaxRate معدل ضريبة الخصم والإضافة (مثال: 0.01 لـ 1%)
 * @param deliveryFee تكلفة الشحن أو التوصيل المضافة للإجمالي
 * @returns كائن InvoiceTotalsResult يحتوي على جميع التفصيلات المالية الموزونة
 *
 * @example
 * ```ts
 * const result = calculateInvoiceTotals([
 *   { quantity: 2, unitPrice: 500, discountPercent: 10 }
 * ], 0, 0.01, 50);
 * // result.grandTotal: 1067 EGP
 * ```
 */
export function calculateInvoiceTotals(
  items: InvoiceItemCalculationInput[],
  overallDiscountPercent: number = 0,
  withholdingTaxRate: number = 0,
  deliveryFee: number = 0
): InvoiceTotalsResult {
  let subtotal = 0;
  let totalItemsDiscount = 0;
  let totalTax = 0;

  const calculatedItems: CalculatedInvoiceItem[] = (items || []).map(item => {
    const qty = Number(item.quantity || 0);
    const price = Number(item.unitPrice || 0);
    const grossAmount = roundToTwoDecimals(qty * price);

    let itemDiscount = 0;
    if (item.discountAmount !== undefined && item.discountAmount > 0) {
      itemDiscount = Math.min(item.discountAmount, grossAmount);
    } else if (item.discountPercent !== undefined && item.discountPercent > 0) {
      itemDiscount = roundToTwoDecimals(grossAmount * (item.discountPercent / 100));
    }

    const netAmount = Math.max(0, grossAmount - itemDiscount);
    const taxRate = item.taxRate !== undefined ? item.taxRate : 0.14;
    const itemTax = roundToTwoDecimals(netAmount * taxRate);

    subtotal += grossAmount;
    totalItemsDiscount += itemDiscount;
    totalTax += itemTax;

    return {
      grossAmount,
      itemDiscount,
      netAmount,
      itemTax,
      itemTotal: roundToTwoDecimals(netAmount + itemTax)
    };
  });

  const netAfterItemsDiscount = roundToTwoDecimals(subtotal - totalItemsDiscount);
  const overallDiscountAmount = roundToTwoDecimals(netAfterItemsDiscount * (Math.max(0, overallDiscountPercent) / 100));
  const taxableAmount = Math.max(0, roundToTwoDecimals(netAfterItemsDiscount - overallDiscountAmount));

  // إعادة احتساب الضريبة في حال وجود خصم عام لخصمه من الوعاء الضريبي
  const finalVat = overallDiscountPercent > 0 
    ? roundToTwoDecimals(taxableAmount * 0.14) 
    : roundToTwoDecimals(totalTax);

  const withholdingTaxAmount = withholdingTaxRate > 0
    ? roundToTwoDecimals(taxableAmount * withholdingTaxRate)
    : 0;

  const finalDeliveryFee = roundToTwoDecimals(deliveryFee);
  const grandTotal = roundToTwoDecimals(taxableAmount + finalVat - withholdingTaxAmount + finalDeliveryFee);

  return {
    subtotal: roundToTwoDecimals(subtotal),
    totalItemsDiscount: roundToTwoDecimals(totalItemsDiscount),
    netAfterItemsDiscount,
    overallDiscountAmount,
    taxableAmount,
    totalTax: finalVat,
    vatAmount: finalVat,
    withholdingTaxAmount,
    deliveryFee: finalDeliveryFee,
    grandTotal,
    items: calculatedItems,
    calculatedItems
  };
}
