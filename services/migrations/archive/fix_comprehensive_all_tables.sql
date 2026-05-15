-- ============================================
-- حل شامل نهائي: حذف جميع السياسات القديمة وإضافة سياسات بسيطة
-- ============================================

-- حذف جميع السياسات من جميع الجداول
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "%s" ON %I.%I CASCADE', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- تفعيل RLS على جميع الجداول
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    END LOOP;
END $$;

-- إضافة سياسات بسيطة جداً لجميع الجداول (USING true)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    ) LOOP
        -- SELECT
        EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT TO authenticated USING (true)', r.tablename, r.tablename);
        -- INSERT
        EXECUTE format('CREATE POLICY "%s_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', r.tablename, r.tablename);
        -- UPDATE
        EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', r.tablename, r.tablename);
        -- DELETE
        EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (true)', r.tablename, r.tablename);
    END LOOP;
END $$;

-- التحقق من النتائج
SELECT '✅ تم حذف جميع السياسات واستبدالها بسياسات بسيطة!' as النتيجة;

SELECT
    COUNT(DISTINCT tablename) as إجمالي_الجداول_بسياسات,
    COUNT(*) as إجمالي_السياسات
FROM pg_policies
WHERE schemaname = 'public';