import { describe, it, expect } from 'vitest';
import { secureStorage } from '../utils/securityMiddleware';
import { BALANCE_TOLERANCE, validateEntryBalance } from '../utils/financialSafety';
import { createJournalEntrySchema } from '../utils/validationSchemas';

describe('🛡️ Security & Tolerance Hardening Tests (التحقق من سد الثغرات)', () => {
  it('1. secureStorage يقوم بتشفير مفتاح الذكاء الاصطناعي في الذاكرة المحلية ولا يخزنه كنص صريح', () => {
    const rawKey = 'AIzaSyExampleSecretKey99887766';
    secureStorage.setItem('user_gemini_api_key', rawKey);

    // التحقق من أن القيمة المخزنة في localStorage مشفرة وتبدأ ببادئة التشفير
    const rawStored = window.localStorage.getItem('user_gemini_api_key');
    expect(rawStored).toBeDefined();
    expect(rawStored).not.toContain(rawKey); // لا يحتوي على المفتاح الصريح مطلقاً
    expect(rawStored).toContain('enc:v1:');

    // التحقق من فك التشفير التلقائي الشفاف عند القراءة
    const retrieved = secureStorage.getItem<string>('user_gemini_api_key');
    expect(retrieved).toBe(rawKey);

    // تنظيف
    secureStorage.removeItem('user_gemini_api_key');
    expect(secureStorage.getItem('user_gemini_api_key')).toBeNull();
  });

  it('2. secureStorage يدعم التوافق العكسي مع المفاتيح غير المشفرة القديمة', () => {
    // محاكاة مفتاح قديم تم تخزينه قبل التحديث بنص صريح
    window.localStorage.setItem('user_gemini_api_key', JSON.stringify('AIzaSyOldPlainKey'));
    
    const retrieved = secureStorage.getItem<string>('user_gemini_api_key');
    expect(retrieved).toBe('AIzaSyOldPlainKey');

    // تنظيف
    secureStorage.removeItem('user_gemini_api_key');
  });

  it('3. توحيد عتبة التسامح المحاسبية BALANCE_TOLERANCE عند 0.005 ج.م بدقة', () => {
    expect(BALANCE_TOLERANCE).toBe(0.005);

    // قيد بفارق 0.004 ج.م (أقل من نصف قرش) -> يعتبر متزناً
    const balancedEntry = validateEntryBalance({
      reference: 'JE-TOL-01',
      date: '2026-11-18',
      lines: [
        { accountId: '1', debit: 100.00, credit: 0 },
        { accountId: '2', debit: 0, credit: 100.004 }
      ]
    });
    expect(balancedEntry.isBalanced).toBe(true);

    // قيد بفارق 0.01 ج.م (قرش كامل) -> يعتبر غير متوازن
    const unbalancedEntry = validateEntryBalance({
      reference: 'JE-TOL-02',
      date: '2026-11-18',
      lines: [
        { accountId: '1', debit: 100.00, credit: 0 },
        { accountId: '2', debit: 0, credit: 100.01 }
      ]
    });
    expect(unbalancedEntry.isBalanced).toBe(false);
  });

  it('4. createJournalEntrySchema يرفض القيود غير المتوازنة بناءً على عتبة التسامح الموحدة', () => {
    const acc1 = 'a0000000-0000-4000-8000-000000000001';
    const acc2 = 'a0000000-0000-4000-8000-000000000002';

    const validEntryData = {
      reference: 'JE-ZOD-01',
      date: '2026-11-18',
      description: 'قيد رواتب تجريبي',
      lines: [
        { accountId: acc1, debit: 500, credit: 0, description: 'مدين' },
        { accountId: acc2, debit: 0, credit: 500, description: 'دائن' }
      ]
    };
    expect(createJournalEntrySchema.safeParse(validEntryData).success).toBe(true);

    const invalidEntryData = {
      reference: 'JE-ZOD-02',
      date: '2026-11-18',
      description: 'قيد غير متوازن تجريبي',
      lines: [
        { accountId: acc1, debit: 500, credit: 0, description: 'مدين' },
        { accountId: acc2, debit: 0, credit: 499.90, description: 'دائن' }
      ]
    };
    expect(createJournalEntrySchema.safeParse(invalidEntryData).success).toBe(false);
  });
});
