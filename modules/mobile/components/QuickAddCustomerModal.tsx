import React from 'react';
import { User, X, RefreshCw, CheckCircle2 } from 'lucide-react';

interface QuickAddCustomerModalProps {
  show: boolean;
  onClose: () => void;
  newCustName: string;
  setNewCustName: (name: string) => void;
  newCustPhone: string;
  setNewCustPhone: (phone: string) => void;
  onSave: () => void;
  saving: boolean;
}

export const QuickAddCustomerModal: React.FC<QuickAddCustomerModalProps> = ({
  show,
  onClose,
  newCustName,
  setNewCustName,
  newCustPhone,
  setNewCustPhone,
  onSave,
  saving,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-4 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <User size={18} className="text-indigo-400" />
            <h3 className="font-bold text-sm text-white">إضافة عميل جديد سريعاً</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">
              اسم العميل / المحل <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={newCustName}
              onChange={e => setNewCustName(e.target.value)}
              placeholder="مثال: بقالة الأمل أو محمد علي"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">رقم الهاتف (اختياري)</label>
            <input
              type="tel"
              value={newCustPhone}
              onChange={e => setNewCustPhone(e.target.value)}
              placeholder="مثال: 01012345678"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !newCustName.trim()}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition-colors"
          >
            {saving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            <span>{saving ? 'جاري الحفظ...' : 'حفظ واختيار العميل'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickAddCustomerModal;
