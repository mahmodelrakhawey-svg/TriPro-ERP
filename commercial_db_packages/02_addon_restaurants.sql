-- =============================================================================
-- 🍔 TriPro ERP — Commercial Add-on: Restaurants & Cafes (02_addon_restaurants.sql)
-- 🍽️ مديول المطاعم: الصالة والطاولات، شاشات KDS، الإضافات، الوصفات، التشفية، التوصيل والطيارين
-- =============================================================================

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
    organization_id UUID REFERENCES public.organizations(id),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, -- Menu Item ID
    raw_material_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, -- Ingredient ID (Renamed for clarity)
    quantity_required NUMERIC(10, 3) NOT NULL,
    PRIMARY KEY (product_id, raw_material_id)
);
COMMENT ON TABLE public.bill_of_materials IS 'Defines the ingredients and quantities for each menu item (Recipe/BOM).';
ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

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

-- =================================================================
-- TriPro ERP - Restaurant Module Functions
-- التاريخ: 26 يناير 2026
-- هذا الملف يحتوي على الدوال البرمجية (RPC) الخاصة بوحدة المطاعم
-- =================================================================

-- تأكد من وجود التسلسل
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

-- تنظيف شامل لجميع نسخ الدالة لمنع خطأ PGRST203 (Overloading Error)
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, order_type, text, jsonb);
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, jsonb, text, order_type, uuid, uuid);
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, text, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, order_type, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, order_type, text, jsonb, uuid, jsonb);
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, uuid, order_type, text, jsonb, uuid, jsonb); -- حذف النسخة الجديدة إذا وجدت لإعادة البناء

-- دالة لإنشاء طلب مطعم متكامل (رأس وتفاصيل وطلبات مطبخ)
-- تضمن هذه الدالة أن جميع العمليات تتم كوحدة واحدة (Transactional)
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_org_id uuid, -- المعامل الجديد لضمان فصل البيانات
    p_session_id uuid,
    p_user_id uuid,
    p_order_type order_type,
    p_notes text,
    p_items jsonb, -- e.g., '[{"product_id": "uuid", "quantity": 2, "unitPrice": 15.50, "unitCost": 5.00, "notes": "extra cheese"}]'
    p_customer_id uuid,
    p_delivery_info jsonb DEFAULT NULL -- معلومات التوصيل إضافية اختيارية
)
RETURNS uuid -- returns the new order_id
LANGUAGE plpgsql
AS $$
DECLARE
    new_order_id uuid;
    item jsonb;
    new_order_item_id uuid;
    v_subtotal numeric := 0;
    v_total_tax numeric := 0;
    v_grand_total numeric := 0;
    v_tax_rate numeric;
    v_order_number text;
BEGIN
    -- 1. جلب نسبة الضريبة من الإعدادات
    SELECT (vat_rate) INTO v_tax_rate FROM public.company_settings WHERE organization_id = p_org_id LIMIT 1;
    IF v_tax_rate IS NULL THEN
        v_tax_rate := 0.15; -- قيمة افتراضية إذا لم تكن محددة
    END IF;

    -- توليد رقم الطلب يدوياً لضمان عدم الاعتماد على القيمة الافتراضية للجدول التي قد تكون مفقودة
    v_order_number := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || nextval('public.order_number_seq');

    -- 2. إنشاء رأس الطلب الرئيسي
    INSERT INTO public.orders (organization_id, order_number, order_type, session_id, user_id, customer_id, status, notes, subtotal, total_tax, grand_total)
    VALUES (p_org_id, v_order_number, p_order_type, p_session_id, p_user_id, p_customer_id, 'CONFIRMED', p_notes, 0, 0, 0)
    RETURNING id INTO new_order_id;

    -- 3. إضافة بنود الطلب وبنود المطبخ
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- نستخدم product_id, unitPrice, unitCost ليتطابق مع ما يرسله ال Frontend
        -- ونحاول إضافة modifiers إذا كان العمود موجوداً (يتم التعامل مع الخطأ داخل قاعدة البيانات أو افتراض وجود العمود)
        -- ملاحظة: الكود أدناه يفترض وجود عمود modifiers، إذا لم يكن موجوداً يرجى إضافته للجدول order_items
        INSERT INTO public.order_items (
            organization_id, order_id, product_id, quantity, unit_price, unit_cost, total_price, notes, modifiers
        )
        VALUES (
            p_org_id,
            new_order_id, 
            (item->>'product_id')::uuid, 
            (item->>'quantity')::int, 
            (item->>'unitPrice')::numeric, 
            COALESCE((item->>'unitCost')::numeric, 0), -- حفظ التكلفة مع قيمة افتراضية
            (item->>'quantity')::int * (item->>'unitPrice')::numeric, 
            item->>'notes',
            item->'modifiers'
        )
        RETURNING id INTO new_order_item_id;

        INSERT INTO public.kitchen_orders (organization_id, order_item_id, status)
        VALUES (p_org_id, new_order_item_id, 'NEW');
    END LOOP;

    -- 4. إعادة حساب الإجماليات وتحديث الطلب الرئيسي
    SELECT COALESCE(SUM(total_price), 0) INTO v_subtotal FROM public.order_items WHERE order_id = new_order_id;
    v_total_tax := v_subtotal * v_tax_rate;
    v_grand_total := v_subtotal + v_total_tax;

    UPDATE public.orders SET subtotal = v_subtotal, total_tax = v_total_tax, grand_total = v_grand_total, updated_at = now()
    WHERE id = new_order_id;

    -- 5. إذا كان الطلب توصيل، يتم إدراج البيانات في جدول التوصيل
    IF p_order_type = 'DELIVERY' AND p_delivery_info IS NOT NULL THEN
        INSERT INTO public.delivery_orders (organization_id, order_id, customer_name, customer_phone, delivery_address, delivery_fee)
        VALUES (
            p_org_id,
            new_order_id,
            p_delivery_info->>'customer_name',
            p_delivery_info->>'customer_phone',
            p_delivery_info->>'delivery_address',
            COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0)
        );
    END IF;

    -- 5. إرجاع معرف الطلب الجديد
    RETURN new_order_id;
END;
$$;

-- دالة جديدة لجلب الطلبات التي تنتظر الدفع (خاصة للسفري والتوصيل)
-- هذه الدالة ستستخدمها الواجهة الأمامية لعرض قائمة جانبية للطلبات التي ليس لها طاولات
DROP FUNCTION IF EXISTS public.get_pending_payment_orders(uuid);

CREATE OR REPLACE FUNCTION public.get_pending_payment_orders(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    order_number text,
    order_type order_type,
    grand_total numeric,
    created_at timestamptz,
    status order_status,
    customer_phone text
) LANGUAGE sql AS $$
    -- نستخدم :: لتحويل القيم صراحة إلى الأنواع المعرفة في RETURNS TABLE
    SELECT 
        o.id, 
        o.order_number, 
        o.order_type::order_type, 
        o.grand_total, 
        o.created_at, 
        o.status::order_status,
        COALESCE(d.customer_phone, c.phone) as customer_phone
    FROM public.orders o
    LEFT JOIN public.delivery_orders d ON o.id = d.order_id
    LEFT JOIN public.customers c ON o.customer_id = c.id
    WHERE o.organization_id = p_org_id -- تصفية النتائج حسب المنظمة
    AND o.status::text = 'CONFIRMED' 
    AND (o.session_id IS NULL OR o.order_type::text != 'DINE_IN')
    ORDER BY o.created_at DESC;
$$;

-- =================================================================
-- TriPro ERP - Restaurant Accounting Functions
-- التاريخ: 27 يناير 2026
-- هذا الملف يحتوي على الدالة المحاسبية الرئيسية لإغلاق وردية المطعم
-- =================================================================

CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id UUID)
RETURNS UUID -- returns the new journal_entry_id
LANGUAGE plpgsql
AS $$
DECLARE
    v_shift RECORD;
    v_journal_entry_id UUID;
    v_total_revenue NUMERIC := 0;
    v_total_tax NUMERIC := 0;
    v_total_cogs NUMERIC := 0;
    v_total_cash NUMERIC := 0;
    v_total_card NUMERIC := 0;
    v_total_discount NUMERIC := 0;
    
    -- Account IDs
    acc_sales_revenue UUID;
    acc_vat UUID;
    acc_cogs UUID;
    acc_inventory UUID;
    acc_cash UUID;
    acc_card UUID;
    acc_sales_discount UUID;

BEGIN
    -- 1. Get shift details
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shift not found: %', p_shift_id;
    END IF;

    -- 2. Get system account IDs (using codes for reliability)
    SELECT id INTO acc_sales_revenue FROM public.accounts WHERE code = '411';
    SELECT id INTO acc_vat FROM public.accounts WHERE code = '2231';
    SELECT id INTO acc_cogs FROM public.accounts WHERE code = '511';
    SELECT id INTO acc_inventory FROM public.accounts WHERE code = '10302'; -- Finished Goods
    SELECT id INTO acc_cash FROM public.accounts WHERE code = '1231';
    SELECT id INTO acc_card FROM public.accounts WHERE code = '1232'; -- Assuming Al Ahli Bank for cards
    SELECT id INTO acc_sales_discount FROM public.accounts WHERE code = '413';

    -- Check if all accounts are found
    IF acc_sales_revenue IS NULL OR acc_vat IS NULL OR acc_cogs IS NULL OR acc_inventory IS NULL OR acc_cash IS NULL OR acc_card IS NULL OR acc_sales_discount IS NULL THEN
        RAISE EXCEPTION 'One or more system accounts are not defined. Please check codes: 411, 2231, 511, 10302, 1231, 1232, 413.';
    END IF;

    -- 3. Aggregate financial data from completed orders within the shift
    WITH shift_orders AS (
        SELECT o.id, o.subtotal, o.total_tax, o.total_discount
        FROM public.orders o
        WHERE o.user_id = v_shift.user_id
          AND o.status = 'COMPLETED'
          AND o.created_at >= v_shift.start_time
          AND o.created_at <= COALESCE(v_shift.end_time, now())
    )
    SELECT COALESCE(SUM(so.subtotal), 0), COALESCE(SUM(so.total_tax), 0), COALESCE(SUM(so.total_discount), 0)
    INTO v_total_revenue, v_total_tax, v_total_discount
    FROM shift_orders;

    -- Aggregate payments
    SELECT COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount ELSE 0 END), 0), COALESCE(SUM(CASE WHEN p.payment_method = 'CARD' THEN p.amount ELSE 0 END), 0)
    INTO v_total_cash, v_total_card
    FROM public.payments p JOIN public.orders o ON p.order_id = o.id
    WHERE o.user_id = v_shift.user_id AND o.status = 'COMPLETED' AND o.created_at >= v_shift.start_time AND o.created_at <= COALESCE(v_shift.end_time, now());

    -- Aggregate COGS from order_items
    SELECT COALESCE(SUM(oi.quantity * oi.unit_cost), 0)
    INTO v_total_cogs
    FROM public.order_items oi JOIN public.orders o ON oi.order_id = o.id
    WHERE o.user_id = v_shift.user_id AND o.status = 'COMPLETED' AND o.created_at >= v_shift.start_time AND o.created_at <= COALESCE(v_shift.end_time, now());

    -- 4. Create Journal Entry if there are transactions
    IF v_total_revenue > 0 OR v_total_cogs > 0 THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, user_id)
        VALUES (v_shift.end_time::date, 'قيد إغلاق وردية المطعم للمستخدم ' || (SELECT full_name FROM public.profiles WHERE id = v_shift.user_id), 'SHIFT-' || v_shift.id::text, 'posted', v_shift.user_id)
        RETURNING id INTO v_journal_entry_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES
            (v_journal_entry_id, acc_cash, v_total_cash, 0, 'إجمالي مبيعات الكاش'),
            (v_journal_entry_id, acc_card, v_total_card, 0, 'إجمالي مبيعات الشبكة'),
            (v_journal_entry_id, acc_sales_discount, v_total_discount, 0, 'إجمالي الخصومات'),
            (v_journal_entry_id, acc_sales_revenue, 0, v_total_revenue, 'إجمالي إيراد المبيعات'),
            (v_journal_entry_id, acc_vat, 0, v_total_tax, 'إجمالي ضريبة القيمة المضافة'),
            (v_journal_entry_id, acc_cogs, v_total_cogs, 0, 'تكلفة البضاعة المباعة للمطعم'),
            (v_journal_entry_id, acc_inventory, 0, v_total_cogs, 'صرف من مخزون المنتجات التامة');
            
        RETURN v_journal_entry_id;
    ELSE
        RETURN NULL;
    END IF;
END;
$$;

-- 🌶️ نظام الإضافات المتقدم (Advanced Modifiers)
-- تاريخ الإنشاء: 22 مارس 2026

-- 1. جدول مجموعات الإضافات (Modifier Groups)
-- هذا الجدول يحدد القواعد لمجموعة من الخيارات، مثل "الحجم" أو "الإضافات".
CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    selection_type TEXT NOT NULL CHECK (selection_type IN ('SINGLE', 'MULTIPLE')) DEFAULT 'MULTIPLE', -- هل يمكن اختيار واحد فقط أم عدة خيارات؟
    is_required BOOLEAN NOT NULL DEFAULT false, -- هل هذه المجموعة إجبارية؟
    min_selection INT NOT NULL DEFAULT 0,
    max_selection INT,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.modifier_groups IS 'مجموعات الإضافات المرتبطة بالمنتجات، مثل الحجم، الصوصات، إلخ.';
COMMENT ON COLUMN public.modifier_groups.name IS 'اسم المجموعة (مثال: حجم البيتزا، الإضافات)';
COMMENT ON COLUMN public.modifier_groups.product_id IS 'المنتج الذي تنتمي إليه هذه المجموعة';
COMMENT ON COLUMN public.modifier_groups.selection_type IS 'نوع الاختيار: SINGLE (واحد فقط) أو MULTIPLE (متعدد)';
COMMENT ON COLUMN public.modifier_groups.is_required IS 'هل يجب على المستخدم اختيار خيار واحد على الأقل من هذه المجموعة؟';
COMMENT ON COLUMN public.modifier_groups.min_selection IS 'الحد الأدنى لعدد الخيارات التي يجب تحديدها';
COMMENT ON COLUMN public.modifier_groups.max_selection IS 'الحد الأقصى لعدد الخيارات التي يمكن تحديدها';

-- 2. جدول الإضافات (Modifiers)
-- هذا الجدول يحتوي على الخيارات الفردية داخل كل مجموعة.
CREATE TABLE IF NOT EXISTS public.modifiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    modifier_group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    is_default BOOLEAN NOT NULL DEFAULT false, -- هل هذا الخيار محدد بشكل افتراضي؟
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.modifiers IS 'الخيارات الفردية داخل كل مجموعة إضافات، مثل "صغير"، "وسط"، "جبنة إضافية".';
COMMENT ON COLUMN public.modifiers.name IS 'اسم الإضافة (مثال: صغير، جبنة إضافية)';
COMMENT ON COLUMN public.modifiers.price IS 'السعر الإضافي لهذه الإضافة';
COMMENT ON COLUMN public.modifiers.modifier_group_id IS 'المجموعة التي تنتمي إليها هذه الإضافة';

-- 3. جدول ربط الإضافات ببنود الطلب (Order Item Modifiers)
-- هذا الجدول يسجل الإضافات التي تم اختيارها لكل صنف في طلب معين.
CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
    order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    modifier_id uuid NOT NULL REFERENCES public.modifiers(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    price_at_order NUMERIC(10, 2) NOT NULL, -- سعر الإضافة وقت الطلب
    PRIMARY KEY (order_item_id, modifier_id)
);

COMMENT ON TABLE public.order_item_modifiers IS 'جدول الربط لتسجيل الإضافات المختارة لكل صنف في الطلب.';
COMMENT ON COLUMN public.order_item_modifiers.quantity IS 'كمية الإضافة (مثال: 2x جبنة إضافية)';
COMMENT ON COLUMN public.order_item_modifiers.price_at_order IS 'تسجيل سعر الإضافة وقت الطلب لتجنب مشاكل تغيير الأسعار مستقبلاً';

-- تفعيل RLS للجداول الجديدة
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;

-- يمكنك إضافة سياسات RLS هنا لاحقاً حسب الحاجة

-- =================================================================
-- TriPro ERP - Wastage Analysis Report
-- الوصف: دالة لإنشاء تقرير يحلل أسباب الهدر الأكثر شيوعاً وتكلفة مع عزل الشركات
-- =================================================================

CREATE OR REPLACE FUNCTION public.analyze_wastage_reasons(
    p_start_date DATE,
    p_end_date DATE,
    p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_report_data JSONB;
BEGIN
    SELECT jsonb_agg(t)
    INTO v_report_data
    FROM (
        SELECT 
            reason,
            COUNT(*)::int AS occurrence_count,
            SUM(quantity)::numeric AS total_wasted_quantity,
            SUM(total_cost)::numeric AS total_wasted_cost
        FROM (
            -- 1. حركات الهالك والتسويات المخزنية
            SELECT 
                COALESCE(NULLIF(TRIM(sa.reason), ''), 'هالك عام') AS reason,
                ABS(sai.quantity) AS quantity,
                ABS(sai.quantity) * COALESCE(p.purchase_price, p.weighted_average_cost, 0) AS total_cost
            FROM stock_adjustments sa
            JOIN stock_adjustment_items sai ON sai.stock_adjustment_id = sa.id
            JOIN products p ON sai.product_id = p.id
            WHERE sa.adjustment_date::date BETWEEN p_start_date AND p_end_date
              AND (p_org_id IS NULL OR sa.organization_id = p_org_id)
              AND (sa.reason ILIKE '%هالك%' OR sa.reason ILIKE '%wastage%' OR sa.reason ILIKE '%تالف%')
        ) aggregated_sources
        GROUP BY reason
        ORDER BY total_wasted_cost DESC
    ) t;

    RETURN COALESCE(v_report_data, '[]'::jsonb);
END;
$$;

-- TriPro ERP - Restaurant Process Split Payment Function (Updated - Table ID Resolution)
-- Date: July 6, 2026
-- Description: Adds the process_split_payment database function. Resolves table_id from table_sessions instead of orders.

CREATE OR REPLACE FUNCTION public.process_split_payment(
    p_order_id UUID,
    p_items JSONB, -- Array of {"id": "order_item_id", "quantity": number}
    p_payment_method TEXT,
    p_amount NUMERIC,
    p_cash_account_id UUID,
    p_org_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_split_order_id UUID;
    v_order_num TEXT;
    v_item JSONB;
    v_orig_order RECORD;
    v_orig_item RECORD;
    v_split_subtotal NUMERIC := 0;
    v_orig_subtotal NUMERIC := 0;
    v_tax_rate NUMERIC;
    v_tax_enabled BOOLEAN;
    v_org_id UUID;
    v_table_id UUID;
BEGIN
    -- 1. Fetch original order details (without restrictive org check)
    SELECT * INTO v_orig_order FROM public.orders WHERE id = p_order_id;
    IF v_orig_order.id IS NULL THEN
        RAISE EXCEPTION 'الطلب الأصلي غير موجود.';
    END IF;

    -- 2. Determine organization ID dynamically
    v_org_id := COALESCE(v_orig_order.organization_id, p_org_id);
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'لم يتم تحديد معرّف المؤسسة للطلب.';
    END IF;

    -- 3. Get tax configurations
    SELECT vat_rate, COALESCE(enable_tax, true) INTO v_tax_rate, v_tax_enabled 
    FROM public.company_settings WHERE organization_id = v_org_id;
    IF NOT v_tax_enabled THEN
        v_tax_rate := 0;
    END IF;

    -- Generate a unique order number for the split order
    v_order_num := 'SPLIT-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    -- 4. Create new order for the split items (mark status as PAID)
    INSERT INTO public.orders (
        session_id, user_id, order_type, notes, status, customer_id, 
        order_number, organization_id, warehouse_id
    )
    VALUES (
        v_orig_order.session_id, v_orig_order.user_id, v_orig_order.order_type, 
        'جزئي من ' || v_orig_order.order_number, 'PAID', v_orig_order.customer_id, 
        v_order_num, v_org_id, v_orig_order.warehouse_id
    ) 
    RETURNING id INTO v_split_order_id;

    -- 5. Process each item in the split payload
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- Fetch original order item details
        SELECT * INTO v_orig_item FROM public.order_items 
        WHERE id = (v_item->>'id')::UUID AND order_id = p_order_id;

        IF v_orig_item.id IS NULL THEN
            RAISE EXCEPTION 'بند الطلب غير موجود.';
        END IF;

        IF (v_item->>'quantity')::NUMERIC > v_orig_item.quantity THEN
            RAISE EXCEPTION 'الكمية المطلوبة تتجاوز الكمية المتاحة.';
        END IF;

        -- If full quantity of the item is being paid:
        IF (v_item->>'quantity')::NUMERIC = v_orig_item.quantity THEN
            -- Move the entire item to the split order
            UPDATE public.order_items 
            SET order_id = v_split_order_id 
            WHERE id = v_orig_item.id;
            
            v_split_subtotal := v_split_subtotal + (v_orig_item.quantity * v_orig_item.unit_price);
        ELSE
            -- Partial quantity: split the item
            -- Update original item quantity
            UPDATE public.order_items 
            SET quantity = quantity - (v_item->>'quantity')::NUMERIC 
            WHERE id = v_orig_item.id;

            -- Insert new item for the split order
            INSERT INTO public.order_items (
                order_id, product_id, quantity, unit_price, unit_cost, 
                organization_id, modifiers, notes, uom_id
            )
            VALUES (
                v_split_order_id, v_orig_item.product_id, (v_item->>'quantity')::NUMERIC, 
                v_orig_item.unit_price, v_orig_item.unit_cost, v_org_id, 
                v_orig_item.modifiers, v_orig_item.notes, v_orig_item.uom_id
            );

            v_split_subtotal := v_split_subtotal + ((v_item->>'quantity')::NUMERIC * v_orig_item.unit_price);
        END IF;
    END LOOP;

    -- 6. Finalize split order totals
    UPDATE public.orders SET 
        subtotal = v_split_subtotal, 
        total_tax = v_split_subtotal * COALESCE(v_tax_rate, 0.15), 
        grand_total = v_split_subtotal * (1 + COALESCE(v_tax_rate, 0.15))
    WHERE id = v_split_order_id;

    -- 7. Insert payment record for the split order
    INSERT INTO public.payments (
        order_id, payment_method, amount, status, organization_id, cash_account_id
    )
    VALUES (
        v_split_order_id, p_payment_method, p_amount, 'COMPLETED', v_org_id, p_cash_account_id
    );

    -- 8. Recalculate original order totals
    SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_orig_subtotal 
    FROM public.order_items 
    WHERE order_id = p_order_id;

    IF v_orig_subtotal = 0 THEN
        -- If no items left in original order, complete/close it
        UPDATE public.orders SET 
            subtotal = 0, 
            total_tax = 0, 
            grand_total = 0, 
            status = 'PAID'
        WHERE id = p_order_id;

        -- Close table session if Dine-in
        IF v_orig_order.session_id IS NOT NULL THEN
            SELECT table_id INTO v_table_id FROM public.table_sessions WHERE id = v_orig_order.session_id;
            UPDATE public.table_sessions SET status = 'CLOSED', end_time = now() WHERE id = v_orig_order.session_id;
            IF v_table_id IS NOT NULL THEN
                UPDATE public.restaurant_tables SET status = 'AVAILABLE', session_start = NULL WHERE id = v_table_id;
            END IF;
        END IF;
    ELSE
        -- Update original order with new totals
        UPDATE public.orders SET 
            subtotal = v_orig_subtotal, 
            total_tax = v_orig_subtotal * COALESCE(v_tax_rate, 0.15), 
            grand_total = v_orig_subtotal * (1 + COALESCE(v_tax_rate, 0.15))
        WHERE id = p_order_id;
    END IF;

    -- 9. Recalculate stock
    PERFORM public.recalculate_stock_rpc(v_org_id);

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_split_payment(UUID, JSONB, TEXT, NUMERIC, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_split_payment(UUID, JSONB, TEXT, NUMERIC, UUID, UUID) TO anon;


-- TriPro ERP - Sync item_categories to menu_categories
-- Date: July 6, 2026
-- Description: Copies existing item_categories to menu_categories and sets up bidirectional triggers for real-time synchronization.

-- 1. Copy all existing categories from item_categories to menu_categories
INSERT INTO public.menu_categories (id, name, organization_id, display_order)
SELECT id, name, organization_id, display_order 
FROM public.item_categories
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order;

-- 2. Create the automatic sync trigger from item_categories to menu_categories
CREATE OR REPLACE FUNCTION public.fn_sync_item_to_menu_category()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.menu_categories (id, name, organization_id, display_order)
    VALUES (NEW.id, NEW.name, NEW.organization_id, NEW.display_order)
    ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        display_order = EXCLUDED.display_order
    WHERE (public.menu_categories.name IS DISTINCT FROM EXCLUDED.name OR 
           public.menu_categories.display_order IS DISTINCT FROM EXCLUDED.display_order);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_item_cat ON public.item_categories;
CREATE TRIGGER trg_sync_item_cat
AFTER INSERT OR UPDATE ON public.item_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_item_to_menu_category();

-- 3. Create the reverse sync trigger from menu_categories to item_categories
CREATE OR REPLACE FUNCTION public.fn_sync_menu_to_item_category()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.item_categories (id, name, organization_id, display_order)
    VALUES (NEW.id, NEW.name, NEW.organization_id, NEW.display_order)
    ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        display_order = EXCLUDED.display_order
    WHERE (public.item_categories.name IS DISTINCT FROM EXCLUDED.name OR 
           public.item_categories.display_order IS DISTINCT FROM EXCLUDED.display_order);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_menu_cat ON public.menu_categories;
CREATE TRIGGER trg_sync_menu_cat
AFTER INSERT OR UPDATE ON public.menu_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_menu_to_item_category();

-- 4. Sync triggers for deletion to maintain integrity
CREATE OR REPLACE FUNCTION public.fn_sync_delete_item_category()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    DELETE FROM public.menu_categories WHERE id = OLD.id;
    RETURN OLD;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_delete_item_cat ON public.item_categories;
CREATE TRIGGER trg_sync_delete_item_cat
AFTER DELETE ON public.item_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_delete_item_category();

CREATE OR REPLACE FUNCTION public.fn_sync_delete_menu_category()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    DELETE FROM public.item_categories WHERE id = OLD.id;
    RETURN OLD;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_delete_menu_cat ON public.menu_categories;
CREATE TRIGGER trg_sync_delete_menu_cat
AFTER DELETE ON public.menu_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_delete_menu_category();


-- TriPro ERP - Restaurant Table Session Operations (Transfer and Merge)
-- Date: July 6, 2026
-- Description: Adds database functions for transferring a session to another table and merging two table sessions.

-- 1. Function to Transfer a Table Session
CREATE OR REPLACE FUNCTION public.transfer_table_session(
    p_session_id UUID,
    p_target_table_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_source_table_id UUID;
    v_org_id UUID;
BEGIN
    -- Get session details
    SELECT organization_id, table_id INTO v_org_id, v_source_table_id 
    FROM public.table_sessions 
    WHERE id = p_session_id AND status = 'OPEN';

    IF v_source_table_id IS NULL THEN
        RAISE EXCEPTION 'Active session not found or already closed.';
    END IF;

    -- Verify target table exists and belongs to the same organization
    IF NOT EXISTS (
        SELECT 1 FROM public.restaurant_tables 
        WHERE id = p_target_table_id AND organization_id = v_org_id
    ) THEN
        RAISE EXCEPTION 'Target table not found or belongs to a different organization.';
    END IF;

    -- Verify target table is not already occupied
    IF EXISTS (
        SELECT 1 FROM public.restaurant_tables 
        WHERE id = p_target_table_id AND status = 'OCCUPIED'
    ) THEN
        RAISE EXCEPTION 'Target table is already occupied.';
    END IF;

    -- Update session to point to the new table
    UPDATE public.table_sessions 
    SET table_id = p_target_table_id 
    WHERE id = p_session_id;

    -- Make the source table AVAILABLE
    UPDATE public.restaurant_tables 
    SET status = 'AVAILABLE' 
    WHERE id = v_source_table_id;

    -- Make the target table OCCUPIED
    UPDATE public.restaurant_tables 
    SET status = 'OCCUPIED' 
    WHERE id = p_target_table_id;

    RETURN TRUE;
END;
$$;

-- 2. Function to Merge Two Table Sessions
CREATE OR REPLACE FUNCTION public.merge_table_sessions(
    p_source_session_id UUID,
    p_target_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_source_table_id UUID;
    v_target_table_id UUID;
    v_org_id UUID;
    v_source_order_id UUID;
    v_target_order_id UUID;
    v_subtotal NUMERIC;
    v_total_tax NUMERIC;
    v_total_discount NUMERIC;
    v_grand_total NUMERIC;
    v_tax_rate NUMERIC;
BEGIN
    -- Get source session info
    SELECT table_id, organization_id INTO v_source_table_id, v_org_id 
    FROM public.table_sessions 
    WHERE id = p_source_session_id AND status = 'OPEN';

    IF v_source_table_id IS NULL THEN
        RAISE EXCEPTION 'Source session not found or already closed.';
    END IF;

    -- Get target session info
    SELECT table_id INTO v_target_table_id 
    FROM public.table_sessions 
    WHERE id = p_target_session_id AND status = 'OPEN' AND organization_id = v_org_id;

    IF v_target_table_id IS NULL THEN
        RAISE EXCEPTION 'Target session not found, closed, or belongs to a different organization.';
    END IF;

    -- Find active open orders for source and target sessions
    -- (status not in cancelled, draft, paid, completed, posted)
    SELECT id INTO v_source_order_id FROM public.orders
    WHERE session_id = p_source_session_id 
      AND status NOT IN ('CANCELLED', 'DRAFT', 'posted', 'paid', 'PAID', 'COMPLETED')
      AND organization_id = v_org_id
    ORDER BY created_at DESC LIMIT 1;

    SELECT id INTO v_target_order_id FROM public.orders
    WHERE session_id = p_target_session_id 
      AND status NOT IN ('CANCELLED', 'DRAFT', 'posted', 'paid', 'PAID', 'COMPLETED')
      AND organization_id = v_org_id
    ORDER BY created_at DESC LIMIT 1;

    -- If both sessions have active orders, merge their items
    IF v_source_order_id IS NOT NULL AND v_target_order_id IS NOT NULL THEN
        -- Move all items from source order to target order
        UPDATE public.order_items 
        SET order_id = v_target_order_id 
        WHERE order_id = v_source_order_id;

        -- Get tax rate for the organization
        SELECT COALESCE(vat_rate, 0.15) INTO v_tax_rate 
        FROM public.company_settings 
        WHERE organization_id = v_org_id 
        LIMIT 1;

        -- Calculate new totals for the target order
        SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_subtotal 
        FROM public.order_items 
        WHERE order_id = v_target_order_id;

        SELECT COALESCE(total_discount, 0) INTO v_total_discount 
        FROM public.orders 
        WHERE id = v_target_order_id;

        v_total_tax := (v_subtotal - v_total_discount) * v_tax_rate;
        IF v_total_tax < 0 THEN
            v_total_tax := 0;
        END IF;

        v_grand_total := v_subtotal - v_total_discount + v_total_tax;

        -- Update target order totals
        UPDATE public.orders 
        SET subtotal = v_subtotal,
            total_tax = v_total_tax,
            grand_total = v_grand_total
        WHERE id = v_target_order_id;

        -- Delete the empty source order
        DELETE FROM public.orders WHERE id = v_source_order_id;

    -- If only source session has an active order, move the entire order to target session
    ELSIF v_source_order_id IS NOT NULL AND v_target_order_id IS NULL THEN
        UPDATE public.orders 
        SET session_id = p_target_session_id 
        WHERE id = v_source_order_id;
    END IF;

    -- Close the source session
    UPDATE public.table_sessions 
    SET status = 'CLOSED', end_time = now() 
    WHERE id = p_source_session_id;

    -- Make the source table AVAILABLE
    UPDATE public.restaurant_tables 
    SET status = 'AVAILABLE' 
    WHERE id = v_source_table_id;

    -- Ensure target table is OCCUPIED
    UPDATE public.restaurant_tables 
    SET status = 'OCCUPIED' 
    WHERE id = v_target_table_id;

    RETURN TRUE;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.transfer_table_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_table_session(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.merge_table_sessions(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_table_sessions(UUID, UUID) TO anon;


-- ==============================================================================
-- TriPro ERP — Butchering & Meat Disassembly Yield Module Migration
-- Migration: 2026-08-27_create_butchering_yield_module.sql
-- Description: إنشاء جداول وقوالب تشفية اللحوم وتفكيك الذبائح والدواجن والأسماك
-- ==============================================================================

-- 1. جدول قوالب التشفية والتشريح القياسية (Butchering Templates)
CREATE TABLE IF NOT EXISTS butchering_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'beef', -- beef, poultry, lamb, fish, other
    source_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    default_expected_yield_pct NUMERIC(6, 2) DEFAULT 95.00, -- نسبة اللحم النافع المعيارية
    default_max_shrinkage_pct NUMERIC(6, 2) DEFAULT 5.00,   -- أقصى نسبة فاقد/هالك مسموح بها
    cost_allocation_method VARCHAR(50) DEFAULT 'relative_value', -- relative_value, by_product_deduction, weight_equal
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول مخرجات القوالب القياسية (Butchering Template Items)
CREATE TABLE IF NOT EXISTS butchering_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES butchering_templates(id) ON DELETE CASCADE,
    output_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    output_name VARCHAR(255) NOT NULL,
    expected_yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00, -- النسبة المتوقعة من إجمالي وزن الذبيحة
    relative_value_weight NUMERIC(6, 2) NOT NULL DEFAULT 1.00, -- معامل القيمة النسبية لتوزيع التكلفة
    is_by_product BOOLEAN DEFAULT FALSE, -- هل هو منتج ثانوي (عظم، دهن، أحشاء)
    standard_unit_price NUMERIC(15, 4) DEFAULT 0.00, -- القيمة التقديرية للوحدة
    notes TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول أوامر وجلسات التشفية الفعلية (Butchering Work Orders)
CREATE TABLE IF NOT EXISTS butchering_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    order_number VARCHAR(100) NOT NULL UNIQUE,
    template_id UUID REFERENCES butchering_templates(id) ON DELETE SET NULL,
    source_product_id UUID NOT NULL REFERENCES products(id),
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    destination_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- الأوزان والتكاليف المدخلة (Input)
    input_weight NUMERIC(12, 3) NOT NULL, -- الوزن الإجمالي للذبيحة أو الدواجن (كجم)
    input_cost_per_kg NUMERIC(15, 4) NOT NULL, -- تكلفة الكيلو وقت الشراء
    total_input_cost NUMERIC(15, 4) NOT NULL, -- إجمالي تكلفة المادة الخام
    additional_labor_cost NUMERIC(15, 4) DEFAULT 0.00, -- مصاريف جزارة وعمالة إضافية
    additional_overhead_cost NUMERIC(15, 4) DEFAULT 0.00, -- مصاريف تشغيل / تبريد / نقل
    total_net_cost NUMERIC(15, 4) NOT NULL, -- إجمالي التكلفة الكلية القابلة للتوزيع
    
    -- نتائج المخرجات والفاقد (Outputs Summary)
    total_output_weight NUMERIC(12, 3) NOT NULL DEFAULT 0.000, -- مجموع أوزان المخرجات الفعلية
    shrinkage_weight NUMERIC(12, 3) NOT NULL DEFAULT 0.000, -- وزن الفاقد / الهالك الفعلي (input - output)
    shrinkage_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00, -- نسبة الفاقد الفعلية
    useful_yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00, -- نسبة الاستخراج النافع الفعلية
    
    -- التكلفة والمحاسبة
    cost_allocation_method VARCHAR(50) DEFAULT 'relative_value',
    status VARCHAR(50) DEFAULT 'completed', -- draft, completed, cancelled
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    
    -- بيانات إدارية
    butcher_name VARCHAR(255), -- اسم الشيف أو الجزار المسؤول
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول بنود ومخرجات أمر التشفية الفعلي (Butchering Order Items)
CREATE TABLE IF NOT EXISTS butchering_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES butchering_orders(id) ON DELETE CASCADE,
    output_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    output_name VARCHAR(255) NOT NULL,
    actual_weight NUMERIC(12, 3) NOT NULL, -- الوزن الفعلي المستخرج (كجم)
    yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00, -- نسبة الاستخراج الفعلية من الذبيحة
    relative_value_weight NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    allocated_cost_per_kg NUMERIC(15, 4) NOT NULL, -- التكلفة المحسوبة بدقة للكيلو الواحد
    total_allocated_cost NUMERIC(15, 4) NOT NULL, -- إجمالي التكلفة المحملة على هذا الصنف
    is_by_product BOOLEAN DEFAULT FALSE,
    standard_expected_weight NUMERIC(12, 3) DEFAULT 0.000, -- الوزن المعياري المتوقع للمقارنة
    variance_weight NUMERIC(12, 3) DEFAULT 0.000, -- فرق الوزن عن المعياري
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- إنشاء الفهارس لتسريع البحث والأداء (Indexes)
CREATE INDEX IF NOT EXISTS idx_butchering_orders_org ON butchering_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_butchering_orders_date ON butchering_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_butchering_orders_status ON butchering_orders(status);
CREATE INDEX IF NOT EXISTS idx_butchering_order_items_order ON butchering_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_butchering_templates_org ON butchering_templates(organization_id);

-- تفعيل سياسات الأمان RLS
ALTER TABLE butchering_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_order_items ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'butchering_templates' AND policyname = 'allow_all_templates') THEN
        CREATE POLICY allow_all_templates ON butchering_templates FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'butchering_template_items' AND policyname = 'allow_all_template_items') THEN
        CREATE POLICY allow_all_template_items ON butchering_template_items FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'butchering_orders' AND policyname = 'allow_all_orders') THEN
        CREATE POLICY allow_all_orders ON butchering_orders FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'butchering_order_items' AND policyname = 'allow_all_order_items') THEN
        CREATE POLICY allow_all_order_items ON butchering_order_items FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;


-- ==============================================================================
-- TriPro ERP — Fix Butchering Module Permissions & Grants
-- Migration: 2026-08-27_fix_butchering_permissions_and_stock.sql
-- Description: منح الصلاحيات الكاملة لجداول التشفية للمستخدمين المصادقين وتحديث السياسات
-- ==============================================================================

-- 1. منح الصلاحيات الكاملة على الجداول للمصادقين والمجهولين (RLS ستتولى التحقق)
GRANT ALL ON TABLE butchering_templates TO authenticated, anon;
GRANT ALL ON TABLE butchering_template_items TO authenticated, anon;
GRANT ALL ON TABLE butchering_orders TO authenticated, anon;
GRANT ALL ON TABLE butchering_order_items TO authenticated, anon;

-- 2. التأكد من تفعيل RLS
ALTER TABLE butchering_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE butchering_order_items ENABLE ROW LEVEL SECURITY;

-- 3. تحديث وتجديد السياسات
DO $$
BEGIN
    DROP POLICY IF EXISTS allow_all_templates ON butchering_templates;
    CREATE POLICY allow_all_templates ON butchering_templates FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS allow_all_template_items ON butchering_template_items;
    CREATE POLICY allow_all_template_items ON butchering_template_items FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS allow_all_orders ON butchering_orders;
    CREATE POLICY allow_all_orders ON butchering_orders FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS allow_all_order_items ON butchering_order_items;
    CREATE POLICY allow_all_order_items ON butchering_order_items FOR ALL USING (true) WITH CHECK (true);
END $$;


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


-- ==============================================================================
-- TriPro ERP — Fix cashier_shifts & petty cash tables permissions and constraints
-- ==============================================================================

DO $$ 
BEGIN
  -- 1. التأكد من وجود جدول cashier_shifts
  CREATE TABLE IF NOT EXISTS public.cashier_shifts (
      id VARCHAR(100) PRIMARY KEY,
      organization_id UUID,
      cashier_id UUID,
      cashier_name VARCHAR(255) NOT NULL,
      opened_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      opening_float NUMERIC(15, 2) DEFAULT 0.00,
      total_cash_sales NUMERIC(15, 2) DEFAULT 0.00,
      total_card_sales NUMERIC(15, 2) DEFAULT 0.00,
      total_petty_cash_payouts NUMERIC(15, 2) DEFAULT 0.00,
      total_cash_in NUMERIC(15, 2) DEFAULT 0.00,
      total_tips_collected NUMERIC(15, 2) DEFAULT 0.00,
      expected_cash_in_drawer NUMERIC(15, 2) DEFAULT 0.00,
      actual_cash_counted NUMERIC(15, 2),
      cash_difference NUMERIC(15, 2),
      cash_breakdown JSONB,
      status VARCHAR(50) DEFAULT 'OPEN',
      closing_notes TEXT,
      adjustment_journal_entry_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- 2. تحويل id إلى VARCHAR(100) إذا كان UUID لدعم كافة المعرفات
  ALTER TABLE public.cashier_shifts ALTER COLUMN id TYPE VARCHAR(100);

  -- 3. إزالة أي قيد أجنبي مقيد على cashier_id
  ALTER TABLE public.cashier_shifts DROP CONSTRAINT IF EXISTS cashier_shifts_cashier_id_fkey;

  -- 4. منح الصلاحيات الكاملة للأدوار
  GRANT ALL ON TABLE public.cashier_shifts TO anon, authenticated, service_role;
  GRANT ALL ON TABLE public.pos_petty_cash_payouts TO anon, authenticated, service_role;

  -- 5. تفعيل RLS وسياسة شاملة
  ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS allow_shifts_all ON public.cashier_shifts;
  CREATE POLICY allow_shifts_all ON public.cashier_shifts FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS allow_payouts_all ON public.pos_petty_cash_payouts;
  CREATE POLICY allow_payouts_all ON public.pos_petty_cash_payouts FOR ALL USING (true) WITH CHECK (true);
END $$;


-- ==============================================================================
-- TriPro ERP — Advanced Restaurant Phase 4 SQL Migration
-- Features: Blind Shifts, Petty Cash, Tips Pooling, Waiter Calls, Multi-Channel Pricing
-- ==============================================================================

-- 1. جدول ورديات الكاشير والجرد الأعمى
CREATE TABLE IF NOT EXISTS cashier_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    cashier_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    cashier_name VARCHAR(255) NOT NULL,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_float NUMERIC(15, 2) DEFAULT 0.00,
    
    -- الأرقام المسجلة على النظام
    total_cash_sales NUMERIC(15, 2) DEFAULT 0.00,
    total_card_sales NUMERIC(15, 2) DEFAULT 0.00,
    total_petty_cash_payouts NUMERIC(15, 2) DEFAULT 0.00,
    total_cash_in NUMERIC(15, 2) DEFAULT 0.00,
    total_tips_collected NUMERIC(15, 2) DEFAULT 0.00,
    expected_cash_in_drawer NUMERIC(15, 2) DEFAULT 0.00,
    
    -- الجرد الأعمى (المدخل الفعلي من الكاشير)
    actual_cash_counted NUMERIC(15, 2),
    cash_difference NUMERIC(15, 2), -- موجب: زيادة / سالب: عجز
    cash_breakdown JSONB, -- فئات النقود (200, 100, 50, 20, 10, 5, فكة)
    
    status VARCHAR(50) DEFAULT 'OPEN', -- 'OPEN', 'BLIND_SUBMITTED', 'CLOSED', 'AUDITED'
    closing_notes TEXT,
    adjustment_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول الصرف النثري وسحب النقدية من الدرج (Petty Cash Payouts)
CREATE TABLE IF NOT EXISTS pos_petty_cash_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    shift_id UUID REFERENCES cashier_shifts(id) ON DELETE CASCADE,
    cashier_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    amount NUMERIC(15, 2) NOT NULL,
    payout_type VARCHAR(50) DEFAULT 'EXPENSE', -- 'EXPENSE', 'SAFE_DROP', 'SUPPLIER_PAYMENT'
    reason VARCHAR(255) NOT NULL,
    expense_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
    receipt_attachment_url TEXT,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول مجمع وتوزيع التبس والإكراميات (Tips Pooling)
CREATE TABLE IF NOT EXISTS tips_distribution_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    shift_id UUID REFERENCES cashier_shifts(id) ON DELETE SET NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_tips_amount NUMERIC(15, 2) NOT NULL,
    floor_staff_share_pct NUMERIC(5, 2) DEFAULT 60.00,
    kitchen_staff_share_pct NUMERIC(5, 2) DEFAULT 40.00,
    distribution_details JSONB, -- [{ employee_id, employee_name, role, points, amount_earned }]
    status VARCHAR(50) DEFAULT 'DISTRIBUTED', -- 'DRAFT', 'DISTRIBUTED', 'PAID_OUT'
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول نداءات الويتر وخدمة الطاولات (Waiter Calls)
CREATE TABLE IF NOT EXISTS waiter_call_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    table_name VARCHAR(100) NOT NULL,
    request_type VARCHAR(50) DEFAULT 'CALL_WAITER', -- 'CALL_WAITER', 'REQUEST_BILL', 'ASSISTANCE', 'CLEANING'
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'ACKNOWLEDGED', 'COMPLETED'
    notes TEXT,
    responded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 5. جدول التسعير المتعدد حسب قنوات البيع (Multi-Channel Pricing)
CREATE TABLE IF NOT EXISTS product_channel_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    channel_code VARCHAR(50) NOT NULL, -- 'DINE_IN', 'TAKEAWAY', 'DELIVERY', 'TALABAT', 'JAHEZ', 'HUNGERSTATION'
    price NUMERIC(15, 2) NOT NULL,
    markup_pct NUMERIC(5, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, channel_code)
);

-- تفعيل RLS
ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_petty_cash_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_distribution_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiter_call_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_channel_prices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cashier_shifts' AND policyname = 'allow_shifts_all') THEN
    CREATE POLICY allow_shifts_all ON cashier_shifts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pos_petty_cash_payouts' AND policyname = 'allow_payouts_all') THEN
    CREATE POLICY allow_payouts_all ON pos_petty_cash_payouts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tips_distribution_records' AND policyname = 'allow_tips_all') THEN
    CREATE POLICY allow_tips_all ON tips_distribution_records FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'waiter_call_requests' AND policyname = 'allow_waiter_calls_all') THEN
    CREATE POLICY allow_waiter_calls_all ON waiter_call_requests FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_channel_prices' AND policyname = 'allow_channel_prices_all') THEN
    CREATE POLICY allow_channel_prices_all ON product_channel_prices FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


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
