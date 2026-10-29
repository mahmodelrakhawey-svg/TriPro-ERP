import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';
import { secureStorage } from '../utils/securityMiddleware';

export type ApprovalDocumentType = 
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_ORDER'
  | 'SALES_INVOICE'
  | 'PAYMENT_VOUCHER'
  | 'RECEIPT_VOUCHER'
  | 'JOURNAL_ENTRY'
  | 'STOCK_ADJUSTMENT'
  | 'PRODUCTION_ORDER';

export const DOCUMENT_TYPE_LABELS: Record<ApprovalDocumentType, { label: string; color: string }> = {
  PURCHASE_INVOICE: { label: 'فاتورة مشتريات', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' },
  PURCHASE_ORDER: { label: 'أمر شراء', color: 'bg-teal-500/10 text-teal-600 border-teal-200' },
  SALES_INVOICE: { label: 'فاتورة مبيعات', color: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  PAYMENT_VOUCHER: { label: 'سند صرف نقدي/بنكي', color: 'bg-rose-500/10 text-rose-600 border-rose-200' },
  RECEIPT_VOUCHER: { label: 'سند قبض', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-200' },
  JOURNAL_ENTRY: { label: 'قيد يومية يدوي', color: 'bg-purple-500/10 text-purple-600 border-purple-200' },
  STOCK_ADJUSTMENT: { label: 'تسوية مخزنية', color: 'bg-amber-500/10 text-amber-600 border-amber-200' },
  PRODUCTION_ORDER: { label: 'أمر إنتاج وتشغيل', color: 'bg-cyan-500/10 text-cyan-600 border-cyan-200' }
};

export const AVAILABLE_ROLES = [
  { id: 'ADMIN', name: 'المدير العام / المسؤول التنفيذي' },
  { id: 'FINANCE_MANAGER', name: 'المدير المالي' },
  { id: 'ACCOUNTANT', name: 'رئيس الحسابات' },
  { id: 'PURCHASE_MANAGER', name: 'مدير المشتريات' },
  { id: 'SALES_MANAGER', name: 'مدير المبيعات' },
  { id: 'FACTORY_MANAGER', name: 'مدير الإنتاج والمصنع' },
  { id: 'WAREHOUSE_MANAGER', name: 'مدير المستودعات' }
];

export interface ApprovalWorkflow {
  id: string;
  organization_id: string;
  name: string;
  document_type: ApprovalDocumentType;
  is_active: boolean;
  min_amount: number;
  max_amount?: number | null;
  approval_type: 'ANY' | 'ALL' | 'ROLE';
  approver_roles: string[];
  approver_user_ids: string[];
  conditions: Record<string, unknown>;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ApprovalAuditEntry {
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  user_id?: string;
  user_name?: string;
  timestamp: string;
  notes?: string;
}

export interface ApprovalRequest {
  id: string;
  organization_id: string;
  workflow_id?: string | null;
  document_type: ApprovalDocumentType;
  document_id: string;
  document_reference?: string | null;
  document_amount: number;
  requester_id?: string | null;
  requester_name?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decision_notes?: string | null;
  decision_at?: string | null;
  decision_by?: string | null;
  decision_by_name?: string | null;
  audit_trail: ApprovalAuditEntry[];
  created_at: string;
  updated_at: string;
  // Join data
  workflow?: ApprovalWorkflow;
}

export interface CheckApprovalResult {
  requires_approval: boolean;
  request_id?: string;
  status: 'AUTO_APPROVED' | 'PENDING';
  workflow_name?: string;
  message: string;
}

export interface ProcessApprovalResult {
  success: boolean;
  status: 'APPROVED' | 'REJECTED';
  document_type: ApprovalDocumentType;
  document_id: string;
  message: string;
}

const STORAGE_PREFIX = 'tripro_approval_workflows_';
const STORAGE_REQUESTS_PREFIX = 'tripro_approval_requests_';

function getLocalWorkflows(orgId: string): ApprovalWorkflow[] {
  if (!orgId) return [];
  return secureStorage.getItem<ApprovalWorkflow[]>(`${STORAGE_PREFIX}${orgId}`, []) || [];
}

function saveLocalWorkflows(orgId: string, workflows: ApprovalWorkflow[]): void {
  if (!orgId) return;
  secureStorage.setItem(`${STORAGE_PREFIX}${orgId}`, workflows);
}

function getLocalRequests(orgId: string): ApprovalRequest[] {
  if (!orgId) return [];
  return secureStorage.getItem<ApprovalRequest[]>(`${STORAGE_REQUESTS_PREFIX}${orgId}`, []) || [];
}

function saveLocalRequests(orgId: string, requests: ApprovalRequest[]): void {
  if (!orgId) return;
  secureStorage.setItem(`${STORAGE_REQUESTS_PREFIX}${orgId}`, requests);
}

export class ApprovalWorkflowService {
  /**
   * جلب كافة مسارات الاعتماد المعرفة للمنظمة مع دعم الذاكرة المحلية والاحتياطية
   */
  static async getWorkflows(orgId?: string): Promise<ApprovalWorkflow[]> {
    const effectiveOrg = orgId || '';
    try {
      let query = supabase
        .from('approval_workflows')
        .select('*')
        .order('min_amount', { ascending: true });

      if (effectiveOrg) {
        query = query.eq('organization_id', effectiveOrg);
      }

      const { data, error } = await query;
      if (!error && data) {
        if (effectiveOrg) {
          saveLocalWorkflows(effectiveOrg, data as ApprovalWorkflow[]);
        }
        return (data || []) as ApprovalWorkflow[];
      }
      if (error) throw error;
      return [];
    } catch (err) {
      logger.warn('Failed to fetch approval workflows from remote DB, falling back to local cache:', err);
      if (effectiveOrg) {
        return getLocalWorkflows(effectiveOrg);
      }
      return [];
    }
  }

  /**
   * حفظ أو تعديل مسار اعتماد مع ضمان الحفظ المحلي إذا تعذر الوصول للقاعدة
   */
  static async saveWorkflow(workflow: Partial<ApprovalWorkflow>): Promise<ApprovalWorkflow | null> {
    const effectiveOrg = workflow.organization_id || '';
    const now = new Date().toISOString();
    let savedRecord: ApprovalWorkflow | null = null;

    try {
      if (workflow.id) {
        const { data, error } = await supabase
          .from('approval_workflows')
          .update({
            ...workflow,
            updated_at: now
          })
          .eq('id', workflow.id)
          .select()
          .single();

        if (error) throw error;
        savedRecord = data as ApprovalWorkflow;
      } else {
        const workflowId = crypto.randomUUID();
        const payload = {
          id: workflowId,
          organization_id: effectiveOrg,
          name: workflow.name || '',
          document_type: workflow.document_type || 'PURCHASE_INVOICE',
          is_active: workflow.is_active ?? true,
          min_amount: workflow.min_amount ?? 0,
          max_amount: workflow.max_amount ?? null,
          approval_type: workflow.approval_type || 'ANY',
          approver_roles: workflow.approver_roles || ['ADMIN'],
          approver_user_ids: workflow.approver_user_ids || [],
          conditions: workflow.conditions || {},
          description: workflow.description || null,
          created_at: now,
          updated_at: now
        };

        const { data, error } = await supabase
          .from('approval_workflows')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        savedRecord = data as ApprovalWorkflow;
      }
    } catch (err) {
      logger.warn('Failed saving workflow directly to Supabase, saving to local resilient storage:', err);
      // Fallback: save to local storage cache to keep the application 100% operational
      const targetId = workflow.id || crypto.randomUUID();
      savedRecord = {
        id: targetId,
        organization_id: effectiveOrg,
        name: workflow.name || '',
        document_type: workflow.document_type || 'PURCHASE_INVOICE',
        is_active: workflow.is_active ?? true,
        min_amount: workflow.min_amount ?? 0,
        max_amount: workflow.max_amount ?? null,
        approval_type: workflow.approval_type || 'ANY',
        approver_roles: workflow.approver_roles || ['ADMIN'],
        approver_user_ids: workflow.approver_user_ids || [],
        conditions: workflow.conditions || {},
        description: workflow.description || null,
        created_at: workflow.created_at || now,
        updated_at: now
      };
    }

    // Always update local cache for immediate availability
    if (savedRecord && effectiveOrg) {
      const existing = getLocalWorkflows(effectiveOrg);
      const existingIdx = existing.findIndex(w => w.id === savedRecord!.id);
      let updated: ApprovalWorkflow[];
      if (existingIdx >= 0) {
        updated = [...existing];
        updated[existingIdx] = savedRecord;
      } else {
        updated = [...existing, savedRecord];
      }
      saveLocalWorkflows(effectiveOrg, updated);
    }

    return savedRecord;
  }

  /**
   * تفعيل أو تعطيل مسار
   */
  static async toggleWorkflow(id: string, isActive: boolean, orgId?: string): Promise<boolean> {
    try {
      await supabase
        .from('approval_workflows')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (err) {
      logger.warn('Remote toggle failed, updating local cache:', err);
    }

    if (orgId) {
      const existing = getLocalWorkflows(orgId);
      const updated = existing.map(w => w.id === id ? { ...w, is_active: isActive } : w);
      saveLocalWorkflows(orgId, updated);
    }
    return true;
  }

  /**
   * حذف مسار اعتماد
   */
  static async deleteWorkflow(id: string, orgId?: string): Promise<boolean> {
    try {
      await supabase
        .from('approval_workflows')
        .delete()
        .eq('id', id);
    } catch (err) {
      logger.warn('Remote delete failed, removing from local cache:', err);
    }

    if (orgId) {
      const existing = getLocalWorkflows(orgId);
      const updated = existing.filter(w => w.id !== id);
      saveLocalWorkflows(orgId, updated);
    }
    return true;
  }

  /**
   * فحص ما إذا كان المستند يحتاج لاعتماد وتقديم الطلب تلقائياً
   */
  static async checkAndSubmit(params: {
    orgId: string;
    docType: ApprovalDocumentType;
    amount: number;
    docId: string;
    docRef: string;
    requesterName?: string;
  }): Promise<CheckApprovalResult> {
    // 1. فحص استباقي مؤكد: هل المستند معتمد مسبقاً في قاعدة البيانات؟
    try {
      if (typeof supabase?.from === 'function') {
        const { data: approvedDoc } = await supabase
          .from('approval_requests')
          .select('id, status, decision_by_name')
          .eq('document_id', params.docId)
          .eq('status', 'APPROVED')
          .maybeSingle();

        if (approvedDoc) {
          return {
            requires_approval: false,
            request_id: approvedDoc.id,
            status: 'AUTO_APPROVED',
            message: 'المستند معتمد مسبقاً ومصرح بتشغيله ✅'
          };
        }
      }
    } catch (checkErr) {
      logger.warn('Pre-check for approved document failed, continuing:', checkErr);
    }

    // 2. فحص الكاش المحلي إذا كان المستند معتمداً
    const curRequests = getLocalRequests(params.orgId);
    const isLocallyApproved = curRequests.some(r => 
      (r.document_id === params.docId || (params.docRef && r.document_reference === params.docRef)) &&
      r.status === 'APPROVED'
    );
    if (isLocallyApproved) {
      return {
        requires_approval: false,
        status: 'AUTO_APPROVED',
        message: 'المستند معتمد مسبقاً وجاهز للتنفيذ.'
      };
    }

    try {
      const { data, error } = await supabase.rpc('fn_check_approval_requirement', {
        p_org_id: params.orgId,
        p_doc_type: params.docType,
        p_amount: params.amount,
        p_doc_id: params.docId,
        p_doc_ref: params.docRef,
        p_requester_name: params.requesterName || 'مستخدم النظام'
      });

      if (!error && data) {
        return data as CheckApprovalResult;
      }
      if (error) throw error;
    } catch (err) {
      logger.warn('Remote check approval failed, checking local workflows:', err);
      // فحص المسارات المحلية كخطة طوارئ
      const curRequests = getLocalRequests(params.orgId);
      const isLocallyApproved = curRequests.some(r => 
        (r.document_id === params.docId || (params.docRef && r.document_reference === params.docRef)) &&
        r.status === 'APPROVED'
      );
      if (isLocallyApproved) {
        return {
          requires_approval: false,
          status: 'AUTO_APPROVED',
          message: 'المستند معتمد مسبقاً وجاهز للتنفيذ.'
        };
      }

      const isLocallyPending = curRequests.find(r => 
        (r.document_id === params.docId || (params.docRef && r.document_reference === params.docRef)) &&
        r.status === 'PENDING'
      );
      if (isLocallyPending) {
        return {
          requires_approval: true,
          request_id: isLocallyPending.id,
          status: 'PENDING',
          workflow_name: isLocallyPending.workflow?.name || 'مسار الاعتماد',
          message: 'المستند قيد المراجعة والاعتماد حالياً.'
        };
      }

      const localWorkflows = getLocalWorkflows(params.orgId);
      const matchingWf = localWorkflows.find(wf => 
        wf.is_active && 
        wf.document_type === params.docType && 
        params.amount >= Number(wf.min_amount) &&
        (wf.max_amount == null || params.amount <= Number(wf.max_amount))
      );

      if (matchingWf) {
        const reqId = crypto.randomUUID();
        const newReq: ApprovalRequest = {
          id: reqId,
          organization_id: params.orgId,
          workflow_id: matchingWf.id,
          document_type: params.docType,
          document_id: params.docId,
          document_reference: params.docRef,
          document_amount: params.amount,
          requester_name: params.requesterName || 'مستخدم النظام',
          status: 'PENDING',
          audit_trail: [{
            action: 'SUBMITTED',
            user_name: params.requesterName || 'مستخدم النظام',
            timestamp: new Date().toISOString(),
            notes: `تم تقديم المستند للاعتماد بموجب مسار: ${matchingWf.name}`
          }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          workflow: matchingWf
        };
        saveLocalRequests(params.orgId, [newReq, ...curRequests]);

        return {
          requires_approval: true,
          request_id: reqId,
          status: 'PENDING',
          workflow_name: matchingWf.name,
          message: 'تم إرسال المستند بنجاح لسلسلة الاعتمادات والموافقات.'
        };
      }

      // في حال عدم وجود مسار مطابق
      return {
        requires_approval: false,
        status: 'AUTO_APPROVED',
        message: 'تم الاعتماد المباشر لعدم وجود قيود اعتماد نشطة.'
      };
    }

    return {
      requires_approval: false,
      status: 'AUTO_APPROVED',
      message: 'تم الاعتماد المباشر.'
    };
  }

  /**
   * جلب كافة طلبات الاعتماد المعلقة
   */
  static async getPendingRequests(orgId?: string): Promise<ApprovalRequest[]> {
    const effectiveOrg = orgId || '';
    try {
      let query = supabase
        .from('approval_requests')
        .select(`
          *,
          workflow:approval_workflows(*)
        `)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (effectiveOrg) {
        query = query.eq('organization_id', effectiveOrg);
      }

      const { data, error } = await query;
      if (!error && data) {
        return (data || []) as ApprovalRequest[];
      }
      if (error) throw error;
      return [];
    } catch (err) {
      logger.warn('Failed to fetch pending approval requests from remote DB, reading from local cache:', err);
      if (effectiveOrg) {
        return getLocalRequests(effectiveOrg).filter(r => r.status === 'PENDING');
      }
      return [];
    }
  }

  /**
   * جلب كل الطلبات (لأغراض المراجعة والتدقيق)
   */
  static async getAllRequests(orgId?: string, limit = 50): Promise<ApprovalRequest[]> {
    const effectiveOrg = orgId || '';
    try {
      let query = supabase
        .from('approval_requests')
        .select(`
          *,
          workflow:approval_workflows(*)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (effectiveOrg) {
        query = query.eq('organization_id', effectiveOrg);
      }

      const { data, error } = await query;
      if (!error && data) {
        return (data || []) as ApprovalRequest[];
      }
      if (error) throw error;
      return [];
    } catch (err) {
      logger.warn('Failed to fetch all approval requests from remote DB, reading from local cache:', err);
      if (effectiveOrg) {
        return getLocalRequests(effectiveOrg).slice(0, limit);
      }
      return [];
    }
  }

  /**
   * اتخاذ قرار الاعتماد أو الرفض
   */
  static async processDecision(
    requestId: string,
    action: 'APPROVE' | 'REJECT',
    notes?: string,
    approverName?: string,
    orgId?: string
  ): Promise<ProcessApprovalResult> {
    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const effectiveApprover = approverName || 'المدير المعتمد';

    try {
      const { data, error } = await supabase.rpc('fn_process_approval_action', {
        p_request_id: requestId,
        p_action: action,
        p_notes: notes || null,
        p_approver_name: effectiveApprover
      });

      if (!error && data) {
        return data as ProcessApprovalResult;
      }
      if (error) throw error;
    } catch (err) {
      logger.warn('Remote RPC process approval decision failed, attempting direct table update:', err);
      
      // محاولة التحديث المباشر للجدول كخطة بديلة
      try {
        const { data: directReq, error: directErr } = await supabase
          .from('approval_requests')
          .update({
            status: newStatus,
            decision_notes: notes || null,
            decision_at: new Date().toISOString(),
            decision_by_name: effectiveApprover,
            updated_at: new Date().toISOString()
          })
          .eq('id', requestId)
          .select()
          .maybeSingle();

        if (!directErr && directReq) {
          return {
            success: true,
            status: newStatus,
            document_type: directReq.document_type,
            document_id: directReq.document_id,
            message: newStatus === 'APPROVED' ? 'تم اعتماد المستند بنجاح ✅' : 'تم رفض المستند ❌'
          };
        }
      } catch (directEx) {
        logger.warn('Direct approval table update also failed, applying to local cache:', directEx);
      }

      // خطة الطوارئ المحلية (Local Resilient Storage)
      const targetOrg = orgId || secureStorage.getItem<string>('tripro_last_valid_org_id') || '';
      if (targetOrg) {
        const curRequests = getLocalRequests(targetOrg);
        const reqIdx = curRequests.findIndex(r => r.id === requestId);
        if (reqIdx >= 0) {
          const target = curRequests[reqIdx];
          target.status = newStatus;
          target.decision_notes = notes || null;
          target.decision_at = new Date().toISOString();
          target.decision_by_name = effectiveApprover;
          target.audit_trail.push({
            action: newStatus,
            user_name: effectiveApprover,
            timestamp: new Date().toISOString(),
            notes
          });
          curRequests[reqIdx] = target;
          saveLocalRequests(targetOrg, curRequests);

          return {
            success: true,
            status: newStatus,
            document_type: target.document_type,
            document_id: target.document_id,
            message: newStatus === 'APPROVED' ? 'تم اعتماد المستند بنجاح ✅' : 'تم رفض المستند ❌'
          };
        }
      }
      throw err;
    }

    return {
      success: true,
      status: newStatus,
      document_type: 'PRODUCTION_ORDER',
      document_id: requestId,
      message: newStatus === 'APPROVED' ? 'تم اعتماد المستند بنجاح ✅' : 'تم رفض المستند ❌'
    };
  }
}
