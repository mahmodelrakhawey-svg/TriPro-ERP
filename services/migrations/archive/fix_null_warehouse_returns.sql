-- 🛠️ إصلاح المرتجعات غير المرتبطة بمستودع
-- يقوم هذا السكربت بتعيين المستودع الرئيسي لأي مرتجع مبيعات أو مشتريات ليس له مستودع

DO $$
DECLARE
    main_warehouse_id uuid;
BEGIN
    -- 1. الحصول على معرف المستودع الرئيسي (أول مستودع نشط)
    SELECT id INTO main_warehouse_id FROM warehouses WHERE deleted_at IS NULL LIMIT 1;

    IF main_warehouse_id IS NOT NULL THEN
        -- 2. تحديث مرتجعات المبيعات
        UPDATE sales_returns 
        SET warehouse_id = main_warehouse_id 
        WHERE warehouse_id IS NULL;

        -- 3. إعادة احتساب المخزون لتحديث الأرصدة في جدول المنتجات
        PERFORM recalculate_stock_rpc();
    END IF;
END $$;