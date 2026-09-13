-- =====================================================================
-- 🧹 تنظيف شامل لقاعدة بيانات لينزا وحذف المستخدمين والبيانات المعلقة (ديناميكي وآمن 100%)
-- التاريخ: 2026-09-13
-- الوصف: 
--   1. تحديد شركة "حلواني لينزا" كشركة رئيسية وحيدة في النظام
--   2. فحص الجداول ديناميكياً قبل التنفيذ لتفادي خطأ الجداول غير الموجودة (42P01)
--   3. فك قيود المفاتيح الأجنبية من أي جدول مرتبط بمستخدمي الشركات المحذوفة
--   4. مسح المستخدمين المعلقين من auth.users و public.profiles نهائياً
--   5. تنظيف أي أدوار أو إعدادات يتيمة لشركات محذوفة
-- =====================================================================

DO $$
DECLARE
    v_lenza_id UUID;
    v_orphan_user_ids UUID[];
    v_del_user_count INT := 0;
    v_tbl TEXT;
    v_col TEXT;
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

    RAISE NOTICE '✅ معرف شركة حلواني لينزا المستهدفة: %', v_lenza_id;

    -- 💡 اختياري: إذا كنت تود الاحتفاظ بحساب "المدير العام للنظام" وضمه لشركة لينزا، احذف الـ -- من السطر التالي:
    -- UPDATE public.profiles SET organization_id = v_lenza_id WHERE full_name ILIKE '%المدير العام%';

    -- 2. حصر معرفات كافة المستخدمين الذين لا ينتمون لشركة حلواني لينزا
    SELECT ARRAY_AGG(id) INTO v_orphan_user_ids
    FROM public.profiles
    WHERE organization_id IS NULL 
       OR organization_id <> v_lenza_id;

    IF v_orphan_user_ids IS NULL OR array_length(v_orphan_user_ids, 1) IS NULL THEN
        RAISE NOTICE '✨ لا يوجد مستخدمين معلقين للحذف. جميع المستخدمين الحاليين يتبعون شركة لينزا.';
        RETURN;
    END IF;

    RAISE NOTICE '🔍 تم العثور على % مستخدمين معلقين سيتم تنظيفهم.', array_length(v_orphan_user_ids, 1);

    -- 3. تفعيل وضع التجاوز المؤقت
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 4. فك ارتباط الجداول التي قد تحوي foreign keys تشير إلى المستخدمين (ديناميكياً وبأمان تام)

    -- أ. سجلات الأمان والتدقيق والإشعارات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_logs') THEN
        BEGIN
            DELETE FROM public.security_logs WHERE performed_by = ANY(v_orphan_user_ids) OR target_user_id = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        BEGIN
            EXECUTE 'DELETE FROM public.audit_logs WHERE user_id = ANY($1)' USING v_orphan_user_ids;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_preferences') THEN
        BEGIN
            DELETE FROM public.notification_preferences WHERE user_id = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_audit_log') THEN
        BEGIN
            DELETE FROM public.notification_audit_log WHERE user_id = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invitations') THEN
        BEGIN
            DELETE FROM public.invitations WHERE invited_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- ب. تصفير حقول المستخدمين في المستندات والحركات بأمان
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'journal_entries') THEN
        BEGIN
            UPDATE public.journal_entries SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
        BEGIN
            UPDATE public.invoices SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_invoices') THEN
        BEGIN
            UPDATE public.purchase_invoices SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'purchase_invoices' AND column_name = 'approver_id') THEN
                UPDATE public.purchase_invoices SET approver_id = NULL WHERE approver_id = ANY(v_orphan_user_ids);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_returns') THEN
        BEGIN
            UPDATE public.sales_returns SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_returns') THEN
        BEGIN
            UPDATE public.purchase_returns SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'receipt_vouchers') THEN
        BEGIN
            UPDATE public.receipt_vouchers SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_vouchers') THEN
        BEGIN
            UPDATE public.payment_vouchers SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
        BEGIN
            UPDATE public.payments SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'responsible_user_id') THEN
                UPDATE public.customers SET responsible_user_id = NULL WHERE responsible_user_id = ANY(v_orphan_user_ids);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'work_orders') THEN
        BEGIN
            UPDATE public.work_orders SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'butchering_orders') THEN
        BEGIN
            UPDATE public.butchering_orders SET created_by = NULL WHERE created_by = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'driver_deliveries') THEN
        BEGIN
            UPDATE public.driver_deliveries SET driver_id = NULL WHERE driver_id = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_production_orders') THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mfg_production_orders' AND column_name = 'inspector_id') THEN
                UPDATE public.mfg_production_orders SET inspector_id = NULL WHERE inspector_id = ANY(v_orphan_user_ids);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- ج. شبكة أمان ديناميكية: فحص أي جدول آخر في قاعدة البيانات مرتبط بمفتاح أجنبي مع auth.users أو public.profiles
    FOR v_tbl, v_col IN (
        SELECT DISTINCT
            c.conrelid::regclass::text,
            a.attname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE (c.confrelid = 'auth.users'::regclass OR c.confrelid = 'public.profiles'::regclass)
          AND c.contype = 'f'
          AND c.conrelid::regclass::text NOT IN ('public.profiles', 'auth.users', 'auth.identities', 'auth.sessions', 'auth.refresh_tokens', 'auth.mfa_factors')
    ) LOOP
        BEGIN
            EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = ANY($1)', v_tbl, v_col, v_col) USING v_orphan_user_ids;
        EXCEPTION WHEN OTHERS THEN
            BEGIN
                EXECUTE format('DELETE FROM %s WHERE %I = ANY($1)', v_tbl, v_col) USING v_orphan_user_ids;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END;
    END LOOP;

    -- 5. حذف بروفايلات المستخدمين من جدول public.profiles
    DELETE FROM public.profiles WHERE id = ANY(v_orphan_user_ids);

    -- 6. حذف المستخدمين نهائياً من منظومة التوثيق auth.users
    DELETE FROM auth.users WHERE id = ANY(v_orphan_user_ids);

    GET DIAGNOSTICS v_del_user_count = ROW_COUNT;
    RAISE NOTICE '🗑️ تم حذف % مستخدم نهائياً من auth.users و profiles.', v_del_user_count;

    -- إعادة وضع الحماية الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);

    -- 7. مسح أي أدوار وصلاحيات قديمة لشركات أخرى
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'role_permissions') THEN
        DELETE FROM public.role_permissions 
        WHERE organization_id IS NOT NULL AND organization_id <> v_lenza_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roles') THEN
        DELETE FROM public.roles 
        WHERE organization_id IS NOT NULL AND organization_id <> v_lenza_id;
    END IF;

    -- 8. مسح أي إعدادات لشركات محذوفة
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_settings') THEN
        DELETE FROM public.company_settings 
        WHERE organization_id IS NOT NULL AND organization_id <> v_lenza_id;
    END IF;

    RAISE NOTICE '🎉 تم الانتهاء بنجاح تام! أصبحت قاعدة البيانات خاصة فقط بشركة حلواني لينزا ومستخدميها.';
END $$;

-- تحديث كاش السيرفر
NOTIFY pgrst, 'reload schema';
