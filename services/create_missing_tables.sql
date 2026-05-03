-- ============================================
-- إنشاء الجداول المفقودة قبل إضافة السياسات
-- ============================================

-- إنشاء جدول menu_categories إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.menu_categories IS 'Categories for menu items like Appetizers, Main Courses, etc.';

-- إنشاء جدول notifications إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.notifications IS 'User notifications within the system';

-- التحقق من إنشاء الجداول
SELECT '✅ تم إنشاء الجداول المفقودة!' as النتيجة;

SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('menu_categories', 'notifications');