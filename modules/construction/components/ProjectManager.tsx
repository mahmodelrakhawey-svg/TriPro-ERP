import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { Plus, Building2, Calendar, FileText, CheckCircle2, Users, BarChart3, Wallet, Camera, Flag, DollarSign, Edit, Truck, History, Lock, Hammer, Briefcase } from 'lucide-react';
import ProjectForm from './ProjectForm';
import BOQManager from './BOQManager';
import BillingManager from './BillingManager';
import SubcontractorManager from './SubcontractorManager';
import SubcontractorContractsManager from './SubcontractorContractsManager';
import SubcontractorBillingManager from './SubcontractorBillingManager';
import ProjectProfitabilityDashboard from '../reports/ProjectProfitabilityDashboard';
import SiteRequisitionManager from './SiteRequisitionManager';
import CustodyManager from './CustodyManager';
import ProjectMilestonesManager from './ProjectMilestonesManager';
import RetentionReleaseManager from './RetentionReleaseManager';
import ChangeOrderManager from './ChangeOrderManager';
import ProjectComprehensiveReport from './ProjectComprehensiveReport'; // Fixed import path
import EquipmentManager from './EquipmentManager'; // New import
import SubcontractorStatement from './SubcontractorStatement'; // New import
import SiteAssetsCustody from './SiteAssetsCustody'; // 🏗️ استيراد الموديول الجديد
import ProjectClosingForm from './ProjectClosingForm'; // New import
import SiteAttendanceManager from '../../../services/SiteAttendanceManager';
import SiteImageGallery from '../../../services/SiteImageGallery';
import DailyReportForm from '../../../services/DailyReportForm';
import { Link } from 'react-router-dom';

interface Project {
  id: string;
  name: string;
  contract_value: number;
  status: string;
  start_date: string;
  customer_name?: string;
}

const ProjectManager: React.FC = () => {
  const { organization } = useAccounting();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [activeView, setActiveView] = useState<{
    type: 'boq' | 'billing' | 'subcontractors' | 'sub_contracts' | 'sub_billings' | 'profitability' | 'requisition' | 'custody' | 'daily_reports' | 'milestones' | 'retention_release' | 'change_orders' | 'attendance' | 'gallery' | 'equipment' | 'sub_statement' | 'closing' | 'comprehensive_report' | 'tool_custody', 
    id: string
  } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (organization?.id) {
      fetchProjects();
    }
  }, [organization?.id]);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, customers(name)')
        .eq('organization_id', organization?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects((data || []).map(p => ({ ...p, customer_name: p.customers?.name })));
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateProjectStatus = async (projectId: string, newStatus: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('projects')
        .update({ status: newStatus })
        .eq('id', projectId);

      if (error) throw error;
      showToast('تم تحديث حالة المشروع بنجاح ✅', 'success');
      fetchProjects();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (activeView?.type === 'boq') {
    return <BOQManager projectId={activeView.id} onBack={() => setActiveView(null)} />;
  }

  if (activeView?.type === 'equipment') {
    const project = projects.find(p => p.id === activeView.id);
    return <EquipmentManager projectId={activeView.id} projectName={project?.name || ''} onBack={() => setActiveView(null)} />;
  }

  if (activeView?.type === 'tool_custody') {
    const project = projects.find(p => p.id === activeView.id);
    return <SiteAssetsCustody projectId={activeView.id} projectName={project?.name || ''} onBack={() => setActiveView(null)} />;
  }

  if (activeView?.type === 'sub_statement') {
    return <SubcontractorStatement subcontractorId={activeView.id} onBack={() => setActiveView({ type: 'subcontractors', id: '' })} />;
  }

  if (activeView?.type === 'closing') {
    const project = projects.find(p => p.id === activeView.id);
    return <ProjectClosingForm 
      projectId={activeView.id} 
      projectName={project?.name || ''} 
      onBack={() => setActiveView(null)} 
      onSuccess={() => { setActiveView(null); fetchProjects(); }} 
    />;
  }

  if (activeView?.type === 'billing') {
    return <BillingManager projectId={activeView.id} onBack={() => setActiveView(null)} />;
  }

  if (activeView?.type === 'subcontractors') {
    return <SubcontractorManager 
      onBack={() => setActiveView(null)} 
      onViewContracts={(subId) => setActiveView({ type: 'sub_contracts', id: subId })}
      onViewStatement={(subId) => setActiveView({ type: 'sub_statement', id: subId })} // 🏗️ جديد: ربط كشف الحساب
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
    const project = projects.find(p => p.id === activeView.id);
    return <SiteRequisitionManager 
      projectId={activeView.id} 
      projectName={project?.name || ''}
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

  if (activeView?.type === 'change_orders') {
    const project = projects.find(p => p.id === activeView.id);
    return <ChangeOrderManager 
      projectId={activeView.id} 
      projectName={project?.name || ''} 
      onBack={() => setActiveView(null)} />;
  }

  if (activeView?.type === 'attendance') {
    const project = projects.find(p => p.id === activeView.id);
    return <SiteAttendanceManager 
      projectId={activeView.id} 
      projectName={project?.name || ''} 
      onBack={() => setActiveView(null)} />;
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

  if (activeView?.type === 'gallery') {
    const project = projects.find(p => p.id === activeView.id);
    return <SiteImageGallery 
      projectId={activeView.id} 
      projectName={project?.name || ''} 
      onBack={() => setActiveView(null)} />;
  }
  
  if (activeView?.type === 'comprehensive_report') {
    const project = projects.find(p => p.id === activeView.id);
    return <ProjectComprehensiveReport
      projectId={activeView.id}
      projectName={project?.name || 'المشروع'} onBack={() => setActiveView(null)} />;
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  {project.status === 'planned' && (
                    <button 
                      onClick={() => updateProjectStatus(project.id, 'active')}
                      className="p-1 hover:bg-green-100 rounded-lg text-green-600 transition-colors"
                      title="تحويل إلى مشروع نشط"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  )}
                  <button 
                    onClick={() => setEditingProject(project)}
                    className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                    title="تعديل المشروع"
                  >
                    <Edit size={16} />
                  </button>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {project.status === 'active' ? 'نشط' : 'مخطط'}
                  </span>
                </div>
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

              <div className="mt-6 pt-4 border-t border-gray-100 space-y-3">
                {/* الصف الأول: أزرار العمليات الكبرى */}
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setActiveView({ type: 'boq', id: project.id })}
                    className="flex-1 min-w-[120px] bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold shadow-md shadow-blue-100 hover:bg-blue-700 transition-all"
                  >
                    المقايسة (BOQ)
                  </button>
                  <button 
                    onClick={() => setActiveView({ type: 'billing', id: project.id })}
                    className="flex-1 min-w-[120px] bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-bold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all"
                  >
                    المستخلصات
                  </button>
                  <button 
                    onClick={() => setActiveView({ type: 'requisition', id: project.id })}
                    className="flex-1 min-w-[120px] bg-orange-500 text-white py-2.5 rounded-xl text-sm font-bold shadow-md shadow-orange-100 hover:bg-orange-600 transition-all"
                  >
                    صرف المواد
                  </button>
                </div>

                {/* الصف الثاني: أدوات الإدارة والتقارير (أيقونات منظمة) */}
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <Link 
                    to={`/construction/analytics?projectId=${project.id}`}
                    className="p-2.5 bg-white text-indigo-600 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="التحليلات المالية EVM"
                  >
                    <BarChart3 size={20} />
                  </Link>
                  <button 
                    onClick={() => setActiveView({ type: 'change_orders', id: project.id })}
                    className="p-2.5 bg-white text-rose-600 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="أوامر التغيير"
                  >
                    <Plus size={20} />
                  </button>
                  <button 
                    onClick={() => setActiveView({ type: 'attendance', id: project.id })}
                    className="p-2.5 bg-white text-blue-500 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="حضور العمال"
                  >
                    <Users size={20} />
                  </button>
                  <button 
                    onClick={() => setActiveView({ type: 'milestones', id: project.id })}
                    className="p-2.5 bg-white text-orange-600 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="الجدول الزمني"
                  >
                    <Flag size={20} />
                  </button>
                  <button
                    onClick={() => setActiveView({ type: 'equipment', id: project.id })}
                    className="p-2.5 bg-white text-amber-600 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="المعدات"
                  >
                    <Truck size={20} />
                  </button>
                  <button
                    onClick={() => setActiveView({ type: 'tool_custody', id: project.id })}
                    className="p-2.5 bg-white text-slate-700 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="عهدة الأدوات"
                  >
                    <Hammer size={20} />
                  </button>
                  <button 
                    onClick={() => setActiveView({ type: 'subcontractors', id: project.id })}
                    className="p-2.5 bg-white text-purple-600 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="مقاولين الباطن"
                  >
                    <Briefcase size={20} />
                  </button>
                  <button 
                    onClick={() => setActiveView({ type: 'custody', id: project.id })}
                    className="p-2.5 bg-white text-emerald-600 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="العهد المالية"
                  >
                    <Wallet size={20} />
                  </button>
                  <button
                    onClick={() => setActiveView({ type: 'retention_release', id: project.id })}
                    className="p-2.5 bg-white text-green-600 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="المحتجزات"
                  >
                    <DollarSign size={20} />
                  </button>
                  <button 
                    onClick={() => setActiveView({ type: 'daily_reports', id: project.id })}
                    className="p-2.5 bg-white text-slate-400 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="التقارير اليومية"
                  >
                    <Camera size={20} />
                  </button>
                  <button
                    onClick={() => setActiveView({ type: 'comprehensive_report', id: project.id })}
                    className="p-2.5 bg-white text-indigo-500 rounded-xl hover:shadow-sm border border-slate-200 transition-all"
                    title="تقرير PDF شامل"
                  >
                    <FileText size={20} />
                  </button>
                  <button
                    onClick={() => setActiveView({ type: 'closing', id: project.id })}
                    className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all mr-auto"
                    title="إغلاق المشروع"
                  >
                    <Lock size={20} />
                  </button>
                </div>
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

      {(showForm || editingProject) && (
        <ProjectForm 
          project={editingProject}
          onClose={() => { setShowForm(false); setEditingProject(null); }} 
          onSuccess={fetchProjects} 
        />
      )}
    </div>
  );
};

export default ProjectManager;