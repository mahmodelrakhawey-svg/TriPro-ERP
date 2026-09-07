-- Migration: Fix Manufacturing Reports (Turnover, Unit Cost Anatomy, Stage Costs, Overhead Allocation, and Monthly WIP Summary)
-- Reason: Use purchase_price as fallback when weighted_average_cost and cost are 0, use UOM conversions for accurate material cost calculation, and use planned quantity as denominator for finished unit cost anatomy. Re-create journal_lines_view with security_invoker = true to enforce RLS. Fix actual overhead allocation to use mfg WIP and a dedicated applied overhead account. Fix Monthly WIP Summary view to show completed orders and use fallback costing.

-- 1. Recreate journal_lines_view WITH (security_invoker = true)
DROP VIEW IF EXISTS public.journal_lines_view CASCADE;
CREATE OR REPLACE VIEW public.journal_lines_view WITH (security_invoker = true) AS
SELECT 
    jl.id,
    jl.journal_entry_id,
    jl.account_id,
    jl.debit,
    jl.credit,
    (jl.debit - jl.credit) as balance,
    jl.description as line_description,
    je.transaction_date,
    je.reference,
    je.description as entry_description,
    je.status,
    je.organization_id,
    je.related_document_id,
    je.related_document_type,
    a.code as account_code,
    a.name as account_name,
    a.type as account_type
FROM public.journal_lines jl
JOIN public.journal_entries je ON jl.journal_entry_id = je.id
JOIN public.accounts a ON jl.account_id = a.id;


-- 2. Recreate Unit Cost Anatomy View
DROP VIEW IF EXISTS public.v_mfg_unit_cost_anatomy CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_unit_cost_anatomy WITH (security_invoker = true) AS
WITH mat_totals AS (
    SELECT 
        po.id as order_id,
        COALESCE(bc.material_cost_bf, 0) + 
        COALESCE((
            SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
            FROM public.mfg_actual_material_usage amu
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE op.production_order_id = po.id
        ), 0) as total_mat
    FROM public.mfg_production_orders po
    LEFT JOIN public.mfg_beginning_wip_inventory bc ON po.id = bc.order_id
),
conv_totals AS (
    SELECT 
        po.id as order_id,
        -- الأجور الفعلية المسحوبة من مديول الرواتب
        COALESCE((SELECT SUM(labor_cost_actual) FROM public.mfg_order_progress WHERE production_order_id = po.id), 0) as total_lab,
        -- الأعباء الصناعية المحملة (أول مدة + الحالي)
        COALESCE(bc.conversion_cost_bf, 0) + 
        COALESCE((
            SELECT SUM((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate)
            FROM public.mfg_order_progress op
            JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
            JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
            WHERE op.production_order_id = po.id
        ), 0) as total_ovh
    FROM public.mfg_production_orders po
    LEFT JOIN public.mfg_beginning_wip_inventory bc ON po.id = bc.order_id
)
SELECT 
    po.id as order_id,
    po.order_number,
    p.name as product_name,
    COALESCE(ROUND(mt.total_mat / NULLIF(po.quantity_to_produce, 0), 2), 0) as material_unit_cost,
    COALESCE(ROUND(ct.total_lab / NULLIF(po.quantity_to_produce, 0), 2), 0) as labor_unit_cost,
    COALESCE(ROUND(ct.total_ovh / NULLIF(po.quantity_to_produce, 0), 2), 0) as overhead_unit_cost,
    COALESCE(ROUND(
        (mt.total_mat + ct.total_lab + ct.total_ovh) / NULLIF(po.quantity_to_produce, 0)
    , 2), 0) as total_actual_unit_cost,
    COALESCE(public.mfg_calculate_standard_cost(p.id, p.organization_id), 0) as standard_unit_cost,
    po.organization_id
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN mat_totals mt ON po.id = mt.order_id
JOIN conv_totals ct ON po.id = ct.order_id;


-- 3. Recreate Raw Material Turnover Function
CREATE OR REPLACE FUNCTION public.mfg_calculate_raw_material_turnover(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_usage_val numeric;
    v_stock_val numeric;
BEGIN
    -- حساب إجمالي قيمة المواد الخام المستهلكة فعلياً في الفترة للمنظمة بالكامل
    SELECT COALESCE(SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)), 0) 
    INTO v_usage_val
    FROM public.mfg_actual_material_usage amu
    JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
    JOIN public.products p ON amu.raw_material_id = p.id
    WHERE op.organization_id = p_org_id
      AND op.actual_end_time::date BETWEEN p_start_date AND p_end_date;

    -- حساب إجمالي قيمة مخزون المواد الخام الحالي للمنظمة
    SELECT COALESCE(SUM(stock * COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0)), 0) 
    INTO v_stock_val 
    FROM public.products 
    WHERE organization_id = p_org_id AND mfg_type = 'raw';

    RETURN CASE WHEN v_stock_val > 0 THEN ROUND(v_usage_val / v_stock_val, 2) ELSE 0 END;
END; $$;


-- 4. Recreate Stage Cost Ledger Function
CREATE OR REPLACE FUNCTION public.mfg_get_stage_cost_ledger(p_order_id uuid)
RETURNS TABLE (
    stage_name text,
    material_cost numeric,
    labor_cost numeric,
    overhead_cost numeric,
    total_stage_cost numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- نقوم بمزامنة الأجور أولاً قبل جلب التقرير لضمان أحدث البيانات من HR
    PERFORM public.mfg_sync_actual_labor_costs(p_order_id);
    
    RETURN QUERY
    SELECT 
        rs.operation_name,
        -- خامات المرحلة
        COALESCE((SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) 
                  FROM public.mfg_actual_material_usage amu 
                  JOIN public.products p ON amu.raw_material_id = p.id 
                  WHERE amu.order_progress_id = op.id), 0) as material_cost,
        -- الأجور الفعلية المسحوبة من HR
        COALESCE(op.labor_cost_actual, 0) as labor_cost,
        -- مصاريف صناعية (الأعباء لا تزال تُحمل بناءً على معدل مركز العمل)
        ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as overhead_cost,
        -- الإجمالي الكلي للمرحلة
        ROUND(
            COALESCE((SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) FROM public.mfg_actual_material_usage amu JOIN public.products p ON amu.raw_material_id = p.id WHERE amu.order_progress_id = op.id), 0) +
            COALESCE(op.labor_cost_actual, 0) +
            COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)
        , 2) as total_stage_cost
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE op.production_order_id = p_order_id;
END; $$;


-- 5. Recreate Advanced Scrap Function
CREATE OR REPLACE FUNCTION public.mfg_record_scrap_advanced(p_progress_id uuid, p_material_id uuid, p_qty numeric, p_is_abnormal boolean, p_salvage_value numeric DEFAULT 0, p_reason text DEFAULT NULL) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_cost_per_unit numeric; v_je_id uuid; v_mappings jsonb; v_wip_acc uuid; v_loss_acc uuid; v_scrap_inv_acc uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0) INTO v_cost_per_unit FROM public.products WHERE id = p_material_id;
    INSERT INTO public.mfg_scrap_logs (order_progress_id, product_id, quantity, is_abnormal, salvage_value_per_unit, reason, organization_id) VALUES (p_progress_id, p_material_id, p_qty, p_is_abnormal, p_salvage_value, p_reason, v_org_id);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_leaf_account((v_mappings->>'INVENTORY_WIP')::uuid);
    v_loss_acc := public.resolve_leaf_account((SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1));
    v_scrap_inv_acc := public.resolve_leaf_account((SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '124%' AND is_group = false ORDER BY code DESC LIMIT 1));

    IF p_is_abnormal THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type)
        VALUES (now()::date, 'إثبات تالف غير مسموح - ' || p_reason, 'ABN-SCRAP', 'posted', v_org_id, p_progress_id, 'mfg_scrap') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_loss_acc, (p_qty * (v_cost_per_unit - p_salvage_value)), 0, v_org_id);
        IF p_salvage_value > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_scrap_inv_acc, (p_qty * p_salvage_value), 0, v_org_id); END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_wip_acc, 0, (p_qty * v_cost_per_unit), v_org_id);
    ELSIF p_salvage_value > 0 THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type)
        VALUES (now()::date, 'قيمة استردادية لتالف مسموح', 'NORM-SCRAP', 'posted', v_org_id, p_progress_id, 'mfg_scrap') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_scrap_inv_acc, (p_qty * p_salvage_value), 0, v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_wip_acc, 0, (p_qty * p_salvage_value), v_org_id);
    END IF;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;


-- 6. Recreate Detailed Stage Variance Report Function
CREATE OR REPLACE FUNCTION public.mfg_get_stage_variance_report(p_order_id uuid)
RETURNS TABLE (
    stage_name text,
    actual_material numeric,
    standard_material numeric,
    material_variance numeric,
    actual_labor numeric,
    standard_labor numeric,
    labor_variance numeric,
    actual_overhead numeric,
    standard_overhead numeric,
    overhead_variance numeric,
    total_actual numeric,
    total_standard numeric,
    total_variance numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH stage_stats AS (
        SELECT 
            rs.operation_name as s_name,
            -- التكاليف الفعلية
            COALESCE((SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) 
                      FROM public.mfg_actual_material_usage amu 
                      JOIN public.products p ON amu.raw_material_id = p.id 
                      WHERE amu.order_progress_id = op.id), 0) as act_mat,
            COALESCE(op.labor_cost_actual, 0) as act_lab,
            ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as act_ovh,
            -- التكاليف المعيارية المسموح بها (Standard Allowed for Actual Output)
            COALESCE((SELECT SUM(public.uom_convert(sm.quantity_required * op.produced_qty, sm.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
                      FROM public.mfg_step_materials sm
                      JOIN public.products p ON sm.raw_material_id = p.id
                      WHERE sm.step_id = rs.id), 0) as std_mat,
            ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.hourly_rate, 0), 2) as std_lab,
            ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as std_ovh
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = p_order_id
    )
    SELECT 
        s_name,
        act_mat, std_mat, (act_mat - std_mat),
        act_lab, std_lab, (act_lab - std_lab),
        act_ovh, std_ovh, (act_ovh - std_ovh),
        (act_mat + act_lab + act_ovh), (std_mat + std_lab + std_ovh),
        ((act_mat + act_lab + act_ovh) - (std_mat + std_lab + std_ovh))
    FROM stage_stats;
END; $$;


-- 7. Helper to resolve mfg applied overhead account
CREATE OR REPLACE FUNCTION public.resolve_mfg_applied_overhead_account(p_org_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_parent_id uuid;
    v_acc_id uuid;
BEGIN
    SELECT id INTO v_parent_id FROM public.accounts 
    WHERE code = '514' AND organization_id = p_org_id LIMIT 1;
    
    IF v_parent_id IS NULL THEN
        SELECT id INTO v_parent_id FROM public.accounts 
        WHERE (name = 'تكاليف صناعية غير مباشرة' OR code = '514') AND organization_id = p_org_id LIMIT 1;
    END IF;
    
    IF v_parent_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    SELECT id INTO v_acc_id FROM public.accounts
    WHERE parent_id = v_parent_id 
      AND (code = '514-applied' OR name = 'أعباء صناعية محملة (موزعة)')
      AND organization_id = p_org_id LIMIT 1;
      
    IF v_acc_id IS NULL THEN
        INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
        VALUES (p_org_id, 'أعباء صناعية محملة (موزعة)', '514-applied', v_parent_id, 'expense', true, false)
        RETURNING id INTO v_acc_id;
    END IF;
    
    RETURN v_acc_id;
END; $$;


-- 8. Recreate mfg_allocate_actual_overhead function with proper WIP and Applied accounts
CREATE OR REPLACE FUNCTION public.mfg_allocate_actual_overhead(p_period_start date, p_period_end date, p_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid := public.get_my_org();
    v_total_actual_overhead numeric;
    v_total_eq_units numeric;
    v_overhead_per_unit numeric;
    v_je_id uuid;
    v_wip_acc uuid;
    v_applied_ovh_acc uuid;
BEGIN
    -- 1. حساب إجمالي المصاريف الصناعية غير المباشرة الفعلية (أكواد تبدأ بـ 514)
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_total_actual_overhead
    FROM public.journal_lines_view 
    WHERE organization_id = v_org_id AND account_code LIKE '514%' 
    AND account_code != '514-applied'
    AND transaction_date BETWEEN p_period_start AND p_period_end
    AND (related_document_type IS NULL OR related_document_type != 'mfg_overhead');

    -- 2. حساب إجمالي وحدات التحويل المعادلة لكافة الأوامر النشطة في الفترة
    SELECT SUM(total_conversion_eq_units) INTO v_total_eq_units 
    FROM public.v_mfg_equivalent_units WHERE organization_id = v_org_id;

    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);
    v_applied_ovh_acc := public.resolve_mfg_applied_overhead_account(v_org_id);

    IF v_total_eq_units > 0 AND v_total_actual_overhead > 0 AND v_wip_acc IS NOT NULL AND v_applied_ovh_acc IS NOT NULL THEN
        v_overhead_per_unit := v_total_actual_overhead / v_total_eq_units;

        -- 4. إنشاء قيد التوزيع في الأستاذ العام
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_type)
        VALUES (p_period_end, 'توزيع أعباء صناعية فعلية: ' || p_description, 'OVH-ALLOC', 'posted', v_org_id, true, 'mfg_overhead')
        RETURNING id INTO v_je_id;

        -- تحميل الـ WIP (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_wip_acc, v_total_actual_overhead, 0, v_org_id, 'تحميل المصاريف الفعلية على الإنتاج');

        -- إقفال حساب الأعباء الموزعة أو المصاريف (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_applied_ovh_acc, 0, v_total_actual_overhead, v_org_id, 'إقفال حساب الأعباء الموزعة');

        RETURN v_je_id;
    END IF;
    RETURN NULL;
END; $$;


-- 9. Recreate Monthly WIP Summary View (historical summary including completed orders + fallback costing)
DROP VIEW IF EXISTS public.v_mfg_wip_monthly_summary CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_monthly_summary WITH (security_invoker = true) AS
SELECT to_char(COALESCE(op.actual_end_time, op.actual_start_time, po.created_at), 'YYYY-MM') AS month, p.name AS product_name, wc.name AS work_center_name, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS monthly_labor_cost,
       COALESCE(SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0)), 0) AS monthly_material_cost,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0)), 0)) AS total_monthly_wip_value
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.mfg_order_progress op ON po.id = op.production_order_id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
LEFT JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id
GROUP BY 1, 2, 3, 4;


-- 10. Grant Select permissions
GRANT SELECT ON public.journal_lines_view TO authenticated;
GRANT SELECT ON public.v_mfg_unit_cost_anatomy TO authenticated;
GRANT SELECT ON public.v_mfg_wip_monthly_summary TO authenticated;
