-- ================================================================
-- 🌟 دالة تقرير مبيعات الكاشير والمستخدمين الشاملة (POS & Sales)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_sales_by_user_report(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    user_id text,
    user_name text,
    total_orders bigint,
    total_sales numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH combined_sales AS (
        -- 1. مبيعات نقاط البيع والتجزئة (Orders)
        SELECT 
            o.user_id::text AS u_id,
            o.grand_total AS sale_amount
        FROM public.orders o
        WHERE (p_org_id IS NULL OR o.organization_id = p_org_id)
          AND o.status NOT IN ('CANCELLED', 'draft')
          AND o.created_at::date >= p_start_date
          AND o.created_at::date <= p_end_date
          AND o.user_id IS NOT NULL

        UNION ALL

        -- 2. فواتير المبيعات (Invoices)
        SELECT 
            COALESCE(i.salesperson_id, i.user_id)::text AS u_id,
            i.total_amount AS sale_amount
        FROM public.invoices i
        WHERE (p_org_id IS NULL OR i.organization_id = p_org_id)
          AND i.status NOT IN ('draft', 'cancelled')
          AND i.invoice_date::date >= p_start_date
          AND i.invoice_date::date <= p_end_date
          AND COALESCE(i.salesperson_id, i.user_id) IS NOT NULL
    )
    SELECT 
        cs.u_id AS user_id,
        COALESCE(p.full_name, 'كاشير ' || SUBSTRING(cs.u_id, 1, 8)) AS user_name,
        COUNT(*)::bigint AS total_orders,
        COALESCE(SUM(cs.sale_amount), 0)::numeric AS total_sales
    FROM combined_sales cs
    LEFT JOIN public.profiles p ON p.id::text = cs.u_id
    GROUP BY cs.u_id, p.full_name
    ORDER BY total_sales DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_by_user_report(uuid, date, date) TO authenticated, anon;
