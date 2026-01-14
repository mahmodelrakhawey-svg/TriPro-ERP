-- 🌟 دالة اعتماد سند الصرف الآمنة (Secure Payment Voucher Approval RPC)
-- هذا الملف يجب تنفيذه في Supabase SQL Editor

-- 1. التأكد من وجود عمود لربط السند بالقيد
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_vouchers' AND column_name = 'related_journal_entry_id') THEN 
        ALTER TABLE public.payment_vouchers ADD COLUMN related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF; 
END $$;

-- 2. إنشاء الدالة
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(
    p_voucher_id uuid,
    p_debit_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_voucher record;
    v_org_id uuid;
    v_journal_id uuid;
    v_exchange_rate numeric;
    v_amount_base numeric;
BEGIN
    -- أ. التحقق من السند
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    -- تحديد سعر الصرف (الافتراضي 1)
    v_exchange_rate := COALESCE(v_voucher.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- ب. التحقق من الحسابات
    IF v_voucher.treasury_account_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة/البنك (الدائن)'; END IF;
    IF p_debit_account_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد الحساب المدين (المورد/المصروف)'; END IF;

    -- حساب المبلغ بالعملة المحلية
    v_amount_base := v_voucher.amount * v_exchange_rate;

    -- ج. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_voucher.payment_date, 
        'سند صرف رقم ' || COALESCE(v_voucher.voucher_number, '-') || (CASE WHEN v_voucher.currency IS NOT NULL AND v_voucher.currency != 'SAR' THEN ' (' || v_voucher.currency || ')' ELSE '' END), 
        v_voucher.voucher_number, 
        'posted', 
        v_org_id,
        p_voucher_id,
        'payment_voucher',
        true
    ) RETURNING id INTO v_journal_id;

    -- د. إنشاء أسطر القيد (بالعملة المحلية)
    -- 1. المدين: المورد أو المصروف
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, p_debit_account_id, v_amount_base, 0, v_voucher.notes, v_org_id);

    -- 2. الدائن: الخزينة/البنك
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_amount_base, v_voucher.notes, v_org_id);

    -- هـ. تحديث حالة السند وربطه بالقيد
    UPDATE public.payment_vouchers 
    SET related_journal_entry_id = v_journal_id
    WHERE id = p_voucher_id;
END;
$$;