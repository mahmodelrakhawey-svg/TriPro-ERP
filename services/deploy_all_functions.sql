-- 🛠️ ملف نشر جميع دوال النظام (Deploy All Functions)
-- 🛠️ ملف نشر جميع دوال النظام (Deploy All Functions) - النسخة الكاملة
-- هذا الملف يجمع كافة الدوال البرمجية (RPCs) اللازمة لتشغيل النظام.
-- يجب تشغيله بعد إنشاء الجداول (setup_new_client_db.sql).

-- ================================================================
-- 1. دالة اعتماد الفاتورة (Sales Invoice)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice record;
    v_item record;
    v_org_id uuid;
    v_sales_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inventory_acc_id uuid;
    v_discount_acc_id uuid;
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_total_cost numeric := 0;
    v_item_cost numeric;
    v_exchange_rate numeric;
    v_total_amount_base numeric;
    v_paid_amount_base numeric;
    v_subtotal_base numeric;
    v_tax_amount_base numeric;
    v_discount_amount_base numeric;
    v_bom_item record;
    v_modifier_json jsonb;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    v_org_id := public.get_my_org();
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' LIMIT 1; -- إيراد مبيعات
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2231' LIMIT 1; -- ضريبة مخرجات
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' LIMIT 1; -- العملاء
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '511' LIMIT 1; -- تكلفة مبيعات
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' LIMIT 1; -- مخزون منتج تام
    SELECT id INTO v_discount_acc_id FROM public.accounts WHERE code = '4102' LIMIT 1;
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_sales_acc_id IS NULL OR v_customer_acc_id IS NULL THEN RAISE EXCEPTION 'حسابات المبيعات أو العملاء غير معرّفة'; END IF;

    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        SELECT weighted_average_cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
        -- (منطق حساب التكلفة الحالي يبقى كما هو)
        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_item.quantity);

        -- 1. خصم المكونات (BOM) للمنتج الأساسي إذا وجدت
        IF EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = v_item.product_id) THEN
            FOR v_bom_item IN SELECT raw_material_id, quantity_required FROM public.bill_of_materials WHERE product_id = v_item.product_id LOOP
                UPDATE public.products 
                SET stock = stock - (v_bom_item.quantity_required * v_item.quantity),
                    warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - (v_bom_item.quantity_required * v_item.quantity)))
                WHERE id = v_bom_item.raw_material_id;
            END LOOP;
        ELSE
            -- الخصم العادي للمنتج نفسه في حال عدم وجود وصفة
            UPDATE public.products 
            SET stock = stock - v_item.quantity,
                warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_item.quantity))
            WHERE id = v_item.product_id;
        END IF;

        -- 2. معالجة خصم مكونات الإضافات (Modifiers)
        IF v_item.modifiers IS NOT NULL THEN
            FOR v_modifier_json IN SELECT * FROM jsonb_array_elements(v_item.modifiers) LOOP
                -- إذا كانت الإضافة مرتبطة بصنف مخزني (له ID) وله وصفة محددة
                IF (v_modifier_json->>'id') IS NOT NULL THEN
                    FOR v_bom_item IN SELECT raw_material_id, quantity_required FROM public.bill_of_materials WHERE product_id = (v_modifier_json->>'id')::uuid LOOP
                        UPDATE public.products 
                        SET stock = stock - (v_bom_item.quantity_required * v_item.quantity),
                            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - (v_bom_item.quantity_required * v_item.quantity)))
                        WHERE id = v_bom_item.raw_material_id;
                    END LOOP;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_paid_amount_base := COALESCE(v_invoice.paid_amount, 0) * v_exchange_rate;
    v_subtotal_base := v_invoice.subtotal * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_discount_amount_base := COALESCE(v_invoice.discount_amount, 0) * v_exchange_rate;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'invoice', true) 
    RETURNING id INTO v_journal_id;

    IF (v_total_amount_base - v_paid_amount_base) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, (v_total_amount_base - v_paid_amount_base), 0, 'استحقاق عميل', v_org_id);
    END IF;
    IF v_paid_amount_base > 0 THEN
        IF v_treasury_acc_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة للمبلغ المدفوع'; END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_treasury_acc_id, v_paid_amount_base, 0, 'تحصيل نقدي', v_org_id);
    END IF;
    IF v_discount_amount_base > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_discount_acc_id, v_discount_amount_base, 0, 'خصم ممنوح', v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_acc_id, 0, v_subtotal_base, 'إيراد مبيعات', v_org_id);
    IF v_tax_amount_base > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_tax_amount_base, 'ضريبة القيمة المضافة', v_org_id);
    END IF;
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id);
    END IF;

    UPDATE public.invoices SET status = CASE WHEN (total_amount - COALESCE(paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END;
$$;

-- ================================================================
-- 2. دالة اعتماد فاتورة المشتريات (Purchase Invoice)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice record;
    v_item record;
    v_org_id uuid;
    v_inventory_acc_id uuid;
    v_vat_acc_id uuid;
    v_supplier_acc_id uuid;
    v_journal_id uuid;
    v_current_stock numeric;
    v_current_avg_cost numeric;
    v_new_avg_cost numeric;
    v_exchange_rate numeric;
    v_item_price_base numeric;
    v_total_amount_base numeric;
    v_tax_amount_base numeric;
    v_net_amount_base numeric;
    -- متغيرات منطق الـ BOM
    v_bom_item record;
    v_total_bom_cost numeric;
    v_raw_material_price numeric;
    v_item_qty numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    v_org_id := public.get_my_org();
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' LIMIT 1; -- استخدام حساب المنتج التام بدلاً من مجموعة المخزون
    
    -- تحسين: البحث في ربط الحسابات المخصص أولاً، ثم الكود الافتراضي الصحيح 1241
    SELECT (account_mappings->>'VAT_INPUT')::uuid INTO v_vat_acc_id FROM public.company_settings LIMIT 1;
    IF v_vat_acc_id IS NULL THEN 
        SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '1241' LIMIT 1; 
    END IF;
    
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' LIMIT 1;

    -- فحص صارم لضمان عدم وجود NULL في القيد
    IF v_inventory_acc_id IS NULL THEN RAISE EXCEPTION 'حساب المخزون (10302) غير موجود'; END IF;
    IF v_supplier_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الموردين (201) غير موجود'; END IF;
    IF v_invoice.tax_amount > 0 AND v_vat_acc_id IS NULL THEN 
        RAISE EXCEPTION 'حساب ضريبة المدخلات غير معرّف. يرجى التأكد من وجود حساب بالكود 1241 أو ربطه في الإعدادات.'; 
    END IF;

    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        v_item_price_base := v_item.price * v_exchange_rate;

        -- التحقق مما إذا كان المنتج له قائمة مواد (BOM)
        IF EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = v_item.product_id) THEN
            -- حساب إجمالي القيمة الحالية للمكونات لتحديد نسب التوزيع
            SELECT SUM(COALESCE(p.weighted_average_cost, p.purchase_price, p.cost, 0) * bom.quantity_required)
            INTO v_total_bom_cost
            FROM public.bill_of_materials bom
            JOIN public.products p ON p.id = bom.raw_material_id
            WHERE bom.product_id = v_item.product_id;

            IF v_total_bom_cost IS NULL OR v_total_bom_cost = 0 THEN v_total_bom_cost := 1; END IF;

            FOR v_bom_item IN 
                SELECT bom.raw_material_id, bom.quantity_required, 
                       COALESCE(p.weighted_average_cost, p.purchase_price, p.cost, 0) as current_unit_cost
                FROM public.bill_of_materials bom
                JOIN public.products p ON p.id = bom.raw_material_id
                WHERE bom.product_id = v_item.product_id
            LOOP
                -- الكمية المضافة: متطلب الـ BOM * كمية الشراء
                v_item_qty := v_bom_item.quantity_required * v_item.quantity;
                
                -- توزيع سعر الشراء بناءً على نسب قيمة المكونات الحالية
                v_raw_material_price := (v_item_price_base * (v_bom_item.current_unit_cost * v_bom_item.quantity_required / v_total_bom_cost)) / v_bom_item.quantity_required;

                SELECT stock, weighted_average_cost INTO v_current_stock, v_current_avg_cost 
                FROM public.products WHERE id = v_bom_item.raw_material_id;
                
                v_current_stock := COALESCE(v_current_stock, 0);
                v_current_avg_cost := COALESCE(v_current_avg_cost, 0);

                IF (v_current_stock + v_item_qty) > 0 THEN
                    v_new_avg_cost := ((v_current_stock * v_current_avg_cost) + (v_item_qty * v_raw_material_price)) / (v_current_stock + v_item_qty);
                ELSE
                    v_new_avg_cost := v_raw_material_price;
                END IF;

                UPDATE public.products 
                SET stock = stock + v_item_qty,
                    warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_item_qty)),
                    purchase_price = v_raw_material_price, weighted_average_cost = v_new_avg_cost, cost = v_new_avg_cost
                WHERE id = v_bom_item.raw_material_id;
            END LOOP;
        ELSE
            -- الشراء العادي (لا توجد قائمة مواد)
            SELECT stock, weighted_average_cost INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_item.product_id;
            v_current_stock := COALESCE(v_current_stock, 0);
            v_current_avg_cost := COALESCE(v_current_avg_cost, 0);

            IF (v_current_stock + v_item.quantity) > 0 THEN
                v_new_avg_cost := ((v_current_stock * v_current_avg_cost) + (v_item.quantity * v_item_price_base)) / (v_current_stock + v_item.quantity);
            ELSE
                v_new_avg_cost := v_item_price_base;
            END IF;

            UPDATE public.products 
            SET stock = stock + v_item.quantity,
                warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_item.quantity)),
                purchase_price = v_item_price_base, weighted_average_cost = v_new_avg_cost, cost = v_new_avg_cost
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_net_amount_base := v_total_amount_base - v_tax_amount_base;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) 
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات', v_org_id);
    IF v_tax_amount_base > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات', v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد', v_org_id);

    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END;
$$;

-- ================================================================
-- 3. دالة اعتماد سند القبض (Receipt Voucher)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid)
RETURNS void AS $$
DECLARE
    v_voucher public.receipt_vouchers%ROWTYPE;
    v_org_id uuid;
    v_journal_id uuid;
    v_exchange_rate numeric;
    v_amount_base numeric;
BEGIN
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود'; END IF;
    v_org_id := public.get_my_org();
    v_exchange_rate := COALESCE(v_voucher.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;
    v_amount_base := v_voucher.amount * v_exchange_rate;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض رقم ' || COALESCE(v_voucher.voucher_number, '-'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true) 
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, v_amount_base, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, p_credit_account_id, 0, v_amount_base, v_voucher.notes, v_org_id);

    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 4. دالة اعتماد سند الصرف (Payment Voucher)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid)
RETURNS void AS $$
DECLARE
    v_voucher public.payment_vouchers%ROWTYPE;
    v_org_id uuid;
    v_journal_id uuid;
    v_exchange_rate numeric;
    v_amount_base numeric;
BEGIN
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود'; END IF;
    v_org_id := public.get_my_org();
    v_exchange_rate := COALESCE(v_voucher.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;
    v_amount_base := v_voucher.amount * v_exchange_rate;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف رقم ' || COALESCE(v_voucher.voucher_number, '-'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true) 
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, p_debit_account_id, v_amount_base, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_amount_base, v_voucher.notes, v_org_id);

    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 5. دالة اعتماد مرتجع المبيعات (Sales Return)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_sales_return_acc_id uuid; v_vat_acc_id uuid; v_customer_acc_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'المرتجع مرحل بالفعل'; END IF;
    v_org_id := public.get_my_org();

    SELECT id INTO v_sales_return_acc_id FROM public.accounts WHERE code = '412' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' LIMIT 1;

    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock + v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity)) WHERE id = v_item.product_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id, related_document_id, related_document_type) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', true, v_org_id, p_return_id, 'sales_return') RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_journal_id, v_sales_return_acc_id, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_return.tax_amount, 0, v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_journal_id, v_customer_acc_id, 0, v_return.total_amount, v_org_id);

    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END;
$$;

-- ================================================================
-- 6. دالة اعتماد مرتجع المشتريات (Purchase Return)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المشتريات غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'المرتجع مرحل بالفعل'; END IF;
    v_org_id := public.get_my_org();

    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' LIMIT 1; -- مخزون منتج تام
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '10204' LIMIT 1;
    IF v_vat_acc_id IS NULL THEN SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1; END IF;
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' LIMIT 1;

    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock - v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مشتريات رقم ' || COALESCE(v_return.return_number, '-'), v_return.return_number, 'posted', v_org_id, p_return_id, 'purchase_return', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, v_return.total_amount, 0, 'مرتجع مشتريات', v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, 0, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 'مخزون', v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_return.tax_amount, 'ضريبة مدخلات (عكس)', v_org_id);
    END IF;

    UPDATE public.purchase_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END;
$$;

-- ================================================================
-- 7. دالة إعادة احتساب المخزون (Recalculate Stock)
-- ================================================================
CREATE OR REPLACE FUNCTION recalculate_stock_rpc()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC;
BEGIN
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL LOOP
        total_qty := 0; wh_json := '{}'::jsonb;
        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL LOOP
            wh_qty := 0;
            -- Sales (Direct + BOM Components + Modifiers)
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft' AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = ii.product_id)), 0) INTO wh_qty;
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity * bom.quantity_required) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id WHERE bom.raw_material_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft'), 0) INTO wh_qty;
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity * bom.quantity_required) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ii.modifiers, '[]'::jsonb)) AS m JOIN public.bill_of_materials bom ON bom.product_id = (m->>'id')::uuid WHERE bom.raw_material_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft'), 0) INTO wh_qty;

            -- Purchases (Direct + BOM Components)
            SELECT wh_qty + COALESCE((SELECT SUM(pii.quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft' AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = pii.product_id)), 0) INTO wh_qty;
            SELECT wh_qty + COALESCE((SELECT SUM(pii.quantity * bom.quantity_required) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id JOIN public.bill_of_materials bom ON bom.product_id = pii.product_id WHERE bom.raw_material_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft'), 0) INTO wh_qty;

            -- Sales Returns
            SELECT wh_qty + COALESCE(SUM(sri.quantity), 0) INTO wh_qty FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.sales_return_id WHERE sri.product_id = prod_record.id AND sr.warehouse_id = wh_record.id AND sr.status != 'draft';
            -- Purchase Returns
            SELECT wh_qty - COALESCE(SUM(pri.quantity), 0) INTO wh_qty FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.purchase_return_id WHERE pri.product_id = prod_record.id AND pr.warehouse_id = wh_record.id AND pr.status != 'draft';
            -- Stock Transfers (Out)
            SELECT wh_qty - COALESCE(SUM(sti.quantity), 0) INTO wh_qty FROM stock_transfer_items sti JOIN stock_transfers st ON st.id = sti.stock_transfer_id WHERE sti.product_id = prod_record.id AND st.from_warehouse_id = wh_record.id AND st.status != 'draft';
            -- Stock Transfers (In)
            SELECT wh_qty + COALESCE(SUM(sti.quantity), 0) INTO wh_qty FROM stock_transfer_items sti JOIN stock_transfers st ON st.id = sti.stock_transfer_id WHERE sti.product_id = prod_record.id AND st.to_warehouse_id = wh_record.id AND st.status != 'draft';
            -- Opening Inventory
            SELECT wh_qty + COALESCE(SUM(oi.quantity), 0) INTO wh_qty FROM opening_inventories oi WHERE oi.product_id = prod_record.id AND oi.warehouse_id = wh_record.id;

            total_qty := total_qty + wh_qty;
            IF wh_qty <> 0 THEN wh_json := wh_json || jsonb_build_object(wh_record.id, wh_qty); END IF;
        END LOOP;
        UPDATE products SET stock = total_qty, warehouse_stock = wh_json WHERE id = prod_record.id;
    END LOOP;
END;
$$;

-- ================================================================
-- 8. دالة تشغيل الإهلاك (Run Depreciation)
-- ================================================================
CREATE OR REPLACE FUNCTION public.run_period_depreciation(p_date date, p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_asset record; v_monthly_depreciation numeric; v_journal_id uuid; v_processed_count integer := 0; v_skipped_count integer := 0; v_dep_exp_acc_id uuid; v_acc_dep_acc_id uuid;
BEGIN
    FOR v_asset IN SELECT * FROM public.assets WHERE status = 'active' AND (purchase_cost - salvage_value) > 0 AND organization_id = p_org_id LOOP
        PERFORM 1 FROM public.journal_entries WHERE related_document_id = v_asset.id AND related_document_type = 'asset_depreciation' AND to_char(transaction_date, 'YYYY-MM') = to_char(p_date, 'YYYY-MM');
        IF FOUND THEN v_skipped_count := v_skipped_count + 1; CONTINUE; END IF;

        IF v_asset.useful_life > 0 THEN v_monthly_depreciation := (v_asset.purchase_cost - v_asset.salvage_value) / (v_asset.useful_life * 12); ELSE v_monthly_depreciation := 0; END IF;

        IF v_monthly_depreciation > 0 THEN
            v_dep_exp_acc_id := COALESCE(v_asset.depreciation_expense_account_id, (SELECT id FROM public.accounts WHERE code = '5202' LIMIT 1));
            v_acc_dep_acc_id := COALESCE(v_asset.accumulated_depreciation_account_id, (SELECT id FROM public.accounts WHERE code = '1399' LIMIT 1));

            IF v_dep_exp_acc_id IS NOT NULL AND v_acc_dep_acc_id IS NOT NULL THEN
                INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id, related_document_id, related_document_type) 
                VALUES (p_date, 'إهلاك شهري للأصل: ' || v_asset.name, 'DEP-' || substring(v_asset.id::text, 1, 6) || '-' || to_char(p_date, 'YYYYMM'), 'posted', true, p_org_id, v_asset.id, 'asset_depreciation') RETURNING id INTO v_journal_id;

                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_dep_exp_acc_id, v_monthly_depreciation, 0, 'مصروف إهلاك - ' || v_asset.name, p_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_dep_acc_id, 0, v_monthly_depreciation, 'مجمع إهلاك - ' || v_asset.name, p_org_id);
                v_processed_count := v_processed_count + 1;
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('processed', v_processed_count, 'skipped', v_skipped_count);
END;
$$;

-- ================================================================
-- 9. دالة إصلاح هيكل المرتجعات (Fix Returns Schema)
-- ================================================================
CREATE OR REPLACE FUNCTION public.fix_returns_schema()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE result_msg text := '';
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'sales_return_id') THEN
            ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id;
            result_msg := result_msg || 'تم تصحيح sales_return_items. ';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'purchase_return_id') THEN
            ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id;
            result_msg := result_msg || 'تم تصحيح purchase_return_items. ';
        END IF;
    END IF;
    IF result_msg = '' THEN RETURN 'الهيكل سليم بالفعل.'; END IF;
    RETURN result_msg;
END;
$$;

-- ================================================================
-- 10. دالة اعتماد الإشعار الدائن (Credit Note)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_note record; v_org_id uuid; v_sales_allowance_acc_id uuid; v_vat_acc_id uuid; v_customer_acc_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار الدائن غير موجود'; END IF;
    IF v_note.status = 'posted' THEN RAISE EXCEPTION 'الإشعار مرحل بالفعل'; END IF;
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    SELECT id INTO v_sales_allowance_acc_id FROM public.accounts WHERE code = '4102' LIMIT 1;
    IF v_sales_allowance_acc_id IS NULL THEN SELECT id INTO v_sales_allowance_acc_id FROM public.accounts WHERE code = '4101' LIMIT 1; END IF;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' LIMIT 1;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار دائن رقم ' || COALESCE(v_note.credit_note_number, '-'), v_note.credit_note_number, 'posted', v_org_id, p_note_id, 'credit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_allowance_acc_id, v_note.amount_before_tax, 0, 'مسموحات مبيعات', v_org_id);
    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_note.tax_amount, 0, 'ضريبة (إشعار دائن)', v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, 0, v_note.total_amount, 'إشعار دائن للعميل', v_org_id);

    UPDATE public.credit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END;
$$;

-- ================================================================
-- 11. دالة اعتماد الإشعار المدين (Debit Note)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_note record; v_org_id uuid; v_purchase_discount_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار المدين غير موجود'; END IF;
    IF v_note.status = 'posted' THEN RAISE EXCEPTION 'الإشعار مرحل بالفعل'; END IF;
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    SELECT id INTO v_purchase_discount_acc_id FROM public.accounts WHERE code = '5101' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '10204' LIMIT 1;
    IF v_vat_acc_id IS NULL THEN SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1; END IF;
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' LIMIT 1;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار مدين رقم ' || COALESCE(v_note.debit_note_number, '-'), v_note.debit_note_number, 'posted', v_org_id, p_note_id, 'debit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, v_note.total_amount, 0, 'إشعار مدين للمورد', v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_purchase_discount_acc_id, 0, v_note.amount_before_tax, 'تسوية مشتريات', v_org_id);
    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_note.tax_amount, 'ضريبة (إشعار مدين)', v_org_id);
    END IF;

    UPDATE public.debit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END;
$$;
-- إضافة عمود لتخزين بيانات الحجز (اسم العميل والوقت)
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS reservation_info JSONB;

-- ================================================================
-- 13. دالة فتح جلسة طاولة (Open Table Session)
-- ================================================================
-- حذف النسخ القديمة لمنع تعارض الأسماء (Function Overloading)
DROP FUNCTION IF EXISTS public.open_table_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.open_table_session(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.open_table_session(p_table_id uuid, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_session_id uuid;
    v_current_status text;
BEGIN
    -- التحقق من حالة الطاولة
    SELECT status INTO v_current_status FROM public.restaurant_tables WHERE id = p_table_id;
    
    IF v_current_status NOT IN ('AVAILABLE', 'RESERVED') THEN
        RAISE EXCEPTION 'الطاولة غير متاحة حالياً';
    END IF;

    -- إنشاء الجلسة
    INSERT INTO public.table_sessions (table_id, opened_by, status, opened_at)
    VALUES (p_table_id, p_user_id, 'OPEN', now())
    RETURNING id INTO v_session_id;

    -- تحديث حالة الطاولة ومسح بيانات الحجز عند بدء الجلسة فعلياً
    UPDATE public.restaurant_tables 
    SET status = 'OCCUPIED', reservation_info = NULL, updated_at = now() 
    WHERE id = p_table_id;

    RETURN v_session_id;
END;
$$;

-- ================================================================
-- 14. دالة إنشاء طلب مطعم (Create Restaurant Order)
-- ================================================================
-- 🛑 خطوة وقائية: حذف الرؤية المعتمدة على جدول الطلبات مؤقتاً للسماح بتغيير أنواع البيانات
DROP VIEW IF EXISTS public.monthly_sales_dashboard CASCADE;

-- إضافة عمود الحذف المنطقي لجدول الفواتير لضمان عمل الرؤية الموحدة والتقارير
ALTER TABLE IF EXISTS public.invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- إصلاح مشكلة نوع البيانات: تحويل الأعمدة من Enum إلى Text لضمان التوافق (Self-Healing)
ALTER TABLE IF EXISTS public.orders ALTER COLUMN order_type TYPE text USING order_type::text;
ALTER TABLE IF EXISTS public.orders ALTER COLUMN status TYPE text USING status::text;

-- التأكد من وجود هيكل الجدول الصحيح قبل إنشاء الدالة (Self-Healing)
ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS order_type text;
ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS status text DEFAULT 'PENDING';
ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS total_price numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]'::jsonb;

-- ✅ إعادة إنشاء الرؤية الموحدة للمبيعات (Unified Sales View) بعد تحديث الجداول
CREATE OR REPLACE VIEW public.monthly_sales_dashboard AS
 SELECT 
    i.id,
    i.invoice_date AS transaction_date,
    i.total_amount AS amount,
    (SELECT COALESCE(SUM(ii.cost * ii.quantity), 0) FROM public.invoice_items ii WHERE ii.invoice_id = i.id) AS total_cost,
    'Standard Invoice'::text AS type
 FROM public.invoices i
 WHERE i.status != 'draft' AND i.deleted_at IS NULL
 UNION ALL
 SELECT 
    o.id,
    o.created_at::date AS transaction_date,
    (SELECT COALESCE(SUM(oi.total_price), 0) FROM public.order_items oi WHERE oi.order_id = o.id) AS amount,
    (SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0) FROM public.order_items oi WHERE oi.order_id = o.id) AS total_cost,
    'Restaurant Order'::text AS type
 FROM public.orders o
 WHERE o.status IN ('COMPLETED', 'PAID', 'posted', 'PENDING');

-- حذف النسخ القديمة لمنع تعارض الأسماء
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, text, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, public.order_type, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, text, text, jsonb, uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid,
    p_user_id uuid,
    p_order_type text,
    p_notes text,
    p_items jsonb,
    p_customer_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL,
    p_delivery_info jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id uuid;
    v_item jsonb;
    v_order_item_id uuid;
    v_order_number text;
    v_qty numeric;
    v_price numeric;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- توليد رقم طلب تلقائي فريد
    v_order_number := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    -- 1. إنشاء رأس الطلب مع ربط العميل إذا وُجد
    INSERT INTO public.orders (session_id, created_by, order_type, notes, status, customer_id, warehouse_id, created_at, order_number, organization_id)
    VALUES (p_session_id, p_user_id, p_order_type::text, p_notes, 'PENDING', p_customer_id, p_warehouse_id, now(), v_order_number, v_org_id)
    RETURNING id INTO v_order_id;

    -- 2. الدوران على البنود وإضافتها
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item->>'quantity')::numeric;
        v_price := (v_item->>'unitPrice')::numeric;

        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price, total_price, unit_cost, notes, modifiers, created_at, organization_id
        )
        VALUES (
            v_order_id,
            (v_item->>'productId')::uuid,
            v_qty,
            v_price,
            (v_qty * v_price),
            COALESCE((v_item->>'unitCost')::numeric, 0),
            v_item->>'notes',
            COALESCE(v_item->'modifiers', '[]'::jsonb),
            now(),
            v_org_id
        ) RETURNING id INTO v_order_item_id;

        -- 3. إرسال البند للمطبخ تلقائياً
        INSERT INTO public.kitchen_orders (order_item_id, status, created_at, organization_id)
        VALUES (v_order_item_id, 'NEW', now(), v_org_id);
    END LOOP;

    RETURN v_order_id;
EXCEPTION WHEN OTHERS THEN
    -- تسجيل الخطأ بالتفصيل في الجدول قبل إظهاره للمستخدم
    PERFORM public.log_system_error(SQLERRM, SQLSTATE, jsonb_build_object('session_id', p_session_id, 'items_count', jsonb_array_length(p_items)), 'create_restaurant_order');
    RAISE; -- إعادة رفع الخطأ لكي يظهر في واجهة البرنامج أيضاً
END;
$$;
-- ================================================================
-- 16. دالة معالجة الهالك (Process Wastage)
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
AS $$
DECLARE
    v_wastage_id uuid;
    v_item jsonb;
    v_journal_id uuid;
    v_total_cost numeric := 0;
    v_item_cost numeric;
    v_adj_acc_id uuid;
    v_inv_acc_id uuid;
    v_org_id uuid;
BEGIN
    -- 1. إنشاء رأس الحركة في جدول التسويات (بنوع هالك)
    INSERT INTO public.stock_adjustments (warehouse_id, adjustment_date, reason, adjustment_number, status, created_by)
    VALUES (p_warehouse_id, p_date, 'هالك: ' || p_notes, 'WST-' || to_char(now(), 'YYMMDDHH24MISS'), 'posted', p_user_id)
    RETURNING id INTO v_wastage_id;

    -- 2. معالجة البنود
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- جلب التكلفة المرجحة الحالية
        SELECT COALESCE(weighted_average_cost, purchase_price, cost, 0) INTO v_item_cost 
        FROM public.products WHERE id = (v_item->>'productId')::uuid;

        v_total_cost := v_total_cost + (v_item_cost * (v_item->>'quantity')::numeric);

        -- إضافة بند التسوية (كمية سالبة للهالك)
        INSERT INTO public.stock_adjustment_items (stock_adjustment_id, product_id, quantity, type)
        VALUES (v_wastage_id, (v_item->>'productId')::uuid, -((v_item->>'quantity')::numeric), 'out');

        -- تحديث المخزون مباشرة لضمان السرعة
        UPDATE public.products 
        SET stock = stock - (v_item->>'quantity')::numeric,
            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[p_warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>p_warehouse_id::text)::numeric, 0) - (v_item->>'quantity')::numeric))
        WHERE id = (v_item->>'productId')::uuid;
    END LOOP;

    -- 3. الترحيل المحاسبي (إذا كانت هناك تكلفة)
    IF v_total_cost > 0 THEN
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
        SELECT id INTO v_adj_acc_id FROM public.accounts WHERE code = '512' LIMIT 1; -- حساب فروقات الجرد/الهالك
        SELECT id INTO v_inv_acc_id FROM public.accounts WHERE code = '10302' LIMIT 1; -- حساب المخزون الفرعي

        IF v_adj_acc_id IS NOT NULL AND v_inv_acc_id IS NOT NULL THEN
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted)
            VALUES (p_date, 'إثبات تكلفة هالك مخزني: ' || p_notes, 'WST-' || v_wastage_id, 'posted', v_org_id, true)
            RETURNING id INTO v_journal_id;

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES 
            (v_journal_id, v_adj_acc_id, v_total_cost, 0, 'خسائر هالك مواد خام', v_org_id),
            (v_journal_id, v_inv_acc_id, 0, v_total_cost, 'تخفيض المخزون (هالك)', v_org_id);
        END IF;
    END IF;

    RETURN v_wastage_id;
END;
$$;

-- ================================================================
-- 17. دالة تحويل الطاولة (Transfer Table Session)
-- ================================================================
CREATE OR REPLACE FUNCTION public.transfer_table_session(p_session_id uuid, p_target_table_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_source_table_id uuid;
BEGIN
    -- 1. الحصول على رقم الطاولة الحالية المرتبطة بالجلسة
    SELECT table_id INTO v_source_table_id FROM public.table_sessions WHERE id = p_session_id;
    
    -- 2. التحقق من توفر الطاولة الجديدة
    IF NOT EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id = p_target_table_id AND status = 'AVAILABLE') THEN
        RAISE EXCEPTION 'الطاولة المستهدفة غير متاحة حالياً';
    END IF;

    -- 3. نقل الجلسة للطاولة الجديدة
    UPDATE public.table_sessions SET table_id = p_target_table_id WHERE id = p_session_id;

    -- 4. تحديث حالات الطاولات (القديمة تصبح متاحة، والجديدة مشغولة)
    UPDATE public.restaurant_tables SET status = 'AVAILABLE', updated_at = now() WHERE id = v_source_table_id;
    UPDATE public.restaurant_tables SET status = 'OCCUPIED', updated_at = now() WHERE id = p_target_table_id;
END;
$$;

-- ================================================================
-- 18. دالة دمج الطاولات (Merge Table Sessions)
-- ================================================================
CREATE OR REPLACE FUNCTION public.merge_table_sessions(p_source_session_id uuid, p_target_session_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_source_table_id uuid;
BEGIN
    -- 1. التحقق من صحة الجلسات
    IF p_source_session_id = p_target_session_id THEN
        RAISE EXCEPTION 'لا يمكن دمج الطاولة مع نفسها';
    END IF;

    -- 2. الحصول على رقم الطاولة المصدر
    SELECT table_id INTO v_source_table_id FROM public.table_sessions WHERE id = p_source_session_id;
    
    -- 3. نقل كافة الطلبات من جلسة المصدر إلى جلسة الهدف
    UPDATE public.orders SET session_id = p_target_session_id WHERE session_id = p_source_session_id;

    -- 4. إغلاق جلسة المصدر وتفريغ الطاولة
    UPDATE public.table_sessions SET status = 'CLOSED', closed_at = now() WHERE id = p_source_session_id;
    UPDATE public.restaurant_tables SET status = 'AVAILABLE', updated_at = now() WHERE id = v_source_table_id;

    -- ملاحظة: طاولة الهدف ستبقى 'OCCUPIED' وجلستها ستبقى 'OPEN' وتحمل الآن جميع الطلبات
END;
$$;

-- ================================================================
-- 19. دالة إنشاء قيد يومية متوازن (Create Balanced Journal Entry)
-- ================================================================
CREATE OR REPLACE FUNCTION public.create_journal_entry(
    entry_date date,
    description text,
    reference text,
    entries jsonb,
    status text DEFAULT 'posted',
    org_id uuid DEFAULT NULL
) 
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE 
    new_entry_id uuid; 
    entry_record jsonb;
    v_total_debit numeric := 0;
    v_total_credit numeric := 0;
BEGIN
    -- 1. التحقق من توازن القيد محاسبياً (المدين = الدائن) قبل الحفظ
    SELECT SUM((item->>'debit')::numeric), SUM((item->>'credit')::numeric)
    INTO v_total_debit, v_total_credit
    FROM jsonb_array_elements(entries) AS item;

    IF ABS(COALESCE(v_total_debit, 0) - COALESCE(v_total_credit, 0)) > 0.001 THEN
        RAISE EXCEPTION 'القيد غير متوازن: إجمالي المدين (%) لا يساوي إجمالي الدائن (%)', v_total_debit, v_total_credit;
    END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id) 
    VALUES (entry_date, description, reference, status, COALESCE(org_id, public.get_my_org())) 
    RETURNING id INTO new_entry_id;

    FOR entry_record IN SELECT * FROM jsonb_array_elements(entries) LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, cost_center_id, organization_id) 
        VALUES (new_entry_id, (entry_record->>'account_id')::uuid, (entry_record->>'debit')::numeric, (entry_record->>'credit')::numeric, (entry_record->>'description'), (entry_record->>'cost_center_id')::uuid, COALESCE(org_id, public.get_my_org()));
    END LOOP;

    RETURN new_entry_id;
END;
$$;

-- ================================================================
-- 21. رؤية لمراقبة الورديات المفتوحة (Active Shifts Monitor)
-- ================================================================
CREATE OR REPLACE VIEW public.active_shifts_monitor AS
SELECT 
    s.id,
    p.full_name as employee_name,
    s.start_time,
    s.opening_balance,
    round(cast(extract(epoch from (now() - s.start_time))/3600 as numeric), 2) as hours_open
FROM public.shifts s
JOIN public.profiles p ON s.user_id = p.id
WHERE s.end_time IS NULL;

-- ================================================================
-- 20. دالة إدارة الورديات المطورة (Shift Management)
-- ================================================================
CREATE OR REPLACE FUNCTION public.start_shift(
    p_user_id UUID,
    p_opening_balance NUMERIC,
    p_resume_existing BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_shift_id UUID;
    v_new_shift_id UUID;
BEGIN
    SELECT id INTO v_existing_shift_id
    FROM public.shifts
    WHERE user_id = p_user_id AND end_time IS NULL
    LIMIT 1;

    IF v_existing_shift_id IS NOT NULL AND p_resume_existing THEN
        RETURN v_existing_shift_id;
    END IF;

    IF v_existing_shift_id IS NOT NULL THEN
        RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم (ID: %)', v_existing_shift_id;
    END IF;

    INSERT INTO public.shifts (user_id, start_time, opening_balance, organization_id)
    VALUES (p_user_id, now(), p_opening_balance, public.get_my_org())
    RETURNING id INTO v_new_shift_id;

    RETURN v_new_shift_id;
END;
$$;
-- ================================================================
-- 22. دالة إغلاق الوردية (Close Shift)
-- ================================================================
CREATE OR REPLACE FUNCTION public.close_shift(p_shift_id UUID, p_actual_cash NUMERIC, p_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- ضمان التنفيذ بصلاحيات عالية
AS $$
DECLARE
    v_summary JSONB;
    v_expected_cash NUMERIC;
BEGIN
    v_summary := public.get_shift_summary(p_shift_id);
    v_expected_cash := (v_summary->>'expected_cash')::NUMERIC;
    
    UPDATE public.shifts SET end_time = now(), closing_balance = p_actual_cash, expected_cash = v_expected_cash, actual_cash = p_actual_cash, difference = p_actual_cash - v_expected_cash, notes = p_notes WHERE id = p_shift_id;
    
END;
$$;

-- ================================================================
-- 23. دالة توليد قيد إقفال الوردية المكتملة (Accounting Integration)
-- ================================================================
-- ================================================================
-- 23. دالة توليد قيد إقفال الوردية المكتملة (Balanced & Final Version)
-- ================================================================
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD; v_summary JSONB; v_journal_id uuid; v_org_id uuid;
    v_cash_acc_id uuid; v_card_acc_id uuid; v_wallet_acc_id uuid;
    v_sales_acc_id uuid; v_vat_acc_id uuid; v_diff_acc_id uuid;
    v_cogs_acc_id uuid; v_inv_acc_id uuid;
    v_cash_sales numeric; v_card_sales numeric; v_wallet_sales numeric;
    v_total_sales numeric; v_tax_amount numeric; v_difference numeric;
    v_total_cogs numeric := 0; v_opening_bal numeric;
     v_ref text;
BEGIN
     -- منع التكرار (حل خطأ 409 Conflict)
     v_ref := 'SHIFT-' || substring(p_shift_id::text, 1, 8);
     IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reference = v_ref) THEN
         RETURN (SELECT id FROM public.journal_entries WHERE reference = v_ref LIMIT 1);
     END IF;

    -- 1. جلب بيانات الوردية والملخص المالي
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_org_id := COALESCE(v_shift.organization_id, public.get_my_org());
    v_summary := public.get_shift_summary(p_shift_id);
    
    v_cash_sales := ROUND(COALESCE((v_summary->>'cash_sales')::numeric, 0), 2);
    v_card_sales := ROUND(COALESCE((v_summary->>'card_sales')::numeric, 0), 2);
    v_wallet_sales := ROUND(COALESCE((v_summary->>'wallet_sales')::numeric, 0), 2);
    v_total_sales := ROUND(COALESCE((v_summary->>'total_sales')::numeric, 0), 2);
    v_difference := ROUND(COALESCE(v_shift.difference, 0), 2);
    v_opening_bal := ROUND(COALESCE(v_shift.opening_balance, 0), 2);

    -- 🛑 حماية من القيود الصفرية الفارغة
    IF ABS(v_total_sales) < 0.01 AND ABS(v_difference) < 0.01 THEN RETURN NULL; END IF;

    -- 2. حساب تكلفة البضاعة المباعة (COGS) بناءً على الوصفات (BOM)
    SELECT COALESCE(SUM(item_cost), 0) INTO v_total_cogs
    FROM (
        -- تكلفة الوجبات (مكونات BOM)
        SELECT SUM(r.quantity_required * oi.quantity * COALESCE(ing.cost, ing.purchase_price, 0)) as item_cost
        FROM public.order_items oi
        JOIN public.orders o ON oi.order_id = o.id
        JOIN public.payments p ON o.id = p.order_id
        JOIN public.bill_of_materials r ON oi.product_id = r.product_id
        JOIN public.products ing ON r.raw_material_id = ing.id
        WHERE p.created_at >= v_shift.start_time AND p.created_at <= COALESCE(v_shift.end_time, now())
          AND p.status = 'COMPLETED' AND o.organization_id = v_org_id
        UNION ALL
        -- تكلفة الأصناف المباشرة (بدون BOM)
        SELECT SUM(oi.quantity * COALESCE(prod.cost, prod.purchase_price, 0)) as item_cost
        FROM public.order_items oi
        JOIN public.orders o ON oi.order_id = o.id
        JOIN public.payments p ON o.id = p.order_id
        JOIN public.products prod ON oi.product_id = prod.id
        WHERE prod.item_type = 'STOCK' AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = prod.id)
          AND p.created_at >= v_shift.start_time AND p.created_at <= COALESCE(v_shift.end_time, now())
          AND p.status = 'COMPLETED' AND o.organization_id = v_org_id
    ) sub;

    -- 3. تحديد الحسابات المحاسبية (Egyptian COA)
    SELECT id INTO v_cash_acc_id FROM public.accounts WHERE code = '1231' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_card_acc_id FROM public.accounts WHERE code = '123201' AND organization_id = v_org_id LIMIT 1; -- البنك الأهلي المصري
    SELECT id INTO v_wallet_acc_id FROM public.accounts WHERE code = '123301' AND organization_id = v_org_id LIMIT 1; -- فودافون كاش
    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_diff_acc_id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_inv_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;

    v_tax_amount := ROUND(v_total_sales - (v_total_sales / 1.14), 2);

    -- 4. إنشاء رأس القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, user_id, organization_id, is_posted) 
    VALUES (now(), 'إقفال وردية مجمع - ' || to_char(v_shift.start_time, 'YYYY-MM-DD'), 'SHIFT-' || substring(p_shift_id::text, 1, 8), 'posted', v_shift.user_id, v_org_id, true) 
    RETURNING id INTO v_journal_id;

    -- 5. الطرف المدين (التحصيل الفعلي والفروقات)
    IF v_shift.actual_cash > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_cash_acc_id, v_shift.actual_cash, 0, 'نقدية الوردية (فعلي)', v_org_id);
    END IF;
    IF v_card_sales > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_card_acc_id, v_card_sales, 0, 'مبيعات شبكة/فيزا', v_org_id);
    END IF;
    IF v_wallet_sales > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_wallet_acc_id, v_wallet_sales, 0, 'مبيعات محافظ إلكترونية', v_org_id);
    END IF;

    -- 6. الطرف الدائن (المبيعات، الضريبة، ورصيد الافتتاح)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_sales_acc_id, 0, (v_total_sales - v_tax_amount), 'إيراد المبيعات', v_org_id);

    IF v_tax_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_tax_amount, 'ضريبة القيمة المضافة', v_org_id);
    END IF;

    IF v_opening_bal > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_cash_acc_id, 0, v_opening_bal, 'تسوية رصيد الافتتاح', v_org_id);
    END IF;

    -- 7. معالجة العجز والزيادة
    IF v_difference < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_diff_acc_id, ABS(v_difference), 0, 'عجز عهدة وردية', v_org_id);
    ELSIF v_difference > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_diff_acc_id, 0, v_difference, 'زيادة عهدة وردية', v_org_id);
    END IF;

    -- 8. قيد التكلفة المتوازن (COGS)
    IF v_total_cogs > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_cogs_acc_id, v_total_cogs, 0, 'تكلفة المبيعات', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_inv_acc_id, 0, v_total_cogs, 'صرف المخزون', v_org_id);
    END IF;

    RETURN v_journal_id;
END;
$$;

-- ================================================================
-- 24. درع حماية الحسابات الرئيسية (Prevent Group Posting)
-- ================================================================
-- يمنع ترحيل أي سطر قيد إلى حساب تم تعريفه كـ "مجموعة" (is_group = true)
CREATE OR REPLACE FUNCTION public.check_account_is_not_group()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND is_group = true) THEN
        RAISE EXCEPTION '⚠️ خطأ محاسبي: الحساب المختار هو حساب رئيسي. لا يمكن الترحيل إلا للحسابات الفرعية.';
    END IF;
    RETURN NEW;
END;
$$;

-- تفعيل الحماية على جدول أسطر القيود
DROP TRIGGER IF EXISTS trg_prevent_group_posting ON public.journal_lines;
CREATE TRIGGER trg_prevent_group_posting
BEFORE INSERT OR UPDATE ON public.journal_lines
FOR EACH ROW EXECUTE FUNCTION public.check_account_is_not_group();
-- ================================================================
-- 29. قسم التقارير المالية ولوحة البيانات (Dashboard & Reports)
-- ================================================================

-- أ. دالة إحصائيات لوحة البيانات المتطورة (Advanced Dashboard Stats)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_month_sales numeric; v_prev_month_sales numeric; v_receivables numeric; v_payables numeric;
    v_low_stock_count integer; v_chart_data json; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    -- المبيعات
    SELECT COALESCE(SUM(subtotal), 0) INTO v_month_sales FROM public.invoices WHERE organization_id = v_org_id AND status != 'draft' AND date_trunc('month', invoice_date) = date_trunc('month', CURRENT_DATE);
    SELECT COALESCE(SUM(subtotal), 0) INTO v_prev_month_sales FROM public.invoices WHERE organization_id = v_org_id AND status != 'draft' AND date_trunc('month', invoice_date) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month');
    -- الأرصدة
    SELECT COALESCE(SUM(balance), 0) INTO v_receivables FROM public.accounts WHERE organization_id = v_org_id AND code = '1221';
    SELECT COALESCE(SUM(balance), 0) INTO v_payables FROM public.accounts WHERE organization_id = v_org_id AND code = '201';
    -- المخزون
    SELECT COUNT(*) INTO v_low_stock_count FROM public.products WHERE organization_id = v_org_id AND stock <= min_stock_level AND deleted_at IS NULL;
    -- بيانات الرسم البياني (آخر 6 أشهر)
    SELECT json_agg(t) INTO v_chart_data FROM (
        SELECT to_char(month, 'Mon') as name, COALESCE((SELECT SUM(subtotal) FROM public.invoices WHERE organization_id = v_org_id AND date_trunc('month', invoice_date) = month AND status != 'draft'), 0) as sales
        FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE), '1 month') as month
    ) t;

    RETURN json_build_object(
        'monthSales', v_month_sales,
        'prevMonthSales', v_prev_month_sales,
        'receivables', v_receivables,
        'payables', v_payables,
        'lowStockCount', v_low_stock_count,
        'chartData', v_chart_data
    );
END; $$;

-- ب. دالة تحليل النسب الربحية (Historical Ratios)
CREATE OR REPLACE FUNCTION public.get_historical_ratios()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profit jsonb; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT jsonb_agg(jsonb_build_object('name', month_key, 'ربحية', margin)) INTO v_profit FROM (
        SELECT to_char(je.transaction_date, 'YYYY-MM') as month_key,
            CASE WHEN SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END) > 0 
                 THEN ROUND(((SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END) - SUM(CASE WHEN a.code LIKE '5%' THEN jl.debit - jl.credit ELSE 0 END)) / SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END)) * 100, 2)
                 ELSE 0 END as margin
        FROM public.journal_entries je JOIN public.journal_lines jl ON je.id = jl.journal_entry_id JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_org_id AND je.status = 'posted' AND je.transaction_date >= (date_trunc('month', now()) - interval '6 months')::date
        GROUP BY 1 ORDER BY 1
    ) sub;
    RETURN jsonb_build_object('profitabilityData', COALESCE(v_profit, '[]'::jsonb));
END; $$;

-- ج. دالة عمولة المندوبين (Calculate Sales Commission)
CREATE OR REPLACE FUNCTION public.calculate_sales_commission(p_salesperson_id uuid, p_start_date date, p_end_date date, p_commission_rate numeric DEFAULT 1.0)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_total_sales numeric; v_total_returns numeric; v_net_sales numeric; v_commission numeric;
BEGIN
    SELECT COALESCE(SUM(subtotal), 0) INTO v_total_sales FROM public.invoices WHERE salesperson_id = p_salesperson_id AND status IN ('posted', 'paid') AND invoice_date BETWEEN p_start_date AND p_end_date;
    SELECT COALESCE(SUM(sr.total_amount - COALESCE(sr.tax_amount, 0)), 0) INTO v_total_returns FROM public.sales_returns sr JOIN public.invoices i ON sr.original_invoice_id = i.id WHERE i.salesperson_id = p_salesperson_id AND sr.status = 'posted' AND sr.return_date BETWEEN p_start_date AND p_end_date;
    v_net_sales := v_total_sales - v_total_returns;
    v_commission := v_net_sales * (p_commission_rate / 100);
    RETURN jsonb_build_object('total_sales', v_total_sales, 'total_returns', v_total_returns, 'net_sales', v_net_sales, 'commission_amount', v_commission);
END; $$;

-- د. دالة ملخص الوردية (Get Shift Summary)
CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_shift RECORD; v_summary JSONB;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    SELECT jsonb_build_object(
        'opening_balance', v_shift.opening_balance,
        'total_sales', COALESCE(SUM(p.amount), 0),
        'cash_sales', COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount ELSE 0 END), 0),
        'expected_cash', v_shift.opening_balance + COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount ELSE 0 END), 0)
    ) INTO v_summary
    FROM public.payments p JOIN public.orders o ON p.order_id = o.id
    WHERE o.created_by = v_shift.user_id AND o.created_at >= v_shift.start_time AND o.created_at <= COALESCE(v_shift.end_time, now()) AND p.status = 'COMPLETED';
    RETURN v_summary;
END; $$;

-- هـ. دالة الاستهلاك المتوقع للمواد الخام (Raw Material Consumption)
CREATE OR REPLACE FUNCTION public.get_expected_raw_material_consumption(p_warehouse_id uuid DEFAULT NULL)
RETURNS TABLE (raw_material_id uuid, raw_material_name text, expected_quantity numeric, current_stock numeric) 
LANGUAGE plpgsql AS $$
DECLARE v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    RETURN QUERY
    WITH pending_items AS (
        SELECT ii.product_id, ii.quantity FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE i.status = 'draft' AND i.organization_id = v_org_id AND (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id)
        UNION ALL
        SELECT oi.product_id, oi.quantity FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE o.status = 'PENDING' AND o.organization_id = v_org_id AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
    )
    SELECT br.raw_material_id, p.name, SUM(pi.quantity * bom.quantity_required), p.stock
    FROM pending_items pi JOIN public.bill_of_materials bom ON bom.product_id = pi.product_id JOIN public.products p ON p.id = bom.raw_material_id
    GROUP BY br.raw_material_id, p.name, p.stock;
END; $$;

-- و. تقرير مبيعات المطعم التفصيلي (Restaurant Sales Report)
CREATE OR REPLACE FUNCTION public.get_restaurant_sales_report(p_start_date text, p_end_date text)
 RETURNS TABLE(item_name text, category_name text, quantity numeric, total_sales numeric)
 LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT p.name::text, COALESCE(p.item_type, 'غير مصنف')::text, COALESCE(SUM(oi.quantity), 0)::numeric, COALESCE(SUM(oi.total_price), 0)::numeric
  FROM public.order_items oi JOIN public.orders o ON oi.order_id = o.id JOIN public.products p ON oi.product_id = p.id
  WHERE o.status IN ('CONFIRMED', 'COMPLETED') AND o.created_at >= p_start_date::timestamptz AND o.created_at <= p_end_date::timestamptz
  GROUP BY 1, 2 ORDER BY total_sales DESC;
END; $$;

-- ================================================================
-- 26. دالة تشغيل الرواتب (Run Payroll)
-- ================================================================
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(p_month int, p_year int, p_date date, p_treasury_account_id uuid, p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_payroll_id uuid; v_journal_id uuid; v_item jsonb; v_org_id uuid;
    v_salaries_acc uuid; v_total_net numeric := 0;
BEGIN
    v_org_id := public.get_my_org();
    SELECT id INTO v_salaries_acc FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1;
    
    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, status, organization_id)
    VALUES (p_month, p_year, p_date, 'posted', v_org_id) RETURNING id INTO v_payroll_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_total_net := v_total_net + (v_item->>'net_salary')::numeric;
        INSERT INTO public.payroll_items (payroll_id, employee_id, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, (v_item->>'net_salary')::numeric, v_org_id);
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted)
    VALUES (p_date, 'رواتب شهر ' || p_month, 'PAY-' || p_month, 'posted', v_org_id, true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_salaries_acc, v_total_net, 0, 'مصروف رواتب', v_org_id),
           (v_journal_id, p_treasury_account_id, 0, v_total_net, 'صرف رواتب', v_org_id);

    RETURN v_payroll_id;
END; $$;

-- ================================================================
-- 27. دالة إضافة منتج مع رصيد افتتاحي (Add Product with Opening Balance)
-- ================================================================
CREATE OR REPLACE FUNCTION public.add_product_with_opening_balance(p_name text, p_sku text, p_sales_price numeric, p_purchase_price numeric, p_stock numeric, p_org_id uuid, p_item_type text DEFAULT 'STOCK', p_inventory_account_id uuid DEFAULT NULL, p_cogs_account_id uuid DEFAULT NULL, p_sales_account_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_product_id UUID; v_inventory_acc UUID; v_opening_acc UUID; v_journal_id UUID;
BEGIN
    INSERT INTO public.products (name, sku, sales_price, purchase_price, stock, organization_id, item_type, inventory_account_id, cogs_account_id, sales_account_id)
    VALUES (p_name, p_sku, p_sales_price, p_purchase_price, p_stock, p_org_id, p_item_type, p_inventory_account_id, p_cogs_account_id, p_sales_account_id)
    RETURNING id INTO v_product_id;

    IF p_stock > 0 AND p_purchase_price > 0 THEN
        SELECT id INTO v_inventory_acc FROM public.accounts WHERE code = '10302' AND organization_id = p_org_id LIMIT 1;
        SELECT id INTO v_opening_acc FROM public.accounts WHERE code = '3999' AND organization_id = p_org_id LIMIT 1;

        IF v_inventory_acc IS NOT NULL AND v_opening_acc IS NOT NULL THEN
            INSERT INTO public.journal_entries (transaction_date, reference, description, status, is_posted, organization_id)
            VALUES (CURRENT_DATE, 'OP-' || p_sku, 'رصيد افتتاحي: ' || p_name, 'posted', true, p_org_id) RETURNING id INTO v_journal_id;
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, v_inventory_acc, (p_stock * p_purchase_price), 0, 'مخزون افتتاحي', p_org_id),
                   (v_journal_id, v_opening_acc, 0, (p_stock * p_purchase_price), 'مقابل افتتاحي', p_org_id);
        END IF;
    END IF;
    RETURN v_product_id;
END; $$;

-- ================================================================
-- 28. دالة تسجيل الخطأ (System Error Logger)
-- ================================================================
CREATE OR REPLACE FUNCTION public.log_system_error(p_message text, p_code text, p_context jsonb, p_function_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.system_error_logs (error_message, error_code, context, function_name, user_id, organization_id)
    VALUES (p_message, p_code, p_context, p_function_name, auth.uid(), public.get_my_org());
END; $$;