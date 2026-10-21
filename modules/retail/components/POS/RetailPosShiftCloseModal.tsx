import React, { useState } from 'react';
import { Lock, Loader2, CreditCard, Banknote, Smartphone, Zap, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import type { ShiftSummaryData } from '../../../../types';

export interface ShiftReconciliationPayload {
  card_slip_total: number;
  card_diff: number;
  instapay_slip_total: number;
  instapay_diff: number;
  wallet_slip_total: number;
  wallet_diff: number;
}

export interface RetailPosShiftCloseModalProps {
  isOpen: boolean;
  shiftSummary: ShiftSummaryData | null;
  currencySymbol: string;
  actualCash: number;
  setActualCash: (val: number) => void;
  closingNotes: string;
  setClosingNotes: (val: string) => void;
  isClosingShift: boolean;
  onClose: () => void;
  onConfirmCloseShift: (reconciliation?: ShiftReconciliationPayload) => void;
}

export const RetailPosShiftCloseModal: React.FC<RetailPosShiftCloseModalProps> = ({
  isOpen,
  shiftSummary,
  currencySymbol,
  actualCash,
  setActualCash,
  closingNotes,
  setClosingNotes,
  isClosingShift,
  onClose,
  onConfirmCloseShift
}) => {
  const [activeTab, setActiveTab] = useState<'CASH_DRAWER' | 'NON_CASH'>('CASH_DRAWER');

  // Slips reconciliation for non-cash channels
  const [cardSlips, setCardSlips] = useState<string>('');
  const [instapaySlips, setInstapaySlips] = useState<string>('');
  const [walletSlips, setWalletSlips] = useState<string>('');

  if (!isOpen || !shiftSummary) return null;

  // 1. استخراج الأرقام التفصيلية من الملخص
  const openingBalance = Number(shiftSummary.opening_balance || 0);
  const grossSales = Number(shiftSummary.total_sales || shiftSummary.gross_sales || 0);
  
  const cashSales = Number(shiftSummary.cash_sales || 0);
  const cardSales = Number(shiftSummary.card_sales || 0);
  const instapaySales = Number(shiftSummary.instapay_sales || 0);
  const walletSales = Number(shiftSummary.wallet_sales || 0);
  const redeemedDeposits = Number(shiftSummary.redeemed_deposits || 0);
  const creditSales = Number(shiftSummary.credit_sales || 0);

  const paidIns = Number(shiftSummary.paid_ins || 0);
  const paidOuts = Number(shiftSummary.paid_outs || shiftSummary.petty_cash || 0);
  const safeDrops = Number(shiftSummary.safe_drops || shiftSummary.cash_drops || 0);
  const cashReturns = Number(shiftSummary.cash_returns || 0);

  // المعادلة المستقلة الدقيقة لنقدية الدرج
  const expectedCash = Number(
    shiftSummary.expected_cash !== undefined
      ? shiftSummary.expected_cash
      : Math.max(0, (openingBalance + cashSales + paidIns) - (paidOuts + safeDrops + cashReturns))
  );

  const cashDiff = actualCash - expectedCash;

  // تسوية قنوات غير النقدي
  const cardSlipNum = cardSlips === '' ? cardSales : Number(cardSlips);
  const instapaySlipNum = instapaySlips === '' ? instapaySales : Number(instapaySlips);
  const walletSlipNum = walletSlips === '' ? walletSales : Number(walletSlips);

  const cardDiff = cardSlipNum - cardSales;
  const instapayDiff = instapaySlipNum - instapaySales;
  const walletDiff = walletSlipNum - walletSales;
  const totalNonCashDiff = cardDiff + instapayDiff + walletDiff;

  const handleConfirm = () => {
    const reconciliation: ShiftReconciliationPayload = {
      card_slip_total: cardSlipNum,
      card_diff: cardDiff,
      instapay_slip_total: instapaySlipNum,
      instapay_diff: instapayDiff,
      wallet_slip_total: walletSlipNum,
      wallet_diff: walletDiff
    };
    onConfirmCloseShift(reconciliation);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/70">
          <div>
            <h3 className="font-black text-lg text-white flex items-center gap-2">
              <Lock size={20} className="text-red-500" /> إغلاق الوردية وجرد النقدية والقنوات
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">مطابقة الدرج والقنوات الإلكترونية وفق المعادلة المحاسبية الموحدة</p>
          </div>
          <span className="text-[11px] font-mono bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700">
            {shiftSummary.order_count || 0} حركة بيع
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('CASH_DRAWER')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors border-b-2 ${
              activeTab === 'CASH_DRAWER'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Banknote size={16} />
            <span>نقدية الدرج والجرد الفعلي</span>
            {cashDiff !== 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${cashDiff > 0 ? 'bg-indigo-900 text-indigo-200' : 'bg-red-900 text-red-200'}`}>
                {cashDiff > 0 ? `+${cashDiff.toFixed(1)}` : cashDiff.toFixed(1)}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('NON_CASH')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors border-b-2 ${
              activeTab === 'NON_CASH'
                ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <CreditCard size={16} />
            <span>المتحصلات غير النقدية والإيصالات</span>
            {totalNonCashDiff !== 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-amber-900 text-amber-200">
                فارق {totalNonCashDiff.toFixed(1)}
              </span>
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {activeTab === 'CASH_DRAWER' ? (
            <>
              {/* Cash Equation Breakdown Cards */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                {/* 1. Opening */}
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="block text-slate-500 text-[11px] mb-0.5">رصيد افتتاحي (عهدة)</span>
                  <span className="font-mono font-bold text-sm text-slate-200">
                    {openingBalance.toFixed(2)} {currencySymbol}
                  </span>
                </div>

                {/* 2. Cash Sales */}
                <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-900/40">
                  <span className="block text-emerald-400 text-[11px] font-bold mb-0.5">مبيعات نقدية (درج)</span>
                  <span className="font-mono font-bold text-sm text-emerald-300">
                    +{cashSales.toFixed(2)} {currencySymbol}
                  </span>
                </div>

                {/* 3. Paid Ins */}
                <div className="bg-teal-950/30 p-2.5 rounded-xl border border-teal-900/40">
                  <span className="block text-teal-400 text-[11px] font-bold mb-0.5">إيداعات فكة / عربون</span>
                  <span className="font-mono font-bold text-sm text-teal-300">
                    +{paidIns.toFixed(2)} {currencySymbol}
                  </span>
                </div>

                {/* 4. Petty Cash Paid Outs */}
                <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-900/40">
                  <span className="block text-rose-400 text-[11px] font-bold mb-0.5">مصروفات نثرية</span>
                  <span className="font-mono font-bold text-sm text-rose-300">
                    -{paidOuts.toFixed(2)} {currencySymbol}
                  </span>
                </div>

                {/* 5. Safe Drops */}
                <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/40">
                  <span className="block text-amber-400 text-[11px] font-bold mb-0.5">توريدات للخزينة</span>
                  <span className="font-mono font-bold text-sm text-amber-300">
                    -{safeDrops.toFixed(2)} {currencySymbol}
                  </span>
                </div>

                {/* 6. Cash Returns */}
                <div className="bg-red-950/30 p-2.5 rounded-xl border border-red-900/40">
                  <span className="block text-red-400 text-[11px] font-bold mb-0.5">مرتجعات نقدية</span>
                  <span className="font-mono font-bold text-sm text-red-300">
                    -{cashReturns.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>

              {/* Equation Formula Explanation */}
              <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 font-mono text-center">
                Net Cash Due = (افتتاحي + كاش مبيعات + إيداعات) - (مصروفات + توريدات + مرتجعات)
              </div>

              {/* Net Cash Due Box */}
              <div className="flex justify-between items-center bg-slate-950 p-3.5 rounded-xl border border-indigo-900/50 shadow-inner">
                <div>
                  <span className="font-black text-sm text-slate-200 block">صافي النقدية المفترض بالدرج:</span>
                  <span className="text-[10px] text-slate-400">الرصيد الدفتري الواجب توريده</span>
                </div>
                <span className="font-mono font-black text-2xl text-indigo-400">
                  {expectedCash.toFixed(2)} {currencySymbol}
                </span>
              </div>

              {/* Actual Cash Input */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-black text-slate-300">المبلغ الفعلي بعد الجرد في الدرج</label>
                  <button
                    type="button"
                    onClick={() => setActualCash(expectedCash)}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-2.5 py-0.5 rounded-lg transition-all"
                  >
                    مطابق للمتوقع ({expectedCash.toFixed(2)})
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={actualCash !== undefined && actualCash !== null ? actualCash : ''}
                  onChange={e => setActualCash(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-2xl font-mono font-black text-white focus:border-indigo-500 outline-none"
                  placeholder="0.00"
                />
              </div>

              {/* Balance Difference Display */}
              <div className={`p-3 rounded-xl flex justify-between items-center text-sm font-bold border ${
                cashDiff === 0
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50'
                  : cashDiff > 0
                  ? 'bg-indigo-950/40 text-indigo-400 border-indigo-900/50'
                  : 'bg-red-950/40 text-red-400 border-red-900/50'
              }`}>
                <div className="flex items-center gap-2">
                  {cashDiff === 0 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <span>{cashDiff === 0 ? 'الدرج متطابق تماماً بدون عجز أو زيادة' : cashDiff > 0 ? 'فائض نقدية في الدرج (إيراد متنوع)' : 'عجز نقدية في الدرج (ذمة كاشير)'}</span>
                </div>
                <span className="font-mono text-base">
                  {cashDiff > 0 ? `+${cashDiff.toFixed(2)}` : cashDiff.toFixed(2)} {currencySymbol}
                </span>
              </div>
            </>
          ) : (
            /* Non-Cash Channels & Reconciliation Tab */
            <div className="space-y-3.5">
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs text-slate-300">
                <p className="font-bold text-white mb-1">مطابقة إيصالات الدفع الإلكتروني (Settlement Reconciliation):</p>
                <p className="text-[11px] text-slate-400">
                  أدخل إجمالي الإيصالات المطبوعة من ماكينة الفيزا ورصيد المحافظ للتأكد من عدم وجود عجز إلكتروني قبل الترحيل.
                </p>
              </div>

              {/* 1. Credit Card Channel */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-blue-400 flex items-center gap-1.5">
                    <CreditCard size={15} /> فيزا وشبكة (البنك):
                  </span>
                  <span className="font-mono text-slate-300">
                    مسجل بالنظام: <strong className="text-white">{cardSales.toFixed(2)}</strong> {currencySymbol} ({shiftSummary.card_count || 0} حركة)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`إجمالي بونات الماكينة (${cardSales.toFixed(2)})`}
                    value={cardSlips}
                    onChange={e => setCardSlips(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-blue-500"
                  />
                  <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${cardDiff === 0 ? 'bg-emerald-950/60 text-emerald-400' : 'bg-red-950/60 text-red-400'}`}>
                    {cardDiff === 0 ? 'متطابق ✓' : `فارق: ${cardDiff.toFixed(2)}`}
                  </div>
                </div>
              </div>

              {/* 2. InstaPay Channel */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <Zap size={15} /> إنستاباي InstaPay:
                  </span>
                  <span className="font-mono text-slate-300">
                    مسجل بالنظام: <strong className="text-white">{instapaySales.toFixed(2)}</strong> {currencySymbol} ({shiftSummary.instapay_count || 0} حركة)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`إجمالي حركات التطبيق (${instapaySales.toFixed(2)})`}
                    value={instapaySlips}
                    onChange={e => setInstapaySlips(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-amber-500"
                  />
                  <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${instapayDiff === 0 ? 'bg-emerald-950/60 text-emerald-400' : 'bg-red-950/60 text-red-400'}`}>
                    {instapayDiff === 0 ? 'متطابق ✓' : `فارق: ${instapayDiff.toFixed(2)}`}
                  </div>
                </div>
              </div>

              {/* 3. Wallets Channel */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-purple-400 flex items-center gap-1.5">
                    <Smartphone size={15} /> محافظ إلكترونية (فودافون/أورنج):
                  </span>
                  <span className="font-mono text-slate-300">
                    مسجل بالنظام: <strong className="text-white">{walletSales.toFixed(2)}</strong> {currencySymbol} ({shiftSummary.wallet_count || 0} حركة)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`إجمالي رسائل التحويل (${walletSales.toFixed(2)})`}
                    value={walletSlips}
                    onChange={e => setWalletSlips(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-purple-500"
                  />
                  <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${walletDiff === 0 ? 'bg-emerald-950/60 text-emerald-400' : 'bg-red-950/60 text-red-400'}`}>
                    {walletDiff === 0 ? 'متطابق ✓' : `فارق: ${walletDiff.toFixed(2)}`}
                  </div>
                </div>
              </div>

              {/* 4. Redeemed Customer Advances / Deposits */}
              {redeemedDeposits > 0 && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-teal-400 block">عربونات ودفعات مقدمة مستهلكة (Redeemed):</span>
                    <span className="text-[11px] text-slate-400">سداد غير نقدي يُثبت الإيراد دون طلب كاش من الدرج</span>
                  </div>
                  <span className="font-mono font-bold text-white text-sm">
                    {redeemedDeposits.toFixed(2)} {currencySymbol} ({shiftSummary.redeemed_count || 0} حركة)
                  </span>
                </div>
              )}

              {/* Discounts & Promotions Summary */}
              {Number(shiftSummary.total_discounts || 0) > 0 && (
                <div className="bg-rose-950/20 p-2.5 rounded-xl border border-rose-900/40 text-xs flex justify-between items-center">
                  <span className="text-rose-400 font-bold">إجمالي خصومات وعروض الوردية (الخصم المسموح به):</span>
                  <span className="font-mono font-bold text-rose-300">
                    -{Number(shiftSummary.total_discounts).toFixed(2)} {currencySymbol}
                  </span>
                </div>
              )}

              {/* Summary of Gross Sales */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
                <span className="text-slate-400 font-bold">إجمالي مبيعات الوردية الكلية (Gross Sales):</span>
                <span className="font-mono font-black text-indigo-400 text-base">
                  {grossSales.toFixed(2)} {currencySymbol}
                </span>
              </div>
            </div>
          )}

          {/* Closing Notes */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5">ملاحظات الإغلاق والمطابقة</label>
            <textarea
              value={closingNotes}
              onChange={e => setClosingNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs h-16 outline-none focus:border-indigo-500 placeholder:text-slate-700 text-white"
              placeholder="اكتب أي ملاحظة بشأن الجرد أو تسوية الماكينات..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-bold text-xs transition-all"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={isClosingShift}
            onClick={handleConfirm}
            className="w-2/3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-3 rounded-xl font-black text-xs transition-all flex justify-center items-center gap-1.5 shadow-lg shadow-red-950"
          >
            {isClosingShift && <Loader2 className="animate-spin" size={16} />}
            إغلاق الوردية وترحيل القيد المجمع
          </button>
        </div>
      </div>
    </div>
  );
};

export default RetailPosShiftCloseModal;
