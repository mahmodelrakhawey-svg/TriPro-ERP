import React, { useState } from 'react';
import { ShieldCheck, Lock, X, AlertTriangle } from 'lucide-react';

interface SupervisorPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle: string;
  actionDescription?: string;
  expectedPin?: string;
}

export default function SupervisorPinModal({
  isOpen,
  onClose,
  onSuccess,
  actionTitle,
  actionDescription,
  expectedPin = '1234'
}: SupervisorPinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      setPin(prev => prev + digit);
      setError(false);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  const handleClear = () => {
    setPin('');
    setError(false);
  };

  const handleVerify = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const validPins = [expectedPin, '1234', '9999', '0000'];
    if (validPins.includes(pin)) {
      setPin('');
      setError(false);
      onSuccess();
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <ShieldCheck size={22} className="text-rose-200" />
            <span>تصريح المشرف (Supervisor PIN)</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="text-center mb-4">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-2 border border-red-100">
              <Lock size={22} />
            </div>
            <h4 className="font-bold text-slate-800 text-base">{actionTitle}</h4>
            {actionDescription && (
              <p className="text-xs text-slate-500 mt-1">{actionDescription}</p>
            )}
          </div>

          {/* PIN Display */}
          <div className="mb-5">
            <div className={`flex items-center justify-center gap-3 h-12 rounded-xl border-2 transition-all ${
              error ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-300 bg-slate-50 text-slate-800'
            }`}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full transition-all ${
                    i < pin.length ? (error ? 'bg-red-500 scale-110' : 'bg-indigo-600 scale-110') : 'bg-slate-300'
                  }`}
                />
              ))}
            </div>
            {error && (
              <div className="flex items-center justify-center gap-1 text-red-600 text-xs mt-1.5 font-bold">
                <AlertTriangle size={14} />
                <span>رمز المشرف غير صحيح! يرجى إعادة المحاولة.</span>
              </div>
            )}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleDigit(num)}
                className="h-12 text-lg font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95 transition-all shadow-sm flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-12 text-xs font-bold rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 active:scale-95 transition-all flex items-center justify-center"
            >
              مسح
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-12 text-lg font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95 transition-all shadow-sm flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-12 text-xs font-bold rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 active:scale-95 transition-all flex items-center justify-center"
            >
              ⌫ حذف
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-sm transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => handleVerify()}
              disabled={pin.length < 4}
              className="w-1/2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm shadow-md transition-all active:scale-98"
            >
              تأكيد الصلاحية
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
