import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';

// تعريف واجهة البيانات لطلب البيع
interface SalesOrder {
  id: string;
  order_number: string;
  customer_id: string;
  customers: { name: string };
  order_date: string;
  status: string;
  total_amount: number;
}

const SalesOrders: React.FC = () => {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { showToast } = useToast();

  // جلب البيانات عند تحميل المكون
  useEffect(() => {
    fetchOrders();
    fetchWarehouses();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*, customers(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  const fetchWarehouses = async () => {
    const { data } = await supabase.from('warehouses').select('id, name');
    setWarehouses(data || []);
  };

  // إجراء: الانتقال لشاشة التخطيط لتوحيد المسار (Batching)
  const handleGoToPlanning = () => {
    // توجيه المستخدم لشاشة إدارة أوامر التشغيل المجمعة حيث تظهر كافة الطلبات المؤكدة
    window.location.href = '/mfg/batch-orders';
  };

  // إجراء: تحويل الطلب إلى فاتورة مبيعات نهائية
  const handleConvertToInvoice = async (orderId: string) => {
    if (warehouses.length === 0) {
      showToast('لا توجد مستودعات معرّفة في النظام!', 'error');
      return;
    }

    // اختيار المستودع عبر المطالبة (Prompt) كحل سريع، يمكن تطويره لـ Modal لاحقاً
    const options = warehouses.map((w, i) => `${i + 1}- ${w.name}`).join('\n');
    const choice = window.prompt(`اختر رقم المستودع لصرف البضاعة:\n${options}`);
    
    const selectedWh = warehouses[parseInt(choice || '1') - 1];
    if (!selectedWh) return;

    setProcessingId(orderId);
    try {
      const { data, error } = await supabase.rpc('convert_so_to_invoice', {
        p_so_id: orderId,
        p_warehouse_id: selectedWh.id
      });

      if (error) throw error;
      showToast('تم تحويل طلب البيع إلى فاتورة مبيعات بنجاح ✅', 'success');
      fetchOrders();
    } catch (error: any) {
      showToast('خطأ أثناء تحويل الطلب: ' + error.message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // تنسيق شارات الحالة
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      confirmed: 'bg-blue-100 text-blue-800',
      manufacturing: 'bg-yellow-100 text-yellow-800',
      ready: 'bg-green-100 text-green-800',
      invoiced: 'bg-purple-100 text-purple-800',
    };
    const labels: Record<string, string> = {
      draft: 'مسودة',
      confirmed: 'مؤكد',
      manufacturing: 'تحت التصنيع',
      ready: 'جاهز',
      invoiced: 'مفوتر',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md" dir="rtl">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-800">إدارة أوامر البيع (Sales Orders)</h2>
        <button 
          onClick={fetchOrders}
          className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded hover:bg-indigo-100 transition"
        >
          تحديث القائمة
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-right">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">رقم الطلب</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">العميل</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">التاريخ</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">إجمالي المبلغ</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">الحالة</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">الإجراءات التشغيلية</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400">لا توجد أوامر بيع حالياً</td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600">{order.order_number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.customers?.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(order.order_date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{order.total_amount.toLocaleString()} ج.م</td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(order.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-4">
                        {order.status === 'confirmed' && (
                          <button 
                            onClick={handleGoToPlanning}
                            className="bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 transition shadow-sm font-bold"
                          >
                            عرض في شاشة التخطيط
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <button 
                            onClick={() => handleConvertToInvoice(order.id)}
                            disabled={processingId === order.id}
                            className={`${processingId === order.id ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white px-3 py-1 rounded transition flex items-center gap-2`}
                          >
                            {processingId === order.id && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                            إصدار فاتورة
                          </button>
                        )}
                        {order.status === 'invoiced' && <span className="text-gray-400 italic">تمت الفوترة</span>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SalesOrders;