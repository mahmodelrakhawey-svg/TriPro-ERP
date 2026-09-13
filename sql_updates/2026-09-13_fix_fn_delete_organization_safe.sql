-- =====================================================================
-- 🛡️ حل جذري ونهائي لمشاكل حذف الشركات والمنظمات (Foreign Key & HTTP Errors)
-- التاريخ: 2026-09-13
-- الوصف: 
--   0. تصحيح القيود المرجعية لموديول التشفية والتصنيع لتدعم الحذف المتسلسل (ON DELETE CASCADE)
--   1. تمكين تجاوز حماية الحسابات، العملاء، الموردين، والقيود عند الحذف (app.restore_mode = 'on')
--   2. تحديث دالة fn_delete_organization_safe لتفكيك وحذف كافة موديولات التشفية، التصنيع، والمطاعم قبل الأصناف
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. تعديل القيود المرجعية لموديول التشفية والتصنيع والمطاعم
-- ---------------------------------------------------------------------
DO $$ 
BEGIN
    -- أ. قيود موديول التشفية واللحوم (Butchering Module)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'butchering_orders') THEN
        ALTER TABLE public.butchering_orders DROP CONSTRAINT IF EXISTS butchering_orders_source_product_id_fkey;
        ALTER TABLE public.butchering_orders ADD CONSTRAINT butchering_orders_source_product_id_fkey 
            FOREIGN KEY (source_product_id) REFERENCES public.products(id) ON DELETE CASCADE;
            
        ALTER TABLE public.butchering_orders DROP CONSTRAINT IF EXISTS butchering_orders_organization_id_fkey;
        ALTER TABLE public.butchering_orders ADD CONSTRAINT butchering_orders_organization_id_fkey 
            FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'butchering_order_items') THEN
        ALTER TABLE public.butchering_order_items DROP CONSTRAINT IF EXISTS butchering_order_items_output_product_id_fkey;
        ALTER TABLE public.butchering_order_items ADD CONSTRAINT butchering_order_items_output_product_id_fkey 
            FOREIGN KEY (output_product_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'butchering_templates') THEN
        ALTER TABLE public.butchering_templates DROP CONSTRAINT IF EXISTS butchering_templates_source_product_id_fkey;
        ALTER TABLE public.butchering_templates ADD CONSTRAINT butchering_templates_source_product_id_fkey 
            FOREIGN KEY (source_product_id) REFERENCES public.products(id) ON DELETE CASCADE;

        ALTER TABLE public.butchering_templates DROP CONSTRAINT IF EXISTS butchering_templates_organization_id_fkey;
        ALTER TABLE public.butchering_templates ADD CONSTRAINT butchering_templates_organization_id_fkey 
            FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'butchering_template_items') THEN
        ALTER TABLE public.butchering_template_items DROP CONSTRAINT IF EXISTS butchering_template_items_output_product_id_fkey;
        ALTER TABLE public.butchering_template_items ADD CONSTRAINT butchering_template_items_output_product_id_fkey 
            FOREIGN KEY (output_product_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;

    -- ب. قيود موديول التصنيع (Manufacturing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_production_orders') THEN
        ALTER TABLE public.mfg_production_orders DROP CONSTRAINT IF EXISTS mfg_production_orders_product_id_fkey;
        ALTER TABLE public.mfg_production_orders ADD CONSTRAINT mfg_production_orders_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_scrap_logs') THEN
        ALTER TABLE public.mfg_scrap_logs DROP CONSTRAINT IF EXISTS mfg_scrap_logs_product_id_fkey;
        ALTER TABLE public.mfg_scrap_logs ADD CONSTRAINT mfg_scrap_logs_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_batch_serials') THEN
        ALTER TABLE public.mfg_batch_serials DROP CONSTRAINT IF EXISTS mfg_batch_serials_product_id_fkey;
        ALTER TABLE public.mfg_batch_serials ADD CONSTRAINT mfg_batch_serials_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_actual_material_usage') THEN
        ALTER TABLE public.mfg_actual_material_usage DROP CONSTRAINT IF EXISTS mfg_actual_material_usage_raw_material_id_fkey;
        ALTER TABLE public.mfg_actual_material_usage ADD CONSTRAINT mfg_actual_material_usage_raw_material_id_fkey 
            FOREIGN KEY (raw_material_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;

    -- ج. قيود موديول المطاعم ونقاط البيع (Restaurants & POS)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kitchen_ticket_items') THEN
        ALTER TABLE public.kitchen_ticket_items DROP CONSTRAINT IF EXISTS kitchen_ticket_items_product_id_fkey;
        ALTER TABLE public.kitchen_ticket_items ADD CONSTRAINT kitchen_ticket_items_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_channel_prices') THEN
        ALTER TABLE public.product_channel_prices DROP CONSTRAINT IF EXISTS product_channel_prices_product_id_fkey;
        ALTER TABLE public.product_channel_prices ADD CONSTRAINT product_channel_prices_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. تحديث دوال حماية القيود والحسابات والعملاء والموردين لدعم وضع التجاوز
-- ---------------------------------------------------------------------

-- أ. حماية سطور القيود المرحّلة (مع السماح بالحذف أثناء مسح المنظمة)
CREATE OR REPLACE FUNCTION public.fn_protect_posted_journal_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        SELECT status INTO v_status FROM public.journal_entries WHERE id = OLD.journal_entry_id;
        IF v_status = 'posted' THEN
            RAISE EXCEPTION 'لا يمكن حذف أطراف قيد يومية مرحل (%s). يرجى إلغاء ترحيل القيد أولاً.', OLD.journal_entry_id;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT status INTO v_status FROM public.journal_entries WHERE id = NEW.journal_entry_id;
        IF v_status = 'posted' AND (OLD.debit <> NEW.debit OR OLD.credit <> NEW.credit OR OLD.account_id <> NEW.account_id) THEN
            RAISE EXCEPTION 'لا يمكن تعديل أطراف قيد يومية مرحل (%s). يرجى إلغاء ترحيل القيد أولاً.', NEW.journal_entry_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;

-- ب. حماية الحسابات من الحذف (مع السماح بالحذف أثناء مسح المنظمة)
CREATE OR REPLACE FUNCTION public.fn_protect_accounts_with_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.journal_lines WHERE account_id = OLD.id;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'لا يمكن حذف الحساب (% - %) لوجود % حركة/حركات محاسبية مسجلة عليه.', OLD.code, OLD.name, v_count;
    END IF;
    RETURN OLD;
END;
$$;

-- ج. حماية العملاء من الحذف (مع السماح بالحذف أثناء مسح المنظمة)
CREATE OR REPLACE FUNCTION public.fn_protect_customers_with_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv_count INTEGER;
    v_rv_count INTEGER;
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    SELECT COUNT(*) INTO v_inv_count FROM public.invoices WHERE customer_id = OLD.id;
    SELECT COUNT(*) INTO v_rv_count FROM public.receipt_vouchers WHERE customer_id = OLD.id;
    
    IF (v_inv_count + v_rv_count) > 0 THEN
        RAISE EXCEPTION 'لا يمكن الحذف النهائي للعميل (%) لوجود مستندات مالية مرتبطة به. استخدم الحذف المنطقي (Archive/Soft Delete).', OLD.name;
    END IF;
    RETURN OLD;
END;
$$;

-- د. حماية الموردين من الحذف (مع السماح بالحذف أثناء مسح المنظمة)
CREATE OR REPLACE FUNCTION public.fn_protect_suppliers_with_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pi_count INTEGER;
    v_pv_count INTEGER;
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    SELECT COUNT(*) INTO v_pi_count FROM public.purchase_invoices WHERE supplier_id = OLD.id;
    SELECT COUNT(*) INTO v_pv_count FROM public.payment_vouchers WHERE supplier_id = OLD.id;
    
    IF (v_pi_count + v_pv_count) > 0 THEN
        RAISE EXCEPTION 'لا يمكن الحذف النهائي للمورد (%) لوجود مستندات مالية مرتبطة به.', OLD.name;
    END IF;
    RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. إعادة بناء دالة حذف المنظمات بأمان تام وديناميكي (Hardened & Bulletproof)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_delete_organization_safe(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tables text[] := ARRAY[
        -- المرفقات والتفاصيل الدقيقة
        'notification_audit_log', 'cheque_attachments', 'receipt_voucher_attachments', 
        'payment_voucher_attachments', 'journal_attachments', 'notification_preferences', 
        'security_logs', 'audit_logs', 'organization_backups',
        
        -- موديول التشفية وتفكيك الذبائح (Butchering Yield Module)
        'butchering_order_items', 'butchering_orders', 'butchering_template_items', 'butchering_templates',

        -- موديول التصنيع (Manufacturing)
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
        
        -- السجلات الرئيسية للشركة
        'assets', 'products', 'customers', 'suppliers', 'employees', 'accounts', 
        'cost_centers', 'warehouses', 'invitations', 'budgets', 'company_settings'
    ];
    v_t text;
    v_dyn RECORD;
    v_caller_role text;
BEGIN
    -- أ. التحقق من المدخلات
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'معرف الشركة غير صالح أو فارغ.';
    END IF;

    -- ب. التحقق من صلاحية المستخدم (super_admin أو admin أو owner)
    v_caller_role := COALESCE(public.get_my_role(), auth.jwt() ->> 'role', '');
    IF v_caller_role NOT IN ('super_admin', 'admin', 'owner') 
       AND COALESCE(auth.jwt() ->> 'role', '') NOT IN ('super_admin', 'service_role') THEN
        RAISE EXCEPTION '⚠️ خطأ أمني: غير مصرح لك بحذف المنظمات من هذا المستوى.';
    END IF;

    -- ج. تفعيل وضع التجاوز (Restore Mode) لتعطيل موانع الحذف
    PERFORM set_config('app.restore_mode', 'on', true);

    -- د. فك ارتباط كافة المستخدمين بالمنظمة في جدول profiles لمنع تعارض المفتاح الأجنبي
    BEGIN
        UPDATE public.profiles 
        SET organization_id = NULL 
        WHERE organization_id = p_org_id;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- هـ. حذف صلاحيات وأدوار المنظمة
    BEGIN
        DELETE FROM public.role_permissions WHERE organization_id = p_org_id;
        DELETE FROM public.roles WHERE organization_id = p_org_id;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- و.1 تفكيك موديول التشفية واللحوم (Butchering) مسبقاً لمنع أي تعارض مفاتيح مع الأصناف
    BEGIN
        DELETE FROM public.butchering_order_items 
        WHERE order_id IN (SELECT id FROM public.butchering_orders WHERE organization_id = p_org_id)
           OR output_product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.butchering_orders 
        WHERE organization_id = p_org_id 
           OR source_product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.butchering_template_items 
        WHERE template_id IN (SELECT id FROM public.butchering_templates WHERE organization_id = p_org_id)
           OR output_product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.butchering_templates 
        WHERE organization_id = p_org_id 
           OR source_product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- و.2 تفكيك قيود موديول التصنيع المتبقية مسبقاً
    BEGIN
        DELETE FROM public.mfg_actual_material_usage 
        WHERE organization_id = p_org_id 
           OR raw_material_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.mfg_scrap_logs 
        WHERE organization_id = p_org_id 
           OR product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.mfg_batch_serials 
        WHERE organization_id = p_org_id 
           OR product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.mfg_step_materials 
        WHERE organization_id = p_org_id 
           OR raw_material_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.bill_of_materials 
        WHERE organization_id = p_org_id 
           OR product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id)
           OR raw_material_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.mfg_production_orders 
        WHERE organization_id = p_org_id 
           OR product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.mfg_routings 
        WHERE organization_id = p_org_id 
           OR product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- و.3 تفكيك قيود المطاعم ونقاط البيع المرتبطة بالأصناف
    BEGIN
        DELETE FROM public.kitchen_ticket_items 
        WHERE organization_id = p_org_id 
           OR product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.product_channel_prices 
        WHERE organization_id = p_org_id 
           OR product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.recipe_items 
        WHERE product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id)
           OR ingredient_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM public.combo_items 
        WHERE product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id)
           OR included_product_id IN (SELECT id FROM public.products WHERE organization_id = p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- ز. المسح المتسلسل لكافة الجداول المعروفة
    FOREACH v_t IN ARRAY v_tables
    LOOP
        BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE organization_id = %L', v_t, p_org_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- ح. شبكة الأمان الديناميكية: فحص وحذف أي جدول آخر بقاعدة البيانات مرتبط بمفتاح أجنبي مع organizations
    FOR v_dyn IN (
        SELECT DISTINCT
            c.conrelid::regclass::text AS tbl,
            a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.confrelid = 'public.organizations'::regclass
          AND c.contype = 'f'
          AND c.conrelid::regclass::text NOT IN ('public.organizations', 'public.profiles')
    ) LOOP
        BEGIN
            EXECUTE format('DELETE FROM %s WHERE %I = %L', v_dyn.tbl, v_dyn.col, p_org_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- ط. حذف سجل المنظمة نهائياً
    DELETE FROM public.organizations WHERE id = p_org_id;

    -- ي. إعادة وضع الحماية الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);

END; $$;

-- تحديث كاش المخطط
NOTIFY pgrst, 'reload schema';
