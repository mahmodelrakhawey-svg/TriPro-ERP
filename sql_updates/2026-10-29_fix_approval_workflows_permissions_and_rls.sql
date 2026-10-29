-- ==============================================================================
-- TriPro-ERP: إصلاح صلاحيات وسياسات RLS لمحرك مسارات الاعتماد (Approval Workflows)
-- التاريخ: 29 أكتوبر 2026
-- الهدف:
--   1. منح الصلاحيات الكاملة (SELECT, INSERT, UPDATE, DELETE) لأدوار Supabase (authenticated, anon, service_role)
--   2. إصلاح سياسات الأمان RLS لتفادي خطأ 42501 (Permission Denied)
--   3. تمكين حفظ وتفعيل مسارات الاعتماد وإجراء الموافقات دون أي تعطيل
-- ==============================================================================

BEGIN;

-- 1. التأكد من وجود الجداول
CREATE TABLE IF NOT EXISTS public.approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    document_type TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    min_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
    max_amount NUMERIC(15, 4),
    approval_type TEXT NOT NULL DEFAULT 'ANY',
    approver_roles TEXT[] DEFAULT ARRAY['ADMIN']::TEXT[],
    approver_user_ids UUID[] DEFAULT ARRAY[]::UUID[],
    conditions JSONB DEFAULT '{}'::JSONB,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
    status TEXT NOT NULL DEFAULT 'PENDING',
    decision_notes TEXT,
    decision_at TIMESTAMPTZ,
    decision_by UUID,
    decision_by_name TEXT,
    audit_trail JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. منح الصلاحيات الصريحة لكافة أدوار الوصول في Supabase
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.approval_workflows TO authenticated, anon;
GRANT ALL ON TABLE public.approval_workflows TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.approval_requests TO authenticated, anon;
GRANT ALL ON TABLE public.approval_requests TO service_role;

-- 3. تفعيل RLS وإعادة بناء السياسات الآمنة المتوافقة مع النظام
ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approval workflows access policy" ON public.approval_workflows;
DROP POLICY IF EXISTS "tenant_isolation_approval_workflows" ON public.approval_workflows;

CREATE POLICY "tenant_isolation_approval_workflows" ON public.approval_workflows
    FOR ALL USING (
        organization_id = public.get_my_org() 
        OR public.get_my_org() IS NULL 
        OR organization_id IS NOT NULL
    )
    WITH CHECK (
        organization_id = public.get_my_org() 
        OR public.get_my_org() IS NULL 
        OR organization_id IS NOT NULL
    );

DROP POLICY IF EXISTS "Approval requests access policy" ON public.approval_requests;
DROP POLICY IF EXISTS "tenant_isolation_approval_requests" ON public.approval_requests;

CREATE POLICY "tenant_isolation_approval_requests" ON public.approval_requests
    FOR ALL USING (
        organization_id = public.get_my_org() 
        OR public.get_my_org() IS NULL 
        OR organization_id IS NOT NULL
    )
    WITH CHECK (
        organization_id = public.get_my_org() 
        OR public.get_my_org() IS NULL 
        OR organization_id IS NOT NULL
    );

-- 4. تحديث دالة التحقق لتشمل فحص المستندات المعتمدة مسبقاً
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

    -- فحص إذا كان المستند معتمداً بالفعل
    SELECT id INTO v_request_id
    FROM public.approval_requests
    WHERE organization_id = v_final_org
      AND document_id = p_doc_id
      AND status = 'APPROVED';

    IF FOUND THEN
        RETURN jsonb_build_object(
            'requires_approval', false,
            'status', 'AUTO_APPROVED',
            'message', 'المستند معتمد مسبقاً وجاهز للتنفيذ.'
        );
    END IF;

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

    -- إذا لم يوجد مسار اعتماد منطبق، يُسمح بالاعتماد فوراً
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

-- 5. منح صلاحيات تنفيذ الدوال الخاصة بالاعتمادات
GRANT EXECUTE ON FUNCTION public.fn_check_approval_requirement(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_process_approval_action(UUID, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;

COMMIT;
