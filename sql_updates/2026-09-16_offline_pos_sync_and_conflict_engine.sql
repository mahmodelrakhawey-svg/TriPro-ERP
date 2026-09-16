-- ==============================================================================
-- 🛡️ TriPro ERP - محرك مزامنة مبيعات الأوفلاين وفض نزاعات المخزون
-- (Enterprise Offline POS Sync & Conflict Resolution Engine)
-- التاريخ: 2026-09-16
-- الهدف:
--   1. تمكين المزامنة الدفعية الذرية (Atomic Bulk Sync) لطلبات الكاشير ونقاط البيع المنفذة أوفلاين.
--   2. منع تكرار الفواتير عند تكرار المزامنة (Idempotency Key عبر offline_ref_id).
--   3. فض نزاعات المخزون التلقائي (Inventory Conflict Resolution):
--      - بما أن البيع حدث فيزيائياً والعميل استلم السلعة ودفع، لا نوقف المزامنة بسبب نقص الرصيد
--      - يتم خصم الكمية وتسجيل تنبيه عجز وفروقات مخزنية فوري للإدارة.
--   4. ربط المبيعات الأوفلاين بورديات الكاشير ووسائل الدفع لضمان توازن الصندوق 100%.
-- ==============================================================================

-- 1. إضافة أعمدة تتبع الأوفلاين لجدول الطلبات orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS offline_ref_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_offline BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_offline_ref_id 
ON public.orders(offline_ref_id) WHERE offline_ref_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. دالة معالجة ومزامنة طلب كاشير أوفلاين واحد بأمان تام وفض النزاعات
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_offline_pos_order(p_order jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offline_ref_id TEXT;
    v_existing_id UUID;
    v_existing_number TEXT;
    
    v_order_id UUID;
    v_order_number TEXT;
    v_org_id UUID;
    v_user_id UUID;
    v_warehouse_id UUID;
    v_customer_id UUID;
    v_shift_id UUID;
    v_terminal_id UUID;
    v_notes TEXT;
    
    v_items JSONB;
    v_item JSONB;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_uom_id UUID;
    v_cost NUMERIC;
    v_base_qty NUMERIC;
    v_locked_stock NUMERIC;
    v_locked_wh_stock JSONB;
    
    v_subtotal NUMERIC := 0;
    v_total_discount NUMERIC := 0;
    v_tax NUMERIC := 0;
    v_grand_total NUMERIC := 0;
    
    v_payment_method TEXT;
    v_payment_amount NUMERIC;
    v_cash_account_id UUID;
    v_created_at TIMESTAMPTZ;
BEGIN
    -- أ. استخراج البيانات الأساسية من الحمولة
    v_offline_ref_id := NULLIF(TRIM(p_order->>'offline_ref_id'), '');
    IF v_offline_ref_id IS NULL THEN
        v_offline_ref_id := NULLIF(TRIM(p_order->>'id'), '');
    END IF;

    v_org_id := COALESCE((p_order->>'orgId')::uuid, (p_order->>'organization_id')::uuid, (p_order->>'p_org_id')::uuid);
    IF v_org_id IS NULL THEN
        v_org_id := public.get_my_org();
    END IF;

    v_user_id := COALESCE((p_order->>'userId')::uuid, (p_order->>'user_id')::uuid, (p_order->>'p_user_id')::uuid, auth.uid());
    v_warehouse_id := NULLIF(COALESCE(p_order->>'warehouseId', p_order->>'warehouse_id', p_order->>'p_warehouse_id'), '')::uuid;
    IF v_warehouse_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        v_warehouse_id := NULL;
    END IF;
    IF v_warehouse_id IS NULL THEN
        SELECT id INTO v_warehouse_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;
    END IF;

    v_customer_id := NULLIF(COALESCE(p_order->>'customerId', p_order->>'customer_id'), '')::uuid;
    v_shift_id := NULLIF(COALESCE(p_order->>'shift_id', p_order->>'shiftId'), '')::uuid;
    v_terminal_id := NULLIF(COALESCE(p_order->>'terminal_id', p_order->>'terminalId'), '')::uuid;
    v_notes := COALESCE(p_order->>'notes', 'مبيعات كاشير أوفلاين تمت مزامنتها تلقائياً');
    
    v_total_discount := COALESCE((p_order->>'totalDiscount')::numeric, (p_order->>'total_discount')::numeric, 0);
    v_tax := COALESCE((p_order->>'tax')::numeric, (p_order->>'total_tax')::numeric, 0);
    v_payment_method := COALESCE(p_order->>'paymentMethod', p_order->>'payment_method', 'CASH');
    v_payment_amount := COALESCE((p_order->>'paymentAmount')::numeric, (p_order->>'payment_amount')::numeric, (p_order->>'total')::numeric, (p_order->>'grand_total')::numeric, 0);
    v_created_at := COALESCE((p_order->>'createdAt')::timestamptz, (p_order->>'created_at')::timestamptz, now());

    v_items := COALESCE(p_order->'items', p_order->'p_items', '[]'::jsonb);

    -- ب. صمام منع التكرار (Idempotency Guard):
    -- إذا كانت هذه الفاتورة قد تم رفعها مسبقاً بنجاح، لا نكررها أبداً
    IF v_offline_ref_id IS NOT NULL THEN
        SELECT id, order_number INTO v_existing_id, v_existing_number
        FROM public.orders
        WHERE organization_id = v_org_id AND offline_ref_id = v_offline_ref_id
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_synced', true,
                'order_id', v_existing_id,
                'order_number', v_existing_number
            );
        END IF;
    END IF;

    -- ج. توليد رقم الطلب التسلسلي الآمن
    v_order_number := public.get_next_document_number(v_org_id, 'order', 'ORD-');

    -- د. إنشاء رأس الفاتورة/الطلب
    INSERT INTO public.orders (
        order_number,
        order_type,
        status,
        subtotal,
        total_tax,
        grand_total,
        total_discount,
        user_id,
        organization_id,
        customer_id,
        shift_id,
        terminal_id,
        warehouse_id,
        notes,
        offline_ref_id,
        is_offline,
        synced_at,
        created_at
    ) VALUES (
        v_order_number,
        COALESCE(p_order->>'orderType', 'TAKEAWAY'),
        'PAID',
        0, v_tax, 0,
        v_total_discount,
        v_user_id,
        v_org_id,
        v_customer_id,
        v_shift_id,
        v_terminal_id,
        v_warehouse_id,
        v_notes,
        v_offline_ref_id,
        true,
        now(),
        v_created_at
    ) RETURNING id INTO v_order_id;

    -- هـ. إدراج بنود الفاتورة وحل نزاعات المخزون التلقائي
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
        v_prod_id := (v_item->>'product_id')::uuid;
        v_qty := COALESCE((v_item->>'quantity')::numeric, 1);
        v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);
        v_uom_id := NULLIF(v_item->>'uom_id', '')::uuid;

        -- قفل سجل الصنف وتحديثه
        SELECT name, cost, purchase_price, stock, warehouse_stock 
        INTO v_prod_name, v_cost, v_cost, v_locked_stock, v_locked_wh_stock
        FROM public.products 
        WHERE id = v_prod_id 
        FOR UPDATE;

        INSERT INTO public.order_items (
            order_id,
            product_id,
            quantity,
            unit_price,
            unit_cost,
            uom_id,
            organization_id
        ) VALUES (
            v_order_id,
            v_prod_id,
            v_qty,
            v_price,
            COALESCE(v_cost, 0),
            v_uom_id,
            v_org_id
        );

        v_subtotal := v_subtotal + (v_qty * v_price);

        -- حساب الكمية بالوحدة الأساسية
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(v_qty, v_uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_prod_id));
            ELSE
                v_base_qty := v_qty;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_qty;
        END;

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN
            v_base_qty := v_qty;
        END IF;

        -- 🛡️ فض نزاع المخزون (Conflict Resolution Engine):
        -- إذا كان الرصيد غير كافٍ، نقوم بخصم الكمية الفائتة وتسجيل إشعار تنبيه للإدارة
        -- بدلاً من إفشال المزامنة؛ لأن السلعة بيعت بالفعل وسُلّمت للعميل في الواقع!
        IF v_warehouse_id IS NOT NULL THEN
            IF COALESCE((v_locked_wh_stock->>v_warehouse_id::text)::numeric, 0) < v_base_qty THEN
                -- تسجيل إشعار تسوية مخزنية
                BEGIN
                    INSERT INTO public.notifications (
                        organization_id, user_id, title, message, type, priority
                    ) VALUES (
                        v_org_id,
                        v_user_id,
                        '⚠️ تسوية عجز بيع أوفلاين',
                        'تمت مزامنة فاتورة أوفلاين (' || v_order_number || ') للصنف (' || COALESCE(v_prod_name, 'صنف') || ') وتجاوزت الرصيد المتاح بالمستودع بمقدار (' || (v_base_qty - COALESCE((v_locked_wh_stock->>v_warehouse_id::text)::numeric, 0)) || '). تم تعديل الرصيد تلقائياً.',
                        'stock_discrepancy',
                        'medium'
                    );
                EXCEPTION WHEN OTHERS THEN NULL;
                END;
            END IF;

            UPDATE public.products
            SET stock = COALESCE(stock, 0) - v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_warehouse_id::text],
                    to_jsonb(
                        COALESCE((warehouse_stock->>v_warehouse_id::text)::numeric, 0) - v_base_qty
                    )
                )
            WHERE id = v_prod_id;
        ELSE
            IF COALESCE(v_locked_stock, 0) < v_base_qty THEN
                BEGIN
                    INSERT INTO public.notifications (
                        organization_id, user_id, title, message, type, priority
                    ) VALUES (
                        v_org_id,
                        v_user_id,
                        '⚠️ تسوية عجز بيع أوفلاين',
                        'تمت مزامنة فاتورة أوفلاين (' || v_order_number || ') للصنف (' || COALESCE(v_prod_name, 'صنف') || ') وتجاوزت الرصيد المتاح بمقدار (' || (v_base_qty - COALESCE(v_locked_stock, 0)) || '). تم تعديل الرصيد تلقائياً.',
                        'stock_discrepancy',
                        'medium'
                    );
                EXCEPTION WHEN OTHERS THEN NULL;
                END;
            END IF;

            UPDATE public.products
            SET stock = COALESCE(stock, 0) - v_base_qty
            WHERE id = v_prod_id;
        END IF;
    END LOOP;

    -- و. ضبط الحسابات والضرائب والإجمالي النهائي
    v_subtotal := GREATEST(0, v_subtotal - v_total_discount);
    v_grand_total := v_subtotal + v_tax;
    IF v_payment_amount <= 0 THEN
        v_payment_amount := v_grand_total;
    END IF;

    UPDATE public.orders
    SET subtotal = v_subtotal,
        total_tax = v_tax,
        grand_total = v_grand_total
    WHERE id = v_order_id;

    -- ز. حساب خزينة الكاشير الافتراضية
    SELECT cash_account_id INTO v_cash_account_id 
    FROM public.terminals 
    WHERE id = v_terminal_id;

    -- ح. إدراج سجل السداد المالي لضمان مطابقة الوردية
    INSERT INTO public.payments (
        order_id,
        amount,
        payment_method,
        status,
        organization_id,
        cash_account_id
    ) VALUES (
        v_order_id,
        v_payment_amount,
        v_payment_method,
        'COMPLETED',
        v_org_id,
        v_cash_account_id
    );

    -- ط. استهلاك وصفات التصنيع إن وجدت
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mfg_deduct_stock_from_order' AND pronamespace = 'public'::regnamespace) THEN
            PERFORM public.mfg_deduct_stock_from_order(v_order_id);
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'grand_total', v_grand_total
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. دالة المزامنة الدفعية لكافة طلبات الأوفلاين (Atomic Bulk Sync RPC)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_offline_pos_orders_batch(p_orders jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order jsonb;
    v_result jsonb;
    v_results jsonb := '[]'::jsonb;
    v_synced_count INT := 0;
    v_failed_count INT := 0;
BEGIN
    FOR v_order IN SELECT * FROM jsonb_array_elements(p_orders) LOOP
        BEGIN
            v_result := public.sync_offline_pos_order(v_order);
            v_results := v_results || jsonb_build_object(
                'offline_ref_id', COALESCE(v_order->>'offline_ref_id', v_order->>'id'),
                'success', true,
                'order_id', v_result->>'order_id',
                'order_number', v_result->>'order_number',
                'already_synced', COALESCE((v_result->>'already_synced')::boolean, false)
            );
            v_synced_count := v_synced_count + 1;
        EXCEPTION WHEN OTHERS THEN
            v_results := v_results || jsonb_build_object(
                'offline_ref_id', COALESCE(v_order->>'offline_ref_id', v_order->>'id'),
                'success', false,
                'error', SQLERRM
            );
            v_failed_count := v_failed_count + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'total_processed', v_synced_count + v_failed_count,
        'synced_count', v_synced_count,
        'failed_count', v_failed_count,
        'results', v_results
    );
END;
$$;

-- منح الصلاحيات للأدوار الموثقة وسيرفر النظام
GRANT EXECUTE ON FUNCTION public.sync_offline_pos_order(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_offline_pos_orders_batch(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
