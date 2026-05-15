-- 🛠️ إصلاح المخزون التائه (Orphaned Stock Fix)
-- يقوم هذا السكربت بنقل جميع الحركات المرتبطة بمستودعات محذوفة إلى أول مستودع نشط حالياً

DO $$
DECLARE
    main_warehouse_id uuid;
BEGIN
    -- 1. الحصول على معرف أول مستودع نشط (المستودع الرئيسي)
    SELECT id INTO main_warehouse_id FROM warehouses WHERE deleted_at IS NULL LIMIT 1;

    IF main_warehouse_id IS NOT NULL THEN
        -- 2. تحديث فواتير المشتريات التي ليس لها مستودع صالح
        UPDATE purchase_invoices 
        SET warehouse_id = main_warehouse_id 
        WHERE warehouse_id NOT IN (SELECT id FROM warehouses WHERE deleted_at IS NULL);

        -- 3. تحديث فواتير المبيعات
        UPDATE invoices 
        SET warehouse_id = main_warehouse_id 
        WHERE warehouse_id NOT IN (SELECT id FROM warehouses WHERE deleted_at IS NULL);

        -- 4. إعادة احتساب المخزون
        PERFORM recalculate_stock_rpc();
    END IF;
END $$;