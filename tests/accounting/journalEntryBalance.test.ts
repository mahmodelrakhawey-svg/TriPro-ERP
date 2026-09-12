import { describe, it, expect } from 'vitest';

export interface JournalLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id?: string;
  reference?: string;
  date: string;
  lines: JournalLine[];
}

export function validateAndBalanceJournalEntry(entry: JournalEntry): {
  isValid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  errorMessage?: string;
} {
  if (!entry.lines || entry.lines.length < 2) {
    return {
      isValid: false,
      totalDebit: 0,
      totalCredit: 0,
      difference: 0,
      errorMessage: 'يجب أن يحتوي القيد المحاسبي على طرفين على الأقل (مدين ودائن).'
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of entry.lines) {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (debit < 0 || credit < 0) {
      return {
        isValid: false,
        totalDebit,
        totalCredit,
        difference: 0,
        errorMessage: 'لا يمكن أن تكون قيمة المدين أو الدائن سالبة.'
      };
    }

    if (debit > 0 && credit > 0) {
      return {
        isValid: false,
        totalDebit,
        totalCredit,
        difference: 0,
        errorMessage: 'لا يمكن أن يحتوي نفس السطر المحاسبي على مدين ودائن معاً.'
      };
    }

    totalDebit += debit;
    totalCredit += credit;
  }

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;
  const difference = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;

  if (difference > 0.001) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: `القيد غير متزن: مجموع المدين (${totalDebit}) لا يتساوى مع مجموع الدائن (${totalCredit})، بفارق (${difference}).`
    };
  }

  return {
    isValid: true,
    totalDebit,
    totalCredit,
    difference: 0
  };
}

describe('Double-Entry Bookkeeping & Journal Entry Balance Integrity', () => {
  it('يجب قبول قيد مبيعات متزن بصورة صحيحة (من ح/ العملاء إلى ح/ المبيعات وح/ الضريبة)', () => {
    const entry: JournalEntry = {
      date: '2026-09-12',
      reference: 'INV-1001',
      lines: [
        { accountId: 'acc-cust', accountCode: '1221', accountName: 'العملاء', debit: 1140, credit: 0 },
        { accountId: 'acc-rev', accountCode: '4101', accountName: 'إيراد المبيعات', debit: 0, credit: 1000 },
        { accountId: 'acc-vat', accountCode: '2205', accountName: 'ضريبة القيمة المضافة المستحقة', debit: 0, credit: 140 }
      ]
    };

    const validation = validateAndBalanceJournalEntry(entry);

    expect(validation.isValid).toBe(true);
    expect(validation.totalDebit).toBe(1140);
    expect(validation.totalCredit).toBe(1140);
    expect(validation.difference).toBe(0);
  });

  it('يجب رفض أي قيد غير متزن وإرجاع فارق التوازن صراحة', () => {
    const unbalancedEntry: JournalEntry = {
      date: '2026-09-12',
      reference: 'INV-FAULTY',
      lines: [
        { accountId: 'acc-cust', accountCode: '1221', accountName: 'العملاء', debit: 1140, credit: 0 },
        { accountId: 'acc-rev', accountCode: '4101', accountName: 'إيراد المبيعات', debit: 0, credit: 1000 }
        // missing VAT line
      ]
    };

    const validation = validateAndBalanceJournalEntry(unbalancedEntry);

    expect(validation.isValid).toBe(false);
    expect(validation.totalDebit).toBe(1140);
    expect(validation.totalCredit).toBe(1000);
    expect(validation.difference).toBe(140);
    expect(validation.errorMessage).toContain('القيد غير متزن');
  });

  it('يجب رفض القيد إذا كان يحتوي على قيم سالبة', () => {
    const invalidEntry: JournalEntry = {
      date: '2026-09-12',
      lines: [
        { accountId: '1', accountCode: '101', accountName: 'الصندوق', debit: -500, credit: 0 },
        { accountId: '2', accountCode: '201', accountName: 'المورد', debit: 0, credit: -500 }
      ]
    };

    const validation = validateAndBalanceJournalEntry(invalidEntry);
    expect(validation.isValid).toBe(false);
    expect(validation.errorMessage).toContain('سالبة');
  });

  it('يجب قبول قيد مشتريات مع تكلفة البضاعة والموردين', () => {
    const purchaseEntry: JournalEntry = {
      date: '2026-09-12',
      reference: 'PO-2005',
      lines: [
        { accountId: 'raw-mat', accountCode: '1301', accountName: 'مخزن الخامات الرئيسي', debit: 50000, credit: 0 },
        { accountId: 'vat-in', accountCode: '1205', accountName: 'ضريبة القيمة المضافة المدخلات', debit: 7000, credit: 0 },
        { accountId: 'supp', accountCode: '2101', accountName: 'شركة السكر للصناعات', debit: 0, credit: 57000 }
      ]
    };

    const validation = validateAndBalanceJournalEntry(purchaseEntry);
    expect(validation.isValid).toBe(true);
    expect(validation.totalDebit).toBe(57000);
    expect(validation.totalCredit).toBe(57000);
  });
});
