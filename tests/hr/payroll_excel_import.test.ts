import { describe, it, expect } from 'vitest';

describe('Payroll Excel Import & Re-calculation Logic (استيراد مسير الرواتب من Excel)', () => {
  const normalizeArabic = (str: string): string => {
    if (!str) return '';
    return String(str)
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
      .replace(/[أإآ]/g, 'ا') // توحيد الهمزات
      .replace(/ة/g, 'ه') // التاء المربوطة
      .replace(/ى/g, 'ي') // الألف المقصورة
      .replace(/\s+/g, ' '); // إزالة المسافات المتكررة
  };

  const parseNumCell = (val: unknown): number | null => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const str = String(val)
      .trim()
      .replace(/ج\.م|egp|\$|le/gi, '')
      .replace(/[,،\s]/g, '');
    if (str === '') return null;
    const num = Number(str);
    return isNaN(num) ? null : num;
  };

  const calcNetSalary = (
    baseSal: number,
    additions: number,
    advances: number,
    deductions: number,
    tax: number,
    insurance: number = 0
  ): number => {
    const net = baseSal + additions - advances - deductions - tax - insurance;
    return Math.max(0, Math.round(net * 100) / 100);
  };

  interface PayrollItem {
    employee_id: string;
    full_name: string;
    department?: string;
    gross_salary: number;
    effective_days: number;
    effective_salary: number;
    overtime_hours: number;
    overtime_pay: number;
    reward_amount: number;
    additions: number;
    unpaid_leave_days: number;
    unpaid_leave_deduction: number;
    absence_days: number;
    absence_deduction: number;
    late_minutes: number;
    late_deduction: number;
    penalty_amount: number;
    other_deductions: number;
    advances_deducted: number;
    payroll_tax: number;
    social_insurance?: number;
    net_salary: number;
  }

  const initialPayroll: PayrollItem[] = [
    {
      employee_id: 'EMP-001',
      full_name: 'أحمد محمود إبراهيم',
      department: 'المصنع',
      gross_salary: 6000,
      effective_days: 30,
      effective_salary: 6000,
      overtime_hours: 0,
      overtime_pay: 0,
      reward_amount: 0,
      additions: 0,
      unpaid_leave_days: 0,
      unpaid_leave_deduction: 0,
      absence_days: 0,
      absence_deduction: 0,
      late_minutes: 0,
      late_deduction: 0,
      penalty_amount: 0,
      other_deductions: 0,
      advances_deducted: 500,
      payroll_tax: 200,
      social_insurance: 300,
      net_salary: 5000
    },
    {
      employee_id: 'EMP-002',
      full_name: 'سارة عبد الرحمن حسن',
      department: 'الإدارة',
      gross_salary: 9000,
      effective_days: 30,
      effective_salary: 9000,
      overtime_hours: 0,
      overtime_pay: 0,
      reward_amount: 0,
      additions: 0,
      unpaid_leave_days: 0,
      unpaid_leave_deduction: 0,
      absence_days: 0,
      absence_deduction: 0,
      late_minutes: 0,
      late_deduction: 0,
      penalty_amount: 0,
      other_deductions: 0,
      advances_deducted: 0,
      payroll_tax: 400,
      social_insurance: 450,
      net_salary: 8150
    }
  ];

  it('يجب استيراد التعديلات ومطابقة الموظف عبر كود الموظف ID بدقة', () => {
    const excelRows = [
      {
        'م': 1,
        'كود الموظف': 'EMP-001',
        'اسم الموظف': 'أحمد محمود إبراهيم',
        'الراتب الأساسي (ج.م)': 6000,
        'أيام العمل الفعلية': 25,
        'ساعات العمل الإضافي': 10,
        'أجر العمل الإضافي (ج.م)': 300,
        'حوافز ومكافآت (ج.م)': 200,
        'تأمينات اجتماعية (ج.م)': 300,
        'السلف المستقطعة (ج.م)': 500,
        'ضريبة كسب العمل (ج.م)': 200
      }
    ];

    const currentData = JSON.parse(JSON.stringify(initialPayroll));
    const r = excelRows[0];
    const codeVal = r['كود الموظف'];
    const matchedIdx = currentData.findIndex((i: PayrollItem) => i.employee_id === codeVal);

    expect(matchedIdx).toBe(0);

    const emp = currentData[matchedIdx];
    const days = parseNumCell(r['أيام العمل الفعلية']) ?? 30;
    emp.effective_days = days;
    const dailyRate = emp.gross_salary / 30;
    emp.effective_salary = Math.round(days * dailyRate * 100) / 100;

    emp.overtime_pay = parseNumCell(r['أجر العمل الإضافي (ج.م)']) ?? 0;
    emp.reward_amount = parseNumCell(r['حوافز ومكافآت (ج.م)']) ?? 0;
    emp.additions = emp.overtime_pay + emp.reward_amount;

    emp.net_salary = calcNetSalary(
      emp.effective_salary,
      emp.additions,
      emp.advances_deducted,
      emp.other_deductions,
      emp.payroll_tax,
      emp.social_insurance
    );

    // 25 days out of 30 for 6000 = 5000 effective salary
    expect(emp.effective_salary).toBe(5000);
    // Additions: 300 + 200 = 500
    expect(emp.additions).toBe(500);
    // Net: 5000 + 500 - 500 (advances) - 0 (other) - 200 (tax) - 300 (ins) = 4500
    expect(emp.net_salary).toBe(4500);
  });

  it('يجب مطابقة الموظف عبر الاسم العربي حتى مع اختلاف الهمزات والمسافات (Fallback Matching)', () => {
    // اسم في الإكسل بدون همزات ومسافة إضافية: "احمد محمود ابراهيم "
    const excelName = 'احمد محمود ابراهيم ';
    const normTarget = normalizeArabic(excelName);
    const matched = initialPayroll.find(emp => normalizeArabic(emp.full_name) === normTarget);

    expect(matched).toBeDefined();
    expect(matched?.employee_id).toBe('EMP-001');
  });

  it('يجب تجاهل صفوف الإجمالي والمجموع عند الاستيراد', () => {
    const summaryRow = {
      'م': '',
      'كود الموظف': '',
      'اسم الموظف': 'الإجمالي (2 موظف)',
      'الراتب الأساسي (ج.م)': 15000,
      'صافي الراتب المستحق (ج.م)': 13150
    };

    const nameVal = summaryRow['اسم الموظف'];
    const isSummary = !nameVal || nameVal.includes('الإجمالي') || nameVal.includes('Total') || nameVal.startsWith('المجموع');

    expect(isSummary).toBe(true);
  });

  it('يجب معالجة القيم النصية التي تحتوي على فواصل أو عملة بنجاح عبر parseNumCell', () => {
    expect(parseNumCell('1,500.50 ج.م')).toBe(1500.5);
    expect(parseNumCell('  300  ')).toBe(300);
    expect(parseNumCell('')).toBeNull();
    expect(parseNumCell(null)).toBeNull();
    expect(parseNumCell(500)).toBe(500);
  });
});
