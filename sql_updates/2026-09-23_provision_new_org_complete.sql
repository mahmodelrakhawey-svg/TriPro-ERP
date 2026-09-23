-- ==============================================================================
-- Migration: 2026-09-23_provision_new_org_complete.sql
-- Description: دالة التأسيس الشاملة للشركات الجديدة في منصة Super SaaS
--   تُنشئ: المنظمة + دليل الحسابات + مستودع افتراضي + سنة مالية + صلاحيات
--   وتُجري Health Checks تلقائية وتُعيد تقرير JSON كاملاً
-- ✅ آمن — تعمل على org_id الجديد فقط، لا تمس الشركات الموجودة أبداً
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.provision_new_org_complete(
    p_company_name      text,
    p_email             text,
    p_activity_type     text    DEFAULT 'commercial',
    p_plan              text    DEFAULT 'pro',
    p_currency          text    DEFAULT 'EGP',
    p_vat_rate          numeric DEFAULT 14,
    p_allowed_modules   text[]  DEFAULT NULL,
    p_max_users         int     DEFAULT 5,
    p_subscription_expiry date  DEFAULT (CURRENT_DATE + interval '14 days')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_org_id            uuid;
    v_wh_id             uuid;
    v_fy_id             uuid;
    v_modules           text[];
    v_health            jsonb := '{}'::jsonb;
    v_settings          record;
    v_plan_modules      text[];
    v_current_year      int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
    v_cash_acc_id       uuid;
    v_supplier_acc_id   uuid;
    v_customer_acc_id   uuid;
    v_inv_acc_id        uuid;
BEGIN

    -- ================================================================
    -- 0. تحديد الموديولات بناءً على الباقة إذا لم تُحدَّد يدوياً
    -- ================================================================
    v_plan_modules := CASE p_plan
        WHEN 'basic'      THEN ARRAY['accounting', 'sales']
        WHEN 'pro'        THEN ARRAY['accounting', 'sales', 'purchases', 'inventory', 'hr']
        WHEN 'sports'     THEN ARRAY['accounting', 'hr', 'stadium']
        WHEN 'premium'    THEN ARRAY['accounting', 'sales', 'purchases', 'inventory', 'hr',
                                     'restaurant', 'manufacturing', 'construction', 'hims', 'stadium']
        WHEN 'enterprise' THEN ARRAY['accounting', 'sales', 'purchases', 'inventory', 'hr',
                                     'restaurant', 'manufacturing', 'construction', 'hims',
                                     'stadium', 'retail']
        ELSE                   ARRAY['accounting', 'sales', 'purchases', 'inventory', 'hr']
    END;

    -- إذا حُدِّدت يدوياً نستخدمها، وإلا نستخدم موديولات الباقة
    v_modules := COALESCE(p_allowed_modules, v_plan_modules);

    -- ================================================================
    -- 1. إنشاء المنظمة + دليل الحسابات المصري
    -- ================================================================
    -- create_new_client_v2 تُنشئ المنظمة وتستدعي initialize_egyptian_coa داخلياً
    SELECT public.create_new_client_v2(
        p_name          => p_company_name,
        p_email         => p_email,
        p_activity_type => p_activity_type,
        p_vat_number    => NULL,
        p_admin_id      => NULL
    ) INTO v_org_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'فشل إنشاء المنظمة — تعذّر الحصول على org_id';
    END IF;

    -- ================================================================
    -- 2. تحديث بيانات الباقة والاشتراك والعملة
    -- ================================================================
    UPDATE public.organizations SET
        plan                = p_plan,
        max_users           = p_max_users,
        allowed_modules     = v_modules,
        subscription_expiry = p_subscription_expiry,
        is_active           = true
    WHERE id = v_org_id;

    -- تحديث نسبة الضريبة والعملة في إعدادات الشركة
    UPDATE public.company_settings SET
        vat_rate     = p_vat_rate / 100.0,   -- نخزن كـ 0.14 لا 14
        currency     = p_currency,
        company_name = p_company_name
    WHERE organization_id = v_org_id;

    -- ================================================================
    -- 3. إنشاء المستودع الرئيسي الافتراضي
    -- ================================================================
    -- التحقق من عدم وجود مستودع مسبقاً (حماية من التكرار)
    IF NOT EXISTS (
        SELECT 1 FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1
    ) THEN
        INSERT INTO public.warehouses (organization_id, name, location, is_default, is_active)
        VALUES (v_org_id, 'المستودع الرئيسي', p_company_name, true, true)
        RETURNING id INTO v_wh_id;
    ELSE
        SELECT id INTO v_wh_id
        FROM public.warehouses
        WHERE organization_id = v_org_id
        ORDER BY created_at
        LIMIT 1;
    END IF;

    -- ================================================================
    -- 4. إنشاء السنة المالية الحالية
    -- ================================================================
    IF NOT EXISTS (
        SELECT 1 FROM public.fiscal_years
        WHERE organization_id = v_org_id AND year = v_current_year
    ) THEN
        INSERT INTO public.fiscal_years (
            organization_id,
            year,
            start_date,
            end_date,
            is_closed,
            is_active
        )
        VALUES (
            v_org_id,
            v_current_year,
            make_date(v_current_year, 1, 1),   -- 1 يناير
            make_date(v_current_year, 12, 31),  -- 31 ديسمبر
            false,
            true
        )
        RETURNING id INTO v_fy_id;
    ELSE
        SELECT id INTO v_fy_id
        FROM public.fiscal_years
        WHERE organization_id = v_org_id AND year = v_current_year;
    END IF;

    -- ================================================================
    -- 5. Health Checks — فحص اكتمال التأسيس
    -- ================================================================
    SELECT account_mappings INTO v_settings
    FROM public.company_settings
    WHERE organization_id = v_org_id;

    -- فحص حساب الموردين
    v_supplier_acc_id := (v_settings.account_mappings->>'SUPPLIERS')::uuid;
    v_health := v_health || jsonb_build_object(
        'suppliers_account',
        CASE WHEN v_supplier_acc_id IS NOT NULL THEN 'ok' ELSE 'missing' END
    );

    -- فحص حساب العملاء
    v_customer_acc_id := (v_settings.account_mappings->>'CUSTOMERS')::uuid;
    v_health := v_health || jsonb_build_object(
        'customers_account',
        CASE WHEN v_customer_acc_id IS NOT NULL THEN 'ok' ELSE 'missing' END
    );

    -- فحص حساب المخزون
    v_inv_acc_id := (v_settings.account_mappings->>'INVENTORY_FINISHED_GOODS')::uuid;
    v_health := v_health || jsonb_build_object(
        'inventory_account',
        CASE WHEN v_inv_acc_id IS NOT NULL THEN 'ok' ELSE 'missing' END
    );

    -- فحص النقدية
    v_cash_acc_id := (v_settings.account_mappings->>'CASH')::uuid;
    v_health := v_health || jsonb_build_object(
        'cash_account',
        CASE WHEN v_cash_acc_id IS NOT NULL THEN 'ok' ELSE 'missing' END
    );

    -- فحص المستودع
    v_health := v_health || jsonb_build_object(
        'default_warehouse',
        CASE WHEN v_wh_id IS NOT NULL THEN 'ok' ELSE 'missing' END
    );

    -- فحص السنة المالية
    v_health := v_health || jsonb_build_object(
        'fiscal_year',
        CASE WHEN v_fy_id IS NOT NULL THEN 'ok' ELSE 'missing' END
    );

    -- فحص دور المدير بصلاحياته
    v_health := v_health || jsonb_build_object(
        'admin_role',
        CASE WHEN EXISTS (
            SELECT 1 FROM public.roles
            WHERE organization_id = v_org_id AND name = 'admin'
        ) THEN 'ok' ELSE 'missing' END
    );

    -- فحص عدد الحسابات
    v_health := v_health || jsonb_build_object(
        'accounts_count',
        (SELECT COUNT(*) FROM public.accounts WHERE organization_id = v_org_id)
    );

    -- ================================================================
    -- 6. إرجاع النتيجة الكاملة
    -- ================================================================
    RETURN jsonb_build_object(
        'success',              true,
        'org_id',               v_org_id,
        'default_warehouse_id', v_wh_id,
        'fiscal_year_id',       v_fy_id,
        'fiscal_year',          v_current_year,
        'plan',                 p_plan,
        'allowed_modules',      v_modules,
        'health_checks',        v_health,
        'all_healthy',          NOT (v_health::text LIKE '%missing%')
    );

EXCEPTION WHEN OTHERS THEN
    -- تسجيل الخطأ ورفعه
    RAISE EXCEPTION 'فشل تأسيس الشركة "%": % (SQLSTATE: %)',
        p_company_name, SQLERRM, SQLSTATE;
END;
$$;

-- منح صلاحية التنفيذ للمستخدمين المصادق عليهم
GRANT EXECUTE ON FUNCTION public.provision_new_org_complete(
    text, text, text, text, text, numeric, text[], int, date
) TO authenticated;

-- ✅ اكتمل
SELECT 'تم إنشاء دالة provision_new_org_complete بنجاح ✅' AS result;
