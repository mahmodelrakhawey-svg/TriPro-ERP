import { describe, it, expect } from 'vitest';

/**
 * محاكاة قواعد التحقق من توازن القيود المحاسبية وقفل الفترات المالية (Database-Level Logic Simulation)
 * تحاكي نفس الشروط المطبقة في دوال PostgreSQL Triggers:
 * - fn_guard_journal_entry_balance
 * - fn_guard_journal_lines_balance
 * - fn_prevent_entries_in_locked_periods
 */

interface JournalLinePayload {
  account_id: string;
  debit: number;
  credit: number;
  description?: string;
}

interface AccountingPeriodRecord {
  period_name: string;
  fiscal_year: number;
  period_number: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'locked' | 'closed';
}

/**
 * محاكاة فحص توازن القيد المحاسبي
 */
function simulateBalanceGuard(
  entryStatus: 'draft' | 'posted',
  lines: JournalLinePayload[],
  reference: string = 'JE-TEST'
): { allowed: boolean; error?: string } {
  // إذا كان القيد مسودة، يسمح بالعمليات الأولية
  if (entryStatus !== 'posted') {
    return { allowed: true };
  }

  // عند الترحيل (posted):
  if (!lines || lines.length < 2) {
    return {
      allowed: false,
      error: `⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (${reference}) لأنه يتطلب طرفين محاسبيين على الأقل (مدين ودائن).`
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    totalDebit += Number(line.debit || 0);
    totalCredit += Number(line.credit || 0);
  }

  totalDebit = Math.round(totalDebit * 10000) / 10000;
  totalCredit = Math.round(totalCredit * 10000) / 10000;
  const diff = Math.abs(totalDebit - totalCredit);

  if (diff > 0.005) {
    return {
      allowed: false,
      error: `⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (${reference}) لعدم توازن المدين مع الدائن! (إجمالي المدين: ${totalDebit}, إجمالي الدائن: ${totalCredit}, الفرق: ${diff}).`
    };
  }

  if (totalDebit <= 0) {
    return {
      allowed: false,
      error: `⚠️ صمام أمان توازن القيود: لا يمكن ترحيل القيد (${reference}) بمبالغ صفرية أو سالبة.`
    };
  }

  return { allowed: true };
}

/**
 * محاكاة فحص قفل الفترات المحاسبية
 */
function simulatePeriodLockCheck(
  transactionDate: string,
  reference: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  periods: AccountingPeriodRecord[],
  oldDate?: string
): { allowed: boolean; error?: string } {
  // استثناء قيود الإقفال السنوي CLOSE-
  if (reference.startsWith('CLOSE-')) {
    return { allowed: true };
  }

  // فحص تاريخ الحركة المستهدف
  const checkDate = operation === 'DELETE' ? (oldDate || transactionDate) : transactionDate;
  const lockedPeriod = periods.find(
    p => checkDate >= p.start_date && checkDate <= p.end_date && (p.status === 'locked' || p.status === 'closed')
  );

  if (lockedPeriod) {
    if (operation === 'DELETE') {
      return {
        allowed: false,
        error: `⚠️ فترة مالية مقفلة: لا يمكن حذف القيد المحاسبي المؤرخ في (${checkDate}). الفترة المحاسبية (${lockedPeriod.period_name}) مقفلة/مجمدة من الإدارة المالية.`
      };
    }
    return {
      allowed: false,
      error: `⚠️ فترة مالية مقفلة: لا يمكن حفظ أو ترحيل قيود بتاريخ (${checkDate}). الفترة المحاسبية (${lockedPeriod.period_name}) مقفلة/مجمدة من الإدارة المالية.`
    };
  }

  // في حالة UPDATE: التحقق من التاريخ القديم
  if (operation === 'UPDATE' && oldDate && oldDate !== transactionDate) {
    const oldLockedPeriod = periods.find(
      p => oldDate >= p.start_date && oldDate <= p.end_date && (p.status === 'locked' || p.status === 'closed')
    );
    if (oldLockedPeriod) {
      return {
        allowed: false,
        error: `⚠️ فترة مالية مقفلة: لا يمكن نقل تاريخ هذا القيد لأن تاريخه الأصلي (${oldDate}) يقع ضمن الفترة المقفلة (${oldLockedPeriod.period_name}).`
      };
    }
  }

  return { allowed: true };
}

describe('🛡️ Database-Level Balance Guard & Fiscal Period Lock Tests', () => {
  const samplePeriods: AccountingPeriodRecord[] = [
    { period_name: 'يناير (شهر 1) 2026', fiscal_year: 2026, period_number: 1, start_date: '2026-01-01', end_date: '2026-01-31', status: 'closed' },
    { period_name: 'فبراير (شهر 2) 2026', fiscal_year: 2026, period_number: 2, start_date: '2026-02-01', end_date: '2026-02-28', status: 'locked' },
    { period_name: 'مارس (شهر 3) 2026', fiscal_year: 2026, period_number: 3, start_date: '2026-03-01', end_date: '2026-03-31', status: 'open' }
  ];

  describe('Part 1: صمام أمان توازن القيود (Balance Guard)', () => {
    it('يقبل القيد المرحل المتوازن تماماً (طرفين)', () => {
      const result = simulateBalanceGuard('posted', [
        { account_id: 'acc-1', debit: 5000, credit: 0 },
        { account_id: 'acc-2', debit: 0, credit: 5000 }
      ], 'JE-001');

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('يقبل القيد المرحل المركب المتوازن (عدة أطراف)', () => {
      const result = simulateBalanceGuard('posted', [
        { account_id: 'cust-1', debit: 1140, credit: 0 },
        { account_id: 'sales-1', debit: 0, credit: 1000 },
        { account_id: 'vat-1', debit: 0, credit: 140 }
      ], 'INV-100');

      expect(result.allowed).toBe(true);
    });

    it('يمنع ترحيل القيد إذا كان المدين لا يساوي الدائن', () => {
      const result = simulateBalanceGuard('posted', [
        { account_id: 'cust-1', debit: 1140, credit: 0 },
        { account_id: 'sales-1', debit: 0, credit: 1000 } // ناقص 140
      ], 'INV-UNBALANCED');

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('لعدم توازن المدين مع الدائن');
      expect(result.error).toContain('الفرق: 140');
    });

    it('يمنع ترحيل قيد يحتوي على سطر واحد فقط', () => {
      const result = simulateBalanceGuard('posted', [
        { account_id: 'cust-1', debit: 1000, credit: 0 }
      ], 'SINGLE-LINE');

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('يتطلب طرفين محاسبيين على الأقل');
    });

    it('يمنع ترحيل قيد بمبالغ صفرية', () => {
      const result = simulateBalanceGuard('posted', [
        { account_id: 'acc-1', debit: 0, credit: 0 },
        { account_id: 'acc-2', debit: 0, credit: 0 }
      ], 'ZERO-ENTRY');

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('بمبالغ صفرية أو سالبة');
    });

    it('يسمح بحفظ القيد غير المكتمل إذا كانت حالته مسودة (draft)', () => {
      const result = simulateBalanceGuard('draft', [
        { account_id: 'acc-1', debit: 500, credit: 0 }
      ], 'DRAFT-01');

      expect(result.allowed).toBe(true);
    });
  });

  describe('Part 2: قفل الفترات المحاسبية (Fiscal Period Lock)', () => {
    it('يسمح بإنشاء قيد في فترة مالية مفتوحة (شهر مارس 2026)', () => {
      const result = simulatePeriodLockCheck('2026-03-15', 'JE-MARCH', 'INSERT', samplePeriods);
      expect(result.allowed).toBe(true);
    });

    it('يمنع إنشاء قيد في فترة مقفلة (شهر فبراير 2026)', () => {
      const result = simulatePeriodLockCheck('2026-02-15', 'JE-FEB', 'INSERT', samplePeriods);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('فترة مالية مقفلة');
      expect(result.error).toContain('فبراير (شهر 2) 2026');
    });

    it('يمنع إنشاء قيد في فترة مغلقة نهائياً (شهر يناير 2026)', () => {
      const result = simulatePeriodLockCheck('2026-01-10', 'JE-JAN', 'INSERT', samplePeriods);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('يناير (شهر 1) 2026');
    });

    it('يمنع حذف قيد مؤرخ في فترة مقفلة', () => {
      const result = simulatePeriodLockCheck('2026-02-20', 'JE-OLD', 'DELETE', samplePeriods, '2026-02-20');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('لا يمكن حذف القيد المحاسبي');
      expect(result.error).toContain('فبراير (شهر 2) 2026');
    });

    it('يمنع نقل تاريخ قيد من فترة مقفلة إلى فترة مفتوحة', () => {
      const result = simulatePeriodLockCheck('2026-03-15', 'JE-MOVE', 'UPDATE', samplePeriods, '2026-02-10');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('لا يمكن نقل تاريخ هذا القيد');
    });

    it('يستثني قيود الإقفال السنوي CLOSE- حتى لو كان التاريخ في فترة مغلقة', () => {
      const result = simulatePeriodLockCheck('2026-01-31', 'CLOSE-2025', 'INSERT', samplePeriods);
      expect(result.allowed).toBe(true);
    });
  });
});
