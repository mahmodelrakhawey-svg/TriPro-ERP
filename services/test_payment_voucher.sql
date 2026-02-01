-- 🧪 اختبار دالة اعتماد سند الصرف (Payment Voucher)
-- يرجى تشغيل هذا الملف في Supabase SQL Editor

DO $$
DECLARE
    v_org_id uuid;
    v_supplier_id uuid;
    v_treasury_acc_id uuid;
    v_supplier_acc_id uuid;
    v_voucher_id uuid;
    v_journal_id uuid;
BEGIN
    RAISE NOTICE '--- 🚀 بدء اختبار سند الصرف ---';

    -- 1. التأكد من وجود منظمة
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    IF v_org_id IS NULL THEN
        INSERT INTO public.organizations (name) VALUES ('منظمة الاختبار') RETURNING id INTO v_org_id;
    END IF;

    -- 2. التأكد من الحسابات
    -- حساب الخزينة (الدائن في سند الصرف)
    SELECT id INTO v_treasury_acc_id FROM public.accounts WHERE code LIKE '1101%' LIMIT 1;
    IF v_treasury_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group) 
        VALUES ('110101', 'الصندوق الرئيسي', 'ASSET', false) RETURNING id INTO v_treasury_acc_id;
    END IF;

    -- حساب الموردين (المدين في سند الصرف)
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '2201' LIMIT 1;
    IF v_supplier_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group) 
        VALUES ('2201', 'الموردين', 'LIABILITY', false) RETURNING id INTO v_supplier_acc_id;
    END IF;

    -- 3. التأكد من وجود مورد
    SELECT id INTO v_supplier_id FROM public.suppliers LIMIT 1;
    IF v_supplier_id IS NULL THEN
        INSERT INTO public.suppliers (name) VALUES ('مورد تجريبي') RETURNING id INTO v_supplier_id;
    END IF;

    -- 4. إنشاء سند صرف تجريبي
    INSERT INTO public.payment_vouchers (
        voucher_number, supplier_id, payment_date, amount, notes, treasury_account_id, payment_method, exchange_rate, currency
    ) VALUES (
        'PAY-TEST-' || floor(random()*10000)::text,
        v_supplier_id,
        CURRENT_DATE,
        250.00,
        'تجربة صرف لمورد',
        v_treasury_acc_id,
        'cash',
        1,
        'EGP'
    ) RETURNING id INTO v_voucher_id;

    -- 5. تنفيذ الاعتماد
    PERFORM public.approve_payment_voucher(v_voucher_id, v_supplier_acc_id);

    -- 6. التحقق
    SELECT related_journal_entry_id INTO v_journal_id FROM public.payment_vouchers WHERE id = v_voucher_id;
    
    IF v_journal_id IS NOT NULL THEN
        RAISE NOTICE '✅ نجاح! تم إنشاء قيد سند الصرف رقم %', v_journal_id;
    ELSE
        RAISE EXCEPTION '❌ فشل إنشاء القيد لسند الصرف';
    END IF;
END $$;