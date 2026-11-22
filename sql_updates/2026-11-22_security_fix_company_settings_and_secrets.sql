-- ==============================================================================
-- 🛡️ TriPro ERP — Security Patch: 2026-11-22 (Part 2 - Fortified & Resilient)
-- تحصين إعدادات المنشآت وحجب أسرار الضرائب وحظر كشط المنتجات للمستخدم المجهول
-- File: sql_updates/2026-11-22_security_fix_company_settings_and_secrets.sql
-- ==============================================================================

-- ==============================================================================
-- 1. إعادة صياغة دالة get_current_company_settings بتحصين ثلاثي صارم:
--    أ. منع الوصول المجهول نهائياً (رفض أي استدعاء بدون جلسة تسجيل دخول).
--    ب. منع تسريب بيانات الشركات الأخرى (Tenant Isolation): لا يمكن لمستخدم عادي طلب إعدادات شركة أخرى.
--    ج. حجب السر الضريبي (eta_client_secret) وتصفيره لمن هم دون رتبة admin / super_admin.
--    د. إلغاء الـ Fallback الذي كان يعيد أول شركة عشوائية في النظام.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_current_company_settings(
    p_org_id uuid DEFAULT NULL
)
RETURNS SETOF public.company_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_caller_id uuid := auth.uid();
    v_my_org uuid;
    v_my_role text;
    v_target_org uuid;
    v_row public.company_settings%ROWTYPE;
BEGIN
    -- أ. التحقق الصارم من وجود مستخدم مسجل الدخول
    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: غير مصرح باستدعاء إعدادات الشركة للمستخدمين غير المسجلين.';
    END IF;

    -- ب. جلب منشأة ودور المستخدم الحالي
    v_my_org := public.get_my_org();
    v_my_role := public.get_my_role();

    -- ج. عزل المنشآت (Tenant Isolation):
    -- إذا كان المستخدم ليس super_admin، يتم إجباره على رؤية شركته فقط
    IF v_my_role = 'super_admin' OR auth.role() = 'service_role' THEN
        v_target_org := COALESCE(p_org_id, v_my_org);
    ELSE
        v_target_org := v_my_org;
    END IF;

    -- د. إذا لم تكن هناك منظمة محددة، نرفض العملية فوراً ولا نعيد أي شركة عشوائية
    IF v_target_org IS NULL THEN
        RETURN;
    END IF;

    -- هـ. التأكد من وجود سجل الإعدادات للشركة إذا كانت المنظمة موجودة في جدول organizations
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

    -- و. جلب السجل مع تطبيق حجب الأسرار (Secret Masking)
    FOR v_row IN 
        SELECT * FROM public.company_settings 
        WHERE organization_id = v_target_org 
        LIMIT 1
    LOOP
        -- حجب السر الضريبي eta_client_secret إذا لم يكن المستخدم مديراً أو مشرفاً عاماً
        IF v_my_role NOT IN ('super_admin', 'admin') AND auth.role() <> 'service_role' THEN
            v_row.eta_client_secret := NULL;
        END IF;

        RETURN NEXT v_row;
    END LOOP;

    RETURN;
END;
$$;

-- تأمين صلاحيات تنفيذ الدالة: سحب من anon وحصرها في authenticated و service_role
REVOKE ALL ON FUNCTION public.get_current_company_settings(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_current_company_settings(uuid) TO authenticated, service_role;


-- ==============================================================================
-- 2. إغلاق ثغرة كشط الأصناف والأسعار (Scraping):
--    حذف السياسات العامة المفتوحة لدور anon على المنتجات والفئات
-- ==============================================================================
DO $$
BEGIN
    -- حذف سياسة القراءة العامة المفتوحة للمجهولين على جدول المنتجات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
        DROP POLICY IF EXISTS "Public_Menu_Read_Policy" ON public.products;
    END IF;
    
    -- حذف سياسة القراءة العامة المفتوحة على جدول الفئات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'item_categories') THEN
        DROP POLICY IF EXISTS "Public_Category_Read_Policy" ON public.item_categories;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') THEN
        DROP POLICY IF EXISTS "Public_Category_Read_Policy" ON public.categories;
    END IF;
    
    RAISE NOTICE '✅ تم إسقاط سياسات القراءة المجهولة للمنتجات والفئات بنجاح.';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'تنبيه: %', SQLERRM;
END;
$$;


-- ==============================================================================
-- 3. سحب صلاحيات الوصول المباشر من anon وتأمينها لـ authenticated بدقة ومرونة تامة
--    (فحص ديناميكي لمنع خطأ 42P01: relation does not exist)
-- ==============================================================================
DO $$
DECLARE
    tbl text;
    -- الجداول المطلوب تأمينها وسحبها من دور anon المجهول
    target_tables text[] := ARRAY[
        'company_settings',
        'products',
        'item_categories',
        'uoms',
        'uom_categories'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            -- سحب كل الصلاحيات من anon
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, public;', tbl);
            
            -- منح الصلاحيات للمستخدمين المسجلين وخدمة النظام
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', tbl);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', tbl);
            
            RAISE NOTICE '🔒 [SECURED] تم تأمين الجدول: %', tbl;
        ELSE
            RAISE NOTICE '⏩ [SKIPPED] الجدول % غير موجود بقاعدة البيانات - تم التخطي بأمان.', tbl;
        END IF;
    END LOOP;
END;
$$;
