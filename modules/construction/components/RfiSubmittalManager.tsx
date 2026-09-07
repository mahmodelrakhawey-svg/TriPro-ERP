import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  FileQuestion, CheckCircle2, Clock, AlertTriangle, XCircle,
  Plus, Search, Filter, FileSpreadsheet, Printer, ArrowRight,
  Eye, Edit3, Trash2, Building2, Send, MessageSquare, Layers,
  FileCheck2, Compass, AlertCircle, FileText, ChevronRight, X
} from 'lucide-react';

interface RfiItem {
  id: string;
  project_id: string;
  project_name?: string;
  rfi_number: string;
  subject: string;
  discipline: string;
  specification_reference?: string;
  drawing_reference?: string;
  cost_impact: boolean;
  cost_impact_amount?: number;
  schedule_impact: boolean;
  schedule_impact_days?: number;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  question_description: string;
  proposed_solution?: string;
  requested_by: string;
  required_response_date?: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'ANSWERED' | 'CLOSED';
  official_reply?: string;
  replied_by?: string;
  reply_date?: string;
  created_at: string;
}

interface SubmittalItem {
  id: string;
  project_id: string;
  project_name?: string;
  submittal_number: string;
  submittal_type: 'MATERIAL' | 'SHOP_DRAWING' | 'METHOD_STATEMENT' | 'PREQUALIFICATION';
  title: string;
  discipline: string;
  boq_item_reference?: string;
  manufacturer_or_supplier?: string;
  submission_date: string;
  required_approval_date?: string;
  review_status: 'UNDER_REVIEW' | 'APPROVED_A' | 'APPROVED_WITH_COMMENTS_B' | 'REVISE_AND_RESUBMIT_C' | 'REJECTED_D';
  consultant_comments?: string;
  reviewed_by?: string;
  review_date?: string;
  revision_number: number;
  created_at: string;
}

export default function RfiSubmittalManager() {
  const { organization, currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [projectsList, setProjectsList] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [activeTab, setActiveTab] = useState<'RFIS' | 'SUBMITTALS'>('RFIS');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);

  // Lists
  const [rfis, setRfis] = useState<RfiItem[]>([]);
  const [submittals, setSubmittals] = useState<SubmittalItem[]>([]);

  // Modals
  const [isRfiModalOpen, setIsRfiModalOpen] = useState(false);
  const [isSubmittalModalOpen, setIsSubmittalModalOpen] = useState(false);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [isPrintRfiModalOpen, setIsPrintRfiModalOpen] = useState(false);
  const [isPrintSubmittalModalOpen, setIsPrintSubmittalModalOpen] = useState(false);

  // Active items for view/reply
  const [activeRfi, setActiveRfi] = useState<RfiItem | null>(null);
  const [activeSubmittal, setActiveSubmittal] = useState<SubmittalItem | null>(null);

  // RFI Form
  const [rfiProjectId, setRfiProjectId] = useState('');
  const [rfiNumber, setRfiNumber] = useState('');
  const [rfiSubject, setRfiSubject] = useState('');
  const [rfiDiscipline, setRfiDiscipline] = useState('مدني / إنشائي');
  const [rfiSpecRef, setRfiSpecRef] = useState('');
  const [rfiDrawingRef, setRfiDrawingRef] = useState('');
  const [rfiCostImpact, setRfiCostImpact] = useState(false);
  const [rfiCostAmount, setRfiCostAmount] = useState<number>(0);
  const [rfiScheduleImpact, setRfiScheduleImpact] = useState(false);
  const [rfiScheduleDays, setRfiScheduleDays] = useState<number>(0);
  const [rfiPriority, setRfiPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [rfiQuestion, setRfiQuestion] = useState('');
  const [rfiProposedSolution, setRfiProposedSolution] = useState('');
  const [rfiRequiredDate, setRfiRequiredDate] = useState('');

  // RFI Reply Form
  const [replyText, setReplyText] = useState('');
  const [repliedBy, setRepliedBy] = useState('استشاري المشروع');

  // Submittal Form
  const [subProjectId, setSubProjectId] = useState('');
  const [subNumber, setSubNumber] = useState('');
  const [subType, setSubType] = useState<'MATERIAL' | 'SHOP_DRAWING' | 'METHOD_STATEMENT' | 'PREQUALIFICATION'>('MATERIAL');
  const [subTitle, setSubTitle] = useState('');
  const [subDiscipline, setSubDiscipline] = useState('مدني / إنشائي');
  const [subBoqRef, setSubBoqRef] = useState('');
  const [subSupplier, setSubSupplier] = useState('');
  const [subSubmissionDate, setSubSubmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [subRequiredDate, setSubRequiredDate] = useState('');
  const [subRevision, setSubRevision] = useState<number>(0);
  const [subStatus, setSubStatus] = useState<SubmittalItem['review_status']>('UNDER_REVIEW');
  const [subComments, setSubComments] = useState('');
  const [subReviewedBy, setSubReviewedBy] = useState('');

  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  // Fetch RFIs and Submittals
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);

    try {
      const { data: pData } = await supabase.from('projects').select('id, name').eq('organization_id', orgId);
      const currentProjects = pData || [];
      setProjectsList(currentProjects);

      // 1. Fetch RFIs
      let rfiQuery = supabase.from('project_rfis').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
      if (selectedProjectId !== 'ALL') rfiQuery = rfiQuery.eq('project_id', selectedProjectId);
      const { data: rfiData, error: rfiErr } = await rfiQuery;
      if (rfiErr) {
        console.warn('project_rfis table notice:', rfiErr.message);
        setRfis([]);
      } else {
        setRfis((rfiData || []).map((d: any) => ({
          ...d,
          project_name: currentProjects.find(p => p.id === d.project_id)?.name || 'مشروع عام'
        })));
      }

      // 2. Fetch Submittals
      let subQuery = supabase.from('project_submittals').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
      if (selectedProjectId !== 'ALL') subQuery = subQuery.eq('project_id', selectedProjectId);
      const { data: subData, error: subErr } = await subQuery;
      if (subErr) {
        console.warn('project_submittals table notice:', subErr.message);
        setSubmittals([]);
      } else {
        setSubmittals((subData || []).map((d: any) => ({
          ...d,
          project_name: currentProjects.find(p => p.id === d.project_id)?.name || 'مشروع عام'
        })));
      }

    } catch (err: any) {
      console.error(err);
      setRfis([]);
      setSubmittals([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId, selectedProjectId]);

  // Open New RFI Modal
  const handleOpenNewRfi = () => {
    const nextNum = `RFI-${projectsList[0]?.code || 'PRJ'}-${String(rfis.length + 1).padStart(3, '0')}`;
    setRfiProjectId(projectsList[0]?.id || '');
    setRfiNumber(nextNum);
    setRfiSubject('');
    setRfiDiscipline('مدني / إنشائي');
    setRfiSpecRef('');
    setRfiDrawingRef('');
    setRfiCostImpact(false);
    setRfiCostAmount(0);
    setRfiScheduleImpact(false);
    setRfiScheduleDays(0);
    setRfiPriority('NORMAL');
    setRfiQuestion('');
    setRfiProposedSolution('');
    const targetDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setRfiRequiredDate(targetDate);
    setIsRfiModalOpen(true);
  };

  // Save RFI
  const handleSaveRfi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfiProjectId || !rfiSubject || !rfiQuestion) {
      showToast('يرجى ملء الحقول الإلزامية للطلب', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        project_id: rfiProjectId,
        rfi_number: rfiNumber,
        subject: rfiSubject,
        discipline: rfiDiscipline,
        specification_reference: rfiSpecRef || null,
        drawing_reference: rfiDrawingRef || null,
        cost_impact: rfiCostImpact,
        cost_impact_amount: rfiCostImpact ? rfiCostAmount : 0,
        schedule_impact: rfiScheduleImpact,
        schedule_impact_days: rfiScheduleImpact ? rfiScheduleDays : 0,
        priority: rfiPriority,
        question_description: rfiQuestion,
        proposed_solution: rfiProposedSolution || null,
        requested_by: currentUser?.full_name || 'المكتب الفني للمقاول',
        required_response_date: rfiRequiredDate || null,
        status: 'OPEN'
      };

      const { error } = await supabase.from('project_rfis').insert(payload);
      if (error) throw error;

      showToast('تم إصدار طلب المعلومات الهندسي (RFI) بنجاح 🚀', 'success');
      setIsRfiModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('خطأ في حفظ الـ RFI: ' + err.message, 'error');
    }
  };

  // Submit Official Reply to RFI
  const handleSaveRfiReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRfi || !replyText) return;

    try {
      const { error } = await supabase
        .from('project_rfis')
        .update({
          official_reply: replyText,
          replied_by: repliedBy,
          reply_date: new Date().toISOString().split('T')[0],
          status: 'ANSWERED'
        })
        .eq('id', activeRfi.id);

      if (error) throw error;
      showToast('تم توثيق رد الاستشاري وإغلاق الـ RFI بنجاح ✅', 'success');
      setIsReplyModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('فشل حفظ الرد: ' + err.message, 'error');
    }
  };

  // Open New Submittal Modal
  const handleOpenNewSubmittal = () => {
    const nextNum = `SUB-${subType.substring(0, 3)}-${String(submittals.length + 1).padStart(3, '0')}`;
    setSubProjectId(projectsList[0]?.id || '');
    setSubNumber(nextNum);
    setSubType('MATERIAL');
    setSubTitle('');
    setSubDiscipline('مدني / إنشائي');
    setSubBoqRef('');
    setSubSupplier('');
    setSubSubmissionDate(new Date().toISOString().split('T')[0]);
    const targetDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setSubRequiredDate(targetDate);
    setSubRevision(0);
    setSubStatus('UNDER_REVIEW');
    setSubComments('');
    setSubReviewedBy('استشاري المشروع');
    setIsSubmittalModalOpen(true);
  };

  // Save Submittal
  const handleSaveSubmittal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subProjectId || !subTitle) {
      showToast('يرجى تحديد المشروع وعنوان التقديم', 'warning');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        project_id: subProjectId,
        submittal_number: subNumber,
        submittal_type: subType,
        title: subTitle,
        discipline: subDiscipline,
        boq_item_reference: subBoqRef || null,
        manufacturer_or_supplier: subSupplier || null,
        submission_date: subSubmissionDate,
        required_approval_date: subRequiredDate || null,
        review_status: subStatus,
        consultant_comments: subComments || null,
        reviewed_by: subStatus !== 'UNDER_REVIEW' ? subReviewedBy : null,
        review_date: subStatus !== 'UNDER_REVIEW' ? new Date().toISOString().split('T')[0] : null,
        revision_number: subRevision
      };

      const { error } = await supabase.from('project_submittals').insert(payload);
      if (error) throw error;

      showToast('تم تسجيل التقديم الهندسي بنجاح 📋', 'success');
      setIsSubmittalModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('خطأ في حفظ التقديم: ' + err.message, 'error');
    }
  };

  // Status Badge Helper for Submittals
  const renderSubmittalBadge = (status: SubmittalItem['review_status']) => {
    switch (status) {
      case 'APPROVED_A':
        return <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg text-xs font-black">🟢 Code A - معتمد بالكامل</span>;
      case 'APPROVED_WITH_COMMENTS_B':
        return <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg text-xs font-black">🔵 Code B - معتمد بملاحظات</span>;
      case 'REVISE_AND_RESUBMIT_C':
        return <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg text-xs font-black">🟠 Code C - تعديل وإعادة تقديم</span>;
      case 'REJECTED_D':
        return <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-lg text-xs font-black">🔴 Code D - مرفوض</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold">⏳ قيد مراجعة الاستشاري</span>;
    }
  };

  // Priority Badge Helper for RFIs
  const renderPriorityBadge = (p: RfiItem['priority']) => {
    switch (p) {
      case 'URGENT':
        return <span className="bg-rose-500 text-white px-2 py-0.5 rounded text-[11px] font-black animate-pulse">عاجل جداً</span>;
      case 'HIGH':
        return <span className="bg-amber-500 text-white px-2 py-0.5 rounded text-[11px] font-bold">أولوية عالية</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">عادي</span>;
    }
  };

  // Filtered RFIs
  const filteredRfis = useMemo(() => {
    return rfis.filter(r => {
      const matchSearch = r.rfi_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.project_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rfis, searchTerm, statusFilter]);

  // Filtered Submittals
  const filteredSubmittals = useMemo(() => {
    return submittals.filter(s => {
      const matchSearch = s.submittal_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.manufacturer_or_supplier?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || s.review_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [submittals, searchTerm, statusFilter]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      
      {/* 🏛️ Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-indigo-400/30">
              <Compass size={14} className="text-amber-400" />
              <span>المكتب الفني والاعتمادات الاستشارية (Technical Office Suite)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              طلبات المعلومات الهندسية والاعتمادات (RFIs & Submittals)
            </h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              إدارة طلبات التوضيح الفني (RFI)، وتقديمات اعتماد المواد والعينات، والمخططات التنفيذية وطرق التنفيذ.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'RFIS' ? (
              <button
                onClick={handleOpenNewRfi}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/30"
              >
                <Plus size={18} />
                <span>إصدار RFI جديد</span>
              </button>
            ) : (
              <button
                onClick={handleOpenNewSubmittal}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/30"
              >
                <Plus size={18} />
                <span>تقديم عينة / رسم تنفيذي</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 🗂️ Navigation Tabs & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => { setActiveTab('RFIS'); setStatusFilter('ALL'); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'RFIS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileQuestion size={16} />
            <span>طلبات المعلومات (RFIs) ({rfis.length})</span>
          </button>

          <button
            onClick={() => { setActiveTab('SUBMITTALS'); setStatusFilter('ALL'); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'SUBMITTALS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileCheck2 size={16} />
            <span>تقديمات المواد والرسومات ({submittals.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="بحث بالرقم أو الموضوع..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>

          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            <option value="ALL">🏢 كل المشروعات</option>
            {(projectsList || []).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 📄 TAB 1: RFIs Table */}
      {activeTab === 'RFIS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <FileQuestion size={18} className="text-indigo-600" />
              <span>سجل طلبات المعلومات الهندسية (RFI Log)</span>
            </h2>
            <span className="text-xs font-bold text-slate-500">
              {filteredRfis.length} طلب
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل طلبات الـ RFI...</div>
          ) : filteredRfis.length === 0 ? (
            <div className="p-12 text-center">
              <FileQuestion size={48} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد طلبات RFI مسجلة</h3>
              <p className="text-slate-400 text-sm">اضغط على "إصدار RFI جديد" لإرسال استفسار فني للاستشاري.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">رقم الـ RFI</th>
                    <th className="p-3.5">المشروع</th>
                    <th className="p-3.5">موضوع الاستفسار</th>
                    <th className="p-3.5">التخصص</th>
                    <th className="p-3.5">الأولوية</th>
                    <th className="p-3.5">تأثير التكلفة والزمن</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRfis.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-indigo-700">{r.rfi_number}</td>
                      <td className="p-3.5 font-medium text-slate-700">{r.project_name}</td>
                      <td className="p-3.5 font-bold text-slate-800 max-w-xs truncate">{r.subject}</td>
                      <td className="p-3.5 text-xs text-slate-600 font-bold">{r.discipline}</td>
                      <td className="p-3.5">{renderPriorityBadge(r.priority)}</td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2 text-xs">
                          {r.cost_impact && <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded font-bold">💰 تكلفة</span>}
                          {r.schedule_impact && <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-bold">⏱️ تأخير</span>}
                          {!r.cost_impact && !r.schedule_impact && <span className="text-slate-400">لا يوجد</span>}
                        </div>
                      </td>
                      <td className="p-3.5">
                        {r.status === 'ANSWERED' ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            <CheckCircle2 size={12} />
                            تم الرد
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            <Clock size={12} />
                            بانتظار الاستشاري
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setActiveRfi(r);
                              setReplyText(r.official_reply || '');
                              setIsReplyModalOpen(true);
                            }}
                            title="عرض وتوثيق رد الاستشاري"
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <MessageSquare size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setActiveRfi(r);
                              setIsPrintRfiModalOpen(true);
                            }}
                            title="طباعة نموذج الـ RFI"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 📋 TAB 2: Submittals Table */}
      {activeTab === 'SUBMITTALS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <FileCheck2 size={18} className="text-emerald-600" />
              <span>سجل تقديمات المواد والمخططات التنفيذية (Submittal Log)</span>
            </h2>
            <span className="text-xs font-bold text-slate-500">
              {filteredSubmittals.length} تقديم
            </span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-400 font-bold animate-pulse">جاري تحميل التقديمات...</div>
          ) : filteredSubmittals.length === 0 ? (
            <div className="p-12 text-center">
              <FileCheck2 size={48} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-slate-700 font-bold text-lg mb-1">لا توجد تقديمات مسجلة</h3>
              <p className="text-slate-400 text-sm">اضغط على "تقديم عينة / رسم تنفيذي" لتوثيق عينة مواد أو مخطط تنفيذي.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">رقم التقديم</th>
                    <th className="p-3.5">النوع والتخصص</th>
                    <th className="p-3.5">عنوان البند / المادة</th>
                    <th className="p-3.5">المصنع / المورد</th>
                    <th className="p-3.5">تاريخ التقديم</th>
                    <th className="p-3.5">المراجعة (Rev)</th>
                    <th className="p-3.5">حالة اعتماد الاستشاري</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSubmittals.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-emerald-700">{s.submittal_number}</td>
                      <td className="p-3.5">
                        <span className="text-xs font-bold text-slate-700 block">
                          {s.submittal_type === 'MATERIAL' ? '📦 عينة مادة' : s.submittal_type === 'SHOP_DRAWING' ? '📐 رسم تنفيذي' : '📑 طريقة تنفيذ'}
                        </span>
                        <span className="text-[11px] text-slate-400">{s.discipline}</span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-800">{s.title}</td>
                      <td className="p-3.5 text-slate-600 font-medium">{s.manufacturer_or_supplier || '---'}</td>
                      <td className="p-3.5 text-slate-600">{s.submission_date}</td>
                      <td className="p-3.5">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold text-xs">
                          Rev {s.revision_number}
                        </span>
                      </td>
                      <td className="p-3.5">{renderSubmittalBadge(s.review_status)}</td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setActiveSubmittal(s);
                              setIsPrintSubmittalModalOpen(true);
                            }}
                            title="طباعة نموذج التقديم"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 📝 New RFI Modal */}
      {isRfiModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveRfi} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-lg">
                  <FileQuestion className="text-indigo-600" size={24} />
                  <span>إصدار طلب توضيح ومعلومات هندسي (Request For Information)</span>
                </div>
                <button type="button" onClick={() => setIsRfiModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المشروع *</label>
                  <select
                    value={rfiProjectId}
                    onChange={(e) => setRfiProjectId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="">-- اختر المشروع --</option>
                    {(projectsList || []).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الـ RFI *</label>
                  <input
                    type="text"
                    value={rfiNumber}
                    onChange={(e) => setRfiNumber(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">موضوع الاستفسار الهندسي *</label>
                  <input
                    type="text"
                    value={rfiSubject}
                    onChange={(e) => setRfiSubject(e.target.value)}
                    placeholder="مثال: تعارض مسار ماسورة الصرف مع كمرة السقف المحور B-3"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التخصص الهندسي</label>
                  <select
                    value={rfiDiscipline}
                    onChange={(e) => setRfiDiscipline(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="مدني / إنشائي">مدني / إنشائي</option>
                    <option value="معماري">معماري</option>
                    <option value="كهروميكانيك MEP">كهروميكانيك MEP</option>
                    <option value="صحي وشبكات">صحي وشبكات</option>
                    <option value="مساحة وموقع عام">مساحة وموقع عام</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الأولوية</label>
                  <select
                    value={rfiPriority}
                    onChange={(e) => setRfiPriority(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="NORMAL">عادي</option>
                    <option value="HIGH">أولوية عالية</option>
                    <option value="URGENT">عاجل جداً (توقف عمل)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مرجع المخطط (Drawing Ref)</label>
                  <input
                    type="text"
                    value={rfiDrawingRef}
                    onChange={(e) => setRfiDrawingRef(e.target.value)}
                    placeholder="مثال: S-104 Rev 2"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الرد المطلوب</label>
                  <input
                    type="date"
                    value={rfiRequiredDate}
                    onChange={(e) => setRfiRequiredDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نص الاستفسار الفني بالتفصيل *</label>
                <textarea
                  rows={4}
                  value={rfiQuestion}
                  onChange={(e) => setRfiQuestion(e.target.value)}
                  placeholder="اشرح المشكلة الهندسية أو التعارض الفني المطلوب توضيحه من الاستشاري..."
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الحل الهندسي المقترح من المقاول (إن وجد)</label>
                <textarea
                  rows={2}
                  value={rfiProposedSolution}
                  onChange={(e) => setRfiProposedSolution(e.target.value)}
                  placeholder="اقتراح المقاول لحل التعارض دون التأثير على السلامة الإنشائية..."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsRfiModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30"
                >
                  إرسال الـ RFI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 💬 RFI Reply Modal */}
      {isReplyModalOpen && activeRfi && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6">
            <form onSubmit={handleSaveRfiReply} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">توثيق رد الاستشاري على الـ RFI</h3>
                  <p className="text-xs text-indigo-600 font-mono font-bold">{activeRfi.rfi_number}: {activeRfi.subject}</p>
                </div>
                <button type="button" onClick={() => setIsReplyModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <p className="font-bold text-slate-700 mb-1">الاستفسار المقدم:</p>
                <p className="text-slate-600">{activeRfi.question_description}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الرد الهندسي الرسمي المعتمد من الاستشاري *</label>
                <textarea
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="أدخل توجيهات ورد استشاري المشروع..."
                  required
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الاستشاري / المهندس المعتمد</label>
                <input
                  type="text"
                  value={repliedBy}
                  onChange={(e) => setRepliedBy(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsReplyModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm"
                >
                  حفظ الرد واعتماد الإغلاق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📦 New Submittal Modal */}
      {isSubmittalModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl p-6 md:p-8 animate-in zoom-in-95">
            <form onSubmit={handleSaveSubmittal} className="space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2 text-emerald-900 font-black text-lg">
                  <FileCheck2 className="text-emerald-600" size={24} />
                  <span>تقديم مادة / رسم تنفيذي للاعتماد (Material & Shop Drawing Submittal)</span>
                </div>
                <button type="button" onClick={() => setIsSubmittalModalOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المشروع *</label>
                  <select
                    value={subProjectId}
                    onChange={(e) => setSubProjectId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="">-- اختر المشروع --</option>
                    {(projectsList || []).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم التقديم (Submittal No.) *</label>
                  <input
                    type="text"
                    value={subNumber}
                    onChange={(e) => setSubNumber(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع التقديم</label>
                  <select
                    value={subType}
                    onChange={(e) => setSubType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="MATERIAL">📦 عينة مادة (Material Sample)</option>
                    <option value="SHOP_DRAWING">📐 رسم تنفيذي (Shop Drawing)</option>
                    <option value="METHOD_STATEMENT">📑 طريقة تنفيذ (Method Statement)</option>
                    <option value="PREQUALIFICATION">🏢 اعتماد مورد / مقاول باطن</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التخصص</label>
                  <select
                    value={subDiscipline}
                    onChange={(e) => setSubDiscipline(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  >
                    <option value="مدني / إنشائي">مدني / إنشائي</option>
                    <option value="معماري وتشطيبات">معماري وتشطيبات</option>
                    <option value="كهروميكانيك MEP">كهروميكانيك MEP</option>
                    <option value="صحي وتغذية">صحي وتغذية</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">عنوان المادة / المخطط المقدم *</label>
                  <input
                    type="text"
                    value={subTitle}
                    onChange={(e) => setSubTitle(e.target.value)}
                    placeholder="مثال: عينة سيراميك كليوباترا 60x60 فرز أول للأرضيات"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المصنع أو المورد المقترح</label>
                  <input
                    type="text"
                    value={subSupplier}
                    onChange={(e) => setSubSupplier(e.target.value)}
                    placeholder="مثال: شركة سيراميكا كليوباترا"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مرجع بند المقايسة (BOQ Ref)</label>
                  <input
                    type="text"
                    value={subBoqRef}
                    onChange={(e) => setSubBoqRef(e.target.value)}
                    placeholder="مثال: بند 4.2 - أعمال التشطيبات"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التقديم</label>
                  <input
                    type="date"
                    value={subSubmissionDate}
                    onChange={(e) => setSubSubmissionDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حالة اعتماد الاستشاري (إن وجدت)</label>
                  <select
                    value={subStatus}
                    onChange={(e) => setSubStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-indigo-700"
                  >
                    <option value="UNDER_REVIEW">⏳ قيد المراجعة</option>
                    <option value="APPROVED_A">🟢 Code A - معتمد بالكامل</option>
                    <option value="APPROVED_WITH_COMMENTS_B">🔵 Code B - معتمد بملاحظات</option>
                    <option value="REVISE_AND_RESUBMIT_C">🟠 Code C - تعديل وإعادة تقديم</option>
                    <option value="REJECTED_D">🔴 Code D - مرفوض</option>
                  </select>
                </div>
              </div>

              {subStatus !== 'UNDER_REVIEW' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات واعتمادات استشاري المشروع</label>
                  <textarea
                    rows={3}
                    value={subComments}
                    onChange={(e) => setSubComments(e.target.value)}
                    placeholder="ملاحظات الاستشاري الفنية..."
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsSubmittalModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/30"
                >
                  حفظ التقديم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🖨️ Printable Transmittal for RFI */}
      {isPrintRfiModalOpen && activeRfi && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8" dir="rtl">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">نموذج طلب معلومات هندسي (RFI)</h2>
                <p className="text-xs text-slate-500 font-mono">Official Request For Information Transmittal</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1">
                  <Printer size={14} />
                  <span>طباعة</span>
                </button>
                <button onClick={() => setIsPrintRfiModalOpen(false)} className="p-2 text-slate-400">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div><span className="text-slate-400 font-bold">رقم الطلب:</span> <span className="font-mono font-bold text-indigo-700">{activeRfi.rfi_number}</span></div>
                <div><span className="text-slate-400 font-bold">المشروع:</span> <span className="font-bold">{activeRfi.project_name}</span></div>
                <div><span className="text-slate-400 font-bold">التخصص:</span> <span>{activeRfi.discipline}</span></div>
                <div><span className="text-slate-400 font-bold">الأولوية:</span> <span className="font-bold">{activeRfi.priority}</span></div>
                <div><span className="text-slate-400 font-bold">مرجع المخطط:</span> <span>{activeRfi.drawing_reference || 'عام'}</span></div>
                <div><span className="text-slate-400 font-bold">تاريخ الطلب:</span> <span>{activeRfi.created_at.split('T')[0]}</span></div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 border-b pb-1 text-xs">الموضوع: {activeRfi.subject}</h4>
                <p className="bg-slate-50 p-3 rounded-lg border text-xs mt-2 text-slate-700">{activeRfi.question_description}</p>
              </div>

              {activeRfi.proposed_solution && (
                <div>
                  <h4 className="font-bold text-slate-800 text-xs mb-1">الحل المقترح من المقاول:</h4>
                  <p className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-xs text-slate-700">{activeRfi.proposed_solution}</p>
                </div>
              )}

              {activeRfi.official_reply && (
                <div>
                  <h4 className="font-bold text-emerald-800 text-xs mb-1">رد استشاري المشروع الرسمي:</h4>
                  <p className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-xs text-emerald-900 font-medium">{activeRfi.official_reply}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-700 mb-6">مهندس المكتب الفني للمقاول</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">التوقيع</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-6">استشاري المشروع المعتمد</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">الختم والاعتماد</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🖨️ Printable Transmittal for Submittal */}
      {isPrintSubmittalModalOpen && activeSubmittal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 md:p-8" dir="rtl">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">خطاب تقديم واعتماد استشاري (Transmittal)</h2>
                <p className="text-xs text-slate-500 font-mono">Engineering Submittal & Approval Form</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1">
                  <Printer size={14} />
                  <span>طباعة</span>
                </button>
                <button onClick={() => setIsPrintSubmittalModalOpen(false)} className="p-2 text-slate-400">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div><span className="text-slate-400 font-bold">رقم التقديم:</span> <span className="font-mono font-bold text-emerald-700">{activeSubmittal.submittal_number}</span></div>
                <div><span className="text-slate-400 font-bold">المشروع:</span> <span className="font-bold">{activeSubmittal.project_name}</span></div>
                <div><span className="text-slate-400 font-bold">نوع التقديم:</span> <span>{activeSubmittal.submittal_type}</span></div>
                <div><span className="text-slate-400 font-bold">المراجعة:</span> <span className="font-bold font-mono">Rev {activeSubmittal.revision_number}</span></div>
                <div><span className="text-slate-400 font-bold">المصنع / المورد:</span> <span>{activeSubmittal.manufacturer_or_supplier || '---'}</span></div>
                <div><span className="text-slate-400 font-bold">تاريخ التقديم:</span> <span>{activeSubmittal.submission_date}</span></div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 border-b pb-1 text-xs">عنوان المادة / المخطط: {activeSubmittal.title}</h4>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-xs font-bold text-slate-700 mb-2">قرار واعتماد استشاري المشروع:</p>
                <div className="mb-2">{renderSubmittalBadge(activeSubmittal.review_status)}</div>
                {activeSubmittal.consultant_comments && (
                  <p className="text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-200 mt-2">
                    {activeSubmittal.consultant_comments}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-700 mb-6">مهندس المقاول العام</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">التوقيع</p>
                </div>
                <div>
                  <p className="font-bold text-slate-700 mb-6">استشاري المشروع المشرف</p>
                  <p className="border-t border-slate-300 pt-1 text-slate-400">الختم والاعتماد</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
