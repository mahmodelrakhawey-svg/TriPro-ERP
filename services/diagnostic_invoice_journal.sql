-- 🧪 سكربت تشخيصي: التحقق من توليد القيود المحاسبية آلياً عند اعتماد الفاتورة
-- الوصف: يقوم باعتماد فاتورة وفحص النتائج في جداول القيود والأسطر.

DO $$
DECLARE
    v_invoice_id uuid;
    v_journal_id uuid;
    v_lines_count int;
BEGIN
    RAISE NOTICE '🚀 بدء اختبار أتمتة القيود المحاسبية...';

    -- 1. البحث عن فاتورة مسودة (Draft)
    SELECT id INTO v_invoice_id FROM public.invoices WHERE status = 'draft' LIMIT 1;

    -- 2. إذا لم توجد فاتورة مسودة، نقوم بإنشاء فاتورة اختبار سريعة
    IF v_invoice_id IS NULL THEN
        RAISE NOTICE 'ℹ️ لم يتم العثور على فاتورة مسودة، جاري إنشاء فاتورة اختبار مؤقتة...';
        
        INSERT INTO public.invoices (
            invoice_number, customer_id, invoice_date, total_amount, subtotal, status, warehouse_id, organization_id
        )
        SELECT 
            'DIAG-' || floor(random()*1000)::text, 
            (SELECT id FROM public.customers LIMIT 1),
            CURRENT_DATE, 1000, 1000, 'draft', 
            (SELECT id FROM public.warehouses LIMIT 1),
            (SELECT id FROM public.organizations LIMIT 1)
        WHERE EXISTS (SELECT 1 FROM public.customers) AND EXISTS (SELECT 1 FROM public.warehouses)
        RETURNING id INTO v_invoice_id;
    END IF;

    IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION '❌ فشل الاختبار: لا توجد بيانات أساسية (عملاء أو مستودعات) لإنشاء فاتورة اختبار.';
    END IF;

    -- 3. استدعاء دالة الاعتماد (التي قمنا بنشرها في الملف الثالث)
    RAISE NOTICE '⚙️ جاري تشغيل approve_invoice للفاتورة: %', v_invoice_id;
    PERFORM public.approve_invoice(v_invoice_id);

    -- 4. التحقق من النتيجة في جدول القيود (Journal Entries)
    SELECT id INTO v_journal_id FROM public.journal_entries 
    WHERE related_document_id = v_invoice_id AND related_document_type = 'invoice';

    IF v_journal_id IS NOT NULL THEN
        SELECT count(*) INTO v_lines_count FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
        
        RAISE NOTICE '✅ نجاح باهر!';
        RAISE NOTICE '📊 رقم القيد المنشأ: %', v_journal_id;
        RAISE NOTICE '📝 عدد أسطر القيد (المدين والدائن): % أسطر', v_lines_count;
    ELSE
        RAISE EXCEPTION '❌ فشل الاختبار: لم يتم إنشاء قيد محاسبي مرتبط بالفاتورة.';
    END IF;
END $$;