-- ==============================================================================
-- 📊 & 📱 TriPro ERP - نظام التحكم في ظهور لوحة القيادة وتطبيق الموبايل
-- Date: 2026-09-27 (Clean & Robust)
-- ==============================================================================

-- 1. إزالة مشغلات فرض المنظمة الخاطئة عن الجداول السيادية والنظامية
DROP TRIGGER IF EXISTS trg_force_org ON public.permissions;
DROP TRIGGER IF EXISTS trg_force_org_id ON public.permissions;
DROP TRIGGER IF EXISTS trg_force_org_id_universal ON public.permissions;

DROP TRIGGER IF EXISTS trg_force_org ON public.roles;
DROP TRIGGER IF EXISTS trg_force_org_id ON public.roles;
DROP TRIGGER IF EXISTS trg_force_org_id_universal ON public.roles;

DROP TRIGGER IF EXISTS trg_force_org ON public.role_permissions;
DROP TRIGGER IF EXISTS trg_force_org_id ON public.role_permissions;
DROP TRIGGER IF EXISTS trg_force_org_id_universal ON public.role_permissions;

DROP TRIGGER IF EXISTS trg_force_org ON public.user_permissions;
DROP TRIGGER IF EXISTS trg_force_org_id ON public.user_permissions;
DROP TRIGGER IF EXISTS trg_force_org_id_universal ON public.user_permissions;

DROP TRIGGER IF EXISTS trg_force_org ON public.profiles;
DROP TRIGGER IF EXISTS trg_force_org_id ON public.profiles;
DROP TRIGGER IF EXISTS trg_force_org_id_universal ON public.profiles;


-- 2. إضافة عمودي can_view_dashboard و can_access_mobile لجدول profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_view_dashboard BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_access_mobile BOOLEAN DEFAULT true;


-- 3. تحديث المستخدمين الحاليين بالقيم الافتراضية
UPDATE public.profiles
SET can_view_dashboard = true
WHERE can_view_dashboard IS NULL;

UPDATE public.profiles
SET can_access_mobile = CASE 
    WHEN role = 'van_sales' OR role = 'admin' OR role = 'super_admin' THEN true 
    ELSE false 
END
WHERE can_access_mobile IS NULL;


-- 4. تسجيل الصلاحيات في جدول permissions العام
INSERT INTO public.permissions (module, action, description)
VALUES 
    ('dashboard', 'view', 'استعراض لوحة القيادة والمؤشرات الإحصائية والرسوم البيانية'),
    ('mobile', 'view', 'الوصول لتطبيق الموبايل الميداني PWA ومندوبي المبيعات')
ON CONFLICT (module, action) DO UPDATE 
SET description = EXCLUDED.description;


-- 5. ربط الصلاحيات بالأدوار في كافة المنشآت
DO $$
DECLARE
    v_dash_id uuid;
    v_mobile_id uuid;
    v_has_org_in_rp boolean;
BEGIN
    SELECT id INTO v_dash_id FROM public.permissions WHERE module = 'dashboard' AND action = 'view' LIMIT 1;
    SELECT id INTO v_mobile_id FROM public.permissions WHERE module = 'mobile' AND action = 'view' LIMIT 1;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'role_permissions' AND column_name = 'organization_id'
    ) INTO v_has_org_in_rp;

    IF v_has_org_in_rp THEN
        -- في حال وجود عمود organization_id في جدول role_permissions
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT r.id, v_dash_id, COALESCE((r.organization_id)::uuid, o.id)
        FROM public.roles r
        CROSS JOIN (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1) o
        WHERE r.name IN ('admin', 'manager', 'accountant', 'viewer', 'auditor', 'cfo', 'bakery_cfo', 'bakery_branch_supervisor')
          AND v_dash_id IS NOT NULL
        ON CONFLICT DO NOTHING;

        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT r.id, v_mobile_id, COALESCE((r.organization_id)::uuid, o.id)
        FROM public.roles r
        CROSS JOIN (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1) o
        WHERE r.name IN ('admin', 'van_sales', 'sales_rep', 'delivery', 'supervisor')
          AND v_mobile_id IS NOT NULL
        ON CONFLICT DO NOTHING;
    ELSE
        -- في حال عدم وجود عمود organization_id في جدول role_permissions
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT r.id, v_dash_id
        FROM public.roles r
        WHERE r.name IN ('admin', 'manager', 'accountant', 'viewer', 'auditor', 'cfo', 'bakery_cfo', 'bakery_branch_supervisor')
          AND v_dash_id IS NOT NULL
        ON CONFLICT DO NOTHING;

        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT r.id, v_mobile_id
        FROM public.roles r
        WHERE r.name IN ('admin', 'van_sales', 'sales_rep', 'delivery', 'supervisor')
          AND v_mobile_id IS NOT NULL
        ON CONFLICT DO NOTHING;
    END IF;
END $$;


-- 6. تحديث دالة التسجيل handle_new_user لتدعم الخيارات الجديدة
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  default_org_id UUID;
  user_role TEXT;
  user_scope TEXT;
  user_dashboard BOOLEAN;
  user_mobile BOOLEAN;
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

  -- صلاحية لوحة القيادة
  user_dashboard := COALESCE(
    (NEW.raw_user_meta_data->>'can_view_dashboard')::BOOLEAN,
    true
  );

  -- صلاحية تطبيق الموبايل
  user_mobile := COALESCE(
    (NEW.raw_user_meta_data->>'can_access_mobile')::BOOLEAN,
    CASE 
      WHEN user_role = 'van_sales' OR user_role = 'admin' OR user_role = 'super_admin' THEN true 
      ELSE false 
    END
  );

  -- تحديد المنظمة
  IF NEW.raw_user_meta_data->>'org_id' IS NOT NULL AND NEW.raw_user_meta_data->>'org_id' <> 'null' THEN
    default_org_id := (NEW.raw_user_meta_data->>'org_id')::UUID;
  ELSE
    SELECT id INTO default_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
  END IF;

  INSERT INTO public.profiles (
    id, 
    full_name, 
    role, 
    organization_id, 
    hr_scope, 
    can_view_dashboard, 
    can_access_mobile, 
    is_active
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    user_role,
    default_org_id,
    user_scope,
    user_dashboard,
    user_mobile,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    organization_id = COALESCE(public.profiles.organization_id, EXCLUDED.organization_id),
    hr_scope = COALESCE(public.profiles.hr_scope, EXCLUDED.hr_scope),
    can_view_dashboard = COALESCE(public.profiles.can_view_dashboard, EXCLUDED.can_view_dashboard),
    can_access_mobile = COALESCE(public.profiles.can_access_mobile, EXCLUDED.can_access_mobile);

  RETURN NEW;
END;
$$;
