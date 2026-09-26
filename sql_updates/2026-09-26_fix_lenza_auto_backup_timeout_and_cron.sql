-- ==============================================================================
-- 🛡️ TriPro ERP - إصلاح وحل مشكلة النسخ الاحتياطي التلقائي لقاعدة لينزا
-- التاريخ: 2026-09-26
-- المشكلة المعالجة:
-- 1. إلغاء العملية بسبب انتهاء المهلة (canceling statement due to statement timeout 57014)
--    نظراً لأن قاعدة لينزا تشغيلية وتحتوي على مئات الآلاف من السجلات، كان الاستعلام ينقطع بعد 3 ثوانٍ.
-- 2. رفع مهلة التنفيذ (statement_timeout) إلى 5 دقائق (300s) داخل الدوال.
-- 3. تسريع مسح الجداول باستخدام pg_catalog بدلاً من information_schema البطيء.
-- 4. ضبط توقيت الجدولة ليكون 3:00 فجراً بتوقيت القاهرة (00:00 UTC).
-- 5. ضمان شمول منظمة لينزا حتى لو كانت قيمة is_active فارغة (COALESCE).
-- ==============================================================================

-- 1. تفعيل ملحق pg_cron إن لم يكن مفعلاً
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ------------------------------------------------------------------------------
-- 2. دالة تنظيف النسخ القديمة والإبقاء على آخر نسختين فقط
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clean_old_organization_backups(p_org_id UUID)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET statement_timeout = '300s'
AS $$
BEGIN
    DELETE FROM public.organization_backups
    WHERE organization_id = p_org_id
      AND id IN (
          SELECT id
          FROM public.organization_backups
          WHERE organization_id = p_org_id
          ORDER BY COALESCE(backup_date, created_at) DESC
          OFFSET 2
      );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. دالة أخذ نسخة احتياطية فائقة السرعة مع مهلة 300 ثانية
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization_backup(p_org_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET statement_timeout = '300s'
AS $$
DECLARE
    v_backup_data jsonb := '{}'::jsonb;
    v_table_name text;
    v_table_data jsonb;
    v_backup_id uuid;
    v_org_name text;
BEGIN
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    v_backup_data := jsonb_build_object(
        'metadata', jsonb_build_object(
            'version', '2.1',
            'org_id', p_org_id,
            'org_name', COALESCE(v_org_name, 'Unknown'),
            'created_at', now()
        )
    );

    -- مسح الجداول عبر pg_catalog فائق السرعة
    FOR v_table_name IN
        SELECT DISTINCT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r' -- جداول فعلية فقط (BASE TABLE)
          AND a.attname = 'organization_id'
          AND NOT a.attisdropped
          AND c.relname NOT IN (
              'organizations', 
              'organization_backups', 
              'profiles', 
              'system_error_logs', 
              'audit_logs'
          )
    LOOP
        BEGIN
            EXECUTE format(
                'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE t.organization_id = %L', 
                v_table_name, 
                p_org_id
            ) INTO v_table_data;
            
            -- دمج بيانات الجدول في كائن النسخة الاحتياطية
            v_backup_data := v_backup_data || jsonb_build_object(v_table_name, COALESCE(v_table_data, '[]'::jsonb));
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    INSERT INTO public.organization_backups (
        organization_id, 
        backup_data, 
        file_size_kb, 
        user_id, 
        notes,
        backup_date,
        created_at
    ) VALUES (
        p_org_id,
        v_backup_data,
        ROUND((pg_column_size(v_backup_data) / 1024.0)::numeric, 2),
        auth.uid(),
        COALESCE(p_notes, 'نسخة احتياطية يومية آلية: ' || COALESCE(v_org_name, '')),
        now(),
        now()
    ) RETURNING id INTO v_backup_id;

    -- تطبيق سياسة الاستبقاء: الإبقاء على آخر نسختين فقط
    PERFORM public.clean_old_organization_backups(p_org_id);

    RETURN v_backup_id;
END; 
$$;

-- ------------------------------------------------------------------------------
-- 4. الدالة العامة لتشغيل النسخ اليومي لكل الشركات مع عزل الأخطاء ورفع المهلة
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_daily_backups_all_orgs()
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER
SET statement_timeout = '300s'
AS $$
DECLARE
    v_org record;
    v_success_count int := 0;
BEGIN
    -- 1. أخذ نسخة لكل منظمة (مع دعم الشركات التي قيمة is_active لها null أو true)
    FOR v_org IN 
        SELECT id, name 
        FROM public.organizations 
        WHERE COALESCE(is_active, true) = true 
    LOOP
        BEGIN
            PERFORM public.create_organization_backup(
                v_org.id, 
                'نسخة احتياطية يومية آلية - ' || v_org.name || ' (' || to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') || ')'
            );
            v_success_count := v_success_count + 1;
        EXCEPTION WHEN OTHERS THEN
            BEGIN
                INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id)
                VALUES (SQLERRM, jsonb_build_object('org_id', v_org.id, 'step', 'auto_backup'), 'run_daily_backups_all_orgs', v_org.id);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END;
    END LOOP;

    -- 2. تنظيف إضافي لضمان بقاء آخر نسختين فقط
    FOR v_org IN SELECT id FROM public.organizations LOOP
        PERFORM public.clean_old_organization_backups(v_org.id);
    END LOOP;

    -- 3. تنظيف الإشعارات المقروءة والقديمة
    BEGIN
        DELETE FROM public.notifications WHERE is_read = true;
        DELETE FROM public.notifications WHERE created_at < (now() - interval '2 days');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN 'Success: Processed ' || v_success_count || ' organizations.';
END; 
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_backup(uuid, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.run_daily_backups_all_orgs() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.clean_old_organization_backups(UUID) TO authenticated, service_role, anon;

-- ------------------------------------------------------------------------------
-- 5. تفعيل وضبط الجدولة اليومية الساعة 3:00 صباحاً بتوقيت مصر
-- ملاحظة: خوادم Supabase تعمل بتوقيت UTC. الساعة 3:00 فجراً بتوقيت القاهرة (UTC+3) تعادل 00:00 UTC.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') 
       OR EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        
        -- حذف أي مهام سابقة متعارضة
        BEGIN
            PERFORM cron.unschedule('daily-system-backup');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        BEGIN
            PERFORM cron.unschedule('daily-saas-backup');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        BEGIN
            PERFORM cron.unschedule('daily-lenza-backup-cairo');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- ⏰ المهمة الأساسية: الساعة 3:00 صباحاً بتوقيت القاهرة (00:00 UTC)
        PERFORM cron.schedule(
            'daily-system-backup', 
            '0 0 * * *', 
            'SELECT public.run_daily_backups_all_orgs();'
        );

        -- ⏰ مهمة ثانوية احتياطية (الساعة 3:00 بتوقيت UTC / 6:00 صباحاً بتوقيت القاهرة)
        PERFORM cron.schedule(
            'daily-backup-fallback', 
            '0 3 * * *', 
            'SELECT public.run_daily_backups_all_orgs();'
        );
        
        RAISE NOTICE '✅ تم تفعيل وضبط جدولتين للنسخ الاحتياطي التلقائي (3:00 ص و 6:00 ص بتوقيت مصر) مع الاحتفاظ بآخر نسختين.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: يرجى تفعيل ملحق pg_cron أولاً من (Database -> Extensions -> pg_cron).';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- استعلام التحقق من جدول المهام المجدولة
SELECT jobid, schedule, command, active FROM cron.job;
