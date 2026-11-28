import * as XLSX from 'xlsx';

export type PayrollItem = {
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
  phone?: string;
  net_salary: number;
  advances_ids: string[];
};

export type PayrollTotals = {
  gross: number;
  overtime_hours: number;
  overtime_pay: number;
  reward_amount: number;
  additions: number;
  absence_days: number;
  absence_deduction: number;
  late_minutes: number;
  late_deduction: number;
  penalty_amount: number;
  unpaid_leave_days: number;
  unpaid_leave_deduction: number;
  advances: number;
  taxes: number;
  insurance: number;
  deductions: number;
  net: number;
};

/**
 * Central net salary calculator for all payroll earnings and deductions.
 */
export function calcPayrollNetSalary(
  baseSal: number,
  additions: number,
  advances: number,
  deductions: number,
  tax: number,
  insurance: number = 0
): number {
  const net = baseSal + additions - advances - deductions - tax - insurance;
  return Math.max(0, Math.round(net * 100) / 100);
}

/**
 * Aggregates payroll metrics across a list of payroll items.
 */
export function sumPayrollTotals(items: PayrollItem[]): PayrollTotals {
  return items.reduce<PayrollTotals>(
    (acc, item) => ({
      gross: acc.gross + Number(item.gross_salary || 0),
      overtime_hours: acc.overtime_hours + Number(item.overtime_hours || 0),
      overtime_pay: acc.overtime_pay + Number(item.overtime_pay || 0),
      reward_amount: acc.reward_amount + Number(item.reward_amount || 0),
      additions: acc.additions + Number(item.additions || 0),
      absence_days: acc.absence_days + Number(item.absence_days || 0),
      absence_deduction: acc.absence_deduction + Number(item.absence_deduction || 0),
      late_minutes: acc.late_minutes + Number(item.late_minutes || 0),
      late_deduction: acc.late_deduction + Number(item.late_deduction || 0),
      penalty_amount: acc.penalty_amount + Number(item.penalty_amount || 0),
      unpaid_leave_days: acc.unpaid_leave_days + Number(item.unpaid_leave_days || 0),
      unpaid_leave_deduction: acc.unpaid_leave_deduction + Number(item.unpaid_leave_deduction || 0),
      advances: acc.advances + Number(item.advances_deducted || 0),
      taxes: acc.taxes + Number(item.payroll_tax || 0),
      insurance: acc.insurance + Number(item.social_insurance || 0),
      deductions: acc.deductions + Number(item.other_deductions || 0),
      net: acc.net + Number(item.net_salary || 0),
    }),
    {
      gross: 0,
      overtime_hours: 0,
      overtime_pay: 0,
      reward_amount: 0,
      additions: 0,
      absence_days: 0,
      absence_deduction: 0,
      late_minutes: 0,
      late_deduction: 0,
      penalty_amount: 0,
      unpaid_leave_days: 0,
      unpaid_leave_deduction: 0,
      advances: 0,
      taxes: 0,
      insurance: 0,
      deductions: 0,
      net: 0,
    }
  );
}

/**
 * Normalizes Arabic text for resilient employee name matching in Excel imports.
 */
export function normalizeArabic(str: string): string {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
    .replace(/[أإآ]/g, 'ا') // توحيد الهمزات
    .replace(/ة/g, 'ه') // التاء المربوطة
    .replace(/ى/g, 'ي') // الألف المقصورة
    .replace(/\s+/g, ' '); // إزالة المسافات المتكررة
}

/**
 * Parses numeric values from imported Excel cells, stripping currency labels and separators.
 */
export function parseNumCell(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val)
    .trim()
    .replace(/ج\.م|egp|\$|le/gi, '')
    .replace(/[,،\s]/g, '');
  if (str === '') return null;
  const num = Number(str);
  return isNaN(num) ? null : num;
}

export interface ExportPayrollExcelParams {
  items: PayrollItem[];
  totals: PayrollTotals;
  selectedMonth: number;
  selectedYear: number;
  selectedDepartment: string;
  searchTerm: string;
}

/**
 * Exports filtered payroll items and summary totals into a formatted XLSX workbook.
 */
export function exportPayrollToExcel({
  items,
  totals,
  selectedMonth,
  selectedYear,
  selectedDepartment,
  searchTerm,
}: ExportPayrollExcelParams): void {
  const rows = items.map((item, idx) => ({
    'م': idx + 1,
    'كود الموظف': item.employee_id,
    'اسم الموظف': item.full_name,
    'الفرع / القسم': item.department && item.department !== '-' ? item.department : 'بدون فرع',
    'الراتب الأساسي (ج.م)': Number(item.gross_salary) || 0,
    'أيام العمل الفعلية': Number(item.effective_days ?? 30),
    'الراتب المستحق فعلياً (ج.م)': Number(item.effective_salary ?? item.gross_salary) || 0,
    'ساعات العمل الإضافي': Number(item.overtime_hours) || 0,
    'أجر العمل الإضافي (ج.م)': Number(item.overtime_pay) || 0,
    'حوافز ومكافآت (ج.م)': Number(item.reward_amount) || 0,
    'إجمالي الإضافي والمكافآت (ج.م)': Number(item.additions) || 0,
    'أيام الغياب': Number(item.absence_days) || 0,
    'خصم الغياب (ج.م)': Number(item.absence_deduction) || 0,
    'دقائق التأخير': Number(item.late_minutes) || 0,
    'خصم التأخير (ج.م)': Number(item.late_deduction) || 0,
    'جزاءات إدارية (ج.م)': Number(item.penalty_amount) || 0,
    'أيام إجازة بدون راتب': Number(item.unpaid_leave_days) || 0,
    'خصم إجازات بدون راتب (ج.م)': Number(item.unpaid_leave_deduction) || 0,
    'إجمالي الخصومات والجزاءات (ج.م)': Number(item.other_deductions) || 0,
    'السلف المستقطعة (ج.م)': Number(item.advances_deducted) || 0,
    'تأمينات اجتماعية (ج.م)': Number(item.social_insurance) || 0,
    'ضريبة كسب العمل (ج.م)': Number(item.payroll_tax) || 0,
    'صافي الراتب المستحق (ج.م)': Number(item.net_salary) || 0,
  }));

  const filterDesc = [
    selectedDepartment !== 'all' ? selectedDepartment : 'كل الفروع والأقسام',
    searchTerm ? `بحث: ${searchTerm}` : '',
  ]
    .filter(Boolean)
    .join(' - ');

  rows.push({
    'م': '' as any,
    'كود الموظف': '',
    'اسم الموظف': `الإجمالي (${items.length} موظف)${searchTerm ? ` [بحث: ${searchTerm}]` : ''}`,
    'الفرع / القسم': filterDesc,
    'الراتب الأساسي (ج.م)': totals.gross,
    'أيام العمل الفعلية': '' as any,
    'الراتب المستحق فعلياً (ج.م)': '' as any,
    'ساعات العمل الإضافي': totals.overtime_hours,
    'أجر العمل الإضافي (ج.م)': totals.overtime_pay,
    'حوافز ومكافآت (ج.م)': totals.reward_amount,
    'إجمالي الإضافي والمكافآت (ج.م)': totals.additions,
    'أيام الغياب': totals.absence_days,
    'خصم الغياب (ج.م)': totals.absence_deduction,
    'دقائق التأخير': totals.late_minutes,
    'خصم التأخير (ج.م)': totals.late_deduction,
    'جزاءات إدارية (ج.م)': totals.penalty_amount,
    'أيام إجازة بدون راتب': totals.unpaid_leave_days,
    'خصم إجازات بدون راتب (ج.م)': totals.unpaid_leave_deduction,
    'إجمالي الخصومات والجزاءات (ج.م)': totals.deductions,
    'السلف المستقطعة (ج.م)': totals.advances,
    'تأمينات اجتماعية (ج.م)': totals.insurance,
    'ضريبة كسب العمل (ج.م)': totals.taxes,
    'صافي الراتب المستحق (ج.م)': totals.net,
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 26 },
    { wch: 20 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 24 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
    { wch: 25 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
  ];

  const wb = XLSX.utils.book_new();
  const deptSuffix = selectedDepartment !== 'all' ? `_${selectedDepartment}` : '';
  const searchSuffix = searchTerm ? `_بحث_${searchTerm}` : '';
  XLSX.utils.book_append_sheet(wb, ws, `مسير_${selectedMonth}_${selectedYear}`);
  XLSX.writeFile(
    wb,
    `مسير_رواتب_شهر_${selectedMonth}_سنة_${selectedYear}${deptSuffix}${searchSuffix}.xlsx`
  );
}

/**
 * Matches imported spreadsheet rows against payroll items and recalculates derived fields.
 */
export function applyImportedPayrollRows(
  rows: Record<string, unknown>[],
  payrollData: PayrollItem[]
): { nextData: PayrollItem[]; updatedCount: number; unmatchedList: string[] } {
  let updatedCount = 0;
  const unmatchedList: string[] = [];
  const nextData = [...payrollData];

  for (const r of rows) {
    const nameVal = String(
      r['اسم الموظف'] ||
        r['الموظف'] ||
        r['الاسم'] ||
        r['Employee Name'] ||
        r['Employee'] ||
        r['full_name'] ||
        ''
    ).trim();

    if (
      !nameVal ||
      nameVal.includes('الإجمالي') ||
      nameVal.includes('Total') ||
      nameVal.startsWith('المجموع')
    ) {
      continue;
    }

    const codeVal = String(
      r['كود الموظف'] ||
        r['معرف الموظف'] ||
        r['Employee ID'] ||
        r['employee_id'] ||
        r['ID'] ||
        r['كود'] ||
        ''
    ).trim();

    let matchedIdx = -1;
    if (codeVal) {
      matchedIdx = nextData.findIndex(
        (item) => item.employee_id.toLowerCase() === codeVal.toLowerCase()
      );
    }

    if (matchedIdx === -1 && nameVal) {
      const normTarget = normalizeArabic(nameVal);
      matchedIdx = nextData.findIndex((item) => normalizeArabic(item.full_name) === normTarget);
      if (matchedIdx === -1) {
        matchedIdx = nextData.findIndex((item) => {
          const normItem = normalizeArabic(item.full_name);
          return normItem.includes(normTarget) || normTarget.includes(normItem);
        });
      }
    }

    if (matchedIdx === -1) {
      unmatchedList.push(nameVal || codeVal);
      continue;
    }

    const emp = { ...nextData[matchedIdx] };
    let isEmpModified = false;

    const grossIn = parseNumCell(
      r['الراتب الأساسي (ج.م)'] ?? r['الراتب الأساسي'] ?? r['الراتب'] ?? r['gross_salary']
    );
    if (grossIn !== null && grossIn >= 0) {
      emp.gross_salary = grossIn;
      isEmpModified = true;
    }

    const daysIn = parseNumCell(
      r['أيام العمل الفعلية'] ?? r['أيام العمل'] ?? r['effective_days']
    );
    if (daysIn !== null && daysIn >= 0 && daysIn <= 31) {
      emp.effective_days = daysIn;
      isEmpModified = true;
    }

    const effSalIn = parseNumCell(
      r['الراتب المستحق فعلياً (ج.م)'] ?? r['الراتب المستحق فعلياً'] ?? r['effective_salary']
    );
    if (effSalIn !== null && effSalIn >= 0) {
      emp.effective_salary = effSalIn;
      isEmpModified = true;
    } else if (isEmpModified) {
      const days = emp.effective_days ?? 30;
      const dailyRate = emp.gross_salary > 0 ? emp.gross_salary / 30 : 0;
      emp.effective_salary = Math.round(days * dailyRate * 100) / 100;
    }

    const otHoursIn = parseNumCell(
      r['ساعات العمل الإضافي'] ?? r['ساعات الإضافي'] ?? r['overtime_hours']
    );
    if (otHoursIn !== null && otHoursIn >= 0) {
      emp.overtime_hours = otHoursIn;
      isEmpModified = true;
    }

    const otPayIn = parseNumCell(
      r['أجر العمل الإضافي (ج.م)'] ?? r['أجر الإضافي'] ?? r['overtime_pay']
    );
    if (otPayIn !== null && otPayIn >= 0) {
      emp.overtime_pay = otPayIn;
      isEmpModified = true;
    }

    const rewIn = parseNumCell(
      r['حوافز ومكافآت (ج.م)'] ?? r['حوافز'] ?? r['مكافآت'] ?? r['reward_amount']
    );
    if (rewIn !== null && rewIn >= 0) {
      emp.reward_amount = rewIn;
      isEmpModified = true;
    }

    const addIn = parseNumCell(
      r['إجمالي الإضافي والمكافآت (ج.م)'] ?? r['إجمالي الإضافي'] ?? r['additions']
    );
    if (addIn !== null && addIn >= 0) {
      emp.additions = addIn;
      isEmpModified = true;
    } else if (otPayIn !== null || rewIn !== null) {
      emp.additions = Math.round(((emp.overtime_pay || 0) + (emp.reward_amount || 0)) * 100) / 100;
      isEmpModified = true;
    }

    const absDaysIn = parseNumCell(r['أيام الغياب'] ?? r['غياب'] ?? r['absence_days']);
    if (absDaysIn !== null && absDaysIn >= 0) {
      emp.absence_days = absDaysIn;
      isEmpModified = true;
    }

    const absDedIn = parseNumCell(
      r['خصم الغياب (ج.م)'] ?? r['خصم الغياب'] ?? r['absence_deduction']
    );
    if (absDedIn !== null && absDedIn >= 0) {
      emp.absence_deduction = absDedIn;
      isEmpModified = true;
    }

    const lateMinIn = parseNumCell(r['دقائق التأخير'] ?? r['تأخير'] ?? r['late_minutes']);
    if (lateMinIn !== null && lateMinIn >= 0) {
      emp.late_minutes = lateMinIn;
      isEmpModified = true;
    }

    const lateDedIn = parseNumCell(
      r['خصم التأخير (ج.م)'] ?? r['خصم التأخير'] ?? r['late_deduction']
    );
    if (lateDedIn !== null && lateDedIn >= 0) {
      emp.late_deduction = lateDedIn;
      isEmpModified = true;
    }

    const penIn = parseNumCell(
      r['جزاءات إدارية (ج.م)'] ?? r['جزاءات'] ?? r['خصم جزاءات'] ?? r['penalty_amount']
    );
    if (penIn !== null && penIn >= 0) {
      emp.penalty_amount = penIn;
      isEmpModified = true;
    }

    const unpaidDaysIn = parseNumCell(
      r['أيام إجازة بدون راتب'] ?? r['إجازة بدون راتب'] ?? r['unpaid_leave_days']
    );
    if (unpaidDaysIn !== null && unpaidDaysIn >= 0) {
      emp.unpaid_leave_days = unpaidDaysIn;
      isEmpModified = true;
    }

    const unpaidDedIn = parseNumCell(
      r['خصم إجازات بدون راتب (ج.م)'] ?? r['خصم إجازة بدون راتب'] ?? r['unpaid_leave_deduction']
    );
    if (unpaidDedIn !== null && unpaidDedIn >= 0) {
      emp.unpaid_leave_deduction = unpaidDedIn;
      isEmpModified = true;
    }

    const othDedIn = parseNumCell(
      r['إجمالي الخصومات والجزاءات (ج.م)'] ?? r['إجمالي الخصومات'] ?? r['other_deductions']
    );
    if (othDedIn !== null && othDedIn >= 0) {
      emp.other_deductions = othDedIn;
      isEmpModified = true;
    } else if (
      absDedIn !== null ||
      lateDedIn !== null ||
      penIn !== null ||
      unpaidDedIn !== null
    ) {
      emp.other_deductions =
        Math.round(
          ((emp.absence_deduction || 0) +
            (emp.late_deduction || 0) +
            (emp.penalty_amount || 0) +
            (emp.unpaid_leave_deduction || 0)) *
            100
        ) / 100;
      isEmpModified = true;
    }

    const advIn = parseNumCell(
      r['السلف المستقطعة (ج.م)'] ?? r['سلف'] ?? r['advances_deducted']
    );
    if (advIn !== null && advIn >= 0) {
      emp.advances_deducted = advIn;
      isEmpModified = true;
    }

    const insIn = parseNumCell(
      r['تأمينات اجتماعية (ج.م)'] ?? r['تأمينات'] ?? r['social_insurance']
    );
    if (insIn !== null && insIn >= 0) {
      emp.social_insurance = insIn;
      isEmpModified = true;
    }

    const taxIn = parseNumCell(
      r['ضريبة كسب العمل (ج.م)'] ?? r['ضريبة'] ?? r['payroll_tax']
    );
    if (taxIn !== null && taxIn >= 0) {
      emp.payroll_tax = taxIn;
      isEmpModified = true;
    }

    const baseSalary = emp.effective_salary ?? emp.gross_salary;
    emp.net_salary = calcPayrollNetSalary(
      baseSalary,
      emp.additions,
      emp.advances_deducted,
      emp.other_deductions,
      emp.payroll_tax,
      emp.social_insurance || 0
    );

    if (isEmpModified) {
      nextData[matchedIdx] = emp;
      updatedCount++;
    }
  }

  return { nextData, updatedCount, unmatchedList };
}
