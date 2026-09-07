-- services/setup_notifications.sql
-- هذا الملف يحتوي على تعريفات الجداول والدوال الخاصة بنظام الإشعارات.

-- Enum for notification types
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE public.notification_type AS ENUM (
            'overdue_payment',
            'low_inventory',
            'high_debt',
            'pending_approval',
            'due_date_approaching',
            'project_performance_alert',
            'retention_release_alert',
            'system_alert',
            'success',
            'warning'
        );
    END IF;
    -- Add new values if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.notification_type'::regtype AND enumlabel = 'backup_failure') THEN
        ALTER TYPE public.notification_type ADD VALUE 'backup_failure';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.notification_type'::regtype AND enumlabel = 'manufacturing_cost_overrun') THEN
        ALTER TYPE public.notification_type ADD VALUE 'manufacturing_cost_overrun';
    END IF;
END $$;

-- Enum for notification priority
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_priority') THEN
        CREATE TYPE public.notification_priority AS ENUM (
            'low',
            'medium',
            'high'
        );
    END IF;
END $$;

-- Table for notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Optional: if for a specific user
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type public.notification_type NOT NULL,
    priority public.notification_priority NOT NULL DEFAULT 'medium',
    is_read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    related_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ -- Optional: for notifications that expire
);

-- RLS policies for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizations can view their own notifications" ON public.notifications
FOR SELECT USING (organization_id = public.get_my_org());

CREATE POLICY "Organizations can insert their own notifications" ON public.notifications
FOR INSERT WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "Organizations can update their own notifications" ON public.notifications
FOR UPDATE USING (organization_id = public.get_my_org());

CREATE POLICY "Organizations can delete their own notifications" ON public.notifications
FOR DELETE USING (organization_id = public.get_my_org());

-- Function to create notifications from SQL
CREATE OR REPLACE FUNCTION public.create_notification_from_sql(
    p_org_id UUID,
    p_user_id UUID, -- Optional: if notification is for a specific user, otherwise for all admins
    p_title TEXT,
    p_message TEXT,
    p_type public.notification_type,
    p_priority public.notification_priority,
    p_action_url TEXT DEFAULT NULL,
    p_related_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.notifications (organization_id, user_id, title, message, type, priority, action_url, related_id)
    VALUES (p_org_id, p_user_id, p_title, p_message, p_type, p_priority, p_action_url, p_related_id);
    RETURN (SELECT id FROM public.notifications ORDER BY created_at DESC LIMIT 1); -- Return the ID of the newly created notification
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification_from_sql(UUID, UUID, TEXT, TEXT, public.notification_type, public.notification_priority, TEXT, UUID) TO authenticated;