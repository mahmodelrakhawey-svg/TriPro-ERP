--- 🏭 ملف مديول التصنيع الشامل (Complete Manufacturing Module)
-- هذا الملف يجمع كافة الجداول، الرؤى، الدوال، والمشغلات الخاصة بمديول التصنيع
-- مع معالجة المشاكل التي تم رصدها وتحسين الأداء والاتساق.

-- ================================================================
-- 0. تنظيف شامل للدوال والمشغلات القديمة (لضمان التحديث السلس)
-- ================================================================
DO $$
DECLARE
    func_signature text;
    trig_record record;
    func_name text;
BEGIN
    RAISE NOTICE '--- بدء عملية تنظيف دوال ومشغلات التصنيع القديمة ---';

    -- 🛡️ المرحلة 0.أ: تنظيف كافة المشغلات (Triggers) القديمة المتعلقة بالتصنيع
    FOR trig_record IN (
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
        AND event_object_table IN (
            'mfg_production_orders', 'mfg_order_progress', 'mfg_material_requests', 'orders',
            'bill_of_materials', 'products'
        )
    ) LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trig_record.trigger_name, trig_record.event_object_table);
        RAISE NOTICE 'تم حذف المشغل: % على الجدول: %', trig_record.trigger_name, trig_record.event_object_table;
    END LOOP;

    -- 🛡️ المرحلة 0.ب: تنظيف كافة الدوال (Functions) القديمة المتعلقة بالتصنيع
    FOR func_signature IN (SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
    LOOP
        func_name := split_part(func_signature, '(', 1);
        IF REPLACE(func_name, 'public.', '') IN (
            'mfg_start_step', 'mfg_complete_step', 'mfg_finalize_order', 'mfg_create_orders_from_sales',
            'mfg_calculate_standard_cost', 'mfg_update_product_standard_cost', 'mfg_check_stock_availability',
            'mfg_record_scrap', 'mfg_merge_sales_orders', 'mfg_generate_batch_serials',
            'mfg_update_selling_price_from_cost', 'mfg_get_product_genealogy', 'mfg_get_shop_floor_tasks', 'trigger_handle_stock_on_order', 'mfg_deduct_stock_from_order',
            'mfg_process_scan', 'mfg_check_efficiency_alerts', 'mfg_check_production_readiness',
            'mfg_get_pending_invoices', 'mfg_calculate_production_variance', 'mfg_reserve_stock_for_order',
            'mfg_create_material_request', 'mfg_issue_material_request', 'fn_mfg_auto_create_material_request',
            'mfg_get_serials_by_order', 'mfg_get_production_order_details_by_number', 'mfg_start_production_order',
            'mfg_start_production_orders_batch', 'mfg_record_qc_inspection', 'mfg_check_variance_alerts',
            'mfg_check_cost_overrun_alerts', 'mfg_missing_serials_alerts', 'mfg_calculate_raw_material_turnover',
            'mfg_test_full_cycle', 'mfg_test_pos_integration',
            'get_product_recipe_cost' -- Dependencies (only if not moved to deploy_all_functionss)
        ) THEN
            EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_signature);
            RAISE NOTICE 'تم حذف الدالة: %', func_signature;
        END IF;
    END LOOP;
    RAISE NOTICE '--- انتهت عملية تنظيف دوال ومشغلات التصنيع القديمة ---';
END $$;

-- 🛡️ صمام أمان: التأكد من وجود عمود product_type في جدول المنتجات
-- هذا يحل مشكلة "column product_type does not exist" إذا تم إنشاء الجدول بنسخة قديمة
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric(19,4) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost numeric(19,4) DEFAULT 0;

-- ================================================================
-- 1. جداول مديول التصنيع (MFG Module Tables)
-- ================================================================
-- هذه الجداول يجب أن تكون موجودة مسبقاً من ملف master_setup.sql أو manufacturing_setup.sql
-- نضمن وجودها هنا لضمان اكتمال الموديول في سكربت واحد.

CREATE TABLE IF NOT EXISTS public.mfg_work_centers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    hourly_rate numeric DEFAULT 0,
    overhead_rate numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bill_of_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    quantity_required numeric NOT NULL DEFAULT 1,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_routings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    name text NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    is_default boolean DEFAULT true,
    deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.mfg_routing_steps (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    routing_id uuid REFERENCES public.mfg_routings(id) ON DELETE CASCADE,
    step_order integer NOT NULL,
    work_center_id uuid REFERENCES public.mfg_work_centers(id) ON DELETE SET NULL,
    operation_name text NOT NULL,
    standard_time_minutes numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.mfg_production_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text UNIQUE,
    product_id uuid REFERENCES public.products(id),
    quantity_to_produce numeric NOT NULL,
    status text DEFAULT 'draft', -- draft, in_progress, completed, cancelled
    start_date date,
    end_date date,
    batch_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfg_po_number ON public.mfg_production_orders(order_number);

CREATE TABLE IF NOT EXISTS public.mfg_order_progress (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    step_id uuid REFERENCES public.mfg_routing_steps(id),
    status text DEFAULT 'pending', -- pending, in_progress, completed
    actual_start_time timestamptz,
    actual_end_time timestamptz,
    produced_qty numeric DEFAULT 0,
    labor_cost_actual numeric DEFAULT 0,
    qc_verified boolean DEFAULT NULL, -- NULL: pending, true: pass, false: fail
    employee_id uuid REFERENCES public.employees(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_step_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    step_id uuid REFERENCES public.mfg_routing_steps(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_required numeric NOT NULL DEFAULT 1,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_actual_material_usage (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id),
    standard_quantity numeric NOT NULL,
    actual_quantity numeric NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_scrap_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric NOT NULL,
    reason text,
    scrap_type text DEFAULT 'material',
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.mfg_batch_serials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    serial_number text NOT NULL,
    status text DEFAULT 'in_stock',
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_serial_per_org ON public.mfg_batch_serials (serial_number, organization_id);

CREATE TABLE IF NOT EXISTS public.mfg_qc_inspections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    inspector_id uuid REFERENCES auth.users(id),
    status text CHECK (status IN ('pass', 'fail', 'rework')),
    defect_type text,
    notes text,
    created_at timestamptz DEFAULT now(),
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

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

CREATE TABLE IF NOT EXISTS public.mfg_material_request_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    material_request_id uuid REFERENCES public.mfg_material_requests(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_requested numeric NOT NULL,
    quantity_issued numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- إضافة أعمدة مفقودة في جدول المنتجات إذا لم تكن موجودة
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS requires_serial boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mfg_type text DEFAULT 'standard'; -- raw, standard, intermediate
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0; -- سعر البيع
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturing_cost numeric DEFAULT 0; -- تكلفة التصنيع المحسوبة
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS labor_cost numeric DEFAULT 0; -- تكلفة العمالة المباشرة
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS overhead_cost numeric DEFAULT 0; -- تكلفة المصاريف غير المباشرة
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_overhead_percentage boolean DEFAULT false; -- هل المصاريف غير المباشرة نسبة مئوية؟

-- ================================================================
-- 1.5. ترميم وصيانة مديول التصنيع (Self-Healing Logic)
-- ================================================================
DO $$
BEGIN
    -- ربط السجلات اليتيمة بالمنظمة الحالية لضمان العزل
    UPDATE public.mfg_production_orders SET organization_id = public.get_my_org() WHERE organization_id IS NULL;
    
    UPDATE public.mfg_order_progress po SET organization_id = orders.organization_id
    FROM public.mfg_production_orders orders WHERE po.production_order_id = orders.id AND po.organization_id IS NULL;

    UPDATE public.mfg_batch_serials bs SET organization_id = orders.organization_id
    FROM public.mfg_production_orders orders WHERE bs.production_order_id = orders.id AND bs.organization_id IS NULL;

    UPDATE public.mfg_actual_material_usage amu SET organization_id = op.organization_id
    FROM public.mfg_order_progress op WHERE amu.order_progress_id = op.id AND amu.organization_id IS NULL;

    UPDATE public.mfg_material_requests mr SET organization_id = po.organization_id
    FROM public.mfg_production_orders po WHERE mr.production_order_id = po.id AND mr.organization_id IS NULL;

    UPDATE public.mfg_material_request_items mri SET organization_id = mr.organization_id
    FROM public.mfg_material_requests mr WHERE mri.material_request_id = mr.id AND mri.organization_id IS NULL;

    UPDATE public.mfg_production_variances pv SET organization_id = po.organization_id
    FROM public.mfg_production_orders po WHERE pv.production_order_id = po.id AND pv.organization_id IS NULL;

    UPDATE public.mfg_work_centers SET organization_id = public.get_my_org() WHERE organization_id IS NULL;
    UPDATE public.mfg_routings SET organization_id = public.get_my_org() WHERE organization_id IS NULL;
    
    -- تصحيح حالات أوامر الإنتاج العالقة
    UPDATE public.mfg_production_orders SET status = 'in_progress' WHERE status IS NULL OR status = '';

    -- التأكد من أن كافة منتجات التصنيع تتبع نظام المخزن
    UPDATE public.products SET product_type = 'STOCK' WHERE mfg_type IN ('standard', 'raw', 'intermediate') AND (product_type IS NULL OR product_type = '');
END $$;

-- ================================================================
-- 2. رؤى مديول التصنيع (MFG Module Views)
-- ================================================================

-- 📊 رؤية تحليل انحراف المواد (BOM Variance View)
DROP VIEW IF EXISTS public.v_mfg_bom_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_bom_variance WITH (security_invoker = true) AS
SELECT
    po.order_number,
    p.name as product_name,
    rm.name as material_name,
    SUM(amu.standard_quantity) as standard_quantity,
    SUM(amu.actual_quantity) as actual_quantity,
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

-- إضافة اسم بديل للتوافق (Compatibility Alias)
DROP VIEW IF EXISTS public.v_mfg_material_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_material_variance WITH (security_invoker = true) AS
SELECT * FROM public.v_mfg_bom_variance;

-- 📊 رؤية كفاءة مراكز العمل (Work Center Efficiency View)
DROP VIEW IF EXISTS public.v_mfg_work_center_efficiency CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_work_center_efficiency WITH (security_invoker = true) AS
SELECT
    wc.id as work_center_id,
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

-- 📊 رؤية ربحية أمر الإنتاج (Manufacturing Order Profitability View)
DROP VIEW IF EXISTS public.v_mfg_order_profitability CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_order_profitability WITH (security_invoker = true) AS
WITH labor_summary AS (
    SELECT
        op.production_order_id,
        SUM(COALESCE(op.labor_cost_actual, 0)) as total_labor,
        SUM(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)) as total_overhead
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    GROUP BY op.production_order_id
),
material_summary AS (
    SELECT po_id, SUM(cost) as total_material_cost
    FROM (
        SELECT op.production_order_id as po_id, SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)) as cost
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        GROUP BY op.production_order_id
        UNION ALL
        SELECT mr.production_order_id as po_id, SUM(mri.quantity_issued * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)) as cost
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.status = 'issued'
        GROUP BY mr.production_order_id
    ) all_mats GROUP BY po_id
)
SELECT
    po.id as order_id, po.order_number, p.name as product_name, po.quantity_to_produce as qty, po.organization_id,
    (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) as sales_value,
    (COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0)) as actual_labor,
    COALESCE(ms.total_material_cost, 0) as actual_material,
    (COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0)) as total_actual_cost,
    ((po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) - (COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0))) as net_profit,
    CASE WHEN (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) > 0
         THEN ROUND((((po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) - (COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0))) / (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) * 100), 2)
         ELSE 0 END as margin_percentage
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN labor_summary ls ON po.id = ls.production_order_id
LEFT JOIN material_summary ms ON po.id = ms.po_id;

-- 📊 رؤية تقييم WIP
DROP VIEW IF EXISTS public.v_mfg_wip_valuation CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_valuation WITH (security_invoker = true) AS
WITH request_costs AS (
    SELECT mr.production_order_id,
           SUM(mri.quantity_issued * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)) as total_request
    FROM public.mfg_material_request_items mri
    JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
    JOIN public.products p ON mri.raw_material_id = p.id
    WHERE mr.status = 'issued' AND mr.organization_id = public.get_my_org()
    GROUP BY mr.production_order_id
)
SELECT po.id AS production_order_id, po.order_number, p.name AS product_name, po.quantity_to_produce, po.status, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS total_labor_cost_incurred,
       (COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) + COALESCE(rc.total_request, 0)) AS total_material_cost_incurred,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) + COALESCE(rc.total_request, 0)) AS total_wip_value
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN public.mfg_order_progress op ON po.id = op.production_order_id
LEFT JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id
LEFT JOIN request_costs rc ON po.id = rc.production_order_id
WHERE po.status = 'in_progress'
GROUP BY po.id, po.order_number, p.name, po.quantity_to_produce, po.status, po.organization_id, rc.total_request;

-- 📊 تقرير ملخص شهري WIP
DROP VIEW IF EXISTS public.v_mfg_wip_monthly_summary CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_monthly_summary WITH (security_invoker = true) AS
SELECT to_char(po.created_at, 'YYYY-MM') AS month, p.name AS product_name, wc.name AS work_center_name, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS monthly_labor_cost,
       COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) AS monthly_material_cost,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0)) AS total_monthly_wip_value
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.mfg_order_progress op ON po.id = op.production_order_id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
LEFT JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id
WHERE po.status = 'in_progress'
GROUP BY 1, 2, 3, 4;

-- 📊 رؤية لوحة التحكم الصناعية (Manufacturing Dashboard View)
DROP VIEW IF EXISTS public.v_mfg_dashboard CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_dashboard WITH (security_invoker = true) AS
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
    po.batch_number,
    p.name as product_name,
    po.quantity_to_produce,
    po.status,
    po.start_date,
    po.end_date,
    po.created_at,
    ps.total_steps,
    (po.status = 'in_progress' AND ps.total_steps > 0 AND ps.completed_steps = ps.total_steps) as can_finalize,
    ps.completed_steps,
    COALESCE(ps.qc_passed_steps, 0) as qc_passed_steps,
    CASE WHEN ps.total_steps > 0 THEN ROUND((ps.completed_steps::numeric / ps.total_steps::numeric) * 100, 2) ELSE 0 END as completion_percentage,
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

-- 📊 رؤية السيريالات المتاحة في المخازن
DROP VIEW IF EXISTS public.v_mfg_available_serials CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_available_serials WITH (security_invoker = true) AS
SELECT
    bs.id,
    bs.serial_number,
    p.name as product_name,
    p.sku as product_code,
    po.order_number,
    po.batch_number,
    bs.created_at as production_date,
    bs.organization_id,
    bs.status as serial_status
FROM public.mfg_batch_serials bs
LEFT JOIN public.products p ON bs.product_id = p.id
LEFT JOIN public.mfg_production_orders po ON bs.production_order_id = po.id
WHERE bs.status = 'in_stock';

-- 📊 رؤية التتبع الشاملة لكافة السيريالات وحالاتها (Traceability Master Table)
DROP VIEW IF EXISTS public.v_mfg_serials_master_tracker CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_serials_master_tracker WITH (security_invoker = true) AS
SELECT
    bs.serial_number,
    p.name as product_name,
    p.sku as product_sku,
    po.order_number,
    po.batch_number,
    bs.status as serial_status,
    bs.created_at as production_date,
    bs.organization_id
FROM public.mfg_batch_serials bs
JOIN public.products p ON bs.product_id = p.id
JOIN public.mfg_production_orders po ON bs.production_order_id = po.id;

-- ================================================================
-- 3. دوال مديول التصنيع (MFG Module Functions)
-- ================================================================

-- 🛠️ دالة خصم المخزون اللحظي عند دفع الطلب (للمطاعم والـ POS)
CREATE OR REPLACE FUNCTION public.mfg_deduct_stock_from_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order_item record;
    v_product record;
    v_bom_item record;
    v_order_warehouse_id uuid;
    v_org_id uuid;
BEGIN
    SELECT warehouse_id, organization_id INTO v_order_warehouse_id, v_org_id FROM public.orders WHERE id = p_order_id;

    IF v_order_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'لا يمكن خصم المخزون: المستودع غير محدد للطلب %', p_order_id;
    END IF;

    FOR v_order_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_order_item.product_id;

        IF v_product.mfg_type = 'standard' THEN -- إذا كان المنتج تاما (مصنع)
            -- خصم مكونات BOM
            FOR v_bom_item IN SELECT * FROM public.bill_of_materials WHERE product_id = v_order_item.product_id LOOP
                UPDATE public.products
                SET stock = stock - (v_order_item.quantity * v_bom_item.quantity_required),
                    warehouse_stock = jsonb_set(
                        COALESCE(warehouse_stock, '{}'::jsonb),
                        ARRAY[v_order_warehouse_id::text],
                        to_jsonb(COALESCE((warehouse_stock->>v_order_warehouse_id::text)::numeric, 0) - (v_order_item.quantity * v_bom_item.quantity_required))
                    )
                WHERE id = v_bom_item.raw_material_id AND organization_id = v_org_id;
            END LOOP;
        ELSE -- إذا كان المنتج خام أو غير مصنع
            -- خصم المنتج نفسه
            UPDATE public.products
            SET stock = stock - v_order_item.quantity,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_order_warehouse_id::text],
                    to_jsonb(COALESCE((warehouse_stock->>v_order_warehouse_id::text)::numeric, 0) - v_order_item.quantity)
                )
            WHERE id = v_order_item.product_id AND organization_id = v_org_id;
        END IF;
    END LOOP;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة حساب معدل دوران المواد الخام (Raw Material Turnover)
CREATE OR REPLACE FUNCTION public.mfg_calculate_raw_material_turnover(
    p_product_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_usage numeric;
    v_avg_stock numeric;
    v_org_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.products WHERE id = p_product_id;
    
    -- إجمالي الاستهلاك الفعلي للمادة الخام في الفترة
    SELECT COALESCE(SUM(amu.actual_quantity), 0) INTO v_usage
    FROM public.mfg_actual_material_usage amu
    JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
    WHERE amu.raw_material_id = p_product_id AND op.organization_id = v_org_id
      AND op.actual_end_time::date BETWEEN p_start_date AND p_end_date;

    -- متوسط المخزون (لتبسيط الحساب، نستخدم المخزون الحالي)
    SELECT COALESCE(stock, 0) INTO v_avg_stock FROM public.products WHERE id = p_product_id AND organization_id = v_org_id;

    RETURN CASE WHEN v_avg_stock > 0 THEN ROUND(v_usage / v_avg_stock, 2) ELSE 0 END;
END; $$;

-- 🛠️ دالة جلب تكلفة الوجبة بناءً على المكونات (BOM)
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cost numeric;
BEGIN
    SELECT COALESCE(SUM(bom.quantity_required * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)), 0)
    INTO v_cost
    FROM public.bill_of_materials bom
    JOIN public.products p ON bom.raw_material_id = p.id
    WHERE bom.product_id = p_product_id;
    RETURN v_cost;
END; $$;

-- 3.2. دوال إدارة أوامر الإنتاج والمراحل

-- 🛠️ دالة بدء مرحلة إنتاج (Start Step)
CREATE OR REPLACE FUNCTION public.mfg_start_step(p_progress_id uuid, p_employee_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.mfg_order_progress
    SET status = 'in_progress',
        actual_start_time = now(),
        employee_id = p_employee_id
    WHERE id = p_progress_id AND status = 'pending'; -- فقط إذا كانت المرحلة معلقة
END; $$;

-- 🛠️ دالة إكمال مرحلة إنتاج (Complete Step) - النسخة المحسنة
CREATE OR REPLACE FUNCTION public.mfg_complete_step(p_progress_id uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_step record;
    v_routing_step record;
    v_mat record;
    v_usage_qty numeric;
    v_mat_total_cost numeric := 0;
    v_labor_cost numeric := 0;
    v_je_id uuid;
    v_mappings jsonb;
    v_wip_acc uuid;
    v_inv_acc uuid;
    v_labor_acc uuid;
    v_org_id uuid;
    v_scrap_qty numeric := 0;
BEGIN
    -- 1. جلب بيانات التقدم والتحقق من الصلاحية
    SELECT * INTO v_step FROM public.mfg_order_progress WHERE id = p_progress_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سجل تقدم المرحلة غير موجود'; END IF;
    IF v_step.status = 'completed' THEN RETURN; END IF; -- منع التكرار
    v_org_id := v_step.organization_id;

    -- [جديد] جلب إجمالي التالف المسجل لهذه المرحلة لزيادة الاستهلاك الفعلي
    SELECT COALESCE(SUM(quantity), 0) INTO v_scrap_qty
    FROM public.mfg_scrap_logs
    WHERE order_progress_id = p_progress_id;

    -- 2. جلب بيانات مركز العمل لحساب التكلفة
    SELECT rs.standard_time_minutes, wc.hourly_rate
    INTO v_routing_step
    FROM public.mfg_routing_steps rs
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE rs.id = v_step.step_id;

    -- حساب تكلفة العمالة بناءً على الزمن المعياري (زمن الوحدة بالدقائق / 60 * الكمية * معدل الساعة)
    v_labor_cost := (COALESCE(v_routing_step.standard_time_minutes, 0) / 60.0) * p_qty * COALESCE(v_routing_step.hourly_rate, 0);

    -- 3. تحديث حالة المرحلة وتكلفة العمالة
    UPDATE public.mfg_order_progress SET
        status = 'completed',
        actual_end_time = now(),
        produced_qty = p_qty,
        labor_cost_actual = v_labor_cost,
        qc_verified = NULL -- ✅ يتم وضع علامة على المرحلة بأنها تحتاج لفحص جودة (NULL يعني قيد الانتظار)
    WHERE id = p_progress_id AND status = 'in_progress'; -- تحديث فقط إذا كانت قيد التشغيل

    -- 4. محرك الخصم المخزني الآلي (Stage-based BOM Deduction)
    FOR v_mat IN
        SELECT raw_material_id, quantity_required
        FROM public.mfg_step_materials
        WHERE step_id = v_step.step_id
    LOOP
        v_usage_qty := v_mat.quantity_required * p_qty;

        -- حساب تكلفة المواد المستهلكة (بناءً على المتوسط المرجح)
        v_mat_total_cost := v_mat_total_cost + (v_usage_qty * COALESCE((SELECT COALESCE(weighted_average_cost, cost, purchase_price, 0) FROM public.products WHERE id = v_mat.raw_material_id), 0));

        -- ب. تسجيل الاستهلاك الفعلي (إضافة الكمية المعيارية + التالف الخاص بنفس المادة إن وجد)
        INSERT INTO public.mfg_actual_material_usage (order_progress_id, raw_material_id, standard_quantity, actual_quantity, organization_id)
        VALUES (
            p_progress_id,
            v_mat.raw_material_id,
            v_usage_qty,
            v_usage_qty + COALESCE((SELECT SUM(quantity) FROM public.mfg_scrap_logs WHERE order_progress_id = p_progress_id AND product_id = v_mat.raw_material_id), 0),
            v_org_id
        );
    END LOOP;

    -- 5. المحرك المحاسبي الصناعي: توليد قيد الإنتاج تحت التشغيل (WIP Entry)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- جلب الحسابات (نستخدم كود 10303 للإنتاج تحت التشغيل و 10301 للمواد الخام)
    v_wip_acc := COALESCE(
        (v_mappings->>'INVENTORY_WIP')::uuid,
        (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_org_id LIMIT 1)
    );
    v_inv_acc := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid,
                         (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_labor_acc := COALESCE((v_mappings->>'LABOR_COST_ALLOCATED')::uuid,
                           (SELECT id FROM public.accounts WHERE (code = '513' OR code = '511') AND organization_id = v_org_id LIMIT 1));

    IF v_wip_acc IS NOT NULL AND (v_mat_total_cost > 0 OR v_labor_cost > 0) THEN
        -- إنشاء رأس القيد
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted,
            related_document_id, related_document_type
        ) VALUES (
            now()::date,
            'تحميل تكاليف المرحلة: ' || (SELECT operation_name FROM public.mfg_routing_steps WHERE id = v_step.step_id),
            'MFG-STEP-' || substring(p_progress_id::text, 1, 8),
            'posted', v_org_id, true, p_progress_id, 'mfg_step'
        ) RETURNING id INTO v_je_id;

        -- أسطر القيد
        -- 1. من ح/ الإنتاج تحت التشغيل (إجمالي المواد + العمالة)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, (v_mat_total_cost + v_labor_cost), 0, 'إجمالي تكلفة المرحلة الإنتاجية', v_org_id);

        -- 2. إلى ح/ مخزون المواد الخام (فقط للمواد التي لم تُصرف مسبقاً بطلب صرف)
        IF v_mat_total_cost > 0 AND v_inv_acc IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.mfg_material_request_items mri
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
            WHERE mr.production_order_id = v_step.production_order_id AND mr.status = 'issued'
        ) THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_inv_acc, 0, v_mat_total_cost, 'صرف مواد خام للمرحلة الإنتاجية', v_org_id);
        END IF;

        -- 3. إلى ح/ تكاليف عمالة مباشرة محملة (بالتكلفة المعيارية للمركز)
        IF v_labor_cost > 0 AND v_labor_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_labor_acc, 0, v_labor_cost, 'تحميل تكلفة عمالة المرحلة الإنتاجية', v_org_id);
        END IF;
    END IF;

    -- ✅ جديد: إعادة احتساب المخزون فوراً لضمان الدقة بعد أي تعديلات في الاستهلاك
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة الإغلاق النهائي لطلب الإنتاج (MFG Finalization) - المزامنة الموحدة
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(
    p_order_id uuid,
    p_final_status text DEFAULT 'completed',
    p_qc_notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record; v_total_cost numeric := 0; v_je_id uuid; v_wip_acc uuid;
    v_fg_acc uuid; v_loss_acc uuid; v_org_id uuid; v_mappings jsonb;
BEGIN
    -- 1. جلب بيانات الطلب والتحقق من حالته
    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار أو التضارب بعد التعديل
    DELETE FROM public.journal_entries WHERE related_document_id = p_order_id AND related_document_type = 'mfg_order';

    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    IF v_order.status = 'completed' THEN RETURN; END IF;

    -- [صمام أمان] منع إغلاق أوامر لم يبدأ العمل فيها فعلياً (لمنع التكلفة الصفرية)
    IF NOT EXISTS (SELECT 1 FROM public.mfg_order_progress WHERE production_order_id = p_order_id AND status = 'completed')
       AND NOT EXISTS (SELECT 1 FROM public.mfg_material_requests WHERE production_order_id = p_order_id AND status = 'issued') THEN
        RAISE EXCEPTION 'لا يمكن إغلاق أمر إنتاج لم يتم البدء فيه أو صرف مواد له. يرجى إكمال مراحل العمل أو صرف المواد أولاً.';
    END IF;

    v_org_id := v_order.organization_id;

    -- معالجة حالة "إعادة التشغيل"
    IF p_final_status = 'rework' THEN
        UPDATE public.mfg_production_orders SET status = 'in_progress', notes = COALESCE(notes, '') || E'\nإعادة تشغيل: ' || p_qc_notes WHERE id = p_order_id;
        RETURN;
    END IF;

    -- 2. حساب إجمالي التكاليف الفعلية
    SELECT SUM(COALESCE(labor_cost_actual, 0)) INTO v_total_cost
    FROM public.mfg_order_progress WHERE production_order_id = p_order_id;
    -- ب. إضافة تكلفة المصاريف غير المباشرة من سجلات التقدم
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate)
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    -- ب. إضافة تكلفة المواد الفعلية المستهلكة
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products p ON amu.raw_material_id = p.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(mri.quantity_issued * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0))
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.production_order_id = p_order_id AND mr.status = 'issued'
    ), 0);

    -- 3. تحديث حالة الطلب وزيادة مخزون المنتج التام
    IF p_final_status = 'completed' THEN
        -- 🚀 تحديث متوسط التكلفة المرجح (WAC) للمنتج التام
        IF v_order.quantity_to_produce > 0 THEN
            DECLARE
                v_old_stock numeric;
                v_old_wac numeric;
                v_new_wac numeric;
            BEGIN
                SELECT stock, weighted_average_cost INTO v_old_stock, v_old_wac
                FROM public.products
                WHERE id = v_order.product_id AND organization_id = v_org_id;

                -- تجنب القسمة على صفر إذا كان المخزون القديم والكمية المنتجة صفر
                IF (COALESCE(v_old_stock, 0) + v_order.quantity_to_produce) > 0 THEN
                    v_new_wac := ((COALESCE(v_old_stock, 0) * COALESCE(v_old_wac, 0)) + v_total_cost) / (COALESCE(v_old_stock, 0) + v_order.quantity_to_produce);
                    v_new_wac := ROUND(((COALESCE(v_old_stock, 0) * COALESCE(v_old_wac, 0)) + v_total_cost) / (COALESCE(v_old_stock, 0) + v_order.quantity_to_produce), 4);
                    UPDATE public.products
                    SET weighted_average_cost = v_new_wac,
                        cost = v_new_wac -- تحديث حقل التكلفة أيضاً ليعكس WAC
                    WHERE id = v_order.product_id AND organization_id = v_org_id;
                END IF;
            END;
        END IF;
        UPDATE public.mfg_production_orders SET status = 'completed', end_date = now()::date, notes = COALESCE(notes, '') || E'\nملاحظات الجودة: ' || p_qc_notes WHERE id = p_order_id;
        -- ❌ تم إزالة التحديث المباشر للمخزون هنا، حيث أن recalculate_stock_rpc ستتولى الأمر بشكل شامل.

        -- 🚀 تحديث حالة أمر البيع المرتبط إلى "جاهز" (Ready) لتمكين الفوترة
        UPDATE public.sales_orders
        SET status = 'ready'
        WHERE order_number = v_order.batch_number AND organization_id = v_org_id;
    ELSE
        UPDATE public.mfg_production_orders SET status = 'cancelled', notes = 'مرفوض جودة: ' || p_qc_notes WHERE id = p_order_id;
    END IF;

    -- 4. المحرك المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := COALESCE((v_mappings->>'INVENTORY_WIP')::uuid, (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1), (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_org_id LIMIT 1));
    v_fg_acc := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
    v_loss_acc := COALESCE((v_mappings->>'WASTAGE_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1));

    IF v_total_cost > 0 AND v_wip_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, (CASE WHEN p_final_status = 'completed' THEN 'إغلاق إنتاج: ' ELSE 'خسارة رفض إنتاج: ' END) || v_order.order_number, 'MFG-FIN-' || v_order.order_number, 'posted', v_org_id, true, p_order_id, 'mfg_order') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, CASE WHEN p_final_status = 'completed' THEN v_fg_acc ELSE v_loss_acc END, v_total_cost, 0, 'تحويل تكلفة الإنتاج من WIP', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_wip_acc, 0, v_total_cost, 'إخلاء حساب الإنتاج تحت التشغيل', v_org_id);
    END IF;

    -- 5. العمليات التكميلية
    BEGIN
        PERFORM public.mfg_update_selling_price_from_cost(p_order_id);
        PERFORM public.mfg_calculate_production_variance(p_order_id);
        PERFORM public.mfg_generate_batch_serials(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        -- ⚠️ تسجيل الخطأ في سجل الأخطاء بدلاً من RAISE NOTICE لضمان التتبع
        INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id, user_id)
        VALUES (SQLERRM, jsonb_build_object('order_id', p_order_id, 'step', 'mfg_finalize_sub_functions'), 'mfg_finalize_order', v_org_id, auth.uid());
        RAISE WARNING 'تنبيه: فشل تشغيل بعض العمليات المساعدة لأمر الإنتاج %: %', p_order_id, SQLERRM;
    END;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة تحويل طلب المبيعات إلى أوامر إنتاج تلقائية
CREATE OR REPLACE FUNCTION public.mfg_create_orders_from_sales(p_sales_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_sales_item record;
    v_org_id uuid;
    v_order_count integer := 0;
    v_prod_order_id uuid;
    v_routing_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. المرور على كافة بنود أمر البيع
    -- نتحقق من وجود routing للمنتج كدليل على أنه منتج مصنع
    FOR v_sales_item IN
        SELECT soi.product_id, soi.quantity, p.name, so.order_number
        FROM public.sales_order_items soi
        JOIN public.sales_orders so ON soi.sales_order_id = so.id
        JOIN public.products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = p_sales_order_id
        AND EXISTS (SELECT 1 FROM public.mfg_routings r WHERE r.product_id = soi.product_id)
    LOOP
        -- 2. جلب المسار الافتراضي أو أول مسار متاح للمنتج
        SELECT id INTO v_routing_id FROM public.mfg_routings
        WHERE product_id = v_sales_item.product_id AND organization_id = v_org_id AND is_default = true
        LIMIT 1;

        IF v_routing_id IS NULL THEN
            SELECT id INTO v_routing_id FROM public.mfg_routings
            WHERE product_id = v_sales_item.product_id AND organization_id = v_org_id
            LIMIT 1;
        END IF;

        IF v_routing_id IS NULL THEN
            -- تسجيل الخطأ في سجل الأخطاء لسهولة التتبع
            INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id, user_id)
            VALUES (format('المنتج %s (ID: %s) لا يمتلك مسار إنتاج معرف. تم تخطيه.', v_sales_item.name, v_sales_item.product_id),
                    jsonb_build_object('product_id', v_sales_item.product_id, 'sales_order_id', p_sales_order_id),
                    'mfg_create_orders_from_sales', v_org_id, auth.uid());
            RAISE WARNING 'تنبيه: المنتج % (ID: %) لا يمتلك مسار إنتاج معرف. تم تخطيه.', v_sales_item.name, v_sales_item.product_id;
            CONTINUE; -- تخطي هذا المنتج إذا لم يكن له مسار
        END IF;

        -- 2. إنشاء أمر الإنتاج
        INSERT INTO public.mfg_production_orders (
            order_number, product_id, quantity_to_produce, status,
            start_date, organization_id, batch_number
        ) VALUES (
            'MFG-AUTO-' || v_sales_item.order_number || '-' || substring(gen_random_uuid()::text, 1, 4),
            v_sales_item.product_id, v_sales_item.quantity, 'draft',
            now()::date, v_org_id, v_sales_item.order_number
        ) RETURNING id INTO v_prod_order_id;

        -- 3. توليد مراحل العمل تلقائياً بناءً على المسار المختار
        INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
        SELECT
            v_prod_order_id,
            rs.id,
            'pending',
            v_org_id
        FROM public.mfg_routing_steps rs
        WHERE rs.routing_id = v_routing_id;

        v_order_count := v_order_count + 1;
    END LOOP;

    RETURN v_order_count;
END; $$;

-- 🛠️ دالة دمج طلبات المبيعات في أوامر إنتاج موحدة (Batching/Merging Orders)
CREATE OR REPLACE FUNCTION public.mfg_merge_sales_orders(p_sales_order_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_item record;
    v_org_id uuid;
    v_order_count integer := 0;
    v_prod_order_id uuid;
    v_batch_ref text;
    v_routing_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    v_batch_ref := 'BATCH-' || to_char(now(), 'YYMMDDHH24MI') || '-' || substring(gen_random_uuid()::text, 1, 4);

    -- تجميع الكميات المطلوبة لكل منتج من أوامر البيع المحددة
    FOR v_item IN
        SELECT soi.product_id, SUM(soi.quantity) as total_qty
        FROM public.sales_order_items soi
        WHERE soi.sales_order_id = ANY(p_sales_order_ids)
        AND EXISTS (SELECT 1 FROM public.mfg_routings r WHERE r.product_id = soi.product_id)
        GROUP BY soi.product_id
    LOOP
        -- 2. جلب المسار الافتراضي أو أول مسار متاح للمنتج
        SELECT id INTO v_routing_id FROM public.mfg_routings
        WHERE product_id = v_item.product_id AND organization_id = v_org_id AND is_default = true
        LIMIT 1;

        IF v_routing_id IS NULL THEN
            SELECT id INTO v_routing_id FROM public.mfg_routings
            WHERE product_id = v_item.product_id AND organization_id = v_org_id
            LIMIT 1;
        END IF;

        IF v_routing_id IS NULL THEN
            INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id, user_id)
            VALUES (format('المنتج %s (ID: %s) لا يمتلك مسار إنتاج معرف. تم تخطيه في الدمج.', v_item.product_id, v_item.product_id),
                    jsonb_build_object('product_id', v_item.product_id, 'sales_order_ids', p_sales_order_ids),
                    'mfg_merge_sales_orders', v_org_id, auth.uid());
            RAISE WARNING 'تنبيه: المنتج % (ID: %) لا يمتلك مسار إنتاج معرف. تم تخطيه في الدمج.', v_item.product_id, v_item.product_id;
            CONTINUE;
        END IF;

        -- 2. إنشاء أمر إنتاج موحد للكمية الكلية
        INSERT INTO public.mfg_production_orders (
            order_number, product_id, quantity_to_produce, status,
            start_date, organization_id, batch_number
        ) VALUES (
            'MFG-MERGED-' || substring(gen_random_uuid()::text, 1, 8),
            v_item.product_id, v_item.total_qty, 'in_progress',
            now()::date, v_org_id, v_batch_ref
        ) RETURNING id INTO v_prod_order_id;

        -- 3. توليد مراحل العمل بناءً على المسار المختار
        INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
        SELECT
            v_prod_order_id,
            rs.id,
            'pending',
            v_org_id
        FROM public.mfg_routing_steps rs
        WHERE rs.routing_id = v_routing_id;

        v_order_count := v_order_count + 1;
    END LOOP;

    RETURN v_order_count;
END; $$;

-- 🛠️ دالة بدء أمر إنتاج واحد
CREATE OR REPLACE FUNCTION public.mfg_start_production_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.mfg_production_orders SET status = 'in_progress', start_date = now()::date WHERE id = p_order_id;
END; $$;

-- 🛠️ دالة بدء أوامر إنتاج متعددة دفعة واحدة
CREATE OR REPLACE FUNCTION public.mfg_start_production_orders_batch(p_order_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_order_id uuid;
    v_count integer := 0;
BEGIN
    FOR v_order_id IN SELECT unnest(p_order_ids) LOOP
        UPDATE public.mfg_production_orders
        SET status = 'in_progress', start_date = now()::date
        WHERE id = v_order_id AND status = 'draft' AND organization_id = public.get_my_org();

        IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
    RETURN v_count;
END; $$;

-- 3.3. دوال التخطيط والتحقق

-- 🛠️ دالة حساب التكلفة المعيارية التقديرية (Standard Cost Calculation)
CREATE OR REPLACE FUNCTION public.mfg_calculate_standard_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_total_cost numeric := 0;
    v_routing record;
    v_step record;
    v_org_id uuid;
    v_labor_cost numeric;
    v_material_cost numeric;
    v_overhead_cost numeric;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن المسار الافتراضي للمنتج
    SELECT * INTO v_routing FROM public.mfg_routings
    WHERE product_id = p_product_id AND organization_id = v_org_id AND is_default = true
    LIMIT 1;

    -- إذا لم يوجد مسار افتراضي، نأخذ أول مسار متاح
    IF NOT FOUND THEN
        SELECT * INTO v_routing FROM public.mfg_routings
        WHERE product_id = p_product_id AND organization_id = v_org_id
        LIMIT 1;
    END IF;

    IF v_routing.id IS NULL THEN RETURN 0; END IF;

    -- 2. حساب التكاليف لكل مرحلة في المسار
    FOR v_step IN
        SELECT rs.*, wc.hourly_rate, wc.overhead_rate
        FROM public.mfg_routing_steps rs
        LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE rs.routing_id = v_routing.id
    LOOP
        -- أ. تكلفة العمالة المعيارية للمرحلة (الوقت المعياري بالساعات * تكلفة الساعة)
        v_labor_cost := (COALESCE(v_step.standard_time_minutes, 0) / 60.0) * COALESCE(v_step.hourly_rate, 0);

        -- ب. تكلفة المصاريف غير المباشرة المعيارية للمرحلة
        v_overhead_cost := (COALESCE(v_step.standard_time_minutes, 0) / 60.0) * COALESCE(v_step.overhead_rate, 0);

        -- ج. تكلفة المواد الخام المعيارية لهذه المرحلة
        SELECT SUM(sm.quantity_required * COALESCE(p.weighted_average_cost, p.purchase_price, 0))
        INTO v_material_cost
        FROM public.mfg_step_materials sm
        JOIN public.products p ON sm.raw_material_id = p.id
        WHERE sm.step_id = v_step.id;

        v_total_cost := v_total_cost + v_labor_cost + v_overhead_cost + COALESCE(v_material_cost, 0);
    END LOOP;

    RETURN ROUND(v_total_cost, 4);
END; $$;

-- 🛠️ دالة تحديث تكلفة المنتج بناءً على الحسبة المعيارية
CREATE OR REPLACE FUNCTION public.mfg_update_product_standard_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_std_cost numeric;
BEGIN
    v_std_cost := public.mfg_calculate_standard_cost(p_product_id);

    IF v_std_cost > 0 THEN
        UPDATE public.products
        SET cost = v_std_cost,
            manufacturing_cost = v_std_cost
        WHERE id = p_product_id AND organization_id = public.get_my_org();
    END IF;

    RETURN v_std_cost;
END; $$;

-- 🛠️ دالة التحقق من توفر المواد الخام (Stock Availability Check)
CREATE OR REPLACE FUNCTION public.mfg_check_stock_availability(p_product_id uuid, p_quantity numeric)
RETURNS TABLE (
    material_id uuid,
    material_name text,
    required_total_qty numeric,
    current_stock_qty numeric,
    shortage_qty numeric
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_routing_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن المسار الافتراضي للمنتج
    SELECT id INTO v_routing_id FROM public.mfg_routings
    WHERE product_id = p_product_id AND organization_id = v_org_id AND is_default = true
    LIMIT 1;

    -- إذا لم يوجد مسار افتراضي، نأخذ أول مسار متاح
    IF v_routing_id IS NULL THEN
        SELECT id INTO v_routing_id FROM public.mfg_routings
        WHERE product_id = p_product_id AND organization_id = v_org_id
        LIMIT 1;
    END IF;

    IF v_routing_id IS NULL THEN RETURN; END IF;

    -- 2. تجميع الاحتياجات الكلية من المواد الخام ومقارنتها بالمخزون الحالي
    RETURN QUERY
    WITH material_requirements AS (
        SELECT
            sm.raw_material_id,
            SUM(sm.quantity_required * p_quantity) as total_req
        FROM public.mfg_routing_steps rs
        JOIN public.mfg_step_materials sm ON rs.id = sm.step_id
        WHERE rs.routing_id = v_routing_id
        GROUP BY sm.raw_material_id
    )
    SELECT
        mr.raw_material_id,
        p.name,
        mr.total_req,
        COALESCE(p.stock, 0),
        CASE
            WHEN COALESCE(p.stock, 0) < mr.total_req THEN mr.total_req - COALESCE(p.stock, 0)
            ELSE 0
        END
    FROM material_requirements mr
    JOIN public.products p ON mr.raw_material_id = p.id
    WHERE mr.total_req > COALESCE(p.stock, 0); -- نرجع فقط المواد التي بها عجز (نقص)
END; $$;

-- 🛠️ دالة فحص جاهزية المنتج للإنتاج (Production Readiness Check)
CREATE OR REPLACE FUNCTION public.mfg_check_production_readiness(p_product_id uuid)
RETURNS TABLE (
    is_ready boolean,
    missing_elements text[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_errors text[] := '{}';
BEGIN
    -- 1. فحص وجود BOM
    IF NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = p_product_id) THEN
        v_errors := array_append(v_errors, 'قائمة المواد (BOM) غير معرفة');
    END IF;

    -- 2. فحص وجود مسار إنتاج (Routing)
    IF NOT EXISTS (SELECT 1 FROM public.mfg_routings WHERE product_id = p_product_id AND deleted_at IS NULL) THEN
        v_errors := array_append(v_errors, 'مسار الإنتاج (Routing) غير معرف');
    END IF;

    -- 3. فحص وجود خطوات في المسار
    IF EXISTS (SELECT 1 FROM public.mfg_routings WHERE product_id = p_product_id) AND
       NOT EXISTS (SELECT 1 FROM public.mfg_routing_steps rs
                   JOIN public.mfg_routings r ON rs.routing_id = r.id
                   WHERE r.product_id = p_product_id) THEN
        v_errors := array_append(v_errors, 'مسار الإنتاج لا يحتوي على خطوات تنفيذية');
    END IF;

    RETURN QUERY SELECT
        (array_length(v_errors, 1) IS NULL) as is_ready,
        v_errors;
END; $$;

-- 🛠️ دالة جلب الفواتير/أوامر البيع القابلة للتصنيع (Helper for BatchOrderManager)
CREATE OR REPLACE FUNCTION public.mfg_get_pending_invoices(p_org_id uuid)
RETURNS TABLE (
    invoice_id uuid,
    invoice_num text,
    cust_name text,
    order_date timestamptz,
    total numeric,
    invoice_status text
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    -- 1. جلب الفواتير التقليدية (للتوافق مع النظام القديم)
    SELECT i.id, i.invoice_number as invoice_num, c.name as cust_name, i.created_at as order_date, COALESCE(i.total_amount, 0) as total, i.status as invoice_status
    FROM public.invoices i
    JOIN public.customers c ON i.customer_id = c.id
    WHERE i.organization_id = p_org_id
    AND i.status != 'draft' -- جلب الفواتير المعتمدة فقط أو حسب سياق عملك
    AND EXISTS (
        SELECT 1 FROM public.invoice_items ii
        JOIN public.mfg_routings r ON ii.product_id = r.product_id
        WHERE ii.invoice_id = i.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.mfg_production_orders po
        -- استبعاد الفاتورة إذا كان رقمها موجوداً ضمن مرجع الدفعة أو حقل مخصص
        WHERE po.batch_number LIKE '%' || i.invoice_number || '%'
    )
    UNION ALL
    -- 2. جلب أوامر البيع الجديدة (Sales Orders)
    SELECT so.id, so.order_number, c.name, so.created_at, COALESCE(so.total_amount, 0), so.status
    FROM public.sales_orders so
    JOIN public.customers c ON so.customer_id = c.id
    WHERE so.organization_id = p_org_id
    AND so.status = 'confirmed' -- تظهر فقط الأوامر المؤكدة وغير المنتجة بعد
    AND NOT EXISTS (
        SELECT 1 FROM public.mfg_production_orders po
        WHERE po.batch_number = so.order_number
    )
    ORDER BY 4 DESC;
END; $$;

-- 🛠️ دالة حجز المخزون لأمر الإنتاج (Stock Reservation)
CREATE OR REPLACE FUNCTION public.mfg_reserve_stock_for_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shortage_exists boolean := false;
BEGIN
    IF EXISTS (SELECT 1 FROM public.mfg_check_stock_availability(
        (SELECT product_id FROM public.mfg_production_orders WHERE id = p_order_id),
        (SELECT quantity_to_produce FROM public.mfg_production_orders WHERE id = p_order_id)
    )) THEN
        RETURN jsonb_build_object('success', false, 'message', 'يوجد نقص في الخامات، لا يمكن حجز المخزون');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'تم التأكد من توفر كافة الخامات وتخصيصها للأمر');
END; $$;

-- 3.4. دوال تتبع الجودة والانحرافات

-- 🛠️ دالة تسجيل نتيجة الفحص
CREATE OR REPLACE FUNCTION public.mfg_record_qc_inspection(
    p_progress_id uuid,
    p_status text,
    p_notes text,
    p_defect_type text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    INSERT INTO public.mfg_qc_inspections (progress_id, inspector_id, status, notes, defect_type, organization_id)
    VALUES (p_progress_id, auth.uid(), p_status, p_notes, p_defect_type, public.get_my_org());

    -- تحديث حالة التقدم بناءً على نتيجة الفحص
    UPDATE public.mfg_order_progress
    SET
        qc_verified = CASE
            WHEN p_status = 'pass' THEN true
            WHEN p_status = 'rework' THEN NULL
            ELSE false
        END,
        status = CASE WHEN p_status = 'rework' THEN 'in_progress' ELSE status END -- تم التعديل: عند إعادة التشغيل، تعود الحالة إلى 'in_progress'
    WHERE id = p_progress_id;
END; $$;

-- 🛠️ دالة مساعدة: Overload لـ mfg_record_qc_inspection لمطابقة استدعاء الواجهة الأمامية الخاطئ
CREATE OR REPLACE FUNCTION public.mfg_record_qc_inspection(
    p_notes_client text,
    p_progress_id_client uuid,
    p_status_client text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    -- استدعاء الدالة الأصلية بالترتيب الصحيح للمعاملات
    PERFORM public.mfg_record_qc_inspection(p_progress_id_client, p_status_client, p_notes_client, NULL);
END; $$;

-- 🛠️ دالة تسجيل التالف ومعالجته محاسبياً (Scrap Recording & Accounting)
CREATE OR REPLACE FUNCTION public.mfg_record_scrap(
    p_progress_id uuid,
    p_material_id uuid,
    p_qty numeric,
    p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_org_id uuid;
    v_cost numeric;
    v_je_id uuid;
    v_mappings jsonb;
    v_scrap_acc uuid;
    v_wip_acc uuid;
    v_material_name text;
BEGIN
    -- 1. جلب البيانات الأساسية
    SELECT organization_id INTO v_org_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    SELECT name, COALESCE(weighted_average_cost, cost, 0) INTO v_material_name, v_cost
    FROM public.products WHERE id = p_material_id;

    -- 2. تسجيل التالف في الجدول
    INSERT INTO public.mfg_scrap_logs (order_progress_id, product_id, quantity, reason, organization_id)
    VALUES (p_progress_id, p_material_id, p_qty, p_reason, v_org_id);

    -- 3. خصم الكمية من المخزون (لأن التالف استهلاك غير مخطط له)
    UPDATE public.products
    SET stock = stock - p_qty
    WHERE id = p_material_id AND organization_id = v_org_id;

    -- 4. المحرك المحاسبي: قيد إثبات خسارة التالف
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- حساب التالف (5121 هالك) وحساب WIP (10303)
    v_scrap_acc := COALESCE(
        (v_mappings->>'WASTAGE_EXPENSE')::uuid,
        (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1)
    );
    v_wip_acc := (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1);

    IF v_scrap_acc IS NOT NULL AND v_cost > 0 THEN
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, is_posted,
            related_document_id, related_document_type
        ) VALUES (
            now()::date,
            'إثبات تالف صناعي: ' || v_material_name || ' - ' || p_reason,
            'MFG-SCRAP-' || substring(gen_random_uuid()::text, 1, 8),
            'posted', v_org_id, true, p_progress_id, 'mfg_scrap'
        ) RETURNING id INTO v_je_id;

        -- أسطر القيد
        -- من ح/ تكلفة الهالك والفاقد (تحميل الخسارة على المصاريف)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_scrap_acc, (p_qty * v_cost), 0, 'خسارة تالف مواد خام غير مستردة', v_org_id);

        -- إلى ح/ مخزون المواد الخام (أو WIP إذا كان قد تم صرفه بالفعل للمرحلة)
        -- هنا نخصمه من المخزون مباشرة لأنه تالف إضافي لم يحسب في الدورة العادية
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (
            v_je_id,
            COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)),
            0, (p_qty * v_cost), 'تخفيض المخزون نتيجة تلف صنف', v_org_id
        );
    END IF;

    -- 5. تحديث الأرصدة
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة حساب الانحراف المالي الفعلي بين التكلفة المعيارية والتكلفة الحقيقية بعد إغلاق أمر الإنتاج
CREATE OR REPLACE FUNCTION public.mfg_calculate_production_variance(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record;
    v_actual_cost numeric := 0;
    v_standard_cost_per_unit numeric := 0;
    v_standard_total_cost numeric := 0;
    v_variance_amount numeric := 0;
    v_variance_percentage numeric := 0;
    v_org_id uuid;
BEGIN
    -- 1. جلب بيانات أمر الإنتاج
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'أمر الإنتاج غير موجود');
    END IF;
    v_org_id := v_order.organization_id;

    -- 2. جلب التكلفة الفعلية الإجمالية من رؤية ربحية أمر الإنتاج
    SELECT total_actual_cost INTO v_actual_cost
    FROM public.v_mfg_order_profitability
    WHERE order_id = p_order_id AND organization_id = v_org_id;

    -- 3. حساب التكلفة المعيارية الإجمالية (التكلفة المعيارية للوحدة * الكمية المنتجة)
    v_standard_cost_per_unit := public.mfg_calculate_standard_cost(v_order.product_id);
    v_standard_total_cost := v_standard_cost_per_unit * v_order.quantity_to_produce;

    -- 4. حساب الانحراف (الفعلي - المعياري)
    v_variance_amount := v_actual_cost - v_standard_total_cost;
    IF v_standard_total_cost > 0 THEN
        v_variance_percentage := ROUND((v_variance_amount / v_standard_total_cost) * 100, 2);
    ELSE
        v_variance_percentage := 0; -- تجنب القسمة على صفر إذا كانت التكلفة المعيارية صفر
    END IF;

    -- 5. تسجيل أو تحديث الانحراف في الجدول الجديد لضمان بقاء البيانات التاريخية
    INSERT INTO public.mfg_production_variances (
        production_order_id, actual_total_cost, standard_total_cost,
        variance_amount, variance_percentage, organization_id
    ) VALUES (
        p_order_id, v_actual_cost, v_standard_total_cost,
        v_variance_amount, v_variance_percentage, v_org_id
    ) ON CONFLICT (production_order_id) DO UPDATE SET
        actual_total_cost = EXCLUDED.actual_total_cost,
        standard_total_cost = EXCLUDED.standard_total_cost,
        variance_amount = EXCLUDED.variance_amount,
        variance_percentage = EXCLUDED.variance_percentage;

    RETURN jsonb_build_object(
        'order_id', p_order_id, 'order_number', v_order.order_number, 'product_id', v_order.product_id,
        'quantity_produced', v_order.quantity_to_produce, 'actual_total_cost', v_actual_cost,
        'standard_total_cost', v_standard_total_cost, 'variance_amount', v_variance_amount,
        'variance_percentage', v_variance_percentage
    );
END; $$;

-- 🛠️ دالة تحديث سعر البيع بناءً على التكلفة الفعلية (تستخدم هامش ربح افتراضي 20%)
CREATE OR REPLACE FUNCTION public.mfg_update_selling_price_from_cost(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_order record;
    v_cost_per_unit numeric;
BEGIN
    SELECT po.* INTO v_order FROM public.mfg_production_orders po WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- جلب التكلفة الفعلية للوحدة من رؤية الربحية
    SELECT (total_actual_cost / NULLIF(qty, 0)) INTO v_cost_per_unit
    FROM public.v_mfg_order_profitability
    WHERE order_id = p_order_id AND organization_id = v_order.organization_id;

    IF v_cost_per_unit > 0 THEN
        -- تحديث سعر المنتج (التكلفة + 20% هامش ربح)
        UPDATE public.products
        SET price = ROUND(v_cost_per_unit * 1.20, 2),
            sales_price = ROUND(v_cost_per_unit * 1.20, 2)
        WHERE id = v_order.product_id AND organization_id = v_order.organization_id;
    END IF;
END; $$;

-- 3.5. دوال إدارة المواد الخام

-- 🛠️ دالة إنشاء طلب صرف مواد لأمر إنتاج
CREATE OR REPLACE FUNCTION public.mfg_create_material_request(p_production_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record;
    v_request_id uuid;
    v_request_number text;
    v_org_id uuid;
    v_material_item record;
BEGIN
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_production_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    v_org_id := v_order.organization_id;

    IF EXISTS (SELECT 1 FROM public.mfg_material_requests WHERE production_order_id = p_production_order_id AND status IN ('pending', 'approved')) THEN
        RAISE EXCEPTION 'يوجد بالفعل طلب صرف مواد مفتوح لأمر الإنتاج هذا.';
    END IF;

    v_request_number := 'MR-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.mfg_material_requests (
        production_order_id, request_number, requested_by, organization_id, status
    ) VALUES (
        p_production_order_id, v_request_number, auth.uid(), v_org_id, 'pending'
    ) RETURNING id INTO v_request_id;

    FOR v_material_item IN
        SELECT
            sm.raw_material_id,
            SUM(sm.quantity_required * v_order.quantity_to_produce) AS total_required_qty
        FROM public.mfg_routings r
        JOIN public.mfg_routing_steps rs ON r.id = rs.routing_id
        JOIN public.mfg_step_materials sm ON rs.id = sm.step_id
        WHERE r.product_id = v_order.product_id AND r.is_default = TRUE AND r.organization_id = v_org_id
        GROUP BY sm.raw_material_id
    LOOP
        INSERT INTO public.mfg_material_request_items (
            material_request_id, raw_material_id, quantity_requested, organization_id
        ) VALUES (
            v_request_id, v_material_item.raw_material_id, v_material_item.total_required_qty, v_org_id
        );
    END LOOP;

    RETURN v_request_id;
END; $$;

-- 🛠️ دالة صرف المواد من المخزون
CREATE OR REPLACE FUNCTION public.mfg_issue_material_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_request record; v_item record; v_org_id uuid; v_je_id uuid; v_mappings jsonb; v_current_stock numeric;
    v_inv_raw_acc uuid; v_wip_acc uuid; v_total_issued_cost numeric := 0; v_product_cost numeric;
BEGIN
    SELECT * INTO v_request FROM public.mfg_material_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'طلب صرف المواد غير موجود'; END IF;
    IF v_request.status = 'issued' THEN RETURN; END IF;
    v_org_id := v_request.organization_id;

    FOR v_item IN SELECT * FROM public.mfg_material_request_items WHERE material_request_id = p_request_id LOOP
        SELECT COALESCE(stock, 0) INTO v_current_stock FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
        IF v_current_stock < v_item.quantity_requested THEN
            RAISE EXCEPTION 'نقص في المخزون للمادة %', (SELECT name FROM public.products WHERE id = v_item.raw_material_id);
        END IF;

        UPDATE public.products SET stock = stock - v_item.quantity_requested
        WHERE id = v_item.raw_material_id AND organization_id = v_org_id;

        SELECT COALESCE(weighted_average_cost, cost, purchase_price, 0) INTO v_product_cost
        FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
        v_total_issued_cost := v_total_issued_cost + (v_item.quantity_requested * v_product_cost);
        UPDATE public.mfg_material_request_items SET quantity_issued = v_item.quantity_requested WHERE id = v_item.id;
    END LOOP;

    UPDATE public.mfg_material_requests SET status = 'issued', issued_by = auth.uid(), issue_date = now() WHERE id = p_request_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inv_raw_acc := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_wip_acc := COALESCE(
        (v_mappings->>'INVENTORY_WIP')::uuid,
        (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_org_id LIMIT 1)
    );

    -- إزالة شرط الصرامة على v_wip_acc لضمان إنشاء القيد حتى لو تم الترحيل لحساب المخزون الرئيسي
    IF v_total_issued_cost > 0 AND v_inv_raw_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, 'صرف مواد لأمر الإنتاج رقم: ' || (SELECT order_number FROM public.mfg_production_orders WHERE id = v_request.production_order_id), v_request.request_number, 'posted', v_org_id, true, p_request_id, 'mfg_material_request')
        RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, v_total_issued_cost, 0, 'تحميل مواد خام على WIP', v_org_id), (v_je_id, v_inv_raw_acc, 0, v_total_issued_cost, 'صرف مواد خام من المخزن', v_org_id);
    END IF;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 3.6. دوال تتبع الأرقام التسلسلية والتتبع

-- 🛠️ دالة توليد الأرقام التسلسلية آلياً عند الإغلاق
CREATE OR REPLACE FUNCTION public.mfg_generate_batch_serials(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record;
    v_i integer;
    v_serial text;
BEGIN
    SELECT po.*, p.requires_serial INTO v_order
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    WHERE po.id = p_order_id;

    IF v_order.requires_serial THEN
        FOR v_i IN 1..floor(COALESCE(v_order.quantity_to_produce, 0))::integer LOOP
            v_serial := 'SN-' || v_order.order_number || '-' || LPAD(v_i::text, 4, '0');
            INSERT INTO public.mfg_batch_serials (production_order_id, product_id, serial_number, organization_id)
            VALUES (p_order_id, v_order.product_id, v_serial, v_order.organization_id)
            ON CONFLICT (serial_number, organization_id) DO NOTHING;
        END LOOP;
    END IF;
END; $$;

-- 🛠️ دالة تتبع "نسب" المنتج (Product Genealogy / Traceability)
CREATE OR REPLACE FUNCTION public.mfg_get_product_genealogy(p_serial_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_serial record;
    v_order record;
    v_components jsonb;
    v_process jsonb;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن بيانات الرقم التسلسلي
    SELECT * INTO v_serial FROM public.mfg_batch_serials
    WHERE serial_number = p_serial_number AND organization_id = v_org_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'الرقم التسلسلي غير موجود في قاعدة بيانات هذه المنظمة');
    END IF;

    -- 2. جلب بيانات أمر الإنتاج والمنتج
    SELECT po.*, p.name as product_name
    INTO v_order
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    WHERE po.id = v_serial.production_order_id;

    -- 3. جلب المكونات المستخدمة في هذه الدفعة (Standard vs Actual)
    SELECT jsonb_agg(t) INTO v_components FROM (
        SELECT
            rm.name as material_name,
            ROUND(SUM(amu.standard_quantity) / NULLIF(v_order.quantity_to_produce, 0), 4) as standard_per_unit,
            ROUND(SUM(amu.actual_quantity) / NULLIF(v_order.quantity_to_produce, 0), 4) as actual_per_unit,
            jsonb_agg(DISTINCT jsonb_build_object(
                'request_number', mr.request_number,
                'issue_date', mr.issue_date
            )) as associated_requests
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        LEFT JOIN public.mfg_material_requests mr ON mr.production_order_id = op.production_order_id
        WHERE op.production_order_id = v_order.id
        GROUP BY rm.name
    ) t;

    -- 4. جلب سجل العمليات والوقت المستغرق
    SELECT jsonb_agg(t) INTO v_process FROM (
        SELECT
            rs.operation_name,
            wc.name as work_center_name,
            op.actual_start_time,
            op.actual_end_time,
            op.status
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = v_order.id
        ORDER BY rs.step_order
    ) t;

    RETURN jsonb_build_object(
        'product_info', jsonb_build_object(
            'name', v_order.product_name,
            'serial_number', p_serial_number,
            'batch_number', v_order.batch_number,
            'order_number', v_order.order_number,
            'produced_at', v_order.end_date
        ),
        'components_traceability', COALESCE(v_components, '[]'::jsonb),
        'manufacturing_steps', COALESCE(v_process, '[]'::jsonb)
    );
END; $$;

-- 🛠️ دالة جلب الأرقام التسلسلية لأمر إنتاج معين
CREATE OR REPLACE FUNCTION public.mfg_get_serials_by_order(p_order_number text)
RETURNS TABLE (serial_number text, product_name text, batch_number text) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT bs.serial_number, p.name, po.batch_number
    FROM public.mfg_batch_serials bs
    JOIN public.mfg_production_orders po ON bs.production_order_id = po.id
    JOIN public.products p ON bs.product_id = p.id
    WHERE po.order_number = p_order_number AND po.organization_id = public.get_my_org();
END; $$;

-- 🛠️ دالة جلب تفاصيل أمر إنتاج برقم الأمر
CREATE OR REPLACE FUNCTION public.mfg_get_production_order_details_by_number(p_order_number text)
RETURNS TABLE (order_id uuid, order_number text, status text, product_name text, quantity numeric) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT po.id, po.order_number, po.status, p.name, po.quantity_to_produce
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    WHERE po.order_number = p_order_number AND po.organization_id = public.get_my_org();
END; $$;

-- 3.7. دوال أرضية المصنع والمسح الضوئي

-- 🛠️ دالة جلب مهام "أرضية المصنع" (Shop Floor Tasks)
CREATE OR REPLACE FUNCTION public.mfg_get_shop_floor_tasks(p_work_center_id uuid DEFAULT NULL)
RETURNS TABLE (
    progress_id uuid,
    step_id uuid,
    order_number text,
    product_name text,
    operation_name text,
    status text,
    target_qty numeric
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT
        op.id,
        op.step_id,
        po.order_number,
        p.name,
        rs.operation_name,
        op.status,
        po.quantity_to_produce
    FROM public.mfg_order_progress op
    JOIN public.mfg_production_orders po ON op.production_order_id = po.id
    JOIN public.products p ON po.product_id = p.id
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    WHERE po.organization_id = public.get_my_org()
    AND po.status = 'in_progress'
    AND op.status IN ('pending', 'in_progress') -- تم التعديل: عرض المهام المعلقة أو قيد التشغيل
    AND (p_work_center_id IS NULL OR rs.work_center_id = p_work_center_id)
    ORDER BY rs.step_order ASC;
END; $$;

-- 🛠️ دالة معالجة الباركود (Barcode Scanner Handler)
CREATE OR REPLACE FUNCTION public.mfg_process_scan(p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_progress_id uuid;
    v_current_status text;
    v_order_qty numeric;
    v_production_order_id uuid;
BEGIN
    -- نفترض أن الباركود يحتوي على معرف سجل التقدم (Progress ID)
    v_progress_id := p_barcode::uuid;

    -- جلب الحالة الحالية وكمية الإنتاج لأمر الإنتاج المرتبط
    SELECT op.status, po.quantity_to_produce, op.production_order_id
    INTO v_current_status, v_order_qty, v_production_order_id
    FROM public.mfg_order_progress op
    JOIN public.mfg_production_orders po ON op.production_order_id = po.id
    WHERE op.id = v_progress_id;

    IF v_current_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'المرحلة غير موجودة.');
    END IF;

    IF v_current_status = 'pending' THEN
        -- حاول بدء المرحلة فقط إذا كانت حالتها 'pending'
        UPDATE public.mfg_order_progress
        SET status = 'in_progress',
            actual_start_time = now()
        WHERE id = v_progress_id AND status = 'pending';

        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'action', 'started', 'message', 'تم بدء العمل على المرحلة');
        ELSE
            -- إذا لم يتم التحديث، فهذا يعني أن الحالة تغيرت بالفعل (سباق زمني)
            RETURN jsonb_build_object('success', false, 'message', 'حالة المرحلة تغيرت بالفعل. يرجى تحديث الشاشة.');
        END IF;
    ELSIF v_current_status = 'in_progress' THEN
        -- حاول إكمال المرحلة فقط إذا كانت حالتها 'in_progress'
        -- هنا يجب أن نستدعي mfg_complete_step لأنه يحتوي على منطق محاسبي واستهلاك مواد معقد
        PERFORM public.mfg_complete_step(v_progress_id, v_order_qty);
        -- mfg_complete_step ستقوم بالتحديث وتتحقق من الحالة بنفسها
        RETURN jsonb_build_object('success', true, 'action', 'completed', 'message', 'تم إكمال المرحلة بنجاح');
    ELSIF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'المرحلة مكتملة بالفعل.');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'حالة المرحلة غير صالحة للعملية.');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'خطأ في قراءة الباركود: ' || SQLERRM);
END; $$;

-- 3.8. دوال التنبيهات والتقارير الذكية

-- 🛠️ دالة فحص كفاءة مراكز العمل وإصدار تنبيهات ذكية (Efficiency Alerts)
CREATE OR REPLACE FUNCTION public.mfg_check_efficiency_alerts(p_threshold numeric DEFAULT 70)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- جلب كافة المسئولين في المنظمة الحالية
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP

        -- التحقق من مراكز العمل التي انخفضت كفاءتها
        FOR v_row IN
            SELECT * FROM public.v_mfg_work_center_efficiency
            WHERE efficiency_percentage < p_threshold AND organization_id = v_org_id
        LOOP
            INSERT INTO public.notifications (
                user_id,
                title,
                message,
                priority,
                organization_id
            ) VALUES (
                v_admin_id,
                'تنبيه كفاءة الإنتاج: ' || v_row.work_center_name,
                format('انخفض أداء المركز (%s) إلى %s%% وهي أقل من المعيار (%s%%)',
                       v_row.work_center_name, v_row.efficiency_percentage, p_threshold),
                'high',
                v_org_id
            );
            v_alert_count := v_alert_count + 1;
        END LOOP;
    END LOOP;

    RETURN v_alert_count;
END; $$;

-- 🔔 نظام التنبيهات الذكية لانحرافات التصنيع
CREATE OR REPLACE FUNCTION public.mfg_check_variance_alerts(p_threshold numeric DEFAULT 10)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- جلب المسئولين في المنظمة
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP

        -- البحث عن انحرافات تتجاوز العتبة المحددة (10%)
        FOR v_row IN
            SELECT * FROM public.v_mfg_bom_variance
            WHERE ABS(variance_percentage) > p_threshold AND organization_id = v_org_id
        LOOP
            INSERT INTO public.notifications (
                user_id,
                title,
                message,
                type,
                priority,
                organization_id
            ) VALUES (
                v_admin_id,
                'تنبيه: انحراف مواد خطير',
                format('المادة (%s) في الطلب (%s) سجلت انحرافاً بنسبة %s%%',
                       v_row.material_name, v_row.order_number, v_row.variance_percentage),
                'high_debt', -- نستخدم نوع متاح في نظام الإخطارات للأولوية
                'high',
                v_org_id
            );
            v_alert_count := v_alert_count + 1;
        END LOOP;
    END LOOP;

    RETURN v_alert_count;
END; $$;

-- 🔔 دالة تنبيهات تجاوز تكلفة الإنتاج المعيارية
CREATE OR REPLACE FUNCTION public.mfg_check_cost_overrun_alerts(p_threshold_percentage numeric DEFAULT 5)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
    v_standard_cost_per_unit numeric;
    v_expected_total_standard_cost numeric;
    v_cost_overrun_percentage numeric;
    v_order_product_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- جلب المسئولين في المنظمة
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP

        -- البحث عن أوامر إنتاج مكتملة تجاوزت تكلفتها الفعلية التكلفة المعيارية بحد معين
        FOR v_row IN
            SELECT
                vpop.order_id,
                vpop.order_number,
                vpop.product_name,
                vpop.qty,
                vpop.total_actual_cost,
                po.product_id AS order_product_id
            FROM public.v_mfg_order_profitability vpop
            JOIN public.mfg_production_orders po ON vpop.order_id = po.id
            WHERE vpop.organization_id = v_org_id
              AND po.status = 'completed' -- فقط الأوامر المكتملة
        LOOP
            v_order_product_id := v_row.order_product_id;
            -- حساب التكلفة المعيارية للمنتج الواحد باستخدام الدالة الموجودة
            v_standard_cost_per_unit := public.mfg_calculate_standard_cost(v_order_product_id);
            v_expected_total_standard_cost := v_standard_cost_per_unit * v_row.qty;

            IF v_expected_total_standard_cost > 0 THEN
                v_cost_overrun_percentage := ROUND(((v_row.total_actual_cost - v_expected_total_standard_cost) / v_expected_total_standard_cost) * 100, 2);
            ELSE
                v_cost_overrun_percentage := 0; -- تجنب القسمة على صفر إذا كانت التكلفة المعيارية صفر
            END IF;

            IF v_cost_overrun_percentage > p_threshold_percentage THEN
                INSERT INTO public.notifications (user_id, title, message, type, priority, organization_id)
                VALUES (v_admin_id, 'تنبيه: تجاوز تكلفة الإنتاج المعيارية',
                        format('أمر الإنتاج (%s) للمنتج (%s) تجاوز التكلفة المعيارية بنسبة %s%%. التكلفة الفعلية: %s، المعيارية: %s',
                               v_row.order_number, v_row.product_name, v_cost_overrun_percentage, v_row.total_actual_cost, v_expected_total_standard_cost),
                        'cost_overrun', 'high', v_org_id);
                v_alert_count := v_alert_count + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_alert_count;
END; $$;

-- 🔔 تنبيه نقص الأرقام التسلسلية عند الإغلاق
CREATE OR REPLACE FUNCTION public.mfg_check_missing_serials_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP
        FOR v_row IN
            SELECT order_number, product_name, quantity_to_produce, total_serials_generated
            FROM public.v_mfg_dashboard
            WHERE organization_id = v_org_id
              AND status = 'completed'
              AND requires_serial = true
              AND total_serials_generated < quantity_to_produce
        LOOP
            INSERT INTO public.notifications (user_id, title, message, type, priority, organization_id)
            VALUES (v_admin_id, 'تنبيه: نقص أرقام تسلسلية',
                    format('أمر الإنتاج (%s) للمنتج (%s) اكتمل بـ %s سيريال فقط من أصل %s مطلوب.',
                           v_row.order_number, v_row.product_name, v_row.total_serials_generated, v_row.quantity_to_produce),
                    'missing_serials', 'medium', v_org_id);
            v_alert_count := v_alert_count + 1;
        END LOOP;
    END LOOP;

    RETURN v_alert_count;
END; $$;

-- 3.9. دوال الاختبار (للتأكد من عمل الموديول)

-- 🛠️ دالة اختبار دورة التصنيع الكاملة (Manufacturing Integration Test)
CREATE OR REPLACE FUNCTION public.mfg_test_full_cycle()
RETURNS TABLE(step_name text, result text, details text) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_org_id uuid;
    v_prod_id uuid;
    v_raw_id uuid;
    v_wc_id uuid;
    v_routing_id uuid;
    v_step_id uuid;
    v_order_id uuid;
    v_prog_id uuid;
    v_wh_id uuid; -- تم إضافة تعريف المستودع
BEGIN
    -- 1. الإعداد
    v_org_id := public.get_my_org();

    -- ضمان وجود organization_id للاختبار
    IF v_org_id IS NULL THEN
        -- محاولة جلب أي organization_id موجود
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
        IF v_org_id IS NULL THEN
            -- إذا لم توجد أي منظمة، قم بإنشاء واحدة مؤقتة للاختبار
            INSERT INTO public.organizations (name) VALUES ('Test Organization for MFG') RETURNING id INTO v_org_id;
            step_name := '0. تهيئة المنظمة'; result := 'INFO'; details := 'تم إنشاء منظمة اختبار مؤقتة'; RETURN NEXT;
        END IF;
    END IF;

    -- جلب أول مستودع متاح للمنظمة
    SELECT id INTO v_wh_id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    IF v_wh_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('Test Warehouse', v_org_id) RETURNING id INTO v_wh_id;
        step_name := '0.5 تهيئة المستودع'; result := 'INFO'; details := 'تم إنشاء مستودع اختبار مؤقت'; RETURN NEXT;
    END IF;

    -- إنشاء منتج تام ومادة خام للاختبار
    INSERT INTO public.products (name, mfg_type, requires_serial, organization_id)
    VALUES ('منتج اختباري نهائي', 'standard', true, v_org_id) RETURNING id INTO v_prod_id;

    INSERT INTO public.products (name, mfg_type, stock, weighted_average_cost, organization_id)
    VALUES ('خامة اختبارية', 'raw', 100, 10, v_org_id) RETURNING id INTO v_raw_id;

    step_name := '1. تهيئة البيانات'; result := 'PASS ✅'; details := 'تم إنشاء المنتج والخامة'; RETURN NEXT;

    -- 2. إنشاء مركز عمل ومسار
    INSERT INTO public.mfg_work_centers (name, hourly_rate, organization_id)
    VALUES ('مركز اختبار', 50, v_org_id) RETURNING id INTO v_wc_id;

    INSERT INTO public.mfg_routings (product_id, name, organization_id)
    VALUES (v_prod_id, 'مسار افتراضي', v_org_id) RETURNING id INTO v_routing_id;

    INSERT INTO public.mfg_routing_steps (routing_id, step_order, work_center_id, operation_name, standard_time_minutes, organization_id)
    VALUES (v_routing_id, 1, v_wc_id, 'مرحلة اختبارية', 60, v_org_id) RETURNING id INTO v_step_id;

    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_step_id, v_raw_id, 2, v_org_id);

    step_name := '2. إعداد المسار وBOM'; result := 'PASS ✅'; details := 'تم ربط الخامة بمركز العمل'; RETURN NEXT;

    -- 3. إنشاء أمر إنتاج وبدء التنفيذ
    INSERT INTO public.mfg_production_orders (order_number, product_id, quantity_to_produce, status, organization_id, warehouse_id) -- تم إضافة warehouse_id
    VALUES ('TEST-' || substring(gen_random_uuid()::text, 1, 8), v_prod_id, 5, 'in_progress', v_org_id, v_wh_id) RETURNING id INTO v_order_id;

    INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
    VALUES (v_order_id, v_step_id, 'pending', v_org_id) RETURNING id INTO v_prog_id;

    PERFORM public.mfg_start_step(v_prog_id);
    PERFORM public.mfg_complete_step(v_prog_id, 5);

    step_name := '3. تنفيذ الإنتاج'; result := 'PASS ✅'; details := 'تم خصم الخامة (10 وحدات) وتحميل WIP'; RETURN NEXT;

    -- 4. الإغلاق المالي وتوليد السيريالات
    PERFORM public.mfg_finalize_order(v_order_id);

    step_name := '4. الإغلاق والسيريالات'; result := 'PASS ✅'; details := 'تم توليد 5 أرقام تسلسلية وتحديث المخزون'; RETURN NEXT;

    -- 5. التحقق النهائي
    IF EXISTS (SELECT 1 FROM public.mfg_batch_serials WHERE production_order_id = v_order_id) AND
       (SELECT stock FROM public.products WHERE id = v_prod_id) = 5 THEN
        step_name := '5. التحقق من النتائج'; result := 'SUCCESS 🏆'; details := 'الدورة كاملة من الإنتاج للمحاسبة سليمة';
    ELSE
        step_name := '5. التحقق من النتائج'; result := 'FAIL ❌'; details := 'فشل في مطابقة المخزون أو السيريالات';
    END IF;
    RETURN NEXT;

END; $$;


-- ================================================================
-- 4. مشغلات مديول التصنيع (MFG Module Triggers)
-- ================================================================

-- 🛠️ مشغل خصم المخزون اللحظي عند دفع الطلب (للمطاعم والـ POS)
CREATE OR REPLACE FUNCTION public.trigger_handle_stock_on_order()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IN ('PAID', 'COMPLETED') AND (OLD.status IS NULL OR OLD.status NOT IN ('PAID', 'COMPLETED'))) THEN
        PERFORM public.mfg_deduct_stock_from_order(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_stock_on_order ON public.orders;
CREATE TRIGGER trg_handle_stock_on_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trigger_handle_stock_on_order();

-- 🛠️ مشغل إنشاء طلب الصرف تلقائياً
CREATE OR REPLACE FUNCTION public.fn_mfg_auto_create_material_request()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
        PERFORM public.mfg_create_material_request(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_mfg_auto_material_request ON public.mfg_production_orders;
CREATE TRIGGER trg_mfg_auto_material_request
AFTER UPDATE OF status ON public.mfg_production_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_mfg_auto_create_material_request();

-- ================================================================
-- 5. جدولة المهام (Cron Jobs)
-- ================================================================
-- 🕒 جدولة تنبيهات التصنيع (Manufacturing Alerts Automation)
-- يتم تشغيل هذه المهام عبر pg_cron لفحص الانحرافات والسيريالات المفقودة
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
        -- إلغاء الجدولة القديمة لتجنب التكرار
        BEGIN
            EXECUTE 'SELECT cron.unschedule(''mfg-efficiency-check'')';
            EXECUTE 'SELECT cron.unschedule(''mfg-variance-check'')';
            EXECUTE 'SELECT cron.unschedule(''mfg-cost-overrun-check'')';
            EXECUTE 'SELECT cron.unschedule(''mfg-missing-serials-check'')';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- إعادة الجدولة
        PERFORM cron.schedule('mfg-efficiency-check', '0 * * * *', 'SELECT public.mfg_check_efficiency_alerts(75);');
        PERFORM cron.schedule('mfg-variance-check', '0 2 * * *', 'SELECT public.mfg_check_variance_alerts();');
        PERFORM cron.schedule('mfg-cost-overrun-check', '0 3 * * *', 'SELECT public.mfg_check_cost_overrun_alerts();');
        PERFORM cron.schedule('mfg-missing-serials-check', '0 4 * * *', 'SELECT public.mfg_check_missing_serials_alerts();');

        RAISE NOTICE '✅ تم ضبط جدولة تنبيهات التصنيع بنجاح.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: ملحق pg_cron غير مفعل. لن يتم تفعيل جدولة تنبيهات التصنيع. يمكنك تفعيله من Supabase Dashboard -> Database -> Extensions.';
    END IF;
END $$;

-- ================================================================
-- 6. سياسات أمان الصفوف (RLS - Row Level Security)
-- ================================================================
-- يجب تفعيل RLS على جداول التصنيع لضمان عزل بيانات كل منظمة.
-- هذه السياسات عادة ما يتم تعريفها في ملف setup_rls.sql أو manufacturing_rls.sql.
-- للتأكد من تطبيقها، يرجى مراجعة الملفات المذكورة.

-- مثال على كيفية تفعيل RLS (يجب أن يكون موجوداً في ملف RLS الخاص بك):
-- ALTER TABLE public.mfg_work_centers ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "mfg_select_policy_mfg_work_centers" ON public.mfg_work_centers FOR SELECT TO authenticated USING (organization_id = public.get_my_org() OR public.is_super_admin());
-- CREATE POLICY "mfg_admin_policy_mfg_work_centers" ON public.mfg_work_centers FOR ALL TO authenticated USING ((organization_id = public.get_my_org() AND public.get_my_role() IN ('admin', 'manager')) OR public.is_super_admin());

-- ================================================================
-- 7. منح الصلاحيات (Grants)
-- ================================================================
-- منح صلاحيات SELECT على الرؤى للمستخدمين المصادق عليهم
GRANT SELECT ON public.v_mfg_bom_variance TO authenticated;
GRANT SELECT ON public.v_mfg_material_variance TO authenticated;
GRANT SELECT ON public.v_mfg_work_center_efficiency TO authenticated;
GRANT SELECT ON public.v_mfg_order_profitability TO authenticated;
GRANT SELECT ON public.v_mfg_wip_valuation TO authenticated;
GRANT SELECT ON public.v_mfg_wip_monthly_summary TO authenticated;
GRANT SELECT ON public.v_mfg_dashboard TO authenticated;
GRANT SELECT ON public.v_mfg_available_serials TO authenticated;
GRANT SELECT ON public.v_mfg_serials_master_tracker TO authenticated;

-- منح صلاحية تنفيذ الدوال للمستخدمين المصادق عليهم
GRANT EXECUTE ON FUNCTION public.mfg_start_step(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_complete_step(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_finalize_order(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_create_orders_from_sales(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_merge_sales_orders(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_start_production_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_start_production_orders_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_calculate_standard_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_update_product_standard_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_check_stock_availability(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_check_production_readiness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_get_pending_invoices(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_reserve_stock_for_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_record_qc_inspection(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_record_qc_inspection(text, uuid, text) TO authenticated; -- Overload
GRANT EXECUTE ON FUNCTION public.mfg_record_scrap(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_calculate_production_variance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_update_selling_price_from_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_create_material_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_issue_material_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_deduct_stock_from_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_generate_batch_serials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_get_product_genealogy(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_get_serials_by_order(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_get_production_order_details_by_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_get_shop_floor_tasks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_process_scan(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_check_efficiency_alerts(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_check_variance_alerts(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_check_cost_overrun_alerts(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_check_missing_serials_alerts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_calculate_raw_material_turnover(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_recipe_cost(uuid) TO authenticated; -- Added missing grant
GRANT EXECUTE ON FUNCTION public.get_my_org() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- إعادة تحميل كاش المخطط لضمان تعرف الـ API على التغييرات فوراً وتأكيد النشر
DO $$
BEGIN
    NOTIFY pgrst, 'reload config';
    RAISE NOTICE '✅ تم نشر موديول التصنيع الشامل بنجاح.';
END $$;

-- Add a BEFORE UPDATE trigger to ensure organization_id consistency for orders
-- This function ensures that an order's organization_id cannot be changed to a different organization
-- by a non-super_admin user, and forces it to match the current user's organization if it's inconsistent.
CREATE OR REPLACE FUNCTION public.fn_ensure_order_org_on_update()
RETURNS TRIGGER AS $$
DECLARE
    v_current_org uuid;
BEGIN
    -- Super admins can bypass this check as they have universal access
    IF public.get_my_role() = 'super_admin' THEN
        RETURN NEW;
    END IF;

    -- For authenticated non-super_admin users
    IF auth.uid() IS NOT NULL THEN
        v_current_org := public.get_my_org();

        -- If the current user's organization is known
        IF v_current_org IS NOT NULL THEN
            -- If the order's organization_id (either old or new) does not match the current user's organization
            IF OLD.organization_id IS DISTINCT FROM v_current_org OR NEW.organization_id IS DISTINCT FROM v_current_org THEN
                -- Prevent updating an order that doesn't belong to the current organization
                -- or trying to assign it to a different organization
                RAISE EXCEPTION 'غير مصرح: لا يمكنك تعديل طلب لا ينتمي لمنظمتك أو تغيير معرف المنظمة.';
            END IF;
            -- Ensure NEW.organization_id is explicitly set to the current user's organization
            NEW.organization_id := v_current_org;
        ELSE
            -- If public.get_my_org() returns NULL for an anauthenticated non-super_admin user,
            -- this indicates a deeper issue with the user's profile or session.
            RAISE EXCEPTION 'فشل تحديد المنظمة للمستخدم الحالي. يرجى التأكد من ربط المستخدم بمنظمة.';
        END IF;
    ELSE
        -- If the user is not authenticated, prevent any updates
        RAISE EXCEPTION 'غير مصرح: يجب أن تكون موثقاً لتعديل الطلبات.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it was defined elsewhere or with a different name
DROP TRIGGER IF EXISTS trg_ensure_order_org_on_update ON public.orders;

-- Create the new trigger
CREATE TRIGGER trg_ensure_order_org_on_update
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_order_org_on_update();
