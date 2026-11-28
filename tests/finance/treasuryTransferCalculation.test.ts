import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { TEST_CASH_ACC_ID, TEST_BANK_ACC_ID } from '../helpers/factories';

const treasuryTransferSchema = z
  .object({
    sourceAccountId: z.string().min(1, 'الرجاء اختيار الحساب المصدر'),
    destinationAccountId: z.string().min(1, 'الرجاء اختيار الحساب المستلم'),
    amount: z.number().min(0.01, 'المبلغ يجب أن يكون أكبر من 0'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة'),
  })
  .refine((d) => d.sourceAccountId !== d.destinationAccountId, {
    message: 'لا يمكن التحويل لنفس الحساب',
    path: ['destinationAccountId'],
  });

function buildTreasuryTransferJournalLines(
  fromAccountId: string,
  toAccountId: string,
  amount: number
) {
  return [
    { account_id: toAccountId, debit: amount, credit: 0 },
    { account_id: fromAccountId, debit: 0, credit: amount },
  ];
}

describe('💰 Treasury Transfer Validation, Double-Entry & SQL Contract Guards', () => {
  it('يقبل تحويل صحيح بين خزينتين مختلفتين بمبلغ موجب وينتج قيداً متوازناً', () => {
    const parsed = treasuryTransferSchema.safeParse({
      sourceAccountId: TEST_CASH_ACC_ID,
      destinationAccountId: TEST_BANK_ACC_ID,
      amount: 5000,
      date: '2026-11-28',
    });

    expect(parsed.success).toBe(true);

    const lines = buildTreasuryTransferJournalLines(TEST_CASH_ACC_ID, TEST_BANK_ACC_ID, 5000);
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(5000);
    expect(totalCredit).toBe(5000);
    expect(totalDebit).toBe(totalCredit);
  });

  it('يرفض التحويل لنفس الحساب أو بمبلغ صفر أو سالب', () => {
    const sameAccount = treasuryTransferSchema.safeParse({
      sourceAccountId: TEST_CASH_ACC_ID,
      destinationAccountId: TEST_CASH_ACC_ID,
      amount: 1000,
      date: '2026-11-28',
    });
    expect(sameAccount.success).toBe(false);

    const zeroAmount = treasuryTransferSchema.safeParse({
      sourceAccountId: TEST_CASH_ACC_ID,
      destinationAccountId: TEST_BANK_ACC_ID,
      amount: 0,
      date: '2026-11-28',
    });
    expect(zeroAmount.success).toBe(false);

    const negativeAmount = treasuryTransferSchema.safeParse({
      sourceAccountId: TEST_CASH_ACC_ID,
      destinationAccountId: TEST_BANK_ACC_ID,
      amount: -250,
      date: '2026-11-28',
    });
    expect(negativeAmount.success).toBe(false);
  });

  it('حارس عقد SQL: migration 2026-11-28 يسمح بالاستدعاء الداخلي لـ recalculate_all_system_balances دون كسر validate_tenant_access', () => {
    const sqlPath = path.resolve(
      __dirname,
      '../../services/migrations/2026-11-28_fix_treasury_transfer_recalc_role_guard.sql'
    );
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // يجب الحفاظ على التدرج draft -> lines -> posted لتفادي إطلاق Trigger التوازن مبكراً
    expect(sql).toContain("'draft'");
    expect(sql).toContain("SET status    = 'posted'");

    // يجب تمرير علم الجلسة المحلي قبل recalculate_all_system_balances وإعادة ضبطه بعده
    expect(sql).toContain("set_config('app.internal_balance_recalc', 'true', true)");
    expect(sql).toContain("set_config('app.internal_balance_recalc', 'false', true)");

    // يجب استمرار التحقق من عزل المستأجر وسحب صلاحيات anon
    expect(sql).toContain('public.validate_tenant_access(p_org_id)');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.add_treasury_transfer');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.recalculate_all_system_balances');
  });
});
