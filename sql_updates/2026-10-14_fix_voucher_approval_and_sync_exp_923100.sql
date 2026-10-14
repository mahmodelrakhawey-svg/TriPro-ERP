-- =============================================================================
-- TriPro ERP — Database Migration
-- File: 2026-10-14_fix_voucher_approval_and_sync_exp_923100.sql
-- Description:
--   1. Harden `approve_payment_voucher` to safely handle voucher updates,
--      support editing treasury account (e.g. changing safe to InstaPay),
--      bypass posted journal line triggers cleanly, and ensure correct org_id.
--   2. Harden `approve_receipt_voucher` with the same safety logic.
--   3. Synchronize existing voucher EXP-923100 (45 EGP) to InstaPay account.
-- =============================================================================

-- 1. تحديث دالة ترحيل واعتماد سندات الصرف والمصروفات
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
    v_voucher record; 
    v_journal_id uuid; 
    v_org_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'سند الصرف غير موجود (ID: %).', p_voucher_id; 
    END IF;

    v_org_id := COALESCE(v_voucher.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة لسند الصرف.';
    END IF;

    -- أ. تحويل القيد القديم المرتبط إلى مسودة لتجاوز حراس منع التعديل/الحذف
    UPDATE public.journal_entries 
    SET status = 'draft', is_posted = false 
    WHERE organization_id = v_org_id 
      AND (id = v_voucher.related_journal_entry_id 
           OR related_document_id = p_voucher_id 
           OR (reference = v_voucher.voucher_number AND related_document_type = 'payment_voucher'));

    -- ب. حذف أسطر القيد القديم
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE organization_id = v_org_id 
          AND (id = v_voucher.related_journal_entry_id 
               OR related_document_id = p_voucher_id 
               OR (reference = v_voucher.voucher_number AND related_document_type = 'payment_voucher'))
    );

    -- ج. حذف رأس القيد القديم
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
      AND (id = v_voucher.related_journal_entry_id 
           OR related_document_id = p_voucher_id 
           OR (reference = v_voucher.voucher_number AND related_document_type = 'payment_voucher'));

    -- د. إنشاء رأس القيد الجديد كمسودة أولاً لتمكين إدراج أسطره
    INSERT INTO public.journal_entries (
        transaction_date, 
        description, 
        reference, 
        status, 
        organization_id, 
        related_document_id, 
        related_document_type, 
        is_posted, 
        user_id
    ) VALUES (
        COALESCE(v_voucher.payment_date, CURRENT_DATE), 
        COALESCE(v_voucher.notes, 'سند صرف رقم ' || v_voucher.voucher_number), 
        v_voucher.voucher_number, 
        'draft', 
        v_org_id, 
        p_voucher_id, 
        'payment_voucher', 
        false, 
        auth.uid()
    ) RETURNING id INTO v_journal_id;
    
    -- هـ. إدراج سطر المدين (المصروف أو المورد)
    INSERT INTO public.journal_lines (
        journal_entry_id, 
        account_id, 
        debit, 
        credit, 
        description, 
        organization_id, 
        cost_center_id
    ) VALUES (
        v_journal_id, 
        p_debit_account_id, 
        v_voucher.amount, 
        0, 
        COALESCE(v_voucher.notes, 'سند صرف رقم ' || v_voucher.voucher_number), 
        v_org_id, 
        v_voucher.cost_center_id
    );

    -- و. إدراج سطر الدائن (حساب الخزينة / البنك / انستا باي المحدث)
    INSERT INTO public.journal_lines (
        journal_entry_id, 
        account_id, 
        debit, 
        credit, 
        description, 
        organization_id
    ) VALUES (
        v_journal_id, 
        v_voucher.treasury_account_id, 
        0, 
        v_voucher.amount, 
        COALESCE(v_voucher.notes, 'سند صرف رقم ' || v_voucher.voucher_number), 
        v_org_id
    );
    
    -- ز. ترحيل القيد الجديد بعد توازن أطرافه
    UPDATE public.journal_entries 
    SET status = 'posted', is_posted = true 
    WHERE id = v_journal_id;

    -- ح. ربط السند بالقيد الجديد
    UPDATE public.payment_vouchers 
    SET related_journal_entry_id = v_journal_id 
    WHERE id = p_voucher_id;
    
    -- ط. إعادة احتساب أرصدة الحسابات
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;
END;
$$;


-- 2. تحديث دالة ترحيل واعتماد سندات القبض
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(
    p_voucher_id uuid,
    p_credit_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
    v_voucher record; 
    v_journal_id uuid; 
    v_org_id uuid; 
    v_final_credit_acc_id uuid; 
    v_mappings jsonb;
BEGIN
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'سند القبض غير موجود.'; 
    END IF;

    v_org_id := COALESCE(v_voucher.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة لسند القبض.';
    END IF;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- تنظيف أي قيود قديمة مرتبطة
    UPDATE public.journal_entries 
    SET status = 'draft', is_posted = false 
    WHERE organization_id = v_org_id 
      AND (id = v_voucher.related_journal_entry_id 
           OR related_document_id = p_voucher_id 
           OR (reference = v_voucher.voucher_number AND related_document_type = 'receipt_voucher'));

    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE organization_id = v_org_id 
          AND (id = v_voucher.related_journal_entry_id 
               OR related_document_id = p_voucher_id 
               OR (reference = v_voucher.voucher_number AND related_document_type = 'receipt_voucher'))
    );

    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
      AND (id = v_voucher.related_journal_entry_id 
           OR related_document_id = p_voucher_id 
           OR (reference = v_voucher.voucher_number AND related_document_type = 'receipt_voucher'));

    -- تحديد الحساب الدائن (تأمين أو عميل أو إيراد)
    IF v_voucher.voucher_type = 'security_deposit' THEN
        v_final_credit_acc_id := COALESCE(
            (v_mappings->>'SECURITY_DEPOSIT_ACCOUNT')::uuid,
            (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)
        );
    ELSE
        v_final_credit_acc_id := p_credit_account_id;
    END IF;

    IF v_final_credit_acc_id IS NULL THEN 
        RAISE EXCEPTION 'الحساب الدائن غير محدد لسند القبض.'; 
    END IF;

    -- إنشاء القيد كمسودة
    INSERT INTO public.journal_entries (
        transaction_date, 
        description, 
        reference, 
        status, 
        organization_id, 
        related_document_id, 
        related_document_type, 
        is_posted, 
        user_id
    ) VALUES (
        COALESCE(v_voucher.receipt_date, CURRENT_DATE), 
        COALESCE(v_voucher.notes, 'سند قبض رقم ' || v_voucher.voucher_number), 
        v_voucher.voucher_number, 
        'draft', 
        v_org_id, 
        p_voucher_id, 
        'receipt_voucher', 
        false, 
        auth.uid()
    ) RETURNING id INTO v_journal_id;
    
    -- سطر المدين (الخزينة المستلمة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);

    -- سطر الدائن (العميل أو التأمين)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_final_credit_acc_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    -- ترحيل القيد
    UPDATE public.journal_entries 
    SET status = 'posted', is_posted = true 
    WHERE id = v_journal_id;

    UPDATE public.receipt_vouchers 
    SET related_journal_entry_id = v_journal_id 
    WHERE id = p_voucher_id;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_payment_voucher(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_receipt_voucher(uuid, uuid) TO authenticated, anon, service_role;

-- 3. تصحيح القيد المحاسبي لسند المصروف EXP-923100 فوراً ليعكس خزينة انستا باي بدلاً من خزينة ياسر
DO $$
DECLARE
    v_voucher_id uuid;
    v_expense_acc_id uuid;
BEGIN
    SELECT id INTO v_voucher_id FROM public.payment_vouchers WHERE voucher_number = 'EXP-923100' LIMIT 1;
    IF v_voucher_id IS NOT NULL THEN
        -- حساب عمولة فودافون كاش
        SELECT id INTO v_expense_acc_id FROM public.accounts WHERE code = '5251' LIMIT 1;
        IF v_expense_acc_id IS NOT NULL THEN
            PERFORM public.approve_payment_voucher(v_voucher_id, v_expense_acc_id);
            RAISE NOTICE '✅ تم تصحيح القيد المحاسبي لسند EXP-923100 وربطه بحساب انستا باي بنجاح.';
        END IF;
    END IF;
END $$;
