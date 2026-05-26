import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { Lock, AlertTriangle, CheckCircle2, ArrowRight, Loader2, DollarSign, FileWarning } from 'lucide-react';

interface Props {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onSuccess: () => void;
}

const ProjectClosingForm: React.FC<Props> = ({ projectId, projectName, onBack, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchClosingSummary();
  }, [projectId]);

  const fetchClosingSummary = async () => {
    // جلب ملخص الربحية قبل الإغلاق
    const { data } = await supabase
      .from('v_project_profitability')
      .select('*')
      .eq('project_id', projectId)
      .single();
    setSummary(data);
  };

  const handleCloseProject = async () => {
    if (!window.confirm('هل أنت متأكد من إغلاق المشروع نهائياً؟ لا يمكن عكس هذه العملية.')) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('fn_close_project', { p_project_id: projectId });
      
      if (error) throw error;

      showToast(data.message || 'تم إغلاق المشروع بنجاح ✅', 'success');
      onSuccess();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen rtl text-right">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-all shadow-sm">
            <ArrowRight size={24} />
          </button>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Lock className="text-red-600" /> إغلاق المشروع: {projectName}
          </h1>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-red-100 overflow-hidden">
          <div className="p-8 space-y-8">
            <div className="bg-red-50 border border-red-100 p-6 rounded-2xl flex gap-4 text-red-800">
              <AlertTriangle className="shrink-0" size={32} />
              <div>
                <h3 className="font-black text-lg">تحذير الإغلاق النهائي</h3>
                <p className="text-sm font-bold opacity-80">
                  بمجرد إغلاق المشروع، سيتم قفل مركز التكلفة، ومنع تسجيل أي مستخلصات أو عهد جديدة. تأكد من اعتماد كافة الأعمال المعلقة.
                </p>
              </div>
            </div>

            {summary && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">إجمالي الإيرادات المعتمدة</p>
                  <p className="text-2xl font-black text-emerald-600">{summary.total_revenue?.toLocaleString()} ج.م</p>
                </div>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">إجمالي التكاليف الفعلية</p>
                  <p className="text-2xl font-black text-red-600">{summary.total_actual_costs?.toLocaleString()} ج.م</p>
                </div>
                <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 md:col-span-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-black text-blue-400 uppercase mb-1">صافي ربحية المشروع</p>
                      <p className="text-3xl font-black text-blue-800">{summary.net_profit?.toLocaleString()} ج.م</p>
                    </div>
                    <div className={`p-4 rounded-xl ${summary.net_profit >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                       <DollarSign size={32} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 pt-6 border-t border-slate-50">
              <h4 className="font-black text-slate-700 flex items-center gap-2"><CheckCircle2 size={18} className="text-blue-500" /> قائمة مراجعة الإغلاق:</h4>
              <ul className="text-sm font-bold text-slate-500 space-y-2 pr-6 list-disc">
                <li>لا توجد مستخلصات عملاء في حالة "مسودة".</li>
                <li>جميع مستخلصات مقاولي الباطن تم اعتمادها وترحيلها.</li>
                <li>تمت تسوية كافة العهد المالية في الموقع.</li>
              </ul>
            </div>

            <button onClick={handleCloseProject} disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-black text-lg shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin" /> : <Lock size={24} />} إغلاق المشروع وترحيل الأرباح نهائياً
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ProjectClosingForm;