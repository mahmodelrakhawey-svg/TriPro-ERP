-- 🧪 اختبار نهائي لسند القبض (متوافق مع هيكل البيانات لديك)
-- يرجى تشغيل هذا الملف في Supabase SQL Editor

DO $$
DECLARE
    v_org_id uuid;
    v_customer_id uuid;
    v_treasury_acc_id uuid;
    v_customer_acc_id uuid;
    v_voucher_id uuid;
    v_journal_id uuid;
BEGIN
    RAISE NOTICE '--- 🚀 بدء اختبار سند القبض (نسخة معدلة) ---';

    -- 1. التأكد من وجود منظمة
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    IF v_org_id IS NULL THEN
        INSERT INTO public.organizations (name) VALUES ('منظمة الاختبار') RETURNING id INTO v_org_id;
    END IF;

    -- 2. التأكد من الحسابات (بدون organization_id لتجنب الأخطاء)
    SELECT id INTO v_treasury_acc_id FROM public.accounts WHERE code LIKE '1101%' LIMIT 1;
    IF v_treasury_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group) 
        VALUES ('110101', 'الصندوق الرئيسي', 'ASSET', false) RETURNING id INTO v_treasury_acc_id;
    END IF;

    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1102' LIMIT 1;
    IF v_customer_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group) 
        VALUES ('1102', 'العملاء', 'ASSET', false) RETURNING id INTO v_customer_acc_id;
    END IF;

    -- 3. التأكد من العميل
    SELECT id INTO v_customer_id FROM public.customers LIMIT 1;
    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (name) VALUES ('عميل تجريبي') RETURNING id INTO v_customer_id;
    END IF;

    -- 4. إنشاء السند
    INSERT INTO public.receipt_vouchers (
        voucher_number, customer_id, receipt_date, amount, notes, treasury_account_id, payment_method, exchange_rate, currency
    ) VALUES (
        'TEST-' || floor(random()*10000)::text,
        v_customer_id,
        CURRENT_DATE,
        150.00,
        'تجربة نهائية',
        v_treasury_acc_id,
        'cash',
        1,
        'EGP'
    ) RETURNING id INTO v_voucher_id;

    -- 5. تنفيذ الاعتماد
    PERFORM public.approve_receipt_voucher(v_voucher_id, v_customer_acc_id);

    -- 6. التحقق
    SELECT related_journal_entry_id INTO v_journal_id FROM public.receipt_vouchers WHERE id = v_voucher_id;
    
    IF v_journal_id IS NOT NULL THEN
        RAISE NOTICE '✅ نجاح! تم إنشاء القيد رقم %', v_journal_id;
    ELSE
        RAISE EXCEPTION '❌ فشل إنشاء القيد';
    END IF;
END $$;