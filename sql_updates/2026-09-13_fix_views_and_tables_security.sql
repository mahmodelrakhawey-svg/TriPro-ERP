-- ==============================================================================
-- 🛡️ TriPro ERP - Fix Unprotected Views & Tables
-- Date: 2026-09-13
-- Target Views:
--   1. view_restaurant_staff_performance
--   2. vw_inventory_wastage_analysis
-- Target Tables:
--   Any remaining tables in schema public without RLS
-- ==============================================================================

-- 1. تحصين الرؤيتين بتفعيل security_invoker = true
DO $$
BEGIN
    BEGIN
        ALTER VIEW public.view_restaurant_staff_performance SET (security_invoker = true);
        RAISE NOTICE '✅ تم تحصين الرؤية: view_restaurant_staff_performance';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'تحذير في تحصين view_restaurant_staff_performance: %', SQLERRM;
    END;

    BEGIN
        ALTER VIEW public.vw_inventory_wastage_analysis SET (security_invoker = true);
        RAISE NOTICE '✅ تم تحصين الرؤية: vw_inventory_wastage_analysis';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'تحذير في تحصين vw_inventory_wastage_analysis: %', SQLERRM;
    END;
END $$;

-- 2. تفعيل RLS تلقائياً على الجداول الثلاثة (وأي جدول غير محمي في public) مع سياسات الأمان
DO $$
DECLARE
    t RECORD;
    has_org_id BOOLEAN;
BEGIN
    FOR t IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND rowsecurity = false
    ) LOOP
        -- أ) تفعيل RLS على الجدول
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.tablename);
        RAISE NOTICE '🛡️ تم تفعيل RLS على الجدول: %', t.tablename;

        -- ب) التحقق من وجود عمود organization_id لعزل الشركات
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = t.tablename 
              AND column_name = 'organization_id'
        ) INTO has_org_id;

        -- ج) إنشاء سياسة عزل الشركات
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
            
            RAISE NOTICE '✅ تم إنشاء سياسة عزل الشركات للجدول: %', t.tablename;
        ELSE
            EXECUTE format('
                DROP POLICY IF EXISTS %I ON public.%I;
                CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (true)
                WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN (''super_admin'', ''admin''));
            ', 
            'p_' || t.tablename || '_auth_access', t.tablename,
            'p_' || t.tablename || '_auth_access', t.tablename);
            
            RAISE NOTICE '✅ تم إنشاء سياسة وصول آمنة للجدول: %', t.tablename;
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
