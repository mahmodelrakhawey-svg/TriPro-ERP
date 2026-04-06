-- استعلام مبسط للفحص السريع

-- 1. عدد المستخدمين والملفات الشخصية
SELECT 
    (SELECT COUNT(*) FROM auth.users) as total_auth_users,
    (SELECT COUNT(*) FROM public.profiles) as total_profiles,
    (SELECT COUNT(*) FROM public.organizations) as total_orgs;

-- 2. تفاصيل كل مستخدم
SELECT 
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'org_id', 'لا يوجد') as org_from_metadata,
    COALESCE(p.organization_id::text, 'لا يوجد') as org_from_profile,
    COALESCE(p.role, 'لا يوجد') as user_role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id;

-- 3. المنظمات والمستخدمين فيها
SELECT 
    o.id,
    o.name,
    COUNT(p.id) as عدد_المستخدمين
FROM public.organizations o
LEFT JOIN public.profiles p ON o.id = p.organization_id
GROUP BY o.id, o.name;

-- 4. سياسات RLS على المنتجات
SELECT policyname, qual 
FROM pg_policies 
WHERE tablename = 'products';
