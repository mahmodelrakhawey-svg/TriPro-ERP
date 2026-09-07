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
