/**
 * ==============================================================================
 * Self-Ordering Kiosk Mode (كشك الخدمة الذاتية للعملاء)
 * TriPro ERP — modules/restaurant/components/Kiosk/SelfOrderingKiosk.tsx
 * ==============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { thermalPrinterService } from '../../../../services/thermalPrinterService';
import {
  Utensils,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Sparkles,
  CreditCard,
  Banknote,
  Search,
  RotateCcw,
  X,
  ChevronRight,
  Flame,
  Clock,
  ArrowRight
} from 'lucide-react';

interface KioskCartItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  selectedModifiers?: any[];
  image_url?: string;
}

export const SelfOrderingKiosk: React.FC = () => {
  const { products: allProducts, menuCategories, createRestaurantOrder, settings } = useAccounting();
  const { showToast } = useToast();

  // Kiosk Flow Steps: 1 = WELCOME, 2 = ORDERING, 3 = CHECKOUT, 4 = SUCCESS
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [diningOption, setDiningOption] = useState<'DINE_IN' | 'TAKEAWAY'>('DINE_IN');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [cart, setCart] = useState<KioskCartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [pagerNumber, setPagerNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'CASH'>('CARD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string>('');
  const [resetTimer, setResetTimer] = useState<number>(10);

  // Filter sellable items
  const menuItems = useMemo(() => {
    return (allProducts || []).filter(p => {
      const isSellable = ['MANUFACTURED', 'STOCK', 'FINISHED_GOODS'].includes(p.product_type);
      const matchesSearch = searchQuery === '' || p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = activeCategory === 'all' || p.category_id === activeCategory;
      return isSellable && matchesSearch && matchesCat;
    });
  }, [allProducts, searchQuery, activeCategory]);

  const cartTotal = cart.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

  const handleAddToCart = (product: any) => {
    const existing = cart.find(c => c.productId === product.id && !c.notes);
    if (existing) {
      setCart(cart.map(c => (c === existing ? { ...c, quantity: c.quantity + 1 } : c)));
    } else {
      setCart([
        ...cart,
        {
          id: `kiosk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: Number(product.sales_price || 0),
          image_url: product.image_url
        }
      ]);
    }
  };

  const updateQuantity = (index: number, delta: number) => {
    const updated = [...cart];
    updated[index].quantity += delta;
    if (updated[index].quantity <= 0) {
      updated.splice(index, 1);
    }
    setCart(updated);
  };

  // Reset to Welcome Screen countdown when in success step
  useEffect(() => {
    let interval: any;
    if (step === 4) {
      setResetTimer(10);
      interval = setInterval(() => {
        setResetTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            resetKiosk();
            return 10;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step]);

  const resetKiosk = () => {
    setStep(1);
    setCart([]);
    setCustomerName('');
    setPagerNumber('');
    setSearchQuery('');
    setConfirmedOrderNumber('');
  };

  // Submit Kiosk Order
  const handleConfirmOrder = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

    try {
      const orderNum = `K-${Date.now().toString().slice(-4)}`;
      const rpcItems = cart.map(it => ({
        product_id: it.productId,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        price_at_order: it.unitPrice,
        notes: it.notes || null,
        modifiers: it.selectedModifiers || []
      }));

      // Create Restaurant Order
      await createRestaurantOrder({
        p_session_id: null,
        p_items: rpcItems,
        p_order_type: diningOption,
        p_customer_id: null,
        p_user_id: null,
        p_notes: `طلب كشك خدمة ذاتية (Kiosk) #${orderNum} | ${diningOption === 'DINE_IN' ? 'صالة' : 'سفري'} ${pagerNumber ? `| بيجر: ${pagerNumber}` : ''} | الدفع: ${paymentMethod === 'CARD' ? 'بطاقة كشك' : 'نقداً بالكاونتر'}`,
        p_warehouse_id: settings?.default_warehouse_id
      });

      // Silent Kitchen Thermal Printing
      thermalPrinterService.routeOrderToPrinters({
        orderNumber: orderNum,
        tableName: diningOption === 'DINE_IN' ? `كشك (صالة) ${pagerNumber ? `#${pagerNumber}` : ''}` : 'كشك (سفري)',
        orderType: diningOption === 'DINE_IN' ? 'صالة (Kiosk)' : 'سفري (Kiosk)',
        serverName: 'كشك الخدمة الذاتية',
        items: cart.map(it => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          notes: it.notes
        })),
        grandTotal: cartTotal
      }).catch(err => console.warn('Kiosk print notice:', err));

      setConfirmedOrderNumber(orderNum);
      setStep(4);
    } catch (err: any) {
      console.error('Kiosk order failed:', err);
      showToast('عذراً، حدث خطأ أثناء إرسال الطلب. يرجى التوجه للكاشير', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans select-none flex flex-col justify-between overflow-hidden" dir="rtl">
      {/* Top Kiosk Header */}
      <header className="bg-slate-800/90 backdrop-blur-md px-8 py-4 border-b border-slate-700 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-rose-600 rounded-2xl text-white shadow-lg shadow-amber-500/20">
            <Utensils className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-wide text-white">
              {settings?.company_name || 'مطعمنا الفاخر'}
            </h1>
            <span className="text-xs text-amber-400 font-bold tracking-widest uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> كشك الخدمة الذاتية (Self-Ordering Kiosk)
            </span>
          </div>
        </div>

        {step > 1 && step < 4 && (
          <button
            onClick={resetKiosk}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-bold flex items-center gap-2 transition"
          >
            <RotateCcw className="w-4 h-4" /> إلغاء والبدء من جديد
          </button>
        )}
      </header>

      {/* STEP 1: WELCOME & DINING OPTION SELECTION */}
      {step === 1 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-12 animate-in zoom-in-95">
          <div className="space-y-4 max-w-2xl">
            <span className="px-4 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-sm font-black inline-block">
              أهلاً وسهلاً بكم في مطعمنا ✨
            </span>
            <h2 className="text-5xl md:text-6xl font-black text-white leading-tight">
              اطلب وجبتك المفضلة <br />
              <span className="bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">
                بلمسة واحدة وبكل سهولة
              </span>
            </h2>
            <p className="text-slate-400 text-lg">
              اختر طريقة تناول الوجبة لبدء استعراض القائمة الشهية
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
            <button
              onClick={() => {
                setDiningOption('DINE_IN');
                setStep(2);
              }}
              className="group p-10 bg-gradient-to-b from-slate-800 to-slate-800/60 hover:from-amber-600/30 hover:to-amber-900/40 border-2 border-slate-700 hover:border-amber-400 rounded-3xl transition-all shadow-2xl flex flex-col items-center justify-center gap-6 active:scale-95"
            >
              <div className="p-6 bg-amber-500 text-white rounded-3xl shadow-xl group-hover:scale-110 transition">
                <Utensils className="w-16 h-16" />
              </div>
              <div className="text-center">
                <span className="text-3xl font-black text-white block mb-1">تناول في المطعم</span>
                <span className="text-slate-400 text-sm">Dine-In • استمتع بالوجبة في صالتنا</span>
              </div>
            </button>

            <button
              onClick={() => {
                setDiningOption('TAKEAWAY');
                setStep(2);
              }}
              className="group p-10 bg-gradient-to-b from-slate-800 to-slate-800/60 hover:from-rose-600/30 hover:to-rose-900/40 border-2 border-slate-700 hover:border-rose-400 rounded-3xl transition-all shadow-2xl flex flex-col items-center justify-center gap-6 active:scale-95"
            >
              <div className="p-6 bg-rose-500 text-white rounded-3xl shadow-xl group-hover:scale-110 transition">
                <ShoppingBag className="w-16 h-16" />
              </div>
              <div className="text-center">
                <span className="text-3xl font-black text-white block mb-1">طلب سفري خارجي</span>
                <span className="text-slate-400 text-sm">Takeaway • استلم وجبتك وانطلق</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: MENU EXPLORATION & CART */}
      {step === 2 && (
        <div className="flex-1 flex overflow-hidden animate-in fade-in">
          {/* Main Menu Area */}
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            {/* Category Pills Bar */}
            <div className="flex items-center gap-3 overflow-x-auto pb-4 no-scrollbar">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-6 py-3.5 rounded-2xl text-base font-black transition-all whitespace-nowrap active:scale-95 ${
                  activeCategory === 'all'
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30 scale-105'
                    : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                جميع الأصناف ✨
              </button>
              {(menuCategories || []).map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-6 py-3.5 rounded-2xl text-base font-black transition-all whitespace-nowrap active:scale-95 ${
                    activeCategory === cat.id
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30 scale-105'
                      : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-6">
              {menuItems.map(p => {
                const inCart = cart.find(c => c.productId === p.id);
                return (
                  <div
                    key={p.id}
                    className="bg-slate-800/80 border border-slate-700 rounded-3xl p-4 flex flex-col justify-between space-y-3 hover:border-amber-500/50 transition-all shadow-lg group relative overflow-hidden"
                  >
                    {inCart && (
                      <span className="absolute top-3 left-3 bg-amber-500 text-white text-xs font-black w-7 h-7 rounded-full flex items-center justify-center shadow-lg">
                        {inCart.quantity}
                      </span>
                    )}

                    <div className="aspect-video w-full rounded-2xl bg-slate-900 overflow-hidden flex items-center justify-center relative">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                      ) : (
                        <Utensils className="w-10 h-10 text-slate-600" />
                      )}
                    </div>

                    <div>
                      <h3 className="font-black text-base text-white line-clamp-1">{p.name}</h3>
                      <span className="text-xl font-black text-amber-400 font-mono block mt-1">
                        {Number(p.sales_price || 0).toFixed(2)} ج
                      </span>
                    </div>

                    <button
                      onClick={() => handleAddToCart(p)}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition"
                    >
                      <Plus className="w-4 h-4" /> إضافة للطلب
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Sidebar: Running Cart */}
          <div className="w-96 bg-slate-800 border-r border-slate-700 p-6 flex flex-col justify-between shadow-2xl">
            <div className="space-y-4 overflow-hidden flex flex-col">
              <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                <h3 className="font-black text-lg text-white flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-amber-400" />
                  <span>سلة طلبك ({cart.length})</span>
                </h3>
                <span className="text-xs px-2.5 py-1 bg-slate-700 text-amber-400 font-bold rounded-lg">
                  {diningOption === 'DINE_IN' ? 'صالة 🍽️' : 'تيك أواي 🛍️'}
                </span>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[50vh]">
                {cart.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 space-y-2">
                    <Utensils className="w-12 h-12 mx-auto opacity-40" />
                    <p className="text-sm font-bold">السلة فارغة حالياً</p>
                    <p className="text-xs">المس أي صنف في القائمة لإضافته</p>
                  </div>
                ) : (
                  cart.map((item, idx) => (
                    <div key={item.id} className="bg-slate-900/80 p-3 rounded-2xl border border-slate-700/60 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-sm text-white block">{item.name}</span>
                        <span className="text-xs text-amber-400 font-mono font-bold">
                          {(item.unitPrice * item.quantity).toFixed(2)} ج
                        </span>
                      </div>

                      <div className="flex items-center gap-2 bg-slate-800 px-2 py-1 rounded-xl border border-slate-700">
                        <button
                          onClick={() => updateQuantity(idx, -1)}
                          className="w-6 h-6 rounded-lg bg-slate-700 text-white flex items-center justify-center font-bold text-xs active:scale-90"
                        >
                          -
                        </button>
                        <span className="font-mono font-black text-sm text-white px-1">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(idx, 1)}
                          className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs active:scale-90"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom Checkout Actions */}
            <div className="border-t border-slate-700 pt-4 space-y-4">
              <div className="flex justify-between items-center text-lg">
                <span className="font-bold text-slate-400">الإجمالي النهائي:</span>
                <span className="text-3xl font-black text-amber-400 font-mono">
                  {cartTotal.toFixed(2)} ج
                </span>
              </div>

              <button
                onClick={() => setStep(3)}
                disabled={cart.length === 0}
                className="w-full py-4 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 disabled:opacity-40 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-amber-500/20 active:scale-95 transition"
              >
                <span>متابعة وإنهاء الطلب</span>
                <ArrowRight className="w-5 h-5 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: CHECKOUT DETAILS & PAYMENT */}
      {step === 3 && (
        <div className="flex-1 flex items-center justify-center p-8 animate-in zoom-in-95">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 max-w-xl w-full shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-700 pb-4">
              <div>
                <h2 className="text-2xl font-black text-white">تأكيد تفاصيل الطلب والدفع</h2>
                <span className="text-xs text-slate-400">اختر طريقة السداد وأدخل رقم النداء</span>
              </div>
              <button onClick={() => setStep(2)} className="text-slate-400 hover:text-white text-sm font-bold">
                العودة للقائمة
              </button>
            </div>

            <div className="space-y-4">
              {diningOption === 'DINE_IN' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    رقم جهاز النداء / البيجر (إن وجد على الكاونتر):
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 12"
                    value={pagerNumber}
                    onChange={e => setPagerNumber(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-center text-2xl font-mono font-bold text-amber-400 outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">اختر طريقة الدفع:</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CARD')}
                    className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-2 transition ${
                      paymentMethod === 'CARD'
                        ? 'bg-amber-500/20 border-amber-400 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    <CreditCard className="w-8 h-8 text-amber-400" />
                    <span className="font-bold text-sm">دفع إلكتروني (بطاقة)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CASH')}
                    className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-2 transition ${
                      paymentMethod === 'CASH'
                        ? 'bg-amber-500/20 border-amber-400 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    <Banknote className="w-8 h-8 text-emerald-400" />
                    <span className="font-bold text-sm">دفع نقداً بالكاونتر</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-2xl flex justify-between items-center text-lg">
              <span className="font-bold text-slate-400">إجمالي المبلغ المطلوب:</span>
              <span className="text-3xl font-black text-amber-400 font-mono">{cartTotal.toFixed(2)} ج</span>
            </div>

            <button
              onClick={handleConfirmOrder}
              disabled={isSubmitting}
              className="w-full py-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-black text-xl rounded-2xl flex items-center justify-center gap-2 shadow-xl active:scale-95 transition"
            >
              {isSubmitting ? 'جاري تسجيل الطلب...' : 'تأكيد وإرسال الطلب للمطبخ 👨‍🍳🚀'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS CONFIRMATION & ORDER NUMBER DISPLAY */}
      {step === 4 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in zoom-in-95">
          <div className="p-6 bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 rounded-full shadow-2xl animate-bounce">
            <CheckCircle2 className="w-24 h-24" />
          </div>

          <div className="space-y-3">
            <span className="text-xs font-black text-emerald-400 uppercase tracking-widest px-4 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              تم استلام طلبك بنجاح وجارٍ تجهيزه بالمطبخ
            </span>
            <h2 className="text-4xl font-black text-white">رقم طلبك للمتابعة:</h2>
            <div className="text-7xl font-black text-amber-400 font-mono tracking-wider bg-slate-800 border-2 border-amber-400/50 py-6 px-12 rounded-3xl inline-block shadow-2xl">
              #{confirmedOrderNumber}
            </div>
          </div>

          <p className="text-slate-400 text-sm max-w-md">
            يرجى التوجه إلى شاشة الاستلام لمتابعة رقم طلبك أو الانتظار حتى يرن جهاز النداء الخاص بك.
          </p>

          <div className="text-xs text-slate-500 flex items-center gap-1.5 font-mono">
            <Clock className="w-4 h-4" />
            <span>سيتم الرجوع للشاشة الرئيسية تلقائياً خلال {resetTimer} ثوانٍ...</span>
          </div>

          <button
            onClick={resetKiosk}
            className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold text-sm transition"
          >
            طلب جديد الآن
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 px-8 py-3 border-t border-slate-800 text-center text-xs text-slate-500 flex justify-between items-center">
        <span>TriPro-ERP • نظام المطاعم الذكي</span>
        <span className="font-mono">Powered by TriPro High-Speed POS</span>
      </footer>
    </div>
  );
};

export default SelfOrderingKiosk;
