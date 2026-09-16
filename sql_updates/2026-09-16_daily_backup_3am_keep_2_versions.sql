-- ==============================================================================
-- 🛡️ TriPro ERP - نظام النسخ الاحتياطي اليومي الآلي (Daily Automated Backup & Retention)
-- التاريخ: 2026-09-16
-- الهدف:
--   1. تفعيل محرك النسخ الاحتياطي اليومي لقاعدة بيانات لينزا (وأي قاعدة نظام).
--   2. الجدولة التلقائية يومياً في تمام الساعة 3:00 فجراً (03:00 AM).
--   3. سياسة الاحتفاظ الصارمة: الاحتفاظ بآخر نسختين فقط (Keep Last 2 Backups Only) 
--      وحذف ما هو أقدم تلقائياً لتوفير المساحة والحفاظ على سرعة قاعدة البيانات.
-- ==============================================================================

-- 1. التأكد من وجود جدول النسخ الاحتياطية وفهارسه
CREATE TABLE IF NOT EXISTS public.organization_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    backup_data JSONB NOT NULL,
    file_size_kb NUMERIC(10,2) DEFAULT 0,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    backup_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_backups_fast 
ON public.organization_backups (organization_id, backup_date DESC);

ALTER TABLE public.organization_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_backups_policy" ON public.organization_backups;
CREATE POLICY "organization_backups_policy" ON public.organization_backups
    FOR ALL TO authenticated
    USING (
        organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
        OR auth.uid() IS NULL -- يسمح للجدولة التلقائية والخلفية بالكتابة
    );

-- ------------------------------------------------------------------------------
-- 2. دالة تنظيف النسخ القديمة (الاحتفاظ بآخر نسختين فقط لكل شركة)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clean_old_organization_backups(p_org_id UUID)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
    -- حذف أي نسخة تتجاوز أحدث نسختين للمنظمة المحددة
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
-- 3. دالة أخذ نسخة احتياطية لمنظمة معينة (Dynamic SaaS Backup Engine)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization_backup(p_org_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_backup_data jsonb := '{}'::jsonb;
    v_table_name text;
    v_table_data jsonb;
    v_backup_id uuid;
    v_org_name text;
BEGIN
    -- جلب اسم الشركة
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    -- ترويسة النسخة الوصفية
    v_backup_data := jsonb_build_object(
        'metadata', jsonb_build_object(
            'version', '2.0',
            'org_id', p_org_id,
            'org_name', COALESCE(v_org_name, 'Unknown'),
            'created_at', now()
        )
    );

    -- تجميع كافة جداول الشركة العامة ديناميكياً
    FOR v_table_name IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name = 'organization_id'
          AND EXISTS (
              SELECT 1 
              FROM information_schema.tables t 
              WHERE t.table_schema = 'public' 
                AND t.table_name = c.table_name 
                AND t.table_type = 'BASE TABLE'
          )
          AND c.table_name NOT IN ('organizations', 'organization_backups', 'profiles')
    LOOP
        BEGIN
            EXECUTE format('SELECT jsonb_agg(to_jsonb(t)) FROM public.%I t WHERE t.organization_id = %L', v_table_name, p_org_id)
            INTO v_table_data;
            
            IF v_table_data IS NOT NULL THEN
                v_backup_data := jsonb_set(v_backup_data, ARRAY[v_table_name], v_table_data, true);
            ELSE
                v_backup_data := jsonb_set(v_backup_data, ARRAY[v_table_name], '[]'::jsonb, true);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- إدراج سجل النسخة الاحتياطية في الجدول
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

    -- تطبيق سياسة الاستبقاء: الإبقاء على آخر نسختين فقط فوراً
    PERFORM public.clean_old_organization_backups(p_org_id);

    RETURN v_backup_id;
END; 
$$;

-- ------------------------------------------------------------------------------
-- 4. الدالة العامة المجدولة لتشغيل النسخ اليومي لكل الشركات النشطة
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_daily_backups_all_orgs()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_org record;
BEGIN
    -- 1. أخذ نسخة لكل منظمة نشطة
    FOR v_org IN SELECT id, name FROM public.organizations WHERE is_active = true LOOP
        BEGIN
            PERFORM public.create_organization_backup(
                v_org.id, 
                'نسخة احتياطية يومية آلية - ' || v_org.name || ' (' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ')'
            );
        EXCEPTION WHEN OTHERS THEN
            -- تسجيل الخطأ في حال حدوثه لشركة دون إيقاف بقية الشركات
            BEGIN
                INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id)
                VALUES (SQLERRM, jsonb_build_object('org_id', v_org.id, 'step', 'auto_backup'), 'run_daily_backups_all_orgs', v_org.id);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END;
    END LOOP;

    -- 2. تنظيف إضافي شامل لأي نسخ قديمة تتجاوز نسختين
    FOR v_org IN SELECT id FROM public.organizations LOOP
        PERFORM public.clean_old_organization_backups(v_org.id);
    END LOOP;

    -- 3. تنظيف الإشعارات القديمة وسجلات النظام لتوفير المساحة
    BEGIN
        DELETE FROM public.notifications WHERE is_read = true;
        DELETE FROM public.notifications WHERE created_at < (now() - interval '2 days');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END; 
$$;

-- منح الصلاحيات اللازمة
GRANT EXECUTE ON FUNCTION public.create_organization_backup(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_daily_backups_all_orgs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clean_old_organization_backups(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. تفعيل الجدولة اليومية التلقائية الساعة 3:00 صباحاً عبر ملحق pg_cron
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- تفعيل إضافة pg_cron إذا كانت متاحة
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') 
       OR EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        
        -- 1. إلغاء أي مهام قديمة بنفس الاسم لتجنب الازدواجية
        BEGIN
            PERFORM cron.unschedule('daily-system-backup');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        BEGIN
            PERFORM cron.unschedule('daily-saas-backup');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- 2. الجدولة: تشغيل يومياً في تمام الساعة 3:00 صباحاً (03:00)
        -- توقيت الخادم: 0 3 * * * تعني الدقيقة 0 من الساعة 3 فجراً كل يوم
        PERFORM cron.schedule('daily-system-backup', '0 3 * * *', 'SELECT public.run_daily_backups_all_orgs();');
        
        RAISE NOTICE '✅ تم بنجاح تفعيل جدولة النسخ الاحتياطي اليومي الساعة 3:00 صباحاً مع الاحتفاظ بآخر نسختين فقط.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: ملحق pg_cron يحتاج للتفعيل في لوحة Supabase من (Database -> Extensions -> pg_cron). بعد تفعيله أعد تشغيل هذا الملف.';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
