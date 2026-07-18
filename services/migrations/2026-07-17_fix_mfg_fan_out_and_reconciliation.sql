-- 🛠️ Migration: Fix Manufacturing Fan-out, Equivalent Units, Cost Reconciliation, and WIP GL Settlement
-- Reason: 
-- 1. Add order_id to v_mfg_production_quantity_report view to allow filtering in React.
-- 2. Redesign v_mfg_equivalent_units to use final step completed units + active steps WIP (preventing double-counting across stages).
-- 3. Redesign v_mfg_cost_reconciliation_report to use actual material/labor costs instead of a hardcoded 70/30 split, and evaluate completed goods based on the final routing step.
-- 4. Redesign v_mfg_wip_monthly_summary and v_mfg_wip_valuation to aggregate materials and labor separately (preventing SQL join fan-out labor multiplication).
-- 5. Fix public.mfg_post_wip_gl_settlement to calculate book WIP balance per-order (not company-wide) and include mfg_scrap/mfg_settlement documents.

-- 1. Redesign v_mfg_production_quantity_report to include order_id
DROP VIEW IF EXISTS public.v_mfg_production_quantity_report CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_production_quantity_report WITH (security_invoker = true) AS
WITH last_step_completed AS (
    SELECT 
        op.production_order_id,
        COALESCE(op.produced_qty, 0) as units_completed
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    WHERE op.status = 'completed'
      AND rs.step_order = (
          SELECT MAX(rs2.step_order) 
          FROM public.mfg_order_progress op2
          JOIN public.mfg_routing_steps rs2 ON op2.step_id = rs2.id
          WHERE op2.production_order_id = op.production_order_id
      )
)
SELECT 
    po.id as order_id,
    po.order_number,
    po.quantity_to_produce as units_started,
    COALESCE(lc.units_completed, 0)::numeric as units_completed,
    CASE 
        WHEN po.status = 'completed' THEN 0 
        ELSE po.quantity_to_produce - COALESCE(lc.units_completed, 0) 
    END::numeric as units_in_wip,
    (SELECT COALESCE(SUM(quantity), 0) FROM public.mfg_scrap_logs sl JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id WHERE op.production_order_id = po.id AND sl.is_abnormal = false) as normal_scrap,
    (SELECT COALESCE(SUM(quantity), 0) FROM public.mfg_scrap_logs sl JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id WHERE op.production_order_id = po.id AND sl.is_abnormal = true) as abnormal_scrap,
    po.organization_id
FROM public.mfg_production_orders po
LEFT JOIN last_step_completed lc ON po.id = lc.production_order_id;


-- 2. Redesign v_mfg_equivalent_units to avoid double-counting
DROP VIEW IF EXISTS public.v_mfg_equivalent_units CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_equivalent_units WITH (security_invoker = true) AS
WITH last_step_completed AS (
    SELECT 
        op.production_order_id,
        COALESCE(op.produced_qty, 0) as units_completed
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    WHERE op.status = 'completed'
      AND rs.step_order = (
          SELECT MAX(rs2.step_order) 
          FROM public.mfg_order_progress op2
          JOIN public.mfg_routing_steps rs2 ON op2.step_id = rs2.id
          WHERE op2.production_order_id = op.production_order_id
      )
),
wip_active AS (
    SELECT 
        op.production_order_id,
        SUM(op.produced_qty * (op.material_completion_pct / 100.0)) as wip_material_eq,
        SUM(op.produced_qty * (op.conversion_completion_pct / 100.0)) as wip_conversion_eq
    FROM public.mfg_order_progress op
    WHERE op.status = 'active'
    GROUP BY op.production_order_id
)
SELECT 
    po.id as order_id,
    po.order_number,
    COALESCE(lc.units_completed, 0) + COALESCE(wa.wip_material_eq, 0) + COALESCE((SELECT COUNT(*) FROM public.mfg_batch_serials WHERE production_order_id = po.id AND status = 'wip'), 0) as total_material_eq_units,
    COALESCE(lc.units_completed, 0) + COALESCE(wa.wip_conversion_eq, 0) + COALESCE((SELECT COUNT(*) FROM public.mfg_batch_serials WHERE production_order_id = po.id AND status = 'wip'), 0) as total_conversion_eq_units,
    po.organization_id
FROM public.mfg_production_orders po
LEFT JOIN last_step_completed lc ON po.id = lc.production_order_id
LEFT JOIN wip_active wa ON po.id = wa.production_order_id;


-- 3. Redesign v_mfg_cost_reconciliation_report (Use actuals, not 70/30 split)
DROP VIEW IF EXISTS public.v_mfg_cost_reconciliation_report CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_cost_reconciliation_report WITH (security_invoker = true) AS
WITH period_costs AS (
    SELECT 
        vop.order_id,
        COALESCE(bw.material_cost_bf, 0) + COALESCE(vop.actual_material, 0) as total_material_to_account,
        COALESCE(bw.conversion_cost_bf, 0) + COALESCE(vop.actual_labor, 0) as total_conversion_to_account,
        COALESCE(vop.total_actual_cost, 0) + COALESCE(bw.material_cost_bf, 0) + COALESCE(bw.conversion_cost_bf, 0) as grand_total_to_account
    FROM public.v_mfg_order_profitability vop
    LEFT JOIN public.mfg_beginning_wip_inventory bw ON vop.order_id = bw.order_id
),
eq_units AS ( SELECT * FROM public.v_mfg_equivalent_units ),
unit_cost_calc AS (
    SELECT 
        pc.order_id,
        CASE WHEN eu.total_material_eq_units > 0 THEN pc.total_material_to_account / eu.total_material_eq_units ELSE 0 END as unit_cost_mat,
        CASE WHEN eu.total_conversion_eq_units > 0 THEN pc.total_conversion_to_account / eu.total_conversion_eq_units ELSE 0 END as unit_cost_conv,
        pc.grand_total_to_account
    FROM period_costs pc
    JOIN eq_units eu ON pc.order_id = eu.order_id
),
allocation AS (
    SELECT 
        ucc.order_id,
        ucc.grand_total_to_account,
        ucc.unit_cost_mat,
        ucc.unit_cost_conv,
        -- Completed Goods evaluation using final step completed quantity
        COALESCE((
            SELECT SUM(op.produced_qty * (ucc.unit_cost_mat + ucc.unit_cost_conv))
            FROM public.mfg_order_progress op
            JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
            WHERE op.production_order_id = ucc.order_id 
              AND op.status = 'completed'
              AND rs.step_order = (
                  SELECT MAX(rs2.step_order) 
                  FROM public.mfg_order_progress op2
                  JOIN public.mfg_routing_steps rs2 ON op2.step_id = rs2.id
                  WHERE op2.production_order_id = op.production_order_id
              )
        ), 0) as cost_finished,
        -- Ending WIP evaluation
        COALESCE((
            SELECT SUM(
                (produced_qty * (material_completion_pct/100) * ucc.unit_cost_mat) +
                (produced_qty * (conversion_completion_pct/100) * ucc.unit_cost_conv)
            )
            FROM public.mfg_order_progress WHERE production_order_id = ucc.order_id AND status = 'active'
        ), 0) as cost_wip,
        -- Abnormal Scrap evaluation
        COALESCE((
            SELECT SUM(sl.quantity * (ucc.unit_cost_mat + ucc.unit_cost_conv))
            FROM public.mfg_scrap_logs sl
            JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id
            WHERE op.production_order_id = ucc.order_id AND sl.is_abnormal = true
        ), 0) as cost_abnormal
    FROM unit_cost_calc ucc
)
SELECT 
    po.id as order_id,
    po.order_number,
    p.name as product_name,
    a.grand_total_to_account as total_to_account_for,
    ROUND(a.cost_finished, 2) as cost_assigned_to_finished_goods,
    ROUND(a.cost_wip, 2) as cost_assigned_to_wip,
    ROUND(a.cost_abnormal, 2) as cost_assigned_to_abnormal_scrap,
    ROUND(a.cost_finished + a.cost_wip + a.cost_abnormal, 2) as total_accounted_for,
    (a.unit_cost_mat + a.unit_cost_conv) as actual_unit_cost,
    a.unit_cost_mat as cost_per_material_eq,
    a.unit_cost_conv as cost_per_conversion_eq,
    po.organization_id
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN allocation a ON po.id = a.order_id;


-- 4. Redesign v_mfg_wip_monthly_summary to avoid join fan-out labor cost duplication
DROP VIEW IF EXISTS public.v_mfg_wip_monthly_summary CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_monthly_summary WITH (security_invoker = true) AS
WITH labor_by_op AS (
    SELECT 
        op.id AS progress_id,
        po.id AS production_order_id,
        to_char(COALESCE(op.actual_end_time, op.actual_start_time, po.created_at), 'YYYY-MM') AS month,
        p.name AS product_name,
        wc.name AS work_center_name,
        po.organization_id,
        COALESCE(op.labor_cost_actual, 0) AS labor_cost
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    JOIN public.mfg_order_progress op ON po.id = op.production_order_id
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
),
material_by_op AS (
    SELECT 
        op.id AS progress_id,
        COALESCE(SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0)), 0) AS material_cost
    FROM public.mfg_order_progress op
    JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
    JOIN public.products rm ON amu.raw_material_id = rm.id
    GROUP BY op.id
)
SELECT 
    l.month,
    l.product_name,
    l.work_center_name,
    l.organization_id,
    SUM(l.labor_cost) AS monthly_labor_cost,
    SUM(COALESCE(m.material_cost, 0)) AS monthly_material_cost,
    (SUM(l.labor_cost) + SUM(COALESCE(m.material_cost, 0))) AS total_monthly_wip_value
FROM labor_by_op l
LEFT JOIN material_by_op m ON l.progress_id = m.progress_id
GROUP BY l.month, l.product_name, l.work_center_name, l.organization_id;


-- 5. Redesign v_mfg_wip_valuation to avoid join fan-out labor cost duplication
DROP VIEW IF EXISTS public.v_mfg_wip_valuation CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_valuation WITH (security_invoker = true) AS
WITH request_costs AS (
    SELECT mr.production_order_id,
           SUM(mri.quantity_issued * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)) as total_request
    FROM public.mfg_material_request_items mri
    JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
    JOIN public.products p ON mri.raw_material_id = p.id
    WHERE mr.status = 'issued' AND mr.organization_id = public.get_my_org()
    GROUP BY mr.production_order_id
),
labor_by_order AS (
    SELECT 
        op.production_order_id,
        SUM(COALESCE(op.labor_cost_actual, 0)) AS total_labor_cost
    FROM public.mfg_order_progress op
    GROUP BY op.production_order_id
),
material_by_order AS (
    SELECT 
        op.production_order_id,
        SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0)) AS total_material_cost
    FROM public.mfg_order_progress op
    JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
    JOIN public.products rm ON amu.raw_material_id = rm.id
    GROUP BY op.production_order_id
)
SELECT po.id AS production_order_id, po.order_number, p.name AS product_name, po.quantity_to_produce, po.status, po.organization_id,
       COALESCE(l.total_labor_cost, 0) AS total_labor_cost_incurred,
       (COALESCE(m.total_material_cost, 0) + COALESCE(rc.total_request, 0)) AS total_material_cost_incurred,
       (COALESCE(l.total_labor_cost, 0) + COALESCE(m.total_material_cost, 0) + COALESCE(rc.total_request, 0)) AS total_wip_value
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN labor_by_order l ON po.id = l.production_order_id
LEFT JOIN material_by_order m ON po.id = m.production_order_id
LEFT JOIN request_costs rc ON po.id = rc.production_order_id
WHERE po.status = 'in_progress';


-- 6. Redefine mfg_post_wip_gl_settlement to filter WIP balance by order and include all document types
CREATE OR REPLACE FUNCTION public.mfg_post_wip_gl_settlement(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_recon record; v_org_id uuid; v_je_id uuid; v_mappings jsonb;
    v_wip_acc uuid; v_variance_acc uuid; v_gl_wip_balance numeric; v_calculated_wip numeric; v_diff numeric;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.mfg_production_orders WHERE id = p_order_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    v_wip_acc := public.resolve_leaf_account((v_mappings->>'INVENTORY_WIP')::uuid);
    v_variance_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WIP_VARIANCE_ACCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1)));

    -- Calculate current general ledger WIP balance SPECIFICALLY for this production order
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_gl_wip_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE jl.account_id = v_wip_acc
      AND jl.organization_id = v_org_id
      AND (
          (je.related_document_id = p_order_id AND je.related_document_type IN ('mfg_order', 'mfg_byproduct', 'mfg_settlement'))
          OR (je.related_document_type = 'mfg_step' AND je.related_document_id IN (SELECT id FROM public.mfg_order_progress WHERE production_order_id = p_order_id))
          OR (je.related_document_type = 'mfg_material_request' AND je.related_document_id IN (SELECT id FROM public.mfg_material_requests WHERE production_order_id = p_order_id))
          OR (je.related_document_type = 'mfg_scrap' AND je.related_document_id IN (SELECT id FROM public.mfg_order_progress WHERE production_order_id = p_order_id))
      );

    -- Get calculated WIP value from Process Costing report
    SELECT cost_assigned_to_wip INTO v_calculated_wip 
    FROM public.v_mfg_cost_reconciliation_report WHERE order_id = p_order_id;

    v_diff := v_calculated_wip - v_gl_wip_balance;

    IF ABS(v_diff) < 1 THEN RETURN NULL; END IF;

    -- Create GL settlement entry
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'قيد تسوية انحراف تكاليف WIP - أمر رقم ' || (SELECT order_number FROM public.mfg_production_orders WHERE id = p_order_id), 'WIP-SETTLE', 'posted', v_org_id, true, p_order_id, 'mfg_settlement')
    RETURNING id INTO v_je_id;

    IF v_diff > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, v_diff, 0, 'تسوية زيادة قيمة WIP فعلياً', v_org_id),
               (v_je_id, v_variance_acc, 0, v_diff, 'إثبات انحراف تكاليف ملائم', v_org_id);
    ELSE
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_variance_acc, ABS(v_diff), 0, 'تحميل انحراف تكاليف غير ملائم', v_org_id),
               (v_je_id, v_wip_acc, 0, ABS(v_diff), 'تعديل قيمة WIP دفترياً', v_org_id);
    END IF;

    RETURN v_je_id;
END; $$;


-- 7. Grant Select and Execute Permissions & Reload PostgREST cache
GRANT SELECT ON public.v_mfg_production_quantity_report TO authenticated;
GRANT SELECT ON public.v_mfg_equivalent_units TO authenticated;
GRANT SELECT ON public.v_mfg_cost_reconciliation_report TO authenticated;
GRANT SELECT ON public.v_mfg_wip_monthly_summary TO authenticated;
GRANT SELECT ON public.v_mfg_wip_valuation TO authenticated;

NOTIFY pgrst, 'reload config';
