import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  KitchenStation,
  KitchenTicketItemDetail,
  ExpoTicketDetail,
  kitchenStationService,
  DEFAULT_KITCHEN_STATIONS
} from '../../../../services/kitchenStationService';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Bell,
  Utensils,
  Layers,
  Filter,
  CheckCheck,
  RefreshCw,
  Volume2,
  Sparkles,
  Flame,
  Coffee,
  Leaf
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export const ExpoScreen: React.FC = () => {
  const { currentUser, products, restaurantTables } = useAccounting();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<any[]>([]);
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('ALL'); // ALL, DINE_IN, TAKEAWAY, DELIVERY
  const [audioEnabled, setAudioEnabled] = useState(true);

  const fetchExpoData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          order_type,
          status,
          notes,
          created_at,
          session_id,
          table_sessions (
            id,
            table_id,
            restaurant_tables (name)
          ),
          order_items (
            id,
            product_id,
            quantity,
            unit_price,
            notes,
            modifiers,
            products (name, category_id, station_id),
            kitchen_orders (id, status)
          )
        `)
        .in('status', ['CONFIRMED', 'NEW', 'PREPARING', 'READY', 'draft', 'open', 'PENDING_PAYMENT', 'PAID', 'IN_PROGRESS'])
        .order('created_at', { ascending: true });

      if (currentUser?.organization_id) {
        query = query.eq('organization_id', currentUser.organization_id);
      }

      const [fetchedStations, ordersRes] = await Promise.all([
        kitchenStationService.getStations(currentUser?.organization_id || undefined),
        query
      ]);

      setStations(fetchedStations);

      if (ordersRes.data) {
        setOrders(ordersRes.data);
      }
    } catch (err: any) {
      console.warn('Expo data load notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpoData();

    // Realtime subscription
    const orgId = currentUser?.organization_id || 'global';
    const channel = supabase
      .channel(`expo-orders-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchExpoData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_orders' }, () => {
        fetchExpoData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_ticket_items' }, () => {
        fetchExpoData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // Stations map
  const stationsMap = useMemo(() => {
    const map: Record<string, KitchenStation> = {};
    stations.forEach(s => {
      map[s.id] = s;
      map[s.code] = s;
    });
    return map;
  }, [stations]);

  // Process tickets for Expo
  const expoTickets: ExpoTicketDetail[] = useMemo(() => {
    return orders
      .filter(o => filterType === 'ALL' || o.order_type === filterType)
      .filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED')
      .map(o => {
        const items: KitchenTicketItemDetail[] = (o.order_items || []).map((oi: any) => {
          const matchingProduct = products.find(p => p.id === oi.product_id);
          const prodStationId = oi.products?.station_id || (matchingProduct as any)?.station_id;
          const st = prodStationId ? stationsMap[prodStationId] : null;

          const ko = Array.isArray(oi.kitchen_orders) ? oi.kitchen_orders[0] : oi.kitchen_orders;
          const koStatus = ko?.status?.toUpperCase();
          const savedStatus = kitchenStationService.getSavedStatus(oi.id);

          const finalStatus: 'NEW' | 'PREPARING' | 'READY' | 'SERVED' =
            koStatus ||
            (savedStatus as any) ||
            (o.status === 'READY' ? 'READY' : o.status === 'PREPARING' ? 'PREPARING' : 'NEW');

          return {
            id: oi.id,
            order_id: o.id,
            order_item_id: oi.id,
            product_id: oi.product_id,
            product_name: oi.products?.name || matchingProduct?.name || 'صنف',
            station_id: prodStationId,
            station_name: st?.name || (prodStationId ? 'محطة مخصصة' : 'محطة عامة'),
            station_color: st?.color || '#64748b',
            quantity: oi.quantity,
            status: finalStatus,
            notes: oi.notes,
            selectedModifiers: oi.modifiers
          };
        });

        const totalItems = items.length;
        const readyItems = items.filter(i => i.status === 'READY' || i.status === 'SERVED').length;
        const servedItems = items.filter(i => i.status === 'SERVED').length;
        const isAllReady = totalItems > 0 && readyItems === totalItems;
        const isAllServed = totalItems > 0 && servedItems === totalItems;
        const completionPct = totalItems > 0 ? (readyItems / totalItems) * 100 : 0;

        const sessionObj = Array.isArray(o.table_sessions) ? o.table_sessions[0] : o.table_sessions;
        const matchedTable = restaurantTables?.find((t: any) => t.id === sessionObj?.table_id);
        const resolvedTableName =
          sessionObj?.restaurant_tables?.name ||
          matchedTable?.name ||
          (o.order_type === 'DELIVERY' ? 'توصيل' : o.order_type === 'TAKEAWAY' ? 'سفري' : 'طاولة صالة');

        return {
          order_id: o.id,
          order_number: o.order_number || `ORD-${o.id.slice(0, 5)}`,
          table_name: resolvedTableName,
          order_type: o.order_type || 'DINE_IN',
          created_at: o.created_at,
          items,
          total_items_count: totalItems,
          ready_items_count: readyItems,
          is_all_ready: isAllReady,
          is_all_served: isAllServed,
          completion_pct: Number(completionPct.toFixed(0))
        };
      })
      .filter(ticket => !ticket.is_all_served && ticket.total_items_count > 0);
  }, [orders, filterType, stationsMap, products, restaurantTables]);

  // Serve all items of order
  const handleServeAll = async (orderId: string) => {
    try {
      const targetOrder = orders.find(o => o.id === orderId);
      if (targetOrder && targetOrder.order_items) {
        const itemIds = targetOrder.order_items.map((oi: any) => oi.id);
        await supabase.from('kitchen_orders').update({ status: 'SERVED' }).in('order_item_id', itemIds);
        itemIds.forEach((id: string) => {
          kitchenStationService.updateTicketItemStatus(id, 'SERVED');
        });
      }

      // إذا كان الطلب سفري أو توصيل وتم سداده مسبقاً، أو كان طلب منصة توصيل (مدفوع آجل للمنصة ومقيد محاسبياً)، ننهيه بالكامل
      const isPlatformOrder = targetOrder?.notes?.includes('منصة توصيل');
      if ((targetOrder?.order_type !== 'DINE_IN' && targetOrder?.status === 'PAID') || isPlatformOrder) {
        await supabase.from('orders').update({ status: 'COMPLETED' }).eq('id', orderId);
        showToast('تم تسليم الطلب لسائق المنصة وإنهاء دورة الطلب بنجاح 🛵', 'success');
      } else {
        await supabase.from('orders').update({ status: 'SERVED' }).eq('id', orderId);
        showToast('تم تسليم وخروج كامل الطلب للعميل بنجاح 🍽️ (بانتظار سداد الحساب لدى الكاشير)', 'success');
      }
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    }
  };

  const handleUpdateItemStatus = async (itemId: string, newStatus: 'NEW' | 'PREPARING' | 'READY' | 'SERVED') => {
    try {
      await supabase.from('kitchen_orders').update({ status: newStatus }).eq('order_item_id', itemId);
    } catch (e) {
      console.warn('kitchen_orders update notice:', e);
    }
    await kitchenStationService.updateTicketItemStatus(itemId, newStatus);
    fetchExpoData();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-6 space-y-6">
      {/* Top Expo Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-800/80 backdrop-blur p-5 rounded-2xl border border-slate-700 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl text-white shadow-lg">
            <Layers className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-wide">شاشة التجميع والمتابعة (Master Expo)</h1>
              <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-indigo-500/30">
                Live Kitchen Sync
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              متابعة جاهزية وتجميع أصناف المطبخ متعدد المحطات لخروج الطاولة متزامنة وساخنة
            </p>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Order Type Filter */}
          <div className="bg-slate-900/80 p-1 rounded-xl border border-slate-700 flex text-xs font-bold">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل ({orders.length})
            </button>
            <button
              onClick={() => setFilterType('DINE_IN')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'DINE_IN' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              صالة
            </button>
            <button
              onClick={() => setFilterType('TAKEAWAY')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'TAKEAWAY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              سفري
            </button>
            <button
              onClick={() => setFilterType('DELIVERY')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'DELIVERY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              توصيل
            </button>
          </div>

          <Link
            to="/kds"
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition"
          >
            <ChefHat className="w-4 h-4" /> شاشة المطبخ (KDS)
          </Link>

          <button
            onClick={fetchExpoData}
            className="p-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expo Orders Grid */}
      {loading && expoTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <RefreshCw className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
          <span>جاري تحميل طلبات المطبخ والتجميع...</span>
        </div>
      ) : expoTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 bg-slate-800/40 rounded-3xl border border-slate-800">
          <ChefHat className="w-16 h-16 stroke-1 text-slate-600 mb-3" />
          <h3 className="text-lg font-bold text-slate-300">المطبخ هادئ تماماً! لا توجد طلبات معلقة</h3>
          <p className="text-xs text-slate-500 mt-1">
            الطلبات الجديدة المرسلة من الكاشير أو الويتر ستظهر هنا تلقائياً ولحظياً
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {expoTickets.map(ticket => {
            const isComplete = ticket.is_all_ready;

            return (
              <div
                key={ticket.order_id}
                className={`bg-slate-800 rounded-2xl border flex flex-col overflow-hidden shadow-xl transition-all duration-300 ${
                  isComplete
                    ? 'border-emerald-500 ring-2 ring-emerald-500/30 animate-pulse bg-emerald-950/20'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                {/* Ticket Header */}
                <div
                  className={`p-4 flex justify-between items-center border-b ${
                    isComplete
                      ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-100'
                      : 'bg-slate-900/60 border-slate-700 text-slate-200'
                  }`}
                >
                  <div>
                    <h3 className="font-extrabold text-xl">
                      {ticket.table_name || (ticket.order_type === 'DELIVERY' ? 'توصيل' : 'سفري')}
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">#{ticket.order_number}</span>
                  </div>

                  <div className="text-left">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        isComplete
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {ticket.ready_items_count} / {ticket.total_items_count} جاهز
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-900 h-1.5">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isComplete ? 'bg-emerald-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${ticket.completion_pct}%` }}
                  />
                </div>

                {/* Items List */}
                <div className="p-4 flex-1 space-y-2.5 overflow-y-auto max-h-80">
                  {ticket.items.map(item => {
                    const isItemReady = item.status === 'READY' || item.status === 'SERVED';
                    const isPreparing = item.status === 'PREPARING';

                    return (
                      <div
                        key={item.id}
                        onClick={() =>
                          handleUpdateItemStatus(item.id, isItemReady ? 'PREPARING' : 'READY')
                        }
                        className={`p-2.5 rounded-xl border cursor-pointer transition flex items-start justify-between gap-2 ${
                          isItemReady
                            ? 'bg-emerald-900/20 border-emerald-600/40 text-emerald-200'
                            : isPreparing
                            ? 'bg-amber-900/20 border-amber-600/40 text-amber-200'
                            : 'bg-slate-900/40 border-slate-700/60 text-slate-300 hover:bg-slate-700/40'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-slate-700 font-mono font-bold text-xs flex items-center justify-center text-white">
                              {item.quantity}x
                            </span>
                            <span className={`font-bold text-sm ${isItemReady ? 'line-through opacity-75' : ''}`}>
                              {item.product_name}
                            </span>
                          </div>

                          {/* Station Badge */}
                          <div className="mt-1 mr-8 flex items-center gap-2">
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-md text-white"
                              style={{ backgroundColor: item.station_color }}
                            >
                              {item.station_name}
                            </span>

                            {item.notes && (
                              <span className="text-[10px] bg-red-950 text-red-300 px-2 py-0.5 rounded font-bold border border-red-800">
                                ⚠️ {item.notes}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Icon */}
                        <div className="pt-1">
                          {isItemReady ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : isPreparing ? (
                            <ChefHat className="w-5 h-5 text-amber-400 animate-bounce" />
                          ) : (
                            <Clock className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer Action */}
                <div className="p-3 bg-slate-900/60 border-t border-slate-700 flex justify-between items-center">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ar })}
                  </span>

                  <button
                    onClick={() => handleServeAll(ticket.order_id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition ${
                      isComplete
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    <CheckCheck className="w-4 h-4" />
                    {isComplete ? 'تسليم وخروج الطاولة 🚀' : 'تسليم جزئي'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default ExpoScreen;
