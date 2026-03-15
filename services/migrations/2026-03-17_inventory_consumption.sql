-- =================================================================
-- TriPro ERP - Phase 1: Inventory & Cost Integration
-- التاريخ: 17 مارس 2026
-- الوصف: دالة الخصم المخزني التلقائي عند بيع الوجبات
-- =================================================================

-- 1. التأكد من وجود عمود للمستودع في جدول الطلبات (لنعرف من أين نخصم)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id);

-- 2. دالة استهلاك المخزون (The Core Function)
CREATE OR REPLACE FUNCTION public.consume_inventory_for_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_order_item RECORD;
    v_component RECORD;
    v_warehouse_id UUID;
    v_qty_to_deduct NUMERIC;
    v_product_type TEXT;
BEGIN
    -- أ. تحديد المستودع (نستخدم المستودع المربوط بالطلب، أو المستودع الرئيسي كاحتياطي)
    SELECT warehouse_id INTO v_warehouse_id FROM public.orders WHERE id = p_order_id;
    
    IF v_warehouse_id IS NULL THEN
        -- احتياطي: محاولة جلب أول مستودع معرف في النظام
        SELECT id INTO v_warehouse_id FROM public.warehouses LIMIT 1;
    END IF;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No warehouse found to deduct inventory from for Order %', p_order_id;
    END IF;

    -- ب. المرور على جميع بنود الطلب
    FOR v_order_item IN 
        SELECT id, product_id, quantity 
        FROM public.order_items 
        WHERE order_id = p_order_id
    LOOP
        -- التحقق من نوع المنتج
        SELECT product_type INTO v_product_type FROM public.products WHERE id = v_order_item.product_id;

        -- الحالة 1: المنتج له مكونات (وجبة / MANUFACTURED)
        -- نبحث في جدول bill_of_materials
        FOR v_component IN
            SELECT raw_material_id, quantity_required
            FROM public.bill_of_materials
            WHERE product_id = v_order_item.product_id
        LOOP
            -- حساب الكمية المطلوبة: كمية الوصفة * كمية الطلب
            v_qty_to_deduct := v_component.quantity_required * v_order_item.quantity;

            -- 1. تحديث رصيد الصنف الخام
            UPDATE public.products
            SET 
                stock = stock - v_qty_to_deduct,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb), 
                    ARRAY[v_warehouse_id::text], 
                    (COALESCE((warehouse_stock->>v_warehouse_id::text)::numeric, 0) - v_qty_to_deduct)::text::jsonb
                )
            WHERE id = v_component.raw_material_id;

            -- 2. تسجيل حركة مخزنية
            INSERT INTO public.inventory_transactions (
                ingredient_id, 
                order_item_id, 
                transaction_type, 
                quantity_change, 
                notes
            )
            VALUES (
                v_component.raw_material_id, 
                v_order_item.id,
                'SALE', 
                -v_qty_to_deduct, 
                'استهلاك تلقائي للطلب: ' || p_order_id
            );
        END LOOP;
        
        -- الحالة 2: المنتج مخزني مباشر (STOCK) وليس له وصفة (مثلاً: علبة بيبسي، مياه)
        -- نخصم المنتج نفسه
        IF NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = v_order_item.product_id) 
           AND (v_product_type = 'STOCK' OR v_product_type = 'RAW_MATERIAL') THEN
             
            v_qty_to_deduct := v_order_item.quantity;
            
            UPDATE public.products
            SET 
                stock = stock - v_qty_to_deduct,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb), 
                    ARRAY[v_warehouse_id::text], 
                    (COALESCE((warehouse_stock->>v_warehouse_id::text)::numeric, 0) - v_qty_to_deduct)::text::jsonb
                )
            WHERE id = v_order_item.product_id;
            
            -- تسجيل الحركة لنفس الصنف
            INSERT INTO public.inventory_transactions (ingredient_id, order_item_id, transaction_type, quantity_change, notes)
            VALUES (v_order_item.product_id, v_order_item.id, 'SALE', -v_qty_to_deduct, 'بيع مباشر للطلب: ' || p_order_id);
        END IF;

    END LOOP;
END;
$$;

-- 3. Trigger لتنفيذ الدالة عند اكتمال الطلب
CREATE OR REPLACE FUNCTION public.trigger_consume_inventory()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'COMPLETED' AND OLD.status <> 'COMPLETED' THEN
        PERFORM public.consume_inventory_for_order(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_completed_inventory ON public.orders;
CREATE TRIGGER trg_order_completed_inventory
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_consume_inventory();