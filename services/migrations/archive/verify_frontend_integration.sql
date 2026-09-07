-- 🕵️ سكربت التحقق من تكامل الواجهة الأمامية (Verify Frontend Integration)
-- قم بتشغيل هذا السكربت بعد إجراء عمليات من الواجهة للتأكد من وصول البيانات بشكل صحيح.

DO $$
DECLARE
    v_count integer;
    v_record record;
BEGIN
    RAISE NOTICE '🚀 بدء فحص تكامل البيانات...';
    RAISE NOTICE '--------------------------------------------------';

    -- 1. فحص التسويات المخزنية (Stock Adjustments)
    -- التحقق من حفظ حقل النوع (type) بشكل صحيح
    RAISE NOTICE '1️⃣ فحص التسويات المخزنية (Stock Adjustments):';
    
    SELECT count(*) INTO v_count FROM public.stock_adjustment_items WHERE type IS NOT NULL;
    RAISE NOTICE '   • عدد البنود التي تحتوي على نوع (type): %', v_count;
    
    SELECT * INTO v_record FROM public.stock_adjustment_items ORDER BY created_at DESC LIMIT 1;
    IF v_record IS NOT NULL THEN
        RAISE NOTICE '   • آخر بند تسوية: ID=%, المنتج=%, الكمية=%, النوع=%', 
            v_record.id, v_record.product_id, v_record.quantity, v_record.type;
            
        IF v_record.type IS NULL THEN
            RAISE WARNING '   ⚠️ تحذير: حقل النوع (type) فارغ في آخر سجل! تأكد من تحديث StockAdjustmentForm.tsx';
        ELSE
            RAISE NOTICE '   ✅ حقل النوع (type) يتم حفظه بنجاح.';
        END IF;
    ELSE
        RAISE NOTICE '   ℹ️ لا توجد بيانات تسوية مخزنية للفحص.';
    END IF;

    RAISE NOTICE '--------------------------------------------------';

    -- 2. فحص مرتجعات المشتريات (Purchase Returns)
    -- التحقق من حفظ الفاتورة الأصلية (original_invoice_id)
    RAISE NOTICE '2️⃣ فحص مرتجعات المشتريات (Purchase Returns):';
    
    SELECT * INTO v_record FROM public.purchase_returns ORDER BY created_at DESC LIMIT 1;
    IF v_record IS NOT NULL THEN
        RAISE NOTICE '   • آخر مرتجع مشتريات: ID=%, المورد=%, الفاتورة الأصلية=%', 
            v_record.id, v_record.supplier_id, v_record.original_invoice_id;
            
        IF v_record.original_invoice_id IS NOT NULL THEN
            RAISE NOTICE '   ✅ ربط الفاتورة الأصلية يعمل بنجاح.';
        ELSE
            RAISE NOTICE '   ℹ️ آخر مرتجع لا يحتوي على فاتورة أصلية (قد يكون مرتجع حر).';
        END IF;
    ELSE
        RAISE NOTICE '   ℹ️ لا توجد مرتجعات مشتريات للفحص.';
    END IF;

    RAISE NOTICE '--------------------------------------------------';

    -- 3. فحص الأصول الثابتة (Assets)
    -- التحقق من القيمة الحالية (current_value)
    RAISE NOTICE '3️⃣ فحص الأصول الثابتة (Assets):';
    
    SELECT * INTO v_record FROM public.assets ORDER BY created_at DESC LIMIT 1;
    IF v_record IS NOT NULL THEN
        RAISE NOTICE '   • آخر أصل مضاف: الاسم=%, التكلفة=%, القيمة الحالية=%', 
            v_record.name, v_record.purchase_cost, v_record.current_value;
            
        IF v_record.current_value IS NULL OR v_record.current_value = 0 THEN
             IF v_record.purchase_cost > 0 THEN
                RAISE WARNING '   ⚠️ تحذير: القيمة الحالية (current_value) صفر أو فارغة رغم وجود تكلفة شراء!';
             END IF;
        ELSE
            RAISE NOTICE '   ✅ القيمة الحالية للأصل مسجلة بنجاح.';
        END IF;
    ELSE
        RAISE NOTICE '   ℹ️ لا توجد أصول للفحص.';
    END IF;

    RAISE NOTICE '--------------------------------------------------';
    RAISE NOTICE '🏁 انتهى الفحص.';
END $$;