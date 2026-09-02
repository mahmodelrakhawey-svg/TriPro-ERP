-- =============================================================================
-- ⚙️ TriPro ERP — Commercial Add-on: Manufacturing & Production (04_addon_manufacturing.sql)
-- 🏭 مديول التصنيع: خطوط الإنتاج، مراكز العمل، أوامر الشغل، جانت، كفاءة الآلات OEE
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. مراكز العمل وخطوط الإنتاج (Work Centers)
CREATE TABLE IF NOT EXISTS public.mfg_work_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    description TEXT,
    hourly_rate NUMERIC(15,2) DEFAULT 0,
    overhead_rate NUMERIC(15,2) DEFAULT 0,
    capacity_hours_per_day NUMERIC(5,2) DEFAULT 8.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. الماكينات ومعدات المصنع (Factory Machinery)
CREATE TABLE IF NOT EXISTS public.mfg_machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    work_center_id UUID REFERENCES public.mfg_work_centers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT,
    model TEXT,
    status TEXT DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL', 'MAINTENANCE', 'DOWN', 'OFFLINE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. مسارات العمل والعمليات التشغيلية (Routings & Operations)
CREATE TABLE IF NOT EXISTS public.mfg_routings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mfg_routing_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routing_id UUID NOT NULL REFERENCES public.mfg_routings(id) ON DELETE CASCADE,
    operation_name TEXT NOT NULL,
    work_center_id UUID REFERENCES public.mfg_work_centers(id),
    sequence_order INT DEFAULT 1,
    setup_time_mins NUMERIC(10,2) DEFAULT 15,
    run_time_mins NUMERIC(10,2) DEFAULT 60
);

-- 4. أوامر التشغيل والإنتاج (Production Orders)
CREATE TABLE IF NOT EXISTS public.mfg_production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    order_number TEXT NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id),
    routing_id UUID REFERENCES public.mfg_routings(id),
    target_quantity NUMERIC(15,2) NOT NULL CHECK (target_quantity > 0),
    produced_quantity NUMERIC(15,2) DEFAULT 0,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'released', 'in_progress', 'completed', 'closed', 'cancelled')),
    raw_material_warehouse_id UUID REFERENCES public.warehouses(id),
    finished_goods_warehouse_id UUID REFERENCES public.warehouses(id),
    total_cost NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. استهلاك المواد الخام الفعلي (Actual Material Usage)
CREATE TABLE IF NOT EXISTS public.mfg_actual_material_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    production_order_id UUID NOT NULL REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    raw_material_id UUID NOT NULL REFERENCES public.products(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    quantity_used NUMERIC(15,4) NOT NULL CHECK (quantity_used > 0),
    cost_per_unit NUMERIC(15,4) DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. سجلات الهالك والتوالف الصناعية (Scrap Logs)
CREATE TABLE IF NOT EXISTS public.mfg_scrap_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    production_order_id UUID NOT NULL REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    scrap_quantity NUMERIC(15,2) NOT NULL CHECK (scrap_quantity > 0),
    scrap_cost NUMERIC(15,2) DEFAULT 0,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. المنتجات الثانوية المستخرجة (By-products Logs)
CREATE TABLE IF NOT EXISTS public.mfg_byproducts_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    production_order_id UUID NOT NULL REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    byproduct_product_id UUID NOT NULL REFERENCES public.products(id),
    destination_warehouse_id UUID REFERENCES public.warehouses(id),
    quantity_produced NUMERIC(15,2) NOT NULL CHECK (quantity_produced > 0),
    allocated_value NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. صيانة الآلات وتتبع الأعطال (Machine Maintenance)
CREATE TABLE IF NOT EXISTS public.mfg_machine_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    machine_id UUID NOT NULL REFERENCES public.mfg_machines(id) ON DELETE CASCADE,
    maintenance_type TEXT DEFAULT 'PREVENTIVE' CHECK (maintenance_type IN ('PREVENTIVE', 'CORRECTIVE', 'OVERHAUL')),
    scheduled_date DATE NOT NULL,
    actual_date DATE,
    description TEXT,
    cost NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. تفعيل RLS
ALTER TABLE public.mfg_work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_scrap_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_byproducts_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_mfg_orders ON public.mfg_production_orders FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_work_centers ON public.mfg_work_centers FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
