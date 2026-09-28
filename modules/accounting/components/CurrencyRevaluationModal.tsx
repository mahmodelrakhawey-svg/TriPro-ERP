import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Calendar, 
  HelpCircle,
  ArrowRightLeft
} from 'lucide-react';
import { 
  currencyRevaluationService, 
  CurrencyAccountInfo, 
  SupportedCurrency, 
  OFFICIAL_DEFAULT_RATES 
} from '../../../services/currencyRevaluationService';
import { toast } from 'react-hot-toast';

export interface CurrencyRevaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  accounts: Array<{ id: string; code: string; name: string; balance?: number }>;
  onSuccess: () => void;
}

export const CurrencyRevaluationModal: React.FC<CurrencyRevaluationModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  accounts,
  onSuccess
}) => {
  const [revaluationDate, setRevaluationDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [rates, setRates] = useState<Record<SupportedCurrency, number>>({ ...OFFICIAL_DEFAULT_RATES });
  const [currencyAccounts, setCurrencyAccounts] = useState<CurrencyAccountInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // حسابات الأرباح والخسائر المقترحة
  const [gainAccountId, setGainAccountId] = useState<string>('');
  const [lossAccountId, setLossAccountId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    // العثور التلقائي على حساب أرباح فروق العملة أو إيرادات أخرى
    const gainAcc = accounts.find(a => 
      a.code.startsWith('421') || a.name.includes('أرباح فروق') || a.name.includes('إيرادات أخرى')
    );
    if (gainAcc) setGainAccountId(gainAcc.id);

    // العثور التلقائي على حساب خسائر فروق العملة أو مصروفات بنكية
    const lossAcc = accounts.find(a => 
      a.code.startsWith('534') || a.name.includes('خسائر فروق') || a.name.includes('مصروفات بنكية')
    );
    if (lossAcc) setLossAccountId(lossAcc.id);

    // استخراج الحسابات ذات العملات الأجنبية
    const loadAccounts = async () => {
      setLoading(true);
      try {
        const detected = await currencyRevaluationService.getForeignCurrencyAccounts(organizationId);
        if (detected.length > 0) {
          setCurrencyAccounts(detected);
        } else {
          // إذا لم تكتشف أسماء الحسابات تلقائياً، إتاحة الحسابات النقدية والبنكية يدوياً
          const bankCash = accounts.filter(a => a.code.startsWith('123') || a.code.startsWith('124'));
          const fallback: CurrencyAccountInfo[] = bankCash.slice(0, 3).map((a, idx) => ({
            accountId: a.id,
            accountCode: a.code,
            accountName: a.name,
            currency: idx === 0 ? 'USD' : idx === 1 ? 'EUR' : 'SAR',
            foreignBalance: 0,
            currentBookBalanceEGP: Number(a.balance || 0),
          }));
          setCurrencyAccounts(fallback);
        }
      } catch (err: any) {
        toast.error('تعذر جلب الحسابات: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    loadAccounts();
  }, [isOpen, organizationId, accounts]);

  // حساب الفروقات التلقائية
  const calculationResult = useMemo(() => {
    return currencyRevaluationService.calculateRevaluation(currencyAccounts, rates);
  }, [currencyAccounts, rates]);

  if (!isOpen) return null;

  const handleRateChange = (currency: SupportedCurrency, val: string) => {
    const num = parseFloat(val) || 0;
    setRates(prev => ({ ...prev, [currency]: num }));
  };

  const handleForeignBalanceChange = (accountId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setCurrencyAccounts(prev => 
      prev.map(acc => acc.accountId === accountId ? { ...acc, foreignBalance: num } : acc)
    );
  };

  const handleSubmit = async (autoPost: boolean) => {
    if (!gainAccountId || !lossAccountId) {
      toast.error('يرجى تحديد حساب أرباح التقييم وحساب خسائر التقييم لإتمام القيد.');
      return;
    }

    if (calculationResult.items.every(i => i.type === 'no_change')) {
      toast.error('لا توجد فروقات أسعار عملة تتطلب إنشاء قيد.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await currencyRevaluationService.executeRevaluationPosting({
        organizationId,
        revaluationDate,
        items: calculationResult.items,
        gainAccountId,
        lossAccountId,
        autoPost,
      });

      if (!res.success) {
        throw new Error(res.error || 'فشلت عملية إنشاء القيد');
      }

      const refText = 'reference' in res && res.reference ? ` بالرقم: ${res.reference}` : '';
      toast.success(
        autoPost 
          ? `تم ترحيل قيد إعادة التقييم بنجاح${refText}`
          : `تم حفظ قيد إعادة التقييم كمسودة${refText}`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء ترحيل القيد');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
              <ArrowRightLeft size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                معالج إعادة تقييم فروق أسعار صرف العملات (EAS 13 / IAS 21)
              </h2>
              <p className="text-xs text-slate-500">
                إعادة تقييم الأرصدة النقدية والبنكية الأجنبية وتوليد قيد التسوية المحاسبي آلياً دون تعديل الحركات السابقة
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Top Parameters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar size={14} className="text-blue-600" />
                تاريخ إعادة التقييم (نهاية الفترة)
              </label>
              <input
                type="date"
                value={revaluationDate}
                onChange={(e) => setRevaluationDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <TrendingUp size={14} className="text-emerald-600" />
                حساب أرباح فروق العملة (دائن)
              </label>
              <select
                value={gainAccountId}
                onChange={(e) => setGainAccountId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-blue-500"
              >
                <option value="">-- اختر حساب الأرباح --</option>
                {accounts.filter(a => a.code.startsWith('4')).map(a => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <TrendingDown size={14} className="text-rose-600" />
                حساب خسائر فروق العملة (مدين)
              </label>
              <select
                value={lossAccountId}
                onChange={(e) => setLossAccountId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-blue-500"
              >
                <option value="">-- اختر حساب الخسائر --</option>
                {accounts.filter(a => a.code.startsWith('5')).map(a => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Exchange Rates Bar */}
          <div>
            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign size={14} className="text-amber-500" />
              أسعار الصرف الإقفالية المقابلة للجنيه المصري (Official Closing Rates):
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {(Object.keys(rates) as SupportedCurrency[]).map((curr) => (
                <div key={curr} className="bg-white border border-slate-200 p-2.5 rounded-lg">
                  <div className="text-xs font-bold text-slate-500 mb-1">{curr} مقابل EGP</div>
                  <input
                    type="number"
                    step="0.01"
                    value={rates[curr]}
                    onChange={(e) => handleRateChange(curr, e.target.value)}
                    className="w-full text-sm font-bold text-slate-800 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Revaluation Accounts Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                الأرصدة الخاضعة للتقييم والتسوية المحاسبية:
              </h3>
              <span className="text-xs text-slate-400">
                يتم احتساب الفارق: (الرصيد بالعملة × السعر الجديد) - الرصيد الدفتري الحالي
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center p-8 bg-slate-50 rounded-xl">
                <Loader2 className="animate-spin text-blue-600" size={24} />
              </div>
            ) : currencyAccounts.length === 0 ? (
              <div className="text-center p-8 bg-slate-50 rounded-xl text-slate-500 text-sm">
                لم يتم العثور على حسابات نقدية أو بنكية أجنبية محددة. يمكنك مراجعة شجرة الحسابات.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">كود واسم الحساب</th>
                      <th className="p-3">العملة</th>
                      <th className="p-3">الرصيد بالعملة الأجنبية</th>
                      <th className="p-3">الرصيد الدفتري الحالي (EGP)</th>
                      <th className="p-3">سعر الإقفال</th>
                      <th className="p-3">القيمة المعاد تقييمها (EGP)</th>
                      <th className="p-3">فروق التقييم (الأثر)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {calculationResult.items.map((item) => {
                      const isGain = item.type === 'gain';
                      const isLoss = item.type === 'loss';

                      return (
                        <tr key={item.account.accountId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-semibold text-slate-800">
                            <div>{item.account.accountName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{item.account.accountCode}</div>
                          </td>
                          <td className="p-3 font-bold text-slate-700">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              {item.account.currency}
                            </span>
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              step="0.01"
                              value={item.account.foreignBalance}
                              onChange={(e) => handleForeignBalanceChange(item.account.accountId, e.target.value)}
                              className="w-28 text-xs font-bold text-slate-800 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="p-3 font-bold text-slate-700">
                            {item.account.currentBookBalanceEGP.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 font-bold text-blue-600">
                            {item.newExchangeRate.toFixed(2)}
                          </td>
                          <td className="p-3 font-bold text-slate-900">
                            {item.newValuatedAmountEGP.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3">
                            {isGain && (
                              <span className="flex items-center gap-1 font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                <TrendingUp size={12} />
                                +{item.unrealizedGainLossEGP.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م (ربح)
                              </span>
                            )}
                            {isLoss && (
                              <span className="flex items-center gap-1 font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded">
                                <TrendingDown size={12} />
                                {item.unrealizedGainLossEGP.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م (خسارة)
                              </span>
                            )}
                            {!isGain && !isLoss && (
                              <span className="text-slate-400 font-medium">0.00 (متطابق)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Financial Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-900 text-white p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <TrendingUp size={18} />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-semibold">إجمالي أرباح التقييم (دائن)</div>
                <div className="text-base font-bold text-emerald-400 font-mono">
                  +{calculationResult.totalGainEGP.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                <TrendingDown size={18} />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-semibold">إجمالي خسائر التقييم (مدين)</div>
                <div className="text-base font-bold text-rose-400 font-mono">
                  -{calculationResult.totalLossEGP.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-r border-slate-800 pr-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-semibold">صافي الأثر على الأرباح والخسائر</div>
                <div className={`text-base font-bold font-mono ${calculationResult.netVarianceEGP >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {calculationResult.netVarianceEGP >= 0 ? '+' : ''}
                  {calculationResult.netVarianceEGP.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>يتم توليد قيد مزدوج متوازن تماماً مدين ودائن دون أي مساس بالقيود القديمة.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
            >
              إلغاء
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting || calculationResult.items.every(i => i.type === 'no_change')}
              className="px-4 py-2 text-xs font-bold bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 rounded-lg transition-colors shadow-xs disabled:opacity-50"
            >
              حفظ كمسودة للمراجعة
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting || calculationResult.items.every(i => i.type === 'no_change')}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              اعتماد وترحيل فوري للأستاذ العام
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default CurrencyRevaluationModal;
