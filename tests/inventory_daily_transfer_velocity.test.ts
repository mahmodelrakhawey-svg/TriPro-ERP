import { describe, it, expect } from 'vitest';

// دوال الحساب الرياضي والإحصائي الخاصة بتقرير معدل التحويل وسلوك الصنف
export function calculateDailyVelocityMetrics(
  dailyQuantities: { date: string; quantity: number }[],
  currentSourceStock: number,
  planningHorizonDays: number = 14,
  safetyBufferPct: number = 15
) {
  const totalDays = dailyQuantities.length;
  const totalTransferred = dailyQuantities.reduce((sum, d) => sum + d.quantity, 0);
  const activeDays = dailyQuantities.filter(d => d.quantity > 0).length;

  const calendarDailyAvg = totalDays > 0 ? totalTransferred / totalDays : 0;
  const activeDailyAvg = activeDays > 0 ? totalTransferred / activeDays : 0;

  // أعلى يوم صرف (الذروة)
  let peakQty = 0;
  let peakDate = '';
  dailyQuantities.forEach(d => {
    if (d.quantity > peakQty) {
      peakQty = d.quantity;
      peakDate = d.date;
    }
  });

  // حساب الانحراف المعياري والتذبذب
  let sumSquaredDiff = 0;
  dailyQuantities.forEach(d => {
    const diff = d.quantity - calendarDailyAvg;
    sumSquaredDiff += diff * diff;
  });
  const variance = totalDays > 0 ? sumSquaredDiff / totalDays : 0;
  const stdDev = Math.sqrt(variance);
  const volatilityRate = calendarDailyAvg > 0 ? stdDev / calendarDailyAvg : 0;

  let volatilityLabel: 'منتظم ومستقر' | 'متوسط الاستقرار' | 'شديد التذبذب' = 'منتظم ومستقر';
  if (volatilityRate > 0.75) {
    volatilityLabel = 'شديد التذبذب';
  } else if (volatilityRate > 0.35) {
    volatilityLabel = 'متوسط الاستقرار';
  }

  // الأيام المتبقية قبل نفاد المخزون
  const daysOfSupply = calendarDailyAvg > 0 ? currentSourceStock / calendarDailyAvg : 999;

  // التنبؤ باحتياجات الإنتاج المستقبلية
  const baseProjectedNeed = calendarDailyAvg * planningHorizonDays;
  const safetyBufferQty = baseProjectedNeed * (safetyBufferPct / 100);
  const totalRequired = Math.ceil(baseProjectedNeed + safetyBufferQty);

  const balanceAfterHorizon = currentSourceStock - totalRequired;
  const isDeficit = balanceAfterHorizon < 0;
  const shortageQty = isDeficit ? Math.abs(balanceAfterHorizon) : 0;

  return {
    totalTransferred,
    totalDays,
    activeDays,
    calendarDailyAvg: Math.round(calendarDailyAvg * 100) / 100,
    activeDailyAvg: Math.round(activeDailyAvg * 100) / 100,
    peakQty,
    peakDate,
    stdDev: Math.round(stdDev * 100) / 100,
    volatilityRate: Math.round(volatilityRate * 100) / 100,
    volatilityLabel,
    daysOfSupply: Math.round(daysOfSupply * 10) / 10,
    baseProjectedNeed: Math.round(baseProjectedNeed * 10) / 10,
    safetyBufferQty: Math.round(safetyBufferQty * 10) / 10,
    totalRequired,
    balanceAfterHorizon: Math.round(balanceAfterHorizon * 10) / 10,
    isDeficit,
    shortageQty: Math.round(shortageQty * 10) / 10
  };
}

describe('📊 تقرير معدل التحويل والصرف اليومي وتحليل سلوك الأصناف (Daily Transfer Velocity & Replenishment)', () => {
  it('1. يحسب متوسط الصرف اليومي بدقة على كامل الأيام وعلى الأيام النشطة كما في مثال العميل (15 و 17 قطعة)', () => {
    // سيناريو العميل: صرف في يوم 15 قطعة، وفي يوم آخر 17 قطعة، ويوم ثالث بدون صرف (0)
    const series = [
      { date: '2026-11-01', quantity: 15 },
      { date: '2026-11-02', quantity: 17 },
      { date: '2026-11-03', quantity: 0 },
      { date: '2026-11-04', quantity: 16 }
    ];

    const metrics = calculateDailyVelocityMetrics(series, 100, 7, 10);

    expect(metrics.totalTransferred).toBe(48); // 15 + 17 + 0 + 16 = 48
    expect(metrics.totalDays).toBe(4);
    expect(metrics.activeDays).toBe(3);

    // متوسط كامل أيام الفترة = 48 / 4 = 12
    expect(metrics.calendarDailyAvg).toBe(12);

    // متوسط أيام الصرف الفعلية فقط = 48 / 3 = 16
    expect(metrics.activeDailyAvg).toBe(16);

    // أعلى يوم صرف (الذروة)
    expect(metrics.peakQty).toBe(17);
    expect(metrics.peakDate).toBe('2026-11-02');
  });

  it('2. يحلل سلوك الصنف واستقراره (Volatility & Stability Index)', () => {
    // صنف ذو سحب منتظم ومستقر جداً (مثل الدقيق اليومي بالفرن)
    const stableSeries = [
      { date: '2026-11-01', quantity: 20 },
      { date: '2026-11-02', quantity: 21 },
      { date: '2026-11-03', quantity: 19 },
      { date: '2026-11-04', quantity: 20 },
      { date: '2026-11-05', quantity: 20 }
    ];
    const stableMetrics = calculateDailyVelocityMetrics(stableSeries, 200);
    expect(stableMetrics.volatilityLabel).toBe('منتظم ومستقر');
    expect(stableMetrics.volatilityRate).toBeLessThan(0.35);

    // صنف ذو سحب متقطع وشديد التذبذب (مثل الخامات الموسمية أو الفستق)
    const volatileSeries = [
      { date: '2026-11-01', quantity: 0 },
      { date: '2026-11-02', quantity: 0 },
      { date: '2026-11-03', quantity: 65 },
      { date: '2026-11-04', quantity: 0 },
      { date: '2026-11-05', quantity: 5 }
    ];
    const volatileMetrics = calculateDailyVelocityMetrics(volatileSeries, 200);
    expect(volatileMetrics.volatilityLabel).toBe('شديد التذبذب');
    expect(volatileMetrics.volatilityRate).toBeGreaterThan(0.75);
  });

  it('3. يتنبأ باحتياج الإنتاج القادم ويكتشف العجز الحرج في مخزن المواد الخام', () => {
    // معدل سحب يومي 10 وحدات
    const series = [
      { date: '2026-11-01', quantity: 10 },
      { date: '2026-11-02', quantity: 10 },
      { date: '2026-11-03', quantity: 10 },
      { date: '2026-11-04', quantity: 10 }
    ];

    // الرصيد الحالي بمخزن المواد الخام: 80 وحدة فقط
    // أفق التخطيط: 14 يوماً القادمة، هامش أمان: 20%
    // الاحتياج الأساسي = 10 * 14 = 140
    // هامش الأمان = 140 * 0.20 = 28
    // إجمالي المطلوب = 168 وحدة
    // الرصيد 80 < 168 => عجز مقداره 88 وحدة!
    const metrics = calculateDailyVelocityMetrics(series, 80, 14, 20);

    expect(metrics.calendarDailyAvg).toBe(10);
    expect(metrics.baseProjectedNeed).toBe(140);
    expect(metrics.safetyBufferQty).toBe(28);
    expect(metrics.totalRequired).toBe(168);
    expect(metrics.isDeficit).toBe(true);
    expect(metrics.shortageQty).toBe(88);
    // الرصيد يكفي فقط 80 / 10 = 8 أيام
    expect(metrics.daysOfSupply).toBe(8);
  });

  it('4. يؤكد كفاية المخزون ووجود فائض أمان عندما يكون الرصيد مغطياً للفترة بالكامل', () => {
    const series = [
      { date: '2026-11-01', quantity: 5 },
      { date: '2026-11-02', quantity: 5 },
      { date: '2026-11-03', quantity: 5 }
    ];

    // الرصيد الحالي 200 وحدة
    // أفق التخطيط: 7 أيام، أمان: 10%
    // الاحتياج = (5 * 7) + 3.5 = 38.5 => 39 وحدة
    // الرصيد 200 > 39 => فائض 161 وحدة
    const metrics = calculateDailyVelocityMetrics(series, 200, 7, 10);

    expect(metrics.isDeficit).toBe(false);
    expect(metrics.shortageQty).toBe(0);
    expect(metrics.totalRequired).toBe(39);
    expect(metrics.balanceAfterHorizon).toBe(161);
    expect(metrics.daysOfSupply).toBe(40); // 200 / 5 = 40 يوماً
  });
});
