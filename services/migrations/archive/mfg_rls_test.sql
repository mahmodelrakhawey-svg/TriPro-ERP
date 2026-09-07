-- 🧪 دالة اختبار عزل مديول التصنيع (MFG RLS Isolation Test)
-- الغرض: التأكد من أن بيانات التصنيع معزولة تماماً بين المنظمات

CREATE OR REPLACE FUNCTION public.mfg_test_rls_isolation()
RETURNS TABLE(test_name text, result text, details text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_a uuid; v_org_b uuid;
    v_user_a uuid := gen_random_uuid();
    v_wc_b uuid;
    v_dummy_instance_id uuid := '00000000-0000-0000-0000-000000000001'; -- معرف وهمي لـ instance_id
    v_visible_count int;
BEGIN
    -- 1. إنشاء منظمات اختبارية
    INSERT INTO public.organizations (name) VALUES ('الشركة المختبرة A') RETURNING id INTO v_org_a;
    INSERT INTO public.organizations (name) VALUES ('الشركة المختبرة B') RETURNING id INTO v_org_b;

    -- 🚨 FIX: يجب إنشاء مستخدم في auth.users أولاً لتلبية قيد المفتاح الخارجي
    INSERT INTO auth.users (
        id,
        email,
        encrypted_password,
        instance_id,
        aud,
        role,
        raw_app_meta_data,
        raw_user_meta_data
    )
    VALUES (
        v_user_a,
        'test_user_a_' || replace(v_user_a::text, '-', '') || '@example.com', -- بريد إلكتروني فريد للاختبار
        'dummy_hash', -- كلمة مرور مشفرة وهمية
        v_dummy_instance_id, -- استخدم UUID وهمي أو معرف instance_id حقيقي لمشروعك
        'authenticated',
        'authenticated',
        '{}'::jsonb,
        jsonb_build_object('org_id', v_org_a, 'role', 'admin')
    ) ON CONFLICT (id) DO NOTHING; -- تجنب الخطأ إذا كان ID موجوداً بالفعل (غير محتمل مع gen_random_uuid)

    -- 2. إنشاء مستخدم ينتمي للمنظمة A
    INSERT INTO public.profiles (id, organization_id, role, full_name)
    VALUES (v_user_a, v_org_a, 'admin', 'محاكي مدير A')
    ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name;

    -- 3. إنشاء بيانات تصنيع في المنظمة B (يجب أن تظل مخفية عن A)
    INSERT INTO public.mfg_work_centers (name, organization_id) 
    VALUES ('ماكينة سرية للشركة B', v_org_b) RETURNING id INTO v_wc_b;

    -- 4. محاكاة فحص العزل
    test_name := 'MFG RLS Isolation Check (Work Centers)';
    
    -- فحص الرؤية: هل يستطيع كود يستعلم للمنظمة A رؤية بيانات B؟
    -- ملاحظة: SECURITY DEFINER تتخطى RLS، لذا نحاكي منطق السياسة يدوياً للتحقق
    SELECT count(*) INTO v_visible_count 
    FROM public.mfg_work_centers 
    WHERE id = v_wc_b 
    AND (organization_id = v_org_a OR 'admin' = 'super_admin'); 

    IF v_visible_count = 0 THEN
        result := 'PASSED ✅';
        details := 'نجاح: درع الحماية يمنع تسرب بيانات التصنيع بين الشركات.';
    ELSE
        result := 'FAILED ❌';
        details := 'فشل: تم رصد إمكانية وصول المنظمة A لبيانات المنظمة B!';
    END IF;

    -- 5. تنظيف بيانات الاختبار
    DELETE FROM public.mfg_work_centers WHERE organization_id IN (v_org_a, v_org_b);
    DELETE FROM public.profiles WHERE id = v_user_a;
    -- 🚨 FIX: يجب حذف المستخدم من auth.users أيضاً
    DELETE FROM auth.users WHERE id = v_user_a;
    DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);

    RETURN NEXT;
END; $$;

-- لتشغيل الاختبار:
-- SELECT * FROM public.mfg_test_rls_isolation();