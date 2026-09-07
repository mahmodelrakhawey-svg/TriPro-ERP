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
    v_mappings jsonb; -- 🚀 مضاف للربط المحاسبي المتعدد
BEGIN
    -- أ. التحقق من الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    -- تحديد المنظمة من الفاتورة مباشرة لضمان عزل البيانات في نظام SaaS
    v_org_id := v_invoice.organization_id;

    -- تحديد سعر الصرف (الافتراضي 1)
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- ب. جلب الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

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
    -- 1. المدين: المخزون (صافي القيمة لكل منتج حسب حسابه الخاص)
    FOR v_item IN 
        SELECT 
            COALESCE(p.inventory_account_id, v_inventory_acc_id) as acc_id,
            SUM(pii.quantity * pii.unit_price * v_exchange_rate) as total_cost
        FROM public.purchase_invoice_items pii
        JOIN public.products p ON pii.product_id = p.id
        WHERE pii.purchase_invoice_id = p_invoice_id
        GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id)
    LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_item.acc_id, v_item.total_cost, 0, 'مخزون - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);
    END LOOP;

    -- 2. المدين: ضريبة المدخلات
    IF v_tax_amount_base > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات - فاتورة ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- 3. الدائن: المورد (إجمالي الفاتورة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد - فاتورة ' || v_invoice.invoice_number, v_org_id);

    -- 4. إثبات السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_invoice.treasury_account_id IS NOT NULL THEN
        -- سطر مدين للمورد (تخفيض المديونية بقيمة السداد)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount * v_exchange_rate, 0, 'سداد فوري - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);

        -- سطر دائن للخزينة/البنك (نقص النقدية)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_invoice.treasury_account_id, 0, v_invoice.paid_amount * v_exchange_rate, 'دفع نقدي - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);
        
        -- تحديث حالة الفاتورة لتصبح مدفوعة بالكامل إذا تطابق المبلغ
        IF ABS(COALESCE(v_invoice.paid_amount, 0) - COALESCE(v_invoice.total_amount, 0)) < 0.01 THEN
            UPDATE public.purchase_invoices 
            SET status = 'paid',
                related_journal_entry_id = v_journal_id
            WHERE id = p_invoice_id;
        ELSE
            UPDATE public.purchase_invoices 
            SET status = 'posted',
                related_journal_entry_id = v_journal_id
            WHERE id = p_invoice_id;
        END IF;
    ELSE
        -- و. تحديث حالة الفاتورة
        UPDATE public.purchase_invoices 
        SET status = 'posted',
            related_journal_entry_id = v_journal_id
        WHERE id = p_invoice_id;
    END IF;

    -- إعادة احتساب أرصدة الأستاذ العام وكشوف الحسابات للشركة
    PERFORM public.recalculate_all_system_balances(v_org_id);
END;
$$;