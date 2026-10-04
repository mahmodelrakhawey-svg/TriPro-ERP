-- =============================================================================
-- FILE: 2026-10-04_fix4_public_menu_rls_and_rate_limit_store.sql
-- DATE: 2026-10-04
-- AUTHOR: TriPro ERP Security Hardening
--
-- PURPOSE (EN):
--   1. Restrict Public_Menu_Read_Policy on products to only expose items from
--      organizations that have active QR-accessed tables (prevents data leakage
--      of active products from non-public orgs to the anon role).
--   2. Same restriction for Public_Category_Read_Policy on item_categories.
--   3. Restrict permissions_read_policy so authenticated users only see their
--      org's permissions (or global ones), not the full permissions map.
--   4. Create rate_limit_store table + check_rate_limit / cleanup_rate_limits
--      RPCs for flexible server-side rate limiting on sensitive operations.
--
-- الهدف (AR):
--   1. تقييد سياسة القراءة العامة للمنتجات لتشمل فقط المنظمات التي لديها
--      طاولات بمفاتيح QR نشطة — يمنع تسريب بيانات المنظمات الخاصة للمجهول.
--   2. نفس القيد على سياسة قراءة الفئات.
--   3. تقييد سياسة الصلاحيات حتى لا يرى المستخدم إلا صلاحيات منظمته أو العالمية.
--   4. إنشاء جدول ودوال تحديد المعدل لحماية العمليات الحساسة.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1 | القسم الأول
-- Fix Public_Menu_Read_Policy on public.products
-- إصلاح سياسة القراءة العامة للمنتجات
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Drop old leaky policy | حذف السياسة القديمة المسرِّبة للبيانات
    DROP POLICY IF EXISTS "Public_Menu_Read_Policy" ON public.products;

    -- Recreate with org isolation via restaurant_tables QR keys
    -- إعادة الإنشاء مع عزل المنظمة عبر مفاتيح QR في جدول الطاولات
    CREATE POLICY "Public_Menu_Read_Policy" ON public.products
        FOR SELECT TO anon
        USING (
            is_active = true
            AND organization_id IN (
                SELECT DISTINCT organization_id
                FROM public.restaurant_tables
                WHERE qr_access_key IS NOT NULL
                  AND qr_access_key != ''
            )
        );

    RAISE NOTICE '[fix4] ✅ Public_Menu_Read_Policy recreated with org-QR filter on products.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix4] ❌ Failed to recreate Public_Menu_Read_Policy: %', SQLERRM;
END;
$$;


-- ---------------------------------------------------------------------------
-- SECTION 2 | القسم الثاني
-- Fix Public_Category_Read_Policy on public.item_categories
-- إصلاح سياسة قراءة الفئات العامة
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Drop old policy | حذف السياسة القديمة
    DROP POLICY IF EXISTS "Public_Category_Read_Policy" ON public.item_categories;

    -- Recreate: anon can only see categories belonging to QR-enabled orgs
    -- السماح للمجهول فقط برؤية فئات المنظمات ذات QR نشط
    CREATE POLICY "Public_Category_Read_Policy" ON public.item_categories
        FOR SELECT TO anon
        USING (
            organization_id IN (
                SELECT DISTINCT organization_id
                FROM public.restaurant_tables
                WHERE qr_access_key IS NOT NULL
                  AND qr_access_key != ''
            )
        );

    RAISE NOTICE '[fix4] ✅ Public_Category_Read_Policy recreated with org-QR filter on item_categories.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix4] ❌ Failed to recreate Public_Category_Read_Policy: %', SQLERRM;
END;
$$;


-- ---------------------------------------------------------------------------
-- SECTION 3 | القسم الثالث
-- Fix permissions_read_policy on public.permissions
-- إصلاح سياسة قراءة الصلاحيات — كانت USING (true) تكشف خريطة الصلاحيات كاملة
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Drop the dangerously open policy | حذف السياسة المفتوحة بشكل خطر
    DROP POLICY IF EXISTS "permissions_read_policy" ON public.permissions;

    -- Recreate: super_admin sees all; others see only their org or global perms
    -- السوبر أدمين يرى الكل، الباقون يرون صلاحيات منظمتهم أو العالمية فقط
    CREATE POLICY "permissions_read_policy" ON public.permissions
        FOR SELECT TO authenticated
        USING (
            -- السوبر أدمين يرى الكل، الباقي يرى فقط ما يخص منظمته
            public.get_my_role() = 'super_admin'
            OR organization_id = public.get_my_org()
            OR organization_id IS NULL  -- global system permissions | صلاحيات النظام العالمية
        );

    RAISE NOTICE '[fix4] ✅ permissions_read_policy tightened — no more global exposure to authenticated users.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix4] ❌ Failed to recreate permissions_read_policy: %', SQLERRM;
END;
$$;


-- ---------------------------------------------------------------------------
-- SECTION 4 | القسم الرابع
-- Rate Limit Store — table, RLS, and RPCs
-- جدول تخزين حد المعدل والدوال المرتبطة به
-- ---------------------------------------------------------------------------

-- 4a. Create table | إنشاء الجدول
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS public.rate_limit_store (
        key         TEXT PRIMARY KEY,
        count       INTEGER NOT NULL DEFAULT 1,
        window_end  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    RAISE NOTICE '[fix4] ✅ rate_limit_store table ensured.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix4] ❌ Failed to create rate_limit_store: %', SQLERRM;
END;
$$;

-- 4b. Enable RLS and deny direct access — all access via SECURITY DEFINER only
--     تفعيل RLS ومنع الوصول المباشر — الوصول عبر دوال SECURITY DEFINER فقط
DO $$
BEGIN
    ALTER TABLE public.rate_limit_store ENABLE ROW LEVEL SECURITY;

    -- Drop stale policy before recreating | حذف السياسة القديمة قبل إعادة الإنشاء
    DROP POLICY IF EXISTS "rate_limit_no_direct_access" ON public.rate_limit_store;

    -- Block all direct DML from authenticated users
    -- منع أي DML مباشر من المستخدمين المصادق عليهم
    CREATE POLICY "rate_limit_no_direct_access" ON public.rate_limit_store
        FOR ALL TO authenticated
        USING (false)
        WITH CHECK (false);

    RAISE NOTICE '[fix4] ✅ RLS enabled on rate_limit_store — direct access denied.';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix4] ❌ Failed to configure RLS on rate_limit_store: %', SQLERRM;
END;
$$;

-- 4c. check_rate_limit RPC | دالة فحص حد المعدل
DO $$
BEGIN
    -- Function is replaced atomically; no pre-drop needed
    -- الدالة تُستبدل بشكل ذري — لا حاجة لحذفها مسبقاً
    RAISE NOTICE '[fix4] Creating/replacing check_rate_limit function...';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix4] ❌ Pre-notice for check_rate_limit failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key            TEXT,
    p_max_attempts   INTEGER DEFAULT 5,
    p_window_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Upsert the rate limit record atomically
    -- إدخال أو تحديث سجل حد المعدل بشكل ذري
    INSERT INTO public.rate_limit_store (key, count, window_end)
    VALUES (
        p_key,
        1,
        NOW() + (p_window_minutes || ' minutes')::INTERVAL
    )
    ON CONFLICT (key) DO UPDATE
    SET
        -- Reset count if window has expired; otherwise increment
        -- إعادة الضبط عند انتهاء النافذة الزمنية؛ وإلا زيادة العداد
        count = CASE
            WHEN rate_limit_store.window_end < NOW() THEN 1
            ELSE rate_limit_store.count + 1
        END,
        window_end = CASE
            WHEN rate_limit_store.window_end < NOW()
                THEN NOW() + (p_window_minutes || ' minutes')::INTERVAL
            ELSE rate_limit_store.window_end
        END
    RETURNING count INTO v_count;

    -- Return true if within limit | إرجاع true إذا كان ضمن الحد المسموح
    RETURN v_count <= p_max_attempts;
END;
$$;

-- Grant to both roles so login flows (anon → authenticated transition) work
-- منح الصلاحية للدورين لأن تدفق تسجيل الدخول قد يبدأ من المجهول
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO anon;

-- 4d. cleanup_rate_limits RPC | دالة تنظيف السجلات المنتهية
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    -- Remove all expired rate limit windows | حذف جميع نوافذ حد المعدل المنتهية
    DELETE FROM public.rate_limit_store
    WHERE window_end < NOW();

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

-- 4e. Schedule cleanup via pg_cron if available
--     جدولة التنظيف عبر pg_cron إذا كانت الإضافة مثبتة
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Unschedule any previous version before rescheduling
        -- إلغاء الجدولة السابقة قبل إعادتها تفادياً للتكرار
        PERFORM cron.unschedule('cleanup-rate-limits');

        PERFORM cron.schedule(
            'cleanup-rate-limits',   -- job name | اسم المهمة
            '0 * * * *',            -- every hour at :00 | كل ساعة
            'SELECT public.cleanup_rate_limits()'
        );

        RAISE NOTICE '[fix4] ✅ pg_cron job "cleanup-rate-limits" scheduled every hour.';
    ELSE
        RAISE NOTICE '[fix4] ℹ️  pg_cron not installed — schedule cleanup_rate_limits manually.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fix4] ❌ pg_cron scheduling failed: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE '[fix4] 🎉 Migration fix4 completed successfully.';
END;
$$;
