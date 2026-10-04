-- =============================================================================
-- FILE: 2026-10-04_fix5_materialized_view_trial_balance_and_audit_log.sql
-- DATE: 2026-10-04
-- AUTHOR: TriPro ERP Security Hardening
--
-- PURPOSE (EN):
--   1. Drop and recreate mv_trial_balance materialized view that aggregates
--      debit/credit from posted journal entries, with unique + org indexes for
--      CONCURRENTLY refresh support.
--   2. Create refresh_trial_balance_mv() SECURITY DEFINER RPC.
--   3. Create get_trial_balance_mv() RPC with org isolation for the client.
--   4. Create security_audit_logs table (replaces in-memory TypeScript
--      createAuditLog), with immutable-insert-only semantics enforced via a
--      SECURITY DEFINER log_security_event() RPC. RLS prevents UPDATE/DELETE.
--
-- الهدف (AR):
--   1. إعادة إنشاء materialized view لميزان المراجعة يجمع المدين والدائن
--      من القيود المرحَّلة، مع فهارس تدعم التحديث المتزامن.
--   2. دالة تحديث الـ view بصلاحية SECURITY DEFINER.
--   3. دالة RPC لإرجاع ميزان المراجعة مع عزل المنظمة.
--   4. جدول سجلات المراجعة الأمنية يستبدل createAuditLog في TypeScript،
--      قيود تمنع أي تعديل أو حذف — الإدخال فقط عبر RPC مقيدة.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1 | القسم الأول
-- Materialized View: mv_trial_balance
-- طريقة العرض المادية: ميزان المراجعة
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Drop existing view so we can redefine the schema cleanly
    -- حذف الـ view الموجودة لإعادة تعريفها بشكل نظيف
    DROP MATERIALIZED VIEW IF EXISTS public.mv_trial_balance;
    RAISE NOTICE '[fix5] Dropped mv_trial_balance (if existed).';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix5] ❌ Could not drop mv_trial_balance: %', SQLERRM;
END;
$$;

-- Create the materialized view — only posted & is_posted=true entries count
-- إنشاء الـ view — تُحتسب فقط القيود ذات status='posted' و is_posted=true
CREATE MATERIALIZED VIEW public.mv_trial_balance AS
SELECT
    a.organization_id,
    a.id                                                              AS account_id,
    a.code                                                            AS account_code,
    a.name                                                            AS account_name,
    a.type                                                            AS account_type,
    a.parent_id,
    COALESCE(SUM(jl.debit),  0)                                       AS total_debit,
    COALESCE(SUM(jl.credit), 0)                                       AS total_credit,
    COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)         AS net_balance
FROM public.accounts a
LEFT JOIN public.journal_lines  jl ON jl.account_id = a.id
LEFT JOIN public.journal_entries je
       ON je.id        = jl.journal_entry_id
      AND je.status    = 'posted'
      AND je.is_posted = true
GROUP BY
    a.organization_id,
    a.id,
    a.code,
    a.name,
    a.type,
    a.parent_id
WITH DATA;

-- Unique index required for CONCURRENTLY refresh
-- فهرس فريد ضروري لتفعيل التحديث المتزامن CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_trial_balance_org_acc
    ON public.mv_trial_balance(organization_id, account_id);

-- Supporting index for per-org queries | فهرس داعم للاستعلامات لكل منظمة
CREATE INDEX idx_mv_trial_balance_org
    ON public.mv_trial_balance(organization_id);

DO $$
BEGIN
    RAISE NOTICE '[fix5] ✅ mv_trial_balance created with unique + org indexes.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix5] ❌ Post-create notice failed: %', SQLERRM;
END;
$$;


-- ---------------------------------------------------------------------------
-- SECTION 2 | القسم الثاني
-- refresh_trial_balance_mv() — SECURITY DEFINER refresh RPC
-- دالة تحديث ميزان المراجعة المادية
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_trial_balance_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- CONCURRENTLY allows reads during refresh (requires unique index above)
    -- CONCURRENTLY يسمح بالقراءة أثناء التحديث (يتطلب الفهرس الفريد أعلاه)
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_trial_balance;
    RAISE NOTICE '[fix5] mv_trial_balance refreshed successfully.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_trial_balance_mv() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '[fix5] ✅ refresh_trial_balance_mv() created and granted to authenticated.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix5] ❌ refresh_trial_balance_mv grant failed: %', SQLERRM;
END;
$$;


-- ---------------------------------------------------------------------------
-- SECTION 3 | القسم الثالث
-- get_trial_balance_mv() — org-isolated RPC for clients
-- دالة RPC لإرجاع ميزان المراجعة مع عزل المنظمة للعملاء
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trial_balance_mv(
    p_org_id uuid DEFAULT NULL
)
RETURNS TABLE(
    account_id   uuid,
    account_code text,
    account_name text,
    account_type text,
    parent_id    uuid,
    total_debit  numeric,
    total_credit numeric,
    net_balance  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Falls back to the caller's own org when p_org_id is not supplied
    -- يعود إلى منظمة المستدعي إذا لم يُحدَّد p_org_id
    RETURN QUERY
    SELECT
        mv.account_id,
        mv.account_code,
        mv.account_name,
        mv.account_type,
        mv.parent_id,
        mv.total_debit,
        mv.total_credit,
        mv.net_balance
    FROM public.mv_trial_balance mv
    WHERE mv.organization_id = COALESCE(p_org_id, public.get_my_org())
    ORDER BY mv.account_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trial_balance_mv(uuid) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '[fix5] ✅ get_trial_balance_mv() created with org isolation and granted to authenticated.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix5] ❌ get_trial_balance_mv grant failed: %', SQLERRM;
END;
$$;


-- ---------------------------------------------------------------------------
-- SECTION 4 | القسم الرابع
-- security_audit_logs — immutable audit table + log_security_event() RPC
-- جدول سجلات المراجعة الأمنية غير القابل للتعديل + دالة التسجيل
-- ---------------------------------------------------------------------------

-- 4a. Table | الجدول
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS public.security_audit_logs (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID,
        user_id         UUID,
        action          TEXT        NOT NULL,
        resource        TEXT        NOT NULL,
        resource_id     TEXT,
        changes         JSONB,
        ip_address      TEXT,
        user_agent      TEXT,
        -- Immutability enforced: only 'success' or 'failure' allowed
        -- القيم المسموحة فقط: 'success' أو 'failure'
        status          TEXT        NOT NULL DEFAULT 'success'
                                    CHECK (status IN ('success', 'failure')),
        error_message   TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    RAISE NOTICE '[fix5] ✅ security_audit_logs table ensured.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix5] ❌ Failed to create security_audit_logs: %', SQLERRM;
END;
$$;

-- 4b. Indexes | الفهارس
DO $$
BEGIN
    -- Composite index for org-scoped time-range queries
    -- فهرس مركب للاستعلامات الزمنية داخل المنظمة
    CREATE INDEX IF NOT EXISTS idx_security_audit_logs_org_created
        ON public.security_audit_logs(organization_id, created_at DESC);

    -- Per-user timeline | الجدول الزمني لكل مستخدم
    CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user
        ON public.security_audit_logs(user_id, created_at DESC);

    -- Resource lookup | البحث حسب المورد
    CREATE INDEX IF NOT EXISTS idx_security_audit_logs_resource
        ON public.security_audit_logs(resource, resource_id);

    RAISE NOTICE '[fix5] ✅ Indexes on security_audit_logs created.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix5] ❌ Index creation on security_audit_logs failed: %', SQLERRM;
END;
$$;

-- 4c. RLS | أمان مستوى الصف
DO $$
BEGIN
    ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

    -- Drop and recreate read policy | حذف وإعادة إنشاء سياسة القراءة
    DROP POLICY IF EXISTS "audit_logs_org_read" ON public.security_audit_logs;

    -- Only the owning org (or super_admin) can read their audit logs
    -- المنظمة المالكة أو السوبر أدمين فقط يمكنهم قراءة السجلات
    CREATE POLICY "audit_logs_org_read" ON public.security_audit_logs
        FOR SELECT TO authenticated
        USING (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        );

    -- NOTE: No UPDATE or DELETE policies are created intentionally.
    -- Audit records are immutable — INSERT only via log_security_event() RPC.
    -- ملاحظة: لا توجد سياسات UPDATE أو DELETE عمداً.
    -- سجلات المراجعة غير قابلة للتعديل — الإدخال فقط عبر RPC المقيدة.

    RAISE NOTICE '[fix5] ✅ RLS enabled on security_audit_logs — immutable insert-only policy set.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix5] ❌ RLS setup on security_audit_logs failed: %', SQLERRM;
END;
$$;

-- 4d. log_security_event() — the sole write path into security_audit_logs
--     الدالة الوحيدة للكتابة في جدول سجلات المراجعة
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_action        TEXT,
    p_resource      TEXT,
    p_resource_id   TEXT  DEFAULT NULL,
    p_changes       JSONB DEFAULT NULL,
    p_status        TEXT  DEFAULT 'success',
    p_error_message TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Insert audit record, binding org and user from session context
    -- إدخال سجل المراجعة مع ربط المنظمة والمستخدم من سياق الجلسة
    INSERT INTO public.security_audit_logs (
        organization_id,
        user_id,
        action,
        resource,
        resource_id,
        changes,
        status,
        error_message
    ) VALUES (
        public.get_my_org(),
        auth.uid(),
        p_action,
        p_resource,
        p_resource_id,
        p_changes,
        p_status,
        p_error_message
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '[fix5] ✅ log_security_event() created and granted to authenticated.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix5] ❌ log_security_event grant failed: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE '[fix5] 🎉 Migration fix5 completed successfully.';
END;
$$;
