-- ==============================================================================
-- 🛡️ TriPro ERP - نظام النسخ الاحتياطي اليومي الآلي (Daily Automated Backup & Retention)
-- التاريخ: 2026-09-16
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
        OR auth.uid() IS NULL
    );

-- ------------------------------------------------------------------------------
-- 2. دالة الاحتفاظ بآخر نسختين فقط (حذف ما هو أقدم من أحدث نسختين)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.clean_old_organization_backups(UUID);
CREATE OR REPLACE FUNCTION public.clean_old_organization_backups(p_org_id UUID)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER 
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
-- 3. دالة أخذ نسخة احتياطية لمنظمة معينة (حذف التوقيعات القديمة أولاً)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_organization_backup(uuid);
DROP FUNCTION IF EXISTS public.create_organization_backup(uuid, text);

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
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    v_backup_data := jsonb_build_object(
        'metadata', jsonb_build_object(
            'version', '2.0',
            'org_id', p_org_id,
            'org_name', COALESCE(v_org_name, 'Unknown'),
            'created_at', now()
        )
    );

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
-- 4. الدالة العامة لتشغيل النسخ اليومي لكل الشركات (مع DROP FUNCTION أولاً)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.run_daily_backups_all_orgs();

CREATE OR REPLACE FUNCTION public.run_daily_backups_all_orgs()
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_org record;
    v_success_count int := 0;
BEGIN
    -- 1. أخذ نسخة لكل منظمة نشطة
    FOR v_org IN SELECT id, name FROM public.organizations WHERE is_active = true LOOP
        BEGIN
            PERFORM public.create_organization_backup(
                v_org.id, 
                'نسخة احتياطية يومية آلية - ' || v_org.name || ' (' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ')'
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

    -- 3. تنظيف الإشعارات القديمة
    BEGIN
        DELETE FROM public.notifications WHERE is_read = true;
        DELETE FROM public.notifications WHERE created_at < (now() - interval '2 days');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN 'Success: Processed ' || v_success_count || ' organizations.';
END; 
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_backup(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_daily_backups_all_orgs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clean_old_organization_backups(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. تفعيل الجدولة اليومية الساعة 3:00 صباحاً عبر pg_cron
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') 
       OR EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        
        BEGIN
            PERFORM cron.unschedule('daily-system-backup');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        BEGIN
            PERFORM cron.unschedule('daily-saas-backup');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- تشغيل يومياً في تمام الساعة 3:00 صباحاً
        PERFORM cron.schedule('daily-system-backup', '0 3 * * *', 'SELECT public.run_daily_backups_all_orgs();');
        
        RAISE NOTICE '✅ تم تفعيل جدولة النسخ الاحتياطي اليومي الساعة 3:00 صباحاً مع الاحتفاظ بآخر نسختين فقط.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: يرجى تفعيل ملحق pg_cron أولاً من (Database -> Extensions -> pg_cron).';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
