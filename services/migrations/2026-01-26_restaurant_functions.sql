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

-- دالة لإنشاء طلب مطعم متكامل (رأس وتفاصيل وطلبات مطبخ)
-- تضمن هذه الدالة أن جميع العمليات تتم كوحدة واحدة (Transactional)
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
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
    SELECT (vat_rate) INTO v_tax_rate FROM public.company_settings LIMIT 1;
    IF v_tax_rate IS NULL THEN
        v_tax_rate := 0.15; -- قيمة افتراضية إذا لم تكن محددة
    END IF;

    -- توليد رقم الطلب يدوياً لضمان عدم الاعتماد على القيمة الافتراضية للجدول التي قد تكون مفقودة
    v_order_number := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || nextval('public.order_number_seq');

    -- 2. إنشاء رأس الطلب الرئيسي
    INSERT INTO public.orders (order_number, order_type, session_id, user_id, customer_id, status, notes, subtotal, total_tax, grand_total)
    VALUES (v_order_number, p_order_type, p_session_id, p_user_id, p_customer_id, 'CONFIRMED', p_notes, 0, 0, 0)
    RETURNING id INTO new_order_id;

    -- 3. إضافة بنود الطلب وبنود المطبخ
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- نستخدم product_id, unitPrice, unitCost ليتطابق مع ما يرسله ال Frontend
        -- ونحاول إضافة modifiers إذا كان العمود موجوداً (يتم التعامل مع الخطأ داخل قاعدة البيانات أو افتراض وجود العمود)
        -- ملاحظة: الكود أدناه يفترض وجود عمود modifiers، إذا لم يكن موجوداً يرجى إضافته للجدول order_items
        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price, unit_cost, total_price, notes, modifiers
        )
        VALUES (
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

        INSERT INTO public.kitchen_orders (order_item_id, status)
        VALUES (new_order_item_id, 'NEW');
    END LOOP;

    -- 4. إعادة حساب الإجماليات وتحديث الطلب الرئيسي
    SELECT COALESCE(SUM(total_price), 0) INTO v_subtotal FROM public.order_items WHERE order_id = new_order_id;
    v_total_tax := v_subtotal * v_tax_rate;
    v_grand_total := v_subtotal + v_total_tax;

    UPDATE public.orders SET subtotal = v_subtotal, total_tax = v_total_tax, grand_total = v_grand_total, updated_at = now()
    WHERE id = new_order_id;

    -- 5. إذا كان الطلب توصيل، يتم إدراج البيانات في جدول التوصيل
    IF p_order_type = 'DELIVERY' AND p_delivery_info IS NOT NULL THEN
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee)
        VALUES (
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
DROP FUNCTION IF EXISTS public.get_pending_payment_orders();

CREATE OR REPLACE FUNCTION public.get_pending_payment_orders()
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
    WHERE o.status::text = 'CONFIRMED' 
    AND (o.session_id IS NULL OR o.order_type::text != 'DINE_IN')
    ORDER BY o.created_at DESC;
$$;