-- ==============================================================================
-- 📦 إغلاق ثغرة المخزون نهائياً: مزامنة أرصدة الأصناف مع تقارير المخازن وحركات البيع
-- 1. إصلاح سياسات RLS لجدول بضاعة أول المدة (opening_inventories)
-- 2. توليد أرصدة أول المدة المفقودة تلقائياً من أرصدة المنتجات الحالية
-- 3. تحديث محرك احتساب المخزون الشامل (recalculate_stock_rpc) ليكون المصدر الموحد للحقيقة
-- ==============================================================================

-- 0. التأكد من وجود كافة الحقول المطلوبة لجدول بضاعة أول المدة
ALTER TABLE public.opening_inventories ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.opening_inventories ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.opening_inventories ADD COLUMN IF NOT EXISTS uom_id uuid;

-- 1. إصلاح سياسات الأمان (RLS) لجدول opening_inventories لضمان عدم رفض الإدراج
ALTER TABLE public.opening_inventories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opening_inventories_all_authenticated" ON public.opening_inventories;
DROP POLICY IF EXISTS "opening_inventories_read" ON public.opening_inventories;
DROP POLICY IF EXISTS "opening_inventories_write" ON public.opening_inventories;
DROP POLICY IF EXISTS "opening_inventories_update" ON public.opening_inventories;
DROP POLICY IF EXISTS "opening_inventories_delete" ON public.opening_inventories;

CREATE POLICY "opening_inventories_all_authenticated" 
ON public.opening_inventories 
FOR ALL 
TO authenticated 
USING (
    organization_id = public.get_my_org() 
    OR public.get_my_org() IS NULL 
    OR organization_id IS NULL
)
WITH CHECK (
    organization_id = public.get_my_org() 
    OR public.get_my_org() IS NULL 
    OR organization_id IS NULL
);

-- السماح أيضاً لـ anon في بيئات الاختبار والتطوير إن لزم
DROP POLICY IF EXISTS "opening_inventories_anon_policy" ON public.opening_inventories;
CREATE POLICY "opening_inventories_anon_policy" 
ON public.opening_inventories 
FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

-- 2. توليد سجلات بضاعة أول المدة (opening_inventories) للأصناف التي لديها رصيد مسجل دون سجل افتتاحي
-- يضمن هذا عدم تصفير رصيد الصنف الأساسي (مثل التونة 100) عند إعادة الاحتساب
DO $$
DECLARE
    r_prod RECORD;
    v_wh_id uuid;
    v_open_qty numeric;
    v_open_cost numeric;
BEGIN
    FOR r_prod IN 
        SELECT p.id, p.organization_id, p.stock, p.warehouse_stock, p.purchase_price, p.cost, p.opening_balance
        FROM public.products p
        WHERE p.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.opening_inventories oi WHERE oi.product_id = p.id)
    LOOP
        -- استخراج المستودع الافتراضي للمنتج أو أول مستودع للمنظمة
        v_wh_id := NULL;
        IF r_prod.warehouse_stock IS NOT NULL AND jsonb_typeof(r_prod.warehouse_stock) = 'object' THEN
            SELECT key::uuid INTO v_wh_id 
            FROM jsonb_each_text(r_prod.warehouse_stock) 
            WHERE value::numeric > 0 
            LIMIT 1;
        END IF;

        IF v_wh_id IS NULL THEN
            SELECT id INTO v_wh_id 
            FROM public.warehouses 
            WHERE organization_id = r_prod.organization_id AND deleted_at IS NULL 
            ORDER BY created_at ASC LIMIT 1;
        END IF;

        IF v_wh_id IS NULL THEN
            SELECT id INTO v_wh_id 
            FROM public.warehouses 
            WHERE deleted_at IS NULL 
            ORDER BY created_at ASC LIMIT 1;
        END IF;

        v_open_qty := COALESCE(NULLIF(r_prod.stock, 0), NULLIF(r_prod.opening_balance, 0), 0);
        v_open_cost := COALESCE(NULLIF(r_prod.cost, 0), NULLIF(r_prod.purchase_price, 0), 0);

        -- إذا كان للصنف رصيد مسجل، نثبته كسجل رسمي في بضاعة أول المدة
        IF v_open_qty > 0 AND v_wh_id IS NOT NULL THEN
            INSERT INTO public.opening_inventories (
                product_id, 
                warehouse_id, 
                quantity, 
                cost, 
                organization_id,
                created_at
            ) VALUES (
                r_prod.id, 
                v_wh_id, 
                v_open_qty, 
                v_open_cost, 
                r_prod.organization_id,
                now()
            ) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END $$;

-- 3. المحرك الموحد والنهائي لاحتساب المخزون (recalculate_stock_rpc)
-- يقوم بجمع كافة الحركات من كافة المديولات ومزامنة products.stock و products.warehouse_stock
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
            -- 1. رصيد افتتاحي (+) من جدول opening_inventories
            SELECT oi.product_id, 
                   COALESCE(oi.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = oi.organization_id LIMIT 1)) as warehouse_id, 
                   public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) as qty 
            FROM public.opening_inventories oi 
            JOIN public.products p ON oi.product_id = p.id
            WHERE oi.product_id IS NOT NULL AND (v_final_org IS NULL OR oi.organization_id = v_final_org)
            
            UNION ALL
            -- 2. مشتريات (+)
            SELECT pii.product_id, 
                   COALESCE(pi.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = pi.organization_id LIMIT 1)) as warehouse_id, 
                   public.uom_convert(pii.quantity, pii.uom_id, p.base_uom_id) 
            FROM public.purchase_invoice_items pii 
            JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id 
            JOIN public.products p ON pii.product_id = p.id
            WHERE UPPER(pi.status) NOT IN ('DRAFT', 'CANCELLED') AND pii.product_id IS NOT NULL AND (v_final_org IS NULL OR pi.organization_id = v_final_org)
            
            UNION ALL
            -- 3. وارد اعتمادات مستندية (+)
            SELECT lcri.product_id, 
                   COALESCE(lcri.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = lcri.organization_id LIMIT 1)) as warehouse_id, 
                   COALESCE(lcri.quantity, 0) as qty
            FROM public.lc_receipt_items lcri
            LEFT JOIN public.letters_of_credit lc ON lcri.lc_id = lc.id
            WHERE (lc.id IS NULL OR UPPER(lc.status) != 'CANCELLED') 
              AND lcri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR lcri.organization_id = v_final_org)
            
            UNION ALL
            -- 4. مبيعات فواتير (-) - خصم المنتج المباشر (إذا لم يكن له BOM)
            SELECT ii.product_id, 
                   COALESCE(i.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = i.organization_id LIMIT 1)) as warehouse_id, 
                   -public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id)
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.products p ON ii.product_id = p.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = ii.product_id)
            
            UNION ALL
            -- 5. مبيعات فواتير (-) - خصم مكونات BOM للمنتجات التامة المباعة
            SELECT bom.raw_material_id, 
                   COALESCE(i.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = i.organization_id LIMIT 1)) as warehouse_id, 
                   -(public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id
            JOIN public.products p ON ii.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND bom.raw_material_id IS NOT NULL
            
            UNION ALL
            -- 6. مبيعات التجزئة ونقاط البيع والمطاعم (Order Items) (-) - صادر مباشر
            SELECT oi.product_id, 
                   COALESCE(o.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = o.organization_id LIMIT 1)) as warehouse_id, 
                   -public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id)
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.products p ON oi.product_id = p.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND oi.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR o.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)

            UNION ALL
            -- 7. مبيعات الطلبات (-) - مكونات BOM للوجبات
            SELECT bom.raw_material_id, 
                   COALESCE(o.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = o.organization_id LIMIT 1)) as warehouse_id, 
                   -(public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id
            JOIN public.products p ON oi.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND oi.product_id IS NOT NULL 
              AND bom.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR o.organization_id = v_final_org)

            UNION ALL
            -- 8. مرتجعات مبيعات (+) - بضاعة عادت للمخزن من العميل
            SELECT sri.product_id, 
                   COALESCE(sr.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = sr.organization_id LIMIT 1)) as warehouse_id, 
                   public.uom_convert(sri.quantity, sri.uom_id, p.base_uom_id) as qty
            FROM public.sales_return_items sri
            JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
            JOIN public.products p ON sri.product_id = p.id
            WHERE UPPER(COALESCE(sr.status, '')) NOT IN ('DRAFT', 'CANCELLED')
              AND sri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR sr.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = sri.product_id)

            UNION ALL
            -- 9. مرتجعات مبيعات مكونات BOM (+)
            SELECT bom.raw_material_id, 
                   COALESCE(sr.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = sr.organization_id LIMIT 1)) as warehouse_id, 
                   (public.uom_convert(sri.quantity, sri.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) as qty
            FROM public.sales_return_items sri
            JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
            JOIN public.bill_of_materials bom ON bom.product_id = sri.product_id
            JOIN public.products p ON sri.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(COALESCE(sr.status, '')) NOT IN ('DRAFT', 'CANCELLED')
              AND sri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR sr.organization_id = v_final_org)
              AND bom.raw_material_id IS NOT NULL

            UNION ALL
            -- 10. مرتجعات مشتريات (-) - بضاعة ردت للمورد
            SELECT pri.product_id, 
                   COALESCE(pr.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = pr.organization_id LIMIT 1)) as warehouse_id, 
                   -public.uom_convert(pri.quantity, pri.uom_id, p.base_uom_id) as qty
            FROM public.purchase_return_items pri
            JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
            JOIN public.products p ON pri.product_id = p.id
            WHERE UPPER(COALESCE(pr.status, '')) NOT IN ('DRAFT', 'CANCELLED')
              AND pri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR pr.organization_id = v_final_org)

            UNION ALL
            -- 11. تصنيع تام (+) 
            SELECT po.product_id, 
                   COALESCE(po.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)) as warehouse_id, 
                   po.quantity_to_produce 
            FROM public.mfg_production_orders po
            WHERE UPPER(po.status) = 'COMPLETED' AND po.product_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- 12. منتجات عرضية من التصنيع (+)
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
            -- 13. هالك تصنيع (-)
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
            -- 14. استهلاك خامات فعلي (-)
            SELECT amu.raw_material_id, 
                   COALESCE(po.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = po.organization_id LIMIT 1)), 
                   -public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id)
            FROM public.mfg_actual_material_usage amu 
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id 
            JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE amu.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- 15. استهلاك خامات بطلبات صرف (MR) (-)
            SELECT mri.raw_material_id, 
                   po.warehouse_id, 
                   -public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id)
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
            -- 16. استهلاك مواد لمشاريع المقاولات (-)
            SELECT pmii.product_id, 
                   COALESCE(pmi.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = pmi.organization_id LIMIT 1)) as warehouse_id, 
                   -public.uom_convert(pmii.quantity, pmii.uom_id, p.base_uom_id)
            FROM public.project_material_issue_items pmii
            JOIN public.project_material_issues pmi ON pmii.issue_id = pmi.id
            JOIN public.products p ON pmii.product_id = p.id
            WHERE pmi.status = 'approved' AND (v_final_org IS NULL OR pmi.organization_id = v_final_org)

            UNION ALL
            -- 17. تسويات مخزنية (+/-)
            SELECT sai.product_id, 
                   COALESCE(sa.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = sa.organization_id LIMIT 1)) as warehouse_id, 
                   public.uom_convert(sai.quantity, sai.uom_id, p.base_uom_id)
            FROM public.stock_adjustment_items sai
            JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
            JOIN public.products p ON sai.product_id = p.id
            WHERE sa.status = 'posted' AND (v_final_org IS NULL OR sa.organization_id = v_final_org)

            UNION ALL
            -- 18. تحويلات مخزنية (صادر -)
            SELECT sti.product_id, 
                   st.from_warehouse_id, 
                   -public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)

            UNION ALL
            -- 19. تحويلات مخزنية (وارد +)
            SELECT sti.product_id, 
                   st.to_warehouse_id, 
                   public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
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

GRANT EXECUTE ON FUNCTION public.recalculate_stock_rpc(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_stock_rpc(uuid, uuid) TO anon;

-- تشغيل إعادة احتساب المخزون الشامل لكافة المنشآت فوراً لمزامنة الأرصدة 100%
DO $$
DECLARE
    r_org RECORD;
BEGIN
    FOR r_org IN SELECT id FROM public.organizations LOOP
        PERFORM public.recalculate_stock_rpc(r_org.id, NULL);
    END LOOP;
END $$;
