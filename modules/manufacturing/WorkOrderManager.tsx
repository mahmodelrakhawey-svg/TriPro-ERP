import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Factory, Plus, Play, CheckCircle, XCircle, Clock, Save, DollarSign, Package, Calendar, Trash2, Loader2, Eye } from 'lucide-react';

const WorkOrderManager = () => {
  const { products, warehouses, produceItem } = useAccounting();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'details'>('list');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    productId: '',
    warehouseId: '',
    quantity: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notes: ''
  });

  // Costs State
  const [costs, setCosts] = useState<any[]>([]);
  const [newCost, setNewCost] = useState({ type: 'labor', amount: 0, description: '' });

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('work_orders')
      .select('*, products(name, sku), warehouses(name)')
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  };

  const fetchCosts = async (orderId: string) => {
      const { data } = await supabase.from('work_order_costs').select('*').eq('work_order_id', orderId);
      setCosts(data || []);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.productId || !formData.warehouseId) return alert('يرجى اختيار المنتج والمستودع');

    try {
        const orderNumber = `WO-${Date.now().toString().slice(-6)}`;
        const { error } = await supabase.from('work_orders').insert({
            order_number: orderNumber,
            product_id: formData.productId,
            warehouse_id: formData.warehouseId,
            quantity: formData.quantity,
            start_date: formData.startDate,
            end_date: formData.endDate || null,
            notes: formData.notes,
            status: 'draft'
        });

        if (error) throw error;
        alert('تم إنشاء أمر التشغيل بنجاح ✅');
        setIsModalOpen(false);
        fetchOrders();
    } catch (error: any) {
        console.error(error);
        alert('خطأ: ' + error.message);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
      if (status === 'completed') {
          // عند الإكمال، نقوم بتنفيذ عملية التصنيع الفعلية
          if (!window.confirm('هل أنت متأكد من إكمال أمر التشغيل؟ سيتم خصم المواد الخام وإضافة المنتج التام للمخزون.')) return;
          
          const order = orders.find(o => o.id === id);
          if (!order) return;

          // حساب التكاليف الإضافية
          const { data: costsData } = await supabase.from('work_order_costs').select('amount').eq('work_order_id', id);
          const totalAdditionalCost = costsData?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;

          const result = await produceItem(
              order.product_id, 
              order.quantity, 
              order.warehouse_id, 
              new Date().toISOString().split('T')[0],
              totalAdditionalCost,
              order.order_number // تمرير رقم الأمر كمرجع للقيد
          );

          if (result.success) {
              await supabase.from('work_orders').update({ status: 'completed', end_date: new Date().toISOString().split('T')[0] }).eq('id', id);
              alert(result.message);
              fetchOrders();
          } else {
              alert(result.message);
              return;
          }
      } else {
          await supabase.from('work_orders').update({ status }).eq('id', id);
          fetchOrders();
      }
  };

  const handleAddCost = async () => {
      if (!selectedOrder || newCost.amount <= 0) return;
      await supabase.from('work_order_costs').insert({
          work_order_id: selectedOrder.id,
          cost_type: newCost.type,
          amount: newCost.amount,
          description: newCost.description
      });
      setNewCost({ type: 'labor', amount: 0, description: '' });
      fetchCosts(selectedOrder.id);
  };

  const openDetails = (order: any) => {
      setSelectedOrder(order);
      fetchCosts(order.id);
      setViewMode('details');
  };

  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'draft': return <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">مسودة</span>;
          case 'in_progress': return <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-bold">قيد التشغيل</span>;
          case 'completed': return <span className="bg-emerald-100 text-emerald-600 px-2 py-1 rounded text-xs font-bold">مكتمل</span>;
          case 'cancelled': return <span className="bg-red-100 text-red-600 px-2 py-1 rounded text-xs font-bold">ملغي</span>;
          default: return status;
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Factory className="text-purple-600" /> أوامر التشغيل (Work Orders)
            </h2>
            <p className="text-slate-500">إدارة عمليات التصنيع ومتابعة التكاليف</p>
        </div>
        {viewMode === 'list' && (
            <button onClick={() => setIsModalOpen(true)} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700">
                <Plus size={18} /> أمر تشغيل جديد
            </button>
        )}
        {viewMode === 'details' && (
            <button onClick={() => setViewMode('list')} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-bold hover:bg-slate-200">
                عودة للقائمة
            </button>
        )}
      </div>

      {viewMode === 'list' ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-right">
                <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                    <tr>
                        <th className="p-4">رقم الأمر</th>
                        <th className="p-4">المنتج</th>
                        <th className="p-4">الكمية</th>
                        <th className="p-4">المستودع</th>
                        <th className="p-4">تاريخ البدء</th>
                        <th className="p-4">الحالة</th>
                        <th className="p-4 text-center">إجراءات</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {orders.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50">
                            <td className="p-4 font-mono text-purple-600">{order.order_number}</td>
                            <td className="p-4 font-bold">{order.products?.name}</td>
                            <td className="p-4 font-bold">{order.quantity}</td>
                            <td className="p-4 text-sm">{order.warehouses?.name}</td>
                            <td className="p-4 text-sm">{order.start_date}</td>
                            <td className="p-4">{getStatusBadge(order.status)}</td>
                            <td className="p-4 flex justify-center gap-2">
                                <button onClick={() => openDetails(order)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="التفاصيل والتكاليف">
                                    <Eye size={18} />
                                </button>
                                {order.status === 'draft' && (
                                    <button onClick={() => handleStatusChange(order.id, 'in_progress')} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="بدء التشغيل">
                                        <Play size={18} />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                    {orders.length === 0 && !loading && <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد أوامر تشغيل</td></tr>}
                </tbody>
            </table>
          </div>
      ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Order Details */}
              <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <div className="flex justify-between items-start mb-6">
                          <div>
                              <h3 className="text-xl font-bold text-slate-800">{selectedOrder.products?.name}</h3>
                              <p className="text-slate-500 font-mono">{selectedOrder.order_number}</p>
                          </div>
                          {getStatusBadge(selectedOrder.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                          <div><span className="text-slate-500 block">الكمية المطلوبة:</span> <span className="font-bold text-lg">{selectedOrder.quantity}</span></div>
                          <div><span className="text-slate-500 block">المستودع:</span> <span className="font-bold">{selectedOrder.warehouses?.name}</span></div>
                          <div><span className="text-slate-500 block">تاريخ البدء:</span> <span className="font-bold">{selectedOrder.start_date}</span></div>
                          <div><span className="text-slate-500 block">ملاحظات:</span> <span>{selectedOrder.notes || '-'}</span></div>
                      </div>
                  </div>

                  {/* Additional Costs */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <DollarSign size={18} className="text-emerald-600" /> التكاليف الإضافية (غير المواد الخام)
                      </h4>
                      
                      {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                          <div className="flex gap-2 mb-4 items-end bg-slate-50 p-3 rounded-lg">
                              <div className="flex-1">
                                  <label className="block text-xs font-bold text-slate-500 mb-1">النوع</label>
                                  <select value={newCost.type} onChange={e => setNewCost({...newCost, type: e.target.value})} className="w-full border rounded p-2 text-sm">
                                      <option value="labor">أجور عمالة</option>
                                      <option value="overhead">مصاريف تشغيل (كهرباء/ماء)</option>
                                      <option value="other">أخرى</option>
                                  </select>
                              </div>
                              <div className="w-32">
                                  <label className="block text-xs font-bold text-slate-500 mb-1">المبلغ</label>
                                  <input type="number" value={newCost.amount} onChange={e => setNewCost({...newCost, amount: parseFloat(e.target.value)})} className="w-full border rounded p-2 text-sm" />
                              </div>
                              <div className="flex-1">
                                  <label className="block text-xs font-bold text-slate-500 mb-1">بيان</label>
                                  <input type="text" value={newCost.description} onChange={e => setNewCost({...newCost, description: e.target.value})} className="w-full border rounded p-2 text-sm" placeholder="وصف التكلفة" />
                              </div>
                              <button onClick={handleAddCost} className="bg-emerald-600 text-white p-2 rounded hover:bg-emerald-700"><Plus size={18}/></button>
                          </div>
                      )}

                      <table className="w-full text-right text-sm">
                          <thead className="bg-slate-50 text-slate-600">
                              <tr>
                                  <th className="p-2">النوع</th>
                                  <th className="p-2">البيان</th>
                                  <th className="p-2">المبلغ</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              {costs.map(cost => (
                                  <tr key={cost.id}>
                                      <td className="p-2">{cost.cost_type === 'labor' ? 'أجور' : cost.cost_type === 'overhead' ? 'تشغيل' : 'أخرى'}</td>
                                      <td className="p-2">{cost.description}</td>
                                      <td className="p-2 font-bold">{cost.amount.toLocaleString()}</td>
                                  </tr>
                              ))}
                              {costs.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-400">لا توجد تكاليف إضافية مسجلة</td></tr>}
                          </tbody>
                          <tfoot className="border-t font-bold">
                              <tr>
                                  <td colSpan={2} className="p-2">الإجمالي</td>
                                  <td className="p-2 text-emerald-600">{costs.reduce((sum, c) => sum + Number(c.amount), 0).toLocaleString()}</td>
                              </tr>
                          </tfoot>
                      </table>
                  </div>
              </div>

              {/* Actions */}
              <div className="space-y-4">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h4 className="font-bold text-slate-800 mb-4">إجراءات الأمر</h4>
                      <div className="space-y-2">
                          {selectedOrder.status === 'draft' && (
                              <button onClick={() => handleStatusChange(selectedOrder.id, 'in_progress')} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2">
                                  <Play size={18} /> بدء التشغيل
                              </button>
                          )}
                          {selectedOrder.status === 'in_progress' && (
                              <button onClick={() => handleStatusChange(selectedOrder.id, 'completed')} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center justify-center gap-2">
                                  <CheckCircle size={18} /> إكمال وإنتاج
                              </button>
                          )}
                          {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                              <button onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')} className="w-full bg-red-50 text-red-600 py-2 rounded-lg font-bold hover:bg-red-100 flex items-center justify-center gap-2">
                                  <XCircle size={18} /> إلغاء الأمر
                              </button>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Create Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <h3 className="font-bold text-xl mb-4">أمر تشغيل جديد</h3>
                  <form onSubmit={handleCreateOrder} className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold mb-1">المنتج المراد تصنيعه</label>
                          <select required className="w-full border rounded p-2" value={formData.productId} onChange={e => setFormData({...formData, productId: e.target.value})}>
                              <option value="">-- اختر المنتج --</option>
                              {products.filter(p => p.item_type === 'STOCK').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">الكمية</label>
                          <input type="number" required min="1" className="w-full border rounded p-2" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value)})} />
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">مستودع الإنتاج</label>
                          <select required className="w-full border rounded p-2" value={formData.warehouseId} onChange={e => setFormData({...formData, warehouseId: e.target.value})}>
                              <option value="">-- اختر المستودع --</option>
                              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">تاريخ البدء</label>
                          <input type="date" required className="w-full border rounded p-2" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-sm font-bold mb-1">ملاحظات</label>
                          <textarea className="w-full border rounded p-2" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
                      </div>
                      <div className="flex gap-2 pt-2">
                          <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded font-bold">إلغاء</button>
                          <button type="submit" className="flex-1 bg-purple-600 text-white py-2 rounded font-bold">إنشاء</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default WorkOrderManager;
