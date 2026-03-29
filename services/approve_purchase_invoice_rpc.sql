-- 🌟 دالة اعتماد فاتورة المشتريات الآمنة (Secure Purchase Invoice Approval RPC)
-- هذا الملف يجب تنفيذه في Supabase SQL Editor

-- 1. التأكد من وجود عمود لربط الفاتورة بالقيد في جدول المشتريات
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_invoices' AND column_name = 'related_journal_entry_id') THEN 
        ALTER TABLE public.purchase_invoices ADD COLUMN related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF; 
END $$;

-- 2. إنشاء الدالة
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
BEGIN
    -- أ. التحقق من الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    -- تحديد سعر الصرف (الافتراضي 1)
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- ب. جلب الحسابات
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' LIMIT 1; -- مخزون المنتج التام (فرعي)
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '1241' LIMIT 1; -- ضريبة مدخلات (مصر)
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' LIMIT 1; -- الموردين (مصر)

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة في دليل الحسابات';
    END IF;

    -- ج. تحديث المخزون (زيادة الكميات)
    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        -- تحويل سعر الشراء للعملة المحلية
        v_item_price_base := v_item.price * v_exchange_rate;

        -- جلب البيانات الحالية للمنتج
        SELECT stock, weighted_average_cost INTO v_current_stock, v_current_avg_cost 
        FROM public.products WHERE id = v_item.product_id;

        v_current_stock := COALESCE(v_current_stock, 0);
        v_current_avg_cost := COALESCE(v_current_avg_cost, 0);

        -- حساب المتوسط المرجح الجديد
        -- المعادلة: ( (الكمية الحالية * التكلفة الحالية) + (كمية الشراء * سعر الشراء المحلي) ) / (الكمية الحالية + كمية الشراء)
        IF (v_current_stock + v_item.quantity) > 0 THEN
            v_new_avg_cost := ((v_current_stock * v_current_avg_cost) + (v_item.quantity * v_item_price_base)) / (v_current_stock + v_item.quantity);
        ELSE
            v_new_avg_cost := v_item.price;
        END IF;

        UPDATE public.products 
        SET stock = stock + v_item.quantity,
            warehouse_stock = jsonb_set(
                COALESCE(warehouse_stock, '{}'::jsonb), 
                ARRAY[v_invoice.warehouse_id::text], 
                to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_item.quantity)
            ),
            purchase_price = v_item_price_base, -- سعر آخر شراء (محلي)
            weighted_average_cost = v_new_avg_cost, -- متوسط التكلفة المرجح (محلي)
            cost = v_new_avg_cost -- تحديث حقل التكلفة الأساسي أيضاً
        WHERE id = v_item.product_id;
    END LOOP;

    -- حساب إجماليات الفاتورة بالعملة المحلية للقيد
    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_net_amount_base := v_total_amount_base - v_tax_amount_base;

    -- د. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_invoice.invoice_date, 
        'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-') || (CASE WHEN v_invoice.currency IS NOT NULL AND v_invoice.currency != 'SAR' THEN ' (' || v_invoice.currency || ')' ELSE '' END), 
        v_invoice.invoice_number, 
        'posted', 
        v_org_id,
        p_invoice_id,
        'purchase_invoice',
        true
    ) RETURNING id INTO v_journal_id;

    -- هـ. إنشاء أسطر القيد (بالعملة المحلية)
    -- 1. المدين: المخزون (صافي القيمة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);

    -- 2. المدين: ضريبة المدخلات
    IF v_tax_amount_base > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات - فاتورة ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- 3. الدائن: المورد (إجمالي الفاتورة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد - فاتورة ' || v_invoice.invoice_number, v_org_id);

    -- و. تحديث حالة الفاتورة
    UPDATE public.purchase_invoices 
    SET status = 'posted',
        related_journal_entry_id = v_journal_id
    WHERE id = p_invoice_id;
END;
$$;