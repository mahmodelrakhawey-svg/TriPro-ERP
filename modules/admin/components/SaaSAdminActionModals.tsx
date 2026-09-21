import React from 'react';
import { Trash2, Loader2, X } from 'lucide-react';
import { Organization } from '../types/saasTypes';

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, organization, confirmName, setConfirmName, loading }: any) => {
  if (!isOpen || !organization) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 space-y-6 text-center">
          <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={48} className="text-rose-600" />
          </div>
          <h3 className="font-black text-2xl text-slate-800">حذف المنظمة نهائياً؟</h3>
          <p className="text-slate-500">
            أنت على وشك حذف شركة <span className="font-bold text-rose-600">"{organization.name}"</span>. 
            سيؤدي هذا الإجراء إلى مسح كافة البيانات، الفواتير، القيود، والمستخدمين المرتبطين بها للأبد.
          </p>
          
          <div className="space-y-2 text-right">
            <label className="text-sm font-bold text-slate-700">لتأكيد الحذف، يرجى كتابة اسم الشركة أدناه:</label>
            <input 
              type="text" 
              className="w-full border-2 border-rose-100 rounded-xl p-3 outline-none focus:ring-2 focus:ring-rose-500 font-bold"
              placeholder={organization.name}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={onConfirm}
              disabled={loading || confirmName.trim() !== organization.name.trim()}
              className="w-full bg-rose-600 text-white font-black py-4 rounded-2xl hover:bg-rose-700 flex items-center justify-center gap-2 shadow-lg shadow-rose-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Trash2 size={20} />} 
              تأكيد الحذف النهائي
            </button>
            <button onClick={onClose} className="w-full py-3 text-slate-500 font-bold hover:text-slate-700">تراجع وإلغاء</button>
          </div>
        </div>
      </div>
    </div>
  );
};


const OrphanedFilesModal = ({ isOpen, onClose, files, onDelete, loading }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[80vh]">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
            <Trash2 className="text-rose-600" /> المرفقات اليتيمة (في الـ Storage فقط)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {files.length === 0 ? (
            <div className="text-center py-10 text-slate-500">لا توجد ملفات يتيمة حالياً ✅</div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-600 font-bold mb-4 bg-amber-50 p-3 rounded-lg border border-amber-100">تحذير: هذه الملفات موجودة في المخزن السحابي ولكن لا تملك أي سجل يشير لها في قاعدة البيانات.</p>
              {files.map((file: string) => (
                <div key={file} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-mono text-[10px] text-slate-600 truncate flex-1">{file}</span>
                  <button onClick={() => onDelete(file)} className="text-rose-600 hover:bg-rose-100 p-2 rounded-lg" title="حذف الملف نهائياً">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-slate-50 flex justify-between gap-3">
          <button onClick={onClose} className="px-6 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-600">إغلاق</button>
          {files.length > 0 && (
            <button onClick={() => onDelete('all')} disabled={loading} className="px-6 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 flex items-center gap-2">
              {loading ? <Loader2 className="animate-spin" /> : <Trash2 size={18} />} حذف كافة اليتامى
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export { DeleteConfirmModal, OrphanedFilesModal };
