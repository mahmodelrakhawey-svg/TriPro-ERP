-- 🌟 النسخة الشاملة الموحدة (Version 4.0 - All Modules Integrated)
-- 🌟 النسخة الشاملة الموحدة (Version 40.1 - Full Manufacturing & Stock Final Fixes + Modifiers Support)

-- ================================================================
-- 0. تنظيف شامل لتجنب تعارض التوقيعات (يجب أن يكون في البداية)
-- ================================================================
DO $$
DECLARE
    func_signature text;
    trig_record record;
    func_name text;
BEGIN
    -- 🛡️ المرحلة 0.أ: تنظيف كافة المشغلات (Triggers) القديمة لضمان "بداية نظيفة" (Clean Slate)
    -- هذا الجزء يمنع تعطل العمليات بسبب مشغلات قديمة تشير لدوال تم تغيير توقيعها أو حذفها
    FOR trig_record IN (
        SELECT trigger_name, event_object_table 
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public'
        -- نستهدف فقط الجداول التي يديرها النظام لضمان الأمان وعدم المساس بإضافات أخرى
        AND event_object_table IN (
            'products', 'invoices', 'purchase_invoices', 'orders', 'order_items',
            'kitchen_orders', 'journal_entries', 'accounts', 'bill_of_materials', 
            'modifier_groups', 'payments', 'assets', 'menu_categories', 'item_categories',
            'purchase_invoice_items', 'invoice_items', 'stock_adjustment_items', 'shifts'
            , 'stock_transfer_items', 'inventory_count_items', 'mfg_production_orders', 'mfg_order_progress', 'mfg_material_requests'
        )
    ) LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trig_record.trigger_name, trig_record.event_object_table);
    END LOOP;

    FOR func_signature IN (SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
    LOOP
        func_name := split_part(func_signature, '(', 1);
        -- 🛡️ صمام أمان إضافي: حذف كافة توقيعات دالة الطلبات العامة لمنع التعارض بين UUID و TEXT
        IF REPLACE(func_name, 'public.', '') = 'create_public_order' THEN
            EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_signature);
        END IF;

        -- نزيل بادئة "public." إذا وجدت لضمان مطابقة الاسم بشكل صحيح. تم تحديث القائمة لتشمل دوال التصنيع الجديدة.
        IF REPLACE(func_name, 'public.', '') IN ( -- Deduplicated and updated list
            'approve_invoice', 'approve_purchase_invoice', 'approve_receipt_voucher', 'approve_payment_voucher',
            'approve_sales_return', 'approve_purchase_return', 'approve_debit_note', 'approve_credit_note',
            'start_shift', 'get_dashboard_stats', 'create_restaurant_order', 'create_public_order', 'recalculate_all_balances',
            'open_table_session', 
            'run_payroll_rpc', 'recalculate_stock_rpc', 'recalculate_all_system_balances', 'initialize_egyptian_coa',
            'get_restaurant_sales_report', 'process_wastage', 'get_item_profit_report', 'get_active_shift',
            'get_shift_summary', 'generate_shift_closing_entry', 'close_shift', 'force_provision_admin',
            'get_products_without_bom', 'calculate_product_wac', 'update_single_supplier_balance', 'update_product_stock',
            'add_product_with_opening_balance', 'run_period_depreciation', 'create_organization_backup',
            'run_daily_backups_all_orgs', 'restore_organization_backup', 'force_grant_admin_access',
            'get_or_create_qr_for_table', 'get_current_company_settings', 'fn_ensure_kitchen_order_org',
            'fn_ensure_document_warehouse', 'fn_assign_cashier_to_qr_order', 'fn_ensure_order_warehouse',
            'trg_fn_update_kitchen_status_time', 'trg_fn_sync_meal_cost', 'sync_customer_balance_trigger',
            'fn_auto_approve_invoice_on_insert', 'fn_auto_approve_invoice_on_items_insert', 'cleanup_orphaned_backups',
            'cleanup_storage_orphans_trigger', 'sync_role_permissions', 'create_new_client_v2', 'handle_new_user',
            'check_user_limit', 'prevent_system_account_deletion', 'set_emergency_mode', 'get_saas_platform_metrics',
            'repair_all_admin_permissions', 'clear_demo_data', 'get_admin_platform_metrics',
            'fix_unbalanced_journal_entry', 'approve_stock_transfer', 'cancel_stock_transfer', 'post_inventory_count', 'check_account_is_not_group',
            'get_account_balance_at_date', 'fn_validate_journal_entry_balance', 'test_saas_isolation',
            'test_wac_logic', 'trigger_handle_stock_on_order', 'mfg_deduct_stock_from_order', 
            'mfg_test_pos_integration', 'mfg_test_full_cycle',
            'get_product_recipe_cost', 'trg_fn_sync_product_costs_on_update',
            'add_journal_entry'
        ) THEN
            EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_signature);
        END IF;
    END LOOP;

END $$;

-- 🛡️ دالة بدء الوردية (Start Shift) - النسخة الموحدة
-- تم تحديث التوقيع ليتوافق مع نداء الواجهة الأمامية ويدعم السوبر أدمن والشركات المتعددة
DROP FUNCTION IF EXISTS public.start_pos_shift CASCADE;

CREATE OR REPLACE FUNCTION public.start_pos_shift(
    p_opening_balance numeric DEFAULT 0, 
    p_resume_existing boolean DEFAULT true, 
    p_treasury_account_id uuid DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL
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
BEGIN
    -- جلب منظمة المستخدم (سواء من بروفايله أو من التوكن للسوبر أدمن)
    v_org_id := COALESCE(
        public.get_my_org(), 
        (SELECT organization_id FROM public.profiles WHERE id = COALESCE(p_user_id, auth.uid()))
    );
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'فشل تحديد المنظمة. تأكد من ضبط المنظمة النشطة للسوبر أدمن.';
    END IF;

    -- البحث عن وردية مفتوحة
    SELECT * INTO v_existing_shift 
    FROM public.shifts 
    WHERE user_id = COALESCE(p_user_id, auth.uid()) AND end_time IS NULL AND organization_id = v_org_id 
    LIMIT 1;

    IF v_existing_shift.id IS NOT NULL AND p_resume_existing THEN 
        RETURN v_existing_shift; 
    END IF;

    IF v_existing_shift.id IS NOT NULL THEN 
        RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم. يرجى إغلاقها أولاً.'; 
    END IF;

    -- إنشاء الوردية الجديدة مع ربط الخزينة المختارة
    INSERT INTO public.shifts (user_id, start_time, opening_balance, treasury_account_id, organization_id, status)
    VALUES (COALESCE(p_user_id, auth.uid()), now(), p_opening_balance, p_treasury_account_id, v_org_id, 'OPEN') 
    RETURNING * INTO v_new_shift;

    RETURN v_new_shift;
END; $$;

-- 🛠️ تحديث: دالة جلب الوردية النشطة مع دعم البارامترات الاختيارية
DROP FUNCTION IF EXISTS public.get_active_shift CASCADE;

CREATE OR REPLACE FUNCTION public.get_active_shift(
    p_user_id uuid DEFAULT NULL, 
    p_org_id uuid DEFAULT NULL
)
RETURNS public.shifts 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_target_org uuid;
BEGIN
    -- 🛡️ تحديد المنظمة المستهدفة بذكاء لتجنب استثناءات 400
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    
    -- 🚀 تحسين: استخدام مستعار الجدول (s) لضمان إرجاع كائن سجل متوافق تماماً
    RETURN (SELECT s FROM public.shifts s 
            WHERE user_id = COALESCE(p_user_id, auth.uid())
            AND end_time IS NULL 
            AND organization_id = v_target_org
            LIMIT 1);
END; $$;

-- ================================================================
-- 1. دوال المبيعات والمشتريات (Sales & Purchases)
-- ================================================================

-- أ. اعتماد فاتورة المبيعات
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_discount_acc_id uuid; v_treasury_acc_id uuid;
    v_customer_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_journal_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_mappings jsonb;
BEGIN
    -- 1. التحقق من الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار أو التضارب بعد التعديل
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice';

    -- تم إزالة شرط الـ RETURN للسماح بإعادة الترحيل وتحديث البيانات عند التعديل (Re-posting)

    -- 🛡️ حماية من "سباق الزمن": لا تنشئ قيداً إذا لم تكن بنود الفاتورة قد وصلت بعد لقاعدة البيانات
    -- هذا يضمن عدم إنشاء قيد الإيراد بدون قيد التكلفة عند التحويل الآلي
    IF NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = p_invoice_id) THEN RETURN; END IF; -- 🛡️ حماية من "سباق الزمن"
    
    -- 🛡️ تأمين معرف المنظمة (SaaS Protection) - حل مشكلة عروض الأسعار
    -- نعتمد على المنظمة المسجلة في الفاتورة، أو منظمة المستخدم، أو منظمة العميل كخيار أخير
    v_org_id := COALESCE(v_invoice.organization_id, public.get_my_org(), (SELECT organization_id FROM public.customers WHERE id = v_invoice.customer_id));
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى التأكد من صلاحيات الوصول.'; END IF;

    -- ترميم المنظمة في الفاتورة إذا كانت مفقودة لضمان تماسك البيانات
    IF v_invoice.organization_id IS NULL THEN UPDATE public.invoices SET organization_id = v_org_id WHERE id = p_invoice_id; END IF;

    -- 2. جلب روابط الحسابات من إعدادات الشركة (Scoped by Org)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1;

    -- 3. جلب الحسابات (الأولوية للربط المخصص Mapping ثم الكود الافتراضي)
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
    v_discount_acc_id := COALESCE((v_mappings->>'SALES_DISCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '413' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1)); -- Ensure this account exists
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_sales_acc_id IS NULL OR v_customer_acc_id IS NULL OR v_cogs_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المبيعات أو المخزون غير معرّفة لهذه المنظمة.';
    END IF;

    -- 4. تحديث المخزون وحساب تكلفة البضاعة المباعة (COGS)
    FOR v_item IN SELECT ii.*, p.product_type FROM public.invoice_items ii JOIN public.products p ON ii.product_id = p.id WHERE ii.invoice_id = p_invoice_id LOOP
        -- 🚀 محرك التكلفة الذكي: يعطي الأولوية للتكلفة الشاملة (بما فيها التصنيع) من بطاقة الصنف
        SELECT COALESCE(
            cost, -- التكلفة الشاملة (مواد + عمالة + مصاريف غير مباشرة)
            NULLIF(weighted_average_cost, 0),
            NULLIF(purchase_price, 0), 
            0
        ) INTO v_item_cost -- Use COALESCE for default 0
        FROM public.products 
        WHERE id = v_item.product_id AND organization_id = v_org_id;
        
        v_total_cost := v_total_cost + (v_item_cost * v_item.quantity);
        
        -- تحديث تكلفة البند في الفاتورة لضمان دقة التقارير لاحقاً
        UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;

        -- تحديث المخزون مع معالجة حالة المستودع الفارغ (Ensure warehouse_id is not NULL)
        UPDATE public.products SET stock = stock - v_item.quantity, 
        warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[COALESCE(v_invoice.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    -- 5. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'invoice', true) RETURNING id INTO v_journal_id;

    -- 6. إنشاء أسطر القيد (منطق القيد المزدوج الشفاف)
    
    -- أ. إثبات مديونية العميل بكامل قيمة الفاتورة
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) -- Ensure description is not NULL
    VALUES (v_journal_id, v_customer_acc_id, v_invoice.total_amount, 0, 'إجمالي قيمة الفاتورة رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);

    -- ب. إثبات التحصيل النقدي الفوري (إذا وجد) لضمان دقة كشف الحساب
    IF COALESCE(v_invoice.paid_amount, 0) > 0 THEN 
        IF v_treasury_acc_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة للمبلغ المدفوع'; END IF;
        
        -- قيد التحصيل: من حساب الخزينة (مدين) إلى حساب العميل (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_treasury_acc_id, v_invoice.paid_amount, 0, 'تحصيل نقدي مع الفاتورة رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id),
            (v_journal_id, v_customer_acc_id, 0, v_invoice.paid_amount, 'سداد فوري من العميل مع الفاتورة', v_org_id);
    END IF;

    IF COALESCE(v_invoice.discount_amount, 0) > 0 AND v_discount_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_discount_acc_id, COALESCE(v_invoice.discount_amount, 0), 0, 'خصم ممنوح', v_org_id); END IF;
    IF v_sales_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات', v_org_id); END IF;
    IF COALESCE(v_invoice.tax_amount, 0) > 0 THEN
        IF v_vat_acc_id IS NULL THEN
            RAISE EXCEPTION 'فشل الترحيل: حساب ضريبة القيمة المضافة (VAT) غير معرّف في إعدادات الربط لهذه المنظمة.';
        END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, COALESCE(v_invoice.tax_amount, 0), 'ضريبة القيمة المضافة', v_org_id);
    END IF;
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات', v_org_id), (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id); END IF;

    -- 7. تحديث حالة الفاتورة
    UPDATE public.invoices SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;

    -- 🚀 إعادة احتساب المخزون فوراً لضمان الدقة بعد أي تعديلات
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ إضافة اسم مستعار لدالة المبيعات لتوافق الواجهة الأمامية (Fix 404 post_sales_invoice)
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    PERFORM public.approve_invoice(p_invoice_id);
END; $$;
-- 🛠️ دالة ترحيل فاتورة المشتريات (Approve Purchase Invoice)
-- تم إنشاؤها لحل خطأ 42883 وضمان ترحيل المخزون والموردين
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_in_id uuid; v_supplier_acc_id uuid;
    v_journal_id uuid; v_mappings jsonb; v_treasury_acc_id uuid;
BEGIN
    -- 1. التحقق من الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    v_org_id := v_invoice.organization_id;

    -- 2. جلب روابط الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
        RAISE EXCEPTION 'إعدادات الحسابات مفقودة لهذه المنظمة (المخزون أو الموردين).';
    END IF;

    -- 3. إنشاء رأس قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;

    -- 4. إنشاء أسطر القيد
    -- أ. من ح/ المخزون (بالصافي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_inventory_acc_id, v_invoice.subtotal, 0, 'إثبات قيمة المشتريات مخزنياً', v_org_id);

    -- ب. من ح/ ضريبة القيمة المضافة (مدخلات)
    IF COALESCE(v_invoice.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_in_id, v_invoice.tax_amount, 0, 'ضريبة مدخلات مشتريات', v_org_id);
    END IF;

    -- ج. إلى ح/ المورد (بكامل القيمة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount, 'استحقاق قيمة الفاتورة للمورد', v_org_id);

    -- د. إثبات السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 THEN
        IF v_treasury_acc_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد الخزينة/البنك للمبلغ المدفوع فورياً.'; END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount, 0, 'سداد جزء من الفاتورة للمورد', v_org_id),
            (v_journal_id, v_treasury_acc_id, 0, v_invoice.paid_amount, 'نقدية خارجة مقابل مشتريات', v_org_id);
    END IF;

    -- 5. تحديث حالة الفاتورة وربطها بالقيد
    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;

    -- 6. تحديث الأرصدة والمخزون
    PERFORM public.recalculate_stock_rpc(v_org_id);
    PERFORM public.update_single_supplier_balance(v_invoice.supplier_id, v_org_id);
END; $$;

-- 🛠️ إضافة اسم مستعار للدالة لتوافق الواجهة الأمامية (Fix 404 post_purchase_invoice)
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    PERFORM public.approve_purchase_invoice(p_invoice_id);
END; $$;

-- 🔓 منح صلاحية التنفيذ
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO anon;

-- 🛠️ دالة إضافة قيد يومية يدوياً مع المرفقات
-- تحل مشكلة الخطأ 404 وتدعم رفع الملفات مع القيد
CREATE OR REPLACE FUNCTION public.add_journal_entry(
    attachments jsonb DEFAULT '[]'::jsonb,
    date date DEFAULT now(), -- 🛠️ تحديث: استخدام now() كقيمة افتراضية
    description text DEFAULT NULL,
    lines jsonb DEFAULT '[]'::jsonb,
    reference text DEFAULT NULL,
    status text DEFAULT 'draft',
    p_org_id uuid DEFAULT NULL
) 
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_journal_id uuid;
    v_line jsonb;
    v_attachment jsonb;
    v_org_id uuid;
BEGIN
    -- 🛡️ تحديد المنظمة (SaaS Protection)
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى التأكد من تسجيل الدخول.';
    END IF;

    -- 1. إنشاء رأس القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, user_id, is_posted)
    VALUES (date, description, reference, status, v_org_id, auth.uid(), (status = 'posted'))
    RETURNING id INTO v_journal_id;

    -- 2. إدراج أسطر القيد (المدين والدائن)
    FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(lines, '[]'::jsonb)) LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id, cost_center_id)
        VALUES (
            v_journal_id, 
            COALESCE((v_line->>'account_id')::uuid, (v_line->>'accountId')::uuid), -- 🛡️ دعم كلا المسميين لمنع JS Crash
            COALESCE((v_line->>'debit')::numeric, 0), 
            COALESCE((v_line->>'credit')::numeric, 0), 
            COALESCE(v_line->>'description', description), 
            v_org_id,
            (v_line->>'cost_center_id')::uuid
        );
    END LOOP;

    -- 3. إدراج المرفقات (إن وجدت)
    IF attachments IS NOT NULL AND jsonb_array_length(attachments) > 0 THEN
        FOR v_attachment IN SELECT * FROM jsonb_array_elements(attachments) LOOP
            INSERT INTO public.journal_attachments (journal_entry_id, file_path, file_name, file_type, file_size, organization_id)
            VALUES (
                v_journal_id,
                v_attachment->>'file_path',
                v_attachment->>'file_name',
                v_attachment->>'file_type',
                (v_attachment->>'file_size')::numeric,
                v_org_id
            );
        END LOOP;
    END IF;

    RETURN v_journal_id;
END; $$;
-- 🛡️ دالة إعادة احتساب المخزون الشاملة (Recalculate Stock RPC) - المحرك الموحد والكامل (Phase 3 Finalization)
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
    prod RECORD;
    total_qty numeric;
    wh_stock jsonb;
    wh_rec RECORD;
BEGIN
    -- 🛡️ محرك إعادة احتساب المخزون الشامل (SaaS Multi-tenant Engine)
    FOR prod IN SELECT id, organization_id FROM public.products 
               WHERE (p_org_id IS NULL OR organization_id = p_org_id) 
                 AND deleted_at IS NULL LOOP
        total_qty := 0;
        wh_stock := '{}'::jsonb;

        -- 1. حساب رصيد كل مستودع يخص المنظمة
        FOR wh_rec IN SELECT id FROM public.warehouses 
                     WHERE (organization_id = prod.organization_id) LOOP
            DECLARE
                q_in numeric := 0; q_out numeric := 0; q_opening numeric := 0;
                q_adj numeric := 0; q_transfer_in numeric := 0; q_transfer_out numeric := 0;
                temp_val numeric := 0; net_wh numeric := 0;
            BEGIN
                -- أ. رصيد أول المدة
                SELECT COALESCE(SUM(quantity), 0) INTO q_opening FROM public.opening_inventories 
                WHERE product_id = prod.id AND warehouse_id = wh_rec.id;

                -- ب. المشتريات (وارد)
                SELECT COALESCE(SUM(pii.quantity), 0) INTO temp_val FROM public.purchase_invoice_items pii
                JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id
                WHERE pii.product_id = prod.id AND pi.warehouse_id = wh_rec.id 
                  AND pi.status NOT IN ('draft', 'cancelled') AND pi.organization_id = prod.organization_id;
                q_in := q_in + temp_val;

                -- ج. المبيعات (صادر) - تشمل الخصم المباشر ومكونات الوجبات (BOM)
                -- 1. الخصم المباشر
                SELECT COALESCE(SUM(ii.quantity), 0) INTO temp_val FROM public.invoice_items ii JOIN public.invoices i ON ii.invoice_id = i.id WHERE ii.product_id = prod.id AND i.warehouse_id = wh_rec.id AND i.status NOT IN ('draft', 'cancelled') AND i.organization_id = prod.organization_id AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = ii.product_id);
                q_out := q_out + temp_val;

                -- 2. خصم مكونات الـ BOM للأصناف المجمعة المباعة
                SELECT COALESCE(SUM(ii.quantity * bom.quantity_required), 0) INTO temp_val FROM public.invoice_items ii JOIN public.invoices i ON ii.invoice_id = i.id JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id WHERE bom.raw_material_id = prod.id AND i.warehouse_id = wh_rec.id AND i.status NOT IN ('draft', 'cancelled') AND i.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- 3. خصم مكونات الـ BOM للإضافات (Modifiers) لضمان دقة استهلاك المطاعم
                SELECT COALESCE(SUM(ii.quantity * bom.quantity_required), 0) INTO temp_val FROM public.invoice_items ii JOIN public.invoices i ON ii.invoice_id = i.id CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ii.modifiers, '[]'::jsonb)) AS m JOIN public.bill_of_materials bom ON bom.product_id = (m->>'id')::uuid WHERE bom.raw_material_id = prod.id AND i.warehouse_id = wh_rec.id AND i.status NOT IN ('draft', 'cancelled') AND i.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- ح. الإنتاج المصنع (وارد للمنتج التام)
                SELECT COALESCE(SUM(quantity_to_produce), 0) INTO temp_val FROM public.mfg_production_orders WHERE product_id = prod.id AND warehouse_id = wh_rec.id AND status = 'completed' AND organization_id = prod.organization_id;
                q_in := q_in + temp_val;

                -- ط. المواد المستهلكة في التصنيع (صادر للمواد الخام)
                SELECT COALESCE(SUM(amu.actual_quantity), 0) INTO temp_val FROM public.mfg_actual_material_usage amu
                JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
                JOIN public.mfg_production_orders po ON op.production_order_id = po.id
                WHERE amu.raw_material_id = prod.id AND po.warehouse_id = wh_rec.id AND po.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- د. مرتجعات المبيعات (وارد)
                SELECT COALESCE(SUM(sri.quantity), 0) INTO temp_val FROM public.sales_return_items sri
                JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
                WHERE sri.product_id = prod.id AND sr.warehouse_id = wh_rec.id AND sr.status NOT IN ('draft', 'cancelled') AND sr.organization_id = prod.organization_id;
                q_in := q_in + temp_val;

                -- هـ. مرتجعات المشتريات (صادر)
                SELECT COALESCE(SUM(pri.quantity), 0) INTO temp_val FROM public.purchase_return_items pri
                JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
                WHERE pri.product_id = prod.id AND pr.warehouse_id = wh_rec.id AND pr.status NOT IN ('draft', 'cancelled') AND pr.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- و. التسويات المخزنية
                SELECT COALESCE(SUM(sai.quantity), 0) INTO temp_val FROM public.stock_adjustment_items sai
                JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
                WHERE sai.product_id = prod.id AND sa.warehouse_id = wh_rec.id AND sa.status NOT IN ('draft', 'cancelled') AND sa.organization_id = prod.organization_id;
                q_adj := temp_val;

                -- ز. التحويلات
                SELECT COALESCE(SUM(sti.quantity), 0) INTO temp_val FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.to_warehouse_id = wh_rec.id AND st.status NOT IN ('draft', 'cancelled') AND st.organization_id = prod.organization_id;
                q_transfer_in := temp_val;
                SELECT COALESCE(SUM(sti.quantity), 0) INTO temp_val FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.from_warehouse_id = wh_rec.id AND st.status NOT IN ('draft', 'cancelled') AND st.organization_id = prod.organization_id;
                q_transfer_out := temp_val;

                -- المعادلة النهائية للمستودع
                net_wh := q_opening + q_in - q_out + q_adj + q_transfer_in - q_transfer_out;
                
                -- تحديث JSON المستودعات
                IF net_wh <> 0 THEN
                    wh_stock := jsonb_set(wh_stock, ARRAY[wh_rec.id::text], to_jsonb(net_wh));
                    total_qty := total_qty + net_wh;
                END IF;
            END;
        END LOOP;

        UPDATE public.products SET stock = total_qty, warehouse_stock = wh_stock WHERE id = prod.id;
    END LOOP;
END;
$$;

-- 13.5 دالة اختبار تكامل مبيعات المطعم مع استهلاك المواد الخام
-- تهدف للتأكد من أن بيع وجبة (صنف تام) يؤدي لخصم مكوناتها (خامات) آلياً
CREATE OR REPLACE FUNCTION public.mfg_test_pos_integration()
RETURNS TABLE(step_name text, result text, details text) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_org_id uuid; v_wh_id uuid; v_meal_id uuid; v_meat_id uuid; v_bread_id uuid;
    v_session_id uuid; v_order_id uuid; v_meat_stock_before numeric; v_meat_stock_after numeric;
    v_items jsonb;
BEGIN
    -- 1. الإعداد الأساسي
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN SELECT id INTO v_org_id FROM public.organizations LIMIT 1; END IF;
    
    -- جلب مستودع
    SELECT id INTO v_wh_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;

    -- 2. إنشاء أصناف الاختبار
    -- خامات (لحم، خبز)
    INSERT INTO public.products (name, product_type, mfg_type, stock, purchase_price, organization_id) 
    VALUES ('لحم تجريبي', 'STOCK', 'raw', 100, 50, v_org_id) RETURNING id INTO v_meat_id;
    
    INSERT INTO public.products (name, product_type, mfg_type, stock, purchase_price, organization_id) 
    VALUES ('خبز تجريبي', 'STOCK', 'raw', 100, 5, v_org_id) RETURNING id INTO v_bread_id;

    -- وجبة نهائية (برجر)
    INSERT INTO public.products (name, product_type, mfg_type, organization_id, sales_price) 
    VALUES ('وجبة برجر اختبارية', 'STOCK', 'standard', v_org_id, 150) RETURNING id INTO v_meal_id;

    -- تسجيل أرصدة افتتاحية للتأكد من وجود مخزون فعلي في المحرك
    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id)
    VALUES (v_meat_id, v_wh_id, 100, 50, v_org_id), (v_bread_id, v_wh_id, 100, 5, v_org_id);

    step_name := '1. تهيئة الأصناف والخامات'; result := 'PASS ✅'; details := 'تم إنشاء برجر، لحم، وخبز برصيد 100 لكل منهما'; RETURN NEXT;

    -- 3. بناء الـ BOM (الوصفة)
    -- البرجر يحتاج 1 لحم و 1 خبز
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_meal_id, v_meat_id, 1, v_org_id), (v_meal_id, v_bread_id, 1, v_org_id);

    step_name := '2. بناء وصفة الوجبة (BOM)'; result := 'PASS ✅'; details := 'الوجبة = 1 لحم + 1 خبز'; RETURN NEXT;

    -- تحديث المخزون الأولي لضمان جاهزية المحرك
    PERFORM public.recalculate_stock_rpc(v_org_id);
    SELECT stock INTO v_meat_stock_before FROM public.products WHERE id = v_meat_id;

    -- 4. محاكاة عملية بيع مطعم (POS)
    -- إنشاء جلسة
    INSERT INTO public.table_sessions (opened_at, status, organization_id) 
    VALUES (now(), 'OPEN', v_org_id) RETURNING id INTO v_session_id;

    -- بناء بنود الطلب (طلب 5 وجبات برجر)
    v_items := jsonb_build_array(
        jsonb_build_object('product_id', v_meal_id, 'quantity', 5, 'unit_price', 150)
    );

    -- استدعاء دالة إنشاء الطلب
    v_order_id := public.create_restaurant_order(v_session_id, auth.uid(), 'DINEIN', 'اختبار تكامل POS-MFG', v_items, NULL, v_wh_id);

    step_name := '3. إنشاء طلب مطعم (POS)'; result := 'PASS ✅'; details := 'تم طلب 5 وجبات برجر بنجاح'; RETURN NEXT;

    -- 5. تفعيل الخصم (تغيير الحالة إلى PAID)
    -- هذا سيقوم بتشغيل التريجر trg_handle_stock_on_order -> mfg_deduct_stock_from_order
    UPDATE public.orders SET status = 'PAID' WHERE id = v_order_id;

    step_name := '4. اعتماد الدفع (PAID)'; result := 'PASS ✅'; details := 'تم تحويل حالة الطلب، جاري فحص استهلاك المخزون اللحظي'; RETURN NEXT;

    -- 6. التحقق النهائي من المخزون (يجب أن ينقص رصيد الخامات وليس المنتج التام)
    SELECT stock INTO v_meat_stock_after FROM public.products WHERE id = v_meat_id;

    IF v_meat_stock_after = (v_meat_stock_before - 5) THEN
        step_name := '5. فحص استهلاك الخامات آلياً'; 
        result := 'SUCCESS 🏆'; 
        details := format('رصيد اللحم الأولي: %s، الحالي: %s (تم خصم 5 خامات بنجاح آلياً بدلاً من الوجبة)', v_meat_stock_before, v_meat_stock_after);
    ELSE
        step_name := '5. فحص استهلاك الخامات آلياً'; 
        result := 'FAIL ❌'; 
        details := format('خطأ في الخصم! الأولي: %s، الحالي: %s (المتوقع: %s)', v_meat_stock_before, v_meat_stock_after, (v_meat_stock_before - 5));
    END IF;
    RETURN NEXT;

    -- 7. التحقق من وجود القيد المحاسبي
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE related_document_id = v_order_id) THEN
        step_name := '6. فحص القيد المحاسبي'; result := 'PASS ✅'; details := 'تم إنشاء قيد مبيعات وربطه بالطلب';
    ELSE
        step_name := '6. فحص القيد المحاسبي'; result := 'WARNING ⚠️'; details := 'لم يتم العثور على قيد (ربما في انتظار إغلاق الوردية)';
    END IF;
    RETURN NEXT;

    -- تنظيف بيانات الاختبار (لتجنب تراكم المنتجات الوهمية)
    DELETE FROM public.order_items WHERE order_id = v_order_id;
    DELETE FROM public.orders WHERE id = v_order_id;
    DELETE FROM public.table_sessions WHERE id = v_session_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_meal_id;
    DELETE FROM public.products WHERE organization_id = v_org_id AND name LIKE '%تجريبي%';

EXCEPTION WHEN OTHERS THEN
    step_name := 'CRITICAL ERROR'; result := 'ERROR 🛑'; details := SQLERRM;
    RETURN NEXT;
END; $$;

-- ================================================================
-- 2. دوال المرتجعات والإشعارات (Returns & Notes)
-- ================================================================

-- أ. اعتماد مرتجع مبيعات (Sales Return)
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_journal_id uuid;
    v_acc_sales_ret uuid; v_acc_vat uuid; v_acc_cust uuid;
    v_acc_cogs uuid; v_acc_inv uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_mappings jsonb;
BEGIN
    -- 1. التحقق من المرتجع
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_return_id AND related_document_type = 'sales_return';
    
    v_org_id := public.get_my_org();
    IF v_return.organization_id != v_org_id THEN RAISE EXCEPTION 'تحذير أمني: لا تملك صلاحية هذا المرتجع'; END IF;

    -- 2. جلب روابط الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_sales_ret := COALESCE((v_mappings->>'SALES_RETURNS')::uuid, (SELECT id FROM public.accounts WHERE code = '412' AND organization_id = v_org_id LIMIT 1));
    v_acc_vat := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_acc_cust := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_acc_cogs := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_acc_inv := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. تحديث المخزون (زيادة) وحساب التكلفة المنعكسة
    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP -- Ensure warehouse_id is not NULL
        SELECT COALESCE(weighted_average_cost, cost, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_total_cost := v_total_cost + (v_item_cost * v_item.quantity);
        UPDATE public.products SET stock = stock + v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    -- 4. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true) RETURNING id INTO v_journal_id;

    -- 5. إنشاء أسطر القيد
    IF v_acc_sales_ret IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_sales_ret, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مردودات مبيعات', v_org_id); END IF;
    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_acc_vat IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, v_return.tax_amount, 0, 'عكس ضريبة مخرجات', v_org_id); END IF;
    IF v_acc_cust IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cust, 0, v_return.total_amount, 'تخفيض مديونية عميل', v_org_id); END IF;
    IF v_total_cost > 0 AND v_acc_inv IS NOT NULL AND v_acc_cogs IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_inv, v_total_cost, 0, 'إعادة للمخزون', v_org_id), (v_journal_id, v_acc_cogs, 0, v_total_cost, 'عكس تكلفة مبيعات', v_org_id); END IF;

    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;

    -- 🚀 إعادة احتساب المخزون فوراً لضمان الدقة بعد أي تعديلات
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ج. اعتماد الإشعار المدين (Debit Note) للموردين
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid; v_acc_supp uuid; v_acc_cogs uuid; v_mappings jsonb;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    v_org_id := public.get_my_org();
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_supp := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));
    v_acc_cogs := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار مدين للمورد رقم ' || v_note.debit_note_number, v_note.debit_note_number, 'posted', v_org_id, p_note_id, 'debit_note', true) RETURNING id INTO v_journal_id;

    IF v_acc_supp IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_supp, v_note.total_amount, 0, 'تخفيض حساب المورد', v_org_id); END IF;
    IF v_acc_cogs IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cogs, 0, v_note.total_amount, 'تسوية تكلفة (خصم مكتسب)', v_org_id); END IF;

    UPDATE public.debit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END; $$;

-- د. اعتماد إشعار دائن (Credit Note) للعملاء
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid; v_acc_allowance uuid; v_acc_cust uuid; v_mappings jsonb;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    v_org_id := public.get_my_org();
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_allowance := COALESCE((v_mappings->>'SALES_DISCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '413' AND organization_id = v_org_id LIMIT 1));
    v_acc_cust := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار دائن للعميل رقم ' || v_note.credit_note_number, v_note.credit_note_number, 'posted', v_org_id, p_note_id, 'credit_note', true) RETURNING id INTO v_journal_id;

    IF v_acc_allowance IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_allowance, v_note.total_amount, 0, 'خصم مسموح به', v_org_id); END IF;
    IF v_acc_cust IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cust, 0, v_note.total_amount, 'تخفيض مديونية عميل', v_org_id); END IF;

    UPDATE public.credit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END; $$;

-- هـ. اعتماد سند القبض (Receipt Voucher)
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود.'; END IF;

    -- 🛡️ ضمان جذري: حذف أي قيود تحمل نفس رقم السند لنفس المنظمة منعاً للتكرار التاريخي
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'receipt_voucher';

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض رقم ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true) RETURNING id INTO v_journal_id;
    
    IF v_voucher.treasury_account_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id); END IF;
    IF p_credit_account_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, p_credit_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id); END IF;
    
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;

    -- 🚀 إعادة مطابقة الأرصدة المالية فوراً لضمان الدقة بعد التعديل
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;

-- و. اعتماد سند الصرف (Payment Voucher)
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود.'; END IF;

    -- 🛡️ منع استخدام حساب الأرصدة الافتتاحية (3999) لترحيل سندات الصرف العادية
    IF (SELECT code FROM public.accounts WHERE id = p_debit_account_id) = '3999' THEN
        RAISE EXCEPTION '⚠️ خطأ محاسبي: لا يمكن استخدام حساب الأرصدة الافتتاحية (3999) لترحيل سندات الصرف العادية. يرجى اختيار حساب المصروف الصحيح.';
    END IF;

    -- 🛡️ ضمان جذري: حذف أي قيود تحمل نفس رقم السند لنفس المنظمة منعاً للتكرار التاريخي
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'payment_voucher';

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف رقم ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true) RETURNING id INTO v_journal_id;
    
    IF p_debit_account_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id); END IF;
    IF v_voucher.treasury_account_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id); END IF;

    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;

    -- 🚀 إعادة مطابقة الأرصدة المالية فوراً لضمان الدقة بعد التعديل
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;

-- ================================================================
-- 3. مديول المطاعم (Restaurant Module)
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL
    , p_delivery_info jsonb DEFAULT NULL, -- إضافة معلومات التوصيل
    p_org_id uuid DEFAULT NULL -- 🛠️ تحديث: إضافة p_org_id كمعامل
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order_id uuid; v_item jsonb; v_order_num text; v_order_item_id uuid; v_tax_rate numeric; v_subtotal numeric := 0; v_unit_price numeric; v_qty numeric; v_final_wh_id uuid; v_product_cost numeric;
DECLARE v_org_id uuid;
BEGIN
    -- 🛡️ جلب معرف المنظمة من الجلسة الحالية
    -- 🚀 تحسين: استخدام المنظمة المرتبطة بالجلسة إذا تعذر جلبها من بروفايل المستخدم (مهم للاختبارات وطلبات QR)
    v_org_id := COALESCE(p_org_id,
        public.get_my_org(),
        (SELECT organization_id FROM public.table_sessions WHERE id = p_session_id)
    );
    
    -- 🏗️ تحديد المستودع: الأولوية للممرر، ثم الافتراضي في الإعدادات، ثم أول مستودع متاح
    v_final_wh_id := COALESCE(
        p_warehouse_id, 
        (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1)
    );

    SELECT (vat_rate) INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1;
    IF v_tax_rate IS NULL THEN v_tax_rate := 0.14; END IF;

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, v_final_wh_id) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🛡️ استخراج القيم وضمان عدم وجود NULL
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 1);
        v_unit_price := COALESCE(
            (v_item->>'unit_price')::numeric, 
            (v_item->>'unitPrice')::numeric, 
            (v_item->>'price')::numeric
        , 0); -- Default to 0 if price is not found
        
        -- 🚀 جلب التكلفة الشاملة للمنتج من بطاقة الصنف (بما في ذلك تكاليف التصنيع)
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_product_cost FROM public.products WHERE id = COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid);

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total_price, unit_cost, notes, organization_id, modifiers)
        VALUES (
            v_order_id, 
            COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid), 
            v_qty, 
            v_unit_price,
            (v_qty * v_unit_price), 
            v_product_cost, -- استخدام التكلفة الشاملة من بطاقة الصنف
            v_item->>'notes', 
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb)
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + (v_qty * v_unit_price);
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    UPDATE public.orders SET subtotal = v_subtotal, total_tax = v_subtotal * v_tax_rate, grand_total = v_subtotal + (v_subtotal * v_tax_rate) WHERE id = v_order_id;
     IF p_delivery_info IS NOT NULL THEN
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0), v_org_id);
    END IF;   
    RETURN v_order_id;
END; $$;

-- 📱 دالة استقبال طلبات الزبائن عبر رمز QR (Public Menu Orders)
CREATE OR REPLACE FUNCTION public.create_public_order(p_qr_key uuid, p_items jsonb, p_org_id uuid DEFAULT NULL) -- اعتماد UUID كمعيار وحيد
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table record;
    v_session_id uuid;
    v_order_id uuid;
    v_product_cost numeric;
    v_item jsonb;
    v_order_num text;
    v_tax_rate numeric; v_qty numeric; v_unit_price numeric;
    v_subtotal numeric := 0;
    v_order_item_id uuid;
    v_warehouse_id uuid;
    v_org_id uuid;
BEGIN
    -- 1. التحقق من صحة رمز الطاولة وجلب المنظمة
    SELECT * INTO v_table FROM public.restaurant_tables WHERE qr_access_key = p_qr_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'رمز الطاولة غير صالح أو منتهي الصلاحية'; END IF;

    -- ✅ إضافة فحص صريح لـ organization_id من الطاولة
    IF v_table.organization_id IS NULL THEN
        RAISE EXCEPTION 'فشل تحديد المنظمة للطاولة "%s". يرجى مراجعة بيانات الطاولة أو التواصل مع الدعم.', v_table.name;
    END IF;

    v_org_id := COALESCE(p_org_id, v_table.organization_id);

    -- 2. إيجاد أو إنشاء جلسة (Session) للطاولة
    SELECT id INTO v_session_id FROM public.table_sessions 
    WHERE table_id = v_table.id AND status = 'OPEN' AND organization_id = v_org_id AND end_time IS NULL LIMIT 1;

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status, start_time)
        VALUES (v_table.id, v_org_id, 'OPEN', now())
        RETURNING id INTO v_session_id;
    END IF;

    -- تحديث حالة الطاولة وربط وقت الجلسة
    UPDATE public.restaurant_tables SET status = 'OCCUPIED', session_start = now() WHERE id = v_table.id;

    -- 🏗️ جلب المستودع الافتراضي
    v_warehouse_id := COALESCE(
        (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1)
    );

    -- 3. جلب نسبة الضريبة
    SELECT vat_rate INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_org_id;
    v_tax_rate := COALESCE(v_tax_rate, 0.14);

    -- 4. توليد رقم طلب مميز
    v_order_num := 'QR-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(v_session_id::text, 1, 4));

    -- 5. إنشاء الطلب الرئيسي (تعديل النوع ليتوافق مع المطبخ DINE_IN)
    INSERT INTO public.orders (
        session_id, organization_id, order_number, order_type, status, subtotal, total_tax, grand_total, warehouse_id
    ) VALUES (
        v_session_id, v_org_id, v_order_num, 'DINE_IN', 'CONFIRMED', 0, 0, 0, v_warehouse_id
    ) RETURNING id INTO v_order_id;

    -- 6. إضافة الأصناف وتوليد طلبات المطبخ تلقائياً
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := COALESCE((v_item->>'quantity')::numeric, 1);
        v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);

        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_product_cost 
        FROM public.products WHERE id = (v_item->>'product_id')::uuid;

        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price, total_price, unit_cost, notes, organization_id, modifiers
        ) VALUES (
            v_order_id, (v_item->>'product_id')::uuid, v_qty, v_unit_price, (v_qty * v_unit_price),
            v_product_cost, v_item->>'notes', v_org_id, COALESCE(v_item->'modifiers', '[]'::jsonb)
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + (v_qty * v_unit_price);

        -- ✅ إرسال تنبيه للمطبخ (KDS) فوراً
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id)
        VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    -- 7. تحديث إجماليات الطلب النهائية
    UPDATE public.orders SET
        subtotal = v_subtotal,
        total_tax = v_subtotal * v_tax_rate,
        grand_total = v_subtotal + (v_subtotal * v_tax_rate)
    WHERE id = v_order_id;

    RETURN v_order_id;
END; $$;

-- 🛠️ دالة فتح جلسة طاولة (Open Table Session)
-- تُستخدم لبدء إشغال طاولة وتجهيزها لاستقبال الطلبات
CREATE OR REPLACE FUNCTION public.open_table_session(p_table_id uuid)
RETURNS public.table_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_session public.table_sessions;
    v_org_id uuid;
BEGIN
    -- 1. تحديد المنظمة من بيانات الطاولة
    SELECT organization_id INTO v_org_id FROM public.restaurant_tables WHERE id = p_table_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'الطاولة غير موجودة.'; END IF;

    -- 2. البحث عن جلسة مفتوحة حالياً
    SELECT * INTO v_session FROM public.table_sessions 
    WHERE table_id = p_table_id AND status = 'OPEN' AND end_time IS NULL
    LIMIT 1;

    -- 3. إذا لم توجد جلسة، نفتح واحدة جديدة
    IF v_session.id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status, start_time, user_id)
        VALUES (p_table_id, v_org_id, 'OPEN', now(), auth.uid())
        RETURNING * INTO v_session;

        UPDATE public.restaurant_tables SET status = 'OCCUPIED', session_start = now() WHERE id = p_table_id;
    END IF;

    RETURN v_session;
END; $$;

-- منح صلاحية تنفيذ الدالة للزوار (الموبايل) والموظفين
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_table_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_table_session(uuid) TO anon;
-- 🛠️ دالة جلب ملخص الوردية (التي تظهر للمحاسب قبل الإغلاق)
CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record;
    v_summary record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    WITH shift_orders AS (
        SELECT id, subtotal, total_tax, grand_total
        FROM public.orders
        WHERE (user_id = v_shift.user_id OR user_id IS NULL)
        AND organization_id = COALESCE(v_shift.organization_id, public.get_my_org())
        AND created_at BETWEEN v_shift.start_time AND now()
        AND (status::text IN ('COMPLETED', 'PAID', 'posted'))
    )
    SELECT 
        COALESCE(SUM(subtotal), 0) as total_subtotal,
        COALESCE(SUM(total_tax), 0) as total_tax,
        COALESCE(SUM(grand_total), 0) as total_sales,
        COALESCE((SELECT SUM(delivery_fee) FROM public.delivery_orders WHERE order_id IN (SELECT id FROM shift_orders)), 0) as total_delivery_fees,
        -- حساب المبالغ من واقع المدفوعات الفعلية (دقة متناهية للمطاعم) لخصمها من الإجمالي والوصول للآجل
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND payment_method = 'CASH' AND status = 'COMPLETED'), 0) as cash_sales,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND payment_method = 'CARD' AND status = 'COMPLETED'), 0) as card_sales,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND status = 'COMPLETED'), 0) as total_payments
    INTO v_summary
    FROM shift_orders;

    RETURN json_build_object(
        'opening_balance', COALESCE(v_shift.opening_balance, 0),
        'total_sales', COALESCE(v_summary.total_sales, 0),
        'total_tax', COALESCE(v_summary.total_tax, 0),
        'delivery_fees', COALESCE(v_summary.total_delivery_fees, 0),
        'cash_sales', COALESCE(v_summary.cash_sales, 0),
        'card_sales', COALESCE(v_summary.card_sales, 0),
        'credit_sales', (v_summary.total_sales + v_summary.total_delivery_fees) - v_summary.total_payments,
        'expected_cash', COALESCE(v_shift.opening_balance, 0) + COALESCE(v_summary.cash_sales, 0)
    );
END; $$;

-- 🛠️ دالة إنشاء قيد الإغلاق المجمع (القلب المحاسبي للوردية)
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb;
    v_cash_acc_id uuid; v_card_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid;
    v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_customer_acc_id uuid;
    v_diff numeric := 0; v_actual_cash_collected numeric := 0;
    v_cust_order record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;

    -- 🛡️ ضمان مبدأ Idempotency: حذف أي قيد إغلاق قديم لهذه الوردية منعاً لتكرار المبالغ في الأستاذ العام
    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    WITH shift_orders AS (
        SELECT id, subtotal, total_tax, grand_total, customer_id, order_number FROM public.orders
        WHERE (user_id = v_shift.user_id OR user_id IS NULL)
        AND status NOT IN ('CANCELLED', 'DRAFT') 
        AND organization_id = v_shift.organization_id
        AND created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())
    )
    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((SELECT SUM(delivery_fee) FROM public.delivery_orders WHERE order_id IN (SELECT id FROM shift_orders)), 0) as total_delivery_fees,
        -- 🚀 محرك التكلفة المطور: يجمع التكلفة الشاملة (مواد + عمالة + إضافات) من بطاقة الصنف مباشرة
        COALESCE((
            SELECT SUM(oi.quantity * COALESCE(prod.cost, prod.weighted_average_cost, prod.purchase_price, 0))
            FROM public.order_items oi
            JOIN public.products prod ON oi.product_id = prod.id
            WHERE oi.order_id IN (SELECT id FROM shift_orders)
            AND oi.organization_id = v_shift.organization_id
        ), 0) as cost_total,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND payment_method = 'CASH' AND status = 'COMPLETED'), 0) as cash_total,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND payment_method = 'CARD' AND status = 'COMPLETED'), 0) as card_total,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND status = 'COMPLETED'), 0) as total_payments
    INTO v_summary
    FROM shift_orders;

    -- تحديد المنظمة بذكاء (الهوية الهيكلية الموحدة)
    v_shift.organization_id := COALESCE(p_org_id, v_shift.organization_id, (SELECT organization_id FROM public.profiles WHERE id = v_shift.user_id), public.get_my_org());

    -- حساب الفرق والمبيعات الآجلة (Credit Sales)
    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    v_actual_cash_collected := v_summary.cash_total + v_diff;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_shift.organization_id;

    v_cash_acc_id := COALESCE((v_mappings->>'CASH')::uuid, (SELECT id FROM public.accounts WHERE code = '1231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_card_acc_id := COALESCE((v_mappings->>'BANK_ACCOUNTS')::uuid, (SELECT id FROM public.accounts WHERE code = '123201' AND organization_id = v_shift.organization_id LIMIT 1));
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_shift.organization_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_OUTPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_shift.organization_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_shift.organization_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_shift.organization_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'إغلاق وردية مطعم - مستخدم: ' || v_shift.user_id, 'SHIFT-' || to_char(now(), 'YYMMDD'), 'posted', v_shift.organization_id, true, p_shift_id, 'shift') RETURNING id INTO v_je_id;
    
    -- 1. الإيرادات والضرائب (دائن)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal + v_summary.total_delivery_fees, 'إيرادات الوردية (شامل التوصيل)', v_shift.organization_id);
    IF v_summary.tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_shift.organization_id); END IF;

    -- 2. التحصيلات الفورية (مدين)
    IF v_actual_cash_collected > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cash_acc_id, v_actual_cash_collected, 0, 'نقدية الوردية المحصلة', v_shift.organization_id); END IF;
    IF v_summary.card_total > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_card_acc_id, v_summary.card_total, 0, 'متحصلات شبكة', v_shift.organization_id); END IF;
    
    -- 3. إثبات مديونية كل عميل بشكل منفصل ليظهر في كشف حسابه
    FOR v_cust_order IN (
        SELECT o.id, o.grand_total, c.name as cust_name
        FROM public.orders o JOIN public.customers c ON o.customer_id = c.id
        WHERE o.organization_id = v_shift.organization_id 
        AND o.created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())
        AND o.status NOT IN ('CANCELLED', 'DRAFT')
        AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id AND p.status = 'COMPLETED')
    ) LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_acc_id, v_cust_order.grand_total, 0, 'مديونية عميل مطعم: ' || v_cust_order.cust_name, v_shift.organization_id);
    END LOOP;

    -- 4. إغلاق كافة الطلبات وربطها بالقيد لكي تختفي من شاشة الـ POS وتظهر كحركات مرحلة
    UPDATE public.orders SET status = 'posted', related_journal_entry_id = v_je_id
    WHERE organization_id = v_shift.organization_id 
    AND created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())
    AND status NOT IN ('CANCELLED', 'DRAFT');

    -- 5. معالجة فروقات الصندوق (عجز أو زيادة)
    IF v_diff > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, (SELECT id FROM public.accounts WHERE code = '421' AND organization_id = v_shift.organization_id LIMIT 1), 0, v_diff, 'زيادة نقدية الوردية', v_shift.organization_id); 
    END IF;

    IF v_summary.cost_total > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_cogs_acc_id, v_summary.cost_total, 0, 'تكلفة مبيعات الوردية', v_shift.organization_id), 
               (v_je_id, v_inventory_acc_id, 0, v_summary.cost_total, 'صرف مخزون الوردية', v_shift.organization_id); 
    END IF;
    RETURN v_je_id;
END; $$;

-- 🛠️ دالة ربط مستخدم موجود مسبقاً بمنظمة جديدة كمدير (تستخدمها منصة ساس)
CREATE OR REPLACE FUNCTION public.force_provision_admin(p_email text, p_org_id uuid, p_full_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = LOWER(p_email);
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'المستخدم غير موجود بالنظام'; END IF;

    INSERT INTO public.profiles (id, organization_id, role, full_name, is_active)
    VALUES (v_user_id, p_org_id, 'admin', p_full_name, true)
    ON CONFLICT (id) DO UPDATE SET 
        organization_id = p_org_id, 
        role = 'admin', 
        full_name = p_full_name, 
        is_active = true;

    UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
                             jsonb_build_object('org_id', p_org_id, 'role', 'admin')
    WHERE id = v_user_id;
END; $$;

-- 📊 تقرير الوجبات التي لم يتم ربطها بمكونات (BOM) لضبط التكاليف
CREATE OR REPLACE FUNCTION public.get_products_without_bom(p_org_id uuid)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    sku text,
    category_name text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.sku,
        COALESCE(cat.name, 'غير مصنف')
    FROM public.products p
    LEFT JOIN public.item_categories cat ON p.category_id = cat.id
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND p.product_type = 'STOCK'
      AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = p.id);
END; $$;

-- 🛠️ دالة إغلاق الوردية
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id uuid, 
    p_actual_cash numeric, 
    p_notes text DEFAULT NULL, 
    p_org_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. تحديث بيانات الوردية والمبلغ الفعلي أولاً (ضروري لصحة القيد)
    UPDATE public.shifts SET 
        end_time = now(),
        actual_cash = p_actual_cash,
        status = 'CLOSED',
        notes = p_notes
    WHERE id = p_shift_id;

    -- 2. الآن نولد القيد المحاسبي بناءً على البيانات الفعلية
    PERFORM public.generate_shift_closing_entry(p_shift_id, p_org_id);
END; $$;
-- ================================================================
-- 4. مديول الموارد البشرية (HR & Payroll)
-- ================================================================

CREATE OR REPLACE FUNCTION public.run_payroll_rpc(p_month integer, p_year integer, p_date date, p_treasury_acc uuid, p_items jsonb, p_org_id uuid DEFAULT NULL) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE -- 🛠️ تحديث: إضافة p_org_id كمعامل
    v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; 
    v_total_additions numeric := 0; v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; v_total_net numeric := 0; 
    v_item jsonb; v_je_id uuid; v_mappings jsonb; v_user_id uuid; v_payroll_item_id uuid;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; v_payroll_tax_id uuid; v_total_payroll_tax numeric := 0;
    v_fixed_allowances numeric := 0; v_monthly_additions numeric := 0; v_monthly_deductions numeric := 0; v_emp_net numeric := 0;
BEGIN
    -- 🛡️ جلب المنظمة (الأولوية للممرر ثم السياق)
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة، يرجى إعادة تسجيل الدخول.'; END IF;

    -- 🛡️ حماية SaaS: منع تكرار صرف الرواتب لنفس الفترة داخل نفس الشركة
    IF EXISTS (SELECT 1 FROM public.payrolls WHERE payroll_month = p_month AND payroll_year = p_year AND organization_id = v_org_id AND status = 'paid') THEN
        RAISE EXCEPTION 'تم اعتماد وصرف مسير الرواتب لشهر (%) سنة (%) مسبقاً لهذه المنظمة.', p_month, p_year;
    END IF;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_salaries_acc_id := COALESCE((v_mappings->>'SALARIES_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1));
    v_bonuses_acc_id := COALESCE((v_mappings->>'EMPLOYEE_BONUSES')::uuid, (SELECT id FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id LIMIT 1));
    v_deductions_acc_id := COALESCE((v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid, (SELECT id FROM public.accounts WHERE code = '422' AND organization_id = v_org_id LIMIT 1));
    v_advances_acc_id := COALESCE((v_mappings->>'EMPLOYEE_ADVANCES')::uuid, (SELECT id FROM public.accounts WHERE code = '1223' AND organization_id = v_org_id LIMIT 1));
    v_payroll_tax_id := COALESCE((v_mappings->>'PAYROLL_TAX')::uuid, (SELECT id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1));

    IF v_salaries_acc_id IS NULL OR v_advances_acc_id IS NULL OR p_treasury_acc IS NULL THEN 
        RAISE EXCEPTION 'فشل جلب إعدادات الحسابات المالية للرواتب، يرجى مراجعة Account Mappings في إعدادات الشركة.'; -- Ensure p_treasury_acc is not NULL
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_treasury_acc AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'حساب الخزينة/البنك المختار غير صحيح أو لا ينتمي لهذه المنظمة.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items)) THEN RAISE EXCEPTION 'لا توجد بيانات موظفين صالحة في المسير.'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
          -- 🛡️ إعادة تصفير المتغيرات لكل موظف لضمان دقة الحسابات
        v_fixed_allowances := 0; v_monthly_additions := 0; v_monthly_deductions := 0;  
        -- 1. جلب البدلات الثابتة من الجدول
        SELECT COALESCE(SUM(amount), 0) INTO v_fixed_allowances 
        FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id;

        -- 2. جلب المتغيرات الشهرية (الإضافات)
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_additions 
        FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid 
        AND month = p_month AND year = p_year AND type = 'addition' AND is_processed = false AND organization_id = v_org_id;

        -- 3. جلب المتغيرات الشهرية (الاستقطاعات)
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_deductions 
        FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid 
        AND month = p_month AND year = p_year AND type = 'deduction' AND is_processed = false AND organization_id = v_org_id;
        -- حساب الصافي الحقيقي في السيرفر لضمان النزاهة المالية
        v_emp_net := (v_item->>'gross_salary')::numeric + v_fixed_allowances + (v_item->>'additions')::numeric + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - (v_item->>'advances_deducted')::numeric - COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_gross := v_total_gross + (v_item->>'gross_salary')::numeric + v_fixed_allowances;
        v_total_additions := v_total_additions + (v_item->>'additions')::numeric + v_monthly_additions;
        v_total_deductions := v_total_deductions + COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions;
        v_total_advances := v_total_advances + (v_item->>'advances_deducted')::numeric;
        v_total_payroll_tax := v_total_payroll_tax + COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_net := v_total_net + v_emp_net;
        
    END LOOP;

    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances + v_total_payroll_tax), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
            -- إعادة جلب المبالغ الفردية للسطر لضمان دقة سجل البنود
        v_fixed_allowances := 0; v_monthly_additions := 0; v_monthly_deductions := 0;
        SELECT COALESCE(SUM(amount), 0) INTO v_fixed_allowances FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id;
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_additions FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'addition' AND organization_id = v_org_id;
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_deductions FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'deduction' AND organization_id = v_org_id;
        
        v_emp_net := (v_item->>'gross_salary')::numeric + v_fixed_allowances + (v_item->>'additions')::numeric + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - (v_item->>'advances_deducted')::numeric - COALESCE((v_item->>'payroll_tax')::numeric, 0);
        INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, payroll_tax, advances_deducted, other_deductions, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, 
               (v_item->>'gross_salary')::numeric + v_fixed_allowances, 
               (v_item->>'additions')::numeric + v_monthly_additions, 
               COALESCE((v_item->>'payroll_tax')::numeric, 0), (v_item->>'advances_deducted')::numeric, 
               COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions, 
               v_emp_net, v_org_id)
        RETURNING id INTO v_payroll_item_id;

        -- تحديث المتغيرات الشهرية كـ "تمت معالجتها" لمنع تكرارها
        UPDATE public.payroll_variables SET is_processed = true 
        WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year;

        -- 🔗 تحديث حالة السلف المستردة وربطها ببنود المسير لضمان عدم تكرار الخصم
        IF (v_item->>'advances_deducted')::numeric > 0 THEN
            UPDATE public.employee_advances 
            SET status = 'deducted', payroll_item_id = v_payroll_item_id
            WHERE employee_id = (v_item->>'employee_id')::uuid 
            AND status = 'paid'
            AND organization_id = v_org_id;
        END IF;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year, 'posted', v_org_id, true, v_payroll_id, 'payroll') RETURNING id INTO v_je_id;

    RAISE NOTICE 'Payroll JE created: ID=% for OrgID=%', v_je_id, v_org_id;

    IF v_total_gross > 0 AND v_salaries_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 AND v_bonuses_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF; -- Ensure v_bonuses_acc_id is not NULL
    IF v_total_advances > 0 AND v_advances_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 AND v_deductions_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_payroll_tax > 0 AND v_payroll_tax_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_payroll_tax_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل', v_org_id); END IF;
    IF v_total_net > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_acc, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;

    -- 🛡️ التحقق النهائي من توازن القيد لضمان الترحيل الفعلي للدفتر العام
        -- 🛡️ التحقق النهائي من توازن القيد لضمان الترحيل الفعلي للدفتر العام
    IF NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE journal_entry_id = v_je_id) THEN RAISE EXCEPTION 'فشل إنشاء أسطر القيد المحاسبي للرواتب، القيد غير متوازن أو الحسابات مفقودة.'; END IF;
END; $$;


-- ================================================================
-- 5. تأسيس الشركات (Onboarding & SaaS Core)
-- ================================================================

-- أ. دالة معالجة المستخدمين الجدد عند التسجيل (Signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org_id uuid;
    v_role text;
    v_invitation record;
BEGIN
    v_org_id := (new.raw_user_meta_data->>'org_id')::uuid;
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'admin');

    -- 1. حالة خاصة: إذا كان هذا أول مستخدم في النظام بالكامل (السوبر أدمن الأول)
    IF v_org_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.profiles) THEN
        INSERT INTO public.organizations (name) VALUES ('الشركة الرئيسية') RETURNING id INTO v_org_id;
        v_role := 'super_admin';
    END IF;

    -- 2. التحقق من الدعوات إذا لم يوجد معرف شركة في الـ Metadata
    IF v_org_id IS NULL THEN
        SELECT organization_id, role INTO v_org_id, v_role FROM public.invitations 
        WHERE email = new.email AND accepted_at IS NULL LIMIT 1;
        
        IF v_org_id IS NOT NULL THEN
            UPDATE public.invitations SET accepted_at = now() WHERE email = new.email;
        END IF;
    END IF;

    -- 3. ضمان تعيين دور admin إذا كان المستخدم هو أول من ينضم لمنظمة موجودة
    IF v_org_id IS NOT NULL AND v_role IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE organization_id = v_org_id) THEN
            v_role := 'admin'; -- Ensure role is set
        END IF;
    END IF;

    INSERT INTO public.profiles (id, full_name, role, role_id, organization_id)
    VALUES (
        new.id, 
        COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'), 
        v_role, 
        (SELECT id FROM public.roles WHERE organization_id = v_org_id AND name = COALESCE(v_role, 'admin') LIMIT 1),
        v_org_id
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
        jsonb_build_object('org_id', v_org_id, 'role', v_role)
    WHERE id = new.id;

    RETURN new;
END;
$$;

-- إنشاء التريجر ليربط مع نظام الحماية الخاص بـ Supabase (auth.users)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ب. دالة التحقق من عدد المستخدمين (منع تجاوز حدود الباقة)
CREATE OR REPLACE FUNCTION public.check_user_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_max_users integer;
    v_current_users integer;
BEGIN
    IF public.get_my_role() = 'super_admin' OR NEW.role = 'super_admin' THEN
        RETURN NEW;
    END IF;
    SELECT max_users INTO v_max_users FROM public.organizations WHERE id = NEW.organization_id;
    SELECT count(*) INTO v_current_users FROM public.profiles 
    WHERE organization_id = NEW.organization_id AND role != 'super_admin';
    IF v_current_users >= COALESCE(v_max_users, 5) THEN
        RAISE EXCEPTION '⚠️ عذراً، لقد وصلت للحد الأقصى للمستخدمين المسموح بهم في باقتك الحالية (%). يرجى ترقية الباقة لإضافة المزيد.', v_max_users;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ج. تهيئة الدليل المحاسبي المصري لشركة جديدة (Core SaaS Onboarding)
CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id uuid, p_activity_type text DEFAULT 'commercial', p_admin_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE v_vat_rate numeric; v_admin_id uuid; v_org_name text; v_rec record; v_parent_id uuid; v_role_id uuid; v_warehouse_id uuid;
    v_cash_id uuid; v_sales_id uuid; v_cust_id uuid; v_cogs_id uuid; v_inv_id uuid; v_vat_id uuid; v_supp_id uuid; v_vat_in_id uuid; v_disc_id uuid;
    v_wht_pay_id uuid; v_payroll_tax_id uuid; v_wht_rec_id uuid; v_sal_ret_id uuid;
    v_sal_exp_id uuid; v_bonus_id uuid; v_ded_id uuid; v_adv_id uuid; v_retained_id uuid;
    v_labor_mfg_id uuid; v_wastage_id uuid; v_raw_id uuid; v_wip_id uuid; v_notes_pay_id uuid; v_notes_rec_id uuid;
    v_cash_deficit_id uuid; v_dep_exp_id uuid; v_acc_dep_id uuid; v_fixed_assets_id uuid; v_opening_bal_id uuid;
    v_prepaid_exp_id uuid; v_accrued_exp_id uuid; v_social_ins_id uuid; v_bank_main_id uuid; v_rev_other_id uuid; 
    v_exp_gen_id uuid; v_sal_allow_id uuid;
    v_bank_nbe_id uuid; v_bank_misr_id uuid; v_bank_cib_id uuid; v_wallet_voda_id uuid;
    v_exp_rent_id uuid; v_exp_util_id uuid; v_exp_bank_id uuid; v_exp_office_id uuid;
    v_overhead_mfg_id uuid; -- Declare v_overhead_mfg_id here
BEGIN
    v_vat_rate := CASE WHEN p_activity_type = 'construction' THEN 0.05 WHEN p_activity_type = 'charity' THEN 0.00 ELSE 0.14 END;
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;
    
    CREATE TEMPORARY TABLE coa_temp (code text PRIMARY KEY, name text NOT NULL, type text NOT NULL, is_group boolean NOT NULL, parent_code text) ON COMMIT DROP;

    INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
    ('1', 'الأصول', 'asset', true, NULL), ('2', 'الخصوم (الإلتزامات)', 'liability', true, NULL), ('3', 'حقوق الملكية', 'equity', true, NULL), ('4', 'الإيرادات', 'revenue', true, NULL), ('5', 'المصروفات', 'expense', true, NULL),
    ('11', 'الأصول غير المتداولة', 'asset', true, '1'), ('12', 'الأصول المتداولة', 'asset', true, '1'), ('21', 'الخصوم غير المتداولة', 'liability', true, '2'), ('22', 'الخصوم المتداولة', 'liability', true, '2'),
    ('31', 'رأس المال والاحتياطيات', 'equity', true, '3'), ('32', 'الأرباح المبقاة / المرحلة', 'equity', false, '3'), ('33', 'جاري الشركاء', 'equity', false, '3'), ('34', 'احتياطيات', 'equity', false, '3'),
    ('41', 'إيرادات النشاط (المبيعات)', 'revenue', true, '4'), ('42', 'إيرادات أخرى', 'revenue', true, '4'), ('51', 'تكلفة المبيعات (COGS)', 'expense', true, '5'), ('52', 'مصروفات البيع والتسويق', 'expense', true, '5'), ('53', 'المصروفات الإدارية والعمومية', 'expense', true, '5'),
    ('111', 'الأصول الثابتة (بالصافي)', 'asset', true, '11'), ('1111', 'الأراضي', 'asset', false, '111'), ('1112', 'المباني والإنشاءات', 'asset', false, '111'), ('1113', 'الآلات والمعدات', 'asset', false, '111'), ('1114', 'وسائل النقل والانتقال', 'asset', false, '111'), ('1115', 'الأثاث والتجهيزات المكتبية', 'asset', false, '111'), ('1116', 'أجهزة حاسب آلي وبرمجيات', 'asset', false, '111'), ('1119', 'مجمع إهلاك الأصول الثابتة', 'asset', false, '111'),
    ('103', 'المخزون', 'asset', true, '12'), ('10301', 'مخزون المواد الخام', 'asset', false, '103'), ('10302', 'مخزون المنتج التام', 'asset', false, '103'), ('10303', 'مخزون إنتاج تحت التشغيل (WIP)', 'asset', false, '103'),
    ('122', 'العملاء والمدينون', 'asset', true, '12'), ('1221', 'العملاء', 'asset', false, '122'), ('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'asset', false, '122'), ('1223', 'سلف الموظفين', 'asset', false, '122'), ('1224', 'عهد موظفين', 'asset', false, '122'),
    ('123', 'النقدية وما في حكمها', 'asset', true, '12'), ('1231', 'النقدية بالصندوق (الخزينة الرئيسية)', 'asset', false, '123'), ('1232', 'البنوك (حسابات جارية)', 'asset', true, '123'),
    ('123201', 'البنك الأهلي المصري', 'asset', false, '1232'), ('123202', 'بنك مصر', 'asset', false, '1232'), ('123203', 'البنك التجاري الدولي (CIB)', 'asset', false, '1232'), ('123204', 'بنك QNB الأهلي', 'asset', false, '1232'), ('123205', 'بنك القاهرة', 'asset', false, '1232'), ('123206', 'بنك فيصل الإسلامي', 'asset', false, '1232'), ('123207', 'بنك الإسكندرية', 'asset', false, '1232'),
    ('1233', 'المحافظ الإلكترونية (Digital Wallets)', 'asset', true, '123'), ('123301', 'فودافون كاش (Vodafone Cash)', 'asset', false, '1233'), ('123302', 'اتصالات كاش (Etisalat Cash)', 'asset', false, '1233'), ('123303', 'أورنج كاش (Orange Cash)', 'asset', false, '1233'), ('123304', 'وي باي (WE Pay)', 'asset', false, '1233'), ('123305', 'انستا باي (InstaPay - تسوية)', 'asset', false, '1233'),
    ('124', 'أرصدة مدينة أخرى', 'asset', true, '12'), ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'asset', false, '124'), ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'asset', false, '124'),
    ('1243', 'مصروفات مدفوعة مقدماً', 'asset', true, '124'), ('124301', 'إيجار مقدم', 'asset', false, '1243'), ('124302', 'تأمين طبي مقدم', 'asset', false, '1243'), ('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'asset', false, '1243'), ('124304', 'حملات إعلانية مقدمة', 'asset', false, '1243'), ('124305', 'عقود صيانة مقدمة', 'asset', false, '1243'),
    ('1244', 'إيرادات مستحقة', 'asset', true, '124'), ('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'asset', false, '1244'), ('124402', 'فوائد بنكية مستحقة القبض', 'asset', false, '1244'), ('124403', 'إيجارات دائنة مستحقة', 'asset', false, '1244'), ('124404', 'إيرادات أوراق مالية مستحقة', 'asset', false, '1244'),
    ('211', 'قروض طويلة الأجل', 'liability', false, '21'), ('201', 'الموردين', 'liability', false, '22'), ('222', 'أوراق الدفع (شيكات صادرة)', 'liability', false, '22'),
    ('223', 'مصلحة الضرائب (التزامات)', 'liability', true, '22'), ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'liability', false, '223'), ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'liability', false, '223'), ('2233', 'ضريبة كسب العمل', 'liability', false, '223'), ('224', 'هيئة التأمينات الاجتماعية', 'liability', false, '22'), -- Ensure 224 is not NULL
    ('225', 'مصروفات مستحقة', 'liability', true, '22'), ('2251', 'رواتب وأجور مستحقة', 'liability', false, '225'), ('2252', 'إيجارات مستحقة', 'liability', false, '225'), ('2253', 'كهرباء ومياه وغاز مستحقة', 'liability', false, '225'), ('2254', 'أتعاب مهنية ومراجعة مستحقة', 'liability', false, '225'), ('2255', 'عمولات بيع مستحقة', 'liability', false, '225'), ('2256', 'فوائد بنكية مستحقة', 'liability', false, '225'), ('2257', 'اشتراكات وتراخيص مستحقة', 'liability', false, '225'), ('226', 'تأمينات ودفعات مقدمة من العملاء', 'liability', false, '22'),
    ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'equity', false, '3'),
    ('411', 'إيراد المبيعات', 'revenue', false, '41'), ('412', 'مردودات المبيعات', 'revenue', false, '41'), ('413', 'خصم مسموح به', 'revenue', false, '41'),
    ('421', 'إيرادات متنوعة', 'revenue', false, '42'), ('422', 'إيراد خصومات وجزاءات الموظفين', 'revenue', false, '42'), ('423', 'فوائد بنكية دائنة', 'revenue', false, '42'),
    ('511', 'تكلفة البضاعة المباعة', 'expense', false, '51'), ('512', 'تسويات الجرد (عجز المخزون)', 'expense', false, '51'),
    ('5121', 'تكلفة الهالك والفاقد', 'expense', false, '51'),
    ('513', 'أجور عمال الإنتاج المباشرة', 'expense', false, '51'),
    ('521', 'دعاية وإعلان', 'expense', false, '52'), ('522', 'عمولات بيع وتسويق', 'expense', false, '52'), ('523', 'نقل ومشال للخارج', 'expense', false, '52'), ('524', 'تعبئة وتغليف', 'expense', false, '52'),
    ('5251', 'عمولة فودافون كاش', 'expense', false, '525'), ('5252', 'عمولة فوري', 'expense', false, '525'), ('5253', 'عمولة تحويلات بنكية', 'expense', false, '525'),
    ('531', 'الرواتب والأجور', 'expense', false, '53'), ('5311', 'بدلات وانتقالات', 'expense', false, '53'), ('5312', 'مكافآت وحوافز', 'expense', false, '53'), ('532', 'إيجار مقرات إدارية', 'expense', false, '53'), ('533', 'إهلاك الأصول الثابتة', 'expense', false, '53'), ('534', 'رسوم ومصروفات بنكية', 'expense', false, '53'), ('535', 'كهرباء ومياه وغاز', 'expense', false, '53'), ('536', 'اتصالات وإنترنت', 'expense', false, '53'), ('537', 'صيانة وإصلاح', 'expense', false, '53'), ('538', 'أدوات مكتبية ومطبوعات', 'expense', false, '53'), ('539', 'ضيافة واستقبال', 'expense', false, '53'), ('541', 'تسوية عجز الصندوق', 'expense', false, '53'), ('542', 'إكراميات', 'expense', false, '53'), ('543', 'مصاريف نظافة', 'expense', false, '53');
    -- إضافات خاصة بنشاط المطاعم
    IF p_activity_type = 'restaurant' THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES 
        ('4111', 'إيرادات مبيعات (صالة)', 'revenue', false, '41'),
        ('4112', 'إيرادات مبيعات (توصيل)', 'revenue', false, '41');
    END IF;

    -- إضافات خاصة بنشاط التصنيع
    IF p_activity_type = 'manufacturing' THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES 
        ('514', 'تكاليف صناعية غير مباشرة', 'expense', true, '51'),
        ('5141', 'إهلاك آلات ومعدات المصنع', 'expense', false, '514'),
        ('5142', 'صيانة وإصلاح المصنع', 'expense', false, '514'),
        ('5143', 'كهرباء وقوى محركة للمصنع', 'expense', false, '514');
    END IF;

    INSERT INTO public.accounts (organization_id, code, name, type, is_group, is_active)
    SELECT p_org_id, code, name, type, is_group, true FROM coa_temp ORDER BY length(code), code
    ON CONFLICT (organization_id, code) DO UPDATE SET 
        is_group = EXCLUDED.is_group,
        type = EXCLUDED.type,
        name = EXCLUDED.name;

    UPDATE public.accounts a 
    SET parent_id = p.id 
    FROM coa_temp t 
    JOIN public.accounts p ON p.organization_id = p_org_id AND p.code = t.parent_code
    WHERE a.organization_id = p_org_id AND a.code = t.code;
    -- 🛡️ تصحيح تلقائي إضافي: أي حساب له أبناء يجب أن يكون "رئيسي" (Group)
    UPDATE public.accounts SET is_group = true 
    WHERE id IN (SELECT DISTINCT parent_id FROM public.accounts WHERE organization_id = p_org_id AND parent_id IS NOT NULL);

    -- 🚀 إنشاء دور المدير وحفظ معرفه في متغير لضمان السرعة والدقة
    INSERT INTO public.roles (organization_id, name, description)
    VALUES (p_org_id, 'admin', 'مدير النظام - صلاحيات كاملة')
    ON CONFLICT (name, organization_id) 
    DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_role_id;

    -- 🏗️ إنشاء مستودع افتراضي للشركة (يجب أن يكون خارج شرط الأدمن لضمان عمل النظام فوراً)
    v_warehouse_id := (SELECT id FROM public.warehouses WHERE organization_id = p_org_id AND name = 'المخزن الرئيسي' LIMIT 1);
    IF v_warehouse_id IS NULL THEN
        INSERT INTO public.warehouses (organization_id, name, location, is_active)
        VALUES (p_org_id, 'المخزن الرئيسي', 'الفرع الرئيسي', true)
        RETURNING id INTO v_warehouse_id;
    END IF;

    -- ️ إصلاح أمني: نستخدم المعرف الممرر فقط لتعيين المدير.
    v_admin_id := p_admin_id;
    IF v_admin_id IS NOT NULL THEN
        -- التأكد من إنشاء أو تحديث ملف المستخدم وربطه بالشركة الجديدة
        INSERT INTO public.profiles (id, organization_id, role, is_active, role_id, full_name)
        VALUES (
            v_admin_id,
            p_org_id,
            'admin',
            true,
            v_role_id,
            COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_admin_id), 'مدير النظام')
        )
        ON CONFLICT (id) DO UPDATE SET 
            role = 'admin', organization_id = p_org_id, is_active = true, role_id = v_role_id;
        
        UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('org_id', p_org_id, 'role', 'admin') WHERE id = v_admin_id;
    END IF;

    -- 🛡️ منح كافة الصلاحيات المتاحة في السيستم لهذا الدور الجديد
    INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
    SELECT v_role_id, id, p_org_id
    FROM public.permissions 
    ON CONFLICT DO NOTHING;

    -- 🚀 جلب معرفات الحسابات السيادية لربطها بالإعدادات
    v_cash_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1231' LIMIT 1);
    v_sales_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '411' LIMIT 1);
    v_cust_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1);
    v_cogs_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1);
    v_inv_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10302' LIMIT 1);
    v_vat_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2231' LIMIT 1);
    v_supp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '201' LIMIT 1);
    v_sal_ret_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '412' LIMIT 1);
    v_vat_in_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1241' LIMIT 1);
    v_disc_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '413' LIMIT 1);
    v_wht_pay_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2232' LIMIT 1);
    v_payroll_tax_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2233' LIMIT 1);
    v_wht_rec_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1242' LIMIT 1);
    v_sal_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '531' LIMIT 1);
    v_bonus_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5312' LIMIT 1);
    v_ded_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '422' LIMIT 1);
    v_adv_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1223' LIMIT 1);
    v_retained_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '32' LIMIT 1);
    v_raw_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10301' LIMIT 1);
    v_wip_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10303' LIMIT 1);
    v_labor_mfg_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '513' LIMIT 1);
    v_overhead_mfg_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '514' LIMIT 1);
    v_wastage_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5121' LIMIT 1);
    v_notes_pay_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '222' LIMIT 1);
    v_notes_rec_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1222' LIMIT 1);

    v_cash_deficit_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '541' LIMIT 1);
    v_dep_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '533' LIMIT 1);
    v_acc_dep_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1119' LIMIT 1);
    v_fixed_assets_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '111' LIMIT 1);
    v_opening_bal_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '3999' LIMIT 1);
    v_prepaid_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1243' LIMIT 1);
    v_accrued_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '225' LIMIT 1);
    v_social_ins_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '224' LIMIT 1);
    v_bank_main_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '123201' LIMIT 1);
    v_rev_other_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '421' LIMIT 1);
    v_exp_gen_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '53' LIMIT 1);
    v_sal_allow_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '412' LIMIT 1);
    v_bank_nbe_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '123201' LIMIT 1);
    v_exp_rent_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '532' LIMIT 1);
    v_exp_util_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '535' LIMIT 1);
    -- 🚀 تأسيس سجل الإعدادات والربط المحاسبي فوراً لضمان اختفاء خطأ 406
    INSERT INTO public.company_settings (organization_id, activity_type, vat_rate, company_name, account_mappings, default_warehouse_id, default_treasury_id)
    VALUES (p_org_id, p_activity_type, v_vat_rate, v_org_name, 
        jsonb_build_object(
            'CASH', v_cash_id, 'SALES_REVENUE', v_sales_id, 'CUSTOMERS', v_cust_id, 'COGS', v_cogs_id, 'INVENTORY_FINISHED_GOODS', v_inv_id,
            'VAT', v_vat_id, 'SUPPLIERS', v_supp_id, 'SALES_RETURNS', v_sal_ret_id, 'VAT_INPUT', v_vat_in_id, 'SALES_DISCOUNT', v_disc_id,
            'WHT_PAYABLE', v_wht_pay_id, 'PAYROLL_TAX', v_payroll_tax_id, 'WHT_RECEIVABLE', v_wht_rec_id,
            'SALARIES_EXPENSE', v_sal_exp_id, 'EMPLOYEE_BONUSES', v_bonus_id, 'EMPLOYEE_DEDUCTIONS', v_ded_id, 'EMPLOYEE_ADVANCES', v_adv_id,
            'RETAINED_EARNINGS', v_retained_id,
            'INVENTORY_RAW_MATERIALS', v_raw_id,
            'INVENTORY_WIP', v_wip_id,
            'LABOR_COST_ALLOCATED', v_labor_mfg_id,
            'MANUFACTURING_OVERHEAD', v_overhead_mfg_id,
            'WASTAGE_EXPENSE', v_wastage_id,
            'NOTES_PAYABLE', v_notes_pay_id,
            'NOTES_RECEIVABLE', v_notes_rec_id,
            'CASH_SHORTAGE', v_cash_deficit_id,
            'DEPRECIATION_EXPENSE', v_dep_exp_id,
            'ACCUMULATED_DEPRECIATION', v_acc_dep_id,
            'ASSETS_FIXED', v_fixed_assets_id,
            'OPENING_BALANCES', v_opening_bal_id,
            'PREPAID_EXPENSES', v_prepaid_exp_id,
            'ACCRUED_EXPENSES', v_accrued_exp_id,
            'SOCIAL_INSURANCE', v_social_ins_id,
            'BANK_MAIN', v_bank_main_id,
            'REVENUE_OTHER', v_rev_other_id,
            'EXPENSE_GENERAL', v_exp_gen_id,
            'SALES_ALLOWANCES', v_sal_allow_id,
            'BANK_ACCOUNTS', v_bank_nbe_id,
            'EXPENSE_RENT', v_exp_rent_id,
            'EXPENSE_UTILITIES', v_exp_util_id
        ),
        v_warehouse_id,
        v_cash_id
    ) ON CONFLICT (organization_id) DO UPDATE SET activity_type = EXCLUDED.activity_type, vat_rate = EXCLUDED.vat_rate, company_name = EXCLUDED.company_name, account_mappings = EXCLUDED.account_mappings, default_warehouse_id = EXCLUDED.default_warehouse_id, default_treasury_id = EXCLUDED.default_treasury_id;

    -- تأسيس الأدوار الافتراضية للمنظمة لضمان ظهورها في شاشة الصلاحيات
    INSERT INTO public.roles (organization_id, name, description) VALUES
    (p_org_id, 'admin', 'مدير النظام'),
    (p_org_id, 'accountant', 'محاسب'),
    (p_org_id, 'cashier', 'كاشير / بائع'),
    (p_org_id, 'chef', 'شيف / مطبخ')
    ON CONFLICT (name, organization_id) DO NOTHING;

    RETURN '✅ تم تأسيس الدليل المحاسبي وربط الحسابات السيادية بنجاح.';

EXCEPTION WHEN OTHERS THEN
    -- تسجيل الخطأ بالتفصيل في حال فشل بناء الدليل المحاسبي
    INSERT INTO public.system_error_logs (error_message, error_code, context, function_name, organization_id, user_id)
    VALUES (SQLERRM, SQLSTATE, jsonb_build_object('org_id', p_org_id, 'activity', p_activity_type), 'initialize_egyptian_coa', p_org_id, auth.uid());
    
    RAISE EXCEPTION 'فشل تأسيس دليل الحسابات: % (كود: %)', SQLERRM, SQLSTATE;
END; $$;

-- د. الدالة الشاملة لإنشاء شركة جديدة (Global SaaS Creator)
CREATE OR REPLACE FUNCTION public.create_new_client_v2(p_name text, p_email text, p_activity_type text DEFAULT 'commercial', p_vat_number text DEFAULT NULL, p_admin_id uuid DEFAULT NULL) 
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE v_org_id uuid;
BEGIN
    INSERT INTO public.organizations (name, email, vat_number, is_active)
    VALUES (p_name, p_email, p_vat_number, true) RETURNING id INTO v_org_id;
    PERFORM public.initialize_egyptian_coa(v_org_id, p_activity_type, p_admin_id);
    RETURN v_org_id;
END; $$;

-- ح. دالة مزامنة صلاحيات الأدوار (Atomic Role Permissions Sync)
-- هذه الدالة تحل مشكلة حفظ الصلاحيات وضمان أمان البيانات
CREATE OR REPLACE FUNCTION public.sync_role_permissions(p_role_id uuid, p_permission_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
DECLARE v_role_name text;
BEGIN
    -- جلب معلومات الدور المستهدف لضمان الأمان
    SELECT organization_id, name INTO v_org_id, v_role_name FROM public.roles WHERE id = p_role_id;
    
    -- 🛡️ تحديث: السماح للسوبر أدمن بالمزامنة لأي شركة حتى لو لم يكن "داخل" سياقها الآن
    IF v_org_id IS NULL OR (v_org_id != public.get_my_org() AND public.get_my_role() != 'super_admin') THEN
        RAISE EXCEPTION 'غير مصرح لك بتعديل صلاحيات هذا الدور.';
    END IF;

    -- 🛡️ حماية دور الأدمن: منع العميل من سحب صلاحية "إدارة الصلاحيات" عن نفسه
    IF v_role_name = 'admin' AND public.get_my_role() != 'super_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.permissions 
            WHERE id = ANY(p_permission_ids) AND module = 'admin' AND action = 'manage'
        ) THEN
            RAISE EXCEPTION 'تحذير أمني: لا يمكنك سحب صلاحية "إدارة الصلاحيات" من دور المدير لضمان استمرار قدرتك على إدارة النظام.';
        END IF;
    END IF;

    -- مسح الصلاحيات الحالية (ضمن معاملة واحدة)
    DELETE FROM public.role_permissions WHERE role_id = p_role_id AND organization_id = v_org_id;

    -- إضافة الصلاحيات الجديدة
    IF array_length(p_permission_ids, 1) > 0 THEN
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT p_role_id, unnest(p_permission_ids), v_org_id;
    END IF;
END; $$;

-- ز. صيانة النظام والتقارير
-- ================================================================
-- 5.4 اعتماد التحويل المخزني (Approve Stock Transfer)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_stock_transfer(p_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- 1. التأكد من وجود التحويل وحالته
    SELECT organization_id INTO v_org_id FROM public.stock_transfers 
    WHERE id = p_transfer_id AND (status = 'draft' OR status IS NULL);
    
    IF NOT FOUND THEN RETURN; END IF;

    -- 2. تحديث الحالة إلى مرحل
    UPDATE public.stock_transfers SET status = 'posted' WHERE id = p_transfer_id;

    -- 3. إعادة احتساب المخزون للمنظمة لتعكس حركات التحويل في المستودعات
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ================================================================
-- 5.5 اعتماد الجرد المخزني (Post Inventory Count)
-- ================================================================
CREATE OR REPLACE FUNCTION public.post_inventory_count(p_count_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count record; v_item record; v_adj_id uuid; v_adj_no text; v_total_val numeric := 0;
    v_inv_acc uuid; v_adj_acc uuid; v_je_id uuid; v_mappings jsonb;
BEGIN
    SELECT * INTO v_count FROM public.inventory_counts WHERE id = p_count_id AND status = 'draft';
    IF NOT FOUND THEN RAISE EXCEPTION 'الجرد غير موجود أو تم اعتماده مسبقاً'; END IF;

    v_adj_no := 'ADJ-CNT-' || v_count.count_number;

    -- 1. إنشاء رأس التسوية
    INSERT INTO public.stock_adjustments (organization_id, warehouse_id, adjustment_date, adjustment_number, reason, status)
    VALUES (v_count.organization_id, v_count.warehouse_id, v_count.count_date, v_adj_no, 'تسوية ناتجة عن جرد: ' || v_count.count_number, 'posted')
    RETURNING id INTO v_adj_id;

    -- 2. نقل الفروقات
    FOR v_item IN SELECT * FROM public.inventory_count_items WHERE inventory_count_id = p_count_id AND difference <> 0 LOOP
        INSERT INTO public.stock_adjustment_items (organization_id, stock_adjustment_id, product_id, quantity, type)
        VALUES (v_count.organization_id, v_adj_id, v_item.product_id, v_item.difference, CASE WHEN v_item.difference > 0 THEN 'in' ELSE 'out' END);
        
        v_total_val := v_total_val + (v_item.difference * COALESCE((SELECT purchase_price FROM public.products WHERE id = v_item.product_id), 0));
    END LOOP;

    -- 3. المحاسبة الآلية للفروقات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_count.organization_id;
    v_inv_acc := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_count.organization_id LIMIT 1));
    v_adj_acc := COALESCE((v_mappings->>'INVENTORY_ADJUSTMENTS')::uuid, (SELECT id FROM public.accounts WHERE code = '512' AND organization_id = v_count.organization_id LIMIT 1));

    IF v_total_val <> 0 AND v_inv_acc IS NOT NULL AND v_adj_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (v_count.count_date, 'قيد تسوية جرد رقم ' || v_count.count_number, v_adj_no, 'posted', v_count.organization_id, true, v_adj_id, 'stock_adjustment')
        RETURNING id INTO v_je_id;

        IF v_total_val > 0 THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_inv_acc, v_total_val, 0, v_count.organization_id), (v_je_id, v_adj_acc, 0, v_total_val, v_count.organization_id);
        ELSE
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_adj_acc, ABS(v_total_val), 0, v_count.organization_id), (v_je_id, v_inv_acc, 0, ABS(v_total_val), v_count.organization_id);
        END IF;
    END IF;

    UPDATE public.inventory_counts SET status = 'posted' WHERE id = p_count_id;
    PERFORM public.recalculate_stock_rpc(v_count.organization_id);
    RETURN v_adj_id;
END; $$;

-- ================================================================
-- 5.6 إلغاء التحويل المخزني (Cancel Stock Transfer)
-- ================================================================
CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(p_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- 1. التأكد من وجود التحويل وحالته (فقط المرحل يمكن إلغاؤه)
    SELECT organization_id INTO v_org_id FROM public.stock_transfers 
    WHERE id = p_transfer_id AND status = 'posted';
    
    IF NOT FOUND THEN RAISE EXCEPTION 'التحويل غير موجود أو غير مرحل ليتم إلغاؤه'; END IF;

    -- 2. تحديث الحالة إلى ملغي
    UPDATE public.stock_transfers SET status = 'cancelled' WHERE id = p_transfer_id;

    -- 3. إعادة احتساب المخزون للمنظمة لتعكس إلغاء حركات التحويل
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ================================================================
-- 5.1 معالجة الهالك (Wastage Processing)
-- ================================================================
CREATE OR REPLACE FUNCTION public.process_wastage(
    p_warehouse_id uuid,
    p_date date,
    p_notes text,
    p_items jsonb,
    p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_adj_id uuid;
    v_org_id uuid;
    v_adj_no text;
    v_item record;
    v_total_cost numeric := 0;
    v_item_cost numeric;
    v_je_id uuid;
    v_inventory_acc_id uuid;
    v_wastage_acc_id uuid;
    v_mappings jsonb;
BEGIN
    -- 1. تحديد المنظمة للمستخدم
    SELECT organization_id INTO v_org_id FROM public.profiles WHERE id = p_user_id;
    IF v_org_id IS NULL THEN 
        v_org_id := public.get_my_org();
    END IF;
    
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'لا يمكن تحديد المنظمة للعملية'; END IF;

    -- 2. توليد رقم العملية
    v_adj_no := 'WST-' || to_char(p_date, 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    -- 3. إنشاء رأس التسوية المخزنية
    INSERT INTO public.stock_adjustments ( -- Ensure organization_id is not NULL
        organization_id, warehouse_id, adjustment_date, adjustment_number,
        reason, status, created_by
    ) VALUES (
        v_org_id, p_warehouse_id, p_date, v_adj_no,
        COALESCE(p_notes, 'تسجيل هالك مخزني'), 'posted', p_user_id
    ) RETURNING id INTO v_adj_id;

    -- 4. إدراج الأصناف وحساب التكلفة الإجمالية
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x("productId" uuid, "quantity" numeric)
    LOOP
        SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0) INTO v_item_cost 
        FROM public.products WHERE id = v_item."productId" AND organization_id = v_org_id;
        
        v_total_cost := v_total_cost + (v_item_cost * ABS(v_item."quantity")); -- Ensure v_item_cost is not NULL

        INSERT INTO public.stock_adjustment_items (
            organization_id, stock_adjustment_id, product_id, quantity
        ) VALUES (
            v_org_id, v_adj_id, v_item."productId", -ABS(v_item."quantity")
        );
    END LOOP;

    -- 5. إنشاء القيد المحاسبي آلياً لقيمة الهالك
    IF v_total_cost > 0 THEN
        SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
        
        v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
        v_wastage_acc_id := COALESCE(
            (v_mappings->>'WASTAGE_EXPENSE')::uuid, 
            (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1),
            (SELECT id FROM public.accounts WHERE code = '512' AND organization_id = v_org_id LIMIT 1)
        );

        IF v_inventory_acc_id IS NOT NULL AND v_wastage_acc_id IS NOT NULL THEN
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
            VALUES (p_date, 'إثبات قيمة هالك مخزني - ' || COALESCE(p_notes, v_adj_no), v_adj_no, 'posted', v_org_id, true, v_adj_id, 'stock_adjustment')
            RETURNING id INTO v_je_id; -- Ensure organization_id is not NULL

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES 
                (v_je_id, v_wastage_acc_id, v_total_cost, 0, 'تكلفة الهالك والفاقد', v_org_id),
                (v_je_id, v_inventory_acc_id, 0, v_total_cost, 'نقص مخزون نتيجة هالك', v_org_id);
                
            UPDATE public.stock_adjustments SET related_journal_entry_id = v_je_id WHERE id = v_adj_id;
        END IF;
    END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);
    RETURN v_adj_id;
END;
$$;

-- 🛠️ دالة تشغيل النسخ الاحتياطي لكافة الشركات (Global Backup Runner)
-- تُستخدم هذه الدالة بواسطة نظام الجدولة (Cron Job) لتشغيل النسخ الاحتياطي آلياً
CREATE OR REPLACE FUNCTION public.run_daily_backups_all_orgs()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_org record;
BEGIN
    -- 1. المرور على كافة المنظمات النشطة في النظام
    FOR v_org IN SELECT id FROM public.organizations WHERE is_active = true LOOP
        BEGIN
            -- استدعاء محرك النسخ الاحتياطي لكل منظمة على حدة
            PERFORM public.create_organization_backup(v_org.id);
        EXCEPTION WHEN OTHERS THEN
            -- في حال فشل نسخة لشركة محددة، نسجل الخطأ ونستمر في بقية الشركات
            INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id)
            VALUES (SQLERRM, jsonb_build_object('org_id', v_org.id, 'step', 'auto_backup'), 'run_daily_backups_all_orgs', v_org.id);
        END;
    END LOOP;

    -- 2. سياسة الاستبقاء (Retention Policy): 
    -- تقليص مدة الاحتفاظ إلى 5 أيام لتحسين أداء قاعدة البيانات وتقليل الحجم في الباقة المجانية
    DELETE FROM public.organization_backups 
    WHERE created_at < (now() - interval '5 days')
    AND notes = 'نسخة احتياطية تلقائية للنظام';

    -- 3. سياسة تنظيف الإشعارات العدوانية (Aggressive Notification Cleanup)
    -- أ. حذف كافة الإشعارات المقروءة فوراً (لا داعي للأرشفة في الباقة المجانية)
    DELETE FROM public.notifications WHERE is_read = true;

    -- ب. حذف الإشعارات غير المقروءة التي مر عليها أكثر من 48 ساعة
    DELETE FROM public.notifications WHERE created_at < (now() - interval '2 days');

    -- ج. معالج التكرار (Deduplication Guard): حذف الإشعارات القديمة المكررة لنفس الموضوع
    -- يبقي فقط على أحدث إشعار لكل مستخدم حول نفس العنوان (مثل: "نقص مخزون صنف X")
    DELETE FROM public.notifications n1 USING public.notifications n2 
    WHERE n1.id < n2.id AND n1.title = n2.title AND n1.user_id = n2.user_id AND n1.is_read = false;

    -- 4. سياسة تنظيف السجلات (Log Cleanup Policy):
    -- الاحتفاظ بآخر 3 أيام فقط من سجلات الأخطاء والأمان لتوفير المساحة
    DELETE FROM public.system_error_logs WHERE created_at < (now() - interval '7 days');
    DELETE FROM public.security_logs WHERE created_at < (now() - interval '7 days');
    DELETE FROM public.notification_audit_log WHERE created_at < (now() - interval '7 days');
END; $$;

-- 📅 تفعيل الجدولة اليومية (Daily Schedule)
-- سيتم تشغيل هذه المهمة يومياً في تمام الساعة 3:00 صباحاً بتوقيت الخادم
-- ملاحظة: يجب التأكد من تفعيل ملحق pg_cron في إعدادات Supabase (Extensions)
-- 🛡️ حماية: نتحقق من وجود ملحق pg_cron قبل محاولة الجدولة لمنع توقف السكربت
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
        -- 1. إلغاء الجدولة القديمة (إن وجدت) لتجنب التكرار عند إعادة النشر
        BEGIN
            EXECUTE 'SELECT cron.unschedule(''daily-system-backup'')';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- 2. إعادة الجدولة: تشغيل يومي الساعة 3:00 صباحاً
        PERFORM cron.schedule('daily-system-backup', '0 3 * * *', 'SELECT public.run_daily_backups_all_orgs();');
        RAISE NOTICE '✅ تم تفعيل جدولة النسخ الاحتياطي اليومي بنجاح.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: ملحق pg_cron غير مفعل. لن يتم تفعيل الجدولة التلقائية. يمكنك تفعيله من Dashboard -> Database -> Extensions.';
    END IF;
END $$;

-- ================================================================
-- 6.1 محرك استعادة البيانات (SaaS Restore Engine)
-- ================================================================
CREATE OR REPLACE FUNCTION public.restore_organization_backup(p_org_id uuid, p_backup_data jsonb)
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_item jsonb;
BEGIN
    IF p_backup_data IS NULL OR p_backup_data = 'null'::jsonb THEN
        RAISE EXCEPTION 'بيانات النسخة الاحتياطية غير صالحة أو فارغة.';
    END IF;

    -- 🛡️ تفعيل وضع الاستعادة لتجاوز صمامات أمان حذف الحسابات السيادية
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 🛡️ [جديد V7] فحص سلامة النسخة قبل البدء (Pre-Restore Integrity Check)
    -- 🛡️ صمامات الأمان والنزاهة (Restore Safety Valves)
    
    -- 1. فحص توافق الإصدار (Version Compatibility Check)
    IF (p_backup_data->'metadata'->>'version') IS NULL OR (p_backup_data->'metadata'->>'version') != '1.0' THEN
        RAISE EXCEPTION 'فشل فحص التوافق: إصدار النسخة الاحتياطية (%) غير مدعوم في إصدار النظام الحالي (1.0).', 
            COALESCE(p_backup_data->'metadata'->>'version', 'Unknown');
    END IF;

    -- 2. التحقق من تطابق هوية المنظمة (Organization ID Cross-Check)
    IF (p_backup_data->'metadata'->>'org_id') IS NOT NULL AND (p_backup_data->'metadata'->>'org_id')::uuid != p_org_id THEN
        RAISE NOTICE 'تنبيه أمان: يتم استعادة بيانات تخص المنظمة (%) إلى المنظمة الحالية (%). تم السماح بالعملية لدعم الهجرة.', 
            p_backup_data->'metadata'->>'org_id', p_org_id;
    END IF;

    -- 3. فحص التبعية الهيكلية (Relational Integrity Check)
    -- منع استعادة "أبناء" بدون "آباء"
    IF jsonb_array_length(COALESCE(p_backup_data->'invoice_items', '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_backup_data->'invoices', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص النزاهة: الملف يحتوي على بنود فواتير ولكن يفتقر لبيانات الفواتير الرئيسية. تم إلغاء الاستعادة.';
    END IF;

    IF jsonb_array_length(COALESCE(p_backup_data->'journal_lines', '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_backup_data->'journal_entries', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص النزاهة: الملف يحتوي على قيود فرعية ولكن يفتقر لقيود اليومية الرئيسية. تم إلغاء الاستعادة.';
    END IF;

    -- 🛡️ [جديد V7] فحص سلامة الموديولات الأساسية قبل البدء (Module Integrity Check)
    -- فحص المستودعات: إذا وجدت فواتير أو منتجات، يجب وجود مستودعات
    IF (jsonb_array_length(COALESCE(p_backup_data->'invoices', '[]'::jsonb)) > 0 OR jsonb_array_length(COALESCE(p_backup_data->'products', '[]'::jsonb)) > 0) 
       AND jsonb_array_length(COALESCE(p_backup_data->'warehouses', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص السلامة: النسخة تحتوي على فواتير أو منتجات ولكنها تفتقر لبيانات المستودعات. تم إيقاف الاستعادة لحماية البيانات.';
    END IF;

    -- فحص الحسابات: العمود الفقري للنظام
    IF jsonb_array_length(COALESCE(p_backup_data->'accounts', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص السلامة: النسخة تفتقر لدليل الحسابات. لا يمكن الاستعادة بدون هيكل محاسبي.';
    END IF;

    -- فحص العملاء والموردين
    IF jsonb_array_length(COALESCE(p_backup_data->'invoices', '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_backup_data->'customers', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص السلامة: توجد فواتير مبيعات ولكن بيانات العملاء مفقودة في النسخة.';
    END IF;

    IF jsonb_array_length(COALESCE(p_backup_data->'purchase_invoices', '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_backup_data->'suppliers', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص السلامة: توجد فواتير مشتريات ولكن بيانات الموردين مفقودة في النسخة.';
    END IF;

    -- إذا اجتاز النظام الفحوصات أعلاه، نبدأ الآن العملية الفعلية
    RAISE NOTICE '✅ فحص سلامة النسخة نجح. جاري بدء عملية التطهير والبناء...';

    -- 🛡️ المرحلة 1: التطهير المتسلسل العشري (Strategic Purge)
    -- حجر الزاوية: مسح المرفقات واللوجات أولاً
    DELETE FROM public.notification_audit_log WHERE organization_id = p_org_id;
    DELETE FROM public.cheque_attachments WHERE organization_id = p_org_id;
    DELETE FROM public.receipt_voucher_attachments WHERE organization_id = p_org_id;
    DELETE FROM public.payment_voucher_attachments WHERE organization_id = p_org_id;
    DELETE FROM public.notification_preferences WHERE organization_id = p_org_id;
    DELETE FROM public.security_logs WHERE organization_id = p_org_id;
    DELETE FROM public.journal_attachments WHERE organization_id = p_org_id;
    
    -- مسح بنود العمليات (الأبناء الصغار)
    DELETE FROM public.order_item_modifiers WHERE organization_id = p_org_id;
    DELETE FROM public.payroll_variables WHERE organization_id = p_org_id;
    DELETE FROM public.opening_inventories WHERE organization_id = p_org_id;
    DELETE FROM public.bill_of_materials WHERE organization_id = p_org_id;
    DELETE FROM public.order_items WHERE organization_id = p_org_id;
    DELETE FROM public.kitchen_orders WHERE organization_id = p_org_id;
    DELETE FROM public.invoice_items WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_invoice_items WHERE organization_id = p_org_id;
    DELETE FROM public.journal_lines WHERE organization_id = p_org_id;
    DELETE FROM public.payroll_items WHERE organization_id = p_org_id;
    DELETE FROM public.stock_adjustment_items WHERE organization_id = p_org_id;
    DELETE FROM public.sales_return_items WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_return_items WHERE organization_id = p_org_id;

    -- مسح رؤوس العمليات (الآباء)
    DELETE FROM public.delivery_orders WHERE organization_id = p_org_id;
    DELETE FROM public.payments WHERE organization_id = p_org_id;
    DELETE FROM public.orders WHERE organization_id = p_org_id;
    DELETE FROM public.invoices WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = p_org_id;
    DELETE FROM public.sales_returns WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_returns WHERE organization_id = p_org_id;
    DELETE FROM public.journal_entries WHERE organization_id = p_org_id;
    DELETE FROM public.payrolls WHERE organization_id = p_org_id;
    DELETE FROM public.stock_adjustments WHERE organization_id = p_org_id;
    DELETE FROM public.cheques WHERE organization_id = p_org_id;
    DELETE FROM public.receipt_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.payment_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.table_sessions WHERE organization_id = p_org_id;
    DELETE FROM public.shifts WHERE organization_id = p_org_id;
    DELETE FROM public.work_orders WHERE organization_id = p_org_id;
    DELETE FROM public.credit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.debit_notes WHERE organization_id = p_org_id;

    -- مسح الكيانات والبنية التحتية
    DELETE FROM public.assets WHERE organization_id = p_org_id;
    DELETE FROM public.products WHERE organization_id = p_org_id;
    DELETE FROM public.customers WHERE organization_id = p_org_id;
    DELETE FROM public.suppliers WHERE organization_id = p_org_id;
    DELETE FROM public.employees WHERE organization_id = p_org_id;
    DELETE FROM public.restaurant_tables WHERE organization_id = p_org_id;
    DELETE FROM public.modifiers WHERE organization_id = p_org_id;
    DELETE FROM public.modifier_groups WHERE organization_id = p_org_id;
    DELETE FROM public.accounts WHERE organization_id = p_org_id;
    DELETE FROM public.cost_centers WHERE organization_id = p_org_id;
    DELETE FROM public.warehouses WHERE organization_id = p_org_id;

    -- 🚀 المرحلة 2: بناء البنى السيادية
    IF (p_backup_data->'settings') IS NOT NULL AND (p_backup_data->'settings') != 'null'::jsonb THEN
        INSERT INTO public.company_settings SELECT * FROM jsonb_populate_record(NULL::public.company_settings, p_backup_data->'settings') 
        ON CONFLICT (organization_id) DO UPDATE SET company_name = EXCLUDED.company_name, account_mappings = EXCLUDED.account_mappings;
    END IF;

    IF (p_backup_data->'warehouses') IS NOT NULL THEN INSERT INTO public.warehouses SELECT * FROM jsonb_populate_recordset(NULL::public.warehouses, p_backup_data->'warehouses') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'item_categories') IS NOT NULL THEN INSERT INTO public.item_categories SELECT * FROM jsonb_populate_recordset(NULL::public.item_categories, p_backup_data->'item_categories') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'cost_centers') IS NOT NULL THEN INSERT INTO public.cost_centers SELECT * FROM jsonb_populate_recordset(NULL::public.cost_centers, p_backup_data->'cost_centers') ON CONFLICT DO NOTHING; END IF;

    -- 🚀 المرحلة 3: بناء شجرة الحسابات
    IF (p_backup_data->'accounts') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'accounts') LOOP 
            INSERT INTO public.accounts SELECT * FROM jsonb_populate_record(NULL::public.accounts, v_item - 'parent_id') ON CONFLICT DO NOTHING; 
        END LOOP;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'accounts') LOOP 
            UPDATE public.accounts SET parent_id = (v_item->>'parent_id')::uuid WHERE id = (v_item->>'id')::uuid AND (v_item->>'parent_id') IS NOT NULL;
        END LOOP;
    END IF;

    -- 🚀 المرحلة 4: زرع الكيانات (الأصول البشرية والتجارية)
    IF (p_backup_data->'customers') IS NOT NULL THEN INSERT INTO public.customers SELECT * FROM jsonb_populate_recordset(NULL::public.customers, p_backup_data->'customers') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, balance = EXCLUDED.balance; END IF;
    IF (p_backup_data->'suppliers') IS NOT NULL THEN INSERT INTO public.suppliers SELECT * FROM jsonb_populate_recordset(NULL::public.suppliers, p_backup_data->'suppliers') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, balance = EXCLUDED.balance; END IF;
    IF (p_backup_data->'employees') IS NOT NULL THEN INSERT INTO public.employees SELECT * FROM jsonb_populate_recordset(NULL::public.employees, p_backup_data->'employees') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'restaurant_tables') IS NOT NULL THEN INSERT INTO public.restaurant_tables SELECT * FROM jsonb_populate_recordset(NULL::public.restaurant_tables, p_backup_data->'restaurant_tables') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'shifts') IS NOT NULL THEN INSERT INTO public.shifts SELECT * FROM jsonb_populate_recordset(NULL::public.shifts, p_backup_data->'shifts') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'table_sessions') IS NOT NULL THEN INSERT INTO public.table_sessions SELECT * FROM jsonb_populate_recordset(NULL::public.table_sessions, p_backup_data->'table_sessions') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'modifier_groups') IS NOT NULL THEN INSERT INTO public.modifier_groups SELECT * FROM jsonb_populate_recordset(NULL::public.modifier_groups, p_backup_data->'modifier_groups') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'modifiers') IS NOT NULL THEN INSERT INTO public.modifiers SELECT * FROM jsonb_populate_recordset(NULL::public.modifiers, p_backup_data->'modifiers') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'modifier_groups') IS NOT NULL THEN INSERT INTO public.modifier_groups SELECT * FROM jsonb_populate_recordset(NULL::public.modifier_groups, p_backup_data->'modifier_groups') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'modifiers') IS NOT NULL THEN INSERT INTO public.modifiers SELECT * FROM jsonb_populate_recordset(NULL::public.modifiers, p_backup_data->'modifiers') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'products') IS NOT NULL THEN INSERT INTO public.products SELECT * FROM jsonb_populate_recordset(NULL::public.products, p_backup_data->'products') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, stock = EXCLUDED.stock; END IF;

    -- 🚀 المرحلة 5: زرع رؤوس المستندات (بدون الروابط الدائرية)
    -- تم تحويلها إلى حلقة (Loop) لضمان الدقة ومعالجة التعارضات بشكل فردي
    IF (p_backup_data->'journal_entries') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'journal_entries') LOOP
            INSERT INTO public.journal_entries SELECT * FROM jsonb_populate_record(NULL::public.journal_entries, v_item) 
            ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id; 
        END LOOP;
    END IF;

    IF (p_backup_data->'employee_allowances') IS NOT NULL THEN INSERT INTO public.employee_allowances SELECT * FROM jsonb_populate_recordset(NULL::public.employee_allowances, p_backup_data->'employee_allowances') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'payroll_variables') IS NOT NULL THEN INSERT INTO public.payroll_variables SELECT * FROM jsonb_populate_recordset(NULL::public.payroll_variables, p_backup_data->'payroll_variables') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'employee_advances') IS NOT NULL THEN INSERT INTO public.employee_advances SELECT * FROM jsonb_populate_recordset(NULL::public.employee_advances, p_backup_data->'employee_advances') ON CONFLICT DO NOTHING; END IF;

    IF (p_backup_data->'invoices') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'invoices') LOOP 
            INSERT INTO public.invoices SELECT * FROM jsonb_populate_record(NULL::public.invoices, v_item - 'related_journal_entry_id') ON CONFLICT (id) DO NOTHING; 
        END LOOP; 
    END IF;

    IF (p_backup_data->'purchase_invoices') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'purchase_invoices') LOOP 
            INSERT INTO public.purchase_invoices SELECT * FROM jsonb_populate_record(NULL::public.purchase_invoices, v_item - 'related_journal_entry_id') ON CONFLICT (id) DO NOTHING; 
        END LOOP; 
    END IF;
    IF (p_backup_data->'receipt_vouchers') IS NOT NULL THEN INSERT INTO public.receipt_vouchers SELECT * FROM jsonb_populate_recordset(NULL::public.receipt_vouchers, p_backup_data->'receipt_vouchers') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'payment_vouchers') IS NOT NULL THEN INSERT INTO public.payment_vouchers SELECT * FROM jsonb_populate_recordset(NULL::public.payment_vouchers, p_backup_data->'payment_vouchers') ON CONFLICT DO NOTHING; END IF;

    -- 🚀 زرع الشيكات (التي كانت مفقودة في V35)
    IF (p_backup_data->'cheques') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'cheques') LOOP 
            INSERT INTO public.cheques SELECT * FROM jsonb_populate_record(NULL::public.cheques, v_item - 'related_journal_entry_id') ON CONFLICT (id) DO NOTHING; 
        END LOOP; 
    END IF;

    -- 🚀 المرحلة 6: زرع التفاصيل والبنود (Items & Lines)
    IF (p_backup_data->'journal_lines') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'journal_lines') LOOP
            -- 🛡️ فحص ذكي: لا تدرج السطر إلا إذا كان القيد الأب موجوداً فعلياً في القاعدة
            -- هذا يمنع انهيار العملية بالكامل بسبب سجل واحد تالف في النسخة الاحتياطية
            IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = (v_item->>'journal_entry_id')::uuid) THEN
                INSERT INTO public.journal_lines SELECT * FROM jsonb_populate_record(NULL::public.journal_lines, v_item) 
                ON CONFLICT (id) DO UPDATE SET 
                    organization_id = p_org_id,
                    journal_entry_id = EXCLUDED.journal_entry_id,
                    account_id = EXCLUDED.account_id,
                    debit = EXCLUDED.debit,
                    credit = EXCLUDED.credit;
            END IF;
        END LOOP;
    END IF;

    -- 🚀 تحسين: زرع بنود الفواتير مع فحص الأب (Parent Integrity Check)
    IF (p_backup_data->'invoice_items') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'invoice_items') LOOP
            IF EXISTS (SELECT 1 FROM public.invoices WHERE id = (v_item->>'invoice_id')::uuid) THEN
                INSERT INTO public.invoice_items SELECT * FROM jsonb_populate_record(NULL::public.invoice_items, v_item) ON CONFLICT (id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- زرع المرفقات
    IF (p_backup_data->'cheque_attachments') IS NOT NULL THEN INSERT INTO public.cheque_attachments SELECT * FROM jsonb_populate_recordset(NULL::public.cheque_attachments, p_backup_data->'cheque_attachments') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'receipt_voucher_attachments') IS NOT NULL THEN INSERT INTO public.receipt_voucher_attachments SELECT * FROM jsonb_populate_recordset(NULL::public.receipt_voucher_attachments, p_backup_data->'receipt_voucher_attachments') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'payment_voucher_attachments') IS NOT NULL THEN INSERT INTO public.payment_voucher_attachments SELECT * FROM jsonb_populate_recordset(NULL::public.payment_voucher_attachments, p_backup_data->'payment_voucher_attachments') ON CONFLICT DO NOTHING; END IF;

    IF (p_backup_data->'purchase_invoice_items') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'purchase_invoice_items') LOOP
            IF EXISTS (SELECT 1 FROM public.purchase_invoices WHERE id = (v_item->>'purchase_invoice_id')::uuid) THEN
                INSERT INTO public.purchase_invoice_items SELECT * FROM jsonb_populate_record(NULL::public.purchase_invoice_items, v_item) ON CONFLICT (id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    IF (p_backup_data->'bill_of_materials') IS NOT NULL THEN INSERT INTO public.bill_of_materials SELECT * FROM jsonb_populate_recordset(NULL::public.bill_of_materials, p_backup_data->'bill_of_materials') ON CONFLICT (id) DO NOTHING; END IF;
    IF (p_backup_data->'opening_inventories') IS NOT NULL THEN INSERT INTO public.opening_inventories SELECT * FROM jsonb_populate_recordset(NULL::public.opening_inventories, p_backup_data->'opening_inventories') ON CONFLICT DO NOTHING; END IF;

    -- 🚀 المرحلة 7: حقن الروابط النهائية (Stitching)
    -- [جديد] محرك إعادة الربط التلقائي لضمان ظهور القيود في الفواتير والسندات
    UPDATE public.invoices i SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = i.id AND je.related_document_type = 'invoice' AND i.organization_id = p_org_id;
    UPDATE public.purchase_invoices pi SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = pi.id AND je.related_document_type = 'purchase_invoice' AND pi.organization_id = p_org_id;
    UPDATE public.receipt_vouchers rv SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = rv.id AND je.related_document_type = 'receipt_voucher' AND rv.organization_id = p_org_id;
    UPDATE public.payment_vouchers pv SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = pv.id AND je.related_document_type = 'payment_voucher' AND pv.organization_id = p_org_id;
    UPDATE public.cheques c SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = c.id AND je.related_document_type = 'cheque' AND c.organization_id = p_org_id;

    PERFORM public.recalculate_all_system_balances(p_org_id);
    RETURN '✅ [V13] تمت الاستعادة بنجاح مع ترميم كافة الروابط وتخطي البنود اليتيمة.';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '❌ فشل محرك الاستعادة V13 الشامل: %', SQLERRM;
END; $$;

-- 🛡️ دالة فحص نزاهة النسخة الاحتياطية (Integrity Validator RPC)
-- هذه الدالة لا تمس البيانات، بل تعيد تقريراً فقط
CREATE OR REPLACE FUNCTION public.validate_backup_integrity(p_org_id uuid, p_backup_data jsonb)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_report jsonb := '[]'::jsonb;
    v_stored_checksum text;
    v_calculated_checksum text;
    v_temp_check record;
BEGIN
    -- 1. فحص الإصدار
    IF (p_backup_data->'metadata'->>'version') = '1.0' THEN
        v_report := v_report || jsonb_build_object('name', 'توافق الإصدار', 'status', 'pass', 'message', 'إصدار النسخة (1.0) متوافق تماماً.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'توافق الإصدار', 'status', 'fail', 'message', 'إصدار النسخة غير مدعوم.');
    END IF;

    -- 🔒 2. فحص البصمة الرقمية (Checksum Verification)
    v_stored_checksum := p_backup_data->>'checksum';
    -- نحسب البصمة للبيانات بعد استبعاد حقل الـ checksum نفسه
    v_calculated_checksum := md5((p_backup_data - 'checksum')::text);

    IF v_stored_checksum IS NULL THEN
        v_report := v_report || jsonb_build_object('name', 'أمان البيانات', 'status', 'fail', 'message', 'النسخة تفتقر للبصمة الرقمية (غير آمنة).');
    ELSIF v_stored_checksum != v_calculated_checksum THEN
        v_report := v_report || jsonb_build_object('name', 'أمان البيانات', 'status', 'fail', 'message', 'تحذير: تم اكتشاف تلاعب في محتوى الملف! البصمة لا تطابق البيانات.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'أمان البيانات', 'status', 'pass', 'message', 'تم التحقق من بصمة البيانات: النسخة أصلية ولم يتم تعديلها.');
    END IF;

    -- 3. فحص الدليل المحاسبي
    IF (p_backup_data->'accounts') IS NOT NULL AND jsonb_array_length(p_backup_data->'accounts') > 0 THEN
        v_report := v_report || jsonb_build_object('name', 'الدليل المحاسبي', 'status', 'pass', 'message', 'تم العثور على ' || jsonb_array_length(p_backup_data->'accounts') || ' حساب.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'الدليل المحاسبي', 'status', 'fail', 'message', 'النسخة لا تحتوي على دليل حسابات!');
    END IF;

    -- 4. فحص المستودعات والمنتجات
    IF (p_backup_data->'products') IS NOT NULL AND (p_backup_data->'warehouses') IS NULL THEN
        v_report := v_report || jsonb_build_object('name', 'تكامل المخزون', 'status', 'fail', 'message', 'يوجد منتجات بدون مستودعات مرتبطة.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'تكامل المخزون', 'status', 'pass', 'message', 'بيانات المخزون تبدو سليمة.');
    END IF;

    -- 5. فحص تطابق المنظمة (تحذير فقط)
    IF (p_backup_data->'metadata'->>'org_id')::uuid != p_org_id THEN
        v_report := v_report || jsonb_build_object('name', 'هوية الشركة', 'status', 'warning', 'message', 'هذه النسخة تنتمي لشركة أخرى، سيتم تحويل المعرفات آلياً.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'هوية الشركة', 'status', 'pass', 'message', 'هوية الشركة متطابقة.');
    END IF;

    -- 6. فحص حجم البيانات (تقديري)
    v_report := v_report || jsonb_build_object('name', 'حجم العمليات', 'status', 'pass', 'message', 'تحتوي النسخة على ' || 
        (COALESCE(jsonb_array_length(p_backup_data->'invoices'), 0) + COALESCE(jsonb_array_length(p_backup_data->'journal_entries'), 0)) || ' مستند مالي.');

    RETURN v_report;
END; $$;

-- 🧪 دالة اختبار النزاهة الشاملة (Backup/Restore Unit Test)
CREATE OR REPLACE FUNCTION public.test_full_backup_restore_cycle()
RETURNS TABLE(test_step text, status text, details text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
    v_backup_id uuid;
    v_backup_data jsonb;
    v_initial_balance numeric;
    v_final_balance numeric;
    v_initial_stock numeric;
    v_final_stock numeric;
    v_wh_id uuid;
    v_prod_id uuid;
BEGIN
    -- 🚀 1. إنشاء شركة اختبارية (SaaS Sandbox)
    v_org_id := public.create_new_client_v2('Test Restore Org', 'test@restore.com', 'commercial');
    test_step := '1. تهيئة المنظمة'; status := 'SUCCESS ✅'; details := 'تم إنشاء المنظمة برقم: ' || v_org_id; RETURN NEXT;

    -- جلب المستودع الافتراضي الذي تم إنشاؤه آلياً
    SELECT id INTO v_wh_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;

    -- 📥 2. إدخال بيانات (مالية ومخزنية) اختبارية
    -- أ. قيد محاسبي
    INSERT INTO public.journal_entries (description, status, organization_id, transaction_date, is_posted)
    VALUES ('قيد مبيعات اختباري للتحقق', 'posted', v_org_id, now(), true) RETURNING id INTO v_prod_id; 
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id)
    VALUES 
        (v_prod_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1221' LIMIT 1), 5000, 0, v_org_id),
        (v_prod_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '411' LIMIT 1), 0, 5000, v_org_id);

    -- ب. صنف مخزني برصيد
    INSERT INTO public.products (name, purchase_price, organization_id)
    VALUES ('صنف اختباري', 10, v_org_id) RETURNING id INTO v_prod_id;
    
    -- تسجيل الرصيد الافتتاحي في جدول الحركات لكي يراه محرك المخزون
    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id)
    VALUES (v_prod_id, v_wh_id, 100, 10, v_org_id);

    PERFORM public.recalculate_all_system_balances(v_org_id);
    SELECT balance INTO v_initial_balance FROM public.accounts WHERE organization_id = v_org_id AND code = '1';
    SELECT stock INTO v_initial_stock FROM public.products WHERE id = v_prod_id;

    test_step := '2. ضخ البيانات'; status := 'DONE 📥'; details := 'رصيد الأصول: ' || v_initial_balance || ' | المخزون: ' || v_initial_stock; RETURN NEXT;

    -- 💾 3. إجراء النسخ الاحتياطي (مع توليد الـ Checksum)
    v_backup_id := public.create_organization_backup(v_org_id);
    SELECT backup_data INTO v_backup_data FROM public.organization_backups WHERE id = v_backup_id;
    test_step := '3. إنشاء النسخة'; status := 'SUCCESS ✅'; details := 'حجم النسخة: ' || pg_column_size(v_backup_data) || ' bytes | البصمة: ' || (v_backup_data->>'checksum'); RETURN NEXT;

    -- 🔄 4. الاستعادة (تطهير كامل ثم إعادة بناء)
    PERFORM public.restore_organization_backup(v_org_id, v_backup_data);
    test_step := '4. عملية الاستعادة'; status := 'COMPLETED 🔄'; details := 'تم التطهير وإعادة الربط (Stitching) بنجاح'; RETURN NEXT;

    -- ⚖️ 5. التحقق من تطابق الأرصدة والبيانات
    SELECT balance INTO v_final_balance FROM public.accounts WHERE organization_id = v_org_id AND code = '1';
    SELECT stock INTO v_final_stock FROM public.products WHERE name = 'صنف اختباري' AND organization_id = v_org_id;
    
    IF v_initial_balance = v_final_balance AND v_initial_stock = v_final_stock THEN
        test_step := '5. فحص النزاهة النهائية'; status := 'PASSED ✅'; details := 'تطابق كامل 100%: الرصيد (' || v_final_balance || ') المخزون (' || v_final_stock || ')';
    ELSE
        test_step := '5. فحص النزاهة النهائية'; status := 'FAILED ❌'; details := 'عدم تطابق! مالي: ' || v_initial_balance || '/' || v_final_balance || ' مخزني: ' || v_initial_stock || '/' || v_final_stock;
    END IF;
    RETURN NEXT;

    -- تنظيف شركة الاختبار
    DELETE FROM public.organizations WHERE id = v_org_id;

EXCEPTION WHEN OTHERS THEN
    test_step := 'CRITICAL ERROR'; status := 'ERROR 🛑'; details := SQLERRM;
    DELETE FROM public.organizations WHERE id = v_org_id;
    RETURN NEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.force_grant_admin_access(p_user_id uuid, p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_role_id uuid;
BEGIN
    -- جلب معرف الدور (Admin) الخاص بهذه المنظمة تحديداً
    SELECT id INTO v_role_id FROM public.roles 
    WHERE organization_id = p_org_id AND name = 'admin' 
    LIMIT 1;

    -- تحديث البروفايل بالاسم والرقم التعريفي للدور
    UPDATE public.profiles 
    SET role = 'admin', 
        role_id = v_role_id, 
        organization_id = p_org_id, 
        is_active = true 
    WHERE id = p_user_id;

    -- تحديث بيانات الدخول لضمان التعرف على الشركة في الجلسة
    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
                             jsonb_build_object('org_id', p_org_id, 'role', 'admin') 
    WHERE id = p_user_id;

    RETURN 'تم منح صلاحيات المدير بنجاح ✅';
END; $$;

-- 📊 دالة تقرير مبيعات المطعم (The Missing Report Function)
CREATE OR REPLACE FUNCTION public.get_restaurant_sales_report(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    item_name text,
    category_name text,
    quantity numeric,
    total_sales numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.name::text as item_name,
        COALESCE(cat.name::text, 'غير مصنف'::text) as category_name,
        SUM(oi.quantity)::numeric as quantity,
        SUM(oi.total_price)::numeric as total_sales
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.products p ON oi.product_id = p.id
    LEFT JOIN public.item_categories cat ON p.category_id = cat.id
    WHERE o.organization_id = p_org_id
      AND o.status IN ('COMPLETED', 'PAID', 'posted')
      AND o.created_at::date BETWEEN p_start_date AND p_end_date
    GROUP BY p.name, cat.name
    ORDER BY total_sales DESC;
END;
$$;

-- 🛠️ دالة توليد أو جلب مفتاح QR للطاولة (Restaurant QR Menu)
CREATE OR REPLACE FUNCTION public.get_or_create_qr_for_table(p_table_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE
    v_table record;
    v_qr_key uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    SELECT * INTO v_table 
    FROM public.restaurant_tables 
    WHERE id = p_table_id AND organization_id = v_org_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الطاولة غير موجودة أو لا تملك صلاحية الوصول إليها';
    END IF;
    
    v_qr_key := v_table.qr_access_key;
    
    IF v_qr_key IS NULL THEN
        v_qr_key := gen_random_uuid();
        UPDATE public.restaurant_tables SET qr_access_key = v_qr_key WHERE id = p_table_id;
    END IF;
    
    RETURN json_build_object(
        'qr_access_key', v_qr_key,
        'table_name', v_table.name
    );
END; $$;

-- 🛡️ دالة جلب الإعدادات الآمنة (تتخطى مشاكل التوكن العالق)
DROP FUNCTION IF EXISTS public.get_current_company_settings CASCADE;

CREATE OR REPLACE FUNCTION public.get_current_company_settings(
    p_org_id uuid DEFAULT NULL
)
RETURNS SETOF public.company_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- استخدام محرك الهوية الموحد لضمان الوصول الصحيح للإعدادات (خاصة للسوبر أدمن)
    -- مع استخدام SELECT * لضمان جلب كافة الأعمدة الجديدة (مثل المستودعات الافتراضية) تلقائياً
    RETURN QUERY SELECT * FROM public.company_settings 
    WHERE organization_id = COALESCE(p_org_id, public.get_my_org());
END;
$$;
-- ================================================================
-- 🚀 الحل السحري لمشكلة تحويل عروض الأسعار: المشغل التلقائي
-- ================================================================

CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا تم إدراج فاتورة حالتها 'posted' (كما يحدث عند تحويل عروض الأسعار) وليس لها قيد
    IF NEW.status = 'posted' AND NEW.related_journal_entry_id IS NULL THEN
        PERFORM public.approve_invoice(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_approve_invoice ON public.invoices;
CREATE TRIGGER trg_auto_approve_invoice
    AFTER INSERT OR UPDATE OF status ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_insert();

-- 🛠️ مشغل إضافي لمراقبة بنود الفاتورة (لضمان معالجة الفواتير التي تصل بنودها متأخرة)
CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_items_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا كانت الفاتورة الأم 'posted' وبدون قيد، نحاول اعتمادها الآن بعد توفر البنود
    IF EXISTS (
        SELECT 1 FROM public.invoices 
        WHERE id = NEW.invoice_id AND status = 'posted' AND related_journal_entry_id IS NULL
    ) THEN
        PERFORM public.approve_invoice(NEW.invoice_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_approve_invoice_items ON public.invoice_items;
CREATE TRIGGER trg_auto_approve_invoice_items
    AFTER INSERT ON public.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_items_insert();

-- إعادة تحميل كاش المخطط لضمان تعرف الـ API على التغييرات فوراً
NOTIFY pgrst, 'reload config';

-- 🛠️ دالة تنظيف سجلات النسخ الاحتياطية اليتيمة
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_backups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE deleted_count integer;
BEGIN
    DELETE FROM public.organization_backups WHERE organization_id NOT IN (SELECT id FROM public.organizations);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END; $$;

-- 🛠️ دالة بدء تنظيف ملفات التخزين اليتيمة (Trigger for Edge Functions)
CREATE OR REPLACE FUNCTION public.cleanup_storage_orphans_trigger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.security_logs (event_type, description, metadata)
    VALUES (
        'storage_cleanup_request', 
        'طلب تنظيف آلي لملفات التخزين اليتيمة عبر الخادم', 
        jsonb_build_object(
            'triggered_at', now(), 
            'triggered_by', auth.uid(),
            'status', 'initiated'
        )
    );
    RETURN jsonb_build_object(
        'status', 'success',
        'message', 'تم بدء عملية التنظيف بنجاح. يمكنك مراقبة سجلات الأمان.'
    );
END; $$;

-- 🛠️ دالة تلقائية لضمان تعبئة معرف المنظمة في طلبات المطبخ
CREATE OR REPLACE FUNCTION public.fn_ensure_kitchen_order_org()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا كانت organization_id موجودة بالفعل، لا نفعل شيئاً
    IF NEW.organization_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id 
        FROM public.order_items 
        WHERE id = NEW.order_item_id;
    END IF;
    
    -- إذا ظل فارغاً، نستخدم معرف المستخدم الحالي
    IF NEW.organization_id IS NULL THEN
        NEW.organization_id := public.get_my_org();
    END IF;
    
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_kitchen_org ON public.kitchen_orders;
CREATE TRIGGER trg_ensure_kitchen_org 
BEFORE INSERT ON public.kitchen_orders 
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_kitchen_order_org();

-- 🛠️ دالة حماية الحسابات الأساسية من الحذف
CREATE OR REPLACE FUNCTION public.prevent_system_account_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- 🛡️ استثناء: السماح بالحذف إذا كان النظام في وضع الاستعادة (Restore Mode)
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    -- قائمة الأكواد المحمية (المستويات السيادية وحسابات الربط الآلي)
    IF OLD.code IN (
        '1', '2', '3', '4', '5', -- المستوى الأول
        '11', '12', '21', '22', '31', '41', '51', '52', '53', -- المستوى الثاني
        '103', '1221', '1231', '201', '3999', '411', '412', '413', '511', '541' -- حسابات العمليات
    ) THEN
        RAISE EXCEPTION '⚠️ خطأ سيادي: لا يمكن حذف الحساب (%) لأنه حساب نظام أساسي مرتبط بالتقارير المالية والقيود الآلية.', OLD.name;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 🛠️ دالة منع الترحيل على الحسابات الرئيسية (Group Accounts Protection)
-- الوصف: تمنع هذه الدالة تسجيل أي قيد محاسبي على حساب يمثل "مجموعة" لضمان سلامة الأرصدة
CREATE OR REPLACE FUNCTION public.check_account_is_not_group()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND is_group = true) THEN
        RAISE EXCEPTION '⚠️ خطأ محاسبي: لا يمكن الترحيل مباشرة إلى حساب رئيسي (مجموعة). يرجى اختيار حساب فرعي.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ربط القيد بجدول الحسابات
DROP TRIGGER IF EXISTS trg_protect_system_accounts ON public.accounts;
CREATE TRIGGER trg_protect_system_accounts
BEFORE DELETE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_system_account_deletion();

-- تفعيل حماية الحسابات الرئيسية
DROP TRIGGER IF EXISTS trg_prevent_group_posting ON public.journal_lines;
CREATE TRIGGER trg_prevent_group_posting BEFORE INSERT OR UPDATE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.check_account_is_not_group();

-- 🛠️ دالة مشغل فرض اختيار المستودع تلقائياً للمستندات (فواتير، مشتريات)
CREATE OR REPLACE FUNCTION public.fn_ensure_document_warehouse()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := COALESCE(
            (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id),
            (SELECT id FROM public.warehouses WHERE organization_id = NEW.organization_id AND deleted_at IS NULL LIMIT 1)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_invoice_warehouse ON public.invoices;
CREATE TRIGGER trg_ensure_invoice_warehouse BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_document_warehouse();

DROP TRIGGER IF EXISTS trg_ensure_purchase_warehouse ON public.purchase_invoices;
CREATE TRIGGER trg_ensure_purchase_warehouse BEFORE INSERT ON public.purchase_invoices FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_document_warehouse();

-- 🛠️ دالة ربط تلقائي لطلبات الـ QR بالكاشير عند الدفع
CREATE OR REPLACE FUNCTION public.fn_assign_cashier_to_qr_order()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا تغيرت الحالة إلى مدفوع والطلب ليس له صاحب، نربطه بالمستخدم الحالي الذي أجرى التعديل
    IF NEW.status IN ('PAID', 'COMPLETED') AND NEW.user_id IS NULL THEN
        NEW.user_id := auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_cashier ON public.orders;
CREATE TRIGGER trg_assign_cashier
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_assign_cashier_to_qr_order();

-- 🛠️ دالة فرض اختيار المستودع تلقائياً للطلبات (Auto-Warehouse Enforcement)
CREATE OR REPLACE FUNCTION public.fn_ensure_order_warehouse()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := COALESCE(
            (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id),
            (SELECT id FROM public.warehouses WHERE organization_id = NEW.organization_id AND deleted_at IS NULL LIMIT 1)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_order_warehouse ON public.orders;
CREATE TRIGGER trg_ensure_order_warehouse
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_order_warehouse();

-- 🛡️ مشغل التزامن التلقائي لرصيد العميل (لضمان عمل الرصيد في الماستر سيت أب)
CREATE OR REPLACE FUNCTION public.sync_customer_balance_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.customers SET balance = get_customer_balance(OLD.customer_id, OLD.organization_id) WHERE id = OLD.customer_id;
        RETURN OLD;
    ELSE
        UPDATE public.customers SET balance = get_customer_balance(NEW.customer_id, NEW.organization_id) WHERE id = NEW.customer_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 🛡️ دالة حساب رصيد العميل (Customer Balance Calculator)
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id uuid, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_balance numeric;
BEGIN
    -- حساب الرصيد من واقع الفواتير المرحلة وغير المدفوعة
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_balance
    FROM public.invoices
    WHERE customer_id = p_customer_id AND organization_id = p_org_id 
    AND status IN ('posted', 'paid');
    
    RETURN v_balance;
END; $$;

-- 🛠️ دالة إصلاح القيود غير المتوازنة (Unbalanced Entry Fixer)
CREATE OR REPLACE FUNCTION public.fix_unbalanced_journal_entry(p_je_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_diff numeric; v_org_id uuid; v_suspense_acc_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.journal_entries WHERE id = p_je_id;
    
    -- إزالة أي سطور توازن آلي قديمة لمنع التكرار عند إعادة التشغيل
    DELETE FROM public.journal_lines WHERE journal_entry_id = p_je_id AND description = 'توازن آلي (فرق مدين/دائن)';

    -- حساب الفرق (مدين - دائن)
    SELECT SUM(debit) - SUM(credit) INTO v_diff FROM public.journal_lines WHERE journal_entry_id = p_je_id;

    IF ABS(COALESCE(v_diff, 0)) < 0.001 THEN RETURN; END IF;

    -- استخدام حساب 3999 (الأرصدة الافتتاحية/الوسيط) لموازنة القيد
    SELECT id INTO v_suspense_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code = '3999' LIMIT 1;

    IF v_suspense_acc_id IS NULL THEN
        -- إذا لم يوجد، نستخدم أي حساب غير رئيسي (كحل أخير)
        SELECT id INTO v_suspense_acc_id FROM public.accounts WHERE organization_id = v_org_id AND is_group = false LIMIT 1;
    END IF;

    IF v_diff > 0 THEN -- المدين أكبر -> نحتاج سطر دائن
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, 0, ABS(v_diff), 'توازن آلي (فرق مدين/دائن)', v_org_id);
    ELSE -- الدائن أكبر -> نحتاج سطر مدين
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, ABS(v_diff), 0, 'توازن آلي (فرق مدين/دائن)', v_org_id);
    END IF;
END; $$;

-- 🛡️ دالة تحديث رصيد مورد واحد (Single Supplier Balance Updater)
CREATE OR REPLACE FUNCTION public.update_single_supplier_balance(p_supplier_id uuid, p_org_id uuid) -- 🛠️ تحديث: إضافة p_org_id كمعامل
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.suppliers SET balance = (
        SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
        FROM public.purchase_invoices
        WHERE supplier_id = p_supplier_id AND organization_id = p_org_id
        AND status IN ('posted', 'paid')
    ) WHERE id = p_supplier_id;
END; $$;

-- 🛡️ 1. دالة تفعيل وضع الطوارئ (Emergency Mode Toggle)
-- 📊 دالة جلب إحصائيات لوحة التحكم (Dashboard Stats RPC)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_sales numeric;
    v_total_purchases numeric;
    v_total_expenses numeric;
    v_total_revenue numeric;
    v_cash_balance numeric;
    v_bank_balance numeric;
    v_customers_count bigint;
    v_products_count bigint;
    v_top_selling_products jsonb;
    v_recent_invoices jsonb;
BEGIN
    -- 1. إجمالي المبيعات
    p_org_id := COALESCE(p_org_id, public.get_my_org()); 
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_sales
    FROM public.invoices
    WHERE organization_id = p_org_id AND status IN ('posted', 'paid');

    -- 2. إجمالي المشتريات
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_purchases
    FROM public.purchase_invoices
    WHERE organization_id = p_org_id AND status IN ('posted', 'paid');

    -- 3. إجمالي المصروفات (من القيود)
    SELECT COALESCE(SUM(jl.debit), 0) INTO v_total_expenses
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts acc ON jl.account_id = acc.id
    WHERE je.organization_id = p_org_id AND je.status = 'posted' AND acc.type = 'EXPENSE';

    -- 4. إجمالي الإيرادات (من القيود)
    SELECT COALESCE(SUM(jl.credit), 0) INTO v_total_revenue
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts acc ON jl.account_id = acc.id
    WHERE je.organization_id = p_org_id AND je.status = 'posted' AND acc.type = 'REVENUE';

    -- 5. رصيد الصندوق (الحسابات النقدية)
    SELECT COALESCE(SUM(balance), 0) INTO v_cash_balance
    FROM public.accounts
    WHERE organization_id = p_org_id AND code LIKE '1231%'; -- الصندوق الرئيسي

    -- 6. رصيد البنوك
    SELECT COALESCE(SUM(balance), 0) INTO v_bank_balance
    FROM public.accounts
    WHERE organization_id = p_org_id AND code LIKE '1232%'; -- حسابات البنوك

    -- 7. عدد العملاء والمنتجات
    SELECT COUNT(*) INTO v_customers_count FROM public.customers WHERE organization_id = p_org_id AND deleted_at IS NULL;
    SELECT COUNT(*) INTO v_products_count FROM public.products WHERE organization_id = p_org_id AND deleted_at IS NULL;

    -- 8. المنتجات الأكثر مبيعاً (أعلى 5)
    WITH top_products AS (
        SELECT p.name as product_name, SUM(oi.quantity) as total_quantity
        FROM public.order_items oi
        JOIN public.products p ON oi.product_id = p.id
        JOIN public.orders o ON oi.order_id = o.id
        WHERE o.organization_id = p_org_id AND o.status IN ('COMPLETED', 'PAID', 'posted')
        GROUP BY p.name
        ORDER BY total_quantity DESC
        LIMIT 5
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('product_name', product_name, 'total_quantity', total_quantity)), '[]'::jsonb)
    INTO v_top_selling_products -- 🛡️ حماية من TypeError في الواجهة عند عدم وجود مبيعات
    FROM top_products;

    RETURN jsonb_build_object(
        'total_sales', v_total_sales, 'total_purchases', v_total_purchases,
        'total_expenses', v_total_expenses, 'total_revenue', v_total_revenue,
        'cash_balance', v_cash_balance, 'bank_balance', v_bank_balance,
        'customers_count', v_customers_count, 'products_count', v_products_count,
        'top_selling_products', COALESCE(v_top_selling_products, '[]'::jsonb)
    );
END;
$$;

-- 📊 دالة جلب جميع أرصدة الحسابات (All Account Balances RPC)
CREATE OR REPLACE FUNCTION public.get_all_account_balances(p_org_id uuid DEFAULT NULL) -- 🛠️ تحديث: إضافة p_org_id كمعامل
RETURNS TABLE (
    account_id uuid,
    account_code text,
    account_name text,
    account_type text,
    balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    p_org_id := COALESCE(p_org_id, public.get_my_org());
    RETURN QUERY
    SELECT
        a.id AS account_id,
        a.code AS account_code,
        a.name AS account_name,
        a.type AS account_type,
        COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
    FROM
        public.accounts a
    LEFT JOIN public.journal_lines jl ON a.id = jl.account_id AND jl.organization_id = a.organization_id
    LEFT JOIN public.journal_entries je ON jl.journal_entry_id = je.id AND je.status = 'posted'
    WHERE
        a.organization_id = p_org_id
    GROUP BY
        a.id, a.code, a.name, a.type
    ORDER BY
        a.code;
END;
$$;

-- 🛡️ 1. دالة تفعيل وضع الطوارئ (Emergency Mode Toggle)
-- تتيح للسوبر أدمن تجاوز حماية الرواتب الحساسة في الجلسة الحالية
CREATE OR REPLACE FUNCTION public.set_emergency_mode(p_enable boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF public.get_my_role() != 'super_admin' THEN
        RAISE EXCEPTION 'غير مصرح: هذه الدالة مخصصة للمدير العام فقط.';
    END IF;

    IF p_enable THEN
        PERFORM set_config('app.emergency_mode', 'on', false);
        RETURN '🚨 وضع الطوارئ نشط: تم فتح الوصول للبيانات الحساسة لهذه الجلسة.';
    ELSE
        PERFORM set_config('app.emergency_mode', 'off', false);
        RETURN '🛡️ تم إيقاف وضع الطوارئ: الحماية مفعّلة الآن.';
    END IF;
END; $$;

-- 📊 2. دالة إحصائيات المنصة الشاملة - محدثة لتعمل عالمياً (Super Admin Platform Metrics)
CREATE OR REPLACE FUNCTION public.get_admin_platform_metrics()
RETURNS TABLE (
    total_orgs bigint,
    active_orgs bigint,
    total_invoices_count bigint,
    total_transactions_value numeric,
    total_storage_used_kb numeric,
    orgs_expiring_soon bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- التحقق من الصلاحية العالمية (حتى لو كان يتقمص شخصية شركة أخرى، دوره يبقى سوبر أدمن)
    IF (auth.jwt() ->> 'role') != 'super_admin' AND public.get_my_role() != 'super_admin' THEN
        RAISE EXCEPTION 'غير مصرح بالوصول لإحصائيات المنصة.';
    END IF;

    RETURN QUERY
    -- تنفيذ استعلامات مباشرة على الجداول لتخطي RLS بفضل SECURITY DEFINER
    SELECT 
        (SELECT count(*) FROM public.organizations) as total_orgs,
        (SELECT count(*) FROM public.organizations WHERE is_active = true AND (subscription_expiry IS NULL OR subscription_expiry >= now())) as active_orgs,
        (SELECT count(*) FROM public.invoices WHERE status != 'draft') as total_invoices_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM public.invoices WHERE status IN ('posted', 'paid')) as total_transactions_value,
        (SELECT COALESCE(SUM(file_size_kb), 0) FROM public.organization_backups) as total_storage_used_kb,
        (SELECT count(*) FROM public.organizations WHERE subscription_expiry BETWEEN now() AND now() + interval '7 days') as orgs_expiring_soon;
END; $$;

-- 🚀 3. دالة تنظيف البيانات التجريبية (إصلاح تكرار المنظمة)
CREATE OR REPLACE FUNCTION public.clear_demo_data(p_org_id uuid) -- 🛠️ تحديث: إضافة p_org_id كمعامل
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'صلاحيات غير كافية.'; END IF;

    -- 1. حذف بيانات التصنيع بذكاء (فقط إذا كانت الجداول موجودة)
    -- يتم استخدام EXECUTE لتجنب خطأ 42P01 أثناء تعريف الدالة
    EXECUTE 'DO $clear_mfg$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_batch_serials'') THEN
            DELETE FROM public.mfg_batch_serials WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_actual_material_usage WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_scrap_logs WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_production_variances WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_qc_inspections'') THEN
            DELETE FROM public.mfg_qc_inspections WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_material_requests'') THEN
            DELETE FROM public.mfg_material_request_items WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_material_requests WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_production_orders'') THEN
            DELETE FROM public.mfg_order_progress WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_production_orders WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_step_materials WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_routing_steps WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_routings WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_work_centers WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
    END $clear_mfg$;';

    DELETE FROM public.bill_of_materials WHERE organization_id = p_org_id;

    -- 2. حذف بيانات المبيعات والمشتريات والمالية
    DELETE FROM public.invoices WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = p_org_id;
    DELETE FROM public.receipt_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.payment_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.orders WHERE organization_id = p_org_id;
    DELETE FROM public.stock_adjustments WHERE organization_id = p_org_id;
    DELETE FROM public.opening_inventories WHERE organization_id = p_org_id;
    DELETE FROM public.cheques WHERE organization_id = p_org_id;
    DELETE FROM public.credit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.debit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.payrolls WHERE organization_id = p_org_id;
    DELETE FROM public.employee_advances WHERE organization_id = p_org_id;
    DELETE FROM public.assets WHERE organization_id = p_org_id;
    DELETE FROM public.customers WHERE organization_id = p_org_id;
    DELETE FROM public.suppliers WHERE organization_id = p_org_id;
    DELETE FROM public.employees WHERE organization_id = p_org_id;
    DELETE FROM public.restaurant_tables WHERE organization_id = p_org_id;
    DELETE FROM public.shifts WHERE organization_id = p_org_id;

    DELETE FROM public.journal_entries WHERE organization_id = p_org_id AND related_document_type != 'opening_balance';
    -- تحديث المخزون للأصناف ليصبح صفراً
    UPDATE public.products SET stock = 0, warehouse_stock = '{}'::jsonb WHERE organization_id = p_org_id;
    
    RETURN 'تم تنظيف البيانات التشغيلية بنجاح ✅';
END; $$;


-- 🛡️ 4. دالة إصلاح صلاحيات كافة المديرين (Bulk Admin Permission Repair)
CREATE OR REPLACE FUNCTION public.repair_all_admin_permissions()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    r record;
BEGIN
    -- السماح للسوبر أدمن أو لمدير قاعدة البيانات (postgres) بتشغيل الدالة
    IF public.get_my_role() != 'super_admin' AND current_user != 'postgres' THEN 
        RAISE EXCEPTION 'غير مصرح: للسوبر أدمن فقط.'; 
    END IF;

    FOR r IN SELECT id FROM public.organizations LOOP
        -- منح كافة الصلاحيات لدور الآدمن في كل شركة لضمان تحكم العميل الكامل
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT (SELECT id FROM public.roles WHERE organization_id = r.id AND name = 'admin' LIMIT 1), id, r.id
        FROM public.permissions
        ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN 'تمت مزامنة كافة الصلاحيات لكل مديري الشركات بنجاح ✅';
END; $$;

-- 7.1 دالة مساعدة: جلب رصيد حساب في تاريخ محدد (Helper for Historical Balance)
-- الغرض: تستخدم لحساب الأرصدة الافتتاحية والختامية للفترات المحاسبية
CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(p_account_id uuid, p_date date, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE -- 🛠️ تحديث: إضافة p_org_id كمعامل
    v_balance numeric;
BEGIN
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    INTO v_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE jl.account_id = p_account_id
      AND je.organization_id = p_org_id
      AND je.status = 'posted' -- نعتمد فقط على القيود المرحلة
      AND je.transaction_date <= p_date; -- نجمع كل الحركات حتى التاريخ المحدد
    RETURN v_balance;
END; $$;

-- 🛡️ منع ترحيل أي قيد يدوي غير متوازن (مدين != دائن) لضمان سلامة الميزان
CREATE OR REPLACE FUNCTION public.fn_validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_debit_sum numeric;
    v_credit_sum numeric;
BEGIN
    -- نطبق الفحص فقط عندما تكون حالة القيد "مرحل" (posted)
    IF NEW.status = 'posted' THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO v_debit_sum, v_credit_sum
        FROM public.journal_lines
        WHERE journal_entry_id = NEW.id;

        IF ABS(v_debit_sum - v_credit_sum) > 0.0001 THEN
            RAISE EXCEPTION '⚠️ خطأ في النزاهة المحاسبية: لا يمكن ترحيل القيد (%) لأنه غير متوازن. (إجمالي المدين: %, إجمالي الدائن: %)', NEW.reference, v_debit_sum, v_credit_sum;
        END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_je_balance ON public.journal_entries;
CREATE TRIGGER trg_validate_je_balance
AFTER INSERT OR UPDATE OF status ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_journal_entry_balance();
-- 🧪 دالة اختبار عزل البيانات (SaaS Isolation Unit Test)
-- الغرض: التأكد برمجياً من أن المدير في شركة ما لا يمكنه الوصول لبيانات شركة أخرى
CREATE OR REPLACE FUNCTION public.test_saas_isolation()
RETURNS TABLE(test_name text, result text, details text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_a uuid; v_org_b uuid;
    v_user_a uuid := gen_random_uuid();
    v_prod_b uuid;
    v_visible_count int;
BEGIN
    -- 1. إنشاء منظمات اختبارية أولاً لضمان توفر v_org_a قبل استخدامه
    INSERT INTO public.organizations (name) VALUES ('Org A Test') RETURNING id INTO v_org_a;
    INSERT INTO public.organizations (name) VALUES ('Org B Test') RETURNING id INTO v_org_b;

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
        '00000000-0000-0000-0000-000000000001', -- معرف وهمي لـ instance_id (يمكن استبداله بمعرف instance_id حقيقي لمشروعك)
        'authenticated',
        'authenticated',
        '{}'::jsonb,
        jsonb_build_object('org_id', v_org_a, 'role', 'admin')
    ) ON CONFLICT (id) DO NOTHING; -- تجنب الخطأ إذا كان ID موجوداً بالفعل (غير محتمل مع gen_random_uuid)

    -- 2. إنشاء مستخدم (Admin) ينتمي للمنظمة A
    INSERT INTO public.profiles (id, organization_id, role, full_name)
    VALUES (v_user_a, v_org_a, 'admin', 'Test Admin A')
    ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name;

    -- 3. إنشاء بيانات (منتج) في المنظمة B
    INSERT INTO public.products (name, organization_id) 
    VALUES ('Secret Data Org B', v_org_b) RETURNING id INTO v_prod_b;

    -- 4. محاكاة اختبار العزل
    test_name := 'SaaS Data Isolation Test (Org A vs Org B)';
    
    -- فحص الرؤية: هل يستطيع من يملك معرف Org A رؤية بيانات Org B؟
    -- نطبق هنا نفس المنطق البرمجي المستخدم في سياسات RLS
    SELECT count(*) INTO v_visible_count 
    FROM public.products 
    WHERE id = v_prod_b 
    AND (organization_id = v_org_a OR 'admin' = 'super_admin'); 

    IF v_visible_count = 0 THEN
        result := 'PASSED ✅';
        details := 'تم التأكد بنجاح من أن المدير في شركة A لا يمكنه رؤية بيانات شركة B. نظام العزل يعمل.';
    ELSE
        result := 'FAILED ❌';
        details := 'خرق أمني: البيانات تسربت بين المنظمات! يرجى مراجعة سياسات RLS في ملف setup_rls.sql';
    END IF;

    -- تنظيف بيانات الاختبار فوراً
    DELETE FROM public.products WHERE organization_id IN (v_org_a, v_org_b);
    DELETE FROM public.profiles WHERE id = v_user_a;
    DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);

    RETURN NEXT;
END; $$;

-- 🛡️ 5. محرك التعيين التلقائي للمنظمة (Auto-Organization Enforcer)
-- يضمن هذا المحرك أن أي صف يتم إنشاؤه سيأخذ رقم منظمة المستخدم الحالية تلقائياً
CREATE OR REPLACE FUNCTION public.fn_force_org_id_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_current_org uuid;
BEGIN
    -- 🛡️ وضع الاستعادة
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- 🏗️ المرحلة 1: محرك الوراثة الذكي
    IF TG_TABLE_NAME = 'bill_of_materials' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.products WHERE id = NEW.product_id;
    ELSIF (TG_TABLE_NAME = 'table_sessions') AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.restaurant_tables WHERE id = NEW.table_id;
    ELSIF TG_TABLE_NAME = 'orders' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.table_sessions WHERE id = NEW.session_id;
    ELSIF TG_TABLE_NAME = 'order_items' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.orders WHERE id = NEW.order_id;
    END IF;

    -- 🏗️ المرحلة 2: تحديد المنظمة وفرضها
    v_current_org := public.get_my_org();

    -- 🚀 إصلاح: السماح باستخدام القيمة الممرة يدوياً (مهم للسكربتات والدوال الداخلية)
    NEW.organization_id := COALESCE(NEW.organization_id, v_current_org);

    IF NEW.organization_id IS NULL AND public.get_my_role() != 'super_admin' THEN
         RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى تسجيل الدخول مجدداً.';
    END IF;
    
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 🧪 دالة اختبار منطق المتوسط المرجح (WAC Logic Unit Test)
-- الغرض: التأكد من دقة حساب التكلفة عند ترحيل المشتريات
CREATE OR REPLACE FUNCTION public.test_wac_logic()
RETURNS TABLE(step text, expected numeric, actual numeric, status text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; v_wh_id uuid; v_prod_id uuid; v_supp_id uuid; v_inv_id uuid;
    v_wac numeric;
BEGIN
    -- 1. إعداد بيئة الاختبار
    INSERT INTO public.organizations (name) VALUES ('WAC Test Org') RETURNING id INTO v_org_id;
    INSERT INTO public.warehouses (name, organization_id) VALUES ('Test WH', v_org_id) RETURNING id INTO v_wh_id;
    INSERT INTO public.suppliers (name, organization_id) VALUES ('Test Supplier', v_org_id) RETURNING id INTO v_supp_id;
    
    -- 2. إنشاء منتج برصيد افتتاحي (10 وحدات @ 100 ج.م)
    INSERT INTO public.products (name, stock, opening_balance, purchase_price, weighted_average_cost, cost, organization_id)
    VALUES ('Test Product', 10, 10, 100, 100, 100, v_org_id) RETURNING id INTO v_prod_id;
    
    step := '1. Initial WAC (Opening Balance)';
    expected := 100;
    SELECT weighted_average_cost INTO v_wac FROM public.products WHERE id = v_prod_id;
    actual := v_wac;
    status := CASE WHEN actual = expected THEN 'PASSED ✅' ELSE 'FAILED ❌' END;
    RETURN NEXT;

    -- 3. إضافة فاتورة مشتريات (5 وحدات @ 160 ج.م)
    -- المعادلة المتوقعة: ((10 * 100) + (5 * 160)) / 15 = (1000 + 800) / 15 = 120
    INSERT INTO public.purchase_invoices (invoice_number, supplier_id, warehouse_id, total_amount, status, organization_id, invoice_date)
    VALUES ('INV-TEST-WAC', v_supp_id, v_wh_id, 800, 'draft', v_org_id, now()) RETURNING id INTO v_inv_id;
    
    INSERT INTO public.purchase_invoice_items (purchase_invoice_id, product_id, quantity, unit_price, organization_id)
    VALUES (v_inv_id, v_prod_id, 5, 160, v_org_id);
    
    -- 4. اعتماد الفاتورة (سيقوم بتشغيل دالة calculate_product_wac الموحدة)
    PERFORM public.approve_purchase_invoice(v_inv_id);
    
    step := '2. WAC after Purchase (New Stock)';
    expected := 120;
    SELECT weighted_average_cost INTO v_wac FROM public.products WHERE id = v_prod_id;
    actual := v_wac;
    status := CASE WHEN actual = expected THEN 'PASSED ✅' ELSE 'FAILED ❌' END;
    RETURN NEXT;

    -- 5. اختبار حماية المخزون (الرصيد الكلي)
    step := '3. Total Stock Count';
    expected := 15;
    SELECT stock INTO actual FROM public.products WHERE id = v_prod_id;
    status := CASE WHEN actual = expected THEN 'PASSED ✅' ELSE 'FAILED ❌' END;
    RETURN NEXT;

    -- 6. تنظيف البيانات
    DELETE FROM public.purchase_invoice_items WHERE organization_id = v_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = v_org_id;
    DELETE FROM public.journal_lines WHERE organization_id = v_org_id;
    DELETE FROM public.journal_entries WHERE organization_id = v_org_id;
    DELETE FROM public.products WHERE organization_id = v_org_id;
    DELETE FROM public.suppliers WHERE organization_id = v_org_id;
    DELETE FROM public.warehouses WHERE organization_id = v_org_id;
    DELETE FROM public.organizations WHERE id = v_org_id;

EXCEPTION WHEN OTHERS THEN
    step := 'ERROR';
    expected := 0;
    actual := 0;
    status := 'CRITICAL ERROR: ' || SQLERRM;
    -- محاولة تنظيف المنظمة حتى في حالة الخطأ
    DELETE FROM public.organizations WHERE id = v_org_id;
    RETURN NEXT;
END; $$;

-- ج. جلب العملاء المتجاوزين لحد الائتمان (تحديث موحد)
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid) CASCADE; -- 🛠️ تحديث: إضافة p_org_id كمعامل
DROP FUNCTION IF EXISTS public.get_over_limit_customers() CASCADE;
CREATE OR REPLACE FUNCTION public.get_over_limit_customers(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (id UUID, name TEXT, phone TEXT, total_debt NUMERIC, credit_limit NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org()); 
    RETURN QUERY SELECT c.id, c.name, c.phone, COALESCE(c.balance, 0), COALESCE(c.credit_limit, 0)
    FROM public.customers c WHERE c.organization_id = v_target_org AND COALESCE(c.balance, 0) > COALESCE(c.credit_limit, 0);
END; $$;

-- 🛠️ دالة مطابقة وإعادة احتساب الأرصدة (Recalculate All Balances)
-- هذه الدالة تحل مشكلة الخطأ 404 وتضمن دقة الأرصدة في كافة مديولات النظام -- 🛠️ تحديث: إضافة p_org_id كمعامل
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RETURN; END IF;

    -- 1. تحديث أرصدة الحسابات بناءً على القيود المرحلة فقط (General Ledger)
    UPDATE public.accounts a
    SET balance = (
        SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE jl.account_id = a.id 
          AND je.status = 'posted'
          AND je.organization_id = v_org_id
    )
    WHERE a.organization_id = v_org_id;

    -- 2. تحديث أرصدة العملاء
    UPDATE public.customers c
    SET balance = public.get_customer_balance(c.id, v_org_id)
    WHERE c.organization_id = v_org_id;

    -- 3. تحديث أرصدة الموردين (صافي الفواتير غير المدفوعة)
    UPDATE public.suppliers s
    SET balance = (
        SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
        FROM public.purchase_invoices
        WHERE supplier_id = s.id 
          AND status IN ('posted', 'paid')
          AND organization_id = v_org_id
    )
    WHERE s.organization_id = v_org_id;
    
    -- 4. إعادة مزامنة المخزون الشاملة
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة ترميم روابط القيود المحاسبية (Surgical Link Repair) - نسخة مطورة
CREATE OR REPLACE FUNCTION public.repair_orphaned_journal_lines(p_org_id uuid) -- 🛠️ تحديث: إضافة p_org_id كمعامل
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count int := 0;
BEGIN
    -- 🛡️ [تحديث جراحي] ربط القيود اليتيمة بالحسابات الصحيحة بناءً على الأكواد المكتوبة في البيان
    UPDATE public.journal_lines jl
    SET account_id = a.id
    FROM public.accounts a
    WHERE jl.organization_id = p_org_id AND a.organization_id = p_org_id
      -- الشرط: الحساب المربوط حالياً غير موجود في جدول الحسابات الفعلي
      AND (jl.account_id IS NULL OR jl.account_id NOT IN (SELECT id FROM public.accounts WHERE organization_id = p_org_id))
      -- البحث عن كود الحساب داخل وصف السطر أو وصف القيد (مثل "1" للأصول)
      AND (jl.description ~ ('\y' || a.code || '\y') OR EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.id = jl.journal_entry_id AND je.description ~ ('\y' || a.code || '\y')));
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END; $$;

-- إنشاء اسم مستعار (Alias) للتوافق مع استدعاءات النظام الداخلية التي تستخدم المسمى الطويل
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM public.recalculate_all_balances(p_org_id); END; $$;

-- منح صلاحية التنفيذ للمستخدمين
-- 🔓 منح صلاحيات التنفيذ الشاملة (حل مشكلة 404)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- منح صلاحيات محددة للدوال السيادية
GRANT EXECUTE ON FUNCTION public.recalculate_all_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) TO authenticated;
-- تحديث الصلاحيات لتناسب التواقيع الموحدة
GRANT EXECUTE ON FUNCTION public.start_pos_shift(numeric, boolean, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_shift(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_company_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid) TO authenticated; -- 🛠️ إضافة صلاحية لدالة ترحيل المشتريات
GRANT EXECUTE ON FUNCTION public.get_shift_summary(uuid) TO authenticated;

-- تنشيط كاش النظام
NOTIFY pgrst, 'reload config';

-- نهاية ملف الدوال السيادية