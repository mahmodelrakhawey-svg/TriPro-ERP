-- ==============================================================================
-- 🛡️ TriPro ERP — Migration: 2026-11-22
-- إزالة تعارض الدالة المكررة get_trial_balance_summary_rpc لتفادي خطأ PGRST203 والـ 500 Timeout
-- File: sql_updates/2026-11-22_fix_trial_balance_rpc_overload_and_timeout.sql
-- ==============================================================================

-- 1. إسقاط النسخة القديمة ذات المعاملات النصية المكررة (text, text, text)
-- التي كانت تسبب تعارض PostgREST (PGRST203: Could not choose the best candidate function)
DROP FUNCTION IF EXISTS public.get_trial_balance_summary_rpc(text, text, text);

-- 2. تأكيد وتثبيت الدالة الأصلية المحصنة بعزل المنشآت (uuid, date, date)
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
BEGIN
    -- 🛡️ فرض عزل المنشآت الصارم
    v_org_id := public.validate_tenant_access(p_org_id);

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
          AND je.transaction_date <= p_end_date
    ),
    acc_summary AS (
        SELECT
            COALESCE(a.id, tx.account_id) AS acc_id,
            COALESCE(a.code, 'UNKNOWN') AS acc_code,
            COALESCE(a.name, 'حساب محذوف / غير معرف') AS acc_name,
            COALESCE(a.type, 'other') AS acc_type,
            COALESCE(a.is_group, false) AS acc_is_group,
            a.parent_id AS acc_parent_id,
            COALESCE(SUM(CASE WHEN tx.transaction_date < p_start_date THEN tx.debit - tx.credit ELSE 0 END), 0)::numeric(19,4) AS open_bal,
            COALESCE(SUM(CASE WHEN tx.transaction_date >= p_start_date AND tx.transaction_date <= p_end_date THEN tx.debit ELSE 0 END), 0)::numeric(19,4) AS per_debit,
            COALESCE(SUM(CASE WHEN tx.transaction_date >= p_start_date AND tx.transaction_date <= p_end_date THEN tx.credit ELSE 0 END), 0)::numeric(19,4) AS per_credit,
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

-- 3. تأمين الصلاحيات: حظر anon ومنح authenticated و service_role
REVOKE ALL ON FUNCTION public.get_trial_balance_summary_rpc(uuid, date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_summary_rpc(uuid, date, date) TO authenticated, service_role;
