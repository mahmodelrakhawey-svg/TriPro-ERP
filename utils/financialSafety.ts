/**
 * ==============================================================================
 * TriPro ERP — Enterprise Financial Safety Net & Ledger Invariants
 * utils/financialSafety.ts
 * ==============================================================================
 * حزمة الدوال الرياضية المعتمدة لضمان سلامة العمليات المحاسبية:
 * 1. توازن القيود المحاسبية متعددة العملات (Double-Entry Balance Verification)
 * 2. معالجة عجز وفائض الخزينة في إقفال الورديات (Shift Variance Reconciliation)
 * 3. تحويل العملات الأجنبية بسعر الصرف المعتمد
 * ==============================================================================
 */

import { roundToTwoDecimals } from './invoiceCalculations';

export interface FinancialJournalLine {
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  currency?: string;
  exchangeRate?: number;
  amountForeign?: number;
}

export interface FinancialJournalEntry {
  reference: string;
  date: string;
  lines: FinancialJournalLine[];
}

export interface EntryBalanceValidationResult {
  /** هل القيد متوازن محاسبياً (الفرق أقل من 0.001) */
  isBalanced: boolean;
  /** إجمالي المبالغ المدينة مقربة لأقرب قرشين */
  totalDebit: number;
  /** إجمالي المبالغ الدائنة مقربة لأقرب قرشين */
  totalCredit: number;
  /** الفرق المطلق بين المدين والدائن */
  difference: number;
}

/**
 * نتيجة مطابقة عجز أو زيادة الوردية
 */
export interface ShiftVarianceResult {
  /** النقدية المتوقعة دفترياً في الدرج */
  expectedCash: number;
  /** النقدية الفعلية المحصية بالجرد */
  actualCountedCash: number;
  /** الفرق: موجب يعني فائض، سالب يعني عجز، صفر يعني مطابقة تامة */
  variance: number;
  /** هل يوجد عجز في الصندوق */
  isDeficit: boolean;
  /** هل يوجد فائض في الصندوق */
  isSurplus: boolean;
  /** هل الجرد مطابق تماماً */
  isExactMatch: boolean;
  /** الحساب المقترح للطرف المقابل (541 لعجز الخزينة، 441 للأرباح المتنوعة) */
  recommendedAccountCode: string;
}

/**
 * فحص وتأكيد توازن القيد المحاسبي بالعملة المحلية بدقة منزلتين عشريتين
 *
 * @param entry كائن القيد المحاسبي وأطرافه
 * @returns كائن تفصيلي يوضح حالة التوازن وإجمالي المدين والدائن والفرق
 *
 * @example
 * ```ts
 * const res = validateEntryBalance({
 *   reference: 'JE-001',
 *   date: '2026-09-28',
 *   lines: [
 *     { accountId: '1', debit: 100, credit: 0 },
 *     { accountId: '2', debit: 0, credit: 100 }
 *   ]
 * });
 * // res.isBalanced === true
 * ```
 */
export function validateEntryBalance(entry: FinancialJournalEntry): EntryBalanceValidationResult {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of entry.lines || []) {
    totalDebit += Number(line.debit || 0);
    totalCredit += Number(line.credit || 0);
  }

  totalDebit = roundToTwoDecimals(totalDebit);
  totalCredit = roundToTwoDecimals(totalCredit);
  const difference = roundToTwoDecimals(Math.abs(totalDebit - totalCredit));

  return {
    isBalanced: difference < 0.001,
    totalDebit,
    totalCredit,
    difference
  };
}

/**
 * حساب عجز أو فائض النقدية عند إقفال وردية الكاشير أو نقطة البيع
 *
 * @param expectedCash المبلغ الدفتري المفترض وجوده بالخزينة بناءً على مبيعات الوردية
 * @param actualCountedCash المبلغ الفعلي الذي تم عده وحصره في الجرد الفيزيائي
 * @returns كائن التحليل المحاسبي لفروق الوردية
 */
export function calculateShiftCashVariance(
  expectedCash: number,
  actualCountedCash: number
): ShiftVarianceResult {
  const exp = roundToTwoDecimals(expectedCash);
  const act = roundToTwoDecimals(actualCountedCash);
  const variance = roundToTwoDecimals(act - exp);

  const isDeficit = variance < -0.001;
  const isSurplus = variance > 0.001;
  const isExactMatch = !isDeficit && !isSurplus;

  return {
    expectedCash: exp,
    actualCountedCash: act,
    variance,
    isDeficit,
    isSurplus,
    isExactMatch,
    recommendedAccountCode: isDeficit ? '541' : isSurplus ? '441' : '101'
  };
}

/**
 * تحويل مبلغ من عملة أجنبية إلى العملة المحلية بسعر صرف معتمد مع حساب ضريبة القيمة المضافة
 *
 * @param foreignAmount المبلغ بالعملة الأجنبية
 * @param exchangeRate سعر صرف الوحدة من العملة الأجنبية مقابل العملة المحلية
 * @param vatRate نسبة ضريبة القيمة المضافة (الافتراضي 14% = 0.14)
 * @returns كائن يحتوي على القيمة المحلية، الضريبة المحلية، والمبلغ الإجمالي
 */
export function convertForeignInvoiceToLocal(
  foreignAmount: number,
  exchangeRate: number,
  vatRate: number = 0.14
): {
  localAmount: number;
  vatLocal: number;
  grossLocal: number;
} {
  const localAmount = roundToTwoDecimals(foreignAmount * exchangeRate);
  const vatLocal = roundToTwoDecimals(localAmount * vatRate);
  const grossLocal = roundToTwoDecimals(localAmount + vatLocal);

  return {
    localAmount,
    vatLocal,
    grossLocal
  };
}
