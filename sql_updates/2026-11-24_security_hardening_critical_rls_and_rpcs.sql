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
