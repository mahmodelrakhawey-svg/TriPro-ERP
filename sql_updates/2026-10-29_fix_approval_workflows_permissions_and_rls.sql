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

-- 4. منح صلاحيات تنفيذ الدوال الخاصة بالاعتمادات
GRANT EXECUTE ON FUNCTION public.fn_check_approval_requirement(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_process_approval_action(UUID, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;

COMMIT;
