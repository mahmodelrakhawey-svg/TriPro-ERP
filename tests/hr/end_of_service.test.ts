import { describe, it, expect } from 'vitest';

/**
 * محرك احتساب مكافأة نهاية الخدمة والتسوية النهائية طبقاً لقانون العمل المصري والخليجي
 * متطابق مع المنطق المحاسبي المعتمد في EndOfServiceCalculator.tsx
 */
export function calculateEndOfServiceSettlement(params: {
  joiningDate: string;
  terminationDate: string;
  salary: number;
  terminationType: 'RESIGNATION' | 'COMPANY_TERMINATION' | 'CONTRACT_EXPIRY' | 'DEATH_DISABILITY';
  remainingLeaveDays?: number;
  advances?: number;
  otherAdditions?: number;
  otherDeductions?: number;
}) {
  const [sy, sm, sd] = params.joiningDate.split('-').map(Number);
  const [ey, em, ed] = params.terminationDate.split('-').map(Number);

  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return {
      totalYearsDecimal: 0,
      baseGratuity: 0,
      factorPct: 0,
      calculatedGratuity: 0,
      leaveCompensation: 0,
      netFinal: 0,
    };
  }

  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const totalYearsDecimal = Math.round((totalDays / 365.25) * 100) / 100;

  const y = totalYearsDecimal;
  const salary = params.salary || 0;

  // قانون العمل: أول 5 سنوات بنصف شهر لكل سنة، وما زاد عنها بشهر كامل
  let baseGratuity = 0;
  if (y <= 5) {
    baseGratuity = y * (0.5 * salary);
  } else {
    baseGratuity = 5 * 0.5 * salary + (y - 5) * 1.0 * salary;
  }

  // تطبيق معامل نوع انتهاء الخدمة (الاستقالة تخضع لنسب قانونية متدرجة)
  let factor = 1.0;
  if (params.terminationType === 'RESIGNATION') {
    if (y < 2) {
      factor = 0; // أقل من سنتين: لا يستحق مكافأة
    } else if (y < 5) {
      factor = 1 / 3; // من سنتين إلى 5: يستحق ثلث المكافأة
    } else if (y < 10) {
      factor = 2 / 3; // من 5 إلى 10: يستحق ثلثي المكافأة
    } else {
      factor = 1.0; // 10 سنوات فأكثر: يستحق المكافأة كاملة
    }
  } else {
    factor = 1.0; // إنهاء من الشركة أو انتهاء العقد أو الوفاة/العجز: المكافأة كاملة
  }

  const calculatedGratuity = Math.round(baseGratuity * factor);
  const leaveCompensation = Math.round((salary / 30) * (params.remainingLeaveDays || 0));
  const grossAdditions = calculatedGratuity + leaveCompensation + Number(params.otherAdditions || 0);
  const totalDeductions = Number(params.advances || 0) + Number(params.otherDeductions || 0);
  const netFinal = Math.max(0, grossAdditions - totalDeductions);

  return {
    totalYearsDecimal,
    baseGratuity: Math.round(baseGratuity),
    factorPct: Math.round(factor * 100),
    calculatedGratuity,
    leaveCompensation,
    netFinal,
  };
}

describe('👥 HR End of Service (EOS) & Gratuity Calculation Tests', () => {
  const basicSalary = 10000;

  describe('1. إنهاء الخدمة من طرف الشركة (Company Termination)', () => {
    it('يحسب مكافأة خدمة 3 سنوات بنصف شهر عن كل سنة كاملة 100%', () => {
      // 3 سنوات خدمة براتب 10,000 -> 3 * 5,000 = 15,000
      const result = calculateEndOfServiceSettlement({
        joiningDate: '2023-01-01',
        terminationDate: '2026-01-01',
        salary: basicSalary,
        terminationType: 'COMPANY_TERMINATION',
      });

      expect(result.totalYearsDecimal).toBe(3);
      expect(result.factorPct).toBe(100);
      expect(result.calculatedGratuity).toBe(15000);
      expect(result.netFinal).toBe(15000);
    });

    it('يحسب مكافأة خدمة 8 سنوات (أول 5 سنوات بنصف شهر + 3 سنوات بشهر كامل)', () => {
      // 5 سنوات * 5,000 = 25,000
      // 3 سنوات * 10,000 = 30,000
      // إجمالي = 55,000
      const result = calculateEndOfServiceSettlement({
        joiningDate: '2018-01-01',
        terminationDate: '2026-01-01',
        salary: basicSalary,
        terminationType: 'COMPANY_TERMINATION',
      });

      expect(result.totalYearsDecimal).toBe(8);
      expect(result.factorPct).toBe(100);
      expect(result.calculatedGratuity).toBe(55000);
    });
  });

  describe('2. حالات الاستقالة وتدرج النسب القانونية (Resignation Ratios)', () => {
    it('لا يستحق أي مكافأة إذا استقال قبل إتمام سنتين (0%)', () => {
      // سنة ونصف خدمة
      const result = calculateEndOfServiceSettlement({
        joiningDate: '2024-07-01',
        terminationDate: '2026-01-01',
        salary: basicSalary,
        terminationType: 'RESIGNATION',
      });

      expect(result.totalYearsDecimal).toBeLessThan(2);
      expect(result.factorPct).toBe(0);
      expect(result.calculatedGratuity).toBe(0);
    });

    it('يستحق ثلث المكافأة (33%) إذا استقال بين سنتين و 5 سنوات', () => {
      // 4 سنوات خدمة -> base = 4 * 5,000 = 20,000 -> الثلث = 6,667
      const result = calculateEndOfServiceSettlement({
        joiningDate: '2022-01-01',
        terminationDate: '2026-01-01',
        salary: basicSalary,
        terminationType: 'RESIGNATION',
      });

      expect(result.totalYearsDecimal).toBe(4);
      expect(result.factorPct).toBe(33);
      expect(result.calculatedGratuity).toBe(6667);
    });

    it('يستحق ثلثي المكافأة (67%) إذا استقال بين 5 و 10 سنوات', () => {
      // 6 سنوات خدمة: (5 * 5,000) + (1 * 10,000) = 35,000 -> الثلثان (66.67%) = 23,333
      const result = calculateEndOfServiceSettlement({
        joiningDate: '2020-01-01',
        terminationDate: '2026-01-01',
        salary: basicSalary,
        terminationType: 'RESIGNATION',
      });

      expect(result.totalYearsDecimal).toBe(6);
      expect(result.factorPct).toBe(67);
      expect(result.calculatedGratuity).toBe(23333);
    });

    it('يستحق المكافأة كاملة 100% إذا تجاوزت خدمته 10 سنوات حتى لو استقال', () => {
      // 10 سنوات خدمة -> (5 * 5,000) + (5 * 10,000) = 75,000
      const result = calculateEndOfServiceSettlement({
        joiningDate: '2016-01-01',
        terminationDate: '2026-01-01',
        salary: basicSalary,
        terminationType: 'RESIGNATION',
      });

      expect(result.totalYearsDecimal).toBe(10);
      expect(result.factorPct).toBe(100);
      expect(result.calculatedGratuity).toBe(75000);
    });
  });

  describe('3. التسوية المالية الشاملة (بدل الإجازات، السلف، والصافي)', () => {
    it('يحسب تعويض رصيد الإجازات ويخصم السلف المتبقية بدقة', () => {
      // 3 سنوات خدمة إنهاء من الشركة: مكافأة 15,000
      // 15 يوم رصيد إجازات = (10,000 / 30) * 15 = 5,000
      // سلف متبقية = 4,000
      // إضافات أخرى = 1,000
      // الصافي = 15,000 + 5,000 + 1,000 - 4,000 = 17,000
      const result = calculateEndOfServiceSettlement({
        joiningDate: '2023-01-01',
        terminationDate: '2026-01-01',
        salary: basicSalary,
        terminationType: 'COMPANY_TERMINATION',
        remainingLeaveDays: 15,
        advances: 4000,
        otherAdditions: 1000,
      });

      expect(result.leaveCompensation).toBe(5000);
      expect(result.netFinal).toBe(17000);
    });

    it('يمنع الصافي السالب إذا كانت السلف تتجاوز إجمالي مستحقات الموظف', () => {
      // مكافأة 0 + رصيد إجازات 0، لكن عليه سلفة 10,000 -> الصافي 0 وليس سالباً
      const result = calculateEndOfServiceSettlement({
        joiningDate: '2025-06-01',
        terminationDate: '2026-01-01',
        salary: basicSalary,
        terminationType: 'RESIGNATION',
        advances: 10000,
      });

      expect(result.netFinal).toBe(0);
    });
  });
});
