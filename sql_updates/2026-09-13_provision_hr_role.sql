-- ==============================================================================
-- 👥 تثبيت وتفعيل دور وصلاحيات مسؤول الموارد البشرية (HR Specialist)
-- التاريخ: 13 سبتمبر 2026
-- ==============================================================================

-- 🛡️ 1. وضع التجاوز الآمن وإزالة أي trigger قديم من جدول الصلاحيات العام
SET app.restore_mode = 'on';

DROP TRIGGER IF EXISTS trg_force_org_id ON public.permissions;
DROP TRIGGER IF EXISTS trg_force_org_id_on_insert ON public.permissions;
DROP TRIGGER IF EXISTS trg_force_org_id_universal ON public.permissions;

-- 2. إدخال وتحديث كافة صلاحيات الموارد البشرية
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

-- 3. إنشاء دور hr_officer لكل المنظمات تلقائياً (Direct SQL)
INSERT INTO public.roles (name, description, organization_id)
SELECT 
    'hr_officer',
    'مسؤول موارد بشرية ورواتب (HR Specialist) - إدارة الموظفين، مسير الرواتب، السلف والعهد، الحضور والغياب، وأجهزة البصمة',
    o.id
FROM public.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM public.roles r 
    WHERE r.organization_id = o.id AND r.name = 'hr_officer'
);

-- 4. ربط كافة صلاحيات موديول HR والتقارير بالدور
INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
SELECT 
    r.id,
    p.id,
    r.organization_id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'hr_officer'
  AND (p.module = 'hr' OR (p.module = 'reports' AND p.action IN ('general_view', 'export_data')))
ON CONFLICT DO NOTHING;
