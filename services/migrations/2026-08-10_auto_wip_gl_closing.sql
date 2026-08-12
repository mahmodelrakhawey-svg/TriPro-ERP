-- =================================================================
-- إصلاح وتحديث دالة إغلاق الفترة التكاليفية لتوليد قيد إقفال وتصفية رصيد WIP المعلق إلى المنتج التام تلقائياً
-- التاريخ: 10 أغسطس 2026
-- =================================================================

CREATE OR REPLACE FUNCTION public.mfg_close_costing_period(p_period_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid := public.get_my_org();
    v_order record;
    v_wip_val record;
    v_count int := 0;
    v_wip_acc uuid;
    v_fg_acc uuid;
    v_total_gl_wip numeric := 0;
    v_active_wip_req numeric := 0;
    v_unallocated_wip numeric := 0;
    v_je_id uuid := NULL;
    v_mappings jsonb;
BEGIN
    -- 1. التأكد من عدم إغلاق الفترة مرتين
    IF EXISTS (SELECT 1 FROM public.mfg_period_cost_snapshots WHERE period_name = p_period_name AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'هذه الفترة مغلقة مسبقاً: %', p_period_name;
    END IF;

    -- 2. المرور على كافة الأوامر التي لا تزال "تحت التشغيل"
    FOR v_order IN SELECT id, order_number FROM public.mfg_production_orders 
                  WHERE status IN ('in_progress', 'draft') AND organization_id = v_org_id 
    LOOP
        -- جلب تقييم الـ WIP الحالي للأمر
        SELECT cost_assigned_to_wip, cost_per_material_eq, cost_per_conversion_eq 
        INTO v_wip_val 
        FROM public.v_mfg_cost_reconciliation_report WHERE order_id = v_order.id;

        IF v_wip_val.cost_assigned_to_wip > 0 THEN
            INSERT INTO public.mfg_period_cost_snapshots (
                period_name, order_id, material_unit_cost, conversion_unit_cost, wip_valuation, organization_id
            ) VALUES (
                p_period_name, v_order.id, v_wip_val.cost_per_material_eq, v_wip_val.cost_per_conversion_eq, v_wip_val.cost_assigned_to_wip, v_org_id
            );

            DELETE FROM public.mfg_beginning_wip_inventory WHERE order_id = v_order.id;
            
            INSERT INTO public.mfg_beginning_wip_inventory (
                order_id, material_cost_bf, conversion_cost_bf, organization_id
            ) VALUES (
                v_order.id, 
                (v_wip_val.cost_assigned_to_wip * 0.7),
                (v_wip_val.cost_assigned_to_wip * 0.3),
                v_org_id
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;

    -- 3. حسم وتصفية أي رصيد معلق في حساب WIP بالأستاذ العام إذا لم يكن مخصصاً لأوامر نشطة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_WIP')::uuid, (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1)));
    v_fg_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1)));

    IF v_wip_acc IS NOT NULL AND v_fg_acc IS NOT NULL THEN
        -- حساب إجمالي رصيد WIP الدفتري الحالي في الأستاذ العام
        SELECT COALESCE(SUM(debit - credit), 0) INTO v_total_gl_wip
        FROM public.journal_lines_view 
        WHERE account_id = v_wip_acc AND organization_id = v_org_id;

        -- حساب التقييم المطلوب للأوامر المفتوحة النشطة
        SELECT COALESCE(SUM(cost_assigned_to_wip), 0) INTO v_active_wip_req
        FROM public.v_mfg_cost_reconciliation_report
        WHERE organization_id = v_org_id;

        v_unallocated_wip := v_total_gl_wip - v_active_wip_req;

        -- إذا كان هناك رصيد WIP معلق في الأستاذ العام ليس له أوامر نشطة (مثل الأعباء الصناعية 9777)
        IF v_unallocated_wip > 0.01 THEN
            INSERT INTO public.journal_entries (
                transaction_date, description, reference, status, organization_id, is_posted, related_document_type
            ) VALUES (
                now()::date, 'قيد إقفال وتصفية أعباء مخزون تحت التشغيل إلى المنتج التام - فترة: ' || p_period_name, 'WIP-CLOSE-' || p_period_name, 'posted', v_org_id, true, 'mfg_period_close'
            ) RETURNING id INTO v_je_id;

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES 
                (v_je_id, v_fg_acc, v_unallocated_wip, 0, 'إقفال تكاليف WIP المعلقة إلى المنتج التام', v_org_id),
                (v_je_id, v_wip_acc, 0, v_unallocated_wip, 'تصفية رصيد WIP المعلق بالأستاذ العام', v_org_id);
        END IF;
    END IF;

    -- إذا لم تكن هناك أوامر نشطة، تسجل لقطة رمزية للفترة لتسجيل الإغلاق
    IF v_count = 0 THEN
        INSERT INTO public.mfg_period_cost_snapshots (
            period_name, order_id, material_unit_cost, conversion_unit_cost, wip_valuation, organization_id
        ) VALUES (
            p_period_name, NULL, 0, 0, 0, v_org_id
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'success', 
        'orders_migrated', v_count, 
        'period', p_period_name, 
        'settlement_je_id', v_je_id,
        'unallocated_wip_settled', v_unallocated_wip
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.mfg_close_costing_period(text) TO authenticated;
