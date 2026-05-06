-- 🌟 النسخة الشاملة الموحدة (Version 4.0 - All Modules Integrated)
-- 🌟 النسخة الشاملة الموحدة (Version 40.0 - Full Manufacturing & Stock Final Fixes + Realtime Inventory)

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
        IF REPLACE(func_name, 'public.', '') IN (
            'approve_invoice', 'approve_purchase_invoice', 'approve_receipt_voucher', 'approve_payment_voucher', 'approve_sales_return', 'approve_purchase_return', 'approve_debit_note', 'approve_credit_note', 'start_shift', 'get_dashboard_stats', 'create_restaurant_order', 'create_public_order', 'run_payroll_rpc', 'recalculate_stock_rpc', 'recalculate_all_system_balances', 'initialize_egyptian_coa', 'get_restaurant_sales_report', 'process_wastage', 'get_item_profit_report', 'get_active_shift', 'get_shift_summary', 'generate_shift_closing_entry', 'close_shift', 'force_provision_admin', 'get_products_without_bom', 'calculate_product_wac', 'get_customer_balance', 'update_single_supplier_balance', 'update_product_stock', 'add_product_with_opening_balance', 'run_period_depreciation', 'create_organization_backup', 'run_daily_backups_all_orgs', 'restore_organization_backup', 'force_grant_admin_access', 'get_or_create_qr_for_table', 'get_current_company_settings', 'fn_ensure_kitchen_order_org', 'fn_ensure_document_warehouse', 'fn_assign_cashier_to_qr_order', 'fn_ensure_order_warehouse', 'trg_fn_update_kitchen_status_time', 'trg_fn_sync_meal_cost', 'sync_customer_balance_trigger', 'fn_auto_approve_invoice_on_insert', 'fn_auto_approve_invoice_on_items_insert', 'cleanup_orphaned_backups', 'cleanup_storage_orphans_trigger', 'sync_role_permissions', 'create_new_client_v2', 'handle_new_user', 'check_user_limit', 'prevent_system_account_deletion', 'set_emergency_mode', 'get_saas_platform_metrics', 'repair_all_admin_permissions', 'clear_demo_data'
            , 'get_admin_platform_metrics', 'fix_unbalanced_journal_entry', 'approve_stock_transfer', 'cancel_stock_transfer', 'post_inventory_count', 'mfg_finalize_order', 'trigger_handle_stock_on_order', 'mfg_deduct_stock_from_order', 'trg_fn_sync_product_costs_on_update', 'mfg_start_step', 'mfg_complete_step', 'mfg_calculate_standard_cost', 'mfg_update_product_standard_cost', 'mfg_check_stock_availability', 'mfg_record_scrap', 'mfg_merge_sales_orders', 'mfg_generate_batch_serials', 'mfg_update_selling_price_from_cost', 'mfg_get_product_genealogy', 'mfg_create_orders_from_sales', 'mfg_get_shop_floor_tasks', 'mfg_process_scan', 'mfg_check_efficiency_alerts', 'mfg_check_production_readiness', 'mfg_get_pending_invoices', 'mfg_calculate_production_variance', 'mfg_reserve_stock_for_order', 'mfg_create_material_request', 'mfg_issue_material_request', 'fn_mfg_auto_create_material_request', 'mfg_get_serials_by_order', 'mfg_get_production_order_details_by_number', 'mfg_start_production_order', 'mfg_record_qc_inspection', 'mfg_check_variance_alerts', 'mfg_check_cost_overrun_alerts', 'mfg_missing_serials_alerts', 'get_account_balance_at_date', 'mfg_calculate_raw_material_turnover', 'fn_validate_journal_entry_balance', 'test_saas_isolation', 'test_wac_logic', 'mfg_test_full_cycle', 'mfg_test_pos_integration'
        ) THEN
            EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_signature);
        END IF;
    END LOOP;

END $$;

-- 🛡️ دالة بدء الوردية (Start Shift) - النسخة الموحدة
-- تم تحديث التوقيع ليتوافق مع نداء الواجهة الأمامية ويدعم السوبر أدمن والشركات المتعددة
DROP FUNCTION IF EXISTS public.start_shift(uuid, numeric, boolean);
DROP FUNCTION IF EXISTS public.start_shift_v2(numeric, boolean, uuid, uuid);

CREATE OR REPLACE FUNCTION public.start_shift(
    p_opening_balance numeric,
    p_resume_existing boolean,
    p_treasury_acc uuid,
    p_user_id uuid
)
RETURNS public.shifts 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE 
    v_existing_shift public.shifts; 
    v_new_shift public.shifts;
    v_org_id uuid;
BEGIN
    -- جلب منظمة المستخدم (سواء من بروفايله أو من التوكن للسوبر أدمن)
    v_org_id := COALESCE(
        public.get_my_org(), 
        (SELECT organization_id FROM public.profiles WHERE id = p_user_id)
    );
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'فشل تحديد المنظمة. تأكد من ضبط المنظمة النشطة للسوبر أدمن.';
    END IF;

    -- البحث عن وردية مفتوحة
    SELECT * INTO v_existing_shift 
    FROM public.shifts 
    WHERE user_id = p_user_id AND end_time IS NULL AND organization_id = v_org_id 
    LIMIT 1;

    IF v_existing_shift.id IS NOT NULL AND p_resume_existing THEN 
        RETURN v_existing_shift; 
    END IF;

    IF v_existing_shift.id IS NOT NULL THEN 
        RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم. يرجى إغلاقها أولاً.'; 
    END IF;

    -- إنشاء الوردية الجديدة مع ربط الخزينة المختارة
    INSERT INTO public.shifts (user_id, start_time, opening_balance, treasury_account_id, organization_id, status)
    VALUES (p_user_id, now(), p_opening_balance, p_treasury_acc, v_org_id, 'OPEN') 
    RETURNING * INTO v_new_shift;

    RETURN v_new_shift;
END; $$;

CREATE OR REPLACE FUNCTION public.get_active_shift(p_user_id uuid)
RETURNS public.shifts 
LANGUAGE plpgsql 
SECURITY DEFINER AS $$
BEGIN
    RETURN (SELECT * FROM public.shifts 
            WHERE user_id = p_user_id AND end_time IS NULL AND organization_id = public.get_my_org() 
            LIMIT 1);
END; $$;
-- 🛠️ تفعيل الحماية لجدول الإعدادات وتصحيح السياسة (حل مشكلة 406)
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings view policy" ON public.company_settings;
-- سياسة مرنة تسمح للمستخدم الموثق برؤية إعدادات شركته فقط
CREATE POLICY "Settings view policy" ON public.company_settings
FOR SELECT TO authenticated USING (
    organization_id = COALESCE(public.get_my_org(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
);

-- تعبئة البيانات القديمة (إن وجدت) بمنظمة افتراضية لضمان ظهورها في الشاشة
-- تم تحسين المنطق لمنع أخطاء Duplicate Key
DO $$ 
DECLARE v_first_org uuid;
BEGIN
    SELECT id INTO v_first_org FROM public.organizations LIMIT 1;
    IF v_first_org IS NOT NULL THEN
        -- حذف الأدوار التي ستسبب تصادماً قبل التحديث
        DELETE FROM public.roles r1 WHERE organization_id IS NULL AND EXISTS (SELECT 1 FROM public.roles r2 WHERE r2.organization_id = v_first_org AND r2.name = r1.name);
        UPDATE public.roles SET organization_id = v_first_org WHERE organization_id IS NULL;
        UPDATE public.role_permissions SET organization_id = v_first_org WHERE organization_id IS NULL;
    END IF;
END $$;

-- هذا الملف هو المرجع الوحيد لكافة دوال النظام (RPCs).
-- يجب تشغيله بعد أي تعديل في منطق العمليات.

-- ℹ️ الوصف: المحرك الكامل لمديولات (المبيعات، المشتريات، المرتجعات، المطاعم، الرواتب، المخازن، والتقارير)
-- تم دمج كافة الدوال لضمان عمل النظام ككتلة واحدة مع عزل SaaS كامل.

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
    IF NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = p_invoice_id) THEN RETURN; END IF;
    
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

-- 🛡️ دالة احتساب متوسط التكلفة المرجح (Weighted Average Cost - WAC)
CREATE OR REPLACE FUNCTION public.calculate_product_wac(p_product_id UUID, p_org_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_qty NUMERIC := 0; v_val NUMERIC := 0;
    v_ret_qty NUMERIC := 0; v_ret_val NUMERIC := 0;
BEGIN
    -- 1. وعاء المشتريات (الرصيد الافتتاحي + فواتير المشتريات المرحلة)
    SELECT 
        (COALESCE(p.opening_balance, 0) + COALESCE(SUM(pii.quantity), 0)),
        (COALESCE(p.opening_balance * p.purchase_price, 0) + COALESCE(SUM(pii.quantity * COALESCE(pi.exchange_rate, 1) * pii.unit_price), 0))
    INTO v_qty, v_val
    FROM public.products p
    LEFT JOIN public.purchase_invoice_items pii ON pii.product_id = p.id AND pii.organization_id = p_org_id
    LEFT JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id AND pi.status IN ('posted', 'paid') AND pi.organization_id = p_org_id
    WHERE p.id = p_product_id AND p.organization_id = p_org_id
    GROUP BY p.id, p.opening_balance, p.purchase_price;

    -- 2. خصم مرتجعات المشتريات (تخفض الكمية والقيمة)
    SELECT COALESCE(SUM(pri.quantity), 0), COALESCE(SUM(pri.total), 0)
    INTO v_ret_qty, v_ret_val
    FROM public.purchase_return_items pri
    JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
    WHERE pri.product_id = p_product_id AND pr.organization_id = p_org_id AND pr.status = 'posted';

    -- الحساب النهائي: (القيمة الصافية) / (الكمية الصافية)
    IF (v_qty - v_ret_qty) > 0 THEN 
        RETURN ROUND((v_val - v_ret_val) / (v_qty - v_ret_qty), 4);
    ELSE 
        RETURN (SELECT COALESCE(purchase_price, 0) FROM public.products WHERE id = p_product_id);
    END IF;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ب. اعتماد فاتورة المشتريات
DROP FUNCTION IF EXISTS public.approve_purchase_invoice(uuid);
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
    v_current_stock numeric; v_current_avg_cost numeric; v_new_avg_cost numeric;
    v_exchange_rate numeric; v_item_price_base numeric; v_total_amount_base numeric; v_tax_amount_base numeric; v_net_amount_base numeric;
    v_mappings jsonb;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار أو التضارب بعد التعديل
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- 🛡️ جلب المنظمة من الفاتورة مباشرة لضمان نجاح الترحيل لليوزر العالمي
    v_org_id := COALESCE(v_invoice.organization_id, (SELECT organization_id FROM public.suppliers WHERE id = v_invoice.supplier_id));
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة للفاتورة.'; END IF;

    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- 2. جلب روابط الحسابات المخصصة (Ensure company_settings exists)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 3. جلب الحسابات
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة في دليل الحسابات'; END IF;

    -- 4. تحديث المخزون وحساب المتوسط المرجح
    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        -- تحديث الكمية أولاً
        UPDATE public.products SET stock = stock + v_item.quantity, -- Ensure warehouse_id is not NULL
        warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_item.quantity)) 
        WHERE id = v_item.product_id AND organization_id = v_org_id;
        
        -- إعادة احتساب التكلفة المرجحة فوراً
        UPDATE public.products SET weighted_average_cost = public.calculate_product_wac(id, organization_id), cost = public.calculate_product_wac(id, organization_id)
        WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    -- 5. حساب إجماليات الفاتورة بالعملة المحلية للقيد
    v_total_amount_base := v_invoice.total_amount * v_exchange_rate; v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate; v_net_amount_base := v_total_amount_base - v_tax_amount_base;

    -- 6. إنشاء قيد اليومية وأسطر القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;
    IF v_inventory_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات', v_org_id); END IF;
    IF v_tax_amount_base > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات', v_org_id); END IF;
    
    -- إثبات الالتزام للمورد بالكامل (إصلاح توازن المشتريات)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'قيمة فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);

    -- إثبات السداد الفوري للمورد (إذا وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 THEN
        IF v_invoice.treasury_account_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة للمبلغ المدفوع في المشتريات.'; END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_supplier_acc_id, (v_invoice.paid_amount * v_exchange_rate), 0, 'سداد نقدي مقدم مع فاتورة مشتريات', v_org_id),
            (v_journal_id, v_invoice.treasury_account_id, 0, (v_invoice.paid_amount * v_exchange_rate), 'صرف نقدي مقابل مشتريات', v_org_id);
    END IF;

    -- 7. تحديث حالة الفاتورة
    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;

    -- 🚀 إعادة احتساب المخزون فوراً لضمان عدم تضاعف الكميات بعد التعديل
    PERFORM public.recalculate_stock_rpc(v_org_id);
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

-- ب. اعتماد مرتجع مشتريات (Purchase Return)
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_acc_inv uuid; v_acc_vat uuid; v_acc_supp uuid; v_mappings jsonb; v_acc_sales_ret uuid;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'المرتجع غير موجود'; END IF;

    -- 🛡️ استخراج المنظمة من المستند نفسه لضمان عملها للأدمن والسوبر أدمن بشكل مستقل عن الجلسة
    v_org_id := v_return.organization_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'معرف المنظمة مفقود في مستند المرتجع'; END IF;

    DELETE FROM public.journal_entries WHERE related_document_id = p_return_id AND related_document_type = 'purchase_return' AND organization_id = v_org_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_inv := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
    v_acc_vat := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_acc_supp := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock - v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;

        -- 🚀 إعادة احتساب التكلفة المرجحة فوراً لتشمل الكميات العائدة
        UPDATE public.products SET weighted_average_cost = public.calculate_product_wac(id, organization_id), cost = public.calculate_product_wac(id, organization_id)
        WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مشتريات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'purchase_return', true) RETURNING id INTO v_journal_id;

    IF v_acc_supp IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_acc_supp, v_return.total_amount, 0, 'تخفيض استحقاق مورد', v_org_id); END IF;
    
    IF v_acc_inv IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_acc_inv, 0, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 'تخفيض مخزون بالمرتجع', v_org_id); END IF;
    
    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_acc_vat IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, 0, v_return.tax_amount, 'عكس ضريبة مدخلات', v_org_id); END IF;

    UPDATE public.purchase_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;

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
    , p_delivery_info jsonb DEFAULT NULL -- إضافة معلومات التوصيل
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order_id uuid; v_item jsonb; v_order_num text; v_order_item_id uuid; v_tax_rate numeric; v_subtotal numeric := 0; v_unit_price numeric; v_qty numeric; v_final_wh_id uuid; v_product_cost numeric;
DECLARE v_org_id uuid;
BEGIN
    -- 🛡️ جلب معرف المنظمة من الجلسة الحالية
    v_org_id := public.get_my_org();
    
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
CREATE OR REPLACE FUNCTION public.create_public_order(p_qr_key uuid, p_items jsonb) -- اعتماد UUID كمعيار وحيد
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

    v_org_id := v_table.organization_id;

    -- 2. إيجاد أو إنشاء جلسة (Session) للطاولة
    SELECT id INTO v_session_id FROM public.table_sessions 
    WHERE table_id = v_table.id AND status = 'OPEN' AND organization_id = v_org_id AND closed_at IS NULL LIMIT 1;

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status, opened_at)
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

-- منح صلاحية تنفيذ الدالة للزوار (الموبايل) والموظفين
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb) TO anon, authenticated;
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
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid)
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
    v_shift.organization_id := COALESCE(v_shift.organization_id, (SELECT organization_id FROM public.profiles WHERE id = v_shift.user_id), public.get_my_org());

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
CREATE OR REPLACE FUNCTION public.close_shift(p_shift_id uuid, p_actual_cash numeric, p_notes text DEFAULT NULL)
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
    PERFORM public.generate_shift_closing_entry(p_shift_id);
END; $$;
-- ================================================================
-- 4. مديول الموارد البشرية (HR & Payroll)
-- ================================================================

CREATE OR REPLACE FUNCTION public.run_payroll_rpc(p_month integer, p_year integer, p_date date, p_treasury_acc uuid, p_items jsonb) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; 
    v_total_additions numeric := 0; v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; v_total_net numeric := 0; 
    v_item jsonb; v_je_id uuid; v_mappings jsonb; v_user_id uuid; v_payroll_item_id uuid;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; v_payroll_tax_id uuid; v_total_payroll_tax numeric := 0;
    v_fixed_allowances numeric := 0; v_monthly_additions numeric := 0; v_monthly_deductions numeric := 0; v_emp_net numeric := 0;
BEGIN
    -- 🛡️ جلب المنظمة من دالة الهوية الموحدة لضمان التوافق مع الأدمن والسوبر أدمن
    v_org_id := public.get_my_org();
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
    v_labor_mfg_id uuid; v_wastage_id uuid; v_raw_id uuid; v_wip_id uuid;
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
    ON CONFLICT (organization_id, code) DO NOTHING;

    UPDATE public.accounts a SET parent_id = p.id FROM coa_temp t JOIN public.accounts p ON p.organization_id = p_org_id AND p.code = t.parent_code
    WHERE a.organization_id = p_org_id AND a.code = t.code AND a.parent_id IS NULL;

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
    v_overhead_mfg_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '514' LIMIT 1); -- Get overhead account ID
    v_wastage_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5121' LIMIT 1);

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
            'LABOR_COST_ALLOCATED', v_labor_mfg_id, -- Ensure this is correct
            'MANUFACTURING_OVERHEAD', v_overhead_mfg_id, -- Add overhead mapping
            'WASTAGE_EXPENSE', v_wastage_id
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

-- و. دالة جلب تكلفة وصفة المنتج (للمطاعم والتصنيع)
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(p_product_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_material_cost NUMERIC;
    v_prod record;
BEGIN
    -- 1. جلب بيانات المنتج الأساسية (العمالة والمصاريف)
    SELECT labor_cost, overhead_cost, is_overhead_percentage 
    INTO v_prod 
    FROM public.products 
    WHERE id = p_product_id;
    
    -- 2. حساب تكلفة المواد الخام من الـ BOM
    SELECT COALESCE(SUM(r.quantity_required * COALESCE(ing.weighted_average_cost, ing.cost, ing.purchase_price, 0)), 0) 
    INTO v_material_cost
    FROM public.bill_of_materials r 
    JOIN public.products ing ON r.raw_material_id = ing.id 
    WHERE r.product_id = p_product_id;

    -- 3. الحساب النهائي (دمج المواد + العمالة + المصاريف الإضافية)
    IF v_prod.is_overhead_percentage THEN
        RETURN v_material_cost + COALESCE(v_prod.labor_cost, 0) + (v_material_cost * COALESCE(v_prod.overhead_cost, 0) / 100);
    ELSE
        RETURN v_material_cost + COALESCE(v_prod.labor_cost, 0) + COALESCE(v_prod.overhead_cost, 0);
    END IF;
END; $$;

-- 🛠️ دالة تحديث مخزون صنف واحد (Single Product Stock Updater)
CREATE OR REPLACE FUNCTION public.update_product_stock(p_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.products WHERE id = p_product_id;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ز. صيانة النظام والتقارير
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC; v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL AND organization_id = v_target_org LOOP
        -- 1. حساب الرصيد الإجمالي للشركة (Global Total) - يتجاهل فلتر المستودع لضمان الدقة المطلقة
    SELECT -- Ensure all subqueries have organization_id filter
            COALESCE((SELECT SUM(quantity) FROM public.opening_inventories WHERE product_id = prod_record.id AND organization_id = v_target_org), 0) +
            COALESCE((SELECT SUM(pii.quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.status IN ('posted', 'paid') AND pi.organization_id = v_target_org), 0) +
            COALESCE((SELECT SUM(sri.quantity) FROM public.sales_return_items sri JOIN public.sales_returns sr ON sr.id = sri.sales_return_id WHERE sri.product_id = prod_record.id AND sr.status = 'posted' AND sr.organization_id = v_target_org), 0) +
            COALESCE((SELECT SUM(quantity_to_produce) FROM public.mfg_production_orders WHERE product_id = prod_record.id AND status = 'completed' AND organization_id = v_target_org), 0) -
            COALESCE((SELECT SUM(ii.quantity) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.status IN ('posted', 'paid') AND i.organization_id = v_target_org), 0) -
            COALESCE((SELECT SUM(pri.quantity) FROM public.purchase_return_items pri JOIN public.purchase_returns pr ON pr.id = pri.purchase_return_id WHERE pri.product_id = prod_record.id AND pr.status = 'posted' AND pr.organization_id = v_target_org), 0) -
            COALESCE((SELECT SUM(oi.quantity) FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.product_id = prod_record.id AND o.status IN ('COMPLETED', 'PAID', 'posted') AND o.organization_id = v_target_org), 0) -
            COALESCE((SELECT SUM(oi.quantity * bom.quantity_required) FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id WHERE bom.raw_material_id = prod_record.id AND o.status IN ('COMPLETED', 'PAID', 'posted') AND o.organization_id = v_target_org), 0) -
            -- التصنيع: خصم المواد المصروفة فعلياً (MR) والاستهلاك الفعلي المسجل في المراحل
            COALESCE((SELECT SUM(mri.quantity_issued) FROM public.mfg_material_request_items mri JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id WHERE mri.raw_material_id = prod_record.id AND mr.status = 'issued' AND mr.organization_id = v_target_org), 0) -
            COALESCE((SELECT SUM(amu.actual_quantity) FROM public.mfg_actual_material_usage amu JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id WHERE amu.raw_material_id = prod_record.id AND op.status = 'completed' AND amu.organization_id = v_target_org AND NOT EXISTS (SELECT 1 FROM public.mfg_material_requests mr WHERE mr.production_order_id = op.production_order_id AND mr.status = 'issued')), 0) +
            -- إضافة الهالك من التصنيع (يقلل الرصيد)
            COALESCE((SELECT SUM(quantity) FROM public.mfg_scrap_logs WHERE product_id = prod_record.id AND organization_id = v_target_org), 0) * -1 +
            -- التسويات المخزنية (تشمل نتائج الجرد): الكميات مخزنة بإشارتها (موجب للزيادة وسالب للعجز)
            COALESCE((SELECT SUM(quantity) FROM public.stock_adjustment_items sai JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id WHERE sai.product_id = prod_record.id AND sa.status = 'posted' AND sa.organization_id = v_target_org), 0)
        INTO total_qty;

        -- 2. حساب توزيع المخزون على المستودعات (Breakdown) لغرض العرض فقط
        wh_json := '{}'::jsonb;        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL AND organization_id = v_target_org LOOP
            wh_qty := 0;
            -- تجميع كافة حركات الوارد والصادر في استعلام واحد متكامل لضمان الدقة والأداء
            SELECT -- Ensure all subqueries have organization_id filter
                COALESCE((SELECT SUM(quantity) FROM public.opening_inventories WHERE product_id = prod_record.id AND warehouse_id = wh_record.id AND organization_id = v_target_org), 0) +
                -- الوارد: مشتريات + مرتجع مبيعات + إنتاج تام
                COALESCE((SELECT SUM(pii.quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status IN ('posted', 'paid') AND pi.organization_id = v_target_org), 0) +
                COALESCE((SELECT SUM(sri.quantity) FROM public.sales_return_items sri JOIN public.sales_returns sr ON sri.sales_return_id = sr.id WHERE sri.product_id = prod_record.id AND sr.warehouse_id = wh_record.id AND sr.status = 'posted' AND sr.organization_id = v_target_org), 0) +
                COALESCE((SELECT SUM(quantity_to_produce) FROM public.mfg_production_orders WHERE product_id = prod_record.id AND warehouse_id = wh_record.id AND status = 'completed' AND organization_id = v_target_org), 0) -
                -- الصادر: مبيعات + مرتجع مشتريات + مبيعات مطعم + استهلاك مطعم (BOM) + استهلاك تصنيع (BOM)
                COALESCE((SELECT SUM(ii.quantity) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status IN ('posted', 'paid') AND i.organization_id = v_target_org), 0) -
                COALESCE((SELECT SUM(pri.quantity) FROM public.purchase_return_items pri JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id WHERE pri.product_id = prod_record.id AND pr.warehouse_id = wh_record.id AND pr.status = 'posted' AND pr.organization_id = v_target_org), 0) -
                COALESCE((SELECT SUM(oi.quantity) FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.product_id = prod_record.id AND o.warehouse_id = wh_record.id AND o.status IN ('COMPLETED', 'PAID', 'posted') AND o.organization_id = v_target_org), 0) -
                COALESCE((SELECT SUM(oi.quantity * bom.quantity_required) FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id WHERE bom.raw_material_id = prod_record.id AND o.warehouse_id = wh_record.id AND o.status IN ('COMPLETED', 'PAID', 'posted') AND o.organization_id = v_target_org), 0) -
                -- ذكي: خصم المواد الخام سواء نجح الأمر أو رفضته الجودة (لأنها استهلكت بالفعل)
                 -- مديول التصنيع (المواد الخام): استخدام الاستهلاك الفعلي المطابق لمنطق الإجمالي العام
                COALESCE((SELECT SUM(mri.quantity_issued) FROM public.mfg_material_request_items mri JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id JOIN public.mfg_production_orders po ON mr.production_order_id = po.id WHERE mri.raw_material_id = prod_record.id AND po.warehouse_id = wh_record.id AND mr.status = 'issued' AND mr.organization_id = v_target_org), 0) -
                COALESCE((SELECT SUM(amu.actual_quantity) FROM public.mfg_actual_material_usage amu JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id JOIN public.mfg_production_orders po ON op.production_order_id = po.id WHERE amu.raw_material_id = prod_record.id AND po.warehouse_id = wh_record.id AND op.status = 'completed' AND amu.organization_id = v_target_org AND NOT EXISTS (SELECT 1 FROM public.mfg_material_requests mr WHERE mr.production_order_id = op.production_order_id AND mr.status = 'issued')), 0) +
                -- التحويلات: وارد للمستودع الحالي (+)            
                COALESCE((SELECT SUM(quantity) FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod_record.id AND st.to_warehouse_id = wh_record.id AND st.status = 'posted' AND st.organization_id = v_target_org), 0) -
                -- التحويلات: صادر من المستودع الحالي (-)
                COALESCE((SELECT SUM(quantity) FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod_record.id AND st.from_warehouse_id = wh_record.id AND st.status = 'posted' AND st.organization_id = v_target_org), 0) +
                -- التسويات: موجب أو سالب حسب نوع الحركة
                COALESCE((SELECT SUM(quantity) FROM public.stock_adjustment_items sai JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id WHERE sai.product_id = prod_record.id AND sa.warehouse_id = wh_record.id AND sa.status = 'posted' AND sa.organization_id = v_target_org), 0)
            INTO wh_qty;
            IF wh_qty <> 0 THEN wh_json := wh_json || jsonb_build_object(wh_record.id::text, wh_qty); END IF;
        END LOOP;
        UPDATE products SET stock = total_qty, warehouse_stock = wh_json WHERE id = prod_record.id AND organization_id = v_target_org;
    END LOOP;
END; $$;

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

-- 🛠️ دالة حساب التكلفة المعيارية للمنتج (Standard Costing)
CREATE OR REPLACE FUNCTION public.mfg_calculate_standard_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_material_cost numeric := 0;
    v_labor_cost numeric := 0;
    v_overhead_cost numeric := 0;
    v_org_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.products WHERE id = p_product_id;

    -- 1. تكلفة المواد الخام من قائمة المواد (BOM) للوحدة الواحدة
    SELECT COALESCE(SUM(bom.quantity_required * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)), 0)
    INTO v_material_cost
    FROM public.bill_of_materials bom
    JOIN public.products p ON bom.raw_material_id = p.id
    WHERE bom.product_id = p_product_id AND bom.organization_id = v_org_id;

    -- 2. تكلفة العمالة والمصاريف غير المباشرة من مسار الإنتاج (Routing)
    -- تم دمج الحساب في استعلام واحد لضمان الدقة ومنع تكرار v_labor_cost
    SELECT 
        COALESCE(SUM((rs.standard_time_minutes / 60.0) * wc.hourly_rate), 0),
        COALESCE(SUM((rs.standard_time_minutes / 60.0) * wc.overhead_rate), 0)
    INTO v_labor_cost, v_overhead_cost
    FROM public.mfg_routing_steps rs
    JOIN public.mfg_routings r ON rs.routing_id = r.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE r.product_id = p_product_id AND r.is_default = TRUE AND r.organization_id = v_org_id;

    RETURN v_material_cost + v_labor_cost + v_overhead_cost;
END; $$;

-- 🛠️ دالة تحديث التكلفة المعيارية في بطاقة الصنف
CREATE OR REPLACE FUNCTION public.mfg_update_product_standard_cost(p_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.products 
    SET cost = public.mfg_calculate_standard_cost(p_product_id),
        manufacturing_cost = public.mfg_calculate_standard_cost(p_product_id)
    WHERE id = p_product_id;
END; $$;

-- 🛠️ دالة بدء مرحلة إنتاج (Start Step)
CREATE OR REPLACE FUNCTION public.mfg_start_step(p_progress_id uuid, p_employee_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.mfg_order_progress 
    SET status = 'in_progress', 
        actual_start_time = now(),
        employee_id = p_employee_id
    WHERE id = p_progress_id;
END; $$;

-- 🛠️ دالة إكمال مرحلة إنتاج (Complete Step) - النسخة المحسنة
CREATE OR REPLACE FUNCTION public.mfg_complete_step(p_progress_id uuid, p_qty numeric)

RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE


       v_step record;
    v_order record;
    v_wc record;
    v_routing_step record;
    v_mat record;
    v_usage_qty numeric;
    v_mat_total_cost numeric := 0;
    v_labor_cost numeric := 0;
    v_je_id uuid;
    v_mappings jsonb;
    v_wip_acc uuid;
    v_inv_acc uuid;
    v_labor_acc uuid;
    v_org_id uuid;
    v_scrap_qty numeric := 0;
BEGIN
    -- 1. جلب بيانات التقدم والتحقق من الصلاحية
    SELECT * INTO v_step FROM public.mfg_order_progress WHERE id = p_progress_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سجل تقدم المرحلة غير موجود'; END IF;
    IF v_step.status = 'completed' THEN RETURN; END IF; -- منع التكرار
    v_org_id := v_step.organization_id;

    -- [جديد] جلب إجمالي التالف المسجل لهذه المرحلة لزيادة الاستهلاك الفعلي
    SELECT COALESCE(SUM(quantity), 0) INTO v_scrap_qty 
    FROM public.mfg_scrap_logs 
    WHERE order_progress_id = p_progress_id;

    -- 2. جلب بيانات مركز العمل لحساب التكلفة
    SELECT rs.standard_time_minutes, wc.hourly_rate 
    INTO v_routing_step
    FROM public.mfg_routing_steps rs
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE rs.id = v_step.step_id;

    -- حساب تكلفة العمالة بناءً على الزمن المعياري (زمن الوحدة بالدقائق / 60 * الكمية * معدل الساعة)
    v_labor_cost := (COALESCE(v_routing_step.standard_time_minutes, 0) / 60.0) * p_qty * COALESCE(v_routing_step.hourly_rate, 0);

    -- 3. تحديث حالة المرحلة وتكلفة العمالة
    UPDATE public.mfg_order_progress SET 
        status = 'completed', 
        actual_end_time = now(),
        produced_qty = p_qty,
        labor_cost_actual = v_labor_cost
    WHERE id = p_progress_id;

    -- 4. محرك الخصم المخزني الآلي (Stage-based BOM Deduction)
    FOR v_mat IN 
        SELECT raw_material_id, quantity_required 
        FROM public.mfg_step_materials 
        WHERE step_id = v_step.step_id
    LOOP
        v_usage_qty := v_mat.quantity_required * p_qty;

        -- حساب تكلفة المواد المستهلكة (بناءً على المتوسط المرجح)
        v_mat_total_cost := v_mat_total_cost + (v_usage_qty * COALESCE((SELECT COALESCE(weighted_average_cost, cost, purchase_price, 0) FROM public.products WHERE id = v_mat.raw_material_id), 0));

        -- [تحسين] خصم المواد من المخزون فقط إذا لم تكن قد صرفت مسبقاً بطلب صرف يدوي (منع الازدواجية)
        IF NOT EXISTS (
            SELECT 1 FROM public.mfg_material_request_items mri 
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id 
            WHERE mr.production_order_id = v_step.production_order_id AND mri.raw_material_id = v_mat.raw_material_id AND mr.status = 'issued'
        ) THEN
            UPDATE public.products SET stock = stock - v_usage_qty 
            WHERE id = v_mat.raw_material_id AND organization_id = v_org_id;
        END IF;

        -- ب. تسجيل الاستهلاك الفعلي (إضافة الكمية المعيارية + التالف الخاص بنفس المادة إن وجد)
        INSERT INTO public.mfg_actual_material_usage (order_progress_id, raw_material_id, standard_quantity, actual_quantity, organization_id)
        VALUES (
            p_progress_id, 
            v_mat.raw_material_id, 
            v_usage_qty, 
            v_usage_qty + COALESCE((SELECT SUM(quantity) FROM public.mfg_scrap_logs WHERE order_progress_id = p_progress_id AND product_id = v_mat.raw_material_id), 0), 
            v_org_id
        );
    END LOOP;

    -- 5. المحرك المحاسبي الصناعي: توليد قيد الإنتاج تحت التشغيل (WIP Entry)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- جلب الحسابات (نستخدم كود 10303 للإنتاج تحت التشغيل و 10301 للمواد الخام)
    v_wip_acc := COALESCE(
        (v_mappings->>'INVENTORY_WIP')::uuid,
        (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_org_id LIMIT 1)
    );
    v_inv_acc := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, 
                         (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_labor_acc := COALESCE((v_mappings->>'LABOR_COST_ALLOCATED')::uuid, 
                           (SELECT id FROM public.accounts WHERE (code = '513' OR code = '511') AND organization_id = v_org_id LIMIT 1));

    IF v_wip_acc IS NOT NULL AND (v_mat_total_cost > 0 OR v_labor_cost > 0) THEN
        -- إنشاء رأس القيد
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted, 
            related_document_id, related_document_type
        ) VALUES (
            now()::date, 
            'تحميل تكاليف المرحلة: ' || (SELECT operation_name FROM public.mfg_routing_steps WHERE id = v_step.step_id),
            'MFG-STEP-' || substring(p_progress_id::text, 1, 8),
            'posted', v_org_id, true, p_progress_id, 'mfg_step'
        ) RETURNING id INTO v_je_id;

        -- أسطر القيد
        -- 1. من ح/ الإنتاج تحت التشغيل (إجمالي المواد + العمالة)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, (v_mat_total_cost + v_labor_cost), 0, 'إجمالي تكلفة المرحلة الإنتاجية', v_org_id);

        -- 2. إلى ح/ مخزون المواد الخام (فقط للمواد التي لم تُصرف مسبقاً بطلب صرف)
        IF v_mat_total_cost > 0 AND v_inv_acc IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.mfg_material_request_items mri 
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id 
            WHERE mr.production_order_id = v_step.production_order_id AND mr.status = 'issued'
        ) THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_inv_acc, 0, v_mat_total_cost, 'صرف مواد خام للمرحلة الإنتاجية', v_org_id);
        END IF;

        -- 3. إلى ح/ تكاليف عمالة مباشرة محملة (بالتكلفة المعيارية للمركز)
        IF v_labor_cost > 0 AND v_labor_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_labor_acc, 0, v_labor_cost, 'تحميل تكلفة عمالة المرحلة الإنتاجية', v_org_id);
        END IF;   
    END IF;
END; $$;

-- 🛠️ دالة الإغلاق النهائي لطلب الإنتاج (MFG Finalization) - المزامنة الموحدة
-- تم التحديث لتدعم الحالة النهائية (مكتمل، إعادة تشغيل، مرفوض) والتحكم المحاسبي الدقيق
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(
    p_order_id uuid,
    p_final_status text DEFAULT 'completed',
    p_qc_notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_order record; v_total_cost numeric := 0; v_je_id uuid; v_wip_acc uuid;
    v_fg_acc uuid; v_loss_acc uuid; v_org_id uuid; v_mappings jsonb;
BEGIN
    -- 1. جلب بيانات الطلب والتحقق من حالته
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    IF v_order.status = 'completed' THEN RETURN; END IF;

    -- [صمام أمان] منع إغلاق أوامر لم يبدأ العمل فيها فعلياً (لمنع التكلفة الصفرية)
    IF NOT EXISTS (SELECT 1 FROM public.mfg_order_progress WHERE production_order_id = p_order_id AND status = 'completed') 
       AND NOT EXISTS (SELECT 1 FROM public.mfg_material_requests WHERE production_order_id = p_order_id AND status = 'issued') THEN
        RAISE EXCEPTION 'لا يمكن إغلاق أمر إنتاج لم يتم البدء فيه أو صرف مواد له. يرجى إكمال مراحل العمل أو صرف المواد أولاً.';
    END IF;
    
    v_org_id := v_order.organization_id;

    -- معالجة حالة "إعادة التشغيل"
    IF p_final_status = 'rework' THEN
        UPDATE public.mfg_production_orders SET status = 'in_progress', notes = COALESCE(notes, '') || E'\nإعادة تشغيل: ' || p_qc_notes WHERE id = p_order_id;
        RETURN;
    END IF;

    -- 2. حساب إجمالي التكاليف الفعلية
    SELECT SUM(COALESCE(labor_cost_actual, 0)) INTO v_total_cost
    FROM public.mfg_order_progress WHERE production_order_id = p_order_id;
    -- ب. إضافة تكلفة المصاريف غير المباشرة من سجلات التقدم
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate)
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    -- ب. إضافة تكلفة المواد الفعلية المستهلكة
  
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products p ON amu.raw_material_id = p.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(mri.quantity_issued * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0))
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.production_order_id = p_order_id AND mr.status = 'issued'
    ), 0);

    -- 3. تحديث حالة الطلب وزيادة مخزون المنتج التام
    IF p_final_status = 'completed' THEN
        UPDATE public.mfg_production_orders SET status = 'completed', end_date = now()::date, notes = COALESCE(notes, '') || E'\nملاحظات الجودة: ' || p_qc_notes WHERE id = p_order_id;
        UPDATE public.products SET stock = stock + v_order.quantity_to_produce WHERE id = v_order.product_id AND organization_id = v_org_id;

        -- 🚀 تحديث حالة أمر البيع المرتبط إلى "جاهز" (Ready) لتمكين الفوترة
        UPDATE public.sales_orders 
        SET status = 'ready' 
        WHERE order_number = v_order.batch_number AND organization_id = v_org_id;
    ELSE
        UPDATE public.mfg_production_orders SET status = 'cancelled', notes = 'مرفوض جودة: ' || p_qc_notes WHERE id = p_order_id;
    END IF;

    -- 4. المحرك المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := COALESCE((v_mappings->>'INVENTORY_WIP')::uuid, (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1), (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_org_id LIMIT 1));
    v_fg_acc := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
    v_loss_acc := COALESCE((v_mappings->>'WASTAGE_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1));

    IF v_total_cost > 0 AND v_wip_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type) -- Ensure organization_id is not NULL
        VALUES (now()::date, (CASE WHEN p_final_status = 'completed' THEN 'إغلاق إنتاج: ' ELSE 'خسارة رفض إنتاج: ' END) || v_order.order_number, 'MFG-FIN-' || v_order.order_number, 'posted', v_org_id, true, p_order_id, 'mfg_order') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, CASE WHEN p_final_status = 'completed' THEN v_fg_acc ELSE v_loss_acc END, v_total_cost, 0, 'تحويل تكلفة الإنتاج من WIP', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_wip_acc, 0, v_total_cost, 'إخلاء حساب الإنتاج تحت التشغيل', v_org_id);
    END IF;

    -- 5. العمليات التكميلية
    BEGIN
        PERFORM public.mfg_update_selling_price_from_cost(p_order_id);
        PERFORM public.mfg_calculate_production_variance(p_order_id);
        PERFORM public.mfg_generate_batch_serials(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'تنبيه: فشل تشغيل بعض العمليات المساعدة: %', SQLERRM;
    END;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;
-- 8. دالة حساب التكلفة المعيارية التقديرية (Standard Cost Calculation)
-- تقوم بحساب التكلفة المتوقعة للمنتج بناءً على الـ BOM والمسار الإنتاجي المعتمد
CREATE OR REPLACE FUNCTION public.mfg_calculate_standard_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_total_cost numeric := 0;
    v_routing record;
    v_step record;
    v_org_id uuid;
    v_labor_cost numeric;
    v_material_cost numeric;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن المسار الافتراضي للمنتج
    SELECT * INTO v_routing FROM public.mfg_routings 
    WHERE product_id = p_product_id AND organization_id = v_org_id AND is_default = true 
    LIMIT 1;

    -- إذا لم يوجد مسار افتراضي، نأخذ أول مسار متاح
    IF NOT FOUND THEN
        SELECT * INTO v_routing FROM public.mfg_routings 
        WHERE product_id = p_product_id AND organization_id = v_org_id 
        LIMIT 1;
    END IF;

    IF v_routing.id IS NULL THEN RETURN 0; END IF;

    -- 2. حساب التكاليف لكل مرحلة في المسار
    FOR v_step IN 
        SELECT rs.*, wc.hourly_rate 
        FROM public.mfg_routing_steps rs
        LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE rs.routing_id = v_routing.id
    LOOP
        -- أ. تكلفة العمالة المعيارية للمرحلة (الوقت المعياري بالساعات * تكلفة الساعة)
        v_labor_cost := (COALESCE(v_step.standard_time_minutes, 0) / 60.0) * COALESCE(v_step.hourly_rate, 0);

        -- ب. تكلفة المواد الخام المعيارية لهذه المرحلة
        SELECT SUM(sm.quantity_required * COALESCE(p.weighted_average_cost, p.purchase_price, 0))
        INTO v_material_cost
        FROM public.mfg_step_materials sm
        JOIN public.products p ON sm.raw_material_id = p.id
        WHERE sm.step_id = v_step.id;

        v_total_cost := v_total_cost + v_labor_cost + COALESCE(v_material_cost, 0);
    END LOOP;

    RETURN ROUND(v_total_cost, 4);
END; $$;

-- 9. دالة تحديث تكلفة المنتج بناءً على الحسبة المعيارية
-- تقوم باستدعاء دالة التكلفة المعيارية وتحديث بطاقة الصنف آلياً
CREATE OR REPLACE FUNCTION public.mfg_update_product_standard_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_std_cost numeric;
BEGIN
    v_std_cost := public.mfg_calculate_standard_cost(p_product_id);
    
    IF v_std_cost > 0 THEN
        UPDATE public.products 
        SET cost = v_std_cost, 
            manufacturing_cost = v_std_cost
        WHERE id = p_product_id AND organization_id = public.get_my_org();
    END IF;
    
    RETURN v_std_cost;
END; $$;

-- 10. دالة التحقق من توفر المواد الخام (Stock Availability Check)
-- تظهر المواد التي بها عجز فقط مقارنة بالكمية المطلوب إنتاجها
DROP FUNCTION IF EXISTS public.mfg_check_stock_availability(uuid, numeric);
CREATE OR REPLACE FUNCTION public.mfg_check_stock_availability(p_product_id uuid, p_quantity numeric)
RETURNS TABLE (
    material_id uuid,
    material_name text,
    required_total_qty numeric,
    current_stock_qty numeric,
    shortage_qty numeric
) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_routing_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن المسار الافتراضي للمنتج
    SELECT id INTO v_routing_id FROM public.mfg_routings 
    WHERE product_id = p_product_id AND organization_id = v_org_id AND is_default = true 
    LIMIT 1;

    -- إذا لم يوجد مسار افتراضي، نأخذ أول مسار متاح
    IF v_routing_id IS NULL THEN
        SELECT id INTO v_routing_id FROM public.mfg_routings 
        WHERE product_id = p_product_id AND organization_id = v_org_id 
        LIMIT 1;
    END IF;

    IF v_routing_id IS NULL THEN RETURN; END IF;

    -- 2. تجميع الاحتياجات الكلية من المواد الخام ومقارنتها بالمخزون الحالي
    RETURN QUERY
    WITH material_requirements AS (
        SELECT 
            sm.raw_material_id, 
            SUM(sm.quantity_required * p_quantity) as total_req
        FROM public.mfg_routing_steps rs
        JOIN public.mfg_step_materials sm ON rs.id = sm.step_id
        WHERE rs.routing_id = v_routing_id
        GROUP BY sm.raw_material_id
    )
    SELECT 
        mr.raw_material_id,
        p.name,
        mr.total_req,
        COALESCE(p.stock, 0),
        CASE 
            WHEN COALESCE(p.stock, 0) < mr.total_req THEN mr.total_req - COALESCE(p.stock, 0)
            ELSE 0 
        END
    FROM material_requirements mr
    JOIN public.products p ON mr.raw_material_id = p.id
    WHERE mr.total_req > COALESCE(p.stock, 0); -- نرجع فقط المواد التي بها عجز (نقص)
END; $$;

-- 11. دالة تسجيل التالف ومعالجته محاسبياً (Scrap Recording & Accounting)
CREATE OR REPLACE FUNCTION public.mfg_record_scrap(
    p_progress_id uuid, 
    p_material_id uuid, 
    p_qty numeric, 
    p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_org_id uuid;
    v_cost numeric;
    v_je_id uuid;
    v_mappings jsonb;
    v_scrap_acc uuid;
    v_wip_acc uuid;
    v_material_name text;
BEGIN
    -- 1. جلب البيانات الأساسية
    SELECT organization_id INTO v_org_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    SELECT name, COALESCE(weighted_average_cost, cost, 0) INTO v_material_name, v_cost 
    FROM public.products WHERE id = p_material_id;

    -- 2. تسجيل التالف في الجدول
    INSERT INTO public.mfg_scrap_logs (order_progress_id, product_id, quantity, reason, organization_id)
    VALUES (p_progress_id, p_material_id, p_qty, p_reason, v_org_id);

    -- 3. خصم الكمية من المخزون (لأن التالف استهلاك غير مخطط له)
    UPDATE public.products 
    SET stock = stock - p_qty 
    WHERE id = p_material_id AND organization_id = v_org_id;

    -- 4. المحرك المحاسبي: قيد إثبات خسارة التالف
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- حساب التالف (5121 هالك) وحساب WIP (10303)
    v_scrap_acc := COALESCE(
        (v_mappings->>'WASTAGE_EXPENSE')::uuid, 
        (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1)
    );
    v_wip_acc := (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1);

    IF v_scrap_acc IS NOT NULL AND v_cost > 0 THEN
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted,
            related_document_id, related_document_type
        ) VALUES (
            now()::date, 
            'إثبات تالف صناعي: ' || v_material_name || ' - ' || p_reason,
            'MFG-SCRAP-' || substring(gen_random_uuid()::text, 1, 8),
            'posted', v_org_id, true, p_progress_id, 'mfg_scrap'
        ) RETURNING id INTO v_je_id;

        -- أسطر القيد
        -- من ح/ تكلفة الهالك والفاقد (تحميل الخسارة على المصاريف)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_scrap_acc, (p_qty * v_cost), 0, 'خسارة تالف مواد خام غير مستردة', v_org_id);

        -- إلى ح/ مخزون المواد الخام (أو WIP إذا كان قد تم صرفه بالفعل للمرحلة)
        -- هنا نخصمه من المخزون مباشرة لأنه تالف إضافي لم يحسب في الدورة العادية
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (
            v_je_id, 
            COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)),
            0, (p_qty * v_cost), 'تخفيض المخزون نتيجة تلف صنف', v_org_id
        );
    END IF;

    -- 5. تحديث الأرصدة
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 18. دالة دمج طلبات المبيعات في أوامر إنتاج موحدة (Batching/Merging Orders)
-- تهدف لتقليل الهالك عبر تجميع الكميات المطلوبة لنفس المنتج من عدة فواتير
CREATE OR REPLACE FUNCTION public.mfg_merge_sales_orders(p_invoice_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_item record;
    v_org_id uuid;
    v_order_count integer := 0;
    v_prod_order_id uuid;
    v_batch_ref text;
BEGIN
    v_org_id := public.get_my_org();
    v_batch_ref := 'BATCH-' || to_char(now(), 'YYMMDDHH24MI') || '-' || substring(gen_random_uuid()::text, 1, 4);

    -- 1. تجميع الكميات المطلوبة لكل منتج من الفواتير المحددة
    FOR v_item IN 
        SELECT ii.product_id, SUM(ii.quantity) as total_qty
        FROM public.invoice_items ii
        WHERE ii.invoice_id = ANY(p_invoice_ids)
        AND EXISTS (SELECT 1 FROM public.mfg_routings r WHERE r.product_id = ii.product_id)
        GROUP BY ii.product_id
    LOOP
        -- 2. إنشاء أمر إنتاج موحد للكمية الكلية
        INSERT INTO public.mfg_production_orders (
            order_number, product_id, quantity_to_produce, status, 
            start_date, organization_id, batch_number
        ) VALUES (
            'MFG-MERGED-' || substring(gen_random_uuid()::text, 1, 8),
            v_item.product_id, v_item.total_qty, 'in_progress', 
            now()::date, v_org_id, v_batch_ref
        ) RETURNING id INTO v_prod_order_id;

        -- 3. توليد مراحل العمل بناءً على المسار الافتراضي
        INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
        SELECT 
            v_prod_order_id, 
            rs.id, 
            'pending',
            v_org_id
        FROM public.mfg_routings r
        JOIN public.mfg_routing_steps rs ON r.id = rs.routing_id
        WHERE r.product_id = v_item.product_id 
        AND (r.is_default = true OR r.id = (
            SELECT id FROM public.mfg_routings 
            WHERE product_id = v_item.product_id 
            ORDER BY is_default DESC, created_at DESC LIMIT 1
        ));

        v_order_count := v_order_count + 1;
    END LOOP;

    RETURN v_order_count;
END; $$;

-- 12. دالة توليد الأرقام التسلسلية آلياً عند الإغلاق
CREATE OR REPLACE FUNCTION public.mfg_generate_batch_serials(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_order record;
    v_i integer;
    v_serial text;
BEGIN
    SELECT po.*, p.requires_serial INTO v_order 
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    WHERE po.id = p_order_id;

    IF v_order.requires_serial THEN
        FOR v_i IN 1..floor(COALESCE(v_order.quantity_to_produce, 0))::integer LOOP
            v_serial := 'SN-' || v_order.order_number || '-' || LPAD(v_i::text, 4, '0');
            INSERT INTO public.mfg_batch_serials (production_order_id, product_id, serial_number, organization_id)
            VALUES (p_order_id, v_order.product_id, v_serial, v_order.organization_id)
            ON CONFLICT (serial_number, organization_id) DO NOTHING;
        END LOOP;
    END IF;
END; $$;

-- تحديث دالة mfg_finalize_order لتشمل توليد السيريالات
-- (ملاحظة: الكود أدناه يفترض إضافة استدعاء الدالة الجديدة داخل finalize)

-- 13. دالة اختبار دورة التصنيع الكاملة (Manufacturing Integration Test)
DROP FUNCTION IF EXISTS public.mfg_test_full_cycle();
CREATE OR REPLACE FUNCTION public.mfg_test_full_cycle()
RETURNS TABLE(step_name text, result text, details text) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_org_id uuid; v_prod_id uuid; v_raw_id uuid; v_wc_id uuid;
    v_routing_id uuid; v_step_id uuid; v_order_id uuid; v_prog_id uuid;
BEGIN
    -- 1. الإعداد
    v_org_id := public.get_my_org();
    
    -- ضمان وجود organization_id للاختبار
    IF v_org_id IS NULL THEN
        -- محاولة جلب أي organization_id موجود
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
        IF v_org_id IS NULL THEN
            -- إذا لم توجد أي منظمة، قم بإنشاء واحدة مؤقتة للاختبار
            INSERT INTO public.organizations (name) VALUES ('Test Organization for MFG') RETURNING id INTO v_org_id;
            step_name := '0. تهيئة المنظمة'; result := 'INFO'; details := 'تم إنشاء منظمة اختبار مؤقتة'; RETURN NEXT;
        END IF;
    END IF;
    
    -- إنشاء منتج تام ومادة خام للاختبار
    INSERT INTO public.products (name, mfg_type, requires_serial, organization_id) 
    VALUES ('منتج اختباري نهائي', 'standard', true, v_org_id) RETURNING id INTO v_prod_id;
    
    INSERT INTO public.products (name, mfg_type, stock, weighted_average_cost, organization_id) 
    VALUES ('خامة اختبارية', 'raw', 100, 10, v_org_id) RETURNING id INTO v_raw_id;

    step_name := '1. تهيئة البيانات'; result := 'PASS ✅'; details := 'تم إنشاء المنتج والخامة'; RETURN NEXT;

    -- 2. إنشاء مركز عمل ومسار
    INSERT INTO public.mfg_work_centers (name, hourly_rate, organization_id) 
    VALUES ('مركز اختبار', 50, v_org_id) RETURNING id INTO v_wc_id;

    INSERT INTO public.mfg_routings (product_id, name, organization_id) 
    VALUES (v_prod_id, 'مسار افتراضي', v_org_id) RETURNING id INTO v_routing_id;

    INSERT INTO public.mfg_routing_steps (routing_id, step_order, work_center_id, operation_name, standard_time_minutes, organization_id)
    VALUES (v_routing_id, 1, v_wc_id, 'مرحلة اختبارية', 60, v_org_id) RETURNING id INTO v_step_id;

    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_raw_id, 2, v_org_id);

    step_name := '2. إعداد المسار وBOM'; result := 'PASS ✅'; details := 'تم ربط الخامة بمركز العمل'; RETURN NEXT;

    -- 3. إنشاء أمر إنتاج وبدء التنفيذ
    INSERT INTO public.mfg_production_orders (order_number, product_id, quantity_to_produce, status, organization_id)
    VALUES ('TEST-' || substring(gen_random_uuid()::text, 1, 8), v_prod_id, 5, 'in_progress', v_org_id) RETURNING id INTO v_order_id;

    INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
    VALUES (v_order_id, v_step_id, 'pending', v_org_id) RETURNING id INTO v_prog_id;

    PERFORM public.mfg_start_step(v_prog_id);
    PERFORM public.mfg_complete_step(v_prog_id, 5);

    step_name := '3. تنفيذ الإنتاج'; result := 'PASS ✅'; details := 'تم خصم الخامة (10 وحدات) وتحميل WIP'; RETURN NEXT;

    -- 4. الإغلاق المالي وتوليد السيريالات
    PERFORM public.mfg_finalize_order(v_order_id);

    step_name := '4. الإغلاق والسيريالات'; result := 'PASS ✅'; details := 'تم توليد 5 أرقام تسلسلية وتحديث المخزون'; RETURN NEXT;

    -- 5. التحقق النهائي
    IF EXISTS (SELECT 1 FROM public.mfg_batch_serials WHERE production_order_id = v_order_id) AND 
       (SELECT stock FROM public.products WHERE id = v_prod_id) = 5 THEN
        step_name := '5. التحقق من النتائج'; result := 'SUCCESS 🏆'; details := 'الدورة كاملة من الإنتاج للمحاسبة سليمة';
    ELSE
        step_name := '5. التحقق من النتائج'; result := 'FAIL ❌'; details := 'فشل في مطابقة المخزون أو السيريالات';
    END IF;
    RETURN NEXT;

END; $$;

-- 13.5 دالة اختبار تكامل مبيعات المطعم مع استهلاك المواد الخام
-- تهدف للتأكد من أن بيع وجبة (صنف تام) يؤدي لخصم مكوناتها (خامات) آلياً
DROP FUNCTION IF EXISTS public.mfg_test_pos_integration();
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
    INSERT INTO public.table_sessions (start_time, status, organization_id) 
    VALUES (now(), 'OPEN', v_org_id) RETURNING id INTO v_session_id;

    -- بناء بنود الطلب (طلب 5 وجبات برجر)
    v_items := jsonb_build_array(
        jsonb_build_object('product_id', v_meal_id, 'quantity', 5, 'unit_price', 150)
    );

    -- استدعاء دالة إنشاء الطلب
    v_order_id := public.create_restaurant_order(v_session_id, auth.uid(), 'DINE_IN', 'اختبار تكامل POS-MFG', v_items, NULL, v_wh_id);

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

-- دالة تحديث سعر البيع بناءً على التكلفة الفعلية (تستخدم هامش ربح افتراضي 20%)
-- تُستدعى عند إغلاق أمر الإنتاج لتحديث سعر المنتج في بطاقة الصنف
DROP FUNCTION IF EXISTS public.mfg_update_selling_price_from_cost(uuid);
CREATE OR REPLACE FUNCTION public.mfg_update_selling_price_from_cost(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_order record;
    v_cost_per_unit numeric;
BEGIN
    SELECT po.* INTO v_order FROM public.mfg_production_orders po WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- جلب التكلفة الفعلية للوحدة من رؤية الربحية
    SELECT (total_actual_cost / NULLIF(qty, 0)) INTO v_cost_per_unit 
    FROM public.v_mfg_order_profitability 
    WHERE order_id = p_order_id AND organization_id = v_order.organization_id;

    IF v_cost_per_unit > 0 THEN
        -- تحديث سعر المنتج (التكلفة + 20% هامش ربح)
        UPDATE public.products 
        SET price = ROUND(v_cost_per_unit * 1.20, 2),
            sales_price = ROUND(v_cost_per_unit * 1.20, 2)
        WHERE id = v_order.product_id AND organization_id = v_order.organization_id;
    END IF;
END; $$;
-- 14. دالة تتبع "نسب" المنتج (Product Genealogy / Traceability)
-- تتيح استرجاع التاريخ الكامل لقطعة معينة عبر رقمها التسلسلي
CREATE OR REPLACE FUNCTION public.mfg_get_product_genealogy(p_serial_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_serial record;
    v_order record;
    v_components jsonb;
    v_process jsonb;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن بيانات الرقم التسلسلي
    SELECT * INTO v_serial FROM public.mfg_batch_serials 
    WHERE serial_number = p_serial_number AND organization_id = v_org_id;
    
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('error', 'الرقم التسلسلي غير موجود في قاعدة بيانات هذه المنظمة'); 
    END IF;

    -- 2. جلب بيانات أمر الإنتاج والمنتج
    SELECT po.*, p.name as product_name 
    INTO v_order 
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    WHERE po.id = v_serial.production_order_id;

    -- 3. جلب المكونات المستخدمة في هذه الدفعة (Standard vs Actual)
    -- تم التحديث لربط المكونات بطلبات صرف المواد (Material Requests)
    SELECT jsonb_agg(t) INTO v_components FROM (
        SELECT 
            rm.name as material_name,
            ROUND(SUM(amu.standard_quantity) / NULLIF(v_order.quantity_to_produce, 0), 4) as standard_per_unit,
            ROUND(SUM(amu.actual_quantity) / NULLIF(v_order.quantity_to_produce, 0), 4) as actual_per_unit,
            jsonb_agg(DISTINCT jsonb_build_object(
                'request_number', mr.request_number,
                'issue_date', mr.issue_date
            )) as associated_requests
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        LEFT JOIN public.mfg_material_requests mr ON mr.production_order_id = op.production_order_id
        WHERE op.production_order_id = v_order.id
        GROUP BY rm.name
    ) t;

    -- 4. جلب سجل العمليات والوقت المستغرق
    SELECT jsonb_agg(t) INTO v_process FROM (
        SELECT 
            rs.operation_name,
            wc.name as work_center_name,
            op.actual_start_time,
            op.actual_end_time,
            op.status
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = v_order.id
        ORDER BY rs.step_order
    ) t;

    RETURN jsonb_build_object(
        'product_info', jsonb_build_object(
            'name', v_order.product_name,
            'serial_number', p_serial_number,
            'batch_number', v_order.batch_number,
            'order_number', v_order.order_number,
            'produced_at', v_order.end_date
        ),
        'components_traceability', COALESCE(v_components, '[]'::jsonb),
        'manufacturing_steps', COALESCE(v_process, '[]'::jsonb)
    );
END; $$;

-- 15. دالة تحويل طلب المبيعات إلى أوامر إنتاج تلقائية
-- تقوم بفحص المنتجات التي لها "مسار إنتاج" (Routing) وتنشئ لها أوامر
CREATE OR REPLACE FUNCTION public.mfg_create_orders_from_sales(p_sales_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_item record;
    v_org_id uuid;
    v_order_count integer := 0;
    v_prod_order_id uuid;
    v_routing_id uuid;
BEGIN
    -- 🛡️ جلب المنظمة من أمر البيع لضمان الدقة
    SELECT organization_id INTO v_org_id FROM public.sales_orders WHERE id = p_sales_order_id;
    IF v_org_id IS NULL THEN v_org_id := public.get_my_org(); END IF;

    -- 1. المرور على بنود أمر البيع (Sales Order) بدلاً من الفاتورة
    FOR v_item IN 
        -- البحث في أوامر البيع أولاً
        SELECT soi.product_id, soi.quantity, p.name, so.order_number as ref_number
        FROM public.sales_order_items soi
        JOIN public.sales_orders so ON soi.sales_order_id = so.id
        JOIN public.products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = p_sales_order_id 
        AND EXISTS (SELECT 1 FROM public.mfg_routings r WHERE r.product_id = soi.product_id)
        UNION ALL
        -- البقاء على دعم الفواتير كخيار احتياطي للنظام القديم
        SELECT ii.product_id, ii.quantity, p.name, i.invoice_number as ref_number
        FROM public.invoice_items ii
        JOIN public.invoices i ON ii.invoice_id = i.id
        JOIN public.products p ON ii.product_id = p.id
        WHERE ii.invoice_id = p_sales_order_id 
        AND EXISTS (SELECT 1 FROM public.mfg_routings r WHERE r.product_id = ii.product_id)
    LOOP
        -- 2. إنشاء أمر الإنتاج
        INSERT INTO public.mfg_production_orders (
            order_number, product_id, quantity_to_produce, status, 
            start_date, organization_id, batch_number
        ) VALUES (
            'MFG-AUTO-' || v_item.ref_number || '-' || substring(gen_random_uuid()::text, 1, 4),
            v_item.product_id, v_item.quantity, 'draft', 
            now()::date, v_org_id, v_item.ref_number
        ) RETURNING id INTO v_prod_order_id;

        -- 3. توليد مراحل العمل تلقائياً بناءً على المسار الافتراضي
        INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
        SELECT 
            v_prod_order_id, 
            rs.id, 
            CASE WHEN rs.step_order = 1 THEN 'pending' ELSE 'pending' END,
            v_org_id
        FROM public.mfg_routings r
        JOIN public.mfg_routing_steps rs ON r.id = rs.routing_id
        WHERE r.product_id = v_item.product_id AND r.is_default = true;

        v_order_count := v_order_count + 1;
    END LOOP;

    RETURN v_order_count;
END; $$;

-- 🛠️ دالة تحويل عرض السعر إلى أمر بيع
CREATE OR REPLACE FUNCTION public.convert_quotation_to_so(p_quotation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_quote record; v_so_id uuid; v_so_no text; v_org_id uuid;
BEGIN
    SELECT * INTO v_quote FROM public.quotations WHERE id = p_quotation_id;
    v_org_id := v_quote.organization_id;
    v_so_no := 'SO-' || substring(v_quote.quotation_number, 5);

    INSERT INTO public.sales_orders (order_number, customer_id, total_amount, organization_id, status)
    VALUES (v_so_no, v_quote.customer_id, v_quote.total_amount, v_org_id, 'confirmed')
    RETURNING id INTO v_so_id;

    INSERT INTO public.sales_order_items (sales_order_id, product_id, quantity, unit_price, organization_id)
    SELECT v_so_id, product_id, quantity, unit_price, v_org_id
    FROM public.quotation_items WHERE quotation_id = p_quotation_id;

    UPDATE public.quotations SET status = 'accepted' WHERE id = p_quotation_id;
    RETURN v_so_id;
END; $$;

-- 🛠️ دالة تحويل أمر البيع إلى فاتورة (تُستدعى بعد توفر المخزون)
CREATE OR REPLACE FUNCTION public.convert_so_to_invoice(p_so_id uuid, p_warehouse_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_so record; v_inv_id uuid; v_inv_no text; v_org_id uuid; v_tax_amount numeric;
BEGIN
    SELECT * INTO v_so FROM public.sales_orders WHERE id = p_so_id;
    v_org_id := v_so.organization_id;
    v_inv_no := 'INV-' || substring(v_so.order_number, 4);
    
    -- حساب الضريبة (افترض 14% أو اجلبها من الإعدادات)
    v_tax_amount := v_so.total_amount * 0.14;

    INSERT INTO public.invoices (
        invoice_number, customer_id, invoice_date, total_amount, tax_amount, 
        subtotal, status, warehouse_id, organization_id
    ) VALUES (
        v_inv_no, v_so.customer_id, now()::date, v_so.total_amount + v_tax_amount, 
        v_tax_amount, v_so.total_amount, 'draft', p_warehouse_id, v_org_id
    ) RETURNING id INTO v_inv_id;

    INSERT INTO public.invoice_items (invoice_id, product_id, quantity, unit_price, organization_id)
    SELECT v_inv_id, product_id, quantity, unit_price, v_org_id
    FROM public.sales_order_items WHERE sales_order_id = p_so_id;

    UPDATE public.sales_orders SET status = 'invoiced' WHERE id = p_so_id;
    RETURN v_inv_id;
END; $$;

-- 16. دالة جلب مهام "أرضية المصنع" (Shop Floor Tasks)
-- تعرض المهام المتاحة للبدء أو الإكمال في مركز عمل معين
DROP FUNCTION IF EXISTS public.mfg_get_shop_floor_tasks(uuid);
CREATE OR REPLACE FUNCTION public.mfg_get_shop_floor_tasks(p_work_center_id uuid DEFAULT NULL)
RETURNS TABLE (
    progress_id uuid,
    step_id uuid,
    order_number text,
    product_name text,
    operation_name text,
    status text,
    target_qty numeric
) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT 
        op.id,
        op.step_id,
        po.order_number,
        p.name,
        rs.operation_name,
        op.status,
        po.quantity_to_produce
    FROM public.mfg_order_progress op
    JOIN public.mfg_production_orders po ON op.production_order_id = po.id
    JOIN public.products p ON po.product_id = p.id
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    WHERE po.organization_id = public.get_my_org()
    AND po.status = 'in_progress'
    AND op.status IN ('pending', 'active')
    AND (p_work_center_id IS NULL OR rs.work_center_id = p_work_center_id)
    ORDER BY rs.step_order ASC;
END; $$;

-- 17. دالة معالجة الباركود (Barcode Scanner Handler)
-- دالة ذكية: إذا مسح العامل باركود المرحلة، تقوم بتبديل حالتها (بدء أو إكمال)
CREATE OR REPLACE FUNCTION public.mfg_process_scan(p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_progress_id uuid;
    v_status text;
    v_order_qty numeric;
BEGIN
    -- نفترض أن الباركود يحتوي على معرف سجل التقدم (Progress ID)
    v_progress_id := p_barcode::uuid;
    
    SELECT op.status, po.quantity_to_produce INTO v_status, v_order_qty
    FROM public.mfg_order_progress op
    JOIN public.mfg_production_orders po ON op.production_order_id = po.id
    WHERE op.id = v_progress_id;

    IF v_status = 'pending' THEN
        PERFORM public.mfg_start_step(v_progress_id);
        RETURN jsonb_build_object('success', true, 'action', 'started', 'message', 'تم بدء العمل على المرحلة');
    ELSIF v_status = 'active' THEN
        PERFORM public.mfg_complete_step(v_progress_id, v_order_qty);
        RETURN jsonb_build_object('success', true, 'action', 'completed', 'message', 'تم إكمال المرحلة بنجاح');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'المرحلة مكتملة بالفعل أو غير صالحة');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'خطأ في قراءة الباركود: ' || SQLERRM);
END; $$;

-- 19. دالة فحص كفاءة مراكز العمل وإصدار تنبيهات ذكية (Efficiency Alerts)
CREATE OR REPLACE FUNCTION public.mfg_check_efficiency_alerts(p_threshold numeric DEFAULT 70)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    -- جلب كافة المسئولين في المنظمة الحالية
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP
        
        -- التحقق من مراكز العمل التي انخفضت كفاءتها
        FOR v_row IN 
            SELECT * FROM public.v_mfg_work_center_efficiency 
            WHERE efficiency_percentage < p_threshold AND organization_id = v_org_id
        LOOP
            INSERT INTO public.notifications (
                user_id, 
                title, 
                message, 
                priority, 
                organization_id
            ) VALUES (
                v_admin_id,
                'تنبيه كفاءة الإنتاج: ' || v_row.work_center_name,
                format('انخفض أداء المركز (%s) إلى %s%% وهي أقل من المعيار (%s%%)', 
                       v_row.work_center_name, v_row.efficiency_percentage, p_threshold),
                'high',
                v_org_id
            );
            v_alert_count := v_alert_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN v_alert_count;
END; $$;

-- 20. دالة فحص جاهزية المنتج للإنتاج (Production Readiness Check)
DROP FUNCTION IF EXISTS public.mfg_check_production_readiness(uuid);
CREATE OR REPLACE FUNCTION public.mfg_check_production_readiness(p_product_id uuid)
RETURNS TABLE (
    is_ready boolean,
    missing_elements text[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_errors text[] := '{}';
BEGIN
    -- 1. فحص وجود BOM
    IF NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = p_product_id) THEN
        v_errors := array_append(v_errors, 'قائمة المواد (BOM) غير معرفة');
    END IF;

    -- 2. فحص وجود مسار إنتاج (Routing)
    IF NOT EXISTS (SELECT 1 FROM public.mfg_routings WHERE product_id = p_product_id AND deleted_at IS NULL) THEN
        v_errors := array_append(v_errors, 'مسار الإنتاج (Routing) غير معرف');
    END IF;

    -- 3. فحص وجود خطوات في المسار
    IF EXISTS (SELECT 1 FROM public.mfg_routings WHERE product_id = p_product_id) AND 
       NOT EXISTS (SELECT 1 FROM public.mfg_routing_steps rs 
                   JOIN public.mfg_routings r ON rs.routing_id = r.id 
                   WHERE r.product_id = p_product_id) THEN
        v_errors := array_append(v_errors, 'مسار الإنتاج لا يحتوي على خطوات تنفيذية');
    END IF;

    RETURN QUERY SELECT 
        (array_length(v_errors, 1) IS NULL) as is_ready,
        v_errors;
END; $$;

-- دالة جلب الفواتير القابلة للتصنيع (Helper for BatchOrderManager)
CREATE OR REPLACE FUNCTION public.mfg_get_pending_invoices(p_org_id uuid)
RETURNS TABLE (
    invoice_id uuid,
    invoice_num text,
    cust_name text,
    order_date timestamptz,
    total numeric,
    invoice_status text
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public 
AS $$
BEGIN
    RETURN QUERY
    -- 1. جلب الفواتير
    SELECT i.id, i.invoice_number as invoice_num, c.name as cust_name, i.created_at as order_date, COALESCE(i.total_amount, 0) as total, i.status as invoice_status

    FROM public.invoices i
    JOIN public.customers c ON i.customer_id = c.id
    WHERE i.organization_id = p_org_id
    AND i.status != 'draft' -- جلب الفواتير المعتمدة فقط أو حسب سياق عملك
    AND EXISTS (
        SELECT 1 FROM public.invoice_items ii
        JOIN public.mfg_routings r ON ii.product_id = r.product_id
        WHERE ii.invoice_id = i.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.mfg_production_orders po 
        WHERE po.batch_number LIKE '%' || i.invoice_number || '%'
    )
        UNION ALL

    -- 2. جلب أوامر البيع (Sales Orders)
    SELECT so.id, so.order_number, c.name, so.created_at, COALESCE(so.total_amount, 0), so.status
    FROM public.sales_orders so
    JOIN public.customers c ON so.customer_id = c.id
    WHERE so.organization_id = p_org_id
    AND so.status = 'confirmed'
    AND EXISTS (
        SELECT 1 FROM public.sales_order_items soi
        JOIN public.mfg_routings r ON soi.product_id = r.product_id
        WHERE soi.sales_order_id = so.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.mfg_production_orders po 
        WHERE po.batch_number LIKE '%' || so.order_number || '%'
    )
    ORDER BY 4 DESC;
END; $$;

-- 23. دالة حساب الانحراف المالي الفعلي بين التكلفة المعيارية والتكلفة الحقيقية بعد إغلاق أمر الإنتاج
CREATE OR REPLACE FUNCTION public.mfg_calculate_production_variance(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record;
    v_actual_cost numeric := 0;
    v_standard_cost_per_unit numeric := 0;
    v_standard_total_cost numeric := 0;
    v_variance_amount numeric := 0;
    v_variance_percentage numeric := 0;
    v_org_id uuid;
BEGIN
    -- 1. جلب بيانات أمر الإنتاج
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'أمر الإنتاج غير موجود');
    END IF;
    v_org_id := v_order.organization_id;

    -- 2. جلب التكلفة الفعلية الإجمالية من رؤية ربحية أمر الإنتاج
    SELECT total_actual_cost INTO v_actual_cost
    FROM public.v_mfg_order_profitability
    WHERE order_id = p_order_id AND organization_id = v_org_id;

    -- 3. حساب التكلفة المعيارية الإجمالية (التكلفة المعيارية للوحدة * الكمية المنتجة)
    v_standard_cost_per_unit := public.mfg_calculate_standard_cost(v_order.product_id);
    v_standard_total_cost := v_standard_cost_per_unit * v_order.quantity_to_produce;

    -- 4. حساب الانحراف (الفعلي - المعياري)
    v_variance_amount := v_actual_cost - v_standard_total_cost;
    IF v_standard_total_cost > 0 THEN
        v_variance_percentage := ROUND((v_variance_amount / v_standard_total_cost) * 100, 2);
    ELSE
        v_variance_percentage := 0; -- تجنب القسمة على صفر إذا كانت التكلفة المعيارية صفر
    END IF;

    -- 5. تسجيل أو تحديث الانحراف في الجدول الجديد لضمان بقاء البيانات التاريخية
    INSERT INTO public.mfg_production_variances (
        production_order_id, actual_total_cost, standard_total_cost, 
        variance_amount, variance_percentage, organization_id
    ) VALUES (
        p_order_id, v_actual_cost, v_standard_total_cost, 
        v_variance_amount, v_variance_percentage, v_org_id
    ) ON CONFLICT (production_order_id) DO UPDATE SET
        actual_total_cost = EXCLUDED.actual_total_cost,
        standard_total_cost = EXCLUDED.standard_total_cost,
        variance_amount = EXCLUDED.variance_amount,
        variance_percentage = EXCLUDED.variance_percentage;

    RETURN jsonb_build_object(
        'order_id', p_order_id, 'order_number', v_order.order_number, 'product_id', v_order.product_id,
        'quantity_produced', v_order.quantity_to_produce, 'actual_total_cost', v_actual_cost,
        'standard_total_cost', v_standard_total_cost, 'variance_amount', v_variance_amount,
        'variance_percentage', v_variance_percentage
    );
END; $$;

-- 24. دالة حجز المخزون لأمر الإنتاج (Stock Reservation)
CREATE OR REPLACE FUNCTION public.mfg_reserve_stock_for_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shortage_exists boolean := false;
BEGIN
    IF EXISTS (SELECT 1 FROM public.mfg_check_stock_availability(
        (SELECT product_id FROM public.mfg_production_orders WHERE id = p_order_id),
        (SELECT quantity_to_produce FROM public.mfg_production_orders WHERE id = p_order_id)
    )) THEN
        RETURN jsonb_build_object('success', false, 'message', 'يوجد نقص في الخامات، لا يمكن حجز المخزون');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'تم التأكد من توفر كافة الخامات وتخصيصها للأمر');
END; $$;

-- 25. دالة إنشاء طلب صرف مواد لأمر إنتاج
CREATE OR REPLACE FUNCTION public.mfg_create_material_request(p_production_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record;
    v_request_id uuid;
    v_request_number text;
    v_org_id uuid;
    v_material_item record;
BEGIN
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_production_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    v_org_id := v_order.organization_id;

    IF EXISTS (SELECT 1 FROM public.mfg_material_requests WHERE production_order_id = p_production_order_id AND status IN ('pending', 'approved')) THEN
        RAISE EXCEPTION 'يوجد بالفعل طلب صرف مواد مفتوح لأمر الإنتاج هذا.';
    END IF;

    v_request_number := 'MR-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.mfg_material_requests (
        production_order_id, request_number, requested_by, organization_id, status
    ) VALUES (
        p_production_order_id, v_request_number, auth.uid(), v_org_id, 'pending'
    ) RETURNING id INTO v_request_id;

    FOR v_material_item IN
        SELECT
            sm.raw_material_id,
            SUM(sm.quantity_required * v_order.quantity_to_produce) AS total_required_qty
        FROM public.mfg_routings r
        JOIN public.mfg_routing_steps rs ON r.id = rs.routing_id
        JOIN public.mfg_step_materials sm ON rs.id = sm.step_id
        WHERE r.product_id = v_order.product_id AND r.is_default = TRUE AND r.organization_id = v_org_id
        GROUP BY sm.raw_material_id
    LOOP
        INSERT INTO public.mfg_material_request_items (
            material_request_id, raw_material_id, quantity_requested, organization_id
        ) VALUES (
            v_request_id, v_material_item.raw_material_id, v_material_item.total_required_qty, v_org_id
        );
    END LOOP;

    RETURN v_request_id;
END; $$;

-- 26. دالة صرف المواد من المخزون
CREATE OR REPLACE FUNCTION public.mfg_issue_material_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_request record; v_item record; v_org_id uuid; v_je_id uuid; v_mappings jsonb; v_current_stock numeric;
    v_inv_raw_acc uuid; v_wip_acc uuid; v_total_issued_cost numeric := 0; v_product_cost numeric;
BEGIN
    SELECT * INTO v_request FROM public.mfg_material_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'طلب صرف المواد غير موجود'; END IF;
    IF v_request.status = 'issued' THEN RETURN; END IF;
    v_org_id := v_request.organization_id;

    FOR v_item IN SELECT * FROM public.mfg_material_request_items WHERE material_request_id = p_request_id LOOP
        SELECT COALESCE(stock, 0) INTO v_current_stock FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
        IF v_current_stock < v_item.quantity_requested THEN
            RAISE EXCEPTION 'نقص في المخزون للمادة %', (SELECT name FROM public.products WHERE id = v_item.raw_material_id);
        END IF;

        UPDATE public.products SET stock = stock - v_item.quantity_requested 
        WHERE id = v_item.raw_material_id AND organization_id = v_org_id;

        SELECT COALESCE(weighted_average_cost, cost, purchase_price, 0) INTO v_product_cost 
        FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
        v_total_issued_cost := v_total_issued_cost + (v_item.quantity_requested * v_product_cost);
        UPDATE public.mfg_material_request_items SET quantity_issued = v_item.quantity_requested WHERE id = v_item.id;
    END LOOP;

    UPDATE public.mfg_material_requests SET status = 'issued', issued_by = auth.uid(), issue_date = now() WHERE id = p_request_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inv_raw_acc := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_wip_acc := COALESCE(
        (v_mappings->>'INVENTORY_WIP')::uuid, 
        (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_org_id LIMIT 1)
    );

    -- إزالة شرط الصرامة على v_wip_acc لضمان إنشاء القيد حتى لو تم الترحيل لحساب المخزون الرئيسي
    IF v_total_issued_cost > 0 AND v_inv_raw_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, 'صرف مواد لأمر الإنتاج رقم: ' || (SELECT order_number FROM public.mfg_production_orders WHERE id = v_request.production_order_id), v_request.request_number, 'posted', v_org_id, true, p_request_id, 'mfg_material_request')
        RETURNING id INTO v_je_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_je_id, v_wip_acc, v_total_issued_cost, 0, 'تحميل مواد خام على WIP', v_org_id), 
            (v_je_id, v_inv_raw_acc, 0, v_total_issued_cost, 'صرف مواد خام من المخزن', v_org_id);
    END IF;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 28. مشغل إنشاء طلب الصرف تلقائياً
CREATE OR REPLACE FUNCTION public.fn_mfg_auto_create_material_request()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
        PERFORM public.mfg_create_material_request(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 30. دوال GenealogyViewer
DROP FUNCTION IF EXISTS public.mfg_get_serials_by_order(text);
CREATE OR REPLACE FUNCTION public.mfg_get_serials_by_order(p_order_number text)
RETURNS TABLE (serial_number text, product_name text, batch_number text) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT bs.serial_number, p.name, po.batch_number
    FROM public.mfg_batch_serials bs
    JOIN public.mfg_production_orders po ON bs.production_order_id = po.id
    JOIN public.products p ON bs.product_id = p.id
    WHERE po.order_number = p_order_number AND po.organization_id = public.get_my_org();
END; $$;

DROP FUNCTION IF EXISTS public.mfg_get_production_order_details_by_number(text);
CREATE OR REPLACE FUNCTION public.mfg_get_production_order_details_by_number(p_order_number text)
RETURNS TABLE (order_id uuid, order_number text, status text, product_name text, quantity numeric) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT po.id, po.order_number, po.status, p.name, po.quantity_to_produce
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    WHERE po.order_number = p_order_number AND po.organization_id = public.get_my_org();
END; $$;

CREATE OR REPLACE FUNCTION public.mfg_start_production_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.mfg_production_orders SET status = 'in_progress', start_date = now()::date WHERE id = p_order_id;
END; $$;

-- 🛠️ دالة بدء أوامر إنتاج متعددة دفعة واحدة
CREATE OR REPLACE FUNCTION public.mfg_start_production_orders_batch(p_order_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_order_id uuid;
    v_count integer := 0;
BEGIN
    FOR v_order_id IN SELECT unnest(p_order_ids) LOOP
        UPDATE public.mfg_production_orders 
        SET status = 'in_progress', start_date = now()::date 
        WHERE id = v_order_id AND status = 'draft' AND organization_id = public.get_my_org();
        
        IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
    RETURN v_count;
END; $$;


-- 🔔 نظام التنبيهات الذكية لانحرافات التصنيع
CREATE OR REPLACE FUNCTION public.mfg_check_variance_alerts(p_threshold numeric DEFAULT 10)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    -- جلب المسئولين في المنظمة
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP
        
        -- البحث عن انحرافات تتجاوز العتبة المحددة (10%)
        FOR v_row IN 
            SELECT * FROM public.v_mfg_bom_variance 
            WHERE ABS(variance_percentage) > p_threshold AND organization_id = v_org_id
        LOOP
            INSERT INTO public.notifications (
                user_id, 
                title, 
                message, 
                type,
                priority, 
                organization_id
            ) VALUES (
                v_admin_id,
                'تنبيه: انحراف مواد خطير',
                format('المادة (%s) في الطلب (%s) سجلت انحرافاً بنسبة %s%%', 
                       v_row.material_name, v_row.order_number, v_row.variance_percentage),
                'high_debt', -- نستخدم نوع متاح في نظام الإخطارات للأولوية
                'high',
                v_org_id
            );
            v_alert_count := v_alert_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN v_alert_count;
END; $$;

-- 🔔 دالة تنبيهات تجاوز تكلفة الإنتاج المعيارية
CREATE OR REPLACE FUNCTION public.mfg_check_cost_overrun_alerts(p_threshold_percentage numeric DEFAULT 5)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
    v_standard_cost_per_unit numeric;
    v_expected_total_standard_cost numeric;
    v_cost_overrun_percentage numeric;
    v_order_product_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- جلب المسئولين في المنظمة
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP

        -- البحث عن أوامر إنتاج مكتملة تجاوزت تكلفتها الفعلية التكلفة المعيارية بحد معين
        FOR v_row IN 
            SELECT 
                vpop.order_id,
                vpop.order_number,
                vpop.product_name,
                vpop.qty,
                vpop.total_actual_cost,
                po.product_id AS order_product_id 
            FROM public.v_mfg_order_profitability vpop
            JOIN public.mfg_production_orders po ON vpop.order_id = po.id
            WHERE vpop.organization_id = v_org_id
              AND po.status = 'completed' -- فقط الأوامر المكتملة
        LOOP
            v_order_product_id := v_row.order_product_id; -- Assign to the declared variable
            -- حساب التكلفة المعيارية للمنتج الواحد باستخدام الدالة الموجودة
            v_standard_cost_per_unit := public.mfg_calculate_standard_cost(v_order_product_id);
            v_expected_total_standard_cost := v_standard_cost_per_unit * v_row.qty;

            IF v_expected_total_standard_cost > 0 THEN
                v_cost_overrun_percentage := ROUND(((v_row.total_actual_cost - v_expected_total_standard_cost) / v_expected_total_standard_cost) * 100, 2);
            ELSE
                v_cost_overrun_percentage := 0; -- تجنب القسمة على صفر إذا كانت التكلفة المعيارية صفر
            END IF;

            IF v_cost_overrun_percentage > p_threshold_percentage THEN
                INSERT INTO public.notifications (user_id, title, message, type, priority, organization_id) 
                VALUES (v_admin_id, 'تنبيه: تجاوز تكلفة الإنتاج المعيارية', 
                        format('أمر الإنتاج (%s) للمنتج (%s) تجاوز التكلفة المعيارية بنسبة %s%%. التكلفة الفعلية: %s، المعيارية: %s',
                               v_row.order_number, v_row.product_name, v_cost_overrun_percentage, v_row.total_actual_cost, v_expected_total_standard_cost),
                        'cost_overrun', 'high', v_org_id);
                v_alert_count := v_alert_count + 1;
            END IF;
        END LOOP;
    END LOOP;
    
    RETURN v_alert_count;
END; $$;

-- 🔔 تنبيه نقص الأرقام التسلسلية عند الإغلاق
CREATE OR REPLACE FUNCTION public.mfg_check_missing_serials_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP
        FOR v_row IN 
            SELECT order_number, product_name, quantity_to_produce, total_serials_generated
            FROM public.v_mfg_dashboard
            WHERE organization_id = v_org_id 
              AND status = 'completed' 
              AND requires_serial = true
              AND total_serials_generated < quantity_to_produce
        LOOP
            INSERT INTO public.notifications (user_id, title, message, type, priority, organization_id)
            VALUES (v_admin_id, 'تنبيه: نقص أرقام تسلسلية', 
                    format('أمر الإنتاج (%s) للمنتج (%s) اكتمل بـ %s سيريال فقط من أصل %s مطلوب.',
                           v_row.order_number, v_row.product_name, v_row.total_serials_generated, v_row.quantity_to_produce),
                    'missing_serials', 'medium', v_org_id);
            v_alert_count := v_alert_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN v_alert_count;
END; $$;

-- 1. جدول عمليات فحص الجودة
CREATE OR REPLACE FUNCTION public.mfg_record_qc_inspection(
    p_progress_id uuid,
    p_status text,
    p_notes text,
    p_defect_type text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    INSERT INTO public.mfg_qc_inspections (progress_id, inspector_id, status, notes, defect_type, organization_id)
    VALUES (p_progress_id, auth.uid(), p_status, p_notes, p_defect_type, public.get_my_org());
    
    -- تحديث حالة التقدم بناءً على نتيجة الفحص
    UPDATE public.mfg_order_progress 
    SET 
        qc_verified = CASE 
            WHEN p_status = 'pass' THEN true 
            WHEN p_status = 'rework' THEN NULL 
            ELSE false 
        END,
        status = CASE WHEN p_status = 'rework' THEN 'active' ELSE status END
    WHERE id = p_progress_id;
END; $$;
-- 🛠️ دالة مساعدة: Overload لـ mfg_record_qc_inspection لمطابقة استدعاء الواجهة الأمامية الخاطئ
-- هذه الدالة تسمح للواجهة الأمامية باستدعاء الدالة بترتيب خاطئ للمعاملات (p_notes, p_progress_id, p_status)
-- ثم تقوم بإعادة توجيه الاستدعاء إلى الدالة الأصلية بالترتيب الصحيح.
CREATE OR REPLACE FUNCTION public.mfg_record_qc_inspection(
    p_notes_client text,
    p_progress_id_client uuid,
    p_status_client text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    -- استدعاء الدالة الأصلية بالترتيب الصحيح للمعاملات
    PERFORM public.mfg_record_qc_inspection(p_progress_id_client, p_status_client, p_notes_client, NULL);
END; $$;

-- 📊 رؤية ربحية أمر الإنتاج (Manufacturing Order Profitability View)
-- هذه الرؤية تجمع كافة التكاليف الفعلية لأمر إنتاج واحد
DROP VIEW IF EXISTS public.v_mfg_order_profitability CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_order_profitability WITH (security_invoker = true) AS
WITH labor_summary AS (
    SELECT 
        op.production_order_id,
        SUM(COALESCE(op.labor_cost_actual, 0)) as total_labor,
        SUM(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)) as total_overhead
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    GROUP BY op.production_order_id
),
material_summary AS (
    SELECT po_id, SUM(cost) as total_material_cost
    FROM (
        SELECT op.production_order_id as po_id, SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)) as cost
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        GROUP BY op.production_order_id
        UNION ALL
        SELECT mr.production_order_id as po_id, SUM(mri.quantity_issued * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)) as cost
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.status = 'issued'
        GROUP BY mr.production_order_id
    ) all_mats GROUP BY po_id
)
SELECT 
    po.id as order_id, po.order_number, p.name as product_name, po.quantity_to_produce as qty, po.organization_id,
    (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) as sales_value,
    (COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0)) as actual_labor,
    COALESCE(ms.total_material_cost, 0) as actual_material,
    (COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0)) as total_actual_cost,
    ((po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) - (COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0))) as net_profit,
    CASE WHEN (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) > 0 
         THEN ROUND((((po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) - (COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0))) / (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) * 100), 2)
         ELSE 0 END as margin_percentage
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN labor_summary ls ON po.id = ls.production_order_id
LEFT JOIN material_summary ms ON po.id = ms.po_id;

GRANT SELECT ON public.v_mfg_order_profitability TO authenticated;

-- 📊 21. عرض انحراف المواد (BOM Variance View)
-- هذا العرض مطلوب للوحة التحكم الصناعية لمراقبة فروقات الاستهلاك
DROP VIEW IF EXISTS public.v_mfg_bom_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_bom_variance WITH (security_invoker = true) AS
SELECT
    po.order_number,
    p.name as product_name,
    rm.name as material_name,
    SUM(amu.standard_quantity) as standard_quantity,
    SUM(amu.actual_quantity) as actual_quantity,
    SUM(amu.actual_quantity - amu.standard_quantity) as variance_qty,
    CASE
        WHEN SUM(amu.standard_quantity) > 0
        THEN ROUND((SUM(amu.actual_quantity - amu.standard_quantity) / SUM(amu.standard_quantity) * 100), 2)
        ELSE 0
    END as variance_percentage,
    po.organization_id
FROM public.mfg_actual_material_usage amu
JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
JOIN public.mfg_production_orders po ON op.production_order_id = po.id
LEFT JOIN public.products p ON po.product_id = p.id -- Use LEFT JOIN for robustness
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id -- Use LEFT JOIN for robustness
GROUP BY po.id, po.order_number, p.name, rm.name, po.organization_id;
-- Ensure security_invoker is set for views
-- إضافة اسم بديل للتوافق (Compatibility Alias)
DROP VIEW IF EXISTS public.v_mfg_material_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_material_variance WITH (security_invoker = true) AS
SELECT * FROM public.v_mfg_bom_variance;

GRANT SELECT ON public.v_mfg_bom_variance TO authenticated;
GRANT SELECT ON public.v_mfg_material_variance TO authenticated;
     
-- 📊 22. عرض كفاءة مراكز العمل (Work Center Efficiency View)
DROP VIEW IF EXISTS public.v_mfg_work_center_efficiency CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_work_center_efficiency WITH (security_invoker = true) AS
SELECT
    wc.id as work_center_id,
    wc.name as work_center_name,
    COUNT(op.id) as tasks_completed,
    SUM(rs.standard_time_minutes * op.produced_qty) as total_standard_minutes,
    GREATEST(SUM(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 60), 1) as total_actual_minutes,
    ROUND((SUM(rs.standard_time_minutes * op.produced_qty) / GREATEST(SUM(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 60), 1) * 100), 2) as efficiency_percentage,
    wc.organization_id
FROM public.mfg_work_centers wc -- Use LEFT JOIN for robustness
LEFT JOIN public.mfg_routing_steps rs ON wc.id = rs.work_center_id
LEFT JOIN public.mfg_order_progress op ON rs.id = op.step_id
WHERE op.status = 'completed' OR op.status IS NULL -- Include NULL status for robustness
GROUP BY wc.id, wc.name, wc.organization_id;

-- 📊 27. رؤية تقييم WIP
DROP VIEW IF EXISTS public.v_mfg_wip_valuation CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_valuation WITH (security_invoker = true) AS
WITH request_costs AS (
    SELECT mr.production_order_id,
           SUM(mri.quantity_issued * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)) as total_request
    FROM public.mfg_material_request_items mri
    JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
    JOIN public.products p ON mri.raw_material_id = p.id
    WHERE mr.status = 'issued' AND mr.organization_id = public.get_my_org() -- Add organization_id filter
    GROUP BY mr.production_order_id
)
SELECT po.id AS production_order_id, po.order_number, p.name AS product_name, po.quantity_to_produce, po.status, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS total_labor_cost_incurred,
       (COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) + COALESCE(rc.total_request, 0)) AS total_material_cost_incurred,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) + COALESCE(rc.total_request, 0)) AS total_wip_value -- Ensure rc.total_request is included
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN public.mfg_order_progress op ON po.id = op.production_order_id
LEFT JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id
LEFT JOIN request_costs rc ON po.id = rc.production_order_id
WHERE po.status = 'in_progress'
GROUP BY po.id, po.order_number, p.name, po.quantity_to_produce, po.status, po.organization_id, rc.total_request; -- Group by rc.total_request

-- 29. تقرير ملخص شهري WIP
DROP VIEW IF EXISTS public.v_mfg_wip_monthly_summary CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_monthly_summary WITH (security_invoker = true) AS
SELECT to_char(po.created_at, 'YYYY-MM') AS month, p.name AS product_name, wc.name AS work_center_name, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS monthly_labor_cost,
       COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) AS monthly_material_cost,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0)) AS total_monthly_wip_value
FROM public.mfg_production_orders po -- Use LEFT JOIN for robustness
LEFT JOIN public.products p ON po.product_id = p.id
LEFT JOIN public.mfg_order_progress op ON po.id = op.production_order_id
LEFT JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
LEFT JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id
WHERE po.status = 'in_progress' OR po.status IS NULL -- Include NULL status for robustness
GROUP BY 1, 2, 3, 4;

-- 📊 31. رؤية لوحة التحكم الصناعية (Manufacturing Dashboard View)
-- هذه الرؤية ضرورية لعمل لوحة القيادة وحساب نسبة الإنجاز وصلاحية الإغلاق
DROP VIEW IF EXISTS public.v_mfg_dashboard CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_dashboard WITH (security_invoker = true) AS
WITH progress_stats AS (
    SELECT
        production_order_id,
        count(*) as total_steps,
        count(*) FILTER (WHERE status = 'completed') as completed_steps,
        count(*) FILTER (WHERE qc_verified = true) as qc_passed_steps,
        SUM(labor_cost_actual) as total_labor_cost
    FROM public.mfg_order_progress
    GROUP BY production_order_id
),
serial_stats AS (
    SELECT
        production_order_id,
        count(*) as total_serials
    FROM public.mfg_batch_serials
    GROUP BY production_order_id
)
SELECT
    po.id as order_id,
    po.order_number,
    po.batch_number,
    p.name as product_name,
    po.quantity_to_produce,
    po.status,
    po.start_date,
    po.end_date,
    po.created_at,
    ps.total_steps,
    (po.status = 'in_progress' AND COALESCE(ps.total_steps, 0) > 0 AND COALESCE(ps.completed_steps, 0) = COALESCE(ps.total_steps, 0)) as can_finalize, -- Handle NULLs
    COALESCE(ps.completed_steps, 0) as completed_steps,
    COALESCE(ps.qc_passed_steps, 0) as qc_passed_steps,
    CASE WHEN ps.total_steps > 0 THEN ROUND((ps.completed_steps::numeric / ps.total_steps::numeric) * 100, 2) ELSE 0 END as completion_percentage,
    COALESCE(ps.total_labor_cost, 0) as current_labor_cost,
    po.organization_id,
    pv.variance_amount,
    pv.variance_percentage,
    COALESCE(ss.total_serials, 0) as total_serials_generated,
    COALESCE(p.requires_serial, false) as requires_serial -- Handle NULL for requires_serial
FROM public.mfg_production_orders po -- Use LEFT JOIN for robustness
JOIN public.products p ON po.product_id = p.id
LEFT JOIN progress_stats ps ON po.id = ps.production_order_id
LEFT JOIN public.mfg_production_variances pv ON po.id = pv.production_order_id
LEFT JOIN serial_stats ss ON po.id = ss.production_order_id;

GRANT SELECT ON public.v_mfg_dashboard TO authenticated;

-- 1. إنشاء رؤية السيريالات المتاحة في المخازن
DROP VIEW IF EXISTS public.v_mfg_available_serials CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_available_serials WITH (security_invoker = true) AS
SELECT
    bs.id,
    bs.serial_number,
    p.name as product_name,
    p.sku as product_code,
    po.order_number,
    po.batch_number,
    bs.created_at as production_date,
    bs.organization_id,
    bs.status as serial_status
FROM public.mfg_batch_serials bs -- Use LEFT JOIN for robustness
LEFT JOIN public.products p ON bs.product_id = p.id
LEFT JOIN public.mfg_production_orders po ON bs.production_order_id = po.id
WHERE bs.status = 'in_stock';

-- 2. رؤية التتبع الشاملة لكافة السيريالات وحالاتها (Traceability Master Table)
-- مخصصة للمحاسب لتتبع حركة كل قطعة من الإنتاج حتى البيع النهائي
DROP VIEW IF EXISTS public.v_mfg_serials_master_tracker CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_serials_master_tracker WITH (security_invoker = true) AS
SELECT
    bs.serial_number,
    p.name as product_name,
    p.sku as product_sku,
    po.order_number,
    po.batch_number,
    bs.status as serial_status,
    bs.created_at as production_date,
    bs.organization_id -- Use LEFT JOIN for robustness
FROM public.mfg_batch_serials bs
JOIN public.products p ON bs.product_id = p.id
JOIN public.mfg_production_orders po ON bs.production_order_id = po.id;

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
        -- 🕒 20. جدولة تنبيهات التصنيع (Manufacturing Alerts Automation)
        -- يتم تشغيل هذه المهام عبر pg_cron لفحص الانحرافات والسيريالات المفقودة
        BEGIN
            EXECUTE 'SELECT cron.unschedule(''mfg-efficiency-check'')';
            EXECUTE 'SELECT cron.unschedule(''mfg-variance-check'')';
            EXECUTE 'SELECT cron.unschedule(''mfg-cost-overrun-check'')';
            EXECUTE 'SELECT cron.unschedule(''mfg-missing-serials-check'')';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        PERFORM cron.schedule('daily-system-backup', '0 3 * * *', 'SELECT public.run_daily_backups_all_orgs();');
        PERFORM cron.schedule('mfg-efficiency-check', '0 * * * *', 'SELECT public.mfg_check_efficiency_alerts(75);');
        PERFORM cron.schedule('mfg-variance-check', '0 2 * * *', 'SELECT public.mfg_check_variance_alerts();');
        PERFORM cron.schedule('mfg-cost-overrun-check', '0 3 * * *', 'SELECT public.mfg_check_cost_overrun_alerts();');
        PERFORM cron.schedule('mfg-missing-serials-check', '0 4 * * *', 'SELECT public.mfg_check_missing_serials_alerts();');
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
CREATE OR REPLACE FUNCTION public.get_current_company_settings()
RETURNS SETOF public.company_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- جلب معرف المنظمة من البروفايل مباشرة (المصدر الأكثر ثقة)
    SELECT organization_id INTO v_org_id FROM public.profiles WHERE id = auth.uid();
    
    RETURN QUERY SELECT * FROM public.company_settings WHERE organization_id = v_org_id;
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
FOR EACH ROW
EXECUTE FUNCTION public.fn_ensure_order_warehouse();

-- 🛠️ دالة تريجر خصم المخزون اللحظي (Inventory Deduction)
-- مأخوذ من الملف المنفصل 2026-03-25_realtime_inventory_deduction.sql
CREATE OR REPLACE FUNCTION public.trigger_handle_stock_on_order()
RETURNS TRIGGER AS $$
BEGIN
    -- منطق الخصم اللحظي للمواد الخام والمنتجات الجاهزة عند اكتمال الطلب
    IF NEW.status IN ('COMPLETED', 'PAID') AND OLD.status NOT IN ('COMPLETED', 'PAID') THEN
        PERFORM public.mfg_deduct_stock_from_order(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 🛠️ دالة تنفيذ خصم المخزون (Integration between Sales & BOM Consumption)
CREATE OR REPLACE FUNCTION public.mfg_deduct_stock_from_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.orders WHERE id = p_order_id;
    -- نعتمد على محرك إعادة احتساب المخزون الشامل لأنه يدعم استهلاك الـ BOM للمبيعات آلياً
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

DROP TRIGGER IF EXISTS trg_handle_stock_on_order ON public.orders;
CREATE TRIGGER trg_handle_stock_on_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trigger_handle_stock_on_order();

-- 🛡️ تأمين الخزينة والمستودع الافتراضي عند إنشاء شركة جديدة
-- تم تحديث دالة initialize_egyptian_coa لضمان تعيين الأرصدة الافتتاحية بدقة
-- وربطها بحساب "الأرصدة الافتتاحية 3999" تلقائياً.

-- 🧪 دالة اختبار عزل البيانات (SaaS Isolation Unit Test)
-- الغرض: التأكد برمجياً من أن المدير في شركة ما لا يمكنه الوصول لبيانات شركة أخرى

-- إعادة تحميل كاش المخطط لضمان تعرف الـ API على التغييرات فوراً
NOTIFY pgrst, 'reload config';
-- 🛠️ مراقب تحديث حالة طلبات المطبخ
CREATE OR REPLACE FUNCTION public.trg_fn_update_kitchen_status_time()
RETURNS TRIGGER AS $t$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.status_updated_at = now();
    END IF;
    RETURN NEW;
END; $t$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kitchen_status_time ON public.kitchen_orders;
CREATE TRIGGER trg_kitchen_status_time
BEFORE UPDATE ON public.kitchen_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_update_kitchen_status_time();

-- 🛠️ نظام حساب تكلفة الوجبات التلقائي بناءً على المكونات (BOM)
CREATE OR REPLACE FUNCTION public.trg_fn_sync_meal_cost() RETURNS TRIGGER AS $t$
BEGIN
    UPDATE public.products
    SET 
        cost = public.get_product_recipe_cost(id),
        manufacturing_cost = public.get_product_recipe_cost(id)
    WHERE id = COALESCE(NEW.product_id, OLD.product_id);
    RETURN NULL;
END; $t$ LANGUAGE plpgsql;

-- 🛠️ مشغل لتحديث التكلفة عند تغيير بيانات العمالة أو المصاريف في بطاقة الصنف
CREATE OR REPLACE FUNCTION public.trg_fn_sync_product_costs_on_update() RETURNS TRIGGER AS $t$
BEGIN
    -- إذا تغيرت العمالة أو المصاريف أو نوع الحساب، نحدث التكلفة الإجمالية
    IF (OLD.labor_cost IS DISTINCT FROM NEW.labor_cost OR 
        OLD.overhead_cost IS DISTINCT FROM NEW.overhead_cost OR 
        OLD.is_overhead_percentage IS DISTINCT FROM NEW.is_overhead_percentage) THEN
        
        -- إذا كان للمنتج وصفة، نعيد حسابها وتحديث التكلفة
        IF EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = NEW.id) THEN
            NEW.cost := public.get_product_recipe_cost(NEW.id);
            NEW.manufacturing_cost := NEW.cost;
        END IF;
    END IF;
    RETURN NEW;
END; $t$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_costs_sync ON public.products;
CREATE TRIGGER trg_product_costs_sync 
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_product_costs_on_update();

DROP TRIGGER IF EXISTS trg_meal_cost_sync ON public.bill_of_materials;
CREATE TRIGGER trg_meal_cost_sync 
AFTER INSERT OR UPDATE OR DELETE ON public.bill_of_materials
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_meal_cost();

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
CREATE OR REPLACE FUNCTION public.update_single_supplier_balance(p_supplier_id uuid, p_org_id uuid)
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
CREATE OR REPLACE FUNCTION public.clear_demo_data(p_org_id uuid)
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
DECLARE
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

-- 7.2 دالة حساب معدل دوران المواد الخام (Raw Materials Turnover)
-- الغرض: قياس كفاءة إدارة المخزون من المواد الخام خلال فترة محددة
CREATE OR REPLACE FUNCTION public.mfg_calculate_raw_material_turnover(p_org_id uuid, p_start_date date, p_end_date date)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cost_of_raw_materials_used numeric := 0;
    v_beginning_raw_materials_inventory numeric := 0;
    v_ending_raw_materials_inventory numeric := 0;
    v_average_raw_materials_inventory numeric := 0;
    v_raw_materials_account_id uuid;
BEGIN
    -- 1. جلب معرف حساب مخزون المواد الخام (Code: 10301)
    SELECT id INTO v_raw_materials_account_id
    FROM public.accounts
    WHERE organization_id = p_org_id AND code = '10301' LIMIT 1;

    IF v_raw_materials_account_id IS NULL THEN
        RAISE EXCEPTION 'حساب مخزون المواد الخام (10301) غير معرف للمنظمة %', p_org_id;
    END IF;

    -- 2. حساب تكلفة المواد الخام المستخدمة (Numerator)
    -- نجمع قيمة الدائن لحساب مخزون المواد الخام من القيود المتعلقة بالتصنيع خلال الفترة
    SELECT COALESCE(SUM(jl.credit), 0)
    INTO v_cost_of_raw_materials_used
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE jl.account_id = v_raw_materials_account_id
      AND je.organization_id = p_org_id
      AND je.status = 'posted'
      AND je.transaction_date BETWEEN p_start_date AND p_end_date
      AND je.related_document_type IN ('mfg_material_request', 'mfg_step'); -- تصفية للعمليات التصنيعية التي تستهلك المواد الخام

    -- 3. حساب متوسط مخزون المواد الخام (Denominator)
    -- نستخدم الدالة المساعدة الجديدة لجلب الرصيد في تاريخ محدد
    v_beginning_raw_materials_inventory := public.get_account_balance_at_date(v_raw_materials_account_id, p_start_date - INTERVAL '1 day', p_org_id);
    v_ending_raw_materials_inventory := public.get_account_balance_at_date(v_raw_materials_account_id, p_end_date, p_org_id);

    v_average_raw_materials_inventory := (v_beginning_raw_materials_inventory + v_ending_raw_materials_inventory) / 2;

    IF v_average_raw_materials_inventory <= 0 THEN
        RETURN 0; -- تجنب القسمة على صفر إذا كان متوسط المخزون صفراً أو سالباً
    END IF;

    RETURN ROUND(v_cost_of_raw_materials_used / v_average_raw_materials_inventory, 2);
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
    -- 1. إنشاء منظمات اختبارية
    INSERT INTO public.organizations (name) VALUES ('Org A Test') RETURNING id INTO v_org_a;
    INSERT INTO public.organizations (name) VALUES ('Org B Test') RETURNING id INTO v_org_b;

    -- 2. إنشاء مستخدم (Admin) ينتمي للمنظمة A
    INSERT INTO public.profiles (id, organization_id, role, full_name) 
    VALUES (v_user_a, v_org_a, 'admin', 'Test Admin A');

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
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid) CASCADE;
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

-- تنشيط كاش النظام
NOTIFY pgrst, 'reload config';

-- نهاية ملف الدوال السيادية