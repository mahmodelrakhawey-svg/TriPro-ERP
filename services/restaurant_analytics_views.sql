-- 1. عرض المبيعات حسب الصنف والفئة
DROP VIEW IF EXISTS view_restaurant_sales_by_item CASCADE;
CREATE OR REPLACE VIEW view_restaurant_sales_by_item AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.product_type as category,
    SUM(oi.quantity) as total_quantity,
    SUM(oi.total_price) as total_sales,
    o.created_at::date as sale_date,
    o.organization_id
FROM order_items oi
JOIN products p ON oi.product_id = p.id
JOIN orders o ON oi.order_id = o.id
WHERE o.status IN ('PAID', 'COMPLETED')
GROUP BY p.id, p.name, p.product_type, o.created_at::date, o.organization_id;

-- 2. عرض المبيعات حسب الساعات (Heatmap)
DROP VIEW IF EXISTS view_restaurant_hourly_sales CASCADE;
CREATE OR REPLACE VIEW view_restaurant_hourly_sales AS
SELECT 
    EXTRACT(HOUR FROM created_at) as sale_hour,
    COUNT(id) as total_orders,
    SUM(grand_total) as total_revenue,
    created_at::date as sale_date,
    organization_id
FROM orders
WHERE status IN ('PAID', 'COMPLETED')
GROUP BY EXTRACT(HOUR FROM created_at), created_at::date, organization_id;

-- 3. عرض مبيعات طرق الدفع
DROP VIEW IF EXISTS view_restaurant_payment_methods CASCADE;
CREATE OR REPLACE VIEW view_restaurant_payment_methods AS
SELECT 
    pay.payment_method::text as payment_method,
    COUNT(pay.id) as transaction_count,
    SUM(pay.amount) as total_amount,
    pay.created_at::date as sale_date,
    pay.organization_id
FROM payments pay
JOIN orders o ON pay.order_id = o.id
WHERE o.status IN ('PAID', 'COMPLETED')
GROUP BY pay.payment_method, pay.created_at::date, pay.organization_id;

-- 4. أداء الموظفين (الكاشير)
DROP VIEW IF EXISTS view_restaurant_staff_performance CASCADE;
CREATE OR REPLACE VIEW view_restaurant_staff_performance AS
SELECT 
    user_id as staff_id,
    COUNT(id) as total_orders,
    SUM(grand_total) as total_sales,
    created_at::date as sale_date,
    organization_id
FROM orders
WHERE status IN ('PAID', 'COMPLETED')
GROUP BY user_id, created_at::date, organization_id;

-- 5. هندسة المنيو وتحليل الربحية (Menu Engineering)
DROP VIEW IF EXISTS view_restaurant_menu_engineering CASCADE;
CREATE OR REPLACE VIEW view_restaurant_menu_engineering AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.product_type as category,
    SUM(oi.quantity) as total_sold,
    p.sales_price as selling_price,
    p.cost as unit_cost,
    (p.sales_price - p.cost) as unit_profit,
    SUM(oi.total_price) as total_revenue,
    SUM(oi.quantity * p.cost) as total_cost,
    o.organization_id,
    o.created_at::date as sale_date
FROM order_items oi
JOIN products p ON oi.product_id = p.id
JOIN orders o ON oi.order_id = o.id
WHERE o.status IN ('PAID', 'COMPLETED')
GROUP BY p.id, p.name, p.product_type, p.sales_price, p.cost, o.organization_id, o.created_at::date;

-- 6. تحليل انحراف استهلاك الخامات (Theoretical vs Actual)
-- هذا التقرير يعتمد على قوائم المواد (BOM) التي أعددتها في ملفات MFG
DROP VIEW IF EXISTS view_restaurant_ingredient_variance CASCADE;
CREATE OR REPLACE VIEW view_restaurant_ingredient_variance AS
SELECT 
    raw_p.id as ingredient_id,
    raw_p.name as ingredient_name,
    u.name as uom_name,
    SUM(oi.quantity * bom.quantity_required) as theoretical_qty, -- الاستهلاك النظري بناءً على المبيعات
    raw_p.cost as unit_cost,
    o.organization_id,
    o.created_at::date as sale_date
FROM order_items oi
JOIN bill_of_materials bom ON oi.product_id = bom.product_id
JOIN products raw_p ON bom.raw_material_id = raw_p.id
JOIN uoms u ON raw_p.base_uom_id = u.id
JOIN orders o ON oi.order_id = o.id
WHERE o.status IN ('PAID', 'COMPLETED')
GROUP BY raw_p.id, raw_p.name, u.name, raw_p.cost, o.organization_id, o.created_at::date;

-- 7. الخلاصة المالية اليومية (Daily Financial Summary)
-- تدمج الإيرادات مع تكاليف الخامات بناءً على الـ BOM
DROP VIEW IF EXISTS view_restaurant_daily_summary CASCADE;
CREATE OR REPLACE VIEW view_restaurant_daily_summary AS
WITH daily_stats AS (
    SELECT 
        o.created_at::date as sale_date,
        o.organization_id,
        SUM(o.grand_total) as total_revenue,
        SUM(o.total_tax) as total_tax,
        SUM(oi.quantity * p.cost) as total_cogs
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE o.status IN ('PAID', 'COMPLETED')
    GROUP BY o.created_at::date, o.organization_id
)
SELECT 
    sale_date,
    organization_id,
    total_revenue,
    total_tax,
    COALESCE(total_cogs, 0) as total_cogs
FROM daily_stats;

-- 8. تحليل سلة المشتريات (Basket Analysis / Cross-Selling)
-- يكشف الأصناف التي تباع معاً في نفس الفاتورة
DROP VIEW IF EXISTS view_restaurant_basket_analysis CASCADE;
CREATE OR REPLACE VIEW view_restaurant_basket_analysis AS
SELECT 
    p1.name::text as product_a,
    p2.name::text as product_b,
    COUNT(*) as pair_count,
    o.organization_id as organization_id,
    o.created_at::date as sale_date
FROM order_items oi1
JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.product_id <> oi2.product_id
JOIN products p1 ON oi1.product_id = p1.id
JOIN products p2 ON oi2.product_id = p2.id
JOIN orders o ON oi1.order_id = o.id
WHERE o.status IN ('PAID', 'COMPLETED')
GROUP BY p1.name, p2.name, o.organization_id, o.created_at::date;

-- 9. بيانات التنبؤ بالمبيعات (Sales Forecasting Data)
DROP VIEW IF EXISTS view_restaurant_sales_prediction CASCADE;
CREATE OR REPLACE VIEW view_restaurant_sales_prediction AS
SELECT 
    created_at::date as sale_date,
    SUM(grand_total) as total_sales,
    organization_id
FROM orders
WHERE status IN ('PAID', 'COMPLETED')
GROUP BY created_at::date, organization_id;

-- 10. تحليل ولاء العملاء والاحتفاظ (Customer Loyalty & Retention)
DROP VIEW IF EXISTS view_restaurant_loyalty_analytics CASCADE;
CREATE OR REPLACE VIEW view_restaurant_loyalty_analytics AS
SELECT 
    c.id as customer_id,
    c.name as customer_name,
    COUNT(o.id) as total_visits,
    SUM(o.grand_total) as total_spent,
    AVG(o.grand_total) as avg_check,
    MAX(o.created_at::date) as last_visit,
    MAX(o.created_at::date) as sale_date,
    o.organization_id
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.status IN ('PAID', 'COMPLETED')
GROUP BY c.id, c.name, o.organization_id;