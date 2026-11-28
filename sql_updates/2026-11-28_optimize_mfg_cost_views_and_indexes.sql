-- ==============================================================================
-- 🚀 Migration: Optimize Manufacturing Cost Views & Missing Indexes (Fix 57014 Timeout)
-- Date: 2026-11-28
-- Reason:
-- 1. Add missing composite indexes on manufacturing tables so organization_id and
--    order_id filters use index scans instead of full-table scans.
-- 2. Mark read-only helpers uom_convert and mfg_calculate_standard_cost as STABLE.
-- 3. Rewrite v_mfg_order_profitability, v_mfg_equivalent_units, and
--    v_mfg_cost_reconciliation_report using LATERAL joins anchored on
--    mfg_production_orders so PostgREST filters (organization_id / order_id) push
--    down before evaluating PL/pgSQL functions and aggregations.
-- 4. Recreate v_mfg_unit_cost_variance and v_mfg_cost_trends (previously dropped
--    by CASCADE in earlier migrations) with lightweight cost-trend aggregation.
-- ==============================================================================

-- 1. Manufacturing & Costing Performance Indexes
CREATE INDEX IF NOT EXISTS idx_mfg_production_orders_org_created
    ON public.mfg_production_orders(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfg_order_progress_order_status
    ON public.mfg_order_progress(production_order_id, status);

CREATE INDEX IF NOT EXISTS idx_mfg_actual_material_usage_progress
    ON public.mfg_actual_material_usage(order_progress_id, raw_material_id);

CREATE INDEX IF NOT EXISTS idx_mfg_material_requests_order_status
    ON public.mfg_material_requests(production_order_id, status);

CREATE INDEX IF NOT EXISTS idx_mfg_material_request_items_req
    ON public.mfg_material_request_items(material_request_id, raw_material_id);

CREATE INDEX IF NOT EXISTS idx_mfg_scrap_logs_progress_abnormal
    ON public.mfg_scrap_logs(order_progress_id, is_abnormal);

CREATE INDEX IF NOT EXISTS idx_mfg_byproducts_logs_progress
    ON public.mfg_byproducts_logs(order_progress_id);

CREATE INDEX IF NOT EXISTS idx_mfg_batch_serials_order_status
    ON public.mfg_batch_serials(production_order_id, status);

CREATE INDEX IF NOT EXISTS idx_mfg_beginning_wip_order
    ON public.mfg_beginning_wip_inventory(order_id);

CREATE INDEX IF NOT EXISTS idx_mfg_routings_product_org_default
    ON public.mfg_routings(product_id, organization_id, is_default)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bill_of_materials_prod_org
    ON public.bill_of_materials(product_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date_id_desc
    ON public.journal_entries(organization_id, transaction_date DESC, id DESC);


-- 2. Mark read-only costing helper functions as STABLE to enable query-plan caching & pushdown
ALTER FUNCTION public.uom_convert(numeric, uuid, uuid) STABLE;
ALTER FUNCTION public.mfg_calculate_standard_cost(uuid, uuid) STABLE;


-- 3. Optimized v_mfg_order_profitability (LATERAL per production order + set-based UOM conversion)
DROP VIEW IF EXISTS public.v_mfg_order_profitability CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_order_profitability WITH (security_invoker = true) AS
SELECT
    po.id AS order_id,
    po.order_number,
    p.name AS product_name,
    po.quantity_to_produce AS qty,
    po.status,
    po.organization_id,
    (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) AS sales_value,
    ROUND(po.quantity_to_produce * COALESCE(sc.std_cost_per_unit, 0), 2) AS estimated_cost,
    ROUND(COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0), 2) AS actual_labor,
    ROUND(COALESCE(ms.total_material_cost, 0), 2) AS actual_material,
    ROUND(
        COALESCE(ls.total_labor, 0)
        + COALESCE(ls.total_overhead, 0)
        + COALESCE(ms.total_material_cost, 0)
        - COALESCE(bs.total_byproduct_value, 0),
        2
    ) AS total_actual_cost,
    ROUND(
        (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0))
        - COALESCE(
            NULLIF(
                COALESCE(ls.total_labor, 0)
                + COALESCE(ls.total_overhead, 0)
                + COALESCE(ms.total_material_cost, 0)
                - COALESCE(bs.total_byproduct_value, 0),
                0
            ),
            po.quantity_to_produce * sc.std_cost_per_unit,
            0
        ),
        2
    ) AS net_profit,
    CASE
        WHEN (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) > 0
        THEN ROUND(
            (
                (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0))
                - COALESCE(
                    NULLIF(
                        COALESCE(ls.total_labor, 0)
                        + COALESCE(ls.total_overhead, 0)
                        + COALESCE(ms.total_material_cost, 0)
                        - COALESCE(bs.total_byproduct_value, 0),
                        0
                    ),
                    po.quantity_to_produce * sc.std_cost_per_unit,
                    0
                )
            ) / (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) * 100,
            2
        )
        ELSE 0
    END AS margin_percentage
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN LATERAL (
    SELECT
        CASE
            WHEN p.mfg_type = 'standard' THEN public.mfg_calculate_standard_cost(p.id, p.organization_id)
            ELSE NULL
        END AS std_cost_per_unit
) sc ON true
LEFT JOIN LATERAL (
    SELECT
        SUM(COALESCE(op.labor_cost_actual, 0)) AS total_labor,
        SUM(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)) AS total_overhead
    FROM public.mfg_order_progress op
    LEFT JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE op.production_order_id = po.id
) ls ON true
LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(cost), 0) AS total_material_cost
    FROM (
        SELECT
            ROUND(
                (
                    amu.actual_quantity * COALESCE(
                        CASE
                            WHEN amu.uom_id IS NULL OR rm.base_uom_id IS NULL OR amu.uom_id = rm.base_uom_id THEN 1.0
                            WHEN u_from.uom_type = 'smaller' THEN 1.0 / NULLIF(u_from.ratio, 0)
                            ELSE u_from.ratio
                        END,
                        1.0
                    )
                ) / COALESCE(
                    CASE
                        WHEN amu.uom_id IS NULL OR rm.base_uom_id IS NULL OR amu.uom_id = rm.base_uom_id THEN 1.0
                        WHEN u_to.uom_type = 'smaller' THEN 1.0 / NULLIF(u_to.ratio, 0)
                        ELSE u_to.ratio
                    END,
                    1.0
                ),
                4
            ) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0) AS cost
        FROM public.mfg_order_progress op
        JOIN public.mfg_actual_material_usage amu ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        LEFT JOIN public.uoms u_from ON amu.uom_id = u_from.id
        LEFT JOIN public.uoms u_to ON rm.base_uom_id = u_to.id
        WHERE op.production_order_id = po.id
        UNION ALL
        SELECT
            mri.quantity_issued * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0) AS cost
        FROM public.mfg_material_requests mr
        JOIN public.mfg_material_request_items mri ON mri.material_request_id = mr.id
        JOIN public.products rm ON mri.raw_material_id = rm.id
        WHERE mr.production_order_id = po.id
          AND mr.status = 'issued'
          AND NOT EXISTS (
              SELECT 1
              FROM public.mfg_order_progress op2
              JOIN public.mfg_actual_material_usage amu2 ON op2.id = amu2.order_progress_id
              WHERE op2.production_order_id = po.id
                AND amu2.raw_material_id = mri.raw_material_id
          )
    ) safe_mats
) ms ON true
LEFT JOIN LATERAL (
    SELECT SUM(bl.quantity * bl.market_value_per_unit) AS total_byproduct_value
    FROM public.mfg_order_progress op
    JOIN public.mfg_byproducts_logs bl ON bl.order_progress_id = op.id
    WHERE op.production_order_id = po.id
) bs ON true;


-- 4. Optimized v_mfg_equivalent_units (LATERAL per production order)
DROP VIEW IF EXISTS public.v_mfg_equivalent_units CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_equivalent_units WITH (security_invoker = true) AS
SELECT
    po.id AS order_id,
    po.order_number,
    COALESCE(lc.units_completed, 0) + COALESCE(wa.wip_material_eq, 0) + COALESCE(bs.wip_serials, 0) AS total_material_eq_units,
    COALESCE(lc.units_completed, 0) + COALESCE(wa.wip_conversion_eq, 0) + COALESCE(bs.wip_serials, 0) AS total_conversion_eq_units,
    po.organization_id
FROM public.mfg_production_orders po
LEFT JOIN LATERAL (
    SELECT COALESCE(op.produced_qty, 0) AS units_completed
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    WHERE op.production_order_id = po.id
      AND op.status = 'completed'
      AND rs.step_order = (
          SELECT MAX(rs2.step_order)
          FROM public.mfg_order_progress op2
          JOIN public.mfg_routing_steps rs2 ON op2.step_id = rs2.id
          WHERE op2.production_order_id = po.id
      )
    LIMIT 1
) lc ON true
LEFT JOIN LATERAL (
    SELECT
        SUM(op.produced_qty * (op.material_completion_pct / 100.0)) AS wip_material_eq,
        SUM(op.produced_qty * (op.conversion_completion_pct / 100.0)) AS wip_conversion_eq
    FROM public.mfg_order_progress op
    WHERE op.production_order_id = po.id
      AND op.status = 'active'
) wa ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS wip_serials
    FROM public.mfg_batch_serials mbs
    WHERE mbs.production_order_id = po.id
      AND mbs.status = 'wip'
) bs ON true;


-- 5. Optimized v_mfg_cost_reconciliation_report (LATERAL per production order)
DROP VIEW IF EXISTS public.v_mfg_cost_reconciliation_report CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_cost_reconciliation_report WITH (security_invoker = true) AS
SELECT
    po.id AS order_id,
    po.order_number,
    p.name AS product_name,
    uc.grand_total_to_account AS total_to_account_for,
    ROUND(COALESCE(alloc.cost_finished, 0), 2) AS cost_assigned_to_finished_goods,
    ROUND(COALESCE(alloc.cost_wip, 0), 2) AS cost_assigned_to_wip,
    ROUND(COALESCE(alloc.cost_abnormal, 0), 2) AS cost_assigned_to_abnormal_scrap,
    ROUND(COALESCE(alloc.cost_finished, 0) + COALESCE(alloc.cost_wip, 0) + COALESCE(alloc.cost_abnormal, 0), 2) AS total_accounted_for,
    (uc.unit_cost_mat + uc.unit_cost_conv) AS actual_unit_cost,
    uc.unit_cost_mat AS cost_per_material_eq,
    uc.unit_cost_conv AS cost_per_conversion_eq,
    po.organization_id
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN public.mfg_beginning_wip_inventory bw ON po.id = bw.order_id
JOIN public.v_mfg_order_profitability vop ON po.id = vop.order_id
JOIN public.v_mfg_equivalent_units eu ON po.id = eu.order_id
CROSS JOIN LATERAL (
    SELECT
        COALESCE(bw.material_cost_bf, 0) + COALESCE(vop.actual_material, 0) AS total_material_to_account,
        COALESCE(bw.conversion_cost_bf, 0) + COALESCE(vop.actual_labor, 0) AS total_conversion_to_account,
        COALESCE(vop.total_actual_cost, 0) + COALESCE(bw.material_cost_bf, 0) + COALESCE(bw.conversion_cost_bf, 0) AS grand_total_to_account
) pc
CROSS JOIN LATERAL (
    SELECT
        CASE WHEN eu.total_material_eq_units > 0 THEN pc.total_material_to_account / eu.total_material_eq_units ELSE 0 END AS unit_cost_mat,
        CASE WHEN eu.total_conversion_eq_units > 0 THEN pc.total_conversion_to_account / eu.total_conversion_eq_units ELSE 0 END AS unit_cost_conv,
        pc.grand_total_to_account
) uc
LEFT JOIN LATERAL (
    SELECT
        COALESCE((
            SELECT SUM(op.produced_qty * (uc.unit_cost_mat + uc.unit_cost_conv))
            FROM public.mfg_order_progress op
            JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
            WHERE op.production_order_id = po.id
              AND op.status = 'completed'
              AND rs.step_order = (
                  SELECT MAX(rs2.step_order)
                  FROM public.mfg_order_progress op2
                  JOIN public.mfg_routing_steps rs2 ON op2.step_id = rs2.id
                  WHERE op2.production_order_id = po.id
              )
        ), 0) AS cost_finished,
        COALESCE((
            SELECT SUM(
                (op.produced_qty * (op.material_completion_pct / 100.0) * uc.unit_cost_mat) +
                (op.produced_qty * (op.conversion_completion_pct / 100.0) * uc.unit_cost_conv)
            )
            FROM public.mfg_order_progress op
            WHERE op.production_order_id = po.id
              AND op.status = 'active'
        ), 0) AS cost_wip,
        COALESCE((
            SELECT SUM(sl.quantity * (uc.unit_cost_mat + uc.unit_cost_conv))
            FROM public.mfg_scrap_logs sl
            JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id
            WHERE op.production_order_id = po.id
              AND sl.is_abnormal = true
        ), 0) AS cost_abnormal
) alloc ON true;


-- 6. Recreate v_mfg_unit_cost_variance (dependent on v_mfg_cost_reconciliation_report)
DROP VIEW IF EXISTS public.v_mfg_unit_cost_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_unit_cost_variance WITH (security_invoker = true) AS
SELECT
    cr.order_number,
    cr.product_name,
    ROUND((cr.total_to_account_for / NULLIF(eu.total_material_eq_units, 0)), 2) AS actual_unit_cost,
    p.manufacturing_cost AS standard_unit_cost,
    ROUND((cr.total_to_account_for / NULLIF(eu.total_material_eq_units, 0)) - p.manufacturing_cost, 2) AS variance_amount,
    cr.organization_id
FROM public.v_mfg_cost_reconciliation_report cr
JOIN public.mfg_production_orders po ON cr.order_id = po.id
JOIN public.products p ON po.product_id = p.id
JOIN public.v_mfg_equivalent_units eu ON cr.order_id = eu.order_id;


-- 7. Optimized v_mfg_cost_trends (avoids unused finished/WIP/scrap allocation subqueries)
DROP VIEW IF EXISTS public.v_mfg_cost_trends CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_cost_trends WITH (security_invoker = true) AS
SELECT
    to_char(date_trunc('month', po.created_at), 'YYYY-MM') AS month_period,
    po.organization_id,
    AVG(
        (CASE WHEN eu.total_material_eq_units > 0 THEN (COALESCE(bw.material_cost_bf, 0) + COALESCE(vop.actual_material, 0)) / eu.total_material_eq_units ELSE 0 END)
        + (CASE WHEN eu.total_conversion_eq_units > 0 THEN (COALESCE(bw.conversion_cost_bf, 0) + COALESCE(vop.actual_labor, 0)) / eu.total_conversion_eq_units ELSE 0 END)
    )::numeric AS avg_actual_unit_cost,
    AVG(p.manufacturing_cost)::numeric AS avg_standard_unit_cost,
    SUM(COALESCE(vop.total_actual_cost, 0) + COALESCE(bw.material_cost_bf, 0) + COALESCE(bw.conversion_cost_bf, 0))::numeric AS total_actual_cost,
    CASE
        WHEN SUM(p.manufacturing_cost * po.quantity_to_produce) > 0
        THEN ROUND(((SUM(COALESCE(vop.total_actual_cost, 0) + COALESCE(bw.material_cost_bf, 0) + COALESCE(bw.conversion_cost_bf, 0)) - SUM(p.manufacturing_cost * po.quantity_to_produce)) / SUM(p.manufacturing_cost * po.quantity_to_produce) * 100), 2)
        ELSE 0
    END::numeric AS variance_pct
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN public.mfg_beginning_wip_inventory bw ON po.id = bw.order_id
JOIN public.v_mfg_order_profitability vop ON po.id = vop.order_id
JOIN public.v_mfg_equivalent_units eu ON po.id = eu.order_id
GROUP BY 1, 2;


-- 8. Grant Permissions & Reload PostgREST Schema Cache
GRANT SELECT ON public.v_mfg_order_profitability TO authenticated;
GRANT SELECT ON public.v_mfg_equivalent_units TO authenticated;
GRANT SELECT ON public.v_mfg_cost_reconciliation_report TO authenticated;
GRANT SELECT ON public.v_mfg_unit_cost_variance TO authenticated;
GRANT SELECT ON public.v_mfg_cost_trends TO authenticated;

ANALYZE public.mfg_production_orders;
ANALYZE public.mfg_order_progress;
ANALYZE public.mfg_actual_material_usage;
ANALYZE public.mfg_scrap_logs;

NOTIFY pgrst, 'reload config';
