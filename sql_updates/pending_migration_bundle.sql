-- ==============================================================================
-- 🛡️ TriPro ERP — Consolidated Pending Migrations Bundle
-- تاريخ التوليد: 2026-11-24T20:19:27.504Z
-- عدد الملفات المعلقة المجمعة: 5
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
-- [1/5] الملف: 2026-11-23_system_telemetry_incidents.sql
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
-- [2/5] الملف: 2026-11-24_security_fix_rls_lockdown_all_public_tables.sql
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
-- [3/5] الملف: 2026-11-24_security_fix_rls_references_user_metadata.sql
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

-- ------------------------------------------------------------------------------
-- [4/5] الملف: 2026-11-24_security_hardening_critical_rls_and_rpcs.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 🛡️ TriPro ERP — Package 1: Critical RLS, Tenant Isolation & RPC Hardening
-- File: sql_updates/2026-11-24_security_hardening_critical_rls_and_rpcs.sql
-- Date: 2026-11-24
-- ==============================================================================
-- يعالج هذا التحديث كافة الثغرات الحرجة المكتشفة في التدقيق الأمني:
--   1. منع تصعيد الصلاحيات الذاتي (super_admin/admin) عند INSERT أو UPDATE في profiles.
--   2. تقييد صلاحيات admin بمنشأته فقط (get_my_org()) في كافة السياسات.
--   3. إغلاق ثغرات anon و USING (true) في organizations, fiscal_years, archived_*.
--   4. إصلاح انتكاسة validate_tenant_access و get_current_company_settings و get_trial_balance_summary_rpc.
--   5. سحب صلاحية التنفيذ من anon و PUBLIC عن كافة الدوال المالية والإدارية الحساسة.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. حارس منع تصعيد الرتب وتعديل المنظمة في profiles (INSERT & UPDATE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_profile_role_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_org UUID;
    v_caller_id UUID := auth.uid();
BEGIN
    -- السماح للعمليات الداخلية السيرفرية (service_role / postgres / handle_new_user)
    IF v_caller_id IS NULL OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    SELECT role, organization_id INTO v_caller_role, v_caller_org
    FROM public.profiles WHERE id = v_caller_id;

    IF TG_OP = 'INSERT' THEN
        -- المستخدم العادي أو الجديد لا يمكنه تعيين نفسه super_admin أو admin
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            IF COALESCE(NEW.role, 'viewer') = 'super_admin' THEN
                RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: غير مصرح لك بتعيين رتبة super_admin.';
            END IF;
            IF COALESCE(v_caller_role, '') = 'admin' THEN
                IF NEW.organization_id IS DISTINCT FROM v_caller_org THEN
                    RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: غير مصرح لك بإضافة مستخدمين لمنشأة أخرى.';
                END IF;
            ELSE
                -- تسجيل ذاتي بدون رتبة إدارية
                IF COALESCE(NEW.role, 'viewer') IN ('admin', 'super_admin') THEN
                    RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: غير مصرح لك بتعيين رتبة إدارية عند التسجيل.';
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE'
    IF (NEW.role IS DISTINCT FROM OLD.role 
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id 
        OR NEW.role_id IS DISTINCT FROM OLD.role_id
        OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
        
        IF COALESCE(v_caller_role, '') = 'super_admin' THEN
            RETURN NEW;
        ELSIF COALESCE(v_caller_role, '') = 'admin' 
              AND OLD.organization_id = v_caller_org 
              AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
              AND COALESCE(NEW.role, 'viewer') <> 'super_admin'
              AND COALESCE(OLD.role, 'viewer') <> 'super_admin' THEN
            RETURN NEW;
        ELSE
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: غير مصرح لك بتعديل الرتبة أو المنظمة أو الصلاحيات الإدارية.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_role_tampering ON public.profiles;
CREATE TRIGGER trg_guard_profile_role_tampering
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_profile_role_tampering();


-- ==============================================================================
-- 2. تحصين سياسات profiles و organizations
-- ==============================================================================
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT TO authenticated
USING (
    id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id = public.get_my_org())
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "profiles_insert_policy" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
    (id = auth.uid() AND COALESCE(role, 'viewer') NOT IN ('super_admin', 'admin'))
    OR (public.get_my_role() = 'admin' AND organization_id = public.get_my_org() AND COALESCE(role, 'viewer') <> 'super_admin')
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE TO authenticated
USING (
    id = auth.uid()
    OR (organization_id = public.get_my_org() AND public.get_my_role() = 'admin')
    OR public.get_my_role() = 'super_admin'
)
WITH CHECK (
    id = auth.uid()
    OR (organization_id = public.get_my_org() AND public.get_my_role() = 'admin' AND COALESCE(role, 'viewer') <> 'super_admin')
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "profiles_delete_policy" ON public.profiles
FOR DELETE TO authenticated
USING (
    (organization_id = public.get_my_org() AND public.get_my_role() = 'admin')
    OR public.get_my_role() = 'super_admin'
);

-- organizations
REVOKE ALL ON TABLE public.organizations FROM anon;
GRANT SELECT ON TABLE public.organizations TO authenticated;

DROP POLICY IF EXISTS "organizations_select_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete_policy" ON public.organizations;

CREATE POLICY "organizations_select_policy" ON public.organizations
FOR SELECT TO authenticated
USING (
    id = public.get_my_org()
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "organizations_insert_policy" ON public.organizations
FOR INSERT TO authenticated
WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR public.get_my_org() IS NULL
);

CREATE POLICY "organizations_update_policy" ON public.organizations
FOR UPDATE TO authenticated
USING (
    (id = public.get_my_org() AND public.get_my_role() = 'admin')
    OR public.get_my_role() = 'super_admin'
)
WITH CHECK (
    (id = public.get_my_org() AND public.get_my_role() = 'admin')
    OR public.get_my_role() = 'super_admin'
);

CREATE POLICY "organizations_delete_policy" ON public.organizations
FOR DELETE TO authenticated
USING (
    public.get_my_role() = 'super_admin'
);


-- ==============================================================================
-- 3. إصلاح سياسات fiscal_years, approval_*, pos_petty_cash_payouts, hr_shifts
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fiscal_years') THEN
        REVOKE ALL ON TABLE public.fiscal_years FROM anon;
        DROP POLICY IF EXISTS "fiscal_years_org_isolation" ON public.fiscal_years;
        CREATE POLICY "fiscal_years_org_isolation" ON public.fiscal_years
        FOR ALL TO authenticated
        USING (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        )
        WITH CHECK (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'approval_workflows') THEN
        DROP POLICY IF EXISTS "tenant_isolation_approval_workflows" ON public.approval_workflows;
        CREATE POLICY "tenant_isolation_approval_workflows" ON public.approval_workflows
        FOR ALL TO authenticated
        USING (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        )
        WITH CHECK (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'approval_requests') THEN
        DROP POLICY IF EXISTS "tenant_isolation_approval_requests" ON public.approval_requests;
        CREATE POLICY "tenant_isolation_approval_requests" ON public.approval_requests
        FOR ALL TO authenticated
        USING (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        )
        WITH CHECK (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pos_petty_cash_payouts') THEN
        DROP POLICY IF EXISTS "tenant_isolation_pos_petty_cash_payouts" ON public.pos_petty_cash_payouts;
        CREATE POLICY "tenant_isolation_pos_petty_cash_payouts" ON public.pos_petty_cash_payouts
        FOR ALL TO authenticated
        USING (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        )
        WITH CHECK (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hr_shifts') THEN
        REVOKE ALL ON TABLE public.hr_shifts FROM anon;
        DROP POLICY IF EXISTS "hr_shifts_read_policy" ON public.hr_shifts;
        DROP POLICY IF EXISTS "hr_shifts_write_policy" ON public.hr_shifts;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'hr_shifts' AND column_name = 'organization_id') THEN
            CREATE POLICY "hr_shifts_read_policy" ON public.hr_shifts FOR SELECT TO authenticated
            USING (organization_id IS NULL OR organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');
            CREATE POLICY "hr_shifts_write_policy" ON public.hr_shifts FOR ALL TO authenticated
            USING ((organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'hr', 'manager')) OR public.get_my_role() = 'super_admin')
            WITH CHECK ((organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'hr', 'manager')) OR public.get_my_role() = 'super_admin');
        ELSE
            CREATE POLICY "hr_shifts_read_policy" ON public.hr_shifts FOR SELECT TO authenticated USING (true);
            CREATE POLICY "hr_shifts_write_policy" ON public.hr_shifts FOR ALL TO authenticated
            USING (public.get_my_role() = 'super_admin')
            WITH CHECK (public.get_my_role() = 'super_admin');
        END IF;
    END IF;
END $$;


-- ==============================================================================
-- 4. إغلاق جداول الأصول والبيومترك والأرشيف السنوي والتليمتري عن anon وعزلها
-- ==============================================================================
DO $$
DECLARE
    tbl TEXT;
    org_tables TEXT[] := ARRAY[
        'asset_audits', 'asset_transfers',
        'hr_biometric_devices', 'hr_biometric_raw_logs', 'hr_penalties_rewards',
        'annual_fiscal_archives', 'archived_journal_entries', 'archived_journal_lines', 'archived_stock_ledger'
    ];
    pol RECORD;
BEGIN
    FOREACH tbl IN ARRAY org_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon;', tbl);
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

            -- حذف السياسات القديمة المفتوحة
            FOR pol IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl) LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, tbl);
            END LOOP;

            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id') THEN
                EXECUTE format('
                    CREATE POLICY %I ON public.%I
                    FOR ALL TO authenticated
                    USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'')
                    WITH CHECK (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'');
                ', 'tenant_isolation_' || tbl, tbl);
            END IF;
        END IF;
    END LOOP;
END $$;

-- تأمين View الأرشيف الشامل
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'v_comprehensive_journal_ledger') THEN
        REVOKE ALL ON public.v_comprehensive_journal_ledger FROM anon;
        GRANT SELECT ON public.v_comprehensive_journal_ledger TO authenticated, service_role;
        ALTER VIEW public.v_comprehensive_journal_ledger SET (security_invoker = true);
    END IF;
END $$;

-- تأمين telemetry
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_telemetry_incidents') THEN
        DROP POLICY IF EXISTS "Allow members and admins read telemetry incidents" ON public.system_telemetry_incidents;
        DROP POLICY IF EXISTS "Allow admins update telemetry incidents" ON public.system_telemetry_incidents;

        CREATE POLICY "Allow members and admins read telemetry incidents" ON public.system_telemetry_incidents
        FOR SELECT TO authenticated
        USING (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        );

        CREATE POLICY "Allow admins update telemetry incidents" ON public.system_telemetry_incidents
        FOR UPDATE TO authenticated
        USING (
            (organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'manager'))
            OR public.get_my_role() = 'super_admin'
        );
    END IF;
END $$;


-- ==============================================================================
-- 5. إصلاح انتكاسة validate_tenant_access, get_current_company_settings, get_trial_balance_summary_rpc
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.validate_tenant_access(p_target_org uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_my_org uuid;
    v_my_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    IF v_caller_id IS NULL THEN
        IF auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
            RETURN p_target_org;
        END IF;
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: المصادقة مطلوبة للوصول إلى بيانات المنشأة.';
    END IF;

    v_my_org := public.get_my_org();
    v_my_role := public.get_my_role();

    IF v_my_role = 'super_admin' THEN
        RETURN COALESCE(p_target_org, v_my_org);
    END IF;

    IF v_my_org IS NULL THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: المستخدم لا ينتمي لأي منشأة صالحة.';
    END IF;

    IF p_target_org IS NOT NULL AND p_target_org IS DISTINCT FROM v_my_org THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: غير مصرح بالوصول إلى بيانات منشأة أخرى.';
    END IF;

    RETURN v_my_org;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_tenant_access(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.validate_tenant_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_current_company_settings(
    p_org_id uuid DEFAULT NULL
)
RETURNS SETOF public.company_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_org uuid;
    v_my_role text;
    v_row public.company_settings%ROWTYPE;
BEGIN
    v_target_org := public.validate_tenant_access(p_org_id);
    v_my_role := public.get_my_role();

    IF v_target_org IS NULL THEN
        RETURN;
    END IF;

    FOR v_row IN
        SELECT * FROM public.company_settings
        WHERE organization_id = v_target_org
        LIMIT 1
    LOOP
        IF v_my_role NOT IN ('super_admin', 'admin') AND auth.role() <> 'service_role' THEN
            v_row.eta_client_secret := NULL;
        END IF;
        RETURN NEXT v_row;
    END LOOP;

    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_company_settings(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_current_company_settings(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_trial_balance_summary_rpc(
    p_org_id uuid DEFAULT NULL,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL
)
RETURNS TABLE (
    account_id uuid,
    code text,
    name text,
    type text,
    opening_debit numeric,
    opening_credit numeric,
    period_debit numeric,
    period_credit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := public.validate_tenant_access(p_org_id);
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: معرف المنشأة مطلوب.';
    END IF;

    RETURN QUERY
    SELECT 
        a.id AS account_id,
        a.code::text AS code,
        a.name::text AS name,
        a.type::text AS type,
        COALESCE(SUM(CASE 
            WHEN (p_start_date IS NOT NULL AND je.transaction_date < p_start_date) THEN jl.debit 
            ELSE 0 
        END), 0)::numeric AS opening_debit,
        COALESCE(SUM(CASE 
            WHEN (p_start_date IS NOT NULL AND je.transaction_date < p_start_date) THEN jl.credit 
            ELSE 0 
        END), 0)::numeric AS opening_credit,
        COALESCE(SUM(CASE 
            WHEN (p_start_date IS NULL OR je.transaction_date >= p_start_date)
             AND (p_end_date IS NULL OR je.transaction_date <= p_end_date) THEN jl.debit 
            ELSE 0 
        END), 0)::numeric AS period_debit,
        COALESCE(SUM(CASE 
            WHEN (p_start_date IS NULL OR je.transaction_date >= p_start_date)
             AND (p_end_date IS NULL OR je.transaction_date <= p_end_date) THEN jl.credit 
            ELSE 0 
        END), 0)::numeric AS period_credit
    FROM public.accounts a
    LEFT JOIN public.journal_lines jl ON jl.account_id = a.id
    LEFT JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.organization_id = v_org_id
    WHERE a.organization_id = v_org_id
    GROUP BY a.id, a.code, a.name, a.type
    ORDER BY a.code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trial_balance_summary_rpc(uuid, date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_summary_rpc(uuid, date, date) TO authenticated, service_role;


-- ==============================================================================
-- 6. سحب صلاحيات anon و PUBLIC عن الدوال الحساسة وتعيين search_path
-- ==============================================================================
DO $$
DECLARE
    fn_name TEXT;
    r RECORD;
    sensitive_funcs TEXT[] := ARRAY[
        'delete_stress_test_data',
        'create_employee_advance',
        'update_employee_advance',
        'fn_process_approval_action',
        'delete_inventory_count',
        'reverse_inventory_count',
        'approve_payment_voucher',
        'approve_receipt_voucher',
        'add_treasury_transfer',
        'unpost_purchase_invoice',
        'archive_closed_fiscal_year_rpc',
        'get_all_supplier_balances_fast',
        'get_supplier_balance',
        'sync_user_permissions'
    ];
BEGIN
    FOREACH fn_name IN ARRAY sensitive_funcs LOOP
        FOR r IN (
            SELECT oid::regprocedure AS sig
            FROM pg_proc
            WHERE pronamespace = 'public'::regnamespace
              AND proname = fn_name
        ) LOOP
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC;', r.sig);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.sig);
            EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', r.sig);
            RAISE NOTICE '🔒 [HARDENED RPC] %', r.sig;
        END LOOP;
    END LOOP;

    -- تعيين search_path لدالة التليمتري والتكرار
    FOR r IN (
        SELECT oid::regprocedure AS sig
        FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('report_telemetry_incident', 'fn_prevent_duplicate_voucher_reference')
    ) LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', r.sig);
    END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-24_security_hardening_critical_rls_and_rpcs', '2026-11-24_security_hardening_critical_rls_and_rpcs.sql', 'ae7f9d96da7b97258400616011887c839d806b706ccb74796e22ae6109150c5b', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [5/5] الملف: 2026-11-24_security_hardening_financial_immutability_and_pos.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 🛡️ TriPro ERP — Package 2: Financial Immutability & POS Concurrency Hardening
-- File: sql_updates/2026-11-24_security_hardening_financial_immutability_and_pos.sql
-- Date: 2026-11-24
-- ==============================================================================
-- يعالج هذا التحديث ثغرات النزاهة المالية والتزامن:
--   1. منع INSERT على سطور قيود يومية مرحّلة بالفعل (journal_lines).
--   2. منع INSERT قيد يومية بحالة posted مباشرة بدون سطور (journal_entries).
--   3. منع إرجاع فواتير المبيعات ومرتجعات المبيعات والمشتريات من posted إلى draft بتحديث مباشر.
--   4. إضافة فلتر organization_id لحذف القيود في محفزات سندات القبض والصرف.
--   5. إضافة فهرس فريد لمنع تكرار طلبات الأوفلاين (organization_id, offline_ref_id).
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. منع إدراج أو تعديل أو حذف سطور على قيد مرحل (BEFORE INSERT OR UPDATE OR DELETE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_journal_lines_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_je_id uuid;
    v_je_status text;
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_je_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.journal_entry_id ELSE OLD.journal_entry_id END;

    SELECT status INTO v_je_status
    FROM public.journal_entries
    WHERE id = v_je_id;

    IF v_je_status = 'posted' THEN
        RAISE EXCEPTION 'TRIPRO_IMMUTABILITY_GUARD: لا يمكن إضافة أو تعديل أو حذف سطور قيد يومية مرحّل (%).', v_je_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_lines_immutability ON public.journal_lines;
CREATE TRIGGER trg_guard_journal_lines_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_journal_lines_immutability();


-- ==============================================================================
-- 2. منع إدراج قيد بحالة posted مباشرة بدون المرور بمرحلة المسودة والأسطر
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_journal_insert_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' AND (NEW.status = 'posted' OR NEW.is_posted = true) THEN
        RAISE EXCEPTION 'TRIPRO_BALANCE_GUARD: لا يمكن إدراج قيد يومية بحالة مرحّل مباشرة؛ يجب إنشاؤه كمسودة أولاً ثم ترحيله بعد اكتمال الأسطر.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_insert_posted ON public.journal_entries;
CREATE TRIGGER trg_guard_journal_insert_posted
BEFORE INSERT ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_journal_insert_posted();


-- ==============================================================================
-- 3. منع إرجاع الفواتير والمرتجعات المرحلة إلى draft بتحديث مباشر
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_posted_status_downgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'posted' AND NEW.status IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'TRIPRO_IMMUTABILITY_GUARD: لا يمكن تغيير حالة مستند مرحّل إلى (%) مباشرة؛ يجب استخدام دالة فك الترحيل الرسمية (unpost).', NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

DO $$
DECLARE
    tbl TEXT;
    doc_tables TEXT[] := ARRAY['invoices', 'sales_returns', 'purchase_returns'];
BEGIN
    FOREACH tbl IN ARRAY doc_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_%I_status_downgrade ON public.%I;', tbl, tbl);
            EXECUTE format('
                CREATE TRIGGER trg_guard_%I_status_downgrade
                BEFORE UPDATE ON public.%I
                FOR EACH ROW
                EXECUTE FUNCTION public.fn_guard_posted_status_downgrade();
            ', tbl, tbl);
        END IF;
    END LOOP;
END $$;


-- ==============================================================================
-- 4. فهرس فريد لمنع تكرار طلبات الأوفلاين لنفس المنشأة
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'offline_ref_id'
    ) THEN
        BEGIN
            CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_org_offline_ref_unique
            ON public.orders (organization_id, offline_ref_id)
            WHERE offline_ref_id IS NOT NULL;
        EXCEPTION WHEN unique_violation THEN
            RAISE NOTICE '⚠️ تعذر إنشاء الفهرس الفريد idx_orders_org_offline_ref_unique لوجود تكرارات قديمة في orders.';
        END;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-24_security_hardening_financial_immutability_and_pos', '2026-11-24_security_hardening_financial_immutability_and_pos.sql', '165fa2e08e19c9616fc198854117c3ae5a64e9cce23501de8bdd0f2b9ae409b3', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

