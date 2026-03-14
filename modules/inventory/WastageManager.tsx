import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Trash2, Save, Plus, Search, Loader2, AlertCircle, Package } from 'lucide-react';

const WastageManager = () => {
  const { warehouses, products, addWastage, settings } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    !items.some(i => i.productId === p.id)
  ).slice(0, 5);

  const addItem = (product: any) => {
    setItems([...items, {
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitCost: product.weighted_average_cost || product.purchase_price || 0,
      reason: 'spoiled' // spoiled, expired, prep_error
    }]);
    setSearchTerm('');
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[idx][field] = value;
    setItems(newItems);
  };

  const totalLostCost = items.reduce((sum, i) => sum + (i.quantity * i.unitCost), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId || items.length === 0) {
      showToast('يرجى اختيار المستودع وإضافة أصناف', 'warning');
      return;
    }

    setLoading(true);
    const success = await addWastage({ warehouseId, date, notes, items });
    if (success) {
      setItems([]);
      setNotes('');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Trash2 className="text-red-600" /> إدارة الهالك (Wastage)
          </h2>
          <p className="text-slate-500">تسجيل المواد التالفة وخصمها من المخزن مع إثبات التكلفة</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">المستودع</label>
            <select required value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full border rounded-lg p-2.5 bg-slate-50">
              <option value="">-- اختر المستودع --</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">التاريخ</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border rounded-lg p-2.5 bg-slate-50" />
          </div>
        </div>

        <div className="relative">
          <label className="block text-sm font-bold text-slate-700 mb-1">البحث عن صنف تالف</label>
          <div className="relative">
            <Search className="absolute right-3 top-3 text-slate-400" size={18} />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="ابحث باسم المادة الخام..." className="w-full pr-10 pl-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-red-500" />
          </div>
          {searchTerm && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-xl overflow-hidden">
              {filteredProducts.map(p => (
                <button key={p.id} type="button" onClick={() => addItem(p)} className="w-full text-right px-4 py-3 hover:bg-red-50 border-b last:border-0 flex justify-between items-center">
                  <span className="font-bold">{p.name}</span>
                  <span className="text-xs text-slate-400">المخزون: {p.stock}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-b">
              <tr>
                <th className="p-3">المادة</th>
                <th className="p-3 text-center">الكمية الهالكة</th>
                <th className="p-3 text-center">سبب الهالك</th>
                <th className="p-3 text-center">تكلفة الفقد</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-slate-700">{item.name}</td>
                  <td className="p-3">
                    <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value))} className="w-20 mx-auto border rounded p-1 text-center font-bold text-red-600" />
                  </td>
                  <td className="p-3">
                    <select value={item.reason} onChange={e => updateItem(idx, 'reason', e.target.value)} className="text-xs border rounded p-1">
                      <option value="spoiled">تلف / فساد</option>
                      <option value="expired">انتهاء صلاحية</option>
                      <option value="prep_error">خطأ تحضير</option>
                      <option value="lost">فقد / نقص</option>
                    </select>
                  </td>
                  <td className="p-3 text-center font-mono text-slate-500">{(item.quantity * item.unitCost).toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <button type="button" onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">لا توجد أصناف مضافة بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-slate-900 p-6 rounded-2xl text-white">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-400 mb-1">ملاحظات إضافية</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-lg p-2 text-sm outline-none focus:border-red-500" rows={2}></textarea>
          </div>
          <div className="text-left shrink-0">
            <p className="text-xs text-slate-400 font-bold uppercase mb-1">إجمالي التكلفة المهدرة</p>
            <h3 className="text-3xl font-black text-red-400">{totalLostCost.toLocaleString()} <span className="text-sm font-normal opacity-50">{settings.currency}</span></h3>
            <button type="submit" disabled={loading || items.length === 0} className="mt-4 w-full md:w-auto bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 transition-all">
              {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
              حفظ وترحيل الهالك
            </button>
          </div>
        </div>
      </form>
      
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 items-start">
        <AlertCircle className="text-amber-600 shrink-0 mt-1" />
        <p className="text-sm text-amber-800">سيقوم هذا الإجراء بخصم الكميات من المخزن فوراً وإنشاء قيد محاسبي يحمل التكلفة على حساب "فروقات الجرد والهالك" (512).</p>
      </div>
    </div>
  );
};

export default WastageManager;