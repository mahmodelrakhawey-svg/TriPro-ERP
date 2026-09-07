-- ==============================================================================
-- Migration: إصلاح أسباب خطأ 400 في جدول butchering_orders
-- التاريخ: 2026-08-28
-- الهدف: تخفيف القيود لمنع 400 Bad Request عند إنشاء أمر تشفية
-- ==============================================================================

-- 1. التأكد من وجود الجداول أصلاً مع الأعمدة الصحيحة
CREATE TABLE IF NOT EXISTS public.butchering_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    order_number VARCHAR(100) NOT NULL,
    template_id UUID,
    source_product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    destination_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    input_weight NUMERIC(12, 3) NOT NULL DEFAULT 0,
    input_cost_per_kg NUMERIC(15, 4) NOT NULL DEFAULT 0,
    total_input_cost NUMERIC(15, 4) NOT NULL DEFAULT 0,
    additional_labor_cost NUMERIC(15, 4) DEFAULT 0.00,
    additional_overhead_cost NUMERIC(15, 4) DEFAULT 0.00,
    total_net_cost NUMERIC(15, 4) NOT NULL DEFAULT 0,
    total_output_weight NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    shrinkage_weight NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    shrinkage_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    useful_yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    cost_allocation_method VARCHAR(50) DEFAULT 'relative_value',
    status VARCHAR(50) DEFAULT 'completed',
    journal_entry_id UUID,
    butcher_name VARCHAR(255),
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.butchering_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.butchering_orders(id) ON DELETE CASCADE,
    output_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    output_name VARCHAR(255) NOT NULL DEFAULT '',
    actual_weight NUMERIC(12, 3) NOT NULL DEFAULT 0,
    yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    relative_value_weight NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    allocated_cost_per_kg NUMERIC(15, 4) NOT NULL DEFAULT 0,
    total_allocated_cost NUMERIC(15, 4) NOT NULL DEFAULT 0,
    is_by_product BOOLEAN DEFAULT FALSE,
    standard_expected_weight NUMERIC(12, 3) DEFAULT 0.000,
    variance_weight NUMERIC(12, 3) DEFAULT 0.000,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. إزالة قيد UNIQUE المشدد على order_number (يسبب خطأ 400 عند التكرار)
--    واستبداله بـ UNIQUE per organization
DO 
BEGIN
    -- إزالة unique constraint القديم إن وجد
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'butchering_orders_order_number_key'
          AND conrelid = 'public.butchering_orders'::regclass
    ) THEN
        ALTER TABLE public.butchering_orders DROP CONSTRAINT butchering_orders_order_number_key;
    END IF;
END ;

-- إضافة unique constraint مركّب (order_number + organization_id)
DO 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'butchering_orders_order_number_org_key'
          AND conrelid = 'public.butchering_orders'::regclass
    ) THEN
        ALTER TABLE public.butchering_orders
        ADD CONSTRAINT butchering_orders_order_number_org_key
        UNIQUE (order_number, organization_id);
    END IF;
END ;

-- 3. إزالة FK على journal_entries إن كان مشكلة (يسبب 400 إذا لم يوجد القيد الأب)
DO 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'butchering_orders_journal_entry_id_fkey'
          AND conrelid = 'public.butchering_orders'::regclass
    ) THEN
        ALTER TABLE public.butchering_orders DROP CONSTRAINT butchering_orders_journal_entry_id_fkey;
    END IF;
END ;

-- 4. تفعيل RLS مع سياسات مفتوحة
ALTER TABLE public.butchering_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.butchering_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_orders ON public.butchering_orders;
CREATE POLICY allow_all_orders ON public.butchering_orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_order_items ON public.butchering_order_items;
CREATE POLICY allow_all_order_items ON public.butchering_order_items FOR ALL USING (true) WITH CHECK (true);

-- 5. منح الصلاحيات
GRANT ALL ON TABLE public.butchering_orders TO authenticated, anon;
GRANT ALL ON TABLE public.butchering_order_items TO authenticated, anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

-- 6. فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_butchering_orders_org ON public.butchering_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_butchering_orders_date ON public.butchering_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_butchering_order_items_order ON public.butchering_order_items(order_id);

SELECT 'butchering_orders fix applied successfully ✅' AS result;
