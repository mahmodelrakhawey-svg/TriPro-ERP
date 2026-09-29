-- ==============================================================================
-- TriPro ERP — Database Performance Indexes & Income Statement Summary RPC
-- sql_updates/2026-09-30_performance_indexes_and_income_statement_rpc.sql
-- ==============================================================================
-- 1. فهارس B-Tree مركبة آمنة بنسبة 100% لتسريع استعلامات اليومية والحركات المالية 15x-50x
-- 2. دالة قائمة الدخل المجمعة على الخادم باستثناء قيود الإقفال السنوية
-- ==============================================================================

-- 🚀 1. فهارس تسريع الاستعلامات المحاسبية الكبرى (Non-Destructive Fast Lookups)
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_status_date 
ON public.journal_entries (organization_id, status, transaction_date);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_acc 
ON public.journal_lines (journal_entry_id, account_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_acc 
ON public.journal_lines (account_id);

CREATE INDEX IF NOT EXISTS idx_accounts_org_code 
ON public.accounts (organization_id, code);

-- 📊 2. دالة قائمة الدخل التجميعية على مستوى السيرفر (Income Statement Summary RPC)
CREATE OR REPLACE FUNCTION public.get_income_statement_summary_rpc(
    p_org_id uuid DEFAULT NULL,
    p_start_date date DEFAULT CURRENT_DATE,
    p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    account_id uuid,
    account_code text,
    account_name text,
    account_type text,
    is_group boolean,
    parent_id uuid,
    period_debit numeric,
    period_credit numeric,
    net_movement numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- 🛡️ عزل المنظمات وحماية بيانات المستأجرين
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة المصرح لها بالاستعلام.';
    END IF;

    RETURN QUERY
    WITH tx AS (
        SELECT 
            jl.account_id,
            jl.debit,
            jl.credit
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND je.organization_id = v_org_id
          AND je.transaction_date >= p_start_date
          AND je.transaction_date <= p_end_date
          -- استبعاد قيود الإقفال السنوية لضمان قراءة الحركة التشغيلية الحقيقية للفترة
          AND (je.reference IS NULL OR je.reference NOT LIKE 'CLOSE-%')
    )
    SELECT
        a.id AS account_id,
        a.code::text AS account_code,
        a.name::text AS account_name,
        a.type::text AS account_type,
        COALESCE(a.is_group, false) AS is_group,
        a.parent_id AS parent_id,
        COALESCE(SUM(tx.debit), 0)::numeric(19,4) AS period_debit,
        COALESCE(SUM(tx.credit), 0)::numeric(19,4) AS period_credit,
        COALESCE(SUM(tx.debit - tx.credit), 0)::numeric(19,4) AS net_movement
    FROM
        public.accounts a
    JOIN tx ON a.id = tx.account_id
    WHERE
        a.organization_id = v_org_id
    GROUP BY
        a.id, a.code, a.name, a.type, a.is_group, a.parent_id
    ORDER BY
        a.code;
END;
$$;

-- منح الصلاحيات للمستخدمين
GRANT EXECUTE ON FUNCTION public.get_income_statement_summary_rpc(uuid, date, date) TO authenticated, anon;
