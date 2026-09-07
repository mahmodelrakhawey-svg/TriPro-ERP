-- Migration: Fix create_restaurant_order to respect enable_tax setting
-- Created At: 2026-07-03

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_order_id uuid; v_item jsonb; v_order_num text; v_tax_rate numeric; 
    v_tax_enabled boolean; -- 🛡️ للتحقق من تفعيل الضريبة في إعدادات الشركة
    v_subtotal numeric := 0; v_final_wh_id uuid; v_org_id uuid; v_order_item_id uuid; v_delivery_fee numeric := 0; v_item_cost numeric;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    v_final_wh_id := COALESCE(p_warehouse_id, (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1));
    
    -- جلب معدل الضريبة وحالة التفعيل من إعدادات الشركة
    SELECT vat_rate, COALESCE(enable_tax, true) INTO v_tax_rate, v_tax_enabled 
    FROM public.company_settings WHERE organization_id = v_org_id;
    
    IF NOT v_tax_enabled THEN
        v_tax_rate := 0;
    END IF;

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, v_final_wh_id) 
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🚀 جلب التكلفة اللحظية للصنف لضمان دقة تقرير COGS لاحقاً
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0), base_uom_id INTO v_item_cost, v_final_wh_id -- نستخدم v_final_wh_id مؤقتاً لتخزين معرف الوحدة الأساسية
        FROM public.products WHERE id = (v_item->>'product_id')::uuid;

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, unit_cost, organization_id, modifiers, uom_id)
        VALUES (
            v_order_id, 
            (v_item->>'product_id')::uuid, 
            (v_item->>'quantity')::numeric, 
            (v_item->>'unit_price')::numeric,
            v_item_cost,
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb),
            (v_item->>'uom_id')::uuid
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
        
        -- إرسال للمطبخ فوراً 👨‍🍳
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    IF p_delivery_info IS NOT NULL THEN
        v_delivery_fee := COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0);
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', v_delivery_fee, v_org_id);
    END IF;

    -- 🚀 تحديث الإجماليات بدقة لتشمل الضريبة ورسوم التوصيل
    UPDATE public.orders SET 
        subtotal = v_subtotal, 
        delivery_fee = v_delivery_fee,
        total_tax = v_subtotal * COALESCE(v_tax_rate, 0.14), 
        grand_total = (v_subtotal * (1 + COALESCE(v_tax_rate, 0.14))) + v_delivery_fee 
    WHERE id = v_order_id;

    RETURN v_order_id;
END; $$;
