-- Migration: Create view for inventory wastage and cost deviation analysis with strict multi-tenant isolation
CREATE OR REPLACE VIEW vw_inventory_wastage_analysis 
WITH (security_invoker = true)
AS
SELECT 
    p.id AS product_id,
    p.name AS product_name,
    p.organization_id,
    COALESCE(p.purchase_price, 0) AS avg_purchase_price,
    COALESCE(p.weighted_average_cost, p.purchase_price, 0) AS actual_wac,
    GREATEST(0, COALESCE(p.weighted_average_cost, p.purchase_price, 0) - COALESCE(p.purchase_price, 0)) AS cost_increase_per_unit,
    COALESCE(p.stock, 0) AS current_stock,
    COALESCE(w.total_wasted_qty, 0) AS total_wasted_qty,
    CASE 
        WHEN COALESCE(w.total_wasted_qty, 0) > 0 THEN (w.total_wasted_qty * COALESCE(p.purchase_price, p.weighted_average_cost, 0))
        ELSE (GREATEST(0, COALESCE(p.weighted_average_cost, p.purchase_price, 0) - COALESCE(p.purchase_price, 0)) * COALESCE(p.stock, 0))
    END AS total_wastage_impact_value
FROM products p
LEFT JOIN (
    SELECT 
        sai.product_id,
        sa.organization_id,
        SUM(ABS(sai.quantity)) AS total_wasted_qty
    FROM stock_adjustments sa
    JOIN stock_adjustment_items sai ON sai.stock_adjustment_id = sa.id
    WHERE sa.reason ILIKE '%هالك%' OR sa.reason ILIKE '%wastage%' OR sa.reason ILIKE '%تالف%'
    GROUP BY sai.product_id, sa.organization_id
) w ON w.product_id = p.id AND (w.organization_id = p.organization_id OR w.organization_id IS NULL);
