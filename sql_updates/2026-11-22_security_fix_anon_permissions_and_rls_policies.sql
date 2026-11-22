-- =============================================================================
-- 🛡️ TriPro ERP — Security Patch: 2026-11-22
-- File: sql_updates/2026-11-22_security_fix_anon_permissions_and_rls_policies.sql
--
-- ما يفعله هذا الملف:
--   1. سحب صلاحيات INSERT/UPDATE/DELETE من دور anon على 14 جدول حساس
--      (تبقى SELECT فقط للجداول التي تحتاجها أجهزة POS الأوفلاين)
--   2. تصحيح سياسات RLS من USING (true) إلى عزل صارم بالمنظمة
--   3. سحب صلاحية anon من دالة hims_dispense_prescription الحساسة
--   4. سحب صلاحية anon من دوال POS غير المحمية (start_pos_shift, get_active_pos_shift)
--      مع الإبقاء على الوصول الوظيفي لأجهزة الكاشير المصادق عليها
--
-- ملاحظة: تم التحقق من أن الدوال التالية سبق إصلاحها في تحديثات سابقة:
--   ✅ approve_invoice          → مُصلح في 2026-10-04
--   ✅ complete_pos_sale_atomic → مُصلح في 2026-10-04
--   ✅ get_all_customer/supplier_balances_fast → مُصلح في 2026-11-09
--   ✅ save_purchase_invoice_draft → مُصلح في 2026-11-09
--   ✅ create_organization_backup → مُصلح في 2026-11-09
--   ✅ run_daily_backups_all_orgs → مُصلح في 2026-11-09
--   ✅ add_opening_balance → مُصلح في 2026-11-09
--   ✅ initialize_fiscal_year_periods → مُصلح في 2026-09-13
--   ✅ get_income_statement_summary_rpc → مُصلح في 2026-10-15
--   ✅ get_trial_balance_summary_rpc → مُصلح في 2026-10-15
--   ✅ get_my_role / get_my_org → مُصلح في 2026-11-14
--   ✅ recalculate_all_balances → مُصلح في 2026-11-09
-- =============================================================================

DO $$
DECLARE
    tbl text;
    -- الجداول الـ14 التي مُنح دور anon عليها صلاحيات CRUD في سبتمبر 2026
    sensitive_tables text[] := ARRAY[
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

    -- =========================================================================
    -- الخطوة 1: سحب صلاحيات الكتابة من anon على الجداول الحساسة
    --           والإبقاء على SELECT فقط للجداول التي تحتاجها POS أوفلاين
    -- =========================================================================
    FOREACH tbl IN ARRAY sensitive_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            -- سحب صلاحيات الكتابة الكاملة من anon
            EXECUTE format(
                'REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon;', tbl
            );

            -- الإبقاء على SELECT فقط للجداول المطلوبة للعرض في وضع anon (مع حماية RLS)
            -- لكن الجداول المالية وHR تُسحب منها SELECT أيضاً
            IF tbl IN (
                'hr_attendance_logs', 'hr_leave_requests', 'hr_leave_balances',
                'vendor_contracts', 'letters_of_guarantee', 'letters_of_credit',
                'recurring_invoices'
            ) THEN
                EXECUTE format(
                    'REVOKE SELECT ON TABLE public.%I FROM anon;', tbl
                );
                RAISE NOTICE '🔒 [SECURE] % — تم سحب كل صلاحيات anon (بما فيها SELECT)', tbl;
            ELSE
                RAISE NOTICE '⚠️ [PARTIAL] % — تم سحب INSERT/UPDATE/DELETE من anon (تبقت SELECT)', tbl;
            END IF;
        ELSE
            RAISE NOTICE '[SKIP] الجدول % غير موجود — تم التخطي', tbl;
        END IF;
    END LOOP;


    -- =========================================================================
    -- الخطوة 2: تصحيح سياسات RLS من USING (true) إلى عزل صارم بالمنظمة
    --           وإصلاح ثغرة OR public.get_my_org() IS NULL
    -- =========================================================================
    FOREACH tbl IN ARRAY sensitive_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            -- حذف السياسة القديمة الضعيفة
            EXECUTE format(
                'DROP POLICY IF EXISTS %I ON public.%I;',
                'tenant_isolation_' || tbl, tbl
            );
            EXECUTE format(
                'DROP POLICY IF EXISTS %I ON public.%I;',
                'tenant_isolation_policy', tbl
            );

            -- إنشاء سياسة عزل صارمة
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = tbl
                  AND column_name = 'organization_id'
            ) THEN
                -- جدول يحتوي على organization_id: عزل تام بالمنظمة
                EXECUTE format($policy$
                    CREATE POLICY %I ON public.%I
                    FOR ALL
                    USING (
                        organization_id = public.get_my_org()
                        AND auth.uid() IS NOT NULL
                    )
                    WITH CHECK (
                        organization_id = public.get_my_org()
                        AND auth.uid() IS NOT NULL
                    );
                $policy$,
                    'strict_org_isolation_' || tbl, tbl
                );
                RAISE NOTICE '✅ [RLS FIXED] % — سياسة عزل صارمة (organization_id + auth.uid())', tbl;
            ELSE
                -- جدول بدون organization_id: يُتاح للمستخدمين المصادق عليهم فقط
                EXECUTE format($policy$
                    CREATE POLICY %I ON public.%I
                    FOR ALL
                    USING (auth.uid() IS NOT NULL)
                    WITH CHECK (auth.uid() IS NOT NULL);
                $policy$,
                    'authenticated_only_' || tbl, tbl
                );
                RAISE NOTICE '✅ [RLS FIXED] % — سياسة المصادقة الإلزامية (auth.uid())', tbl;
            END IF;
        END IF;
    END LOOP;


    -- =========================================================================
    -- الخطوة 3: سحب صلاحية anon من dالة hims_dispense_prescription
    --           (وحدة الصيدلية — حساسة جداً)
    -- =========================================================================
    BEGIN
        REVOKE EXECUTE ON FUNCTION public.hims_dispense_prescription(uuid, uuid) FROM anon;
        GRANT EXECUTE ON FUNCTION public.hims_dispense_prescription(uuid, uuid) TO authenticated, service_role;
        RAISE NOTICE '✅ hims_dispense_prescription — سُحب anon، مُنح authenticated فقط';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE '[SKIP] hims_dispense_prescription — الدالة غير موجودة';
    END;


    -- =========================================================================
    -- الخطوة 4: تأمين دوال POS (start_pos_shift, get_active_pos_shift)
    --           أجهزة الكاشير تُصادق بـ authenticated وليس anon
    -- =========================================================================
    BEGIN
        REVOKE EXECUTE ON FUNCTION public.start_pos_shift(numeric, boolean, uuid, uuid, uuid, uuid) FROM anon;
        GRANT EXECUTE ON FUNCTION public.start_pos_shift(numeric, boolean, uuid, uuid, uuid, uuid) TO authenticated, service_role;
        RAISE NOTICE '✅ start_pos_shift — سُحب anon، مُنح authenticated فقط';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE '[SKIP] start_pos_shift — الدالة غير موجودة أو التوقيع مختلف';
    END;

    BEGIN
        REVOKE EXECUTE ON FUNCTION public.get_active_pos_shift(uuid, uuid) FROM anon;
        GRANT EXECUTE ON FUNCTION public.get_active_pos_shift(uuid, uuid) TO authenticated, service_role;
        RAISE NOTICE '✅ get_active_pos_shift — سُحب anon، مُنح authenticated فقط';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE '[SKIP] get_active_pos_shift — الدالة غير موجودة أو التوقيع مختلف';
    END;


    -- =========================================================================
    -- الخطوة 5: سحب صلاحية anon من دالة safe_cast_uuid
    --           (ليس ضرورياً لـ anon — أداة داخلية)
    -- =========================================================================
    BEGIN
        REVOKE EXECUTE ON FUNCTION public.safe_cast_uuid(text) FROM anon;
        GRANT EXECUTE ON FUNCTION public.safe_cast_uuid(text) TO authenticated, service_role;
        RAISE NOTICE '✅ safe_cast_uuid — سُحب anon، مُنح authenticated فقط';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE '[SKIP] safe_cast_uuid — الدالة غير موجودة';
    END;


    -- =========================================================================
    -- الخطوة 6: تأمين دالة get_unbalanced_journal_entries
    -- =========================================================================
    BEGIN
        REVOKE EXECUTE ON FUNCTION public.get_unbalanced_journal_entries(uuid, text) FROM anon;
        GRANT EXECUTE ON FUNCTION public.get_unbalanced_journal_entries(uuid, text) TO authenticated, service_role;
        RAISE NOTICE '✅ get_unbalanced_journal_entries — سُحب anon، مُنح authenticated فقط';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE '[SKIP] get_unbalanced_journal_entries — الدالة غير موجودة';
    END;


    RAISE NOTICE '';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '✅ TriPro Security Patch 2026-11-22 تم تطبيقه بنجاح';
    RAISE NOTICE 'يُنصح بتشغيل NOTIFY pgrst, reload schema لتحديث الكاش';
    RAISE NOTICE '============================================================';

END $$;

-- تحديث كاش واجهة البرمجة (Supabase PostgREST Schema Cache)
NOTIFY pgrst, 'reload schema';
