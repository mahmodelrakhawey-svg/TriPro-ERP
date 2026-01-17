-- 🧪 سكربت اختبار دالة اعتماد سند القبض
-- يرجى تنفيذه في Supabase SQL Editor ومراقبة تبويب "Messages" أو "Results"

DO $$
DECLARE
    v_org_id uuid;
    v_customer_id uuid;
    v_treasury_acc_id uuid;
    v_customer_acc_id uuid;
    v_voucher_id uuid;
    v_journal_id uuid;
    v_lines_count integer;
BEGIN
    RAISE NOTICE '--- 🚀 بدء اختبار سند القبض ---';

    -- 0. التأكد من وجود منظمة (وإلا إنشاؤها)
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    IF v_org_id IS NULL THEN
        INSERT INTO public.organizations (name) VALUES ('منظمة الاختبار') RETURNING id INTO v_org_id;
    END IF;

    -- 1. البحث عن معرفات صالحة للاختبار (وإنشاؤها إذا لم توجد)
    SELECT id INTO v_customer_id FROM public.customers LIMIT 1;
    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (name) VALUES ('عميل تجريبي') RETURNING id INTO v_customer_id;
    END IF;

    -- البحث عن حساب الصندوق (عادة يبدأ بـ 1101)
    SELECT id INTO v_treasury_acc_id FROM public.accounts WHERE code LIKE '1101%' LIMIT 1;
    IF v_treasury_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group) 
        VALUES ('110101', 'الصندوق الرئيسي', 'ASSET', false) RETURNING id INTO v_treasury_acc_id;
    END IF;

    -- البحث عن حساب العملاء (1102)
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1102' LIMIT 1;
    IF v_customer_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group) 
        VALUES ('1102', 'العملاء', 'ASSET', false) RETURNING id INTO v_customer_acc_id;
    END IF;

    -- 2. إنشاء سند قبض تجريبي
    INSERT INTO public.receipt_vouchers (
        voucher_number, customer_id, receipt_date, amount, notes, treasury_account_id, payment_method, exchange_rate, currency
    ) VALUES (
        'TEST-RPC-' || floor(random()*1000)::text,
        v_customer_id,
        CURRENT_DATE,
        100.00,
        'تجربة دالة الاعتماد الآلي',
        v_treasury_acc_id,
        'cash',
        1,
        'SAR'
    ) RETURNING id INTO v_voucher_id;

    RAISE NOTICE '✅ تم إنشاء السند التجريبي برقم المعرف: %', v_voucher_id;

    -- 3. تنفيذ الدالة (هنا يتم الاختبار الفعلي)
    PERFORM public.approve_receipt_voucher(v_voucher_id, v_customer_acc_id);

    -- 4. التحقق من النتيجة
    SELECT related_journal_entry_id INTO v_journal_id FROM public.receipt_vouchers WHERE id = v_voucher_id;

    IF v_journal_id IS NOT NULL THEN
        RAISE NOTICE '✅ نجاح باهر! تم إنشاء القيد المحاسبي وربطه بالسند. رقم القيد: %', v_journal_id;
    ELSE
        RAISE EXCEPTION '❌ فشل: لم يتم إنشاء القيد المحاسبي أو لم يتم تحديث السند.';
    END IF;
END $$;