-- ==============================================================================
-- Migration: Fix Driver Deliveries Schema & Foreign Key Constraints
-- التاريخ: 2026-09-01
-- الهدف: إزالة قيود profiles الخاطئة من driver_deliveries وضمان تسجيل التوصيلات دون أخطاء 409
-- ==============================================================================

-- 1. جدول كباتن وسائقي التوصيل (Delivery Drivers Directory)
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    vehicle_type TEXT DEFAULT 'موتوسيكل',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. إزالة أي قيد سابق يربط driver_id بجدول profiles والذي كان يسبب خطأ 409
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'driver_deliveries_driver_id_fkey'
    ) THEN
        ALTER TABLE driver_deliveries DROP CONSTRAINT driver_deliveries_driver_id_fkey;
    END IF;
END $$;

-- 3. إنشاء أو تعديل جدول تتبع كباتن التوصيل (Driver Deliveries)
CREATE TABLE IF NOT EXISTS driver_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    order_id UUID NOT NULL,
    driver_id UUID,
    driver_name VARCHAR(255) NOT NULL,
    driver_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ASSIGNED',
    cod_amount NUMERIC(15, 2) DEFAULT 0.00,
    is_settled BOOLEAN DEFAULT FALSE,
    settlement_id UUID,
    dispatched_at TIMESTAMPTZ DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. جدول تسويات وإقفال ورديات السائقين (Driver Settlements)
CREATE TABLE IF NOT EXISTS driver_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    settlement_number VARCHAR(100) NOT NULL UNIQUE,
    driver_id UUID,
    driver_name VARCHAR(255) NOT NULL,
    settlement_date DATE DEFAULT CURRENT_DATE,
    total_orders_count INT DEFAULT 0,
    total_cod_expected NUMERIC(15, 2) DEFAULT 0.00,
    total_cash_received NUMERIC(15, 2) DEFAULT 0.00,
    difference_amount NUMERIC(15, 2) DEFAULT 0.00,
    journal_entry_id UUID,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. تفعيل سياسات الأمان RLS وصلاحيات الوصول الكاملة
ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_driver_deliv ON driver_deliveries;
CREATE POLICY allow_all_driver_deliv ON driver_deliveries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_driver_settle ON driver_settlements;
CREATE POLICY allow_all_driver_settle ON driver_settlements FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS delivery_drivers_org_policy ON delivery_drivers;
CREATE POLICY delivery_drivers_org_policy ON delivery_drivers FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.delivery_drivers TO authenticated, anon;
GRANT ALL ON public.driver_deliveries TO authenticated, anon;
GRANT ALL ON public.driver_settlements TO authenticated, anon;

SELECT '✅ تم تحديث جداول كباتن التوصيل والعهد النقدية بنجاح' as status;
