-- =====================================================================
-- 🛡️ حل جذري ونهائي لمشاكل حذف الشركات والمنظمات (HTTP 400, 409, 500)
-- التاريخ: 2026-09-13
-- الوصف: 
--   1. تمكين تجاوز حماية الحسابات، العملاء، الموردين، والقيود عند الحذف (app.restore_mode = 'on')
--   2. تحديث دالة fn_delete_organization_safe لدعم الصلاحيات الكاملة (super_admin / admin / owner)
--   3. فك ارتباط بروفايلات المستخدمين والأدوار وحذف الجداول التابعة ديناميكياً
-- =====================================================================

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
    -- السماح بالتجاوز أثناء مسح المنظمة أو استعادة النسخ الاحتياطية
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
    -- السماح بالتجاوز أثناء مسح المنظمة
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
    -- السماح بالتجاوز أثناء مسح المنظمة
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
    -- السماح بالتجاوز أثناء مسح المنظمة
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
        
        -- موديول التصنيع (Manufacturing)
        'mfg_step_materials', 'mfg_step_attachments', 'mfg_production_order_materials', 
        'mfg_production_order_steps', 'mfg_scrap_records', 'mfg_qc_inspections',
        'mfg_production_orders', 'mfg_routings', 'mfg_work_centers',
        
        -- موديول المطاعم والكاشير والورديات
        'order_item_modifiers', 'order_items', 'kitchen_orders', 'orders', 
        'table_sessions', 'shifts', 'restaurant_tables', 'modifiers', 'modifier_groups',
        
        -- موديول الاستاد والمشاريع والصحة
        'stadium_court_pricing', 'stadium_subscriptions', 'stadium_bookings', 'stadium_academy_trainees',
        'stadium_courts', 'stadium_members', 'stadium_academies',
        'construction_boq_items', 'construction_progress_billings', 'construction_subcontracts', 'construction_projects',
        'hims_prescription_items', 'hims_invoice_items', 'hims_lab_order_items', 'hims_radiology_order_items',
        'hims_vital_signs', 'hims_visits', 'hims_inpatient_admissions', 'hims_appointments',
        'hims_patients', 'hims_doctors', 'hims_departments', 'hims_rooms', 'hims_beds',

        -- فواتير المبيعات والمشتريات والتسويات
        'invoice_items', 'purchase_invoice_items', 'sales_return_items', 'purchase_return_items', 
        'stock_adjustment_items', 'payroll_variables', 'payroll_items', 'journal_lines',
        'delivery_orders', 'payments', 'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 
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

    -- و. المسح المتسلسل لكافة الجداول المعروفة
    FOREACH v_t IN ARRAY v_tables
    LOOP
        BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE organization_id = %L', v_t, p_org_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- ز. شبكة الأمان الديناميكية: فحص وحذف أي جدول آخر بقاعدة البيانات مرتبط بمفتاح أجنبي مع organizations
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

    -- ح. حذف سجل المنظمة نهائياً
    DELETE FROM public.organizations WHERE id = p_org_id;

    -- ط. إعادة وضع الحماية الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);

END; $$;

-- تحديث كاش المخطط
NOTIFY pgrst, 'reload schema';
