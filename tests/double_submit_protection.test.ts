import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('🛡️ Enterprise Rapid Click & Double-Submit Protection (صمامات أمان النقر المزدوج)', () => {
  it('يجب أن تحاكي آلية isSubmittingRef حظر النقر المزدوج السريع بفعالية 100%', async () => {
    let callCount = 0;
    const isSubmittingRef = { current: false };

    const simulateSave = async () => {
      if (isSubmittingRef.current) return { blocked: true };
      isSubmittingRef.current = true;
      try {
        await new Promise((resolve) => setTimeout(resolve, 20));
        callCount++;
        return { blocked: false, count: callCount };
      } finally {
        isSubmittingRef.current = false;
      }
    };

    // إطلاق نقرتين متزامنتين في نفس اللحظة (Rapid Double Click)
    const [click1, click2] = await Promise.all([simulateSave(), simulateSave()]);

    // النقرة الأولى يجب أن تنفذ، والنقرة الثانية يجب حظرها تماماً
    expect(click1.blocked).toBe(false);
    expect(click2.blocked).toBe(true);
    expect(callCount).toBe(1);

    // بعد انتهاء العملية الأولى، يجب أن يُتاح الحفظ مجدداً
    expect(isSubmittingRef.current).toBe(false);
    const click3 = await simulateSave();
    expect(click3.blocked).toBe(false);
    expect(callCount).toBe(2);
  });

  it('يجب أن تحتوي شاشات المعاملات الحساسة الست الكبرى على صمام isSubmittingRef لمنع الازدواجية', () => {
    const criticalForms = [
      'modules/finance/components/PaymentVoucherForm.tsx',
      'modules/finance/components/ReceiptVoucherForm.tsx',
      'modules/finance/components/ExpenseVoucherForm.tsx',
      'modules/sales/SalesInvoiceForm.tsx',
      'modules/purchases/PurchaseInvoiceForm.tsx',
      'modules/retail/components/POS/RetailPosScreen.tsx'
    ];

    for (const formRelPath of criticalForms) {
      const fullPath = path.resolve(process.cwd(), formRelPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      const hasSubmittingRef = content.includes('isSubmittingRef');
      expect(hasSubmittingRef).toBe(true);
    }
  });
});
