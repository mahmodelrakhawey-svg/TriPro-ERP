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
BEGIN
    -- 1. محاولة جلب معرف الشركة والدور من بيانات المستخدم الإضافية (User Metadata)
    -- هذه البيانات سنرسلها من خلال كود الـ Backend
    v_org_id := COALESCE((new.raw_user_meta_data->>'org_id')::uuid, (new.user_metadata->>'org_id')::uuid);
    v_role := COALESCE(new.raw_user_meta_data->>'role', new.user_metadata->>'role', 'admin');

    -- التحقق من صحة البيانات
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'معرف الشركة مطلوب لإنشاء المستخدم. تأكد من تمرير org_id في user_metadata.';
    END IF;

    -- 2. حالة خاصة: إذا كان هذا أول مستخدم في النظام بالكامل
    IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
        v_role := 'super_admin';
    END IF;

    -- 3. إذا لم يتم توفير معرف شركة (تسجيل عادي)، نتحقق من وجود دعوة (المنطق القديم)
    -- (هذا الجزء لم يعد مستخدماً في API الجديد، لكن نحتفظ به للتوافق)
    IF v_org_id IS NULL THEN
        SELECT organization_id, role INTO v_org_id, v_role FROM public.invitations
        WHERE email = new.email AND accepted_at IS NULL LIMIT 1;

        IF v_org_id IS NOT NULL THEN
            UPDATE public.invitations SET accepted_at = now() WHERE email = new.email;
        ELSE
            RAISE EXCEPTION 'التسجيل متاح فقط للمدراء أو عبر دعوة.';
        END IF;
    END IF;

    -- إدراج الملف الشخصي
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

-- إعادة تحميل كاش المخطط
NOTIFY pgrst, 'reload config';