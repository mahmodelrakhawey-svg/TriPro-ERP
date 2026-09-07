import React, { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { validateData, createProjectSchema } from '../../../utils/validationSchemas';
import { X, Save, Building2, User, DollarSign, Calendar } from 'lucide-react';

interface ProjectFormProps {
  project?: any;
  onClose: () => void;
  onSuccess: () => void;
}

const ProjectForm: React.FC<ProjectFormProps> = ({ onClose, onSuccess, project }) => {
  const { organization } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<{id: string, name: string}[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    customerId: '',
    contractValue: project?.contract_value || 0,
    startDate: project?.start_date || new Date().toISOString().split('T')[0],
    status: project?.status || 'planned'
  });

  React.useEffect(() => {
    if (project) {
      setFormData({
        name: project.name,
        description: project.description || '',
        customerId: project.customer_id,
        contractValue: project.contract_value,
        startDate: project.start_date,
        status: project.status
      });
    }
  }, [project]);

  React.useEffect(() => {
    const fetchCustomers = async () => {
      if (!organization?.id) return;
      const { data } = await supabase
        .from('customers')
        .select('id, name')
        .eq('organization_id', organization.id);
      if (data) setCustomers(data);
    };
    fetchCustomers();
  }, [organization?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const validation = await validateData(createProjectSchema, formData);
    if (!validation.success) {
      showToast(Object.values(validation.errors || {})[0], 'error');
      setLoading(false);
      return;
    }

    try {
      if (project?.id) {
        const { error } = await supabase
          .from('projects')
          .update({
            name: formData.name,
            description: formData.description,
            customer_id: formData.customerId,
            contract_value: formData.contractValue,
            start_date: formData.startDate,
            status: formData.status,
          })
          .eq('id', project.id);

        if (error) throw error;
        showToast('تم تحديث بيانات المشروع بنجاح ✅', 'success');
      } else {
        const { error } = await supabase.from('projects').insert([{
          name: formData.name,
          description: formData.description,
          customer_id: formData.customerId,
          contract_value: formData.contractValue,
          start_date: formData.startDate,
          status: formData.status,
          organization_id: organization?.id
        }]);

        if (error) throw error;
        showToast('تم إنشاء المشروع وربطه مالياً بنجاح ✅', 'success');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
            <Building2 className="text-blue-600" size={24} />
            {project ? 'تعديل بيانات المشروع' : 'إضافة مشروع مقاولات جديد'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">اسم المشروع</label>
            <input
              type="text"
              required
              className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="مثال: إنشاء برج الجوهرة السكني"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">العميل</label>
            <select
              required
              className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={formData.customerId}
              onChange={e => setFormData({ ...formData, customerId: e.target.value })}
            >
              <option value="">اختر العميل...</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                <Calendar size={14}/> تاريخ البدء
              </label>
              <input
                type="date"
                className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.startDate}
                onChange={e => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                <DollarSign size={14}/> قيمة العقد
              </label>
              <input
                type="number"
                className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.contractValue}
                onChange={e => setFormData({ ...formData, contractValue: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">حالة المشروع</label>
            <select
              className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="planned">مخطط (Planned)</option>
              <option value="active">نشط (Active)</option>
              <option value="on_hold">متوقف مؤقتاً (On Hold)</option>
              <option value="completed">مكتمل (Completed)</option>
              <option value="cancelled">ملغي (Cancelled)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
          >
            {loading ? 'جاري الحفظ...' : <><Save size={20} /> حفظ المشروع</>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProjectForm;