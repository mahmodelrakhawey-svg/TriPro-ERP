-- ==============================================================================
-- 🛡️ TriPro ERP — Comprehensive Security Hardening & Universal RLS Lockdown
-- File: sql_updates/2026-11-24_security_fix_rls_lockdown_all_public_tables.sql
-- Date: 2026-11-24
-- ==============================================================================
-- الغرض الأساسي:
--   1. حل تحذير أمان Supabase (rls_disabled_in_public) بشكل نهائي وشامل.
--   2. فحص وتفعيل Row Level Security (RLS) تلقائياً على أي جدول في schema public غير مفعل عليه RLS.
--   3. تحصين جدول تتبع الإصدارات (_schema_migrations) وسحب صلاحيات التعديل من المستخدمين المجهولين (anon).
--   4. إغلاق الثغرات وسحب الصلاحيات الحساسة (Write/Delete) من دور anon على جداول الموافقات والعهد والموظفين.
--   5. تصحيح سياسات العزل بالمنشأة (Multi-Tenant Isolation) للجداول التي كانت تستخدم USING (true) أو شرط مفتوح.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. تفعيل RLS تلقائياً على كافة جداول schema public غير المحمية (Universal RLS Guard)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    cnt INT := 0;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND rowsecurity = false
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        cnt := cnt + 1;
        RAISE NOTICE '🔒 [RLS ENABLED] تم تفعيل حماية RLS بنجاح على الجدول: %', r.tablename;
    END LOOP;
    
    RAISE NOTICE '🛡️ إجمالي الجداول التي تم تفعيل RLS عليها: %', cnt;
END $$;


-- ------------------------------------------------------------------------------
-- 2. تحصين جدول تتبع ترحيلات النظام (_schema_migrations)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '_schema_migrations'
    ) THEN
        -- التأكد من تفعيل RLS
        ALTER TABLE public._schema_migrations ENABLE ROW LEVEL SECURITY;

        -- سحب أي صلاحيات تعديل أو حذف أو كتابة من العامة والمجهولين
        REVOKE ALL ON TABLE public._schema_migrations FROM anon;
        REVOKE ALL ON TABLE public._schema_migrations FROM public;

        -- منح القراءة فقط للمصادق عليهم وأدوات CLI وللمدراء، والصلاحية الكاملة لـ service_role
        GRANT SELECT ON TABLE public._schema_migrations TO anon, authenticated;
        GRANT ALL ON TABLE public._schema_migrations TO service_role;

        -- سياسات RLS المحكمة
        DROP POLICY IF EXISTS "schema_migrations_read_policy" ON public._schema_migrations;
        DROP POLICY IF EXISTS "schema_migrations_auth_read" ON public._schema_migrations;
        CREATE POLICY "schema_migrations_read_policy" ON public._schema_migrations
            FOR SELECT TO anon, authenticated
            USING (true);

        DROP POLICY IF EXISTS "schema_migrations_write_policy" ON public._schema_migrations;
        DROP POLICY IF EXISTS "schema_migrations_service_role_all" ON public._schema_migrations;
        CREATE POLICY "schema_migrations_write_policy" ON public._schema_migrations
            FOR ALL TO service_role
            USING (true)
            WITH CHECK (true);

        RAISE NOTICE '✅ [SECURE] تم تحصين جدول _schema_migrations وسياساته بنجاح.';
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 3. تحصين مسارات وطلبات الاعتماد (Approval Workflows & Requests)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'approval_workflows'
    ) THEN
        -- سحب كافة الصلاحيات من دور anon
        REVOKE ALL ON TABLE public.approval_workflows FROM anon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.approval_workflows TO authenticated;
        GRANT ALL ON TABLE public.approval_workflows TO service_role;

        ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;

        -- حذف السياسات القديمة المتساهلة
        DROP POLICY IF EXISTS "tenant_isolation_approval_workflows" ON public.approval_workflows;
        DROP POLICY IF EXISTS "Approval workflows access policy" ON public.approval_workflows;

        -- سياسة عزل صارمة بناءً على منشأة المستخدم المسجل
        CREATE POLICY "tenant_isolation_approval_workflows" ON public.approval_workflows
            FOR ALL TO authenticated
            USING (
                organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
                OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
            )
            WITH CHECK (
                organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
                OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
            );

        RAISE NOTICE '✅ [SECURE] تم تحصين جدول approval_workflows.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'approval_requests'
    ) THEN
        -- سحب كافة الصلاحيات من دور anon
        REVOKE ALL ON TABLE public.approval_requests FROM anon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.approval_requests TO authenticated;
        GRANT ALL ON TABLE public.approval_requests TO service_role;

        ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

        -- حذف السياسات القديمة المتساهلة
        DROP POLICY IF EXISTS "tenant_isolation_approval_requests" ON public.approval_requests;
        DROP POLICY IF EXISTS "Approval requests access policy" ON public.approval_requests;

        -- سياسة عزل صارمة
        CREATE POLICY "tenant_isolation_approval_requests" ON public.approval_requests
            FOR ALL TO authenticated
            USING (
                organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
                OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
            )
            WITH CHECK (
                organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
                OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
            );

        RAISE NOTICE '✅ [SECURE] تم تحصين جدول approval_requests.';
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 4. تحصين مسحوبات وعهد الكاشير النقدية (pos_petty_cash_payouts)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'pos_petty_cash_payouts'
    ) THEN
        REVOKE ALL ON TABLE public.pos_petty_cash_payouts FROM anon;
        GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_petty_cash_payouts TO authenticated;
        GRANT ALL ON TABLE public.pos_petty_cash_payouts TO service_role;

        ALTER TABLE public.pos_petty_cash_payouts ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS allow_payouts_all ON public.pos_petty_cash_payouts;
        DROP POLICY IF EXISTS tenant_isolation_pos_petty_cash_payouts ON public.pos_petty_cash_payouts;

        CREATE POLICY "tenant_isolation_pos_petty_cash_payouts" ON public.pos_petty_cash_payouts
            FOR ALL TO authenticated
            USING (
                organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
                OR organization_id IS NULL
                OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
            )
            WITH CHECK (
                organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
                OR organization_id IS NULL
                OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin')
            );

        RAISE NOTICE '✅ [SECURE] تم تحصين جدول pos_petty_cash_payouts.';
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 5. تحصين ورديات الموارد البشرية (hr_shifts) وجداول العمليات الإدارية
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'hr_shifts'
    ) THEN
        REVOKE INSERT, UPDATE, DELETE ON TABLE public.hr_shifts FROM anon;
        GRANT SELECT ON TABLE public.hr_shifts TO anon, authenticated;
        GRANT ALL ON TABLE public.hr_shifts TO authenticated, service_role;

        ALTER TABLE public.hr_shifts ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS allow_all_shifts ON public.hr_shifts;
        DROP POLICY IF EXISTS hr_shifts_read_policy ON public.hr_shifts;
        DROP POLICY IF EXISTS hr_shifts_write_policy ON public.hr_shifts;

        CREATE POLICY "hr_shifts_read_policy" ON public.hr_shifts
            FOR SELECT TO authenticated, anon
            USING (true);

        CREATE POLICY "hr_shifts_write_policy" ON public.hr_shifts
            FOR ALL TO authenticated
            USING (
                (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'hr', 'manager')
            )
            WITH CHECK (
                (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'hr', 'manager')
            );

        RAISE NOTICE '✅ [SECURE] تم تحصين جدول hr_shifts.';
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 6. سحب صلاحيات الكتابة غير الضرورية من دور anon على باقي الجداول التخصصية
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
    sensitive_spec_tables TEXT[] := ARRAY[
        'butchering_orders', 'butchering_order_items', 'butchering_templates', 'butchering_template_items',
        'kitchen_stations', 'kitchen_ticket_items', 'delivery_drivers', 'driver_deliveries', 'driver_settlements',
        'asset_audits', 'asset_transfers', 'hr_biometric_devices', 'hr_biometric_raw_logs', 'hr_penalties_rewards'
    ];
BEGIN
    FOREACH tbl IN ARRAY sensitive_spec_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon;', tbl);
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
            RAISE NOTICE '🔒 [REVOKE ANON WRITE] تم سحب الكتابة وتأمين RLS على: %', tbl;
        END IF;
    END LOOP;
END $$;


-- ------------------------------------------------------------------------------
-- 7. التأكد من تفعيل security_invoker على كافة الرؤى (Views) في public
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v RECORD;
BEGIN
    FOR v IN (
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'public'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true);', v.table_name);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;

COMMIT;

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';
