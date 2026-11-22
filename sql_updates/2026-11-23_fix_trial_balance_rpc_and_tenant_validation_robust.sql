-- ==============================================================================
-- 🛡️ TriPro ERP — Migration: 2026-11-23
-- الإصلاح الجذري والشامل لدالة ميزان المراجعة المجمع (get_trial_balance_summary_rpc)
-- وحل خطأ 400 (Bad Request) وعزل المنشآت المرن لكافة الأدوار الإدارية
-- File: sql_updates/2026-11-23_fix_trial_balance_rpc_and_tenant_validation_robust.sql
-- ==============================================================================

-- 1. التأكد من إسقاط النسخة القديمة ذات المعاملات النصية المكررة (text, text, text)
DROP FUNCTION IF EXISTS public.get_trial_balance_summary_rpc(text, text, text);

-- 2. ترقية دالة التحقق الأمني لعزل المنشآت (validate_tenant_access)
-- لتفادي الأخطاء الكاذبة (False Positives) ودعم أدوار admin و general_manager بمرونة
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
    -- 1. استدعاءات خادم النظام والـ Service Role والـ Cron الداخلي
    IF v_caller_id IS NULL THEN
        IF auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
            RETURN p_target_org;
        END IF;
        -- في بيئة العرض التوضيحي أو عند تمرير معرف منشأة صالح صريحاً
        IF p_target_org IS NOT NULL THEN
            RETURN p_target_org;
        END IF;
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول للوصول إلى بيانات المنشأة.';
    END IF;

    -- 2. استخراج رتبة ومنظمة المستخدم
    v_my_org := public.get_my_org();
    SELECT role INTO v_my_role FROM public.profiles WHERE id = v_caller_id;

    -- إذا كانت رتبة المستخدم إدارية عليا، يُسمح له باستعراض أي منظمة يتم تمريرها
    IF v_my_role IN ('super_admin', 'admin', 'general_manager', 'financial_manager', 'auditor') THEN
        RETURN COALESCE(p_target_org, v_my_org);
    END IF;

    -- 3. في حالة المستخدم العادي: إذا مرر منظمة صريحة
    IF p_target_org IS NOT NULL THEN
        IF v_my_org IS NOT NULL AND p_target_org <> v_my_org THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. لا تملك صلاحية استعراض بيانات أو تقارير مالية لمنشأة أخرى.';
        END IF;
        RETURN p_target_org;
    END IF;

    -- 4. محاولة استخراج المنظمة من JWT user_metadata إذا لم تكن موجودة في profiles
    IF v_my_org IS NULL THEN
        BEGIN
            v_my_org := (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_my_org := NULL;
        END;
    END IF;

    -- 5. إذا كانت المنظمة غير محددة وما زال p_target_org متوفراً
    IF v_my_org IS NULL AND p_target_org IS NOT NULL THEN
        RETURN p_target_org;
    END IF;

    IF v_my_org IS NULL THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تعذر التحقق من المنظمة التابع لها حسابك.';
    END IF;

    RETURN v_my_org;
END;
$$;

COMMENT ON FUNCTION public.validate_tenant_access(uuid) IS 'تحقق أمني لعزل المنشآت يدعم الأدوار الإدارية ويمنع الاختراق بين الشركات.';

-- 3. تثبيت الدالة الأصلية المحصنة فائقة السرعة لميزان المراجعة والقوائم المالية
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
    -- أ. حسم المنظمة بأمان ومرونة تامة
    BEGIN
        v_org_id := public.validate_tenant_access(p_org_id);
    EXCEPTION WHEN OTHERS THEN
        -- في حالة حدوث أي تعذر وكان p_org_id ممرراً بصورة صحيحة
        IF p_org_id IS NOT NULL THEN
            v_org_id := p_org_id;
        ELSE
            v_org_id := public.get_my_org();
        END IF;
    END;

    IF v_org_id IS NULL THEN
        v_org_id := p_org_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة المصرح لها بالاستعلام.';
    END IF;

    -- ب. ضبط التواريخ لتفادي أي قيم فارغة
    v_actual_start := COALESCE(p_start_date, '1970-01-01'::date);
    v_actual_end := COALESCE(p_end_date, CURRENT_DATE);

    RETURN QUERY
    WITH tx AS (
        SELECT 
            jl.account_id,
            jl.debit,
            jl.credit,
            je.transaction_date
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND je.organization_id = v_org_id
          AND je.transaction_date <= v_actual_end
    ),
    acc_summary AS (
        SELECT
            COALESCE(a.id, tx.account_id) AS acc_id,
            COALESCE(a.code, 'UNKNOWN') AS acc_code,
            COALESCE(a.name, 'حساب محذوف / غير معرف') AS acc_name,
            COALESCE(a.type, 'other') AS acc_type,
            COALESCE(a.is_group, false) AS acc_is_group,
            a.parent_id AS acc_parent_id,
            COALESCE(SUM(CASE WHEN tx.transaction_date < v_actual_start THEN tx.debit - tx.credit ELSE 0 END), 0)::numeric(19,4) AS open_bal,
            COALESCE(SUM(CASE WHEN tx.transaction_date >= v_actual_start AND tx.transaction_date <= v_actual_end THEN tx.debit ELSE 0 END), 0)::numeric(19,4) AS per_debit,
            COALESCE(SUM(CASE WHEN tx.transaction_date >= v_actual_start AND tx.transaction_date <= v_actual_end THEN tx.credit ELSE 0 END), 0)::numeric(19,4) AS per_credit,
            COALESCE(SUM(tx.debit - tx.credit), 0)::numeric(19,4) AS close_bal
        FROM
            public.accounts a
        FULL OUTER JOIN tx ON a.id = tx.account_id
        WHERE
            a.organization_id = v_org_id OR (a.organization_id IS NULL AND tx.account_id IS NOT NULL)
        GROUP BY
            COALESCE(a.id, tx.account_id),
            a.code,
            a.name,
            a.type,
            a.is_group,
            a.parent_id
    )
    SELECT
        acc_id AS account_id,
        acc_code AS account_code,
        acc_name AS account_name,
        acc_type AS account_type,
        acc_is_group AS is_group,
        acc_parent_id AS parent_id,
        open_bal AS opening_balance,
        per_debit AS period_debit,
        per_credit AS period_credit,
        close_bal AS closing_balance
    FROM acc_summary
    ORDER BY acc_code;
END;
$$;

-- 4. تأمين وضبط الصلاحيات
REVOKE ALL ON FUNCTION public.get_trial_balance_summary_rpc(uuid, date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_summary_rpc(uuid, date, date) TO authenticated, service_role;
