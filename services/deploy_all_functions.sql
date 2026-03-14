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

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '501' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '103' LIMIT 1;
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

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '103' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '10204' LIMIT 1;
    IF v_vat_acc_id IS NULL THEN SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1; END IF;
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' LIMIT 1;

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة'; END IF;

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
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
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
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
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
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

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
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '103' LIMIT 1;
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

-- ================================================================
-- 12. دالة حساب عمولة المندوبين (Calculate Sales Commission)
-- ================================================================
CREATE OR REPLACE FUNCTION public.calculate_sales_commission(
    p_salesperson_id uuid,
    p_start_date date,
    p_end_date date,
    p_commission_rate numeric DEFAULT 1.0
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_sales numeric;
    v_total_returns numeric;
    v_net_sales numeric;
    v_commission numeric;
BEGIN
    -- 1. إجمالي المبيعات (بدون ضريبة)
    SELECT COALESCE(SUM(subtotal), 0) INTO v_total_sales FROM public.invoices WHERE salesperson_id = p_salesperson_id AND status IN ('posted', 'paid') AND invoice_date BETWEEN p_start_date AND p_end_date;

    -- 2. إجمالي المرتجعات (بدون ضريبة)
    SELECT COALESCE(SUM(sr.total_amount - COALESCE(sr.tax_amount, 0)), 0) INTO v_total_returns FROM public.sales_returns sr JOIN public.invoices i ON sr.original_invoice_id = i.id WHERE i.salesperson_id = p_salesperson_id AND sr.status = 'posted' AND sr.return_date BETWEEN p_start_date AND p_end_date;

    -- 3. الصافي والعمولة
    v_net_sales := v_total_sales - v_total_returns;
    v_commission := v_net_sales * (p_commission_rate / 100);

    RETURN jsonb_build_object('total_sales', v_total_sales, 'total_returns', v_total_returns, 'net_sales', v_net_sales, 'commission_amount', v_commission);
END;
$$;

-- إضافة عمود لتخزين بيانات الحجز (اسم العميل والوقت)
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS reservation_info JSONB;

-- ================================================================
-- 13. دالة فتح جلسة طاولة (Open Table Session)
-- ================================================================
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
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid,
    p_user_id uuid,
    p_order_type text,
    p_notes text,
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_order_id uuid;
    v_item jsonb;
    v_order_item_id uuid;
BEGIN
    -- 1. إنشاء رأس الطلب
    INSERT INTO public.orders (session_id, created_by, order_type, notes, status, created_at)
    VALUES (p_session_id, p_user_id, p_order_type::text, p_notes, 'PENDING', now())
    RETURNING id INTO v_order_id;

    -- 2. الدوران على البنود وإضافتها
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price, notes, modifiers, created_at
        )
        VALUES (
            v_order_id,
            (v_item->>'productId')::uuid,
            (v_item->>'quantity')::numeric,
            (v_item->>'unitPrice')::numeric,
            v_item->>'notes',
            COALESCE(v_item->'modifiers', '[]'::jsonb),
            now()
        ) RETURNING id INTO v_order_item_id;

        -- 3. إرسال البند للمطبخ تلقائياً
        INSERT INTO public.kitchen_orders (order_item_id, status, created_at)
        VALUES (v_order_item_id, 'NEW', now());
    END LOOP;

    RETURN v_order_id;
END;
$$;

-- ================================================================
-- 15. دالة حساب الاستهلاك المتوقع للمواد الخام (Expected Consumption)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_expected_raw_material_consumption(p_warehouse_id uuid DEFAULT NULL)
RETURNS TABLE (
    raw_material_id uuid,
    raw_material_name text,
    expected_quantity numeric,
    current_stock numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH draft_items AS (
        -- جلب كافة بنود الفواتير المسودة
        SELECT ii.product_id, ii.quantity, ii.modifiers
        FROM public.invoice_items ii
        JOIN public.invoices i ON i.id = ii.invoice_id
        WHERE i.status = 'draft' AND i.deleted_at IS NULL
        AND (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id)
    ),
    bom_requirements AS (
        -- 1. استهلاك المكونات الخام للأصناف الرئيسية
        SELECT bom.raw_material_id, (di.quantity * bom.quantity_required) as qty
        FROM draft_items di
        JOIN public.bill_of_materials bom ON bom.product_id = di.product_id
        
        UNION ALL
        
        -- 2. استهلاك المكونات الخام للإضافات (Modifiers)
        SELECT bom.raw_material_id, (di.quantity * bom.quantity_required) as qty
        FROM draft_items di,
        LATERAL jsonb_array_elements(COALESCE(di.modifiers, '[]'::jsonb)) AS m
        JOIN public.bill_of_materials bom ON bom.product_id = (m->>'id')::uuid
    )
    SELECT 
        br.raw_material_id, 
        p.name, 
        SUM(br.qty), 
        COALESCE(
            CASE 
                WHEN p_warehouse_id IS NULL THEN p.stock 
                ELSE (p.warehouse_stock->>p_warehouse_id::text)::numeric 
            END, 
            0
        )
    FROM bom_requirements br
    JOIN public.products p ON p.id = br.raw_material_id
    GROUP BY br.raw_material_id, p.name, p.stock, p.warehouse_stock;
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
        SELECT id INTO v_inv_acc_id FROM public.accounts WHERE code = '103' LIMIT 1; -- حساب المخزون العام

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
    UPDATE public.table_sessions SET status = 'CLOSED', end_time = now() WHERE id = p_source_session_id;
    UPDATE public.restaurant_tables SET status = 'AVAILABLE', updated_at = now() WHERE id = v_source_table_id;

    -- ملاحظة: طاولة الهدف ستبقى 'OCCUPIED' وجلستها ستبقى 'OPEN' وتحمل الآن جميع الطلبات
END;
$$;