import { describe, it, expect } from 'vitest';
import { validateJournalEntry, JournalEntry } from '../types';

describe('📊 General Ledger - Journal Entry Double-Entry Validation', () => {
  it('يجب قبول القيد المتوازن تماماً (المدين = الدائن)', () => {
    const balancedEntry: JournalEntry = {
      id: 'entry-1',
      date: '2026-08-13',
      description: 'فاتورة بيع نقدية',
      status: 'posted',
      is_posted: true,
      created_at: new Date().toISOString(),
      lines: [
        { account_id: 'acc-cash', debit: 1500, credit: 0 },
        { account_id: 'acc-sales', debit: 0, credit: 1500 }
      ]
    };

    const result = validateJournalEntry(balancedEntry);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('يجب رفض القيد إذا كان يحتوي على سطر واحد فقط', () => {
    const singleLineEntry: JournalEntry = {
      id: 'entry-2',
      date: '2026-08-13',
      description: 'قيد ناقص سطر',
      status: 'draft',
      is_posted: false,
      created_at: new Date().toISOString(),
      lines: [
        { account_id: 'acc-cash', debit: 100, credit: 0 }
      ]
    };

    const result = validateJournalEntry(singleLineEntry);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('على طرفين على الأقل');
  });

  it('يجب رفض القيد غير المتوازن (المدين لا يساوي الدائن)', () => {
    const unbalancedEntry: JournalEntry = {
      id: 'entry-3',
      date: '2026-08-13',
      description: 'قيد غير متوازن خطأ إدخال',
      status: 'draft',
      is_posted: false,
      created_at: new Date().toISOString(),
      lines: [
        { account_id: 'acc-cash', debit: 1000, credit: 0 },
        { account_id: 'acc-sales', debit: 0, credit: 950 } // فرق 50 جنيه
      ]
    };

    const result = validateJournalEntry(unbalancedEntry);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('القيد غير متوازن');
  });

  it('يجب قبول القيود المتوازنة ضمن هامش الخطأ العشري الصغير للفواصل (Floating-Point Epsilon)', () => {
    const epsilonEntry: JournalEntry = {
      id: 'entry-4',
      date: '2026-08-13',
      description: 'قيد بكسور مقبولة',
      status: 'posted',
      is_posted: true,
      created_at: new Date().toISOString(),
      lines: [
        { account_id: 'acc-1', debit: 100.00001, credit: 0 },
        { account_id: 'acc-2', debit: 0, credit: 100.00002 } // فرق 0.00001
      ]
    };

    const result = validateJournalEntry(epsilonEntry);
    expect(result.isValid).toBe(true);
  });

  it('يجب رفض القيود ذات الفروق المحاسبية الملموسة خارج حدود هامش الخطأ الصغير', () => {
    const failedEpsilonEntry: JournalEntry = {
      id: 'entry-5',
      date: '2026-08-13',
      description: 'قيد بكسور مرفوضة ملموسة',
      status: 'draft',
      is_posted: false,
      created_at: new Date().toISOString(),
      lines: [
        { account_id: 'acc-1', debit: 100.05, credit: 0 },
        { account_id: 'acc-2', debit: 0, credit: 100.00 } // فرق 0.05 قرش
      ]
    };

    const result = validateJournalEntry(failedEpsilonEntry);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('القيد غير متوازن');
  });
});
