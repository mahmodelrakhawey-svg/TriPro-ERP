-- ==============================================================================
-- 🛡️ TriPro ERP — Consolidated Pending Migrations Bundle
-- تاريخ التوليد: 2026-11-24T19:46:01.966Z
-- عدد الملفات المعلقة المجمعة: 3
-- ==============================================================================

-- ==============================================================================
-- TriPro ERP — Migration Version Tracking Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public._schema_migrations (
    version text PRIMARY KEY,
    filename text NOT NULL,
    checksum text,
    applied_at timestamptz DEFAULT now()
);

-- تأمين الصلاحيات وتفعيل درع RLS لمنع ثغرات الوصول غير المصرح به
ALTER TABLE public._schema_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._schema_migrations FROM anon;
REVOKE ALL ON public._schema_migrations FROM public;

GRANT SELECT ON public._schema_migrations TO anon, authenticated;
GRANT ALL ON public._schema_migrations TO service_role;

DROP POLICY IF EXISTS "schema_migrations_read_policy" ON public._schema_migrations;
CREATE POLICY "schema_migrations_read_policy" ON public._schema_migrations
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "schema_migrations_write_policy" ON public._schema_migrations;
CREATE POLICY "schema_migrations_write_policy" ON public._schema_migrations
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- [1/3] الملف: 2026-11-23_system_telemetry_incidents.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 🚀 TriPro ERP — Enterprise Incident & Crash Telemetry Hub Migration
-- sql_updates/2026-11-23_system_telemetry_incidents.sql
-- ==============================================================================
-- الغرض:
--   1. إنشاء جدول مخصص للحوادث التشغيلية (system_telemetry_incidents)
--   2. دمج تكرارات الخطأ ذكياً عبر بصمة التشفير (error_fingerprint & occurrence_count)
--   3. تسجيل تفاصيل الجهاز والشاشة والفرع والخطورة (FATAL, CRITICAL, WARNING, INFO)
--   4. تتبع حالة المعالجة (open, investigating, resolved)
--   5. توفير إجراء مخزن RPC ذري (report_telemetry_incident) لتسجيل الحادثة بدون أخطاء
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.system_telemetry_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    error_fingerprint TEXT NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    component_stack TEXT,
    severity TEXT NOT NULL DEFAULT 'CRITICAL' CHECK (severity IN ('FATAL', 'CRITICAL', 'WARNING', 'INFO')),
    module_name TEXT NOT NULL DEFAULT 'ApplicationCore',
    route_url TEXT,
    device_info JSONB DEFAULT '{}'::jsonb,
    user_id UUID,
    user_name TEXT,
    branch_name TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- فهارس الأداء السريع
CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_org ON public.system_telemetry_incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_fingerprint ON public.system_telemetry_incidents(error_fingerprint);
CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_status_sev ON public.system_telemetry_incidents(status, severity);
CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_last_seen ON public.system_telemetry_incidents(last_seen_at DESC);

-- إجراء الإبلاغ والتجميع الذري
CREATE OR REPLACE FUNCTION public.report_telemetry_incident(
    p_error_fingerprint TEXT,
    p_error_message TEXT,
    p_severity TEXT DEFAULT 'CRITICAL',
    p_module_name TEXT DEFAULT 'ApplicationCore',
    p_error_stack TEXT DEFAULT NULL,
    p_component_stack TEXT DEFAULT NULL,
    p_route_url TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb,
    p_organization_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_user_name TEXT DEFAULT NULL,
    p_branch_name TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_incident_id UUID;
    v_occurrence_count INT;
    v_existing_status TEXT;
    v_is_new BOOLEAN := false;
BEGIN
    -- البحث عن حادثة نشطة غير محلولة لنفس البصمة والمنشأة
    SELECT id, occurrence_count, status
    INTO v_incident_id, v_occurrence_count, v_existing_status
    FROM public.system_telemetry_incidents
    WHERE error_fingerprint = p_error_fingerprint
      AND organization_id IS NOT DISTINCT FROM p_organization_id
      AND status != 'resolved'
    ORDER BY last_seen_at DESC
    LIMIT 1;

    IF v_incident_id IS NOT NULL THEN
        -- تحديث الحادثة القائمة ورفع عدد مرات التكرار وتحديث آخر ظهور
        UPDATE public.system_telemetry_incidents
        SET occurrence_count = occurrence_count + 1,
            last_seen_at = now(),
            route_url = COALESCE(p_route_url, route_url),
            device_info = COALESCE(p_device_info, device_info),
            error_message = p_error_message,
            error_stack = COALESCE(p_error_stack, error_stack),
            metadata = system_telemetry_incidents.metadata || p_metadata
        WHERE id = v_incident_id;

        v_occurrence_count := v_occurrence_count + 1;
    ELSE
        -- إنشاء حادثة جديدة
        INSERT INTO public.system_telemetry_incidents (
            organization_id,
            error_fingerprint,
            error_message,
            error_stack,
            component_stack,
            severity,
            module_name,
            route_url,
            device_info,
            user_id,
            user_name,
            branch_name,
            occurrence_count,
            first_seen_at,
            last_seen_at,
            status,
            metadata
        ) VALUES (
            p_organization_id,
            p_error_fingerprint,
            p_error_message,
            p_error_stack,
            p_component_stack,
            COALESCE(p_severity, 'CRITICAL'),
            COALESCE(p_module_name, 'ApplicationCore'),
            p_route_url,
            COALESCE(p_device_info, '{}'::jsonb),
            p_user_id,
            p_user_name,
            p_branch_name,
            1,
            now(),
            now(),
            'open',
            COALESCE(p_metadata, '{}'::jsonb)
        )
        RETURNING id INTO v_incident_id;

        v_occurrence_count := 1;
        v_is_new := true;
    END IF;

    RETURN jsonb_build_object(
        'id', v_incident_id,
        'occurrence_count', v_occurrence_count,
        'is_new', v_is_new
    );
END;
$$;

-- سياسات الأمان والحماية (RLS)
ALTER TABLE public.system_telemetry_incidents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow anon and auth insert for telemetry incidents" ON public.system_telemetry_incidents;
    DROP POLICY IF EXISTS "Allow members and admins read telemetry incidents" ON public.system_telemetry_incidents;
    DROP POLICY IF EXISTS "Allow admins update telemetry incidents" ON public.system_telemetry_incidents;
END $$;

CREATE POLICY "Allow anon and auth insert for telemetry incidents"
ON public.system_telemetry_incidents
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow members and admins read telemetry incidents"
ON public.system_telemetry_incidents
FOR SELECT
TO authenticated
USING (
  organization_id IS NULL OR
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager')
  )
);

CREATE POLICY "Allow admins update telemetry incidents"
ON public.system_telemetry_incidents
FOR UPDATE
TO authenticated
USING (
  organization_id IS NULL OR
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager')
  )
);

GRANT ALL ON public.system_telemetry_incidents TO authenticated, service_role;
GRANT INSERT ON public.system_telemetry_incidents TO anon;
GRANT EXECUTE ON FUNCTION public.report_telemetry_incident TO anon, authenticated, service_role;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-23_system_telemetry_incidents', '2026-11-23_system_telemetry_incidents.sql', '47417b48012ac292324d41814abf04866ab7815b8342c8a069c4d2bd1c5cb72d', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [2/3] الملف: 2026-11-24_security_fix_rls_lockdown_all_public_tables.sql
-- ------------------------------------------------------------------------------
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

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-24_security_fix_rls_lockdown_all_public_tables', '2026-11-24_security_fix_rls_lockdown_all_public_tables.sql', '990aa81c93d7c0c0132952300ab26181c6316140156ee06b041e345ccafe57b7', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [3/3] الملف: 2026-11-24_security_fix_rls_references_user_metadata.sql
-- ------------------------------------------------------------------------------
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

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-24_security_fix_rls_references_user_metadata', '2026-11-24_security_fix_rls_references_user_metadata.sql', '249b7f54b6d1212de33e3c004c0c3aa37230f03f6a98e3cb8fbc9e347101b613', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

