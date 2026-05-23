import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { ArrowRight, Plus, Calendar, CheckCircle2, Clock, XCircle, Flag, Loader2, LayoutGrid, BarChart2, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { milestoneSchema, MilestoneFormData } from '../../../utils/validationSchemas';
import ProjectGanttChart from './ProjectGanttChart';

interface Milestone {
  id: string;
  title: string;
  expected_start_date: string;
  expected_end_date: string;
  actual_completion_date: string | null;
  progress_percentage: number;
  status: 'pending' | 'in_progress' | 'completed' | 'delayed';
}

interface Props {
  projectId: string;
  projectName: string; // Added for better context in UI
  onBack: () => void;
}

const ProjectMilestonesManager: React.FC<Props> = ({ projectId, projectName, onBack }) => {
  const { organization } = useAccounting();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'gantt'>('cards');
  const { showToast } = useToast();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<MilestoneFormData>({
    resolver: zodResolver(milestoneSchema) as any,
    defaultValues: {
      projectId,
      title: '',
      expected_start_date: new Date().toISOString().split('T')[0],
      expected_end_date: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0], // 7 days from now
      progress_percentage: 0,
      status: 'pending',
    }
  });

  useEffect(() => {
    if (organization?.id) fetchMilestones();
  }, [projectId, organization?.id]);

  const fetchMilestones = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_milestones')
        .select('*')
        .eq('project_id', projectId).eq('organization_id', organization?.id)
        .order('expected_start_date', { ascending: true });

      if (error) throw error;
      setMilestones(data || []);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const onSubmitAddMilestone = async (formData: MilestoneFormData) => {
    try {
      const { error } = await supabase
        .from('project_milestones')
        .insert([{
          ...formData,
          project_id: projectId,
          organization_id: organization?.id
        }]);

      if (error) throw error;
      showToast('تم إضافة المرحلة بنجاح ✅', 'success');
      reset();
      setShowAddForm(false);
      fetchMilestones();
    } catch (error: any) {
      showToast('خطأ في إضافة المرحلة: ' + error.message, 'error');
    }
  };

  const getStatusBadge = (status: Milestone['status']) => {
    switch (status) {
      case 'pending': return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1"><Clock size={12} /> قيد الانتظار</span>;
      case 'in_progress': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> قيد التنفيذ</span>;
      case 'completed': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1"><CheckCircle2 size={12} /> مكتمل</span>;
      case 'delayed': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1"><XCircle size={12} /> متأخر</span>;
      default: return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">{status}</span>;
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
              <Flag className="text-orange-600" />
              المراحل الزمنية للمشروع: {projectName}
            </h1>
            <p className="text-gray-500 mt-1">تتبع التقدم الزمني للمشروع</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white border rounded-lg p-1 flex gap-1 shadow-sm mr-4">
            <button 
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              title="عرض البطاقات"
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('gantt')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'gantt' ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              title="عرض مخطط Gantt"
            >
              <BarChart2 size={18} />
            </button>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-orange-100"
          >
            <Plus size={20} />
            إضافة مرحلة
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
                <Flag className="text-orange-600" size={24} />
                إضافة مرحلة زمنية جديدة
              </h3>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmitAddMilestone)} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">عنوان المرحلة</label>
                <input
                  type="text"
                  {...register('title')}
                  className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  placeholder="مثال: أعمال الحفر والأساسات"
                />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">تاريخ البدء المتوقع</label>
                  <input
                    type="date"
                    {...register('expected_start_date')}
                    className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                  {errors.expected_start_date && <p className="text-red-500 text-xs mt-1">{errors.expected_start_date.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">تاريخ الانتهاء المتوقع</label>
                  <input
                    type="date"
                    {...register('expected_end_date')}
                    className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                  {errors.expected_end_date && <p className="text-red-500 text-xs mt-1">{errors.expected_end_date.message}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">نسبة التقدم (%)</label>
                <input
                  type="number"
                  {...register('progress_percentage', { valueAsNumber: true })}
                  className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  min="0" max="100"
                />
                {errors.progress_percentage && <p className="text-red-500 text-xs mt-1">{errors.progress_percentage.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">الحالة</label>
                <select
                  {...register('status')}
                  className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                >
                  <option value="pending">قيد الانتظار</option>
                  <option value="in_progress">قيد التنفيذ</option>
                  <option value="completed">مكتمل</option>
                  <option value="delayed">متأخر</option>
                </select>
                {errors.status && <p className="text-red-500 text-xs mt-1">{errors.status.message}</p>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-100 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : <><Plus size={20} /> إضافة المرحلة</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-12 w-12 text-orange-600" />
        </div>
      ) : (
        viewMode === 'gantt' ? (
          <ProjectGanttChart milestones={milestones} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {milestones.map((milestone) => (
              <div key={milestone.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-bold text-gray-800">{milestone.title}</h3>
                {getStatusBadge(milestone.status)}
              </div>
              
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-orange-500" />
                  <span>البدء المتوقع: {milestone.expected_start_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-orange-500" />
                  <span>الانتهاء المتوقع: {milestone.expected_end_date}</span>
                </div>
                {milestone.actual_completion_date && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-500" />
                    <span>الانتهاء الفعلي: {milestone.actual_completion_date}</span>
                  </div>
                )}
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                <div 
                  className="bg-orange-600 h-2.5 rounded-full" 
                  style={{ width: `${milestone.progress_percentage}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 text-left">{milestone.progress_percentage}% إنجاز</p>
            </div>
          ))}

          {milestones.length === 0 && (
            <div className="col-span-full bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-200">
              <Flag size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">لا توجد مراحل زمنية مسجلة لهذا المشروع</p>
              <button onClick={() => setShowAddForm(true)} className="mt-4 text-orange-600 font-medium">أضف أول مرحلة الآن</button>
            </div>
          )}
          </div>
        )
      )}
    </div>
  );
};

export default ProjectMilestonesManager;