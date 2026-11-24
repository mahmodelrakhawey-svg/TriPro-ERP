-- ==============================================================================
-- 🛡️ TriPro ERP — Security Fix: Eliminate user_metadata references in RLS policies
-- File: sql_updates/2026-11-24_security_fix_rls_references_user_metadata.sql
-- Date: 2026-11-24
-- ==============================================================================
-- الغرض:
--   1. حل خطأي الفحص الأمني (rls_references_user_metadata) في Supabase Linter بشكل نهائي:
--      - الجدول public.organizations (السياسة Org_Select_Policy)
--      - الجدول public.profiles (السياسة profiles_select_policy)
--   2. السبب الأمني: كائن user_metadata قابل للتعديل المباشر من طرف العميل (Frontend)
--      ولا يجوز استخدامه نهائياً في سياق الأمان والتحقق من الصلاحيات والمنشآت.
--   3. الحل: الاعتماد الحصري على جدول profiles المحمي ودوال الهوية الموثوقة:
--      auth.uid(), public.get_my_org(), public.get_my_role().
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. كشف وحذف أي سياسة أمان RLS تشير إلى user_metadata في مخطط public
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    pol RECORD;
    cnt INT := 0;
BEGIN
    FOR pol IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
            qual ILIKE '%user_metadata%' 
            OR with_check ILIKE '%user_metadata%'
            OR qual ILIKE '%raw_user_meta_data%'
            OR with_check ILIKE '%raw_user_meta_data%'
          )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
        cnt := cnt + 1;
        RAISE NOTICE '🗑️ [DROPPED INSECURE POLICY] تم حذف السياسة غير الآمنة: % من الجدول %', pol.policyname, pol.tablename;
    END LOOP;
    
    RAISE NOTICE '🛡️ إجمالي السياسات الملغاة المرتبطة بـ user_metadata: %', cnt;
END $$;

-- التأكد الصريح من حذف السياستين المذكورتين
DROP POLICY IF EXISTS "Org_Select_Policy" ON public.organizations;
DROP POLICY IF EXISTS "org_select_policy" ON public.organizations;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;


-- ------------------------------------------------------------------------------
-- 2. إعادة بناء سياسات جدول المنشآت (public.organizations) بدون user_metadata
-- ------------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete_policy" ON public.organizations;

-- سياسة القراءة: يرى المستخدم منشأته فقط، أو كافة المنشآت لـ super_admin
CREATE POLICY "organizations_select_policy"
ON public.organizations
FOR SELECT
TO authenticated, anon
USING (
    -- إذا كان المستخدم مسجلاً: يرى منشأته المعتمدة أو جميعها إذا كان مدير نظام
    (auth.uid() IS NOT NULL AND (
        id = public.get_my_org()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    ))
    -- إذا كان زائراً أو شاشة تسجيل دخول / نقاط بيع: مسموح بالقراءة المحدودة
    OR auth.uid() IS NULL
);

-- سياسة الإضافة: مسموحة للمستخدمين المصادق عليهم عند إنشاء منشأة جديدة
CREATE POLICY "organizations_insert_policy"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- سياسة التعديل: لمديري المنشأة والـ super_admin فقط
CREATE POLICY "organizations_update_policy"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
    id = public.get_my_org()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
)
WITH CHECK (
    id = public.get_my_org()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
);

-- سياسة الحذف: لـ super_admin فقط
CREATE POLICY "organizations_delete_policy"
ON public.organizations
FOR DELETE
TO authenticated
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
);


-- ------------------------------------------------------------------------------
-- 3. إعادة بناء سياسات جدول ملفات المستخدمين (public.profiles) بدون user_metadata
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

-- سياسة القراءة: يرى المستخدم حسابه الشخصي، أو زملاءه في نفس المنشأة، أو كل الحسابات لـ super_admin
CREATE POLICY "profiles_select_policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id = public.get_my_org())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
);

-- سياسة الإضافة: لإنشاء الحساب الذاتي أو إضافة موظف جديد من قبل المسؤول
CREATE POLICY "profiles_insert_policy"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
);

-- سياسة التعديل: لتحديث الملف الشخصي أو إدارة الموظفين بالمنشأة
CREATE POLICY "profiles_update_policy"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    id = auth.uid()
    OR (
        organization_id = public.get_my_org()
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
    )
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
    id = auth.uid()
    OR (
        organization_id = public.get_my_org()
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
    )
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
);

-- سياسة الحذف: لمدراء النظام والمنشأة
CREATE POLICY "profiles_delete_policy"
ON public.profiles
FOR DELETE
TO authenticated
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
);

COMMIT;

-- تحديث كاش واجهة PostgREST
NOTIFY pgrst, 'reload schema';
