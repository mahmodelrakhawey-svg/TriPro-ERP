-- =================================================================
-- TriPro ERP - Restaurant Sales & Profit Reports
-- التاريخ: 28 يناير 2026
-- تقارير المبيعات والربحية للمطعم
-- =================================================================

CREATE OR REPLACE FUNCTION public.get_restaurant_sales_report(
    p_start_date timestamptz,
    p_end_date timestamptz
)
RETURNS TABLE (
    product_name TEXT,
    category_name TEXT,
    quantity_sold BIGINT,
    total_sales NUMERIC, -- إيراد المبيعات
    total_cost NUMERIC,  -- تكلفة البضاعة المباعة
    gross_profit NUMERIC, -- مجمل الربح
    profit_margin_percent NUMERIC -- نسبة هامش الربح
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.name AS product_name,
        COALESCE(mc.name, 'غير مصنف') AS category_name,
        SUM(oi.quantity)::BIGINT AS quantity_sold,
        SUM(oi.total_price) AS total_sales,
        SUM(oi.quantity * oi.unit_cost) AS total_cost,
        SUM(oi.total_price - (oi.quantity * oi.unit_cost)) AS gross_profit,
        CASE 
            WHEN SUM(oi.total_price) = 0 THEN 0
            ELSE ROUND(((SUM(oi.total_price - (oi.quantity * oi.unit_cost)) / SUM(oi.total_price)) * 100), 2)
        END AS profit_margin_percent
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.products p ON oi.product_id = p.id
    LEFT JOIN public.menu_categories mc ON p.category_id = mc.id
    WHERE o.status = 'COMPLETED'
      AND o.created_at >= p_start_date 
      AND o.created_at <= p_end_date
    GROUP BY p.name, mc.name
    ORDER BY total_sales DESC;
END;
$$;