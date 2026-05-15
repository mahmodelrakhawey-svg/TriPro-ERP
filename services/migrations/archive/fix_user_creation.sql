-- إصلاح دالة handle_new_user لإنشاء المستخدمين الجدد
-- لإصلاح خطأ "Database error saving new user"

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
    v_full_name text;
BEGIN
    -- 1. محاولة جلب معرف الشركة والدور من بيانات المستخدم الإضافية (User Metadata)
    -- هذه البيانات سنرسلها من خلال كود الـ Backend
    v_org_id := (new.raw_user_meta_data->>'org_id')::uuid;
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'admin');
    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد');

    -- التحقق من صحة البيانات
    -- 2. حالة خاصة: إذا كان هذا أول مستخدم في النظام بالكامل
    IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
        v_role := 'super_admin';
        -- إذا لم تكن هناك شركات، قد نحتاج لإنشاء واحدة افتراضية أو السماح بـ NULL مؤقتاً
    END IF;

    IF v_org_id IS NULL THEN
        SELECT organization_id, role INTO v_org_id, v_role FROM public.invitations
        WHERE email = new.email AND accepted_at IS NULL LIMIT 1;

        IF v_org_id IS NOT NULL THEN
            UPDATE public.invitations SET accepted_at = now() WHERE email = new.email;
        END IF;
    END IF;

    -- إدراج الملف الشخصي
    INSERT INTO public.profiles (id, full_name, role, organization_id)
    VALUES (
        new.id,
        v_full_name,
        v_role,
        v_org_id
    )
    ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name;

    RETURN new;
END;
$$;

-- إعادة تحميل كاش المخطط
NOTIFY pgrst, 'reload config';