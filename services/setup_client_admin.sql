-- 👤 إعداد مستخدم "المدير العام" للعميل
-- تعليمات:
-- 1. اذهب إلى لوحة تحكم Supabase -> Authentication -> Users وأنشئ مستخدماً جديداً بإيميل العميل وكلمة مرور قوية.
-- 2. قم بتعديل الإيميل أدناه، ثم شغل هذا السكربت في SQL Editor.

DO $$
DECLARE
    v_email text := 'manager@client-company.com'; -- 👈 استبدل هذا بإيميل العميل الفعلي
    v_user_id uuid;
BEGIN
    -- 1. البحث عن المستخدم في جدول المصادقة
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

    IF v_user_id IS NULL THEN
        RAISE NOTICE '⚠️ لم يتم العثور على المستخدم (%). يرجى إنشاؤه أولاً من قائمة Authentication.', v_email;
    ELSE
        -- 2. تحديث أو إنشاء البروفايل بصلاحية المدير العام (super_admin)
        INSERT INTO public.profiles (id, full_name, role, is_active)
        VALUES (v_user_id, 'المدير العام', 'super_admin', true)
        ON CONFLICT (id) DO UPDATE
        SET role = 'super_admin', is_active = true, full_name = 'المدير العام';

        RAISE NOTICE '✅ تم منح صلاحيات المدير العام للمستخدم % بنجاح.', v_email;
    END IF;
END $$;