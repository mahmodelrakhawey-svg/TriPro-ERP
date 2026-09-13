-- ==============================================================================
-- 👥 تثبيت وتفعيل دور وصلاحيات مسؤول الموارد البشرية (HR Specialist)
-- التاريخ: 13 سبتمبر 2026
-- ==============================================================================

-- 🛡️ 1. تفعيل وضع التجاوز الآمن وإيقاف مشغلات المنظمة غير الصالحة على جدول الصلاحيات العام
SET app.restore_mode = 'on';

DO $$
DECLARE
    r_trg RECORD;
BEGIN
    -- إسقاط أي Trigger يفرض organization_id على جدول الصلاحيات العام permissions
    FOR r_trg IN 
        SELECT tgname 
        FROM pg_trigger 
        JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid 
        WHERE pg_class.relname = 'permissions' 
          AND NOT tgisinternal
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.permissions CASCADE;', r_trg.tgname);
        RAISE NOTICE 'تم إزالة المشغل % من جدول permissions العام', r_trg.tgname;
    END LOOP;
END $$;

-- 2. التأكد من وجود كافة الصلاحيات الدقيقة لموديول الموارد البشرية في جدول permissions
INSERT INTO public.permissions (module, action, description, is_sensitive, category)
VALUES
  ('hr', 'view', 'عرض قائمة وسجلات الموظفين والملفات الشخصية', false, 'hr'),
  ('hr', 'manage_employee', 'إضافة وتعديل بيانات الموظفين وتفاصيل العقود', false, 'hr'),
  ('hr', 'advances_penalties', 'تسجيل السلف، المكافآت، الخصومات، والبدلات', false, 'hr'),
  ('hr', 'payroll_process', 'معالجة واحتساب مسير الرواتب الشهري', false, 'hr'),
  ('hr', 'payroll_approve', 'اعتماد وترحيل مسير الرواتب للمصروفات المالية', true, 'hr'),
  ('hr', 'delete_employee', 'حذف سجل موظف أو إنهاء خدماته', true, 'hr'),
  ('hr', 'manage', 'إدارة الورديات، لائحة العمل، الإجازات، مكافأة نهاية الخدمة، وأجهزة البصمة', false, 'hr'),
  ('hr', 'advances', 'إدارة السلف والعهد الشخصية للموظفين', false, 'hr'),
  ('hr', 'biometrics', 'إدارة ومزامنة ماكينات البصمة وسجلات الدخول والخروج', false, 'hr'),
  ('hr', 'reports', 'استخراج وتحميل تقارير الحضور والرواتب وكشوف حسابات الموظفين', false, 'hr')
ON CONFLICT (module, action) DO UPDATE SET 
  description = EXCLUDED.description,
  is_sensitive = EXCLUDED.is_sensitive,
  category = EXCLUDED.category;

-- 3. إنشاء دور مسؤول الموارد البشرية والرواتب (hr_officer) لجميع المنظمات المسجلة
DO $$
DECLARE
    r_org RECORD;
    v_role_id uuid;
    v_perm_id uuid;
BEGIN
    FOR r_org IN SELECT id, name FROM public.organizations LOOP
        -- إنشاء الدور إذا لم يكن موجوداً
        SELECT id INTO v_role_id 
        FROM public.roles 
        WHERE organization_id = r_org.id AND name = 'hr_officer';

        IF v_role_id IS NULL THEN
            INSERT INTO public.roles (name, description, organization_id)
            VALUES (
                'hr_officer', 
                'مسؤول موارد بشرية ورواتب (HR Specialist) - إدارة الموظفين، مسير الرواتب، السلف والعهد، الحضور والغياب، وأجهزة البصمة',
                r_org.id
            )
            RETURNING id INTO v_role_id;
            
            RAISE NOTICE 'تم إنشاء دور hr_officer للمنظمة: % (%)', r_org.name, r_org.id;
        END IF;

        -- ربط كافة صلاحيات موديول hr بهذا الدور
        FOR v_perm_id IN SELECT id FROM public.permissions WHERE module = 'hr' LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm_id, r_org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;

        -- ربط صلاحية عرض وتصدير التقارير العامة
        FOR v_perm_id IN SELECT id FROM public.permissions WHERE module = 'reports' AND action IN ('general_view', 'export_data') LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (v_role_id, v_perm_id, r_org.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
        
    END LOOP;
END $$;
