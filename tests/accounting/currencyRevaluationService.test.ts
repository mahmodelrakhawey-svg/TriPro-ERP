import { describe, it, expect, vi } from 'vitest';
import {
  currencyRevaluationService,
  CurrencyAccountInfo,
  OFFICIAL_DEFAULT_RATES,
} from '../../services/currencyRevaluationService';
import { validateJournalEntry } from '../../services/accountingEngine';

describe('💱 Foreign Currency Revaluation Service (EAS 13 / IAS 21)', () => {
  const mockAccounts: CurrencyAccountInfo[] = [
    {
      accountId: 'acc-usd-bank-1',
      accountCode: '123201',
      accountName: 'البنك الأهلي - حساب جاري بالدولار',
      currency: 'USD',
      foreignBalance: 10000, // $10,000
      currentBookBalanceEGP: 480000, // المسجل بالدفاتر بسعر 48.00 ج.م
    },
    {
      accountId: 'acc-eur-bank-2',
      accountCode: '123202',
      accountName: 'بنك مصر - حساب جاري باليورو',
      currency: 'EUR',
      foreignBalance: 5000, // €5,000
      currentBookBalanceEGP: 270000, // المسجل بالدفاتر بسعر 54.00 ج.م
    },
    {
      accountId: 'acc-sar-cash-3',
      accountCode: '123103',
      accountName: 'خزينة الريال السعودي',
      currency: 'SAR',
      foreignBalance: 20000, // 20,000 SAR
      currentBookBalanceEGP: 259000, // المسجل بالدفاتر بسعر 12.95 ج.م (مطابق تماماً)
    },
  ];

  it('يحسب أرباح وخسائر فروق إعادة التقييم بدقة متناهية بناء على أسعار الصرف الجديدة', () => {
    const newRates = {
      ...OFFICIAL_DEFAULT_RATES,
      USD: 49.00, // ارتفع الدولار من 48.00 إلى 49.00 => ربح 10,000 * 1 = +10,000 ج.م
      EUR: 53.00, // انخفض اليورو من 54.00 إلى 53.00 => خسارة 5,000 * 1 = -5,000 ج.م
      SAR: 12.95, // السعر كما هو => لا يوجد فرق
    };

    const result = currencyRevaluationService.calculateRevaluation(mockAccounts, newRates);

    expect(result.items).toHaveLength(3);

    // USD Account => Gain
    const usdItem = result.items.find((i) => i.account.currency === 'USD')!;
    expect(usdItem.type).toBe('gain');
    expect(usdItem.newValuatedAmountEGP).toBe(490000);
    expect(usdItem.unrealizedGainLossEGP).toBe(10000);

    // EUR Account => Loss
    const eurItem = result.items.find((i) => i.account.currency === 'EUR')!;
    expect(eurItem.type).toBe('loss');
    expect(eurItem.newValuatedAmountEGP).toBe(265000);
    expect(eurItem.unrealizedGainLossEGP).toBe(-5000);

    // SAR Account => No Change
    const sarItem = result.items.find((i) => i.account.currency === 'SAR')!;
    expect(sarItem.type).toBe('no_change');
    expect(sarItem.unrealizedGainLossEGP).toBe(0);

    // Totals
    expect(result.totalGainEGP).toBe(10000);
    expect(result.totalLossEGP).toBe(5000);
    expect(result.netVarianceEGP).toBe(5000);
  });

  it('يولد قيد يومية متوازن محاسبياً بنسبة 100% يطابق قاعدة Debit = Credit', () => {
    const newRates = {
      ...OFFICIAL_DEFAULT_RATES,
      USD: 49.00,
      EUR: 53.00,
      SAR: 12.95,
    };

    const calcResult = currencyRevaluationService.calculateRevaluation(mockAccounts, newRates);

    const journalParams = currencyRevaluationService.prepareRevaluationJournalParams({
      organizationId: 'org-lenza-test',
      revaluationDate: '2026-09-30',
      items: calcResult.items,
      gainAccountId: 'acc-gain-42103',
      lossAccountId: 'acc-loss-5343',
      reference: 'FX-TEST-001',
    });

    expect(journalParams).not.toBeNull();
    expect(journalParams?.lines).toHaveLength(4); // طرفين للربح + طرفين للخسارة

    // التحقق الصارم من التوازن المحاسبي المزدوج
    const validation = validateJournalEntry({ lines: journalParams!.lines });
    expect(validation.isValid).toBe(true);

    const totalDebit = journalParams!.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = journalParams!.lines.reduce((s, l) => s + l.credit, 0);

    expect(totalDebit).toBe(15000); // 10000 (USD Gain Dr) + 5000 (Loss Dr)
    expect(totalCredit).toBe(15000); // 10000 (Gain Cr) + 5000 (EUR Loss Cr)
    expect(totalDebit).toEqual(totalCredit);
  });

  it('يعيد null ولا ينشئ قيداً إذا لم تكن هناك أي فروقات في أسعار العملات', () => {
    const identicalRates = {
      ...OFFICIAL_DEFAULT_RATES,
      USD: 48.00,
      EUR: 54.00,
      SAR: 12.95,
    };

    const calcResult = currencyRevaluationService.calculateRevaluation(mockAccounts, identicalRates);

    const journalParams = currencyRevaluationService.prepareRevaluationJournalParams({
      organizationId: 'org-lenza-test',
      revaluationDate: '2026-09-30',
      items: calcResult.items,
      gainAccountId: 'acc-gain-42103',
      lossAccountId: 'acc-loss-5343',
    });

    expect(journalParams).toBeNull();
  });
});
