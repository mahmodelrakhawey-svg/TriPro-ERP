-- Migration: Fix hims_complete_surgery_and_consume function
-- Date: 2026-07-31
-- Description: Fixes plpgsql "operator does not exist: record ->> unknown" syntax error by using jsonb_to_recordset instead of jsonb_array_elements with record iteration.

DROP FUNCTION IF EXISTS public.hims_complete_surgery_and_consume(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.hims_complete_surgery_and_consume(uuid, uuid, jsonb, numeric);

CREATE OR REPLACE FUNCTION public.hims_complete_surgery_and_consume(
    p_surgery_id uuid,
    p_warehouse_id uuid,
    p_consumables jsonb, -- [{product_id, qty}]
    p_surgery_price numeric DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_surgery record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_total_cost numeric(18,2) := 0; v_prd_id uuid; v_qty numeric;
    v_cost_price numeric; v_inv_account_id uuid; v_exp_account_id uuid;
    v_surgeon_user_id uuid; v_mappings jsonb;
    v_product_name text; v_sales_price numeric; v_uom_id uuid;
BEGIN
    -- 1. التحقق من وجود العملية وجلب المنظمة
    SELECT * INTO v_surgery FROM public.hims_surgeries WHERE id = p_surgery_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Surgery record not found'; END IF;
    v_org_id := v_surgery.organization_id;

    -- 2. جلب الحسابات باستخدام محرك التوجيه الذكي (Resolve Leaf Account)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    v_inv_account_id := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, 
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '10302' LIMIT 1)
    ));
    
    v_exp_account_id := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'COGS')::uuid, 
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '511' LIMIT 1)
    ));

    -- 3. إنشاء رأس القيد المحاسبي (Double Entry Header)
    INSERT INTO public.journal_entries (organization_id, transaction_date, description, reference, status, related_document_id, related_document_type, is_posted)
    VALUES (v_org_id, CURRENT_DATE, 'استهلاك مستلزمات جراحة: ' || v_surgery.surgery_name, 'SURG-' || substring(p_surgery_id::text, 1, 8), 'posted', p_surgery_id, 'hims_surgery', true)
    RETURNING id INTO v_journal_id;

    -- 4. معالجة المستهلكات، خصم المخزن، وربطها بالفاتورة لضمان التناغم
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_consumables) AS x(product_id uuid, qty numeric)
    LOOP
        v_prd_id := v_item.product_id;
        v_qty := v_item.qty;

        SELECT name, sales_price, COALESCE(weighted_average_cost, cost, purchase_price, 0), base_uom_id
        INTO v_product_name, v_sales_price, v_cost_price, v_uom_id
        FROM public.products WHERE id = v_prd_id AND organization_id = v_org_id;

        UPDATE public.products SET stock = stock - v_qty 
        WHERE id = v_prd_id AND organization_id = v_org_id;

        -- تسجيل البند في الفاتورة كـ 'surgery' مع ربطه بالمنتج للمحرك الموحد
        PERFORM public.hims_add_billing_item(
            p_visit_id  => v_surgery.visit_id,
            p_type      => 'surgery',
            p_desc      => 'مستلزم: ' || v_product_name,
            p_qty       => v_qty,
            p_price     => v_sales_price, -- سعر البيع للمريض
            p_product_id => v_prd_id,
            p_warehouse_id => p_warehouse_id,
            p_uom_id    => v_uom_id
        );

        v_total_cost := v_total_cost + (v_qty * v_cost_price);
    END LOOP;

    -- 5. تسجيل أطراف القيد المزدوج
    IF v_total_cost > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES 
            (v_journal_id, v_exp_account_id, v_total_cost, 0, v_org_id, 'تكلفة مستلزمات جراحة: ' || v_surgery.surgery_name),
            (v_journal_id, v_inv_account_id, 0, v_total_cost, v_org_id, 'صرف مستلزمات طبية من المخزن للعمليات');
    END IF;

    -- 6. تحديث الفاتورة الطبية للمريض
    PERFORM public.hims_add_billing_item(
        v_surgery.visit_id, 
        'surgery', 
        'إجراء جراحي: ' || v_surgery.surgery_name, 
        1, 
        COALESCE(p_surgery_price, (SELECT consultation_fee FROM public.hims_doctors WHERE id = v_surgery.lead_surgeon_id), 0)
    );

    -- 7. إخطار الجراح بانتهاء العملية
    SELECT d.profile_id INTO v_surgeon_user_id FROM public.hims_doctors d WHERE d.id = v_surgery.lead_surgeon_id;
    IF v_surgeon_user_id IS NOT NULL THEN
        PERFORM public.create_notification_from_sql(
            p_org_id     => v_org_id,
            p_user_id    => v_surgeon_user_id,
            p_title      => 'تم إكمال الجراحة ✅', 
            p_message    => format('تم إغلاق ملف العملية (%s) وتحديث المخزون والقيود المزدوجة.', v_surgery.surgery_name),
            p_type       => 'success', 
            p_priority   => 'high', 
            p_action_url => ('/hims/surgeries/' || p_surgery_id)
        );
    END IF;

    -- 8. تحديث حالة العملية وتحديث المخزن العام
    UPDATE public.hims_surgeries SET status = 'completed', scheduled_end = now() WHERE id = p_surgery_id;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

GRANT EXECUTE ON FUNCTION public.hims_complete_surgery_and_consume(uuid, uuid, jsonb) TO authenticated;

