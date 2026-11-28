import { describe, it, expect } from 'vitest';
import {
  payrollRunSchema,
  payrollAccrualSchema,
  payrollDisbursementSchema,
  payrollItemSchema,
} from '../../utils/validationSchemas';
import { TEST_CASH_ACC_ID, TEST_USER_ID } from '../helpers/factories';
import { roundToTwoDecimals } from '../../utils/invoiceCalculations';

function computeNetSalary(item: {
  grossSalary: number;
  additions?: number;
  overtimePay?: number;
  advancesDeducted?: number;
  payrollTax?: number;
  unpaidLeaveDeduction?: number;
  otherDeductions?: number;
}) {
  const totalEarnings =
    item.grossSalary + (item.additions || 0) + (item.overtimePay || 0);
  const totalDeductions =
    (item.advancesDeducted || 0) +
    (item.payrollTax || 0) +
    (item.unpaidLeaveDeduction || 0) +
    (item.otherDeductions || 0);
  return roundToTwoDecimals(totalEarnings - totalDeductions);
}

describe('👥 PayrollRun Schemas & Salary Calculation Invariants', () => {
  it('يتحقق من صلاحية بيانات تشغيل مسير الرواتب واستحقاقه وصرفه', () => {
    expect(
      payrollRunSchema.safeParse({
        month: 11,
        year: 2026,
        treasuryId: TEST_CASH_ACC_ID,
        hasData: true,
      }).success
    ).toBe(true);

    // رفض مسير فارغ بدون موظفين
    expect(
      payrollAccrualSchema.safeParse({
        month: 11,
        year: 2026,
        hasData: false,
      }).success
    ).toBe(false);

    // رفض صرف الرواتب بدون تحديد الخزينة أو بتاريخ فارغ
    expect(
      payrollDisbursementSchema.safeParse({
        treasuryId: 'invalid-uuid',
        paymentDate: '',
      }).success
    ).toBe(false);
  });

  it('يحسب صافي الراتب مع الإضافات وخصم السلفة والضرائب والإجازة غير المدفوعة بدقة', () => {
    const net = computeNetSalary({
      grossSalary: 8000,
      additions: 500,
      overtimePay: 350,
      advancesDeducted: 1200,
      payrollTax: 420.75,
      unpaidLeaveDeduction: 533.33,
      otherDeductions: 100,
    });

    // 8850 - 2254.08 = 6595.92
    expect(net).toBe(6595.92);

    const parsedItem = payrollItemSchema.safeParse({
      employee_id: TEST_USER_ID,
      full_name: 'محمد محسن',
      gross_salary: 8000,
      additions: 500,
      advances_deducted: 1200,
      payroll_tax: 420.75,
      unpaid_leave_days: 2,
      unpaid_leave_deduction: 533.33,
      other_deductions: 100,
      net_salary: net,
    });
    expect(parsedItem.success).toBe(true);
  });

  it('يرفض بند راتب باسم فارغ أو قيمة استقطاع سالبة', () => {
    const invalid = payrollItemSchema.safeParse({
      employee_id: TEST_USER_ID,
      full_name: '',
      gross_salary: 5000,
      advances_deducted: -100,
      net_salary: 5100,
    });
    expect(invalid.success).toBe(false);
  });
});
