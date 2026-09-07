import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  Scale, 
  Plus, 
  Trash2, 
  Edit, 
  Layers, 
  ChevronRight, 
  Info,
  Save,
  X,
  Loader2
} from 'lucide-react';

interface UomCategory {
  id: string;
  name: string;
}

interface Uom {
  id: string;
  category_id: string;
  name: string;
  uom_type: 'reference' | 'smaller' | 'bigger';
  ratio: number;
}

export default function UomManager() {
  const { currentUser } = useAccounting();
  const { showToast } = useToast();
  const [categories, setCategories] = useState<UomCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isUomModalOpen, setIsUomModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<UomCategory | null>(null);
  const [editingUom, setEditingUom] = useState<Uom | null>(null);

  // Form states
  const [categoryName, setCategoryName] = useState('');
  const [uomName, setUomName] = useState('');
  const [uomType, setUomType] = useState<'reference' | 'smaller' | 'bigger'>('smaller');
  const [uomRatio, setUomRatio] = useState(1);

  const orgId = (currentUser as any)?.organization_id;

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategoryId) {
      fetchUoms(selectedCategoryId);
    }
  }, [selectedCategoryId]);

  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('uom_categories')
      .select('*')
      .order('name');
    
    if (error) {
      showToast('فشل جلب الفئات: ' + error.message, 'error');
    } else {
      setCategories(data || []);
      if (data && data.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(data[0].id);
      }
    }
    setLoading(false);
  };

  const fetchUoms = async (categoryId: string) => {
    const { data, error } = await supabase
      .from('uoms')
      .select('*')
      .eq('category_id', categoryId)
      .order('ratio', { ascending: true });
    
    if (error) {
      showToast('فشل جلب الوحدات: ' + error.message, 'error');
    } else {
      setUoms(data || []);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: categoryName, organization_id: orgId };
    
    if (editingCategory) {
      const { error } = await supabase.from('uom_categories').update(payload).eq('id', editingCategory.id);
      if (error) showToast(error.message, 'error');
      else { showToast('تم التحديث', 'success'); setIsCategoryModalOpen(false); fetchCategories(); }
    } else {
      const { error } = await supabase.from('uom_categories').insert([payload]);
      if (error) showToast(error.message, 'error');
      else { showToast('تمت الإضافة', 'success'); setIsCategoryModalOpen(false); fetchCategories(); }
    }
  };

  const handleSaveUom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId) return;
    const payload = { category_id: selectedCategoryId, name: uomName, uom_type: uomType, ratio: uomRatio, organization_id: orgId };
    if (editingUom) {
      const { error } = await supabase.from('uoms').update(payload).eq('id', editingUom.id);
      if (error) showToast(error.message, 'error');
      else { showToast('تم التحديث', 'success'); setIsUomModalOpen(false); fetchUoms(selectedCategoryId); }
    } else {
      const { error } = await supabase.from('uoms').insert([payload]);
      if (error) showToast(error.message, 'error');
      else { showToast('تمت الإضافة', 'success'); setIsUomModalOpen(false); fetchUoms(selectedCategoryId); }
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('سيتم حذف كافة الوحدات التابعة، هل تستمر؟')) return;
    await supabase.from('uom_categories').delete().eq('id', id);
    fetchCategories();
  };

  const handleDeleteUom = async (id: string) => {
    if (!window.confirm('حذف الوحدة؟')) return;
    await supabase.from('uoms').delete().eq('id', id);
    if (selectedCategoryId) fetchUoms(selectedCategoryId);
  };

  const openCategoryModal = (cat?: UomCategory) => {
    setEditingCategory(cat || null);
    setCategoryName(cat ? cat.name : '');
    setIsCategoryModalOpen(true);
  };

  const openUomModal = (uom?: Uom) => {
    setEditingUom(uom || null);
    setUomName(uom ? uom.name : '');
    setUomType(uom ? uom.uom_type : 'smaller');
    setUomRatio(uom ? uom.ratio : 1);
    setIsUomModalOpen(true);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen rtl text-right">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <Scale className="text-blue-600" /> إدارة وحدات القياس
          </h1>
          <p className="text-slate-500">تعريف العلاقات بين الأحجام والأوزان والقطع</p>
        </div>
        <button onClick={() => openCategoryModal()} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg">
          <Plus size={18} /> إضافة فئة
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 flex items-center gap-2">
              <Layers size={18} className="text-slate-400" /> فئات الوحدات
            </div>
            <div className="divide-y divide-slate-50">
              {categories.map((cat) => (
                <div key={cat.id} onClick={() => setSelectedCategoryId(cat.id)} className={`p-4 cursor-pointer flex justify-between items-center group ${selectedCategoryId === cat.id ? 'bg-blue-50 border-r-4 border-blue-600' : 'hover:bg-slate-50'}`}>
                  <span className={`font-bold ${selectedCategoryId === cat.id ? 'text-blue-700' : 'text-slate-600'}`}>{cat.name}</span>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); openCategoryModal(cat); }} className="text-slate-400 hover:text-blue-600"><Edit size={14}/></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }} className="text-slate-400 hover:text-red-600"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
            <h4 className="font-bold text-blue-900 text-xs mb-2 flex items-center gap-2"><Info size={14} /> معلومة</h4>
            <p className="text-blue-700 text-[10px] leading-relaxed">يرجى تحديد "وحدة المرجع" (مثلاً: قطعة) أولاً بنسبة 1، ثم أضف الوحدات الأخرى (كرتونة) كـ "أكبر" بنسبة 12.</p>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800">الوحدات التابعة</h3>
              {selectedCategoryId && <button onClick={() => openUomModal()} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-xs font-bold">إضافة وحدة</button>}
            </div>
            <table className="w-full text-right">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-sm">
                <tr>
                  <th className="p-4">الاسم</th>
                  <th className="p-4">النوع</th>
                  <th className="p-4 text-center">النسبة</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {uoms.map((uom) => (
                  <tr key={uom.id} className="hover:bg-slate-50/50 group">
                    <td className="p-4 font-bold text-slate-700">{uom.name}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-black ${uom.uom_type === 'reference' ? 'bg-emerald-100 text-emerald-700' : uom.uom_type === 'smaller' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {uom.uom_type === 'reference' ? 'المرجع' : uom.uom_type === 'smaller' ? 'أصغر' : 'أكبر'}
                      </span>
                    </td>
                    <td className="p-4 text-center font-mono font-black text-blue-600">{uom.ratio}</td>
                    <td className="p-4 flex gap-2 justify-end opacity-0 group-hover:opacity-100">
                      <button onClick={() => openUomModal(uom)} className="p-2 text-slate-400 hover:text-blue-600"><Edit size={14} /></button>
                      <button onClick={() => handleDeleteUom(uom.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] w-full max-w-md p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-slate-800">{editingCategory ? 'تعديل الفئة' : 'فئة جديدة'}</h3>
              <button onClick={() => setIsCategoryModalOpen(false)}><X size={24} className="text-slate-400"/></button>
            </div>
            <input type="text" value={categoryName} onChange={e => setCategoryName(e.target.value)} className="w-full border-2 rounded-2xl p-4 font-bold outline-none focus:border-blue-500 mb-6" placeholder="مثلاً: وحدات الوزن" />
            <button onClick={handleSaveCategory} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-100 flex items-center justify-center gap-2"><Save size={20}/> حفظ</button>
          </div>
        </div>
      )}

      {isUomModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] w-full max-w-md p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-slate-800">{editingUom ? 'تعديل الوحدة' : 'وحدة جديدة'}</h3>
              <button onClick={() => setIsUomModalOpen(false)}><X size={24} className="text-slate-400"/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-400 block mb-1">اسم الوحدة</label>
                <input type="text" value={uomName} onChange={e => setUomName(e.target.value)} className="w-full border-2 rounded-2xl p-4 font-bold outline-none focus:border-blue-500" placeholder="كرتونة" />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 block mb-1">النوع</label>
                <select value={uomType} onChange={e => setUomType(e.target.value as any)} className="w-full border-2 rounded-2xl p-4 font-bold outline-none focus:border-blue-500 appearance-none bg-white">
                  <option value="reference">وحدة مرجعية</option>
                  <option value="smaller">أصغر من المرجع</option>
                  <option value="bigger">أكبر من المرجع</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 block mb-1">النسبة التحويلية</label>
                <input type="number" step="any" value={uomRatio} onChange={e => setUomRatio(parseFloat(e.target.value))} disabled={uomType==='reference'} className="w-full border-2 rounded-2xl p-4 font-black text-blue-600 outline-none focus:border-blue-500 disabled:bg-slate-50" />
                {uomType !== 'reference' && (
                  <p className="text-[10px] text-blue-500 font-bold mt-2">كل 1 {uomName} = {uomRatio} من وحدة المرجع لهذه الفئة.</p>
                )}
              </div>
              <button onClick={handleSaveUom} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2"><Save size={20}/> حفظ الوحدة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}