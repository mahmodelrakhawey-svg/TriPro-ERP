import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { Plus, Users, Phone, Briefcase, ArrowRight, Trash2, Edit, History } from 'lucide-react';
import SubcontractorForm from './SubcontractorForm';

interface Subcontractor {
  id: string;
  name: string;
  phone?: string;
  specialty?: string;
}

interface Props {
  onBack: () => void;
  onViewContracts: (subcontractorId: string) => void;
  onViewStatement: (subcontractorId: string) => void; // 🏗️ جديد: دالة لعرض كشف الحساب
}

const SubcontractorManager: React.FC<Props> = ({ onBack, onViewContracts, onViewStatement }) => {
  const { organization } = useAccounting();
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSubcontractor, setEditingSubcontractor] = useState<Subcontractor | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (organization?.id) fetchSubcontractors();
  }, [organization?.id]);

  const fetchSubcontractors = async () => {
    try {
      const { data, error } = await supabase
        .from('subcontractors')
        .select('*').eq('organization_id', organization?.id)
        .order('name', { ascending: true });

      if (error) throw error;
      setSubcontractors(data || []);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const deleteSubcontractor = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المقاول؟ سيؤدي ذلك لحذف جميع عقوده المرتبطة.')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('subcontractors').delete().eq('id', id);
      if (error) throw error;
      showToast('تم حذف المقاول بنجاح 🗑️', 'success');
      fetchSubcontractors();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-white hover:bg-gray-100 rounded-full transition-colors shadow-sm">
            <ArrowRight size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Users className="text-purple-600" />
              إدارة مقاولي الباطن
            </h1>
            <p className="text-gray-500 mt-1">تتبع مقاولي الباطن وتخصصاتهم</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
        >
          <Plus size={20} />
          مقاول باطن جديد
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subcontractors.map((sub) => (
            <div key={sub.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-bold text-gray-800">{sub.name}</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setEditingSubcontractor(sub)}
                    className="text-gray-300 hover:text-blue-500 transition-colors"
                    title="تعديل بيانات المقاول"
                  >
                    <Edit size={18} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSubcontractor(sub.id);
                    }}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    title="حذف المقاول"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              
              <div className="space-y-2 text-sm text-gray-600">
                {sub.specialty && (
                  <div className="flex items-center gap-2">
                    <Briefcase size={16} className="text-purple-500" />
                    <span>التخصص: {sub.specialty}</span>
                  </div>
                )}
                {sub.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-purple-500" />
                    <span>الهاتف: {sub.phone}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-50 flex justify-end">
                <button
                  onClick={() => onViewContracts(sub.id)}
                  className="bg-purple-50 hover:bg-purple-100 text-purple-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  عرض العقود
                </button>
                <button
                  onClick={() => onViewStatement(sub.id)}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  title="عرض كشف الحساب التفصيلي"
                >
                  <History size={16} className="inline-block ml-1" /> كشف حساب
                </button>
              </div>
            </div>
          ))}

          {subcontractors.length === 0 && (
            <div className="col-span-full bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-200">
              <Users size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">لا يوجد مقاولي باطن مسجلين</p>
              <button onClick={() => setShowForm(true)} className="mt-4 text-purple-600 font-bold hover:underline">أضف أول مقاول باطن للبدء في إدارة العقود</button>
            </div>
          )}
        </div>
      )}

      {(showForm || editingSubcontractor) && (
        <SubcontractorForm 
          subcontractor={editingSubcontractor}
          onClose={() => { setShowForm(false); setEditingSubcontractor(null); }} 
          onSuccess={fetchSubcontractors} 
        />
      )}
    </div>
  );
};

export default SubcontractorManager;