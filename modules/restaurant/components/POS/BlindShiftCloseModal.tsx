import { logger } from '../../../../utils/logger';
import React, { useState } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  CashierShift,
  CashDenominationBreakdown,
  cashShiftService
} from '../../../../services/cashShiftService';
import type { ShiftSummaryData } from '../../../../types';
import {
  Lock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Coins,
  FileText,
  X,
  Eye,
  EyeOff,
  Sparkles,
  CreditCard,
  Zap,
  Smartphone,
  CalendarCheck,
  Printer
} from 'lucide-react';

interface BlindShiftCloseModalProps {
  shift: CashierShift;
  onClose: () => void;
  onSuccess: () => void;
}

export const BlindShiftCloseModal: React.FC<BlindShiftCloseModalProps> = ({
  shift,
  onClose,
  onSuccess
}) => {
  const { currentUser, currentShift, getCurrentShiftSummary, closeCurrentShift } = useAccounting();
  const { showToast } = useToast();

  const [step, setStep] = useState<'COUNT' | 'RESULT'>('COUNT');
  const [breakdownMode, setBreakdownMode] = useState(true);

  // Breakdown
  const [b200, setB200] = useState<number>(0);
  const [b100, setB100] = useState<number>(0);
  const [b50, setB50] = useState<number>(0);
  const [b20, setB20] = useState<number>(0);
  const [b10, setB10] = useState<number>(0);
  const [b5, setB5] = useState<number>(0);
  const [coins, setCoins] = useState<number>(0);
  const [directTotal, setDirectTotal] = useState<number>(0);
  const [closingNotes, setClosingNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Non-cash slip inputs
  const [cardSlips, setCardSlips] = useState<string>('');
  const [instapaySlips, setInstapaySlips] = useState<string>('');
  const [walletSlips, setWalletSlips] = useState<string>('');

  // Result state
  const [shiftSummary, setShiftSummary] = useState<ShiftSummaryData | null>(null);
  const [difference, setDifference] = useState<number>(0);

  // Fetch real database shift summary on mount
  React.useEffect(() => {
    const fetchSummary = async () => {
      try {
        const sum = await getCurrentShiftSummary();
        if (sum) setShiftSummary(sum);
      } catch (err) {
        logger.warn('Failed to load shift summary:', err);
      }
    };
    fetchSummary();
  }, [currentShift]);

  const calculatedTotal = breakdownMode
    ? b200 * 200 + b100 * 100 + b50 * 50 + b20 * 20 + b10 * 10 + b5 * 5 + coins
    : directTotal;

  const handleSubmitCount = async () => {
    if (calculatedTotal <= 0) {
      if (!confirm('المبلغ المدخل 0 ج. هل أنت متأكد من المتابعة بالجرد؟')) return;
    }

    setIsSubmitting(true);
    try {
      let summary = shiftSummary;
      if (!summary) {
        try {
          summary = await getCurrentShiftSummary();
          if (summary) setShiftSummary(summary);
        } catch (e) {
          logger.warn('Shift summary fetch notice:', e);
        }
      }

      const openingFloat = Number(summary?.opening_balance ?? shift?.opening_float ?? (currentShift?.opening_balance || 0));
      const cashSales = Number(summary?.cash_sales ?? shift?.total_cash_sales ?? 0);
      const cardSales = Number(summary?.card_sales ?? shift?.total_card_sales ?? 0);
      const instapaySales = Number(summary?.instapay_sales ?? 0);
      const walletSales = Number(summary?.wallet_sales ?? 0);
      const paidIns = Number(summary?.paid_ins ?? 0);
      const paidOuts = Number(summary?.paid_outs ?? summary?.petty_cash ?? shift?.total_petty_cash_payouts ?? 0);
      const safeDrops = Number(summary?.safe_drops ?? summary?.cash_drops ?? 0);
      const cashReturns = Number(summary?.cash_returns ?? 0);

      // المعادلة المستقلة الدقيقة لنقدية الدرج
      const expected = summary?.expected_cash !== undefined
        ? Number(summary.expected_cash)
        : Number(Math.max(0, (openingFloat + cashSales + paidIns) - (paidOuts + safeDrops + cashReturns)).toFixed(2));

      const diff = Number((calculatedTotal - expected).toFixed(2));
      setDifference(diff);

      const cardSlipNum = cardSlips === '' ? cardSales : Number(cardSlips);
      const instapaySlipNum = instapaySlips === '' ? instapaySales : Number(instapaySlips);
      const walletSlipNum = walletSlips === '' ? walletSales : Number(walletSlips);

      const reconciliation = {
        card_slip_total: cardSlipNum,
        card_diff: cardSlipNum - cardSales,
        instapay_slip_total: instapaySlipNum,
        instapay_diff: instapaySlipNum - instapaySales,
        wallet_slip_total: walletSlipNum,
        wallet_diff: walletSlipNum - walletSales
      };

      // 1. Close REAL database shift in PostgreSQL with full reconciliation
      if (currentShift) {
        await closeCurrentShift(calculatedTotal, closingNotes || 'إقفال الوردية (الجرد الأعمى)', reconciliation);
      }

      // 2. Also close local cashier shift for records
      if (shift?.id) {
        try {
          await cashShiftService.submitBlindClose({
            shiftId: shift.id,
            actualCountedAmount: calculatedTotal,
            breakdown: breakdownMode
              ? {
                  bill200: b200,
                  bill100: b100,
                  bill50: b50,
                  bill20: b20,
                  bill10: b10,
                  bill5: b5,
                  coins
                }
              : undefined,
            closingNotes,
            organizationId: currentUser?.organization_id || undefined
          });
        } catch (localErr) {
          logger.warn('Local shift sync notice:', localErr);
        }
      }

      setStep('RESULT');
      showToast('تم اعتماد الجرد وإقفال الوردية وترحيل القيود بنجاح 🔒', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ غير متوقع';
      showToast('خطأ أثناء إقفال الوردية: ' + msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintZReport = () => {
    const printWindow = window.open('', '_blank', 'width=450,height=650');
    if (!printWindow) {
      showToast('يرجى السماح بالنوافذ المنبثقة للطباعة', 'info');
      return;
    }
    const openFloat = Number(shiftSummary?.opening_balance ?? shift?.opening_float ?? 0);
    const cSales = Number(shiftSummary?.cash_sales ?? 0);
    const kSales = Number(shiftSummary?.card_sales ?? 0);
    const iSales = Number(shiftSummary?.instapay_sales ?? 0);
    const wSales = Number(shiftSummary?.wallet_sales ?? 0);
    const rDeposits = Number(shiftSummary?.redeemed_deposits ?? 0);
    const gSales = Number(shiftSummary?.total_sales ?? shiftSummary?.gross_sales ?? 0);
    const pIns = Number(shiftSummary?.paid_ins ?? 0);
    const pOuts = Number(shiftSummary?.paid_outs ?? shiftSummary?.petty_cash ?? 0);
    const sDrops = Number(shiftSummary?.safe_drops ?? 0);
    const cReturns = Number(shiftSummary?.cash_returns ?? 0);

    const cashDepositsIn = Number(shiftSummary?.cash_deposits_in ?? 0);
    const walletDepositsIn = Number(shiftSummary?.wallet_deposits_in ?? 0);
    const instapayDepositsIn = Number(shiftSummary?.instapay_deposits_in ?? 0);
    const cardDepositsIn = Number(shiftSummary?.card_deposits_in ?? 0);
    const totalDepositsIn = Number(shiftSummary?.total_deposits_in ?? (cashDepositsIn + walletDepositsIn + instapayDepositsIn + cardDepositsIn));

    const cashDepositsRefund = Number(shiftSummary?.cash_deposits_refund ?? 0);
    const walletDepositsRefund = Number(shiftSummary?.wallet_deposits_refund ?? 0);
    const instapayDepositsRefund = Number(shiftSummary?.instapay_deposits_refund ?? 0);
    const totalDepositsRefund = Number(shiftSummary?.total_deposits_refund ?? (cashDepositsRefund + walletDepositsRefund + instapayDepositsRefund));

    const expCash = Number(shiftSummary?.expected_cash ?? (openFloat + cSales + pIns + cashDepositsIn - pOuts - sDrops - cReturns - cashDepositsRefund));

    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تقرير إغلاق الوردية (Z-Report)</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          body {
            font-family: 'Courier New', monospace, Tahoma, sans-serif;
            font-size: 12px;
            color: #000;
            background: #fff;
            padding: 5px;
            margin: 0;
            direction: rtl;
          }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .double-divider { border-top: 2px solid #000; margin: 8px 0; }
          .flex { display: flex; justify-content: space-between; margin: 3px 0; }
          .title { font-size: 16px; font-weight: 900; }
          .signature-box { margin-top: 30px; display: flex; justify-content: space-between; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="title">تقرير إغلاق الوردية (Z-Report)</div>
          <div style="font-size: 11px; margin-top: 3px;">TriPro ERP — نقاط البيع</div>
        </div>
        <div class="divider"></div>
        <div class="flex"><span>الكاشير:</span><span>${cashierName}</span></div>
        <div class="flex"><span>تاريخ الطباعة:</span><span>${new Date().toLocaleDateString('ar-EG')} ${new Date().toLocaleTimeString('ar-EG')}</span></div>
        <div class="flex"><span>حركات البيع:</span><span>${shiftSummary?.order_count || 0} حركة</span></div>
        <div class="divider"></div>

        <div class="font-bold" style="margin-bottom: 4px;">📊 مبيعات القنوات (Sales Channels):</div>
        <div class="flex"><span>مبيعات نقدية (Cash):</span><span>${cSales.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>بطاقات وشبكة (Card):</span><span>${kSales.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>إنستاباي (InstaPay):</span><span>${iSales.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>محافظ إلكترونية وفودافون كاش:</span><span>${wSales.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>عربونات وحجوزات مستهلكة:</span><span>${rDeposits.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>إجمالي الخصومات:</span><span>-${Number(shiftSummary?.total_discounts || 0).toFixed(2)} ج.م</span></div>
        <div class="divider"></div>
        <div class="flex font-bold" style="font-size: 13px;"><span>إجمالي المبيعات الكلية:</span><span>${gSales.toFixed(2)} ج.م</span></div>
        <div class="double-divider"></div>

        <div class="font-bold" style="margin-bottom: 4px;">🎯 حركة عربونات وحجوزات الوردية (Bookings & Deposits):</div>
        <div class="flex"><span>(+) استلام عربون نقداً بالدرج:</span><span>${cashDepositsIn.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(+) استلام عربون محفظة (فودافون كاش):</span><span>${walletDepositsIn.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(+) استلام عربون تحويل إنستاباي:</span><span>${instapayDepositsIn.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(+) استلام عربون بطاقة وشبكة:</span><span>${cardDepositsIn.toFixed(2)} ج.م</span></div>
        <div class="flex font-bold" style="background:#f1f5f9; padding:2px 4px; border-radius:4px;"><span>إجمالي العربونات المستلمة:</span><span>${totalDepositsIn.toFixed(2)} ج.م</span></div>
        <div class="flex" style="margin-top: 3px;"><span>(-) رد عربون ملغي نقداً من الدرج:</span><span>${cashDepositsRefund.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(-) رد عربون ملغي إلكتروني:</span><span>${(walletDepositsRefund + instapayDepositsRefund).toFixed(2)} ج.م</span></div>
        <div class="flex font-bold" style="background:#f1f5f9; padding:2px 4px; border-radius:4px;"><span>إجمالي العربونات المردودة للعملاء:</span><span>${totalDepositsRefund.toFixed(2)} ج.م</span></div>
        <div class="flex" style="margin-top: 3px;"><span>(~) تنفيذ حجز (عربونات مستهلكة):</span><span>${rDeposits.toFixed(2)} ج.م</span></div>
        <div class="double-divider"></div>

        <div class="font-bold" style="margin-bottom: 4px;">💵 حركة نقدية الدرج الفعلية (Drawer Cash Flow):</div>
        <div class="flex"><span>(+) الرصيد الافتتاحي (العهدة):</span><span>${openFloat.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(+) مبيعات نقدية مقبوضة:</span><span>${cSales.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(+) عربونات حجز مستلمة نقداً:</span><span>${cashDepositsIn.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(+) تزويد نقدية فكة بالدرج:</span><span>${pIns.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(-) مصروفات نثرية منصرفة:</span><span>${pOuts.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(-) توريدات نقدية للخزينة:</span><span>${sDrops.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(-) رد عربونات حجز ملغاة نقداً:</span><span>${cashDepositsRefund.toFixed(2)} ج.م</span></div>
        <div class="flex"><span>(-) مرتجعات مبيعات نقدية:</span><span>${cReturns.toFixed(2)} ج.م</span></div>
        <div class="divider"></div>
        <div class="flex font-bold"><span>النقدية المتوقعة بالدرج:</span><span>${expCash.toFixed(2)} ج.م</span></div>
        <div class="flex font-bold" style="font-size: 13px;"><span>النقدية الفعلية المحصورة:</span><span>${calculatedTotal.toFixed(2)} ج.م</span></div>
        <div class="flex font-bold" style="margin-top: 4px;">
          <span>الفارق (عجز / زيادة):</span>
          <span>${difference > 0 ? `+${difference.toFixed(2)} (فائض)` : difference < 0 ? `${difference.toFixed(2)} (عجز)` : '0.00 (متطابق ✔️)'} ج.م</span>
        </div>
        ${closingNotes ? `<div class="divider"></div><div style="font-size: 11px;"><strong>ملاحظات:</strong> ${closingNotes}</div>` : ''}
        
        <div class="signature-box">
          <div class="text-center">
            <div>توقيع الكاشير (المسلّم)</div>
            <div style="margin-top: 25px;">...................</div>
          </div>
          <div class="text-center">
            <div>توقيع المشرف (المستلم)</div>
            <div style="margin-top: 25px;">...................</div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="text-center" style="font-size: 10px; color: #555;">نظام TriPro ERP — معايير الرقابة المالية المزدوجة</div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const cashierName = shift?.cashier_name || currentUser?.full_name || 'الكاشير';
  const shiftStartTime = shift?.opened_at || currentShift?.start_time || new Date().toISOString();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden space-y-4 p-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800">
                {step === 'COUNT' ? 'الجرد الأعمى وإقفال وردية المطعم (Blind Close)' : 'تقرير مطابقة وردية المطعم'}
              </h3>
              <p className="text-xs text-slate-400">
                الكاشير: <span className="font-bold text-slate-700">{cashierName}</span> | البداية:{' '}
                {new Date(shiftStartTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          {step === 'RESULT' && (
            <button onClick={onSuccess} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {step === 'COUNT' ? (
          <div className="space-y-4 overflow-y-auto flex-1">
            {/* Blind Close Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-900">
              <EyeOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">بروتوكول الجرد الأعمى (Blind Drop Protocol):</span>
                <span>
                  لحماية النزاهة المحاسبية، يتم جرد النقدية بالدرج دون كشف المتوقع. سيقوم النظام بمطابقتها مع المبيعات المسجلة واحتساب أي عجز أو فائض وتوليد القيود آلياً.
                </span>
              </div>
            </div>

            {/* Switch Mode */}
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setBreakdownMode(true)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                  breakdownMode ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                }`}
              >
                تفنيط الفئات النقدية (200, 100...)
              </button>
              <button
                onClick={() => setBreakdownMode(false)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                  !breakdownMode ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                }`}
              >
                إدخال إجمالي النقدية مباشرة
              </button>
            </div>

            {/* Denomination Inputs */}
            {breakdownMode ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">فئة 200 جنيه</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 ورقة"
                    value={b200 || ''}
                    onChange={e => setB200(parseInt(e.target.value) || 0)}
                    className="w-full border rounded-xl p-2 font-bold text-center outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-0.5">{b200 * 200} ج</span>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">فئة 100 جنيه</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 ورقة"
                    value={b100 || ''}
                    onChange={e => setB100(parseInt(e.target.value) || 0)}
                    className="w-full border rounded-xl p-2 font-bold text-center outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-0.5">{b100 * 100} ج</span>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">فئة 50 جنيه</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 ورقة"
                    value={b50 || ''}
                    onChange={e => setB50(parseInt(e.target.value) || 0)}
                    className="w-full border rounded-xl p-2 font-bold text-center outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-0.5">{b50 * 50} ج</span>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">فئة 20 جنيه</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 ورقة"
                    value={b20 || ''}
                    onChange={e => setB20(parseInt(e.target.value) || 0)}
                    className="w-full border rounded-xl p-2 font-bold text-center outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-0.5">{b20 * 20} ج</span>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">فئة 10 جنيه</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 ورقة"
                    value={b10 || ''}
                    onChange={e => setB10(parseInt(e.target.value) || 0)}
                    className="w-full border rounded-xl p-2 font-bold text-center outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-0.5">{b10 * 10} ج</span>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">فكة وعملات معدنية</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="0 ج"
                    value={coins || ''}
                    onChange={e => setCoins(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded-xl p-2 font-bold text-center outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-0.5">{coins} ج</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-center">
                <label className="block text-slate-600 font-bold text-xs mb-2">إجمالي النقدية المعدودة في الدرج</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={directTotal || ''}
                  onChange={e => setDirectTotal(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-44 mx-auto text-3xl font-black border-2 border-slate-300 rounded-2xl p-2.5 text-center outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                />
              </div>
            )}

            {/* Total Display */}
            <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-100 flex justify-between items-center">
              <span className="font-bold text-xs text-rose-900">إجمالي النقدية المعدودة بالدرج:</span>
              <span className="text-2xl font-black text-rose-600 font-mono">{calculatedTotal.toFixed(2)} ج</span>
            </div>

            {/* Non-Cash Slip Reconciliation Section */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
              <span className="font-bold text-xs text-slate-700 block">مطابقة إيصالات الدفع الإلكتروني (اختياري):</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-slate-500 font-semibold mb-1 block">إجمالي بونات ماكينة الفيزا:</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={cardSlips}
                    onChange={e => setCardSlips(e.target.value)}
                    className="w-full border rounded-xl p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 font-semibold mb-1 block">إجمالي حركات انستاباي:</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={instapaySlips}
                    onChange={e => setInstapaySlips(e.target.value)}
                    className="w-full border rounded-xl p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات إقفال الوردية</label>
              <textarea
                value={closingNotes}
                onChange={e => setClosingNotes(e.target.value)}
                placeholder="أية ملاحظات خاصة بالوردية أو فروقات الجرد..."
                className="w-full border rounded-xl p-2 text-xs outline-none focus:ring-2 focus:ring-rose-500 h-14 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 pt-2 border-t">
              <button onClick={onClose} className="px-5 py-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-600">
                إلغاء
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleSubmitCount}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20"
              >
                <Lock className="w-4 h-4" /> اعتماد الجرد وإقفال الوردية
              </button>
            </div>
          </div>
        ) : (
          /* RESULT DISCLOSURE STEP */
          <div className="space-y-4 overflow-y-auto flex-1 animate-in zoom-in-95">
            {/* Status Alert */}
            <div
              className={`p-4 rounded-2xl border flex items-center gap-4 ${
                Math.abs(difference) <= 0.01
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : difference < 0
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              {Math.abs(difference) <= 0.01 ? (
                <CheckCircle2 className="w-9 h-9 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-9 h-9 text-red-600 flex-shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-sm">
                  {Math.abs(difference) <= 0.01
                    ? 'الدرج متطابق 100%! لا يوجد أي عجز أو زيادة 🎉'
                    : difference < 0
                    ? `عجز نقدي في الصندوق بقيمة ${Math.abs(difference).toFixed(2)} ج (ذمة كاشير)`
                    : `فائض نقدي في الصندوق بقيمة ${difference.toFixed(2)} ج (إيراد متنوع)`}
                </h4>
                <p className="text-[11px] opacity-80 mt-0.5">تم ترحيل القيد المحاسبي المجمع الشامل وإغلاق الوردية بنجاح</p>
              </div>
            </div>

            {/* Reconciliation Detailed Breakdown */}
            {(() => {
              const openingFloat = Number(shiftSummary?.opening_balance ?? shift?.opening_float ?? (currentShift?.opening_balance || 0));
              const cashSales = Number(shiftSummary?.cash_sales ?? shift?.total_cash_sales ?? 0);
              const cardSales = Number(shiftSummary?.card_sales ?? shift?.total_card_sales ?? 0);
              const instapaySales = Number(shiftSummary?.instapay_sales ?? 0);
              const walletSales = Number(shiftSummary?.wallet_sales ?? 0);
              const redeemedDeposits = Number(shiftSummary?.redeemed_deposits ?? 0);
              const paidIns = Number(shiftSummary?.paid_ins ?? 0);
              const paidOuts = Number(shiftSummary?.paid_outs ?? shiftSummary?.petty_cash ?? shift?.total_petty_cash_payouts ?? 0);
              const safeDrops = Number(shiftSummary?.safe_drops ?? shiftSummary?.cash_drops ?? 0);
              const cashReturns = Number(shiftSummary?.cash_returns ?? 0);
              const grossSales = Number(shiftSummary?.total_sales ?? shiftSummary?.gross_sales ?? 0);

              const expectedCash = shiftSummary?.expected_cash !== undefined
                ? Number(shiftSummary.expected_cash)
                : Number(Math.max(0, (openingFloat + cashSales + paidIns) - (paidOuts + safeDrops + cashReturns)).toFixed(2));

              return (
                <div className="space-y-3">
                  {/* Drawer Cash Due Box */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                    <span className="font-bold text-slate-800 block text-xs border-b pb-1.5">معادلة نقدية الدرج الفعلية (Cash Tray Due):</span>
                    
                    <div className="flex justify-between text-slate-600">
                      <span>رصيد عهدة البداية (Float):</span>
                      <span className="font-mono font-bold">{openingFloat.toFixed(2)} ج</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>المبيعات النقدية بالدرج:</span>
                      <span className="font-mono font-bold text-emerald-600">+{cashSales.toFixed(2)} ج</span>
                    </div>
                    {paidIns > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>إيداعات فكة / عربون نقدي:</span>
                        <span className="font-mono font-bold text-teal-600">+{paidIns.toFixed(2)} ج</span>
                      </div>
                    )}
                    {paidOuts > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>المصروفات النثرية المنصرفة:</span>
                        <span className="font-mono font-bold text-rose-600">-{paidOuts.toFixed(2)} ج</span>
                      </div>
                    )}
                    {safeDrops > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>توريدات نقدية للخزينة (Safe Drops):</span>
                        <span className="font-mono font-bold text-amber-600">-{safeDrops.toFixed(2)} ج</span>
                      </div>
                    )}
                    {cashReturns > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>مرتجعات نقدية من الدرج:</span>
                        <span className="font-mono font-bold text-red-600">-{cashReturns.toFixed(2)} ج</span>
                      </div>
                    )}

                    <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-800">
                      <span>النقدية المتوقعة دفترياً بالدرج:</span>
                      <span className="font-mono text-indigo-700">{expectedCash.toFixed(2)} ج</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>النقدية الفعلية بعد الجرد:</span>
                      <span className="font-mono text-rose-600">{calculatedTotal.toFixed(2)} ج</span>
                    </div>
                    <div
                      className={`border-t border-slate-200 pt-2 flex justify-between font-black text-sm ${
                        Math.abs(difference) <= 0.01 ? 'text-emerald-700' : difference < 0 ? 'text-red-600' : 'text-blue-600'
                      }`}
                    >
                      <span>الفارق الصافي (العجز / الزيادة):</span>
                      <span className="font-mono">{difference >= 0 ? `+${difference.toFixed(2)}` : difference.toFixed(2)} ج</span>
                    </div>
                  </div>

                  {/* Non-Cash Channels Summary */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
                    <span className="font-bold text-slate-800 block text-xs border-b pb-1.5">المتحصلات غير النقدية (Non-Cash Channels):</span>
                    <div className="grid grid-cols-2 gap-2 text-slate-600">
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1"><CreditCard size={13} /> فيزا وبطاقات:</span>
                        <span className="font-mono font-bold text-slate-800">{cardSales.toFixed(2)} ج</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1"><Zap size={13} /> انستاباي:</span>
                        <span className="font-mono font-bold text-slate-800">{instapaySales.toFixed(2)} ج</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1"><Smartphone size={13} /> محافظ إلكترونية:</span>
                        <span className="font-mono font-bold text-slate-800">{walletSales.toFixed(2)} ج</span>
                      </div>
                      {redeemedDeposits > 0 && (
                        <div className="flex justify-between">
                          <span className="flex items-center gap-1"><CalendarCheck size={13} /> عربون مستهلك:</span>
                          <span className="font-mono font-bold text-slate-800">{redeemedDeposits.toFixed(2)} ج</span>
                        </div>
                      )}
                    </div>
                    {Number(shiftSummary?.total_discounts || 0) > 0 && (
                      <div className="flex justify-between text-rose-700 font-bold">
                        <span>إجمالي خصومات وعروض الوردية (مسموح به):</span>
                        <span className="font-mono">-{Number(shiftSummary?.total_discounts || 0).toFixed(2)} ج</span>
                      </div>
                    )}
                    <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-slate-800 text-[11px]">
                      <span>إجمالي مبيعات الوردية الكلية (Gross Sales):</span>
                      <span className="font-mono font-black text-indigo-700">{grossSales.toFixed(2)} ج</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Done Action */}
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={handlePrintZReport}
                className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5"
              >
                <Printer size={15} />
                <span>طباعة ورقة الإغلاق (Z-Report)</span>
              </button>
              <button
                onClick={onSuccess}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow transition"
              >
                إغلاق والعودة لنقاط البيع
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default BlindShiftCloseModal;
