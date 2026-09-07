-- =================================================================
-- TriPro ERP - Wastage Analysis Report
-- الوصف: دالة لإنشاء تقرير يحلل أسباب الهدر الأكثر شيوعاً وتكلفة مع عزل الشركات
-- =================================================================

CREATE OR REPLACE FUNCTION public.analyze_wastage_reasons(
    p_start_date DATE,
    p_end_date DATE,
    p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_report_data JSONB;
BEGIN
    SELECT jsonb_agg(t)
    INTO v_report_data
    FROM (
        SELECT 
            reason,
            COUNT(*)::int AS occurrence_count,
            SUM(quantity)::numeric AS total_wasted_quantity,
            SUM(total_cost)::numeric AS total_wasted_cost
        FROM (
            -- 1. حركات الهالك والتسويات المخزنية
            SELECT 
                COALESCE(NULLIF(TRIM(sa.reason), ''), 'هالك عام') AS reason,
                ABS(sai.quantity) AS quantity,
                ABS(sai.quantity) * COALESCE(p.purchase_price, p.weighted_average_cost, 0) AS total_cost
            FROM stock_adjustments sa
            JOIN stock_adjustment_items sai ON sai.stock_adjustment_id = sa.id
            JOIN products p ON sai.product_id = p.id
            WHERE sa.adjustment_date::date BETWEEN p_start_date AND p_end_date
              AND (p_org_id IS NULL OR sa.organization_id = p_org_id)
              AND (sa.reason ILIKE '%هالك%' OR sa.reason ILIKE '%wastage%' OR sa.reason ILIKE '%تالف%')
        ) aggregated_sources
        GROUP BY reason
        ORDER BY total_wasted_cost DESC
    ) t;

    RETURN COALESCE(v_report_data, '[]'::jsonb);
END;
$$;