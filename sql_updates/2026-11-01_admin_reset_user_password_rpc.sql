-- ==============================================================================
-- TriPro-ERP: دالة إعادة تعيين كلمة المرور للمستخدمين بواسطة المشرف (RPC آمن ومباشر)
-- التاريخ: 01 نوفمبر 2026
-- الهدف:
--   1. تمكين المدير العام ومدير النظام من تغيير كلمة مرور أي مستخدم فوراً
--   2. تفادي مشاكل CORS وأخطاء خوادم Edge Functions غير المرفوعة
--   3. حماية أمنية مشددة: التحقق من المنظمة ومنع التعديل على السوبر أدمن
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_user_id uuid,
    p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id uuid := auth.uid();
    v_caller_role text;
    v_caller_org uuid;
    v_target_org uuid;
    v_target_role text;
    v_encrypted_pw text;
BEGIN
    -- 1. التحقق من وجود مستخدم مسجل الدخول
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'غير مصرح: يرجى تسجيل الدخول أولاً');
    END IF;

    -- 2. التحقق من صلاحية المتصل (يجب أن يكون admin أو super_admin)
    SELECT role, organization_id INTO v_caller_role, v_caller_org
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('super_admin', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'عذراً، هذه الصلاحية للمدراء والمشرفين فقط');
    END IF;

    -- 3. جلب بيانات المستخدم المطلوب تغيير كلمة سره
    SELECT role, organization_id INTO v_target_role, v_target_org
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'المستخدم المستهدف غير موجود في النظام');
    END IF;

    -- 4. حماية حسابات السوبر أدمن ومنع التعديل عبر المنظمات المختلفة
    IF v_caller_role != 'super_admin' THEN
        IF v_target_role = 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'message', 'لا يمكن لمدير عادي تعديل كلمة مرور المشرف العام');
        END IF;
        IF v_caller_org IS NOT NULL AND v_target_org IS NOT NULL AND v_caller_org != v_target_org THEN
            RETURN jsonb_build_object('success', false, 'message', 'لا يمكنك تعديل مستخدم تابع لشركة أخرى');
        END IF;
    END IF;

    -- 5. التحقق من طول كلمة المرور (6 أحرف كحد أدنى)
    IF length(trim(p_new_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'message', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    END IF;

    -- 6. تشفير كلمة المرور وتحديثها في auth.users
    BEGIN
        v_encrypted_pw := extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10));
    EXCEPTION WHEN OTHERS THEN
        v_encrypted_pw := crypt(trim(p_new_password), gen_salt('bf', 10));
    END;

    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        updated_at = now()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث كلمة المرور بنجاح');
END;
$$;

-- منح صلاحية التشغيل للمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(uuid, text) TO authenticated;
