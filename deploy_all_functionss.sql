-- 🚀 ملف نشر كافة الدوال (Consolidated Functions Deployment)
-- يجمع دوال النظام الأساسي + مديول التصنيع + دعم SaaS

-- 1. دالة جلب المنظمة (تدعم تعدد العملاء والمستخدم العالمي)
CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid AS $$
BEGIN
    -- محاولة جلب المنظمة من الـ Claims أولاً ثم من ملف المستخدم
    RETURN coalesce(
        (current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id')::uuid,
        (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    );
END; $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. دالة التحقق من المستخدم العالمي (Super Admin)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin';
END; $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. دمج دوال التصنيع (MFG RPCs)
-- [سيتم استدعاء ملف services/mfg/manufacturing_functions.sql داخلياً أو دمج محتواه هنا]

-- مثال لدالة أساسية مدمجة: فحص حد الائتمان
CREATE OR REPLACE FUNCTION public.get_over_limit_customers(p_org_id uuid)
RETURNS TABLE (customer_id uuid, name text, balance numeric, credit_limit numeric) AS $$
BEGIN
    RETURN QUERY
    SELECT id, name, balance, credit_limit
    FROM public.customers
    WHERE organization_id = p_org_id AND balance > credit_limit;
END; $$ LANGUAGE plpgsql STABLE;

-- إضافة المزيد من الدوال المالية هنا...