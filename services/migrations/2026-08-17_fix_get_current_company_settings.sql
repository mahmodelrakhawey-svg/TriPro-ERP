-- ====================================================================
-- Migration: Fix and Harden get_current_company_settings RPC
-- Date: 2026-08-17
-- Description: Ensures get_current_company_settings never returns 406 Not Acceptable
-- by always guaranteeing exactly 1 record per organization (auto-creating defaults if missing)
-- and enforcing LIMIT 1 with proper security definer semantics.
-- ====================================================================

-- 1. إسقاط الدالة السابقة
DROP FUNCTION IF EXISTS public.get_current_company_settings(uuid) CASCADE;

-- 2. إنشاء الدالة بالصيغة المحصنة
CREATE OR REPLACE FUNCTION public.get_current_company_settings(
    p_org_id uuid DEFAULT NULL
)
RETURNS SETOF public.company_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_target_org uuid;
BEGIN
    -- أ. تحديد هوية المنظمة المستهدفة
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    
    -- ب. في حال لم يتم العثور على المنظمة عبر التوكن، نحاول جلبها من الملف الشخصي للمستخدم
    IF v_target_org IS NULL THEN
        SELECT organization_id INTO v_target_org 
        FROM public.profiles 
        WHERE id = auth.uid() 
        LIMIT 1;
    END IF;

    -- ج. في حالة توفر منظمة، نتأكد من وجود سجل الإعدادات الخاص بها
    IF v_target_org IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.company_settings WHERE organization_id = v_target_org) THEN
            INSERT INTO public.company_settings (
                organization_id, 
                company_name, 
                currency, 
                vat_rate, 
                enable_tax
            ) VALUES (
                v_target_org, 
                'الشركة الرئيسية', 
                'EGP', 
                0.14, 
                true
            ) ON CONFLICT (organization_id) DO NOTHING;
        END IF;

        RETURN QUERY 
        SELECT * FROM public.company_settings 
        WHERE organization_id = v_target_org 
        LIMIT 1;
    ELSE
        -- د. Fallback في حال عدم توفر منظمة
        RETURN QUERY 
        SELECT * FROM public.company_settings 
        LIMIT 1;
    END IF;
END;
$$;

-- 3. منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.get_current_company_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_company_settings(uuid) TO anon;
