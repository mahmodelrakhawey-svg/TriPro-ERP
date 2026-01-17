import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import {
    Search, Plus, FileCheck, Printer, Edit, Trash2,
    ChevronLeft, ChevronRight, Loader2, Eye, ArrowRightLeft,
    X, Warehouse as WarehouseIcon, Save, ShoppingCart, Clock, CheckCircle2, AlertCircle
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

const PurchaseOrderList = () => {
  const navigate = useNavigate();
  const { can, convertPoToInvoice, warehouses, settings, currentUser } = useAccounting();
  
  // Pagination & Search State
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const pageSize = 20;
  
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // State for conversion modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  // State for printing
  const [orderToPrint, setOrderToPrint] = useState<any | null>(null);

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);

    if (currentUser?.role === 'demo') {
        setOrders([
            { id: 'demo-po1', po_number: 'PO-DEMO-001', order_date: new Date().toISOString().split('T')[0], suppliers: { name: 'شركة التوريدات العالمية' }, total_amount: 25000, status: 'sent' },
            { id: 'demo-po2', po_number: 'PO-DEMO-002', order_date: new Date().toISOString().split('T')[0], suppliers: { name: 'مصنع الجودة' }, total_amount: 12000, status: 'draft' }
        ]);
        setTotalCount(2);
        setLoading(false);
        return;
    }

    try {
      let query = supabase
        .from('purchase_orders')
        .select('*, suppliers(name)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        query = query.ilike('po_number', `%${debouncedSearch}%`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await query.range(from, to);

      if (error) throw error;

      setOrders(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, debouncedSearch]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const handleEdit = (order: any) => {
    if (order.status && order.status !== 'draft' && order.status !== 'sent') {
        alert('لا يمكن تعديل أمر الشراء بعد إرساله أو تحويله.');
        return;
    }
    navigate('/purchase-order-new', { state: { orderToEdit: order } });
  };

  const getLifecycle = (status: string) => {
    switch (status) {
        case 'converted': return { percent: 100, label: 'مفوتر بالكامل', color: 'bg-emerald-500', text: 'text-emerald-600', icon: <CheckCircle2 size={12} /> };
        case 'sent': return { percent: 60, label: 'بانتظار التوريد', color: 'bg-blue-500', text: 'text-blue-600', icon: <Clock size={12} /> };
        case 'cancelled': return { percent: 100, label: 'ملغي', color: 'bg-red-500', text: 'text-red-600', icon: <AlertCircle size={12} /> };
        default: return { percent: 20, label: 'مسودة', color: 'bg-slate-300', text: 'text-slate-500', icon: <Edit size={12} /> };
    }
  };

  const openConvertModal = (order: any) => {
    setSelectedOrder(order);
    // Set default warehouse
    if (warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id);
    }
    setIsModalOpen(true);
  };

  const confirmConversion = async () => {
    if (!selectedOrder || !selectedWarehouseId) {
      alert('يرجى اختيار المستودع.');
      return;
    }
    await convertPoToInvoice(selectedOrder.id, selectedWarehouseId);
    setIsModalOpen(false);
    setSelectedOrder(null);
    fetchOrders();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف أمر الشراء هذا؟')) return;
    try {
        const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
        if (error) throw error;
        fetchOrders();
        alert('تم حذف أمر الشراء بنجاح');
    } catch (error: any) {
        alert('فشل الحذف: ' + error.message);
    }
  };

  const handlePrint = async (order: any) => {
    // Fetch full order details including items
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, suppliers(*), purchase_order_items(*, products(name, sku))')
      .eq('id', order.id)
      .single();

    if (error) {
      alert('فشل تحميل تفاصيل الأمر للطباعة: ' + error.message);
      return;
    }
    setOrderToPrint(data);
  };

  useEffect(() => {
    if (orderToPrint) {
      setTimeout(() => {
        window.print();
        setOrderToPrint(null);
      }, 500);
    }
  }, [orderToPrint]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* أنماط الطباعة */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-order, #printable-order * { visibility: visible; }
          #printable-order {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            padding: 20px;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileCheck className="text-emerald-600" /> سجل أوامر الشراء
          </h2>
          <p className="text-slate-500">عرض وإدارة جميع أوامر الشراء الصادرة للموردين</p>
        </div>
        {can('purchases', 'create') && (
            <button 
                onClick={() => navigate('/purchase-order-new')}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 flex items-center gap-2 transition-all"
            >
                <Plus size={20} /> أمر شراء جديد
            </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="بحث برقم أمر الشراء..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border rounded-xl focus:outline-none focus:border-emerald-500" 
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
      ) : error ? (
        <div className="text-center text-red-500 p-8">حدث خطأ أثناء تحميل البيانات: {error}</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b border-slate-200">
                <tr>
                <th className="p-4">رقم الأمر</th>
                <th className="p-4">التاريخ</th>
                <th className="p-4">المورد</th>
                <th className="p-4">الإجمالي</th>
                <th className="p-4">دورة الحياة</th>
                <th className="p-4 text-center">إجراءات</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {orders.map((order: any) => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-mono font-bold text-emerald-600">{order.po_number}</td>
                    <td className="p-4 text-slate-600">{order.order_date}</td>
                    <td className="p-4 font-bold text-slate-800">{order.suppliers?.name || 'مورد غير محدد'}</td>
                    <td className="p-4 font-mono font-bold text-slate-900">{order.total_amount.toLocaleString()}</td>
                    <td className="p-4">
                        {(() => {
                            const lifecycle = getLifecycle(order.status);
                            return (
                                <div className="w-full max-w-[140px]">
                                    <div className="flex justify-between text-[10px] mb-1 font-bold items-center">
                                        <span className={`flex items-center gap-1 ${lifecycle.text}`}>{lifecycle.icon} {lifecycle.label}</span>
                                        <span className="text-slate-400">{lifecycle.percent}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full ${lifecycle.color} transition-all duration-500`} style={{ width: `${lifecycle.percent}%` }}></div>
                                    </div>
                                </div>
                            );
                        })()}
                    </td>
                    <td className="p-4 flex justify-center gap-2">
                    {order.status !== 'converted' && order.status !== 'cancelled' && (
                        <button onClick={() => openConvertModal(order)} className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg" title="تحويل لفاتورة مشتريات">
                            <ArrowRightLeft size={18} />
                        </button>
                    )}
                    {order.status !== 'converted' && order.status !== 'cancelled' && (
                        <button onClick={() => handleEdit(order)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="تعديل">
                            <Edit size={18} />
                        </button>
                    )}
                    {(!order.status || order.status === 'draft') && (
                        <button onClick={() => handleDelete(order.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="حذف">
                            <Trash2 size={18} />
                        </button>
                    )}
                    <button onClick={() => handlePrint(order)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg" title="طباعة">
                        <Printer size={18} />
                    </button>
                    </td>
                </tr>
                ))}
                {orders.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد أوامر شراء مطابقة.</td></tr>
                )}
            </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                    عرض {orders.length} من أصل {totalCount} أمر شراء
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPage(old => Math.max(old - 1, 1))}
                        disabled={page === 1 || loading}
                        className="p-2 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
                    >
                        <ChevronRight size={20} />
                    </button>
                    <span className="font-bold text-slate-700">صفحة {page} من {totalPages}</span>
                    <button
                        onClick={() => {
                            if (!loading && page < totalPages) {
                                setPage(old => old + 1);
                            }
                        }}
                        disabled={page === totalPages || loading}
                        className="p-2 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
                    >
                        <ChevronLeft size={20} />
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Conversion Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">تحويل أمر الشراء إلى فاتورة</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                سيتم إنشاء فاتورة مشتريات جديدة من أمر الشراء رقم <strong className="font-mono text-purple-700">{selectedOrder?.po_number}</strong>.
                الرجاء تحديد المستودع الذي سيتم استلام البضاعة فيه.
              </p>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <WarehouseIcon size={16} className="text-slate-400" />
                  مستودع الاستلام
                </label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-purple-500 bg-white"
                >
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <button onClick={confirmConversion} className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 flex items-center justify-center gap-2 shadow-md transition-colors">
                <Save size={18} /> تأكيد التحويل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable PO Component */}
      <div id="printable-order" className={orderToPrint ? "" : "hidden"}>
        {orderToPrint && (
            <div className="p-8" dir="rtl">
              <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-8">
                <div>
                  <h1 className="text-3xl font-bold">أمر شراء</h1>
                  <p className="text-sm">Purchase Order</p>
                </div>
                {settings.logoUrl && <img src={settings.logoUrl} alt="logo" className="w-24 h-24 object-contain" />}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
                <div className="space-y-1">
                  <p><strong>إلى السيد/</strong> {orderToPrint.suppliers?.name}</p>
                  <p><strong>العنوان:</strong> {orderToPrint.suppliers?.address || 'غير محدد'}</p>
                  <p><strong>الهاتف:</strong> {orderToPrint.suppliers?.phone || 'غير محدد'}</p>
                </div>
                <div className="space-y-1 text-left">
                  <p><strong>رقم الأمر:</strong> {orderToPrint.po_number}</p>
                  <p><strong>التاريخ:</strong> {new Date(orderToPrint.order_date).toLocaleDateString('ar-EG')}</p>
                  <p><strong>تاريخ التسليم المتوقع:</strong> {new Date(orderToPrint.delivery_date).toLocaleDateString('ar-EG')}</p>
                </div>
              </div>

              <table className="w-full text-right border-collapse text-sm">
                <thead className="bg-slate-100">
                  <tr className="border-b-2 border-black">
                    <th className="p-2">م</th>
                    <th className="p-2">الكود</th>
                    <th className="p-2">وصف الصنف</th>
                    <th className="p-2">الكمية</th>
                    <th className="p-2">سعر الوحدة</th>
                    <th className="p-2">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {orderToPrint.purchase_order_items.map((item: any, index: number) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2">{index + 1}</td>
                      <td className="p-2">{item.products?.sku || '-'}</td>
                      <td className="p-2">{item.products?.name}</td>
                      <td className="p-2">{item.quantity}</td>
                      <td className="p-2">{item.unit_price?.toLocaleString()}</td>
                      <td className="p-2 font-bold">{item.total?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-bold">
                  <tr><td colSpan={5} className="p-2 text-left">الإجمالي قبل الضريبة:</td><td className="p-2">{orderToPrint.subtotal?.toLocaleString()}</td></tr>
                  <tr><td colSpan={5} className="p-2 text-left">الضريبة:</td><td className="p-2">{orderToPrint.tax_amount?.toLocaleString()}</td></tr>
                  <tr className="bg-slate-100 text-lg border-t-2 border-black"><td colSpan={5} className="p-2 text-left">الإجمالي النهائي:</td><td className="p-2">{orderToPrint.total_amount?.toLocaleString()}</td></tr>
                </tfoot>
              </table>

              <div className="mt-8 text-xs text-slate-600">
                <p><strong>ملاحظات:</strong> {orderToPrint.notes || 'لا يوجد'}</p>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default PurchaseOrderList;
