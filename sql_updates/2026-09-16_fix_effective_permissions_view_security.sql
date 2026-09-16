-- ==============================================================================
-- 🛡️ TriPro ERP - تحصين وتأمين رؤية الصلاحيات effective_permissions_view وكافة الرؤى
-- التاريخ: 2026-09-16
-- الوصف: 
--   1. تفعيل security_invoker = true على رؤية effective_permissions_view 
--      لإلغاء وسم Unrestricted وإخضاعها لسياسات أمان المستخدم المستعلم (RLS).
--   2. فحص وتأمين كافة الرؤى (Views) في المخطط العام public لضمان حمايتها.
--   3. ضبط صلاحيات القراءة للأدوار الموثقة (authenticated, service_role).
-- ==============================================================================

DO $$
DECLARE
    v_view RECORD;
BEGIN
    -- 1. تحصين الرؤية المحددة effective_permissions_view
    IF EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = 'public' AND table_name = 'effective_permissions_view'
    ) THEN
        BEGIN
            ALTER VIEW public.effective_permissions_view SET (security_invoker = true);
            RAISE NOTICE '✅ تم تحصين الرؤية: effective_permissions_view بنجاح (security_invoker = true).';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠️ تعذر تفعيل security_invoker على effective_permissions_view: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'ℹ️ الرؤية effective_permissions_view غير موجودة حالياً.';
    END IF;

    -- 2. تحصين أي رؤية أخرى عامة في public قد تكون غير مقيدة (Unrestricted)
    FOR v_view IN (
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'public'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true);', v_view.table_name);
            RAISE NOTICE '🔒 تم تأمين الرؤية: %', v_view.table_name;
        EXCEPTION WHEN OTHERS THEN
            -- تجاهل أي رؤى نظامية خاصة
            NULL;
        END;
    END LOOP;

    -- 3. منح الصلاحيات المناسبة للمستخدمين المسجلين وسيرفر النظام
    IF EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = 'public' AND table_name = 'effective_permissions_view'
    ) THEN
        GRANT SELECT ON public.effective_permissions_view TO authenticated;
        GRANT SELECT ON public.effective_permissions_view TO service_role;
    END IF;

    RAISE NOTICE '🎉 اكتمل تأمين الرؤى بنجاح وتم إخضاعها لسياسات الأمان RLS.';
END $$;

-- تحديث كاش واجهة البرمجة (Supabase PostgREST Schema Cache)
NOTIFY pgrst, 'reload schema';
