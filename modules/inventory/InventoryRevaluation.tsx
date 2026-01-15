import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useProducts } from '../hooks/usePermissions';
import { Loader2, Save, Search, X, CircleDollarSign } from 'lucide-react';

const InventoryRevaluation = () => {
  const { currentUser, products: contextProducts } = useAccounting();
  const { data: serverProducts = [], isLoading: productsLoading, refetch: refetchProducts } = useProducts();

  // في وضع الديمو، نستخدم المنتجات من السياق (الوهمية)
  const products = currentUser?.role === 'demo' ? contextProducts : serverProducts;

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  
  const [newCost, setNewCost] = useState<number | ''>('');
  const [revaluationDate, setRevaluationDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  
  const [saving, setSaving] = useState(false);

  const selectedProduct = useMemo(() => {
    // @ts-ignore
    return products.find(p => p.id === selectedProductId);
  }, [selectedProductId, products]);

  const oldCost = useMemo(() => {
    if (!selectedProduct) return 0;
    // @ts-ignore
    return selectedProduct.weighted_average_cost || selectedProduct.cost || 0;
  }, [selectedProduct]);

  const stock = useMemo(() => {
    if (!selectedProduct) return 0;
    // @ts-ignore
    return selectedProduct.stock || 0;
  }, [selectedProduct]);

  const valueDifference = useMemo(() => {
    if (newCost === '' || !stock) return 0;
    return (Number(newCost) - oldCost) * stock;
  }, [newCost, oldCost, stock]);

  const handleRevalue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || newCost === '') {
      alert('يرجى اختيار الصنف وإدخال التكلفة الجديدة.');
      return;
    }

    if (Number(newCost) === oldCost) {
      alert('التكلفة الجديدة مطابقة للتكلفة الحالية. لا يوجد تغيير.');
      return;
    }

    const confirmMessage = `هل أنت متأكد من إعادة تقييم تكلفة الصنف "${selectedProduct?.name}"؟\n\nالتكلفة الحالية: ${oldCost}\nالتكلفة الجديدة: ${newCost}\n\nسيتم إنشاء قيد محاسبي بقيمة الفرق: ${valueDifference.toLocaleString()}`;
    if (!window.confirm(confirmMessage)) return;

    setSaving(true);
    if (currentUser?.role === 'demo') {
        alert('تمت إعادة تقييم التكلفة بنجاح ✅ (محاكاة)');
        setSaving(false);
        return;
    }

    try {
      const { error } = await supabase.rpc('revalue_product_cost', {
        p_product_id: selectedProductId,
        p_new_cost: Number(newCost),
        p_revaluation_date: revaluationDate,
        p_notes: notes || `إعادة تقييم يدوية`
      });

      if (error) throw error;

      alert('تمت إعادة تقييم التكلفة بنجاح ✅');
      refetchProducts(); // تحديث بيانات المنتجات
      // Reset form
      setSelectedProductId('');
      setProductSearchTerm('');
      setNewCost('');
      setNotes('');

    } catch (error: any) {
      alert('فشل إعادة التقييم: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex items-center gap-3">
        <div className="bg-purple-100 p-3 rounded-xl text-purple-600">
          <CircleDollarSign size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">إعادة تقييم تكلفة المخزون</h2>
          <p className="text-slate-500">تعديل متوسط التكلفة المرجح للأصناف وإنشاء قيد تسوية تلقائي.</p>
        </div>
      </div>

      <form onSubmit={handleRevalue} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-6">
        <div className="relative z-10">
          <label className="block text-sm font-bold text-slate-700 mb-1">اختر الصنف</label>
          <div className="relative">
            <input type="text" value={productSearchTerm} onChange={(e) => { setProductSearchTerm(e.target.value); setShowProductDropdown(true); setSelectedProductId(''); }} onFocus={() => setShowProductDropdown(true)} onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)} placeholder="ابحث باسم الصنف أو الكود..." className="w-full border border-slate-300 rounded-lg px-4 py-2.5 pl-10 focus:outline-none focus:border-purple-500" />
            <Search className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={18} />
            {selectedProductId && (<button type="button" onClick={() => { setSelectedProductId(''); setProductSearchTerm(''); }} className="absolute right-3 top-3 text-slate-400 hover:text-red-500"><X size={18} /></button>)}
            {showProductDropdown && (
              <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto">
                {products.filter(p => (p.name || '').toLowerCase().includes(productSearchTerm.toLowerCase()) || (p.sku || '').toLowerCase().includes(productSearchTerm.toLowerCase())).map(p => (
                  <div key={p.id} onMouseDown={() => { setSelectedProductId(p.id); setProductSearchTerm(p.name); setShowProductDropdown(false); }} className="p-3 hover:bg-purple-50 cursor-pointer border-b border-slate-50 last:border-0">
                    <div className="font-bold text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{p.sku || 'No SKU'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedProduct && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 animate-in fade-in">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">الرصيد الحالي:</span> <span className="font-bold font-mono">{stock.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">التكلفة الحالية للوحدة:</span> <span className="font-bold font-mono">{oldCost.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm font-bold"><span className="text-slate-500">إجمالي قيمة المخزون:</span> <span className="font-mono">{(oldCost * stock).toLocaleString()}</span></div>
              <div className="flex justify-between text-lg font-black pt-2 border-t border-slate-200">
                <span className={valueDifference >= 0 ? 'text-emerald-600' : 'text-red-600'}>قيمة الفرق:</span>
                <span className={`font-mono ${valueDifference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{valueDifference.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-4">
              <div><label className="block text-sm font-bold text-slate-700 mb-1">التكلفة الجديدة للوحدة</label><input type="number" step="0.01" min="0" required value={newCost} onChange={e => setNewCost(Number(e.target.value))} className="w-full border rounded-lg p-2 font-bold text-lg" /></div>
              <div><label className="block text-sm font-bold text-slate-700 mb-1">تاريخ التقييم</label><input type="date" required value={revaluationDate} onChange={e => setRevaluationDate(e.target.value)} className="w-full border rounded-lg p-2" /></div>
            </div>
          </div>
        )}

        <div><label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border rounded-lg p-2" placeholder="سبب إعادة التقييم..."></textarea></div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button type="submit" disabled={saving || !selectedProductId || newCost === ''} className="bg-purple-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-purple-700 flex items-center gap-2 shadow-lg disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />} حفظ وإعادة تقييم
          </button>
        </div>
      </form>
    </div>
  );
};

export default InventoryRevaluation;