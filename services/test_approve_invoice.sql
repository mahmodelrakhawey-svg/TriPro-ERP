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
BEGIN
    -- أ. التحقق من الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار أو التضارب بعد التعديل
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice';

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    -- ب. جلب الحسابات (يجب أن تكون الأكواد مطابقة لما في setup_complete_demo.sql)
    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '4101' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2103' LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1102' LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '5101' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '1105' LIMIT 1;
    SELECT id INTO v_discount_acc_id FROM public.accounts WHERE code = '4102' LIMIT 1;
    
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_sales_acc_id IS NULL OR v_customer_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المبيعات أو العملاء غير معرّفة في دليل الحسابات';
    END IF;

    -- ج. حساب التكلفة وتحديث المخزون
    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        -- جلب تكلفة المنتج
        SELECT cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
        
        IF v_item_cost IS NULL OR v_item_cost = 0 THEN
             SELECT purchase_price INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
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

    -- د. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_invoice.invoice_date, 
        'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), 
        v_invoice.invoice_number, 
        'posted', 
        v_org_id,
        p_invoice_id,
        'invoice',
        true
    ) RETURNING id INTO v_journal_id;

    -- هـ. إنشاء أسطر القيد
    -- 1. المدين: العميل (المبلغ المتبقي)
    IF (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)), 0, 'استحقاق عميل - ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- 2. المدين: الخزينة (المبلغ المدفوع)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 THEN
        IF v_treasury_acc_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة للمبلغ المدفوع'; END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_treasury_acc_id, v_invoice.paid_amount, 0, 'تحصيل نقدي - ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- 3. الدائن: المبيعات والضريبة
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات - ' || v_invoice.invoice_number, v_org_id);

    IF COALESCE(v_invoice.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة القيمة المضافة - ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- و. تحديث حالة الفاتورة
    UPDATE public.invoices 
    SET status = CASE WHEN (total_amount - COALESCE(paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END,
        related_journal_entry_id = v_journal_id
    WHERE id = p_invoice_id;

    -- 🚀 إعادة احتساب المخزون فوراً لضمان الدقة بعد أي تعديلات
    PERFORM public.recalculate_stock_rpc(v_org_id);
END;
$$;