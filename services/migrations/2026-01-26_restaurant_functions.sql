-- =================================================================
-- TriPro ERP - Restaurant Module Functions
-- التاريخ: 26 يناير 2026
-- هذا الملف يحتوي على الدوال البرمجية (RPC) الخاصة بوحدة المطاعم
-- =================================================================

-- تأكد من وجود التسلسل
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

-- دالة لإنشاء طلب مطعم متكامل (رأس وتفاصيل وطلبات مطبخ)
-- تضمن هذه الدالة أن جميع العمليات تتم كوحدة واحدة (Transactional)
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid,
    p_user_id uuid,
    p_order_type order_type,
    p_notes text,
    p_items jsonb -- e.g., '[{"product_id": "uuid", "quantity": 2, "unit_price": 15.50, "notes": "extra cheese"}]'
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
    INSERT INTO public.orders (order_number, order_type, session_id, user_id, status, notes, subtotal, total_tax, grand_total)
    VALUES (v_order_number, p_order_type, p_session_id, p_user_id, 'CONFIRMED', p_notes, 0, 0, 0)
    RETURNING id INTO new_order_id;

    -- 3. إضافة بنود الطلب وبنود المطبخ
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- نستخدم product_id و unitPrice ليتطابق مع ما يرسله ال Frontend
        -- ونحاول إضافة modifiers إذا كان العمود موجوداً (يتم التعامل مع الخطأ داخل قاعدة البيانات أو افتراض وجود العمود)
        -- ملاحظة: الكود أدناه يفترض وجود عمود modifiers، إذا لم يكن موجوداً يرجى إضافته للجدول order_items
        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price, total_price, notes, modifiers
        )
        VALUES (
            new_order_id, 
            (item->>'product_id')::uuid, 
            (item->>'quantity')::int, 
            (item->>'unitPrice')::numeric, 
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

    -- 5. إرجاع معرف الطلب الجديد
    RETURN new_order_id;
END;
$$;