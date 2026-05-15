-- ============================================
-- تشخيص مشاكل المصادقة والملفات الشخصية
-- ============================================

-- 1. فحص جميع مستخدمي المصادقة وملفاتهم الشخصية
SELECT 
    u.id as user_id,
    u.email,
    u.created_at as auth_created,
    COALESCE(u.raw_user_meta_data->>'org_id', 'NULL') as metadata_org_id,
    p.id as profile_id,
    p.organization_id as profile_org_id,
    p.role,
    CASE 
        WHEN p.id IS NULL THEN 'MISSING_PROFILE'
        WHEN p.organization_id IS NULL THEN 'NULL_ORG_ID'
        WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p.organization_id) THEN 'INVALID_ORG_ID'
        ELSE 'OK'
    END as status
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
ORDER BY u.created_at DESC;

-- 2. فحص المنظمات الموجودة
SELECT 
    id,
    name,
    created_at,
    (SELECT COUNT(*) FROM public.profiles WHERE organization_id = id) as user_count
FROM public.organizations
ORDER BY created_at DESC;

-- 3. فحص سياسات RLS على جدول المنتجات
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    qual as using_expression,
    with_check
FROM pg_policies
WHERE tablename = 'products'
ORDER BY policyname;

-- 4. اختبار دالة get_my_org() للمستخدم الحالي
SELECT 
    auth.uid() as current_user_id,
    public.get_my_org() as my_org_id,
    public.get_my_role() as my_role;

-- 5. فحص جدول invitations إذا كانت هناك دعوات معلقة
SELECT 
    id,
    email,
    organization_id,
    role,
    created_at,
    accepted_at
FROM public.invitations
ORDER BY created_at DESC
LIMIT 10;
