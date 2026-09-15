-- ==============================================================================
-- 👥 TriPro ERP - نظام عزل وتخصيص نطاق الإشراف لمسؤولي الموارد البشرية (HR Scope)
-- Date: 2026-09-15
-- Description:
--   إضافة عمود hr_scope لجدول profiles للتحكم في نطاق وصول موظفي الـ HR:
--   - 'all': كامل موظفي الشركة والمصنع والفروع (المدير العام والمسؤول العام)
--   - 'factory': موظفي وطاقم المصنع فقط (قسم المصنع)
--   - 'branches': موظفي المعارض والفروع فقط (أي قسم بخلاف المصنع)
-- ==============================================================================

-- 1. إضافة العمود لجدول profiles في حال عدم وجوده
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'profiles' 
          AND column_name = 'hr_scope'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN hr_scope TEXT DEFAULT 'all';
        
        COMMENT ON COLUMN public.profiles.hr_scope IS 'نطاق إشراف الموارد البشرية: all (الكل), factory (المصنع فقط), branches (الفروع فقط)';
    END IF;
END $$;

-- 2. ضمان تحديث المستخدمين الحاليين ليكون الافتراضي 'all' إن وجد NULL
UPDATE public.profiles
SET hr_scope = 'all'
WHERE hr_scope IS NULL;

-- 3. تحديث دالة التسجيل handle_new_user لتدعم قراءة hr_scope من raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  default_org_id UUID;
  user_role TEXT;
  user_scope TEXT;
BEGIN
  -- تحديد الدور
  user_role := COALESCE(
    NEW.raw_user_meta_data->>'role', 
    NEW.raw_user_meta_data->>'app_role', 
    'viewer'
  );

  -- تحديد نطاق الإشراف HR Scope
  user_scope := COALESCE(
    NEW.raw_user_meta_data->>'hr_scope',
    'all'
  );

  -- تحديد المنظمة
  IF NEW.raw_user_meta_data->>'org_id' IS NOT NULL AND NEW.raw_user_meta_data->>'org_id' <> 'null' THEN
    default_org_id := (NEW.raw_user_meta_data->>'org_id')::UUID;
  ELSE
    SELECT id INTO default_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, organization_id, hr_scope, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    user_role,
    default_org_id,
    user_scope,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    organization_id = COALESCE(public.profiles.organization_id, EXCLUDED.organization_id),
    hr_scope = COALESCE(public.profiles.hr_scope, EXCLUDED.hr_scope);

  RETURN NEW;
END;
$$;
