-- services/backup_service.sql
-- هذا الملف يحتوي على الدوال والجداول الخاصة بالنسخ الاحتياطي للمنظمات.

-- Assuming public.organization_backups table exists
CREATE TABLE IF NOT EXISTS public.organization_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    backup_date TIMESTAMPTZ DEFAULT NOW(),
    backup_data JSONB NOT NULL,
    file_size_kb NUMERIC(10,2),
    user_id UUID REFERENCES public.profiles(id),
    notes TEXT
);

-- Function to clean up old backups (keeping only the last 5)
CREATE OR REPLACE FUNCTION public.clean_old_organization_backups(p_org_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    DELETE FROM public.organization_backups
    WHERE organization_id = p_org_id
    AND id NOT IN (
        SELECT id
        FROM public.organization_backups
        WHERE organization_id = p_org_id
        ORDER BY backup_date DESC
        LIMIT 5
    );
END;
$$;

-- Function to create an organization backup
CREATE OR REPLACE FUNCTION public.create_organization_backup(p_org_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_backup_data JSONB;
    v_backup_id UUID;
    v_error_message TEXT;
    v_error_state TEXT;
BEGIN
    -- Simulate backup process
    BEGIN
        -- This is where the actual backup logic would be.
        -- For demonstration, let's simulate success or failure.
        -- IF RANDOM() < 0.1 THEN -- 10% chance of failure for testing
        --     RAISE EXCEPTION 'Simulated backup failure for organization %', p_org_id;
        -- END IF;

        -- Actual data export logic would go here.
        -- For example, fetching data from various tables:
        SELECT jsonb_build_object(
            'organizations', (SELECT to_jsonb(array_agg(t)) FROM public.organizations t WHERE t.id = p_org_id),
            'products', (SELECT to_jsonb(array_agg(t)) FROM public.products t WHERE t.organization_id = p_org_id),
            'invoices', (SELECT to_jsonb(array_agg(t)) FROM public.invoices t WHERE t.organization_id = p_org_id)
            -- ... and so on for all relevant tables
        ) INTO v_backup_data;

        INSERT INTO public.organization_backups (organization_id, backup_data, file_size_kb, user_id, notes)
        VALUES (p_org_id, v_backup_data, pg_column_size(v_backup_data) / 1024.0, auth.uid(), 'Automatic cloud backup')
        RETURNING id INTO v_backup_id;

        -- Clean up old backups (last 5 logic)
        PERFORM public.clean_old_organization_backups(p_org_id);

        RETURN v_backup_id;

    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT, v_error_state = PG_EXCEPTION_DETAIL;
        
        -- Create a notification for the super admin
        PERFORM public.create_notification_from_sql(
            p_org_id,
            NULL, -- For all admins
            'فشل النسخ الاحتياطي السحابي 🔴',
            'فشل النظام في إنشاء نسخة احتياطية سحابية للمنظمة ' || p_org_id || '. السبب: ' || v_error_message,
            'backup_failure',
            'high',
            '/settings' -- Link to settings page
        );
        RAISE EXCEPTION 'Backup failed: %', v_error_message; -- Re-raise the exception
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_backup(UUID) TO authenticated;