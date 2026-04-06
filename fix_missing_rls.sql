-- ============================================
-- إصلاح سياسات RLS للجداول المفقودة (403 Forbidden)
-- ============================================

-- حذف السياسات القديمة من الجداول المشكلة
DROP POLICY IF EXISTS "notifications viewable" ON public.notifications CASCADE;
DROP POLICY IF EXISTS "notifications management" ON public.notifications CASCADE;
DROP POLICY IF EXISTS "menu_categories viewable" ON public.menu_categories CASCADE;
DROP POLICY IF EXISTS "menu_categories management" ON public.menu_categories CASCADE;

-- تفعيل RLS على الجداول المفقودة
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات بسيطة للجداول المفقودة
CREATE POLICY "notifications_read" ON public.notifications
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "notifications_write" ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "menu_categories_read" ON public.menu_categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "menu_categories_write" ON public.menu_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "menu_categories_update" ON public.menu_categories
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "menu_categories_delete" ON public.menu_categories
  FOR DELETE
  TO authenticated
  USING (true);

-- التحقق من النتائج
SELECT '✅ تم إصلاح سياسات الجداول المفقودة!' as النتيجة;

SELECT
    tablename,
    COUNT(*) as عدد_السياسات
FROM pg_policies
WHERE tablename IN ('notifications', 'menu_categories')
GROUP BY tablename;