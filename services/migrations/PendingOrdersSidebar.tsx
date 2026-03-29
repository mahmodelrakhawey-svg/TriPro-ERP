import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Search, Phone, Hash } from 'lucide-react';

interface PendingOrder {
  id: string;
  order_number: string;
  order_type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  grand_total: number;
  created_at: string;
  status: string;
  customer_phone?: string;
}

interface Props {
  onSelectOrder: (orderId: string) => void;
  refreshTrigger?: number;
}

export const PendingOrdersSidebar: React.FC<Props> = ({ onSelectOrder, refreshTrigger }) => {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    // استدعاء الدالة التي أنشأناها في SQL
    const { data, error } = await supabase.rpc('get_pending_payment_orders');
    if (!error) setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
    
    // الاشتراك في التغييرات اللحظية (Realtime) لتحديث القائمة فور إرسال طلب من المطبخ
    const channel = supabase
      .channel('pending_orders_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshTrigger]);

  // منطق التصفية
  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(searchLower) ||
      (order.customer_phone && order.customer_phone.includes(searchTerm))
    );
  });

  if (loading && orders.length === 0) return <div className="p-4 text-center text-gray-500 text-sm">جاري التحديث...</div>;

  return (
    <div className="w-80 border-r bg-gray-50 flex flex-col h-full overflow-hidden shadow-sm">
      <div className="p-4 bg-white border-b shadow-sm space-y-3">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <span>📋</span> طلبات (سفري / توصيل)
        </h3>
        
        {/* شريط البحث الجديد */}
        <div className="relative group">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={16} />
          <input
            type="text"
            placeholder="بحث برقم الطلب أو الجوال..."
            className="w-full pr-10 pl-3 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-60">
            <p className="text-sm font-medium">{searchTerm ? 'لم يتم العثور على نتائج' : 'لا توجد طلبات حالياً'}</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div
              key={order.id}
              onClick={() => onSelectOrder(order.id)}
              className="p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all active:scale-95 group"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-mono text-sm font-bold text-gray-700 group-hover:text-blue-600">{order.order_number}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                  order.order_type === 'DELIVERY' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {order.order_type === 'DELIVERY' ? 'توصيل' : 'سفري'}
                </span>
              </div>
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  {order.customer_phone && (
                    <div className="text-[10px] text-blue-600 font-bold flex items-center gap-1">
                      <Phone size={10} /> {order.customer_phone}
                    </div>
                  )}
                <div className="text-xl font-black text-gray-900">{Number(order.grand_total).toFixed(2)} ر.س</div>
                </div>
                <div className="text-[10px] text-gray-400 font-medium">
                  {new Date(order.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};