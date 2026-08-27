-- ==============================================================================
-- TriPro ERP — Fix Kitchen Stations & Product Station Assignment
-- Migration: 2026-08-27_fix_kitchen_stations_and_products.sql
-- Description: تحويل عمود station_id إلى نص مرن VARCHAR(100) لإتاحة ربط الأصناف بالمحطات بدون أخطاء UUID 
-- ==============================================================================

-- 1. إزالة أي قيود مفتاح أجنبي صارمة على عمود station_id
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'products_station_id_fkey'
    ) THEN
        ALTER TABLE products DROP CONSTRAINT products_station_id_fkey;
    END IF;
END $$;

-- 2. تحويل نوع عمود station_id في جدول products إلى VARCHAR(100)
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'station_id'
    ) THEN
        ALTER TABLE products ALTER COLUMN station_id TYPE VARCHAR(100) USING station_id::text;
    ELSE
        ALTER TABLE products ADD COLUMN station_id VARCHAR(100);
    END IF;

    -- التأكد من الأعمدة المساعدة
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'prep_time_minutes') THEN
        ALTER TABLE products ADD COLUMN prep_time_minutes INT DEFAULT 10;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_86') THEN
        ALTER TABLE products ADD COLUMN is_86 BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. إصلاح جدول تذاكر المطبخ kitchen_ticket_items
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_ticket_items') THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'kitchen_ticket_items_station_id_fkey'
        ) THEN
            ALTER TABLE kitchen_ticket_items DROP CONSTRAINT kitchen_ticket_items_station_id_fkey;
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'kitchen_ticket_items' AND column_name = 'station_id'
        ) THEN
            ALTER TABLE kitchen_ticket_items ALTER COLUMN station_id TYPE VARCHAR(100) USING station_id::text;
        END IF;
    END IF;
END $$;

-- 4. التأكد من جدول محطات المطبخ kitchen_stations وتحويل id إلى VARCHAR(100)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_stations') THEN
        CREATE TABLE kitchen_stations (
            id VARCHAR(100) PRIMARY KEY,
            organization_id UUID,
            name VARCHAR(255) NOT NULL,
            code VARCHAR(50) NOT NULL,
            color VARCHAR(50) DEFAULT '#e11d48',
            icon VARCHAR(50) DEFAULT 'Flame',
            display_order INT DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ELSE
        -- تحويل المعرف ليدعم المعرفات النصية (مثل st_grill, st_oven أو UUIDs)
        BEGIN
            ALTER TABLE kitchen_stations ALTER COLUMN id DROP DEFAULT;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        
        BEGIN
            ALTER TABLE kitchen_stations ALTER COLUMN id TYPE VARCHAR(100) USING id::text;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END $$;

-- 5. منح صلاحيات الوصول الكاملة للأدوار (حل مشكلة 401 Permission Denied)
GRANT ALL ON TABLE kitchen_stations TO authenticated, anon;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_ticket_items') THEN
        GRANT ALL ON TABLE kitchen_ticket_items TO authenticated, anon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'driver_deliveries') THEN
        GRANT ALL ON TABLE driver_deliveries TO authenticated, anon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'driver_settlements') THEN
        GRANT ALL ON TABLE driver_settlements TO authenticated, anon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'happy_hour_schedules') THEN
        GRANT ALL ON TABLE happy_hour_schedules TO authenticated, anon;
    END IF;
END $$;

-- 6. سياسات الأمان RLS
ALTER TABLE kitchen_stations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kitchen_stations' AND policyname = 'allow_all_stations') THEN
        CREATE POLICY allow_all_stations ON kitchen_stations FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 7. زرع محطات المطبخ الافتراضية
INSERT INTO kitchen_stations (id, name, code, color, icon, display_order, is_active)
VALUES 
  ('st_grill', 'محطة الشواية واللحوم (Grill)', 'grill', '#dc2626', 'Flame', 1, true),
  ('st_fryer', 'محطة المقليات والبرجر (Fryer)', 'fryer', '#ea580c', 'Utensils', 2, true),
  ('st_oven', 'محطة الفرن والبيتزا (Oven / Pizza)', 'oven', '#d97706', 'Layers', 3, true),
  ('st_cold', 'محطة البارد والسلطات (Cold & Salad)', 'cold', '#16a34a', 'Leaf', 4, true),
  ('st_drinks', 'محطة المشروبات والبار (Bar & Drinks)', 'drinks', '#0284c7', 'Coffee', 5, true),
  ('st_dessert', 'محطة الحلويات (Desserts)', 'dessert', '#9333ea', 'Sparkles', 6, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order,
  is_active = true;

-- 8. تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';
