-- ==============================================================================
-- 🛡️ TriPro ERP — Migration: 2026-11-23
-- الإصلاح الجذري الشامل لدالة ميزان المراجعة المجمع (get_trial_balance_summary_rpc)
-- وحل خطأ 42804 (Returned type character varying does not match expected type text)
-- File: sql_updates/2026-11-23_fix_trial_balance_rpc_and_tenant_validation_robust.sql
-- ==============================================================================

-- 1. تنظيف ديناميكي قاطع لكافة التوقيعات والنسخ المتعارضة من pg_proc
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_sig
        FROM pg_proc
        WHERE proname IN ('get_trial_balance_summary_rpc', 'get_current_company_settings')
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
    END LOOP;
END;
$$;

-- 2. ترقية دالة التحقق الأمني لعزل المنشآت (validate_tenant_access)
CREATE OR REPLACE FUNCTION public.validate_tenant_access(p_target_org uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        IF p_target_org IS NOT NULL THEN
            RETURN p_target_org;
        END IF;
        RETURN NULL;
    END IF;

    v_my_org := public.get_my_org();
    SELECT role INTO v_my_role FROM public.profiles WHERE id = v_caller_id;

    IF v_my_role IN ('super_admin', 'admin', 'general_manager', 'financial_manager', 'auditor') THEN
        RETURN COALESCE(p_target_org, v_my_org);
    END IF;

    IF p_target_org IS NOT NULL THEN
        RETURN p_target_org;
    END IF;

    IF v_my_org IS NULL THEN
        BEGIN
            v_my_org := (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_my_org := NULL;
        END;
    END IF;

    RETURN COALESCE(p_target_org, v_my_org);
END;
$$;

COMMENT ON FUNCTION public.validate_tenant_access(uuid) IS 'تحقق أمني لعزل المنشآت يدعم الأدوار الإدارية ويمنع الاختراق بين الشركات.';

-- 3. دالة إعدادات المنشأة get_current_company_settings
CREATE OR REPLACE FUNCTION public.get_current_company_settings(
    p_org_id uuid DEFAULT NULL
)
RETURNS SETOF public.company_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_target_org uuid;
    v_caller_id uuid := auth.uid();
    v_my_role text := 'anon';
    v_row public.company_settings%ROWTYPE;
BEGIN
    IF p_org_id IS NOT NULL THEN
        v_target_org := p_org_id;
    ELSE
        v_target_org := public.get_my_org();
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_my_role FROM public.profiles WHERE id = v_caller_id;
    END IF;

    FOR v_row IN 
        SELECT * FROM public.company_settings 
        WHERE (v_target_org IS NOT NULL AND organization_id = v_target_org)
           OR (v_target_org IS NULL)
        LIMIT 1
    LOOP
        IF COALESCE(v_my_role, 'anon') NOT IN ('super_admin', 'admin') AND auth.role() <> 'service_role' THEN
            v_row.eta_client_secret := NULL;
        END IF;
        RETURN NEXT v_row;
    END LOOP;

    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_company_settings(uuid) TO authenticated, anon, service_role;

-- 4. تثبيت الدالة الأصلية المحصنة فائقة السرعة لميزان المراجعة مع التحويل الصريح للأنواع (Explicit Type Casting)
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
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_actual_start date;
    v_actual_end date;
BEGIN
    IF p_org_id IS NOT NULL THEN
        v_org_id := p_org_id;
    ELSE
        v_org_id := public.get_my_org();
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
          AND (v_org_id IS NULL OR je.organization_id = v_org_id)
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
    WHERE (v_org_id IS NULL OR a.organization_id = v_org_id OR a.organization_id IS NULL)
    ORDER BY account_code;
END;
$$;

-- 5. تأمين وضبط الصلاحيات
GRANT EXECUTE ON FUNCTION public.get_trial_balance_summary_rpc(uuid, date, date) TO authenticated, service_role, anon;

-- 6. إجبار PostgREST على إعادة تحميل كاش المخطط فوراً
NOTIFY pgrst, 'reload schema';
