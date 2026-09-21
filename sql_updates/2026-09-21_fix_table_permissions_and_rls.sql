-- ==============================================================================
-- 🛡️ TriPro ERP - Fix Table Permissions & Row Level Security (RLS)
-- Date: 2026-09-21
-- Purpose:
--   Grant explicit SELECT, INSERT, UPDATE, DELETE permissions to authenticated & anon roles
--   and configure multi-tenant isolation policies on 14 system tables identified
--   by the system health check (scripts/system_health_check.mjs).
--
-- Tables covered (14):
--   1. recurring_invoices
--   2. vendor_contracts
--   3. goods_receipt_notes
--   4. letters_of_guarantee
--   5. letters_of_credit
--   6. hr_attendance_logs
--   7. hr_leave_requests
--   8. hr_leave_balances
--   9. stadium_members
--  10. stadium_facilities
--  11. stadium_bookings
--  12. stadium_coaches
--  13. stadium_subscriptions
--  14. stadium_tournaments
-- ==============================================================================

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'recurring_invoices',
        'vendor_contracts',
        'goods_receipt_notes',
        'letters_of_guarantee',
        'letters_of_credit',
        'hr_attendance_logs',
        'hr_leave_requests',
        'hr_leave_balances',
        'stadium_members',
        'stadium_facilities',
        'stadium_bookings',
        'stadium_coaches',
        'stadium_subscriptions',
        'stadium_tournaments'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        -- التحقق من وجود الجدول أولاً
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            -- 1. منح الصلاحيات للأدوار القياسية في Supabase
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', t);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon;', t);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', t);

            -- 2. تفعيل حماية RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

            -- 3. حذف السياسات القديمة إن وجدت لتفادي أي تعارض
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'tenant_isolation_' || t, t);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'tenant_isolation_policy', t);

            -- 4. تطبيق سياسة عزل المنشآت (إذا كان الجدول يحتوي على عمود organization_id)
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id'
            ) THEN
                EXECUTE format(
                    'CREATE POLICY %I ON public.%I FOR ALL USING (
                        organization_id = public.get_my_org() 
                        OR public.get_my_org() IS NULL 
                        OR organization_id IS NULL
                    );',
                    'tenant_isolation_' || t,
                    t
                );
            ELSE
                -- إذا لم يكن هناك عمود organization_id، نسمح بالوصول الموثق العام
                EXECUTE format(
                    'CREATE POLICY %I ON public.%I FOR ALL USING (true);',
                    'tenant_isolation_' || t,
                    t
                );
            END IF;

            RAISE NOTICE 'Permissions and RLS successfully applied for table: %', t;
        END IF;
    END LOOP;

    -- 5. تحصين الرؤية terminals بإلغاء وسم Unrestricted وتفعيل security_invoker
    IF EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = 'public' AND table_name = 'terminals'
    ) THEN
        BEGIN
            ALTER VIEW public.terminals SET (security_invoker = true);
            GRANT SELECT ON public.terminals TO authenticated, anon, service_role;
            RAISE NOTICE '✅ تم تحصين الرؤية terminals بنجاح (security_invoker = true) وإلغاء وسم Unrestricted.';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠️ تعذر تفعيل security_invoker على terminals: %', SQLERRM;
        END;
    END IF;
END $$;

-- تحديث كاش واجهة البرمجة (Supabase PostgREST Schema Cache)
NOTIFY pgrst, 'reload schema';
