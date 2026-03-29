-- 🌟 دالة اعتماد الفاتورة الآمنة (Secure Invoice Approval RPC)
-- هذا الملف يجب تنفيذه في Supabase SQL Editor

-- 1. التأكد من وجود عمود لربط الفاتورة بالقيد
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'related_journal_entry_id') THEN 
        ALTER TABLE public.invoices ADD COLUMN related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF; 
END $$;

-- 2. إنشاء الدالة
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
BEGIN
    -- أ. التحقق من الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    -- تحديد سعر الصرف (الافتراضي 1)
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- ب. جلب الحسابات (يجب أن تكون الأكواد مطابقة لما في setup_complete_demo.sql)
    -- تحديث الأكواد لتطابق الدليل المصري الموحد في TriPro
    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' LIMIT 1; -- إيراد المبيعات
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2231' LIMIT 1; -- ضريبة القيمة المضافة (مخرجات)
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' LIMIT 1; -- العملاء
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '511' LIMIT 1; -- تكلفة البضاعة المباعة
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' LIMIT 1; -- مخزون المنتج التام (فرعي)
    SELECT id INTO v_discount_acc_id FROM public.accounts WHERE code = '413' LIMIT 1; -- خصم مسموح به
    
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_sales_acc_id IS NULL OR v_customer_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المبيعات أو العملاء غير معرّفة في دليل الحسابات (تأكد من وجود 411 و 1221)';
    END IF;

    IF v_cogs_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المخزون أو تكلفة المبيعات غير موجودة (تأكد من وجود 10302 و 511)';
    END IF;

    -- ج. حساب التكلفة وتحديث المخزون
    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        -- جلب تكلفة المنتج (نستخدم weighted_average_cost إذا وجد، وإلا cost، وإلا purchase_price)
        SELECT weighted_average_cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
        
        IF v_item_cost IS NULL OR v_item_cost = 0 THEN
             SELECT cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
             IF v_item_cost IS NULL OR v_item_cost = 0 THEN
                SELECT purchase_price INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
             END IF;
        END IF;
        
        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_item.quantity);

        -- تحديث المخزون الكلي وتفاصيل المستودع
        UPDATE public.products 
        SET stock = stock - v_item.quantity,
            warehouse_stock = jsonb_set(
                COALESCE(warehouse_stock, '{}'::jsonb), 
                ARRAY[v_invoice.warehouse_id::text], 
                to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_item.quantity)
            )
        WHERE id = v_item.product_id;
    END LOOP;

    -- حساب إجماليات الفاتورة بالعملة المحلية للقيد
    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_paid_amount_base := COALESCE(v_invoice.paid_amount, 0) * v_exchange_rate;
    v_subtotal_base := v_invoice.subtotal * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_discount_amount_base := COALESCE(v_invoice.discount_amount, 0) * v_exchange_rate;

    -- د. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_invoice.invoice_date, 
        'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-') || (CASE WHEN v_invoice.currency IS NOT NULL AND v_invoice.currency != 'EGP' THEN ' (' || v_invoice.currency || ')' ELSE '' END), 
        v_invoice.invoice_number, 
        'posted', 
        v_org_id,
        p_invoice_id,
        'invoice',
        true
    ) RETURNING id INTO v_journal_id;

    -- هـ. إنشاء أسطر القيد (بالعملة المحلية)
    -- 1. المدين: العميل (المبلغ المتبقي)
    IF (v_total_amount_base - v_paid_amount_base) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, (v_total_amount_base - v_paid_amount_base), 0, 'استحقاق عميل - ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- 2. المدين: الخزينة (المبلغ المدفوع)
    IF v_paid_amount_base > 0 THEN
        IF v_treasury_acc_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة للمبلغ المدفوع'; END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_treasury_acc_id, v_paid_amount_base, 0, 'تحصيل نقدي - ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- 3. المدين: خصم مسموح به
    IF v_discount_amount_base > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_discount_acc_id, v_discount_amount_base, 0, 'خصم ممنوح - فاتورة ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- 4. الدائن: المبيعات والضريبة
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_sales_acc_id, 0, v_subtotal_base, 'إيراد مبيعات - ' || v_invoice.invoice_number, v_org_id);

    IF v_tax_amount_base > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_tax_amount_base, 'ضريبة القيمة المضافة - ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- 5. قيد تكلفة البضاعة المباعة
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة - فاتورة ' || v_invoice.invoice_number, v_org_id);
        
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون - فاتورة ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- و. تحديث حالة الفاتورة
    UPDATE public.invoices 
    SET status = CASE WHEN (total_amount - COALESCE(paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END,
        related_journal_entry_id = v_journal_id
    WHERE id = p_invoice_id;
END;
$$;