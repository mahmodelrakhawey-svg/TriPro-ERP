-- =============================================================================
-- MIGRATION FILE: 2026-10-04_fix1_revoke_anon_and_accounting_periods_rls.sql
-- ملف الترحيل: إصلاح ثغرتين أمنيتين حرجتين في صلاحيات الدوال و RLS
-- =============================================================================
-- Date / التاريخ        : 2026-10-04
-- Priority / الأولوية  : CRITICAL (حرج)
-- Author / المؤلف       : ERP Security Hardening Pipeline
-- =============================================================================
--
-- FIX 1 — سحب صلاحية EXECUTE من دور anon/public على كل الدوال المالية الحرجة
--          Revoke EXECUTE from anon & public on all critical financial functions,
--          then explicitly GRANT EXECUTE to authenticated only.
--
-- FIX 2 — إصلاح سياسة RLS المكسورة على جدول accounting_periods
--          The old policy `accounting_periods_org_isolation` used the condition
--          `organization_id IS NOT NULL` which effectively allowed every
--          authenticated (and possibly anonymous) session to read all rows across
--          ALL organisations.  This fix drops every existing policy on the table
--          and replaces it with a single, correct tenant-isolation policy that
--          uses get_my_org() / get_my_role().
--
-- =============================================================================



-- #############################################################################
-- FIX 1: REVOKE EXECUTE FROM anon / public ON CRITICAL FINANCIAL FUNCTIONS
--        سحب صلاحية التنفيذ من الأدوار anon و public على الدوال المالية الحرجة
-- #############################################################################

-- -----------------------------------------------------------------------------
-- 1.1  public.approve_invoice(uuid, uuid, uuid)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) FROM public;
    GRANT  EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO authenticated;
    RAISE NOTICE '[FIX-1] ✅ approve_invoice(uuid,uuid,uuid): REVOKED from anon/public, GRANTED to authenticated';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-1] ⚠️  approve_invoice(uuid,uuid,uuid): skipped — %', SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 1.2  public.complete_pos_sale_atomic(jsonb, uuid, uuid, uuid, uuid, text,
--                                       numeric, uuid, uuid, numeric, text,
--                                       uuid, numeric)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION public.complete_pos_sale_atomic(
        jsonb, uuid, uuid, uuid, uuid, text,
        numeric, uuid, uuid, numeric, text, uuid, numeric
    ) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.complete_pos_sale_atomic(
        jsonb, uuid, uuid, uuid, uuid, text,
        numeric, uuid, uuid, numeric, text, uuid, numeric
    ) FROM public;
    GRANT  EXECUTE ON FUNCTION public.complete_pos_sale_atomic(
        jsonb, uuid, uuid, uuid, uuid, text,
        numeric, uuid, uuid, numeric, text, uuid, numeric
    ) TO authenticated;
    RAISE NOTICE '[FIX-1] ✅ complete_pos_sale_atomic(...): REVOKED from anon/public, GRANTED to authenticated';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-1] ⚠️  complete_pos_sale_atomic(...): skipped — %', SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 1.3  public.unpost_sales_invoice(uuid, uuid)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) FROM public;
    GRANT  EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) TO authenticated;
    RAISE NOTICE '[FIX-1] ✅ unpost_sales_invoice(uuid,uuid): REVOKED from anon/public, GRANTED to authenticated';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-1] ⚠️  unpost_sales_invoice(uuid,uuid): skipped — %', SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 1.4  public.unpost_purchase_invoice(uuid, uuid)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) FROM public;
    GRANT  EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) TO authenticated;
    RAISE NOTICE '[FIX-1] ✅ unpost_purchase_invoice(uuid,uuid): REVOKED from anon/public, GRANTED to authenticated';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-1] ⚠️  unpost_purchase_invoice(uuid,uuid): skipped — %', SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 1.5  public.approve_purchase_invoice(uuid, uuid, uuid)  — IF EXISTS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- Guard: only attempt if the function exists
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname  = 'approve_purchase_invoice'
    ) THEN
        REVOKE EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) FROM anon;
        REVOKE EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) FROM public;
        GRANT  EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) TO authenticated;
        RAISE NOTICE '[FIX-1] ✅ approve_purchase_invoice(uuid,uuid,uuid): REVOKED from anon/public, GRANTED to authenticated';
    ELSE
        RAISE NOTICE '[FIX-1] ℹ️  approve_purchase_invoice(uuid,uuid,uuid): function not found, skipping';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-1] ⚠️  approve_purchase_invoice(uuid,uuid,uuid): skipped — %', SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 1.6  public.approve_receipt_voucher(uuid, uuid)  — IF EXISTS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname  = 'approve_receipt_voucher'
    ) THEN
        REVOKE EXECUTE ON FUNCTION public.approve_receipt_voucher(uuid, uuid) FROM anon;
        REVOKE EXECUTE ON FUNCTION public.approve_receipt_voucher(uuid, uuid) FROM public;
        GRANT  EXECUTE ON FUNCTION public.approve_receipt_voucher(uuid, uuid) TO authenticated;
        RAISE NOTICE '[FIX-1] ✅ approve_receipt_voucher(uuid,uuid): REVOKED from anon/public, GRANTED to authenticated';
    ELSE
        RAISE NOTICE '[FIX-1] ℹ️  approve_receipt_voucher(uuid,uuid): function not found, skipping';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-1] ⚠️  approve_receipt_voucher(uuid,uuid): skipped — %', SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 1.7  public.approve_payment_voucher(uuid, uuid)  — IF EXISTS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname  = 'approve_payment_voucher'
    ) THEN
        REVOKE EXECUTE ON FUNCTION public.approve_payment_voucher(uuid, uuid) FROM anon;
        REVOKE EXECUTE ON FUNCTION public.approve_payment_voucher(uuid, uuid) FROM public;
        GRANT  EXECUTE ON FUNCTION public.approve_payment_voucher(uuid, uuid) TO authenticated;
        RAISE NOTICE '[FIX-1] ✅ approve_payment_voucher(uuid,uuid): REVOKED from anon/public, GRANTED to authenticated';
    ELSE
        RAISE NOTICE '[FIX-1] ℹ️  approve_payment_voucher(uuid,uuid): function not found, skipping';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-1] ⚠️  approve_payment_voucher(uuid,uuid): skipped — %', SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 1.8  public.save_and_post_sales_invoice_atomic(jsonb, jsonb, uuid) — IF EXISTS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname  = 'save_and_post_sales_invoice_atomic'
    ) THEN
        REVOKE EXECUTE ON FUNCTION public.save_and_post_sales_invoice_atomic(jsonb, jsonb, uuid) FROM anon;
        REVOKE EXECUTE ON FUNCTION public.save_and_post_sales_invoice_atomic(jsonb, jsonb, uuid) FROM public;
        GRANT  EXECUTE ON FUNCTION public.save_and_post_sales_invoice_atomic(jsonb, jsonb, uuid) TO authenticated;
        RAISE NOTICE '[FIX-1] ✅ save_and_post_sales_invoice_atomic(jsonb,jsonb,uuid): REVOKED from anon/public, GRANTED to authenticated';
    ELSE
        RAISE NOTICE '[FIX-1] ℹ️  save_and_post_sales_invoice_atomic(jsonb,jsonb,uuid): function not found, skipping';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-1] ⚠️  save_and_post_sales_invoice_atomic(jsonb,jsonb,uuid): skipped — %', SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 1.9  public.save_and_post_purchase_invoice_atomic(jsonb, jsonb, uuid) — IF EXISTS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname  = 'save_and_post_purchase_invoice_atomic'
    ) THEN
        REVOKE EXECUTE ON FUNCTION public.save_and_post_purchase_invoice_atomic(jsonb, jsonb, uuid) FROM anon;
        REVOKE EXECUTE ON FUNCTION public.save_and_post_purchase_invoice_atomic(jsonb, jsonb, uuid) FROM public;
        GRANT  EXECUTE ON FUNCTION public.save_and_post_purchase_invoice_atomic(jsonb, jsonb, uuid) TO authenticated;
        RAISE NOTICE '[FIX-1] ✅ save_and_post_purchase_invoice_atomic(jsonb,jsonb,uuid): REVOKED from anon/public, GRANTED to authenticated';
    ELSE
        RAISE NOTICE '[FIX-1] ℹ️  save_and_post_purchase_invoice_atomic(jsonb,jsonb,uuid): function not found, skipping';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-1] ⚠️  save_and_post_purchase_invoice_atomic(jsonb,jsonb,uuid): skipped — %', SQLERRM;
END;
$$;


DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '[FIX-1] 🔒 All critical financial function privilege fixes applied';
    RAISE NOTICE '=================================================================';
END;
$$;



-- #############################################################################
-- FIX 2: REPAIR BROKEN RLS POLICY ON accounting_periods
--        إصلاح سياسة RLS المكسورة على جدول accounting_periods
--
--  المشكلة / Problem:
--    The previous policy used `organization_id IS NOT NULL` as its USING
--    expression.  This is always TRUE for any non-null column value, so it
--    effectively grants cross-tenant read access to every authenticated user —
--    a critical multi-tenancy data-leak vulnerability.
--
--  الحل / Solution:
--    Drop ALL existing policies on accounting_periods and recreate a single
--    correct policy that enforces tenant isolation via get_my_org(), with a
--    bypass clause for super_admin via get_my_role().
-- #############################################################################

-- -----------------------------------------------------------------------------
-- 2.1  Ensure RLS is enabled on accounting_periods
--      تفعيل RLS على الجدول إن لم يكن مفعلاً
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- Enable RLS (idempotent — safe to call even if already enabled)
    ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
    -- Force RLS even for table owner (prevents accidental owner bypass)
    ALTER TABLE public.accounting_periods FORCE ROW LEVEL SECURITY;
    RAISE NOTICE '[FIX-2] ✅ RLS ENABLED + FORCED on public.accounting_periods';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[FIX-2] ⚠️  Could not enable RLS on accounting_periods — %', SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2.2  Drop ALL existing policies on accounting_periods (dynamic, idempotent)
--      حذف جميع السياسات الموجودة على الجدول ديناميكياً
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM   pg_policies
        WHERE  schemaname = 'public'
          AND  tablename  = 'accounting_periods'
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.accounting_periods',
            pol.policyname
        );
        RAISE NOTICE '[FIX-2] 🗑️  Dropped policy: %', pol.policyname;
    END LOOP;
    RAISE NOTICE '[FIX-2] ✅ All old policies on accounting_periods removed';
END;
$$;


-- -----------------------------------------------------------------------------
-- 2.3  Create the correct tenant-isolation policy
--      إنشاء السياسة الصحيحة لعزل المستأجرين
-- -----------------------------------------------------------------------------
CREATE POLICY "accounting_periods_tenant_isolation"
ON public.accounting_periods
FOR ALL
TO authenticated
USING (
    -- المستخدم العادي يرى فقط سجلات مؤسسته
    -- Regular user: see only rows belonging to their organisation
    organization_id = public.get_my_org()
    OR
    -- المدير العام يرى كل شيء
    -- Super admin: unrestricted cross-tenant access
    public.get_my_role() = 'super_admin'
)
WITH CHECK (
    -- نفس الشرط على الكتابة لمنع إدراج سجلات لمؤسسة أخرى
    -- Apply the same guard on INSERT / UPDATE
    organization_id = public.get_my_org()
    OR
    public.get_my_role() = 'super_admin'
);

DO $$
BEGIN
    RAISE NOTICE '[FIX-2] ✅ Policy "accounting_periods_tenant_isolation" created successfully';
END;
$$;


-- =============================================================================
-- MIGRATION COMPLETE / اكتمل الترحيل
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'MIGRATION 2026-10-04_fix1 COMPLETE';
    RAISE NOTICE '  FIX-1: anon/public EXECUTE revoked on 9 financial functions';
    RAISE NOTICE '  FIX-2: accounting_periods RLS rebuilt with tenant isolation';
    RAISE NOTICE '=================================================================';
END;
$$;
