import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { PackagePlus, DollarSign, X, CheckCircle } from 'lucide-react';

interface ByProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  progressId: string;
  onSuccess: () => void;
}

export const ByProductModal: React.FC<ByProductModalProps> = ({ isOpen, onClose, progressId, onSuccess }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    quantity: 0,
    marketValue: 0
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.rpc('mfg_record_byproduct', {
        p_progress_id: progressId,
        p_product_id: formData.productId,
        p_qty: formData.quantity,
        p_market_value: formData.marketValue
      });

      if (error) throw error;

      showToast('تم تسجيل المنتج العرضي وتخفيض تكلفة الأمر بنجاح', 'success');
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border-t-4 border-indigo-500">
        <div className="p-6 border-b flex justify-between items-center">
          <div className="flex items-center gap-2 text-indigo-600">
            <PackagePlus className="w-5 h-5" />
            <h3 className="font-bold text-lg">تسجيل منتج عرضي (By-product)</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-gray-500 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
            ملاحظة: القيمة الإجمالية لهذا المنتج سيتم خصمها آلياً من تكلفة الإنتاج تحت التشغيل للأمر الحالي.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المنتج الناتج</label>
            <input 
              type="text" 
              placeholder="ابحث عن صنف أو أدخل المعرف..."
              className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
              value={formData.productId}
              onChange={e => setFormData({...formData, productId: e.target.value})}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الكمية الناتجة</label>
              <input 
                type="number" step="any"
                className="w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value)})}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">القيمة السوقية (للوحدة)</label>
              <div className="relative">
                <input 
                  type="number" step="0.01"
                  className="w-full border rounded-lg p-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.marketValue}
                  onChange={e => setFormData({...formData, marketValue: parseFloat(e.target.value)})}
                  required
                />
                <DollarSign className="w-4 h-4 absolute left-3 top-3.5 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'جاري الحفظ...' : 'تأكيد وحقن القيمة التكاليفية'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};