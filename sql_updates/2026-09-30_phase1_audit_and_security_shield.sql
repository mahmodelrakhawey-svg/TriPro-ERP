-- =============================================================================
-- المرحلة الأولى: درع الأمان والتدقيق الشامل وتسريع المخزون
-- TriPro ERP — sql_updates/2026-09-30_phase1_audit_and_security_shield.sql
-- التاريخ: 2026-09-30
-- الأولوية: 🔴 قصوى — آمن 100% ولا يمس بيانات لينزا الحالية بأي شكل
-- =============================================================================

-- =============================================================================
-- 1. جدول سجل الرقابة والتدقيق الأمني التلقائي (System Audit Logs)
-- يسجل تلقائياً أي تعديل أو حذف في الأصناف والأسعار، الحسابات، العملاء، والإعدادات
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    user_id UUID,
    user_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date 
ON public.system_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record 
ON public.system_audit_logs (organization_id, table_name, record_id);

-- تفعيل RLS: فقط مديرو المنشأة أو السوبر أدمن يمكنهم قراءة سجل التدقيق
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_strict_isolation" ON public.system_audit_logs;
CREATE POLICY "audit_logs_strict_isolation" ON public.system_audit_logs
    FOR SELECT
    USING (
        organization_id = get_my_org()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'owner')
        )
    );

-- دالة التريجر العامة الذكية (مع حماية استثنائية: لا توقف المعاملة الأصلية أبداً)
CREATE OR REPLACE FUNCTION public.fn_audit_log_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_record_id TEXT;
    v_old_json JSONB := NULL;
    v_new_json JSONB := NULL;
    v_changed_fields TEXT[] := ARRAY[]::TEXT[];
    v_user_email TEXT;
    v_key TEXT;
BEGIN
    BEGIN
        IF TG_OP = 'DELETE' THEN
            v_org_id := (to_jsonb(OLD)->>'organization_id')::UUID;
            v_record_id := to_jsonb(OLD)->>'id';
            v_old_json := to_jsonb(OLD);
        ELSIF TG_OP = 'UPDATE' THEN
            v_org_id := (to_jsonb(NEW)->>'organization_id')::UUID;
            v_record_id := to_jsonb(NEW)->>'id';
            v_old_json := to_jsonb(OLD);
            v_new_json := to_jsonb(NEW);
            
            -- حصر الحقول التي تغيرت قيمتها فعلياً
            FOR v_key IN SELECT jsonb_object_keys(v_new_json)
            LOOP
                -- تجاهل حقول التوقيت التلقائية
                IF v_key NOT IN ('updated_at', 'last_modified') THEN
                    IF v_old_json->v_key IS DISTINCT FROM v_new_json->v_key THEN
                        v_changed_fields := array_append(v_changed_fields, v_key);
                    END IF;
                END IF;
            END LOOP;

            -- إذا لم يتغير شيء جوهري، تجاوز التسجيل
            IF array_length(v_changed_fields, 1) IS NULL THEN
                RETURN NEW;
            END IF;
        ELSIF TG_OP = 'INSERT' THEN
            v_org_id := (to_jsonb(NEW)->>'organization_id')::UUID;
            v_record_id := to_jsonb(NEW)->>'id';
            v_new_json := to_jsonb(NEW);
        END IF;

        IF v_org_id IS NULL THEN
            v_org_id := get_my_org();
        END IF;

        -- التقاط بريد المستخدم الحالي
        BEGIN
            SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
        EXCEPTION WHEN OTHERS THEN
            v_user_email := NULL;
        END;

        -- تسجيل حركة التدقيق
        INSERT INTO public.system_audit_logs (
            organization_id, table_name, record_id, action,
            old_data, new_data, changed_fields, user_id, user_email
        )
        VALUES (
            v_org_id, TG_TABLE_NAME, v_record_id, TG_OP,
            v_old_json, v_new_json, v_changed_fields, auth.uid(), v_user_email
        );

    EXCEPTION WHEN OTHERS THEN
        -- صمام أمان صارم: أي خطأ في تسجيل التدقيق لا يقطع ولا يوقف حركة العميل نهائياً
        NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- ربط التريجر بالجداول الحساسة (إنشاء التريجر بأمان بعد حذفه إن وجد)
DROP TRIGGER IF EXISTS trg_audit_products ON public.products;
CREATE TRIGGER trg_audit_products
    AFTER UPDATE OR DELETE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_change();

DROP TRIGGER IF EXISTS trg_audit_customers ON public.customers;
CREATE TRIGGER trg_audit_customers
    AFTER UPDATE OR DELETE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_change();

DROP TRIGGER IF EXISTS trg_audit_accounts ON public.accounts;
CREATE TRIGGER trg_audit_accounts
    AFTER UPDATE OR DELETE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_change();

DROP TRIGGER IF EXISTS trg_audit_company_settings ON public.company_settings;
CREATE TRIGGER trg_audit_company_settings
    AFTER UPDATE ON public.company_settings
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_change();


-- =============================================================================
-- 2. إخفاء وتأمين مفاتيح S3 الحساسة (S3 Secrets Masking)
-- دالة تجلب إعدادات الشركة مع تمويه المفاتيح السرية لحمايتها في المتصفح
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_safe_company_settings(p_org_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    company_name TEXT,
    phone TEXT,
    address TEXT,
    tax_number TEXT,
    commercial_register TEXT,
    currency TEXT,
    tax_rate NUMERIC,
    s3_endpoint TEXT,
    s3_bucket TEXT,
    s3_region TEXT,
    s3_is_active BOOLEAN,
    s3_access_key_masked TEXT,
    has_s3_secret BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    v_org_id := COALESCE(p_org_id, get_my_org());
    
    RETURN QUERY
    SELECT 
        cs.id,
        cs.organization_id,
        cs.company_name,
        cs.phone,
        cs.address,
        cs.tax_number,
        cs.commercial_register,
        cs.currency,
        cs.tax_rate,
        cs.s3_endpoint,
        cs.s3_bucket,
        cs.s3_region,
        cs.s3_is_active,
        -- تمويه المفتاح: إظهار أول 4 حروف وآخر 4 حروف فقط
        CASE 
            WHEN cs.s3_access_key IS NOT NULL AND length(cs.s3_access_key) > 8 
            THEN substr(cs.s3_access_key, 1, 4) || '••••••••' || substr(cs.s3_access_key, length(cs.s3_access_key)-3)
            ELSE '••••••••'
        END AS s3_access_key_masked,
        (cs.s3_secret_key IS NOT NULL AND length(cs.s3_secret_key) > 0) AS has_s3_secret
    FROM company_settings cs
    WHERE cs.organization_id = v_org_id
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_safe_company_settings(UUID) TO authenticated;


-- =============================================================================
-- 3. دالة جلب سجل التدقيق للمديرين (Get Audit Logs RPC)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_audit_logs_rpc(
    p_table_name TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_role TEXT;
    v_result JSONB;
BEGIN
    v_org_id := get_my_org();
    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'المنظمة غير محددة');
    END IF;

    -- التحقق من صلاحية المستخدم
    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
    IF v_role NOT IN ('admin', 'super_admin', 'owner') THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: هذا التقرير مخصص لمديري النظام فقط');
    END IF;

    SELECT jsonb_agg(row_to_json(al))
    INTO v_result
    FROM (
        SELECT 
            id, table_name, record_id, action,
            old_data, new_data, changed_fields,
            user_id, user_email, created_at
        FROM system_audit_logs
        WHERE organization_id = v_org_id
          AND (p_table_name IS NULL OR table_name = p_table_name)
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) al;

    RETURN jsonb_build_object(
        'success', true,
        'logs', COALESCE(v_result, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_logs_rpc(TEXT, INT, INT) TO authenticated;

-- إشعار نجاح التطبيق
DO $$
BEGIN
    RAISE NOTICE '✅ 1. تم إنشاء جدول وفهارس سجل التدقيق (system_audit_logs)';
    RAISE NOTICE '✅ 2. تم تفعيل تريجرات التدقيق الذكية الآمنة على الأصناف، العملاء، الحسابات، والإعدادات';
    RAISE NOTICE '✅ 3. تم تفعيل دالة تمويه وتأمين مفاتيح S3 (get_safe_company_settings)';
    RAISE NOTICE '✅ 4. تم إنشاء دالة استعراض سجل الرقابة (get_audit_logs_rpc)';
    RAISE NOTICE '🔒 تم تطبيق درع الأمان والرقابة (المرحلة الأولى) بنجاح تام.';
END;
$$;
