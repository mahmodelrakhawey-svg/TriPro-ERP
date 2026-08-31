import React, { useState, useEffect } from 'react';
import { useToast } from '../../../../context/ToastContext';
import { 
  X, CheckCircle, CreditCard, Banknote, UserCheck, 
  Gift, Percent, AlertCircle, ArrowRight, ShieldCheck 
} from 'lucide-react';

export interface SplitPaymentDetails {
  cash: number;
  card: number;
  credit: number;
  loyalty: number;
  couponDiscount: number;
  couponCode?: string;
  loyaltyPointsUsed?: number;
  cashReceived: number; // For cash change calculation
}

interface SplitPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  selectedCustomer: any | null;
  currencySymbol: string;
  onConfirm: (details: SplitPaymentDetails) => void;
  couponDiscount?: number;
  couponCode?: string;
}

export default function SplitPaymentModal({
  isOpen,
  onClose,
  totalAmount,
  selectedCustomer,
  currencySymbol,
  onConfirm,
  couponDiscount = 0,
  couponCode = ''
}: SplitPaymentModalProps) {
  const { showToast } = useToast();
  const [cash, setCash] = useState<number>(0);
  const [card, setCard] = useState<number>(0);
  const [credit, setCredit] = useState<number>(0);
  const [loyalty, setLoyalty] = useState<number>(0);
  const [cashReceived, setCashReceived] = useState<number>(0);

  // حساب النقاط المتاحة للعميل (مثال: كل نقطة = 1 جنيه)
  const customerPoints = selectedCustomer?.loyalty_points || 0;
  const maxLoyaltyValue = Math.min(customerPoints, totalAmount - couponDiscount);

  // إعادة ضبط القيم عند الفتح
  useEffect(() => {
    if (isOpen) {
      const netTotal = Math.max(0, totalAmount - couponDiscount);
      setCash(netTotal);
      setCashReceived(netTotal);
      setCard(0);
      setCredit(0);
      setLoyalty(0);
    }
  }, [isOpen, totalAmount, couponDiscount]);

  if (!isOpen) return null;

  const totalPaid = Number(cash || 0) + Number(card || 0) + Number(credit || 0) + Number(loyalty || 0) + Number(couponDiscount || 0);
  const remaining = Math.max(0, Number((totalAmount - totalPaid).toFixed(2)));
  const isFullyCovered = totalPaid >= totalAmount - 0.01;
  const cashChange = Math.max(0, (cashReceived || 0) - (cash || 0));

  const handleFillRemaining = (type: 'cash' | 'card' | 'credit') => {
    const currentOthers = totalPaid - (type === 'cash' ? cash : type === 'card' ? card : credit);
    const need = Math.max(0, totalAmount - currentOthers);
    if (type === 'cash') {
      setCash(need);
      setCashReceived(need);
    } else if (type === 'card') {
      setCard(need);
    } else if (type === 'credit') {
      if (!selectedCustomer) {
        showToast('يجب تحديد عميل أولاً لاستخدام الدفع الآجل', 'warning');
        return;
      }
      setCredit(need);
    }
  };

  const handleApplyLoyalty = () => {
    if (!selectedCustomer) {
      showToast('يجب تحديد عميل لاستبدال نقاط الولاء', 'warning');
      return;
    }
    const currentWithoutLoyalty = totalPaid - loyalty;
    const needed = Math.max(0, totalAmount - currentWithoutLoyalty);
    const pointsToUse = Math.min(maxLoyaltyValue, needed);
    setLoyalty(pointsToUse);
    // ضبط الكاش إن كان يغطي الزيادة
    if (cash > 0) {
      setCash(Math.max(0, cash - pointsToUse));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFullyCovered) {
      showToast(`المبلغ المسدد (${totalPaid.toFixed(2)}) أقل من إجمالي الفاتورة (${totalAmount.toFixed(2)})!`, 'error');
      return;
    }
    if (credit > 0 && !selectedCustomer) {
      showToast('لا يمكن تسجيل مبلغ آجل بدون اختيار عميل مسجل!', 'error');
      return;
    }
    onConfirm({
      cash: Number(cash) || 0,
      card: Number(card) || 0,
      credit: Number(credit) || 0,
      loyalty: Number(loyalty) || 0,
      couponDiscount: Number(couponDiscount) || 0,
      couponCode,
      loyaltyPointsUsed: Number(loyalty) || 0,
      cashReceived: Number(cashReceived) || Number(cash) || 0
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-slate-950 p-4 px-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <CreditCard size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">تعدد طرق الدفع (Split Payment)</h2>
              <p className="text-xs text-slate-400">تقسيم سداد الفاتورة بين الكاش، الفيزا، الآجل، ونقاط الولاء</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Total Summary Banner */}
        <div className="p-4 px-6 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs text-slate-400 font-bold">إجمالي الفاتورة المطلوب</div>
            <div className="text-2xl font-black text-amber-400 font-mono">
              {totalAmount.toFixed(2)} <span className="text-sm font-normal">{currencySymbol}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <div className="text-xs text-slate-400 font-bold">المسدد حتى الآن</div>
              <div className={`text-xl font-black font-mono ${isFullyCovered ? 'text-emerald-400' : 'text-slate-300'}`}>
                {totalPaid.toFixed(2)} <span className="text-xs font-normal">{currencySymbol}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 font-bold">المتبقي المطلوب</div>
              <div className={`text-xl font-black font-mono ${remaining > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {remaining.toFixed(2)} <span className="text-xs font-normal">{currencySymbol}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Coupon Display if applied */}
          {couponDiscount > 0 && (
            <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl flex items-center justify-between text-amber-300 text-sm font-bold">
              <div className="flex items-center gap-2">
                <Percent size={16} />
                <span>كوبون خصم مفعّل: <code className="bg-amber-900/60 px-1.5 py-0.5 rounded font-mono">{couponCode}</code></span>
              </div>
              <span className="font-mono font-black">-{couponDiscount.toFixed(2)} {currencySymbol}</span>
            </div>
          )}

          {/* 1. Cash Payment */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-black text-slate-200 flex items-center gap-2">
                <Banknote size={18} className="text-emerald-400" />
                الدفع نقداً (Cash)
              </label>
              <button
                type="button"
                onClick={() => handleFillRemaining('cash')}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-bold hover:underline"
              >
                تخصيص المتبقي كاش
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">المبلغ المحسوب من الفاتورة</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cash || ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value) || 0;
                    setCash(val);
                    if (cashReceived < val) setCashReceived(val);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold focus:border-indigo-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">المبلغ المستلم من العميل (لحساب الباقي)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashReceived || ''}
                  onChange={e => setCashReceived(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-emerald-400 font-mono font-bold focus:border-indigo-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>
            {cashChange > 0 && (
              <div className="text-xs text-emerald-400 font-bold flex items-center justify-between pt-1">
                <span>المتبقي للعميل (الفكة):</span>
                <span className="font-mono text-sm">{cashChange.toFixed(2)} {currencySymbol}</span>
              </div>
            )}
          </div>

          {/* 2. Card / POS Payment */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-black text-slate-200 flex items-center gap-2">
                <CreditCard size={18} className="text-sky-400" />
                بطاقة بنكية / فيزا (Card / POS)
              </label>
              <button
                type="button"
                onClick={() => handleFillRemaining('card')}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-bold hover:underline"
              >
                تخصيص المتبقي فيزا
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={card || ''}
              onChange={e => setCard(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold focus:border-indigo-500 focus:outline-none"
              placeholder="0.00"
            />
          </div>

          {/* 3. Customer Credit / الآجل */}
          <div className={`p-3.5 border rounded-xl space-y-2 ${selectedCustomer ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-950/30 border-slate-900 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="text-sm font-black text-slate-200 flex items-center gap-2">
                <UserCheck size={18} className="text-purple-400" />
                حساب العميل (آجل / على الحساب)
                {selectedCustomer && (
                  <span className="text-xs text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded font-normal">
                    {selectedCustomer.name}
                  </span>
                )}
              </label>
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={() => handleFillRemaining('credit')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-bold hover:underline"
                >
                  تخصيص المتبقي آجل
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={!selectedCustomer}
              value={credit || ''}
              onChange={e => setCredit(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold focus:border-indigo-500 focus:outline-none disabled:bg-slate-950 disabled:text-slate-600"
              placeholder={selectedCustomer ? "0.00" : "اختر عميلاً أولاً لتفعيل الآجل"}
            />
          </div>

          {/* 4. Loyalty Points / نقاط الولاء */}
          {selectedCustomer && customerPoints > 0 && (
            <div className="p-3.5 bg-amber-950/20 border border-amber-800/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-black text-amber-300 flex items-center gap-2">
                  <Gift size={18} className="text-amber-400" />
                  استبدال نقاط الولاء (رصيد العميل: {customerPoints} نقطة)
                </label>
                <button
                  type="button"
                  onClick={handleApplyLoyalty}
                  className="text-xs bg-amber-600 hover:bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded transition-all"
                >
                  استبدال النقاط
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                max={maxLoyaltyValue}
                value={loyalty || ''}
                onChange={e => setLoyalty(Math.min(maxLoyaltyValue, parseFloat(e.target.value) || 0))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-amber-300 font-mono font-bold focus:border-amber-500 focus:outline-none"
                placeholder="0.00"
              />
            </div>
          )}

          {/* Progress / Completion Status */}
          <div className="pt-2">
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
              {cash > 0 && <div style={{ width: `${Math.min(100, (cash / totalAmount) * 100)}%` }} className="bg-emerald-500" title="كاش" />}
              {card > 0 && <div style={{ width: `${Math.min(100, (card / totalAmount) * 100)}%` }} className="bg-sky-500" title="فيزا" />}
              {credit > 0 && <div style={{ width: `${Math.min(100, (credit / totalAmount) * 100)}%` }} className="bg-purple-500" title="آجل" />}
              {loyalty > 0 && <div style={{ width: `${Math.min(100, (loyalty / totalAmount) * 100)}%` }} className="bg-amber-500" title="ولاء" />}
              {couponDiscount > 0 && <div style={{ width: `${Math.min(100, (couponDiscount / totalAmount) * 100)}%` }} className="bg-rose-500" title="كوبون" />}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-between border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition-all"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={!isFullyCovered}
              className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <CheckCircle size={18} />
              اعتماد السداد وطباعة الفاتورة
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
