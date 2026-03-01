-- 🔄 ملف استعادة البيانات من النسخة الاحتياطية (Restore from Backup)
-- ⚠️ تحذير: هذا السكربت سيقوم بمسح البيانات الحالية واستبدالها ببيانات النسخة الاحتياطية!
-- ℹ️ تعليمات الاستخدام:
-- 1. ابحث عن اسم جدول النسخة الاحتياطية في قاعدة البيانات (مثلاً: invoices_20240301_120000)
-- 2. انسخ اللاحقة الزمنية (مثلاً: _20240301_120000)
-- 3. استبدل قيمة المتغير v_backup_suffix في الأسفل بهذه اللاحقة.

DO $$
DECLARE
    -- 👇👇👇 قم بتغيير هذه القيمة لتطابق لاحقة الجدول الذي تريد الاستعادة منه 👇👇👇
    v_backup_suffix text := '_YYYYMMDD_HH24MISS'; 
    -- 👆👆👆----------------------------------------------------------👆👆👆
    
    v_table text;
    v_backup_table text;
    
    -- ترتيب الجداول مهم جداً لتجنب أخطاء المفاتيح الأجنبية (Foreign Keys) عند الإدراج
    v_tables text[] := ARRAY[
        -- 1. البيانات الأساسية (Master Data)
        'company_settings',
        'warehouses',
        'accounts',
        'cost_centers',
        'customers',
        'suppliers',
        'employees',
        'products',
        'assets',

        -- 2. رؤوس العمليات (Headers)
        'journal_entries', -- يجب أن يكون قبل المستندات التي تشير إليه
        'invoices',
        'purchase_invoices',
        'receipt_vouchers',
        'payment_vouchers',
        'cheques',
        'stock_adjustments',
        'stock_transfers',
        'sales_returns',
        'purchase_returns',
        'quotations',
        'purchase_orders',
        'credit_notes',
        'debit_notes',
        'work_orders',
        'inventory_counts',
        'payrolls',

        -- 3. التفاصيل (Details/Lines)
        'journal_lines',
        'invoice_items',
        'purchase_invoice_items',
        'sales_return_items',
        'purchase_return_items',
        'quotation_items',
        'purchase_order_items',
        'stock_adjustment_items',
        'stock_transfer_items',
        'inventory_count_items',
        'work_order_costs',
        'payroll_items',
        'employee_advances',
        
        -- 4. المرفقات (Attachments)
        'journal_attachments',
        'receipt_voucher_attachments',
        'payment_voucher_attachments',
        'cheque_attachments'
    ];
BEGIN
    RAISE NOTICE '🚀 بدء عملية استعادة النظام...';

    -- التحقق من أن المستخدم قد حدد اللاحقة
    IF v_backup_suffix = '_YYYYMMDD_HH24MISS' THEN
        RAISE EXCEPTION '❌ خطأ: لم يتم تحديد لاحقة النسخة الاحتياطية. يرجى تعديل المتغير v_backup_suffix في بداية السكربت.';
    END IF;

    -- 1. تنظيف البيانات الحالية (Truncate)
    RAISE NOTICE '🧹 جاري تنظيف البيانات الحالية...';
    EXECUTE 'TRUNCATE TABLE journal_entries, invoices, purchase_invoices, products, customers, suppliers, accounts, warehouses, company_settings, receipt_vouchers, payment_vouchers, cheques, stock_adjustments, stock_transfers, sales_returns, purchase_returns, quotations, purchase_orders, credit_notes, debit_notes, work_orders, inventory_counts, payrolls, assets, employees RESTART IDENTITY CASCADE';
    
    -- 2. استعادة البيانات
    RAISE NOTICE '📦 جاري استعادة البيانات من جداول النسخ الاحتياطي...';
    
    FOREACH v_table IN ARRAY v_tables
    LOOP
        v_backup_table := v_table || v_backup_suffix;
        
        -- التحقق من وجود جدول النسخة الاحتياطية لهذا الكيان
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_backup_table) THEN
            RAISE NOTICE '   ↳ استعادة % ...', v_table;
            EXECUTE format('INSERT INTO public.%I SELECT * FROM public.%I', v_table, v_backup_table);
        ELSE
            RAISE NOTICE '   ℹ️ تخطي % (لا توجد نسخة احتياطية)', v_table;
        END IF;
    END LOOP;

    RAISE NOTICE '✅ تمت عملية الاستعادة بنجاح!';
END $$;