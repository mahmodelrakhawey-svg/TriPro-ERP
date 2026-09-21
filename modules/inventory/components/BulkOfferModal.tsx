import React, { useState } from 'react';
import { Tag, X } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { bulkOfferSchema } from '../../../utils/validationSchemas';
import type { Item } from '../ProductManager';

interface BulkOfferModalProps {
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

export const BulkOfferModal: React.FC<BulkOfferModalProps> = ({
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
  const [bulkOfferData, setBulkOfferData] = useState({
    strategy: 'percentage', // 'percentage' | 'fixed'
    value: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    maxQty: 0,
  });
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  if (!isOpen) return null;

  const handleBulkOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationResult = bulkOfferSchema.safeParse(bulkOfferData);
    if (!validationResult.success) {
      showToast(validationResult.error.issues[0].message, 'warning');
      return;
    }

    if (selectedIds.size === 0) {
      showToast('الرجاء اختيار أصناف لتطبيق العرض عليها', 'warning');
      return;
    }

    if (!can('products', 'update')) {
      showToast('ليس لديك صلاحية تعديل المنتجات (العروض)', 'error');
      return;
    }

    if (currentUser?.role === 'demo') {
      showToast(`تم تطبيق العرض على ${selectedIds.size} صنف بنجاح (محاكاة)`, 'success');
      onClose();
      setSelectedIds(new Set());
      return;
    }

    setIsBulkSaving(true);
    try {
      const updates = Array.from(selectedIds).map(async (id) => {
        const item = items.find(i => i.id === id);
        if (!item) return;

        let newOfferPrice = 0;
        if (bulkOfferData.strategy === 'fixed') {
          newOfferPrice = bulkOfferData.value;
        } else {
          // Percentage discount
          newOfferPrice = item.sales_price * (1 - (bulkOfferData.value / 100));
        }

        // Ensure offer price is not negative and round it
        newOfferPrice = Math.max(0, Math.round(newOfferPrice * 100) / 100);

        return supabase.from('products').update({
          offer_price: newOfferPrice,
          offer_start_date: bulkOfferData.startDate,
          offer_end_date: bulkOfferData.endDate,
          offer_max_qty: bulkOfferData.maxQty || null,
        }).eq('id', id);
      });

      await Promise.all(updates);

      showToast('تم تطبيق العرض الجماعي بنجاح ✅', 'success');
      refresh();
      onClose();
      setSelectedIds(new Set());
    } catch (error: any) {
      console.error(error);
      showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
      setIsBulkSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <Tag size={20} className="text-purple-600" /> تطبيق عرض جماعي
          </h3>
          <button onClick={onClose}><X className="text-slate-400 hover:text-red-500" /></button>
        </div>
        <form onSubmit={handleBulkOfferSubmit} className="space-y-4">
          <div className="bg-purple-50 p-3 rounded-lg text-sm text-purple-800 mb-4">
            سيتم تطبيق هذا العرض على <strong>{selectedIds.size}</strong> صنف محدد.
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">نوع الخصم</label>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setBulkOfferData({ ...bulkOfferData, strategy: 'percentage' })}
                className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                  bulkOfferData.strategy === 'percentage'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                نسبة مئوية %
              </button>
              <button
                type="button"
                onClick={() => setBulkOfferData({ ...bulkOfferData, strategy: 'fixed' })}
                className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                  bulkOfferData.strategy === 'fixed'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                سعر ثابت
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              {bulkOfferData.strategy === 'percentage' ? 'نسبة الخصم (%)' : 'سعر العرض الموحد'}
            </label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={bulkOfferData.value}
              onChange={e => setBulkOfferData({ ...bulkOfferData, value: parseFloat(e.target.value) || 0 })}
              className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500 outline-none font-bold text-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ البداية</label>
              <input
                type="date"
                required
                value={bulkOfferData.startDate}
                onChange={e => setBulkOfferData({ ...bulkOfferData, startDate: e.target.value })}
                className="w-full border rounded-lg p-2.5"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ النهاية</label>
              <input
                type="date"
                required
                value={bulkOfferData.endDate}
                onChange={e => setBulkOfferData({ ...bulkOfferData, endDate: e.target.value })}
                className="w-full border rounded-lg p-2.5"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">الحد الأقصى للعميل (اختياري)</label>
            <input
              type="number"
              min="0"
              value={bulkOfferData.maxQty}
              onChange={e => setBulkOfferData({ ...bulkOfferData, maxQty: parseFloat(e.target.value) || 0 })}
              className="w-full border rounded-lg p-2.5"
              placeholder="0 (بلا حد)"
            />
          </div>

          <button
            type="submit"
            disabled={isBulkSaving}
            className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 mt-2 disabled:opacity-50"
          >
            {isBulkSaving ? 'جاري التطبيق...' : 'تأكيد العرض'}
          </button>
        </form>
      </div>
    </div>
  );
};
