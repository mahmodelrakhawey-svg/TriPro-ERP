-- 👤 إعداد مستخدم "المدير العام" للعميل
-- تعليمات:
-- 1. اذهب إلى لوحة تحكم Supabase -> Authentication -> Users وأنشئ مستخدماً جديداً بإيميل العميل وكلمة مرور قوية.
-- 2. قم بتعديل الإيميل أدناه، ثم شغل هذا السكربت في SQL Editor.

DO $$
DECLARE
    v_email text := 'admin@model.com'; -- 👈 ضع هنا البريد الذي أنشأته في واجهة Authentication
    v_org_id uuid := 'd8e1b37f-a4b4-403e-a212-b5ad1f105de2'; -- معرف الشركة النموذجية
    v_user_id uuid;
    v_role_id uuid;
BEGIN
    -- 1. البحث عن المستخدم في جدول المصادقة
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '❌ لم يتم العثور على المستخدم (%). يرجى إنشاؤه أولاً من واجهة Supabase -> Auth.', v_email;
    ELSE
        -- 2. التأكد من وجود دور الأدمن لهذه الشركة
        INSERT INTO public.roles (organization_id, name, description)
        VALUES (v_org_id, 'admin', 'مدير النظام - صلاحيات كاملة')
        ON CONFLICT (name, organization_id) DO UPDATE SET name = 'admin'
        RETURNING id INTO v_role_id;

        -- 3. تحديث البروفايل وربطه بالشركة والدور
        INSERT INTO public.profiles (id, organization_id, role, role_id, full_name, is_active)
        VALUES (v_user_id, v_org_id, 'admin', v_role_id, 'مدير الشركة النموذجية', true)
        ON CONFLICT (id) DO UPDATE SET 
            organization_id = v_org_id,
            role = 'admin',
            role_id = v_role_id,
            is_active = true;

        -- 4. منح كافة الصلاحيات
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT v_role_id, id, v_org_id FROM public.permissions ON CONFLICT DO NOTHING;

        -- 5. تحديث Metadata التوكن لضمان الدخول السلس
        UPDATE auth.users 
        SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
                                 jsonb_build_object('org_id', v_org_id, 'role', 'admin')
        WHERE id = v_user_id;

        RAISE NOTICE '✅ تم بنجاح تعيين % مديراً للشركة النموذجية.', v_email;
    END IF;
END $$;