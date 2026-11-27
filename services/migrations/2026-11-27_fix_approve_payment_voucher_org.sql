-- 🌟 إصلاح عزل المنظمات في دالة اعتماد سند الصرف (approve_payment_voucher)
-- كان السطر السابق (SELECT id INTO v_org_id FROM public.organizations LIMIT 1) يربط القيد المحاسبي بأول شركة في قاعدة البيانات
-- بدلاً من شركة سند الصرف الفعلية (v_voucher.organization_id) في قواعد البيانات متعددة الشركات.

CREATE OR REPLACE FUNCTION public.approve_payment_voucher(
    p_voucher_id uuid,
    p_debit_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_voucher public.payment_vouchers%ROWTYPE;
    v_org_id uuid;
    v_journal_id uuid;
    v_exchange_rate numeric;
    v_amount_base numeric;
BEGIN
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود'; END IF;

    v_org_id := COALESCE(v_voucher.organization_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1));

    v_exchange_rate := COALESCE(v_voucher.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    IF v_voucher.treasury_account_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة/البنك (الدائن)'; END IF;
    IF p_debit_account_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد الحساب المدين (المورد/المصروف)'; END IF;

    v_amount_base := v_voucher.amount * v_exchange_rate;

    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_voucher.payment_date,
        'سند صرف رقم ' || COALESCE(v_voucher.voucher_number, '-') || (CASE WHEN v_voucher.currency IS NOT NULL AND v_voucher.currency != 'EGP' THEN ' (' || v_voucher.currency || ')' ELSE '' END),
        v_voucher.voucher_number,
        'posted',
        v_org_id,
        p_voucher_id,
        'payment_voucher',
        true
    ) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, p_debit_account_id, v_amount_base, 0, v_voucher.notes, v_org_id);

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_amount_base, v_voucher.notes, v_org_id);

    UPDATE public.payment_vouchers
    SET related_journal_entry_id = v_journal_id
    WHERE id = p_voucher_id;
END;
$$;
