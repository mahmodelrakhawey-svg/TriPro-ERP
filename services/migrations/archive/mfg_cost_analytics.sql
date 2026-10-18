-- 📊 1. رؤية انحرافات المواد (Material Variance Analytics)
-- تقارن بين الكميات المعيارية (BOM) والكميات الفعلية المستهلكة
DROP VIEW IF EXISTS public.v_mfg_material_variances CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_material_variances AS
SELECT 
    po.order_number,
    p.name as finished_product,
    rm.name as raw_material,
    amu.standard_quantity as qty_planned,
    amu.actual_quantity as qty_actual,
    (amu.standard_quantity - amu.actual_quantity) as variance_qty,
    CASE 
        WHEN amu.standard_quantity > 0 
        THEN ROUND(((amu.standard_quantity - amu.actual_quantity) / amu.standard_quantity * 100), 2)
        ELSE 0 
    END as variance_percentage,
    po.organization_id,
    po.created_at as production_date
FROM public.mfg_actual_material_usage amu
JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
JOIN public.mfg_production_orders po ON op.production_order_id = po.id
JOIN public.products p ON po.product_id = p.id
JOIN public.products rm ON amu.raw_material_id = rm.id;

-- 📊 2. رؤية انحرافات الأجور والزمن (Labor & Efficiency Analytics)
-- تقارن بين التكلفة المخططة للعمل والتكلفة الفعلية المسجلة
DROP VIEW IF EXISTS public.v_mfg_labor_variances CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_labor_variances AS
SELECT 
    po.order_number,
    wc.name as work_center,
    rs.operation_name,
    op.produced_qty,
    -- التكلفة المعيارية = (الوقت المعياري بالدقائق / 60) * الكمية المنتجة * معدل مركز العمل
    ROUND(((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.hourly_rate), 2) as labor_cost_standard,
    op.labor_cost_actual,
    (ROUND(((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.hourly_rate), 2) - op.labor_cost_actual) as labor_variance,
    po.organization_id
FROM public.mfg_order_progress op
JOIN public.mfg_production_orders po ON op.production_order_id = po.id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
WHERE op.status = 'completed';

-- 📊 3. رؤية اتجاهات التكلفة الإجمالية (Manufacturing Cost Trends)
DROP VIEW IF EXISTS public.v_mfg_total_cost_summary CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_total_cost_summary AS
SELECT 
    date_trunc('month', created_at) as month,
    COUNT(id) as total_orders,
    SUM(quantity_to_produce) as total_qty_produced,
    organization_id
FROM public.mfg_production_orders
WHERE status = 'completed'
GROUP BY 1, 4;

-- 📊 رؤية تحليل ربحية الأصناف (Product Profitability BI View)
-- تجمع بين حركة المبيعات وتكلفة المتوسط المرجح (WAC) لاستخراج هوامش الربح بدقة
DROP VIEW IF EXISTS public.v_bi_product_profitability CASCADE;
CREATE OR REPLACE VIEW public.v_bi_product_profitability AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    ic.name as category_name,
    COALESCE(SUM(ii.quantity), 0) as total_units_sold,
    COALESCE(SUM(ii.quantity * ii.unit_price), 0) as gross_sales,
    COALESCE(SUM(ii.quantity * ii.cost), 0) as total_cost_of_sales,
    (COALESCE(SUM(ii.quantity * ii.unit_price), 0) - COALESCE(SUM(ii.quantity * ii.cost), 0)) as net_profit,
    CASE 
        WHEN SUM(ii.quantity * ii.unit_price) > 0 
        THEN ROUND(((SUM(ii.quantity * ii.unit_price) - SUM(ii.quantity * ii.cost)) / SUM(ii.quantity * ii.unit_price) * 100), 2)
        ELSE 0 
    END as margin_percentage,
    p.organization_id
FROM public.products p
LEFT JOIN public.item_categories ic ON p.category_id = ic.id
LEFT JOIN public.invoice_items ii ON p.id = ii.product_id
LEFT JOIN public.invoices i ON ii.invoice_id = i.id
WHERE i.status IN ('posted', 'paid')
GROUP BY p.id, p.name, ic.name, p.organization_id;