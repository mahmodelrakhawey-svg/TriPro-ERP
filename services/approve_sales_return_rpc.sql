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
    v_mappings jsonb; -- 🚀 مضاف للربط المحاسبي
BEGIN
    -- أ. التحقق من المرتجع
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'المرتجع مرحل بالفعل'; END IF;

    -- تحديد المنظمة من المرتجع لضمان عزل البيانات في نظام SaaS
    v_org_id := v_return.organization_id;

    -- ب. جلب الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_sales_return_acc_id := COALESCE(
        (v_mappings->>'SALES_RETURNS')::uuid,
        (SELECT id FROM public.accounts WHERE code = '412' AND organization_id = v_org_id LIMIT 1),
        (v_mappings->>'SALES_REVENUE')::uuid,
        (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1)
    );
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

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
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true)
    RETURNING id INTO v_journal_id;

    -- هـ. إنشاء أسطر القيد
    -- 1. المدين: مردودات المبيعات
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_sales_return_acc_id, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مردودات مبيعات', v_org_id);

    -- 2. المدين: ضريبة القيمة المضافة (عكس)
    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, v_return.tax_amount, 0, 'عكس ضريبة مخرجات', v_org_id);
    END IF;

    -- 3. الدائن: العميل (تخفيض مديونيته)
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, 0, v_return.total_amount, 'تخفيض مديونية عميل', v_org_id);
    END IF;

    -- 4. إرجاع المخزون وعكس تكلفة المبيعات (المدين: المخزون، الدائن: تكلفة المبيعات)
    FOR v_item IN 
        SELECT 
            COALESCE(p.inventory_account_id, v_inventory_acc_id) as inv_acc,
            COALESCE(p.cogs_account_id, v_cogs_acc_id) as cogs_acc,
            SUM(COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0) * sri.quantity) as total_item_cost
        FROM public.sales_return_items sri
        JOIN public.products p ON sri.product_id = p.id
        WHERE sri.sales_return_id = p_return_id
        GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id), COALESCE(p.cogs_account_id, v_cogs_acc_id)
    LOOP
        IF v_item.total_item_cost > 0 THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, v_item.inv_acc, v_item.total_item_cost, 0, 'مخزون - مرتجع مبيعات', v_org_id);

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, v_item.cogs_acc, 0, v_item.total_item_cost, 'عكس تكلفة مبيعات', v_org_id);
        END IF;
    END LOOP;

    -- و. تحديث حالة المرتجع
    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END;
$$;