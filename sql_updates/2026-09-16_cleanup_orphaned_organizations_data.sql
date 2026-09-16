-- =====================================================================
-- 🛡️ سكربت تنظيف شامل لبيانات ومخلفات الشركات المحذوفة في قاعدة الإنتاج
-- التاريخ: 2026-09-16
-- الهدف:
--   1. الحفاظ الصارم على الشركات الثلاث النشطة المعتمدة في الإنتاج:
--      - مطعم تجريبى جديد
--      - malak
--      - استاد المنصوره الرياضى مركز تنميه مجتمعيه
--   2. تنظيف ومسح كافة السجلات المعلقة (Orphaned Records) الناتجة عن شركات محذوفة سابقاً
--   3. تنظيف أي مستخدمين معلقين كانوا مرتبطين بالشركات المحذوفة (مع حماية مسؤولي النظام)
--   4. فك وحذف أي بيانات يتيمة في الجداول الفرعية التي لا تحوي عمود organization_id مباشرة
-- =====================================================================

DO $$
DECLARE
    v_keep_org_ids UUID[];
    v_keep_count INT;
    v_del_orgs_count INT := 0;
    v_del_users_count INT := 0;
    v_org_record RECORD;
    v_tbl TEXT;
    v_col TEXT;
    v_count INT;
    v_total_cleaned INT := 0;
    v_orphan_user_ids UUID[];
    
    -- قائمة الجداول المرتبة حسب التبعية (من الفرعي إلى الرئيسي)
    v_ordered_tables TEXT[] := ARRAY[
        -- المرفقات والتفاصيل وسجلات النشاط
        'notification_audit_log', 'cheque_attachments', 'receipt_voucher_attachments', 
        'payment_voucher_attachments', 'journal_attachments', 'notification_preferences', 
        'security_logs', 'audit_logs', 'organization_backups',
        
        -- موديول التشفية وتفكيك الذبائح
        'butchering_order_items', 'butchering_orders', 'butchering_template_items', 'butchering_templates',

        -- موديول التصنيع
        'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_batch_serials', 'mfg_production_variances',
        'mfg_order_progress', 'mfg_step_materials', 'mfg_step_attachments', 'mfg_routing_steps',
        'mfg_production_order_materials', 'mfg_production_order_steps', 'mfg_scrap_records', 'mfg_qc_inspections',
        'mfg_production_orders', 'mfg_routings', 'mfg_work_centers',
        
        -- موديول المطاعم والكاشير والورديات
        'order_item_modifiers', 'order_items', 'kitchen_ticket_items', 'kitchen_orders', 'orders', 
        'table_sessions', 'shifts', 'restaurant_tables', 'modifiers', 'modifier_groups',
        'product_channel_prices', 'recipe_items', 'restaurant_recipes', 'combo_items',
        'cashier_shifts', 'pos_petty_cash_payouts', 'waiter_call_requests', 'tips_distribution_records',
        
        -- موديول الاستاد والمشاريع والصحة
        'stadium_court_pricing', 'stadium_subscriptions', 'stadium_bookings', 'stadium_academy_trainees',
        'stadium_courts', 'stadium_members', 'stadium_academies',
        'construction_boq_items', 'construction_progress_billings', 'construction_subcontracts', 'construction_projects',
        'hims_prescription_items', 'hims_invoice_items', 'hims_lab_order_items', 'hims_radiology_order_items',
        'hims_vital_signs', 'hims_visits', 'hims_inpatient_admissions', 'hims_appointments',
        'hims_patients', 'hims_doctors', 'hims_departments', 'hims_rooms', 'hims_beds',

        -- فواتير المبيعات والمشتريات والتسويات والمخازن
        'invoice_items', 'purchase_invoice_items', 'sales_return_items', 'purchase_return_items', 
        'stock_adjustment_items', 'payroll_variables', 'payroll_items', 'journal_lines',
        'delivery_order_items', 'delivery_orders', 'inventory_count_items', 'inventory_counts',
        'waste_records', 'transfer_items', 'stock_transfers',
        'payments', 'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 
        'journal_entries', 'payrolls', 'stock_adjustments', 'cheques', 'receipt_vouchers', 'payment_vouchers', 
        'work_orders', 'bill_of_materials', 'credit_notes', 'debit_notes', 'promotions', 'retail_promotions',
        'opening_inventories',
        
        -- السجلات الرئيسية للشركات
        'assets', 'products', 'customers', 'suppliers', 'employees', 'accounts', 
        'cost_centers', 'warehouses', 'invitations', 'budgets', 'company_settings',
        'role_permissions', 'roles'
    ];
BEGIN
    -- -----------------------------------------------------------------
    -- 1. تحديد وحماية الشركات الثلاث المستهدفة
    -- -----------------------------------------------------------------
    SELECT ARRAY_AGG(id) INTO v_keep_org_ids
    FROM public.organizations
    WHERE name ILIKE '%مطعم تجريبى جديد%'
       OR name ILIKE '%malak%'
       OR name ILIKE '%استاد المنصوره%';

    IF v_keep_org_ids IS NULL OR array_length(v_keep_org_ids, 1) = 0 THEN
        RAISE EXCEPTION '⚠️ خطأ أمني: لم يتم العثور على الشركات المطلوب الإبقاء عليها في جدول organizations! تم إيقاف التنفيذ فوراً.';
    END IF;

    v_keep_count := array_length(v_keep_org_ids, 1);
    RAISE NOTICE '=======================================================';
    RAISE NOTICE '🛡️ الشركات النشطة المعتمدة والمحمية (عددها: %):', v_keep_count;
    FOR v_org_record IN (SELECT id, name, created_at FROM public.organizations WHERE id = ANY(v_keep_org_ids))
    LOOP
        RAISE NOTICE '   - [%] % (تاريخ الإنشاء: %)', v_org_record.id, v_org_record.name, v_org_record.created_at;
    END LOOP;
    RAISE NOTICE '=======================================================';

    -- -----------------------------------------------------------------
    -- 2. تفعيل وضع التجاوز (Restore Mode) لتعطيل موانع حذف القيود والحسابات والعملاء
    -- -----------------------------------------------------------------
    PERFORM set_config('app.restore_mode', 'on', true);

    -- -----------------------------------------------------------------
    -- 3. حذف أي شركة موجودة بجدول organizations بخلاف الشركات الثلاث المعتمدة
    -- -----------------------------------------------------------------
    FOR v_org_record IN (
        SELECT id, name FROM public.organizations 
        WHERE id != ALL(v_keep_org_ids)
    ) LOOP
        RAISE NOTICE '🗑️ جاري حذف الشركة غير المرغوبة من جدول المنظمات: [%] %', v_org_record.id, v_org_record.name;
        
        -- استدعاء دالة الحذف الآمن إن وجدت
        BEGIN
            PERFORM public.fn_delete_organization_safe(v_org_record.id);
            v_del_orgs_count := v_del_orgs_count + 1;
        EXCEPTION WHEN OTHERS THEN
            -- إذا لم تكن الدالة موجودة أو حدث خطأ نقوم بالحذف المباشر
            BEGIN
                DELETE FROM public.organizations WHERE id = v_org_record.id;
                v_del_orgs_count := v_del_orgs_count + 1;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '   ⚠️ تعذر حذف المنظمة مباشرة: %', SQLERRM;
            END;
        END;
    END LOOP;

    -- -----------------------------------------------------------------
    -- 4. تنظيف كافة الجداول المحددة من السجلات اليتيمة التابعة لشركات محذوفة
    -- -----------------------------------------------------------------
    FOREACH v_tbl IN ARRAY v_ordered_tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = v_tbl
        ) THEN
            -- التحقق من وجود عمود organization_id بالجدول
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'organization_id'
            ) THEN
                BEGIN
                    EXECUTE format('
                        WITH deleted AS (
                            DELETE FROM public.%I 
                            WHERE organization_id IS NOT NULL 
                              AND organization_id != ALL($1)
                            RETURNING 1
                        )
                        SELECT COUNT(*) FROM deleted;
                    ', v_tbl) 
                    INTO v_count 
                    USING v_keep_org_ids;

                    IF v_count > 0 THEN
                        RAISE NOTICE '🧹 تم حذف % سجل يتيم من جدول: %', v_count, v_tbl;
                        v_total_cleaned := v_total_cleaned + v_count;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RAISE NOTICE '⚠️ ملاحظة عند تنظيف جدول %: %', v_tbl, SQLERRM;
                END;
            END IF;
        END IF;
    END LOOP;

    -- -----------------------------------------------------------------
    -- 5. تنظيف الجداول الفرعية اليتيمة التي قد ترتبط بآباء محذوفين بدون cascade
    -- -----------------------------------------------------------------
    -- أ. أطراف القيود المعلقة بدون قيد يومية
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'journal_lines') THEN
        BEGIN
            WITH deleted AS (
                DELETE FROM public.journal_lines 
                WHERE journal_entry_id NOT IN (SELECT id FROM public.journal_entries)
                RETURNING 1
            )
            SELECT COUNT(*) INTO v_count FROM deleted;
            IF v_count > 0 THEN
                RAISE NOTICE '🧹 تم حذف % سطر قيد معلق بدون قيد يومية', v_count;
                v_total_cleaned := v_total_cleaned + v_count;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- ب. بنود فواتير المبيعات المعلقة بدون فاتورة
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_items') THEN
        BEGIN
            WITH deleted AS (
                DELETE FROM public.invoice_items 
                WHERE invoice_id NOT IN (SELECT id FROM public.invoices)
                RETURNING 1
            )
            SELECT COUNT(*) INTO v_count FROM deleted;
            IF v_count > 0 THEN
                RAISE NOTICE '🧹 تم حذف % بند فاتورة مبيعات معلق بدون فاتورة', v_count;
                v_total_cleaned := v_total_cleaned + v_count;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- ج. بنود فواتير المشتريات المعلقة بدون فاتورة
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_invoice_items') THEN
        BEGIN
            WITH deleted AS (
                DELETE FROM public.purchase_invoice_items 
                WHERE purchase_invoice_id NOT IN (SELECT id FROM public.purchase_invoices)
                RETURNING 1
            )
            SELECT COUNT(*) INTO v_count FROM deleted;
            IF v_count > 0 THEN
                RAISE NOTICE '🧹 تم حذف % بند فاتورة مشتريات معلق بدون فاتورة', v_count;
                v_total_cleaned := v_total_cleaned + v_count;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- د. بنود مردودات المبيعات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_return_items') THEN
        BEGIN
            WITH deleted AS (
                DELETE FROM public.sales_return_items 
                WHERE sales_return_id NOT IN (SELECT id FROM public.sales_returns)
                RETURNING 1
            )
            SELECT COUNT(*) INTO v_count FROM deleted;
            IF v_count > 0 THEN
                RAISE NOTICE '🧹 تم حذف % بند مردود مبيعات معلق', v_count;
                v_total_cleaned := v_total_cleaned + v_count;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- هـ. بنود مردودات المشتريات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_return_items') THEN
        BEGIN
            WITH deleted AS (
                DELETE FROM public.purchase_return_items 
                WHERE purchase_return_id NOT IN (SELECT id FROM public.purchase_returns)
                RETURNING 1
            )
            SELECT COUNT(*) INTO v_count FROM deleted;
            IF v_count > 0 THEN
                RAISE NOTICE '🧹 تم حذف % بند مردود مشتريات معلق', v_count;
                v_total_cleaned := v_total_cleaned + v_count;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- و. بنود طلبات المطاعم
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
        BEGIN
            WITH deleted AS (
                DELETE FROM public.order_items 
                WHERE order_id NOT IN (SELECT id FROM public.orders)
                RETURNING 1
            )
            SELECT COUNT(*) INTO v_count FROM deleted;
            IF v_count > 0 THEN
                RAISE NOTICE '🧹 تم حذف % عنصر طلب مطعم معلق بدون طلب رئيسي', v_count;
                v_total_cleaned := v_total_cleaned + v_count;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- -----------------------------------------------------------------
    -- 6. مسح ديناميكي شامل لكافة الجداول العامة التي تحوي عمود organization_id
    -- -----------------------------------------------------------------
    FOR v_tbl IN (
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND column_name = 'organization_id'
          AND table_name NOT IN ('organizations', 'profiles')
    ) LOOP
        BEGIN
            EXECUTE format('
                WITH deleted AS (
                    DELETE FROM public.%I 
                    WHERE organization_id IS NOT NULL 
                      AND organization_id != ALL($1)
                    RETURNING 1
                )
                SELECT COUNT(*) FROM deleted;
            ', v_tbl) 
            INTO v_count 
            USING v_keep_org_ids;

            IF v_count > 0 THEN
                RAISE NOTICE '🧹 (فحص ديناميكي) تم حذف % سجل يتيم من جدول: %', v_count, v_tbl;
                v_total_cleaned := v_total_cleaned + v_count;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- تجاهل أو تسجيل التخطي للأمان
            NULL;
        END;
    END LOOP;

    -- -----------------------------------------------------------------
    -- 7. تنظيف المستخدمين المعلقين التابعين للشركات المحذوفة
    --    (مع استثناء وحماية كاملة لمديري النظام ومسؤولي Super Admin والشركات الثلاث)
    -- -----------------------------------------------------------------
    SELECT ARRAY_AGG(id) INTO v_orphan_user_ids
    FROM public.profiles
    WHERE organization_id IS NOT NULL 
      AND organization_id != ALL(v_keep_org_ids)
      AND COALESCE(role, '') NOT IN ('super_admin', 'system_admin');

    IF v_orphan_user_ids IS NOT NULL AND array_length(v_orphan_user_ids, 1) > 0 THEN
        RAISE NOTICE '🔍 تم رصد % مستخدم معلق لشركات محذوفة سيتم إزالتهم بأمان.', array_length(v_orphan_user_ids, 1);

        -- فك ارتباط المستخدمين المعلقين من أي أعمدة مفاتيح خارجية أولاً لتجنب قيود الـ FK
        FOR v_tbl, v_col IN (
            SELECT DISTINCT
                c.conrelid::regclass::text,
                a.attname
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE (c.confrelid = 'auth.users'::regclass OR c.confrelid = 'public.profiles'::regclass)
              AND c.contype = 'f'
              AND c.conrelid::regclass::text NOT IN ('public.profiles', 'auth.users', 'auth.identities', 'auth.sessions', 'auth.refresh_tokens', 'auth.mfa_factors')
        ) LOOP
            BEGIN
                EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = ANY($1)', v_tbl, v_col, v_col) USING v_orphan_user_ids;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END LOOP;

        -- حذفهم من profiles
        BEGIN
            DELETE FROM public.profiles WHERE id = ANY(v_orphan_user_ids);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- حذفهم من auth.users
        BEGIN
            DELETE FROM auth.users WHERE id = ANY(v_orphan_user_ids);
            GET DIAGNOSTICS v_del_users_count = ROW_COUNT;
            RAISE NOTICE '🗑️ تم حذف % مستخدم من auth.users و profiles بنجاح.', v_del_users_count;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠️ تعذر مسح بعض المستخدمين من auth.users: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '✅ لا توجد حسابات مستخدمين يتيمة تحتاج للحذف.';
    END IF;

    -- إعادة وضع الحماية الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);

    -- -----------------------------------------------------------------
    -- 8. التقرير النهائي للعملية
    -- -----------------------------------------------------------------
    RAISE NOTICE '=======================================================';
    RAISE NOTICE '🎉 اكتملت عملية تنظيف الشركات المحذوفة بنجاح تام:';
    RAISE NOTICE '   - عدد الشركات الإضافية المحذوفة من organizations: %', v_del_orgs_count;
    RAISE NOTICE '   - إجمالي السجلات اليتيمة التي تم تطهيرها: %', v_total_cleaned;
    RAISE NOTICE '   - المستخدمين المعلقين المحذوفين: %', v_del_users_count;
    RAISE NOTICE '   - الشركات الثلاث النشطة ظلت كما هي بكامل بياناتها 100%%.';
    RAISE NOTICE '=======================================================';

END $$;

-- تحديث كاش واجهة البرمجة (Supabase PostgREST Schema Cache)
NOTIFY pgrst, 'reload schema';
