-- ==============================================================================
-- 🧭 TriPro ERP - نظام تحديد وتخصيص وضع لوحة القيادة لكل مستخدم
-- Date: 2026-10-09
-- ==============================================================================
-- 1. إضافة عمود dashboard_view_mode لجدول profiles
-- القيم المدعومة:
--   'both': كلاهما معاً مع حرية التبديل بين خريطة العمليات ولوحة التحليلات (الافتراضي)
--   'workflow_only': خريطة تري برو وركفلو فقط (حجب لوحة التحليلات والأرباح)
--   'analytics_only': لوحة التحليلات والرسوم فقط (حجب خريطة العمليات)
-- ==============================================================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS dashboard_view_mode TEXT DEFAULT 'both';

COMMENT ON COLUMN public.profiles.dashboard_view_mode IS 
'وضع لوحة القيادة المخصص للمستخدم: both (كلاهما), workflow_only (خريطة العمليات فقط), analytics_only (التحليلات فقط)';

-- 2. تحديث المستخدمين الحاليين بالقيمة الافتراضية 'both'
UPDATE public.profiles
SET dashboard_view_mode = 'both'
WHERE dashboard_view_mode IS NULL;

-- 3. إضافة قيد التحقق (Check Constraint) للتأكد من صحة القيم المدخلة
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_profiles_dashboard_view_mode'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT chk_profiles_dashboard_view_mode
        CHECK (dashboard_view_mode IN ('both', 'workflow_only', 'analytics_only'));
    END IF;
END $$;
