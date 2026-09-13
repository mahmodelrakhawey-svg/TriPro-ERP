-- =====================================================================
-- 🧹 تنظيف شامل لقاعدة بيانات لينزا وحذف المستخدمين والبيانات المعلقة
-- التاريخ: 2026-09-13
-- الوصف: 
--   1. تحديد شركة "حلواني لينزا" كشركة رئيسية وحيدة في النظام
--   2. فك ارتباط الحسابات المعلقة التابعة للشركات المحذوفة
--   3. فك قيود المفاتيح الأجنبية من جداول السجلات والحركات
--   4. مسح المستخدمين المعلقين من auth.users و public.profiles نهائياً
--   5. تنظيف أي بيانات يتيمة لشركات أخرى
-- =====================================================================

DO $$
DECLARE
    v_lenza_id UUID;
    v_orphan_user_ids UUID[];
    v_del_user_count INT := 0;
BEGIN
    -- 1. العثور على معرف شركة "حلواني لينزا"
    SELECT id INTO v_lenza_id 
    FROM public.organizations 
    WHERE name ILIKE '%لينزا%' 
    ORDER BY created_at ASC 
    LIMIT 1;

    IF v_lenza_id IS NULL THEN
        RAISE EXCEPTION '❌ لم يتم العثور على شركة حلواني لينزا في جدول organizations!';
    END IF;

    RAISE NOTICE '✅ معرف شركة حلواني لينزا: %', v_lenza_id;

    -- 💡 اختياري: إذا كنت تريد الإبقاء على حساب "المدير العام للنظام" وضمه لشركة لينزا، 
    -- قم بإلغاء التعليق عن السطر التالي قبل تشغيل السكربت:
    -- UPDATE public.profiles SET organization_id = v_lenza_id WHERE full_name ILIKE '%المدير العام%';

    -- 2. جمع معرفات كافة المستخدمين الذين لا ينتمون لشركة حلواني لينزا
    SELECT ARRAY_AGG(id) INTO v_orphan_user_ids
    FROM public.profiles
    WHERE organization_id IS NULL 
       OR organization_id <> v_lenza_id;

    IF v_orphan_user_ids IS NULL OR array_length(v_orphan_user_ids, 1) IS NULL THEN
        RAISE NOTICE '✨ لا يوجد مستخدمين معلقين للحذف. جميع المستخدمين مرتبطين بشركة لينزا.';
    ELSE
        RAISE NOTICE '🔍 تم تحديد % مستخدمين معلقين للحذف.', array_length(v_orphan_user_ids, 1);

        -- 3. تفعيل وضع التجاوز لحذف القيود والمستندات بأمان
        PERFORM set_config('app.restore_mode', 'on', true);

        -- 4. فك ارتباط المستخدمين من كافة الجداول المعلقة لتفادي أي خطأ Foreign Key
        
        -- أ. سجلات الأمان والتدقيق والإشعارات
        DELETE FROM public.security_logs WHERE performed_by = ANY(v_orphan_user_ids);
        DELETE FROM public.audit_logs WHERE user_id = ANY(v_orphan_user_ids);
        DELETE FROM public.notification_preferences WHERE user_id = ANY(v_orphan_user_ids);
        DELETE FROM public.notification_audit_log WHERE user_id = ANY(v_orphan_user_ids);
        DELETE FROM public.invitations WHERE invited_by = ANY(v_orphan_user_ids);

        -- ب. المستندات والحركات المحاسبية (تصفير الحقل created_by / approver_id)
        UPDATE public.journal_entries SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        UPDATE public.invoices SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        UPDATE public.purchase_invoices SET created_by = NULL, approver_id = NULL 
            WHERE created_by = ANY(v_orphan_user_ids) OR approver_id = ANY(v_orphan_user_ids);
        UPDATE public.sales_returns SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        UPDATE public.purchase_returns SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        UPDATE public.receipt_vouchers SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        UPDATE public.payment_vouchers SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        UPDATE public.payments SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        UPDATE public.customers SET responsible_user_id = NULL WHERE responsible_user_id = ANY(v_orphan_user_ids);
        UPDATE public.work_orders SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);

        -- ج. موديولات التصنيع والتشفية والمطاعم والمشاريع
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'butchering_orders') THEN
            UPDATE public.butchering_orders SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'driver_deliveries') THEN
            UPDATE public.driver_deliveries SET driver_id = NULL WHERE driver_id = ANY(v_orphan_user_ids);
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_production_orders') THEN
            UPDATE public.mfg_production_orders SET inspector_id = NULL WHERE inspector_id = ANY(v_orphan_user_ids);
        END IF;

        -- 5. حذف بروفايلات المستخدمين من جدول public.profiles
        DELETE FROM public.profiles WHERE id = ANY(v_orphan_user_ids);

        -- 6. حذف المستخدمين نهائياً من منظومة التوثيق auth.users
        DELETE FROM auth.users WHERE id = ANY(v_orphan_user_ids);

        GET DIAGNOSTICS v_del_user_count = ROW_COUNT;
        RAISE NOTICE '🗑️ تم حذف % مستخدم نهائياً من auth.users و profiles.', v_del_user_count;

        -- إعادة وضع الحماية الطبيعي
        PERFORM set_config('app.restore_mode', 'off', true);
    END IF;

    -- 7. تنظيف أي أدوار وصلاحيات قديمة مرتبطة بشركات أخرى محذوفة
    DELETE FROM public.role_permissions 
    WHERE organization_id IS NOT NULL AND organization_id <> v_lenza_id;
    
    DELETE FROM public.roles 
    WHERE organization_id IS NOT NULL AND organization_id <> v_lenza_id;

    -- 8. تنظيف أي إعدادات شركات محذوفة
    DELETE FROM public.company_settings 
    WHERE organization_id IS NOT NULL AND organization_id <> v_lenza_id;

    RAISE NOTICE '🎉 تم تنظيف قاعدة البيانات بنجاح تام! لم يتبق سوى شركة حلواني لينزا ومستخدميها.';
END $$;

-- تحديث كاش المخطط في Supabase
NOTIFY pgrst, 'reload schema';
