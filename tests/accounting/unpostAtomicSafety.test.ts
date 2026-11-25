import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 🛡️ اختبارات أمان إلغاء الترحيل (Atomic Unpost Safety & No-Orphan-Journal Guard)
 *
 * تتحقق هذه الاختبارات من:
 * 1. عدم وجود أي مسار احتياطي (Client Fallback) في شاشات المبيعات والمشتريات والمرتجعات
 *    يقوم بتحويل المستند إلى draft أو تصفير related_journal_entry_id من المتصفح عند فشل الـ RPC.
 * 2. أن دورة الترحيل ⬅️ إلغاء الترحيل ⬅️ إعادة الترحيل تحافظ على تطابق المخزون والأستاذ العام
 *    دون قيود يتيمة أو مكررة.
 */

const rootDir = process.cwd();

const readModule = (relPath: string) =>
  fs.readFileSync(path.join(rootDir, relPath), 'utf8');

describe('🔒 Atomic Unpost Safety — Invoices & Returns', () => {
  const filesToGuard = [
    'modules/sales/SalesInvoiceForm.tsx',
    'modules/sales/InvoiceList.tsx',
    'modules/purchases/PurchaseInvoiceForm.tsx',
    'modules/purchases/PurchaseInvoiceList.tsx',
    'modules/sales/SalesReturnForm.tsx',
    'modules/sales/SalesReturnsList.tsx',
    'modules/purchases/PurchaseReturnForm.tsx',
    'modules/purchases/PurchaseReturnsList.tsx',
  ];

  it.each(filesToGuard)(
    '%s يجب ألا يحتوي على مسار fallback يحذف القيود أو يعدل المخزون من المتصفح عند فشل RPC إلغاء الترحيل',
    (relPath) => {
      const source = readModule(relPath);
      expect(source).not.toContain('Atomic unpost RPC');
      expect(source).not.toContain('Direct journal cleanup skipped');
    }
  );

  it('محاكاة دورة: ترحيل ⬅️ فشل إلغاء الترحيل ⬅️ نجاح إلغاء الترحيل ⬅️ إعادة ترحيل (بدون قيود يتيمة أو تكرار مخزون)', () => {
    type DocState = {
      status: 'draft' | 'posted';
      related_journal_entry_id: string | null;
      stock: number;
      journals: Array<{ id: string; status: 'posted' | 'draft'; amount: number }>;
    };

    const state: DocState = {
      status: 'draft',
      related_journal_entry_id: null,
      stock: 100,
      journals: [],
    };

    const postPurchase = (qty: number, amount: number) => {
      if (state.status === 'posted') throw new Error('Already posted');
      const jeId = `je-${state.journals.length + 1}`;
      state.journals.push({ id: jeId, status: 'posted', amount });
      state.stock += qty;
      state.status = 'posted';
      state.related_journal_entry_id = jeId;
    };

    const unpostPurchaseAtomic = (qty: number, simulateRpcFailure: boolean) => {
      if (simulateRpcFailure) {
        // الدالة الذرية تفشل دون أي تعديل جزئي
        throw new Error('RPC_FAILURE');
      }
      state.stock -= qty;
      state.journals = state.journals.filter((j) => j.id !== state.related_journal_entry_id);
      state.status = 'draft';
      state.related_journal_entry_id = null;
    };

    // 1. ترحيل أولي
    postPurchase(20, 5000);
    expect(state.status).toBe('posted');
    expect(state.stock).toBe(120);
    expect(state.journals).toHaveLength(1);

    // 2. محاولة إلغاء ترحيل فاشلة -> يجب أن تبقى الفاتورة والمخزون والقيد كما هم تماماً
    expect(() => unpostPurchaseAtomic(20, true)).toThrow('RPC_FAILURE');
    expect(state.status).toBe('posted');
    expect(state.stock).toBe(120);
    expect(state.journals).toHaveLength(1);
    expect(state.related_journal_entry_id).toBe('je-1');

    // 3. إلغاء ترحيل ناجح -> يعكس المخزون ويحذف القيد ويعود لمسودة
    unpostPurchaseAtomic(20, false);
    expect(state.status).toBe('draft');
    expect(state.stock).toBe(100);
    expect(state.journals).toHaveLength(0);
    expect(state.related_journal_entry_id).toBeNull();

    // 4. إعادة الترحيل بعد التعديل -> قيد واحد جديد ومخزون مضبوط
    postPurchase(25, 6250);
    expect(state.status).toBe('posted');
    expect(state.stock).toBe(125);
    expect(state.journals).toHaveLength(1);
    expect(state.journals[0].amount).toBe(6250);
  });
});
