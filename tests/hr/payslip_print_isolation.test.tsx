import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PayslipModal, PayslipData, PayslipCard } from '../../modules/hr/components/PayslipModal';
import { BulkPayslipsModal } from '../../modules/hr/components/BulkPayslipsModal';

// Mock ToastContext
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

describe('HR Payslip Print Isolation Tests (عزل طباعة قسيمة الراتب ومنع التكرار)', () => {
  const originalPrint = window.print;
  let rootEl: HTMLDivElement | null = null;

  beforeEach(() => {
    window.print = vi.fn();
    // Ensure #root exists to simulate main app container
    rootEl = document.getElementById('root') as HTMLDivElement;
    if (!rootEl) {
      rootEl = document.createElement('div');
      rootEl.id = 'root';
      document.body.appendChild(rootEl);
    }
    rootEl.innerHTML = '<div class="payroll-table">33 employees background table</div>';
  });

  afterEach(() => {
    window.print = originalPrint;
    if (rootEl && rootEl.parentElement) {
      rootEl.innerHTML = '';
    }
  });

  const mockEmployeePayslip: PayslipData = {
    employee_name: 'أحمد محمود العوضي',
    job_title: 'مدير مبيعات',
    department: 'إدارة التسويق',
    month: 11,
    year: 2026,
    gross_salary: 15000,
    effective_days: 30,
    additions: 2000,
    advances_deducted: 1000,
    absence_days: 1,
    absence_deduction: 500,
    late_minutes: 60,
    late_deduction: 150,
    payroll_tax: 600,
    social_insurance: 1650,
    other_deductions: 0,
    net_salary: 13100,
    company_name: 'شركة تري برو القابضة'
  };

  it('يجب تركيب قسيمة الراتب الفردية عبر Portal مباشرة في document.body كعنصر مستقل عن #root', () => {
    const handleClose = vi.fn();
    render(<PayslipModal data={mockEmployeePayslip} onClose={handleClose} />);

    // يجب أن تكون الحاوية موجودة داخل body وخارج #root
    const portal = document.getElementById('payslip-modal-portal');
    expect(portal).toBeDefined();
    expect(portal?.parentElement).toBe(document.body);

    // كارت القسيمة موجود ومحدد الهوية
    const card = document.getElementById('printable-payslip-card');
    expect(card).toBeDefined();
    expect(card?.textContent).toContain('أحمد محمود العوضي');
    expect(card?.textContent).toContain('13,100 ج.م');
  });

  it('يجب أن يحتوي كود الطباعة في القسيمة على قاعدة إخفاء #root بالكامل لمنع توليد صفحات إضافية', () => {
    render(<PayslipModal data={mockEmployeePayslip} onClose={vi.fn()} />);

    const styleTags = document.querySelectorAll('style');
    const hasRootHideRule = Array.from(styleTags).some(tag =>
      tag.innerHTML.includes('#root') && tag.innerHTML.includes('display: none !important')
    );

    expect(hasRootHideRule).toBe(true);
  });

  it('يجب أن يستدعي زر طباعة القسيمة أمر الطباعة window.print بنجاح', () => {
    render(<PayslipModal data={mockEmployeePayslip} onClose={vi.fn()} />);

    const printButton = screen.getByRole('button', { name: /طباعة القسيمة/i });
    expect(printButton).toBeDefined();

    fireEvent.click(printButton);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('في وضع الطباعة المجمعة BulkPayslipsModal يجب طباعة كل موظف ببياناته المستقلة دون تكرار موظف واحد', () => {
    const employeesList = [
      {
        id: '1',
        full_name: 'أحمد محمود العوضي',
        department: 'المبيعات',
        gross_salary: 15000,
        additions: 2000,
        net_salary: 13100
      },
      {
        id: '2',
        full_name: 'سارة إبراهيم حسن',
        department: 'المحاسبة',
        gross_salary: 12000,
        additions: 1000,
        net_salary: 11200
      },
      {
        id: '3',
        full_name: 'محمود عبد العزيز',
        department: 'تقنية المعلومات',
        gross_salary: 20000,
        additions: 3000,
        net_salary: 19500
      }
    ];

    render(
      <BulkPayslipsModal
        list={employeesList}
        month={11}
        year={2026}
        companyName="شركة تري برو القابضة"
        onClose={vi.fn()}
      />
    );

    const wrappers = document.querySelectorAll('.bulk-payslip-page-wrapper');
    expect(wrappers.length).toBe(3);

    // التأكد من أن كل صفحة تحتوي على موظف مختلف وليس نفس الموظف مكرر
    expect(wrappers[0].textContent).toContain('أحمد محمود العوضي');
    expect(wrappers[0].textContent).toContain('13,100 ج.م');

    expect(wrappers[1].textContent).toContain('سارة إبراهيم حسن');
    expect(wrappers[1].textContent).toContain('11,200 ج.م');

    expect(wrappers[2].textContent).toContain('محمود عبد العزيز');
    expect(wrappers[2].textContent).toContain('19,500 ج.م');

    // فحص زر الطباعة
    const bulkPrintBtn = screen.getByRole('button', { name: /طباعة كافة القسائم \(3\)/i });
    fireEvent.click(bulkPrintBtn);
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
