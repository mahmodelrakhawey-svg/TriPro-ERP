-- 🌟 دالة اعتماد مرتجع المبيعات الآمنة (Secure Sales Return Approval RPC)
-- هذا الملف يجب تنفيذه في Supabase SQL Editor

-- 1. التأكد من وجود عمود لربط المرتجع بالقيد
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_returns' AND column_name = 'related_journal_entry_id') THEN 
        ALTER TABLE public.sales_returns ADD COLUMN related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF; 
END $$;

-- 2. إنشاء الدالة
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_sales_return_acc_id uuid; -- حساب مردودات المبيعات
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inventory_acc_id uuid;
    v_journal_id uuid;
    v_total_cost numeric := 0;
BEGIN
    -- أ. التحقق من المرتجع
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'المرتجع مرحل بالفعل'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    -- ب. جلب الحسابات
    SELECT id INTO v_sales_return_acc_id FROM public.accounts WHERE code = '4103' LIMIT 1; -- نفترض 4103 للمردودات
    IF v_sales_return_acc_id IS NULL THEN 
        SELECT id INTO v_sales_return_acc_id FROM public.accounts WHERE code = '4101' LIMIT 1; -- احتياطي: حساب المبيعات
    END IF;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2103' LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1102' LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '5101' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '1105' LIMIT 1;

    IF v_sales_return_acc_id IS NULL OR v_customer_acc_id IS NULL OR v_inventory_acc_id IS NULL OR v_cogs_acc_id IS NULL THEN
        RAISE EXCEPTION 'أحد حسابات المرتجعات أو العملاء أو المخزون غير معرّف';
    END IF;

    -- ج. تحديث المخزون (زيادة) وحساب التكلفة
    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        UPDATE public.products 
        SET stock = stock + v_item.quantity,
            warehouse_stock = jsonb_set(
                COALESCE(warehouse_stock, '{}'::jsonb), 
                ARRAY[v_return.warehouse_id::text], 
                to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity)
            )
        WHERE id = v_item.product_id;
        -- يمكن إضافة حساب التكلفة هنا إذا لزم الأمر
    END LOOP;

    -- د. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', true)
    RETURNING id INTO v_journal_id;

    -- هـ. إنشاء أسطر القيد
    -- 1. المدين: مردودات المبيعات
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_sales_return_acc_id, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0);

    -- 2. المدين: ضريبة القيمة المضافة (عكس)
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit)
        VALUES (v_journal_id, v_vat_acc_id, v_return.tax_amount, 0);
    END IF;

    -- 3. الدائن: العميل (تخفيض مديونيته)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_customer_acc_id, 0, v_return.total_amount);

    -- و. تحديث حالة المرتجع
    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END;
$$;