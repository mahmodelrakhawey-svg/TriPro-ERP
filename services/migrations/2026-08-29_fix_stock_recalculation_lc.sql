-- 🛠️ Migration: Fix Stock and WAC Recalculation to include Letters of Credit Receipts (lc_receipt_items)
-- Date: 2026-08-29
-- Description: Updates recalculate_stock_rpc and recalculate_product_wac to accurately count imported goods from letters of credit.

-- 1. Update recalculate_stock_rpc
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_final_org uuid;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    
    DROP TABLE IF EXISTS product_summary_temp;
    CREATE TEMP TABLE product_summary_temp AS
    WITH warehouse_movement AS (
        -- تجميع كافة حركات الداخل والخارج في استعلام واحد
        SELECT 
            product_id, 
            warehouse_id, 
            SUM(qty) as net_qty
        FROM (
            -- رصيد افتتاحي (+)
            SELECT oi.product_id, oi.warehouse_id, public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) as qty 
            FROM public.opening_inventories oi JOIN public.products p ON oi.product_id = p.id
            WHERE oi.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL AND (v_final_org IS NULL OR oi.organization_id = v_final_org)
            
            UNION ALL
            -- مشتريات (+)
            SELECT pii.product_id, pi.warehouse_id, public.uom_convert(pii.quantity, pii.uom_id, p.base_uom_id) 
            FROM public.purchase_invoice_items pii 
            JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id 
            JOIN public.products p ON pii.product_id = p.id
            WHERE UPPER(pi.status) NOT IN ('DRAFT', 'CANCELLED') AND pi.warehouse_id IS NOT NULL AND pii.product_id IS NOT NULL AND (v_final_org IS NULL OR pi.organization_id = v_final_org)
            
            UNION ALL
            -- وارد اعتمادات مستندية (+)
            SELECT lcri.product_id, 
                   COALESCE(lcri.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = lcri.organization_id LIMIT 1)) as warehouse_id, 
                   COALESCE(lcri.quantity, 0) as qty
            FROM public.lc_receipt_items lcri
            LEFT JOIN public.letters_of_credit lc ON lcri.lc_id = lc.id
            WHERE (lc.id IS NULL OR UPPER(lc.status) != 'CANCELLED') 
              AND lcri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR lcri.organization_id = v_final_org)
            
            UNION ALL
            -- مبيعات (-) - خصم المنتج التام نفسه (إذا لم يكن له BOM)
            SELECT ii.product_id, i.warehouse_id, -public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id)
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.products p ON ii.product_id = p.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = ii.product_id)
            
            UNION ALL
            -- مبيعات (-) - خصم مكونات BOM للمنتجات التامة المباعة (مع مراعاة وحدات المكونات)
            SELECT bom.raw_material_id, i.warehouse_id, -(public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id
            JOIN public.products p ON ii.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND bom.raw_material_id IS NOT NULL
            
            UNION ALL
            -- مبيعات المطعم (Order Items) (-) - خصم المنتج التام نفسه (إذا لم يكن له BOM)
            SELECT oi.product_id, o.warehouse_id, -public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id)
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.products p ON oi.product_id = p.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR o.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
            
            UNION ALL
            -- مبيعات المطعم (Order Items) (-) - خصم مكونات BOM للمنتجات التامة المباعة
            SELECT bom.raw_material_id, o.warehouse_id, -(public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id
            JOIN public.products p ON oi.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL AND bom.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR o.organization_id = v_final_org)
            
            UNION ALL
            -- تصنيع تام (+) 
            SELECT product_id, warehouse_id, quantity_to_produce FROM public.mfg_production_orders 
            WHERE UPPER(status) = 'COMPLETED' AND warehouse_id IS NOT NULL AND product_id IS NOT NULL AND (v_final_org IS NULL OR organization_id = v_final_org)
            
            UNION ALL
            -- منتجات عرضية من التصنيع (+)
            SELECT 
                bl.product_id, 
                (SELECT warehouse_id FROM public.mfg_production_orders WHERE id = (SELECT production_order_id FROM public.mfg_order_progress WHERE id = bl.order_progress_id)) as warehouse_id, 
                bl.quantity as qty
            FROM public.mfg_byproducts_logs bl
            WHERE (v_final_org IS NULL OR bl.organization_id = v_final_org)
            
            UNION ALL
            -- هالك تصنيع (-)
            SELECT 
                sl.product_id,
                COALESCE(
                    (SELECT po.warehouse_id 
                     FROM public.mfg_order_progress op 
                     JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
                     WHERE op.id = sl.order_progress_id LIMIT 1),
                    (SELECT id FROM public.warehouses WHERE organization_id = v_final_org LIMIT 1)
                ) as warehouse_id,
                -sl.quantity as qty
            FROM public.mfg_scrap_logs sl
            WHERE (v_final_org IS NULL OR sl.organization_id = v_final_org)
            
            UNION ALL
            -- استهلاك خامات (-)
            SELECT amu.raw_material_id, po.warehouse_id, -public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id)
            FROM public.mfg_actual_material_usage amu 
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id 
            JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE po.warehouse_id IS NOT NULL AND amu.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- استهلاك خامات بطلبات صرف (MR) (منضبط بالوحدات)
            SELECT mri.raw_material_id, po.warehouse_id, -public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id)
            FROM public.mfg_material_request_items mri
            JOIN public.products p ON mri.raw_material_id = p.id
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
            JOIN public.mfg_production_orders po ON mr.production_order_id = po.id
            WHERE mr.status = 'issued' AND po.warehouse_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            AND NOT EXISTS (
                SELECT 1 FROM public.mfg_order_progress op_sub
                JOIN public.mfg_actual_material_usage amu_sub ON op_sub.id = amu_sub.order_progress_id
                WHERE op_sub.production_order_id = po.id AND amu_sub.raw_material_id = mri.raw_material_id
            )

            UNION ALL
            -- استهلاك مواد لمشاريع المقاولات (-)
            SELECT pmii.product_id, pmi.warehouse_id, -public.uom_convert(pmii.quantity, pmii.uom_id, p.base_uom_id)
            FROM public.project_material_issue_items pmii
            JOIN public.project_material_issues pmi ON pmii.issue_id = pmi.id
            JOIN public.products p ON pmii.product_id = p.id
            WHERE pmi.status = 'approved' AND (v_final_org IS NULL OR pmi.organization_id = v_final_org)

            UNION ALL
            -- مرتجعات مبيعات (+)
            SELECT sri.product_id, sr.warehouse_id, public.uom_convert(sri.quantity, sri.uom_id, p.base_uom_id)
            FROM public.sales_return_items sri
            JOIN public.sales_returns sr ON sri.sales_return_id = sr.id JOIN public.products p ON sri.product_id = p.id
            WHERE sr.status = 'posted' AND (v_final_org IS NULL OR sr.organization_id = v_final_org)

            UNION ALL
            -- مرتجعات مشتريات (-)
            SELECT pri.product_id, pr.warehouse_id, -public.uom_convert(pri.quantity, pri.uom_id, p.base_uom_id)
            FROM public.purchase_return_items pri
            JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id JOIN public.products p ON pri.product_id = p.id
            WHERE pr.status = 'posted' AND (v_final_org IS NULL OR pr.organization_id = v_final_org)

            UNION ALL
            -- تسويات مخزنية (+/-)
            SELECT sai.product_id, sa.warehouse_id, public.uom_convert(sai.quantity, sai.uom_id, p.base_uom_id)
            FROM public.stock_adjustment_items sai
            JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
            JOIN public.products p ON sai.product_id = p.id
            WHERE sa.status = 'posted' AND (v_final_org IS NULL OR sa.organization_id = v_final_org)

            UNION ALL
            -- تحويلات مخزنية (صادر -)
            SELECT sti.product_id, st.from_warehouse_id, -public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)
            
            UNION ALL
            -- استهلاك المستشفيات (HIMS Consumption) (-)
            SELECT hbi.product_id, hbi.warehouse_id, -public.uom_convert(hbi.quantity, hbi.uom_id, p.base_uom_id)
            FROM public.hims_billing_items hbi
            JOIN public.products p ON hbi.product_id = p.id
            WHERE hbi.product_id IS NOT NULL AND hbi.warehouse_id IS NOT NULL
            AND (v_final_org IS NULL OR hbi.organization_id = v_final_org)

            UNION ALL
            -- تحويلات مخزنية (وارد +)
            SELECT sti.product_id, st.to_warehouse_id, public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)
        ) movements
        WHERE product_id IS NOT NULL AND warehouse_id IS NOT NULL
        AND (p_product_id IS NULL OR product_id = p_product_id)
        GROUP BY product_id, warehouse_id
    )
    SELECT 
        product_id, 
        SUM(net_qty) as total_stock,
        jsonb_object_agg(warehouse_id::text, net_qty) as wh_json
    FROM warehouse_movement
    GROUP BY product_id;

    -- 1. تحديث الأصناف التي لها حركات
    UPDATE public.products p
    SET 
        stock = COALESCE(s.total_stock, 0),
        warehouse_stock = COALESCE(s.wh_json, '{}'::jsonb)
    FROM product_summary_temp s
    WHERE p.id = s.product_id;

    -- 2. تصفير الأصناف التي لا تمتلك حركات
    UPDATE public.products p
    SET stock = 0, warehouse_stock = '{}'::jsonb
    WHERE (v_final_org IS NULL OR p.organization_id = v_final_org)
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND NOT EXISTS (SELECT 1 FROM product_summary_temp s WHERE s.product_id = p.id);
      
    -- نظام التنبيهات اللحظي
    INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
    SELECT prof.id, 'نقص مخزون حرج', format('الصنف %s وصل إلى %s', p.name, p.stock), 'high', p.organization_id, 'low_inventory'
    FROM public.products p
    JOIN public.profiles prof ON p.organization_id = prof.organization_id
    WHERE p.stock <= COALESCE(p.min_stock, 0) AND p.min_stock > 0 AND prof.role IN ('admin', 'manager')
    ON CONFLICT DO NOTHING;

END; $$;

-- 2. Update recalculate_product_wac for LC Items
CREATE OR REPLACE FUNCTION public.recalculate_product_wac(
    p_product_id uuid,
    p_org_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id uuid;
    v_current_stock numeric := 0;
    v_current_wac numeric := 0;
    v_base_uom_id uuid;
    v_rec record;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    SELECT base_uom_id, COALESCE(purchase_price, cost, 0) INTO v_base_uom_id, v_current_wac 
    FROM public.products 
    WHERE id = p_product_id;
    
    DROP TABLE IF EXISTS temp_moves;
    CREATE TEMP TABLE temp_moves (
        move_id uuid,
        tx_table text,
        tx_item_id uuid,
        tx_date timestamp with time zone,
        type text,
        qty numeric,
        unit_price numeric
    );
    
    -- Opening Balance (IN)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT oi.id, 'opening', oi.id, oi.created_at, 'IN', 
           public.uom_convert(oi.quantity, oi.uom_id, v_base_uom_id),
           COALESCE(oi.cost, 0)
    FROM public.opening_inventories oi
    WHERE oi.product_id = p_product_id AND oi.organization_id = v_org_id;

    -- Purchase Invoices (IN)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT pii.id, 'purchase', pii.id, pi.invoice_date::timestamp with time zone, 'IN',
           public.uom_convert(pii.quantity, pii.uom_id, v_base_uom_id),
           CASE WHEN pii.quantity > 0 THEN (pii.unit_price * pii.quantity) / NULLIF(public.uom_convert(pii.quantity, pii.uom_id, v_base_uom_id), 0) ELSE 0 END
    FROM public.purchase_invoice_items pii
    JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id
    WHERE pii.product_id = p_product_id AND pi.status IN ('posted', 'paid') AND pi.organization_id = v_org_id;

    -- Letters of Credit Goods Receipts (IN)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT lcri.id, 'lc_receipt', lcri.id, lcri.receipt_date::timestamp with time zone, 'IN',
           COALESCE(lcri.quantity, 0),
           COALESCE(NULLIF(lcri.final_unit_cost, 0), lcri.unit_price, 0)
    FROM public.lc_receipt_items lcri
    LEFT JOIN public.letters_of_credit lc ON lcri.lc_id = lc.id
    WHERE lcri.product_id = p_product_id 
      AND (lc.id IS NULL OR UPPER(lc.status) != 'CANCELLED')
      AND (v_org_id IS NULL OR lcri.organization_id = v_org_id);

    -- Sales Invoices (OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT ii.id, 'sale', ii.id, i.invoice_date::timestamp with time zone, 'OUT',
           public.uom_convert(ii.quantity, ii.uom_id, v_base_uom_id),
           0
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE ii.product_id = p_product_id AND i.status IN ('posted', 'paid') AND i.organization_id = v_org_id
      AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = ii.product_id);

    -- Sales Invoices BOM (OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT ii.id, 'sale_bom', ii.id, i.invoice_date::timestamp with time zone, 'OUT',
           public.uom_convert(ii.quantity, ii.uom_id, (SELECT base_uom_id FROM public.products WHERE id = ii.product_id)) * bom.quantity_required,
           0
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id
    WHERE bom.raw_material_id = p_product_id AND i.status IN ('posted', 'paid') AND i.organization_id = v_org_id;

    -- Sales Returns (IN)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT sri.id, 'sales_return', sri.id, sr.return_date::timestamp with time zone, 'IN',
           public.uom_convert(sri.quantity, sri.uom_id, v_base_uom_id),
           COALESCE((SELECT cost FROM public.invoice_items WHERE product_id = p_product_id AND invoice_id = sr.original_invoice_id LIMIT 1), v_current_wac)
    FROM public.sales_return_items sri
    JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
    WHERE sri.product_id = p_product_id AND sr.status = 'posted' AND sr.organization_id = v_org_id;

    -- Purchase Returns (OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT pri.id, 'purchase_return', pri.id, pr.return_date::timestamp with time zone, 'OUT',
           public.uom_convert(pri.quantity, pri.uom_id, v_base_uom_id),
           0
    FROM public.purchase_return_items pri
    JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
    WHERE pri.product_id = p_product_id AND pr.status = 'posted' AND pr.organization_id = v_org_id;

    -- Stock Adjustments
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT sai.id, 'adjustment', sai.id, sa.adjustment_date::timestamp with time zone,
           CASE WHEN sai.quantity >= 0 THEN 'IN' ELSE 'OUT' END,
           ABS(public.uom_convert(sai.quantity, sai.uom_id, v_base_uom_id)),
           COALESCE((SELECT purchase_price FROM public.products WHERE id = sai.product_id), 0)
    FROM public.stock_adjustment_items sai
    JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
    WHERE sai.product_id = p_product_id AND sa.status = 'posted' AND sa.organization_id = v_org_id;

    -- Manufacturing Finished Goods (IN)
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

    -- Restaurant Orders (OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT oi.id, 'restaurant', oi.id, o.created_at, 'OUT',
           public.uom_convert(oi.quantity, oi.uom_id, v_base_uom_id),
           0
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    WHERE oi.product_id = p_product_id AND o.status IN ('PAID', 'COMPLETED') AND o.organization_id = v_org_id
      AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id);

    -- Restaurant Orders BOM (OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT oi.id, 'restaurant_bom', oi.id, o.created_at, 'OUT',
           public.uom_convert(oi.quantity, oi.uom_id, (SELECT base_uom_id FROM public.products WHERE id = oi.product_id)) * bom.quantity_required,
           0
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id
    WHERE bom.raw_material_id = p_product_id AND o.status IN ('PAID', 'COMPLETED') AND o.organization_id = v_org_id;

    -- HIMS Consumption (OUT)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT hbi.id, 'hims', hbi.id, hbi.created_at, 'OUT',
           public.uom_convert(hbi.quantity, hbi.uom_id, v_base_uom_id),
           0
    FROM public.hims_billing_items hbi
    WHERE hbi.product_id = p_product_id AND hbi.organization_id = v_org_id;

    -- Process transactions in chronological order
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
        END IF;
    END LOOP;

    -- Update final product WAC
    UPDATE public.products 
    SET weighted_average_cost = ROUND(v_current_wac, 4), 
        cost = ROUND(v_current_wac, 4) 
    WHERE id = p_product_id;

    DROP TABLE IF EXISTS temp_moves;
    RETURN ROUND(v_current_wac, 4);
END;
$$;

-- 3. Run Recalculation for all organizations immediately
DO $$
DECLARE
    v_org record;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        PERFORM public.recalculate_stock_rpc(v_org.id);
    END LOOP;
END $$;
