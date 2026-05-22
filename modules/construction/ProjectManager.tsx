import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { Plus, Building2, Calendar, FileText, CheckCircle2, Users, BarChart3, Wallet, Camera, Flag, DollarSign } from 'lucide-react';
import ProjectForm from './ProjectForm';
import BOQManager from './BOQManager';
import BillingManager from './BillingManager';
import SubcontractorManager from './SubcontractorManager';
import SubcontractorContractsManager from './SubcontractorContractsManager';
import SubcontractorBillingManager from './SubcontractorBillingManager';
import ProjectProfitabilityDashboard from './ProjectProfitabilityDashboard';
import SiteRequisitionManager from './SiteRequisitionManager';
import CustodyManager from './CustodyManager';
import ProjectMilestonesManager from './ProjectMilestonesManager';
import RetentionReleaseManager from './RetentionReleaseManager';
import DailyReportForm from '../../services/DailyReportForm';

interface Project {
  id: string;
  name: string;
  contract_value: number;
  status: string;
  start_date: string;
  customer_name?: string;
}

const ProjectManager: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeView, setActiveView] = useState<{
    type: 'boq' | 'billing' | 'subcontractors' | 'sub_contracts' | 'sub_billings' | 'profitability' | 'requisition' | 'custody' | 'daily_reports' | 'milestones' | 'retention_release', 
    id: string 
  } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, customers(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data.map(p => ({ ...p, customer_name: p.customers?.name })));
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (activeView?.type === 'boq') {
    return <BOQManager projectId={activeView.id} onBack={() => setActiveView(null)} />;
  }

  if (activeView?.type === 'billing') {
    return <BillingManager projectId={activeView.id} onBack={() => setActiveView(null)} />;
  }

  if (activeView?.type === 'subcontractors') {
    return <SubcontractorManager 
      onBack={() => setActiveView(null)} 
      onViewContracts={(subId) => setActiveView({ type: 'sub_contracts', id: subId })} 
    />;
  }

  if (activeView?.type === 'sub_contracts') {
    return <SubcontractorContractsManager 
      subcontractorId={activeView.id} 
      onBack={() => setActiveView({ type: 'subcontractors', id: '' })} 
      onViewBillings={(contractId) => setActiveView({ type: 'sub_billings', id: contractId })}
    />;
  }

  if (activeView?.type === 'sub_billings') {
    return <SubcontractorBillingManager 
      contractId={activeView.id} 
      onBack={() => setActiveView({ type: 'subcontractors', id: '' })} 
    />;
  }

  if (activeView?.type === 'profitability') {
    return <ProjectProfitabilityDashboard 
      projectId={activeView.id} 
      onBack={() => setActiveView(null)} 
    />;
  }

  if (activeView?.type === 'custody') {
    return <CustodyManager 
      projectId={activeView.id} 
      onBack={() => setActiveView(null)} 
    />;
  }

  if (activeView?.type === 'requisition') {
    return <SiteRequisitionManager 
      projectId={activeView.id} 
      onBack={() => setActiveView(null)} 
    />;
  }

  if (activeView?.type === 'daily_reports') {
    const project = projects.find(p => p.id === activeView.id);
    return (
      <div className="p-6">
        <DailyReportForm projectId={activeView.id} projectName={project?.name || ''} onSuccess={() => setActiveView(null)} />
      </div>
    );
  }

  if (activeView?.type === 'milestones') {
    const project = projects.find(p => p.id === activeView.id);
    return <ProjectMilestonesManager
      projectId={activeView.id}
      projectName={project?.name || 'المشروع'}
      onBack={() => setActiveView(null)} />;
  }

  if (activeView?.type === 'retention_release') {
    const project = projects.find(p => p.id === activeView.id);
    return <RetentionReleaseManager
      projectId={activeView.id} projectName={project?.name || 'المشروع'} onBack={() => setActiveView(null)} />;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="text-blue-600" />
            إدارة مشاريع المقاولات
          </h1>
          <p className="text-gray-500 mt-1">تتبع حالة المشاريع والمقايسات والمستخلصات</p>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
        >
          <Plus size={20} />
          مشروع جديد
        </button>
        <button 
          onClick={() => setActiveView({ type: 'subcontractors', id: '' })}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
        >
          <Users size={20} />
          مقاولي الباطن
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {project.status === 'active' ? 'نشط' : 'مخطط'}
                </span>
                <h3 className="text-lg font-bold text-gray-800">{project.name}</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center text-sm text-gray-600 gap-2">
                  <Calendar size={16} />
                  <span>تاريخ البدء: {project.start_date || 'غير محدد'}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600 gap-2">
                  <FileText size={16} />
                  <span>قيمة العقد: {project.contract_value.toLocaleString()} ج.م</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-50 flex gap-2">
                <button 
                  onClick={() => setActiveView({ type: 'profitability', id: project.id })}
                  className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                  title="تحليل الربحية"
                >
                  <BarChart3 size={18} />
                </button>
                <button 
                  onClick={() => setActiveView({ type: 'boq', id: project.id })}
                  className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  المقايسة (BOQ)
                </button>
                <button 
                  onClick={() => setActiveView({ type: 'billing', id: project.id })}
                  className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  المستخلصات
                </button>
                <button 
                  onClick={() => setActiveView({ type: 'requisition', id: project.id })}
                  className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-700 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  المواد
                </button>
                {/* New button for Milestones */}
                <button
                  onClick={() => setActiveView({ type: 'milestones', id: project.id })}
                  className="p-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors"
                  title="المراحل الزمنية"
                >
                  <Flag size={18} />
                </button>
                {/* New button for Retention Release */}
                <button
                  onClick={() => setActiveView({ type: 'retention_release', id: project.id })}
                  className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                  title="إدارة محجوزات الضمان"
                ><DollarSign size={18} /></button>
                <button 
                  onClick={() => setActiveView({ type: 'daily_reports', id: project.id })}
                  className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                  title="التقارير اليومية والصور"
                >
                  <Camera size={18} />
                </button>
              </div>
            </div>
          ))}

          {projects.length === 0 && (
            <div className="col-span-full bg-white rounded-xl p-12 text-center border-2 border-dashed border-gray-200">
              <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">لا توجد مشاريع مسجلة حالياً</p>
              <button 
                onClick={() => setShowForm(true)}
                className="mt-4 text-blue-600 font-bold hover:underline"
              >ابدأ بإضافة أول مشروع الآن لفتح لوحة التحكم الكاملة للمشروع</button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <ProjectForm 
          onClose={() => setShowForm(false)} 
          onSuccess={fetchProjects} 
        />
      )}
    </div>
  );
};

export default ProjectManager;