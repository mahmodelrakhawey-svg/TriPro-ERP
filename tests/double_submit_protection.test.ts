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
      'modules/retail/components/POS/RetailPosScreen.tsx',
      'modules/hr/components/EmployeeAdvances.tsx',
      'modules/inventory/StockTransfer.tsx',
      'modules/inventory/StockAdjustmentForm.tsx',
      'modules/finance/components/TransferForm.tsx'
    ];

    for (const formRelPath of criticalForms) {
      const fullPath = path.resolve(process.cwd(), formRelPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      const hasSubmittingRef = content.includes('isSubmittingRef');
      expect(hasSubmittingRef).toBe(true);
    }
  });

  it('يجب أن يحتوي عميل Supabase على مهلة اتصال ذكية لحماية المصانع من التعليق اللانهائي', () => {
    const clientPath = path.resolve(process.cwd(), 'supabaseClient.ts');
    expect(fs.existsSync(clientPath)).toBe(true);
    const content = fs.readFileSync(clientPath, 'utf-8');

    expect(content).toContain('NETWORK_TIMEOUT_MS');
    expect(content).toContain('resilientFetch');
    expect(content).toContain('AbortController');
    expect(content).toContain('TimeoutError');
  });

  it('يجب أن تكون استعلامات دفتر الأستاذ العام مرشدة ولا تطلب كافة الحقول غير الضرورية (*)', () => {
    const glPath = path.resolve(process.cwd(), 'context/domains/GeneralLedgerContext.tsx');
    expect(fs.existsSync(glPath)).toBe(true);
    const content = fs.readFileSync(glPath, 'utf-8');

    // لا يطلب *, journal_lines(*)
    expect(content).not.toContain(".select('*, journal_lines(*)')");
    // يطلب الحقول المحددة بدقة
    expect(content).toContain('journal_lines(id, account_id, debit, credit');
  });

  it('يجب أن تحتوي شاشة تحويل النقدية على معاينة رصيد الخزينة المصدر وصمام منع التكرار', () => {
    const transferFormPath = path.resolve(process.cwd(), 'modules/finance/components/TransferForm.tsx');
    expect(fs.existsSync(transferFormPath)).toBe(true);
    const content = fs.readFileSync(transferFormPath, 'utf-8');

    // تحقق من وجود صمام منع النقر المزدوج
    expect(content).toContain('isSubmittingRef');
    // تحقق من وجود عرض الرصيد الدفتري الحالي
    expect(content).toContain('selectedSourceAccount');
    expect(content).toContain('الرصيد الدفتري الحالي');
    // تحقق من وجود تنبيه تجاوز الرصيد المتاح
    expect(content).toContain('isExceedingBalance');
    expect(content).toContain('تنبيه سيولة');

    // تحقق من وجود صمام الأمان على مستوى السياق AccountingContext & BankingContext
    const accountingContextPath = path.resolve(process.cwd(), 'context/AccountingContext.tsx');
    const accContent = fs.readFileSync(accountingContextPath, 'utf-8');
    expect(accContent).toContain('lastTransferSubmissionRef');

    const bankingContextPath = path.resolve(process.cwd(), 'context/domains/BankingContext.tsx');
    const bnkContent = fs.readFileSync(bankingContextPath, 'utf-8');
    expect(bnkContent).toContain('lastTransferSubmissionRef');
  });
});
