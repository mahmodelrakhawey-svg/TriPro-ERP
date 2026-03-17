-- =================================================================
-- TriPro ERP - Restaurant Management Module Schema
-- التاريخ: 25 يناير 2026
-- هذا الملف يقوم بإنشاء جميع الجداول والعلاقات اللازمة لتشغيل وحدة المطاعم
-- =================================================================

-- أولاً: إنشاء الأنواع المخصصة (ENUMs) لضمان تناسق البيانات
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'restaurant_table_status') THEN
        CREATE TYPE restaurant_table_status AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_session_status') THEN
        CREATE TYPE table_session_status AS ENUM ('OPEN', 'CLOSED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
        CREATE TYPE order_type AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kitchen_order_status') THEN
        CREATE TYPE kitchen_order_status AS ENUM ('NEW', 'PREPARING', 'READY', 'SERVED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE payment_method AS ENUM ('CASH', 'CARD', 'WALLET', 'SPLIT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM ('COMPLETED', 'FAILED', 'PENDING');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_type') THEN
        CREATE TYPE offer_type AS ENUM ('BOGO', 'PERCENTAGE', 'COMBO', 'FIXED_PRICE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_transaction_type') THEN
        CREATE TYPE inventory_transaction_type AS ENUM ('SALE', 'WASTE', 'PURCHASE', 'RETURN', 'ADJUSTMENT');
    END IF;

    -- إنشاء تسلسل رقمي للطلبات لضمان عدم التكرار
    CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;
END$$;

-- =================================================================
-- 1. جداول الإعدادات الأساسية (Menu and Tables)
-- =================================================================

-- جدول فئات المنيو (مقبلات، وجبات رئيسية، مشروبات)
CREATE TABLE IF NOT EXISTS public.menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.menu_categories IS 'Categories for menu items like Appetizers, Main Courses, etc.';

-- تعديل جدول المنتجات الحالي لإضافة نوع المنتج وربطه بالفئات
-- ملاحظة: هذا الأمر قد يفشل إذا كان العمود موجوداً. تجاهل الخطأ في هذه الحالة.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL;

-- إضافة قيد فريد من نوعه لعمود SKU لضمان عدم تكرار الأصناف
-- هذا ضروري لعمليات ON CONFLICT وهو ممارسة جيدة بشكل عام
DO $$
BEGIN
    -- إزالة أي قيد فريد موجود على عمود SKU
    ALTER TABLE IF EXISTS public.products DROP CONSTRAINT IF EXISTS products_sku_key;

    -- 1. تنظيف البيانات: تعديل الـ SKU المكرر بإضافة جزء من المعرف إليه لضمان الفرادة
    -- استبدال القيم الفارغة في عمود sku بقيم فريدة
    UPDATE public.products SET sku = 'TEMP-' || id::text WHERE sku IS NULL;

    -- تحديث الـ SKU المكرر بإضافة جزء من المعرف إليه لضمان الفرادة
    UPDATE public.products
    SET sku = sku || '-' || substr(md5(id::text), 1, 4)
    WHERE sku IN (SELECT sku FROM public.products GROUP BY sku HAVING COUNT(*) > 1);

    -- 2. إنشاء الفهرس الفريد
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'products' AND indexname = 'products_sku_unique') THEN
        CREATE UNIQUE INDEX products_sku_unique ON public.products (sku);
        RAISE NOTICE 'تم إنشاء الفهرس الفريد products_sku_unique.';
    ELSE
        RAISE NOTICE 'الفهرس الفريد products_sku_unique موجود بالفعل، سيتم التخطي.';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'products') THEN
      IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'public.products'::regclass AND conname = 'products_sku_key'
      ) THEN

        -- إضافة قيد عدم السماح بقيم NULL في عمود sku
        ALTER TABLE public.products
        ALTER COLUMN sku SET NOT NULL;


        -- إنشاء القيد الفريد
          ALTER TABLE public.products ADD CONSTRAINT products_sku_key UNIQUE (sku);

           RAISE NOTICE 'تم إنشاء القيد الفريد products_sku_key.';

          RAISE NOTICE 'تم إنشاء القيد الفريد products_sku_key.';
      ELSE
          RAISE NOTICE 'القيد الفريد products_sku_key موجود بالفعل، سيتم التخطي.';
      END IF;
    END IF;

END;

$$;

-- جدول الطاولات في المطعم
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    capacity INT NOT NULL DEFAULT 2,
    section TEXT, -- e.g., 'Indoor', 'Outdoor', 'VIP'
    status restaurant_table_status DEFAULT 'AVAILABLE' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.restaurant_tables IS 'Represents physical tables in the restaurant.';

-- =================================================================
-- 2. جداول العمليات (Operational Tables)
-- =================================================================

-- جدول جلسات الطاولات (تتبع متى تم فتح وإغلاق طاولة)
CREATE TABLE IF NOT EXISTS public.table_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES public.restaurant_tables(id),
    user_id UUID REFERENCES public.profiles(id), -- Cashier/Waiter who opened the session
    start_time TIMESTAMPTZ DEFAULT now() NOT NULL,
    end_time TIMESTAMPTZ,
    status table_session_status DEFAULT 'OPEN' NOT NULL
);
COMMENT ON TABLE public.table_sessions IS 'Tracks an active session on a table from open to close.';

-- دوال مساعده لفتح/اغلاق جلسة الطاولة
-- دالة لفتح جلسة جديدة على طاولة
-- تقوم بالتحقق من حالة الطاولة، ثم تحديثها إلى "مشغولة" وإنشاء سجل جلسة جديد
-- وتعيد معرّف الجلسة الجديدة
CREATE OR REPLACE FUNCTION public.open_table_session(p_table_id UUID, p_user_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    new_session_id uuid;
    rows_affected integer;
BEGIN
    -- 1. تحديث حالة الطاولة ذرياً (فقط إذا كانت متاحة) والتحقق من النتيجة
    WITH updated AS (
        UPDATE public.restaurant_tables
        SET status = 'OCCUPIED', updated_at = now()
        WHERE id = p_table_id AND status = 'AVAILABLE'
        RETURNING id
    )
    SELECT count(*) INTO rows_affected FROM updated;

    -- 2. إذا لم يتم تحديث أي صف، فهذا يعني أن الطاولة غير موجودة أو غير متاحة
    IF rows_affected = 0 THEN
        -- نتحقق من السبب الدقيق لإعطاء رسالة خطأ واضحة
        PERFORM 1 FROM public.restaurant_tables WHERE id = p_table_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'الطاولة غير موجودة. (ID: %)', p_table_id;
        ELSE
            RAISE EXCEPTION 'الطاولة ليست متاحة (قد تكون مشغولة أو محجوزة).';
        END IF;
    END IF;

    -- 3. إنشاء جلسة جديدة (فقط إذا نجح تحديث الطاولة)
    INSERT INTO public.table_sessions (table_id, user_id, status)
    VALUES (p_table_id, p_user_id, 'OPEN')
    RETURNING id INTO new_session_id;

    RETURN new_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_table_session(p_session_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_table_id UUID;
BEGIN
    SELECT table_id INTO v_table_id FROM public.table_sessions WHERE id = p_session_id;
    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    UPDATE public.table_sessions
    SET status = 'CLOSED', end_time = now()
    WHERE id = p_session_id;

    UPDATE public.restaurant_tables
    SET status = 'AVAILABLE', updated_at = now()
    WHERE id = v_table_id;
END;
$$;

-- جدول الطلبات الرئيسي
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL DEFAULT ('ORD-' || to_char(now(), 'YYMMDD') || '-' || nextval('public.order_number_seq'::regclass)),
    order_type order_type NOT NULL,
    session_id UUID REFERENCES public.table_sessions(id) ON DELETE SET NULL, -- For DINE_IN
    customer_id UUID REFERENCES public.customers(id),
    user_id UUID REFERENCES public.profiles(id), -- Cashier/Waiter
    status order_status DEFAULT 'PENDING' NOT NULL,
    subtotal NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    total_tax NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    total_discount NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    grand_total NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.orders IS 'Main table for all customer orders.';

-- جدول بنود الطلب
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id), -- Menu Item
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    unit_cost NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    notes TEXT,
    modifiers JSONB, -- عمود لتخزين الإضافات (مثل: زيادة جبن)
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.order_items IS 'Individual items within an order.';

-- Ensure unit_cost column exists if table was already created
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10, 2) DEFAULT 0.00 NOT NULL;

-- جدول طلبات المطبخ (لشاشة KDS)
CREATE TABLE IF NOT EXISTS public.kitchen_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID UNIQUE NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    status kitchen_order_status DEFAULT 'NEW' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    status_updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.kitchen_orders IS 'Tracks the status of each order item in the kitchen.';

-- جدول المدفوعات
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_method payment_method NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    status payment_status DEFAULT 'COMPLETED' NOT NULL,
    transaction_ref TEXT, -- For card or wallet payments
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.payments IS 'Records payments made for orders.';

-- جدول الطلبات الخارجية (توصيل)
CREATE TABLE IF NOT EXISTS public.delivery_orders (
    order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_fee NUMERIC(10, 2) DEFAULT 0.00,
    driver_id UUID REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.delivery_orders IS 'Additional details for delivery orders.';

-- =================================================================
-- 3. جداول المخزون والشيفتات (Inventory and Shifts)
-- =================================================================

-- جدول وصفات الأصناف (Bill of Materials)
CREATE TABLE IF NOT EXISTS public.bill_of_materials (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, -- Menu Item ID
    raw_material_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, -- Ingredient ID (Renamed for clarity)
    quantity_required NUMERIC(10, 3) NOT NULL,
    PRIMARY KEY (product_id, raw_material_id)
);
COMMENT ON TABLE public.bill_of_materials IS 'Defines the ingredients and quantities for each menu item (Recipe/BOM).';

-- جدول حركات المخزون
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id UUID NOT NULL REFERENCES public.products(id),
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
    transaction_type inventory_transaction_type NOT NULL,
    quantity_change NUMERIC(10, 3) NOT NULL, -- Negative for consumption, positive for addition
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.inventory_transactions IS 'Logs all movements of ingredients.';

-- جدول الشيفتات للكاشير
CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    start_time TIMESTAMPTZ DEFAULT now() NOT NULL,
    end_time TIMESTAMPTZ,
    opening_balance NUMERIC(10, 2) NOT NULL,
    closing_balance NUMERIC(10, 2),
    expected_cash NUMERIC(10, 2),
    actual_cash NUMERIC(10, 2),
    difference NUMERIC(10, 2),
    notes TEXT
);
COMMENT ON TABLE public.shifts IS 'Manages cashier shifts, cash drawer reconciliation.';

-- =================================================================
-- 4. جداول العروض والكومبو (Offers and Combos)
-- =================================================================

CREATE TABLE IF NOT EXISTS public.offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type offer_type NOT NULL,
    config JSONB, -- e.g., {'buy': 2, 'get': 1}, {'percentage': 15}, {'price': 50}
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.offers IS 'Manages promotional offers like BOGO, discounts, etc.';

CREATE TABLE IF NOT EXISTS public.combo_items (
    offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE, -- The Combo offer
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, -- The main combo product
    included_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, -- Item within the combo
    quantity INT NOT NULL DEFAULT 1,
    PRIMARY KEY (offer_id, product_id, included_product_id)
);
COMMENT ON TABLE public.combo_items IS 'Defines the items included in a combo offer.';

-- =================================================================
-- 5. إنشاء الفهارس (Indexes) لتحسين الأداء
-- =================================================================

-- Indexes for faster lookups on foreign keys and statuses
CREATE INDEX IF NOT EXISTS idx_table_sessions_table_id ON public.table_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_status ON public.kitchen_orders(status);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_ingredient_id ON public.inventory_transactions(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON public.shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_bill_of_materials_raw_material_id ON public.bill_of_materials(raw_material_id);

-- =================================================================
-- 6. تفعيل RLS (Row Level Security)
-- يجب تفعيلها على كل جدول لضمان عزل بيانات المنظمات المختلفة
-- =================================================================

ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
-- Example for one table, repeat for all new tables
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- 7. إنشاء سياسات RLS (RLS Policies)
-- سياسات تسمح للمستخدمين المسجلين بالوصول الكامل للبيانات.
-- هذا مناسب للأنظمة ذات المستأجر الواحد (Single-tenant).
-- =================================================================

-- Policy for restaurant_tables
DROP POLICY IF EXISTS "Allow full access on restaurant_tables" ON public.restaurant_tables;
CREATE POLICY "Allow full access on restaurant_tables"
ON public.restaurant_tables FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Policy for table_sessions
DROP POLICY IF EXISTS "Allow full access on table_sessions" ON public.table_sessions;
CREATE POLICY "Allow full access on table_sessions"
ON public.table_sessions FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Policy for orders
DROP POLICY IF EXISTS "Allow full access on orders" ON public.orders;
CREATE POLICY "Allow full access on orders"
ON public.orders FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Policy for order_items
DROP POLICY IF EXISTS "Allow full access on order_items" ON public.order_items;
CREATE POLICY "Allow full access on order_items"
ON public.order_items FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Policy for kitchen_orders
DROP POLICY IF EXISTS "Allow full access on kitchen_orders" ON public.kitchen_orders;
CREATE POLICY "Allow full access on kitchen_orders"
ON public.kitchen_orders FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Policy for payments
DROP POLICY IF EXISTS "Allow full access on payments" ON public.payments;
CREATE POLICY "Allow full access on payments"
ON public.payments FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Policy for menu_categories
DROP POLICY IF EXISTS "Allow full access on menu_categories" ON public.menu_categories;
CREATE POLICY "Allow full access on menu_categories"
ON public.menu_categories FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- سياسة تسمح للمستخدمين بقراءة البيانات الخاصة بمنظمتهم فقط
-- ملاحظة: هذا يتطلب وجود عمود organization_id في كل جدول، وهو ما يجب إضافته
-- بناءً على استراتيجية النشر الخاصة بك (Single-tenant)، قد لا تحتاج RLS
-- إذا كان لكل عميل قاعدة بيانات منفصلة. سأترك هذا كمرجع.
/*
CREATE POLICY "Allow read access to own organization data"
ON public.menu_categories FOR SELECT
USING (organization_id = (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));
*/

-- =================================================================
-- نهاية السكربت
-- =================================================================

-- ملاحظة: لتفعيل RLS بشكل كامل، يجب إضافة عمود organization_id لكل الجداول
-- وربطه بالمنظمة الحالية. لكن بما أن نظامك Single-tenant، فهذا الإجراء
-- قد لا يكون ضرورياً، حيث أن العزل يتم على مستوى قاعدة البيانات.

-- لإضافة عمود المنظمة (إذا احتجت)
-- ALTER TABLE public.menu_categories ADD COLUMN organization_id UUID REFERENCES public.organizations(id);