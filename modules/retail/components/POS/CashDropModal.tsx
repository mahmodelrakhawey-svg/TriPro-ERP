import React, { useState } from 'react';
import { Banknote, ShieldCheck, Printer, X, AlertCircle } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';

interface CashDropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number, reason: string, receiverName: string) => void;
  currentDrawerTotal: number;
  cashierName: string;
}

export default function CashDropModal({
  isOpen,
  onClose,
  onConfirm,
  currentDrawerTotal,
  cashierName
}: CashDropModalProps) {
  const { showToast } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('تسليم نقدية فائضة لخزينة الإدارة');
  const [receiverName, setReceiverName] = useState<string>('');
  const [supervisorPin, setSupervisorPin] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('يرجى إدخال مبلغ صحيح لسحب النقدية', 'error');
      return;
    }
    if (numAmount > currentDrawerTotal) {
      if (!window.confirm(`المبلغ المدخل (${numAmount}) أكبر من الرصيد التقديري في الدرج (${currentDrawerTotal}). هل ترغب في المتابعة؟`)) {
        return;
      }
    }
    if (!receiverName.trim()) {
      showToast('يرجى إدخال اسم المستلم من الإدارة/المشرف', 'error');
      return;
    }
    const validPins = ['1234', '9999', '0000'];
    if (supervisorPin && !validPins.includes(supervisorPin)) {
      showToast('رمز المشرف غير صحيح', 'error');
      return;
    }

    onConfirm(numAmount, reason, receiverName);
    showToast(`تم تسجيل سحب نقدية بمبلغ ${numAmount.toFixed(2)} ج.م بنجاح ✅`, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Banknote size={24} className="text-amber-200" />
            <span>سحب نقدية من الدرج (Cash Drop)</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">تفريغ النقدية الزائدة أثناء الوردية</p>
              <p className="text-amber-800 leading-relaxed">
                يتم استخدام هذه الخاصية لتسليم مبالغ من الدرج إلى خزينة الإدارة لتقليل مخاطر وجود مبالغ كبيرة في الصالة، وسيتم خصم المبلغ من الرصيد المتوقع عند إغلاق الشفت.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">الكاشير المسلم:</span>
              <span className="font-bold text-slate-800">{cashierName}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">الرصيد التقديري بالدرج:</span>
              <span className="font-bold text-emerald-600 text-sm">{currentDrawerTotal.toFixed(2)} ج.م</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المراد سحبه (ج.م) *</label>
            <input
              type="number"
              step="0.01"
              min="1"
              autoFocus
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="مثال: 5000"
              className="w-full px-3 py-2.5 text-lg font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-left"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المشرف / المستلم بالإدارة *</label>
            <input
              type="text"
              required
              value={receiverName}
              onChange={e => setReceiverName(e.target.value)}
              placeholder="اسم الشخص المستلم للخزينة"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">السبب / البيان</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رمز PIN المشرف (للاعتماد)</label>
            <input
              type="password"
              value={supervisorPin}
              onChange={e => setSupervisorPin(e.target.value)}
              placeholder="1234"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-sm transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="w-1/2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Printer size={16} />
              <span>تأكيد وطباعة الإيصال</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
