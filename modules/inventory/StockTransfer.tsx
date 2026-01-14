import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { ArrowRightLeft, Save, Plus, Trash2, Search, Package, Loader2 } from 'lucide-react';

const StockTransfer = () => {
  const { warehouses, products, addStockTransfer } = useAccounting();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    fromWarehouseId: '',
    toWarehouseId: '',
    notes: ''
  });

  const [items, setItems] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState(1);

  const handleAddItem = () => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (items.find(i => i.productId === selectedProductId)) {
        alert('الصنف موجود بالفعل في القائمة');
        return;
    }

    // التحقق من الرصيد في المستودع المصدر (اختياري، لكن مفضل)
    if (formData.fromWarehouseId) {
        const stockInSource = product.warehouseStock?.[formData.fromWarehouseId] || 0;
        if (qty > stockInSource) {
            if (!window.confirm(`تنبيه: الكمية المطلوبة (${qty}) أكبر من الرصيد المتوفر في المستودع المصدر (${stockInSource}). هل تريد المتابعة؟`)) {
                return;
            }
        }
    }

    setItems([...items, {
        productId: product.id,
        productName: product.name,
        quantity: qty
    }]);
    setSelectedProductId('');
    setQty(1);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.fromWarehouseId === formData.toWarehouseId) {
        alert('لا يمكن التحويل لنفس المستودع');
        return;
    }
    if (items.length === 0) {
        alert('يجب إضافة أصناف للتحويل');
        return;
    }

    setLoading(true);
    try {
        await addStockTransfer({
            ...formData,
            items
        });
        setFormData({ ...formData, notes: '' });
        setItems([]);
    } catch (error) {
        console.error(error);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <ArrowRightLeft className="text-blue-600" /> تحويل مخزني
            </h2>
            <p className="text-slate-500">نقل البضاعة بين المستودعات والفروع</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ التحويل</label>
                  <input type="date" required className="w-full border rounded-lg p-2.5" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">من مستودع (المصدر)</label>
                  <select required className="w-full border rounded-lg p-2.5" value={formData.fromWarehouseId} onChange={e => setFormData({...formData, fromWarehouseId: e.target.value})}>
                      <option value="">-- اختر --</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
              </div>
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">إلى مستودع (المستلم)</label>
                  <select required className="w-full border rounded-lg p-2.5" value={formData.toWarehouseId} onChange={e => setFormData({...formData, toWarehouseId: e.target.value})}>
                      <option value="">-- اختر --</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
              </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Package size={20} /> إضافة الأصناف
            </h3>
            
            <div className="flex gap-2 mb-4 items-end">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">الصنف</label>
                    <select 
                        value={selectedProductId}
                        onChange={e => setSelectedProductId(e.target.value)}
                        className="w-full border rounded-lg p-2.5"
                    >
                        <option value="">اختر الصنف...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} (المتوفر: {p.stock})</option>)}
                    </select>
                </div>
                <div className="w-32">
                    <label className="block text-xs font-bold text-slate-500 mb-1">الكمية</label>
                    <input 
                        type="number" 
                        min="1"
                        value={qty}
                        onChange={e => setQty(parseFloat(e.target.value))}
                        className="w-full border rounded-lg p-2.5 text-center font-bold"
                    />
                </div>
                <button 
                    type="button" 
                    onClick={handleAddItem}
                    className="bg-blue-50 text-blue-600 px-4 py-2.5 rounded-lg hover:bg-blue-100 font-bold h-[42px]"
                >
                    <Plus />
                </button>
            </div>

            {items.length > 0 && (
                <table className="w-full text-right border rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                        <tr>
                            <th className="p-3">الصنف</th>
                            <th className="p-3">الكمية</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map((item, idx) => (
                            <tr key={idx}>
                                <td className="p-3 font-medium">{item.productName}</td>
                                <td className="p-3 font-bold">{item.quantity}</td>
                                <td className="p-3 text-center">
                                    <button type="button" onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={18} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button type="submit" disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2">
                  {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />} إتمام التحويل
              </button>
          </div>
      </form>
    </div>
  );
};

export default StockTransfer;
