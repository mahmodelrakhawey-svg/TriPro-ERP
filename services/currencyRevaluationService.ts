/**
 * ==============================================================================
 * Foreign Currency Revaluation Service (خدمة إعادة تقييم فروق أسعار العملات)
 * TriPro ERP — services/currencyRevaluationService.ts
 * ==============================================================================
 * متوافق مع معيار المحاسبة المصري رقم 13 (EAS 13) ومعيار المحاسبة الدولي (IAS 21)
 * "آثار التغيرات في أسعار صرف العملات الأجنبية"
 * 
 * المبادئ الرقابية المحاسبية:
 * 1. حصر الأصول والالتزامات النقدية بالعملات الأجنبية في نهاية كل فترة مالية.
 * 2. إعادة تقييم الأرصدة وفق سعر الصرف الإقفالي للبنك المركزي المصري.
 * 3. احتساب وتوليد قيد تسوية أرباح / خسائر فروق تقييم العملة غير المحققة تلقائياً
 *    في الأستاذ العام دون المساس بالأرصدة التاريخية أو القيود السابقة.
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { AccountingEngine, CreateJournalEntryParams, validateJournalEntry } from './accountingEngine';

export type SupportedCurrency = 'USD' | 'EUR' | 'SAR' | 'AED' | 'GBP' | 'KWD';

export interface CurrencyAccountInfo {
  accountId: string;
  accountCode: string;
  accountName: string;
  currency: SupportedCurrency;
  foreignBalance: number;
  currentBookBalanceEGP: number;
}

export interface RevaluationItem {
  account: CurrencyAccountInfo;
  newExchangeRate: number;
  newValuatedAmountEGP: number;
  unrealizedGainLossEGP: number;
  type: 'gain' | 'loss' | 'no_change';
}

export interface RevaluationCalculationResult {
  totalGainEGP: number;
  totalLossEGP: number;
  netVarianceEGP: number;
  items: RevaluationItem[];
}

export interface PostRevaluationParams {
  organizationId: string;
  revaluationDate: string;
  items: RevaluationItem[];
  gainAccountId: string;
  lossAccountId: string;
  notes?: string;
  reference?: string;
  autoPost?: boolean;
}

export const OFFICIAL_DEFAULT_RATES: Record<SupportedCurrency, number> = {
  USD: 48.60,
  EUR: 52.80,
  SAR: 12.95,
  AED: 13.23,
  GBP: 63.40,
  KWD: 158.50,
};

class CurrencyRevaluationService {
  /**
   * حساب فروق إعادة التقييم لجميع الحسابات بالعملات الأجنبية
   */
  public calculateRevaluation(
    accounts: CurrencyAccountInfo[],
    rates: Record<SupportedCurrency, number>
  ): RevaluationCalculationResult {
    let totalGain = 0;
    let totalLoss = 0;

    const items: RevaluationItem[] = accounts.map((acc) => {
      const rate = rates[acc.currency] || 1;
      const newValuatedAmountEGP = Number((acc.foreignBalance * rate).toFixed(2));
      const currentBook = Number(acc.currentBookBalanceEGP.toFixed(2));
      const variance = Number((newValuatedAmountEGP - currentBook).toFixed(2));

      let type: 'gain' | 'loss' | 'no_change' = 'no_change';
      if (variance > 0.005) {
        type = 'gain';
        totalGain += variance;
      } else if (variance < -0.005) {
        type = 'loss';
        totalLoss += Math.abs(variance);
      }

      return {
        account: acc,
        newExchangeRate: rate,
        newValuatedAmountEGP,
        unrealizedGainLossEGP: variance,
        type,
      };
    });

    return {
      totalGainEGP: Number(totalGain.toFixed(2)),
      totalLossEGP: Number(totalLoss.toFixed(2)),
      netVarianceEGP: Number((totalGain - totalLoss).toFixed(2)),
      items,
    };
  }

  /**
   * إعداد معلمات قيد اليومية المتوازن لإعادة التقييم
   */
  public prepareRevaluationJournalParams(params: PostRevaluationParams): CreateJournalEntryParams | null {
    const { organizationId, revaluationDate, items, gainAccountId, lossAccountId, notes, reference, autoPost } = params;

    const lines: Array<{
      accountId: string;
      debit: number;
      credit: number;
      description: string;
    }> = [];

    for (const item of items) {
      const absAmount = Math.abs(item.unrealizedGainLossEGP);
      if (absAmount <= 0.005) continue;

      if (item.type === 'gain') {
        // ربح غير محقق: مدين بحساب الأصل / النقدية الأجنبية، دائن بحساب أرباح فروق العملة
        lines.push({
          accountId: item.account.accountId,
          debit: absAmount,
          credit: 0,
          description: `إعادة تقييم فروق عملة (+ربح) لحساب ${item.account.accountName} (${item.account.currency}) بسعر ${item.newExchangeRate}`,
        });
        lines.push({
          accountId: gainAccountId,
          debit: 0,
          credit: absAmount,
          description: `أرباح فروق تقييم عملة غير محققة - ${item.account.currency} (${item.account.accountName})`,
        });
      } else if (item.type === 'loss') {
        // خسارة غير محققة: مدين بحساب خسائر فروق العملة، دائن بحساب الأصل / النقدية الأجنبية
        lines.push({
          accountId: lossAccountId,
          debit: absAmount,
          credit: 0,
          description: `خسائر فروق تقييم عملة غير محققة - ${item.account.currency} (${item.account.accountName})`,
        });
        lines.push({
          accountId: item.account.accountId,
          debit: 0,
          credit: absAmount,
          description: `إعادة تقييم فروق عملة (-خسارة) لحساب ${item.account.accountName} (${item.account.currency}) بسعر ${item.newExchangeRate}`,
        });
      }
    }

    if (lines.length === 0) {
      return null;
    }

    // التحقق من صحة وتوازن القيد
    const validation = validateJournalEntry({ lines });
    if (!validation.isValid) {
      throw new Error(`خطأ في توازن قيد إعادة التقييم: ${validation.error}`);
    }

    const defaultRef = reference || `FX-REV-${revaluationDate.replace(/-/g, '')}`;
    const defaultDesc = notes || `قيد تسوية فروق تقييم أسعار صرف العملات الأجنبية وفق معيار EAS 13 بتاريخ ${revaluationDate}`;

    return {
      organizationId,
      transactionDate: revaluationDate,
      reference: defaultRef,
      description: defaultDesc,
      lines,
      relatedDocumentType: 'currency_revaluation',
      status: autoPost ? 'posted' : 'draft',
      autoPost: Boolean(autoPost),
    };
  }

  /**
   * ترحيل قيد إعادة التقييم مباشرة عبر المحرك المحاسبي الموحد
   */
  public async executeRevaluationPosting(params: PostRevaluationParams) {
    const journalParams = this.prepareRevaluationJournalParams(params);
    if (!journalParams) {
      return {
        success: false,
        error: 'لا توجد فروقات أسعار عملة تتطلب إنشاء قيد محاسبي.',
      };
    }

    return await AccountingEngine.createJournalEntry(journalParams);
  }

  /**
   * استخراج الحسابات البنكية والنقدية والمدينة/الدائنة المعينة كعملات أجنبية
   */
  public async getForeignCurrencyAccounts(orgId: string): Promise<CurrencyAccountInfo[]> {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, code, name, balance')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .eq('is_group', false);

      if (error || !data) return [];

      // البحث عن الحسابات التي تحمل في اسمها أو كودها إشارة لعملة أجنبية (USD, EUR, SAR, AED, دولار, يورو, ريال)
      const foreignAccounts: CurrencyAccountInfo[] = [];

      data.forEach((acc) => {
        const nameLower = (acc.name || '').toLowerCase();
        let detectedCurrency: SupportedCurrency | null = null;

        if (nameLower.includes('دولار') || nameLower.includes('usd') || nameLower.includes('$')) {
          detectedCurrency = 'USD';
        } else if (nameLower.includes('يورو') || nameLower.includes('eur') || nameLower.includes('€')) {
          detectedCurrency = 'EUR';
        } else if (nameLower.includes('ريال') || nameLower.includes('sar')) {
          detectedCurrency = 'SAR';
        } else if (nameLower.includes('درهم') || nameLower.includes('aed')) {
          detectedCurrency = 'AED';
        } else if (nameLower.includes('استرليني') || nameLower.includes('gbp') || nameLower.includes('£')) {
          detectedCurrency = 'GBP';
        } else if (nameLower.includes('دينار') || nameLower.includes('kwd')) {
          detectedCurrency = 'KWD';
        }

        if (detectedCurrency) {
          const bookBalance = Number(acc.balance || 0);
          // افتراض مبدئي للرصيد بالعملة الأجنبية بناءً على السعر القياسي
          const defaultRate = OFFICIAL_DEFAULT_RATES[detectedCurrency] || 1;
          const foreignBalance = Number((bookBalance / defaultRate).toFixed(2));

          foreignAccounts.push({
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            currency: detectedCurrency,
            foreignBalance,
            currentBookBalanceEGP: bookBalance,
          });
        }
      });

      return foreignAccounts;
    } catch (_) {
      return [];
    }
  }
}

export const currencyRevaluationService = new CurrencyRevaluationService();
export default currencyRevaluationService;
