import { describe, it, expect } from 'vitest';

/**
 * دالة حساب المستخلصات الهندسية ونسب الإنجاز طبقاً لمعايير إدارة المشروعات والمقاولات في TriPro ERP
 */
export function calculateProgressBilling(params: {
  boqItems: Array<{ id: string; name: string; quantity: number; unitPrice: number }>;
  itemsProgress: Record<string, number>; // نسب الإنجاز المئوية (0-100)
  retentionRate?: number; // نسبة ضمان الأعمال (افتراضياً 10%)
  advanceDeduction?: number; // قيمة خصم الدفعة المقدمة
  vatRate?: number; // نسبة ضريبة القيمة المضافة (14%)
  whtRate?: number; // نسبة ضريبة الأرباح التجارية والصناعية (1%)
  previousGrossAmount?: number; // إجمالي المستخلصات السابقة إن وجدت
}) {
  let totalBoqValue = 0;
  let currentGrossValue = 0;

  params.boqItems.forEach((item) => {
    const itemTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    totalBoqValue += itemTotal;

    const progress = Math.min(100, Math.max(0, params.itemsProgress[item.id] || 0));
    currentGrossValue += (progress / 100) * itemTotal;
  });

  const overallCompletionPercentage =
    totalBoqValue > 0 ? (currentGrossValue / totalBoqValue) * 100 : 0;

  // الأعمال المنفذة خلال هذه الفترة الحالية (الحالي ناقص السابق)
  const previousGross = params.previousGrossAmount || 0;
  const currentPeriodWork = Math.max(0, currentGrossValue - previousGross);

  // استقطاع محتجز ضمان الأعمال (Retention) على أعمال الفترة الحالية
  const retentionRate = params.retentionRate ?? 10;
  const retentionAmount = currentPeriodWork * (retentionRate / 100);

  // استقطاع الدفعة المقدمة
  const advanceDeduction = params.advanceDeduction || 0;

  // وعاء ضريبة القيمة المضافة = الأعمال المنفذة - ضمان الأعمال - استقطاع الدفعة المقدمة
  const baseForVat = Math.max(0, currentPeriodWork - retentionAmount - advanceDeduction);

  const vatRate = params.vatRate ?? 14;
  const vatAmount = (baseForVat * vatRate) / 100;

  // ضريبة الخصم والأرباح التجارية (WHT) تخصم كنسبة من إجمالي الأعمال المنفذة
  const whtRate = params.whtRate ?? 1;
  const whtAmount = (currentPeriodWork * whtRate) / 100;

  // صافي المبلغ المستحق صرفه للمقاول
  const netPayable = baseForVat + vatAmount - whtAmount;

  return {
    totalBoqValue: Math.round(totalBoqValue * 100) / 100,
    currentGrossValue: Math.round(currentGrossValue * 100) / 100,
    overallCompletionPercentage: Math.round(overallCompletionPercentage * 100) / 100,
    currentPeriodWork: Math.round(currentPeriodWork * 100) / 100,
    retentionAmount: Math.round(retentionAmount * 100) / 100,
    advanceDeduction: Math.round(advanceDeduction * 100) / 100,
    baseForVat: Math.round(baseForVat * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    whtAmount: Math.round(whtAmount * 100) / 100,
    netPayable: Math.round(netPayable * 100) / 100,
  };
}

describe('🏗️ Construction Progress Billing & Contracting Engine Tests', () => {
  const sampleBOQ = [
    { id: 'item-1', name: 'أعمال الحفر والردم', quantity: 1000, unitPrice: 50 },      // 50,000
    { id: 'item-2', name: 'خرسانة مسلحة للقواعد', quantity: 200, unitPrice: 4000 },    // 800,000
    { id: 'item-3', name: 'أعمال المباني والعزل', quantity: 500, unitPrice: 300 },      // 150,000
  ];
  // Total BOQ = 1,000,000 EGP

  it('يحسب إجمالي قيمة المقايسة ونسبة الإنجاز عند إنجاز جزئي بدقة متناهية', () => {
    const itemsProgress = {
      'item-1': 100, // منجز بالكامل = 50,000
      'item-2': 50,  // نصف منجز = 400,000
      'item-3': 0,   // لم يبدأ = 0
    };

    const result = calculateProgressBilling({
      boqItems: sampleBOQ,
      itemsProgress,
    });

    expect(result.totalBoqValue).toBe(1000000);
    expect(result.currentGrossValue).toBe(450000); // 50,000 + 400,000
    expect(result.overallCompletionPercentage).toBe(45); // 45% من المشروع
  });

  it('يحتسب استقطاعات المستخلص (ضمان أعمال 10%، ضريبة قيمة مضافة 14%، أرباح تجارية 1%) بدقة', () => {
    const itemsProgress = {
      'item-1': 100, // 50,000
      'item-2': 25,  // 200,000
      'item-3': 0,
    };
    // Gross = 250,000

    const result = calculateProgressBilling({
      boqItems: sampleBOQ,
      itemsProgress,
      retentionRate: 10,
      advanceDeduction: 25000, // خصم دفعة مقدمة 25,000
      vatRate: 14,
      whtRate: 1,
    });

    expect(result.currentGrossValue).toBe(250000);
    // ضمان أعمال 10% من 250,000 = 25,000
    expect(result.retentionAmount).toBe(25000);
    // وعاء ضريبة القيمة المضافة = 250,000 - 25,000 (ضمان) - 25,000 (دفعة مقدمة) = 200,000
    expect(result.baseForVat).toBe(200000);
    // ضريبة القيمة المضافة 14% على 200,000 = 28,000
    expect(result.vatAmount).toBe(28000);
    // ضريبة الخصم والأرباح التجارية 1% على 250,000 = 2,500
    expect(result.whtAmount).toBe(2500);
    // صافي المستحق = 200,000 + 28,000 - 2,500 = 225,500
    expect(result.netPayable).toBe(225500);
  });

  it('يحسب مستخلص تراكمي (الفترة الثانية مع خصم الأعمال المنفذة سابقاً)', () => {
    // في المستخلص الأول نفذ 250,000
    // في المستخلص الثاني أصبح الإجمالي المنفذ تراكمياً 600,000
    const itemsProgress = {
      'item-1': 100, // 50,000
      'item-2': 50,  // 400,000
      'item-3': 100, // 150,000
    };
    // Cumulative Gross = 600,000

    const result = calculateProgressBilling({
      boqItems: sampleBOQ,
      itemsProgress,
      previousGrossAmount: 250000, // تم صرفه في المستخلص 1
      retentionRate: 10,
      advanceDeduction: 35000,
      vatRate: 14,
      whtRate: 1,
    });

    expect(result.currentGrossValue).toBe(600000);
    // أعمال الفترة الحالية = 600,000 - 250,000 = 350,000
    expect(result.currentPeriodWork).toBe(350000);
    // ضمان الأعمال للفترة = 350,000 * 10% = 35,000
    expect(result.retentionAmount).toBe(35000);
    // وعاء الضريبة = 350,000 - 35,000 - 35,000 = 280,000
    expect(result.baseForVat).toBe(280000);
    // VAT 14% = 39,200
    expect(result.vatAmount).toBe(39200);
    // WHT 1% = 3,500
    expect(result.whtAmount).toBe(3500);
    // Net = 280,000 + 39,200 - 3,500 = 315,700
    expect(result.netPayable).toBe(315700);
  });

  it('يحمي من القيم السالبة ونسب الإنجاز الشاذة (> 100% أو < 0%)', () => {
    const itemsProgress = {
      'item-1': 150, // نسبة شاذة تتجاوز 100%
      'item-2': -20, // نسبة سالبة
      'item-3': 50,
    };

    const result = calculateProgressBilling({
      boqItems: sampleBOQ,
      itemsProgress,
    });

    // item-1 يجب تحجيمه عند 100% (50,000)
    // item-2 يجب تحجيمه عند 0% (0)
    // item-3 بنسبة 50% (75,000)
    // الإجمالي = 125,000
    expect(result.currentGrossValue).toBe(125000);
    expect(result.overallCompletionPercentage).toBe(12.5);
  });
});
