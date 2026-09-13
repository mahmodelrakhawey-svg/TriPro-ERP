-- ==============================================================================
-- 🛡️ TriPro ERP - Universal Fix: Enable RLS on Unprotected Tables & Secure Views
-- Date: 2026-09-13
-- Purpose:
--   1. Automatically enable RLS on any unprotected table in schema public
--   2. Generate multi-tenant isolation policies for each protected table
--   3. Enable security_invoker on all views to enforce RLS on underlying data
-- ==============================================================================

DO $$
DECLARE
    t RECORD;
    v RECORD;
    has_org_id BOOLEAN;
BEGIN
    -- -------------------------------------------------------------
    -- أولاً: تفعيل RLS وإنشاء سياسات الأمان لكافة الجداول غير المحمية
    -- -------------------------------------------------------------
    FOR t IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND rowsecurity = false
    ) LOOP
        -- 1. تفعيل RLS على الجدول
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.tablename);
        RAISE NOTICE '🛡️ تم تفعيل RLS على الجدول: %', t.tablename;

        -- 2. التحقق مما إذا كان الجدول يحتوي على عمود organization_id
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = t.tablename 
              AND column_name = 'organization_id'
        ) INTO has_org_id;

        -- 3. إنشاء سياسة عزل الشركات (Tenant Isolation Policy)
        IF has_org_id THEN
            EXECUTE format('
                DROP POLICY IF EXISTS %I ON public.%I;
                CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (
                    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
                    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = ''super_admin''
                )
                WITH CHECK (
                    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
                    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = ''super_admin''
                );
            ', 
            'p_' || t.tablename || '_org_isolation', t.tablename,
            'p_' || t.tablename || '_org_isolation', t.tablename);
            
            RAISE NOTICE '✅ تم إنشاء سياسة عزل المؤسسات للجدول: %', t.tablename;
        ELSE
            -- إذا كان الجدول لا يحتوي على organization_id (مثل جداول الإعدادات العامة)
            EXECUTE format('
                DROP POLICY IF EXISTS %I ON public.%I;
                CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (true)
                WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN (''super_admin'', ''admin''));
            ', 
            'p_' || t.tablename || '_auth_access', t.tablename,
            'p_' || t.tablename || '_auth_access', t.tablename);
            
            RAISE NOTICE '✅ تم إنشاء سياسة حماية للمستخدمين المسجلين للجدول: %', t.tablename;
        END IF;
    END LOOP;

    -- -------------------------------------------------------------
    -- ثانياً: تحصين جميع الرؤى (Views) بوضع security_invoker = true
    -- -------------------------------------------------------------
    FOR v IN (
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'public'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true);', v.table_name);
            RAISE NOTICE '👁️ تم تفعيل security_invoker للرؤية: %', v.table_name;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
