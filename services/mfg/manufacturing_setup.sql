-- 🏭 ملف تأسيس مديول التصنيع المتقدم (Manufacturing Setup)
-- ضمان وجود المخطط (Schema) إذا تم الفصل مستقبلاً
-- CREATE SCHEMA IF NOT EXISTS mfg;

-- 1. جداول مراكز العمل (Work Centers) - مثل: قسم القص، قسم الخياطة
CREATE TABLE IF NOT EXISTS public.mfg_work_centers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    hourly_rate numeric DEFAULT 0, -- تكلفة الساعة في هذا المركز
    overhead_rate numeric DEFAULT 0, -- مصاريف غير مباشرة للمركز
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 2. جداول المسارات (Routings) - خط السير للمنتج
CREATE TABLE IF NOT EXISTS public.mfg_routings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    name text NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    is_default boolean DEFAULT true
);

-- 3. مراحل المسار (Routing Steps)
CREATE TABLE IF NOT EXISTS public.mfg_routing_steps (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    routing_id uuid REFERENCES public.mfg_routings(id) ON DELETE CASCADE,
    step_order integer NOT NULL, -- ترتيب المرحلة
    work_center_id uuid REFERENCES public.mfg_work_centers(id) ON DELETE SET NULL,
    operation_name text NOT NULL, -- اسم العملية (مثلاً: قص القماش)
    standard_time_minutes numeric DEFAULT 0, -- الوقت المعياري بالدقائق
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

-- 4. أوامر الإنتاج تحت التشغيل (Production Orders)
CREATE TABLE IF NOT EXISTS public.mfg_production_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text UNIQUE,
    product_id uuid REFERENCES public.products(id),
    quantity_to_produce numeric NOT NULL,
    status text DEFAULT 'draft', -- draft, in_progress, completed, cancelled
    start_date date,
    end_date date,
    warehouse_id uuid REFERENCES public.warehouses(id), -- مستودع الإنتاج تحت التشغيل
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    notes text, -- عمود الملاحظات المفقود الذي سبب المشكلة
    created_at timestamptz DEFAULT now()
);

-- 5. تتبع المراحل الفعلية (Production Progress)
CREATE TABLE IF NOT EXISTS public.mfg_order_progress (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    step_id uuid REFERENCES public.mfg_routing_steps(id),
    status text DEFAULT 'pending', -- pending, active, completed
    actual_start_time timestamptz,
    actual_end_time timestamptz,
    produced_qty numeric DEFAULT 0,
    labor_cost_actual numeric DEFAULT 0,
    qc_verified boolean DEFAULT false,
    employee_id uuid REFERENCES public.employees(id), -- إضافة عمود لربط العامل بالمرحلة
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

-- 6. المواد الخام المطلوبة لكل مرحلة (Step BOM)
CREATE TABLE IF NOT EXISTS public.mfg_step_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    step_id uuid REFERENCES public.mfg_routing_steps(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_required numeric NOT NULL DEFAULT 1,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 7. الاستهلاك الفعلي للمواد الخام في كل مرحلة (Actual Usage Tracking)
CREATE TABLE IF NOT EXISTS public.mfg_actual_material_usage (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id),
    standard_quantity numeric NOT NULL, -- الكمية المفروض استهلاكها
    actual_quantity numeric NOT NULL,   -- الكمية التي استهلكت فعلياً
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 8. رؤية تحليل انحراف المواد الخام (Raw Material Variance View)
DROP VIEW IF EXISTS public.v_mfg_material_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_material_variance AS
SELECT
    po.order_number,
    p.name as product_name,
    rm.name as material_name,
    SUM(amu.standard_quantity) as total_standard_qty,
    SUM(amu.actual_quantity) as total_actual_qty,
    SUM(amu.actual_quantity - amu.standard_quantity) as variance_qty,
    CASE 
        WHEN SUM(amu.standard_quantity) > 0 
        THEN ROUND((SUM(amu.actual_quantity - amu.standard_quantity) / SUM(amu.standard_quantity) * 100), 2)
        ELSE 0 
    END as variance_percentage,
    po.organization_id
FROM public.mfg_actual_material_usage amu
JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
JOIN public.mfg_production_orders po ON op.production_order_id = po.id
JOIN public.products p ON po.product_id = p.id
JOIN public.products rm ON amu.raw_material_id = rm.id
GROUP BY po.id, po.order_number, p.name, rm.name, po.organization_id;

-- 9. جدول سجل التالف والفاقد (Scrap Logs)
CREATE TABLE IF NOT EXISTS public.mfg_scrap_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id), -- المنتج التالف أو المادة الخام التالفة
    quantity numeric NOT NULL,
    reason text,
    scrap_type text DEFAULT 'material', -- material (خامات), product (منتج نهائي معيب)
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 9.5 جدول تسجيل انحرافات الإنتاج (Production Variances Table)
CREATE TABLE IF NOT EXISTS public.mfg_production_variances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    actual_total_cost numeric DEFAULT 0,
    standard_total_cost numeric DEFAULT 0,
    variance_amount numeric DEFAULT 0,
    variance_percentage numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    UNIQUE(production_order_id)
);
-- 9.6 جدول طلبات صرف المواد (Material Requests)
CREATE TABLE IF NOT EXISTS public.mfg_material_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    request_number text UNIQUE NOT NULL,
    request_date date DEFAULT now(),
    status text DEFAULT 'pending', -- pending, approved, issued, cancelled
    requested_by uuid REFERENCES public.profiles(id),
    issued_by uuid REFERENCES public.profiles(id),
    issue_date timestamptz,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 9.7 جدول بنود طلبات صرف المواد
CREATE TABLE IF NOT EXISTS public.mfg_material_request_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    material_request_id uuid REFERENCES public.mfg_material_requests(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_requested numeric NOT NULL,
    quantity_issued numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);


-- 10. رؤية لوحة تحكم التصنيع (Manufacturing Dashboard View)
DROP VIEW IF EXISTS public.v_mfg_dashboard CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_dashboard AS
WITH progress_stats AS (
    SELECT 
        production_order_id,
        count(*) as total_steps,
        count(*) FILTER (WHERE status = 'completed') as completed_steps,
        count(*) FILTER (WHERE qc_verified = true) as qc_passed_steps,
        SUM(labor_cost_actual) as total_labor_cost
    FROM public.mfg_order_progress
    GROUP BY production_order_id
),
serial_stats AS (
    SELECT 
        production_order_id,
        count(*) as total_serials
    FROM public.mfg_batch_serials
    GROUP BY production_order_id
)
SELECT 
    po.id as order_id,
    po.order_number,
    p.name as product_name,
    po.quantity_to_produce,
    po.status,
    po.start_date,
    po.end_date,
    ps.total_steps,
    (po.status = 'in_progress' AND ps.total_steps > 0 AND ps.completed_steps = ps.total_steps) as can_finalize,
    ps.completed_steps,
    COALESCE(ps.qc_passed_steps, 0) as qc_passed_steps,
    CASE 
        WHEN ps.total_steps > 0 THEN ROUND((ps.completed_steps::numeric / ps.total_steps::numeric) * 100, 2)
        ELSE 0 
    END as completion_percentage,
    COALESCE(ps.total_labor_cost, 0) as current_labor_cost,
    po.organization_id,
    pv.variance_amount,
    pv.variance_percentage,
    COALESCE(ss.total_serials, 0) as total_serials_generated,
    p.requires_serial
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN progress_stats ps ON po.id = ps.production_order_id
LEFT JOIN public.mfg_production_variances pv ON po.id = pv.production_order_id
LEFT JOIN serial_stats ss ON po.id = ss.production_order_id;
-- 11. جداول تتبع الدفعات والأرقام التسلسلية (Batch & Serial Tracking)
-- يتم تعريف الجداول والأعمدة هنا قبل الرؤية (View) لضمان صحة التبعيات
ALTER TABLE public.mfg_production_orders ADD COLUMN IF NOT EXISTS batch_number text;

CREATE TABLE IF NOT EXISTS public.mfg_batch_serials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    serial_number text NOT NULL,
    status text DEFAULT 'in_stock', -- in_stock, sold, scrapped
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- إضافة حقل في جدول المنتجات لتحديد ما إذا كان المنتج يتطلب رقم تسلسلي
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS requires_serial boolean DEFAULT false;

-- إضافة عمود "نوع المنتج" لتحديد ما إذا كان "تحت التشغيل" (مطلوب لعمليات التصنيع)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mfg_type text DEFAULT 'standard'; 

-- إضافة حقل سعر البيع للمنتج (مطلوب لحساب الربحية)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;

-- فهرس للبحث السريع عن الأرقام التسلسلية
ALTER TABLE public.mfg_batch_serials DROP CONSTRAINT IF EXISTS mfg_batch_serials_serial_number_key;

-- إنشاء فهرس فريد يضمن عدم تكرار السيريال داخل المنظمة الواحدة فقط
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_serial_per_org ON public.mfg_batch_serials (serial_number, organization_id);


-- 12. رؤية ربحية أمر الإنتاج (Manufacturing Profitability View)
DROP VIEW IF EXISTS public.v_mfg_order_profitability CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_order_profitability AS
WITH actual_costs AS (
    SELECT 
        op.production_order_id,
        SUM(op.labor_cost_actual) as total_labor_cost,
        SUM(COALESCE((
            SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0))
            FROM public.mfg_actual_material_usage amu
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE amu.order_progress_id = op.id
        ), 0)) as total_material_cost
    FROM public.mfg_order_progress op
    GROUP BY op.production_order_id
)
SELECT 
    po.id as order_id,
    po.order_number,
    p.name as product_name,
    po.quantity_to_produce as qty,
    ROUND(po.quantity_to_produce * COALESCE(NULLIF(p.sales_price, 0), NULLIF(p.price, 0), 0), 2) as sales_value,
    COALESCE(ac.total_labor_cost, 0) as actual_labor,
    COALESCE(ac.total_material_cost, 0) as actual_material,
    (COALESCE(ac.total_labor_cost, 0) + COALESCE(ac.total_material_cost, 0)) as total_actual_cost,
    ROUND((po.quantity_to_produce * COALESCE(NULLIF(p.sales_price, 0), NULLIF(p.price, 0), 0)) - (COALESCE(ac.total_labor_cost, 0) + COALESCE(ac.total_material_cost, 0)), 2) as net_profit,
    CASE 
        WHEN (po.quantity_to_produce * COALESCE(NULLIF(p.sales_price, 0), NULLIF(p.price, 0), 0)) > 0
        THEN ROUND((((po.quantity_to_produce * COALESCE(NULLIF(p.sales_price, 0), NULLIF(p.price, 0), 0)) - (COALESCE(ac.total_labor_cost, 0) + COALESCE(ac.total_material_cost, 0))) / (po.quantity_to_produce * COALESCE(NULLIF(p.sales_price, 0), NULLIF(p.price, 0), 0)) * 100), 2)
        ELSE 0 
    END as margin_percentage,
    po.organization_id
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN actual_costs ac ON po.id = ac.production_order_id;

-- 13. رؤية كفاءة مراكز العمل (Work Center Efficiency View)
-- تقارن بين الوقت المعياري المفترض والوقت الفعلي المستغرق لكل مركز عمل
DROP VIEW IF EXISTS public.v_mfg_work_center_efficiency CASCADE;
CREATE VIEW public.v_mfg_work_center_efficiency AS
SELECT 
    wc.name as work_center_name,
    COUNT(op.id) as tasks_completed,
    SUM(rs.standard_time_minutes * op.produced_qty) as total_standard_minutes,
    GREATEST(SUM(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 60), 1) as total_actual_minutes,
    ROUND((SUM(rs.standard_time_minutes * op.produced_qty) / GREATEST(SUM(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 60), 1) * 100), 2) as efficiency_percentage,
    wc.organization_id
FROM public.mfg_work_centers wc
JOIN public.mfg_routing_steps rs ON wc.id = rs.work_center_id
JOIN public.mfg_order_progress op ON rs.id = op.step_id
WHERE op.status = 'completed'
GROUP BY wc.id, wc.name, wc.organization_id;
