-- ==============================================================================
-- TriPro ERP - Migration: Fix Columns & Constraints for Purchase Orders
-- Ensures purchase_orders and purchase_order_items have all needed columns
-- ==============================================================================

DO $$
BEGIN
    -- 1. جدول أوامر الشراء (Purchase Orders)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders' AND table_schema = 'public') THEN
        ALTER TABLE public.purchase_orders 
            ADD COLUMN IF NOT EXISTS po_number text,
            ADD COLUMN IF NOT EXISTS order_number text,
            ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id),
            ADD COLUMN IF NOT EXISTS order_date date DEFAULT CURRENT_DATE,
            ADD COLUMN IF NOT EXISTS expected_delivery_date date,
            ADD COLUMN IF NOT EXISTS delivery_date date,
            ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS payment_terms text,
            ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft',
            ADD COLUMN IF NOT EXISTS notes text,
            ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
            ADD COLUMN IF NOT EXISTS created_by uuid,
            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

        -- مزامنة رقم أمر الشراء وتاريخ التسليم بين الأعمدة المترادفة
        UPDATE public.purchase_orders SET po_number = order_number WHERE po_number IS NULL AND order_number IS NOT NULL;
        UPDATE public.purchase_orders SET order_number = po_number WHERE order_number IS NULL AND po_number IS NOT NULL;
        UPDATE public.purchase_orders SET delivery_date = expected_delivery_date WHERE delivery_date IS NULL AND expected_delivery_date IS NOT NULL;
        UPDATE public.purchase_orders SET expected_delivery_date = delivery_date WHERE expected_delivery_date IS NULL AND delivery_date IS NOT NULL;
    END IF;

    -- 2. جدول بنود أمر الشراء (Purchase Order Items)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items' AND table_schema = 'public') THEN
        ALTER TABLE public.purchase_order_items 
            ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id),
            ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 1,
            ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id),
            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

        -- مزامنة معرف الأمر بين العمودين purchase_order_id و order_id
        UPDATE public.purchase_order_items SET purchase_order_id = order_id WHERE purchase_order_id IS NULL AND order_id IS NOT NULL;
        UPDATE public.purchase_order_items SET order_id = purchase_order_id WHERE order_id IS NULL AND purchase_order_id IS NOT NULL;
    END IF;

    -- 3. إعادة تحميل كاش المخطط لـ PostgREST
    NOTIFY pgrst, 'reload schema';
END $$;
