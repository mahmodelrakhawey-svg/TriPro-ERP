-- تحديث دالة get_over_limit_customers من deploy_all_functionss.sql
-- لإصلاح مشكلة الـ 404 في Supabase

-- ج. جلب العملاء المتجاوزين لحد الائتمان
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_over_limit_customers() CASCADE;
CREATE OR REPLACE FUNCTION public.get_over_limit_customers(org_id uuid DEFAULT NULL)
RETURNS TABLE (id UUID, name TEXT, total_debt NUMERIC, credit_limit NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
    v_target_org := COALESCE(org_id, public.get_my_org());
    RETURN QUERY SELECT c.id, c.name, COALESCE(c.balance, 0), COALESCE(c.credit_limit, 0)
    FROM public.customers c WHERE c.organization_id = v_target_org AND COALESCE(c.balance, 0) > COALESCE(c.credit_limit, 0);
END; $$;

-- إعادة تحميل كاش المخطط
NOTIFY pgrst, 'reload config';