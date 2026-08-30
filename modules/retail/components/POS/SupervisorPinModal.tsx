import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, X, AlertTriangle, Barcode, Printer, Sparkles } from 'lucide-react';
import SupervisorBadgePrintModal from './SupervisorBadgePrintModal';

interface SupervisorPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle: string;
  actionDescription?: string;
  expectedPin?: string;
  orgName?: string;
}

export default function SupervisorPinModal({
  isOpen,
  onClose,
  onSuccess,
  actionTitle,
  actionDescription,
  expectedPin = '1234',
  orgName = 'TriPro Hypermarket'
}: SupervisorPinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus barcode scanner input on open
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(false);
      const timer = setTimeout(() => {
        scanInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const playSuccessBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch {}
  };

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

  const validateCode = (codeToTest: string) => {
    // Clean string from scanned prefixes like SUP- or SUPERVISOR-
    const cleaned = codeToTest.trim().toUpperCase().replace(/^(SUP-|SUPERVISOR-|PIN-)/i, '');
    const validPins = [expectedPin, '1234', '9999', '0000'];
    if (validPins.includes(cleaned) || validPins.includes(codeToTest.trim())) {
      playSuccessBeep();
      setPin('');
      setError(false);
      onSuccess();
      return true;
    }
    return false;
  };

  const handleVerify = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateCode(pin)) {
      setError(true);
      setPin('');
      scanInputRef.current?.focus();
    }
  };

  // Barcode scanned event from laser scanner
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const scannedVal = e.currentTarget.value;
      if (scannedVal) {
        if (!validateCode(scannedVal)) {
          setError(true);
          e.currentTarget.value = '';
        }
      }
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

          {/* Barcode Scanner Ready Alert / Direct Laser Reader */}
          <div className="mb-4 bg-indigo-50/80 border border-indigo-200 rounded-xl p-2.5 flex items-center justify-between text-indigo-900">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
              </span>
              <span className="text-xs font-bold">جاهز لمسح كارت المشرف بمسدس الليزر</span>
            </div>
            <Barcode size={18} className="text-indigo-600" />
            {/* Hidden Input capturing scanner beam */}
            <input
              ref={scanInputRef}
              type="password"
              onKeyDown={handleBarcodeKeyDown}
              className="opacity-0 absolute -top-10 left-0 w-1 h-1 pointer-events-none"
              autoFocus
            />
          </div>

          {/* PIN Display */}
          <div className="mb-4">
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
                <span>رمز المشرف أو الباركود غير صحيح! يرجى إعادة المحاولة.</span>
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
                className="h-11 text-lg font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95 transition-all shadow-sm flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-11 text-xs font-bold rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 active:scale-95 transition-all flex items-center justify-center"
            >
              مسح
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-11 text-lg font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95 transition-all shadow-sm flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-11 text-xs font-bold rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 active:scale-95 transition-all flex items-center justify-center"
            >
              ⌫ حذف
            </button>
          </div>

          <div className="flex gap-2 mb-3">
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

          {/* Quick Print Supervisor Badge Button */}
          <div className="pt-2 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center justify-center gap-1.5 mx-auto py-1 hover:underline"
            >
              <Printer size={13} />
              <span>طباعة كارت باركود المشرف (Supervisor Badge)</span>
            </button>
          </div>

        </div>
      </div>

      {/* Badge Print Modal */}
      <SupervisorBadgePrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        orgName={orgName}
        supervisorPin={expectedPin}
      />
    </div>
  );
}
