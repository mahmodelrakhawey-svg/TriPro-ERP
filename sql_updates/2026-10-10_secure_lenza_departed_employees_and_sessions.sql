-- =====================================================================
-- 🛡️ إجراءات تأمين شركة لينزا بعد مغادرة الموظفين (Departed Employees Security Guard)
-- التاريخ: 2026-10-10
-- الأهداف:
--   1. حصر وفحص جميع مستخدمي شركة لينزا وحالاتهم
--   2. إنهاء الجلسات المفتوحة (Sessions & Refresh Tokens) فوراً للموظفين المغادرين
--   3. تعطيل الحسابات (is_active = false) وتفعيل الحظر (Banned) في Supabase Auth
--   4. الحفاظ التام والآمن على حسابات الإدارة والملاك لعدم تأثر سير العمل
-- =====================================================================

-- الخطوة 1: استعراض جميع مستخدمي شركة لينزا للتحقق من هوية المغادرين
-- (يمكنك تشغيل هذا الاستعلام أولاً في SQL Editor لمراجعة القائمة)
SELECT 
    p.id AS user_id,
    p.email,
    p.full_name,
    p.role,
    p.is_active,
    u.last_sign_in_at,
    u.created_at
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.organization_id = (SELECT id FROM public.organizations WHERE name ILIKE '%لينزا%' LIMIT 1)
ORDER BY p.role, p.email;

-- =====================================================================
-- الخطوة 2: إجراء التعطيل الفوري للموظفين المغادرين وإسقاط جلساتهم النشطة
-- ⚠️ استبدل قائمة الإيميلات أدناه بإيميلات الموظفين المغادرين فقط
-- =====================================================================

DO $$
DECLARE
    v_departed_emails TEXT[] := ARRAY[
        -- ضع هنا إيميلات الموظفين المغادرين، مثال:
        -- 'employee1@lenza.com',
        -- 'sales_rep@lenza.com'
    ];
    v_target_user_ids UUID[];
    v_lenza_org_id UUID;
BEGIN
    IF array_length(v_departed_emails, 1) IS NULL OR array_length(v_departed_emails, 1) = 0 THEN
        RAISE NOTICE '⚠️ لم يتم تحديد أي إيميلات للموظفين المغادرين في مصفوفة v_departed_emails. يرجى ملء الإيميلات عند الرغبة في التنفيذ.';
        RETURN;
    END IF;

    -- الحصول على معرف شركة لينزا
    SELECT id INTO v_lenza_org_id FROM public.organizations WHERE name ILIKE '%لينزا%' LIMIT 1;

    -- جمع معرفات المستخدمين المستهدفين مع حماية حسابات الإدارة الرئيسية
    SELECT ARRAY_AGG(id) INTO v_target_user_ids
    FROM public.profiles
    WHERE email = ANY(v_departed_emails)
      AND organization_id = v_lenza_org_id
      AND role NOT IN ('super_admin'); -- حماية المشرف العام من التعطيل العرضي

    IF v_target_user_ids IS NULL OR array_length(v_target_user_ids, 1) IS NULL THEN
        RAISE NOTICE '⚠️ لم يتم العثور على مستخدمين مطابقين للإيميلات المحددة.';
        RETURN;
    END IF;

    -- 1. تعطيل الحساب في جدول البروفايل لمنع الواجهة من قبوله
    UPDATE public.profiles
    SET is_active = false
    WHERE id = ANY(v_target_user_ids);

    -- 2. حظر المستخدم في منظومة التوثيق لمنع تجديد التوكن
    UPDATE auth.users
    SET banned_until = '3000-01-01 00:00:00+00'
    WHERE id = ANY(v_target_user_ids);

    -- 3. إسقاط وحذف جميع الجلسات النشطة والتوكنز لطردهم فوراً من أي أجهزة مفتوحة
    DELETE FROM auth.refresh_tokens
    WHERE session_id IN (
        SELECT id FROM auth.sessions WHERE user_id = ANY(v_target_user_ids)
    );

    DELETE FROM auth.sessions
    WHERE user_id = ANY(v_target_user_ids);

    -- 4. تسجيل حدث أمني في سجل التدقيق
    INSERT INTO public.security_logs (event_type, details, created_at)
    VALUES (
        'USER_DEACTIVATION_STAFF_TURNOVER',
        jsonb_build_object(
            'message', 'Departed employees deactivated and active sessions revoked',
            'count', array_length(v_target_user_ids, 1),
            'target_emails', v_departed_emails
        ),
        NOW()
    );

    RAISE NOTICE '✅ تم بنجاح تعطيل % مستخدمين مغادرين وإسقاط كافة جلساتهم النشطة فوراً دون أي تأثير على بيانات لينزا.', array_length(v_target_user_ids, 1);
END $$;
