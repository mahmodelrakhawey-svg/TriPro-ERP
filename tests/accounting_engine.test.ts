import { describe, it, expect, vi } from 'vitest';
import { accountingEngine } from '../services/accountingEngine';
import { tafqeet } from '../utils/tafqeet';
import { formatNumber, formatPercentage, formatOptionalNumber } from '../utils/formatters';

// Mock Supabase client to test engine validation and business rules without requiring live DB connection
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'mock-je-id', reference: 'JE-TEST-001' }, error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis()
    }))
  }
}));

describe('🏛️ Central Accounting Engine - Double-Entry Ledger Validation', () => {
  const orgId = '00000000-0000-0000-0000-000000000001';

  it('يجب رفض القيد إذا لم يتم تحديد معرف المنظمة (Multi-Tenant Isolation)', async () => {
    const result = await accountingEngine.createJournalEntry({
      organizationId: '',
      description: 'قيد تجريبي بدون منظمة',
      lines: [
        { accountId: 'acc-1', debit: 500, credit: 0 },
        { accountId: 'acc-2', debit: 0, credit: 500 }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('معرف المنظمة');
  });

  it('يجب رفض القيد إذا كان يحتوي على أقل من طرفين محاسبيين', async () => {
    const result = await accountingEngine.createJournalEntry({
      organizationId: orgId,
      description: 'قيد بطرف واحد فقط',
      lines: [
        { accountId: 'acc-1', debit: 1000, credit: 0 }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('طرفين محاسبيين على الأقل');
  });

  it('يجب رفض القيد إذا وجد سطر بدون حساب مالي محدد', async () => {
    const result = await accountingEngine.createJournalEntry({
      organizationId: orgId,
      description: 'قيد بحساب مفقود',
      lines: [
        { accountId: 'acc-1', debit: 500, credit: 0 },
        { accountId: '', debit: 0, credit: 500 }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('بدون تحديد الحساب المالي');
  });

  it('يجب رفض القيد عند إدخال مبالغ سالبة في المدين أو الدائن', async () => {
    const result = await accountingEngine.createJournalEntry({
      organizationId: orgId,
      description: 'قيد بقيم سالبة',
      lines: [
        { accountId: 'acc-1', debit: -100, credit: 0 },
        { accountId: 'acc-2', debit: 0, credit: -100 }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('لا يمكن إدخال مبالغ سالبة');
  });

  it('يجب رفض القيد غير المتوازن محاسبياً (المدين لا يساوي الدائن)', async () => {
    const result = await accountingEngine.createJournalEntry({
      organizationId: orgId,
      description: 'قيد غير متوازن',
      lines: [
        { accountId: 'acc-cash', debit: 1500, credit: 0 },
        { accountId: 'acc-rev', debit: 0, credit: 1400 } // فرق 100 جنيه
      ]
    });

    expect(result.success).toBe(false);
    expect(result.totalDebit).toBe(1500);
    expect(result.totalCredit).toBe(1400);
    expect(result.error).toContain('غير متوازن محاسبياً');
  });

  it('يجب قبول القيد المتوازن بدقة تامة', async () => {
    const result = await accountingEngine.createJournalEntry({
      organizationId: orgId,
      description: 'قيد مبيعات متوازن',
      lines: [
        { accountId: 'acc-cash', debit: 1140, credit: 0 },
        { accountId: 'acc-sales', debit: 0, credit: 1000 },
        { accountId: 'acc-vat', debit: 0, credit: 140 }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.totalDebit).toBe(1140);
    expect(result.totalCredit).toBe(1140);
    expect(result.error).toBeUndefined();
  });
});

describe('🔤 Tafqeet (Arabic Words Conversion) Tests', () => {
  it('يجب تحويل الصفر بشكل صحيح', () => {
    expect(tafqeet(0)).toBe('صفر');
  });

  it('يجب تفقيط مبالغ الجنيه المصري مع كسر القرش', () => {
    const result = tafqeet(1500.50, 'EGP');
    expect(result).toContain('ألف');
    expect(result).toContain('خمسمائة');
    expect(result).toContain('جنيه');
    expect(result).toContain('خمسون');
    expect(result).toContain('قرش');
    expect(result).toContain('فقط لا غير');
  });

  it('يجب تفقيط مبالغ الريال السعودي مع الهللات', () => {
    const result = tafqeet(250.75, 'SAR');
    expect(result).toContain('مائتان');
    expect(result).toContain('خمسون');
    expect(result).toContain('ريال');
    expect(result).toContain('هللة');
    expect(result).toContain('فقط لا غير');
  });

  it('يجب تفقيط مبالغ الدولار الأمريكي مع السنت', () => {
    const result = tafqeet(100.25, 'USD');
    expect(result).toContain('مائة');
    expect(result).toContain('دولار');
    expect(result).toContain('سنت');
    expect(result).toContain('فقط لا غير');
  });
});

describe('🔢 Formatting Utilities Tests', () => {
  it('يجب التعامل مع القيم الفارغة والـ null بأمان دون التسبب في خطأ runtime', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
    expect(formatPercentage(null)).toBe('0%');
    expect(formatPercentage(undefined)).toBe('0%');
  });

  it('يجب تنسيق الأرقام الاختيارية (Optional) بشرطة عند الصفر أو الفراغ', () => {
    expect(formatOptionalNumber(null)).toBe('-');
    expect(formatOptionalNumber(undefined)).toBe('-');
    expect(formatOptionalNumber(0)).toBe('-');
    expect(formatOptionalNumber(1500)).not.toBe('-');
  });
});
