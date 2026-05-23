import React, { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { validateData, createSubcontractorSchema } from '../../../utils/validationSchemas';
import { X, Save, Users, Phone, Briefcase } from 'lucide-react';

interface SubcontractorFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

const SubcontractorForm: React.FC<SubcontractorFormProps> = ({ onClose, onSuccess }) => {
  const { organization } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    specialty: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const validation = await validateData(createSubcontractorSchema, formData);
    if (!validation.success) {
      showToast(Object.values(validation.errors || {})[0], 'error');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.from('subcontractors').insert([{
          ...formData,
          organization_id: organization?.id
      }]);

      if (error) throw error;

      showToast('تم إضافة مقاول الباطن بنجاح ✅', 'success');
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
            <Users className="text-purple-600" size={24} />
            إضافة مقاول باطن جديد
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">اسم المقاول</label>
            <input
              type="text"
              required
              className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="مثال: شركة البناء السريع"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
              <Briefcase size={14}/> التخصص
            </label>
            <input
              type="text"
              className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
              value={formData.specialty}
              onChange={e => setFormData({ ...formData, specialty: e.target.value })}
              placeholder="مثال: أعمال الخرسانة، التشطيبات"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-100 disabled:opacity-50"
          >
            {loading ? 'جاري الحفظ...' : <><Save size={20} /> حفظ المقاول</>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SubcontractorForm;