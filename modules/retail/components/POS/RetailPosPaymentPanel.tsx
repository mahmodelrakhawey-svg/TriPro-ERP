import React from 'react';
import { User, Gift, Ticket, Coins, Printer, Pause, Loader2 } from 'lucide-react';
import { PosCartItem } from '../../hooks/usePosCart';
import { RetailCoupon } from '../../services/couponService';

export interface RetailPosPaymentPanelProps {
  selectedCustomer: Record<string, any> | null;
  setSelectedCustomer: (cust: Record<string, any> | null) => void;
  customerSearch: string;
  setCustomerSearch: (val: string) => void;
  customerResults: any[];
  setCustomerResults: (results: any[]) => void;
  onOpenSplitPayment: () => void;
  appliedCoupon: RetailCoupon | null;
  couponDiscount: number;
  couponInput: string;
  setCouponInput: (val: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  cart: PosCartItem[];
  currencySymbol: string;
  paymentMethod: 'CASH' | 'CARD';
  setPaymentMethod: (method: 'CASH' | 'CARD') => void;
  amountPaid: number;
  setAmountPaid: React.Dispatch<React.SetStateAction<number>>;
  total: number;
  isPrinting: boolean;
  onPayment: () => void;
  onHoldOrder: () => void;
  onClearCart: () => void;
}

export const RetailPosPaymentPanel: React.FC<RetailPosPaymentPanelProps> = ({
  selectedCustomer,
  setSelectedCustomer,
  customerSearch,
  setCustomerSearch,
  customerResults,
  setCustomerResults,
  onOpenSplitPayment,
  appliedCoupon,
  couponDiscount,
  couponInput,
  setCouponInput,
  onApplyCoupon,
  onRemoveCoupon,
  cart,
  currencySymbol,
  paymentMethod,
  setPaymentMethod,
  amountPaid,
  setAmountPaid,
  total,
  isPrinting,
  onPayment,
  onHoldOrder,
  onClearCart
}) => {
  return (
    <div className="w-[40%] bg-slate-950/60 p-6 flex flex-col justify-between">
      {/* Customer Loyalty Search */}
      <div className="space-y-4">
        <h3 className="font-black text-sm text-slate-400 flex items-center gap-1.5">
          <User size={16} /> العميل وبرنامج الولاء
        </h3>
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
          {selectedCustomer ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-indigo-950/40 p-3 rounded-xl border border-indigo-900/30">
                <div>
                  <div className="font-bold text-white text-sm">{selectedCustomer.name}</div>
                  <div className="text-xs text-indigo-300 font-mono">{selectedCustomer.phone || 'بدون هاتف'}</div>
                </div>
                <button 
                  onClick={() => setSelectedCustomer(null)}
                  className="text-xs bg-slate-900 hover:bg-slate-800 text-red-400 px-2.5 py-1 rounded-lg border border-slate-800 transition-all font-bold"
                >
                  إلغاء
                </button>
              </div>

              {/* Customer Loyalty Points Badge & Quick Redeem */}
              {Number(selectedCustomer.loyalty_points || 0) > 0 && (
                <div className="bg-amber-950/30 border border-amber-800/40 p-2.5 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-amber-300 font-bold flex items-center gap-1">
                    <Gift size={14} className="text-amber-400" />
                    رصيد نقاط الولاء: <span className="font-mono font-black text-amber-200">{selectedCustomer.loyalty_points}</span> نقطة
                  </span>
                  <button
                    onClick={onOpenSplitPayment}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded text-[11px] transition-all"
                  >
                    استبدال النقاط
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              <input 
                type="text" 
                value={customerSearch} 
                onChange={e => setCustomerSearch(e.target.value)} 
                placeholder="ابحث عن العميل بالاسم أو رقم الهاتف..." 
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none" 
              />
              {customerResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-slate-950 border border-slate-850 rounded-xl shadow-2xl z-50 overflow-hidden max-h-40 overflow-y-auto">
                  {customerResults.map(c => (
                    <div 
                      key={c.id} 
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerSearch('');
                        setCustomerResults([]);
                      }}
                      className="p-2.5 border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer flex justify-between items-center text-xs transition-all"
                    >
                      <span className="font-bold text-white">{c.name}</span>
                      <span className="text-slate-500 font-mono">{c.phone}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 🎟️ Coupon / Promo Code Input Box */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-xs text-slate-400 flex items-center gap-1.5">
            <Ticket size={14} className="text-amber-400" /> كود خصم / كوبون
          </h3>
          {appliedCoupon && (
            <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-bold">
              مفعّل: {appliedCoupon.name} (-{couponDiscount.toFixed(2)} {currencySymbol})
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={couponInput}
            onChange={e => setCouponInput(e.target.value.toUpperCase())}
            placeholder="أدخل كود الكوبون..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono font-bold placeholder:text-slate-600 focus:border-indigo-500 outline-none"
          />
          {appliedCoupon ? (
            <button
              onClick={onRemoveCoupon}
              className="bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            >
              إلغاء
            </button>
          ) : (
            <button
              onClick={onApplyCoupon}
              disabled={cart.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
            >
              تطبيق
            </button>
          )}
        </div>
      </div>

      {/* Payment Method Selector */}
      <div className="space-y-4">
        <h3 className="font-black text-sm text-slate-400 flex items-center gap-1.5">
          <Coins size={16} /> طريقة الدفع
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => setPaymentMethod('CASH')}
            className={`py-3 rounded-xl font-black flex items-center justify-center gap-2 border transition-all text-sm ${
              paymentMethod === 'CASH' 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/10' 
                : 'bg-slate-950 border-slate-800 hover:bg-slate-900 text-slate-400'
            }`}
          >
            💵 دفع نقدي (كاش)
          </button>
          <button 
            onClick={() => setPaymentMethod('CARD')}
            className={`py-3 rounded-xl font-black flex items-center justify-center gap-2 border transition-all text-sm ${
              paymentMethod === 'CARD' 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/10' 
                : 'bg-slate-950 border-slate-800 hover:bg-slate-900 text-slate-400'
            }`}
          >
            💳 بطاقة بنكية (فيزا)
          </button>
        </div>
      </div>

      {/* Cash Input Drawer / Card Info */}
      <div className="space-y-4">
        <h3 className="font-black text-sm text-slate-400 flex items-center gap-1.5">
          <Coins size={16} /> حساب النقدية المقبوضة
        </h3>

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-inner">
          {paymentMethod === 'CASH' ? (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">المبلغ المستلم من العميل</label>
              <input 
                type="number" 
                value={amountPaid || ''} 
                onChange={e => setAmountPaid(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-4 text-left text-3xl font-black text-white font-mono focus:border-indigo-500 outline-none"
                placeholder={`0.00 ${currencySymbol}`}
              />
            </div>
          ) : (
            <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-900/30 text-center">
              <span className="block text-xs text-indigo-400/80 mb-1">المبلغ المطلوب خصمه من البطاقة البنكية</span>
              <span className="text-3xl font-black font-mono text-indigo-400">{total.toFixed(2)} {currencySymbol}</span>
            </div>
          )}

          {/* Quick cash adder buttons */}
          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 50, 100, 200, 500].map(val => (
              <button 
                key={val}
                onClick={() => setAmountPaid(prev => prev + val)}
                className="bg-slate-900 hover:bg-slate-800 text-sm font-bold py-2.5 rounded-xl border border-slate-800 transition-all text-slate-200"
              >
                +{val}
              </button>
            ))}
            <button 
              onClick={() => setAmountPaid(total)}
              className="col-span-2 bg-indigo-950 hover:bg-indigo-900 border border-indigo-900 text-sm font-black py-2.5 rounded-xl transition-all text-indigo-400"
            >
              المبلغ بالضبط
            </button>
          </div>

          {/* Calculated change */}
          {amountPaid > 0 && (
            <div className={`p-4 rounded-xl flex justify-between items-center ${
              amountPaid >= total ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900' : 'bg-red-950/80 text-red-400 border border-red-900'
            }`}>
              <span className="font-bold text-sm">
                {amountPaid >= total ? 'المبلغ المتبقي للعميل (الفكة):' : 'المبلغ المتبقي غير كافٍ، ينقص:'}
              </span>
              <span className="text-2xl font-black font-mono">
                {Math.abs(amountPaid - total).toFixed(2)} {currencySymbol}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Direct Pay Action Button */}
      <div className="space-y-3">
        <button 
          disabled={isPrinting || cart.length === 0 || amountPaid < total}
          onClick={onPayment}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-600/10 transition-all flex justify-center items-center gap-3 text-xl"
        >
          {isPrinting ? (
            <Loader2 className="animate-spin" size={24} />
          ) : (
            <Printer size={24} />
          )}
          دفع وطباعة الفاتورة (F8)
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={onHoldOrder}
            disabled={cart.length === 0}
            className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 disabled:opacity-40 text-sm font-black py-3.5 rounded-xl border border-amber-500/30 transition-all flex items-center justify-center gap-2"
          >
            <Pause size={16} /> تعليق الفاتورة (F6)
          </button>
          <button 
            onClick={onClearCart}
            className="bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white text-sm font-bold py-3.5 rounded-xl border border-slate-800 transition-all"
          >
            إفراغ السلة (F2)
          </button>
        </div>
      </div>
    </div>
  );
};

export default RetailPosPaymentPanel;
