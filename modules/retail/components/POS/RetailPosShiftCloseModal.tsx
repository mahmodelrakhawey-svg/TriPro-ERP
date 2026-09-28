import React from 'react';
import { Lock, Loader2 } from 'lucide-react';

export interface RetailPosShiftCloseModalProps {
  isOpen: boolean;
  shiftSummary: any;
  currencySymbol: string;
  actualCash: number;
  setActualCash: (val: number) => void;
  closingNotes: string;
  setClosingNotes: (val: string) => void;
  isClosingShift: boolean;
  onClose: () => void;
  onConfirmCloseShift: () => void;
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
  if (!isOpen || !shiftSummary) return null;

  const expectedCash = Number(shiftSummary.expected_cash || 0);
  const diff = actualCash - expectedCash;

  return (
    <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <h3 className="font-black text-lg text-white flex items-center gap-2">
            <Lock size={20} className="text-red-500" /> إغلاق الوردية وجرد النقدية
          </h3>
        </div>
        <div className="p-6 space-y-6">
          
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
              <span className="block text-slate-500 mb-0.5">الرصيد الافتتاحي</span>
              <span className="font-mono font-bold text-base text-slate-200">
                {Number(shiftSummary.opening_balance || 0).toFixed(2)} {currencySymbol}
              </span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
              <span className="block text-slate-500 mb-0.5">إجمالي المبيعات (الكلية)</span>
              <span className="font-mono font-bold text-base text-white">
                {Number(shiftSummary.total_sales || (Number(shiftSummary.cash_sales || 0) + Number(shiftSummary.card_sales || 0))).toFixed(2)} {currencySymbol}
              </span>
            </div>
            <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-900/40">
              <span className="block text-emerald-400 font-bold mb-0.5">مبيعات نقدية (كاش الدرج)</span>
              <span className="font-mono font-bold text-base text-emerald-300">
                +{Number(shiftSummary.cash_sales !== undefined ? shiftSummary.cash_sales : (shiftSummary.total_sales - (shiftSummary.card_sales || 0))).toFixed(2)} {currencySymbol}
              </span>
            </div>
            <div className="bg-blue-950/30 p-2.5 rounded-xl border border-blue-900/40">
              <span className="block text-blue-400 font-bold mb-0.5">💳 مبيعات فيزا وشبكة (البنك)</span>
              <span className="font-mono font-bold text-base text-blue-300">
                +{Number(shiftSummary.card_sales || 0).toFixed(2)} {currencySymbol}
              </span>
            </div>
            <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-900/40">
              <span className="block text-rose-400 font-bold mb-0.5">مرتجعات نقدية من الدرج</span>
              <span className="font-mono font-bold text-base text-rose-300">
                -{Number(shiftSummary.cash_returns || 0).toFixed(2)} {currencySymbol}
              </span>
            </div>
            <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/40">
              <span className="block text-amber-400 font-bold mb-0.5">سحوبات نقدية (تفريغ)</span>
              <span className="font-mono font-bold text-base text-amber-300">
                -{Number(shiftSummary.cash_drops || 0).toFixed(2)} {currencySymbol}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-800/60 pt-4 space-y-4">
            <div className="flex justify-between items-center bg-slate-950/60 p-3.5 rounded-xl border border-indigo-900/40 shadow-inner">
              <div>
                <span className="font-black text-sm text-slate-200 block">صافي النقدية المتوقع بالدرج:</span>
                <span className="text-[10px] text-slate-400">(افتتاحي + كاش مبيعات - مرتجعات - سحوبات)</span>
              </div>
              <span className="font-mono font-black text-2xl text-indigo-400">{expectedCash.toFixed(2)} {currencySymbol}</span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-black text-slate-400">المبلغ الفعلي المقبوض في الدرج</label>
                <button
                  type="button"
                  onClick={() => setActualCash(expectedCash)}
                  className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded-lg transition-all"
                >
                  مطابق للمتوقع ({expectedCash.toFixed(2)})
                </button>
              </div>
              <input 
                type="number" 
                value={actualCash !== undefined && actualCash !== null ? actualCash : ''} 
                onChange={e => setActualCash(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-2xl font-mono font-black text-white focus:border-indigo-500 outline-none"
                placeholder="0.00"
              />
            </div>

            {/* Balance Difference */}
            <div className={`p-3 rounded-xl flex justify-between items-center text-sm font-bold ${
              diff === 0 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50' :
              diff > 0 ? 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/50' : 'bg-red-950/40 text-red-400 border border-red-900/50'
            }`}>
              <span>العجز / الزيادة:</span>
              <span className="font-mono">{diff.toFixed(2)} {currencySymbol}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-400 mb-2">ملاحظات الإغلاق</label>
            <textarea 
              value={closingNotes}
              onChange={e => setClosingNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm h-20 outline-none focus:border-indigo-500 placeholder:text-slate-700"
              placeholder="اكتب أي عجز أو ملاحظة خاصة بجرد الدرج..."
            />
          </div>

          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="w-1/2 bg-slate-950 hover:bg-slate-850 text-slate-400 py-3 rounded-xl font-bold border border-slate-800 transition-all"
            >
              إلغاء
            </button>
            <button 
              disabled={isClosingShift}
              onClick={onConfirmCloseShift}
              className="w-1/2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-3 rounded-xl font-black transition-all flex justify-center items-center gap-1.5"
            >
              {isClosingShift && <Loader2 className="animate-spin" size={16} />}
              إغلاق الوردية والترحيل
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default RetailPosShiftCloseModal;
