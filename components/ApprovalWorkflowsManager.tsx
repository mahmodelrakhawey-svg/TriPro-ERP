import React, { useState, useEffect, useCallback } from 'react';
import { 
  GitCommit, CheckCircle2, XCircle, AlertCircle, Clock, 
  Plus, Trash2, Edit3, ShieldAlert, ArrowLeftRight, FileText, 
  DollarSign, RefreshCw, Layers
} from 'lucide-react';
import { 
  ApprovalWorkflowService, 
  ApprovalWorkflow, 
  ApprovalRequest, 
  ApprovalDocumentType,
  DOCUMENT_TYPE_LABELS,
  AVAILABLE_ROLES
} from '../services/approvalWorkflowService';
import { useAuth } from '../context/AuthContext';
import { useAccounting } from '../context/AccountingContext';
import { useToastNotification } from '../utils/toastUtils';
import { getActiveOrgIdSync, resolveActiveOrgId, isValidUUID } from '../services/tenantContext';
import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';

export const ApprovalWorkflowsManager: React.FC = () => {
  const { currentUser } = useAuth();
  const { currentSelectedOrgId, organization } = useAccounting();
  const toast = useToastNotification();

  const getEffectiveOrg = useCallback((): string => {
    if (isValidUUID(currentSelectedOrgId)) return currentSelectedOrgId;
    if (isValidUUID((currentUser as any)?.organization_id)) return (currentUser as any).organization_id;
    if (isValidUUID((currentUser as any)?.user_metadata?.org_id)) return (currentUser as any).user_metadata.org_id;
    if (isValidUUID(organization?.id)) return organization.id;
    const syncOrg = getActiveOrgIdSync(currentSelectedOrgId);
    if (isValidUUID(syncOrg)) return syncOrg;
    return '';
  }, [currentSelectedOrgId, currentUser, organization?.id]);

  const [activeOrgId, setActiveOrgId] = useState<string>(() => getEffectiveOrg());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingDecision, setIsProcessingDecision] = useState(false);

  const [activeTab, setActiveTab] = useState<'workflows' | 'pending' | 'history'>('workflows');
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ApprovalRequest[]>([]);
  const [allRequests, setAllRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);

  // New/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Partial<ApprovalWorkflow> | null>(null);

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState<{
    isOpen: boolean;
    request: ApprovalRequest | null;
    action: 'APPROVE' | 'REJECT';
    notes: string;
  }>({
    isOpen: false,
    request: null,
    action: 'APPROVE',
    notes: ''
  });

  useEffect(() => {
    const org = getEffectiveOrg();
    if (org && org !== activeOrgId) {
      setActiveOrgId(org);
    } else if (!activeOrgId) {
      resolveActiveOrgId(currentSelectedOrgId).then(resolved => {
        if (resolved) setActiveOrgId(resolved);
      });
    }
  }, [getEffectiveOrg, currentSelectedOrgId, activeOrgId]);

  const loadData = useCallback(async () => {
    const orgId = activeOrgId || getEffectiveOrg();
    if (!orgId) return;
    setLoading(true);
    try {
      const [wfs, pending, all] = await Promise.all([
        ApprovalWorkflowService.getWorkflows(orgId),
        ApprovalWorkflowService.getPendingRequests(orgId),
        ApprovalWorkflowService.getAllRequests(orgId, 50)
      ]);
      setWorkflows(wfs);
      setPendingRequests(pending);
      setAllRequests(all);
    } catch (err: unknown) {
      logger.error('Failed to load approval workflows:', err);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, getEffectiveOrg]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenNew = () => {
    const orgId = activeOrgId || getEffectiveOrg() || '';
    setEditingWorkflow({
      organization_id: orgId,
      name: '',
      document_type: 'PURCHASE_INVOICE',
      is_active: true,
      min_amount: 10000,
      max_amount: null,
      approval_type: 'ANY',
      approver_roles: ['FINANCE_MANAGER', 'ADMIN'],
      approver_user_ids: [],
      conditions: {}
    });
    setIsModalOpen(true);
  };

  const handleSaveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkflow) return;

    if (!editingWorkflow.name?.trim()) {
      toast.error('يرجى كتابة اسم المسار الوصفي');
      return;
    }

    if (!editingWorkflow.approver_roles || editingWorkflow.approver_roles.length === 0) {
      toast.error('يرجى اختيار دور وظيفي واحد على الأقل مخول بالاعتماد');
      return;
    }

    let targetOrgId = editingWorkflow.organization_id || activeOrgId || getEffectiveOrg();
    if (!targetOrgId) {
      targetOrgId = (await resolveActiveOrgId(currentSelectedOrgId)) || '';
    }

    if (!targetOrgId) {
      toast.error('تعذر تحديد هوية المؤسسة النشطة، يرجى اختيار المؤسسة من القائمة العلوية');
      return;
    }

    setIsSubmitting(true);
    try {
      const saved = await ApprovalWorkflowService.saveWorkflow({
        ...editingWorkflow,
        organization_id: targetOrgId,
        approver_user_ids: editingWorkflow.approver_user_ids || []
      });

      if (saved) {
        toast.success('تم حفظ مسار الاعتماد وتفعيله بنجاح ✅');
        setIsModalOpen(false);
        setEditingWorkflow(null);
        await loadData();
      } else {
        toast.error('تعذر إكمال عملية الحفظ');
      }
    } catch (err: unknown) {
      logger.error('Error saving approval workflow:', err);
      toast.error('حدث خطأ أثناء حفظ المسار: ' + ((err as Error)?.message || 'خطأ غير معروف'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (wf: ApprovalWorkflow) => {
    try {
      const ok = await ApprovalWorkflowService.toggleWorkflow(wf.id, !wf.is_active, activeOrgId || wf.organization_id);
      if (ok) {
        setWorkflows(prev => prev.map(item => item.id === wf.id ? { ...item, is_active: !item.is_active } : item));
        toast.success(wf.is_active ? 'تم تعطيل المسار' : 'تم تفعيل المسار بنجاح');
      }
    } catch {
      toast.error('تعذر تغيير حالة المسار');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف مسار الاعتماد هذا؟')) return;
    try {
      const ok = await ApprovalWorkflowService.deleteWorkflow(id, activeOrgId);
      if (ok) {
        setWorkflows(prev => prev.filter(w => w.id !== id));
        toast.success('تم حذف المسار بنجاح');
      }
    } catch {
      toast.error('تعذر حذف المسار');
    }
  };

  const handleConfirmDecision = async () => {
    if (!decisionModal.request || isProcessingDecision) return;
    setIsProcessingDecision(true);
    try {
      const res = await ApprovalWorkflowService.processDecision(
        decisionModal.request.id,
        decisionModal.action,
        decisionModal.notes,
        currentUser?.name || (currentUser as any)?.email || 'المدير المعتمد',
        activeOrgId || decisionModal.request.organization_id
      );

      // إذا كان الإجراء رفضاً لأمر تشغيل، نقوم بتحديث حالة أمر التشغيل إلى ملغي
      if (decisionModal.action === 'REJECT' && decisionModal.request.document_type === 'PRODUCTION_ORDER') {
        try {
          await supabase
            .from('mfg_production_orders')
            .update({ 
              status: 'cancelled', 
              notes: `تم رفض أمر التشغيل: ${decisionModal.notes || 'مرفوض من الاعتمادات'}` 
            })
            .eq('id', decisionModal.request.document_id);
        } catch (mfgErr) {
          logger.warn('Failed updating mfg_production_orders to cancelled:', mfgErr);
        }
      }

      toast.success(res.message);
      setDecisionModal({ isOpen: false, request: null, action: 'APPROVE', notes: '' });
      await loadData();
    } catch (err: unknown) {
      logger.error('Failed to process approval decision:', err);
      toast.error('تعذر معالجة القرار: ' + ((err as Error)?.message || 'خطأ في الاتصال'));
    } finally {
      setIsProcessingDecision(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
            <GitCommit className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">
              محرك مسارات وسلسلة الاعتمادات (Approval Workflows)
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              تصميم وتطبيق شروط الموافقة والاعتمادات المالية والتشغيلية المتقدمة للمستندات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-xl transition border border-slate-200"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenNew}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-600/20 transition"
          >
            <Plus className="w-5 h-5" />
            <span>إنشاء مسار اعتماد جديد</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('workflows')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition ${
            activeTab === 'workflows'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>مسارات الاعتماد المحددة ({workflows.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition ${
            activeTab === 'pending'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>الطلبات المعلقة بانتظار الاعتماد</span>
          {pendingRequests.length > 0 && (
            <span className={`px-2 py-0.5 text-xs rounded-full font-black ${
              activeTab === 'pending' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {pendingRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition ${
            activeTab === 'history'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>سجل وتاريخ القرارات ({allRequests.length})</span>
        </button>
      </div>

      {/* Tab 1: Workflows List */}
      {activeTab === 'workflows' && (
        <div className="space-y-4">
          {workflows.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
              <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-700">لا توجد مسارات اعتماد مخصصة حالياً</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mt-1 mb-5">
                تعتمد المستندات حالياً بالصلاحيات القياسية المباشرة. يمكنك إنشاء مسار جديد لتحديد اشتراط موافقة الإدارة على مبالغ معينة.
              </p>
              <button
                onClick={handleOpenNew}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة أول مسار اعتماد</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workflows.map((wf) => {
                const docMeta = DOCUMENT_TYPE_LABELS[wf.document_type] || {
                  label: wf.document_type,
                  color: 'bg-slate-100 text-slate-700 border-slate-200'
                };
                return (
                  <div
                    key={wf.id}
                    className={`bg-white rounded-2xl border p-5 transition hover:shadow-md ${
                      wf.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${docMeta.color}`}>
                            {docMeta.label}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                            wf.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {wf.is_active ? 'نشط' : 'معطل'}
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 mt-2">{wf.name}</h3>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingWorkflow(wf);
                            setIsModalOpen(true);
                          }}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="تعديل المسار"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(wf.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="حذف المسار"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block mb-0.5">شرط التفعيل (المبلغ):</span>
                        <span className="font-bold text-slate-700">
                          أكبر من أو يساوي {wf.min_amount.toLocaleString()} ج.م
                          {wf.max_amount ? ` وحتى ${wf.max_amount.toLocaleString()} ج.م` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">نوع الاعتماد:</span>
                        <span className="font-bold text-slate-700">
                          {wf.approval_type === 'ALL' ? 'إجماع كل المعتمدين' : 'يكفي اعتماد أي معتمد مخول'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {wf.approver_roles?.map((r) => {
                          const roleObj = AVAILABLE_ROLES.find(ar => ar.id === r);
                          return (
                            <span key={r} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] rounded-md font-medium">
                              {roleObj?.name || r}
                            </span>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => handleToggle(wf)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
                          wf.is_active 
                            ? 'text-rose-600 hover:bg-rose-50 border-rose-200' 
                            : 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        {wf.is_active ? 'تعطيل المسار' : 'تفعيل المسار'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Pending Requests */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <h3 className="text-lg font-bold text-slate-700">صندوق الاعتمادات فارغ تماماً</h3>
              <p className="text-sm text-slate-400">لا توجد مستندات معلقة بانتظار الموافقة في الوقت الحالي.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="p-4">نوع المستند</th>
                    <th className="p-4">رقم المستند</th>
                    <th className="p-4">المبلغ</th>
                    <th className="p-4">مقدم الطلب</th>
                    <th className="p-4">المسار المنطبق</th>
                    <th className="p-4">تاريخ الطلب</th>
                    <th className="p-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingRequests.map((req) => {
                    const docMeta = DOCUMENT_TYPE_LABELS[req.document_type] || {
                      label: req.document_type,
                      color: 'bg-slate-100 text-slate-700 border-slate-200'
                    };
                    return (
                      <tr key={req.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-4">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${docMeta.color}`}>
                            {docMeta.label}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-bold text-slate-800">
                          {req.document_reference || req.document_id.slice(0, 8)}
                        </td>
                        <td className="p-4 font-bold text-slate-800">
                          {Number(req.document_amount).toLocaleString()} ج.م
                        </td>
                        <td className="p-4 text-slate-600">
                          {req.requester_name || 'مستخدم النظام'}
                        </td>
                        <td className="p-4 text-slate-600">
                          {req.workflow?.name || 'مسار اعتمادات عام'}
                        </td>
                        <td className="p-4 text-xs text-slate-400">
                          {new Date(req.created_at).toLocaleString('ar-EG')}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setDecisionModal({
                                isOpen: true,
                                request: req,
                                action: 'APPROVE',
                                notes: ''
                              })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm transition"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>اعتماد</span>
                            </button>
                            <button
                              onClick={() => setDecisionModal({
                                isOpen: true,
                                request: req,
                                action: 'REJECT',
                                notes: ''
                              })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-sm transition"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>رفض</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: History */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                <tr>
                  <th className="p-4">نوع المستند</th>
                  <th className="p-4">رقم المستند</th>
                  <th className="p-4">المبلغ</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4">القرار بواسطة</th>
                  <th className="p-4">ملاحظات القرار</th>
                  <th className="p-4">تاريخ القرار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allRequests.map((req) => {
                  const docMeta = DOCUMENT_TYPE_LABELS[req.document_type] || {
                    label: req.document_type,
                    color: 'bg-slate-100 text-slate-700 border-slate-200'
                  };
                  return (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${docMeta.color}`}>
                          {docMeta.label}
                        </span>
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-800">
                        {req.document_reference || req.document_id.slice(0, 8)}
                      </td>
                      <td className="p-4 font-bold text-slate-800">
                        {Number(req.document_amount).toLocaleString()} ج.م
                      </td>
                      <td className="p-4">
                        {req.status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            تم الاعتماد
                          </span>
                        )}
                        {req.status === 'REJECTED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs font-bold border border-rose-200">
                            <XCircle className="w-3 h-3" />
                            تم الرفض
                          </span>
                        )}
                        {req.status === 'PENDING' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold border border-amber-200">
                            <Clock className="w-3 h-3" />
                            معلق
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-slate-700 font-medium">
                        {req.decision_by_name || '-'}
                      </td>
                      <td className="p-4 text-slate-500 text-xs max-w-xs truncate">
                        {req.decision_notes || '-'}
                      </td>
                      <td className="p-4 text-xs text-slate-400">
                        {req.decision_at ? new Date(req.decision_at).toLocaleString('ar-EG') : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create/Edit Workflow */}
      {isModalOpen && editingWorkflow && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                  <GitCommit className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">
                    {editingWorkflow.id ? 'تعديل مسار الاعتماد' : 'إنشاء مسار اعتماد جديد'}
                  </h3>
                  <p className="text-xs text-slate-500">حدد نوع المستند والشروط المالية والمستخدمين المخولين بالاعتماد</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWorkflow} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المسار الوصفي *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: اعتماد فواتير المشتريات التي تتجاوز 15,000 ج.م"
                  value={editingWorkflow.name || ''}
                  onChange={(e) => setEditingWorkflow({ ...editingWorkflow, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع المستند المعني *</label>
                  <select
                    value={editingWorkflow.document_type || 'PURCHASE_INVOICE'}
                    onChange={(e) => setEditingWorkflow({ 
                      ...editingWorkflow, 
                      document_type: e.target.value as ApprovalDocumentType 
                    })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                  >
                    {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحد الأدنى لقيمة المستند (ج.م) *</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={editingWorkflow.min_amount ?? 0}
                      onChange={(e) => setEditingWorkflow({ ...editingWorkflow, min_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm font-bold pl-10"
                    />
                    <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">الأدوار الوظيفية المخولة بالاعتماد *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {AVAILABLE_ROLES.map((role) => {
                    const isChecked = editingWorkflow.approver_roles?.includes(role.id);
                    return (
                      <label key={role.id} className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const current = editingWorkflow.approver_roles || [];
                            const updated = e.target.checked
                              ? [...current, role.id]
                              : current.filter(r => r !== role.id);
                            setEditingWorkflow({ ...editingWorkflow, approver_roles: updated });
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{role.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">تفعيل المسار فوراً</span>
                    <span className="text-[11px] text-slate-500">يبدأ سريان التدقيق التلقائي فور الحفظ</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editingWorkflow.is_active ?? true}
                  onChange={(e) => setEditingWorkflow({ ...editingWorkflow, is_active: e.target.checked })}
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ والتفعيل...</span>
                    </>
                  ) : (
                    <span>حفظ وتفعيل المسار</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Process Decision */}
      {decisionModal.isOpen && decisionModal.request && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className={`p-6 border-b flex items-center justify-between ${
              decisionModal.action === 'APPROVE' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  decisionModal.action === 'APPROVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {decisionModal.action === 'APPROVE' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">
                    {decisionModal.action === 'APPROVE' ? 'تأكيد اعتماد المستند' : 'تأكيد رفض المستند'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    رقم المستند: {decisionModal.request.document_reference || decisionModal.request.document_id.slice(0, 8)} | المبلغ: {Number(decisionModal.request.document_amount).toLocaleString()} ج.م
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDecisionModal({ isOpen: false, request: null, action: 'APPROVE', notes: '' })}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات أو توجيهات القرار (اختياري)
                </label>
                <textarea
                  rows={3}
                  placeholder={decisionModal.action === 'APPROVE' ? 'تمت المراجعة والمطابقة والاعتماد...' : 'سبب الرفض والملاحظات للمستخدم...'}
                  value={decisionModal.notes}
                  onChange={(e) => setDecisionModal({ ...decisionModal, notes: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  disabled={isProcessingDecision}
                  onClick={() => setDecisionModal({ isOpen: false, request: null, action: 'APPROVE', notes: '' })}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition disabled:opacity-50"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  disabled={isProcessingDecision}
                  onClick={handleConfirmDecision}
                  className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50 ${
                    decisionModal.action === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  }`}
                >
                  {isProcessingDecision ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري التنفيذ...</span>
                    </>
                  ) : (
                    <span>{decisionModal.action === 'APPROVE' ? 'تأكيد الاعتماد النهائي ✅' : 'تأكيد الرفض ❌'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalWorkflowsManager;
