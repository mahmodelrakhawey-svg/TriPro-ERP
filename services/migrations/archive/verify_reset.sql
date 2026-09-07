-- 🕵️ سكربت التحقق من تصفير الجداول
-- يقوم هذا السكربت بحساب عدد الصفوف في الجداول الرئيسية للتأكد من أنها فارغة.

DO $$
DECLARE
    v_count INTEGER;
    v_tables TEXT[] := ARRAY[
        'invoices', 'invoice_items', 'journal_entries', 'journal_lines', 
        'products', 'customers', 'suppliers', 'receipt_vouchers', 'payment_voucher_attachments',
        'cheques', 'assets', 'employees', 'warehouses', 'sales_returns', 'purchase_returns',
        'stock_transfers', 'inventory_counts', 'security_logs', 'notifications'
    ];
    v_table_name TEXT;
BEGIN
    RAISE NOTICE '--- 📊 تقرير حالة الجداول بعد التنظيف ---';
    
    FOREACH v_table_name IN ARRAY v_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table_name) THEN
            EXECUTE format('SELECT COUNT(*) FROM %I', v_table_name) INTO v_count;
            
            IF v_count > 0 THEN
                RAISE NOTICE '⚠️ تنبيه: الجدول % يحتوي على % صفوف (لم يتم تفريغه بالكامل)', v_table_name, v_count;
            ELSE
                RAISE NOTICE '✅ الجدول % فارغ.', v_table_name;
            END IF;
        END IF;
    END LOOP;
END $$;