-- =================================================================
-- TriPro ERP - Wastage Analysis Report
-- التاريخ: 27 مارس 2026
-- الوصف: دالة لإنشاء تقرير يحلل أسباب الهدر الأكثر شيوعاً وتكلفة.
-- =================================================================

CREATE OR REPLACE FUNCTION public.analyze_wastage_reasons(
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_report_data JSONB;
BEGIN
    -- نستخدم COALESCE للتعامل مع الأسباب الفارغة (NULL)
    -- ونقوم بتجميع البيانات حسب السبب
    SELECT jsonb_agg(t)
    INTO v_report_data
    FROM (
        SELECT
            COALESCE(wl.reason, 'سبب غير محدد') as reason,
            COUNT(wl.id)::int as occurrence_count,
            SUM(wl.quantity) as total_wasted_quantity,
            SUM(wl.quantity * p.cost) as total_wasted_cost
        FROM public.wastage_logs wl
        JOIN public.products p ON wl.product_id = p.id
        WHERE wl.wastage_date::date BETWEEN p_start_date AND p_end_date
        GROUP BY COALESCE(wl.reason, 'سبب غير محدد')
        ORDER BY total_wasted_cost DESC -- الترتيب حسب الأعلى تكلفة
    ) t;

    -- إرجاع البيانات المجمعة أو مصفوفة فارغة إذا لم توجد نتائج
    RETURN COALESCE(v_report_data, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.analyze_wastage_reasons(DATE, DATE) IS 'Returns a JSON array of wastage reasons, aggregated by count, quantity, and cost for a given date range.';