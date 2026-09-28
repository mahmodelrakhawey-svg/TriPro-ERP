import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BankReconciliationForm from './BankReconciliationForm';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';

vi.mock('../../../context/AccountingContext', () => ({
  useAccounting: vi.fn(),
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: vi.fn(),
}));

vi.mock('../../../supabaseClient', () => {
  const mockFrom = vi.fn().mockImplementation((table: string) => {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'rec-1',
            account_id: 'acc-bank-1',
            statement_date: '2026-08-31',
            statement_balance: 100000,
            book_balance: 100000,
            reconciled_ids: ['line-1', 'line-2'],
            status: 'reconciled',
            notes: 'تسوية شهر أغسطس 2026',
          }
        ],
        error: null,
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });

  return {
    supabase: {
      from: mockFrom,
    },
  };
});

describe('🏦 BankReconciliationForm (Bank Reconciliation & Statement Matching) Tests', () => {
  const mockShowToast = vi.fn();
  const mockRefreshData = vi.fn();
  const mockAddEntry = vi.fn();

  const mockAccounts = [
    {
      id: 'acc-bank-1',
      code: '123201',
      name: 'البنك الأهلي المصري - جاري',
      type: 'ASSET',
      balance: 150000,
    },
    {
      id: 'acc-cash-1',
      code: '123101',
      name: 'الخزينة الرئيسية',
      type: 'ASSET',
      balance: 20000,
    },
  ];

  const mockEntries = [
    {
      id: 'je-1',
      reference: 'INV-REC-001',
      status: 'posted',
      transaction_date: '2026-09-15',
      lines: [
        {
          id: 'line-1',
          accountId: 'acc-bank-1',
          debit: 50000,
          credit: 0,
          description: 'تحصيل فاتورة مبيعات',
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useAccounting as any).mockReturnValue({
      accounts: mockAccounts,
      entries: mockEntries,
      refreshData: mockRefreshData,
      addEntry: mockAddEntry,
    });
    (useToast as any).mockReturnValue({
      showToast: mockShowToast,
    });
  });

  it('يعرض شاشة التسوية البنكية مع عناصر التحكم واختيار الحساب البنكي', async () => {
    render(<BankReconciliationForm />);

    expect(screen.getByText(/تسوية بنكية/i)).toBeDefined();
    expect(screen.getByText(/مطابقة رصيد البنك في النظام مع كشف الحساب البنكي/i)).toBeDefined();
    expect(screen.getByText(/تسوية جديدة/i)).toBeDefined();
    expect(screen.getByText(/سجل التسويات/i)).toBeDefined();
    expect(screen.getByText(/اختر الحساب البنكي/i)).toBeDefined();
    expect(screen.getByText(/تاريخ كشف الحساب/i)).toBeDefined();
    expect(screen.getByText(/رصيد الكشف \(النهائي\)/i)).toBeDefined();
  });

  it('يتيح التبديل بين نموذج التسوية الجديد وسجل التسويات التاريخية', async () => {
    render(<BankReconciliationForm />);

    const historyBtn = screen.getByRole('button', { name: /سجل التسويات/i });
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(screen.getByText('تاريخ الكشف')).toBeDefined();
      expect(screen.getByText('رصيد البداية')).toBeDefined();
    });

    const newBtn = screen.getByRole('button', { name: /تسوية جديدة/i });
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.getByText(/اختر الحساب البنكي/i)).toBeDefined();
    });
  });
});
