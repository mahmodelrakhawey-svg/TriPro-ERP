-- ==============================================================================
-- TriPro-ERP: تحديث جذري وآمن لتوحيد محرك احتساب المخزون (Stock & Cost Reconcile)
-- التاريخ: 28 أكتوبر 2026
-- الهدف:
--   1. توحيد رصيد المخزون بين كارت الصنف (حركة المخزون) وشاشة الأصناف وتقارير المخازن
--   2. تصحيح استبعاد فواتير المبيعات للأصناف المصنعة (MANUFACTURED) التي لها مسارات ووصفات تصنيع (BOM)
--   3. الحفاظ الكامل على أمان بيانات شركة لينزا وجميع الفواتير وأوامر الإنتاج دون أي حذف
--   4. دعم العمل في مرحلة وضع المسارات والبيع بالسالب دون أي تعارض
-- ==============================================================================

BEGIN;

-- 🛡️ 1. تحديث دالة إعادة احتساب المخزون المركزية (recalculate_stock_rpc)
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(
    p_org_id uuid DEFAULT NULL, 
    p_product_id uuid DEFAULT NULL
)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET statement_timeout = '120s'
SET search_path = public, pg_temp
AS $$
DECLARE
    v_final_org uuid;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    
    -- جدول مؤقت لحساب صافي حركات المخزون بدقة متناهية
    DROP TABLE IF EXISTS product_summary_temp;
    CREATE TEMP TABLE product_summary_temp AS
    WITH warehouse_movement AS (
        SELECT 
            product_id, 
            warehouse_id, 
            SUM(qty) as net_qty
        FROM (
            -- 1. رصيد أول المدة (+)
            SELECT oi.product_id, oi.warehouse_id, public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) as qty 
            FROM public.opening_inventories oi 
            JOIN public.products p ON oi.product_id = p.id
            WHERE oi.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR oi.organization_id = v_final_org)
            
            UNION ALL
            -- 2. فواتير المشتريات المعتمدة (+)
            SELECT pii.product_id, pi.warehouse_id, public.uom_convert(pii.quantity, pii.uom_id, p.base_uom_id) as qty
            FROM public.purchase_invoice_items pii 
            JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id 
            JOIN public.products p ON pii.product_id = p.id
            WHERE UPPER(pi.status) NOT IN ('DRAFT', 'CANCELLED') 
              AND pi.warehouse_id IS NOT NULL AND pii.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR pi.organization_id = v_final_org)
            
            UNION ALL
            -- 3. وارد اعتمادات مستندية (+)
            SELECT lcri.product_id, 
                   COALESCE(lcri.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = lcri.organization_id AND deleted_at IS NULL LIMIT 1)) as warehouse_id, 
                   COALESCE(lcri.quantity, 0) as qty
            FROM public.lc_receipt_items lcri
            LEFT JOIN public.letters_of_credit lc ON lcri.lc_id = lc.id
            WHERE (lc.id IS NULL OR UPPER(lc.status) != 'CANCELLED') 
              AND lcri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR lcri.organization_id = v_final_org)
            
            UNION ALL
            -- 4. فواتير المبيعات المعتمدة (-)
            -- 🚀 خصم الصنف المباع نفسه من المستودع مباشرة (لجميع الأصناف المصنعة والمخزنية دون استثناء)
            SELECT ii.product_id, i.warehouse_id, -public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id) as qty
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.products p ON ii.product_id = p.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
            
            UNION ALL
            -- 5. مبيعات المطاعم ونقاط البيع (Order Items) (-)
            -- للأصناف المصنعة أو الأصناف التي ليس لها BOM: خصم المنتج التام نفسه
            SELECT oi.product_id, o.warehouse_id, -public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) as qty
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.products p ON oi.product_id = p.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') 
              AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR o.organization_id = v_final_org)
              AND (
                  p.product_type = 'MANUFACTURED' 
                  OR COALESCE(p.item_type, '') = 'MANUFACTURED' 
                  OR COALESCE(p.mfg_type, '') = 'standard'
                  OR NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
              )
            
            UNION ALL
            -- 5b. مبيعات المطاعم (Order Items) للوجبات والمشروبات الفورية فقط (غير المصنعة مسبقاً): خصم مكونات الـ BOM
            SELECT bom.raw_material_id, o.warehouse_id, -(public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) as qty
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id
            JOIN public.products p ON oi.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') 
              AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR o.organization_id = v_final_org)
              AND bom.raw_material_id IS NOT NULL
              AND p.product_type NOT IN ('MANUFACTURED')
              AND COALESCE(p.item_type, '') NOT IN ('MANUFACTURED')
              AND COALESCE(p.mfg_type, '') NOT IN ('standard')
            
            UNION ALL
            -- 6. أوامر الإنتاج التامة المكتملة (+) 
            SELECT po.product_id, 
                   COALESCE(po.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)) as warehouse_id, 
                   po.quantity_to_produce as qty
            FROM public.mfg_production_orders po
            WHERE UPPER(po.status) = 'COMPLETED' AND po.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- 7. منتجات عرضية من التصنيع (+)
            SELECT 
                bl.product_id, 
                COALESCE(
                    bl.warehouse_id,
                    (SELECT po.warehouse_id 
                     FROM public.mfg_order_progress op 
                     JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
                     WHERE op.id = bl.order_progress_id LIMIT 1),
                    (SELECT id FROM public.warehouses 
                     WHERE organization_id = COALESCE(v_final_org, bl.organization_id) AND deleted_at IS NULL 
                     ORDER BY created_at ASC LIMIT 1)
                ) as warehouse_id, 
                bl.quantity as qty
            FROM public.mfg_byproducts_logs bl
            WHERE (v_final_org IS NULL OR bl.organization_id = v_final_org OR bl.organization_id IS NULL)
            
            UNION ALL
            -- 8. هالك تصنيع (-)
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
            -- 9. استهلاك خامات التصنيع الفعلي (-)
            SELECT amu.raw_material_id, 
                   COALESCE(po.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id LIMIT 1)) as warehouse_id, 
                   -public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) as qty
            FROM public.mfg_actual_material_usage amu 
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id 
            JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE amu.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- 10. استهلاك خامات بطلبات صرف (MR) غير مسجلة كاستهلاك فعلي بعد (-)
            SELECT mri.raw_material_id, 
                   po.warehouse_id, 
                   -public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id) as qty
            FROM public.mfg_material_request_items mri
            JOIN public.products p ON mri.raw_material_id = p.id
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
            JOIN public.mfg_production_orders po ON mr.production_order_id = po.id
            WHERE mr.status = 'issued' AND po.warehouse_id IS NOT NULL 
              AND (v_final_org IS NULL OR po.organization_id = v_final_org)
              AND NOT EXISTS (
                  SELECT 1 FROM public.mfg_order_progress op_sub
                  JOIN public.mfg_actual_material_usage amu_sub ON op_sub.id = amu_sub.order_progress_id
                  WHERE op_sub.production_order_id = po.id AND amu_sub.raw_material_id = mri.raw_material_id
              )

            UNION ALL
            -- 11. تسويات مخزنية (+/-)
            SELECT sai.product_id, sa.warehouse_id, public.uom_convert(sai.quantity, sai.uom_id, p.base_uom_id) as qty
            FROM public.stock_adjustment_items sai
            JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
            JOIN public.products p ON sai.product_id = p.id
            WHERE sa.status = 'posted' AND (v_final_org IS NULL OR sa.organization_id = v_final_org)

            UNION ALL
            -- 12. تحويلات مخزنية (صادر -)
            SELECT sti.product_id, st.from_warehouse_id as warehouse_id, -public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id) as qty
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)

            UNION ALL
            -- 13. تحويلات مخزنية (وارد +)
            SELECT sti.product_id, st.to_warehouse_id as warehouse_id, public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id) as qty
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)

            UNION ALL
            -- 14. مرتجعات مبيعات (+) - بضاعة عادت للمخزن من العميل
            SELECT sri.product_id, sr.warehouse_id, public.uom_convert(sri.quantity, sri.uom_id, p.base_uom_id) as qty
            FROM public.sales_return_items sri
            JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
            JOIN public.products p ON sri.product_id = p.id
            WHERE UPPER(COALESCE(sr.status, '')) NOT IN ('DRAFT', 'CANCELLED')
              AND sr.warehouse_id IS NOT NULL AND sri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR sr.organization_id = v_final_org)

            UNION ALL
            -- 15. مرتجعات مشتريات (-) - بضاعة ردت للمورد
            SELECT pri.product_id, pr.warehouse_id, -public.uom_convert(pri.quantity, pri.uom_id, p.base_uom_id) as qty
            FROM public.purchase_return_items pri
            JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
            JOIN public.products p ON pri.product_id = p.id
            WHERE UPPER(COALESCE(pr.status, '')) NOT IN ('DRAFT', 'CANCELLED')
              AND pr.warehouse_id IS NOT NULL AND pri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR pr.organization_id = v_final_org)

            UNION ALL
            -- 16. صرف مواد المقاولات (-)
            SELECT pmii.product_id, pmi.warehouse_id, -public.uom_convert(pmii.quantity, pmii.uom_id, p.base_uom_id) as qty
            FROM public.project_material_issue_items pmii
            JOIN public.project_material_issues pmi ON pmii.issue_id = pmi.id
            JOIN public.products p ON pmii.product_id = p.id
            WHERE pmi.status = 'approved' AND (v_final_org IS NULL OR pmi.organization_id = v_final_org)

            UNION ALL
            -- 17. استهلاك مستلزمات المستشفيات (HIMS) (-)
            SELECT hbi.product_id, hbi.warehouse_id, -public.uom_convert(hbi.quantity, hbi.uom_id, p.base_uom_id) as qty
            FROM public.hims_billing_items hbi
            JOIN public.products p ON hbi.product_id = p.id
            WHERE hbi.product_id IS NOT NULL AND hbi.warehouse_id IS NOT NULL
              AND (v_final_org IS NULL OR hbi.organization_id = v_final_org)
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

    -- 🛡️ تحديث الأصناف التي لها حركات فعلية
    UPDATE public.products p
    SET 
        stock = COALESCE(s.total_stock, 0),
        warehouse_stock = COALESCE(s.wh_json, '{}'::jsonb)
    FROM product_summary_temp s
    WHERE p.id = s.product_id;

    -- 🛡️ تصفير الأصناف التي لا تمتلك أي حركات (مطابقة الدفاتر)
    UPDATE public.products p
    SET stock = 0, warehouse_stock = '{}'::jsonb
    WHERE (v_final_org IS NULL OR p.organization_id = v_final_org)
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND NOT EXISTS (SELECT 1 FROM product_summary_temp s WHERE s.product_id = p.id);

    DROP TABLE IF EXISTS product_summary_temp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_stock_rpc(uuid, uuid) TO anon, authenticated, service_role;


-- 🛡️ 2. تحديث دالة متوسط التكلفة المرجح (recalculate_product_wac) لربط فواتير البيع بدقة
CREATE OR REPLACE FUNCTION public.recalculate_product_wac(p_product_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '60s'
SET search_path = public, pg_temp
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
    
    -- 2.1 رصيد أول المدة
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT oi.id, 'opening', oi.id, oi.created_at, 'IN', 
           public.uom_convert(oi.quantity, oi.uom_id, v_base_uom_id),
           COALESCE(oi.cost, 0)
    FROM public.opening_inventories oi
    WHERE oi.product_id = p_product_id AND (v_org_id IS NULL OR oi.organization_id = v_org_id);

    -- 2.2 فواتير المشتريات
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT pii.id, 'purchase', pii.id, pi.invoice_date::timestamp with time zone, 'IN',
           public.uom_convert(pii.quantity, pii.uom_id, v_base_uom_id),
           CASE WHEN pii.quantity > 0 THEN (pii.unit_price * pii.quantity) / NULLIF(public.uom_convert(pii.quantity, pii.uom_id, v_base_uom_id), 0) ELSE 0 END
    FROM public.purchase_invoice_items pii
    JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id
    WHERE pii.product_id = p_product_id AND pi.status IN ('posted', 'paid') AND (v_org_id IS NULL OR pi.organization_id = v_org_id);

    -- 2.3 فواتير المبيعات المباشرة (تشمل جميع الأصناف المصنعة والمخزنية)
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT ii.id, 'sale', ii.id, i.invoice_date::timestamp with time zone, 'OUT',
           public.uom_convert(ii.quantity, ii.uom_id, v_base_uom_id),
           0
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE ii.product_id = p_product_id AND i.status IN ('posted', 'paid') AND (v_org_id IS NULL OR i.organization_id = v_org_id);

    -- 2.4 مرتجعات المبيعات
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT sri.id, 'sales_return', sri.id, sr.return_date::timestamp with time zone, 'IN',
           public.uom_convert(sri.quantity, sri.uom_id, v_base_uom_id),
           COALESCE((SELECT cost FROM public.invoice_items WHERE product_id = p_product_id AND invoice_id = sr.original_invoice_id LIMIT 1), v_current_wac)
    FROM public.sales_return_items sri
    JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
    WHERE sri.product_id = p_product_id AND sr.status = 'posted' AND (v_org_id IS NULL OR sr.organization_id = v_org_id);

    -- 2.5 مرتجعات المشتريات
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT pri.id, 'purchase_return', pri.id, pr.return_date::timestamp with time zone, 'OUT',
           public.uom_convert(pri.quantity, pri.uom_id, v_base_uom_id),
           0
    FROM public.purchase_return_items pri
    JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
    WHERE pri.product_id = p_product_id AND pr.status = 'posted' AND (v_org_id IS NULL OR pr.organization_id = v_org_id);

    -- 2.6 تسويات المخزون
    INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
    SELECT sai.id, 'adjustment', sai.id, sa.adjustment_date::timestamp with time zone,
           CASE WHEN sai.quantity >= 0 THEN 'IN' ELSE 'OUT' END,
           ABS(public.uom_convert(sai.quantity, sai.uom_id, v_base_uom_id)),
           COALESCE((SELECT purchase_price FROM public.products WHERE id = sai.product_id), 0)
    FROM public.stock_adjustment_items sai
    JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
    WHERE sai.product_id = p_product_id AND sa.status = 'posted' AND (v_org_id IS NULL OR sa.organization_id = v_org_id);

    -- 2.7 إنتاج التصنيع التام
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_production_orders') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT po.id, 'manufacturing_fg', po.id, po.end_date::timestamp with time zone, 'IN',
               po.quantity_to_produce,
               COALESCE(
                   (SELECT total_actual_cost / NULLIF(qty, 0) FROM public.v_mfg_order_profitability WHERE order_id = po.id),
                   (SELECT estimated_cost / NULLIF(qty, 0) FROM public.v_mfg_order_profitability WHERE order_id = po.id),
                   v_current_wac,
                   0
               )
        FROM public.mfg_production_orders po
        WHERE po.product_id = p_product_id AND po.status = 'completed' AND (v_org_id IS NULL OR po.organization_id = v_org_id);
    END IF;

    -- 2.8 مبيعات المطاعم
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
        INSERT INTO temp_moves (move_id, tx_table, tx_item_id, tx_date, type, qty, unit_price)
        SELECT oi.id, 'restaurant', oi.id, o.created_at, 'OUT',
               public.uom_convert(oi.quantity, oi.uom_id, v_base_uom_id),
               0
        FROM public.order_items oi
        JOIN public.orders o ON oi.order_id = o.id
        WHERE oi.product_id = p_product_id AND o.status IN ('PAID', 'COMPLETED') AND (v_org_id IS NULL OR o.organization_id = v_org_id);
    END IF;

    -- 3. معالجة الحركات تتابعياً لحساب متوسط التكلفة
    FOR v_rec IN SELECT * FROM temp_moves ORDER BY tx_date ASC, type DESC LOOP
        IF v_rec.type = 'IN' THEN
            IF (v_current_stock + v_rec.qty) > 0 THEN
                v_current_wac := ((v_current_stock * v_current_wac) + (v_rec.qty * v_rec.unit_price)) / (v_current_stock + v_rec.qty);
            ELSE
                v_current_wac := COALESCE(NULLIF(v_rec.unit_price, 0), v_current_wac);
            END IF;
            v_current_stock := v_current_stock + v_rec.qty;
        ELSE
            v_current_stock := v_current_stock - v_rec.qty;
            
            IF v_rec.tx_table = 'sale' THEN
                UPDATE public.invoice_items SET cost = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            ELSIF v_rec.tx_table = 'restaurant' THEN
                UPDATE public.order_items SET unit_cost = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            ELSIF v_rec.tx_table = 'purchase_return' THEN
                UPDATE public.purchase_return_items SET unit_price = ROUND(v_current_wac, 4) WHERE id = v_rec.tx_item_id;
            END IF;
        END IF;
    END LOOP;

    UPDATE public.products 
    SET weighted_average_cost = ROUND(v_current_wac, 4), 
        cost = ROUND(v_current_wac, 4) 
    WHERE id = p_product_id;

    DROP TABLE IF EXISTS temp_moves;
    RETURN ROUND(v_current_wac, 4);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_product_wac(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalculate_product_wac(p_product_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public.recalculate_product_wac(p_product_id, public.get_my_org());
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_product_wac(uuid) TO anon, authenticated, service_role;

-- 🚀 3. تشغيل إعادة احتساب المخزون الفوري لكافة الأصناف في النظام لتتطابق الأرصدة لحظياً
DO $$
DECLARE
    v_org record;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        PERFORM public.recalculate_stock_rpc(v_org.id);
    END LOOP;
END $$;

COMMIT;
