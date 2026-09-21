import React, { useState } from 'react';
import { X, Image as ImageIcon, Loader2, Upload } from 'lucide-react';
import { supabase } from '../../../supabaseClient';

export interface CategoryFormData {
  id: string;
  name: string;
  image_url: string;
  description: string;
}

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryFormData: CategoryFormData;
  setCategoryFormData: React.Dispatch<React.SetStateAction<CategoryFormData>>;
  currentUser: any;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  refreshData: () => Promise<void>;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  categoryFormData,
  setCategoryFormData,
  currentUser,
  showToast,
  refreshData,
}) => {
  const [categoryUploading, setCategoryUploading] = useState(false);

  if (!isOpen) return null;

  const handleCategoryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    if (currentUser?.role === 'demo') {
      showToast('رفع الصور غير متاح في النسخة التجريبية', 'warning');
      return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `cat-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      setCategoryUploading(true);
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      setCategoryFormData(prev => ({ ...prev, image_url: data.publicUrl }));
    } catch (error: any) {
      showToast('فشل رفع الصورة: ' + error.message, 'error');
    } finally {
      setCategoryUploading(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryFormData.name) return;

    if (currentUser?.role === 'demo') {
      showToast('تم حفظ التصنيف بنجاح (محاكاة)', 'success');
      onClose();
      return;
    }

    try {
      const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

      if (categoryFormData.id) {
        const { error } = await supabase.from('item_categories')
          .update({
            name: categoryFormData.name,
            image_url: categoryFormData.image_url,
            description: categoryFormData.description,
          })
          .eq('id', categoryFormData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('item_categories')
          .insert({
            name: categoryFormData.name,
            image_url: categoryFormData.image_url,
            description: categoryFormData.description,
            organization_id: orgId,
          });
        if (error) throw error;
      }

      showToast('تم حفظ التصنيف بنجاح', 'success');
      await refreshData();
      onClose();
    } catch (error: any) {
      showToast('فشل حفظ التصنيف: ' + error.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800">{categoryFormData.id ? 'تعديل التصنيف' : 'تصنيف جديد'}</h3>
          <button onClick={onClose}><X className="text-slate-400 hover:text-red-500" /></button>
        </div>
        <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
          <div className="flex justify-center">
            <div className="relative group cursor-pointer w-24 h-24 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
              {categoryFormData.image_url ? (
                <img src={categoryFormData.image_url} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="text-slate-400 w-8 h-8" />
              )}
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-xl cursor-pointer">
                {categoryUploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                <input type="file" accept="image/*" onChange={handleCategoryImageUpload} className="hidden" disabled={categoryUploading} />
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">اسم التصنيف <span className="text-red-500">*</span></label>
            <input
              required
              type="text"
              value={categoryFormData.name}
              onChange={e => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">الوصف</label>
            <textarea
              rows={3}
              value={categoryFormData.description}
              onChange={e => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
          <button type="submit" disabled={categoryUploading} className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 mt-2 disabled:opacity-50">
            حفظ التصنيف
          </button>
        </form>
      </div>
    </div>
  );
};
