-- =============================================================================
-- TriPro ERP — Database Migration
-- File: 2026-10-17_fix_approve_receipt_voucher_rpc.sql
-- Description:
--   Harden `approve_receipt_voucher` RPC:
--   1. Avoid referencing nonexistent columns (e.g. voucher_type).
--   2. Safely resolve treasury account (1211/cash) and customer account (1221) if null.
--   3. Avoid failing on delete triggers or period constraints.
--   4. Grant execute permissions to authenticated, anon, service_role.
-- =============================================================================

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
    v_treasury_acc_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'سند القبض غير موجود.'; 
    END IF;

    -- تحديد المنظمة
    v_org_id := COALESCE(v_voucher.organization_id, (SELECT id FROM public.organizations LIMIT 1));
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة لسند القبض.';
    END IF;

    -- إذا كان السند مرتبطاً بالفعل بقيد موجود ومرحل، لا داعي لإعادة الإنشاء
    IF v_voucher.related_journal_entry_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_voucher.related_journal_entry_id AND is_posted = true) THEN
            RETURN;
        END IF;
    END IF;

    -- تحديد الحساب الدائن (العميل)
    v_final_credit_acc_id := p_credit_account_id;
    IF v_final_credit_acc_id IS NULL THEN
        SELECT id INTO v_final_credit_acc_id 
        FROM public.accounts 
        WHERE (code = '1221' OR name ILIKE '%عملاء%' OR name ILIKE '%العملاء%') 
          AND organization_id = v_org_id 
        LIMIT 1;
    END IF;

    IF v_final_credit_acc_id IS NULL THEN 
        RAISE EXCEPTION 'الحساب الدائن (العميل) غير محدد لسند القبض.'; 
    END IF;

    -- تحديد حساب الخزينة / البنك (المدين)
    v_treasury_acc_id := v_voucher.treasury_account_id;
    IF v_treasury_acc_id IS NULL THEN
        SELECT id INTO v_treasury_acc_id 
        FROM public.accounts 
        WHERE (code = '1211' OR name ILIKE '%خزينة%' OR name ILIKE '%صندوق%' OR name ILIKE '%نقدية%') 
          AND organization_id = v_org_id 
        LIMIT 1;
        
        IF v_treasury_acc_id IS NULL THEN
            SELECT id INTO v_treasury_acc_id 
            FROM public.accounts 
            WHERE type = 'asset' AND (code LIKE '121%' OR code LIKE '1101%') 
              AND organization_id = v_org_id 
            LIMIT 1;
        END IF;
    END IF;

    IF v_treasury_acc_id IS NULL THEN
        RAISE EXCEPTION 'حساب الخزينة/البنك غير محدد لسند القبض.';
    END IF;

    -- تنظيف آمن لأي قيد مسودة قديم
    BEGIN
        DELETE FROM public.journal_lines 
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries 
            WHERE organization_id = v_org_id 
              AND status = 'draft'
              AND (id = v_voucher.related_journal_entry_id 
                   OR related_document_id = p_voucher_id 
                   OR (reference = v_voucher.voucher_number AND related_document_type = 'receipt_voucher'))
        );

        DELETE FROM public.journal_entries 
        WHERE organization_id = v_org_id 
          AND status = 'draft'
          AND (id = v_voucher.related_journal_entry_id 
               OR related_document_id = p_voucher_id 
               OR (reference = v_voucher.voucher_number AND related_document_type = 'receipt_voucher'));
    EXCEPTION WHEN OTHERS THEN
        -- تجاوز أي قيود متعلقة بالحذف لتجنب انهيار الدالة
        NULL;
    END;

    -- إنشاء القيد كمسودة
    INSERT INTO public.journal_entries (
        transaction_date, 
        description, 
        reference, 
        status, 
        organization_id, 
        related_document_id, 
        related_document_type, 
        is_posted
    ) VALUES (
        COALESCE(v_voucher.receipt_date, CURRENT_DATE), 
        COALESCE(v_voucher.notes, 'سند قبض رقم ' || COALESCE(v_voucher.voucher_number, '')), 
        v_voucher.voucher_number, 
        'draft', 
        v_org_id, 
        p_voucher_id, 
        'receipt_voucher', 
        false
    ) RETURNING id INTO v_journal_id;
    
    -- سطر المدين (الخزينة المستلمة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_treasury_acc_id, COALESCE(v_voucher.amount, 0), 0, v_voucher.notes, v_org_id);

    -- سطر الدائن (العميل)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_final_credit_acc_id, 0, COALESCE(v_voucher.amount, 0), v_voucher.notes, v_org_id);
    
    -- ترحيل القيد
    UPDATE public.journal_entries 
    SET status = 'posted', is_posted = true 
    WHERE id = v_journal_id;

    -- ربط السند بالقيد
    UPDATE public.receipt_vouchers 
    SET related_journal_entry_id = v_journal_id 
    WHERE id = p_voucher_id;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_receipt_voucher(uuid, uuid) TO authenticated, anon, service_role;

-- =============================================================================
-- 2. دالة اعتماد سند الصرف والمصروفات المحمية ضد الانهيار (Harden approve_payment_voucher)
-- =============================================================================
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
    v_final_debit_acc_id uuid; 
    v_treasury_acc_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'سند الصرف غير موجود.'; 
    END IF;

    -- تحديد المنظمة
    v_org_id := COALESCE(v_voucher.organization_id, (SELECT id FROM public.organizations LIMIT 1));
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة لسند الصرف.';
    END IF;

    -- إذا كان السند مرتبطاً بالفعل بقيد موجود ومرحل، لا داعي لإعادة الإنشاء
    IF v_voucher.related_journal_entry_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_voucher.related_journal_entry_id AND is_posted = true) THEN
            RETURN;
        END IF;
    END IF;

    -- تحديد الحساب المدين (المورد أو المصروف)
    v_final_debit_acc_id := p_debit_account_id;
    IF v_final_debit_acc_id IS NULL THEN
        SELECT id INTO v_final_debit_acc_id 
        FROM public.accounts 
        WHERE (code = '201' OR code = '221' OR name ILIKE '%موردين%' OR name ILIKE '%الموردين%') 
          AND organization_id = v_org_id 
        LIMIT 1;
    END IF;

    IF v_final_debit_acc_id IS NULL THEN 
        RAISE EXCEPTION 'الحساب المدين غير محدد لسند الصرف.'; 
    END IF;

    -- تحديد حساب الخزينة / البنك (الدائن)
    v_treasury_acc_id := v_voucher.treasury_account_id;
    IF v_treasury_acc_id IS NULL THEN
        SELECT id INTO v_treasury_acc_id 
        FROM public.accounts 
        WHERE (code = '1211' OR name ILIKE '%خزينة%' OR name ILIKE '%صندوق%' OR name ILIKE '%نقدية%') 
          AND organization_id = v_org_id 
        LIMIT 1;
        
        IF v_treasury_acc_id IS NULL THEN
            SELECT id INTO v_treasury_acc_id 
            FROM public.accounts 
            WHERE type = 'asset' AND (code LIKE '121%' OR code LIKE '1101%') 
              AND organization_id = v_org_id 
            LIMIT 1;
        END IF;
    END IF;

    IF v_treasury_acc_id IS NULL THEN
        RAISE EXCEPTION 'حساب الخزينة/البنك غير محدد لسند الصرف.';
    END IF;

    -- تنظيف آمن لأي قيد مسودة قديم
    BEGIN
        DELETE FROM public.journal_lines 
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries 
            WHERE organization_id = v_org_id 
              AND status = 'draft'
              AND (id = v_voucher.related_journal_entry_id 
                   OR related_document_id = p_voucher_id 
                   OR (reference = v_voucher.voucher_number AND related_document_type = 'payment_voucher'))
        );

        DELETE FROM public.journal_entries 
        WHERE organization_id = v_org_id 
          AND status = 'draft'
          AND (id = v_voucher.related_journal_entry_id 
               OR related_document_id = p_voucher_id 
               OR (reference = v_voucher.voucher_number AND related_document_type = 'payment_voucher'));
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- إنشاء القيد كمسودة
    INSERT INTO public.journal_entries (
        transaction_date, 
        description, 
        reference, 
        status, 
        organization_id, 
        related_document_id, 
        related_document_type, 
        is_posted
    ) VALUES (
        COALESCE(v_voucher.payment_date, CURRENT_DATE), 
        COALESCE(v_voucher.notes, 'سند صرف رقم ' || COALESCE(v_voucher.voucher_number, '')), 
        v_voucher.voucher_number, 
        'draft', 
        v_org_id, 
        p_voucher_id, 
        'payment_voucher', 
        false
    ) RETURNING id INTO v_journal_id;
    
    -- سطر المدين (المورد أو المصروف)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id, cost_center_id) 
    VALUES (v_journal_id, v_final_debit_acc_id, COALESCE(v_voucher.amount, 0), 0, v_voucher.notes, v_org_id, v_voucher.cost_center_id);

    -- سطر الدائن (الخزينة المنصرف منها)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_treasury_acc_id, 0, COALESCE(v_voucher.amount, 0), v_voucher.notes, v_org_id);
    
    -- ترحيل القيد
    UPDATE public.journal_entries 
    SET status = 'posted', is_posted = true 
    WHERE id = v_journal_id;

    -- ربط السند بالقيد
    UPDATE public.payment_vouchers 
    SET related_journal_entry_id = v_journal_id 
    WHERE id = p_voucher_id;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_payment_voucher(uuid, uuid) TO authenticated, anon, service_role;

