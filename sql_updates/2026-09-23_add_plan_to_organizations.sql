-- ==============================================================================
-- Migration: 2026-09-23_add_plan_to_organizations.sql
-- Description: إضافة عمود plan لجدول organizations لتتبع باقة اشتراك كل شركة
-- ✅ آمن تماماً — ALTER ADD COLUMN IF NOT EXISTS لا يمس البيانات الموجودة
-- ==============================================================================

-- 1. إضافة عمود الباقة
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS plan text DEFAULT 'pro'
    CHECK (plan IN ('basic', 'pro', 'premium', 'sports', 'enterprise'));

-- 2. تعليق توضيحي
COMMENT ON COLUMN public.organizations.plan IS
    'باقة اشتراك الشركة: basic | pro | premium | sports | enterprise';

-- 3. تحديث الشركات الموجودة بقيمة افتراضية آمنة (pro) إن لم تكن محددة
UPDATE public.organizations
SET plan = 'pro'
WHERE plan IS NULL;

-- ✅ اكتمل بنجاح
SELECT 'تم إضافة عمود plan لجدول organizations بنجاح ✅' AS result;
