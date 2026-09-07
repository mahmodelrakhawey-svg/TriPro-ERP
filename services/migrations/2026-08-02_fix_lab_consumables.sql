-- 🧪 [Migration] [2026-08-02] إصلاح مستهلكات المختبر
-- الغرض: ربط صرف مستهلكات المختبر بفاتورة المريض (hims_billing_items) وتحديد مستودع الصرف الصحيح
-- بحيث يتم احتسابه وإثباته محاسبياً على المريض، ومخزنياً عبر دالة recalculate_stock_rpc.

CREATE OR REPLACE FUNCTION public.hims_complete_lab_with_inventory(
    p_order_id uuid,
    p_result text,
    p_consumables jsonb, -- مصفوفة المستهلكات [{product_id, qty}]
    p_is_critical boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_total_cost numeric(18,2) := 0; v_prd_id uuid; v_qty numeric;
    v_cost_price numeric; v_inv_account_id uuid; v_exp_account_id uuid;
    v_mappings jsonb;
    v_product_name text; v_sales_price numeric; v_uom_id uuid; v_warehouse_id uuid;
BEGIN
    -- 1. جلب بيانات الفحص المطلوب
    SELECT * INTO v_order FROM public.hims_lab_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lab order not found'; END IF;
    v_org_id := v_order.organization_id;

    -- 2. تحديث حالة الطلب والنتيجة
    UPDATE public.hims_lab_orders
    SET status = 'completed',
        result_value = p_result,
        is_critical = p_is_critical,
        completed_at = now()
    WHERE id = p_order_id;

    -- 3. جلب التوجيه المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inv_account_id := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, 
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '10302' LIMIT 1)
    ));
    v_exp_account_id := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'COGS')::uuid, 
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '511' LIMIT 1)
    ));

    -- 4. خصم المستهلكات من المخزن واحتساب قيمة القيود وتسجيلها بالفاتورة
    IF p_consumables IS NOT NULL AND jsonb_array_length(p_consumables) > 0 THEN
        INSERT INTO public.journal_entries (organization_id, transaction_date, description, reference, status, related_document_id, related_document_type, is_posted)
        VALUES (v_org_id, CURRENT_DATE, 'استهلاك كواشف تحاليل - فحص رقم: ' || p_order_id::text, 'LAB-' || substring(p_order_id::text, 1, 8), 'posted', p_order_id, 'hims_lab_order', true)
        RETURNING id INTO v_journal_id;

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_consumables) AS x(product_id uuid, qty numeric)
        LOOP
            v_prd_id := v_item.product_id;
            v_qty := v_item.qty;

            -- جلب تفاصيل المنتج (الاسم، سعر البيع للمريض، التكلفة، وحدة القياس الأساسية)
            SELECT name, sales_price, COALESCE(weighted_average_cost, cost, purchase_price, 0), base_uom_id
            INTO v_product_name, v_sales_price, v_cost_price, v_uom_id
            FROM public.products WHERE id = v_prd_id AND organization_id = v_org_id;

            -- تحديد مستودع الصرف (المستودع الافتراضي للمنظمة أو أول مستودع)
            v_warehouse_id := COALESCE(
                (SELECT default_pharmacy_warehouse FROM public.hims_settings WHERE organization_id = v_org_id),
                (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
            );

            -- خصم الكمية من مستودع المختبر (سيتم الكتابة فوقها وتأكيدها بواسطة recalculate_stock_rpc)
            UPDATE public.products SET stock = stock - v_qty 
            WHERE id = v_prd_id AND organization_id = v_org_id;

            -- تسجيل البند في فاتورة المريض كـ 'lab' مع ربطه بالمنتج للمحرك الموحد
            IF v_order.visit_id IS NOT NULL THEN
                PERFORM public.hims_add_billing_item(
                    p_visit_id     => v_order.visit_id,
                    p_type         => 'lab',
                    p_desc         => 'مستلزم فحص: ' || v_product_name,
                    p_qty          => v_qty,
                    p_price        => COALESCE(v_sales_price, 0),
                    p_product_id   => v_prd_id,
                    p_warehouse_id => v_warehouse_id,
                    p_uom_id       => v_uom_id
                );
            END IF;

            v_total_cost := v_total_cost + (v_qty * v_cost_price);
        END LOOP;

        -- تسجيل أطراف القيد المحاسبي
        IF v_total_cost > 0 THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
            VALUES 
                (v_journal_id, v_exp_account_id, v_total_cost, 0, v_org_id, 'مصروف استهلاك كواشف ومواد مختبر'),
                (v_journal_id, v_inv_account_id, 0, v_total_cost, v_org_id, 'مخزن كواشف ومستلزمات المختبر');
        END IF;
        
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;
END; $$;
