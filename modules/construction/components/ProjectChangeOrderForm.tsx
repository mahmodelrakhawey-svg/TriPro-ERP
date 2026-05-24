import React, { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { X, Save, FileEdit, Loader2, DollarSign, AlertCircle } from 'lucide-react';

interface Props {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ProjectChangeOrderForm: React.FC<Props> = ({ projectId, onClose, onSuccess }) => {
  const { organization } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    order_number: `CO-${Date.now().toString().slice(-6)}`,
    description: '',
    amount_change: 0
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description) return showToast('يرجى إدخال وصف للتعديل', 'warning');
    if (formData.amount_change === 0) return showToast('يرجى إدخال قيمة التعديل (موجبة أو سالبة)', 'warning');

    setLoading(true);
    try {
      const { error } = await supabase
        .from('project_change_orders')
        .insert([{
          project_id: projectId,
          organization_id: organization?.id,
          order_number: formData.order_number,
          description: formData.description,
          amount_change: formData.amount_change,
          status: 'draft'
        }]);

      if (error) throw error;

      showToast('تم حفظ أمر التغيير كمسودة بنجاح ✅', 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 rtl">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-xl"><FileEdit size={24} /></div>
            <h3 className="font-black text-xl text-slate-800">أمر تغيير جديد (Scope Change)</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3 text-amber-800">
            <AlertCircle className="shrink-0" size={20} />
            <p className="text-xs font-bold leading-relaxed">
              أوامر التغيير تسمح بتعديل قيمة العقد الأصلية. بعد الحفظ كمسودة، يجب اعتمادها ليظهر تأثيرها المالي في لوحة التحكم والميزانية.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 px-1">رقم أمر التغيير</label>
              <input type="text" value={formData.order_number} onChange={e => setFormData({...formData, order_number: e.target.value})} className="w-full border-2 border-slate-100 rounded-xl p-3 font-mono font-bold text-center focus:border-rose-500 outline-none transition-colors" required />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 px-1">وصف التعديل / السبب</label>
              <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="مثال: إضافة أعمال دهانات إضافية للدور الثاني..." className="w-full border-2 border-slate-100 rounded-xl p-3 font-bold h-24 focus:border-rose-500 outline-none transition-colors resize-none" required />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 px-1">قيمة التعديل (الزيادة أو النقص)</label>
              <div className="relative">
                <input type="number" value={formData.amount_change} onChange={e => setFormData({...formData, amount_change: parseFloat(e.target.value)})} className="w-full border-2 border-slate-100 rounded-xl p-3 pl-12 font-black text-2xl text-slate-800 focus:border-rose-500 outline-none transition-colors" required />
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
              </div>
              <p className="text-[10px] text-slate-400 mt-2 font-bold px-1">استخدم القيمة الموجبة للإضافة، والسالبة للخصم.</p>
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-slate-50">
            <button type="submit" disabled={loading} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-4 rounded-2xl font-black shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2">
              {loading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> حفظ كمسودة</>}
            </button>
            <button type="button" onClick={onClose} className="px-8 bg-slate-100 hover:bg-slate-200 text-slate-700 py-4 rounded-2xl font-bold transition-all">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectChangeOrderForm;