-- =============================================================================
-- 🍔 TriPro ERP — Commercial Add-on: Restaurants & Cafes (02_addon_restaurants.sql)
-- 🍽️ مديول المطاعم والكافيهات: الصالة والطاولات، KDS المطبخ، الوصفات، التشفية، التوصيل
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. جدول طاولات المطعم وتخطيط الصالة (Restaurant Tables)
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    floor TEXT DEFAULT 'Main Floor',
    capacity INT DEFAULT 4,
    status TEXT DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'DIRTY', 'OUT_OF_SERVICE')),
    qr_key TEXT UNIQUE,
    pos_x INT DEFAULT 0,
    pos_y INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جلسات الطاولات وحساب الشيك (Table Sessions)
CREATE TABLE IF NOT EXISTS public.table_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    table_id UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    server_name TEXT,
    guest_count INT DEFAULT 2,
    status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'BILL_REQUESTED', 'PAID', 'CLOSED')),
    total_amount NUMERIC(15,2) DEFAULT 0,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- 3. محطات تحضير المطبخ (Kitchen Stations)
CREATE TABLE IF NOT EXISTS public.kitchen_stations (
    id VARCHAR(100) PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    color VARCHAR(50) DEFAULT '#e11d48',
    icon VARCHAR(50) DEFAULT 'Flame',
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- زرع المحطات الافتراضية
INSERT INTO public.kitchen_stations (id, name, code, color, icon, display_order, is_active)
VALUES 
  ('st_grill', 'محطة الشواية والبرجر (Grill)', 'GRILL', '#e11d48', 'Flame', 1, true),
  ('st_oven', 'محطة الفرن والبيتزا (Oven)', 'OVEN', '#d97706', 'Utensils', 2, true),
  ('st_barista', 'محطة البار والمشروبات (Barista)', 'BAR', '#0284c7', 'Coffee', 3, true),
  ('st_salad', 'محطة المقبلات والسلطات (Cold)', 'COLD', '#16a34a', 'Leaf', 4, true)
ON CONFLICT (id) DO NOTHING;

-- 4. أوامر وتذاكر المطبخ الذكية (KDS Tickets)
CREATE TABLE IF NOT EXISTS public.kitchen_ticket_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    order_item_id UUID,
    station_id VARCHAR(100) REFERENCES public.kitchen_stations(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'NEW' CHECK (status IN ('NEW', 'PREPARING', 'READY', 'SERVED')),
    fired_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. مجموعات الإضافات وخيارات الوجبات (Modifiers)
CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    name_en TEXT,
    min_selection INT DEFAULT 0,
    max_selection INT DEFAULT 1,
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    group_id UUID NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(15,2) DEFAULT 0,
    cost NUMERIC(15,2) DEFAULT 0,
    recipe_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, group_id)
);

-- 6. شجرة مكونات الوجبة والخصم المخزني الآلي (Recipe / BOM with Shrinkage)
CREATE TABLE IF NOT EXISTS public.bill_of_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_required NUMERIC(15,4) NOT NULL DEFAULT 1,
    shrinkage_pct NUMERIC(5,2) DEFAULT 0, -- نسبة الانكماش وهالك الطهي %
    uom_id UUID REFERENCES public.uoms(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. تشفية وتفكيك اللحوم والدواجن (Butchering & Yield Management)
CREATE TABLE IF NOT EXISTS public.butchering_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    category TEXT DEFAULT 'beef',
    description TEXT,
    default_expected_yield_pct NUMERIC(5,2) DEFAULT 95.0,
    default_max_shrinkage_pct NUMERIC(5,2) DEFAULT 5.0,
    cost_allocation_method TEXT DEFAULT 'relative_value',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.butchering_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.butchering_templates(id) ON DELETE CASCADE,
    output_name TEXT NOT NULL,
    expected_yield_pct NUMERIC(5,2) NOT NULL,
    relative_value_weight NUMERIC(5,2) DEFAULT 1.0,
    is_by_product BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.butchering_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    order_number TEXT NOT NULL,
    template_id UUID REFERENCES public.butchering_templates(id),
    source_product_id UUID NOT NULL REFERENCES public.products(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    destination_warehouse_id UUID REFERENCES public.warehouses(id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    input_weight NUMERIC(15,3) NOT NULL,
    input_cost_per_kg NUMERIC(15,2) NOT NULL,
    total_input_cost NUMERIC(15,2) NOT NULL,
    additional_labor_cost NUMERIC(15,2) DEFAULT 0,
    additional_overhead_cost NUMERIC(15,2) DEFAULT 0,
    total_net_cost NUMERIC(15,2) NOT NULL,
    total_output_weight NUMERIC(15,3) DEFAULT 0,
    shrinkage_weight NUMERIC(15,3) DEFAULT 0,
    shrinkage_pct NUMERIC(5,2) DEFAULT 0,
    useful_yield_pct NUMERIC(5,2) DEFAULT 0,
    cost_allocation_method TEXT DEFAULT 'relative_value',
    status TEXT DEFAULT 'completed',
    butcher_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.butchering_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.butchering_orders(id) ON DELETE CASCADE,
    output_name TEXT NOT NULL,
    output_product_id UUID REFERENCES public.products(id),
    actual_weight NUMERIC(15,3) NOT NULL,
    yield_pct NUMERIC(5,2) DEFAULT 0,
    relative_value_weight NUMERIC(5,2) DEFAULT 1.0,
    allocated_cost_per_kg NUMERIC(15,2) NOT NULL,
    total_allocated_cost NUMERIC(15,2) NOT NULL,
    is_by_product BOOLEAN DEFAULT FALSE,
    notes TEXT
);

-- 8. طياري التوصيل وتسوية العهد (Delivery Drivers & Settlements)
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    vehicle_type TEXT DEFAULT 'موتوسيكل',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    driver_id UUID REFERENCES public.delivery_drivers(id),
    order_id UUID REFERENCES public.invoices(id),
    order_number TEXT NOT NULL,
    delivery_fee NUMERIC(15,2) DEFAULT 0,
    cash_to_collect NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.driver_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    driver_id UUID NOT NULL REFERENCES public.delivery_drivers(id),
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_orders INT DEFAULT 0,
    total_cash_expected NUMERIC(15,2) DEFAULT 0,
    total_cash_received NUMERIC(15,2) DEFAULT 0,
    difference NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. ساعات التخفيض السعيدة (Happy Hour Schedules)
CREATE TABLE IF NOT EXISTS public.happy_hour_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    discount_pct NUMERIC(5,2) NOT NULL,
    days_of_week INT[] DEFAULT '{0,1,2,3,4,5,6}',
    start_time TIME NOT NULL DEFAULT '16:00',
    end_time TIME NOT NULL DEFAULT '19:00',
    applies_to_all_products BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. تفعيل RLS والصلاحيات
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.butchering_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_tables ON public.restaurant_tables FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_sessions ON public.table_sessions FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_stations ON public.kitchen_stations FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
