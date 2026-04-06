-- 🛠️ ملف نشر جميع دوال النظام (Deploy All Functions) - النسخة الاحترافية الموحدة
-- 🏆 النسخة الذهبية الموحدة (Golden Deploy Script) - الإصدار 3.1 (نسخة التطهير الشامل)
-- تم إصلاح أخطاء الصيغة (Syntax)، توحيد توقيعات الـ RPC، وتأمين الصلاحيات لفتح كافة موديولات النظام.

-- ================================================================
-- 0. التأكد من وجود الأدوار الأساسية (Core Roles Seeding)
-- هذه الخطوة تضمن وجود الأدوار المطلوبة قبل أي دالة تستخدمها.
-- ================================================================
INSERT INTO public.roles (name, description) VALUES
('super_admin', 'المدير العام للمنصة (وصول كامل)'),
('admin', 'مسؤول النظام (وصول كامل للمنظمة)'),
('accountant', 'محاسب (صلاحيات محاسبية)'),
('manager', 'مدير قسم (إدارة العمليات)'),
('sales', 'مندوب مبيعات (إدارة المبيعات)'),
('purchases', 'مسؤول مشتريات (إدارة المشتريات)'),
('viewer', 'مشاهد فقط (وصول للقراءة)')
ON CONFLICT (name) DO NOTHING;

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
    v_total_cost numeric := 0; v_item_cost numeric; v_exchange_rate numeric; v_modifier_json jsonb; v_bom_item record;
    v_total_amount_base numeric; v_paid_amount_base numeric; v_subtotal_base numeric; v_tax_amount_base numeric; v_discount_amount_base numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id; -- جلب بيانات الفاتورة
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    v_org_id := public.get_my_org(); -- 🔒 درع الحماية: فرض مؤسسة المستخدم الحالي
    IF v_invoice.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: لا يمكنك اعتماد فاتورة لا تنتمي لمؤسستك'; 
    END IF;

    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_discount_acc_id FROM public.accounts WHERE code = '413' AND organization_id = v_org_id LIMIT 1; -- خصم مسموح به
    
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_sales_acc_id IS NULL OR v_customer_acc_id IS NULL THEN RAISE EXCEPTION 'حسابات المبيعات أو العملاء غير معرّفة'; END IF;
    IF v_cogs_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN RAISE EXCEPTION 'حسابات المخزون أو تكلفة المبيعات غير موجودة'; END IF;
    IF v_discount_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الخصم المسموح به (413) غير موجود في الدليل المحاسبي.'; END IF;


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
        -- معالجة خصم مكونات الإضافات (Modifiers)
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

    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_paid_amount_base := COALESCE(v_invoice.paid_amount, 0) * v_exchange_rate;
    v_subtotal_base := v_invoice.subtotal * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_discount_amount_base := COALESCE(v_invoice.discount_amount, 0) * v_exchange_rate;

    -- تسجيل القيد المحاسبي للفاتورة
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
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
        (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات', v_org_id),
        (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id);
    END IF;

    UPDATE public.invoices SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ب. اعتماد فاتورة المشتريات (Purchase Invoice)
DROP FUNCTION IF EXISTS public.approve_purchase_invoice(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
    v_current_stock numeric; v_current_avg_cost numeric; v_new_avg_cost numeric; v_exchange_rate numeric; v_item_price_base numeric;
    v_total_amount_base numeric; v_tax_amount_base numeric; v_net_amount_base numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_invoice.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: لا يمكنك اعتماد فاتورة شراء لا تنتمي لمؤسستك'; 
    END IF;

    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1; -- ضريبة مدخلات
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1;

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة'; END IF;

    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        v_item_price_base := v_item.price * v_exchange_rate;
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

    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_net_amount_base := v_total_amount_base - v_tax_amount_base;

    -- تسجيل القيد المحاسبي للمشتريات
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات', v_org_id);
    IF v_tax_amount_base > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات', v_org_id); 
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد', v_org_id);

    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ج. اعتماد سند القبض (Receipt Voucher)
DROP FUNCTION IF EXISTS public.approve_receipt_voucher(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org(); -- 🔒 فرض العزل التام
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود أو لا تملك صلاحية الوصول له'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id),
    (v_journal_id, p_credit_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;

-- د. اعتماد سند الصرف (Payment Voucher)
DROP FUNCTION IF EXISTS public.approve_payment_voucher(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org(); -- 🔒 فرض العزل التام
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود أو لا تملك صلاحية الوصول له'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id),
    (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);

    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;

-- هـ. اعتماد مرتجع المبيعات (Sales Return) مع معالجة التكلفة والمخزون
DROP FUNCTION IF EXISTS public.approve_sales_return(uuid) CASCADE;
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
    
    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_return.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: محاولة تلاعب بالبيانات'; 
    END IF;

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
DROP FUNCTION IF EXISTS public.approve_purchase_return(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_acc_inv uuid; v_acc_vat uuid; v_acc_supp uuid;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF v_return.status = 'posted' THEN RETURN; END IF;

    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_return.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: محاولة تلاعب بالبيانات'; 
    END IF;

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
DROP FUNCTION IF EXISTS public.approve_credit_note(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid;
    v_acc_allowance uuid; v_acc_vat uuid; v_acc_cust uuid;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    IF v_note.status = 'posted' THEN RETURN; END IF;

    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_note.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: محاولة تلاعب بالبيانات'; 
    END IF;

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
DROP FUNCTION IF EXISTS public.approve_debit_note(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid;
    v_acc_supp uuid; v_acc_cogs uuid; v_acc_vat uuid;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    IF v_note.status = 'posted' THEN RETURN; END IF;

    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_note.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: محاولة تلاعب بالبيانات'; 
    END IF;

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
DROP FUNCTION IF EXISTS public.open_table_session(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.open_table_session(p_table_id uuid, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_session_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    IF EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id = p_table_id AND status != 'AVAILABLE' AND organization_id = v_org_id) THEN RAISE EXCEPTION 'الطاولة غير متاحة حالياً'; END IF;
    INSERT INTO public.table_sessions (table_id, opened_by, status, opened_at, organization_id) VALUES (p_table_id, p_user_id, 'OPEN', now(), v_org_id) RETURNING id INTO v_session_id;
    UPDATE public.restaurant_tables SET status = 'OCCUPIED' WHERE id = p_table_id;
    RETURN v_session_id;
END; $$;

-- ب. إنشاء طلب مطعم متكامل
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, text, text, jsonb, uuid, uuid, jsonb) CASCADE;
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order_id uuid; v_item jsonb; v_order_num text; v_order_item_id uuid; v_tax_rate numeric; v_subtotal numeric := 0;
DECLARE v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT (vat_rate) INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1;
    IF v_tax_rate IS NULL THEN v_tax_rate := 0.14; END IF; -- قيمة افتراضية للضريبة
    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));
    INSERT INTO public.orders (session_id, created_by, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, p_warehouse_id) RETURNING id INTO v_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total_price, unit_cost, notes, organization_id)
        VALUES (v_order_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::numeric, (v_item->>'unitPrice')::numeric, ((v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric), COALESCE((v_item->>'unitCost')::numeric, 0), v_item->>'notes', v_org_id) RETURNING id INTO v_order_item_id;
        v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric);
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP; -- تم تصحيح حساب الضريبة والإجمالي
    UPDATE public.orders SET subtotal = v_subtotal, total_tax = v_subtotal * v_tax_rate, grand_total = v_subtotal + (v_subtotal * v_tax_rate) WHERE id = v_order_id;
    RETURN v_order_id;
END; $$;

-- ================================================================
-- 3. دوال المخزون والمحاسبة (Inventory & Accounting)
-- ================================================================

-- أ. إعادة احتساب أرصدة المخزون بالكامل
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc(uuid) CASCADE; -- Keep this DROP
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC; v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org()); -- 🔒 استخدام p_org_id إذا تم تمريره، وإلا ففرض عزل البيانات للمؤسسة الحالية فقط
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
DROP FUNCTION IF EXISTS public.create_journal_entry(date, text, text, jsonb, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.create_journal_entry(entry_date date, description text, reference text, entries jsonb, status text DEFAULT 'posted', org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_entry_id uuid; entry_record jsonb; v_debit numeric := 0; v_credit numeric := 0;
BEGIN
    org_id := COALESCE(org_id, public.get_my_org()); -- 🔒 فرض المؤسسة الحالية
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
DROP FUNCTION IF EXISTS public.run_payroll_rpc(integer, integer, date, uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.run_payroll_rpc(int, int, date, uuid, jsonb, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(p_month integer, p_year integer, p_date date, p_treasury_account_id uuid, p_items jsonb) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; v_total_additions numeric := 0; v_total_deductions numeric := 0; v_total_advances numeric := 0; v_total_net numeric := 0; v_item jsonb; v_je_id uuid;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; v_advances_acc_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    -- جلب الحسابات بناءً على الأكواد القياسية من الدليل المصري
    SELECT id INTO v_salaries_acc_id FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1; -- الرواتب والأجور
    SELECT id INTO v_bonuses_acc_id FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id LIMIT 1; -- مكافآت وحوافز
    SELECT id INTO v_deductions_acc_id FROM public.accounts WHERE code = '422' AND organization_id = v_org_id LIMIT 1; -- إيراد خصومات وجزاءات الموظفين
    SELECT id INTO v_advances_acc_id FROM public.accounts WHERE code = '1223' AND organization_id = v_org_id LIMIT 1; -- سلف الموظفين

    IF v_salaries_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الرواتب (531) غير موجود في الدليل المحاسبي.'; END IF;
    IF v_bonuses_acc_id IS NULL THEN RAISE EXCEPTION 'حساب المكافآت والحوافز (5312) غير موجود في الدليل المحاسبي.'; END IF;
    IF v_deductions_acc_id IS NULL THEN RAISE EXCEPTION 'حساب إيراد الخصومات والجزاءات (422) غير موجود في الدليل المحاسبي.'; END IF;
    IF v_advances_acc_id IS NULL THEN RAISE EXCEPTION 'حساب سلف الموظفين (1223) غير موجود في الدليل المحاسبي.'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_total_gross := v_total_gross + (v_item->>'gross_salary')::numeric;
        v_total_additions := v_total_additions + (v_item->>'additions')::numeric;
        v_total_deductions := v_total_deductions + (v_item->>'other_deductions')::numeric;
        v_total_advances := v_total_advances + (v_item->>'advances_deducted')::numeric;
        v_total_net := v_total_net + (v_item->>'net_salary')::numeric;
    END LOOP;

    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    -- إدراج بنود الرواتب التفصيلية
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.payroll_items (
            payroll_id, employee_id, 
            gross_salary, additions, advances_deducted, other_deductions, net_salary,
            organization_id
        ) VALUES (
            v_payroll_id, (v_item->>'employee_id')::uuid,
            (v_item->>'gross_salary')::numeric,
            (v_item->>'additions')::numeric,
            (v_item->>'advances_deducted')::numeric,
            (v_item->>'other_deductions')::numeric,
            (v_item->>'net_salary')::numeric,
            v_org_id
        );
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year || '-' || floor(random()*1000)::text, 'posted', v_org_id, true) RETURNING id INTO v_je_id;

    IF v_total_gross > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF;
    IF v_total_advances > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_net > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_account_id, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;
END; $$;

-- ================================================================
-- 5. دوال الأصول والعمولات (Assets & Commissions)
-- ================================================================

-- أ. تشغيل الإهلاك الشهري (Run Depreciation)
DROP FUNCTION IF EXISTS public.run_period_depreciation(date, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.run_period_depreciation(p_date date, p_org_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_asset record; v_monthly_dep numeric; v_journal_id uuid; v_processed int := 0; v_skipped int := 0;
    v_dep_exp_acc_id uuid; v_acc_dep_acc_id uuid;
BEGIN
    p_org_id := public.get_my_org();

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
DROP FUNCTION IF EXISTS public.calculate_sales_commission(uuid, date, date, numeric) CASCADE;
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
DROP FUNCTION IF EXISTS public.get_restaurant_sales_report(text, text) CASCADE;
CREATE OR REPLACE FUNCTION public.get_restaurant_sales_report(p_start_date text, p_end_date text) 
RETURNS TABLE(item_name text, category_name text, quantity numeric, total_sales numeric) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
  v_org_id := public.get_my_org();
  RETURN QUERY
  SELECT p.name::text, COALESCE(ic.name, 'غير مصنف')::text, COALESCE(SUM(oi.quantity), 0)::numeric, COALESCE(SUM(oi.total_price), 0)::numeric
  FROM public.order_items oi 
  JOIN public.orders o ON oi.order_id = o.id 
  JOIN public.products p ON oi.product_id = p.id
  LEFT JOIN public.item_categories ic ON p.category_id = ic.id -- Changed from menu_categories to item_categories
  WHERE o.organization_id = v_org_id
  AND o.status IN ('CONFIRMED', 'COMPLETED') 
  AND o.created_at >= p_start_date::timestamptz 
  AND o.created_at <= p_end_date::timestamptz
  GROUP BY 1, 2 ORDER BY total_sales DESC;
END; $$;

-- د. إضافة منتج مع رصيد افتتاحي (Add Product with OB)
DROP FUNCTION IF EXISTS public.add_product_with_opening_balance(text, text, numeric, numeric, numeric, uuid, text, uuid, uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.add_product_with_opening_balance(
    p_name text, p_sku text, p_sales_price numeric, p_purchase_price numeric, p_stock numeric, 
    p_org_id uuid, p_item_type text DEFAULT 'STOCK', p_inv_acc uuid DEFAULT NULL, p_cogs_acc uuid DEFAULT NULL, p_sales_acc uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_product_id UUID; v_inv_id UUID; v_ob_acc UUID; v_je_id UUID;
BEGIN
    INSERT INTO public.products (name, sku, sales_price, purchase_price, stock, organization_id, item_type, product_type, inventory_account_id, cogs_account_id, sales_account_id)
    VALUES (p_name, p_sku, p_sales_price, p_purchase_price, p_stock, COALESCE(p_org_id, public.get_my_org()), p_item_type, p_item_type, p_inv_acc, p_cogs_acc, p_sales_acc)
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
-- 6. دوال التقارير والرقابة (Reporting & SaaS Control)
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
DROP FUNCTION IF EXISTS public.get_dashboard_stats() CASCADE;
CREATE OR REPLACE FUNCTION public.get_dashboard_stats() RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$ -- تم تحديثها لتشمل المزيد من الإحصائيات
DECLARE v_sales numeric; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT COALESCE(SUM(subtotal), 0) INTO v_sales FROM public.invoices WHERE organization_id = v_org_id AND status != 'draft';
    RETURN json_build_object('monthSales', v_sales);
END; $$;

-- ج. جلب العملاء المتجاوزين لحد الائتمان
-- حذف كافة النسخ السابقة بجميع أشكالها لضمان عدم التعارض
DROP FUNCTION IF EXISTS public.get_over_limit_customers() CASCADE;
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_over_limit_customers(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (id UUID, name TEXT, phone TEXT, total_debt NUMERIC, credit_limit NUMERIC) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY 
    SELECT c.id, c.name, c.phone, COALESCE(c.balance, 0), COALESCE(c.credit_limit, 0)
    FROM public.customers c 
    WHERE c.organization_id = COALESCE(p_org_id, public.get_my_org())
      AND COALESCE(c.balance, 0) > COALESCE(c.credit_limit, 0)
      AND COALESCE(c.credit_limit, 0) > 0;
END; $$;

-- د. جلب النسب المالية التاريخية
DROP FUNCTION IF EXISTS public.get_historical_ratios() CASCADE; -- حذف النسخة بدون بارامتر
DROP FUNCTION IF EXISTS public.get_historical_ratios(uuid) CASCADE; -- حذف النسخة القديمة ببارامتر
CREATE OR REPLACE FUNCTION public.get_historical_ratios(org_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profit jsonb; v_current_org_id uuid;
BEGIN
    v_current_org_id := COALESCE(org_id, public.get_my_org());
    SELECT jsonb_agg(jsonb_build_object('name', month_key, 'ربحية', margin)) INTO v_profit FROM (
        SELECT to_char(je.transaction_date, 'YYYY-MM') as month_key,
            CASE WHEN SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END) > 0 
                 THEN ROUND(((SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END) - SUM(CASE WHEN a.code LIKE '5%' THEN jl.debit - jl.credit ELSE 0 END)) / SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END)) * 100, 2)
                 ELSE 0 END as margin
        FROM public.journal_entries je JOIN public.journal_lines jl ON je.id = jl.journal_entry_id JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_current_org_id AND je.status = 'posted' AND je.transaction_date >= (date_trunc('month', now()) - interval '6 months')::date
        GROUP BY 1 ORDER BY 1
    ) sub;
    RETURN jsonb_build_object('profitabilityData', COALESCE(v_profit, '[]'::jsonb));
END; $$;

-- هـ. دالة التحقق من حالة الاشتراك (حل خطأ 404)
DROP FUNCTION IF EXISTS public.check_subscription_status() CASCADE;
CREATE OR REPLACE FUNCTION public.check_subscription_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
    v_org record;
BEGIN
    v_org_id := public.get_my_org();
    SELECT is_active, subscription_expiry INTO v_org 
    FROM public.organizations WHERE id = v_org_id;
    
    RETURN jsonb_build_object(
        'is_active', COALESCE(v_org.is_active, false),
        'subscription_expiry', v_org.subscription_expiry,
        'is_expired', CASE WHEN v_org.subscription_expiry IS NOT NULL AND v_org.subscription_expiry < CURRENT_DATE THEN true ELSE false END
    );
END; $$;

-- ================================================================
-- 7. دالة جلب إحصائيات المنصة الشاملة (للسوبر أدمن فقط)
-- ================================================================
DROP FUNCTION IF EXISTS get_admin_platform_metrics() CASCADE;
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
-- 8. دالة إصلاح وتنشيط هيكل بيانات الـ SaaS
-- ================================================================
DROP FUNCTION IF EXISTS public.refresh_saas_schema() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_saas_schema(uuid) CASCADE;
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
-- 9. موديول التصنيع (Manufacturing)
-- ================================================================
DROP FUNCTION IF EXISTS public.complete_work_order(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.complete_work_order(p_wo_id uuid) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_wo record; v_bom_item record; v_cost_item record; v_journal_id uuid; v_org_id uuid;
    v_total_rm_cost numeric := 0; v_total_add_cost numeric := 0; v_total_final_cost numeric := 0;
    v_rm_acc_id uuid; v_fg_acc_id uuid; v_labor_acc_id uuid; v_overhead_acc_id uuid;
    v_current_stock numeric; v_current_wac numeric; v_new_wac numeric;
BEGIN
    -- 1. جلب بيانات أمر التشغيل
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_wo_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر التشغيل غير موجود'; END IF;
    IF v_wo.status = 'completed' THEN RAISE EXCEPTION 'أمر التشغيل مكتمل ومرحل بالفعل'; END IF;
    
    v_org_id := v_wo.organization_id;

    -- 2. معالجة المواد الخام (الأولوية للاستهلاك الفعلي المسجل، ثم الـ BOM كاحتياطي)
    FOR v_bom_item IN (
        SELECT um.product_id as raw_material_id, um.actual_quantity as total_req, p.weighted_average_cost
        FROM public.work_order_material_usage um
        JOIN public.products p ON um.product_id = p.id
        WHERE um.work_order_id = p_wo_id
        UNION ALL
        SELECT b.raw_material_id, b.quantity_required * v_wo.quantity, p.weighted_average_cost
        FROM public.bill_of_materials b
        JOIN public.products p ON b.raw_material_id = p.id
        WHERE b.product_id = v_wo.product_id AND b.organization_id = v_org_id
        AND NOT EXISTS (SELECT 1 FROM public.work_order_material_usage WHERE work_order_id = p_wo_id)
    ) LOOP
        v_total_rm_cost := v_total_rm_cost + (COALESCE(v_bom_item.weighted_average_cost, 0) * v_bom_item.total_req);
        
        -- خصم المواد الخام من المخزن
        UPDATE public.products 
        SET stock = stock - v_bom_item.total_req,
            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_wo.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_wo.warehouse_id::text)::numeric, 0) - v_bom_item.total_req))
        WHERE id = v_bom_item.raw_material_id;
    END LOOP;

    -- 3. حساب التكاليف الإضافية (العمالة والمصاريف)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_add_cost 
    FROM public.work_order_costs WHERE work_order_id = p_wo_id;

    v_total_final_cost := v_total_rm_cost + v_total_add_cost;

    -- 4. إضافة المنتج التام للمخزن وتحديث متوسط التكلفة
    SELECT stock, weighted_average_cost INTO v_current_stock, v_current_wac 
    FROM public.products WHERE id = v_wo.product_id;
    
    v_current_stock := COALESCE(v_current_stock, 0);
    v_current_wac := COALESCE(v_current_wac, 0);

    IF (v_current_stock + v_wo.quantity) > 0 THEN
        v_new_wac := ((v_current_stock * v_current_wac) + v_total_final_cost) / (v_current_stock + v_wo.quantity);
    ELSE
        v_new_wac := v_total_final_cost / v_wo.quantity;
    END IF;

    UPDATE public.products 
    SET stock = stock + v_wo.quantity,
        weighted_average_cost = v_new_wac,
        cost = v_new_wac,
        warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_wo.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_wo.warehouse_id::text)::numeric, 0) + v_wo.quantity))
    WHERE id = v_wo.product_id;

    -- 5. الترحيل المحاسبي (القيد المحاسبي)
    SELECT id INTO v_fg_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1; -- مخزون منتج تام
    SELECT id INTO v_rm_acc_id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1; -- مخزون مواد خام
    SELECT id INTO v_labor_acc_id FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1; -- أجور ومرتبات (توزيع تكاليف)
    SELECT id INTO v_overhead_acc_id FROM public.accounts WHERE code = '53' AND organization_id = v_org_id LIMIT 1; -- مصروفات تشغيل

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_wo.end_date, 'تكاليف تصنيع أمر رقم ' || v_wo.order_number, v_wo.order_number, 'posted', v_org_id, p_wo_id, 'work_order', true) 
    RETURNING id INTO v_journal_id;

    -- المدين: مخزون المنتج التام (إجمالي التكلفة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_fg_acc_id, v_total_final_cost, 0, 'إثبات منتج تام - أمر ' || v_wo.order_number, v_org_id);

    -- الدائن: مخزون المواد الخام (تكلفة المواد)
    IF v_total_rm_cost > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_rm_acc_id, 0, v_total_rm_cost, 'تحويل مواد خام للتصنيع', v_org_id);
    END IF;

    -- الدائن: حسابات التكاليف الإضافية
    FOR v_cost_item IN SELECT cost_type, SUM(amount) as total FROM public.work_order_costs WHERE work_order_id = p_wo_id GROUP BY cost_type LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (
            v_journal_id, 
            CASE WHEN v_cost_item.cost_type = 'labor' THEN v_labor_acc_id ELSE v_overhead_acc_id END, 
            0, 
            v_cost_item.total, 
            'تحميل تكاليف ' || v_cost_item.cost_type || ' على الإنتاج', 
            v_org_id
        );
    END LOOP;

    -- 6. تحديث حالة الأمر
    UPDATE public.work_orders SET status = 'completed' WHERE id = p_wo_id;

    RETURN jsonb_build_object(
        'success', true,
        'journal_id', v_journal_id,
        'total_cost', v_total_final_cost,
        'material_cost', v_total_rm_cost,
        'additional_cost', v_total_add_cost
    );

EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_system_error(SQLERRM, SQLSTATE, jsonb_build_object('wo_id', p_wo_id), 'complete_work_order');
    RAISE;
END; $$;

-- ================================================================
-- 10. الصيانة والتنظيف وتحديث الأرصدة (Maintenance & Balance Updates)
-- ================================================================

DROP FUNCTION IF EXISTS public.purge_deleted_records() CASCADE;
DROP FUNCTION IF EXISTS public.purge_deleted_records(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.purge_deleted_records(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    DELETE FROM public.products WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.accounts WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.customers WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.suppliers WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    
    RETURN 'تم تنظيف كافة البيانات المحذوفة نهائياً بنجاح ✅';
END; $$;

-- تحديث رصيد العميل الواحد (تم إضافة p_org_id لضمان العزل التام)
DROP FUNCTION IF EXISTS public.update_single_customer_balance(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.update_single_customer_balance(p_customer_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_balance numeric := 0; v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    -- فواتير (مدين) - سندات (دائن) - مرتجعات (دائن) - إشعارات دائنة (دائن)
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_balance FROM public.invoices WHERE customer_id = p_customer_id AND organization_id = v_org_id AND status != 'draft';
    SELECT v_balance - COALESCE((SELECT SUM(amount) FROM public.receipt_vouchers WHERE customer_id = p_customer_id AND organization_id = v_org_id), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.sales_returns WHERE customer_id = p_customer_id AND organization_id = v_org_id AND status = 'posted'), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.credit_notes WHERE customer_id = p_customer_id AND organization_id = v_org_id AND status = 'posted'), 0) INTO v_balance;

    UPDATE public.customers SET balance = v_balance WHERE id = p_customer_id AND organization_id = v_org_id;
END; $$;

-- تحديث رصيد المورد الواحد (تم إضافة p_org_id)
DROP FUNCTION IF EXISTS public.update_single_supplier_balance(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.update_single_supplier_balance(p_supplier_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_balance numeric := 0; v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    -- فواتير (دائن) - سندات (مدين) - مرتجعات (مدين) - إشعارات مدينة (مدين)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_balance FROM public.purchase_invoices WHERE supplier_id = p_supplier_id AND organization_id = v_org_id AND status != 'draft';
    SELECT v_balance - COALESCE((SELECT SUM(amount) FROM public.payment_vouchers WHERE supplier_id = p_supplier_id AND organization_id = v_org_id), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.purchase_returns WHERE supplier_id = p_supplier_id AND organization_id = v_org_id AND status = 'posted'), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.debit_notes WHERE supplier_id = p_supplier_id AND organization_id = v_org_id AND status = 'posted'), 0) INTO v_balance;

    UPDATE public.suppliers SET balance = v_balance WHERE id = p_supplier_id AND organization_id = v_org_id;
END; $$;

-- دالة إعادة مطابقة جميع أرصدة النظام (المخزون، العملاء، الموردين، الحسابات)
DROP FUNCTION IF EXISTS public.recalculate_all_system_balances() CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_all_system_balances(uuid) CASCADE; -- إضافة هذا السطر لحذف النسخة القديمة التي قد تكون موجودة
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_current_org_id uuid; r record;
BEGIN
    v_current_org_id := COALESCE(p_org_id, public.get_my_org()); -- استخدام p_org_id إذا تم تمريره، وإلا ففرض عزل البيانات للمؤسسة الحالية فقط
    
    -- 1. تحديث أرصدة المخازن
    PERFORM public.recalculate_stock_rpc(v_current_org_id);
    
    -- 2. تحديث أرصدة العملاء
    FOR r IN SELECT id FROM public.customers WHERE organization_id = v_current_org_id LOOP
        PERFORM public.update_single_customer_balance(r.id, v_current_org_id);
    END LOOP;
    
    -- 3. تحديث أرصدة الموردين
    FOR r IN SELECT id FROM public.suppliers WHERE organization_id = v_current_org_id LOOP
        PERFORM public.update_single_supplier_balance(r.id, v_current_org_id);
    END LOOP;

    -- 4. تحديث رصيد الحسابات (Ledger Balances)
    UPDATE public.accounts a
    SET balance = (SELECT COALESCE(SUM(jl.debit - jl.credit), 0) FROM public.journal_lines jl JOIN public.journal_entries je ON jl.journal_entry_id = je.id WHERE jl.account_id = a.id AND je.status = 'posted' AND je.organization_id = v_current_org_id)
    WHERE a.organization_id = v_current_org_id;

    RETURN 'تمت إعادة مطابقة الأرصدة المالية والمخزنية بنجاح ✅';
END; $$;

-- د. دالة تحديث كاش النظام (Refresh Supabase Schema Cache)
-- هذه الدالة ضرورية لحل مشكلة "Function not found" بعد تحديث الدوال
DROP FUNCTION IF EXISTS public.refresh_saas_schema() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_saas_schema(uuid) CASCADE; -- إضافة هذا السطر لحذف النسخة القديمة التي قد تكون موجودة
CREATE OR REPLACE FUNCTION public.refresh_saas_schema()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- الأمر السحري لإعادة تحميل كاش الـ API (Schema Reload)
    -- هذا السطر هو الذي يحل مشكلة الـ Schema Cache التي واجهتك
    EXECUTE 'NOTIFY pgrst, ''reload config''';
    
    RETURN 'تم تحديث هيكل البيانات وتنشيط الكاش بنجاح ✅';
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

-- ================================================================
-- 33. دالة تحليل تكاليف التصنيع (Manufacturing Cost Analysis)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_manufacturing_analysis(p_org_id uuid, p_start_date date, p_end_date date)
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
    WITH bom_summary AS (
        -- حساب التكلفة المعيارية للمواد بناءً على الـ BOM والأسعار الحالية
        SELECT 
            bom.product_id,
            SUM(bom.quantity_required * COALESCE(p.weighted_average_cost, p.purchase_price, p.cost, 0)) as std_unit_cost
        FROM public.bill_of_materials bom
        JOIN public.products p ON bom.raw_material_id = p.id
        WHERE bom.organization_id = p_org_id
        GROUP BY bom.product_id
    ),
    actual_additional AS (
        -- جمع التكاليف الإضافية الفعلية (عمالة ومصاريف) لكل أمر تشغيل
        SELECT 
            work_order_id,
            SUM(amount) as add_cost
        FROM public.work_order_costs
        WHERE organization_id = p_org_id
        GROUP BY work_order_id
    ),
    actual_usage AS (
        -- حساب تكلفة الاستهلاك الفعلي للمواد والهالك
        SELECT 
            work_order_id,
            SUM(actual_quantity * COALESCE(p.weighted_average_cost, p.purchase_price, p.cost, 0)) as actual_mat_cost,
            SUM(wastage_quantity) as total_wastage
        FROM public.work_order_material_usage um
        JOIN public.products p ON um.product_id = p.id
        WHERE um.organization_id = p_org_id
        GROUP BY work_order_id
    )
    SELECT 
        wo.id,
        wo.order_number,
        pr.name as product_name,
        wo.quantity,
        wo.end_date,
        COALESCE(bs.std_unit_cost, 0) * wo.quantity as standard_cost,
        COALESCE(au.actual_mat_cost, COALESCE(bs.std_unit_cost, 0) * wo.quantity) + COALESCE(aa.add_cost, 0) as actual_cost,
        COALESCE(au.actual_mat_cost - (COALESCE(bs.std_unit_cost, 0) * wo.quantity), 0) as material_variance,
        COALESCE(au.total_wastage, 0) as wastage_qty,
        (COALESCE(au.actual_mat_cost, COALESCE(bs.std_unit_cost, 0) * wo.quantity) + COALESCE(aa.add_cost, 0)) - (COALESCE(bs.std_unit_cost, 0) * wo.quantity) as variance,
        CASE WHEN (COALESCE(bs.std_unit_cost, 0) * wo.quantity) > 0 
             THEN (((COALESCE(au.actual_mat_cost, COALESCE(bs.std_unit_cost, 0) * wo.quantity) + COALESCE(aa.add_cost, 0)) - (COALESCE(bs.std_unit_cost, 0) * wo.quantity)) / (COALESCE(bs.std_unit_cost, 0) * wo.quantity)) * 100 ELSE 0 END as variance_percent
    FROM public.work_orders wo
    JOIN public.products pr ON wo.product_id = pr.id
    LEFT JOIN bom_summary bs ON wo.product_id = bs.product_id
    LEFT JOIN actual_usage au ON wo.id = au.work_order_id
    LEFT JOIN actual_additional aa ON wo.id = aa.work_order_id
    WHERE wo.organization_id = p_org_id AND wo.status = 'completed' AND wo.end_date BETWEEN p_start_date AND p_end_date;
END; $$;

DROP FUNCTION IF EXISTS public.get_tree_balances(uuid, date) CASCADE;
CREATE OR REPLACE FUNCTION public.get_tree_balances(p_org_id uuid, p_as_of_date date DEFAULT CURRENT_DATE) 
RETURNS TABLE (account_id uuid, account_code text, account_name text, parent_id uuid, level_num int, total_debit numeric, total_credit numeric, net_balance numeric, is_group boolean) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    RETURN QUERY
    WITH RECURSIVE account_hierarchy AS (
        SELECT a.id, a.code, a.name, a.parent_id, a.is_group, 1 as level_num
        FROM public.accounts a WHERE a.organization_id = v_org_id AND a.parent_id IS NULL
        UNION ALL
        SELECT a.id, a.code, a.name, a.parent_id, a.is_group, ah.level_num + 1
        FROM public.accounts a JOIN account_hierarchy ah ON a.parent_id = ah.id
    ),
    ledger_sums AS (
        SELECT jl.account_id, SUM(jl.debit) as deb, SUM(jl.credit) as cre
        FROM public.journal_lines jl JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.organization_id = v_org_id AND je.status = 'posted' AND je.transaction_date <= p_as_of_date
        GROUP BY jl.account_id
    )
    SELECT 
        ah.id, ah.code, ah.name, ah.parent_id, ah.level_num,
        COALESCE((SELECT SUM(ls.deb) FROM ledger_sums ls WHERE ls.account_id IN (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE ah.code || '%')), 0),
        COALESCE((SELECT SUM(ls.cre) FROM ledger_sums ls WHERE ls.account_id IN (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE ah.code || '%')), 0),
        COALESCE((SELECT SUM(ls.deb - ls.cre) FROM ledger_sums ls WHERE ls.account_id IN (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE ah.code || '%')), 0),
        ah.is_group
    FROM account_hierarchy ah ORDER BY ah.code;
END; $$;

-- ربط الاسم القديم بالجديد للتوافق مع الـ Context
DROP FUNCTION IF EXISTS public.get_all_account_balances(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_all_account_balances(p_org_id uuid) 
RETURNS TABLE (account_id uuid, account_code text, account_name text, parent_id uuid, level_num int, total_debit numeric, total_credit numeric, net_balance numeric, is_group boolean) AS $$
    SELECT * FROM public.get_tree_balances(public.get_my_org(), CURRENT_DATE);
$$ LANGUAGE sql SECURITY DEFINER;

-- ================================================================
-- 12. موديول التأسيس (Initialization)
-- ================================================================

DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid, text) CASCADE;
CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id uuid, p_activity_type text DEFAULT 'commercial')
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER AS $$
DECLARE
    v_count int := 0;
    v_vat_rate numeric;
    v_parent_id uuid;
    v_admin_id uuid;
    v_org_name text;
    v_rec record;
BEGIN
    -- تحديد نسبة الضريبة الافتراضية بناءً على نوع النشاط
    IF p_activity_type = 'construction' THEN v_vat_rate := 0.05;
    ELSIF p_activity_type = 'charity' THEN v_vat_rate := 0.00;
    ELSE v_vat_rate := 0.14;
    END IF;

    -- إنشاء جدول مؤقت لهيكل الدليل (4 مستويات)
    CREATE TEMPORARY TABLE coa_template (
        code text PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL,
        is_group boolean NOT NULL,
        parent_code text
    ) ON COMMIT DROP;

    INSERT INTO coa_template (code, name, type, is_group, parent_code) VALUES
    -- المستوى الأول (الجذور)
    ('1', 'الأصول', 'ASSET', true, NULL),
    ('2', 'الخصوم (الإلتزامات)', 'LIABILITY', true, NULL),
    ('3', 'حقوق الملكية', 'EQUITY', true, NULL),
    ('4', 'الإيرادات', 'REVENUE', true, NULL),
    ('5', 'المصروفات', 'EXPENSE', true, NULL),

    -- المستوى الثاني (مجموعات رئيسية)
    ('11', 'الأصول غير المتداولة', 'ASSET', true, '1'),
    ('12', 'الأصول المتداولة', 'ASSET', true, '1'),
    ('21', 'الخصوم غير المتداولة', 'LIABILITY', true, '2'),
    ('22', 'الخصوم المتداولة', 'LIABILITY', true, '2'),
    ('31', 'رأس المال', 'EQUITY', true, '3'),
    ('311', 'رأس المال المدفوع', 'EQUITY', false, '31'),
    ('32', 'الأرباح المبقاة / المرحلة', 'EQUITY', false, '3'),
    ('33', 'جاري الشركاء', 'EQUITY', false, '3'),
    ('34', 'احتياطيات', 'EQUITY', false, '3'),
    ('41', 'إيرادات النشاط (المبيعات)', 'REVENUE', true, '4'),
    ('42', 'إيرادات أخرى', 'REVENUE', true, '4'),
    ('51', 'تكلفة المبيعات (COGS)', 'EXPENSE', true, '5'),
    ('52', 'مصروفات البيع والتسويق', 'EXPENSE', true, '5'),
    ('53', 'المصروفات الإدارية والعمومية', 'EXPENSE', true, '5'),

    -- المستوى الثالث والرابع
    -- الأصول
    ('111', 'الأصول الثابتة (بالصافي)', 'ASSET', true, '11'),
    ('1111', 'الأراضي', 'ASSET', false, '111'),
    ('1112', 'المباني والإنشاءات', 'ASSET', false, '111'),
    ('1113', 'الآلات والمعدات', 'ASSET', false, '111'),
    ('1114', 'وسائل النقل والانتقال', 'ASSET', false, '111'),
    ('1115', 'الأثاث والتجهيزات المكتبية', 'ASSET', false, '111'),
    ('1116', 'أجهزة حاسب آلي وبرمجيات', 'ASSET', false, '111'),
    ('1119', 'مجمع إهلاك الأصول الثابتة', 'ASSET', false, '111'),
    ('103', 'المخزون', 'ASSET', true, '12'), -- Changed parent to 12
    ('10301', 'مخزون المواد الخام', 'ASSET', false, '103'),
    ('10302', 'مخزون المنتج التام', 'ASSET', false, '103'),
    ('122', 'العملاء والمدينون', 'ASSET', true, '12'),
    ('1221', 'العملاء', 'ASSET', false, '122'),
    ('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'ASSET', false, '122'),
    ('1223', 'سلف الموظفين', 'ASSET', false, '122'),
    ('1224', 'عهد موظفين', 'ASSET', false, '122'),
    ('123', 'النقدية وما في حكمها', 'ASSET', true, '12'),
    ('1231', 'النقدية بالصندوق (الخزينة الرئيسية)', 'ASSET', false, '123'),
    ('1232', 'البنوك (حسابات جارية)', 'ASSET', true, '123'),
    ('123201', 'البنك الأهلي المصري', 'ASSET', false, '1232'),
    ('123202', 'بنك مصر', 'ASSET', false, '1232'),
    ('123203', 'البنك التجاري الدولي (CIB)', 'ASSET', false, '1232'),
    ('123204', 'بنك QNB الأهلي', 'ASSET', false, '1232'),
    ('123205', 'بنك القاهرة', 'ASSET', false, '1232'),
    ('123206', 'بنك فيصل الإسلامي', 'ASSET', false, '1232'),
    ('123207', 'بنك الإسكندرية', 'ASSET', false, '1232'),
    ('1233', 'المحافظ الإلكترونية (Digital Wallets)', 'ASSET', true, '123'),
    ('123301', 'فودافون كاش (Vodafone Cash)', 'ASSET', false, '1233'),
    ('123302', 'اتصالات كاش (Etisalat Cash)', 'ASSET', false, '1233'),
    ('123303', 'أورنج كاش (Orange Cash)', 'ASSET', false, '1233'),
    ('123304', 'وي باي (WE Pay)', 'ASSET', false, '1233'),
    ('123305', 'انستا باي (InstaPay - تسوية)', 'ASSET', false, '1233'),
    ('124', 'أرصدة مدينة أخرى', 'ASSET', true, '12'),
    ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'ASSET', false, '124'),
    ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'ASSET', false, '124'),
    ('1243', 'مصروفات مدفوعة مقدماً', 'ASSET', true, '124'),
    ('124301', 'إيجار مقدم', 'ASSET', false, '1243'),
    ('124302', 'تأمين طبي مقدم', 'ASSET', false, '1243'),
    ('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'ASSET', false, '1243'),
    ('124304', 'حملات إعلانية مقدمة', 'ASSET', false, '1243'),
    ('124305', 'عقود صيانة مقدمة', 'ASSET', false, '1243'),
    ('1244', 'إيرادات مستحقة', 'ASSET', true, '124'),
    ('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'ASSET', false, '1244'),
    ('124402', 'فوائد بنكية مستحقة القبض', 'ASSET', false, '1244'),
    ('124403', 'إيجارات دائنة مستحقة', 'ASSET', false, '1244'),
    ('124404', 'إيرادات أوراق مالية مستحقة', 'ASSET', false, '1244'),

    -- الخصوم
    ('211', 'قروض طويلة الأجل', 'LIABILITY', false, '21'),
    ('201', 'الموردين', 'LIABILITY', false, '22'),
    ('222', 'أوراق الدفع (شيكات صادرة)', 'LIABILITY', false, '22'),
    ('223', 'مصلحة الضرائب (التزامات)', 'LIABILITY', true, '22'),
    ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'LIABILITY', false, '223'),
    ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'LIABILITY', false, '223'),
    ('2233', 'ضريبة كسب العمل', 'LIABILITY', false, '223'),
    ('224', 'هيئة التأمينات الاجتماعية', 'LIABILITY', false, '22'),
    ('225', 'مصروفات مستحقة', 'LIABILITY', true, '22'),
    ('2251', 'رواتب وأجور مستحقة', 'LIABILITY', false, '225'),
    ('2252', 'إيجارات مستحقة', 'LIABILITY', false, '225'),
    ('2253', 'كهرباء ومياه وغاز مستحقة', 'LIABILITY', false, '225'),
    ('2254', 'أتعاب مهنية ومراجعة مستحقة', 'LIABILITY', false, '225'),
    ('2255', 'عمولات بيع مستحقة', 'LIABILITY', false, '225'),
    ('2256', 'فوائد بنكية مستحقة', 'LIABILITY', false, '225'),
    ('2257', 'اشتراكات وتراخيص مستحقة', 'LIABILITY', false, '225'),
    ('226', 'تأمينات ودفعات مقدمة من العملاء', 'LIABILITY', false, '22'),

    -- حقوق الملكية
    ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'EQUITY', false, '3'),

    -- الإيرادات
    ('411', 'إيراد المبيعات', 'REVENUE', false, '41'),
    ('412', 'مردودات المبيعات', 'REVENUE', false, '41'),
    ('413', 'خصم مسموح به', 'REVENUE', false, '41'),
    ('421', 'إيرادات متنوعة', 'REVENUE', false, '42'),
    ('422', 'إيراد خصومات وجزاءات الموظفين', 'REVENUE', false, '42'),
    ('423', 'فوائد بنكية دائنة', 'REVENUE', false, '42'),

    -- المصروفات
    ('511', 'تكلفة البضاعة المباعة', 'EXPENSE', false, '51'),
    ('512', 'تسويات الجرد (عجز المخزون)', 'EXPENSE', false, '51'),
    ('521', 'دعاية وإعلان', 'EXPENSE', false, '52'),
    ('522', 'عمولات بيع وتسويق', 'EXPENSE', false, '52'),
    ('523', 'نقل ومشال للخارج', 'EXPENSE', false, '52'),
    ('524', 'تعبئة وتغليف', 'EXPENSE', false, '52'),
    ('525', 'عمولات تحصيل إلكتروني', 'EXPENSE', true, '52'),
    ('5251', 'عمولة فودافون كاش', 'EXPENSE', false, '525'),
    ('5252', 'عمولة فوري', 'EXPENSE', false, '525'),
    ('5253', 'عمولة تحويلات بنكية', 'EXPENSE', false, '525'),
    ('531', 'الرواتب والأجور', 'EXPENSE', false, '53'),
    ('5311', 'بدلات وانتقالات', 'EXPENSE', false, '531'),
    ('5312', 'مكافآت وحوافز', 'EXPENSE', false, '531'),
    ('532', 'إيجار مقرات إدارية', 'EXPENSE', false, '53'),
    ('533', 'إهلاك الأصول الثابتة', 'EXPENSE', false, '53'),
    ('534', 'رسوم ومصروفات بنكية', 'EXPENSE', false, '53'),
    ('535', 'كهرباء ومياه وغاز', 'EXPENSE', false, '53'),
    ('536', 'اتصالات وإنترنت', 'EXPENSE', false, '53'),
    ('537', 'صيانة وإصلاح', 'EXPENSE', false, '53'),
    ('538', 'أدوات مكتبية ومطبوعات', 'EXPENSE', false, '53'),
    ('539', 'ضيافة واستقبال', 'EXPENSE', false, '53'),
    ('541', 'تسوية عجز الصندوق', 'EXPENSE', false, '53'),
    ('542', 'إكراميات', 'EXPENSE', false, '53'),
    ('543', 'مصاريف نظافة', 'EXPENSE', false, '53');

    -- 🛠️ 1. الترقية الأمنية: تحويل المستخدم الحالي إلى مدير (Admin) وربطه بالمنظمة
    v_admin_id := auth.uid();
    IF v_admin_id IS NOT NULL THEN
        -- تحديث البروفايل فوراً لفتح أقفال الواجهة وقاعدة البيانات
        UPDATE public.profiles 
        SET role = 'admin', organization_id = p_org_id, is_active = true,
            role_id = (SELECT id FROM public.roles WHERE name = 'admin' LIMIT 1)
        WHERE id = v_admin_id;
        
        -- 🔒 صمام أمان: التأكد من وجود سجل إعدادات الشركة
        SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;
        INSERT INTO public.company_settings (organization_id, company_name, activity_type, vat_rate)
        VALUES (p_org_id, v_org_name, p_activity_type, v_vat_rate)
        ON CONFLICT (organization_id) 
        DO UPDATE SET 
            company_name = EXCLUDED.company_name,
            activity_type = EXCLUDED.activity_type,
            vat_rate = EXCLUDED.vat_rate;
    END IF;

    -- 🛠️ 2. تنفيذ الإدراج مع ربط الآباء بدقة
    -- الترتيب حسب طول الكود يضمن إنشاء الأب (مثلاً 12) قبل الابن (مثلاً 103)
    FOR v_rec IN SELECT * FROM coa_template ORDER BY length(code), code ASC LOOP
        v_parent_id := NULL;
        IF v_rec.parent_code IS NOT NULL THEN
            -- البحث عن الأب في قاعدة البيانات الحقيقية
            SELECT id INTO v_parent_id FROM public.accounts 
            WHERE code = v_rec.parent_code AND organization_id = p_org_id LIMIT 1;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = v_rec.code AND organization_id = p_org_id) THEN
            INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id, is_active)
            VALUES (v_rec.code, v_rec.name, LOWER(v_rec.type), v_rec.is_group, v_parent_id, p_org_id, true);
            v_count := v_count + 1;
        ELSE
            -- تحديث الربط إذا كان الحساب موجوداً ولكن بدون أب (تصحيح الهيكل)
            UPDATE public.accounts 
            SET parent_id = v_parent_id, type = LOWER(v_rec.type), is_group = v_rec.is_group
            WHERE code = v_rec.code AND organization_id = p_org_id AND parent_id IS DISTINCT FROM v_parent_id;
        END IF;
    END LOOP;

    RETURN 'تمت معالجة الدليل المصري بنجاح. الحسابات الجديدة: (' || v_count || '). تم تفعيل صلاحيات المدير للمستخدم الحالي ✅';
END; $$;

DROP FUNCTION IF EXISTS public.clear_demo_data(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.clear_demo_data(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org_id uuid;
BEGIN
    v_target_org_id := COALESCE(p_org_id, public.get_my_org());
    
    -- 1. حذف القيود المحاسبية المرتبطة (الابن أولاً)
    DELETE FROM public.journal_lines WHERE organization_id = v_target_org_id;
    DELETE FROM public.journal_entries WHERE organization_id = v_target_org_id;

    -- 2. حذف بنود المستندات (الابن أولاً)
    DELETE FROM public.invoice_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_invoice_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.sales_return_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_return_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.quotation_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_order_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.stock_transfer_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.stock_adjustment_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.inventory_count_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.work_order_costs WHERE organization_id = v_target_org_id;
    DELETE FROM public.work_order_material_usage WHERE organization_id = v_target_org_id;
    DELETE FROM public.order_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.kitchen_orders WHERE organization_id = v_target_org_id;
    DELETE FROM public.payments WHERE organization_id = v_target_org_id;

    -- 3. حذف المستندات الرئيسية
    DELETE FROM public.invoices WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = v_target_org_id;
    DELETE FROM public.sales_returns WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_returns WHERE organization_id = v_target_org_id;
    DELETE FROM public.quotations WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_orders WHERE organization_id = v_target_org_id;
    DELETE FROM public.receipt_vouchers WHERE organization_id = v_target_org_id;
    DELETE FROM public.payment_vouchers WHERE organization_id = v_target_org_id;
    DELETE FROM public.cheques WHERE organization_id = v_target_org_id;
    DELETE FROM public.credit_notes WHERE organization_id = v_target_org_id;
    DELETE FROM public.debit_notes WHERE organization_id = v_target_org_id;
    DELETE FROM public.stock_transfers WHERE organization_id = v_target_org_id;
    DELETE FROM public.stock_adjustments WHERE organization_id = v_target_org_id;
    DELETE FROM public.inventory_counts WHERE organization_id = v_target_org_id;
    DELETE FROM public.work_orders WHERE organization_id = v_target_org_id;
    DELETE FROM public.orders WHERE organization_id = v_target_org_id;
    DELETE FROM public.table_sessions WHERE organization_id = v_target_org_id;

    -- 4. إعادة تعيين أرصدة المنتجات والعملاء والموردين
    UPDATE public.products SET stock = 0, warehouse_stock = '{}'::jsonb, weighted_average_cost = 0 WHERE organization_id = v_target_org_id;
    UPDATE public.customers SET balance = 0 WHERE organization_id = v_target_org_id;
    UPDATE public.suppliers SET balance = 0 WHERE organization_id = v_target_org_id;
    UPDATE public.accounts SET balance = 0 WHERE organization_id = v_target_org_id;

    RETURN 'تم تنظيف كافة البيانات التشغيلية للمؤسسة الحالية بنجاح ✅';
END; $$;

-- دالة إصلاح الحسابات المفقودة
DROP FUNCTION IF EXISTS public.repair_missing_accounts() CASCADE;
DROP FUNCTION IF EXISTS public.repair_missing_accounts(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.repair_missing_accounts(p_org_id uuid DEFAULT NULL) 
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    RETURN public.initialize_egyptian_coa(v_target_org);
END; $$;

-- دالة الطوارئ لمنح صلاحيات المدير (Emergency Admin Grant)
-- تستخدم إذا فشل العميل في الحصول على صلاحيات عبر الأزرار العادية
DROP FUNCTION IF EXISTS public.force_grant_admin_access(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.force_grant_admin_access(p_user_id uuid, p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.profiles  
    SET role = 'admin', 
        organization_id = p_org_id, 
        is_active = true,
        role_id = (SELECT id FROM public.roles WHERE name = 'admin' LIMIT 1)
    WHERE id = p_user_id;
    
    IF NOT FOUND THEN RETURN 'خطأ: لم يتم العثور على المستخدم المذكور ❌'; END IF;
    
    RETURN 'تم منح صلاحيات المدير وتصحيح تبعية المنظمة بنجاح ✅ (يرجى إعادة تسجيل الدخول)';
END; $$;
