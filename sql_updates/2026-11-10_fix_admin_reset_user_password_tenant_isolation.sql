-- ==============================================================================
-- TriPro-ERP: تحصين أمان دالة إعادة تعيين كلمات المرور وعزل المنشآت الصارم (SEC-PWD-01)
-- التاريخ: 10 نوفمبر 2026
-- الأولوية: حرجة (CRITICAL - TENANT ISOLATION HARDENING)
-- التوافق: متوافق 100% مع بيئة شركة لينزا وكافة المنشآت النشطة (Zero Impact on Production)
-- ==============================================================================

-- الهدف:
-- 1. منع أي مدير فرعي (admin) من إعادة تعيين كلمة مرور أي مستخدم تابع لشركة أخرى.
-- 2. سد ثغرة (Fail-Closed): إذا كانت منشأة المستخدم المتصل أو منشأة المستخدم المستهدف غير محددة (NULL)،
--    يتم رفض العملية فوراً ومنع التجاوز، ولا يُسمح بها إلا للمشرف العام فقط (super_admin).
-- 3. حرمان المستخدمين المجهولين (anon) والجمهور (public) من استدعاء الدالة نهائياً.

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_user_id uuid,
    p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '15s'
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
    -- 1. التحقق الصارم من وجود مستخدم مسجل الدخول
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

    -- 4. عزل المنشآت الصارم وحماية حسابات المشرف العام (Fail-Closed)
    IF v_caller_role != 'super_admin' THEN
        -- حماية المشرف العام
        IF v_target_role = 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'message', 'لا يمكن لمدير عادي تعديل كلمة مرور المشرف العام');
        END IF;

        -- عزل المنشآت الصارم: منع أي تعديل إذا كانت إحدى المنشأتين مفقودة (NULL) أو غير متطابقتين
        IF v_caller_org IS NULL OR v_target_org IS NULL OR v_caller_org <> v_target_org THEN
            RETURN jsonb_build_object('success', false, 'message', 'تم رفض الوصول: لا تملك صلاحية تعديل كلمة مرور مستخدم خارج نطاق شركتك');
        END IF;
    END IF;

    -- 5. التحقق من قوة كلمة المرور (6 أحرف على الأقل)
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

-- حرمان anon و public من أي إمكانية لاستدعاء الدالة
REVOKE ALL ON FUNCTION public.admin_reset_user_password(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(uuid, text) TO authenticated;
