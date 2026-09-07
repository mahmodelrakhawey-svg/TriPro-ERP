-- ==============================================================================
-- Migration: Fix order_items notes persistence in create_restaurant_order
-- التاريخ: 2026-08-28
-- الهدف: حفظ حقل الملاحظات (notes) مثل "بدون بصل" في جدول order_items ليظهر للشيف في شاشات وتذاكر المطبخ (KDS)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id    uuid,
    p_user_id       uuid,
    p_order_type    text,
    p_notes         text,
    p_items         jsonb,
    p_customer_id   uuid    DEFAULT NULL,
    p_warehouse_id  uuid    DEFAULT NULL,
    p_delivery_info jsonb   DEFAULT NULL,
    p_org_id        uuid    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order_id          uuid;
    v_item              jsonb;
    v_order_num         text;
    v_tax_rate          numeric := 0.14;
    v_tax_enabled       boolean := true;
    v_service_enabled   boolean := false;
    v_service_rate      numeric := 0.12;
    v_service_charge    numeric := 0;
    v_total_tax         numeric := 0;
    v_subtotal          numeric := 0;
    v_final_wh_id       uuid;
    v_org_id            uuid;
    v_order_item_id     uuid;
    v_delivery_fee      numeric := 0;
    v_item_cost         numeric;
    v_active_shift_id   uuid;
BEGIN
    v_org_id      := COALESCE(p_org_id, public.get_my_org());
    v_final_wh_id := COALESCE(p_warehouse_id,
                        (SELECT default_warehouse_id FROM public.company_settings
                         WHERE organization_id = v_org_id LIMIT 1));

    SELECT 
        COALESCE(vat_rate, 0.14), 
        COALESCE(enable_tax, true),
        COALESCE(enable_service_charge, (account_mappings->>'enable_service_charge')::boolean, false),
        COALESCE(service_charge_rate, (account_mappings->>'service_charge_rate')::numeric, 0.12)
    INTO   
        v_tax_rate, 
        v_tax_enabled,
        v_service_enabled,
        v_service_rate
    FROM   public.company_settings
    WHERE  organization_id = v_org_id;

    IF NOT v_tax_enabled THEN
        v_tax_rate := 0;
    END IF;

    IF NOT v_service_enabled THEN
        v_service_rate := 0;
    END IF;

    IF p_user_id IS NOT NULL THEN
        SELECT id INTO v_active_shift_id
        FROM   public.shifts
        WHERE  user_id         = p_user_id
          AND  end_time        IS NULL
          AND  organization_id = v_org_id
        ORDER  BY start_time DESC
        LIMIT  1;
    END IF;

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-'
                   || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (
        session_id, user_id, order_type, notes, status,
        customer_id, order_number, organization_id, warehouse_id, shift_id
    )
    VALUES (
        p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED',
        p_customer_id, v_order_num, v_org_id, v_final_wh_id, v_active_shift_id
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0), base_uom_id
        INTO   v_item_cost, v_final_wh_id
        FROM   public.products
        WHERE  id = (v_item->>'product_id')::uuid;

        -- 🚀 تضمين حقل notes صراحة لضمان ظهوره في KDS المطبخ وطابعات الأقسام
        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price, unit_cost,
            notes, organization_id, modifiers, uom_id
        )
        VALUES (
            v_order_id,
            (v_item->>'product_id')::uuid,
            (v_item->>'quantity')::numeric,
            (v_item->>'unit_price')::numeric,
            v_item_cost,
            NULLIF(TRIM(COALESCE(v_item->>'notes', '')), ''),
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb),
            (v_item->>'uom_id')::uuid
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal
                      + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);

        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id)
        VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    IF p_delivery_info IS NOT NULL THEN
        v_delivery_fee := COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0);
        INSERT INTO public.delivery_orders (
            order_id, customer_name, customer_phone,
            delivery_address, delivery_fee, organization_id
        )
        VALUES (
            v_order_id,
            p_delivery_info->>'customer_name',
            p_delivery_info->>'customer_phone',
            p_delivery_info->>'delivery_address',
            v_delivery_fee,
            v_org_id
        );
    END IF;

    -- حساب الخدمة والضريبة والإجمالي بدقة
    v_service_charge := v_subtotal * COALESCE(v_service_rate, 0);
    v_total_tax      := (v_subtotal + v_service_charge) * COALESCE(v_tax_rate, 0);

    UPDATE public.orders SET
        subtotal       = v_subtotal,
        service_charge = v_service_charge,
        delivery_fee   = v_delivery_fee,
        total_tax      = v_total_tax,
        grand_total    = v_subtotal + v_service_charge + v_total_tax + v_delivery_fee
    WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_restaurant_order(uuid, uuid, text, text, jsonb, uuid, uuid, jsonb, uuid) TO authenticated, anon;

SELECT '✅ تم تحديث دالة create_restaurant_order لحفظ ملاحظات الأطباق (Notes) للمطبخ بنجاح' as status;
