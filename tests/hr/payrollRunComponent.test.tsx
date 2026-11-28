import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PayrollRun from '../../modules/hr/components/PayrollRun';
import {
  normalizeArabic,
  parseNumCell,
  applyImportedPayrollRows,
  calcPayrollNetSalary,
  sumPayrollTotals,
  PayrollItem,
} from '../../modules/hr/utils/payrollExcelUtils';
import {
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_CASH_ACC_ID,
} from '../helpers/factories';
import { createSupabaseChain } from '../helpers/mockSupabase';

const mockShowToast = vi.fn();

const mockEmployees = [
  {
    id: 'emp-1',
    full_name: 'أحمد محمود',
    department: 'الإدارة',
    basic_salary: 6000,
    social_insurance: 300,
    status: 'active',
    is_active: true,
    phone: '01000000001',
  },
  {
    id: 'emp-2',
    full_name: 'سارة علي',
    department: 'المبيعات',
    basic_salary: 9000,
    social_insurance: 450,
    status: 'active',
    is_active: true,
    phone: '01000000002',
  },
];

const mockAccounts = [
  { id: TEST_CASH_ACC_ID, name: 'الخزينة الرئيسية', code: '1231' },
];

const mockSupabaseFrom = vi.fn((table: string) => {
  if (table === 'accounts') {
    return createSupabaseChain({ data: mockAccounts, error: null });
  }
  if (table === 'payrolls') {
    return createSupabaseChain({ data: [], error: null });
  }
  if (table === 'employees') {
    return createSupabaseChain({ data: mockEmployees, error: null });
  }
  return createSupabaseChain({ data: [], error: null });
});

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (...args: any[]) => mockSupabaseFrom(args[0]),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('../../services/hrEnterpriseService', () => ({
  hrEnterpriseService: {
    getPenaltiesRewards: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../services/tenantContext', () => ({
  getActiveOrgIdSync: () => TEST_ORG_ID,
  resolveActiveOrgId: async () => TEST_ORG_ID,
}));

const mockAccountingState: any = {
  runPayroll: vi.fn().mockResolvedValue({ success: true }),
  runPayrollAccrual: vi.fn().mockResolvedValue({ success: true }),
  payAccruedPayroll: vi.fn().mockResolvedValue({ success: true }),
  cancelPayrollAccrual: vi.fn().mockResolvedValue({ success: true }),
  currentUser: { id: TEST_USER_ID, role: 'admin', organization_id: TEST_ORG_ID, hr_scope: 'all' },
  currentSelectedOrgId: TEST_ORG_ID,
  accounts: mockAccounts,
  createMissingSystemAccounts: vi.fn(),
  selectedFiscalYear: 2026,
  organization: { id: TEST_ORG_ID, name: 'شركة الاختبار' },
};

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => mockAccountingState,
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

describe('💰 PayrollRun Component — Baseline & Interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccountingState.currentUser = {
      id: TEST_USER_ID,
      role: 'admin',
      organization_id: TEST_ORG_ID,
      hr_scope: 'all',
    };
  });

  it('يمنع مستخدم demo من الوصول إلى مسير الرواتب', async () => {
    mockAccountingState.currentUser = {
      id: TEST_USER_ID,
      role: 'demo',
      organization_id: TEST_ORG_ID,
    };

    render(
      <MemoryRouter>
        <PayrollRun />
      </MemoryRouter>
    );

    expect(screen.getByText('مسير الرواتب غير متاح')).toBeTruthy();
    expect(screen.queryByText('تجهيز واحتساب المسير')).toBeNull();
  });

  it('يعرض الشاشة الفارغة وعناصر التحكم الرئيسية قبل التجهيز', async () => {
    render(
      <MemoryRouter>
        <PayrollRun />
      </MemoryRouter>
    );

    expect(screen.getByText(/مسير الرواتب والأجور الشهري/)).toBeTruthy();
    expect(screen.getByText('لم يتم تجهيز المسير بعد')).toBeTruthy();
    expect(screen.getByText('تجهيز واحتساب المسير')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/الخزينة الرئيسية/)).toBeTruthy();
    });
  });

  it('يجهز المسير من بيانات الموظفين ويعرض البطاقات والجدول التفصيلي والمدمج وتعديلات الصافي', async () => {
    render(
      <MemoryRouter>
        <PayrollRun />
      </MemoryRouter>
    );

    const prepareBtn = screen.getByText('تجهيز واحتساب المسير');
    fireEvent.click(prepareBtn);

    await waitFor(() => {
      expect(screen.getByText('أحمد محمود')).toBeTruthy();
      expect(screen.getByText('سارة علي')).toBeTruthy();
    });

    // إجمالي الأساسي = 6000 + 9000 = 15000، التأمينات = 750، الصافي = 14250
    expect(screen.getAllByText(new RegExp((15000).toLocaleString())).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp((14250).toLocaleString())).length).toBeGreaterThan(0);

    // أزرار الفوتر الإجرائية
    expect(screen.getByRole('button', { name: /إثبات قيد الاستحقاق/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /صرف نقدي مباشر/ })).toBeTruthy();

    // الفلترة بالبحث
    const searchInput = screen.getByPlaceholderText('بحث باسم الموظف...');
    fireEvent.change(searchInput, { target: { value: 'سارة' } });
    expect(screen.getByText('سارة علي')).toBeTruthy();
    expect(screen.queryByText('أحمد محمود')).toBeNull();

    // إعادة ضبط الفلاتر
    fireEvent.click(screen.getByText('إعادة ضبط الفلاتر'));
    expect(screen.getByText('أحمد محمود')).toBeTruthy();

    // التبديل إلى العرض المدمج
    fireEvent.click(screen.getByText('عرض مدمج (ملخص)'));
    expect(screen.getByText('إضافي ومكافآت (+)')).toBeTruthy();
    expect(screen.getByText('خصومات وجزاءات (-)')).toBeTruthy();
  });

  it('يطبق استيراد Excel وتطبيع الأسماء العربية وتحويل الأرقام بدقة', () => {
    expect(normalizeArabic('أحمد  إبراهيمُ')).toBe('احمد ابراهيم');
    expect(normalizeArabic('فاطمة مصطفى')).toBe('فاطمه مصطفي');
    expect(parseNumCell('6,500 ج.م')).toBe(6500);
    expect(parseNumCell('  ')).toBeNull();

    const baseItems: PayrollItem[] = [
      {
        employee_id: 'emp-1',
        full_name: 'أحمد إبراهيم',
        department: 'الإدارة',
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
        payroll_tax: 0,
        social_insurance: 300,
        net_salary: 5200,
        advances_ids: [],
      },
    ];

    const imported = applyImportedPayrollRows(
      [
        {
          'اسم الموظف': 'احمد ابراهيم',
          'حوافز ومكافآت (ج.م)': '1,000 ج.م',
          'خصم الغياب (ج.م)': 200,
        },
        {
          'اسم الموظف': 'الإجمالي (1 موظف)',
          'حوافز ومكافآت (ج.م)': 1000,
        },
        {
          'اسم الموظف': 'موظف غير موجود',
        },
      ],
      baseItems
    );

    expect(imported.updatedCount).toBe(1);
    expect(imported.unmatchedList).toEqual(['موظف غير موجود']);
    expect(imported.nextData[0].additions).toBe(1000);
    expect(imported.nextData[0].other_deductions).toBe(200);
    expect(imported.nextData[0].net_salary).toBe(
      calcPayrollNetSalary(6000, 1000, 500, 200, 0, 300)
    );
    expect(sumPayrollTotals(imported.nextData).net).toBe(6000);
  });
});
