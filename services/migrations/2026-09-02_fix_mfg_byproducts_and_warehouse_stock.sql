-- ==============================================================================
-- TriPro ERP - Migration: Fix Manufacturing By-Products Warehouse Stock & Recalculation
-- Date: 2026-09-02
-- 1. Adds warehouse_id to mfg_byproducts_logs
-- 2. Updates mfg_record_byproduct to support p_warehouse_id and trigger recalculate_stock_rpc
-- 3. Updates recalculate_stock_rpc to ensure by-products are never dropped due to missing warehouse_id
-- 4. Backfills warehouse_id for existing by-products logs and recalculates stock for all orgs
-- ==============================================================================

-- 1. إضافة عمود المستودع لجدول سجلات المنتجات العرضية (إذا لم يكن موجوداً)
ALTER TABLE public.mfg_byproducts_logs 
ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);

-- 2. تحديث السجلات السابقة وتعيين المستودع المناسب لها
UPDATE public.mfg_byproducts_logs bl
SET warehouse_id = COALESCE(
    bl.warehouse_id,
    (SELECT po.warehouse_id 
     FROM public.mfg_order_progress op 
     JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
     WHERE op.id = bl.order_progress_id LIMIT 1),
    (SELECT id FROM public.warehouses 
     WHERE organization_id = bl.organization_id AND deleted_at IS NULL 
     ORDER BY created_at ASC LIMIT 1),
    (SELECT id FROM public.warehouses 
     WHERE deleted_at IS NULL 
     ORDER BY created_at ASC LIMIT 1)
);

-- 3. تحديث دالة تسجيل المنتج العرضي (mfg_record_byproduct)
CREATE OR REPLACE FUNCTION public.mfg_record_byproduct(
    p_progress_id uuid, 
    p_product_id uuid, 
    p_qty numeric, 
    p_market_value numeric,
    p_warehouse_id uuid DEFAULT NULL
) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid; 
    v_order_id uuid; 
    v_je_id uuid; 
    v_mappings jsonb;
    v_wh_id uuid;
BEGIN
    SELECT organization_id, production_order_id INTO v_org_id, v_order_id 
    FROM public.mfg_order_progress WHERE id = p_progress_id;
    
    -- تحديد المستودع المستهدف (الممرر، أو مستودع أمر الإنتاج، أو المستودع الافتراضي للمنشأة)
    v_wh_id := COALESCE(
        p_warehouse_id,
        (SELECT warehouse_id FROM public.mfg_production_orders WHERE id = v_order_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1),
        (SELECT id FROM public.warehouses WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
    );

    INSERT INTO public.mfg_byproducts_logs (
        order_progress_id, product_id, quantity, market_value_per_unit, organization_id, warehouse_id
    )
    VALUES (p_progress_id, p_product_id, p_qty, p_market_value, v_org_id, v_wh_id);

    -- محاسبياً: قيمة المنتج العرضي تخفض تكلفة المنتج الرئيسي (WIP)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type
    )
    VALUES (now()::date, 'إثبات منتج عرضي - تخفيض تكلفة WIP', 'BY-PROD', 'posted', v_org_id, v_order_id, 'mfg_byproduct')
    RETURNING id INTO v_je_id;

    -- من ح/ المخزون (المنتج العرضي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, 
            public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1))), 
            (p_qty * p_market_value), 0, 'مخزون منتج عرضي', v_org_id);

    -- إلى ح/ الإنتاج تحت التشغيل (تخفيض تكلفة الأمر الرئيسي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, 
            public.resolve_mfg_wip_account(v_org_id), 
            0, (p_qty * p_market_value), 'تخفيض تكلفة WIP بمنتج عرضي', v_org_id);

    -- تحديث المخزون فوراً لضمان ظهور كمية المنتج العرضي في المستودع
    PERFORM public.recalculate_stock_rpc(v_org_id, p_product_id);
END; $$;

-- 4. تحديث دالة إعادة احتساب المخزون (recalculate_stock_rpc) لضمان عدم إسقاط المنتجات العرضية
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_final_org uuid;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    
    DROP TABLE IF EXISTS product_summary_temp;
    CREATE TEMP TABLE product_summary_temp AS
    WITH warehouse_movement AS (
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
            -- مبيعات (-) - خصم مكونات BOM للمنتجات التامة المباعة
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
            -- مبيعات المطعم (Order Items) (-)
            SELECT oi.product_id, o.warehouse_id, -public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id)
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.products p ON oi.product_id = p.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR o.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
            
            UNION ALL
            -- تصنيع تام (+) 
            SELECT po.product_id, 
                   COALESCE(po.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)) as warehouse_id, 
                   po.quantity_to_produce 
            FROM public.mfg_production_orders po
            WHERE UPPER(po.status) = 'COMPLETED' AND po.product_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- 🛡️ منتجات عرضية من التصنيع (+) بصمام أمان صارم يمنع إسقاطها نهائياً
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
                     ORDER BY created_at ASC LIMIT 1),
                    (SELECT id FROM public.warehouses 
                     WHERE deleted_at IS NULL 
                     ORDER BY created_at ASC LIMIT 1)
                ) as warehouse_id, 
                bl.quantity as qty
            FROM public.mfg_byproducts_logs bl
            WHERE (v_final_org IS NULL OR bl.organization_id = v_final_org OR bl.organization_id IS NULL)
            
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
            SELECT amu.raw_material_id, 
                   COALESCE(po.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id LIMIT 1)), 
                   -public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id)
            FROM public.mfg_actual_material_usage amu 
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id 
            JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE amu.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
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

    -- تحديث الأصناف التي لها حركات
    UPDATE public.products p
    SET 
        stock = COALESCE(s.total_stock, 0),
        warehouse_stock = COALESCE(s.wh_json, '{}'::jsonb)
    FROM product_summary_temp s
    WHERE p.id = s.product_id;

    -- تصفير الأصناف التي لا تمتلك حركات
    UPDATE public.products p
    SET stock = 0, warehouse_stock = '{}'::jsonb
    WHERE (v_final_org IS NULL OR p.organization_id = v_final_org)
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND NOT EXISTS (SELECT 1 FROM product_summary_temp s WHERE s.product_id = p.id);
END; $$;

-- 5. تشغيل إعادة احتساب المخزون لكافة المنشآت فوراً
DO $$
DECLARE
    r_org RECORD;
BEGIN
    FOR r_org IN SELECT id FROM public.organizations LOOP
        PERFORM public.recalculate_stock_rpc(r_org.id);
    END LOOP;
END $$;
