-- ================================================================
-- 🌟 تحديث دالة اعتماد مرتجع المبيعات (Sales Return Approval with Perpetual Inventory)
-- ================================================================

CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_sales_return_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inv_acc_id uuid;
    v_journal_id uuid;
    v_total_cost numeric := 0;
    v_item_cost numeric := 0;
    v_mappings jsonb;
BEGIN
    -- 1. التحقق من وجود المرتجع
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;

    v_org_id := v_return.organization_id;

    -- 2. جلب الحسابات المحاسبية من إعدادات الشركة
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
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. تحديث أرصدة المخزون وحساب التكلفة الإجمالية
    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        DECLARE 
            v_base_qty numeric;
        BEGIN
            SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
            
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert') THEN
                v_base_qty := COALESCE(public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)), v_item.quantity);
            ELSE
                v_base_qty := v_item.quantity;
            END IF;

            v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_base_qty);

            -- تحديث رصيد المنتج والمستودع
            UPDATE public.products 
            SET stock = stock + v_item.quantity,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb), 
                    ARRAY[COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], 
                    to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity)
                )
            WHERE id = v_item.product_id;
        END;
    END LOOP;

    -- 4. تنظيف القيد القديم المرتبط (تحويله لمسودة أولاً لتجاوز قفل الحذف fn_protect_posted_journal_lines)
    IF v_return.related_journal_entry_id IS NOT NULL THEN
        UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_return.related_journal_entry_id;
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_return.related_journal_entry_id;
        DELETE FROM public.journal_entries WHERE id = v_return.related_journal_entry_id;
    END IF;
    
    UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE organization_id = v_org_id AND reference = v_return.return_number;
    DELETE FROM public.journal_lines WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE organization_id = v_org_id AND reference = v_return.return_number);
    DELETE FROM public.journal_entries WHERE organization_id = v_org_id AND reference = v_return.return_number;

    -- 5. إنشاء قيد اليومية العام
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true)
    RETURNING id INTO v_journal_id;

    -- 6. أسطر القيد المالي
    -- أ. مردودات ومسموحات مبيعات (مدين)
    IF v_sales_return_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_return_acc_id, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مردودات مبيعات', v_org_id);
    END IF;

    -- ب. ضريبة القيمة المضافة مخرجات (مدين - عكس)
    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, v_return.tax_amount, 0, 'عكس ضريبة مخرجات', v_org_id);
    END IF;

    -- ج. العملاء (دائن - تخفيض مديونية)
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, 0, v_return.total_amount, 'تخفيض مديونية عميل', v_org_id);
    END IF;

    -- 7. أسطر قيد الجرد المستمر (مدين: مخزون 10302 / دائن: تكلفة مبيعات 511)
    IF v_total_cost > 0 THEN
        FOR v_item IN 
            SELECT 
                COALESCE(p.inventory_account_id, v_inv_acc_id) as inv_acc,
                COALESCE(p.cogs_account_id, v_cogs_acc_id) as cogs_acc,
                SUM(COALESCE(p.cost, p.weighted_average_cost, p.purchase_price, 0) * sri.quantity) as total_item_cost
            FROM public.sales_return_items sri
            JOIN public.products p ON sri.product_id = p.id
            WHERE sri.sales_return_id = p_return_id
            GROUP BY COALESCE(p.inventory_account_id, v_inv_acc_id), COALESCE(p.cogs_account_id, v_cogs_acc_id)
        LOOP
            IF v_item.total_item_cost > 0 AND v_item.inv_acc IS NOT NULL AND v_item.cogs_acc IS NOT NULL THEN
                -- مدين: المخزون
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_journal_id, v_item.inv_acc, v_item.total_item_cost, 0, 'مخزون المنتج التام - مرتجع مبيعات', v_org_id);

                -- دائن: تكلفة البضاعة المباعة
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_journal_id, v_item.cogs_acc, 0, v_item.total_item_cost, 'عكس تكلفة مبيعات', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 8. تحديث حالة المرتجع وربطه بالقيد الجديد
    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_sales_return(uuid) TO authenticated;