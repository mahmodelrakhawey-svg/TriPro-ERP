-- استعلام بسيط جداً للفحص

-- 1. عدد الملفات الشخصية
SELECT COUNT(*) as عدد_الملفات_الشخصية FROM public.profiles;

-- 2. الملفات الشخصية الموجودة
SELECT id, full_name, role, organization_id FROM public.profiles LIMIT 10;

-- 3. سياسات RLS على accounts
SELECT policyname, qual FROM pg_policies WHERE tablename = 'accounts' LIMIT 5;

-- 4. سياسات RLS على journal_entries
SELECT policyname, qual FROM pg_policies WHERE tablename = 'journal_entries' LIMIT 5;
