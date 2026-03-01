-- 🏥 ملف فحص سلامة النظام (System Health Check)
-- يقوم هذا الملف بالتحقق من أن جميع الجداول، الدوال، والحسابات الأساسية موجودة وتعمل بشكل صحيح.

DO $$
DECLARE
    v_count integer;
    v_missing text := '';
BEGIN
    RAISE NOTICE '🚀 بدء فحص سلامة النظام...';
    
    -- 1. فحص الجداول الأساسية
    RAISE NOTICE '--------------------------------------------------';
    RAISE NOTICE '1️⃣ فحص الجداول الأساسية:';
    
    SELECT count(*) INTO v_count FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('accounts', 'journal_entries', 'invoices', 'products', 'customers', 'suppliers', 'company_settings');
    
    IF v_count = 7 THEN
        RAISE NOTICE '✅ جميع الجداول الرئيسية موجودة.';
    ELSE
        RAISE NOTICE '❌ تنبيه: بعض الجداول الرئيسية مفقودة! (تم العثور على % من 7)', v_count;
    END IF;

    -- 2. فحص الدوال البرمجية (Functions)
    RAISE NOTICE '--------------------------------------------------';
    RAISE NOTICE '2️⃣ فحص الدوال البرمجية (RPCs):';
    
    SELECT count(*) INTO v_count FROM pg_proc 
    WHERE proname IN ('approve_invoice', 'approve_purchase_invoice', 'recalculate_stock_rpc', 'create_journal_entry');
    
    IF v_count >= 4 THEN
        RAISE NOTICE '✅ دوال النظام الأساسية موجودة.';
    ELSE
        RAISE NOTICE '❌ تنبيه: بعض الدوال مفقودة! يرجى إعادة تشغيل ملف deploy_all_functions.sql';
    END IF;

    -- 3. فحص دليل الحسابات
    RAISE NOTICE '--------------------------------------------------';
    RAISE NOTICE '3️⃣ فحص دليل الحسابات:';
    
    SELECT count(*) INTO v_count FROM public.accounts;
    RAISE NOTICE '📊 إجمالي عدد الحسابات: %', v_count;
    
    IF v_count > 50 THEN
        RAISE NOTICE '✅ دليل الحسابات يبدو مكتملاً.';
    ELSE
        RAISE NOTICE '⚠️ تنبيه: عدد الحسابات قليل جداً. هل قمت بتشغيل ملف egyptian_coa_full.sql؟';
    END IF;

    -- 4. فحص الإعدادات
    RAISE NOTICE '--------------------------------------------------';
    RAISE NOTICE '4️⃣ فحص الإعدادات:';
    
    SELECT count(*) INTO v_count FROM public.company_settings;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ إعدادات الشركة موجودة.';
    ELSE
        RAISE NOTICE '❌ خطأ: جدول إعدادات الشركة فارغ!';
    END IF;

    RAISE NOTICE '--------------------------------------------------';
    RAISE NOTICE '🏁 انتهى الفحص.';
END $$;