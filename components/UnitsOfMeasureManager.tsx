import React, { useState, useEffect, useCallback } from 'react';
import { Ruler, Plus, Trash2, Edit, Save, X, Layers, RefreshCw, Loader2, Scale, List } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAccounting } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';
import SearchableSelect from './SearchableSelect';

const UnitsOfMeasureManager = () => {
  const { currentUser } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    uom_type: 'reference' as 'reference' | 'smaller' | 'bigger',
    ratio: 1
  });

  const [catFormData, setCatFormData] = useState({
    name: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const orgId = (currentUser as any)?.organization_id;
      if (!orgId && currentUser?.role !== 'demo') return;

      if (currentUser?.role === 'demo') {
        setCategories([
          { id: 'c1', name: 'وحدات العدد' },
          { id: 'c2', name: 'وحدات الوزن' }
        ]);
        setUoms([
          { id: 'u1', name: 'قطعة', category_id: 'c1', uom_type: 'reference', ratio: 1, uom_categories: { name: 'وحدات العدد' } },
          { id: 'u2', name: 'كرتونة', category_id: 'c1', uom_type: 'bigger', ratio: 24, uom_categories: { name: 'وحدات العدد' } }
        ]);
        setLoading(false);
        return;
      }

      // جلب الفئات والوحدات
      let catsQuery = supabase.from('uom_categories').select('*');
      let uomsQuery = supabase.from('uoms').select('*, uom_categories(name)');
      
      if (orgId) {
        catsQuery = catsQuery.eq('organization_id', orgId);
        uomsQuery = uomsQuery.eq('organization_id', orgId);
      }

      const [catsRes, uomsRes] = await Promise.all([
        catsQuery.order('name'),
        uomsQuery.order('name')
      ]);

      if (catsRes.data) setCategories(catsRes.data);
      if (uomsRes.data) setUoms(uomsRes.data);
    } catch (error: any) {
      showToast('فشل جلب البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUser, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveUoM = async (e: React.FormEvent) => {
    e.preventDefault();
    const orgId = (currentUser as any)?.organization_id;
    
    if (currentUser?.role === 'demo') {
      showToast('تم الحفظ بنجاح (وضع تجريبي)', 'success');
      setIsModalOpen(false);
      return;
    }

    try {
      if (editingId) {
        await supabase.from('uoms').update(formData).eq('id', editingId);
        showToast('تم التحديث بنجاح', 'success');
      } else {
        await supabase.from('uoms').insert({ ...formData, organization_id: orgId });
        showToast('تمت الإضافة بنجاح', 'success');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      showToast('خطأ: ' + error.message, 'error');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const orgId = (currentUser as any)?.organization_id;

    if (currentUser?.role === 'demo') {
      showToast('تمت إضافة الفئة بنجاح (وضع تجريبي)', 'success');
      setIsCatModalOpen(false);
      return;
    }

    try {
      await supabase.from('uom_categories').insert({ ...catFormData, organization_id: orgId });
      showToast('تمت إضافة الفئة بنجاح', 'success');
      setIsCatModalOpen(false);
      fetchData();
    } catch (error: any) {
      showToast('خطأ: ' + error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الوحدة؟ قد يؤثر ذلك على الأصناف المرتبطة.')) return;
    
    if (currentUser?.role === 'demo') {
      showToast('تم الحذف بنجاح (وضع تجريبي)', 'success');
      return;
    }

    try {
      const { error } = await supabase.from('uoms').delete().eq('id', id);
      if (error) throw error;
      showToast('تم الحذف بنجاح', 'success');
      fetchData();
    } catch (error: any) {
      showToast('فشل الحذف: قد تكون الوحدة مرتبطة بأصناف أو حركات مخزنية.', 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Ruler className="text-purple-600" /> إدارة وحدات القياس (UoM)
          </h2>
          <p className="text-slate-500 text-sm">تعريف الوحدات ومعاملات التحويل للمخازن والمبيعات</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsCatModalOpen(true)} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-200 transition-all border border-slate-200">
            <Layers size={18} /> فئة جديدة
          </button>
          <button onClick={() => { setEditingId(null); setFormData({ name: '', category_id: '', uom_type: 'reference', ratio: 1 }); setIsModalOpen(true); }} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 shadow-lg transition-all">
            <Plus size={18} /> إضافة وحدة
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-purple-600" size={32} /></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b">
              <tr>
                <th className="p-4">اسم الوحدة</th>
                <th className="p-4">الفئة</th>
                <th className="p-4">النوع</th>
                <th className="p-4">المعامل (نسبة للمرجع)</th>
                <th className="p-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {uoms.map(uom => (
                <tr key={uom.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold text-slate-800">{uom.name}</td>
                  <td className="p-4"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium">{uom.uom_categories?.name || '-'}</span></td>
                  <td className="p-4 text-sm text-slate-500">
                    {uom.uom_type === 'reference' ? 'وحدة مرجعية (أساسية)' : uom.uom_type === 'bigger' ? 'أكبر من المرجع' : 'أصغر من المرجع'}
                  </td>
                  <td className="p-4 font-mono text-purple-600 font-bold">{uom.ratio}</td>
                  <td className="p-4 flex justify-center gap-2">
                    <button onClick={() => { setEditingId(uom.id); setFormData({ name: uom.name, category_id: uom.category_id, uom_type: uom.uom_type, ratio: uom.ratio }); setIsModalOpen(true); }} className="p-2 text-blue-500 hover:bg-blue-50 rounded transition-colors"><Edit size={18} /></button>
                    <button onClick={() => handleDelete(uom.id)} className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
              {uoms.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد وحدات قياس معرفة حتى الآن.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal لتعريف الوحدة */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">{editingId ? 'تعديل وحدة' : 'إضافة وحدة قياس'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            <form onSubmit={handleSaveUoM} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1 text-slate-700">اسم الوحدة (مثل: كرتونة 24)</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>
              <SearchableSelect 
                label="فئة القياس (Category)"
                options={categories.map(c => ({ id: c.id, name: c.name }))}
                value={formData.category_id}
                onChange={val => setFormData({...formData, category_id: val})}
                placeholder="اختر فئة القياس (مثلاً: وحدات العدد)..."
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1 text-slate-700">النوع</label>
                  <select 
                    value={formData.uom_type} 
                    onChange={e => {
                      const newType = e.target.value as any;
                      setFormData({
                        ...formData, 
                        uom_type: newType,
                        ratio: newType === 'reference' ? 1 : formData.ratio
                      });
                    }} 
                    className="w-full border rounded-lg p-2 bg-white outline-none"
                  >
                    <option value="reference">وحدة مرجعية (الأساس)</option>
                    <option value="bigger">أكبر من المرجع</option>
                    <option value="smaller">أصغر من المرجع</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-slate-700">المعامل (Ratio)</label>
                  <input 
                    required 
                    type="number" 
                    step="0.0001" 
                    min="0.000001"
                    disabled={formData.uom_type === 'reference'}
                    value={formData.ratio} 
                    onChange={e => setFormData({...formData, ratio: parseFloat(e.target.value)})} 
                    className={`w-full border rounded-lg p-2 font-mono ${formData.uom_type === 'reference' ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`} 
                  />
                </div>
              </div>
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 space-y-2">
                <div className="flex items-start gap-2 text-indigo-700 text-xs">
                  <Scale size={14} className="mt-0.5" />
                  <p><strong>قاعدة التحويل:</strong> الوحدة المرجعية دائماً معاملها 1. الوحدات الأخرى تُحسب بالنسبة لها. مثال: الكرتونة = 24 قطعة (القطعة مرجع والكرتونة أكبر بمعامل 24).</p>
                </div>
              </div>
              <button type="submit" className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 shadow-md transition-all">حفظ الوحدة</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal لإضافة الفئة */}
      {isCatModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold">فئة قياس جديدة</h3>
              <button onClick={() => setIsCatModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1 text-slate-700">اسم الفئة (مثل: الكتل، وحدات العدد)</label>
                <input required type="text" value={catFormData.name} onChange={e => setCatFormData({...catFormData, name: e.target.value})} className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              <button type="submit" className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900 shadow-md transition-all">حفظ الفئة</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnitsOfMeasureManager;