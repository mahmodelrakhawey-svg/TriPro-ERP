-- =============================================================================
-- ⚙️ TriPro ERP — Commercial Add-on: Manufacturing & Production (04_addon_manufacturing.sql)
-- 🏭 مديول التصنيع: خطوط الإنتاج، مراكز العمل، أوامر الشغل، مخطط جانت، صيانة الآلات، والهالك والمنتجات الثانوية
-- =============================================================================

-- ================================================================
-- ================================================================
-- 0. تنظيف شامل للدوال والمشغلات القديمة
-- ================================================================
DO $$
DECLARE
    func_signature text;
    trig_record record;
    func_name text;
BEGIN
    -- 🛡️ التطهير الجذري لتواقيع دوال التصنيع (Precision Purge)
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname IN (
                'mfg_finalize_order', 'mfg_calculate_standard_cost', 'mfg_start_step', 'mfg_complete_step', 
                'mfg_update_product_standard_cost', 'mfg_record_qc_inspection', 'mfg_record_scrap', 'mfg_get_shop_floor_tasks'
             ) 
             AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'MFG Purge info: %', SQLERRM; END $$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric(19,4) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost numeric(19,4) DEFAULT 0;

-- 🛡️ ترميم أعمدة وحدات القياس (UoM Healing) لضمان توافق الجداول الحالية مع التحديثات
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_of_materials') THEN ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_step_materials') THEN ALTER TABLE public.mfg_step_materials ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_actual_material_usage') THEN ALTER TABLE public.mfg_actual_material_usage ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_material_request_items') THEN ALTER TABLE public.mfg_material_request_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'opening_inventories') THEN ALTER TABLE public.opening_inventories ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
END $$;

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
    uom_id uuid REFERENCES public.uoms(id), -- 🛡️ دعم الوحدات في BOM
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

CREATE TABLE IF NOT EXISTS public.mfg_step_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    step_id uuid REFERENCES public.mfg_routing_steps(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    file_url text NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
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
    uom_id uuid REFERENCES public.uoms(id), -- 🛡️ دعم الوحدات في خامات مراحل التشغيل
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_actual_material_usage (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id),
    standard_quantity numeric NOT NULL,
    uom_id uuid REFERENCES public.uoms(id), -- 🛡️ دعم الوحدات في الاستهلاك الفعلي
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
    uom_id uuid REFERENCES public.uoms(id), -- 🛡️ دعم الوحدات في بنود الطلب
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
-- 1.6. دوال التأسيس (Core Manufacturing Calculation Functions)
-- ================================================================

-- 🛠️ دالة حساب التكلفة المعيارية للمنتج (Standard Cost Calculation)
-- النسخة الموحدة بتوقيع (uuid, uuid) لضمان عزل البيانات ودعم التوقيع الجديد
CREATE OR REPLACE FUNCTION public.mfg_calculate_standard_cost(p_product_id uuid, p_org_id uuid DEFAULT public.get_my_org())
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_material_cost numeric := 0;
    v_labor_cost numeric := 0;
    v_overhead_cost numeric := 0;
    v_routing_id uuid;
BEGIN
    -- 1. حساب تكلفة المواد المباشرة من قائمة المواد (BOM) العامة
    SELECT SUM(public.uom_convert(bom.quantity_required, bom.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
    INTO v_material_cost
    FROM public.bill_of_materials bom
    JOIN public.products p ON bom.raw_material_id = p.id
    WHERE bom.product_id = p_product_id AND bom.organization_id = p_org_id;

    -- 2. جلب المسار الإنتاجي الافتراضي
    SELECT id INTO v_routing_id FROM public.mfg_routings 
    WHERE product_id = p_product_id AND organization_id = p_org_id AND is_default = true AND deleted_at IS NULL LIMIT 1;

    -- 3. حساب تكاليف العمالة والمواد والمصاريف من خطوات الإنتاج (Routing Steps)
    IF v_routing_id IS NOT NULL THEN
        -- أ. إضافة تكلفة المواد المعرفة داخل المراحل (في حال عدم وجودها في BOM العام)
        v_material_cost := COALESCE(v_material_cost, 0) + COALESCE((
            SELECT SUM(public.uom_convert(sm.quantity_required, sm.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
            FROM public.mfg_routing_steps rs
            JOIN public.mfg_step_materials sm ON rs.id = sm.step_id
            JOIN public.products p ON sm.raw_material_id = p.id
            WHERE rs.routing_id = v_routing_id
        ), 0);

        -- ب. تكاليف العمالة والمصاريف
        SELECT 
            SUM((rs.standard_time_minutes / 60.0) * COALESCE(wc.hourly_rate, 0)),
            SUM((rs.standard_time_minutes / 60.0) * COALESCE(wc.overhead_rate, 0))
        INTO v_labor_cost, v_overhead_cost
        FROM public.mfg_routing_steps rs
        JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE rs.routing_id = v_routing_id;
    END IF;

    RETURN ROUND(COALESCE(v_material_cost, 0) + COALESCE(v_labor_cost, 0) + COALESCE(v_overhead_cost, 0), 4);
END; $$;

-- ================================================================
-- 2. رؤى مديول التصنيع (MFG Module Views)
-- ================================================================

-- 📊 رؤية محاسبية عامة (ضرورية للوحة التحكم والتقارير المالية)
DROP VIEW IF EXISTS public.journal_lines_view CASCADE;
CREATE OR REPLACE VIEW public.journal_lines_view WITH (security_invoker = true) AS
SELECT 
    jl.id,
    jl.journal_entry_id,
    jl.account_id,
    jl.debit,
    jl.credit,
    (jl.debit - jl.credit) as balance,
    jl.description as line_description,
    je.transaction_date,
    je.reference,
    je.description as entry_description,
    je.status,
    je.organization_id,
    je.related_document_id,
    je.related_document_type,
    a.code as account_code,
    a.name as account_name,
    a.type as account_type
FROM public.journal_lines jl
JOIN public.journal_entries je ON jl.journal_entry_id = je.id
JOIN public.accounts a ON jl.account_id = a.id;

-- 📊 رؤية انحراف المواد حسب المرحلة (Step-wise Material Variance)
DROP VIEW IF EXISTS public.v_mfg_step_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_step_variance WITH (security_invoker = true) AS
SELECT
    COALESCE(po.order_number, '') as order_number,
    COALESCE(rs.operation_name, '') as operation_name,
    COALESCE(p.name, '') as material_name,
    amu.standard_quantity,
    amu.actual_quantity,
    (amu.actual_quantity - amu.standard_quantity) as variance_qty,
    po.organization_id
FROM public.mfg_actual_material_usage amu
JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
JOIN public.mfg_production_orders po ON op.production_order_id = po.id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.products p ON amu.raw_material_id = p.id;

-- 📊 رؤية تحليل انحراف المواد (BOM Variance View)
DROP VIEW IF EXISTS public.v_mfg_bom_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_bom_variance WITH (security_invoker = true) AS
SELECT
    COALESCE(po.order_number, '') as order_number,
    COALESCE(p.name, '') as product_name,
    COALESCE(rm.name, '') as material_name,
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
WITH standard_costs AS (
    -- حساب التكلفة التقديرية لكل منتج بناءً على الـ BOM والمسار
    SELECT 
        p.id as product_id,
        public.mfg_calculate_standard_cost(p.id, p.organization_id) as std_cost_per_unit
    FROM public.products p
    WHERE p.mfg_type = 'standard'
),
labor_summary AS (
    SELECT
        op.production_order_id,
        SUM(COALESCE(op.labor_cost_actual, 0)) as total_labor,
        SUM(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)) as total_overhead
    FROM public.mfg_order_progress op
    LEFT JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    GROUP BY op.production_order_id
),
material_summary AS (

    -- 🛡️ منع الازدواجية في التقارير: نجمع AMU مع MR المستقلة فقط
    SELECT po_id, SUM(cost) as total_material_cost FROM (
        SELECT op.production_order_id as po_id, SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0)) as cost
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.products rm ON amu.raw_material_id = rm.id
        GROUP BY op.production_order_id, amu.raw_material_id
        UNION ALL
        SELECT mr.production_order_id as po_id, SUM(mri.quantity_issued * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) as cost
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.status = 'issued'
        AND NOT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op2 
            JOIN public.mfg_actual_material_usage amu2 ON op2.id = amu2.order_progress_id
            WHERE op2.production_order_id = mr.production_order_id AND amu2.raw_material_id = mri.raw_material_id
        )
        GROUP BY mr.production_order_id, mri.raw_material_id
    ) safe_mats GROUP BY po_id
),
byproduct_summary AS (
    -- 🛡️ حساب إجمالي قيمة المنتجات العرضية لتخفيض تكلفة المنتج الرئيسي
    SELECT op.production_order_id, SUM(bl.quantity * bl.market_value_per_unit) as total_byproduct_value
    FROM public.mfg_byproducts_logs bl
    JOIN public.mfg_order_progress op ON bl.order_progress_id = op.id
    GROUP BY op.production_order_id
)
SELECT
    po.id as order_id, po.order_number, p.name as product_name, po.quantity_to_produce as qty, po.status, po.organization_id,
    (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) as sales_value,
    -- تكاليف تقديرية للمقارنة
    ROUND(po.quantity_to_produce * COALESCE(sc.std_cost_per_unit, 0), 2) as estimated_cost,
    -- تكاليف فعلية (تظهر صفر إذا لم يبدأ الإنتاج)
    ROUND((COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0)), 2) as actual_labor,
    ROUND(COALESCE(ms.total_material_cost, 0), 2) as actual_material,
    -- التكلفة الفعلية الإجمالية (خامات + عمالة + أعباء - منتجات عرضية)
    ROUND((COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0) - COALESCE(bs.total_byproduct_value, 0)), 2) as total_actual_cost,
    ROUND((po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) - 
          COALESCE(NULLIF((COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0) - COALESCE(bs.total_byproduct_value, 0)), 0), po.quantity_to_produce * sc.std_cost_per_unit, 0), 2) as net_profit,
    CASE WHEN (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) > 0
         THEN ROUND(((po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) - COALESCE(NULLIF((COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0) - COALESCE(bs.total_byproduct_value, 0)), 0), po.quantity_to_produce * sc.std_cost_per_unit, 0)) / (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) * 100, 2)

         ELSE 0 END as margin_percentage
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN standard_costs sc ON p.id = sc.product_id
LEFT JOIN labor_summary ls ON po.id = ls.production_order_id
LEFT JOIN material_summary ms ON po.id = ms.po_id
LEFT JOIN byproduct_summary bs ON po.id = bs.production_order_id;
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
WITH op_material_costs AS (
    SELECT 
        amu.order_progress_id,
        SUM(COALESCE(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0), 0)) AS material_cost
    FROM public.mfg_actual_material_usage amu
    JOIN public.products rm ON amu.raw_material_id = rm.id
    GROUP BY amu.order_progress_id
)
SELECT to_char(COALESCE(op.actual_end_time, op.actual_start_time, po.created_at), 'YYYY-MM') AS month, p.name AS product_name, wc.name AS work_center_name, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS monthly_labor_cost,
       COALESCE(SUM(omc.material_cost), 0) AS monthly_material_cost,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(omc.material_cost), 0)) AS total_monthly_wip_value
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.mfg_order_progress op ON po.id = op.production_order_id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
LEFT JOIN op_material_costs omc ON op.id = omc.order_progress_id
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
    COALESCE(po.order_number, '') as order_number,
    COALESCE(po.batch_number, '') as batch_number,
    COALESCE(p.name, '') as product_name,
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

    -- 🚀 نعتمد بالكامل على المحرك المركزي الجديد (Recalculate) لضمان الدقة
    -- المحرك الآن أصبح يدعم استهلاك الطلبات (Order Items) تلقائياً
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة حساب معدل دوران المواد الخام (Raw Material Turnover)
CREATE OR REPLACE FUNCTION public.mfg_calculate_raw_material_turnover(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_usage_val numeric;
    v_stock_val numeric;
BEGIN
    -- حساب إجمالي قيمة المواد الخام المستهلكة فعلياً في الفترة للمنظمة بالكامل
    SELECT COALESCE(SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)), 0) 
    INTO v_usage_val
    FROM public.mfg_actual_material_usage amu
    JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
    JOIN public.products p ON amu.raw_material_id = p.id
    WHERE op.organization_id = p_org_id
      AND op.actual_end_time::date BETWEEN p_start_date AND p_end_date;

    -- حساب إجمالي قيمة مخزون المواد الخام الحالي للمنظمة
    SELECT COALESCE(SUM(stock * COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0)), 0) 
    INTO v_stock_val 
    FROM public.products 
    WHERE organization_id = p_org_id AND mfg_type = 'raw';

    RETURN CASE WHEN v_stock_val > 0 THEN ROUND(v_usage_val / v_stock_val, 2) ELSE 0 END;
END; $$;

-- 🛠️ دالة جلب تقرير تحليل تكاليف الإنتاج (Manufacturing Cost Analysis)
CREATE OR REPLACE FUNCTION public.get_manufacturing_analysis(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    id uuid,
    order_number text,
    product_name text,
    quantity numeric,
    end_date date,
    standard_cost numeric,
    actual_cost numeric,
    material_variance numeric,
    wastage_qty numeric,
    variance numeric,
    variance_percent numeric
) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT 
        po.id,
        po.order_number,
        p.name as product_name,
        po.quantity_to_produce as quantity,
        COALESCE(po.end_date, po.created_at::date) as end_date,
        COALESCE(vpop.estimated_cost, 0) as standard_cost,
        COALESCE(vpop.total_actual_cost, 0) as actual_cost,
        COALESCE((SELECT SUM(vbv.variance_qty) FROM public.v_mfg_bom_variance vbv WHERE vbv.order_number = po.order_number AND vbv.organization_id = p_org_id), 0) as material_variance,
        COALESCE((SELECT SUM(sl_inner.quantity) FROM public.mfg_scrap_logs sl_inner JOIN public.mfg_order_progress op_inner ON sl_inner.order_progress_id = op_inner.id WHERE op_inner.production_order_id = po.id), 0) as wastage_qty,
        (COALESCE(vpop.total_actual_cost, 0) - COALESCE(vpop.estimated_cost, 0)) as variance,
        CASE WHEN COALESCE(vpop.estimated_cost, 0) > 0 THEN ROUND(((COALESCE(vpop.total_actual_cost, 0) - COALESCE(vpop.estimated_cost, 0)) / vpop.estimated_cost * 100), 2) ELSE 0 END as variance_percent
    FROM public.mfg_production_orders po
    JOIN public.products p ON po.product_id = p.id
    LEFT JOIN public.v_mfg_order_profitability vpop ON po.id = vpop.order_id
    WHERE po.organization_id = p_org_id
      AND (po.end_date BETWEEN p_start_date AND p_end_date OR po.created_at::date BETWEEN p_start_date AND p_end_date)
    ORDER BY po.created_at DESC;
END; $$;

-- 3.2. دوال إدارة أوامر الإنتاج والمراحل

-- 🛠️ دالة بدء مرحلة إنتاج (Start Step)
CREATE OR REPLACE FUNCTION public.mfg_start_step(p_progress_id uuid, p_employee_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.mfg_order_progress
    SET status = 'active',
        actual_start_time = now(),
        employee_id = p_employee_id
    WHERE id = p_progress_id AND status = 'pending'; -- فقط إذا كانت المرحلة معلقة
END; $$;

-- 1️⃣ دالة مساعدة لحل حساب الإنتاج تحت التشغيل (WIP) للتصنيع وتفادي القيد على حسابات المشاريع
CREATE OR REPLACE FUNCTION public.resolve_mfg_wip_account(p_org_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_mappings jsonb;
    v_wip_acc uuid;
    v_wip_code text;
    v_mfg_wip_acc uuid;
BEGIN
    -- أ. البحث أولاً في خريطة الربط المحاسبي المحددة من الإعدادات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = p_org_id;
    v_wip_acc := (v_mappings->>'INVENTORY_WIP')::uuid;
    
    -- ب. في حال عدم الربط، يتم البحث عن الحساب الافتراضي كود 10303
    IF v_wip_acc IS NULL THEN
        SELECT id, code INTO v_wip_acc, v_wip_code FROM public.accounts 
        WHERE code = '10303' AND organization_id = p_org_id LIMIT 1;
    END IF;
    
    -- ج. كخط دفاع أخير، نرجع لحساب المخزون الرئيسي كود 103
    IF v_wip_acc IS NULL THEN
        SELECT id, code INTO v_wip_acc, v_wip_code FROM public.accounts 
        WHERE code = '103' AND organization_id = p_org_id LIMIT 1;
    END IF;

    IF v_wip_acc IS NULL THEN
        RETURN NULL;
    END IF;

    -- د. إذا كان الحساب المختار ليس مجموعة (Leaf Account)، نستخدمه مباشرة
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_wip_acc AND is_group = true) THEN
        RETURN v_wip_acc;
    END IF;

    -- هـ. إذا كان الحساب مجموعة، نبحث عن حساب فرعي داخله لا يمثل مشروعاً (حتى لا تذهب قيود التصنيع لحسابات المشاريع)
    SELECT id INTO v_mfg_wip_acc FROM public.accounts
    WHERE parent_id = v_wip_acc 
      AND is_group = false 
      AND name NOT LIKE 'مشروع:%' 
      AND name NOT LIKE 'Project:%'
    ORDER BY code LIMIT 1;

    -- و. إذا لم نجد حساباً فرعياً مناسباً للتصنيع، نقوم بإنشاء حساب مخصص للتصنيع فوراً تحت الحساب الرئيسي
    IF v_mfg_wip_acc IS NULL THEN
        SELECT code INTO v_wip_code FROM public.accounts WHERE id = v_wip_acc;
        
        INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
        VALUES (p_org_id, 'مخزون إنتاج تحت التشغيل - تصنيع', v_wip_code || '-mfg', v_wip_acc, 'asset', true, false)
        RETURNING id INTO v_mfg_wip_acc;
    END IF;

    RETURN v_mfg_wip_acc;
END; $$;

-- 🛠️ دالة إكمال مرحلة إنتاج (Complete Step) - النسخة المحسنة
CREATE OR REPLACE FUNCTION public.mfg_complete_step(p_progress_id uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_step record; v_routing_step record; v_mat record;
    v_usage_qty numeric; v_mat_total_cost numeric := 0; v_labor_cost numeric := 0;
    v_je_id uuid; v_mappings jsonb; v_wip_acc uuid; v_inv_acc uuid; v_labor_acc uuid;
    v_org_id uuid; v_scrap_qty numeric := 0; v_wip_debit_amount numeric := 0; v_has_mr boolean;
    v_target_qty numeric;
BEGIN
    -- 1. جلب بيانات التقدم والتحقق من الصلاحية
    SELECT * INTO v_step FROM public.mfg_order_progress WHERE id = p_progress_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سجل تقدم المرحلة غير موجود'; END IF;
    IF v_step.status = 'completed' THEN RETURN; END IF; -- منع التكرار
    v_org_id := v_step.organization_id;

    -- جلب الكمية المستهدفة لأمر الإنتاج
    SELECT quantity_to_produce INTO v_target_qty FROM public.mfg_production_orders WHERE id = v_step.production_order_id;

    -- 🛡️ التحقق هل يوجد طلب صرف مواد (MR) مسبق لهذا الأمر لمنع الازدواجية وعدم الاتزان
    SELECT EXISTS (
        SELECT 1 FROM public.mfg_material_requests 
        WHERE production_order_id = v_step.production_order_id
        AND status = 'issued'
        -- نتحقق من وجود نفس المادة في طلب الصرف لضمان عدم تكرار قيدها
        AND id IN (SELECT material_request_id FROM public.mfg_material_request_items WHERE raw_material_id IN (SELECT raw_material_id FROM public.mfg_step_materials WHERE step_id = v_step.step_id))
    ) INTO v_has_mr;

    -- 2. جلب بيانات مركز العمل لحساب التكلفة
    SELECT rs.standard_time_minutes, wc.hourly_rate
    INTO v_routing_step
    FROM public.mfg_routing_steps rs
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE rs.id = v_step.step_id;

    -- حساب تكلفة العمالة بناءً على الزمن المعياري للكمية الحالية المضافة فقط
    v_labor_cost := (COALESCE(v_routing_step.standard_time_minutes, 0) / 60.0) * p_qty * COALESCE(v_routing_step.hourly_rate, 0);

    -- 3. تحديث حالة المرحلة وتكلفة العمالة بالتراكم
    UPDATE public.mfg_order_progress SET
        status = CASE WHEN (COALESCE(produced_qty, 0) + p_qty) >= v_target_qty THEN 'completed' ELSE 'active' END,
        actual_end_time = CASE WHEN (COALESCE(produced_qty, 0) + p_qty) >= v_target_qty THEN now() ELSE actual_end_time END,
        produced_qty = COALESCE(produced_qty, 0) + p_qty,
        labor_cost_actual = COALESCE(labor_cost_actual, 0) + v_labor_cost,
        qc_verified = NULL -- ✅ يتم وضع علامة على المرحلة بأنها تحتاج لفحص جودة (NULL يعني قيد الانتظار)
    WHERE id = p_progress_id AND status = 'active'; -- تحديث فقط إذا كانت قيد التشغيل

    -- 4. محرك الخصم المخزني الآلي (Stage-based BOM Deduction)
    FOR v_mat IN
        SELECT raw_material_id, quantity_required, uom_id
        FROM public.mfg_step_materials
        WHERE step_id = v_step.step_id
    LOOP
        v_usage_qty := v_mat.quantity_required * p_qty; -- احتساب استهلاك المواد للكمية الجديدة المضافة فقط

        -- 🚀 حساب التكلفة بناءً على الكمية المحولة للوحدة الأساسية (Base UoM)
        v_mat_total_cost := v_mat_total_cost + (
            public.uom_convert(v_usage_qty, v_mat.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_mat.raw_material_id)) * 
            COALESCE((SELECT NULLIF(weighted_average_cost, 0) FROM public.products WHERE id = v_mat.raw_material_id), (SELECT NULLIF(cost, 0) FROM public.products WHERE id = v_mat.raw_material_id), (SELECT purchase_price FROM public.products WHERE id = v_mat.raw_material_id), 0)
        );

        -- ب. تسجيل الاستهلاك الفعلي (بدون تكرار الخصم من المخزن هنا إذا كان هناك MR)
        -- نستخدم فلترة تاريخ الإنشاء لمنع تكرار احتساب نفس التالف في استهلاك الكميات المضافة لاحقاً
        INSERT INTO public.mfg_actual_material_usage (order_progress_id, raw_material_id, standard_quantity, actual_quantity, uom_id, organization_id)
        VALUES (
            p_progress_id,
            v_mat.raw_material_id,
            v_usage_qty,
            v_usage_qty + COALESCE((
                SELECT SUM(quantity) FROM public.mfg_scrap_logs 
                WHERE order_progress_id = p_progress_id 
                AND product_id = v_mat.raw_material_id
                AND created_at > COALESCE((SELECT MAX(created_at) FROM public.mfg_actual_material_usage WHERE order_progress_id = p_progress_id), '1970-01-01'::timestamptz)
            ), 0),
            v_mat.uom_id,
            v_org_id
        );
    END LOOP;

    -- 5. المحرك المحاسبي الصناعي: توليد قيد الإنتاج تحت التشغيل (WIP Entry)

    -- جلب الحسابات (نستخدم كود 10303 للإنتاج تحت التشغيل و 10301 للمواد الخام)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);
    v_inv_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid,
                         (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)));
    v_labor_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'LABOR_COST_ALLOCATED')::uuid,
        (SELECT id FROM public.accounts WHERE code = '513' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1)
    ));

    -- 🛡️ حساب القيمة المدينة للـ WIP: إذا كانت المواد صرفت مسبقاً، نحمل العمالة فقط لضمان توازن القيد
    v_wip_debit_amount := COALESCE(v_labor_cost, 0);
    IF NOT v_has_mr THEN
        v_wip_debit_amount := v_wip_debit_amount + v_mat_total_cost;
    END IF;

    IF v_wip_acc IS NOT NULL AND v_wip_debit_amount > 0 THEN
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
        VALUES (v_je_id, v_wip_acc, v_wip_debit_amount, 0, 'تكلفة قيمة مضافة للمرحلة', v_org_id);

        -- 2. إلى ح/ مخزون المواد الخام (فقط للمواد التي لم تُصرف مسبقاً بطلب صرف)
        IF NOT v_has_mr AND v_mat_total_cost > 0 AND v_inv_acc IS NOT NULL THEN
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
    p_qc_notes text DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false -- 🚀 معامل الأداء للباقة المجانية
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$ -- 🛡️ [V51.0] إضافة حساب انحراف WIP
DECLARE
    v_order record; v_accumulated_wip numeric := 0; v_je_id uuid; v_wip_acc uuid;
    v_fg_acc uuid; v_loss_acc uuid; v_org_id uuid; v_mappings jsonb; v_total_cost numeric := 0; v_wip_variance_acc uuid;
BEGIN
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    IF v_order.status = 'completed' THEN RETURN; END IF;

    v_org_id := v_order.organization_id;

    -- جلب حسابات الربط والتعامل مع حسابات المجموعات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);

    -- 🛡️ [V51.2] الضربة القاضية: حساب رصيد WIP الحقيقي للأمر من كافة القيود (Step + MR + Scrap)
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_accumulated_wip
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE (
        (je.related_document_id = p_order_id AND je.related_document_type IN ('mfg_order', 'mfg_byproduct'))
        OR (je.related_document_type = 'mfg_step' AND je.related_document_id IN (SELECT id FROM public.mfg_order_progress WHERE production_order_id = p_order_id))
        OR (je.related_document_type = 'mfg_material_request' AND je.related_document_id IN (SELECT id FROM public.mfg_material_requests WHERE production_order_id = p_order_id))
        OR (je.related_document_type = 'mfg_scrap' AND je.related_document_id IN (SELECT id FROM public.mfg_order_progress WHERE production_order_id = p_order_id))
    ) AND jl.account_id = v_wip_acc;
    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند
    DELETE FROM public.journal_entries WHERE related_document_id = p_order_id AND related_document_type = 'mfg_order';

    -- [صمام أمان] منع إغلاق أوامر لم يبدأ العمل فيها فعلياً (لمنع التكلفة الصفرية)
    IF NOT EXISTS (SELECT 1 FROM public.mfg_order_progress WHERE production_order_id = p_order_id AND status = 'completed')
       AND NOT EXISTS (SELECT 1 FROM public.mfg_material_requests WHERE production_order_id = p_order_id AND status = 'issued') THEN
        RAISE EXCEPTION 'لا يمكن إغلاق أمر إنتاج لم يتم البدء فيه أو صرف مواد له. يرجى إكمال مراحل العمل أو صرف المواد أولاً.';
    END IF;

    v_org_id := v_order.organization_id;

    -- 🛡️ صمام أمان: ضمان وجود مستودع للأمر قبل الإغلاق لمنع تشتت المخزون
    IF v_order.warehouse_id IS NULL THEN
        v_order.warehouse_id := (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1);
        UPDATE public.mfg_production_orders SET warehouse_id = v_order.warehouse_id WHERE id = p_order_id;
    END IF;

    -- معالجة حالة "إعادة التشغيل"
    IF p_final_status = 'rework' THEN
        UPDATE public.mfg_production_orders SET status = 'in_progress', notes = COALESCE(notes, '') || E'\nإعادة تشغيل جودة: ' || p_qc_notes WHERE id = p_order_id;
        PERFORM public.recalculate_stock_rpc(v_org_id);
        RETURN;
    END IF;

    -- 2. حساب إجمالي التكاليف الفعلية
    SELECT SUM(COALESCE(labor_cost_actual, 0)) INTO v_total_cost
    FROM public.mfg_order_progress WHERE production_order_id = p_order_id;
    
    -- ب. إضافة تكلفة المصاريف غير المباشرة من سجلات التقدم (Overhead)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate)
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    -- ج. إضافة تكلفة المواد الفعلية المستهلكة (AMU) - تحسين الربط لضمان الدقة (V50.2)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu 
        JOIN public.products p ON amu.raw_material_id = p.id
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    -- ج. إضافة تكلفة المواد المصروفة بطلبات صرف (MR) - للأصناف المستقلة فقط لضمان دقة القيد الختامي
    -- د. إضافة تكلفة المواد المصروفة بطلبات صرف (MR) - للأصناف المستقلة فقط (V50.2)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(mri.quantity_issued * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.production_order_id = p_order_id AND mr.status = 'issued'
        AND NOT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op2 
            JOIN public.mfg_actual_material_usage amu2 ON op2.id = amu2.order_progress_id
            WHERE op2.production_order_id = p_order_id AND amu2.raw_material_id = mri.raw_material_id
        )
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
                
                -- 🛡️ تصحيح منطق WAC: إذا كان المخزون الدفتري سالباً بسبب خطأ، نعتبره صفراً للحساب الجديد
                v_old_stock := GREATEST(COALESCE(v_old_stock, 0), 0);

                -- تجنب القسمة على صفر إذا كان المخزون القديم والكمية المنتجة صفر
                IF (COALESCE(v_old_stock, 0) + v_order.quantity_to_produce) > 0 THEN
                    v_new_wac := ROUND(((COALESCE(v_old_stock, 0) * COALESCE(v_old_wac, 0)) + COALESCE(NULLIF(v_accumulated_wip, 0), v_total_cost)) / (COALESCE(v_old_stock, 0) + v_order.quantity_to_produce), 4);
                    UPDATE public.products
                    SET weighted_average_cost = v_new_wac,
                        cost = v_new_wac, -- تحديث حقل التكلفة الأساسي لتوحيد المرجعية
                        purchase_price = CASE WHEN mfg_type = 'standard' THEN v_new_wac ELSE purchase_price END -- تحديث سعر الشراء للأصناف المصنعة
                    WHERE id = v_order.product_id AND organization_id = v_org_id;
                END IF;
            END;
        END IF;
        UPDATE public.mfg_production_orders SET status = 'completed', end_date = now()::date, notes = COALESCE(notes, '') || E'\nاعتماد جودة نهائي: ' || p_qc_notes WHERE id = p_order_id;
        -- ❌ تم إزالة التحديث المباشر للمخزون هنا، حيث أن recalculate_stock_rpc ستتولى الأمر بشكل شامل.

        -- 🚀 تحديث حالة أمر البيع المرتبط إلى "جاهز" (Ready) لتمكين الفوترة
        UPDATE public.sales_orders
        SET status = 'ready'
        WHERE order_number = v_order.batch_number AND organization_id = v_org_id;
    ELSE
        UPDATE public.mfg_production_orders SET status = 'cancelled', notes = 'مرفوض جودة: ' || p_qc_notes WHERE id = p_order_id;
    END IF;

    -- 4. المحرك المحاسبي المحصن ضد حسابات المجموعات (V51.0)
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id); -- 🛡️ [V51.0] التأكد من وجود حساب انحراف WIP
    v_fg_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1))); -- 🛡️ [V51.0] التأكد من وجود حساب انحراف WIP
    v_loss_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WASTAGE_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1))); -- 🛡️ [V51.0] التأكد من وجود حساب انحراف WIP
    v_wip_variance_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WIP_VARIANCE_ACCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1))); -- Fallback to COGS

    IF (COALESCE(v_accumulated_wip, 0) > 0 OR COALESCE(v_total_cost, 0) > 0) AND v_wip_acc IS NOT NULL AND v_fg_acc IS NOT NULL THEN
        -- 🛡️ [V51.0] التأكد من وجود حساب انحراف WIP
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, (CASE WHEN p_final_status = 'completed' THEN 'إغلاق إنتاج: ' ELSE 'خسارة رفض إنتاج: ' END) || v_order.order_number, 'MFG-FIN-' || v_order.order_number, 'posted', v_org_id, true, p_order_id, 'mfg_order') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, CASE WHEN p_final_status = 'completed' THEN v_fg_acc ELSE v_loss_acc END, COALESCE(NULLIF(v_accumulated_wip, 0), v_total_cost), 0, COALESCE('إثبات المنتج التام المصنع: ' || v_order.order_number, 'إغلاق إنتاج'), v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_wip_acc, 0, COALESCE(NULLIF(v_accumulated_wip, 0), v_total_cost), COALESCE('إقفال تكاليف الإنتاج تحت التشغيل: ' || v_order.order_number, 'تفريغ WIP'), v_org_id);
    END IF;

    -- 5. العمليات التكميلية
    BEGIN
        PERFORM public.mfg_calculate_production_variance(p_order_id);
        PERFORM public.mfg_generate_batch_serials(p_order_id);
        -- PERFORM public.mfg_update_selling_price_from_cost(p_order_id); -- 🛑 تم إيقاف التحديث الآلي للسعر لترك التحكم للمستخدم
    EXCEPTION WHEN OTHERS THEN
        -- ⚠️ تسجيل الخطأ في سجل الأخطاء بدلاً من RAISE NOTICE لضمان التتبع
        INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id, user_id)
        VALUES (SQLERRM, jsonb_build_object('order_id', p_order_id, 'step', 'mfg_finalize_sub_functions'), 'mfg_finalize_order', v_org_id, auth.uid());
        RAISE WARNING 'تنبيه: فشل تشغيل بعض العمليات المساعدة لأمر الإنتاج %: %', p_order_id, SQLERRM;
    END;
    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;
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
CREATE OR REPLACE FUNCTION public.mfg_merge_sales_orders(p_invoice_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_item record;
    v_org_id uuid;
    v_order_count integer := 0;
    v_prod_order_id uuid;
    v_batch_ref text;
    v_routing_id uuid;
    v_order_nums text[];
BEGIN
    v_org_id := public.get_my_org();
    v_batch_ref := 'BATCH-' || to_char(now(), 'YYMMDDHH24MI') || '-' || substring(gen_random_uuid()::text, 1, 4);

    -- 🛡️ جلب أرقام الطلبات/الفواتير المحددة لتنظيف المسودات القديمة
    SELECT array_agg(num) INTO v_order_nums FROM (
        SELECT order_number as num FROM public.sales_orders WHERE id = ANY(p_invoice_ids)
        UNION ALL
        SELECT invoice_number as num FROM public.invoices WHERE id = ANY(p_invoice_ids)
    ) t;

    -- 🗑️ تنظيف: حذف أي أوامر إنتاج "مسودة" قديمة مرتبطة بهذه الطلبات لتجنب التكرار في لوحة التحكم
    DELETE FROM public.mfg_production_orders 
    WHERE organization_id = v_org_id 
    AND status = 'draft' 
    AND (batch_number = ANY(v_order_nums) OR order_number = ANY(v_order_nums));

    -- تجميع الكميات المطلوبة لكل منتج من أوامر البيع المحددة
    FOR v_item IN
        SELECT combined.product_id, SUM(combined.quantity) as total_qty
        FROM (
            SELECT product_id, quantity FROM public.invoice_items WHERE invoice_id = ANY(p_invoice_ids)
            UNION ALL
            SELECT product_id, quantity FROM public.sales_order_items WHERE sales_order_id = ANY(p_invoice_ids)
        ) combined
        WHERE EXISTS (SELECT 1 FROM public.mfg_routings r WHERE r.product_id = combined.product_id)
        GROUP BY combined.product_id
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
DECLARE
    v_prod_id uuid;
    v_org_id uuid;
    v_routing_id uuid;
BEGIN
    -- 1. جلب بيانات أمر الإنتاج الأساسية
    SELECT product_id, organization_id INTO v_prod_id, v_org_id 
    FROM public.mfg_production_orders WHERE id = p_order_id;

    -- 2. تحديث الحالة وتاريخ البدء
    UPDATE public.mfg_production_orders 
    SET status = 'in_progress', start_date = now()::date 
    WHERE id = p_order_id AND status = 'draft';

    -- 3. تحديد المسار الإنتاجي الافتراضي للمنتج
    SELECT id INTO v_routing_id FROM public.mfg_routings 
    WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true 
    LIMIT 1;

    -- 4. توليد مراحل العمل آلياً في جدول التقدم (إذا لم تكن مولدة مسبقاً)
    IF v_routing_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.mfg_order_progress WHERE production_order_id = p_order_id) THEN
        INSERT INTO public.mfg_order_progress (production_order_id, step_id, status, organization_id)
        SELECT p_order_id, rs.id, 'pending', v_org_id
        FROM public.mfg_routing_steps rs
        WHERE rs.routing_id = v_routing_id
        ORDER BY rs.step_order ASC;
    END IF;
END; $$;

-- 🛠️ دالة بدء أوامر إنتاج متعددة دفعة واحدة
CREATE OR REPLACE FUNCTION public.mfg_start_production_orders_batch(p_order_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
    v_po_id uuid;
    v_count integer := 0;
BEGIN
    FOR v_id IN SELECT unnest(p_order_ids) LOOP
        -- البحث عن معرف أمر الإنتاج سواء كان الممرر هو المعرف المباشر أو معرف طلب بيع/فاتورة مرتبط
        SELECT po.id INTO v_po_id
        FROM public.mfg_production_orders po
        LEFT JOIN public.sales_orders so ON po.batch_number = so.order_number
        LEFT JOIN public.invoices inv ON po.batch_number = inv.invoice_number
        WHERE (po.id = v_id OR so.id = v_id OR inv.id = v_id)
        AND po.status = 'draft' AND po.organization_id = public.get_my_org()
        LIMIT 1;

        IF v_po_id IS NOT NULL THEN
            PERFORM public.mfg_start_production_order(v_po_id);
            v_count := v_count + 1;
        END IF;
    END LOOP;
    RETURN v_count;
END; $$;

-- 3.3. دوال التخطيط والتحقق

-- 🛠️ دالة تحديث تكلفة المنتج بناءً على الحسبة المعيارية
CREATE OR REPLACE FUNCTION public.mfg_update_product_standard_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_std_cost numeric; v_org_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.products WHERE id = p_product_id;
    v_std_cost := public.mfg_calculate_standard_cost(p_product_id, v_org_id);

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
    invoice_status text,
    doc_type text,
    prod_order_id uuid) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    -- 1. جلب الفواتير التقليدية (للتوافق مع النظام القديم)
    SELECT i.id, i.invoice_number as invoice_num, c.name as cust_name, i.created_at as order_date, COALESCE(i.total_amount, 0) as total, i.status as invoice_status, 'invoice'::text, (SELECT id FROM public.mfg_production_orders WHERE batch_number = i.invoice_number AND status = 'draft' LIMIT 1)
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
        -- تعديل: إظهار الطلب إذا كان أمر الإنتاج المرتبط لا يزال "مسودة" ليتمكن المستخدم من بدئه
        WHERE po.batch_number = i.invoice_number AND po.status != 'draft'    )
    UNION ALL
    -- 2. جلب أوامر البيع الجديدة (Sales Orders)
    SELECT so.id, so.order_number, c.name, so.created_at, COALESCE(so.total_amount, 0), so.status, 'sales_order'::text, (SELECT id FROM public.mfg_production_orders WHERE batch_number = so.order_number AND status = 'draft' LIMIT 1)
    FROM public.sales_orders so
    JOIN public.customers c ON so.customer_id = c.id
    WHERE so.organization_id = p_org_id
    AND so.status = 'confirmed' -- تظهر فقط الأوامر المؤكدة وغير المنتجة بعد
    AND NOT EXISTS (
        SELECT 1 FROM public.mfg_production_orders po
        -- تعديل: إظهار طلب البيع إذا كان أمر الإنتاج المرتبط لا يزال "مسودة"
        WHERE po.batch_number = so.order_number AND po.status != 'draft'    )
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
        status = CASE WHEN p_status = 'rework' THEN 'active' ELSE status END -- تم التعديل: عند إعادة التشغيل، تعود الحالة إلى 'active'
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
    v_scrap_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'WASTAGE_EXPENSE')::uuid,
        (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1)
    ));
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);

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
    -- 🛡️ ملاحظة: تعتمد هذه الدالة على دقة رؤية v_mfg_order_profitability لحساب التكلفة الفعلية الإجمالية، والتي تم إصلاحها لمنع تكرار التكاليف.
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'أمر الإنتاج غير موجود');
    END IF;
    v_org_id := v_order.organization_id;

    -- 2. جلب التكلفة الفعلية الإجمالية من رؤية ربحية أمر الإنتاج
    SELECT COALESCE(total_actual_cost, 0) INTO v_actual_cost
    FROM public.v_mfg_order_profitability
    WHERE order_id = p_order_id AND organization_id = v_org_id;

    -- 3. حساب التكلفة المعيارية الإجمالية (التكلفة المعيارية للوحدة * الكمية المنتجة)
    v_standard_cost_per_unit := public.mfg_calculate_standard_cost(v_order.product_id, v_org_id);
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
        variance_amount, variance_percentage, organization_id, created_at
    ) VALUES (
        p_order_id, v_actual_cost, v_standard_total_cost,
        v_variance_amount, v_variance_percentage, v_org_id, now()
    ) ON CONFLICT (production_order_id) DO UPDATE SET
        actual_total_cost = EXCLUDED.actual_total_cost,
        standard_total_cost = EXCLUDED.standard_total_cost,
        variance_amount = EXCLUDED.variance_amount,
        variance_percentage = EXCLUDED.variance_percentage,
        created_at = now();

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

    v_request_number := 'MR-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 8));

    INSERT INTO public.mfg_material_requests (
        production_order_id, request_number, requested_by, organization_id, status
    ) VALUES (
        p_production_order_id, v_request_number, auth.uid(), v_org_id, 'pending'
    ) RETURNING id INTO v_request_id;

    FOR v_material_item IN
        SELECT
            sm.raw_material_id,
            sm.uom_id,
            SUM(sm.quantity_required * v_order.quantity_to_produce) AS total_required_qty        FROM public.mfg_routings r
        JOIN public.mfg_routing_steps rs ON r.id = rs.routing_id
        JOIN public.mfg_step_materials sm ON rs.id = sm.step_id
        WHERE r.product_id = v_order.product_id AND r.is_default = TRUE AND r.organization_id = v_org_id
        GROUP BY sm.raw_material_id, sm.uom_id
    LOOP
        INSERT INTO public.mfg_material_request_items (
            material_request_id, raw_material_id, quantity_requested, uom_id, organization_id
        ) VALUES (
            v_request_id, v_material_item.raw_material_id, v_material_item.total_required_qty, v_material_item.uom_id, v_org_id
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
    v_item_has_actual_usage boolean;
BEGIN
    SELECT * INTO v_request FROM public.mfg_material_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'طلب صرف المواد غير موجود'; END IF;
    IF v_request.status = 'issued' THEN RETURN; END IF;
    v_org_id := v_request.organization_id;

    FOR v_item IN SELECT * FROM public.mfg_material_request_items WHERE material_request_id = p_request_id LOOP
        -- 🛡️ التحقق مما إذا تم استهلاك هذا الصنف بالفعل في خطوات الإنتاج لتجنب التكرار والازدواجية
        SELECT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op
            JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
            WHERE op.production_order_id = v_request.production_order_id
              AND amu.raw_material_id = v_item.raw_material_id
        ) INTO v_item_has_actual_usage;

        IF v_item_has_actual_usage THEN
            -- إذا تم استهلاكه في أرضية المصنع، نكتفي بتسجيل صرفه ورقياً لتفادي ازدواجية الخصم والقيود وتجنب خطأ نقص المخزون
            UPDATE public.mfg_material_request_items 
            SET quantity_issued = v_item.quantity_requested 
            WHERE id = v_item.id;
        ELSE
            -- 🚀 فحص التوفر بالكمية الأساسية والخصم الفعلي للمواد التي لم تستهلك بعد
            DECLARE
                v_base_qty numeric := public.uom_convert(v_item.quantity_requested, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.raw_material_id));
            BEGIN
                SELECT COALESCE(stock, 0) INTO v_current_stock FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
                
                IF v_current_stock < v_base_qty THEN
                    RAISE EXCEPTION 'نقص في المخزون للمادة %', (SELECT name FROM public.products WHERE id = v_item.raw_material_id);
                END IF;

                UPDATE public.products SET stock = stock - v_base_qty
                WHERE id = v_item.raw_material_id AND organization_id = v_org_id;

                SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), NULLIF(purchase_price, 0), 0) INTO v_product_cost
                FROM public.products WHERE id = v_item.raw_material_id AND organization_id = v_org_id;
                
                v_total_issued_cost := v_total_issued_cost + (v_base_qty * v_product_cost);
                UPDATE public.mfg_material_request_items SET quantity_issued = v_item.quantity_requested WHERE id = v_item.id;
            END;
        END IF;
    END LOOP;

    UPDATE public.mfg_material_requests SET status = 'issued', issued_by = auth.uid(), issue_date = now() WHERE id = p_request_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inv_raw_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)));
    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);

    -- إنشاء القيد فقط للمواد التي تم صرفها حديثاً ولم تقيد بعد في الخطوات الإنتاجية
    IF v_total_issued_cost > 0 AND v_inv_raw_acc IS NOT NULL AND v_wip_acc IS NOT NULL THEN
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
            ROUND(SUM(public.uom_convert(amu.standard_quantity, amu.uom_id, rm.base_uom_id)) / NULLIF(v_order.quantity_to_produce, 0), 4) as standard_per_unit,
            ROUND(SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id)) / NULLIF(v_order.quantity_to_produce, 0), 4) as actual_per_unit,
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
    target_qty numeric,
    produced_qty numeric
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT
        op.id,
        op.step_id,
        po.order_number,
        p.name,
        COALESCE(rs.operation_name, '') as operation_name, -- Ensure operation_name is never NULL
        op.status,
        po.quantity_to_produce,
        COALESCE(op.produced_qty, 0) as produced_qty
    FROM public.mfg_order_progress op
    JOIN public.mfg_production_orders po ON op.production_order_id = po.id
    JOIN public.products p ON po.product_id = p.id
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    WHERE po.organization_id = public.get_my_org()
    AND po.status = 'in_progress'
    AND op.status IN ('pending', 'active') -- تم التعديل: عرض المهام المعلقة أو النشطة
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
        SET status = 'active',
            actual_start_time = now()
        WHERE id = v_progress_id AND status = 'pending';

        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'action', 'started', 'message', 'تم بدء العمل على المرحلة');
        ELSE
            -- إذا لم يتم التحديث، فهذا يعني أن الحالة تغيرت بالفعل (سباق زمني)
            RETURN jsonb_build_object('success', false, 'message', 'حالة المرحلة تغيرت بالفعل. يرجى تحديث الشاشة.');
        END IF;
    ELSIF v_current_status = 'active' THEN
        -- حاول إكمال المرحلة فقط إذا كانت حالتها 'active'
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
    v_standard_cost_per_unit := public.mfg_calculate_standard_cost(v_order_product_id, v_org_id);
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
    v_uom_id uuid;
    v_uom_cat_id uuid;
BEGIN
    -- 🛡️ تفعيل وضع الاستعادة للسماح بتنظيف البيانات المحمية إن وجدت
    PERFORM set_config('app.restore_mode', 'on', true);

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

    -- 🗑️ تنظيف مسبق لبيانات الاختبار بنفس الأسماء لضمان دقة الأرقام
    DELETE FROM public.products WHERE organization_id = v_org_id AND name IN ('منتج اختباري نهائي', 'خامة اختبارية');

    -- ضمان وجود وحدة قياس مرجعية
    SELECT id INTO v_uom_id FROM public.uoms WHERE organization_id = v_org_id AND uom_type = 'reference' LIMIT 1;
    IF v_uom_id IS NULL THEN
        INSERT INTO public.uom_categories (name, organization_id) VALUES ('وحدات اختبار مديول', v_org_id) RETURNING id INTO v_uom_cat_id;
        INSERT INTO public.uoms (name, category_id, uom_type, ratio, organization_id) 
        VALUES ('حبة اختبار مديول', v_uom_cat_id, 'reference', 1, v_org_id) RETURNING id INTO v_uom_id;
    END IF;

    -- إنشاء منتج تام ومادة خام للاختبار
    INSERT INTO public.products (name, mfg_type, requires_serial, organization_id, base_uom_id)
    VALUES ('منتج اختباري نهائي', 'standard', true, v_org_id, v_uom_id) RETURNING id INTO v_prod_id;

    INSERT INTO public.products (name, mfg_type, stock, weighted_average_cost, organization_id, base_uom_id)
    VALUES ('خامة اختبارية', 'raw', 100, 10, v_org_id, v_uom_id) RETURNING id INTO v_raw_id;

    -- 📥 تسجيل رصيد افتتاحي لكي يراه المحرك
    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id, uom_id)
    VALUES (v_raw_id, v_wh_id, 100, 10, v_org_id, v_uom_id);
    step_name := '1. تهيئة البيانات'; result := 'PASS ✅'; details := 'تم إنشاء المنتج والخامة'; RETURN NEXT;

    -- 2. إنشاء مركز عمل ومسار
    INSERT INTO public.mfg_work_centers (name, hourly_rate, organization_id)
    VALUES ('مركز اختبار', 50, v_org_id) RETURNING id INTO v_wc_id;

    INSERT INTO public.mfg_routings (product_id, name, organization_id)
    VALUES (v_prod_id, 'مسار افتراضي', v_org_id) RETURNING id INTO v_routing_id;

    INSERT INTO public.mfg_routing_steps (routing_id, step_order, work_center_id, operation_name, standard_time_minutes, organization_id)
    VALUES (v_routing_id, 1, v_wc_id, 'مرحلة اختبارية', 60, v_org_id) RETURNING id INTO v_step_id;

    INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id, uom_id)
    VALUES (v_step_id, v_raw_id, 2, v_org_id, v_uom_id);

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

    -- 🚀 [إصلاح حرج] ضمان مزامنة المخزون قبل فحص الخطوة 5
    -- التوقيت ضروري هنا لأن التريجرات قد تتأخر أجزاء من الثانية
    PERFORM public.recalculate_stock_rpc(v_org_id);
    PERFORM pg_sleep(0.5); 

    step_name := '4. الإغلاق والسيريالات'; result := 'PASS ✅'; details := 'تم توليد 5 أرقام تسلسلية وتحديث المخزون'; RETURN NEXT;

    -- 5. التحقق النهائي
    IF EXISTS (SELECT 1 FROM public.mfg_batch_serials WHERE production_order_id = v_order_id) AND
       (SELECT stock FROM public.products WHERE id = v_prod_id) = 5 THEN
        step_name := '5. التحقق من النتائج'; result := 'SUCCESS 🏆'; details := 'الدورة كاملة من الإنتاج للمحاسبة سليمة';
    ELSE
        step_name := '5. التحقق من النتائج'; result := 'FAIL ❌'; details := 'فشل في مطابقة المخزون أو السيريالات';
    END IF;
    RETURN NEXT;

    -- 6. تنظيف بيانات الاختبار (جراحي)
    DELETE FROM public.mfg_batch_serials WHERE production_order_id = v_order_id;
    DELETE FROM public.mfg_actual_material_usage WHERE order_progress_id = v_prog_id;
    DELETE FROM public.mfg_order_progress WHERE production_order_id = v_order_id;
    DELETE FROM public.mfg_production_orders WHERE id = v_order_id;
    DELETE FROM public.mfg_routing_steps WHERE id = v_step_id;
    DELETE FROM public.mfg_routings WHERE id = v_routing_id;
    DELETE FROM public.mfg_work_centers WHERE id = v_wc_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_prod_id;
    DELETE FROM public.opening_inventories WHERE product_id IN (v_prod_id, v_raw_id);
    DELETE FROM public.products WHERE id IN (v_prod_id, v_raw_id);
    
    PERFORM set_config('app.restore_mode', 'off', true);
    RETURN;

EXCEPTION WHEN OTHERS THEN
    step_name := 'CRITICAL ERROR'; result := 'ERROR 🛑'; details := SQLERRM;
    PERFORM set_config('app.restore_mode', 'off', true);
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
    -- إذا تم التحديث من مسودة إلى قيد التنفيذ
    IF (TG_OP = 'UPDATE' AND NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status = 'draft')) THEN
        PERFORM public.mfg_create_material_request(NEW.id);
    -- أو إذا تم الإدراج وحالته مباشرة 'in_progress' (كما في حالة الدمج)
    ELSIF (TG_OP = 'INSERT' AND NEW.status = 'in_progress') THEN
        PERFORM public.mfg_create_material_request(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_mfg_auto_material_request ON public.mfg_production_orders;
CREATE TRIGGER trg_mfg_auto_material_request
AFTER INSERT OR UPDATE OF status ON public.mfg_production_orders
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
GRANT SELECT ON public.v_mfg_step_variance TO authenticated;

-- منح صلاحية تنفيذ الدوال للمستخدمين المصادق عليهم
GRANT EXECUTE ON FUNCTION public.mfg_start_step(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_complete_step(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_finalize_order(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_create_orders_from_sales(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_merge_sales_orders(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_start_production_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_start_production_orders_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_calculate_standard_cost(uuid, uuid) TO authenticated;
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
GRANT EXECUTE ON FUNCTION public.get_manufacturing_analysis(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_recipe_cost(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- إعادة تحميل كاش المخطط لضمان تعرف الـ API على التغييرات فوراً وتأكيد النشر
-- ================================================================
-- 8. إصلاح البيانات المتأخر (Post-Execution Data Repair)
-- ================================================================
DO $$ 
BEGIN
    -- 1. إسناد المستودع الرئيسي لأوامر الإنتاج "اليتيمة" (التي ليس لها مستودع) لكي يراها محرك المخزون
    UPDATE public.mfg_production_orders po
    SET warehouse_id = (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
    WHERE warehouse_id IS NULL AND status = 'completed';

    -- 2. تصحيح متوسط التكلفة (WAC) للأصناف التي تضررت بسبب الأرصدة السالبة أو الأخطاء الحسابية
    -- نستخدم التوقيع الجديد (uuid, uuid) ونمرر organization_id صراحة
    UPDATE public.products p
    SET weighted_average_cost = public.mfg_calculate_standard_cost(p.id, p.organization_id),
        cost = public.mfg_calculate_standard_cost(p.id, p.organization_id)
    WHERE p.mfg_type = 'standard' 
      AND (weighted_average_cost <= 0 OR weighted_average_cost > 1000000);

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

    -- 🛡️ السماح بتجاوز الفحص أثناء الاختبارات أو عمليات الاستعادة
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- 📱 السماح لطلبات الزوار (QR Menu) بالمرور طالما المنظمة معرفة
    IF auth.uid() IS NULL OR public.get_my_role() = 'anon' THEN
        IF NEW.organization_id IS NULL THEN
            RAISE EXCEPTION 'فشل تحديد المنظمة لطلب الزائر.';
        END IF;
        RETURN NEW;
    ELSIF auth.uid() IS NOT NULL THEN
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

-- 🛠️ دالة ضمان توجيه حسابات المخزون (Account Enforcement)
-- تمنع عودة الحساب إلى 10302 تلقائياً وتوجه الخامات لـ 10301
CREATE OR REPLACE FUNCTION public.fn_ensure_product_accounts()
RETURNS TRIGGER AS $$
DECLARE
    v_mappings jsonb;
    v_raw_acc uuid;
    v_fg_acc uuid;
BEGIN
    -- 1. جلب إعدادات الربط المحاسبي للمنظمة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = NEW.organization_id;
    
    IF v_mappings IS NOT NULL THEN
        v_raw_acc := (v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid;
        v_fg_acc := (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid;

        -- 🚀 منطق توجيه ذكي مطور (Bi-directional Routing)
        -- أ. التوجيه بناءً على الحساب المختار يدوياً
        IF NEW.inventory_account_id = v_raw_acc THEN
            NEW.mfg_type := 'raw';
        ELSIF NEW.inventory_account_id = v_fg_acc THEN
            NEW.mfg_type := 'standard';
        END IF;

        -- ب. الربط الآلي للحساب بناءً على النوع المختار (معالجة عدم حساسية الحالة)
        IF LOWER(TRIM(COALESCE(NEW.mfg_type, ''))) IN ('raw', 'raw_material') AND NEW.inventory_account_id IS NULL THEN
            NEW.inventory_account_id := v_raw_acc;
        ELSIF LOWER(TRIM(COALESCE(NEW.mfg_type, ''))) IN ('standard', 'finished_goods', 'standard_product') AND NEW.inventory_account_id IS NULL THEN
            NEW.inventory_account_id := v_fg_acc;
        END IF;
    END IF;

    -- 🛠️ تثبيت الأنواع ومنع التحول التلقائي لـ STOCK (Stabilization Fix)
    -- نستخدم COALESCE و LOWER لضمان عدم الفشل في مطابقة القيم
    IF LOWER(TRIM(COALESCE(NEW.mfg_type, ''))) IN ('raw', 'raw_material') THEN
        NEW.product_type := 'RAW_MATERIAL'; -- خامات
        NEW.item_type := 'STOCK';
    ELSIF LOWER(TRIM(COALESCE(NEW.mfg_type, ''))) IN ('standard', 'finished_goods', 'standard_product', 'finished', 'product') THEN
        NEW.product_type := 'MANUFACTURED'; -- 🚀 تصحيح: الإبقاء على النوع كمنتج مصنع
        NEW.item_type := 'STOCK'; -- مخزني (بمعنى أنه يملك رصيد)
    ELSIF LOWER(TRIM(COALESCE(NEW.mfg_type, ''))) IN ('intermediate', 'intermediate_product') THEN
        NEW.product_type := 'INTERMEDIATE_PRODUCT';
        NEW.item_type := 'STOCK';
    ELSE
        -- في حال لم يكن صنفاً صناعياً (مثل الخدمات أو الأصناف التجارية العادية)
        NEW.item_type := COALESCE(NEW.item_type, 'STOCK');
        NEW.product_type := COALESCE(NEW.product_type, NEW.item_type);
    END IF;

    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ربط المشغل بجدول المنتجات
DROP TRIGGER IF EXISTS trg_ensure_product_accounts ON public.products;
CREATE TRIGGER trg_ensure_product_accounts
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_product_accounts();

-- Drop existing trigger if it was defined elsewhere or with a different name
DROP TRIGGER IF EXISTS trg_ensure_order_org_on_update ON public.orders;

-- Create the new trigger
CREATE TRIGGER trg_ensure_order_org_on_update
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_order_org_on_update();


-- 🏭 مديول محاسبة التكاليف المتقدم (Advanced Cost Accounting)
-- ℹ️ الوصف: النسخة الشاملة والموحدة لمحرك تكاليف المراحل (Process Costing)
-- 🛡️ الميزات: الإنتاج المعادل، تسوية WIP للأستاذ العام، نقاط الفحص، والتحكم في نقاط إضافة المواد.
-- 📅 تاريخ التحديث: 2024-06-03

-- ================================================================
-- 1. تحديث الهيكل لدعم محاسبة التكاليف (Schema Enhancements)
-- ================================================================
DO $$ 
BEGIN
    -- إضافة نسبة الإتمام المتوقعة لكل خطوة في المسار الإنتاجي
    ALTER TABLE public.mfg_routing_steps ADD COLUMN IF NOT EXISTS conversion_weight numeric DEFAULT 0;
    ALTER TABLE public.mfg_routing_steps ADD COLUMN IF NOT EXISTS material_addition_point numeric DEFAULT 0;
    ALTER TABLE public.mfg_routing_steps ADD COLUMN IF NOT EXISTS inspection_point numeric DEFAULT 100; -- افتراضياً الفحص في نهاية المرحلة
    ALTER TABLE public.mfg_production_orders ADD COLUMN IF NOT EXISTS is_continuous boolean DEFAULT false; -- هل الطلب مستمر من فترة سابقة؟
    
    -- إضافة نسبة الإتمام الفعلية في سجلات التقدم للإنتاج تحت التشغيل
    ALTER TABLE public.mfg_order_progress ADD COLUMN IF NOT EXISTS material_completion_pct numeric DEFAULT 0;
    ALTER TABLE public.mfg_order_progress ADD COLUMN IF NOT EXISTS conversion_completion_pct numeric DEFAULT 0;

    -- تطوير جدول التالف للتمييز بين المسموح وغير المسموح
    ALTER TABLE public.mfg_scrap_logs ADD COLUMN IF NOT EXISTS is_abnormal boolean DEFAULT false;
    ALTER TABLE public.mfg_scrap_logs ADD COLUMN IF NOT EXISTS salvage_value_per_unit numeric DEFAULT 0;
    ALTER TABLE public.mfg_scrap_logs ADD COLUMN IF NOT EXISTS recovery_account_id uuid REFERENCES public.accounts(id);

    -- إضافة عمود معدل الساعة للموظفين لدعم حسابات الأجور الفعلية
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0;

    -- تأمين أعمدة الربط في القيود المحاسبية لضمان عمل محرك التوزيع
    ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS related_document_id uuid;
    ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS related_document_type text;
END $$;

-- جدول المنتجات العرضية (By-products Logs) لتحميل قيمتها كتخفيض للتكاليف
CREATE TABLE IF NOT EXISTS public.mfg_byproducts_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric NOT NULL DEFAULT 0,
    market_value_per_unit numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- جدول أرصدة أول المدة للإنتاج تحت التشغيل (Beginning WIP Inventory)
-- يستخدم للأوامر المستمرة من شهر لآخر لضمان عدم ضياع التكاليف التاريخية
CREATE TABLE IF NOT EXISTS public.mfg_beginning_wip_inventory (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    material_cost_bf numeric DEFAULT 0, -- Brought Forward
    conversion_cost_bf numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 🛡️ جدول سجل التنبيهات الصناعية التاريخي (Historical Manufacturing Alerts)
CREATE TABLE IF NOT EXISTS public.mfg_alerts_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    alert_type text NOT NULL, -- cost_overrun, efficiency_drop, variance_critical
    title text,
    message text,
    actual_value numeric,
    threshold_value numeric,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- جدول لقطات تكاليف الفترة (Period Cost Snapshots) للتقييم التاريخي لـ WIP
CREATE TABLE IF NOT EXISTS public.mfg_period_cost_snapshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    period_name text NOT NULL,
    order_id uuid REFERENCES public.mfg_production_orders(id),
    material_unit_cost numeric DEFAULT 0,
    conversion_unit_cost numeric DEFAULT 0,
    wip_valuation numeric DEFAULT 0,
    finished_goods_valuation numeric DEFAULT 0,
    abnormal_scrap_loss numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 1.5 تكامل الأجور الفعلية (Labor Integration Logic)
-- ================================================================

-- 📊 رؤية الأجور الفعلية بناءً على بيانات الموارد البشرية
CREATE OR REPLACE VIEW public.v_mfg_actual_labor_costs WITH (security_invoker = true) AS
SELECT 
    op.id as progress_id,
    op.production_order_id,
    op.employee_id,
    e.full_name as employee_name,
    -- حساب ساعات العمل الفعلية بالدقائق وتحويلها لساعات
    EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 3600.0 as actual_hours_worked,
    -- جلب معدل الساعة الحقيقي (أو الراتب مقسوماً على 240 ساعة شهرية)
    COALESCE(
        e.hourly_rate, 
        (NULLIF(e.basic_salary, 0) / 240.0), 
        wc.hourly_rate
    ) as employee_actual_rate,
    -- التكلفة الفعلية = الساعات * المعدل الحقيقي
    ROUND(
        (EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 3600.0) * 
        COALESCE(e.hourly_rate, (NULLIF(e.basic_salary, 0) / 240.0), wc.hourly_rate), 
        2
    ) as actual_labor_cost
FROM public.mfg_order_progress op
JOIN public.employees e ON op.employee_id = e.id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
WHERE op.status = 'completed';

-- 📊 رؤية تحليل انحراف الكفاءة (Worker Efficiency Variance BI)
-- تقارن بين الدقائق المعيارية المسموح بها وبين الدقائق الفعلية التي استغرقها العامل
CREATE OR REPLACE VIEW public.v_mfg_efficiency_variance_analytics WITH (security_invoker = true) AS
SELECT 
    e.full_name as worker_name,
    rs.operation_name as step_name,
    po.order_number,
    op.produced_qty,
    -- الوقت المعياري الكلي = (وقت الوحدة * الكمية)
    (rs.standard_time_minutes * op.produced_qty) as allowed_minutes,
    -- الوقت الفعلي المستغرق بالدقائق
    ROUND(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 60.0, 2) as actual_minutes,
    -- الانحراف (القيمة السالبة تعني تأخير، الموجبة تعني كفاءة أعلى)
    ROUND((rs.standard_time_minutes * op.produced_qty) - (EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 60.0), 2) as time_variance_mins,
    -- نسبة الكفاءة
    CASE 
        WHEN EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) > 0 
        THEN ROUND(((rs.standard_time_minutes * op.produced_qty) / (EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 60.0) * 100), 2)
        ELSE 100 
    END as efficiency_percentage,
    op.organization_id,
    op.actual_end_time as production_date
FROM public.mfg_order_progress op
JOIN public.mfg_production_orders po ON op.production_order_id = po.id
JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
JOIN public.employees e ON op.employee_id = e.id
WHERE op.status = 'completed';

-- ================================================================
-- 2. الرؤى التقاريرية (Cost Accounting Views)
-- ================================================================

-- 📊 1. تقرير الإنتاج المعادل التفصيلي (Step 2 of Process Costing)
DROP VIEW IF EXISTS public.v_mfg_equivalent_units CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_equivalent_units WITH (security_invoker = true) AS
WITH stage_data AS (
    SELECT 
        op.production_order_id,
        rs.operation_name,
        op.produced_qty as units_in_process,
        op.status,
        CASE 
            WHEN op.status = 'completed' THEN op.produced_qty
            WHEN op.material_completion_pct >= rs.material_addition_point THEN op.produced_qty
            ELSE (op.produced_qty * (op.material_completion_pct / 100.0))
        END as material_eq_units,
        CASE 
            WHEN op.status = 'completed' THEN op.produced_qty
            ELSE (op.produced_qty * (op.conversion_completion_pct / 100.0))
        END as conversion_eq_units
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
)
SELECT 
    po.id as order_id,
    po.order_number,
    -- إضافة وحدات أول المدة (Beginning WIP) إذا كان الطلب مستمراً
    COALESCE(SUM(sd.material_eq_units), 0) + COALESCE((SELECT COUNT(*) FROM public.mfg_batch_serials WHERE production_order_id = po.id AND status = 'wip'), 0) as total_material_eq_units,
    COALESCE(SUM(sd.conversion_eq_units), 0) + COALESCE((SELECT COUNT(*) FROM public.mfg_batch_serials WHERE production_order_id = po.id AND status = 'wip'), 0) as total_conversion_eq_units,
    po.organization_id
FROM public.mfg_production_orders po
LEFT JOIN stage_data sd ON po.id = sd.production_order_id
GROUP BY po.id, po.order_number, po.organization_id;

-- 🛠️ دالة توزيع المصاريف الصناعية غير المباشرة الفعلية (Actual Overhead Allocation)
-- تقوم بجلب المصاريف من الأستاذ العام وتوزيعها على الأوامر النشطة بناءً على وحدات التحويل المعادلة
-- 🛠️ دالة مساعدة لحل حساب الأعباء الصناعية المحملة
CREATE OR REPLACE FUNCTION public.resolve_mfg_applied_overhead_account(p_org_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_parent_id uuid;
    v_acc_id uuid;
BEGIN
    SELECT id INTO v_parent_id FROM public.accounts 
    WHERE code = '514' AND organization_id = p_org_id LIMIT 1;
    
    IF v_parent_id IS NULL THEN
        SELECT id INTO v_parent_id FROM public.accounts 
        WHERE (name = 'تكاليف صناعية غير مباشرة' OR code = '514') AND organization_id = p_org_id LIMIT 1;
    END IF;
    
    IF v_parent_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    SELECT id INTO v_acc_id FROM public.accounts
    WHERE parent_id = v_parent_id 
      AND (code = '514-applied' OR name = 'أعباء صناعية محملة (موزعة)')
      AND organization_id = p_org_id LIMIT 1;
      
    IF v_acc_id IS NULL THEN
        INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
        VALUES (p_org_id, 'أعباء صناعية محملة (موزعة)', '514-applied', v_parent_id, 'expense', true, false)
        RETURNING id INTO v_acc_id;
    END IF;
    
    RETURN v_acc_id;
END; $$;

CREATE OR REPLACE FUNCTION public.mfg_allocate_actual_overhead(p_period_start date, p_period_end date, p_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid := public.get_my_org();
    v_total_actual_overhead numeric;
    v_total_eq_units numeric;
    v_overhead_per_unit numeric;
    v_je_id uuid;
    v_wip_acc uuid;
    v_applied_ovh_acc uuid;
BEGIN
    -- 1. حساب إجمالي المصاريف الصناعية غير المباشرة الفعلية (أكواد تبدأ بـ 514)
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_total_actual_overhead
    FROM public.journal_lines_view 
    WHERE organization_id = v_org_id AND account_code LIKE '514%' 
    AND account_code != '514-applied'
    AND transaction_date BETWEEN p_period_start AND p_period_end
    AND (related_document_type IS NULL OR related_document_type != 'mfg_overhead'); -- تجنب الازدواجية بشكل برمجي دقيق

    -- 2. حساب إجمالي وحدات التحويل المعادلة لكافة الأوامر النشطة في الفترة
    SELECT SUM(total_conversion_eq_units) INTO v_total_eq_units 
    FROM public.v_mfg_equivalent_units WHERE organization_id = v_org_id;

    v_wip_acc := public.resolve_mfg_wip_account(v_org_id);
    v_applied_ovh_acc := public.resolve_mfg_applied_overhead_account(v_org_id);

    IF v_total_eq_units > 0 AND v_total_actual_overhead > 0 AND v_wip_acc IS NOT NULL AND v_applied_ovh_acc IS NOT NULL THEN
        v_overhead_per_unit := v_total_actual_overhead / v_total_eq_units;

        -- 4. إنشاء قيد التوزيع في الأستاذ العام
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_type)
        VALUES (p_period_end, 'توزيع أعباء صناعية فعلية: ' || p_description, 'OVH-ALLOC', 'posted', v_org_id, true, 'mfg_overhead')
        RETURNING id INTO v_je_id;

        -- تحميل الـ WIP (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_wip_acc, v_total_actual_overhead, 0, v_org_id, 'تحميل المصاريف الفعلية على الإنتاج');

        -- إقفال حساب الأعباء الموزعة أو المصاريف (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_applied_ovh_acc, 0, v_total_actual_overhead, v_org_id, 'إقفال حساب الأعباء الموزعة');

        RETURN v_je_id;
    END IF;
    RETURN NULL;
END; $$;

-- 📊 2. تقرير المصالحة النهائية (Step 5: Cost Reconciliation) - نسخة Weighted Average
-- يقوم هذا التقرير بجمع تكاليف الفترة مع أول المدة وتوزيعها على الوحدات التامة وتحت التشغيل
DROP VIEW IF EXISTS public.v_mfg_cost_reconciliation_report CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_cost_reconciliation_report WITH (security_invoker = true) AS
WITH period_costs AS (
    SELECT 
        vop.order_id,
        -- إجمالي التكاليف = تكاليف أول المدة المنقولة + تكاليف الفترة الحالية
        COALESCE(bw.material_cost_bf, 0) + (vop.total_actual_cost * 0.7) as total_material_to_account,
        COALESCE(bw.conversion_cost_bf, 0) + (vop.total_actual_cost * 0.3) as total_conversion_to_account,
        vop.total_actual_cost + COALESCE(bw.material_cost_bf, 0) + COALESCE(bw.conversion_cost_bf, 0) as grand_total_to_account
    FROM public.v_mfg_order_profitability vop
    LEFT JOIN public.mfg_beginning_wip_inventory bw ON vop.order_id = bw.order_id
),
eq_units AS ( SELECT * FROM public.v_mfg_equivalent_units ),
unit_cost_calc AS (
    SELECT 
        pc.order_id,
        -- حساب تكلفة الوحدة المعادلة (المتوسط المرجح)
        CASE WHEN eu.total_material_eq_units > 0 THEN pc.total_material_to_account / eu.total_material_eq_units ELSE 0 END as unit_cost_mat,
        CASE WHEN eu.total_conversion_eq_units > 0 THEN pc.total_conversion_to_account / eu.total_conversion_eq_units ELSE 0 END as unit_cost_conv,
        pc.grand_total_to_account
    FROM period_costs pc
    JOIN eq_units eu ON pc.order_id = eu.order_id
),
allocation AS (
    SELECT 
        ucc.order_id,
        ucc.grand_total_to_account,
        ucc.unit_cost_mat,
        ucc.unit_cost_conv,
        -- 1. تكلفة الوحدات التامة (Finished Goods)
        COALESCE((
            SELECT SUM(produced_qty * (ucc.unit_cost_mat + ucc.unit_cost_conv))
            FROM public.mfg_order_progress WHERE production_order_id = ucc.order_id AND status = 'completed'
        ), 0) as cost_finished,
        -- 2. تكلفة الإنتاج تحت التشغيل (Ending WIP)
        COALESCE((
            SELECT SUM(
                (produced_qty * (material_completion_pct/100) * ucc.unit_cost_mat) +
                (produced_qty * (conversion_completion_pct/100) * ucc.unit_cost_conv)
            )
            FROM public.mfg_order_progress WHERE production_order_id = ucc.order_id AND status = 'active'
        ), 0) as cost_wip,
        -- 3. تكلفة التالف غير المسموح (Abnormal Scrap)
        COALESCE((
            SELECT SUM(sl.quantity * (ucc.unit_cost_mat + ucc.unit_cost_conv))
            FROM public.mfg_scrap_logs sl
            JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id
            WHERE op.production_order_id = ucc.order_id AND sl.is_abnormal = true
        ), 0) as cost_abnormal
    FROM unit_cost_calc ucc
)
SELECT 
    po.id as order_id,
    po.order_number,
    p.name as product_name,
    a.grand_total_to_account as total_to_account_for,
    ROUND(a.cost_finished, 2) as cost_assigned_to_finished_goods,
    ROUND(a.cost_wip, 2) as cost_assigned_to_wip,
    ROUND(a.cost_abnormal, 2) as cost_assigned_to_abnormal_scrap,
    -- إجمالي التكاليف الموزعة (يجب أن يطابق total_to_account_for)
    ROUND(a.cost_finished + a.cost_wip + a.cost_abnormal, 2) as total_accounted_for,
    (a.unit_cost_mat + a.unit_cost_conv) as actual_unit_cost,
    a.unit_cost_mat as cost_per_material_eq,
    a.unit_cost_conv as cost_per_conversion_eq,
    po.organization_id
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN allocation a ON po.id = a.order_id;

-- 📊 3. تقرير انحرافات التكاليف (Variance per EQ Unit)
DROP VIEW IF EXISTS public.v_mfg_unit_cost_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_unit_cost_variance AS
SELECT 
    cr.order_number,
    cr.product_name,
    ROUND((cr.total_to_account_for / NULLIF(eu.total_material_eq_units, 0)), 2) as actual_unit_cost,
    p.manufacturing_cost as standard_unit_cost,
    ROUND((cr.total_to_account_for / NULLIF(eu.total_material_eq_units, 0)) - p.manufacturing_cost, 2) as variance_amount,
    cr.organization_id
FROM public.v_mfg_cost_reconciliation_report cr
JOIN public.mfg_production_orders po ON cr.order_id = po.id
JOIN public.products p ON po.product_id = p.id
JOIN public.v_mfg_equivalent_units eu ON cr.order_id = eu.order_id;

-- 📊 4. رؤية اتجاهات التكاليف الشهيرة (Cost Trends)
DROP VIEW IF EXISTS public.v_mfg_cost_trends CASCADE;
CREATE VIEW public.v_mfg_cost_trends WITH (security_invoker = true) AS
SELECT 
    to_char(date_trunc('month', po.created_at), 'YYYY-MM') as month_period,
    po.organization_id,
    AVG(cr.actual_unit_cost)::numeric as avg_actual_unit_cost,
    AVG(p.manufacturing_cost)::numeric as avg_standard_unit_cost,
    SUM(cr.total_to_account_for)::numeric as total_actual_cost,
    CASE 
        WHEN SUM(p.manufacturing_cost * po.quantity_to_produce) > 0 
        THEN ROUND(((SUM(cr.total_to_account_for) - SUM(p.manufacturing_cost * po.quantity_to_produce)) / SUM(p.manufacturing_cost * po.quantity_to_produce) * 100), 2)
        ELSE 0 
    END::numeric as variance_pct
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.v_mfg_cost_reconciliation_report cr ON po.id = cr.order_id
GROUP BY 1, 2;

-- 📊 5. تقرير كمية الإنتاج (Units Flow)
DROP VIEW IF EXISTS public.v_mfg_production_quantity_report CASCADE;
CREATE VIEW public.v_mfg_production_quantity_report AS
SELECT 
    po.order_number,
    po.quantity_to_produce as units_started,
    CASE WHEN po.status = 'completed' THEN po.quantity_to_produce ELSE COALESCE((SELECT MAX(produced_qty) FROM public.mfg_order_progress WHERE production_order_id = po.id AND status = 'completed'), 0) END::numeric as units_completed,
    CASE WHEN po.status = 'completed' THEN 0 ELSE po.quantity_to_produce - COALESCE((SELECT MAX(produced_qty) FROM public.mfg_order_progress WHERE production_order_id = po.id AND status = 'completed'), 0) END::numeric as units_in_wip,
    (SELECT COALESCE(SUM(quantity), 0) FROM public.mfg_scrap_logs sl JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id WHERE op.production_order_id = po.id AND sl.is_abnormal = false) as normal_scrap,
    (SELECT COALESCE(SUM(quantity), 0) FROM public.mfg_scrap_logs sl JOIN public.mfg_order_progress op ON sl.order_progress_id = op.id WHERE op.production_order_id = po.id AND sl.is_abnormal = true) as abnormal_scrap,
    po.organization_id
FROM public.mfg_production_orders po;

-- 📊 5. رؤية تشريح تكلفة الوحدة (Unit Cost Anatomy)
-- تفكيك تكلفة القطعة الواحدة إلى عناصرها الأساسية (خامات، أجور فعلية، أعباء)
-- تدعم طريقة المتوسط المرجح بدمج تكاليف أول المدة مع الفترة الحالية للحصول على دقة محاسبية عالمية
CREATE OR REPLACE VIEW public.v_mfg_unit_cost_anatomy WITH (security_invoker = true) AS
WITH mat_totals AS (
    SELECT 
        po.id as order_id,
        COALESCE(bc.material_cost_bf, 0) + 
        COALESCE((
            SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, 0))
            FROM public.mfg_actual_material_usage amu
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE op.production_order_id = po.id
        ), 0) as total_mat
    FROM public.mfg_production_orders po
    LEFT JOIN public.mfg_beginning_wip_inventory bc ON po.id = bc.order_id
),
conv_totals AS (
    SELECT 
        po.id as order_id,
        -- الأجور الفعلية المسحوبة من مديول الرواتب
        COALESCE((SELECT SUM(labor_cost_actual) FROM public.mfg_order_progress WHERE production_order_id = po.id), 0) as total_lab,
        -- الأعباء الصناعية المحملة (أول مدة + الحالي)
        COALESCE(bc.conversion_cost_bf, 0) + 
        COALESCE((
            SELECT SUM((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate)
            FROM public.mfg_order_progress op
            JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
            JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
            WHERE op.production_order_id = po.id
        ), 0) as total_ovh
    FROM public.mfg_production_orders po
    LEFT JOIN public.mfg_beginning_wip_inventory bc ON po.id = bc.order_id
)
SELECT 
    po.id as order_id,
    po.order_number,
    p.name as product_name,
    COALESCE(ROUND(mt.total_mat / NULLIF(eu.total_material_eq_units, 0), 2), 0) as material_unit_cost,
    COALESCE(ROUND(ct.total_lab / NULLIF(eu.total_conversion_eq_units, 0), 2), 0) as labor_unit_cost,
    COALESCE(ROUND(ct.total_ovh / NULLIF(eu.total_conversion_eq_units, 0), 2), 0) as overhead_unit_cost,
    COALESCE(ROUND(
        (mt.total_mat / NULLIF(eu.total_material_eq_units, 0)) + 
        ((NULLIF(ct.total_lab, 0) + ct.total_ovh) / NULLIF(eu.total_conversion_eq_units, 0))
    , 2), 0) as total_actual_unit_cost,
    p.manufacturing_cost as standard_unit_cost,
    po.organization_id
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
JOIN public.v_mfg_equivalent_units eu ON po.id = eu.order_id
JOIN mat_totals mt ON po.id = mt.order_id
JOIN conv_totals ct ON po.id = ct.order_id;

-- ================================================================
-- 3. الدوال المحاسبية المتقدمة (Advanced Costing Logic)
-- ================================================================

-- 🛠️ دالة المحرك الخماسي لتكاليف المراحل
CREATE OR REPLACE FUNCTION public.mfg_calculate_order_cost_reconciliation(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_cost numeric; v_eq_material numeric; v_eq_conversion numeric;
    v_cost_per_mat numeric; v_cost_per_conv numeric; v_finished_qty numeric; v_result jsonb;
BEGIN
    SELECT total_actual_cost INTO v_total_cost FROM public.v_mfg_order_profitability WHERE order_id = p_order_id;
    SELECT total_material_eq_units, total_conversion_eq_units INTO v_eq_material, v_eq_conversion FROM public.v_mfg_equivalent_units WHERE order_id = p_order_id;
    
    v_cost_per_mat := CASE WHEN v_eq_material > 0 THEN (v_total_cost * 0.7) / v_eq_material ELSE 0 END;
    v_cost_per_conv := CASE WHEN v_eq_conversion > 0 THEN (v_total_cost * 0.3) / v_eq_conversion ELSE 0 END;
    SELECT SUM(produced_qty) INTO v_finished_qty FROM public.mfg_order_progress WHERE production_order_id = p_order_id AND status = 'completed';

    v_result := jsonb_build_object(
        'order_id', p_order_id,
        'total_to_account_for', v_total_cost,
        'unit_costs', jsonb_build_object('material', ROUND(v_cost_per_mat, 4), 'conversion', ROUND(v_cost_per_conv, 4)),
        'allocation', jsonb_build_object('finished_goods', ROUND(v_finished_qty * (v_cost_per_mat + v_cost_per_conv), 2), 'wip', ROUND(v_total_cost - (v_finished_qty * (v_cost_per_mat + v_cost_per_conv)), 2))
    );
    RETURN v_result;
END; $$;

-- 🛠️ دالة مزامنة تكاليف العمالة الفعلية من مديول HR
-- تقوم بتحديث حقل labor_cost_actual في سجلات التقدم بناءً على بيانات الرواتب الحقيقية
CREATE OR REPLACE FUNCTION public.mfg_sync_actual_labor_costs(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.mfg_order_progress op
    SET labor_cost_actual = alc.actual_labor_cost
    FROM public.v_mfg_actual_labor_costs alc
    WHERE op.id = alc.progress_id
    AND op.production_order_id = p_order_id;
END; $$;

-- 🛠️ تعديل دالة كشف حساب المرحلة لاستخدام الأجور الفعلية المحدثة
CREATE OR REPLACE FUNCTION public.mfg_get_stage_cost_ledger(p_order_id uuid)
RETURNS TABLE (
    stage_name text,
    material_cost numeric,
    labor_cost numeric,
    overhead_cost numeric,
    total_stage_cost numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- نقوم بمزامنة الأجور أولاً قبل جلب التقرير لضمان أحدث البيانات من HR
    PERFORM public.mfg_sync_actual_labor_costs(p_order_id);
    
    RETURN QUERY
    SELECT 
        rs.operation_name,
        -- خامات المرحلة
        COALESCE((SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) 
                  FROM public.mfg_actual_material_usage amu 
                  JOIN public.products p ON amu.raw_material_id = p.id 
                  WHERE amu.order_progress_id = op.id), 0) as material_cost,
        -- الأجور الفعلية المسحوبة من HR
        COALESCE(op.labor_cost_actual, 0) as labor_cost,
        -- مصاريف صناعية (الأعباء لا تزال تُحمل بناءً على معدل مركز العمل)
        ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as overhead_cost,
        -- الإجمالي الكلي للمرحلة
        ROUND(
            COALESCE((SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) FROM public.mfg_actual_material_usage amu JOIN public.products p ON amu.raw_material_id = p.id WHERE amu.order_progress_id = op.id), 0) +
            COALESCE(op.labor_cost_actual, 0) +
            COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)
        , 2) as total_stage_cost
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE op.production_order_id = p_order_id;
END; $$;

-- 🛠️ دالة تسجيل التالف المتقدم
CREATE OR REPLACE FUNCTION public.mfg_record_scrap_advanced(p_progress_id uuid, p_material_id uuid, p_qty numeric, p_is_abnormal boolean, p_salvage_value numeric DEFAULT 0, p_reason text DEFAULT NULL) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_cost_per_unit numeric; v_je_id uuid; v_mappings jsonb; v_wip_acc uuid; v_loss_acc uuid; v_scrap_inv_acc uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0) INTO v_cost_per_unit FROM public.products WHERE id = p_material_id;
    INSERT INTO public.mfg_scrap_logs (order_progress_id, product_id, quantity, is_abnormal, salvage_value_per_unit, reason, organization_id) VALUES (p_progress_id, p_material_id, p_qty, p_is_abnormal, p_salvage_value, p_reason, v_org_id);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_leaf_account((v_mappings->>'INVENTORY_WIP')::uuid);
    v_loss_acc := public.resolve_leaf_account((SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1));
    v_scrap_inv_acc := public.resolve_leaf_account((SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '124%' AND is_group = false ORDER BY code DESC LIMIT 1));

    IF p_is_abnormal THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type)
        VALUES (now()::date, 'إثبات تالف غير مسموح - ' || p_reason, 'ABN-SCRAP', 'posted', v_org_id, p_progress_id, 'mfg_scrap') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_loss_acc, (p_qty * (v_cost_per_unit - p_salvage_value)), 0, v_org_id);
        IF p_salvage_value > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_scrap_inv_acc, (p_qty * p_salvage_value), 0, v_org_id); END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_wip_acc, 0, (p_qty * v_cost_per_unit), v_org_id);
    ELSIF p_salvage_value > 0 THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type)
        VALUES (now()::date, 'قيمة استردادية لتالف مسموح', 'NORM-SCRAP', 'posted', v_org_id, p_progress_id, 'mfg_scrap') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_scrap_inv_acc, (p_qty * p_salvage_value), 0, v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_wip_acc, 0, (p_qty * p_salvage_value), v_org_id);
    END IF;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة تسجيل المنتج العرضي (By-product) وتخفيض التكلفة
CREATE OR REPLACE FUNCTION public.mfg_record_byproduct(p_progress_id uuid, p_product_id uuid, p_qty numeric, p_market_value numeric) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_order_id uuid; v_je_id uuid; v_mappings jsonb;
BEGIN
    SELECT organization_id, production_order_id INTO v_org_id, v_order_id FROM public.mfg_order_progress WHERE id = p_progress_id;
    
    INSERT INTO public.mfg_byproducts_logs (order_progress_id, product_id, quantity, market_value_per_unit, organization_id)
    VALUES (p_progress_id, p_product_id, p_qty, p_market_value, v_org_id);

    -- محاسبياً: قيمة المنتج العرضي تخفض تكلفة المنتج الرئيسي (WIP)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type)
    VALUES (now()::date, 'إثبات منتج عرضي - تخفيض تكلفة WIP', 'BY-PROD', 'posted', v_org_id, v_order_id, 'mfg_byproduct')
    RETURNING id INTO v_je_id;

    -- من ح/ المخزون (المنتج العرضي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, 
            public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1))), 
            (p_qty * p_market_value), 0, 'مخزون منتج عرضي', v_org_id);

    -- إلى ح/ الإنتاج تحت التشغيل (تخفيض تكلفة الأمر الرئيسي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, 
            public.resolve_mfg_wip_account(v_org_id), 
            0, (p_qty * p_market_value), 'تخفيض تكلفة WIP بمنتج عرضي', v_org_id);

    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة تحديث نسب الإتمام يدوياً (لشاشة واجهة المستخدم)
CREATE OR REPLACE FUNCTION public.mfg_update_progress_completion(p_progress_id uuid, p_material_pct numeric, p_conversion_pct numeric) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_material_pct < 0 OR p_material_pct > 100 OR p_conversion_pct < 0 OR p_conversion_pct > 100 THEN RAISE EXCEPTION 'يجب أن تكون النسب بين 0 و 100'; END IF;
    UPDATE public.mfg_order_progress SET material_completion_pct = p_material_pct, conversion_completion_pct = p_conversion_pct WHERE id = p_progress_id AND (organization_id = public.get_my_org() OR public.is_super_admin());
END; $$;

-- 🛠️ دالة ضبط إعدادات المرحلة (نقطة إضافة المواد + نقطة الفحص)
CREATE OR REPLACE FUNCTION public.mfg_config_step_parameters(
    p_step_id uuid,
    p_material_point numeric,
    p_inspection_point numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_material_point < 0 OR p_material_point > 100 OR p_inspection_point < 0 OR p_inspection_point > 100 THEN
        RAISE EXCEPTION 'النسب يجب أن تكون بين 0 و 100';
    END IF;

    UPDATE public.mfg_routing_steps 
    SET material_addition_point = p_material_point,
        inspection_point = p_inspection_point
    WHERE id = p_step_id AND (organization_id = public.get_my_org() OR public.is_super_admin());
END; $$;

-- 🛠️ دالة جلب "كشف حساب مركز تكلفة إنتاجي" (Stage Cost Ledger)
-- تعطي تفصيل حقيقي لما تم صرفه على كل مرحلة (خامات، عمالة، مصاريف)
CREATE OR REPLACE FUNCTION public.mfg_get_stage_cost_ledger(p_order_id uuid)
RETURNS TABLE (
    stage_name text,
    material_cost numeric,
    labor_cost numeric,
    overhead_cost numeric,
    total_stage_cost numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rs.operation_name,
        -- خامات المرحلة (بناءً على AMU)
        COALESCE((SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, 0)) 
                  FROM public.mfg_actual_material_usage amu 
                  JOIN public.products p ON amu.raw_material_id = p.id 
                  WHERE amu.order_progress_id = op.id), 0) as material_cost,
        -- عمالة فعلية مسجلة
        COALESCE(op.labor_cost_actual, 0) as labor_cost,
        -- مصاريف صناعية محملة بناءً على ساعات العمل ومعدل المركز
        ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as overhead_cost,
        -- الإجمالي الكلي للمرحلة
        ROUND(
            COALESCE((SELECT SUM(amu.actual_quantity * COALESCE(p.weighted_average_cost, p.cost, 0)) FROM public.mfg_actual_material_usage amu JOIN public.products p ON amu.raw_material_id = p.id WHERE amu.order_progress_id = op.id), 0) +
            COALESCE(op.labor_cost_actual, 0) +
            COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)
        , 2) as total_stage_cost
    FROM public.mfg_order_progress op
    JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
    JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
    WHERE op.production_order_id = p_order_id;
END; $$;

-- 🛠️ دالة تقرير تحليل الانحرافات للمراحل (Detailed Stage Variance Report)
-- تقارن بين التكلفة المعيارية المسموح بها للإنتاج المحقق وبين التكاليف الفعلية المسجلة
CREATE OR REPLACE FUNCTION public.mfg_get_stage_variance_report(p_order_id uuid)
RETURNS TABLE (
    stage_name text,
    actual_material numeric,
    standard_material numeric,
    material_variance numeric,
    actual_labor numeric,
    standard_labor numeric,
    labor_variance numeric,
    actual_overhead numeric,
    standard_overhead numeric,
    overhead_variance numeric,
    total_actual numeric,
    total_standard numeric,
    total_variance numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH stage_stats AS (
        SELECT 
            rs.operation_name as s_name,
            -- التكاليف الفعلية
            COALESCE((SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) 
                      FROM public.mfg_actual_material_usage amu 
                      JOIN public.products p ON amu.raw_material_id = p.id 
                      WHERE amu.order_progress_id = op.id), 0) as act_mat,
            COALESCE(op.labor_cost_actual, 0) as act_lab,
            ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as act_ovh,
            -- التكاليف المعيارية المسموح بها (Standard Allowed for Actual Output)
            COALESCE((SELECT SUM(public.uom_convert(sm.quantity_required * op.produced_qty, sm.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
                      FROM public.mfg_step_materials sm
                      JOIN public.products p ON sm.raw_material_id = p.id
                      WHERE sm.step_id = rs.id), 0) as std_mat,
            ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.hourly_rate, 0), 2) as std_lab,
            ROUND(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0), 2) as std_ovh
        FROM public.mfg_order_progress op
        JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
        JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
        WHERE op.production_order_id = p_order_id
    )
    SELECT 
        s_name,
        act_mat, std_mat, (act_mat - std_mat),
        act_lab, std_lab, (act_lab - std_lab),
        act_ovh, std_ovh, (act_ovh - std_ovh),
        (act_mat + act_lab + act_ovh), (std_mat + std_lab + std_ovh),
        ((act_mat + act_lab + act_ovh) - (std_mat + std_lab + std_ovh))
    FROM stage_stats;
END; $$;

CREATE OR REPLACE FUNCTION public.mfg_auto_post_wip_progress(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_final_org uuid;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    UPDATE public.mfg_order_progress op
    SET 
        material_completion_pct = CASE 
            WHEN rs.material_addition_point <= 0 THEN 100
            WHEN rs.material_addition_point >= 100 THEN 0
            ELSE material_completion_pct
        END,
        conversion_completion_pct = CASE 
            WHEN op.actual_start_time IS NULL THEN 10 -- حد أدنى طالما بدأت
            ELSE LEAST(
                GREATEST(
                    COALESCE(ROUND((EXTRACT(EPOCH FROM (now() - op.actual_start_time)) / 60.0) / NULLIF(rs.standard_time_minutes, 0) * 100), 50), 
                    20
                ), 90
            )
        END
    FROM public.mfg_routing_steps rs
    WHERE op.step_id = rs.id 
      AND op.status = 'active'
      AND (v_final_org IS NULL OR op.organization_id = v_final_org);
END; $$;

-- 🛠️ دالة ترحيل فروق تكاليف الفترة (Period Closing)
CREATE OR REPLACE FUNCTION public.mfg_post_period_cost_adjustment(p_period_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order record; v_recon jsonb; v_org_id uuid; v_je_id uuid; v_wip_acc uuid;
BEGIN
    v_org_id := public.get_my_org();
    v_wip_acc := (SELECT (account_mappings->>'INVENTORY_WIP')::uuid FROM public.company_settings WHERE organization_id = v_org_id);
    FOR v_order IN SELECT id, order_number FROM public.mfg_production_orders WHERE status = 'in_progress' AND organization_id = v_org_id LOOP
        v_recon := public.mfg_calculate_order_cost_reconciliation(v_order.id);
        INSERT INTO public.mfg_period_cost_snapshots (period_name, order_id, material_unit_cost, conversion_unit_cost, wip_valuation, finished_goods_valuation, organization_id)
        VALUES (p_period_name, v_order.id, (v_recon->'unit_costs'->>'material')::numeric, (v_recon->'unit_costs'->>'conversion')::numeric, (v_recon->'allocation'->>'wip')::numeric, (v_recon->'allocation'->>'finished_goods')::numeric, v_org_id);
        
        UPDATE public.products SET weighted_average_cost = ((COALESCE(stock,0) * weighted_average_cost) + (v_recon->'allocation'->>'finished_goods')::numeric) / NULLIF(COALESCE(stock,0) + (SELECT SUM(produced_qty) FROM public.mfg_order_progress WHERE production_order_id = v_order.id AND status = 'completed'), 0)
        WHERE id = (SELECT product_id FROM public.mfg_production_orders WHERE id = v_order.id);
    END LOOP;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة إغلاق الفترة التكاليفية وترحيل الأرصدة (Period Closing & Carry-over)
-- هذه الدالة هي "الميزان" الذي ينقل تكاليف WIP لتصبح "أول مدة" للشهر القادم كما تنشئ قيد تصفية WIP في الأستاذ العام
CREATE OR REPLACE FUNCTION public.mfg_close_costing_period(p_period_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid := public.get_my_org();
    v_order record;
    v_wip_val record;
    v_count int := 0;
    v_wip_acc uuid;
    v_fg_acc uuid;
    v_total_gl_wip numeric := 0;
    v_active_wip_req numeric := 0;
    v_unallocated_wip numeric := 0;
    v_je_id uuid := NULL;
    v_mappings jsonb;
BEGIN
    -- 1. التأكد من عدم إغلاق الفترة مرتين
    IF EXISTS (SELECT 1 FROM public.mfg_period_cost_snapshots WHERE period_name = p_period_name AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'هذه الفترة مغلقة مسبقاً: %', p_period_name;
    END IF;

    -- 2. المرور على كافة الأوامر التي لا تزال "تحت التشغيل"
    FOR v_order IN SELECT id, order_number FROM public.mfg_production_orders 
                  WHERE status IN ('in_progress', 'draft') AND organization_id = v_org_id 
    LOOP
        -- جلب تقييم الـ WIP الحالي للأمر
        SELECT cost_assigned_to_wip, cost_per_material_eq, cost_per_conversion_eq 
        INTO v_wip_val 
        FROM public.v_mfg_cost_reconciliation_report WHERE order_id = v_order.id;

        IF v_wip_val.cost_assigned_to_wip > 0 THEN
            INSERT INTO public.mfg_period_cost_snapshots (
                period_name, order_id, material_unit_cost, conversion_unit_cost, wip_valuation, organization_id
            ) VALUES (
                p_period_name, v_order.id, v_wip_val.cost_per_material_eq, v_wip_val.cost_per_conversion_eq, v_wip_val.cost_assigned_to_wip, v_org_id
            );

            DELETE FROM public.mfg_beginning_wip_inventory WHERE order_id = v_order.id;
            
            INSERT INTO public.mfg_beginning_wip_inventory (
                order_id, material_cost_bf, conversion_cost_bf, organization_id
            ) VALUES (
                v_order.id, 
                (v_wip_val.cost_assigned_to_wip * 0.7),
                (v_wip_val.cost_assigned_to_wip * 0.3),
                v_org_id
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;

    -- 3. حسم وتصفية أي رصيد معلق في حساب WIP بالأستاذ العام إذا لم يكن مخصصاً لأوامر نشطة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_WIP')::uuid, (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_org_id LIMIT 1)));
    v_fg_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1)));

    IF v_wip_acc IS NOT NULL AND v_fg_acc IS NOT NULL THEN
        -- حساب إجمالي رصيد WIP الدفتري الحالي في الأستاذ العام
        SELECT COALESCE(SUM(debit - credit), 0) INTO v_total_gl_wip
        FROM public.journal_lines_view 
        WHERE account_id = v_wip_acc AND organization_id = v_org_id;

        -- حساب التقييم المطلوب للأوامر المفتوحة النشطة
        SELECT COALESCE(SUM(cost_assigned_to_wip), 0) INTO v_active_wip_req
        FROM public.v_mfg_cost_reconciliation_report
        WHERE organization_id = v_org_id;

        v_unallocated_wip := v_total_gl_wip - v_active_wip_req;

        -- إذا كان هناك رصيد WIP معلق في الأستاذ العام ليس له أوامر نشطة (مثل الأعباء الصناعية 9777)
        IF v_unallocated_wip > 0.01 THEN
            INSERT INTO public.journal_entries (
                transaction_date, description, reference, status, organization_id, is_posted, related_document_type
            ) VALUES (
                now()::date, 'قيد إقفال وتصفية أعباء مخزون تحت التشغيل إلى المنتج التام - فترة: ' || p_period_name, 'WIP-CLOSE-' || p_period_name, 'posted', v_org_id, true, 'mfg_period_close'
            ) RETURNING id INTO v_je_id;

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES 
                (v_je_id, v_fg_acc, v_unallocated_wip, 0, 'إقفال تكاليف WIP المعلقة إلى المنتج التام', v_org_id),
                (v_je_id, v_wip_acc, 0, v_unallocated_wip, 'تصفية رصيد WIP المعلق بالأستاذ العام', v_org_id);
        END IF;
    END IF;

    -- إذا لم تكن هناك أوامر نشطة، تسجل لقطة رمزية للفترة لتسجيل الإغلاق
    IF v_count = 0 THEN
        INSERT INTO public.mfg_period_cost_snapshots (
            period_name, order_id, material_unit_cost, conversion_unit_cost, wip_valuation, organization_id
        ) VALUES (
            p_period_name, NULL, 0, 0, 0, v_org_id
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'success', 
        'orders_migrated', v_count, 
        'period', p_period_name, 
        'settlement_je_id', v_je_id,
        'unallocated_wip_settled', v_unallocated_wip
    );
END; $$;

-- 🛠️ دالة تسوية حساب الإنتاج تحت التشغيل مع الأستاذ العام (WIP to GL Settlement)
-- هذه الدالة هي "الضربة القاضية" لمحاسب التكاليف: تطابق الأرقام الدفترية مع الواقع الفعلي
CREATE OR REPLACE FUNCTION public.mfg_post_wip_gl_settlement(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_recon record; v_org_id uuid; v_je_id uuid; v_mappings jsonb;
    v_wip_acc uuid; v_variance_acc uuid; v_gl_wip_balance numeric; v_calculated_wip numeric; v_diff numeric;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.mfg_production_orders WHERE id = p_order_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- 1. جلب حسابات الربط (مع إضافة حساب انحراف WIP)
    v_wip_acc := public.resolve_leaf_account((v_mappings->>'INVENTORY_WIP')::uuid);
    v_variance_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WIP_VARIANCE_ACCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1)));

    -- 2. حساب رصيد الحساب الحالي في الأستاذ العام (Book Value)
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_gl_wip_balance 
    FROM public.journal_lines_view 
    WHERE account_id = v_wip_acc AND organization_id = v_org_id;

    -- 3. جلب القيمة "الواقعية" بناءً على الإنتاج المعادل (Calculated Value)
    SELECT cost_assigned_to_wip INTO v_calculated_wip 
    FROM public.v_mfg_cost_reconciliation_report WHERE order_id = p_order_id;

    v_diff := v_calculated_wip - v_gl_wip_balance;

    IF ABS(v_diff) < 1 THEN RETURN NULL; END IF; -- لا حاجة لتسوية الفروق الزهيدة

    -- 4. إنشاء قيد التسوية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'قيد تسوية انحراف تكاليف WIP - أمر رقم ' || (SELECT order_number FROM public.mfg_production_orders WHERE id = p_order_id), 'WIP-SETTLE', 'posted', v_org_id, true, p_order_id, 'mfg_settlement')
    RETURNING id INTO v_je_id;

    IF v_diff > 0 THEN
        -- نحتاج لزيادة WIP (مدين) وخفض الانحراف (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wip_acc, v_diff, 0, 'تسوية زيادة قيمة WIP فعلياً', v_org_id),
               (v_je_id, v_variance_acc, 0, v_diff, 'إثبات انحراف تكاليف ملائم', v_org_id);
    ELSE
        -- نحتاج لخفض WIP (دائن) وزيادة الانحراف/المصروف (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_variance_acc, ABS(v_diff), 0, 'تحميل انحراف تكاليف غير ملائم', v_org_id),
               (v_je_id, v_wip_acc, 0, ABS(v_diff), 'تعديل قيمة WIP دفترياً', v_org_id);
    END IF;

    RETURN v_je_id;
END; $$;

-- ================================================================
-- 4. منح الصلاحيات (Grants)
-- ================================================================
GRANT SELECT ON public.v_mfg_production_quantity_report TO authenticated;
GRANT SELECT ON public.v_mfg_equivalent_units TO authenticated;
GRANT SELECT ON public.v_mfg_cost_reconciliation_report TO authenticated;
GRANT SELECT ON public.v_mfg_unit_cost_anatomy TO authenticated;
GRANT SELECT ON public.v_mfg_unit_cost_variance TO authenticated;
GRANT SELECT ON public.v_mfg_cost_trends TO authenticated;

-- 🔄 إجبار المحرك على تحديث كاش النظام (Force Schema Cache Reload)
NOTIFY pgrst, 'reload config';
GRANT SELECT ON public.mfg_period_cost_snapshots TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_record_scrap_advanced(uuid, uuid, numeric, boolean, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_record_byproduct(uuid, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_config_step_parameters(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_post_period_cost_adjustment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_update_progress_completion(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_auto_post_wip_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_get_stage_cost_ledger(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_get_stage_variance_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_post_wip_gl_settlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_close_costing_period(text) TO authenticated;

-- 🛠️ دالة التراجع عن إغلاق الفترة التكاليفية (Undo Period Close)
-- تسمح بفتح الفترة مرة أخرى عن طريق حذف اللقطات التاريخية
CREATE OR REPLACE FUNCTION public.mfg_undo_costing_period_close(p_period_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid := public.get_my_org();
    v_count int;
BEGIN
    -- 1. حذف اللقطات التاريخية لهذه الفترة
    DELETE FROM public.mfg_period_cost_snapshots 
    WHERE period_name = p_period_name AND organization_id = v_org_id;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('status', 'success', 'snapshots_removed', v_count, 'period', p_period_name);
END; $$;

-- ================================================================
-- 🛡️ نظام التنبيهات الذكية لتجاوز التكاليف أثناء التشغيل (Pre-emptive Control)
-- ================================================================
CREATE OR REPLACE FUNCTION public.mfg_check_active_cost_overruns(p_threshold_pct numeric DEFAULT 15)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
    v_std_cost_unit numeric;
    v_std_total numeric;
    v_overrun_pct numeric;
BEGIN
    -- فحص كافة الأوامر التي لا تزال "قيد التشغيل"
    FOR v_row IN
        SELECT 
            po.id, po.order_number, po.product_id, po.quantity_to_produce, po.organization_id,
            p.name as product_name,
            vop.total_actual_cost
        FROM public.mfg_production_orders po
        JOIN public.products p ON po.product_id = p.id
        JOIN public.v_mfg_order_profitability vop ON po.id = vop.order_id
        WHERE po.status = 'in_progress'
    LOOP
        v_org_id := v_row.organization_id;
        v_std_cost_unit := public.mfg_calculate_standard_cost(v_row.product_id, v_org_id);
        v_std_total := v_std_cost_unit * v_row.quantity_to_produce;
        
        IF v_std_total > 0 THEN
            v_overrun_pct := ((v_row.total_actual_cost - v_std_total) / v_std_total) * 100;
            
            -- إذا تجاوز الانحراف النسبة المحددة (مثلاً 15% لتصل لـ 115%)
            IF v_overrun_pct > p_threshold_pct THEN
                -- منع تكرار الإرسال: لا نرسل تنبيهاً لنفس الأمر إذا تم إرسال واحد في آخر 12 ساعة
                IF NOT EXISTS (
                    SELECT 1 FROM public.notifications 
                    WHERE organization_id = v_org_id 
                    AND type = 'cost_overrun'
                    AND message LIKE '%' || v_row.order_number || '%'
                    AND created_at > (now() - interval '12 hours')
                ) THEN
                    -- 1. التسجيل في السجل التاريخي الدائم
                    INSERT INTO public.mfg_alerts_log (
                        order_id, alert_type, title, message, actual_value, threshold_value, organization_id
                    ) VALUES (
                        v_row.id, 'cost_overrun', 'تجاوز تكلفة تشغيلي',
                        format('تجاوز بنسبة %s%%', ROUND(v_overrun_pct, 1)),
                        v_row.total_actual_cost, v_std_total, v_org_id
                    );

                    -- 2. إرسال الإشعار اللحظي للمديرين
                    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP
                        INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
                        VALUES (
                            v_admin_id,
                            'تنبيه: تجاوز تكلفة نشط ⚠️',
                            format('الأمر (%s) للمنتج (%s) تجاوز التكلفة المعيارية بنسبة %s%% أثناء التشغيل. فعلي: %s | معياري: %s',
                                   v_row.order_number, v_row.product_name, ROUND(v_overrun_pct, 1), v_row.total_actual_cost, v_std_total),
                            'high', v_org_id, 'cost_overrun'
                        );
                    END LOOP;
                    v_alert_count := v_alert_count + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;
    RETURN v_alert_count;
END; $$;

GRANT EXECUTE ON FUNCTION public.mfg_undo_costing_period_close(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_check_active_cost_overruns(numeric) TO authenticated;

-- 🕒 جدولة الترحيل الآلي
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
        -- التحقق من وجود المهمة قبل محاولة إلغاء جدولتها لتجنب الخطأ في أول تشغيل
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mfg-daily-wip-snapshot') THEN
            PERFORM cron.unschedule('mfg-daily-wip-snapshot');
        END IF;
        
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mfg-active-cost-check') THEN
            PERFORM cron.unschedule('mfg-active-cost-check');
        END IF;

        PERFORM cron.schedule('mfg-daily-wip-snapshot', '55 23 * * *', 'SELECT public.mfg_auto_post_wip_progress(NULL);');
        -- تشغيل فحص تجاوز التكاليف كل ساعة
        PERFORM cron.schedule('mfg-active-cost-check', '0 * * * *', 'SELECT public.mfg_check_active_cost_overruns(15);');
    END IF;
END $$;

-- 💎 محرك محاكاة توزيع التكاليف (Overhead Flow Simulator)
-- المهمة: ضخ مصاريف فعلية وتوزيعها لاختبار دقة حساب تكلفة المنتج التام
CREATE OR REPLACE FUNCTION public.simulate_mfg_overhead_flow(p_org_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid := COALESCE(
        p_org_id, 
        public.get_my_org(),
        (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
        (SELECT id FROM public.organizations ORDER BY created_at DESC LIMIT 1)
    );
    v_ovh_acc uuid; v_je_id uuid; v_alloc_id uuid;
    v_cash_acc uuid;
BEGIN
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد المنظمة لتشغيل محاكاة التكاليف.'; END IF;

    -- 1. ضخ مصروف كهرباء وصيانة في الأستاذ العام (حسابات 5141، 5142)
    v_ovh_acc := public.resolve_leaf_account((SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '5141' LIMIT 1));
    v_cash_acc := public.resolve_leaf_account((SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1));

    IF v_ovh_acc IS NULL OR v_cash_acc IS NULL THEN
        RAISE EXCEPTION 'فشل المحاكاة: حساب الكهرباء (5141) أو النقدية (1231) غير موجود لهذه المنظمة.';
    END IF;
    
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted)
    VALUES (CURRENT_DATE, 'فاتورة كهرباء المصنع - محاكاة', 'SIM-OVH-01', 'posted', v_org_id, true)
    RETURNING id INTO v_je_id;

    -- مدين: كهرباء المصنع (10,000 ريال) | دائن: النقدية
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id)
    VALUES 
        (v_je_id, v_ovh_acc, 10000, 0, v_org_id),
        (v_je_id, v_cash_acc, 0, 10000, v_org_id);

    -- 2. تشغيل محرك التوزيع الفعلي (Actual Allocation)
    -- سيقوم هذا المحرك بجلب الـ 10,000 وتوزيعها على وحدات الإنتاج المعادلة (Equivalent Units)
    v_alloc_id := public.mfg_allocate_actual_overhead((CURRENT_DATE - INTERVAL '30 days')::date, CURRENT_DATE, 'توزيع شهر الاختبار - محاكاة');

    RETURN jsonb_build_object(
        'status', 'success',
        'overhead_injected', 10000,
        'allocation_journal_id', v_alloc_id,
        'message', CASE 
            WHEN v_alloc_id IS NOT NULL THEN '✅ تم ضخ التكاليف (10,000) وتوزيعها بنجاح على الإنتاج القائم.'
            ELSE '⚠️ تم ضخ التكاليف، لكن لم يتم التوزيع لعدم وجود أوامر إنتاج نشطة (EQ Units = 0).'
        END,
        'next_step', CASE 
            WHEN v_alloc_id IS NULL THEN 'قم ببدء أمر إنتاج جديد وتسجيل تقدم في إحدى مراحله ثم أعد المحاولة.'
            ELSE 'يمكنك الآن مراجعة تقرير "تشريح تكلفة الوحدة" لرؤية نصيب المنتج من الكهرباء.'
        END
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.simulate_mfg_overhead_flow(uuid) TO authenticated;

-- 💎 محرك المحاكاة الشامل (Full Manufacturing Cycle Simulator)
-- المهمة: إنشاء طلب، تسجيل تقدمه، وضخ/توزيع الأعباء في خطوة واحدة لضمان ظهور نتائج مبهرة في BI
CREATE OR REPLACE FUNCTION public.simulate_full_mfg_cycle(p_org_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid := COALESCE(
        p_org_id, 
        public.get_my_org(),
        (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
        (SELECT id FROM public.organizations ORDER BY created_at DESC LIMIT 1)
    );
    v_prod_id uuid; v_order_id uuid; v_res jsonb; v_wc_id uuid; v_route_id uuid;
BEGIN
    -- 1. 🛡️ محرك التجهيز الذكي: ضمان وجود الهيكل الكامل للمصنع الافتراضي بشكل مستقل
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'منتج مصنع افتراضي' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, mfg_type, product_type, sales_price, cost, organization_id)
        VALUES ('منتج مصنع افتراضي', 'standard', 'MANUFACTURED', 100, 50, v_org_id) RETURNING id INTO v_prod_id;
    END IF;

    SELECT id INTO v_wc_id FROM public.mfg_work_centers WHERE organization_id = v_org_id LIMIT 1;
    IF v_wc_id IS NULL THEN
        INSERT INTO public.mfg_work_centers (name, hourly_rate, overhead_rate, organization_id)
        VALUES ('مركز تجميع آلي', 25, 15, v_org_id) RETURNING id INTO v_wc_id;
    END IF;

    SELECT id INTO v_route_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id AND is_default = true LIMIT 1;
    IF v_route_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, organization_id, is_default)
        VALUES (v_prod_id, 'المسار القياسي', v_org_id, true) RETURNING id INTO v_route_id;
        
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, work_center_id, operation_name, standard_time_minutes, organization_id, conversion_weight)
        VALUES (v_route_id, 1, v_wc_id, 'مرحلة التصنيع الوحيدة', 60, v_org_id, 100);
    END IF;
    
    -- 2. إنشاء أمر إنتاج جديد (SIM-FULL)
    INSERT INTO public.mfg_production_orders (order_number, product_id, quantity_to_produce, status, organization_id)
    VALUES ('SIM-FULL-' || substring(gen_random_uuid()::text, 1, 6), v_prod_id, 10, 'draft', v_org_id)
    RETURNING id INTO v_order_id;

    -- 3. بدء الأمر وتوليد المراحل
    PERFORM public.mfg_start_production_order(v_order_id);

    -- 4. محاكاة تقدم العمل (لضمان وجود إنتاج معادل EQ Units > 0)
    -- نحدث كافة المراحل لضمان ظهور الوحدات المعادلة بغض النظر عن عدد الخطوات الموالدة
    UPDATE public.mfg_order_progress 
    SET status = 'active', 
        actual_start_time = now() - interval '1 hour', 
        produced_qty = 10, 
        conversion_completion_pct = 50,
        material_completion_pct = 100
    WHERE production_order_id = v_order_id;

    -- 5. تشغيل محرك ضخ وتوزيع التكاليف
    SELECT public.simulate_mfg_overhead_flow(v_org_id) INTO v_res;

    RETURN jsonb_build_object(
        'status', 'success',
        'simulated_order_id', v_order_id,
        'allocation_details', v_res,
        'message', '✅ تمت الدورة بنجاح: تم إنشاء الطلب، تسجيل "إنتاج معادل"، وتوزيع تكاليف الكهرباء عليه.'
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.simulate_full_mfg_cycle(uuid) TO authenticated;

DO $$ 
BEGIN
    RAISE NOTICE '✅ تم تثبيت مديول محاسبة التكاليف المتقدم (النسخة المستقرة) بنجاح.';
    NOTIFY pgrst, 'reload config';
END $$;

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

-- ==============================================================================
-- TriPro ERP - Migration: Setup Real Advanced Manufacturing Module Tables
-- Date: 2026-09-02
-- 1. Updates mfg_production_orders with work_center_id, priority, progress_percent
-- 2. Creates mfg_work_center_capacities table
-- 3. Creates mfg_maintenance_orders table
-- 4. Creates mfg_machine_oee_logs table
-- 5. Enables RLS and syncs existing real work centers (e.g. ورشة الفساتين)
-- ==============================================================================

-- 1. ربط أوامر الإنتاج بمركز العمل ودرجة الأولوية ونسبة الإنجاز
ALTER TABLE public.mfg_production_orders 
ADD COLUMN IF NOT EXISTS work_center_id uuid REFERENCES public.mfg_work_centers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'MEDIUM',
ADD COLUMN IF NOT EXISTS progress_percent numeric DEFAULT 0;

-- 2. جدول تخطيط السعة الإنتاجية لمراكز العمل (Capacity Planning)
CREATE TABLE IF NOT EXISTS public.mfg_work_center_capacities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    work_center_name text NOT NULL,
    daily_capacity_hours numeric NOT NULL DEFAULT 16,
    efficiency_factor numeric NOT NULL DEFAULT 90,
    current_planned_hours numeric NOT NULL DEFAULT 0,
    is_bottleneck boolean NOT NULL DEFAULT false,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 3. جدول أوامر الصيانة الوقائية والطارئة للماكينات (Machinery Maintenance)
CREATE TABLE IF NOT EXISTS public.mfg_maintenance_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    order_number text NOT NULL,
    machine_name text NOT NULL,
    maintenance_type text NOT NULL DEFAULT 'PREVENTIVE', -- PREVENTIVE, CORRECTIVE, CALIBRATION
    priority text NOT NULL DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, CRITICAL
    issue_description text,
    scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
    completed_date date,
    assigned_technician text,
    status text NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, CANCELLED
    spare_parts_used jsonb DEFAULT '[]'::jsonb,
    total_cost numeric DEFAULT 0,
    maintenance_interval_hours numeric DEFAULT 500,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 4. جدول سجلات كفاءة المعدات الشاملة (OEE Tracker)
CREATE TABLE IF NOT EXISTS public.mfg_machine_oee_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    machine_name text NOT NULL,
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    shift_name text NOT NULL DEFAULT 'الوردية الأولى',
    planned_production_time_minutes numeric NOT NULL DEFAULT 480,
    downtime_minutes numeric NOT NULL DEFAULT 0,
    downtime_reason text,
    ideal_cycle_time_seconds numeric NOT NULL DEFAULT 10,
    total_produced_units numeric NOT NULL DEFAULT 0,
    good_units numeric NOT NULL DEFAULT 0,
    rejected_units numeric NOT NULL DEFAULT 0,
    availability_percentage numeric NOT NULL DEFAULT 100,
    performance_percentage numeric NOT NULL DEFAULT 100,
    quality_percentage numeric NOT NULL DEFAULT 100,
    oee_percentage numeric NOT NULL DEFAULT 100,
    operator_name text,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 5. تفعيل سياسات الأمان RLS
ALTER TABLE public.mfg_work_center_capacities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_maintenance_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_machine_oee_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "allow_all_authenticated_mfg_cap" ON public.mfg_work_center_capacities;
    CREATE POLICY "allow_all_authenticated_mfg_cap" ON public.mfg_work_center_capacities FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_authenticated_mfg_maint" ON public.mfg_maintenance_orders;
    CREATE POLICY "allow_all_authenticated_mfg_maint" ON public.mfg_maintenance_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_authenticated_mfg_oee" ON public.mfg_machine_oee_logs;
    CREATE POLICY "allow_all_authenticated_mfg_oee" ON public.mfg_machine_oee_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $$;

-- 6. مزامنة وتوليد السعات آلياً لمراكز العمل الفعلية الموجودة بالمنشأة (مثل ورشة الفساتين)
INSERT INTO public.mfg_work_center_capacities (organization_id, work_center_name, daily_capacity_hours, efficiency_factor, current_planned_hours, is_bottleneck)
SELECT 
    wc.organization_id, 
    wc.name, 
    16, 
    90, 
    0, 
    false
FROM public.mfg_work_centers wc
WHERE NOT EXISTS (
    SELECT 1 FROM public.mfg_work_center_capacities cap 
    WHERE cap.organization_id = wc.organization_id AND cap.work_center_name = wc.name
);

-- 7. تحديث أوامر الإنتاج السابقة وربطها بأول مركز عمل متاح
UPDATE public.mfg_production_orders po
SET work_center_id = (
    SELECT id FROM public.mfg_work_centers 
    WHERE organization_id = po.organization_id 
    ORDER BY created_at ASC LIMIT 1
)
WHERE po.work_center_id IS NULL 
  AND EXISTS (SELECT 1 FROM public.mfg_work_centers WHERE organization_id = po.organization_id);


-- ==============================================================================
-- TriPro ERP - Migration: Fix Manufacturing By-Products Warehouse Stock & Recalculation
-- Date: 2026-09-02
-- 1. Adds warehouse_id to mfg_byproducts_logs
-- 2. Updates mfg_record_byproduct to support p_warehouse_id and trigger recalculate_stock_rpc
-- 3. Updates recalculate_stock_rpc to ensure by-products are never dropped due to missing warehouse_id
-- 4. Backfills warehouse_id for existing by-products logs and recalculates stock for all orgs
-- ==============================================================================

-- 1. إضافة عمود المستودع لجدول سجلات المنتجات العرضية (إذا لم يكن موجوداً)
ALTER TABLE public.mfg_byproducts_logs 
ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);

-- 2. تحديث السجلات السابقة وتعيين المستودع المناسب لها
UPDATE public.mfg_byproducts_logs bl
SET warehouse_id = COALESCE(
    bl.warehouse_id,
    (SELECT po.warehouse_id 
     FROM public.mfg_order_progress op 
     JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
     WHERE op.id = bl.order_progress_id LIMIT 1),
    (SELECT id FROM public.warehouses 
     WHERE organization_id = bl.organization_id AND deleted_at IS NULL 
     ORDER BY created_at ASC LIMIT 1),
    (SELECT id FROM public.warehouses 
     WHERE deleted_at IS NULL 
     ORDER BY created_at ASC LIMIT 1)
);

-- 3. تحديث دالة تسجيل المنتج العرضي (mfg_record_byproduct)
CREATE OR REPLACE FUNCTION public.mfg_record_byproduct(
    p_progress_id uuid, 
    p_product_id uuid, 
    p_qty numeric, 
    p_market_value numeric,
    p_warehouse_id uuid DEFAULT NULL
) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid; 
    v_order_id uuid; 
    v_je_id uuid; 
    v_mappings jsonb;
    v_wh_id uuid;
BEGIN
    SELECT organization_id, production_order_id INTO v_org_id, v_order_id 
    FROM public.mfg_order_progress WHERE id = p_progress_id;
    
    -- تحديد المستودع المستهدف (الممرر، أو مستودع أمر الإنتاج، أو المستودع الافتراضي للمنشأة)
    v_wh_id := COALESCE(
        p_warehouse_id,
        (SELECT warehouse_id FROM public.mfg_production_orders WHERE id = v_order_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1),
        (SELECT id FROM public.warehouses WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
    );

    INSERT INTO public.mfg_byproducts_logs (
        order_progress_id, product_id, quantity, market_value_per_unit, organization_id, warehouse_id
    )
    VALUES (p_progress_id, p_product_id, p_qty, p_market_value, v_org_id, v_wh_id);

    -- محاسبياً: قيمة المنتج العرضي تخفض تكلفة المنتج الرئيسي (WIP)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type
    )
    VALUES (now()::date, 'إثبات منتج عرضي - تخفيض تكلفة WIP', 'BY-PROD', 'posted', v_org_id, v_order_id, 'mfg_byproduct')
    RETURNING id INTO v_je_id;

    -- من ح/ المخزون (المنتج العرضي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, 
            public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1))), 
            (p_qty * p_market_value), 0, 'مخزون منتج عرضي', v_org_id);

    -- إلى ح/ الإنتاج تحت التشغيل (تخفيض تكلفة الأمر الرئيسي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, 
            public.resolve_mfg_wip_account(v_org_id), 
            0, (p_qty * p_market_value), 'تخفيض تكلفة WIP بمنتج عرضي', v_org_id);

    -- تحديث المخزون فوراً لضمان ظهور كمية المنتج العرضي في المستودع
    PERFORM public.recalculate_stock_rpc(v_org_id, p_product_id);
END; $$;

-- 4. تحديث دالة إعادة احتساب المخزون (recalculate_stock_rpc) لضمان عدم إسقاط المنتجات العرضية
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_final_org uuid;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    
    DROP TABLE IF EXISTS product_summary_temp;
    CREATE TEMP TABLE product_summary_temp AS
    WITH warehouse_movement AS (
        SELECT 
            product_id, 
            warehouse_id, 
            SUM(qty) as net_qty
        FROM (
            -- رصيد افتتاحي (+)
            SELECT oi.product_id, oi.warehouse_id, public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) as qty 
            FROM public.opening_inventories oi JOIN public.products p ON oi.product_id = p.id
            WHERE oi.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL AND (v_final_org IS NULL OR oi.organization_id = v_final_org)
            
            UNION ALL
            -- مشتريات (+)
            SELECT pii.product_id, pi.warehouse_id, public.uom_convert(pii.quantity, pii.uom_id, p.base_uom_id) 
            FROM public.purchase_invoice_items pii 
            JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id 
            JOIN public.products p ON pii.product_id = p.id
            WHERE UPPER(pi.status) NOT IN ('DRAFT', 'CANCELLED') AND pi.warehouse_id IS NOT NULL AND pii.product_id IS NOT NULL AND (v_final_org IS NULL OR pi.organization_id = v_final_org)
            
            UNION ALL
            -- وارد اعتمادات مستندية (+)
            SELECT lcri.product_id, 
                   COALESCE(lcri.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = lcri.organization_id LIMIT 1)) as warehouse_id, 
                   COALESCE(lcri.quantity, 0) as qty
            FROM public.lc_receipt_items lcri
            LEFT JOIN public.letters_of_credit lc ON lcri.lc_id = lc.id
            WHERE (lc.id IS NULL OR UPPER(lc.status) != 'CANCELLED') 
              AND lcri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR lcri.organization_id = v_final_org)
            
            UNION ALL
            -- مبيعات (-) - خصم المنتج التام نفسه (إذا لم يكن له BOM)
            SELECT ii.product_id, i.warehouse_id, -public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id)
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.products p ON ii.product_id = p.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = ii.product_id)
            
            UNION ALL
            -- مبيعات (-) - خصم مكونات BOM للمنتجات التامة المباعة
            SELECT bom.raw_material_id, i.warehouse_id, -(public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id
            JOIN public.products p ON ii.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND bom.raw_material_id IS NOT NULL
            
            UNION ALL
            -- مبيعات المطعم (Order Items) (-)
            SELECT oi.product_id, o.warehouse_id, -public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id)
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.products p ON oi.product_id = p.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR o.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
            
            UNION ALL
            -- تصنيع تام (+) 
            SELECT po.product_id, 
                   COALESCE(po.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)) as warehouse_id, 
                   po.quantity_to_produce 
            FROM public.mfg_production_orders po
            WHERE UPPER(po.status) = 'COMPLETED' AND po.product_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- 🛡️ منتجات عرضية من التصنيع (+) بصمام أمان صارم يمنع إسقاطها نهائياً
            SELECT 
                bl.product_id, 
                COALESCE(
                    bl.warehouse_id,
                    (SELECT po.warehouse_id 
                     FROM public.mfg_order_progress op 
                     JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
                     WHERE op.id = bl.order_progress_id LIMIT 1),
                    (SELECT id FROM public.warehouses 
                     WHERE organization_id = COALESCE(v_final_org, bl.organization_id) AND deleted_at IS NULL 
                     ORDER BY created_at ASC LIMIT 1),
                    (SELECT id FROM public.warehouses 
                     WHERE deleted_at IS NULL 
                     ORDER BY created_at ASC LIMIT 1)
                ) as warehouse_id, 
                bl.quantity as qty
            FROM public.mfg_byproducts_logs bl
            WHERE (v_final_org IS NULL OR bl.organization_id = v_final_org OR bl.organization_id IS NULL)
            
            UNION ALL
            -- هالك تصنيع (-)
            SELECT 
                sl.product_id,
                COALESCE(
                    (SELECT po.warehouse_id 
                     FROM public.mfg_order_progress op 
                     JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
                     WHERE op.id = sl.order_progress_id LIMIT 1),
                    (SELECT id FROM public.warehouses WHERE organization_id = v_final_org LIMIT 1)
                ) as warehouse_id,
                -sl.quantity as qty
            FROM public.mfg_scrap_logs sl
            WHERE (v_final_org IS NULL OR sl.organization_id = v_final_org)
            
            UNION ALL
            -- استهلاك خامات (-)
            SELECT amu.raw_material_id, 
                   COALESCE(po.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id LIMIT 1)), 
                   -public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id)
            FROM public.mfg_actual_material_usage amu 
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id 
            JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE amu.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- تسويات مخزنية (+/-)
            SELECT sai.product_id, sa.warehouse_id, public.uom_convert(sai.quantity, sai.uom_id, p.base_uom_id)
            FROM public.stock_adjustment_items sai
            JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
            JOIN public.products p ON sai.product_id = p.id
            WHERE sa.status = 'posted' AND (v_final_org IS NULL OR sa.organization_id = v_final_org)

            UNION ALL
            -- تحويلات مخزنية (صادر -)
            SELECT sti.product_id, st.from_warehouse_id, -public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)

            UNION ALL
            -- تحويلات مخزنية (وارد +)
            SELECT sti.product_id, st.to_warehouse_id, public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)

            UNION ALL
            -- مرتجعات مبيعات (+) - بضاعة عادت للمخزن من العميل
            SELECT sri.product_id, sr.warehouse_id, public.uom_convert(sri.quantity, sri.uom_id, p.base_uom_id) as qty
            FROM public.sales_return_items sri
            JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
            JOIN public.products p ON sri.product_id = p.id
            WHERE UPPER(COALESCE(sr.status, '')) NOT IN ('DRAFT', 'CANCELLED')
              AND sr.warehouse_id IS NOT NULL
              AND sri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR sr.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = sri.product_id)

            UNION ALL
            -- مرتجعات مبيعات مكونات BOM (+)
            SELECT bom.raw_material_id, sr.warehouse_id, (public.uom_convert(sri.quantity, sri.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) as qty
            FROM public.sales_return_items sri
            JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
            JOIN public.bill_of_materials bom ON bom.product_id = sri.product_id
            JOIN public.products p ON sri.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(COALESCE(sr.status, '')) NOT IN ('DRAFT', 'CANCELLED')
              AND sr.warehouse_id IS NOT NULL
              AND sri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR sr.organization_id = v_final_org)
              AND bom.raw_material_id IS NOT NULL

            UNION ALL
            -- مرتجعات مشتريات (-) - بضاعة ردت للمورد
            SELECT pri.product_id, pr.warehouse_id, -public.uom_convert(pri.quantity, pri.uom_id, p.base_uom_id) as qty
            FROM public.purchase_return_items pri
            JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
            JOIN public.products p ON pri.product_id = p.id
            WHERE UPPER(COALESCE(pr.status, '')) NOT IN ('DRAFT', 'CANCELLED')
              AND pr.warehouse_id IS NOT NULL
              AND pri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR pr.organization_id = v_final_org)

            UNION ALL
            -- استهلاك مواد لمشاريع المقاولات (-)
            SELECT pmii.product_id, pmi.warehouse_id, -public.uom_convert(pmii.quantity, pmii.uom_id, p.base_uom_id)
            FROM public.project_material_issue_items pmii
            JOIN public.project_material_issues pmi ON pmii.issue_id = pmi.id
            JOIN public.products p ON pmii.product_id = p.id
            WHERE pmi.status = 'approved' AND (v_final_org IS NULL OR pmi.organization_id = v_final_org)
        ) movements
        WHERE product_id IS NOT NULL AND warehouse_id IS NOT NULL
        AND (p_product_id IS NULL OR product_id = p_product_id)
        GROUP BY product_id, warehouse_id
    )
    SELECT 
        product_id, 
        SUM(net_qty) as total_stock,
        jsonb_object_agg(warehouse_id::text, net_qty) as wh_json
    FROM warehouse_movement
    GROUP BY product_id;

    -- تحديث الأصناف التي لها حركات
    UPDATE public.products p
    SET 
        stock = COALESCE(s.total_stock, 0),
        warehouse_stock = COALESCE(s.wh_json, '{}'::jsonb)
    FROM product_summary_temp s
    WHERE p.id = s.product_id;

    -- تصفير الأصناف التي لا تمتلك حركات
    UPDATE public.products p
    SET stock = 0, warehouse_stock = '{}'::jsonb
    WHERE (v_final_org IS NULL OR p.organization_id = v_final_org)
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND NOT EXISTS (SELECT 1 FROM product_summary_temp s WHERE s.product_id = p.id);
END; $$;

-- 5. تشغيل إعادة احتساب المخزون لكافة المنشآت فوراً
DO $$
DECLARE
    r_org RECORD;
BEGIN
    FOR r_org IN SELECT id FROM public.organizations LOOP
        PERFORM public.recalculate_stock_rpc(r_org.id);
    END LOOP;
END $$;
