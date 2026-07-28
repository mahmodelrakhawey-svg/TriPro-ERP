-- Migration: Fix WIP monthly summary labor cost double counting
-- Reason: Prevent SUM(op.labor_cost_actual) from double-counting when a routing step has multiple material usages.

DROP VIEW IF EXISTS public.v_mfg_wip_monthly_summary CASCADE;

CREATE OR REPLACE VIEW public.v_mfg_wip_monthly_summary WITH (security_invoker = true) AS
WITH op_material_costs AS (
    SELECT 
        amu.order_progress_id,
        SUM(COALESCE(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0), 0)) AS material_cost
    FROM public.mfg_actual_material_usage amu
    JOIN public.products rm ON amu.raw_material_id = rm.id
    GROUP BY amu.order_progress_id
)
SELECT 
    to_char(COALESCE(op.actual_end_time, op.actual_start_time, po.created_at), 'YYYY-MM') AS month, 
    p.name AS product_name, 
    wc.name AS work_center_name, 
    po.organization_id,
    COALESCE(SUM(op.labor_cost_actual), 0) AS monthly_labor_cost,
    COALESCE(SUM(omc.material_cost), 0) AS monthly_material_cost,
    (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(omc.material_cost), 0)) AS total_monthly_wip_value
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.mfg_order_progress op ON po.id = op.production_order_id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
LEFT JOIN op_material_costs omc ON op.id = omc.order_progress_id
GROUP BY 1, 2, 3, 4;

GRANT SELECT ON public.v_mfg_wip_monthly_summary TO authenticated;
