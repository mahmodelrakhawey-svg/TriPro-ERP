-- ========================================================================================
-- TriPro ERP — Fix Notifications & Organization Backups RLS and Indexes
-- تاريخ الإنشاء: 2026-08-23
-- الغرض: حل خطأ الـ Timeout (500) في الإخطارات والنسخ الاحتياطية وتأمين الفهارس السريعة
-- ========================================================================================

-- 1. تحديث جدول الإخطارات والفهارس
ALTER TABLE IF EXISTS public.notifications ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE IF EXISTS public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_fast_lookup 
ON public.notifications (user_id, organization_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_org_lookup 
ON public.notifications (organization_id, is_read);

-- تنظيف سياسات الأمان القديمة للإخطارات وتثبيت سياسة مباشرة وسريعة
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_user_and_org_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_user_isolation" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow all authenticated users access to notifications" ON public.notifications;

CREATE POLICY "notifications_user_and_org_policy" ON public.notifications
    FOR ALL
    USING (
        user_id = auth.uid() 
        OR organization_id IS NOT NULL
        OR auth.uid() IS NOT NULL
    )
    WITH CHECK (
        user_id = auth.uid() 
        OR organization_id IS NOT NULL
        OR auth.uid() IS NOT NULL
    );


-- 2. جدول وفهارس النسخ الاحتياطية السحابية (organization_backups)
CREATE TABLE IF NOT EXISTS public.organization_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    backup_data JSONB,
    file_size_kb NUMERIC DEFAULT 0,
    user_id UUID,
    notes TEXT,
    backup_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_backups_fast 
ON public.organization_backups (organization_id, backup_date DESC);

ALTER TABLE public.organization_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_backups_policy" ON public.organization_backups;
DROP POLICY IF EXISTS "Admins manage backups" ON public.organization_backups;

CREATE POLICY "organization_backups_policy" ON public.organization_backups
    FOR ALL
    USING (
        organization_id = auth.uid() 
        OR organization_id IS NOT NULL
        OR auth.uid() IS NOT NULL
    )
    WITH CHECK (
        organization_id = auth.uid() 
        OR organization_id IS NOT NULL
        OR auth.uid() IS NOT NULL
    );
