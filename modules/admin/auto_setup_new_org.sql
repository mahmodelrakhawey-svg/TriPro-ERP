-- 1. إنشاء الدالة التي ستنفذ الإعدادات التلقائية
CREATE OR REPLACE FUNCTION public.handle_new_organization_setup()
RETURNS TRIGGER AS $$
DECLARE
    v_role_id uuid;
BEGIN
    -- أ. إنشاء دور "مدير النظام" للشركة الجديدة تلقائياً
    INSERT INTO public.roles (name, description, organization_id)
    VALUES ('admin', 'مدير النظام - كامل الصلاحيات', NEW.id)
    RETURNING id INTO v_role_id;

    -- ب. ربط كافة الصلاحيات الموجودة في النظام بهذا الدور الجديد
    -- هذا يضمن أن العميل الجديد سيكون لديه كل شيء مفعل في البداية
    INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
    SELECT v_role_id, id, NEW.id
    FROM public.permissions;

    -- ج. (إضافي) يمكن هنا إضافة حسابات افتراضية أو إعدادات أولية أخرى
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. إنشاء "مراقب" (Trigger) ينتظر إضافة أي سجل جديد في جدول الشركات
DROP TRIGGER IF EXISTS trg_setup_new_org ON public.organizations;
CREATE TRIGGER trg_setup_new_org
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_organization_setup();

-- ملاحظة للمحاسب: 
-- هذا الكود يعني: "بمجرد إضافة صف جديد في جدول المنظمات، 
-- اذهب فوراً وأنشئ له دور مدير وأعطه كل الصلاحيات".