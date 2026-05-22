-- 📈 رؤية تحليل اتجاهات التكلفة (Cost Trend Analytics)
CREATE OR REPLACE VIEW public.v_mfg_cost_trends WITH (security_invoker = true) AS
SELECT 
    to_char(po.created_at, 'YYYY-MM') as month_period,
    p.name as product_name,
    AVG(cr.total_to_account_for / NULLIF(po.quantity_to_produce, 0)) as avg_actual_unit_cost,
    p.manufacturing_cost as standard_unit_cost,
    ROUND(AVG(
        ((cr.total_to_account_for / NULLIF(po.quantity_to_produce, 0)) - p.manufacturing_cost) 
        / NULLIF(p.manufacturing_cost, 0) * 100
    ), 2) as variance_pct,
    po.organization_id
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.v_mfg_cost_reconciliation_report cr ON po.id = cr.order_id
WHERE po.status = 'completed'
GROUP BY 1, 2, p.manufacturing_cost, po.organization_id
ORDER BY 1 DESC;

-- منح الصلاحيات
GRANT SELECT ON public.v_mfg_cost_trends TO authenticated;
NOTIFY pgrst, 'reload config';