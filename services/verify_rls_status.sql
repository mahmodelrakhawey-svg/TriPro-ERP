-- 🕵️ سكربت التحقق من حالة الحماية (RLS Status Check)
-- قم بتشغيل هذا السكربت في Supabase SQL Editor
-- سيعرض لك قائمة بجميع الجداول وحالة تفعيل RLS عليها

SELECT
  tablename AS "اسم الجدول",
  CASE
    WHEN rowsecurity = true THEN '✅ محمي (RLS Enabled)'
    ELSE '❌ غير محمي (Unrestricted)'
  END AS "حالة الحماية"
FROM
  pg_tables
WHERE
  schemaname = 'public'
ORDER BY
  rowsecurity ASC, -- يظهر الجداول غير المحمية أولاً
  tablename ASC;