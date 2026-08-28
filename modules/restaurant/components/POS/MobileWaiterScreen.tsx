/**
 * ==============================================================================
 * Mobile Waiter Handheld POS (واجهة الكابتن والويتر المحمولة)
 * TriPro ERP — modules/restaurant/components/POS/MobileWaiterScreen.tsx
 * ==============================================================================
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { supabase } from '../../../../supabaseClient';
import { RestaurantTable } from '../../../../types';
import { waiterPagingService, WaiterCallRequest } from '../../../../services/waiterPagingService';
import { thermalPrinterService } from '../../../../services/thermalPrinterService';
import {
  Utensils,
  Bell,
  CheckCircle2,
  Clock,
  Plus,
  Minus,
  Search,
  Send,
  Sparkles,
  Zap,
  Coffee,
  Flame,
  X,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  User,
  Phone,
  Gift,
  Printer,
  RotateCcw,
  Receipt,
  FileText,
  Layers,
  Check
} from 'lucide-react';

interface WaiterCartItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  selectedModifiers?: any[];
}

export const MobileWaiterScreen: React.FC = () => {
  const {
    restaurantTables,
    products: allProducts,
    menuCategories,
    currentUser,
    createRestaurantOrder,
    openTableSession,
    settings
  } = useAccounting();

  const { showToast } = useToast();

  // Navigation State
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [cart, setCart] = useState<WaiterCartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Existing Table Orders State
  const [existingOrders, setExistingOrders] = useState<any[]>([]);
  const [existingOrdersLoading, setExistingOrdersLoading] = useState(false);
  const [isExistingOrdersModalOpen, setIsExistingOrdersModalOpen] = useState(false);

  // Modifier Modal
  const [itemForModifiers, setItemForModifiers] = useState<any | null>(null);
  const [itemNotes, setItemNotes] = useState('');
  const [selectedMods, setSelectedMods] = useState<any[]>([]);

  // Waiter Calls (Paging)
  const [pendingCalls, setPendingCalls] = useState<WaiterCallRequest[]>([]);

  // Poll for waiter calls
  useEffect(() => {
    const updateCalls = () => {
      const calls = waiterPagingService.getPendingCalls();
      if (calls.length > pendingCalls.length && calls.length > 0) {
        // Vibrate mobile device if supported
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      }
      setPendingCalls(calls);
    };

    updateCalls();
    const interval = setInterval(updateCalls, 3000);
    return () => clearInterval(interval);
  }, [pendingCalls.length]);

  // Load existing orders when a table is selected
  useEffect(() => {
    const fetchExistingOrders = async () => {
      if (!selectedTable) {
        setExistingOrders([]);
        return;
      }
      setExistingOrdersLoading(true);
      try {
        const { data: openSession } = await supabase
          .from('table_sessions')
          .select('id')
          .eq('table_id', selectedTable.id)
          .eq('status', 'OPEN')
          .order('start_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openSession?.id) {
          const { data: orders } = await supabase
            .from('orders')
            .select(`
              id,
              order_number,
              grand_total,
              status,
              created_at,
              order_items (
                id,
                quantity,
                unit_price,
                notes,
                modifiers,
                products (name)
              )
            `)
            .eq('session_id', openSession.id)
            .not('status', 'in', '("CANCELLED")')
            .order('created_at', { ascending: true });

          setExistingOrders(orders || []);
        } else {
          setExistingOrders([]);
        }
      } catch (err) {
        console.warn('Existing orders load error:', err);
      } finally {
        setExistingOrdersLoading(false);
      }
    };

    fetchExistingOrders();
  }, [selectedTable]);

  // Distinct Table Sections
  const tableSections = useMemo(() => {
    const sections = new Set<string>();
    restaurantTables.forEach(t => {
      if (t.section) sections.add(t.section);
    });
    return Array.from(sections);
  }, [restaurantTables]);

  // Filtered Tables
  const filteredTables = useMemo(() => {
    return restaurantTables.filter(t => {
      if (selectedSection === 'all') return true;
      return t.section === selectedSection;
    });
  }, [restaurantTables, selectedSection]);

  // Filter sellable products
  const sellableProducts = useMemo(() => {
    return (allProducts || []).filter(p => {
      const isSellable = ['MANUFACTURED', 'STOCK', 'FINISHED_GOODS'].includes(p.product_type);
      const matchesSearch = searchQuery === '' || p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = activeCategory === 'all' || p.category_id === activeCategory;
      return isSellable && matchesSearch && matchesCat;
    });
  }, [allProducts, searchQuery, activeCategory]);

  // Quick cooking notes presets
  const QUICK_NOTES = ['بدون بصل', 'سبايسي حار 🔥', 'نص سوا (Medium)', 'مستوي جيداً (Well Done)', 'سكر خفيف', 'بدون ثوم', 'صوص خارجي'];

  // Add Item to cart
  const handleAddItem = (product: any) => {
    if (navigator.vibrate) navigator.vibrate(30);
    const existing = cart.find(c => c.productId === product.id && !c.notes && (!c.selectedModifiers || c.selectedModifiers.length === 0));
    if (existing) {
      setCart(cart.map(c => (c === existing ? { ...c, quantity: c.quantity + 1 } : c)));
    } else {
      setCart([
        ...cart,
        {
          id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: Number(product.sales_price || 0)
        }
      ]);
    }
  };

  const handleOpenModifiers = (product: any) => {
    setItemForModifiers(product);
    setItemNotes('');
    setSelectedMods([]);
  };

  const handleSaveModifiers = () => {
    if (!itemForModifiers) return;
    setCart([
      ...cart,
      {
        id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        productId: itemForModifiers.id,
        name: itemForModifiers.name,
        quantity: 1,
        unitPrice: Number(itemForModifiers.sales_price || 0),
        notes: itemNotes.trim() || undefined,
        selectedModifiers: selectedMods
      }
    ]);
    setItemForModifiers(null);
  };

  const updateQuantity = (index: number, delta: number) => {
    if (navigator.vibrate) navigator.vibrate(20);
    const updated = [...cart];
    updated[index].quantity += delta;
    if (updated[index].quantity <= 0) {
      updated.splice(index, 1);
    }
    setCart(updated);
  };

  const cartTotal = cart.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

  // Existing table total
  const existingOrdersTotal = useMemo(() => {
    return existingOrders.reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
  }, [existingOrders]);

  // Request Bill / Print Check for table
  const handleRequestBill = async () => {
    if (!selectedTable) return;
    try {
      const payload = {
        orderNumber: `CHK-${selectedTable.name}`,
        tableName: selectedTable.name,
        orderType: 'صالة (طلب حساب)',
        serverName: currentUser?.full_name || 'الويتر',
        items: existingOrders.flatMap(o => (o.order_items || []).map((it: any) => ({
          name: it.products?.name || 'صنف',
          quantity: it.quantity,
          unitPrice: it.unit_price,
          notes: it.notes
        }))),
        grandTotal: existingOrdersTotal
      };

      await thermalPrinterService.routeOrderToPrinters(payload);
      showToast(`تم إرسال أمر طباعة شيك حساب طاولة ${selectedTable.name} للكاشير بنجاح 🧾`, 'success');
    } catch (e: any) {
      showToast('خطأ أثناء طلب الحساب: ' + e.message, 'error');
    }
  };

  // Send Order to Kitchen & Thermal Printers
  const handleSendOrder = async () => {
    if (!selectedTable) {
      showToast('يرجى اختيار الطاولة أولاً', 'warning');
      return;
    }
    if (cart.length === 0) {
      showToast('السلة فارغة!', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Get or create active session UUID for this table
      let resolvedSessionId: string | null = null;

      const { data: openSession } = await supabase
        .from('table_sessions')
        .select('id')
        .eq('table_id', selectedTable.id)
        .eq('status', 'OPEN')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openSession?.id) {
        resolvedSessionId = openSession.id;
      } else {
        const sessionResult = await openTableSession(selectedTable.id);
        if (typeof sessionResult === 'object' && sessionResult !== null) {
          resolvedSessionId = (sessionResult as any).id || null;
        } else if (typeof sessionResult === 'string') {
          if (sessionResult.trim().startsWith('{')) {
            try {
              resolvedSessionId = JSON.parse(sessionResult).id;
            } catch {
              resolvedSessionId = sessionResult;
            }
          } else {
            resolvedSessionId = sessionResult;
          }
        }
      }

      if (!resolvedSessionId) {
        showToast('تعذر فتح أو تحديد جلسة الطاولة، يرجى إعادة المحاولة', 'error');
        setIsSubmitting(false);
        return;
      }

      // 2. Build items payload for RPC
      const rpcItems = cart.map(it => ({
        product_id: it.productId,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        price_at_order: it.unitPrice,
        notes: it.notes || null,
        modifiers: it.selectedModifiers || []
      }));

      // 3. Create Restaurant Order
      await createRestaurantOrder({
        p_session_id: resolvedSessionId,
        p_items: rpcItems,
        p_order_type: 'DINE_IN',
        p_customer_id: null,
        p_user_id: currentUser?.id || null,
        p_notes: `طلب ويتر عبر الموبايل: ${currentUser?.full_name || 'كابتن الصالة'}`,
        p_warehouse_id: settings?.default_warehouse_id
      });

      // 4. Silent Kitchen Multi-Station Print
      const printTicketPayload = {
        orderNumber: `ORD-${Date.now().toString().slice(-4)}`,
        tableName: selectedTable.name,
        orderType: 'صالة (Dine-In)',
        serverName: currentUser?.full_name || 'الويتر',
        items: cart.map(it => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          notes: it.notes,
          selectedModifiers: it.selectedModifiers
        })),
        grandTotal: cartTotal
      };

      thermalPrinterService.routeOrderToPrinters(printTicketPayload).catch(pErr => {
        console.warn('Printer routing notice:', pErr);
      });

      showToast(`تم إرسال طلب طاولة ${selectedTable.name} للمطبخ بنجاح! 👨‍🍳🚀`, 'success');

      setCart([]);
      setSelectedTable(null);
    } catch (err: any) {
      console.error('Mobile Waiter submit error:', err);
      showToast('فشل إرسال الطلب: ' + (err.message || 'تحقق من الاتصال'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-28 select-none font-sans text-slate-800" dir="rtl">
      {/* Top Waiter Paging Alert Bar */}
      {pendingCalls.length > 0 && (
        <div className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-4 py-2.5 flex items-center justify-between shadow-md animate-pulse">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 animate-bounce" />
            <span className="font-black text-xs">
              {pendingCalls[0].table_name} تطلب {pendingCalls[0].request_type === 'REQUEST_BILL' ? 'الفاتورة 💳' : 'الويتر 🛎️'}!
            </span>
          </div>
          <button
            onClick={() => {
              waiterPagingService.completeCall(pendingCalls[0].id);
              setPendingCalls(waiterPagingService.getPendingCalls());
              showToast(`تمت تلبية طلب ${pendingCalls[0].table_name} ✅`, 'success');
            }}
            className="px-3 py-1 bg-white text-rose-700 text-xs font-black rounded-lg shadow active:scale-95"
          >
            تمت التلبية ✓
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white px-4 py-3 border-b sticky top-0 z-30 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-amber-500 text-white rounded-xl shadow-sm">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black text-sm text-slate-800">ويتر الصالة المتنقل (Handheld)</h1>
            <span className="text-[11px] text-slate-400">
              {currentUser?.full_name || 'كابتن الصالة'} {selectedTable && `• ${selectedTable.name}`}
            </span>
          </div>
        </div>

        {selectedTable && (
          <button
            onClick={() => setSelectedTable(null)}
            className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95"
          >
            تغيير الطاولة
          </button>
        )}
      </div>

      {/* Screen 1: Select Table if none selected */}
      {!selectedTable ? (
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          <div className="flex justify-between items-center">
            <h2 className="font-black text-sm text-slate-700">اختر الطاولة لبدء أو متابعة الطلب:</h2>
            <span className="text-xs text-slate-400 font-mono">{restaurantTables.length} طاولة</span>
          </div>

          {/* Section Filter Pills */}
          {tableSections.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
              <button
                onClick={() => setSelectedSection('all')}
                className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition active:scale-95 ${
                  selectedSection === 'all'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white border text-slate-600'
                }`}
              >
                جميع الأقسام
              </button>
              {tableSections.map(sec => (
                <button
                  key={sec}
                  onClick={() => setSelectedSection(sec)}
                  className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition active:scale-95 ${
                    selectedSection === sec
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white border text-slate-600'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>
          )}

          {/* Table Grid */}
          <div className="grid grid-cols-3 gap-3">
            {filteredTables.map(t => {
              const isOccupied = t.status === 'OCCUPIED';
              const hasPaging = pendingCalls.some(c => c.table_id === t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTable(t)}
                  className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-1 transition shadow-sm active:scale-95 text-center relative overflow-hidden ${
                    hasPaging
                      ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400 animate-pulse'
                      : isOccupied
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-400'
                  }`}
                >
                  {hasPaging && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
                  )}
                  <span className="font-black text-base">{t.name}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isOccupied ? 'bg-amber-200/80 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isOccupied ? 'مشغولة' : 'متاحة'}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">سعة {t.capacity} أفراد</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Screen 2: Menu & Order Taking */
        <div className="p-3 space-y-3 max-w-lg mx-auto">
          {/* Active Table Badge Bar */}
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-2xl flex justify-between items-center shadow">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="font-black text-sm">تسجيل طلب: {selectedTable.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {existingOrders.length > 0 && (
                <button
                  onClick={() => setIsExistingOrdersModalOpen(true)}
                  className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  الحساب الحالي ({existingOrdersTotal.toFixed(0)} ج)
                </button>
              )}
              <span className="text-xs font-mono font-bold text-emerald-400">
                السلة: {cart.length}
              </span>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث عن صنف أو مشروب..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2 bg-white border border-slate-200 rounded-2xl text-xs outline-none focus:ring-1 focus:ring-amber-500 shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Categories Pill Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition active:scale-95 ${
                activeCategory === 'all'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-white border text-slate-600'
              }`}
            >
              الكل ✨
            </button>
            {(menuCategories || []).map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition active:scale-95 ${
                  activeCategory === cat.id
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-white border text-slate-600'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Menu Items Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {sellableProducts.map(p => {
              const inCartCount = cart
                .filter(c => c.productId === p.id)
                .reduce((sum, c) => sum + c.quantity, 0);

              return (
                <div
                  key={p.id}
                  className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-col justify-between space-y-2 relative overflow-hidden active:border-amber-400 transition"
                >
                  {inCartCount > 0 && (
                    <span className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow">
                      {inCartCount}
                    </span>
                  )}
                  <div>
                    <span className="font-bold text-xs text-slate-800 line-clamp-2 leading-tight">
                      {p.name}
                    </span>
                    <span className="text-xs font-black text-amber-600 font-mono block mt-1">
                      {Number(p.sales_price || 0).toFixed(2)} ج
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => handleAddItem(p)}
                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1 shadow-sm active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" /> إضافة
                    </button>
                    <button
                      onClick={() => handleOpenModifiers(p)}
                      className="p-1.5 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 active:scale-95"
                      title="ملاحظات وتعديلات"
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Sticky Floating Cart & Send Bar */}
      {selectedTable && cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-2xl">
          <div className="max-w-lg mx-auto space-y-2">
            {/* Cart preview pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar text-xs">
              {cart.map((item, idx) => (
                <div
                  key={item.id}
                  className="bg-slate-100 border border-slate-200 rounded-xl px-2 py-1 flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                >
                  <span className="font-bold text-slate-700">{item.name}</span>
                  <span className="font-mono font-black text-amber-600">x{item.quantity}</span>
                  <div className="flex items-center gap-0.5 mr-1">
                    <button
                      onClick={() => updateQuantity(idx, -1)}
                      className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold"
                    >
                      -
                    </button>
                    <button
                      onClick={() => updateQuantity(idx, 1)}
                      className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Main Action Send Button */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">الإجمالي الجديد:</span>
                <span className="text-lg font-black text-slate-900 font-mono">
                  {cartTotal.toFixed(2)} ج
                </span>
              </div>

              <button
                onClick={handleSendOrder}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-95 transition"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'جاري الإرسال...' : 'إرسال للمطبخ 👨‍🍳🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cooking Notes & Modifiers Sheet */}
      {itemForModifiers && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center animate-in fade-in">
          <div className="bg-white rounded-t-3xl p-5 w-full max-w-lg space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="font-black text-sm text-slate-800">{itemForModifiers.name}</h3>
                <span className="text-xs text-amber-600 font-mono font-bold">
                  {Number(itemForModifiers.sales_price || 0).toFixed(2)} ج
                </span>
              </div>
              <button onClick={() => setItemForModifiers(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Notes Pills */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2">ملاحظات الطهي السريعة:</label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_NOTES.map(note => {
                  const isSelected = itemNotes.includes(note);
                  return (
                    <button
                      key={note}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setItemNotes(itemNotes.replace(note, '').replace(/,\s*,/g, ',').trim());
                        } else {
                          setItemNotes(itemNotes ? `${itemNotes}، ${note}` : note);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 ${
                        isSelected
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {note}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Notes Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظة خاصة للطلب:</label>
              <textarea
                rows={2}
                placeholder="اكتب أي تعليمات خاصة للشف (مثال: بدون بصل، صوص خارجي)..."
                value={itemNotes}
                onChange={e => setItemNotes(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemForModifiers(null)}
                className="flex-1 py-2.5 border rounded-xl font-bold text-xs text-slate-600"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveModifiers}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow active:scale-95"
              >
                تأكيد الإضافة للسلة ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Orders / Bill History Modal */}
      {isExistingOrdersModalOpen && selectedTable && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center animate-in fade-in">
          <div className="bg-white rounded-t-3xl p-5 w-full max-w-lg space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-black text-sm text-slate-800">حساب وطلبات طاولة: {selectedTable.name}</h3>
                  <span className="text-[11px] text-slate-400">كشف الحساب الجاري</span>
                </div>
              </div>
              <button onClick={() => setIsExistingOrdersModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {existingOrders.map((ord, oIdx) => (
                <div key={ord.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span>طلب #{ord.order_number || ord.id.slice(0, 5)}</span>
                    <span className="font-mono text-emerald-600">{Number(ord.grand_total).toFixed(2)} ج</span>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    {(ord.order_items || []).map((it: any) => (
                      <div key={it.id} className="py-1 flex justify-between items-center text-[11px]">
                        <div>
                          <span className="font-semibold text-slate-800">{it.products?.name}</span>
                          {it.notes && <span className="text-[10px] text-red-500 block">⚠️ {it.notes}</span>}
                        </div>
                        <div className="font-mono font-bold text-slate-600">
                          {it.quantity} x {Number(it.unit_price).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {existingOrders.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-6">لا توجد طلبات سابقة مسجلة لهذه الطاولة</p>
              )}
            </div>

            {/* Total summary */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex justify-between items-center">
              <span className="font-bold text-xs text-amber-900">إجمالي الحساب الجاري:</span>
              <span className="font-black text-base font-mono text-amber-900">{existingOrdersTotal.toFixed(2)} ج</span>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleRequestBill}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow active:scale-95"
              >
                <Printer className="w-4 h-4" /> طباعة شيك الحساب للزبون
              </button>
              <button
                onClick={() => setIsExistingOrdersModalOpen(false)}
                className="px-5 py-3 border border-slate-300 rounded-xl text-xs font-bold text-slate-600"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MobileWaiterScreen;
