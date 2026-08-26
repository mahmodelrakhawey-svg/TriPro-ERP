-- ==============================================================================
-- TriPro ERP — Advanced Restaurant Features Migration
-- Migration: 2026-08-27_restaurant_advanced_features.sql
-- Description: محطات المطبخ KDS Routing، شاشة Expo، كباتن التوصيل والعهد، والساعات السعيدة
-- ==============================================================================

-- 1. جدول محطات المطبخ (Kitchen Stations)
CREATE TABLE IF NOT EXISTS kitchen_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL, -- grill, fryer, oven, cold, drinks, bakery, dessert
    color VARCHAR(50) DEFAULT '#e11d48',
    icon VARCHAR(50) DEFAULT 'Flame',
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ربط الأصناف بمحطات المطبخ
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'station_id') THEN
        ALTER TABLE products ADD COLUMN station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'prep_time_minutes') THEN
        ALTER TABLE products ADD COLUMN prep_time_minutes INT DEFAULT 10;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_86') THEN
        ALTER TABLE products ADD COLUMN is_86 BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 2. جدول حالة أصناف تذاكر المطبخ في كل محطة (Kitchen Ticket Items)
CREATE TABLE IF NOT EXISTS kitchen_ticket_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    status VARCHAR(50) DEFAULT 'NEW', -- NEW, PREPARING, READY, SERVED
    started_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    served_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول تتبع كباتن التوصيل والطلبات (Driver Deliveries)
CREATE TABLE IF NOT EXISTS driver_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    driver_name VARCHAR(255) NOT NULL,
    driver_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ASSIGNED', -- ASSIGNED, DISPATCHED, DELIVERED, RETURNED, CANCELLED
    cod_amount NUMERIC(15, 2) DEFAULT 0.00, -- المبلغ المطلوب تحصيله نقداً عند الاستلام
    is_settled BOOLEAN DEFAULT FALSE,
    settlement_id UUID,
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول تسويات عهد السائقين (Driver Settlements)
CREATE TABLE IF NOT EXISTS driver_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    settlement_number VARCHAR(100) NOT NULL UNIQUE,
    driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    driver_name VARCHAR(255) NOT NULL,
    settlement_date DATE DEFAULT CURRENT_DATE,
    total_orders_count INT DEFAULT 0,
    total_cod_expected NUMERIC(15, 2) DEFAULT 0.00,
    total_cash_received NUMERIC(15, 2) DEFAULT 0.00,
    difference_amount NUMERIC(15, 2) DEFAULT 0.00,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. جدول الساعات السعيدة والتسعير الديناميكي (Happy Hour Schedules)
CREATE TABLE IF NOT EXISTS happy_hour_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    name VARCHAR(255) NOT NULL,
    discount_pct NUMERIC(6, 2) NOT NULL DEFAULT 15.00,
    days_of_week INT[] DEFAULT ARRAY[0,1,2,3,4,5,6], -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL DEFAULT '16:00:00',
    end_time TIME NOT NULL DEFAULT '19:00:00',
    applies_to_all_products BOOLEAN DEFAULT FALSE,
    target_category_ids UUID[],
    target_product_ids UUID[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- تفعيل RLS وسياسات الأمان
ALTER TABLE kitchen_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_ticket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE happy_hour_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kitchen_stations' AND policyname = 'allow_all_stations') THEN
    CREATE POLICY allow_all_stations ON kitchen_stations FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kitchen_ticket_items' AND policyname = 'allow_all_ticket_items') THEN
    CREATE POLICY allow_all_ticket_items ON kitchen_ticket_items FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_deliveries' AND policyname = 'allow_all_driver_deliv') THEN
    CREATE POLICY allow_all_driver_deliv ON driver_deliveries FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_settlements' AND policyname = 'allow_all_settlements') THEN
    CREATE POLICY allow_all_settlements ON driver_settlements FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'happy_hour_schedules' AND policyname = 'allow_all_happy_hours') THEN
    CREATE POLICY allow_all_happy_hours ON happy_hour_schedules FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
