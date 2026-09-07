-- ====================================================================
-- Migration: Fix WAC Recalculation Engine & Add unit_cost to hims_billing_items
-- Date: 2026-08-17
-- Description: Adds unit_cost column to hims_billing_items & order_items,
-- and updates recalculate_product_wac and recalculate_all_products_wac.
-- ====================================================================

-- 1. التأكد من وجود أعمدة التكلفة في جداول الصرف الفرعية
ALTER TABLE public.hims_billing_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0;

-- 2. تنظيف وتحديث دوال إعادة احتساب متوسط التكلفة المرجح (WAC)
DROP FUNCTION IF EXISTS public.recalculate_all_products_wac(uuid);
DROP FUNCTION IF EXISTS public.recalculate_all_products_wac();
DROP FUNCTION IF EXISTS public.recalculate_product_wac(uuid, uuid);
DROP FUNCTION IF EXISTS public.recalculate_product_wac(uuid);

-- 3. دالة احتساب WAC لمنتج فردي
CREATE OR REPLACE FUNCTION public.recalculate_product_wac(
    p_product_id uuid,
    p_org_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_org_id uuid;
    v_current_stock numeric := 0;
    v_current_wac numeric := 0;
    v_base_uom_id uuid;
    v_rec record;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    -- جلب وحدة القياس الأساسية والتكلفة الافتراضية للمنتج
    SELECT base_uom_id, COALESCE(purchase_price, cost, 0) INTO v_base_uom_id, v_current_wac 
    FROM public.products 
    WHERE id = p_product_id;
    
    -- إنشاء جدول الحركات المؤقت بترتيب زمني دقيق
    DROP TABLE IF EXISTS temp_moves;
    CREATE TEMP TABLE temp_moves (
        move_id uuid,
        tx_table text,
        tx_item_id uuid,
        tx_date timestamp with time zone,
        type text, -- 'IN' or 'OUT'
        qty numeric, -- always in base UOM
        unit_price numeric -- unit price in base UOM
    );
    
    -- 2.1 رصيد أول المدة (IN)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT oi.id, 'opening', oi.id, oi.created_at, 'IN', 
           public.uom_convert(oi.quantity, oi.uom_id, v_base_uom_id),
           COALESCE(oi.cost, 0)
    FROM public.opening_inventories oi
    WHERE oi.product_id = p_product_id AND oi.organization_id = v_org_id;

    -- 2.2 فواتير المشتريات (IN)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT pii.id, 'purchase', pii.id, pi.invoice_date::timestamp with time zone, 'IN',
           public.uom_convert(pii.quantity, pii.uom_id, v_base_uom_id),
           CASE WHEN pii.quantity > 0 THEN (pii.unit_price * pii.quantity) / NULLIF(public.uom_convert(pii.quantity, pii.uom_id, v_base_uom_id), 0) ELSE 0 END
    FROM public.purchase_invoice_items pii
    JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id
    WHERE pii.product_id = p_product_id AND pi.status IN ('posted', 'paid') AND pi.organization_id = v_org_id;

    -- 2.3 فواتير المبيعات المباشرة (OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT ii.id, 'sale', ii.id, i.invoice_date::timestamp with time zone, 'OUT',
           public.uom_convert(ii.quantity, ii.uom_id, v_base_uom_id),
           0
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE ii.product_id = p_product_id AND i.status IN ('posted', 'paid') AND i.organization_id = v_org_id
      AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = ii.product_id);

    -- 2.3b مكونات فواتير المبيعات (خامات التصنيع المباشر) (OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT ii.id, 'sale_bom', ii.id, i.invoice_date::timestamp with time zone, 'OUT',
           public.uom_convert(ii.quantity, ii.uom_id, (SELECT base_uom_id FROM public.products WHERE id = ii.product_id)) * bom.quantity_required,
           0
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id
    WHERE bom.raw_material_id = p_product_id AND i.status IN ('posted', 'paid') AND i.organization_id = v_org_id;

    -- 2.4 مرتجعات المبيعات (IN)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT sri.id, 'sales_return', sri.id, sr.return_date::timestamp with time zone, 'IN',
           public.uom_convert(sri.quantity, sri.uom_id, v_base_uom_id),
           COALESCE((SELECT cost FROM public.invoice_items WHERE product_id = p_product_id AND invoice_id = sr.original_invoice_id LIMIT 1), v_current_wac)
    FROM public.sales_return_items sri
    JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
    WHERE sri.product_id = p_product_id AND sr.status = 'posted' AND sr.organization_id = v_org_id;

    -- 2.5 مرتجعات المشتريات (OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT pri.id, 'purchase_return', pri.id, pr.return_date::timestamp with time zone, 'OUT',
           public.uom_convert(pri.quantity, pri.uom_id, v_base_uom_id),
           0
    FROM public.purchase_return_items pri
    JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
    WHERE pri.product_id = p_product_id AND pr.status = 'posted' AND pr.organization_id = v_org_id;

    -- 2.6 تسويات المخزون (IN or OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT sai.id, 'adjustment', sai.id, sa.adjustment_date::timestamp with time zone,
           CASE WHEN sai.quantity >= 0 THEN 'IN' ELSE 'OUT' END,
           ABS(public.uom_convert(sai.quantity, sai.uom_id, v_base_uom_id)),
           COALESCE((SELECT purchase_price FROM public.products WHERE id = sai.product_id), 0)
    FROM public.stock_adjustment_items sai
    JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
    WHERE sai.product_id = p_product_id AND sa.status = 'posted' AND sa.organization_id = v_org_id;

    -- 2.7 إنتاج التصنيع (المنتج التام) (IN)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_production_orders') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT po.id, 'manufacturing_fg', po.id, po.end_date::timestamp with time zone, 'IN',
               po.quantity_to_produce,
               COALESCE(
                   (SELECT total_actual_cost / NULLIF(qty, 0) FROM public.v_mfg_order_profitability WHERE order_id = po.id),
                   (SELECT estimated_cost / NULLIF(qty, 0) FROM public.v_mfg_order_profitability WHERE order_id = po.id),
                   0
               )
        FROM public.mfg_production_orders po
        WHERE po.product_id = p_product_id AND po.status = 'completed' AND po.organization_id = v_org_id;
    END IF;

    -- 2.8 استهلاك خامات التصنيع (OUT)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_actual_material_usage') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT amu.id, 'manufacturing_raw', amu.id, amu.created_at, 'OUT',
               public.uom_convert(amu.actual_quantity, amu.uom_id, v_base_uom_id),
               0
        FROM public.mfg_actual_material_usage amu
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        JOIN public.mfg_production_orders po ON op.production_order_id = po.id
        WHERE amu.raw_material_id = p_product_id AND po.status = 'completed' AND amu.organization_id = v_org_id;
    END IF;

    -- 2.9 مبيعات المطاعم والكافيهات (OUT)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT oi.id, 'restaurant', oi.id, o.created_at, 'OUT',
               public.uom_convert(oi.quantity, oi.uom_id, v_base_uom_id),
               0
        FROM public.order_items oi
        JOIN public.orders o ON oi.order_id = o.id
        WHERE oi.product_id = p_product_id AND o.status IN ('PAID', 'COMPLETED') AND o.organization_id = v_org_id
          AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id);

        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT oi.id, 'restaurant_bom', oi.id, o.created_at, 'OUT',
               public.uom_convert(oi.quantity, oi.uom_id, (SELECT base_uom_id FROM public.products WHERE id = oi.product_id)) * bom.quantity_required,
               0
        FROM public.order_items oi
        JOIN public.orders o ON oi.order_id = o.id
        JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id
        WHERE bom.raw_material_id = p_product_id AND o.status IN ('PAID', 'COMPLETED') AND o.organization_id = v_org_id;
    END IF;

    -- 2.10 استهلاك وصرف المستلزمات الطبية HIMS (OUT)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hims_billing_items') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT hbi.id, 'hims', hbi.id, hbi.created_at, 'OUT',
               public.uom_convert(hbi.quantity, hbi.uom_id, v_base_uom_id),
               0
        FROM public.hims_billing_items hbi
        WHERE hbi.product_id = p_product_id AND hbi.organization_id = v_org_id;
    END IF;

    -- 3. معالجة الحركات تتابعياً لحساب متوسط التكلفة بدقة
    FOR v_rec IN SELECT * FROM temp_moves ORDER BY tx_date ASC, type DESC LOOP
        IF v_rec.type = 'IN' THEN
            IF (v_current_stock + v_rec.qty) > 0 THEN
                v_current_wac := ((v_current_stock * v_current_wac) + (v_rec.qty * v_rec.unit_price)) / (v_current_stock + v_rec.qty);
            ELSE
                v_current_wac := v_rec.unit_price;
            END IF;
            v_current_stock := v_current_stock + v_rec.qty;
        ELSE
            v_current_stock := v_current_stock - v_rec.qty;
            
            -- تحديث التكلفة في جداول الحركات الفرعية
            IF v_rec.tx_table = 'sale' OR v_rec.tx_table = 'sale_bom' THEN
                UPDATE public.invoice_items SET cost = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            ELSIF v_rec.tx_table = 'restaurant' OR v_rec.tx_table = 'restaurant_bom' THEN
                UPDATE public.order_items SET unit_cost = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            ELSIF v_rec.tx_table = 'purchase_return' THEN
                UPDATE public.purchase_return_items SET unit_price = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            ELSIF v_rec.tx_table = 'hims' THEN
                UPDATE public.hims_billing_items SET unit_cost = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            END IF;
        END IF;
    END LOOP;

    -- تحديث التكلفة النهائية للمنتج
    UPDATE public.products 
    SET weighted_average_cost = ROUND(v_current_wac, 4), 
        cost = ROUND(v_current_wac, 4) 
    WHERE id = p_product_id;

    DROP TABLE IF EXISTS temp_moves;
    RETURN ROUND(v_current_wac, 4);
END;
$$;

-- 4. دالة إعادة احتساب كافة منتجات المنظمة
CREATE OR REPLACE FUNCTION public.recalculate_all_products_wac(
    p_org_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_prod record;
BEGIN
    FOR v_prod IN SELECT id FROM public.products WHERE organization_id = p_org_id LOOP
        PERFORM public.recalculate_product_wac(v_prod.id, p_org_id);
    END LOOP;
END;
$$;

-- 5. دوال بدون بارامترات للاستدعاء السهل من الواجهات الأمامية (Frontend RPC)
CREATE OR REPLACE FUNCTION public.recalculate_all_products_wac()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    IF v_org_id IS NOT NULL THEN
        PERFORM public.recalculate_all_products_wac(v_org_id);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_product_wac(p_product_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    RETURN public.recalculate_product_wac(p_product_id, v_org_id);
END;
$$;

-- 6. منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.recalculate_product_wac(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_product_wac(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_products_wac(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_products_wac() TO authenticated, anon;
