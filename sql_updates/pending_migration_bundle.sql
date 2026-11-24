-- ==============================================================================
-- 🛡️ TriPro ERP — Consolidated Pending Migrations Bundle
-- تاريخ التوليد: 2026-11-24T21:45:50.843Z
-- عدد الملفات المعلقة المجمعة: 1
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
-- [1/1] الملف: 2026-11-24_fix_general_db_schema_gaps_and_settings.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 🛠️ TriPro ERP — Fix General DB Schema Gaps (406 & 400 Console Errors)
-- File: sql_updates/2026-11-24_fix_general_db_schema_gaps_and_settings.sql
-- Date: 2026-11-24
-- ==============================================================================
-- يعالج الأخطاء الثلاثة التي ظهرت في كونسول المتصفح على القاعدة العامة:
--   1. get_current_company_settings (406 Not Acceptable): إعادة الإنشاء التلقائي لسجل
--      company_settings عند عدم وجوده للمنشأة حتى لا تعود الدالة فارغة لـ .single().
--   2. products (400 Bad Request): التأكد من وجود كافة أعمدة POS/Inventory المطلوبة
--      (is_produced, is_active, track_inventory, uom, ...).
--   3. security_logs (400 Bad Request): التأكد من وجود الأعمدة event_type, description,
--      metadata, organization_id وتوافق صلاحيات الإدراج للمستخدم المسجل.
-- ==============================================================================

BEGIN;

-- 1. إصلاح get_current_company_settings مع الحفاظ على التحصين الأمني وحجب الأسرار
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

    -- التأكد من وجود سجل إعدادات للمنشأة لتفادي خطأ 406 عند استدعاء .single()
    IF NOT EXISTS (SELECT 1 FROM public.company_settings WHERE organization_id = v_target_org)
       AND EXISTS (SELECT 1 FROM public.organizations WHERE id = v_target_org) THEN
        INSERT INTO public.company_settings (
            organization_id,
            company_name,
            currency,
            vat_rate,
            enable_tax
        ) VALUES (
            v_target_org,
            'الشركة الرئيسية',
            'EGP',
            0.14,
            true
        ) ON CONFLICT (organization_id) DO NOTHING;
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


-- 2. استكمال أعمدة جدول products المفقودة في القاعدة العامة
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_produced boolean DEFAULT false;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_inventory boolean DEFAULT true;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS uom text;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_scale_item boolean DEFAULT false;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS plu_number text;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS scale_prefix text DEFAULT '22';
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode2 text;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS age_restricted boolean DEFAULT false;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_rate_override numeric;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit_barcodes jsonb DEFAULT '[]'::jsonb;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_price numeric;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_start_date date;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_end_date date;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_sales_price numeric DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_stock_level numeric DEFAULT 1000;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_price numeric;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS half_wholesale_price numeric;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS warehouse_stock jsonb DEFAULT '{}'::jsonb;
    END IF;
END $$;


-- 3. استكمال أعمدة وسياسات جدول security_logs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_logs') THEN
        ALTER TABLE public.security_logs ADD COLUMN IF NOT EXISTS event_type text;
        ALTER TABLE public.security_logs ADD COLUMN IF NOT EXISTS description text;
        ALTER TABLE public.security_logs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
        ALTER TABLE public.security_logs ADD COLUMN IF NOT EXISTS organization_id uuid DEFAULT public.get_my_org();
        ALTER TABLE public.security_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

        -- جعل organization_id اختيارياً أو بقيمة افتراضية حتى لا يفشل الإدراج من الواجهة
        ALTER TABLE public.security_logs ALTER COLUMN organization_id SET DEFAULT public.get_my_org();

        REVOKE ALL ON TABLE public.security_logs FROM anon;
        GRANT SELECT, INSERT ON TABLE public.security_logs TO authenticated;
        GRANT ALL ON TABLE public.security_logs TO service_role;

        ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Allow authenticated access to security_logs" ON public.security_logs;
        DROP POLICY IF EXISTS "tenant_isolation_security_logs" ON public.security_logs;
        CREATE POLICY "tenant_isolation_security_logs" ON public.security_logs
        FOR ALL TO authenticated
        USING (
            organization_id IS NULL
            OR organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        )
        WITH CHECK (
            organization_id IS NULL
            OR organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        );
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-24_fix_general_db_schema_gaps_and_settings', '2026-11-24_fix_general_db_schema_gaps_and_settings.sql', 'c793b5dbaafaaea13d1ac9912e991a3391e8a5eda4dd0d8485eac3f1d2f340b2', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

