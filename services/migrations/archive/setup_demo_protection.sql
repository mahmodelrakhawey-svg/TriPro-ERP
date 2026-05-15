-- 🔒 حماية قاعدة البيانات من تعديلات مستخدم الديمو (Database Level Protection)
-- يقوم هذا السكربت بإنشاء دالة وتريجر لمنع عمليات الكتابة (Insert/Update/Delete) لمستخدم الديمو
-- على الجداول الحساسة (الصلاحيات، الأدوار، الإعدادات، المستخدمين).

-- 1. إنشاء دالة التحقق من مستخدم الديمو
CREATE OR REPLACE FUNCTION public.check_demo_restriction()
RETURNS TRIGGER AS $$
DECLARE
    v_role text;
BEGIN
    -- جلب دور المستخدم الحالي
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

    -- إذا كان الدور هو 'demo'، نمنع العملية ونظهر رسالة خطأ
    IF v_role = 'demo' THEN
        RAISE EXCEPTION 'عذراً، لا يمكن إجراء تعديلات أو حذف في النسخة التجريبية (Demo Mode).';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. تطبيق الحماية على الجداول الحساسة

-- جدول الصلاحيات (Permissions)
DROP TRIGGER IF EXISTS trg_protect_permissions ON public.permissions;
CREATE TRIGGER trg_protect_permissions
BEFORE INSERT OR UPDATE OR DELETE ON public.permissions
FOR EACH ROW EXECUTE FUNCTION public.check_demo_restriction();

-- جدول الأدوار (Roles)
DROP TRIGGER IF EXISTS trg_protect_roles ON public.roles;
CREATE TRIGGER trg_protect_roles
BEFORE INSERT OR UPDATE OR DELETE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.check_demo_restriction();

-- جدول ربط الأدوار بالصلاحيات
DROP TRIGGER IF EXISTS trg_protect_role_permissions ON public.role_permissions;
CREATE TRIGGER trg_protect_role_permissions
BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.check_demo_restriction();

-- جدول إعدادات الشركة
DROP TRIGGER IF EXISTS trg_protect_company_settings ON public.company_settings;
CREATE TRIGGER trg_protect_company_settings
BEFORE INSERT OR UPDATE OR DELETE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.check_demo_restriction();

SELECT '✅ تم تفعيل حماية الديمو على الجداول الحساسة بنجاح.' as result;