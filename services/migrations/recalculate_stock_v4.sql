CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
    prod RECORD;
    total_qty numeric;
    wh_stock jsonb;
    wh_rec RECORD;
BEGIN
    -- المرور على المنتجات (تصفية حسب المنظمة إذا تم تمريرها)
    FOR prod IN SELECT id, organization_id FROM public.products 
               WHERE (p_org_id IS NULL OR organization_id = p_org_id) 
                 AND deleted_at IS NULL LOOP
        total_qty := 0;
        wh_stock := '{}'::jsonb;

        -- 1. حساب رصيد كل مستودع يخص المنظمة
        FOR wh_rec IN SELECT id FROM public.warehouses 
                     WHERE (p_org_id IS NULL OR organization_id = prod.organization_id) LOOP
            DECLARE
                q_in numeric := 0;
                q_out numeric := 0;
                q_opening numeric := 0;
                q_adj numeric := 0;
                q_transfer_in numeric := 0;
                q_transfer_out numeric := 0;
                
                -- متغيرات مؤقتة للحساب
                temp_val numeric := 0;
                net_wh numeric := 0;
            BEGIN
                -- أ. رصيد أول المدة (Opening Inventory)
                SELECT COALESCE(SUM(quantity), 0) INTO q_opening FROM public.opening_inventories 
                WHERE product_id = prod.id AND warehouse_id = wh_rec.id;

                -- ب. المشتريات (Purchase Invoices) - وارد
                -- تم التعديل ليشمل جميع الحالات ما عدا المسودة والملغاة (لضمان احتساب الفواتير المدفوعة)
                SELECT COALESCE(SUM(pii.quantity), 0) INTO temp_val 
                FROM public.purchase_invoice_items pii
                JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id
                WHERE pii.product_id = prod.id AND pi.warehouse_id = wh_rec.id 
                  AND pi.status NOT IN ('draft', 'cancelled') AND pi.organization_id = prod.organization_id;
                q_in := q_in + temp_val;

                -- ج. المبيعات (Sales Invoices) - صادر (مباشر + مكونات BOM + إضافات)
                -- 1. الخصم المباشر (فقط إذا لم يكن للمنتج BOM)
                SELECT COALESCE(SUM(ii.quantity), 0) INTO temp_val FROM public.invoice_items ii JOIN public.invoices i ON ii.invoice_id = i.id WHERE ii.product_id = prod.id AND i.warehouse_id = wh_rec.id AND i.status NOT IN ('draft', 'cancelled') AND i.organization_id = prod.organization_id AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = ii.product_id);
                q_out := q_out + temp_val;

                -- 2. خصم مكونات الـ BOM للأصناف المجمعة المباعة
                SELECT COALESCE(SUM(ii.quantity * bom.quantity_required), 0) INTO temp_val FROM public.invoice_items ii JOIN public.invoices i ON ii.invoice_id = i.id JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id WHERE bom.raw_material_id = prod.id AND i.warehouse_id = wh_rec.id AND i.status NOT IN ('draft', 'cancelled') AND i.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- 3. خصم مكونات الـ BOM للإضافات (Modifiers)
                SELECT COALESCE(SUM(ii.quantity * bom.quantity_required), 0) INTO temp_val FROM public.invoice_items ii JOIN public.invoices i ON ii.invoice_id = i.id CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ii.modifiers, '[]'::jsonb)) AS m JOIN public.bill_of_materials bom ON bom.product_id = (m->>'id')::uuid WHERE bom.raw_material_id = prod.id AND i.warehouse_id = wh_rec.id AND i.status NOT IN ('draft', 'cancelled') AND i.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- ح. الإنتاج المصنع (Manufacturing Output) - وارد للمنتج التام
                SELECT COALESCE(SUM(quantity_to_produce), 0) INTO temp_val 
                FROM public.mfg_production_orders 
                WHERE product_id = prod.id AND warehouse_id = wh_rec.id 
                  AND status = 'completed' AND organization_id = prod.organization_id;
                q_in := q_in + temp_val;

                -- ط. المواد المستهلكة في التصنيع (Manufacturing Consumption) - صادر للمواد الخام
                -- نجمع الاستهلاك الفعلي المسجل في مراحل الإنتاج
                SELECT COALESCE(SUM(amu.actual_quantity), 0) INTO temp_val 
                FROM public.mfg_actual_material_usage amu
                JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
                JOIN public.mfg_production_orders po ON op.production_order_id = po.id
                WHERE amu.raw_material_id = prod.id AND po.warehouse_id = wh_rec.id 
                  AND po.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- ي. المواد المنصرفة بطلبات صرف يدوية (Material Requests Issued) - صادر
                -- نجمع الكميات المنصرفة للمواد التي لم تدرج بعد في سجلات الاستهلاك الفعلي (لتجنب الازدواجية)
                SELECT COALESCE(SUM(mri.quantity_issued), 0) INTO temp_val 
                FROM public.mfg_material_request_items mri
                JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
                JOIN public.mfg_production_orders po ON mr.production_order_id = po.id
                WHERE mri.raw_material_id = prod.id AND po.warehouse_id = wh_rec.id 
                  AND mr.status = 'issued' AND mri.organization_id = prod.organization_id
                  AND NOT EXISTS (
                      SELECT 1 FROM public.mfg_actual_material_usage amu 
                      JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
                      WHERE op.production_order_id = po.id AND amu.raw_material_id = prod.id
                  );
                q_out := q_out + temp_val;

                -- د. مرتجعات المبيعات (Sales Returns) - وارد
                SELECT COALESCE(SUM(sri.quantity), 0) INTO temp_val 
                FROM public.sales_return_items sri
                JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
                WHERE sri.product_id = prod.id AND sr.warehouse_id = wh_rec.id 
                  AND sr.status NOT IN ('draft', 'cancelled') AND sr.organization_id = prod.organization_id;
                q_in := q_in + temp_val;

                -- هـ. مرتجعات المشتريات (Purchase Returns) - صادر
                SELECT COALESCE(SUM(pri.quantity), 0) INTO temp_val
                FROM public.purchase_return_items pri
                JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
                WHERE pri.product_id = prod.id AND pr.warehouse_id = wh_rec.id 
                  AND pr.status NOT IN ('draft', 'cancelled') AND pr.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- و. التسويات المخزنية (Adjustments)
                SELECT COALESCE(SUM(sai.quantity), 0) INTO q_adj
                FROM public.stock_adjustment_items sai
                JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
                WHERE sai.product_id = prod.id AND sa.warehouse_id = wh_rec.id 
                  AND sa.status NOT IN ('draft', 'cancelled') AND sa.organization_id = prod.organization_id;

                -- ز. التحويلات (Transfers)
                SELECT COALESCE(SUM(sti.quantity), 0) INTO q_transfer_in FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.to_warehouse_id = wh_rec.id AND st.status NOT IN ('draft', 'cancelled') AND st.organization_id = prod.organization_id;
                SELECT COALESCE(SUM(sti.quantity), 0) INTO q_transfer_out FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.from_warehouse_id = wh_rec.id AND st.status NOT IN ('draft', 'cancelled') AND st.organization_id = prod.organization_id;

                -- المعادلة النهائية للمستودع
                net_wh := q_opening + q_in - q_out + q_adj + q_transfer_in - q_transfer_out;
                
                -- تحديث JSON المستودعات
                IF net_wh <> 0 THEN
                    wh_stock := jsonb_set(wh_stock, ARRAY[wh_rec.id::text], to_jsonb(net_wh));
                    total_qty := total_qty + net_wh;
                END IF;
            END;
        END LOOP;

        UPDATE public.products SET stock = total_qty, warehouse_stock = wh_stock WHERE id = prod.id;
    END LOOP;
END;
$$;