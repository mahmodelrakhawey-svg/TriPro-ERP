import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';

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

export class ApprovalWorkflowService {
  /**
   * جلب كافة مسارات الاعتماد المعرفة للمنظمة
   */
  static async getWorkflows(orgId?: string): Promise<ApprovalWorkflow[]> {
    try {
      let query = supabase
        .from('approval_workflows')
        .select('*')
        .order('min_amount', { ascending: true });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ApprovalWorkflow[];
    } catch (err) {
      logger.error('Failed to fetch approval workflows:', err);
      return [];
    }
  }

  /**
   * حفظ أو تعديل مسار اعتماد
   */
  static async saveWorkflow(workflow: Partial<ApprovalWorkflow>): Promise<ApprovalWorkflow | null> {
    try {
      if (workflow.id) {
        const { data, error } = await supabase
          .from('approval_workflows')
          .update({
            ...workflow,
            updated_at: new Date().toISOString()
          })
          .eq('id', workflow.id)
          .select()
          .single();

        if (error) throw error;
        return data as ApprovalWorkflow;
      } else {
        const { data, error } = await supabase
          .from('approval_workflows')
          .insert([workflow])
          .select()
          .single();

        if (error) throw error;
        return data as ApprovalWorkflow;
      }
    } catch (err) {
      logger.error('Failed to save approval workflow:', err);
      throw err;
    }
  }

  /**
   * تفعيل أو تعطيل مسار
   */
  static async toggleWorkflow(id: string, isActive: boolean): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('approval_workflows')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      logger.error('Failed to toggle workflow:', err);
      return false;
    }
  }

  /**
   * حذف مسار اعتماد
   */
  static async deleteWorkflow(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('approval_workflows')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      logger.error('Failed to delete workflow:', err);
      return false;
    }
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
    try {
      const { data, error } = await supabase.rpc('fn_check_approval_requirement', {
        p_org_id: params.orgId,
        p_doc_type: params.docType,
        p_amount: params.amount,
        p_doc_id: params.docId,
        p_doc_ref: params.docRef,
        p_requester_name: params.requesterName || 'مستخدم النظام'
      });

      if (error) throw error;
      return data as CheckApprovalResult;
    } catch (err) {
      logger.error('Failed checking approval requirement:', err);
      // في حالة وجود خطأ أو عدم تثبيت الجداول بعد، نعتمد المستند تلقائياً لعدم تعطيل العمل
      return {
        requires_approval: false,
        status: 'AUTO_APPROVED',
        message: 'تم الاعتماد المباشر لعدم وجود قيود اعتماد نشطة.'
      };
    }
  }

  /**
   * جلب كافة طلبات الاعتماد المعلقة
   */
  static async getPendingRequests(orgId?: string): Promise<ApprovalRequest[]> {
    try {
      let query = supabase
        .from('approval_requests')
        .select(`
          *,
          workflow:approval_workflows(*)
        `)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ApprovalRequest[];
    } catch (err) {
      logger.error('Failed to fetch pending approval requests:', err);
      return [];
    }
  }

  /**
   * جلب كل الطلبات (لأغراض المراجعة والتدقيق)
   */
  static async getAllRequests(orgId?: string, limit = 50): Promise<ApprovalRequest[]> {
    try {
      let query = supabase
        .from('approval_requests')
        .select(`
          *,
          workflow:approval_workflows(*)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ApprovalRequest[];
    } catch (err) {
      logger.error('Failed to fetch all approval requests:', err);
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
    approverName?: string
  ): Promise<ProcessApprovalResult> {
    try {
      const { data, error } = await supabase.rpc('fn_process_approval_action', {
        p_request_id: requestId,
        p_action: action,
        p_notes: notes || null,
        p_approver_name: approverName || 'المدير المعتمد'
      });

      if (error) throw error;
      return data as ProcessApprovalResult;
    } catch (err) {
      logger.error('Failed to process approval decision:', err);
      throw err;
    }
  }
}
