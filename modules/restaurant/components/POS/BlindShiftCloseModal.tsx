import React, { useState } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  CashierShift,
  CashDenominationBreakdown,
  cashShiftService
} from '../../../../services/cashShiftService';
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
  Sparkles
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
  const { accounts, currentUser } = useAccounting();
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

  // Result state
  const [resultShift, setResultShift] = useState<CashierShift | null>(null);
  const [difference, setDifference] = useState<number>(0);

  const calculatedTotal = breakdownMode
    ? b200 * 200 + b100 * 100 + b50 * 50 + b20 * 20 + b10 * 10 + b5 * 5 + coins
    : directTotal;

  const handleSubmitCount = async () => {
    if (calculatedTotal <= 0) {
      if (!confirm('المبلغ المدخل 0 ج. هل أنت متأكد من المتابعة بالجرد؟')) return;
    }

    const cashAcc = accounts.find(a => a.name.includes('صندوق') || a.name.includes('نقدية') || a.code === '1101');
    const shortAcc = accounts.find(a => a.name.includes('عجز') || a.name.includes('فروقات') || a.code === '5209');

    try {
      const res = await cashShiftService.submitBlindClose({
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
        organizationId: currentUser?.organization_id || undefined,
        cashAccountId: cashAcc?.id,
        shortageOverAccountId: shortAcc?.id
      });

      setResultShift(res.shift);
      setDifference(res.difference);
      setStep('RESULT');
      showToast('تم اعتماد الجرد الأعمى وإقفال الوردية بنجاح 🔒', 'success');
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden space-y-4 p-6">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800">
                {step === 'COUNT' ? 'الجرد الأعمى وإقفال الوردية (Blind Close)' : 'تقرير مطابقة الوردية'}
              </h3>
              <p className="text-xs text-slate-400">
                الكاشير: <span className="font-bold text-slate-700">{shift.cashier_name}</span> | البداية:{' '}
                {new Date(shift.opened_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
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
          <div className="space-y-5">
            {/* Blind Close Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
              <EyeOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">نظام الجرد الأعمى (Blind Drop Protocol):</span>
                <span>
                  لحماية النزاهة ودقة الحسابات، يتم إدخال النقدية الفعلية الموجودة في الدرج بالكامل. سيقوم النظام بمطابقتها مع المبيعات المسجلة وإظهار الفروقات آلياً بعد الاعتماد.
                </span>
              </div>
            </div>

            {/* Switch Mode */}
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setBreakdownMode(true)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                  breakdownMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                تفنيط الفئات النقدية (200, 100...)
              </button>
              <button
                onClick={() => setBreakdownMode(false)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                  !breakdownMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                إدخال إجمالي النقدية مباشرة
              </button>
            </div>

            {/* Denomination Inputs */}
            {breakdownMode ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
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
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-center">
                <label className="block text-slate-600 font-bold text-sm mb-2">إجمالي النقدية المعدودة في الدرج</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={directTotal || ''}
                  onChange={e => setDirectTotal(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-48 mx-auto text-3xl font-black border-2 border-slate-300 rounded-2xl p-3 text-center outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                />
              </div>
            )}

            {/* Total Display */}
            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 flex justify-between items-center">
              <span className="font-bold text-sm text-rose-900">إجمالي النقدية المعدودة:</span>
              <span className="text-2xl font-black text-rose-600 font-mono">{calculatedTotal.toFixed(2)} ج</span>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات إقفال الوردية</label>
              <textarea
                value={closingNotes}
                onChange={e => setClosingNotes(e.target.value)}
                placeholder="أية ملاحظات خاصة بالوردية..."
                className="w-full border rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-rose-500 h-16 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button onClick={onClose} className="px-5 py-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-600">
                إلغاء
              </button>
              <button
                onClick={handleSubmitCount}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20"
              >
                <Lock className="w-4 h-4" /> اعتماد الجرد وإقفال الوردية
              </button>
            </div>
          </div>
        ) : (
          /* RESULT DISCLOSURE STEP */
          <div className="space-y-5 animate-in zoom-in-95">
            {/* Status Alert */}
            <div
              className={`p-5 rounded-2xl border flex items-center gap-4 ${
                Math.abs(difference) <= 0.01
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : difference < 0
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              {Math.abs(difference) <= 0.01 ? (
                <CheckCircle2 className="w-10 h-10 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-10 h-10 text-red-600 flex-shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-base">
                  {Math.abs(difference) <= 0.01
                    ? 'الوردية متطابقة 100%! لا يوجد أي عجز أو زيادة 🎉'
                    : difference < 0
                    ? `يوجد عجز نقدي في الصندوق بقيمة ${Math.abs(difference).toFixed(2)} ج`
                    : `توجد زيادة نقدية في الصندوق بقيمة ${difference.toFixed(2)} ج`}
                </h4>
                <p className="text-xs opacity-80 mt-0.5">تم إنشاء سجل الإقفال والقيود المحاسبية التلقائية بنجاح</p>
              </div>
            </div>

            {/* Reconciliation Numbers */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>رصيد عهدة البداية (Float):</span>
                <span className="font-mono font-bold">{shift.opening_float.toFixed(2)} ج</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>إجمالي المبيعات النقدية:</span>
                <span className="font-mono font-bold text-emerald-600">+{shift.total_cash_sales.toFixed(2)} ج</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>المبيعات الإلكترونية (فيزا / بطاقات):</span>
                <span className="font-mono font-bold text-indigo-600">{shift.total_card_sales.toFixed(2)} ج</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>المصروفات النثرية المسحوبة من الدرج:</span>
                <span className="font-mono font-bold text-rose-600">-{shift.total_petty_cash_payouts.toFixed(2)} ج</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-800 text-sm">
                <span>النقدية المتوقعة في الدرج (System Expected):</span>
                <span className="font-mono">{shift.expected_cash_in_drawer.toFixed(2)} ج</span>
              </div>
              <div className="flex justify-between font-bold text-slate-800 text-sm">
                <span>النقدية الفعلية بالجرد (Actual Counted):</span>
                <span className="font-mono text-rose-600">{calculatedTotal.toFixed(2)} ج</span>
              </div>
              <div
                className={`border-t border-slate-200 pt-2 flex justify-between font-black text-base ${
                  Math.abs(difference) <= 0.01 ? 'text-emerald-700' : difference < 0 ? 'text-red-600' : 'text-blue-600'
                }`}
              >
                <span>الفارق الصافي (Difference):</span>
                <span className="font-mono">{difference >= 0 ? `+${difference.toFixed(2)}` : difference.toFixed(2)} ج</span>
              </div>
            </div>

            {/* Done Action */}
            <div className="flex justify-end pt-2">
              <button
                onClick={onSuccess}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow"
              >
                إغلاق والعودة للرئيسية
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default BlindShiftCloseModal;
