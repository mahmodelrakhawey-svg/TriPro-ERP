-- ==============================================================================
-- TriPro ERP Migration: Production Cost Snapshotting & Server-Time Sync
-- Date: 2026-11-06
-- ==============================================================================

-- 1. إضافة حقول تجميد التكلفة لأوامر الإنتاج لمنع إعادة فك شجرة المكونات لحظياً
ALTER TABLE public.mfg_production_orders ADD COLUMN IF NOT EXISTS total_cost_snapshot numeric DEFAULT 0;
ALTER TABLE public.mfg_production_orders ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric DEFAULT 0;

-- 2. توفير دالة جلب وقت الخادم لمعايرة كاشير الأوفلاين
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT clock_timestamp();
$$;

GRANT EXECUTE ON FUNCTION public.get_server_time() TO authenticated, anon;

-- 3. تحديث دالة إغلاق أمر الإنتاج لتخزين لقطة التكلفة النهائية (Snapshot)
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(
    p_order_id uuid,
    p_final_status text DEFAULT 'completed',
    p_qc_notes text DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record; 
    v_accumulated_wip numeric := 0; 
    v_wip_acc uuid;
    v_org_id uuid; 
    v_total_cost numeric := 0;
    v_unit_cost numeric := 0;
BEGIN
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    IF v_order.status = 'completed' THEN RETURN; END IF;

    v_org_id := v_order.organization_id;
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);

    -- 🛡️ حساب رصيد WIP الحقيقي للأمر
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_accumulated_wip
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE (
        (je.related_document_id = p_order_id AND je.related_document_type IN ('mfg_order', 'mfg_byproduct'))
        OR (je.related_document_type = 'mfg_step' AND je.related_document_id IN (SELECT id FROM public.mfg_order_progress WHERE production_order_id = p_order_id))
        OR (je.related_document_type = 'mfg_material_request' AND je.related_document_id IN (SELECT id FROM public.mfg_material_requests WHERE production_order_id = p_order_id))
        OR (je.related_document_type = 'mfg_scrap' AND je.related_document_id IN (SELECT id FROM public.mfg_order_progress WHERE production_order_id = p_order_id))
    ) AND jl.account_id = v_wip_acc;

    -- استبدال القيد القديم
    DELETE FROM public.journal_entries WHERE related_document_id = p_order_id AND related_document_type = 'mfg_order';

    -- صمام أمان
    IF NOT EXISTS (SELECT 1 FROM public.mfg_order_progress WHERE production_order_id = p_order_id AND status = 'completed')
       AND NOT EXISTS (SELECT 1 FROM public.mfg_material_requests WHERE production_order_id = p_order_id AND status = 'issued') THEN
        RAISE EXCEPTION 'لا يمكن إغلاق أمر إنتاج لم يتم البدء فيه أو صرف مواد له. يرجى إكمال مراحل العمل أو صرف المواد أولاً.';
    END IF;

    -- ضمان وجود مستودع للأمر
    IF v_order.warehouse_id IS NULL THEN
        v_order.warehouse_id := (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1);
        UPDATE public.mfg_production_orders SET warehouse_id = v_order.warehouse_id WHERE id = p_order_id;
    END IF;

    -- معالجة حالة إعادة التشغيل
    IF p_final_status = 'rework' THEN
        UPDATE public.mfg_production_orders 
        SET status = 'in_progress', notes = COALESCE(notes, '') || E'\nإعادة تشغيل جودة: ' || p_qc_notes 
        WHERE id = p_order_id;
        PERFORM public.recalculate_stock_rpc(v_org_id);
        RETURN;
    END IF;

    -- حساب التكلفة الفعلية
    SELECT SUM(COALESCE(labor_cost_actual, 0)) INTO v_total_cost
    FROM public.mfg_order_progress WHERE production_order_id = p_order_id;
    
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate)
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu 
        JOIN public.products p ON amu.raw_material_id = p.id
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    IF p_final_status = 'completed' THEN
        DECLARE
            v_final_cost numeric := COALESCE(NULLIF(v_accumulated_wip, 0), v_total_cost);
        BEGIN
            IF v_order.quantity_to_produce > 0 THEN
                v_unit_cost := ROUND(v_final_cost / v_order.quantity_to_produce, 4);

                -- تحديث متوسط التكلفة المرجح (WAC) للمنتج التام
                UPDATE public.products
                SET weighted_average_cost = v_unit_cost,
                    cost = v_unit_cost,
                    purchase_price = CASE WHEN mfg_type = 'standard' THEN v_unit_cost ELSE purchase_price END
                WHERE id = v_order.product_id AND organization_id = v_org_id;
            END IF;

            -- 🎯 تجميد لقطة التكلفة في سجل أمر الإنتاج
            UPDATE public.mfg_production_orders 
            SET status = 'completed', 
                end_date = now()::date, 
                total_cost_snapshot = v_final_cost,
                unit_cost_snapshot = v_unit_cost,
                notes = COALESCE(notes, '') || E'\nاعتماد جودة نهائي: ' || p_qc_notes 
            WHERE id = p_order_id;
        END;

        UPDATE public.sales_orders
        SET status = 'ready'
        WHERE order_number = v_order.batch_number AND organization_id = v_org_id;
    ELSE
        UPDATE public.mfg_production_orders 
        SET status = 'cancelled', notes = 'مرفوض جودة: ' || p_qc_notes 
        WHERE id = p_order_id;
    END IF;

    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mfg_finalize_order(uuid, text, text, boolean) TO authenticated;
