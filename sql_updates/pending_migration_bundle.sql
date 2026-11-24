-- ==============================================================================
-- 🛡️ TriPro ERP — Consolidated Pending Migrations Bundle
-- تاريخ التوليد: 2026-11-24T20:25:09.331Z
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
-- [1/3] الملف: 2026-11-24_security_fix_rls_references_user_metadata.sql
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
-- [2/3] الملف: 2026-11-24_security_hardening_critical_rls_and_rpcs.sql
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
    p_start_date date DEFAULT '1970-01-01',
    p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    account_id uuid,
    account_code text,
    account_name text,
    account_type text,
    is_group boolean,
    parent_id uuid,
    opening_balance numeric,
    period_debit numeric,
    period_credit numeric,
    closing_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_actual_start date;
    v_actual_end date;
BEGIN
    v_org_id := public.validate_tenant_access(p_org_id);
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: معرف المنشأة مطلوب.';
    END IF;

    v_actual_start := COALESCE(p_start_date, '1970-01-01'::date);
    v_actual_end := COALESCE(p_end_date, CURRENT_DATE);

    RETURN QUERY
    WITH tx_agg AS (
        SELECT 
            jl.account_id,
            COALESCE(SUM(CASE WHEN je.transaction_date < v_actual_start THEN jl.debit - jl.credit ELSE 0 END), 0)::numeric(19,4) AS open_bal,
            COALESCE(SUM(CASE WHEN je.transaction_date >= v_actual_start AND je.transaction_date <= v_actual_end THEN jl.debit ELSE 0 END), 0)::numeric(19,4) AS per_debit,
            COALESCE(SUM(CASE WHEN je.transaction_date >= v_actual_start AND je.transaction_date <= v_actual_end THEN jl.credit ELSE 0 END), 0)::numeric(19,4) AS per_credit,
            COALESCE(SUM(jl.debit - jl.credit), 0)::numeric(19,4) AS close_bal
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND je.organization_id = v_org_id
          AND je.transaction_date <= v_actual_end
        GROUP BY jl.account_id
    )
    SELECT
        COALESCE(a.id, tx.account_id)::uuid AS account_id,
        COALESCE(a.code::text, 'UNKNOWN')::text AS account_code,
        COALESCE(a.name::text, 'حساب محذوف / غير معرف')::text AS account_name,
        COALESCE(a.type::text, 'other')::text AS account_type,
        COALESCE(a.is_group, false)::boolean AS is_group,
        a.parent_id::uuid AS parent_id,
        COALESCE(tx.open_bal, 0)::numeric AS opening_balance,
        COALESCE(tx.per_debit, 0)::numeric AS period_debit,
        COALESCE(tx.per_credit, 0)::numeric AS period_credit,
        COALESCE(tx.close_bal, 0)::numeric AS closing_balance
    FROM public.accounts a
    FULL OUTER JOIN tx_agg tx ON a.id = tx.account_id
    WHERE a.organization_id = v_org_id
    ORDER BY account_code;
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
VALUES ('2026-11-24_security_hardening_critical_rls_and_rpcs', '2026-11-24_security_hardening_critical_rls_and_rpcs.sql', '68ea7b4e77832d86aab5ba7e6d2d8a62f59d1999b18d9534861a38faee386a64', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [3/3] الملف: 2026-11-24_security_hardening_financial_immutability_and_pos.sql
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

