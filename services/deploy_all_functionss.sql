-- 🛠️ ملف نشر جميع دوال النظام (Deploy All Functions) - النسخة الاحترافية الموحدة
-- هذا الملف يجمع كافة الدوال البرمجية (RPCs) اللازمة لتشغيل النظام بشكل آمن واحترافي.

-- ================================================================
-- 1. دوال الاعتماد المالي (Financial Approvals)
-- ================================================================

-- أ. اعتماد فاتورة المبيعات (Sales Invoice)
DROP FUNCTION IF EXISTS public.approve_invoice(uuid);
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid;
    v_customer_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_journal_id uuid;
    v_discount_acc_id uuid; v_treasury_acc_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_exchange_rate numeric; v_modifier_json jsonb; v_bom_item record;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    -- تم نقل هذا الجزء إلى بداية الدالة لضمان توفره قبل أي عمليات أخرى
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    v_org_id := v_invoice.organization_id;
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);

    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;

    -- إضافة حساب الخصم الممنوح
    SELECT id INTO v_discount_acc_id FROM public.accounts WHERE code = '4102' AND organization_id = v_org_id LIMIT 1;
    -- إضافة حساب الخزينة/البنك من الفاتورة
    v_treasury_acc_id := v_invoice.treasury_account_id;

    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        SELECT weighted_average_cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_item.quantity);

        -- خصم المكونات (BOM)
        IF EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = v_item.product_id AND organization_id = v_org_id) THEN
            FOR v_bom_item IN SELECT raw_material_id, quantity_required FROM public.bill_of_materials WHERE product_id = v_item.product_id AND organization_id = v_org_id LOOP
                UPDATE public.products 
                SET stock = stock - (v_bom_item.quantity_required * v_item.quantity),
                    warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - (v_bom_item.quantity_required * v_item.quantity)))
                WHERE id = v_bom_item.raw_material_id AND organization_id = v_org_id;
            END LOOP;
        ELSE
            UPDATE public.products 
            SET stock = stock - v_item.quantity,
                warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_item.quantity))
            WHERE id = v_item.product_id AND organization_id = v_org_id;
        END IF;
        -- معالجة خصم مكونات الإضافات (Modifiers) - تم نقلها من الدالة القديمة
        IF v_item.modifiers IS NOT NULL THEN
            FOR v_modifier_json IN SELECT * FROM jsonb_array_elements(v_item.modifiers) LOOP
                IF (v_modifier_json->>'id') IS NOT NULL THEN
                    FOR v_bom_item IN SELECT raw_material_id, quantity_required FROM public.bill_of_materials WHERE product_id = (v_modifier_json->>'id')::uuid AND organization_id = v_org_id LOOP
                        UPDATE public.products 
                        SET stock = stock - (v_bom_item.quantity_required * v_item.quantity),
                            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - (v_bom_item.quantity_required * v_item.quantity)))
                        WHERE id = v_bom_item.raw_material_id AND organization_id = v_org_id;
                    END LOOP;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    -- حساب القيم بالعملة الأساسية
    DECLARE
        v_total_amount_base numeric := v_invoice.total_amount * v_exchange_rate;
        v_paid_amount_base numeric := COALESCE(v_invoice.paid_amount, 0) * v_exchange_rate;
        v_subtotal_base numeric := v_invoice.subtotal * v_exchange_rate;
        v_tax_amount_base numeric := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
        v_discount_amount_base numeric := COALESCE(v_invoice.discount_amount, 0) * v_exchange_rate;
    BEGIN
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
    END;

    IF v_total_cost > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
        (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات', v_org_id),
        (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id);
    END IF;

    UPDATE public.invoices SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ب. اعتماد فاتورة المشتريات (Purchase Invoice)
DROP FUNCTION IF EXISTS public.approve_purchase_invoice(uuid);
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
    v_current_stock numeric; v_current_avg_cost numeric; v_new_avg_cost numeric; v_item_price_base numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    v_org_id := v_invoice.organization_id;

    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1;

    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        v_item_price_base := v_item.price * COALESCE(v_invoice.exchange_rate, 1);
        SELECT stock, weighted_average_cost INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_current_stock := COALESCE(v_current_stock, 0); v_current_avg_cost := COALESCE(v_current_avg_cost, 0);
        
        IF (v_current_stock + v_item.quantity) > 0 THEN
            v_new_avg_cost := ((v_current_stock * v_current_avg_cost) + (v_item.quantity * v_item_price_base)) / (v_current_stock + v_item.quantity);
        ELSE
            v_new_avg_cost := v_item_price_base;
        END IF;

        UPDATE public.products 
        SET stock = stock + v_item.quantity, 
            weighted_average_cost = v_new_avg_cost, 
            cost = v_new_avg_cost,
            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_item.quantity))
        WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    DECLARE
        v_total_amount_base numeric := v_invoice.total_amount * COALESCE(v_invoice.exchange_rate, 1);
        v_tax_amount_base numeric := COALESCE(v_invoice.tax_amount, 0) * COALESCE(v_invoice.exchange_rate, 1);
        v_net_amount_base numeric := v_total_amount_base - v_tax_amount_base;
    BEGIN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
        VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
        (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات', v_org_id);
        IF v_tax_amount_base > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات', v_org_id); END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد', v_org_id);
    END;
    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ج. اعتماد سند القبض (Receipt Voucher)
DROP FUNCTION IF EXISTS public.approve_receipt_voucher(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_org_id uuid, p_voucher_id uuid, p_credit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود'; END IF;
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', p_org_id, true) RETURNING id INTO v_journal_id;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, p_org_id),
    (v_journal_id, p_credit_account_id, 0, v_voucher.amount, v_voucher.notes, p_org_id);
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;

-- د. اعتماد سند الصرف (Payment Voucher)
DROP FUNCTION IF EXISTS public.approve_payment_voucher(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_org_id uuid, p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود'; END IF;
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', p_org_id, true) RETURNING id INTO v_journal_id;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, p_org_id),
    (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, p_org_id);
    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;
-- هـ. اعتماد مرتجع المبيعات (Sales Return) مع معالجة التكلفة والمخزون
DROP FUNCTION IF EXISTS public.approve_sales_return(uuid);
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_acc_sales_ret uuid; v_acc_vat uuid; v_acc_cust uuid;
    v_acc_cogs uuid; v_acc_inv uuid;
    v_total_cost numeric := 0; v_item_cost numeric;
BEGIN
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF v_return.status = 'posted' THEN RETURN; END IF;
    
    v_org_id := v_return.organization_id;
    SELECT id INTO v_acc_sales_ret FROM public.accounts WHERE code = '412' AND organization_id = v_org_id LIMIT 1; -- مسموحات ومرتجعات مبيعات
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1;      -- ضريبة مخرجات
    SELECT id INTO v_acc_cust FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1;     -- العملاء
    SELECT id INTO v_acc_cogs FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1;      -- تكلفة مبيعات
    SELECT id INTO v_acc_inv FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;     -- مخزون منتج تام

    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        -- جلب التكلفة المرجحة الحالية لإعادة القيمة للمخزن
        SELECT weighted_average_cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_item.quantity);

        -- تحديث الكمية في المستودع
        UPDATE public.products 
        SET stock = stock + v_item.quantity,
            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity))
        WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true) RETURNING id INTO v_journal_id;

    -- 1. قيد القيمة البيعية (عكس الإيراد)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_sales_ret, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مرتجع مبيعات', v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, v_return.tax_amount, 0, 'ضريبة المرتجع', v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cust, 0, v_return.total_amount, 'تخفيض حساب العميل', v_org_id);

    -- 2. قيد التكلفة (عكس COGS وإرجاع القيمة للأصول)
    IF v_total_cost > 0 AND v_acc_cogs IS NOT NULL AND v_acc_inv IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_inv, v_total_cost, 0, 'إعادة للمخزون (مرتجع)', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cogs, 0, v_total_cost, 'عكس تكلفة مبيعات', v_org_id);
    END IF;

    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
    -- تحديث رصيد العميل لحظياً (المرتجع يقلل المديونية)
    UPDATE public.customers SET balance = COALESCE(balance, 0) - v_return.total_amount WHERE id = v_return.customer_id AND organization_id = v_org_id;
END; $$;

-- و. اعتماد مرتجع المشتريات (Purchase Return)
DROP FUNCTION IF EXISTS public.approve_purchase_return(uuid);
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_acc_inv uuid; v_acc_vat uuid; v_acc_supp uuid;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF v_return.status = 'posted' THEN RETURN; END IF;
    v_org_id := v_return.organization_id;

    SELECT id INTO v_acc_inv FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1; -- مخزون منتج تام
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1;  -- ضريبة مدخلات
    SELECT id INTO v_acc_supp FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1; -- الموردين

    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock - v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مشتريات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'purchase_return', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_supp, v_return.total_amount, 0, 'تخفيض حساب المورد', v_org_id),
    (v_journal_id, v_acc_inv, 0, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 'تخفيض المخزون', v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, 0, v_return.tax_amount, 'عكس ضريبة مدخلات', v_org_id);
    END IF;

    UPDATE public.purchase_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
    -- تحديث رصيد المورد لحظياً (مرتجع المشتريات يقلل مديونيتنا للمورد)
    UPDATE public.suppliers SET balance = COALESCE(balance, 0) - v_return.total_amount WHERE id = v_return.supplier_id AND organization_id = v_org_id;
END; $$;

-- ز. اعتماد الإشعار الدائن (Credit Note)
DROP FUNCTION IF EXISTS public.approve_credit_note(uuid);
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid;
    v_acc_allowance uuid; v_acc_vat uuid; v_acc_cust uuid;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    IF v_note.status = 'posted' THEN RETURN; END IF;

    v_org_id := v_note.organization_id;
    SELECT id INTO v_acc_allowance FROM public.accounts WHERE code = '413' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_cust FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1;

    IF v_acc_allowance IS NULL OR v_acc_cust IS NULL THEN RAISE EXCEPTION 'حسابات المسموحات أو العملاء غير معرّفة (413, 1221)'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار دائن رقم ' || v_note.credit_note_number, v_note.credit_note_number, 'posted', v_org_id, p_note_id, 'credit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_allowance, v_note.amount_before_tax, 0, 'مسموحات مبيعات', v_org_id);
    
    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, v_note.tax_amount, 0, 'ضريبة إشعار دائن', v_org_id);
    END IF;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_cust, 0, v_note.total_amount, 'تخفيض مديونية عميل', v_org_id);

    UPDATE public.credit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
    -- تحديث رصيد العميل لحظياً (تخفيض المديونية بقيمة الإشعار)
    UPDATE public.customers SET balance = COALESCE(balance, 0) - v_note.total_amount WHERE id = v_note.customer_id AND organization_id = v_org_id;
END; $$;

-- ح. اعتماد الإشعار المدين (Debit Note)
DROP FUNCTION IF EXISTS public.approve_debit_note(uuid);
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid;
    v_acc_supp uuid; v_acc_cogs uuid; v_acc_vat uuid;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    IF v_note.status = 'posted' THEN RETURN; END IF;

    v_org_id := v_note.organization_id;
    SELECT id INTO v_acc_supp FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_cogs FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1;

    IF v_acc_supp IS NULL OR v_acc_cogs IS NULL THEN RAISE EXCEPTION 'حسابات الموردين أو المشتريات غير معرّفة (201, 511)'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار مدين رقم ' || v_note.debit_note_number, v_note.debit_note_number, 'posted', v_org_id, p_note_id, 'debit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_supp, v_note.total_amount, 0, 'تخفيض حساب المورد', v_org_id),
    (v_journal_id, v_acc_cogs, 0, v_note.amount_before_tax, 'تسوية تكلفة مشتريات', v_org_id);

    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, 0, v_note.tax_amount, 'عكس ضريبة مدخلات', v_org_id);
    END IF;

    UPDATE public.debit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
    -- تحديث رصيد المورد لحظياً (تخفيض مديونيتنا للمورد)
    UPDATE public.suppliers SET balance = COALESCE(balance, 0) - v_note.total_amount WHERE id = v_note.supplier_id AND organization_id = v_org_id;
END; $$;
-- أ. فتح جلسة طاولة
DROP FUNCTION IF EXISTS public.open_table_session(uuid, uuid);
CREATE OR REPLACE FUNCTION public.open_table_session(p_table_id uuid, p_user_id uuid) 
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_session_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    INSERT INTO public.table_sessions (table_id, opened_by, status, opened_at, organization_id) 
    VALUES (p_table_id, p_user_id, 'OPEN', now(), v_org_id) RETURNING id INTO v_session_id;
    UPDATE public.restaurant_tables SET status = 'OCCUPIED' WHERE id = p_table_id;
    RETURN v_session_id;
END; $$;

-- ب. إنشاء طلب مطعم متكامل
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, uuid, text, text, jsonb, uuid, uuid, jsonb);
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_org_id uuid, p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order_id uuid; v_item jsonb; v_order_num text; v_order_item_id uuid; v_tax_rate numeric; v_subtotal numeric := 0;
BEGIN
    SELECT (vat_rate) INTO v_tax_rate FROM public.company_settings WHERE organization_id = p_org_id LIMIT 1;
    IF v_tax_rate IS NULL THEN v_tax_rate := 0.14; END IF; -- قيمة افتراضية للضريبة
    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));
    INSERT INTO public.orders (session_id, created_by, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, p_org_id, p_warehouse_id) RETURNING id INTO v_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total_price, unit_cost, notes, organization_id)
        VALUES (v_order_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::numeric, (v_item->>'unitPrice')::numeric, ((v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric), COALESCE((v_item->>'unitCost')::numeric, 0), v_item->>'notes', p_org_id) RETURNING id INTO v_order_item_id;
        v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric);
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', p_org_id); -- تم استخدام p_org_id بدلاً من get_my_org لضمان الاتساق
    END LOOP; -- تم تصحيح حساب الضريبة والإجمالي
    UPDATE public.orders SET subtotal = v_subtotal, total_tax = v_subtotal * v_tax_rate, grand_total = v_subtotal + (v_subtotal * v_tax_rate) WHERE id = v_order_id;
    RETURN v_order_id;
END; $$;

-- ================================================================
-- 3. دوال المخزون والمحاسبة (Inventory & Accounting)
-- ================================================================

-- أ. إعادة احتساب أرصدة المخزون بالكامل
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc();
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org(); -- 🔒 فرض عزل البيانات للمؤسسة الحالية فقط
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL AND organization_id = v_org_id LOOP
        total_qty := 0; wh_json := '{}'::jsonb;
        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL AND organization_id = v_org_id LOOP
            wh_qty := 0; -- إعادة تعيين الكمية لكل مستودع
            -- تم تحديث منطق إعادة احتساب المخزون ليكون أكثر شمولاً ودقة
            SELECT COALESCE(SUM(oi.quantity), 0) INTO wh_qty FROM public.opening_inventories oi WHERE oi.product_id = prod_record.id AND oi.warehouse_id = wh_record.id AND oi.organization_id = v_org_id;
            SELECT wh_qty + COALESCE((SELECT SUM(pii.quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft' AND pi.organization_id = v_org_id), 0) INTO wh_qty; -- مشتريات
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft' AND i.organization_id = v_org_id), 0) INTO wh_qty; -- مبيعات
            SELECT wh_qty + COALESCE((SELECT SUM(sri.quantity) FROM public.sales_return_items sri JOIN public.sales_returns sr ON sri.sales_return_id = sr.id WHERE sri.product_id = prod_record.id AND sr.warehouse_id = wh_record.id AND sr.status = 'posted' AND sr.organization_id = v_org_id), 0) INTO wh_qty; -- مرتجع مبيعات
            SELECT wh_qty - COALESCE((SELECT SUM(pri.quantity) FROM public.purchase_return_items pri JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id WHERE pri.product_id = prod_record.id AND pr.warehouse_id = wh_record.id AND pr.status = 'posted' AND pr.organization_id = v_org_id), 0) INTO wh_qty; -- مرتجع مشتريات
            -- يمكن إضافة حركات أخرى مثل التحويلات والتسويات هنا
            total_qty := total_qty + wh_qty;
            IF wh_qty <> 0 THEN wh_json := wh_json || jsonb_build_object(wh_record.id, wh_qty); END IF;
        END LOOP; -- تم إضافة organization_id لكافة الاستعلامات الداخلية
        UPDATE products SET stock = total_qty, warehouse_stock = wh_json WHERE id = prod_record.id;
    END LOOP;
END; $$;

-- ب. إنشاء قيد يومية متوازن
DROP FUNCTION IF EXISTS public.create_journal_entry(date, text, text, jsonb, text, uuid);
CREATE OR REPLACE FUNCTION public.create_journal_entry(entry_date date, description text, reference text, entries jsonb, status text DEFAULT 'posted', org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_entry_id uuid; entry_record jsonb; v_debit numeric := 0; v_credit numeric := 0;
BEGIN
    SELECT SUM((item->>'debit')::numeric), SUM((item->>'credit')::numeric) INTO v_debit, v_credit FROM jsonb_array_elements(entries) AS item;
    IF ABS(COALESCE(v_debit, 0) - COALESCE(v_credit, 0)) > 0.01 THEN RAISE EXCEPTION 'القيد غير متوازن: المدين % لا يساوي الدائن %', v_debit, v_credit; END IF;
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id) VALUES (entry_date, description, reference, status, org_id) RETURNING id INTO new_entry_id;
    FOR entry_record IN SELECT * FROM jsonb_array_elements(entries) LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (new_entry_id, (entry_record->>'account_id')::uuid, (entry_record->>'debit')::numeric, (entry_record->>'credit')::numeric, (entry_record->>'description'), org_id);
    END LOOP;
    RETURN new_entry_id;
END; $$;

-- ================================================================
-- 4. دوال شؤون الموظفين (HR & Payroll)
-- ================================================================

-- تشغيل مسير الرواتب
DROP FUNCTION IF EXISTS public.run_payroll_rpc(integer, integer, date, uuid, jsonb);
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(p_month integer, p_year integer, p_date date, p_treasury_account_id uuid, p_items jsonb) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; v_total_additions numeric := 0; v_total_deductions numeric := 0; v_total_advances numeric := 0; v_total_net numeric := 0; v_item jsonb; v_je_id uuid;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; v_advances_acc_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- جلب الحسابات بناءً على الأكواد القياسية
    SELECT id INTO v_salaries_acc_id FROM public.accounts WHERE code = '5201' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_bonuses_acc_id FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_deductions_acc_id FROM public.accounts WHERE code = '404' AND organization_id = v_org_id LIMIT 1; -- إيرادات خصومات
    SELECT id INTO v_advances_acc_id FROM public.accounts WHERE code = '10203' AND organization_id = v_org_id LIMIT 1; -- سلف الموظفين

    IF v_salaries_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الرواتب (5201) غير موجود.'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_total_gross := v_total_gross + (v_item->>'gross_salary')::numeric;
        v_total_additions := v_total_additions + (v_item->>'additions')::numeric;
        v_total_deductions := v_total_deductions + (v_item->>'other_deductions')::numeric;
        v_total_advances := v_total_advances + (v_item->>'advances_deducted')::numeric;
        v_total_net := v_total_net + (v_item->>'net_salary')::numeric;
    END LOOP;

    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year || '-' || floor(random()*1000)::text, 'posted', v_org_id, true) RETURNING id INTO v_je_id;

    IF v_total_gross > 0 AND v_salaries_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 AND v_bonuses_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF;
    IF v_total_advances > 0 AND v_advances_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 AND v_deductions_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_net > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_account_id, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;
END; $$;

-- ================================================================
-- 4. دوال الأصول والعمولات (Assets & Commissions)
-- ================================================================

-- أ. تشغيل الإهلاك الشهري (Run Depreciation)
DROP FUNCTION IF EXISTS public.run_period_depreciation(date, uuid);
CREATE OR REPLACE FUNCTION public.run_period_depreciation(p_date date, p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_asset record; v_monthly_dep numeric; v_journal_id uuid; v_processed int := 0; v_skipped int := 0;
    v_dep_exp_acc_id uuid; v_acc_dep_acc_id uuid;
BEGIN
    FOR v_asset IN SELECT * FROM public.assets WHERE status = 'active' AND (purchase_cost - salvage_value) > 0 AND organization_id = p_org_id LOOP
        PERFORM 1 FROM public.journal_entries WHERE related_document_id = v_asset.id AND related_document_type = 'asset_depreciation' AND to_char(transaction_date, 'YYYY-MM') = to_char(p_date, 'YYYY-MM');
        IF FOUND THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

        IF v_asset.useful_life > 0 THEN 
            v_monthly_dep := (v_asset.purchase_cost - v_asset.salvage_value) / (v_asset.useful_life * 12); 
        ELSE v_monthly_dep := 0; END IF;

        IF v_monthly_dep > 0 THEN
            v_dep_exp_acc_id := COALESCE(v_asset.depreciation_expense_account_id, (SELECT id FROM public.accounts WHERE code = '533' AND organization_id = p_org_id LIMIT 1));
            v_acc_dep_acc_id := COALESCE(v_asset.accumulated_depreciation_account_id, (SELECT id FROM public.accounts WHERE code = '1119' AND organization_id = p_org_id LIMIT 1));

            IF v_dep_exp_acc_id IS NOT NULL AND v_acc_dep_acc_id IS NOT NULL THEN
                INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id, related_document_id, related_document_type) 
                VALUES (p_date, 'إهلاك أصل: ' || v_asset.name, 'DEP-' || substring(v_asset.id::text, 1, 6), 'posted', true, p_org_id, v_asset.id, 'asset_depreciation') RETURNING id INTO v_journal_id;
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_dep_exp_acc_id, v_monthly_dep, 0, 'مصروف إهلاك', p_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_dep_acc_id, 0, v_monthly_dep, 'مجمع إهلاك', p_org_id);
                v_processed := v_processed + 1;
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('processed', v_processed, 'skipped', v_skipped);
END; $$;

-- ب. حساب عمولة المندوبين (Sales Commission)
DROP FUNCTION IF EXISTS public.calculate_sales_commission(uuid, date, date, numeric);
CREATE OR REPLACE FUNCTION public.calculate_sales_commission(p_salesperson_id uuid, p_start_date date, p_end_date date, p_rate numeric DEFAULT 1.0) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sales numeric; v_returns numeric; v_net numeric; v_comm numeric;
BEGIN
    SELECT COALESCE(SUM(subtotal), 0) INTO v_sales FROM public.invoices WHERE salesperson_id = p_salesperson_id AND status IN ('posted', 'paid') AND invoice_date BETWEEN p_start_date AND p_end_date;
    SELECT COALESCE(SUM(sr.total_amount - COALESCE(sr.tax_amount, 0)), 0) INTO v_returns FROM public.sales_returns sr JOIN public.invoices i ON sr.original_invoice_id = i.id WHERE i.salesperson_id = p_salesperson_id AND sr.status = 'posted' AND sr.return_date BETWEEN p_start_date AND p_end_date;
    v_net := v_sales - v_returns;
    v_comm := v_net * (p_rate / 100);
    RETURN jsonb_build_object('total_sales', v_sales, 'net_sales', v_net, 'commission_amount', v_comm);
END; $$;

-- ج. تقرير مبيعات المطعم التفصيلي (Restaurant Sales Report)
DROP FUNCTION IF EXISTS public.get_restaurant_sales_report(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_restaurant_sales_report(text, text); -- 👈 إضافة هذا السطر
CREATE OR REPLACE FUNCTION public.get_restaurant_sales_report(p_start_date text, p_end_date text) 
RETURNS TABLE(item_name text, category_name text, quantity numeric, total_sales numeric) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
  v_org_id := public.get_my_org();
  RETURN QUERY
  SELECT p.name::text, COALESCE(mc.name, 'غير مصنف')::text, COALESCE(SUM(oi.quantity), 0)::numeric, COALESCE(SUM(oi.total_price), 0)::numeric
  FROM public.order_items oi 
  JOIN public.orders o ON oi.order_id = o.id 
  JOIN public.products p ON oi.product_id = p.id
  LEFT JOIN public.menu_categories mc ON p.category_id = mc.id
  WHERE o.organization_id = v_org_id
  AND o.status IN ('CONFIRMED', 'COMPLETED') 
  AND o.created_at >= p_start_date::timestamptz 
  AND o.created_at <= p_end_date::timestamptz
  GROUP BY 1, 2 ORDER BY total_sales DESC;
END; $$;

-- د. إضافة منتج مع رصيد افتتاحي (Add Product with OB)
DROP FUNCTION IF EXISTS public.add_product_with_opening_balance(text, text, numeric, numeric, numeric, uuid, text, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.add_product_with_opening_balance(
    p_name text, p_sku text, p_sales_price numeric, p_purchase_price numeric, p_stock numeric, 
    p_org_id uuid, p_item_type text DEFAULT 'STOCK', p_inv_acc uuid DEFAULT NULL, p_cogs_acc uuid DEFAULT NULL, p_sales_acc uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_product_id UUID; v_inv_id UUID; v_ob_acc UUID; v_je_id UUID;
BEGIN
    INSERT INTO public.products (name, sku, sales_price, purchase_price, stock, organization_id, item_type, inventory_account_id, cogs_account_id, sales_account_id)
    VALUES (p_name, p_sku, p_sales_price, p_purchase_price, p_stock, p_org_id, p_item_type, p_inv_acc, p_cogs_acc, p_sales_acc)
    RETURNING id INTO v_product_id;

    IF p_stock > 0 AND p_purchase_price > 0 THEN
        v_inv_id := COALESCE(p_inv_acc, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = p_org_id LIMIT 1));
        v_ob_acc := (SELECT id FROM public.accounts WHERE code = '3999' AND organization_id = p_org_id LIMIT 1);

        IF v_inv_id IS NOT NULL AND v_ob_acc IS NOT NULL THEN
            INSERT INTO public.journal_entries (transaction_date, reference, description, status, is_posted, organization_id)
            VALUES (CURRENT_DATE, 'OP-' || p_sku, 'رصيد افتتاحي: ' || p_name, 'posted', true, p_org_id) RETURNING id INTO v_je_id;
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_inv_id, (p_stock * p_purchase_price), 0, 'مخزون افتتاحي', p_org_id),
                   (v_je_id, v_ob_acc, 0, (p_stock * p_purchase_price), 'مقابل افتتاحي', p_org_id);
        END IF;
    END IF;
    RETURN v_product_id;
END; $$;

-- ================================================================
-- 5. دوال التقارير والرقابة (Reporting & SaaS Control)
-- ================================================================

-- أ. التحقق من حدود المستخدمين (منع التجاوز)
CREATE OR REPLACE FUNCTION public.check_user_limit() RETURNS TRIGGER AS $$
DECLARE v_max integer; v_curr integer;
BEGIN
    SELECT max_users INTO v_max FROM public.organizations WHERE id = NEW.organization_id;
    SELECT count(*) INTO v_curr FROM public.profiles WHERE organization_id = NEW.organization_id AND role != 'super_admin';
    IF v_curr >= COALESCE(v_max, 5) THEN RAISE EXCEPTION 'وصلت للحد الأقصى للمستخدمين (%)', v_max; END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_limit_users ON public.profiles;
CREATE TRIGGER trg_limit_users BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.check_user_limit();

-- ب. إحصائيات لوحة البيانات
CREATE OR REPLACE FUNCTION public.get_dashboard_stats() RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sales numeric; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT COALESCE(SUM(subtotal), 0) INTO v_sales FROM public.invoices WHERE organization_id = v_org_id AND status != 'draft';
    RETURN json_build_object('monthSales', v_sales);
END; $$;

-- ج. جلب العملاء المتجاوزين لحد الائتمان
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid);
DROP FUNCTION IF EXISTS public.get_over_limit_customers(); -- 👈 إضافة هذا السطر لحل المشكلة
CREATE OR REPLACE FUNCTION public.get_over_limit_customers()
RETURNS TABLE (id UUID, name TEXT, total_debt NUMERIC, credit_limit NUMERIC) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY SELECT c.id, c.name, COALESCE(c.balance, 0), COALESCE(c.credit_limit, 0) 
    FROM public.customers c WHERE c.organization_id = public.get_my_org() AND COALESCE(c.balance, 0) > COALESCE(c.credit_limit, 0);
END; $$;

-- د. جلب النسب المالية التاريخية
DROP FUNCTION IF EXISTS public.get_historical_ratios(uuid);
DROP FUNCTION IF EXISTS public.get_historical_ratios(); -- 👈 إضافة هذا السطر لضمان عدم التعارض
CREATE OR REPLACE FUNCTION public.get_historical_ratios() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profit jsonb; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT jsonb_agg(jsonb_build_object('name', month_key, 'ربحية', margin)) INTO v_profit FROM (
        SELECT to_char(je.transaction_date, 'YYYY-MM') as month_key, ROUND(SUM(jl.credit - jl.debit), 2) as margin
        FROM public.journal_entries je JOIN public.journal_lines jl ON je.id = jl.journal_entry_id
        WHERE je.organization_id = v_org_id AND je.status = 'posted' GROUP BY 1 ORDER BY 1
    ) sub;
    RETURN jsonb_build_object('profitabilityData', COALESCE(v_profit, '[]'::jsonb));
END; $$;

-- هـ. تسجيل أخطاء النظام
DROP FUNCTION IF EXISTS public.log_system_error(text, text, jsonb, text);
CREATE OR REPLACE FUNCTION public.log_system_error(p_message text, p_code text, p_context jsonb, p_func text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.system_error_logs (error_message, error_code, context, function_name, user_id, organization_id)
    VALUES (p_message, p_code, p_context, p_func, auth.uid(), public.get_my_org());
END; $$;

-- ================================================================
-- 29. دالة جلب إحصائيات المنصة الشاملة (للسوبر أدمن فقط)
-- ================================================================
DROP FUNCTION IF EXISTS get_admin_platform_metrics();
CREATE OR REPLACE FUNCTION get_admin_platform_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    total_sales DECIMAL;
    total_orgs INTEGER;
    active_orgs INTEGER;
    new_orgs_this_month INTEGER;
    new_orgs_last_month INTEGER;
    growth_percentage DECIMAL;
    result JSON;
BEGIN
    -- 1. حساب إجمالي المبيعات عبر كافة المنظمات
    SELECT COALESCE(SUM(total_amount), 0) INTO total_sales
    FROM invoices 
    WHERE status = 'posted';

    -- 2. إحصائيات المنظمات
    SELECT COUNT(*) INTO total_orgs FROM organizations;
    SELECT COUNT(*) INTO active_orgs FROM organizations WHERE is_active = true AND subscription_expiry > CURRENT_DATE;

    -- 3. حساب النمو
    SELECT COUNT(*) INTO new_orgs_this_month 
    FROM organizations 
    WHERE created_at >= date_trunc('month', CURRENT_DATE);

    SELECT COUNT(*) INTO new_orgs_last_month 
    FROM organizations 
    WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') 
      AND created_at < date_trunc('month', CURRENT_DATE);

    IF new_orgs_last_month > 0 THEN
        growth_percentage := ((new_orgs_this_month::DECIMAL - new_orgs_last_month) / new_orgs_last_month) * 100;
    ELSE
        growth_percentage := 100;
    END IF;

    result := json_build_object(
        'total_platform_sales', total_sales,
        'total_organizations', total_orgs,
        'active_subscriptions', active_orgs,
        'growth_this_month_percent', ROUND(growth_percentage, 2),
        'new_registrations_today', (SELECT COUNT(*) FROM organizations WHERE created_at::DATE = CURRENT_DATE)
    );
    RETURN result;
END; $$;

-- ================================================================
-- 30. دالة إصلاح وتنشيط هيكل بيانات الـ SaaS
-- ================================================================
DROP FUNCTION IF EXISTS public.refresh_saas_schema();
CREATE OR REPLACE FUNCTION public.refresh_saas_schema()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. التأكد من وجود عمود الحد الأقصى للمستخدمين
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='max_users') THEN
        ALTER TABLE public.organizations ADD COLUMN max_users INTEGER DEFAULT 5;
    END IF;

    -- 2. التأكد من وجود عمود سبب التعطيل
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='suspension_reason') THEN
        ALTER TABLE public.organizations ADD COLUMN suspension_reason TEXT;
    END IF;

    -- 3. التأكد من وجود عمود إجمالي التحصيل
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='total_collected') THEN
        ALTER TABLE public.organizations ADD COLUMN total_collected NUMERIC DEFAULT 0;
    END IF;

    -- 4. التأكد من وجود عمود تاريخ الدفع القادم
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='next_payment_date') THEN
        ALTER TABLE public.organizations ADD COLUMN next_payment_date DATE;
    END IF;

    -- 3. الأمر السحري لإعادة تحميل كاش الـ API (Schema Reload)
    -- هذا السطر هو الذي يحل مشكلة الـ Schema Cache التي واجهتك
    EXECUTE 'NOTIFY pgrst, ''reload config''';
    
    RETURN 'تم تحديث هيكل البيانات وتنشيط الكاش بنجاح ✅';
END; $$;

-- ================================================================
-- 31. دوال الصيانة الذاتية للعميل (Client Self-Maintenance)
-- ================================================================

-- أ. فحص وإنشاء الحسابات الأساسية المفقودة (Repair Missing Accounts)
-- تضمن هذه الدالة وجود الحسابات "الحرجة" لعمل القيود الآلية (مثل الصندوق والمبيعات)
DROP FUNCTION IF EXISTS public.repair_missing_accounts();
CREATE OR REPLACE FUNCTION public.repair_missing_accounts()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_count int := 0;
BEGIN
    v_org_id := public.get_my_org();
    
    -- التأكد من وجود الحسابات القياسية (أمثلة)
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1231' AND organization_id = v_org_id) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('1231', 'الصندوق الرئيسي', 'ASSET', v_org_id);
        v_count := v_count + 1;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '411' AND organization_id = v_org_id) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('411', 'إيرادات المبيعات', 'REVENUE', v_org_id);
        v_count := v_count + 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '511' AND organization_id = v_org_id) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('511', 'تكلفة المبيعات', 'EXPENSE', v_org_id);
        v_count := v_count + 1;
    END IF;

    RETURN 'تم فحص الدليل وإضافة (' || v_count || ') حساباً مفقوداً بنجاح ✅';
END; $$;

-- ب. تنظيف الأصناف والبيانات المحذوفة نهائياً (Purge Deleted Items)
-- تقوم بمسح السجلات التي تحمل علامة deleted_at لتوفير المساحة وتسريع البرنامج
DROP FUNCTION IF EXISTS public.purge_deleted_records();
CREATE OR REPLACE FUNCTION public.purge_deleted_records()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    DELETE FROM public.products WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.accounts WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.customers WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.suppliers WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    
    RETURN 'تم تنظيف كافة البيانات المحذوفة نهائياً بنجاح ✅';
END; $$;

-- ج. إعادة مزامنة الأرصدة الشاملة (Recalculate All Balances)
-- تقوم بتحديث أرصدة المخازن، العملاء، والموردين من واقع القيود الفعلية
DROP FUNCTION IF EXISTS public.recalculate_all_system_balances();
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; r record;
BEGIN
    v_org_id := public.get_my_org();
    
    -- 1. تحديث أرصدة المخازن
    PERFORM public.recalculate_stock_rpc();
    
    -- 2. تحديث أرصدة العملاء
    FOR r IN SELECT id FROM public.customers WHERE organization_id = v_org_id LOOP
        PERFORM public.update_single_customer_balance(r.id);
    END LOOP;
    
    -- 3. تحديث أرصدة الموردين
    FOR r IN SELECT id FROM public.suppliers WHERE organization_id = v_org_id LOOP
        PERFORM public.update_single_supplier_balance(r.id);
    END LOOP;

    -- 4. تحديث رصيد الحسابات (Ledger Balances)
    UPDATE public.accounts a
    SET balance = (SELECT COALESCE(SUM(debit - credit), 0) FROM public.journal_lines jl JOIN public.journal_entries je ON jl.journal_entry_id = je.id WHERE jl.account_id = a.id AND je.status = 'posted')
    WHERE a.organization_id = v_org_id;

    RETURN 'تمت إعادة مطابقة الأرصدة المالية والمخزنية بنجاح ✅';
END; $$;

-- ================================================================
-- 32. دالة إغلاق السنة المالية (Close Financial Year)
-- ================================================================
DROP FUNCTION IF EXISTS public.close_financial_year(integer, date);
CREATE OR REPLACE FUNCTION public.close_financial_year(p_year integer, p_closing_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; v_je_id uuid; v_start_date date; v_end_date date;
    v_retained_earnings_id uuid; v_net_result numeric := 0; v_row record; v_ref text;
BEGIN
    v_org_id := public.get_my_org();
    v_ref := 'CLOSE-' || p_year;
    v_start_date := (p_year || '-01-01')::date;
    v_end_date := (p_year || '-12-31')::date;

    -- 1. التحقق من عدم وجود إغلاق سابق
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reference = v_ref AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'السنة المالية % مغلقة بالفعل.', p_year;
    END IF;

    -- 2. جلب حساب الأرباح المبقاة (32 أو 3103 حسب النشاط)
    SELECT id INTO v_retained_earnings_id FROM public.accounts 
    WHERE (code = '32' OR code = '3103') AND organization_id = v_org_id LIMIT 1;
    
    IF v_retained_earnings_id IS NULL THEN RAISE EXCEPTION 'حساب الأرباح المبقاة (32) غير موجود في الدليل.'; END IF;

    -- 3. إنشاء رأس القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id)
    VALUES (p_closing_date, 'قيد إقفال السنة المالية ' || p_year, v_ref, 'posted', true, v_org_id)
    RETURNING id INTO v_je_id;

    -- 4. إقفال حسابات الإيرادات والمصروفات
    FOR v_row IN 
        SELECT jl.account_id, a.name, SUM(jl.debit - jl.credit) as balance
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_org_id AND je.status = 'posted' 
          AND je.transaction_date BETWEEN v_start_date AND v_end_date
          AND (a.code LIKE '4%' OR a.code LIKE '5%')
        GROUP BY jl.account_id, a.name
        HAVING ABS(SUM(jl.debit - jl.credit)) > 0.001
    LOOP
        v_net_result := v_net_result + v_row.balance;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_row.account_id, CASE WHEN v_row.balance < 0 THEN ABS(v_row.balance) ELSE 0 END, CASE WHEN v_row.balance > 0 THEN v_row.balance ELSE 0 END, 'إقفال حساب ' || v_row.name, v_org_id);
    END LOOP;

    -- 5. ترحيل الصافي للأرباح المبقاة
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_retained_earnings_id, CASE WHEN v_net_result > 0 THEN v_net_result ELSE 0 END, CASE WHEN v_net_result < 0 THEN ABS(v_net_result) ELSE 0 END, 'ترحيل نتيجة العام ' || p_year, v_org_id);

    UPDATE public.company_settings SET last_closed_date = p_closing_date WHERE organization_id = v_org_id;
    RETURN v_je_id;
END; $$;
