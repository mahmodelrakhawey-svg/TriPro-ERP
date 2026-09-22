-- ======================================================================================
-- 🛠️ Migration: Fix start_pos_shift Function Overload Ambiguity & Multi-Tenant Support
-- Date: 2026-09-22
-- Description:
--   1. Drops conflicting legacy overloads (4-param, 5-param, 6-param) of start_pos_shift.
--   2. Recreates a unified, robust 6-param start_pos_shift with auto-resume & auto-healing.
--   3. Explicitly grants EXECUTE to authenticated, service_role, and anon.
--   4. Updates get_active_pos_shift for consistent terminal/user lookup.
-- ======================================================================================

-- 1. إسقاط كافة التواقيع السابقة المتضاربة لتجنب خطأ PostgREST PGRST203 (Could not choose candidate function)
DROP FUNCTION IF EXISTS public.start_pos_shift(numeric, boolean, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.start_pos_shift(numeric, boolean, uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.start_pos_shift(numeric, boolean, uuid, uuid, uuid, uuid) CASCADE;

-- 2. إنشاء الدالة الموحدة ذات الـ 6 معاملات مع دعم ذكي للمنظمة والأجهزة والاستئناف التلقائي
CREATE OR REPLACE FUNCTION public.start_pos_shift(
    p_opening_balance numeric DEFAULT 0, 
    p_resume_existing boolean DEFAULT true, 
    p_treasury_account_id uuid DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL,
    p_org_id uuid DEFAULT NULL,
    p_terminal_id uuid DEFAULT NULL
)
RETURNS public.shifts 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE 
    v_existing_shift public.shifts; 
    v_new_shift public.shifts;
    v_org_id uuid;
    v_actual_user_id uuid;
BEGIN
    v_actual_user_id := COALESCE(p_user_id, auth.uid());

    -- تحديد منظمة المستخدم (سواء الممررة صراحة، أو من الـ context، أو من بروفايله)
    v_org_id := COALESCE(
        p_org_id,
        public.get_my_org(),
        (SELECT organization_id FROM public.profiles WHERE id = v_actual_user_id)
    );

    IF v_org_id IS NULL AND current_setting('app.restore_mode', true) != 'on' THEN 
        RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى التأكد من ربط حسابك بشركة أو تحديد الشركة النشطة.'; 
    END IF;

    -- إذا تم توفير معرّف الجهاز (Terminal ID)، نبحث عن وردية مفتوحة للجهاز أو للمستخدم
    IF p_terminal_id IS NOT NULL THEN
        SELECT * INTO v_existing_shift FROM public.shifts 
        WHERE (user_id = v_actual_user_id OR terminal_id = p_terminal_id) 
          AND end_time IS NULL 
          AND organization_id = v_org_id 
        ORDER BY start_time DESC LIMIT 1;
    ELSE
        SELECT * INTO v_existing_shift FROM public.shifts 
        WHERE user_id = v_actual_user_id 
          AND end_time IS NULL 
          AND organization_id = v_org_id 
        ORDER BY start_time DESC LIMIT 1;
    END IF;

    -- إذا طلب المستخدم الاستئناف ووجدنا وردية مفتوحة، نعيدها مباشرة
    IF p_resume_existing AND v_existing_shift.id IS NOT NULL THEN 
        RETURN v_existing_shift; 
    END IF;

    -- إذا طلب المستخدم الاستئناف فقط ولم نجد وردية، نعيد NULL للتوقف النظيف
    IF p_resume_existing THEN 
        RETURN NULL; 
    END IF;

    -- 🛡️ خاصية التعافي الذاتي (Auto-healing):
    -- إذا كانت هناك وردية مفتوحة بالفعل، بدلاً من تفجير خطأ 400 Bad Request للمستخدم،
    -- نقوم بإعادة الوردية المفتوحة مباشرة لتمكين الكاشير من مواصلة العمل
    IF v_existing_shift.id IS NOT NULL THEN 
        RETURN v_existing_shift;
    END IF;

    -- إنشاء وردية جديدة
    INSERT INTO public.shifts (
        user_id, 
        start_time, 
        opening_balance, 
        treasury_account_id, 
        organization_id, 
        status, 
        terminal_id
    )
    VALUES (
        v_actual_user_id, 
        now(), 
        COALESCE(p_opening_balance, 0), 
        p_treasury_account_id, 
        v_org_id, 
        'OPEN', 
        p_terminal_id
    ) 
    RETURNING * INTO v_new_shift;

    RETURN v_new_shift;
END; 
$$;

-- 3. منح صلاحيات التنفيذ
GRANT EXECUTE ON FUNCTION public.start_pos_shift(numeric, boolean, uuid, uuid, uuid, uuid) TO authenticated, service_role, anon;

-- 4. تحديث دالة get_active_pos_shift لتتوافق مع الجهاز والشركة
CREATE OR REPLACE FUNCTION public.get_active_pos_shift(
    p_user_id uuid DEFAULT NULL, 
    p_terminal_id uuid DEFAULT NULL
)
RETURNS public.shifts 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE 
    v_shift public.shifts;
    v_user uuid;
    v_org_id uuid;
BEGIN
    v_user := COALESCE(p_user_id, auth.uid());
    v_org_id := COALESCE(public.get_my_org(), (SELECT organization_id FROM public.profiles WHERE id = v_user));

    IF p_terminal_id IS NOT NULL THEN
        SELECT * INTO v_shift FROM public.shifts 
        WHERE (user_id = v_user OR terminal_id = p_terminal_id) 
          AND end_time IS NULL 
          AND (v_org_id IS NULL OR organization_id = v_org_id)
        ORDER BY start_time DESC LIMIT 1;
    ELSE
        SELECT * INTO v_shift FROM public.shifts 
        WHERE user_id = v_user 
          AND end_time IS NULL 
          AND (v_org_id IS NULL OR organization_id = v_org_id)
        ORDER BY start_time DESC LIMIT 1;
    END IF;

    RETURN v_shift;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_pos_shift(uuid, uuid) TO authenticated, service_role, anon;
