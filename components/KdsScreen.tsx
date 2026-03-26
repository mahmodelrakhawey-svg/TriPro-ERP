import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { useAccounting } from '../context/AccountingContext';
import { Utensils, Clock, Check, ChefHat } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

// --- أنواع البيانات ---
type KitchenOrderItem = {
  id: string; // kitchen_order id
  status: 'NEW' | 'PREPARING' | 'READY' | 'SERVED';
  quantity: number;
  notes: string | null;
  selectedModifiers?: { name: string; price: number }[];
  product_name: string;
};

type KitchenOrderTicket = {
  order_id: string;
  order_number: string;
  table_name: string | null;
  created_at: string;
  items: KitchenOrderItem[];
};

// --- المكونات الفرعية ---
const TimeAgo = ({ date }: { date: string }) => {
  const [time, setTime] = useState(() => formatDistanceToNow(new Date(date), { addSuffix: true, locale: ar }));

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatDistanceToNow(new Date(date), { addSuffix: true, locale: ar }));
    }, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [date]);

  return <>{time}</>;
};
const OrderTicket = React.memo(({ ticket, onUpdateStatus, borderColor }: { ticket: KitchenOrderTicket, onUpdateStatus: (id: string, status: 'PREPARING' | 'READY' | 'SERVED') => void, borderColor: string }) => {

  const getStatusColor = (status: KitchenOrderItem['status']) => {
    switch (status) {
      case 'NEW': return 'bg-blue-100 border-blue-300';
      case 'PREPARING': return 'bg-amber-100 border-amber-300';
      case 'READY': return 'bg-emerald-100 border-emerald-300';
      default: return 'bg-slate-100';
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-md border-t-4 ${borderColor} flex flex-col animate-in fade-in`}>
      <header className="p-3 border-b bg-slate-50 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-xl text-slate-800">{ticket.table_name || 'سفري/توصيل'}</h3>
          <p className="text-xs text-slate-500">{ticket.order_number}</p>
        </div>
        <div className="text-right">
          <div className="font-semibold text-slate-600 text-sm flex items-center gap-1">
            <Clock size={14} /> <TimeAgo date={ticket.created_at} />
          </div>
        </div>
      </header>
      <main className="p-3 space-y-3 flex-1">
        {ticket.items.map(item => (
          <div key={item.id} className={`p-2 rounded-md border ${getStatusColor(item.status)}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-lg text-slate-900">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white font-mono text-sm mr-2">{item.quantity}x</span>
                  {item.product_name}
                </p>
                {/* عرض الإضافات بشكل بارز للطباخ */}
                {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                  <div className="mt-1 ml-9 flex flex-wrap gap-1">
                    {item.selectedModifiers.map((mod, idx) => (
                      <span key={idx} className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow-sm">
                        {mod.name}
                      </span>
                    ))}
                  </div>
                )}
                {item.notes && (
                  <p className="text-sm text-red-700 font-black mt-2 ml-9 bg-red-50 p-2 rounded border-2 border-red-200 animate-pulse">
                    ⚠️ {item.notes}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {item.status === 'NEW' && (
                  <button onClick={() => onUpdateStatus(item.id, 'PREPARING')} className="bg-amber-500 text-white p-2 rounded-lg hover:bg-amber-600 transition-colors">
                    <ChefHat size={20} />
                  </button>
                )}
                {item.status === 'PREPARING' && (
                  <button onClick={() => onUpdateStatus(item.id, 'READY')} className="bg-emerald-500 text-white p-2 rounded-lg hover:bg-emerald-600 transition-colors">
                    <Check size={20} />
                  </button>
                )}
                {item.status === 'READY' && (
                  <button onClick={() => onUpdateStatus(item.id, 'SERVED')} className="bg-sky-500 text-white p-2 rounded-lg hover:bg-sky-600 transition-colors" title="تقديم الطلب (إخفاء من الشاشة)">
                    <Utensils size={20} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
});

// --- المكون الرئيسي ---
const KdsScreen = () => {
  const [tickets, setTickets] = useState<KitchenOrderTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const { updateKitchenOrderStatus } = useAccounting();
  const [audioEnabled, setAudioEnabled] = useState(false);
  
  const fetchKitchenOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('kitchen_orders')
        .select(`
          id, status, created_at,
          order_items!inner(
            id, quantity, notes, modifiers,
            products!inner(name),
            orders!inner(id, order_number, created_at, table_sessions(restaurant_tables(name)))
          )
        `)
        .in('status', ['NEW', 'PREPARING', 'READY'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      const groupedByOrder: { [key: string]: KitchenOrderTicket } = {};
      data.forEach((ko: any) => { //NOSONAR
        const orderItem = ko.order_items;
        if (!orderItem || !orderItem.orders) return;
        const order = orderItem.orders;
        const orderId = order.id;

        if (!groupedByOrder[orderId]) {
          groupedByOrder[orderId] = {
            order_id: orderId,
            order_number: order.order_number,
            table_name: order.table_sessions?.restaurant_tables?.name || 'سفري/توصيل',
            created_at: order.created_at,
            items: [],
          };
        }

        // تجميع الأصناف المتشابهة
        const notesString = orderItem.notes || '';
        const modifiersString = JSON.stringify(orderItem.modifiers || []);
        const existingItemIndex = groupedByOrder[orderId].items.findIndex(
          i => i.product_name === orderItem.products.name && i.notes === notesString && JSON.stringify(i.selectedModifiers || []) === modifiersString
        );

        if (existingItemIndex > -1) {
          groupedByOrder[orderId].items[existingItemIndex].quantity += orderItem.quantity;
        } else {
          groupedByOrder[orderId].items.push({
            id: ko.id, // We might need to handle multiple IDs if we truly aggregate
            status: ko.status,
            quantity: orderItem.quantity,
            notes: orderItem.notes,
            selectedModifiers: orderItem.modifiers,
            product_name: orderItem.products.name,
          });
        }
      });

      Object.values(groupedByOrder).forEach(ticket => {
        ticket.items.sort((a, b) => a.product_name.localeCompare(b.product_name));
      });

      const sortedTickets = Object.values(groupedByOrder).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setTickets(sortedTickets);

    } catch (err: any) {
      showToast('فشل تحميل طلبات المطبخ: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const memoizedFetchKitchenOrders = useCallback(fetchKitchenOrders, [showToast, setTickets, setLoading]);

  // 🚀 تحسين الأداء: منع تكرار جلب البيانات في وقت قصير جداً (Throttling) لتخفيف الضغط
  const lastFetchTime = useRef(0);
  const throttledFetch = useCallback(() => {
    const now = Date.now();
    if (now - lastFetchTime.current > 1500) { // حد أدنى 1.5 ثانية بين التحديثات اللحظية
      lastFetchTime.current = now;
      memoizedFetchKitchenOrders();
    }
  }, [memoizedFetchKitchenOrders]);

  useEffect(() => {
    throttledFetch();
    const subscription = supabase.channel('public:kitchen_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_orders' }, payload => {
        throttledFetch();
        if (payload.eventType === 'INSERT') {
            try {
                const audio = new Audio('/notification.mp3');
                audio.play().catch(e => console.warn("Audio play failed, user interaction might be needed.", e));
            } catch (e) { console.error(e) }
        }
      }).subscribe();
    return () => { supabase.removeChannel(subscription); };
  }, [throttledFetch]);

  const handleUpdateStatus = useCallback(async (kitchenOrderItemId: string, newStatus: 'PREPARING' | 'READY' | 'SERVED') => {
    // ⚡ تحديث تفاؤلي (Optimistic UI): نقوم بنقل الطلب في الواجهة فوراً ليشعر الشيف بسرعة النظام
    setTickets(prev => prev.map(ticket => ({
      ...ticket,
      items: ticket.items.map(item => 
        item.id === kitchenOrderItemId ? { ...item, status: newStatus } : item
      )
    })).filter(ticket => {
      // إذا تم تسليم الطلب، نخفي التذكرة من الشاشة إذا كانت جميع أصنافها اكتملت
      if (newStatus === 'SERVED') {
        return ticket.items.some(i => i.id !== kitchenOrderItemId && i.status !== 'SERVED');
      }
      return true;
    }));

    try {
      await updateKitchenOrderStatus(kitchenOrderItemId, newStatus);
    } catch (err) {
      // في حالة فشل الاتصال، نعيد جلب البيانات الأصلية لضمان الدقة
      memoizedFetchKitchenOrders();
    }
  }, [updateKitchenOrderStatus, setTickets, memoizedFetchKitchenOrders]);

  const newTickets = useMemo(() => tickets.filter(t => t.items.some(i => i.status === 'NEW')), [tickets]);
  const preparingTickets = useMemo(() => tickets.filter(t => !t.items.some(i => i.status === 'NEW') && t.items.some(i => i.status === 'PREPARING')), [tickets]);
  const readyTickets = useMemo(() => tickets.filter(t => !t.items.some(i => i.status === 'NEW' || i.status === 'PREPARING') && t.items.some(i => i.status === 'READY')), [tickets]);

  if (loading) return <div className="p-8 text-center text-lg font-bold">جاري تحميل طلبات المطبخ...</div>;

  return (
    <div className="h-screen bg-slate-800 text-white p-4" dir="rtl">
      <header className="mb-4">
        <h1 className="text-3xl font-bold flex items-center gap-3"><Utensils /> شاشة المطبخ (KDS)</h1>
      </header>
      <main className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-5rem)]">
        <section className="bg-slate-700/50 rounded-lg p-3 overflow-y-auto">
          <h2 className="text-xl font-bold text-blue-300 mb-3 sticky top-0 bg-slate-700/80 backdrop-blur-sm py-2 z-10">طلبات جديدة ({newTickets.length})</h2>
          <div className="space-y-4">
            {newTickets.map(ticket => <OrderTicket key={ticket.order_id} ticket={ticket} onUpdateStatus={handleUpdateStatus} borderColor="border-blue-500" />)}
          </div>
        </section>
        <section className="bg-slate-700/50 rounded-lg p-3 overflow-y-auto">
          <h2 className="text-xl font-bold text-amber-300 mb-3 sticky top-0 bg-slate-700/80 backdrop-blur-sm py-2 z-10">قيد التحضير ({preparingTickets.length})</h2>
          <div className="space-y-4">
            {preparingTickets.map(ticket => <OrderTicket key={ticket.order_id} ticket={ticket} onUpdateStatus={handleUpdateStatus} borderColor="border-amber-500" />)}
          </div>
        </section>
        <section className="bg-slate-700/50 rounded-lg p-3 overflow-y-auto">
          <h2 className="text-xl font-bold text-emerald-300 mb-3 sticky top-0 bg-slate-700/80 backdrop-blur-sm py-2 z-10">جاهز للتقديم ({readyTickets.length})</h2>
           <div className="space-y-4">
            {readyTickets.map(ticket => <OrderTicket key={ticket.order_id} ticket={ticket} onUpdateStatus={handleUpdateStatus} borderColor="border-emerald-500" />)}
          </div>
        </section>
      </main>
    </div>
  );
};

export default KdsScreen;