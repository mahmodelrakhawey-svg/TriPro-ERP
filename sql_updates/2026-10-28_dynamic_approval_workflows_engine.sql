-- ==============================================================================
-- TriPro-ERP: محرك مسارات الموافقات والاعتمادات الديناميكي (Dynamic Approval Workflows Engine)
-- التاريخ: 28 أكتوبر 2026
-- الهدف:
--   1. تمكين مديري الشركات من تصميم مسارات اعتماد مرنة للمستندات المالية والتشغيلية
--   2. التحقق التلقائي عند اعتماد أو حفظ المستندات (فواتير، أوامر شراء، سندات، أوامر تشغيل)
--   3. الحفاظ الكامل بنسبة 100% على بيانات شركة لينزا وعدم تعطيل العمل العادي في حال عدم وجود مسارات
-- ==============================================================================

BEGIN;

-- 1. جدول تعريف مسارات وقواعد الاعتماد (Approval Workflows)
CREATE TABLE IF NOT EXISTS public.approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    document_type TEXT NOT NULL, -- PURCHASE_INVOICE, PURCHASE_ORDER, SALES_INVOICE, PAYMENT_VOUCHER, RECEIPT_VOUCHER, JOURNAL_ENTRY, STOCK_ADJUSTMENT, PRODUCTION_ORDER
    is_active BOOLEAN NOT NULL DEFAULT true,
    min_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
    max_amount NUMERIC(15, 4),
    approval_type TEXT NOT NULL DEFAULT 'ANY', -- 'ANY' (أي معتمد مخول), 'ALL' (إجماع), 'ROLE' (بحسب الدور الوظيفي)
    approver_roles TEXT[] DEFAULT ARRAY['ADMIN']::TEXT[],
    approver_user_ids UUID[] DEFAULT ARRAY[]::UUID[],
    conditions JSONB DEFAULT '{}'::JSONB,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- فهارس السرعة
CREATE INDEX IF NOT EXISTS idx_approval_workflows_org_doc 
ON public.approval_workflows(organization_id, document_type, is_active);

-- 2. جدول طلبات وسجلات الاعتماد (Approval Requests)
CREATE TABLE IF NOT EXISTS public.approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES public.approval_workflows(id) ON DELETE SET NULL,
    document_type TEXT NOT NULL,
    document_id UUID NOT NULL,
    document_reference TEXT,
    document_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
    requester_id UUID,
    requester_name TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, CANCELLED
    decision_notes TEXT,
    decision_at TIMESTAMPTZ,
    decision_by UUID,
    decision_by_name TEXT,
    audit_trail JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- فهارس سجلات الاعتماد
CREATE INDEX IF NOT EXISTS idx_approval_requests_org_status 
ON public.approval_requests(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_approval_requests_doc_id 
ON public.approval_requests(document_id);

-- 3. تفعيل أمان مستوى الصفوف (Row Level Security - RLS)
ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Approval workflows access policy" ON public.approval_workflows;
    CREATE POLICY "Approval workflows access policy" ON public.approval_workflows
        FOR ALL USING (organization_id = public.get_my_org() OR public.is_admin());

    DROP POLICY IF EXISTS "Approval requests access policy" ON public.approval_requests;
    CREATE POLICY "Approval requests access policy" ON public.approval_requests
        FOR ALL USING (organization_id = public.get_my_org() OR public.is_admin());
END $$;

-- 4. دالة فحص ضرورة الاعتماد (Check Approval Requirement)
-- تفحص إذا كان المستند يحتاج موافقة بحسب شروط المنظمة، وتنشئ طلب الاعتماد إذا لزم الأمر
CREATE OR REPLACE FUNCTION public.fn_check_approval_requirement(
    p_org_id UUID,
    p_doc_type TEXT,
    p_amount NUMERIC,
    p_doc_id UUID,
    p_doc_ref TEXT,
    p_requester_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_final_org UUID;
    v_workflow RECORD;
    v_request_id UUID;
    v_user_id UUID;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    v_user_id := auth.uid();

    -- البحث عن مسار فعال يطابق نوع المستند والمبلغ
    SELECT * INTO v_workflow
    FROM public.approval_workflows
    WHERE organization_id = v_final_org
      AND document_type = p_doc_type
      AND is_active = true
      AND p_amount >= min_amount
      AND (max_amount IS NULL OR p_amount <= max_amount)
    ORDER BY min_amount DESC
    LIMIT 1;

    -- إذا لم يوجد مسار اعتماد منطبق، يُسمح باعتماد المستند فوراً (السلوك الافتراضي لشركة لينزا)
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'requires_approval', false,
            'status', 'AUTO_APPROVED',
            'message', 'لا توجد شروط اعتماد خاصة لهذا المستند، تم الاعتماد المباشر.'
        );
    END IF;

    -- فحص إذا كان هناك طلب معلق بالفعل لنفس المستند
    SELECT id INTO v_request_id
    FROM public.approval_requests
    WHERE organization_id = v_final_org
      AND document_id = p_doc_id
      AND status = 'PENDING';

    IF FOUND THEN
        RETURN jsonb_build_object(
            'requires_approval', true,
            'request_id', v_request_id,
            'status', 'PENDING',
            'workflow_name', v_workflow.name,
            'message', 'المستند قيد المراجعة والاعتماد حالياً.'
        );
    END IF;

    -- إنشاء طلب اعتماد جديد
    INSERT INTO public.approval_requests (
        organization_id,
        workflow_id,
        document_type,
        document_id,
        document_reference,
        document_amount,
        requester_id,
        requester_name,
        status,
        audit_trail
    ) VALUES (
        v_final_org,
        v_workflow.id,
        p_doc_type,
        p_doc_id,
        p_doc_ref,
        p_amount,
        v_user_id,
        p_requester_name,
        'PENDING',
        jsonb_build_array(jsonb_build_object(
            'action', 'SUBMITTED',
            'user_id', v_user_id,
            'user_name', p_requester_name,
            'timestamp', now(),
            'notes', 'تم تقديم المستند للاعتماد بموجب مسار: ' || v_workflow.name
        ))
    ) RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
        'requires_approval', true,
        'request_id', v_request_id,
        'status', 'PENDING',
        'workflow_name', v_workflow.name,
        'message', 'تم إرسال المستند بنجاح لسلسلة الاعتمادات والموافقات.'
    );
END;
$$;

-- 5. دالة معالجة قرار الاعتماد أو الرفض (Process Approval Action)
CREATE OR REPLACE FUNCTION public.fn_process_approval_action(
    p_request_id UUID,
    p_action TEXT, -- 'APPROVE' أو 'REJECT'
    p_notes TEXT DEFAULT NULL,
    p_approver_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_user_id UUID;
    v_new_status TEXT;
    v_audit_entry JSONB;
BEGIN
    v_user_id := auth.uid();

    SELECT * INTO v_req
    FROM public.approval_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب الاعتماد غير موجود.';
    END IF;

    IF v_req.status != 'PENDING' THEN
        RAISE EXCEPTION 'تم اتخاذ القرار في هذا الطلب مسبقاً (الحالة الحالية: %).', v_req.status;
    END IF;

    IF UPPER(p_action) = 'APPROVE' THEN
        v_new_status := 'APPROVED';
    ELSIF UPPER(p_action) = 'REJECT' THEN
        v_new_status := 'REJECTED';
    ELSE
        RAISE EXCEPTION 'إجراء غير معروف. يجب أن يكون APPROVE أو REJECT.';
    END IF;

    v_audit_entry := jsonb_build_object(
        'action', v_new_status,
        'user_id', v_user_id,
        'user_name', p_approver_name,
        'timestamp', now(),
        'notes', p_notes
    );

    UPDATE public.approval_requests
    SET status = v_new_status,
        decision_notes = p_notes,
        decision_at = now(),
        decision_by = v_user_id,
        decision_by_name = p_approver_name,
        audit_trail = audit_trail || v_audit_entry,
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', v_new_status,
        'document_type', v_req.document_type,
        'document_id', v_req.document_id,
        'message', CASE WHEN v_new_status = 'APPROVED' THEN 'تم اعتماد المستند بنجاح ✅' ELSE 'تم رفض المستند ❌' END
    );
END;
$$;

-- منح الصلاحيات للمستخدمين المصادق عليهم
GRANT EXECUTE ON FUNCTION public.fn_check_approval_requirement(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_process_approval_action(UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
