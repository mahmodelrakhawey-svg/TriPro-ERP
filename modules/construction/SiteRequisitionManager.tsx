import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { ArrowRight, Plus, Package, Truck, CheckCircle, AlertCircle } from 'lucide-react';

interface MaterialIssue {
  id: string;
  issue_number: string;
  issue_date: string;
  status: string;
  warehouse_name?: string;
}

interface Props {
  projectId: string;
  onBack: () => void;
}

const SiteRequisitionManager: React.FC<Props> = ({ projectId, onBack }) => {
  const [issues, setIssues] = useState<MaterialIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    fetchIssues();
  }, [projectId]);

  const fetchIssues = async () => {
    const { data, error } = await supabase
      .from('project_material_issues')
      .select('*, warehouses(name)')
      .eq('project_id', projectId)
      .order('issue_date', { ascending: false });
    
    if (error) showToast(error.message, 'error');
    else setIssues(data.map(d => ({ ...d, warehouse_name: d.warehouses?.name })));
    setLoading(false);
  };

  const approveIssue = async (id: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.rpc('fn_approve_material_issue', { p_issue_id: id });
      if (error) throw error;
      showToast('تم اعتماد صرف المواد وتحميل التكلفة على المشروع بنجاح ✅', 'success');
      fetchIssues();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <ArrowRight size={24} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-800">مخزون الموقع وعهد المواد</h2>
            <p className="text-sm text-gray-500">متابعة المواد المنصرفة من المستودع الرئيسي للموقع</p>
          </div>
        </div>
        <button className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-orange-100">
          <Plus size={20} />
          إذن صرف مواد جديد
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {issues.map((issue) => (
          <div key={issue.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${issue.status === 'approved' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                <Truck size={24} />
              </div>
              <div>
                <h4 className="font-bold text-gray-800">إذن صرف رقم: {issue.issue_number}</h4>
                <p className="text-sm text-gray-500">من مستودع: {issue.warehouse_name} | التاريخ: {issue.issue_date}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {issue.status === 'draft' ? (
                <button 
                  onClick={() => approveIssue(issue.id)}
                  disabled={loading}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all"
                >
                  اعتماد وتحديث المخزن
                </button>
              ) : (
                <div className="flex items-center gap-1 text-green-600 font-bold bg-green-50 px-4 py-2 rounded-lg text-xs">
                  <CheckCircle size={16} /> تم الصرف والترحيل المالي
                </div>
              )}
            </div>
          </div>
        ))}

        {issues.length === 0 && (
          <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-gray-100">
            <Package size={48} className="mx-auto text-gray-200 mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">لا توجد أذونات صرف لهذا المشروع</h3>
            <p className="text-gray-500 max-w-xs mx-auto">
              قم بإنشاء أول إذن صرف لتحميل تكلفة المواد على هذا المشروع وخصمها من المستودع.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SiteRequisitionManager;