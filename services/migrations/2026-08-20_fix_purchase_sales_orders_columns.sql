-- ==============================================================================
-- 🚀 TriPro ERP - Migration: Fix Columns for Purchase Orders & Sales Orders
-- Adds missing columns (expected_delivery_date, created_by, subtotal, tax_amount, etc.)
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    -- 1. أوامر البيع (Sales Orders)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders' AND table_schema = 'public') THEN
        ALTER TABLE public.sales_orders 
            ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS expected_delivery_date date,
            ADD COLUMN IF NOT EXISTS created_by uuid,
            ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
            ADD COLUMN IF NOT EXISTS notes text,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    END IF;

    -- 2. أوامر الشراء (Purchase Orders)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders' AND table_schema = 'public') THEN
        ALTER TABLE public.purchase_orders 
            ADD COLUMN IF NOT EXISTS po_number text,
            ADD COLUMN IF NOT EXISTS order_number text,
            ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS expected_delivery_date date,
            ADD COLUMN IF NOT EXISTS created_by uuid,
            ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
            ADD COLUMN IF NOT EXISTS notes text,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

        -- مزامنة رقم أمر الشراء بين العمودين
        UPDATE public.purchase_orders SET po_number = order_number WHERE po_number IS NULL AND order_number IS NOT NULL;
        UPDATE public.purchase_orders SET order_number = po_number WHERE order_number IS NULL AND po_number IS NOT NULL;
    END IF;

    -- 3. بنود أوامر الشراء (Purchase Order Items)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items' AND table_schema = 'public') THEN
        ALTER TABLE public.purchase_order_items 
            ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id),
            ADD COLUMN IF NOT EXISTS total numeric;

        -- نقل البيانات من order_id إلى purchase_order_id إن وجد
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_order_items' AND column_name = 'order_id') THEN
            UPDATE public.purchase_order_items SET purchase_order_id = order_id WHERE purchase_order_id IS NULL AND order_id IS NOT NULL;
            
            -- حذف قيد المفتاح الأجنبي على order_id لمنع تكرار العلاقات (PGRST201)
            FOR r IN (
                SELECT tc.constraint_name 
                FROM information_schema.table_constraints tc 
                JOIN information_schema.key_column_usage kcu 
                  ON tc.constraint_name = kcu.constraint_name 
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.table_name = 'purchase_order_items' 
                  AND kcu.column_name = 'order_id' 
                  AND tc.constraint_type = 'FOREIGN KEY'
            ) LOOP
                EXECUTE 'ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
            END LOOP;
        END IF;
    END IF;

    -- 4. بنود أوامر البيع (Sales Order Items)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_order_items' AND table_schema = 'public') THEN
        ALTER TABLE public.sales_order_items 
            ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id);

        -- نقل البيانات من order_id إلى sales_order_id إن وجد
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_order_items' AND column_name = 'order_id') THEN
            UPDATE public.sales_order_items SET sales_order_id = order_id WHERE sales_order_id IS NULL AND order_id IS NOT NULL;
            
            -- حذف قيد المفتاح الأجنبي على order_id لمنع تكرار العلاقات (PGRST201)
            FOR r IN (
                SELECT tc.constraint_name 
                FROM information_schema.table_constraints tc 
                JOIN information_schema.key_column_usage kcu 
                  ON tc.constraint_name = kcu.constraint_name 
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.table_name = 'sales_order_items' 
                  AND kcu.column_name = 'order_id' 
                  AND tc.constraint_type = 'FOREIGN KEY'
            ) LOOP
                EXECUTE 'ALTER TABLE public.sales_order_items DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
            END LOOP;
        END IF;
    END IF;

    -- 5. تحديث كاش الـ Schema لـ PostgREST
    NOTIFY pgrst, 'reload schema';
END $$;
