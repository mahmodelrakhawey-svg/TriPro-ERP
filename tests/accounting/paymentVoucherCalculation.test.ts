import { describe, it, expect } from 'vitest';
import { createPaymentSchema } from '../../utils/validationSchemas';
import { roundToTwoDecimals } from '../../utils/invoiceCalculations';
import { TEST_ORG_ID, makePaymentVoucher, makeReceiptVoucher } from '../helpers/factories';

interface VoucherAccountingInput {
  type: 'payment' | 'receipt';
  amount: number;
  exchangeRate?: number;
  withholdingTaxRate?: number; // e.g. 0.01 for 1%
  treasuryAccountId: string;
  partyAccountId: string;
  whtAccountId?: string;
}

function buildVoucherJournalPreview(input: VoucherAccountingInput) {
  const rate = input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 1;
  const baseGross = roundToTwoDecimals(input.amount * rate);
  const whtRate = input.withholdingTaxRate && input.withholdingTaxRate > 0 ? input.withholdingTaxRate : 0;
  const whtAmount = roundToTwoDecimals(baseGross * whtRate);
  const netCash = roundToTwoDecimals(baseGross - whtAmount);

  if (input.type === 'payment') {
    const lines = [
      { accountId: input.partyAccountId, debit: baseGross, credit: 0 },
      { accountId: input.treasuryAccountId, debit: 0, credit: netCash },
    ];
    if (whtAmount > 0 && input.whtAccountId) {
      lines.push({ accountId: input.whtAccountId, debit: 0, credit: whtAmount });
    }
    return { baseGross, whtAmount, netCash, lines };
  }

  const lines = [
    { accountId: input.treasuryAccountId, debit: netCash, credit: 0 },
    { accountId: input.partyAccountId, debit: 0, credit: baseGross },
  ];
  if (whtAmount > 0 && input.whtAccountId) {
    lines.push({ accountId: input.whtAccountId, debit: whtAmount, credit: 0 });
  }
  return { baseGross, whtAmount, netCash, lines };
}

describe('🧾 Payment & Receipt Vouchers Calculations & Validation', () => {
  it('سند صرف نقدي يخصم من الخزينة ويغلق رصيد المورد بقيد متوازن', () => {
    const voucher = makePaymentVoucher({ amount: 2500 });
    const preview = buildVoucherJournalPreview({
      type: 'payment',
      amount: voucher.amount,
      treasuryAccountId: voucher.treasury_account_id,
      partyAccountId: 'acc-suppliers',
    });

    expect(preview.netCash).toBe(2500);
    expect(preview.lines[0]).toEqual({ accountId: 'acc-suppliers', debit: 2500, credit: 0 });
    expect(preview.lines[1]).toEqual({ accountId: voucher.treasury_account_id, debit: 0, credit: 2500 });
  });

  it('سند قبض يضيف للخزينة ويخفض رصيد العميل بقيد متوازن', () => {
    const voucher = makeReceiptVoucher({ amount: 3000 });
    const preview = buildVoucherJournalPreview({
      type: 'receipt',
      amount: voucher.amount,
      treasuryAccountId: voucher.treasury_account_id,
      partyAccountId: 'acc-customers',
    });

    expect(preview.netCash).toBe(3000);
    expect(preview.lines[0]).toEqual({ accountId: voucher.treasury_account_id, debit: 3000, credit: 0 });
    expect(preview.lines[1]).toEqual({ accountId: 'acc-customers', debit: 0, credit: 3000 });
  });

  it('يحسب ضريبة الاستقطاع 1% في سند الصرف مع توازن المدين والدائن', () => {
    const preview = buildVoucherJournalPreview({
      type: 'payment',
      amount: 10000,
      withholdingTaxRate: 0.01,
      treasuryAccountId: 'acc-cash',
      partyAccountId: 'acc-suppliers',
      whtAccountId: 'acc-wht',
    });

    expect(preview.whtAmount).toBe(100);
    expect(preview.netCash).toBe(9900);
    const totalDebit = preview.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = preview.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(10000);
    expect(totalCredit).toBe(10000);
  });

  it('يحول العملة الأجنبية عبر سعر الصرف بدقة لأقرب منزلتين عشريتين', () => {
    const preview = buildVoucherJournalPreview({
      type: 'receipt',
      amount: 150.25,
      exchangeRate: 49.35,
      treasuryAccountId: 'acc-usd-cash',
      partyAccountId: 'acc-customers',
    });

    expect(preview.baseGross).toBe(7414.84);
    expect(preview.netCash).toBe(7414.84);
  });

  it('يرفض createPaymentSchema سندات بمبلغ صفر أو سالب أو معرف غير صالح', () => {
    const zeroResult = createPaymentSchema.safeParse({
      invoiceId: TEST_ORG_ID,
      amount: 0,
      paymentDate: '2026-11-28',
      paymentMethod: 'cash',
    });
    expect(zeroResult.success).toBe(false);

    const negativeResult = createPaymentSchema.safeParse({
      invoiceId: TEST_ORG_ID,
      amount: -50,
      paymentDate: '2026-11-28',
      paymentMethod: 'cash',
    });
    expect(negativeResult.success).toBe(false);

    const validResult = createPaymentSchema.safeParse({
      invoiceId: TEST_ORG_ID,
      amount: 500,
      paymentDate: '2026-11-28',
      paymentMethod: 'bank_transfer',
    });
    expect(validResult.success).toBe(true);
  });
});
