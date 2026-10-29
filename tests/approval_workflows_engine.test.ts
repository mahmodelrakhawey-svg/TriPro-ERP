import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  ApprovalWorkflowService, 
  ApprovalWorkflow, 
  DOCUMENT_TYPE_LABELS, 
  AVAILABLE_ROLES 
} from '../services/approvalWorkflowService';
import { supabase } from '../supabaseClient';

// Mock Supabase
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

describe('🛡️ Dynamic Approval Workflows Engine Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يجب أن تحتوي قائمة الوثائق والأدوار على كافة المستندات والمسؤوليات الأساسية', () => {
    expect(DOCUMENT_TYPE_LABELS.PURCHASE_INVOICE).toBeDefined();
    expect(DOCUMENT_TYPE_LABELS.PURCHASE_ORDER).toBeDefined();
    expect(DOCUMENT_TYPE_LABELS.SALES_INVOICE).toBeDefined();
    expect(DOCUMENT_TYPE_LABELS.PAYMENT_VOUCHER).toBeDefined();
    expect(DOCUMENT_TYPE_LABELS.RECEIPT_VOUCHER).toBeDefined();
    expect(DOCUMENT_TYPE_LABELS.PRODUCTION_ORDER).toBeDefined();

    expect(AVAILABLE_ROLES.some(r => r.id === 'ADMIN')).toBe(true);
    expect(AVAILABLE_ROLES.some(r => r.id === 'FINANCE_MANAGER')).toBe(true);
  });

  it('checkAndSubmit يجب أن يرجع AUTO_APPROVED في حال عدم وجود مسارات مانعة أو حدوث خطأ', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        requires_approval: false,
        status: 'AUTO_APPROVED',
        message: 'لا توجد شروط اعتماد خاصة لهذا المستند، تم الاعتماد المباشر.'
      },
      error: null
    } as any);

    const result = await ApprovalWorkflowService.checkAndSubmit({
      orgId: 'org-test-123',
      docType: 'PURCHASE_INVOICE',
      amount: 5000,
      docId: 'doc-123',
      docRef: 'PINV-001'
    });

    expect(result.requires_approval).toBe(false);
    expect(result.status).toBe('AUTO_APPROVED');
    expect(supabase.rpc).toHaveBeenCalledWith('fn_check_approval_requirement', expect.objectContaining({
      p_org_id: 'org-test-123',
      p_doc_type: 'PURCHASE_INVOICE',
      p_amount: 5000
    }));
  });

  it('checkAndSubmit يجب أن يرجع PENDING وطلب اعتماد جديد إذا تجاوز المبلغ شرط المسار', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        requires_approval: true,
        request_id: 'req-abc-999',
        status: 'PENDING',
        workflow_name: 'اعتماد المشتريات الكبرى',
        message: 'تم إرسال المستند بنجاح لسلسلة الاعتمادات والموافقات.'
      },
      error: null
    } as any);

    const result = await ApprovalWorkflowService.checkAndSubmit({
      orgId: 'org-test-123',
      docType: 'PURCHASE_INVOICE',
      amount: 45000,
      docId: 'doc-999',
      docRef: 'PINV-099'
    });

    expect(result.requires_approval).toBe(true);
    expect(result.status).toBe('PENDING');
    expect(result.request_id).toBe('req-abc-999');
    expect(result.workflow_name).toBe('اعتماد المشتريات الكبرى');
  });

  it('processDecision يجب أن يستدعي دالة fn_process_approval_action بنجاح عند الموافقة', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        status: 'APPROVED',
        document_type: 'PURCHASE_INVOICE',
        document_id: 'doc-999',
        message: 'تم اعتماد المستند بنجاح ✅'
      },
      error: null
    } as any);

    const result = await ApprovalWorkflowService.processDecision(
      'req-abc-999',
      'APPROVE',
      'معتمد من المدير العام',
      'أحمد المدير'
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('APPROVED');
    expect(supabase.rpc).toHaveBeenCalledWith('fn_process_approval_action', {
      p_request_id: 'req-abc-999',
      p_action: 'APPROVE',
      p_notes: 'معتمد من المدير العام',
      p_approver_name: 'أحمد المدير'
    });
  });

  it('processDecision يجب أن يعالج الرفض بالشكل الصحيح', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        status: 'REJECTED',
        document_type: 'PAYMENT_VOUCHER',
        document_id: 'v-123',
        message: 'تم رفض المستند ❌'
      },
      error: null
    } as any);

    const result = await ApprovalWorkflowService.processDecision(
      'req-ref-1',
      'REJECT',
      'مبلغ السند غير مطابق للمطالبة',
      'المدير المالي'
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('REJECTED');
  });

  it('saveWorkflow يجب أن يحفظ في الذاكرة المحلية عند حدوث خطأ من قاعدة البيانات', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce({
      insert: vi.fn().mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockRejectedValueOnce(new Error('permission denied for table approval_workflows'))
        })
      })
    } as any);

    const saved = await ApprovalWorkflowService.saveWorkflow({
      organization_id: 'org-fallback-01',
      name: 'مسار اعتماد فواتير الشراء بحد ادنى 20000',
      document_type: 'PURCHASE_INVOICE',
      is_active: true,
      min_amount: 20000,
      approver_roles: ['ADMIN', 'FINANCE_MANAGER']
    });

    expect(saved).toBeDefined();
    expect(saved?.name).toBe('مسار اعتماد فواتير الشراء بحد ادنى 20000');
    expect(saved?.min_amount).toBe(20000);

    // التحقق من استرجاعه بنجاح من الكاش المحلي
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        order: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockRejectedValueOnce(new Error('network error'))
        })
      })
    } as any);

    const workflows = await ApprovalWorkflowService.getWorkflows('org-fallback-01');
    expect(workflows.length).toBeGreaterThan(0);
    expect(workflows[0].name).toBe('مسار اعتماد فواتير الشراء بحد ادنى 20000');
  });
});
