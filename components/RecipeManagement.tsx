import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAccounting } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';
import { Search, Plus, Trash2, Save, Loader2, UtensilsCrossed, Info, X, DollarSign } from 'lucide-react';

interface Ingredient {
  raw_material_id: string;
  name: string;
  quantity_required: number;
  unit?: string;
  cost?: number;
}

const RecipeManagement = ({ productId, productName, onClose }: { productId: string, productName: string, onClose: () => void }) => {
  const { products, settings } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [additionalCosts, setAdditionalCosts] = useState({ labor: 0, overhead: 0, isOverheadPercentage: false });

  useEffect(() => {
    if (productId) fetchRecipe();
  }, [productId]);

  const fetchRecipe = async () => {
    setLoading(true);
    try {
      // جلب تكاليف المنتج الإضافية
      const { data: productData } = await supabase.from('products').select('labor_cost, overhead_cost, is_overhead_percentage').eq('id', productId).single();
      if (productData) {
          setAdditionalCosts({ 
              labor: productData.labor_cost || 0, 
              overhead: productData.overhead_cost || 0,
              isOverheadPercentage: productData.is_overhead_percentage || false
          });
      }

      const { data, error } = await supabase
        .from('bill_of_materials')
        .select(`
          raw_material_id,
          quantity_required,
          raw_material:products!raw_material_id(name, unit, purchase_price, cost)
        `)
        .eq('product_id', productId);

      if (error) throw error;

      if (data) {
        const formatted = data.map((item: any) => ({
          raw_material_id: item.raw_material_id,
          name: item.raw_material.name,
          quantity_required: item.quantity_required,
          unit: item.raw_material.unit,
          cost: item.raw_material.cost || item.raw_material.purchase_price || 0
        }));
        setIngredients(formatted);
      }
    } catch (err: any) {
      showToast('خطأ في جلب المكونات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddIngredient = (product: any) => {
    if (ingredients.some(i => i.raw_material_id === product.id)) {
      showToast('هذا المكون مضاف بالفعل', 'warning');
      return;
    }
    setIngredients([...ingredients, {
      raw_material_id: product.id,
      name: product.name,
      quantity_required: 1,
      unit: product.unit,
      cost: product.cost || product.purchase_price || 0
    }]);
    setSearchTerm('');
  };

  const handleRemoveIngredient = (id: string) => {
    setIngredients(ingredients.filter(i => i.raw_material_id !== id));
  };

  const handleUpdateQuantity = (id: string, qty: number) => {
    setIngredients(ingredients.map(i => 
      i.raw_material_id === id ? { ...i, quantity_required: qty } : i
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. مسح المكونات القديمة لضمان نظافة البيانات
      const { error: deleteError } = await supabase
        .from('bill_of_materials')
        .delete()
        .eq('product_id', productId);

      if (deleteError) throw deleteError;

      // 2. إضافة المكونات الجديدة
      if (ingredients.length > 0) {
        const toInsert = ingredients.map(i => ({
          product_id: productId,
          raw_material_id: i.raw_material_id,
          quantity_required: i.quantity_required
        }));

        const { error: insertError } = await supabase
          .from('bill_of_materials')
          .insert(toInsert);

        if (insertError) throw insertError;
      }

      showToast('تم حفظ الوصفة بنجاح ✅', 'success');
      onClose();
    } catch (err: any) {
      showToast('خطأ في الحفظ: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    p.id !== productId &&
    !ingredients.some(i => i.raw_material_id === p.id)
  ).slice(0, 5);

  const totalRecipeCost = useMemo(() => {
    const materialsCost = ingredients.reduce((sum, ing) => sum + (ing.quantity_required * (ing.cost || 0)), 0);
    const overheadAmount = additionalCosts.isOverheadPercentage 
        ? materialsCost * (additionalCosts.overhead / 100) 
        : additionalCosts.overhead;
    return materialsCost + additionalCosts.labor + overheadAmount;
  }, [ingredients, additionalCosts]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <UtensilsCrossed size={20} className="text-blue-600" /> تعريف مكونات: {productName}
            </h3>
            <p className="text-xs text-slate-500">حدد المواد الخام والكميات المطلوبة لتحضير هذا الصنف</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="relative">
            <label className="block text-sm font-bold text-slate-700 mb-2">إضافة مكون جديد</label>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="ابحث عن مادة خام (مثلاً: لحم، جبنة، خبز...)" 
                className="w-full pr-10 pl-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            {searchTerm && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-xl shadow-xl overflow-hidden">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => handleAddIngredient(p)}
                      className="w-full text-right px-4 py-3 hover:bg-slate-50 border-b last:border-0 flex justify-between items-center"
                    >
                      <span className="font-bold text-slate-700">{p.name}</span>
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-md">{p.unit || 'وحدة'}</span>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-slate-400 text-sm">لا توجد أصناف تطابق البحث</div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-700 text-sm">المكونات الحالية</h4>
            <div className="bg-slate-50 rounded-xl border border-slate-100 min-h-[200px] max-h-[350px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-48 text-slate-400">
                  <Loader2 className="animate-spin mr-2" /> جاري التحميل...
                </div>
              ) : ingredients.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-2">
                  <Info size={32} strokeWidth={1} />
                  <p>لا توجد مكونات معرفة بعد</p>
                </div>
              ) : (
                <table className="w-full text-right">
                  <thead className="text-xs text-slate-500 font-bold border-b sticky top-0 bg-slate-50">
                    <tr>
                      <th className="p-3">المكون</th>
                      <th className="p-3 text-center">الكمية المطلوبة</th>
                      <th className="p-3 text-center w-16">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ingredients.map(ing => (
                      <tr key={ing.raw_material_id} className="hover:bg-white transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-800 text-sm">{ing.name}</div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-2">
                            <input 
                              type="number" 
                              value={ing.quantity_required}
                              onChange={e => handleUpdateQuantity(ing.raw_material_id, parseFloat(e.target.value))}
                              className="w-20 border rounded-lg p-1 text-center font-bold text-blue-600 outline-none focus:ring-1 focus:ring-blue-500"
                              min="0.001"
                              step="0.001"
                            />
                            <span className="text-xs text-slate-400">{ing.unit || 'وحدة'}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <button 
                            onClick={() => handleRemoveIngredient(ing.raw_material_id)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all mx-auto block"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-2">
            <div className="flex justify-between text-sm text-blue-800">
                <span>تكلفة المواد الخام:</span>
                <span className="font-bold">{(ingredients.reduce((sum, ing) => sum + (ing.quantity_required * (ing.cost || 0)), 0)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
                <span>+ عمالة ومصاريف:</span>
                <span className="font-bold">
                  {(additionalCosts.labor + (additionalCosts.isOverheadPercentage 
                    ? (ingredients.reduce((sum, ing) => sum + (ing.quantity_required * (ing.cost || 0)), 0) * (additionalCosts.overhead / 100)) 
                    : additionalCosts.overhead)).toFixed(2)}
                  {additionalCosts.isOverheadPercentage && <span className="text-xs font-normal text-slate-400 mx-1">({additionalCosts.overhead}%)</span>}
                </span>
            </div>
            <div className="flex justify-between items-center border-t border-blue-200 pt-2 mt-2">
                <h4 className="font-bold text-blue-900 flex items-center gap-2">
                <DollarSign size={16} />
                إجمالي تكلفة الوجبة
                </h4>
                <span className="text-xl font-black text-blue-700">{totalRecipeCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button 
              onClick={handleSave}
              disabled={saving || loading}
              className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
              حفظ قائمة المكونات
            </button>
            <button 
              onClick={onClose}
              className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecipeManagement;