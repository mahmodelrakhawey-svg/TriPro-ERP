CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    prod RECORD;
    total_qty numeric;
    wh_stock jsonb;
    wh_rec RECORD;
BEGIN
    -- المرور على جميع المنتجات
    FOR prod IN SELECT id FROM public.products LOOP
        total_qty := 0;
        wh_stock := '{}'::jsonb;

        -- 1. حساب رصيد كل مستودع على حدة
        FOR wh_rec IN SELECT id FROM public.warehouses LOOP
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
                WHERE pii.product_id = prod.id AND pi.warehouse_id = wh_rec.id AND pi.status NOT IN ('draft', 'cancelled');
                q_in := q_in + temp_val;

                -- ج. المبيعات (Sales Invoices) - صادر
                SELECT COALESCE(SUM(ii.quantity), 0) INTO temp_val 
                FROM public.invoice_items ii
                JOIN public.invoices i ON ii.invoice_id = i.id
                WHERE ii.product_id = prod.id AND i.warehouse_id = wh_rec.id AND i.status NOT IN ('draft', 'cancelled');
                q_out := q_out + temp_val;

                -- د. مرتجعات المبيعات (Sales Returns) - وارد
                SELECT COALESCE(SUM(sri.quantity), 0) INTO temp_val 
                FROM public.sales_return_items sri
                JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
                WHERE sri.product_id = prod.id AND sr.warehouse_id = wh_rec.id AND sr.status NOT IN ('draft', 'cancelled');
                q_in := q_in + temp_val;

                -- هـ. مرتجعات المشتريات (Purchase Returns) - صادر
                SELECT COALESCE(SUM(pri.quantity), 0) INTO temp_val
                FROM public.purchase_return_items pri
                JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
                WHERE pri.product_id = prod.id AND pr.warehouse_id = wh_rec.id AND pr.status NOT IN ('draft', 'cancelled');
                q_out := q_out + temp_val;

                -- و. التسويات المخزنية (Adjustments)
                SELECT COALESCE(SUM(sai.quantity), 0) INTO q_adj
                FROM public.stock_adjustment_items sai
                JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
                WHERE sai.product_id = prod.id AND sa.warehouse_id = wh_rec.id AND sa.status NOT IN ('draft', 'cancelled');

                -- ز. التحويلات (Transfers)
                SELECT COALESCE(SUM(sti.quantity), 0) INTO q_transfer_in FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.to_warehouse_id = wh_rec.id AND st.status NOT IN ('draft', 'cancelled');
                SELECT COALESCE(SUM(sti.quantity), 0) INTO q_transfer_out FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.from_warehouse_id = wh_rec.id AND st.status NOT IN ('draft', 'cancelled');

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