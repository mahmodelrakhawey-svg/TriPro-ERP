import React, { useState } from 'react';
import { Percent, X } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { bulkPriceUpdateSchema } from '../../../utils/validationSchemas';
import type { Item } from '../ProductManager';

interface BulkPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  items: Item[];
  currentUser: any;
  can: (module: string, action: string) => boolean;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  refresh: () => void;
}

export const BulkPriceUpdateModal: React.FC<BulkPriceUpdateModalProps> = ({
  isOpen,
  onClose,
  selectedIds,
  setSelectedIds,
  items,
  currentUser,
  can,
  showToast,
  refresh,
}) => {
  const [bulkPricePercentage, setBulkPricePercentage] = useState(0);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  if (!isOpen) return null;

  const handleBulkPriceUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) return;

    const validationResult = bulkPriceUpdateSchema.safeParse({ percentage: bulkPricePercentage });
    if (!validationResult.success) {
      showToast(validationResult.error.issues[0].message, 'warning');
      return;
    }

    if (!can('products', 'update')) {
      showToast('ليس لديك صلاحية تعديل المنتجات', 'error');
      return;
    }

    if (currentUser?.role === 'demo') {
      showToast(`تم تحديث الأسعار بنسبة ${bulkPricePercentage}% لـ ${selectedIds.size} صنف (محاكاة)`, 'success');
      onClose();
      setSelectedIds(new Set());
      return;
    }

    setIsBulkSaving(true);
    try {
      const updates = Array.from(selectedIds).map(async (id) => {
        const item = (items as Item[]).find(i => i.id === id);
        if (!item) return;

        const multiplier = 1 + (bulkPricePercentage / 100);
        let newPrice = item.sales_price * multiplier;

        // تقريب محاسبي لأقرب خانتين عشريتين
        newPrice = Math.max(0, Math.round(newPrice * 100) / 100);

        return supabase.from('products').update({
          sales_price: newPrice
        }).eq('id', id);
      });

      await Promise.all(updates);

      showToast(`تم تحديث أسعار ${selectedIds.size} صنف بنجاح ✅`, 'success');
      refresh();
      onClose();
      setBulkPricePercentage(0);
      setSelectedIds(new Set());
    } catch (error: any) {
      console.error(error);
      showToast('حدث خطأ أثناء تحديث الأسعار: ' + error.message, 'error');
    } finally {
      setIsBulkSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <Percent size={20} className="text-orange-600" /> تحديث أسعار البيع جماعياً
          </h3>
          <button onClick={onClose}><X className="text-slate-400 hover:text-red-500" /></button>
        </div>
        <form onSubmit={handleBulkPriceUpdateSubmit} className="space-y-4">
          <div className="bg-orange-50 p-3 rounded-lg text-sm text-orange-800 mb-4">
            سيتم تعديل سعر البيع لـ <strong>{selectedIds.size}</strong> صنف محدد. 
            استخدم قيمة موجبة للزيادة (مثلاً 10 للزيادة 10%) وقيمة سالبة للخصم (مثلاً -5 لخفض السعر 5%).
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">نسبة التغيير (%)</label>
            <div className="relative">
              <input 
                type="number" 
                required 
                step="0.01" 
                value={bulkPricePercentage} 
                onChange={e => setBulkPricePercentage(parseFloat(e.target.value) || 0)} 
                className="w-full border rounded-lg p-2.5 pr-10 focus:ring-2 focus:ring-orange-500 outline-none font-bold text-lg text-center" 
              />
            </div>
          </div>

          <button type="submit" disabled={isBulkSaving} className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 mt-2 disabled:opacity-50 shadow-lg">
            {isBulkSaving ? 'جاري التحديث...' : 'تحديث الأسعار الآن'}
          </button>
        </form>
      </div>
    </div>
  );
};
