import React, { useState, useMemo } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { modifierService } from '../services/modifierService';
import { useToast } from '../context/ToastContext';
import { Copy, Search, X, Loader2 } from 'lucide-react';

interface CopyModifiersModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetProduct: { id: string; name: string };
  onSuccess: () => void;
}

export const CopyModifiersModal: React.FC<CopyModifiersModalProps> = ({ isOpen, onClose, targetProduct, onSuccess }) => {
  const { products } = useAccounting();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  const sourceProducts = useMemo(() => {
    return products.filter(p => 
      p.product_type === 'MANUFACTURED' && 
      p.id !== targetProduct.id &&
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, targetProduct.id, searchTerm]);

  const handleCopy = async () => {
    if (!selectedSourceId) {
      showToast('الرجاء اختيار منتج لنسخ الإعدادات منه.', 'warning');
      return;
    }
    if (!window.confirm(`سيتم حذف جميع إعدادات الإضافات الحالية للمنتج "${targetProduct.name}" واستبدالها بإعدادات المنتج المختار. هل أنت متأكد؟`)) {
      return;
    }

    setIsCopying(true);
    try {
      await modifierService.copyModifiers(selectedSourceId, targetProduct.id);
      showToast('تم نسخ إعدادات الإضافات بنجاح!', 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      showToast('فشل نسخ الإعدادات: ' + error.message, 'error');
    } finally {
      setIsCopying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <Copy size={20} className="text-purple-600" /> نسخ إعدادات إلى: {targetProduct.name}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
        </div>

        <div className="p-6 flex-1 flex flex-col gap-4">
          <input type="text" placeholder="ابحث عن المنتج المصدر..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-purple-500 outline-none" />
          <div className="flex-1 overflow-y-auto border rounded-lg bg-slate-50 p-2 space-y-1">
            {sourceProducts.map(p => (<div key={p.id} onClick={() => setSelectedSourceId(p.id)} className={`p-3 rounded-md cursor-pointer ${selectedSourceId === p.id ? 'bg-purple-600 text-white font-bold' : 'bg-white hover:bg-purple-50'}`}>{p.name}</div>))}
          </div>
        </div>

        <div className="p-4 border-t bg-white flex justify-between items-center">
          <button onClick={onClose} className="px-6 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200">إلغاء</button>
          <button onClick={handleCopy} disabled={!selectedSourceId || isCopying} className="px-8 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
            {isCopying ? <Loader2 size={18} className="animate-spin" /> : <Copy size={18} />} {isCopying ? 'جاري النسخ...' : 'تأكيد النسخ'}
          </button>
        </div>
      </div>
    </div>
  );
};