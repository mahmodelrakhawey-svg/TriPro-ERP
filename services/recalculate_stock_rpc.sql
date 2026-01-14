-- دالة شاملة لإعادة احتساب أرصدة المخزون لجميع الأصناف
-- تقوم هذه الدالة بتصفير الأرصدة ثم إعادة جمعها من جميع العمليات المعتمدة

CREATE OR REPLACE FUNCTION recalculate_stock_rpc()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    prod_record RECORD;
    wh_record RECORD;
    total_qty NUMERIC;
    wh_json JSONB;
    wh_qty NUMERIC;
BEGIN
    -- الدوران على جميع المنتجات
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL LOOP
        total_qty := 0;
        wh_json := '{}'::jsonb;
        
        -- الدوران على جميع المستودعات لحساب رصيد المنتج في كل مستودع
        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL LOOP
            wh_qty := 0;

            -- 1. المبيعات (خصم) - الفواتير غير المسودة
            SELECT wh_qty - COALESCE(SUM(ii.quantity), 0) INTO wh_qty
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft';

            -- 2. المشتريات (إضافة)
            SELECT wh_qty + COALESCE(SUM(pii.quantity), 0) INTO wh_qty
            FROM purchase_invoice_items pii
            JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
            WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft';

            -- 3. مرتجع المبيعات (إضافة)
            SELECT wh_qty + COALESCE(SUM(sri.quantity), 0) INTO wh_qty
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.id = sri.sales_return_id
            WHERE sri.product_id = prod_record.id AND sr.warehouse_id = wh_record.id AND sr.status != 'draft';

            -- 4. مرتجع المشتريات (خصم)
            SELECT wh_qty - COALESCE(SUM(pri.quantity), 0) INTO wh_qty
            FROM purchase_return_items pri
            JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
            WHERE pri.product_id = prod_record.id AND pr.warehouse_id = wh_record.id AND pr.status != 'draft';
            
            -- 5. التسويات المخزنية (إضافة أو خصم حسب النوع)
            -- ملاحظة: نفترض وجود عمود type في جدول stock_adjustment_items أو الجدول الأب
            -- هنا نستخدم المنطق البسيط: الكمية موجبة تضاف، سالبة تخصم (أو حسب تصميم الجدول لديك)
            SELECT wh_qty + COALESCE(SUM(sai.quantity), 0) INTO wh_qty
            FROM stock_adjustment_items sai
            JOIN stock_adjustments sa ON sa.id = sai.stock_adjustment_id
            WHERE sai.product_id = prod_record.id AND sa.warehouse_id = wh_record.id AND sa.status != 'draft';

            -- 6. التحويلات المخزنية
            -- خصم من المستودع الحالي (إذا كان هو المصدر)
            SELECT wh_qty - COALESCE(SUM(sti.quantity), 0) INTO wh_qty
            FROM stock_transfer_items sti
            JOIN stock_transfers st ON st.id = sti.stock_transfer_id
            WHERE sti.product_id = prod_record.id AND st.from_warehouse_id = wh_record.id AND st.status != 'draft';
            
            -- إضافة للمستودع الحالي (إذا كان هو المستلم)
            SELECT wh_qty + COALESCE(SUM(sti.quantity), 0) INTO wh_qty
            FROM stock_transfer_items sti
            JOIN stock_transfers st ON st.id = sti.stock_transfer_id
            WHERE sti.product_id = prod_record.id AND st.to_warehouse_id = wh_record.id AND st.status != 'draft';

            -- تجميع الإجمالي العام للمنتج
            total_qty := total_qty + wh_qty;
            
            -- إضافة رصيد المستودع لملف JSON إذا كان لا يساوي صفر
            IF wh_qty <> 0 THEN
                wh_json := wh_json || jsonb_build_object(wh_record.id, wh_qty);
            END IF;
        END LOOP;

        -- تحديث جدول المنتجات بالقيم الجديدة
        UPDATE products SET stock = total_qty, warehouse_stock = wh_json WHERE id = prod_record.id;
    END LOOP;
END;
$$;