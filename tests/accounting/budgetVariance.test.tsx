import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BudgetVarianceReport from '../../modules/accounting/BudgetVarianceReport';

const mockGetAccountBalanceInPeriod = vi.fn();
const mockAnalyzeBudgetVariance = vi.fn();

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

const mockUseAccounting = vi.fn();

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => mockUseAccounting(),
}));

vi.mock('../../services/geminiService', () => ({
  analyzeBudgetVariance: (...args: any[]) => mockAnalyzeBudgetVariance(...args),
}));

describe('📊 BudgetVarianceReport Component & Variance Calculations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccountBalanceInPeriod.mockResolvedValue(8000);
    mockAnalyzeBudgetVariance.mockResolvedValue('توصية AI: ضبط مصروفات التشغيل.');
  });

  it('يعرض رسالة عدم وجود موازنة عندما لا توجد موازنة للشهر المحدد', () => {
    mockUseAccounting.mockReturnValue({
      budgets: [],
      getAccountBalanceInPeriod: mockGetAccountBalanceInPeriod,
      accounts: [],
      invoices: [],
      settings: {},
      selectedFiscalYear: currentYear,
    });

    render(<BudgetVarianceReport />);
    expect(screen.getByText('لا توجد موازنة معتمدة لهذا الشهر')).toBeTruthy();
  });

  it('يحسب الانحراف ونسبة الإنجاز بدقة لكل من بنود الحسابات والمندوبين والعملاء والأصناف مع استبعاد المسودات', async () => {
    const startOfMonthDate = new Date(currentYear, currentMonth - 1, 10)
      .toISOString()
      .split('T')[0];

    mockGetAccountBalanceInPeriod.mockResolvedValueOnce(11000); // تجاوز 110% (danger)

    mockUseAccounting.mockReturnValue({
      budgets: [
        {
          id: 'b-1',
          year: currentYear,
          month: currentMonth,
          items: [
            {
              type: 'account',
              targetId: 'acc-exp-1',
              targetName: 'مصروفات الكهرباء',
              plannedAmount: 10000,
            },
            {
              type: 'salesperson',
              targetId: 'sp-1',
              targetName: 'أحمد علي',
              plannedAmount: 10000,
            },
          ],
        },
      ],
      getAccountBalanceInPeriod: mockGetAccountBalanceInPeriod,
      accounts: [],
      invoices: [
        {
          id: 'inv-1',
          date: startOfMonthDate,
          status: 'posted',
          salespersonId: 'sp-1',
          totalAmount: 9000, // 90% -> warning
          items: [],
        },
        {
          id: 'inv-draft',
          date: startOfMonthDate,
          status: 'draft', // يجب استبعاده
          salespersonId: 'sp-1',
          totalAmount: 5000,
          items: [],
        },
      ],
      settings: {},
      selectedFiscalYear: currentYear,
    });

    render(<BudgetVarianceReport />);

    await waitFor(() => {
      expect(screen.getByText('مصروفات الكهرباء')).toBeTruthy();
      expect(screen.getByText('أحمد علي')).toBeTruthy();
    });

    // حساب الكهرباء: مخطط 10,000 وفعلي 11,000 -> نسبة 110% وتجاوز 1,000
    expect(screen.getByText('110%')).toBeTruthy();
    expect(screen.getByText('تجاوز الميزانية')).toBeTruthy();

    // المندوب: مخطط 10,000 وفعلي 9,000 (استبعاد المسودة) -> نسبة 90% ووفر 1,000
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText('الوفر المتبقي')).toBeTruthy();

    // اختبار استدعاء تحليل Gemini AI
    const aiBtn = screen.getByRole('button', { name: /طلب تحليل Gemini/ });
    fireEvent.click(aiBtn);

    await waitFor(() => {
      expect(mockAnalyzeBudgetVariance).toHaveBeenCalledTimes(1);
      expect(screen.getByText('توصية AI: ضبط مصروفات التشغيل.')).toBeTruthy();
    });
  });
});
