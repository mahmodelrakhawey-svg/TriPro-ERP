-- ============================================
-- تعطيل RLS كلياً لتحديد المشكلة
-- ============================================

-- تعطيل RLS على جميع الجداول
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
    END LOOP;
END $$;

SELECT '✅ تم تعطيل RLS على جميع الجداول' as النتيجة;

-- تحقق من حالة RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;