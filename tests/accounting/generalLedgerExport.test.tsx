import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import GeneralLedger from '../../modules/accounting/GeneralLedger';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabaseClient';

// Mock Supabase
vi.mock('../../supabaseClient', () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    supabase: {
      from: vi.fn(() => chainable),
      rpc: vi.fn().mockResolvedValue({ data: 1500, error: null }),
    },
  };
});

// Mock XLSX
vi.mock('xlsx', () => {
  const aoa_to_sheet = vi.fn().mockReturnValue({});
  const book_new = vi.fn().mockReturnValue({});
  const book_append_sheet = vi.fn();
  const writeFile = vi.fn();
  return {
    utils: {
      aoa_to_sheet,
      book_new,
      book_append_sheet,
    },
    writeFile,
  };
});

// Mock ToastContext
const mockShowToast = vi.fn();
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

// Mock AccountingContext
const mockAccounts = [
  { id: 'acc-1', code: '101', name: 'الخزينة الرئيسية', parent_id: null, is_group: false },
  { id: 'acc-2', code: '102', name: 'البنك الأهلي', parent_id: null, is_group: false },
];

const mockAccountingState = {
  accounts: mockAccounts,
  currentUser: { id: 'u1', name: 'محاسب', role: 'admin', organization_id: 'org-test-1' },
  currentSelectedOrgId: 'org-test-1',
  customers: [{ id: 'cust-1', name: 'شركة النور' }],
  selectedFiscalYear: 2026,
  fiscalYearRange: { startDate: '2026-01-01', endDate: '2026-12-31' },
  settings: { companyName: 'شركة النور والبركة' },
};

vi.mock('../../context/AccountingContext', () => ({
  useAccounting: () => mockAccountingState,
}));

// Mock ReportHeader
vi.mock('../../components/ReportHeader', () => ({
  default: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div data-testid="report-header">
      <h1>{title}</h1>
      <h2>{subtitle}</h2>
    </div>
  ),
}));

describe('GeneralLedger Component - Excel Export (تصدير دفتر الأستاذ إلى إكسيل)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يجب أن يعرض زر تصدير Excel ويكون معطلاً في البداية عند عدم اختيار حساب', () => {
    render(
      <BrowserRouter>
        <GeneralLedger />
      </BrowserRouter>
    );

    const exportButtons = screen.getAllByRole('button', { name: /تصدير Excel/i });
    expect(exportButtons.length).toBeGreaterThan(0);
    exportButtons.forEach(btn => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('يجب تفعيل زر التصدير بمجرد اختيار حساب، وتنفيذ تصدير Excel بنجاح بالبيانات المناسبة', async () => {
    // إرجاع قيود محاسبية للاختبار
    const mockLines = [
      {
        id: 'line-1',
        debit: 1000,
        credit: 0,
        journal_entries: {
          id: 'je-1',
          transaction_date: '2026-03-15T00:00:00Z',
          reference: 'INV-2026-001',
          description: 'فاتورة مبيعات نقدية',
          status: 'posted',
        },
      },
      {
        id: 'line-2',
        debit: 0,
        credit: 400,
        journal_entries: {
          id: 'je-2',
          transaction_date: '2026-03-20T00:00:00Z',
          reference: 'PV-2026-001',
          description: 'سداد مصروفات نثرية',
          status: 'posted',
        },
      },
    ];

    const chainable = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: mockLines, error: null }),
    };

    (supabase.from as any).mockImplementation(() => chainable);
    (supabase.rpc as any).mockResolvedValue({ data: 2500, error: null });

    render(
      <BrowserRouter>
        <GeneralLedger />
      </BrowserRouter>
    );

    // اختيار الحساب الأول من القوائم المنسدلة
    const selects = screen.getAllByRole('combobox');
    const accountSelect = selects[0];
    fireEvent.change(accountSelect, { target: { value: 'acc-1' } });

    // يجب تفعيل زر التصدير
    const exportButtons = screen.getAllByRole('button', { name: /تصدير Excel/i });
    expect((exportButtons[0] as HTMLButtonElement).disabled).toBe(false);

    // النقر على زر التصدير
    fireEvent.click(exportButtons[0]);

    await waitFor(() => {
      expect(XLSX.utils.book_new).toHaveBeenCalled();
      expect(XLSX.utils.aoa_to_sheet).toHaveBeenCalled();
      expect(XLSX.utils.book_append_sheet).toHaveBeenCalled();
      expect(XLSX.writeFile).toHaveBeenCalled();
    });

    // التحقق من محتوى أسطر Excel المرسلة لـ aoa_to_sheet
    const sheetData = (XLSX.utils.aoa_to_sheet as any).mock.calls[0][0];
    expect(sheetData).toBeDefined();

    // السطور العلوية تشمل اسم التقرير والحساب والفترة
    expect(sheetData[0][0]).toContain('دفتر الأستاذ العام');
    expect(sheetData[1][1]).toContain('101 - الخزينة الرئيسية');

    // التحقق من اسم الملف المصدر
    const exportedFileName = (XLSX.writeFile as any).mock.calls[0][1];
    expect(exportedFileName).toContain('General_Ledger_101_الخزينة الرئيسية');
    expect(exportedFileName).toContain('.xlsx');

    // التحقق من رسالة التنبيه بالنجاح
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('تم تصدير كشف الحساب إلى Excel بنجاح'),
      'success'
    );
  });
});
