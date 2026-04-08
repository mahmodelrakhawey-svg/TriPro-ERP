-- 🛠️ ملف نشر جميع دوال النظام (Deploy All Functions) - النسخة الاحترافية الموحدة
-- 🛠️ ملف نشر جميع دوال النظام (Deploy All Functions) - النسخة المطهرة والنهائية (Pure Version 3.3)
-- هذا الملف يجمع كافة الدوال البرمجية (RPCs) اللازمة لتشغيل النظام بشكل آمن واحترافي.
-- تم تنقيح هذا الملف لإزالة التكرار وحل تعارض التوقيعات وأخطاء الـ 404.
-- تم التأكد من اتساق الأكواد المحاسبية وتطبيق مبدأ Multi-tenancy.

-- ================================================================
-- 1. دوال الاعتماد المالي (Financial Approvals)
-- ================================================================

-- أ. اعتماد فاتورة المبيعات (Sales Invoice)
DROP FUNCTION IF EXISTS public.approve_invoice(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid;
    v_customer_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_journal_id uuid;
    v_discount_acc_id uuid; v_treasury_acc_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_exchange_rate numeric; 
    v_modifier_json jsonb; v_bom_item record;
    v_total_amount_base numeric; v_paid_amount_base numeric; v_subtotal_base numeric;
    v_tax_amount_base numeric; v_discount_amount_base numeric;
    v_mappings jsonb;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    v_org_id := v_invoice.organization_id;
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

      -- 1. جلب روابط الحسابات المخصصة من إعدادات الشركة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 2. جلب الحسابات (الأولوية للربط المخصص Mapping ثم الكود الافتراضي)
    v_sales_acc_id := (v_mappings->>'SALES_REVENUE')::uuid;
    IF v_sales_acc_id IS NULL THEN
        SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_vat_acc_id := (v_mappings->>'VAT')::uuid;
    IF v_vat_acc_id IS NULL THEN
        SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_customer_acc_id := (v_mappings->>'CUSTOMERS')::uuid;
    IF v_customer_acc_id IS NULL THEN
        SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_cogs_acc_id := (v_mappings->>'COGS')::uuid;
    IF v_cogs_acc_id IS NULL THEN
        SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_inventory_acc_id := (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid;
    IF v_inventory_acc_id IS NULL THEN
        SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_discount_acc_id := (v_mappings->>'SALES_DISCOUNT')::uuid;
    IF v_discount_acc_id IS NULL THEN
        SELECT id INTO v_discount_acc_id FROM public.accounts WHERE code = '4102' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;  
   

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

    -- حساب القيم
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

    IF v_total_cost > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
        (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات', v_org_id),
        (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id);
    END IF;

    UPDATE public.invoices SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ب. اعتماد فاتورة المشتريات (Purchase Invoice)
DROP FUNCTION IF EXISTS public.approve_purchase_invoice(UUID) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
    v_current_stock numeric; v_current_avg_cost numeric; v_new_avg_cost numeric; v_item_price_base numeric;
    v_total_amount_base numeric; v_tax_amount_base numeric; v_net_amount_base numeric; -- 👈 تم إضافة هذه المتغيرات
    v_mappings jsonb;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    v_org_id := v_invoice.organization_id; -- التأكد من أن المنظمة هي نفسها

    -- جلب روابط الحسابات المخصصة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_inventory_acc_id := (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid;
    IF v_inventory_acc_id IS NULL THEN
        SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_vat_acc_id := (v_mappings->>'VAT_INPUT')::uuid;
    IF v_vat_acc_id IS NULL THEN
        SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_supplier_acc_id := (v_mappings->>'SUPPLIERS')::uuid;
    IF v_supplier_acc_id IS NULL THEN
        SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1;
    END IF;

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

    -- معالجة الحسابات المالية
    v_total_amount_base := v_invoice.total_amount * COALESCE(v_invoice.exchange_rate, 1);
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * COALESCE(v_invoice.exchange_rate, 1);
    v_net_amount_base := v_total_amount_base - v_tax_amount_base;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات', v_org_id);
    IF v_tax_amount_base > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات', v_org_id); END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد', v_org_id);

    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ج. اعتماد سند القبض (Receipt Voucher)
DROP FUNCTION IF EXISTS public.approve_receipt_voucher(UUID, UUID, UUID) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_org_id uuid, p_voucher_id uuid, p_credit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود'; END IF;
    IF v_voucher.organization_id != p_org_id THEN RAISE EXCEPTION 'لا تملك صلاحية الوصول لهذا السند.'; END IF;
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', p_org_id, true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, p_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, p_credit_account_id, 0, v_voucher.amount, v_voucher.notes, p_org_id);
    
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;

-- د. اعتماد سند الصرف (Payment Voucher)
DROP FUNCTION IF EXISTS public.approve_payment_voucher(UUID, UUID, UUID) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_org_id uuid, p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود'; END IF;
    IF v_voucher.organization_id != p_org_id THEN RAISE EXCEPTION 'لا تملك صلاحية الوصول لهذا السند.'; END IF;
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', p_org_id, true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, p_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, p_org_id);
    
    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;
-- هـ. اعتماد مرتجع المبيعات (Sales Return) مع معالجة التكلفة والمخزون
DROP FUNCTION IF EXISTS public.approve_sales_return(UUID) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود.'; END IF;
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
DROP FUNCTION IF EXISTS public.approve_purchase_return(UUID) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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
DROP FUNCTION IF EXISTS public.approve_credit_note(UUID) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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
DROP FUNCTION IF EXISTS public.approve_debit_note(UUID) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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
DROP FUNCTION IF EXISTS public.open_table_session(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.open_table_session(p_table_id uuid, p_user_id uuid) -- تم إزالة التحقق من حالة الطاولة هنا، يجب أن يتم في الواجهة الأمامية
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
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, uuid, text, text, jsonb, uuid, uuid, jsonb) CASCADE;
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_org_id uuid, p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb, 
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order_id uuid; v_item jsonb; v_order_num text; v_order_item_id uuid; v_tax_rate numeric; v_subtotal numeric := 0; v_vat_acc_id uuid;
BEGIN
    SELECT COALESCE(vat_rate, 0.14) INTO v_tax_rate FROM public.company_settings WHERE organization_id = p_org_id LIMIT 1;
    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));
    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, p_org_id, p_warehouse_id) RETURNING id INTO v_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.order_items (order_id, product_id, quantity, price, total_price, unit_cost, notes, modifiers, organization_id)
        VALUES (v_order_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::numeric, (v_item->>'unitPrice')::numeric, ((v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric), COALESCE((v_item->>'unitCost')::numeric, 0), v_item->>'notes', COALESCE(v_item->'modifiers', '[]'::jsonb), p_org_id) RETURNING id INTO v_order_item_id;
                INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', p_org_id);
    END LOOP;

    UPDATE public.orders SET subtotal = v_subtotal, total_tax = v_subtotal * v_tax_rate, grand_total = v_subtotal + (v_subtotal * v_tax_rate) WHERE id = v_order_id;
     IF p_delivery_info IS NOT NULL THEN
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0), p_org_id);
    END IF;   
    RETURN v_order_id;
END; $$;

-- ================================================================
-- 3. دوال المخزون والمحاسبة (Inventory & Accounting)
-- ================================================================

-- أ. إعادة احتساب أرصدة المخزون بالكامل
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc() CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC; v_org_id uuid;
BEGIN
    -- تحديد المنظمة الحالية أو المنظمة الممرة كمعامل
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL AND organization_id = v_org_id LOOP
        total_qty := 0; wh_json := '{}'::jsonb;
        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL AND organization_id = v_org_id LOOP
            wh_qty := 0; -- إعادة تعيين الكمية لكل مستودع
            -- تم تحديث منطق إعادة احتساب المخزون ليكون أكثر شمولاً ودقة
            SELECT COALESCE(SUM(oi.quantity), 0) INTO wh_qty FROM public.opening_inventories oi WHERE oi.product_id = prod_record.id AND oi.warehouse_id = wh_record.id AND oi.organization_id = v_org_id;
            SELECT wh_qty + COALESCE((SELECT SUM(pii.quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft' AND pi.organization_id = v_org_id), 0) INTO wh_qty; -- مشتريات
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft' AND i.organization_id = v_org_id), 0) INTO wh_qty; -- مبيعات
            SELECT wh_qty + COALESCE((SELECT SUM(sri.quantity) FROM public.sales_return_items sri JOIN public.sales_returns sr ON sri.sales_return_id = sr.id WHERE sri.product_id = prod_record.id AND sr.warehouse_id = wh_record.id AND sr.status = 'posted' AND sr.organization_id = v_org_id), 0) INTO wh_qty; -- مرتجع مبيعات
            SELECT wh_qty - COALESCE((SELECT SUM(pri.quantity) FROM public.purchase_return_items pri JOIN public.purchase_returns pr ON pri.return_id = pr.id WHERE pri.product_id = prod_record.id AND pr.warehouse_id = wh_record.id AND pr.status = 'posted' AND pr.organization_id = v_org_id), 0) INTO wh_qty; -- مرتجع مشتريات
            -- يمكن إضافة حركات أخرى مثل التحويلات والتسويات هنا
            total_qty := total_qty + wh_qty;
            IF wh_qty <> 0 THEN wh_json := wh_json || jsonb_build_object(wh_record.id, wh_qty); END IF;
        END LOOP; -- تم إضافة organization_id لكافة الاستعلامات الداخلية
        UPDATE products SET stock = total_qty, warehouse_stock = wh_json WHERE id = prod_record.id;
    END LOOP;
END; $$;

-- ب. إنشاء قيد يومية متوازن
DROP FUNCTION IF EXISTS public.create_journal_entry(date, text, text, jsonb, text, uuid) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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
DROP FUNCTION IF EXISTS public.run_payroll_rpc(integer, integer, date, uuid, jsonb) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(
    p_month integer, 
    p_year integer, 
    p_date date, 
    p_treasury_account_id uuid, 
    p_items jsonb
) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; v_total_additions numeric := 0; 
    v_total_deductions numeric := 0; v_total_advances numeric := 0; v_total_net numeric := 0; 
    v_total_payroll_tax numeric := 0; v_item jsonb; v_je_id uuid; v_mappings jsonb;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; v_payroll_tax_acc_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. جلب روابط الحسابات المخصصة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 2. جلب الحسابات (الأولوية للربط Mapping ثم الكود الافتراضي)
    v_salaries_acc_id := (v_mappings->>'SALARIES_EXPENSE')::uuid;
    IF v_salaries_acc_id IS NULL THEN
        SELECT id INTO v_salaries_acc_id FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_bonuses_acc_id := (v_mappings->>'EMPLOYEE_BONUSES')::uuid;
    IF v_bonuses_acc_id IS NULL THEN
        SELECT id INTO v_bonuses_acc_id FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_deductions_acc_id := (v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid;
    IF v_deductions_acc_id IS NULL THEN
        SELECT id INTO v_deductions_acc_id FROM public.accounts WHERE code = '422' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_advances_acc_id := (v_mappings->>'EMPLOYEE_ADVANCES')::uuid;
    IF v_advances_acc_id IS NULL THEN
        SELECT id INTO v_advances_acc_id FROM public.accounts WHERE code = '1223' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_payroll_tax_acc_id := (v_mappings->>'PAYROLL_TAX')::uuid;
    IF v_payroll_tax_acc_id IS NULL THEN
        SELECT id INTO v_payroll_tax_acc_id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1;
    END IF;

    IF v_salaries_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الرواتب الرئيسي (531) غير موجود.'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_total_gross := v_total_gross + (v_item->>'gross_salary')::numeric;
        v_total_additions := v_total_additions + (v_item->>'additions')::numeric;
        v_total_deductions := v_total_deductions + COALESCE((v_item->>'other_deductions')::numeric, 0);
        v_total_advances := v_total_advances + (v_item->>'advances_deducted')::numeric;
        v_total_payroll_tax := v_total_payroll_tax + COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_net := v_total_net + (v_item->>'net_salary')::numeric;
    END LOOP;

    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances + v_total_payroll_tax), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, payroll_tax, advances_deducted, other_deductions, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, (v_item->>'gross_salary')::numeric, (v_item->>'additions')::numeric, COALESCE((v_item->>'payroll_tax')::numeric, 0), (v_item->>'advances_deducted')::numeric, (v_item->>'other_deductions')::numeric, (v_item->>'net_salary')::numeric, v_org_id);
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year || '-' || floor(random()*1000)::text, 'posted', v_org_id, true) RETURNING id INTO v_je_id;

    IF v_total_gross > 0 AND v_salaries_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 AND v_bonuses_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF;
    IF v_total_advances > 0 AND v_advances_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 AND v_deductions_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_payroll_tax > 0 AND v_payroll_tax_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_payroll_tax_acc_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل', v_org_id); END IF;
    IF v_total_net > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_account_id, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;
END; $$;

-- ================================================================
-- 4. دوال الأصول والعمولات (Assets & Commissions)
-- ================================================================

-- أ. تشغيل الإهلاك الشهري (Run Depreciation)
DROP FUNCTION IF EXISTS public.run_period_depreciation(date, uuid) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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
DROP FUNCTION IF EXISTS public.calculate_sales_commission(uuid, date, date, numeric) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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
DROP FUNCTION IF EXISTS public.get_restaurant_sales_report(text, text, uuid) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
DROP FUNCTION IF EXISTS public.get_restaurant_sales_report(text, text) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.get_restaurant_sales_report(p_start_date text, p_end_date text, p_org_id uuid DEFAULT NULL) 
RETURNS TABLE(item_name text, category_name text, quantity numeric, total_sales numeric) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
  v_target_org := COALESCE(p_org_id, public.get_my_org());
  RETURN QUERY
  SELECT p.name::text, COALESCE(mc.name, 'غير مصنف')::text, COALESCE(SUM(oi.quantity), 0)::numeric, COALESCE(SUM(oi.total_price), 0)::numeric
  FROM public.order_items oi 
  JOIN public.orders o ON oi.order_id = o.id 
  JOIN public.products p ON oi.product_id = p.id
  LEFT JOIN public.menu_categories mc ON p.category_id = mc.id
  WHERE o.organization_id = v_target_org
  AND o.status IN ('CONFIRMED', 'COMPLETED') 
  AND o.created_at >= p_start_date::timestamptz 
  AND o.created_at <= p_end_date::timestamptz
  GROUP BY 1, 2 ORDER BY total_sales DESC;
END; $$;

-- هـ. تقرير مبيعات الكاشير (Sales By User Report)
DROP FUNCTION IF EXISTS public.get_sales_by_user_report(text, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_sales_by_user_report(p_start_date text, p_end_date text, p_org_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, user_name text, total_orders bigint, total_sales numeric) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
  v_target_org := COALESCE(p_org_id, public.get_my_org());
  RETURN QUERY
  SELECT
    au.id AS user_id,
    COALESCE(p.full_name, au.email) AS user_name,
    COUNT(o.id) AS total_orders,
    COALESCE(SUM(o.grand_total), 0)::numeric AS total_sales
  FROM public.orders o
  JOIN auth.users au ON o.user_id = au.id -- الربط مع جدول المستخدمين الأساسي باستخدام العمود الجديد
  LEFT JOIN public.profiles p ON au.id = p.id AND p.organization_id = v_target_org -- الربط مع جدول البروفايلات
  WHERE o.organization_id = v_target_org
    AND o.status IN ('COMPLETED', 'PAID')
    AND o.created_at >= p_start_date::timestamptz
    AND o.created_at <= p_end_date::timestamptz
  GROUP BY au.id, p.full_name, au.email
  ORDER BY total_sales DESC;
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
-- تم توحيدها لاستدعاء الدالة المركزية لضمان ثبات الأرقام
DROP FUNCTION IF EXISTS public.get_dashboard_stats() CASCADE;
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_month_sales numeric; v_receivables numeric; v_payables numeric;
    v_low_stock_count integer; v_chart_data json; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    -- 1. المبيعات الشهرية
    SELECT COALESCE(SUM(amount), 0) INTO v_month_sales 
    FROM public.monthly_sales_dashboard 
    WHERE organization_id = v_org_id AND date_trunc('month', transaction_date) = date_trunc('month', CURRENT_DATE);
    
    -- 2. أرصدة العملاء (1221) والموردين (201)
    SELECT COALESCE(SUM(balance), 0) INTO v_receivables FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '1221%';
    SELECT COALESCE(SUM(ABS(balance)), 0) INTO v_payables FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '201%';
    
    -- 3. عدد الأصناف تحت حد الطلب
    SELECT COUNT(*) INTO v_low_stock_count FROM public.products WHERE organization_id = v_org_id AND stock <= COALESCE(min_stock_level, 0) AND deleted_at IS NULL;
    
    -- 4. بيانات الرسم البياني (آخر 6 أشهر)
    SELECT json_agg(t) INTO v_chart_data FROM (
        SELECT to_char(month, 'YYYY-MM') as name, 
               COALESCE((SELECT SUM(amount) FROM public.monthly_sales_dashboard WHERE organization_id = v_org_id AND date_trunc('month', transaction_date) = month), 0) as sales
        FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE), '1 month') as month
    ) t;

    RETURN json_build_object(
        'monthSales', v_month_sales,
        'receivables', v_receivables,
        'payables', v_payables,
        'lowStockCount', v_low_stock_count,
        'chartData', v_chart_data
    );
END; $$;

-- ج. جلب العملاء المتجاوزين لحد الائتمان
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
DROP FUNCTION IF EXISTS public.get_over_limit_customers() CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.get_over_limit_customers(p_org_id uuid)
RETURNS TABLE (id UUID, name TEXT, total_debt NUMERIC, credit_limit NUMERIC) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY SELECT c.id, c.name, COALESCE(c.balance, 0), COALESCE(c.credit_limit, 0) 
    FROM public.customers c WHERE c.organization_id = p_org_id AND COALESCE(c.balance, 0) > COALESCE(c.credit_limit, 0) AND COALESCE(c.credit_limit, 0) > 0;
END; $$;

-- د. جلب النسب المالية التاريخية
-- تم توحيدها لاستدعاء الدالة المركزية المحدثة
DROP FUNCTION IF EXISTS public.get_historical_ratios(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_historical_ratios(p_org_id uuid DEFAULT NULL) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profit jsonb; v_liquidity jsonb; v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    
    -- 1. حساب الربحية (إيرادات 4 - مصروفات 5)
    SELECT jsonb_agg(jsonb_build_object('name', month_key, 'ربحية', margin)) INTO v_profit FROM (
        SELECT to_char(je.transaction_date, 'YYYY-MM') as month_key,
            CASE WHEN SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END) > 0 
                 THEN ROUND(((SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END) - SUM(CASE WHEN a.code LIKE '5%' THEN jl.debit - jl.credit ELSE 0 END)) / NULLIF(SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END), 0)) * 100, 2)
                 ELSE 0 END as margin
        FROM public.journal_entries je JOIN public.journal_lines jl ON je.id = jl.journal_entry_id JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_target_org AND je.status = 'posted' AND je.transaction_date >= (date_trunc('month', now()) - interval '6 months')::date
        GROUP BY 1 ORDER BY 1
    ) sub;

    -- 2. حساب السيولة (أصول متداولة 12 و 103 / خصوم متداولة 2)
    SELECT jsonb_agg(jsonb_build_object('name', month_key, 'سيولة', ratio)) INTO v_liquidity FROM (
        SELECT to_char(je.transaction_date, 'YYYY-MM') as month_key,
            CASE WHEN SUM(CASE WHEN a.code LIKE '2%' THEN jl.credit - jl.debit ELSE 0 END) != 0 
                 THEN ROUND(SUM(CASE WHEN (a.code LIKE '12%' OR a.code LIKE '103%') THEN jl.debit - jl.credit ELSE 0 END) / NULLIF(ABS(SUM(CASE WHEN a.code LIKE '2%' THEN jl.credit - jl.debit ELSE 0 END)), 0), 2)
                 ELSE 0 END as ratio
        FROM public.journal_entries je JOIN public.journal_lines jl ON je.id = jl.journal_entry_id JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_target_org AND je.status = 'posted' AND je.transaction_date >= (date_trunc('month', now()) - interval '6 months')::date
        GROUP BY 1 ORDER BY 1
    ) sub;

    RETURN jsonb_build_object(
        'profitabilityData', COALESCE(v_profit, '[]'::jsonb),
        'liquidityData', COALESCE(v_liquidity, '[]'::jsonb)
    );
END; $$;

-- و. دالة التحقق من القيود غير المرحلة (Check Unposted Entries)
-- تساعد المحاسب في العثور على القيود المسودة التي تؤثر على دقة التقارير
DROP FUNCTION IF EXISTS public.check_unposted_entries(date, date, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.check_unposted_entries(p_start_date date, p_end_date date, p_org_id uuid DEFAULT NULL)
RETURNS TABLE (entry_id uuid, entry_date date, entry_description text, entry_reference text, current_status text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    RETURN QUERY
    SELECT id, transaction_date, description, reference, status
    FROM public.journal_entries
    WHERE organization_id = v_target_org
      AND status != 'posted'
      AND transaction_date BETWEEN p_start_date AND p_end_date;
END; $$;

-- تنشيط الكاش فوراً لضمان تعرف الواجهة على التغييرات
SELECT public.refresh_saas_schema();

-- دالة تحليل تكاليف الإنتاج (حل مشكلة PGRST202)
DROP FUNCTION IF EXISTS public.get_manufacturing_analysis(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.get_manufacturing_analysis(date, uuid, date) CASCADE;
CREATE OR REPLACE FUNCTION public.get_manufacturing_analysis(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    id uuid,
    order_number text,
    product_name text,
    quantity numeric,
    end_date date,
    standard_cost numeric,
    actual_cost numeric,
    material_variance numeric,
    wastage_qty numeric,
    variance numeric,
    variance_percent numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH order_standard_costs AS (
        SELECT 
            wo_inner.id as wo_id,
            COALESCE(SUM(bom.quantity_required * COALESCE(p_raw.cost, p_raw.purchase_price, 0)), 0) as unit_standard_cost
        FROM public.work_orders wo_inner
        LEFT JOIN public.bill_of_materials bom ON wo_inner.product_id = bom.product_id
        LEFT JOIN public.products p_raw ON bom.raw_material_id = p_raw.id
        GROUP BY wo_inner.id
    )
    SELECT 
        wo.id,
        wo.order_number,
        p.name as product_name,
        wo.quantity,
        wo.end_date,
        (osc.unit_standard_cost * wo.quantity)::numeric as standard_cost,
        COALESCE((SELECT SUM(amount) FROM public.work_order_costs WHERE work_order_id = wo.id), 0)::numeric as actual_cost,
        0::numeric as material_variance,
        0::numeric as wastage_qty,
        (COALESCE((SELECT SUM(amount) FROM public.work_order_costs WHERE work_order_id = wo.id), 0) - (osc.unit_standard_cost * wo.quantity))::numeric as variance,
        CASE WHEN (osc.unit_standard_cost * wo.quantity) > 0 
             THEN (((COALESCE((SELECT SUM(amount) FROM public.work_order_costs WHERE work_order_id = wo.id), 0) / (osc.unit_standard_cost * wo.quantity)) - 1) * 100)::numeric
             ELSE 0 END as variance_percent
    FROM public.work_orders wo
    JOIN public.products p ON wo.product_id = p.id
    JOIN order_standard_costs osc ON wo.id = osc.wo_id
    WHERE wo.organization_id = p_org_id 
      AND wo.status = 'completed'
      AND wo.end_date BETWEEN p_start_date AND p_end_date;
END; $$;
-- هـ. تسجيل أخطاء النظام (System Error Logger)
DROP FUNCTION IF EXISTS public.log_system_error(text, text, jsonb, text) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.log_system_error(p_message text, p_code text, p_context jsonb, p_func text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.system_error_logs (error_message, error_code, context, function_name, user_id, organization_id)
    VALUES (p_message, p_code, p_context, p_func, auth.uid(), public.get_my_org());
END; $$;

-- ================================================================
-- 29. دالة جلب إحصائيات المنصة الشاملة (للسوبر أدمن فقط)
-- ================================================================
DROP FUNCTION IF EXISTS public.get_admin_platform_metrics() CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.get_admin_platform_metrics()
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
-- 29.5 دالة قسرية لمنح صلاحيات مدير لمستخدم معين (حل مشكلة الصلاحيات)
-- ================================================================ 
DROP FUNCTION IF EXISTS public.force_grant_admin_access(uuid, uuid) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.force_grant_admin_access(p_user_id uuid, p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. تحديث البروفايل بالدور الجديد والشركة
    INSERT INTO public.profiles (id, organization_id, role, is_active)
    VALUES (p_user_id, p_org_id, 'admin', true)
    ON CONFLICT (id) DO UPDATE 
    SET organization_id = EXCLUDED.organization_id,
        role = 'admin',
        is_active = true;

    -- 2. تحديث Metadata في auth.users لضمان صحة الـ JWT مستقبلاً
    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('org_id', p_org_id, 'role', 'admin')
    WHERE id = p_user_id;
END; $$;

-- ================================================================
-- 29.6 تهيئة الدليل المحاسبي المصري لشركة جديدة
-- ================================================================ 
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid, text) CASCADE;
CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id uuid, p_activity_type text DEFAULT 'commercial')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_vat_rate numeric; v_admin_id uuid; v_retained_id uuid; v_org_name text;
    v_cash_id uuid; v_sales_id uuid; v_cust_id uuid; v_cogs_id uuid; v_inv_id uuid; v_vat_id uuid; v_supp_id uuid; v_vat_in_id uuid; v_disc_id uuid;
    v_wht_pay_id uuid; v_payroll_tax_id uuid; v_wht_rec_id uuid;
    v_sal_exp_id uuid; v_bonus_id uuid; v_ded_id uuid; v_adv_id uuid;
BEGIN
    v_vat_rate := CASE WHEN p_template = 'construction' THEN 0.05 WHEN p_template = 'charity' THEN 0.00 ELSE 0.14 END;
    v_vat_rate := CASE WHEN p_activity_type = 'construction' THEN 0.05 WHEN p_activity_type = 'charity' THEN 0.00 ELSE 0.14 END;
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    -- إنشاء جدول مؤقت لهيكل الدليل الأساسي
    CREATE TEMPORARY TABLE coa_temp (code text PRIMARY KEY, name text NOT NULL, type text NOT NULL, is_group boolean NOT NULL, parent_code text) ON COMMIT DROP;

    INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
    ('1', 'الأصول', 'asset', true, NULL),
    ('2', 'الخصوم', 'liability', true, NULL),
    ('3', 'حقوق الملكية', 'equity', true, NULL),
    ('4', 'الإيرادات', 'revenue', true, NULL),
    ('5', 'المصروفات', 'expense', true, NULL),
    -- المستوى 2
    ('12', 'الأصول المتداولة', 'asset', true, '1'),
    ('31', 'رأس المال والاحتياطيات', 'equity', true, '3'),
    -- المستوى 3
    ('123', 'النقدية وما في حكمها', 'asset', true, '12'),
    ('1232', 'البنوك - حسابات جارية', 'asset', true, '123'),
    ('1233', 'المحافظ الإلكترونية', 'asset', true, '123'),
    ('124', 'أرصدة مدينة أخرى', 'asset', true, '12'),
    ('223', 'مصلحة الضرائب (التزامات)', 'liability', true, '2'),
    -- المستوى 4 (حسابات الحركة)
    ('1221', 'العملاء', 'asset', false, '12'),
    ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'asset', false, '124'),
    ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'asset', false, '124'),
    ('1231', 'الخزينة الرئيسية', 'asset', false, '123'),
    ('123201', 'البنك الأهلي المصري', 'asset', false, '1232'),
    ('123202', 'بنك مصر', 'asset', false, '1232'),
    ('123203', 'البنك التجاري الدولي (CIB)', 'asset', false, '1232'),
    ('123204', 'بنك QNB الأهلي', 'asset', false, '1232'),
    ('123205', 'بنك القاهرة', 'asset', false, '1232'),
    ('123301', 'فودافون كاش', 'asset', false, '1233'),
    ('123302', 'اتصالات كاش', 'asset', false, '1233'),
    ('123303', 'أورنج كاش', 'asset', false, '1233'),
    ('123304', 'وي باي (WE Pay)', 'asset', false, '1233'),
    ('123305', 'انستا باي (InstaPay)', 'asset', false, '1233'),
    ('10302', 'مخزون منتج تام', 'asset', false, '12'),
    ('1119', 'مجمع إهلاك الأصول', 'asset', false, '1'),
    ('201', 'الموردين', 'liability', false, '2'),
    ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'liability', false, '223'),
    ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'liability', false, '223'),
    ('2233', 'ضريبة كسب العمل', 'liability', false, '223'),
    ('311', 'رأس المال المدفوع', 'equity', false, '31'),
    ('32', 'الأرباح المبقاة', 'equity', false, '3'),
    ('3999', 'الأرصدة الافتتاحية', 'equity', false, '3'),
    ('411', 'إيراد مبيعات', 'revenue', false, '4'),
    ('4102', 'خصم مسموح به', 'revenue', false, '4'),
    ('511', 'تكلفة مبيعات', 'expense', false, '5'),
    ('531', 'رواتب وأجور الموظفين', 'expense', false, '5'),
    ('533', 'مصروف إهلاك الأصول', 'expense', false, '5');

    -- إعداد إعدادات الشركة (تم إزالة تعديل بروفايل المستخدم الحالي لمنع الخلل)
    INSERT INTO public.company_settings (organization_id, company_name, vat_rate, activity_type)
    VALUES (p_org_id, v_org_name, v_vat_rate, p_activity_type)
    ON CONFLICT (organization_id) 
    DO UPDATE SET 
        activity_type = EXCLUDED.activity_type, 
        vat_rate = EXCLUDED.vat_rate, 
        company_name = EXCLUDED.company_name;

    -- حقن الحسابات وربطها هرمياً
    INSERT INTO public.accounts (organization_id, code, name, type, is_group, is_active)
    SELECT p_org_id, code, name, type, is_group, true FROM coa_temp ON CONFLICT DO NOTHING;

    -- ربط المعرفات (UUIDs) بالحسابات السيادية لضمان عمل الدوال التلقائية
    SELECT id INTO v_retained_id FROM public.accounts WHERE organization_id = p_org_id AND code = '32' LIMIT 1;
    SELECT id INTO v_cash_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1231' LIMIT 1;
    SELECT id INTO v_sales_id FROM public.accounts WHERE organization_id = p_org_id AND code = '411' LIMIT 1;
    SELECT id INTO v_cust_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1;
    SELECT id INTO v_cogs_id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1;
    SELECT id INTO v_inv_id FROM public.accounts WHERE organization_id = p_org_id AND code = '10302' LIMIT 1;
    SELECT id INTO v_vat_id FROM public.accounts WHERE organization_id = p_org_id AND code = '2231' LIMIT 1;
    SELECT id INTO v_supp_id FROM public.accounts WHERE organization_id = p_org_id AND code = '201' LIMIT 1;
    SELECT id INTO v_vat_in_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1241' LIMIT 1;
    SELECT id INTO v_disc_id FROM public.accounts WHERE organization_id = p_org_id AND code = '4102' LIMIT 1;
    SELECT id INTO v_wht_pay_id FROM public.accounts WHERE organization_id = p_org_id AND code = '2232' LIMIT 1;
    SELECT id INTO v_payroll_tax_id FROM public.accounts WHERE organization_id = p_org_id AND code = '2233' LIMIT 1;
    SELECT id INTO v_wht_rec_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1242' LIMIT 1;
    SELECT id INTO v_sal_exp_id FROM public.accounts WHERE organization_id = p_org_id AND code = '531' LIMIT 1;
    SELECT id INTO v_bonus_id FROM public.accounts WHERE organization_id = p_org_id AND code = '5312' LIMIT 1;
    SELECT id INTO v_ded_id FROM public.accounts WHERE organization_id = p_org_id AND code = '422' LIMIT 1;
    SELECT id INTO v_adv_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1223' LIMIT 1;
    
    UPDATE public.company_settings 
    SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object(
        'RETAINED_EARNINGS', COALESCE(v_retained_id, (account_mappings->>'RETAINED_EARNINGS')::uuid),
        'CASH', COALESCE(v_cash_id, (account_mappings->>'CASH')::uuid),
        'SALES_REVENUE', COALESCE(v_sales_id, (account_mappings->>'SALES_REVENUE')::uuid),
        'CUSTOMERS', COALESCE(v_cust_id, (account_mappings->>'CUSTOMERS')::uuid),
        'COGS', COALESCE(v_cogs_id, (account_mappings->>'COGS')::uuid),
        'INVENTORY_FINISHED_GOODS', COALESCE(v_inv_id, (account_mappings->>'INVENTORY_FINISHED_GOODS')::uuid),
        'VAT', COALESCE(v_vat_id, (account_mappings->>'VAT')::uuid),
        'SUPPLIERS', COALESCE(v_supp_id, (account_mappings->>'SUPPLIERS')::uuid),
        'VAT_INPUT', COALESCE(v_vat_in_id, (account_mappings->>'VAT_INPUT')::uuid),
        'SALES_DISCOUNT', COALESCE(v_disc_id, (account_mappings->>'SALES_DISCOUNT')::uuid),
        'WHT_PAYABLE', v_wht_pay_id,
        'PAYROLL_TAX', v_payroll_tax_id,
        'WHT_RECEIVABLE', v_wht_rec_id,
        'SALARIES_EXPENSE', v_sal_exp_id,
        'EMPLOYEE_BONUSES', v_bonus_id,
        'EMPLOYEE_DEDUCTIONS', v_ded_id,
        'EMPLOYEE_ADVANCES', v_adv_id
    )
    WHERE organization_id = p_org_id;

    UPDATE public.accounts a SET parent_id = p.id FROM coa_temp t JOIN public.accounts p ON p.organization_id = p_org_id AND p.code = t.parent_code
    WHERE a.organization_id = p_org_id AND a.code = t.code;

    RETURN '✅ تم التأسيس بنجاح.';
END; $$;

-- ================================================================
-- 29.7 الدالة الشاملة لإنشاء عميل جديد (SaaS Global Creator)
-- ================================================================ 
CREATE OR REPLACE FUNCTION public.create_new_client_v2(
    p_name text,
    p_email text,
    p_activity_type text DEFAULT 'commercial',
    p_vat_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    -- 1. إنشاء المنظمة
    INSERT INTO public.organizations (name, email, vat_number, is_active)
    VALUES (p_name, p_email, p_vat_number, true)
    RETURNING id INTO v_org_id;

    -- 2. تهيئة دليل الحسابات والإعدادات (تشمل حساب الضريبة 2233 والوصف)
    PERFORM public.initialize_egyptian_coa(v_org_id, p_activity_type);

    RETURN v_org_id;
END; $$;

-- ================================================================
-- 29.8 دالة ربط مدير بشركة (Admin Linker)
-- ================================================================ 
CREATE OR REPLACE FUNCTION public.assign_admin_to_org(
    p_email text,
    p_org_id uuid
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id uuid;
BEGIN
    -- 1. البحث عن المعرف الخاص بالبريد في جدول الحماية
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

    IF v_user_id IS NULL THEN RAISE EXCEPTION 'البريد الإلكتروني غير مسجل في النظام.'; END IF;

    -- 2. تحديث البروفايل وربطه بالشركة كمدير
    UPDATE public.profiles 
    SET organization_id = p_org_id, role = 'admin', is_active = true 
    WHERE id = v_user_id;

    RETURN '✅ تم ربط المستخدم بالشركة بنجاح.';
END; $$;

-- ================================================================
-- 30. دالة إصلاح وتنشيط هيكل بيانات الـ SaaS
-- ================================================================ 
DROP FUNCTION IF EXISTS public.refresh_saas_schema() CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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
DROP FUNCTION IF EXISTS public.repair_missing_accounts() CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
DROP FUNCTION IF EXISTS public.repair_missing_accounts(uuid) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
CREATE OR REPLACE FUNCTION public.repair_missing_accounts(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid; v_count int := 0;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    
    -- التأكد من وجود الحسابات القياسية (أمثلة)
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1231' AND organization_id = v_target_org) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('1231', 'الصندوق الرئيسي', 'ASSET', v_target_org);
        v_count := v_count + 1;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '411' AND organization_id = v_target_org) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('411', 'إيرادات المبيعات', 'REVENUE', v_target_org);
        v_count := v_count + 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '511' AND organization_id = v_target_org) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('511', 'تكلفة المبيعات', 'EXPENSE', v_target_org);
        v_count := v_count + 1;
    END IF;

    RETURN 'تم فحص الدليل وإضافة (' || v_count || ') حساباً مفقوداً بنجاح ✅';
END; $$;

-- ب. تنظيف الأصناف والبيانات المحذوفة نهائياً (Purge Deleted Items)
-- تقوم بمسح السجلات التي تحمل علامة deleted_at لتوفير المساحة وتسريع البرنامج 
DROP FUNCTION IF EXISTS public.purge_deleted_records() CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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
DROP FUNCTION IF EXISTS public.recalculate_all_system_balances(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_all_system_balances() CASCADE;
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; r record;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'لم يتم العثور على معرف المنظمة. يرجى تسجيل الدخول.'; END IF;

    -- 1. إعادة احتساب المخزون
    PERFORM public.recalculate_stock_rpc(v_org_id);

    -- 2. إعادة احتساب الأرصدة المالية مع ضمان عزل المنظمة
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

    RETURN 'تمت إعادة مطابقة الأرصدة المالية والمخزنية بنجاح ✅';
END; $$;

-- ================================================================
-- 32. دالة إغلاق السنة المالية (Close Financial Year)
-- ================================================================ 
DROP FUNCTION IF EXISTS public.close_financial_year(integer, date) CASCADE; -- استخدام CASCADE لضمان حذف أي توقيعات سابقة
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

-- جلب أرصدة كافة الحسابات (إجمالي مدين - إجمالي دائن) لمنظمة معينة
CREATE OR REPLACE FUNCTION public.get_all_account_balances(p_org_id uuid)
RETURNS TABLE (account_id uuid, balance numeric) 
LANGUAGE plpgsql 
SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id as account_id,
        COALESCE(SUM(jl.debit - jl.credit), 0) as balance
    FROM public.accounts a
    LEFT JOIN public.journal_lines jl ON a.id = jl.account_id
    LEFT JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE a.organization_id = p_org_id
      AND (je.status = 'posted' OR je.id IS NULL)
      AND a.deleted_at IS NULL
    GROUP BY a.id;
END; $$;

-- ================================================================
-- 29.7 الدالة الشاملة لإنشاء عميل جديد (SaaS Global Creator)
-- ================================================================ 
CREATE OR REPLACE FUNCTION public.create_new_client_v2(
    p_name text,
    p_email text,
    p_activity_type text DEFAULT 'commercial',
    p_vat_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    -- 1. إنشاء المنظمة
    INSERT INTO public.organizations (name, email, vat_number, is_active)
    VALUES (p_name, p_email, p_vat_number, true)
    RETURNING id INTO v_org_id;

    -- 2. تهيئة دليل الحسابات والإعدادات (تشمل حساب الضريبة 2233 والوصف)
    PERFORM public.initialize_egyptian_coa(v_org_id, p_activity_type);

    RETURN v_org_id;
END; $$;
