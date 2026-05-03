-- ============================================
-- زيادة الحد الأقصى للمستخدمين
-- ============================================

-- الخطوة 1: زيادة الحد الأقصى للمستخدمين في المنظمات
UPDATE public.organizations
SET max_users = 999
WHERE max_users <= 5;

-- الخطوة 2: عرض الحالة الحالية
SELECT 
    o.id,
    o.name,
    o.max_users,
    (SELECT COUNT(*) FROM public.profiles WHERE organization_id = o.id) as عدد_المستخدمين_الحالي
FROM public.organizations o;
