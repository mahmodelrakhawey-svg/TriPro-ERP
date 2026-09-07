-- دالة جلب إحصائيات المنصة الشاملة (للسوبر أدمن فقط)
CREATE OR REPLACE FUNCTION get_admin_platform_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- لتجاوز الـ RLS والوصول لكافة البيانات
AS $$
DECLARE
    total_sales DECIMAL;
    total_orgs INTEGER;
    active_orgs INTEGER;
    new_orgs_this_month INTEGER;
    new_orgs_last_month INTEGER;
    growth_percentage DECIMAL;
    result JSON;
BEGIN
    -- 1. حساب إجمالي المبيعات عبر كافة المنظمات (للفواتير المرحلة فقط)
    SELECT COALESCE(SUM(total_amount), 0) INTO total_sales
    FROM invoices 
    WHERE status = 'posted';

    -- 2. إحصائيات المنظمات
    SELECT COUNT(*) INTO total_orgs FROM organizations;
    SELECT COUNT(*) INTO active_orgs FROM organizations WHERE is_active = true AND subscription_expiry > CURRENT_DATE;

    -- 3. حساب النمو (هذا الشهر مقابل الشهر السابق)
    SELECT COUNT(*) INTO new_orgs_this_month 
    FROM organizations 
    WHERE created_at >= date_trunc('month', CURRENT_DATE);

    SELECT COUNT(*) INTO new_orgs_last_month 
    FROM organizations 
    WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') 
      AND created_at < date_trunc('month', CURRENT_DATE);

    -- حساب نسبة النمو
    IF new_orgs_last_month > 0 THEN
        growth_percentage := ((new_orgs_this_month::DECIMAL - new_orgs_last_month) / new_orgs_last_month) * 100;
    ELSE
        growth_percentage := 100; -- في حال لم يكن هناك منظمات الشهر الماضي
    END IF;

    -- تجميع النتائج في كائن JSON واحد
    result := json_build_object(
        'total_platform_sales', total_sales,
        'total_organizations', total_orgs,
        'active_subscriptions', active_orgs,
        'growth_this_month_percent', ROUND(growth_percentage, 2),
        'new_registrations_today', (SELECT COUNT(*) FROM organizations WHERE created_at::DATE = CURRENT_DATE)
    );

    RETURN result;
END;
$$;