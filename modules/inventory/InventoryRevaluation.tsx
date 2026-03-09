import React, { useState, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useProducts } from '../hooks/usePermissions';
import { useToast } from '../../context/ToastContext';
// import { useDialog } from '../../context/DialogContext'; // افترض وجود هذا السياق
// import { useClickOutside } from '../hooks/useClickOutside'; // افترض وجود هذا الهوك
import { Loader2, Save, Search, X, CircleDollarSign } from 'lucide-react';
import { z } from 'zod';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  purchase_price: number;
  weighted_average_cost?: number;
}

const InventoryRevaluation = () => {
  const { currentUser, products: contextProducts } = useAccounting();
  const { data: serverProducts = [], refetch: refetchProducts } = useProducts();
  const { showToast } = useToast();
  // const { showDialog } = useDialog();
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // في وضع الديمو، نستخدم المنتجات من السياق (الوهمية)
  const products: Product[] = currentUser?.role === 'demo' ? contextProducts : serverProducts;

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  
  const [newCost, setNewCost] = useState<string>('');
  const [revaluationDate, setRevaluationDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  
  const [saving, setSaving] = useState(false);

  // useClickOutside(searchContainerRef, () => setShowProductDropdown(false));
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId) as unknown as Product | undefined;
  }, [selectedProductId, products]);

  const oldCost = useMemo(() => {
    if (!selectedProduct) return 0;
    return selectedProduct.weighted_average_cost || selectedProduct.purchase_price || 0;
  }, [selectedProduct]);

  const stock = useMemo(() => {
    if (!selectedProduct) return 0;
    return selectedProduct.stock || 0;
  }, [selectedProduct]);

  const valueDifference = useMemo(() => {
    const newCostValue = parseFloat(newCost);
    if (isNaN(newCostValue) || !stock) return 0;
    return (newCostValue - oldCost) * stock;
  }, [newCost, oldCost, stock]);

  const performRevaluation = async () => {
    setSaving(true);
    if (currentUser?.role === 'demo') {
        showToast('تمت إعادة تقييم التكلفة بنجاح ✅ (محاكاة)', 'success');
        setSaving(false);
        return;
    }
    try {
      // يمكن نقل هذا المنطق إلى ملف خدمة
      // await inventoryService.revalueProductCost({ ... });
      const { error } = await supabase.rpc('revalue_product_cost', {
        p_product_id: selectedProductId,
        p_new_cost: parseFloat(newCost),
        p_revaluation_date: revaluationDate,
        p_notes: notes || `إعادة تقييم يدوية`
      });

      if (error) throw error;

      showToast('تمت إعادة تقييم التكلفة بنجاح ✅', 'success');
      refetchProducts();
      setSelectedProductId('');
      setProductSearchTerm('');
      setNewCost('');
      setNotes('');

    } catch (error: any) {
      showToast(`فشل إعادة التقييم: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  const handleRevalue = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newCostValue = parseFloat(newCost);
    const revaluationSchema = z.object({
        productId: z.string().uuid('يرجى اختيار صنف صحيح'),
        newCost: z.number().nonnegative('التكلفة يجب أن تكون 0 أو أكثر'),
        revaluationDate: z.string().min(1, 'تاريخ التقييم مطلوب')
    });

    const validationResult = revaluationSchema.safeParse({ productId: selectedProductId, newCost: newCostValue, revaluationDate });
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    if (newCostValue === oldCost) {
      showToast('التكلفة الجديدة مطابقة للتكلفة الحالية. لا يوجد تغيير.', 'info');
      return;
    }

    const confirmMessage = `هل أنت متأكد من إعادة تقييم تكلفة الصنف "${selectedProduct?.name}"؟\n\nالتكلفة الحالية: ${oldCost.toLocaleString()}\nالتكلفة الجديدة: ${newCostValue.toLocaleString()}\n\nسيتم إنشاء قيد محاسبي بقيمة الفرق: ${valueDifference.toLocaleString()}`;
    
    // الاستخدام المقترح لنافذة التأكيد المخصصة
    // showDialog({ title: 'تأكيد إعادة التقييم', message: confirmMessage, onConfirm: performRevaluation });

    // الطريقة الحالية (غير موصى بها)
    if (window.confirm(confirmMessage)) {
      await performRevaluation();
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
        <div ref={searchContainerRef} className="relative z-10">
          <label className="block text-sm font-bold text-slate-700 mb-1">اختر الصنف</label>
          <div className="relative">
            <input type="text" value={productSearchTerm} onChange={(e) => { setProductSearchTerm(e.target.value); setShowProductDropdown(true); setSelectedProductId(''); }} onFocus={() => setShowProductDropdown(true)} placeholder="ابحث باسم الصنف أو الكود..." className="w-full border border-slate-300 rounded-lg px-4 py-2.5 pl-10 focus:outline-none focus:border-purple-500" />
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
              <div><label className="block text-sm font-bold text-slate-700 mb-1">التكلفة الجديدة للوحدة</label><input type="number" step="any" min="0" required value={newCost} onChange={e => setNewCost(e.target.value)} className="w-full border rounded-lg p-2 font-bold text-lg" /></div>
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