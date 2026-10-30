import { describe, it, expect } from 'vitest';

describe('🧾 Egyptian VAT 14% Tax Return & Netting Engine (إقرار ضريبة القيمة المضافة والتسوية الدفترية)', () => {
  // ثوابت ضريبية مصرية مع التقريب المالي
  const VAT_RATE = 0.14; // 14% القيمة المضافة العامة
  const roundMoney = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;

  it('يحسب ضريبة المخرجات على مبيعات الحلويات وضريبة المدخلات على الخامات بدقة تامة', () => {
    // 1. مبيعات المعارض والمصنع (Sales)
    const salesTaxableSubtotal = 250000; // 250,000 EGP
    const outputVat = roundMoney(salesTaxableSubtotal * VAT_RATE);
    const grossSalesWithVat = roundMoney(salesTaxableSubtotal + outputVat);

    expect(outputVat).toBe(35000); // 35,000 EGP ضريبة مخرجات
    expect(grossSalesWithVat).toBe(285000);

    // 2. مشتريات الخامات ومستلزمات الإنتاج (Purchases)
    const purchasesTaxableSubtotal = 150000; // 150,000 EGP خامات
    const inputVat = roundMoney(purchasesTaxableSubtotal * VAT_RATE);
    const grossPurchasesWithVat = roundMoney(purchasesTaxableSubtotal + inputVat);

    expect(inputVat).toBe(21000); // 21,000 EGP ضريبة مدخلات قابلة للخصم
    expect(grossPurchasesWithVat).toBe(171000);

    // 3. صافي الضريبة واجبة السداد لمصلحة الضرائب المصرية (Net VAT Payable)
    const netVatPayable = roundMoney(outputVat - inputVat);
    expect(netVatPayable).toBe(14000); // 14,000 EGP مستحق للسداد
  });

  it('يعالج الإشعارات الدائنة والمدينة (مرتجع المبيعات والمشتريات) ويعدل الوعاء الضريبي بدقة', () => {
    const baseOutputVat = 35000;
    const baseInputVat = 21000;

    // مرتجع مبيعات (إشعار دائن Credit Note): إرجاع تورت وحلويات بقيمة 10,000 ج.م
    const salesReturnSubtotal = 10000;
    const salesReturnVatReversal = roundMoney(salesReturnSubtotal * VAT_RATE); // 1,400 EGP
    expect(salesReturnVatReversal).toBe(1400);

    // مرتجع مشتريات خامات تالفة للمورد (إشعار مدين Debit Note): خامات بقيمة 5,000 ج.م
    const purchaseReturnSubtotal = 5000;
    const purchaseReturnVatReversal = roundMoney(purchaseReturnSubtotal * VAT_RATE); // 700 EGP
    expect(purchaseReturnVatReversal).toBe(700);

    // احتساب الصافي بعد التسويات
    const adjustedOutputVat = roundMoney(baseOutputVat - salesReturnVatReversal); // 33,600 EGP
    const adjustedInputVat = roundMoney(baseInputVat - purchaseReturnVatReversal);  // 20,300 EGP
    const finalNetTaxDue = roundMoney(adjustedOutputVat - adjustedInputVat);

    expect(adjustedOutputVat).toBe(33600);
    expect(adjustedInputVat).toBe(20300);
    expect(finalNetTaxDue).toBe(13300); // 13,300 EGP صافي مستحق
  });

  it('يتحقق من توازن قيد إقفال وتسوية ضريبة القيمة المضافة الشهري بنسبة 100%', () => {
    const outputVatBalance = 33600; // حساب 2231 دائن بطبيعته، ويقفل مديناً
    const inputVatBalance = 20300;   // حساب 1231 مدين بطبيعته، ويقفل دائناً
    const taxAuthorityLiability = roundMoney(outputVatBalance - inputVatBalance); // 13,300 EGP لحساب مصلحة الضرائب (2242)

    // بنية قيد الإقفال المحاسبي (VAT Closing Journal Entry)
    const closingEntry = {
      reference: 'VAT-CLOSE-20261031',
      date: '2026-10-31',
      description: 'قيد تسوية وإقفال ضريبة القيمة المضافة عن شهر أكتوبر 2026',
      lines: [
        { accountCode: '2231', accountName: 'ضريبة القيمة المضافة - مخرجات', debit: outputVatBalance, credit: 0 },
        { accountCode: '1231', accountName: 'ضريبة القيمة المضافة - مدخلات', debit: 0, credit: inputVatBalance },
        { accountCode: '2242', accountName: 'مصلحة الضرائب المصرية - التزامات القيمة المضافة', debit: 0, credit: taxAuthorityLiability }
      ]
    };

    const totalDebit = roundMoney(closingEntry.lines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = roundMoney(closingEntry.lines.reduce((sum, l) => sum + l.credit, 0));

    // صمام أمان توازن القيد
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(33600);
    expect(totalCredit).toBe(33600);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.001);
  });
});
