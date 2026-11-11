-- =============================================================================
-- FILE: 2026-11-11_secure_mv_trial_balance.sql
-- DATE: 2026-11-11
-- AUTHOR: TriPro ERP Security Hardening
-- PRIORITY: HIGH (Production Security Hardening - Lenza Safe)
--
-- PURPOSE (EN):
--   1. Move public.mv_trial_balance out of the API-exposed `public` schema
--      into a dedicated non-exposed `private` schema so it cannot be queried
--      directly via Supabase REST/Data API and no longer triggers the
--      UNRESTRICTED / materialized_view_in_api security exposure.
--   2. Revoke all direct privileges on `private` schema and `private.mv_trial_balance`
--      from PUBLIC, anon, and authenticated roles.
--   3. Update `public.get_trial_balance_mv(uuid)` and `public.refresh_trial_balance_mv()`
--      to reference `private.mv_trial_balance` via SECURITY DEFINER while
--      preserving strict tenant isolation (`validate_tenant_access`) and
--      revoking anon/public EXECUTE privileges.
--
-- الهدف (AR):
--   1. نقل طريقة العرض المادية `mv_trial_balance` من المخطط العام `public`
--      إلى مخطط داخلي خاص `private` غير مكشوف عبر Data API، لإغلاق أي قراءة
--      مباشرة لأرصدة جميع المنشآت وإزالة تحذير UNRESTRICTED.
--   2. سحب كافة الصلاحيات المباشرة على مخطط `private` وعلى `private.mv_trial_balance`
--      من `PUBLIC` و `anon` و `authenticated`.
--   3. تحديث الدالتين `get_trial_balance_mv` و `refresh_trial_balance_mv` للعمل
--      على `private.mv_trial_balance` مع الحفاظ على عزل منشأة شركة لينزا
--      وسحب صلاحية التنفيذ عن `anon` و `public`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. إنشاء المخطط الداخلي الخاص وعزله عن Data API
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- ---------------------------------------------------------------------------
-- 2. نقل mv_trial_balance إلى المخطط private (أو إنشاؤه فيه إن لم يكن موجوداً)
--    مع الحفاظ التام على البيانات والفهارس القائمة دون إسقاط أو انقطاع
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_exists_in_public  boolean;
    v_exists_in_private boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_matviews
        WHERE schemaname = 'public'
          AND matviewname = 'mv_trial_balance'
    ) INTO v_exists_in_public;

    SELECT EXISTS (
        SELECT 1
        FROM pg_matviews
        WHERE schemaname = 'private'
          AND matviewname = 'mv_trial_balance'
    ) INTO v_exists_in_private;

    IF v_exists_in_public AND NOT v_exists_in_private THEN
        ALTER MATERIALIZED VIEW public.mv_trial_balance SET SCHEMA private;
        RAISE NOTICE '[sec-mv] ✅ Moved public.mv_trial_balance -> private.mv_trial_balance.';
    ELSIF v_exists_in_public AND v_exists_in_private THEN
        DROP MATERIALIZED VIEW public.mv_trial_balance;
        RAISE NOTICE '[sec-mv] ✅ Removed duplicate public.mv_trial_balance (private copy already exists).';
    ELSIF NOT v_exists_in_private THEN
        CREATE MATERIALIZED VIEW private.mv_trial_balance AS
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

        RAISE NOTICE '[sec-mv] ✅ Created private.mv_trial_balance.';
    ELSE
        RAISE NOTICE '[sec-mv] ℹ️ private.mv_trial_balance already exists — no move needed.';
    END IF;
END;
$$;

-- التأكد من وجود الفهارس الضرورية للتحديث المتزامن (CONCURRENTLY) وأداء الاستعلام
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trial_balance_org_acc
    ON private.mv_trial_balance(organization_id, account_id);

CREATE INDEX IF NOT EXISTS idx_mv_trial_balance_org
    ON private.mv_trial_balance(organization_id);

-- سحب كافة الصلاحيات المباشرة على الـ Materialized View من أدوار الـ API
REVOKE ALL ON private.mv_trial_balance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON private.mv_trial_balance TO service_role;

-- ---------------------------------------------------------------------------
-- 3. تحديث وتحصين دالة القراءة get_trial_balance_mv(uuid)
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
SET search_path = public, private
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- عزل صارم للمنشأة (يرفض anon وأي محاولة لقراءة منشأة أخرى)
    v_org_id := public.validate_tenant_access(p_org_id);

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
    FROM private.mv_trial_balance mv
    WHERE mv.organization_id = v_org_id
    ORDER BY mv.account_code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trial_balance_mv(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_mv(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. تحديث وتحصين دالة التحديث refresh_trial_balance_mv()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_trial_balance_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
    IF auth.uid() IS NULL
       AND NOT (auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role', 'supabase_admin')) THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: غير مصرح بتحديث ميزان المراجعة بدون تسجيل دخول.';
    END IF;

    REFRESH MATERIALIZED VIEW CONCURRENTLY private.mv_trial_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_trial_balance_mv() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_trial_balance_mv() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. رسالة تأكيد التحقق
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE schemaname = 'private' AND matviewname = 'mv_trial_balance'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE schemaname = 'public' AND matviewname = 'mv_trial_balance'
    ) THEN
        RAISE NOTICE '✅ [2026-11-11_secure_mv_trial_balance]: mv_trial_balance secured in private schema successfully.';
    ELSE
        RAISE WARNING '⚠️ [2026-11-11_secure_mv_trial_balance]: Unexpected schema state for mv_trial_balance — please inspect pg_matviews.';
    END IF;
END;
$$;
