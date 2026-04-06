-- فحص حالة الملفات الشخصية والصلاحيات

-- 1. التحقق من الملفات الشخصية والصلاحيات
SELECT 
    p.id,
    p.full_name,
    p.role,
    p.organization_id,
    o.name as org_name
FROM public.profiles p
LEFT JOIN public.organizations o ON p.organization_id = o.id;

-- 2. التحقق من سياسات RLS
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    qual
FROM pg_policies
WHERE tablename IN ('accounts', 'journal_entries', 'restaurant_tables', 'purchase_invoices')
ORDER BY tablename, policyname;

-- 3. اختبار دالة get_my_role للمستخدم الحالي
SELECT 
    CASE WHEN auth.uid() IS NOT NULL THEN 'مسجل دخول' ELSE 'غير مسجل' END as حالة_المستخدم,
    public.get_my_role() as الدور_الحالي;
