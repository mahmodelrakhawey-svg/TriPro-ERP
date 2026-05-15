-- تحديثات لإصلاح مشاكل إنشاء العملاء والصلاحيات
-- تاريخ التحديث: 2026-04-05

-- 1. تحديث دالة handle_new_user لقراءة user_metadata أيضاً
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org_id uuid;
    v_role text;
    v_invitation record;
BEGIN
    -- 1. محاولة جلب معرف الشركة والدور من بيانات المستخدم الإضافية (User Metadata)
    -- هذه البيانات سنرسلها من خلال كود الـ Backend
    v_org_id := COALESCE((new.raw_user_meta_data->>'org_id')::uuid, (new.user_metadata->>'org_id')::uuid);
    v_role := COALESCE(new.raw_user_meta_data->>'role', new.user_metadata->>'role', 'admin');

    -- 2. حالة خاصة: إذا كان هذا أول مستخدم في النظام بالكامل
    IF v_org_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.profiles) THEN
        -- إنشاء منظمة افتراضية للمدير الأول
        INSERT INTO public.organizations (name) VALUES ('الشركة الرئيسية') RETURNING id INTO v_org_id;
        v_role := 'super_admin';
    END IF;

    -- 3. إذا لم يتم توفير معرف شركة (تسجيل عادي)، نتحقق من وجود دعوة (المنطق القديم)
    IF v_org_id IS NULL THEN
        SELECT organization_id, role INTO v_org_id, v_role FROM public.invitations
        WHERE email = new.email AND accepted_at IS NULL LIMIT 1;

        IF v_org_id IS NOT NULL THEN
            UPDATE public.invitations SET accepted_at = now() WHERE email = new.email;
        ELSE
            RAISE EXCEPTION 'التسجيل متاح فقط للمدراء أو عبر دعوة.';
        END IF;
    END IF;

    INSERT INTO public.profiles (id, full_name, role, organization_id)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.user_metadata->>'full_name', 'مستخدم جديد'),
        v_role,
        v_org_id
    );
    RETURN new;
END;
$$;

-- 2. تحديث سياسات RLS للبيانات الأساسية مع عزل المنظمة
DROP POLICY IF EXISTS "Basic data viewable by authenticated" ON products;
CREATE POLICY "Basic data viewable by authenticated" ON products FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Basic data viewable by authenticated_cust" ON customers;
CREATE POLICY "Basic data viewable by authenticated_cust" ON customers FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Basic data viewable by authenticated_supp" ON suppliers;
CREATE POLICY "Basic data viewable by authenticated_supp" ON suppliers FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Basic data viewable by authenticated_acc" ON accounts;
CREATE POLICY "Basic data viewable by authenticated_acc" ON accounts FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

-- تعديل/إضافة/حذف للموظفين المصرح لهم
DROP POLICY IF EXISTS "Staff can manage products" ON products;
CREATE POLICY "Staff can manage products" ON products FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'sales', 'purchases', 'accountant'));

DROP POLICY IF EXISTS "Staff can manage customers" ON customers;
CREATE POLICY "Staff can manage customers" ON customers FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'sales', 'accountant'));

DROP POLICY IF EXISTS "Staff can manage suppliers" ON suppliers;
CREATE POLICY "Staff can manage suppliers" ON suppliers FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'manager', 'purchases', 'accountant'));

DROP POLICY IF EXISTS "Admins/Accountants manage accounts" ON accounts;
CREATE POLICY "Admins/Accountants manage accounts" ON accounts FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN ('super_admin', 'admin', 'accountant'));

-- 3. إعادة تحميل كاش المخطط (إذا كان متاحاً)
NOTIFY pgrst, 'reload config';

-- تم الانتهاء من التحديثات ✅