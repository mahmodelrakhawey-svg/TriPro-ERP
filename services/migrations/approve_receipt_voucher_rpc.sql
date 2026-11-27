-- 🌟 دالة اعتماد سند القبض الآمنة (Secure Receipt Voucher Approval RPC)
-- هذا الملف يجب تنفيذه في Supabase SQL Editor

-- 1. التأكد من وجود عمود لربط السند بالقيد
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipt_vouchers' AND column_name = 'related_journal_entry_id') THEN 
        ALTER TABLE public.receipt_vouchers ADD COLUMN related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF; 
END $$;

-- 2. إنشاء الدالة
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(
    p_voucher_id uuid,
    p_credit_account_id uuid
)
RETURNS void
AS $$
DECLARE
    v_voucher public.receipt_vouchers%ROWTYPE;
    v_org_id uuid;
    v_journal_id uuid;
    v_exchange_rate numeric;
    v_amount_base numeric;
BEGIN
    -- أ. التحقق من السند
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود'; END IF;

    v_org_id := COALESCE(v_voucher.organization_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1));

    -- تحديد سعر الصرف (الافتراضي 1)
    v_exchange_rate := COALESCE(v_voucher.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- ب. التحقق من الحسابات
    IF v_voucher.treasury_account_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة/البنك (المدين)'; END IF;
    IF p_credit_account_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد الحساب الدائن (العميل/الإيراد)'; END IF;

    -- حساب المبلغ بالعملة المحلية
    v_amount_base := v_voucher.amount * v_exchange_rate;

    -- ج. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_voucher.receipt_date, 
        'سند قبض رقم ' || COALESCE(v_voucher.voucher_number, '-') || (CASE WHEN v_voucher.currency IS NOT NULL AND v_voucher.currency != 'SAR' THEN ' (' || v_voucher.currency || ')' ELSE '' END), 
        v_voucher.voucher_number, 
        'posted', 
        v_org_id,
        p_voucher_id,
        'receipt_voucher',
        true
    ) RETURNING id INTO v_journal_id;

    -- د. إنشاء أسطر القيد (بالعملة المحلية)
    -- 1. المدين: الخزينة/البنك
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_voucher.treasury_account_id, v_amount_base, 0, v_voucher.notes, v_org_id);

    -- 2. الدائن: العميل أو حساب الإيراد
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, p_credit_account_id, 0, v_amount_base, v_voucher.notes, v_org_id);

    -- هـ. تحديث حالة السند (إذا كان له حالة) وربطه بالقيد
    UPDATE public.receipt_vouchers 
    SET related_journal_entry_id = v_journal_id
    WHERE id = p_voucher_id;
END;
$$ LANGUAGE plpgsql;