import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { ArrowRight, Plus, DollarSign, CheckCircle2, X, Loader2, FileText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { retentionReleaseSchema, RetentionReleaseFormData } from '../../utils/validationSchemas';

interface RetentionRelease {
  id: string;
  release_date: string;
  amount: number;
  release_type: 'customer' | 'subcontractor';
  notes: string | null;
  subcontractors?: { name: string } | null; // For subcontractor releases
}

interface Props {
  projectId: string;
  projectName: string; // Added for better context in UI
  onBack: () => void;
}

const RetentionReleaseManager: React.FC<Props> = ({ projectId, projectName, onBack }) => {
  const [releases, setReleases] = useState<RetentionRelease[]>([]);
  const [subcontractors, setSubcontractors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const { showToast } = useToast();

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<RetentionReleaseFormData>({
    resolver: zodResolver(retentionReleaseSchema),
    defaultValues: {
      amount: 0,
      release_type: 'customer',
      subcontractor_id: null,
      notes: '',
    }
  });

  const watchedReleaseType = watch('release_type');

  useEffect(() => {
    fetchReleases();
    fetchSubcontractors();
  }, [projectId]);

  const fetchReleases = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_retention_releases')
        .select('*, subcontractors(name)')
        .eq('project_id', projectId)
        .order('release_date', { ascending: false });

      if (error) throw error;
      setReleases(data || []);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubcontractors = async () => {
    try {
      const { data, error } = await supabase
        .from('subcontractors')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      setSubcontractors(data || []);
    } catch (error: any) {
      showToast('فشل جلب مقاولي الباطن: ' + error.message, 'error');
    }
  };

  const onSubmitAddRelease = async (formData: RetentionReleaseFormData) => {
    try {
      const { error } = await supabase.rpc('fn_release_retention', {
        p_project_id: projectId,
        p_amount: formData.amount,
        p_type: formData.release_type,
        p_notes: formData.notes,
        p_subcontractor_id: formData.subcontractor_id,
      });

      if (error) throw error;
      showToast('تم تسجيل استرداد المحجوز بنجاح ✅', 'success');
      reset();
      setShowAddForm(false);
      fetchReleases();
    } catch (error: any) {
      showToast('خطأ في تسجيل الاسترداد: ' + error.message, 'error');
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <ArrowRight size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <DollarSign className="text-green-600" />
              إدارة محجوزات الضمان للمشروع: {projectName}
            </h1>
            <p className="text-gray-500 mt-1">استرداد محجوزات العملاء أو رد محجوزات مقاولي الباطن</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
        >
          <Plus size={20} />
          تسجيل استرداد جديد
        </button>
      </div>

      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
                <DollarSign className="text-green-600" size={24} />
                تسجيل استرداد محجوز ضمان
              </h3>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmitAddRelease)} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">نوع الاسترداد</label>
                <select
                  {...register('release_type')}
                  className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 outline-none bg-white"
                >
                  <option value="customer">استرداد من العميل (لنا)</option>
                  <option value="subcontractor">رد لمقاول باطن (علينا)</option>
                </select>
                {errors.release_type && <p className="text-red-500 text-xs mt-1">{errors.release_type.message}</p>}
              </div>

              {watchedReleaseType === 'subcontractor' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">مقاول الباطن</label>
                  <select
                    {...register('subcontractor_id')}
                    className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 outline-none bg-white"
                  >
                    <option value="">اختر مقاول باطن...</option>
                    {subcontractors.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                  {errors.subcontractor_id && <p className="text-red-500 text-xs mt-1">{errors.subcontractor_id.message}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">المبلغ</label>
                <input
                  type="number"
                  {...register('amount', { valueAsNumber: true })}
                  className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 outline-none"
                  min="0"
                />
                {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">ملاحظات</label>
                <textarea
                  {...register('notes')}
                  rows={3}
                  className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 outline-none"
                  placeholder="ملاحظات حول عملية الاسترداد..."
                />
                {errors.notes && <p className="text-red-500 text-xs mt-1">{errors.notes.message}</p>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={20} /> تسجيل الاسترداد</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-12 w-12 text-green-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {releases.map((release) => (
            <div key={release.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap md:flex-nowrap items-center justify-between gap-6">
              <div className="flex items-center gap-4 min-w-[200px]">
                <div className={`p-3 rounded-xl ${release.release_type === 'customer' ? 'bg-green-50 text-green-600' : 'bg-purple-50 text-purple-600'}`}>
                  <DollarSign size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800">
                    {release.release_type === 'customer' ? 'استرداد من العميل' : `رد لمقاول: ${release.subcontractors?.name || 'غير معروف'}`}
                  </h4>
                  <p className="text-sm text-gray-500">{release.release_date}</p>
                </div>
              </div>

              <div className="flex flex-1 justify-around gap-4 text-center">
                <div>
                  <span className="text-xs text-gray-400 block mb-1">المبلغ</span>
                  <div className="font-bold text-green-700 text-lg">{release.amount.toLocaleString()} ج.م</div>
                </div>
                {release.notes && (
                  <div>
                    <span className="text-xs text-gray-400 block mb-1">ملاحظات</span>
                    <div className="font-medium text-gray-700 text-sm">{release.notes}</div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {releases.length === 0 && (
            <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-gray-100">
              <FileText size={48} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-500 font-medium">لا توجد عمليات استرداد محجوزات مسجلة لهذا المشروع</p>
              <button onClick={() => setShowAddForm(true)} className="mt-4 text-green-600 font-medium">سجل أول عملية استرداد الآن</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RetentionReleaseManager;