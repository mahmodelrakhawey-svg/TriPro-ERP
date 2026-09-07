import React, { useState, useEffect } from 'react';
import { ShoppingBag, Sparkles, Store, CheckCircle, Tag, Clock } from 'lucide-react';
import { secureStorage } from '../../../../utils/securityMiddleware';

interface DisplayCartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  weight?: number;
  total: number;
  image_url?: string | null;
}

interface DisplayState {
  cart: DisplayCartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  cashierName?: string;
  storeName?: string;
  customerName?: string;
  customerPoints?: number;
  status: 'idle' | 'scanning' | 'paid';
  lastPaidChange?: number;
}

export default function CustomerFacingScreen() {
  const [displayState, setDisplayState] = useState<DisplayState>(() => {
    try {
      const saved = secureStorage.getItem('tripro_customer_display_state') as DisplayState;
      if (saved && saved.cart) return saved;
    } catch {}
    return {
      cart: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      storeName: 'TriPro Hypermarket',
      status: 'idle'
    };
  });

  const [currentTime, setCurrentTime] = useState(new Date());

  // Listen to BroadcastChannel & Storage events
  useEffect(() => {
    const channel = new BroadcastChannel('tripro_pos_customer_display');
    channel.onmessage = (event) => {
      if (event.data) {
        setDisplayState(event.data);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key?.includes('tripro_customer_display_state')) {
        try {
          const fresh = secureStorage.getItem('tripro_customer_display_state') as DisplayState;
          if (fresh) setDisplayState(fresh);
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorage);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      channel.close();
      window.removeEventListener('storage', handleStorage);
      clearInterval(timer);
    };
  }, []);

  const isCartEmpty = !displayState.cart || displayState.cart.length === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between font-sans selection:bg-purple-500 selection:text-white" dir="rtl">
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-8 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Store size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wide text-white">{displayState.storeName || 'TriPro Hypermarket'}</h1>
            <p className="text-xs text-purple-300 font-medium">أهلاً بك عميلنا العزيز • نتشرف بخدمتكم</p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          {displayState.cashierName && (
            <div className="bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700">
              <span className="text-slate-400 text-xs block">الكاشير:</span>
              <span className="font-bold text-purple-200">{displayState.cashierName}</span>
            </div>
          )}
          <div className="text-left font-mono">
            <div className="text-lg font-bold text-slate-200">{currentTime.toLocaleTimeString('ar-EG')}</div>
            <div className="text-xs text-slate-400">{currentTime.toLocaleDateString('ar-EG')}</div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-hidden max-w-[1920px] mx-auto w-full">
        {/* Left 2 Cols: Cart Table or Idle Hero */}
        <div className="lg:col-span-2 flex flex-col bg-slate-900/60 backdrop-blur border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden">
          {isCartEmpty ? (
            /* Idle Promo Display */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-6">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center shadow-2xl shadow-amber-500/30 animate-bounce">
                <Sparkles size={48} className="text-slate-950" />
              </div>
              <div className="space-y-2 max-w-lg">
                <h2 className="text-4xl font-black text-white">عروض وتخفيضات اليوم المذهلة</h2>
                <p className="text-slate-400 text-base">
                  تمتع بأقوى عروض التوفير في أقسام الأجبان، اللحوم الطازجة، والمنظفات بأسعار لا تقبل المنافسة!
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 w-full max-w-xl pt-4">
                <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 text-center">
                  <span className="text-2xl block mb-1">🧀</span>
                  <span className="text-xs font-bold text-amber-300">قسم الأجبان</span>
                  <span className="text-[11px] text-slate-400 block">خصم حتى 20%</span>
                </div>
                <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 text-center">
                  <span className="text-2xl block mb-1">🥩</span>
                  <span className="text-xs font-bold text-rose-300">اللحوم والدواجن</span>
                  <span className="text-[11px] text-slate-400 block">طازجة يومياً</span>
                </div>
                <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 text-center">
                  <span className="text-2xl block mb-1">🎁</span>
                  <span className="text-xs font-bold text-purple-300">عروض BOGO</span>
                  <span className="text-[11px] text-slate-400 block">اشتري 2 + 1 هدية</span>
                </div>
              </div>
            </div>
          ) : (
            /* Active Cart Items List */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShoppingBag size={20} className="text-purple-400" />
                  <span>الأصناف في السلة ({displayState.cart.length})</span>
                </h2>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800">
                  ● جاري مسح الأصناف
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {displayState.cart.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800/80 rounded-2xl border border-slate-700/60 transition-all animate-in fade-in slide-in-from-bottom-2"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center font-bold text-lg text-purple-300">
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-lg">{item.name}</h4>
                        <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                          <span>السعر: {item.price.toFixed(2)} ج.م</span>
                          {item.weight ? (
                            <span className="text-amber-300 font-bold bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-900/50">
                              ⚖️ الوزن: {item.weight.toFixed(3)} كجم
                            </span>
                          ) : (
                            <span>الكمية: {item.quantity}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-left">
                      <span className="text-2xl font-black text-emerald-400 font-mono">
                        {(item.total || (item.price * (item.weight || item.quantity))).toFixed(2)}
                      </span>
                      <span className="text-xs text-slate-400 mr-1">ج.م</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Totals & Billing Summary */}
        <div className="flex flex-col justify-between bg-gradient-to-b from-slate-900 to-purple-950/40 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-300 border-b border-slate-800 pb-3">
              ملخص الحساب الإجمالي
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between text-slate-300">
                <span>المجموع الفرعي:</span>
                <span className="font-mono font-bold text-lg">{displayState.subtotal.toFixed(2)} ج.م</span>
              </div>

              {displayState.discount > 0 && (
                <div className="flex items-center justify-between text-amber-400 bg-amber-950/30 p-3 rounded-xl border border-amber-900/50 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Tag size={16} />
                    <span>إجمالي الخصومات والعروض:</span>
                  </span>
                  <span className="font-mono text-lg">-{displayState.discount.toFixed(2)} ج.م</span>
                </div>
              )}

              {displayState.tax > 0 && (
                <div className="flex items-center justify-between text-slate-400">
                  <span>ضريبة القيمة المضافة (14%):</span>
                  <span className="font-mono font-bold">{displayState.tax.toFixed(2)} ج.م</span>
                </div>
              )}
            </div>
          </div>

          {/* Grand Total Box */}
          <div className="pt-6 border-t border-slate-800 space-y-4">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-3xl p-6 text-center shadow-xl shadow-emerald-600/20">
              <span className="text-sm font-bold text-emerald-100 uppercase tracking-wider block mb-1">
                المبلغ المطلوب سداده (Total Due)
              </span>
              <div className="text-5xl font-black text-white font-mono tracking-tight">
                {displayState.total.toFixed(2)} <span className="text-2xl font-normal">ج.م</span>
              </div>
            </div>

            {displayState.status === 'paid' && displayState.lastPaidChange !== undefined && (
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 text-center animate-in zoom-in-95">
                <span className="text-xs text-slate-400 block mb-1">المتبقي للعميل (Change):</span>
                <span className="text-2xl font-black text-amber-400 font-mono">
                  {displayState.lastPaidChange.toFixed(2)} ج.م
                </span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer Notice */}
      <footer className="bg-slate-900/80 border-t border-slate-800 px-8 py-3 text-center text-xs text-slate-500">
        شكراً لتسوقكم معنا • للإبلاغ عن أي استفسار أو شكاوى يرجى التوجه لخدمة العملاء
      </footer>
    </div>
  );
}
