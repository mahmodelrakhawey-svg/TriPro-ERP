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
import { SYSTEM_ACCOUNTS } from '../context/accountingConstants';

export interface AccountMappingCandidate {
  id: string;
  code: string;
  name: string;
  isGroup?: boolean;
  is_group?: boolean;
}

export interface AccountMappingResult {
  mappings: Record<string, string>;
  hasNewMappings: boolean;
  mappedCount: number;
}

/**
 * اشتقاق وتوحيد ربط الحسابات الافتراضية مع شجرة الحسابات (Default Account Mappings Derivation)
 * تضمن هذه الدالة عدم الاعتماد على البحث النصي العشوائي في القيود، وتربط كل دور محاسبي بحساب فعلي معرف بـ UUID.
 *
 * القواعد الصارمة:
 * 1. الحفاظ التام على أي حساب تم ربطه مسبقاً (عدم الكتابة فوقه إطلاقاً).
 * 2. البحث فقط في الحسابات الفرعية غير التجميعية (Leaf Accounts).
 * 3. الأولوية الأولى: التطابق التام للكود المحاسبي (Exact Code Match).
 * 4. الأولوية الثانية: بادئة الكود (Prefix Match).
 * 5. الأولوية الثالثة: الأكواد البديلة الشائعة والاسم العربي القياسي.
 */
export function deriveAccountMappings(
  accounts: AccountMappingCandidate[],
  existingMappings?: Record<string, string> | null
): AccountMappingResult {
  const result: Record<string, string> = { ...(existingMappings || {}) };
  let hasNewMappings = false;

  const validLeafAccounts = (accounts || []).filter(a => !(a.isGroup ?? a.is_group));

  const standardFallbacks: Record<string, { codes: string[]; nameKeywords: string[]; excludeKeywords?: string[] }> = {
    CASH: {
      codes: ['1231', '10101', '123'],
      nameKeywords: ['خزينة', 'نقدية', 'صندوق', 'cash']
    },
    BANK: {
      codes: ['123201', '1232', '10102'],
      nameKeywords: ['بنك', 'bank']
    },
    BANK_ACCOUNTS: {
      codes: ['123201', '1232', '10102'],
      nameKeywords: ['بنك', 'bank']
    },
    CUSTOMERS: {
      codes: ['1221', '1103', '121'],
      nameKeywords: ['عملاء', 'العملاء', 'customer', 'receivable']
    },
    SUPPLIERS: {
      codes: ['20101', '201', '2101', '221', '2201'],
      nameKeywords: ['موردين', 'الموردين', 'supplier', 'payable']
    },
    VAT: {
      codes: ['2231', '2105'],
      nameKeywords: ['القيمة المضافة', 'ضريبة المبيعات'],
      excludeKeywords: ['مدخلات', 'مشتريات']
    },
    VAT_OUTPUT: {
      codes: ['2231', '2105'],
      nameKeywords: ['القيمة المضافة', 'مخرجات'],
      excludeKeywords: ['مدخلات', 'مشتريات']
    },
    VAT_INPUT: {
      codes: ['1241', '1105'],
      nameKeywords: ['مدخلات', 'مشتريات', 'ضريبة مشتريات']
    },
    OPENING_BALANCES: {
      codes: ['3999', '313', '39', '300'],
      nameKeywords: ['افتتاحي', 'افتتاحية', 'opening']
    },
    INVENTORY: {
      codes: ['10302', '1213', '103', '122'],
      nameKeywords: ['بضائع بغرض البيع', 'منتج تام', 'المخزون', 'مخزون']
    },
    INVENTORY_FINISHED_GOODS: {
      codes: ['10302', '1213'],
      nameKeywords: ['تام', 'بضائع']
    },
    INVENTORY_RAW_MATERIALS: {
      codes: ['10301', '1211'],
      nameKeywords: ['خامات', 'مواد خام']
    },
    COGS: {
      codes: ['511', '311'],
      nameKeywords: ['تكلفة المبيعات', 'تكلفة البضاعة']
    },
    SALES_REVENUE: {
      codes: ['411', '41'],
      nameKeywords: ['المبيعات', 'إيراد المبيعات']
    },
    NOTES_RECEIVABLE: {
      codes: ['1222', '10103'],
      nameKeywords: ['أوراق قبض', 'شيكات واردة', 'تحت التحصيل']
    },
    NOTES_PAYABLE: {
      codes: ['222', '20102', '2202'],
      nameKeywords: ['أوراق دفع', 'شيكات صادرة']
    },
    CASH_SHORTAGE: {
      codes: ['541'],
      nameKeywords: ['عجز الصندوق', 'عجز الخزينة']
    },
    CASH_SURPLUS_ACC: {
      codes: ['441', '421'],
      nameKeywords: ['فائض الصندوق', 'فائض الخزينة', 'إيرادات متنوعة']
    },
    LETTER_OF_GUARANTEE_MARGIN: {
      codes: ['1248'],
      nameKeywords: ['خطاب ضمان', 'خطابات الضمان', 'غطاء']
    },
    LETTER_OF_CREDIT_GOODS: {
      codes: ['1246'],
      nameKeywords: ['اعتمادات مستندية', 'اعتماد مستندي']
    }
  };

  const allTargetKeys: Record<string, string> = {
    ...SYSTEM_ACCOUNTS,
    CASH_SHORTAGE: '541',
    CASH_SURPLUS_ACC: '441',
    INVENTORY_RAW_MATERIALS: '10301',
    INVENTORY_WIP: '10303',
    INVENTORY_FINISHED_GOODS: '10302',
    LABOR_COST_ALLOCATED: '513',
    WASTAGE_EXPENSE: '5121',
    RETENTION_CUSTOMER: '1249',
    RETENTION_SUBCONTRACTOR: '2229',
    ADVANCE_PAYMENT_SUBCONTRACTOR: '1245',
    EQUIPMENT_INTERNAL_REVENUE: '425',
    VAT_OUTPUT: '2231',
    BANK: '123201'
  };

  for (const [key, defaultCode] of Object.entries(allTargetKeys)) {
    if (result[key] && typeof result[key] === 'string' && result[key].trim().length > 0) {
      continue;
    }

    let matched = validLeafAccounts.find(a => a.code === defaultCode);

    if (!matched) {
      matched = validLeafAccounts.find(a => a.code?.startsWith(defaultCode));
    }

    if (!matched && standardFallbacks[key]) {
      const fb = standardFallbacks[key];
      matched = validLeafAccounts.find(a => fb.codes.some(c => a.code === c || a.code?.startsWith(c)));

      if (!matched && fb.nameKeywords.length > 0) {
        matched = validLeafAccounts.find(a => {
          const nameLower = (a.name || '').toLowerCase();
          const hasKeyword = fb.nameKeywords.some(kw => nameLower.includes(kw.toLowerCase()));
          const hasExclude = fb.excludeKeywords?.some(ew => nameLower.includes(ew.toLowerCase())) || false;
          return hasKeyword && !hasExclude;
        });
      }
    }

    if (matched?.id) {
      result[key] = matched.id;
      hasNewMappings = true;
    }
  }

  const mappedCount = Object.keys(result).filter(k => Boolean(result[k])).length;
  return { mappings: result, hasNewMappings, mappedCount };
}

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
