-- ============================================
-- تحديد الجداول التي ليس لديها سياسات RLS
-- ============================================

SELECT 
    t.tablename,
    COALESCE(COUNT(p.policyname), 0) as عدد_السياسات_الحالي
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'public'
GROUP BY t.tablename
HAVING COALESCE(COUNT(p.policyname), 0) = 0
ORDER BY t.tablename;

-- ============================================
-- إحصائيات عامة
-- ============================================

SELECT
    COUNT(DISTINCT tablename) as إجمالي_جداول_بسياسات,
    COUNT(*) as إجمالي_السياسات
FROM pg_policies
WHERE schemaname = 'public';

-- ============================================
-- عدد جميع الجداول في قاعدة البيانات
-- ============================================
SELECT COUNT(*) as إجمالي_الجداول FROM pg_tables WHERE schemaname = 'public';