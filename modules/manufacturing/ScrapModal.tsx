import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { Trash2, AlertTriangle, DollarSign, X } from 'lucide-react';

interface ScrapModalProps {
  isOpen: boolean;
  onClose: () => void;
  progressId: string;
  materials: any[]; // المواد المتاحة في هذه المرحلة
  onSuccess: () => void;
}

export const ScrapModal: React.FC<ScrapModalProps> = ({ isOpen, onClose, progressId, materials, onSuccess }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    materialId: '',
    quantity: 0,
    isAbnormal: false,
    salvageValue: 0,
    reason: ''
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.materialId || formData.quantity <= 0) {
      showToast('يرجى تحديد المادة والكمية بشكل صحيح', 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('mfg_record_scrap_advanced', {
        p_progress_id: progressId,
        p_material_id: formData.materialId,
        p_qty: formData.quantity,
        p_is_abnormal: formData.isAbnormal,
        p_salvage_value: formData.salvageValue,
        p_reason: formData.reason
      });

      if (error) throw error;

      showToast('تم تسجيل التالف وتحديث قيود الـ WIP بنجاح', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            <h3 className="font-bold text-lg">تسجيل تالف صناعي</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المادة الخام المتضررة</label>
            <select 
              className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-red-500"
              value={formData.materialId}
              onChange={e => setFormData({...formData, materialId: e.target.value})}
              required
            >
              <option value="">اختر المادة...</option>
              {materials.map(m => (
                <option key={m.raw_material_id} value={m.raw_material_id}>{m.product_name || 'مادة غير معروفة'}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الكمية التالفة</label>
              <input 
                type="number" step="any"
                className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-red-500"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value)})}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">القيمة الاستردادية (للوحدة)</label>
              <div className="relative">
                <input 
                  type="number" step="0.01"
                  className="w-full border rounded-lg p-2.5 pr-8 outline-none focus:ring-2 focus:ring-red-500"
                  value={formData.salvageValue}
                  onChange={e => setFormData({...formData, salvageValue: parseFloat(e.target.value)})}
                />
                <DollarSign className="w-4 h-4 absolute left-3 top-3.5 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <input 
              type="checkbox" 
              id="isAbnormal"
              className="w-5 h-5 text-red-600 rounded"
              checked={formData.isAbnormal}
              onChange={e => setFormData({...formData, isAbnormal: e.target.checked})}
            />
            <label htmlFor="isAbnormal" className="text-sm text-amber-800 font-medium cursor-pointer">
              تالف غير مسموح به (Abnormal)
              <p className="text-[10px] font-normal">سيتم تحميل التكلفة كمصروف خسارة بدلاً من تحميلها على المنتج.</p>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">سبب التلف</label>
            <textarea 
              className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-red-500"
              rows={2}
              placeholder="مثال: عطل مفاجئ في الماكينة، سوء تخزين..."
              value={formData.reason}
              onChange={e => setFormData({...formData, reason: e.target.value})}
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? 'جاري المعالجة...' : 'تأكيد تسجيل التالف'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border rounded-lg font-bold hover:bg-gray-50 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};