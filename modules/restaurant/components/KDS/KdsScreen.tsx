import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../../supabaseClient';
import { useToast } from '../../../../context/ToastContext';
import { useAccounting } from '../../../../context/AccountingContext';
import { Utensils, Clock, Check, ChefHat, Layers, Filter, Flame, Timer, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { KitchenStation, kitchenStationService } from '../../../../services/kitchenStationService';
import { cookPacingService } from '../../../../services/cookPacingService';
import { secureStorage } from '../../../../utils/securityMiddleware';

// --- أنواع البيانات ---
type KitchenOrderItem = {
  id: string; // item id
  kitchen_order_id?: string | null;
  status: 'NEW' | 'PREPARING' | 'READY' | 'SERVED';
  quantity: number;
  notes: string | null; // Changed to unit_price
  selectedModifiers?: { name: string; unit_price: number }[];
  product_name: string;
  station_id?: string | null;
  station_name?: string;
  station_color?: string;
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
  const pacingEval = useMemo(() => {
    return cookPacingService.evaluateTicketPacing(ticket.created_at, ticket.items);
  }, [ticket.created_at, ticket.items]);

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
        {ticket.items.map(item => {
          const itemPacing = pacingEval.itemsPacing[item.id];
          const isHold = itemPacing?.state === 'HOLD' && item.status === 'NEW';
          const isFire = itemPacing?.state === 'FIRE_NOW' && item.status === 'NEW';

          return (
            <div key={item.id} className={`p-2 rounded-md border ${getStatusColor(item.status)}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-lg text-slate-900">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white font-mono text-sm mr-2">{item.quantity}x</span>
                      {item.product_name}
                    </p>

                    {item.station_name && (
                      <span
                        className="text-[11px] px-2.5 py-0.5 rounded-md text-white font-bold shadow-sm inline-flex items-center gap-1.5"
                        style={{ backgroundColor: item.station_color || '#e11d48' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        {item.station_name.split('(')[0].trim()}
                      </span>
                    )}
                  </div>

                  {/* Cook Pacing Indicators */}
                  {isHold && (
                    <div className="mt-1 ml-9 inline-flex items-center gap-1 bg-amber-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm">
                      <Timer size={12} className="animate-spin" />
                      <span>تأخير ذكي (HOLD): ابدأ بعد {Math.ceil(itemPacing.secondsRemainingToStart / 60)} دقيقة لتتزامن الطاولة</span>
                    </div>
                  )}

                  {isFire && (
                    <div className="mt-1 ml-9 inline-flex items-center gap-1 bg-rose-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm animate-pulse">
                      <Flame size={12} />
                      <span>ابدأ التحضير الآن (FIRE)! 🔥</span>
                    </div>
                  )}

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
                    <button
                      onClick={() => onUpdateStatus(item.id, 'PREPARING')}
                      className="bg-amber-500 text-white p-2 rounded-lg hover:bg-amber-600 transition-colors"
                      title={isHold ? 'بدء التحضير الفوري وتجاوز الانتظار' : 'بدء التحضير'}
                    >
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
          );
        })}
      </main>
    </div>
  );
});

// --- المكون الرئيسي ---
const KdsScreen = () => {
  const [tickets, setTickets] = useState<KitchenOrderTicket[]>([]);
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>(() => {
    return secureStorage.getItem<string>('kds_selected_station_filter') || 'ALL';
  });
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const { updateKitchenOrderStatus, currentUser } = useAccounting();
  const [audioEnabled, setAudioEnabled] = useState(false);

  const handleSelectStation = useCallback((stId: string) => {
    setSelectedStationId(stId);
    secureStorage.setItem('kds_selected_station_filter', stId);
  }, []);

  const stationsMap = useMemo(() => {
    const map: Record<string, KitchenStation> = {};
    stations.forEach(s => {
      map[s.id] = s;
      if (s.code) map[s.code] = s;
    });
    return map;
  }, [stations]);
  
  // جلب معرف المنظمة لضمان دقة البيانات في بيئة SaaS
  const getOrgId = useCallback(async () => {
    if (currentUser?.organization_id) return currentUser.organization_id;
    const { data: { session } } = await supabase.auth.getSession();
    const metadataOrgId = session?.user?.user_metadata?.org_id || session?.user?.app_metadata?.org_id;
    if (metadataOrgId) return metadataOrgId;

    // Fallback: جلب المعرف من البروفايل مباشرة إذا كان مفقوداً في الميتا داتا
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', session?.user?.id)
      .maybeSingle();
    
    return profile?.organization_id;
  }, [currentUser]);

  useEffect(() => {
    getOrgId().then(orgId => {
      if (orgId) {
        kitchenStationService.getStations(orgId).then(res => setStations(res));
      }
    });
  }, [getOrgId]);

  const fetchKitchenOrders = async () => {
    try {
      const orgId = await getOrgId();
      if (!orgId) {
        console.warn("Organization ID not found, retrying...");
        return;
      }

      // جلب الطلبات النشطة مباشرة من orders و order_items لضمان ظهور التذاكر فورياً
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, 
          order_number, 
          status, 
          created_at, 
          order_type,
          table_sessions!left (
            table_id,
            restaurant_tables (name)
          ),
          order_items (
            id, quantity, notes, modifiers,
            products (id, name, station_id),
            kitchen_orders (id, status)
          )
        `)
        .eq('organization_id', orgId)
        .in('status', ['CONFIRMED', 'IN_PROGRESS', 'PAID', 'NEW', 'PREPARING', 'READY', 'draft', 'open', 'PENDING_PAYMENT', 'SERVED'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      const currentStations = stations.length > 0 ? stations : await kitchenStationService.getStations(orgId);
      const currentMap: Record<string, KitchenStation> = {};
      currentStations.forEach(s => {
        currentMap[s.id] = s;
        if (s.code) currentMap[s.code] = s;
      });

      const groupedByOrder: { [key: string]: KitchenOrderTicket } = {};

      (data || []).forEach((order: any) => {
        const orderId = order.id;
        const sessionObj = Array.isArray(order.table_sessions) ? order.table_sessions[0] : order.table_sessions;
        const tableName = sessionObj?.restaurant_tables?.name || (order.order_type === 'TAKEAWAY' ? 'سفري' : order.order_type === 'DELIVERY' ? 'توصيل' : 'طاولة صالة');

        const activeItems: KitchenOrderItem[] = [];

        (order.order_items || []).forEach((oi: any) => {
          const koStatus = (oi.kitchen_orders?.[0]?.status || kitchenStationService.getSavedStatus(oi.id) || 'NEW').toUpperCase();
          // الأطباق التي تم تسليمها للطاولة (SERVED) تخرج من شاشة تحضير المطبخ
          if (koStatus === 'SERVED') return;

          const prod = Array.isArray(oi.products) ? oi.products[0] : oi.products;
          const prodStationId = prod?.station_id || null;
          const st = prodStationId ? currentMap[prodStationId] : null;

          activeItems.push({
            id: oi.id,
            kitchen_order_id: oi.kitchen_orders?.[0]?.id || null,
            status: koStatus as any,
            quantity: oi.quantity,
            notes: oi.notes,
            selectedModifiers: oi.modifiers,
            product_name: prod?.name || 'صنف',
            station_id: prodStationId,
            station_name: st?.name,
            station_color: st?.color,
          });
        });

        if (activeItems.length > 0) {
          activeItems.sort((a, b) => a.product_name.localeCompare(b.product_name));
          groupedByOrder[orderId] = {
            order_id: orderId,
            order_number: order.order_number || `ORD-${orderId.slice(0, 5)}`,
            table_name: tableName,
            created_at: order.created_at,
            items: activeItems,
          };
        }
      });

      const sortedTickets = Object.values(groupedByOrder).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setTickets(sortedTickets);

    } catch (err: any) {
      showToast('فشل تحميل طلبات المطبخ: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const memoizedFetchKitchenOrders = useCallback(fetchKitchenOrders, [showToast, setTickets, setLoading, stations, getOrgId]);

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
    let subscription: any;
    
    getOrgId().then(orgId => {
      if (!orgId) return;
      subscription = supabase.channel(`kds-changes-${orgId}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'orders',
          filter: `organization_id=eq.${orgId}` 
        }, payload => {
          throttledFetch();
          if (payload.eventType === 'INSERT') {
            try {
              const audio = new Audio('/notification.mp3');
              audio.play().catch(e => console.warn("Audio play notice:", e));
            } catch (e) { console.error(e); }
          }
        })
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'order_items',
          filter: `organization_id=eq.${orgId}` 
        }, () => {
          throttledFetch();
        })
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'kitchen_orders',
          filter: `organization_id=eq.${orgId}` 
        }, () => {
          throttledFetch();
        })
        .subscribe();
    });

    return () => { if (subscription) supabase.removeChannel(subscription); };
  }, [throttledFetch, getOrgId]);

  const handleUpdateStatus = useCallback(async (itemId: string, newStatus: 'PREPARING' | 'READY' | 'SERVED') => {
    // ⚡ تحديث تفاؤلي (Optimistic UI): نقوم بنقل الطلب في الواجهة فوراً ليشعر الشيف بسرعة النظام
    setTickets(prev => prev.map(ticket => ({
      ...ticket,
      items: ticket.items.map(item => 
        item.id === itemId ? { ...item, status: newStatus } : item
      )
    })).filter(ticket => {
      // إذا تم تسليم الطلب، نخفي التذكرة من الشاشة إذا كانت جميع أصنافها اكتملت
      if (newStatus === 'SERVED') {
        return ticket.items.some(i => i.id !== itemId && i.status !== 'SERVED');
      }
      return true;
    }));

    // حفظ الحالة في الذاكرة اللحظية
    kitchenStationService.updateTicketItemStatus(itemId, newStatus);

    try {
      // البحث عن kitchen_order_id لتحديثه في قاعدة البيانات إن وجد
      const ticket = tickets.find(t => t.items.some(i => i.id === itemId));
      const targetItem = ticket?.items.find(i => i.id === itemId);
      if (targetItem?.kitchen_order_id) {
        await updateKitchenOrderStatus(targetItem.kitchen_order_id, newStatus);
      } else {
        await supabase.from('kitchen_orders').update({ status: newStatus }).eq('order_item_id', itemId);
      }
    } catch (err) {
      console.warn('Kitchen status update notice:', err);
    }
  }, [tickets, updateKitchenOrderStatus, setTickets]);

  // إحصائيات عدد الأطباق الجارية في كل محطة
  const stationItemCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0, UNASSIGNED: 0 };
    tickets.forEach(t => {
      t.items.forEach(i => {
        counts.ALL = (counts.ALL || 0) + 1;
        if (i.station_id) {
          counts[i.station_id] = (counts[i.station_id] || 0) + 1;
          const st = stationsMap[i.station_id];
          if (st && st.code) counts[st.code] = (counts[st.code] || 0) + 1;
        } else {
          counts.UNASSIGNED = (counts.UNASSIGNED || 0) + 1;
        }
      });
    });
    return counts;
  }, [tickets, stationsMap]);

  // تصفية التذاكر والأصناف بحسب محطة المطبخ المختارة (شواية، بارد، مشروبات، مقليات...)
  const filteredTickets = useMemo(() => {
    if (selectedStationId === 'ALL') return tickets;

    return tickets
      .map(ticket => ({
        ...ticket,
        items: ticket.items.filter(item => {
          if (!item.station_id) {
            return selectedStationId === 'UNASSIGNED';
          }
          return (
            item.station_id === selectedStationId ||
            stationsMap[item.station_id]?.code === selectedStationId
          );
        })
      }))
      .filter(ticket => ticket.items.length > 0);
  }, [tickets, selectedStationId, stationsMap]);

  const newTickets = useMemo(() => filteredTickets.filter(t => t.items.some(i => i.status === 'NEW')), [filteredTickets]);
  const preparingTickets = useMemo(() => filteredTickets.filter(t => !t.items.some(i => i.status === 'NEW') && t.items.some(i => i.status === 'PREPARING')), [filteredTickets]);
  const readyTickets = useMemo(() => filteredTickets.filter(t => !t.items.some(i => i.status === 'NEW' || i.status === 'PREPARING') && t.items.some(i => i.status === 'READY')), [filteredTickets]);

  if (loading) return <div className="p-8 text-center text-lg font-bold">جاري تحميل طلبات المطبخ...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4" dir="rtl">
      {/* KDS Header with Station Filters */}
      <header className="mb-4 flex flex-wrap justify-between items-center gap-3 bg-slate-800 p-4 rounded-xl border border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-600 rounded-xl">
            <Utensils className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black">شاشة المطبخ الذكي (KDS Routing)</h1>
            <span className="text-xs text-slate-400">توجيه الأطباق لمحطات الطهي المخصصة</span>
          </div>
        </div>

        {/* Station Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-slate-700 text-xs">
          <button
            onClick={() => handleSelectStation('ALL')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              selectedStationId === 'ALL' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>كل المحطات</span>
            {stationItemCounts['ALL'] > 0 && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                {stationItemCounts['ALL']}
              </span>
            )}
          </button>
          {stations.map(st => {
            const count = stationItemCounts[st.id] || stationItemCounts[st.code] || 0;
            const isSelected = selectedStationId === st.id || selectedStationId === st.code;
            return (
              <button
                key={st.id}
                onClick={() => handleSelectStation(st.id)}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                  isSelected ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                <span>{st.name.split('(')[0].trim()}</span>
                {count > 0 && (
                  <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick link to Expo */}
        <Link
          to="/restaurant/expo"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
        >
          <Layers className="w-4 h-4" /> شاشة التجميع (Expo) 🚀
        </Link>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-8.5rem)]">
        <section className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 overflow-y-auto">
          <h2 className="text-lg font-black text-blue-400 mb-3 sticky top-0 bg-slate-800/95 backdrop-blur-sm py-2 z-10 border-b border-slate-700">
            طلبات جديدة ({newTickets.length})
          </h2>
          <div className="space-y-4">
            {newTickets.map(ticket => (
              <OrderTicket key={ticket.order_id} ticket={ticket} onUpdateStatus={handleUpdateStatus} borderColor="border-blue-500" />
            ))}
          </div>
        </section>

        <section className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 overflow-y-auto">
          <h2 className="text-lg font-black text-amber-400 mb-3 sticky top-0 bg-slate-800/95 backdrop-blur-sm py-2 z-10 border-b border-slate-700">
            قيد التحضير ({preparingTickets.length})
          </h2>
          <div className="space-y-4">
            {preparingTickets.map(ticket => (
              <OrderTicket key={ticket.order_id} ticket={ticket} onUpdateStatus={handleUpdateStatus} borderColor="border-amber-500" />
            ))}
          </div>
        </section>

        <section className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 overflow-y-auto">
          <h2 className="text-lg font-black text-emerald-400 mb-3 sticky top-0 bg-slate-800/95 backdrop-blur-sm py-2 z-10 border-b border-slate-700">
            جاهز للتقديم ({readyTickets.length})
          </h2>
          <div className="space-y-4">
            {readyTickets.map(ticket => (
              <OrderTicket key={ticket.order_id} ticket={ticket} onUpdateStatus={handleUpdateStatus} borderColor="border-emerald-500" />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default KdsScreen;