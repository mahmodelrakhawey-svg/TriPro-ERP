-- 🕵️ سكربت التحقق من حالة الحماية (RLS Status Check)
-- قم بتشغيل هذا السكربت في Supabase SQL Editor

-- 1. التحقق من تفعيل RLS على الجداول
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

-- 2. عرض السياسات المفعلة (Policies)
SELECT
  tablename AS "الجدول",
  policyname AS "اسم السياسة",
  cmd AS "العملية",
  roles AS "الأدوار المستهدفة"
FROM
  pg_policies
WHERE
  schemaname = 'public'
ORDER BY
  tablename ASC;