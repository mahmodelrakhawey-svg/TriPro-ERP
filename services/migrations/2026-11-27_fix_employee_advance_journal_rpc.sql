-- 🛡️ إصلاح إنشاء وتحديث القيود المحاسبية لسلف الموظفين (create_employee_advance / update_employee_advance)
-- 1. أولوية organization_id من سجل الموظف ثم public.get_my_org() لضمان دقة الشركة عند تعدد الشركات
-- 2. البحث عن حساب سلف العاملين من company_settings.account_mappings أو الكود 1223 أو الاسم، مع إنشائه تلقائياً إن لم يتوفر
-- 3. إدراج القيد كـ draft ثم السطور ثم posted ليتوافق تماماً مع حراس التوازن في قاعدة البيانات

CREATE OR REPLACE FUNCTION public.create_employee_advance(
    p_employee_id uuid,
    p_amount numeric,
    p_date date,
    p_treasury_id uuid,
    p_notes text DEFAULT NULL,
    p_allow_duplicate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_ref text;
    v_advance_id uuid;
    v_journal_id uuid;
    v_emp_name text;
    v_advances_acc_id uuid;
    v_mappings jsonb;
    v_recent_count int;
BEGIN
    IF p_employee_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد الموظف المستفيد من السلفة.';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ السلفة يجب أن يكون أكبر من الصفر.';
    END IF;

    IF p_treasury_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد حساب الخزينة أو البنك المنصرف منه.';
    END IF;

    SELECT organization_id, COALESCE(full_name, name, 'موظف')
    INTO v_org_id, v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    IF v_org_id IS NULL THEN
        v_org_id := public.get_my_org();
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة للموظف.';
    END IF;

    IF NOT p_allow_duplicate THEN
        SELECT COUNT(*) INTO v_recent_count
        FROM public.employee_advances
        WHERE employee_id = p_employee_id
          AND organization_id = v_org_id
          AND amount = p_amount
          AND (
              created_at >= (now() - interval '15 minutes')
              OR advance_date = p_date
              OR request_date = p_date
          );

        IF v_recent_count > 0 THEN
            RAISE EXCEPTION 'DUPLICATE_ADVANCE_DETECTED: تم تسجيل سلفة مطابقة للموظف بنفس المبلغ (%). إذا كنت متأكداً من صرف سلفة أخرى إضافية يرجى تأكيد الصرف.', p_amount;
        END IF;
    END IF;

    v_ref := 'ADV-' || to_char(COALESCE(p_date, CURRENT_DATE), 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0');

    INSERT INTO public.employee_advances (
        organization_id, employee_id, amount, request_date, advance_date, status, notes, treasury_account_id, reference
    ) VALUES (
        v_org_id, p_employee_id, p_amount, p_date, p_date, 'paid', p_notes, p_treasury_id, v_ref
    ) RETURNING id INTO v_advance_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1;

    v_advances_acc_id := COALESCE(
        public.safe_cast_uuid(v_mappings->>'EMPLOYEE_ADVANCES'),
        (SELECT id FROM public.accounts
         WHERE organization_id = v_org_id
           AND COALESCE(is_group, false) = false
           AND (code IN ('1223', '122301', '1104') OR name LIKE '%سلف%' OR name LIKE '%قروض%')
         ORDER BY CASE WHEN code = '1223' THEN 1 WHEN name LIKE '%سلف%' THEN 2 ELSE 3 END
         LIMIT 1)
    );

    IF v_advances_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group, organization_id)
        VALUES ('1223', 'سلف العاملين', 'ASSET', false, v_org_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_advances_acc_id;

        IF v_advances_acc_id IS NULL THEN
            SELECT id INTO v_advances_acc_id
            FROM public.accounts
            WHERE organization_id = v_org_id AND code = '1223'
            LIMIT 1;
        END IF;
    END IF;

    IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

        INSERT INTO public.journal_entries (
            organization_id, reference, transaction_date, description, status, is_posted, related_document_id, related_document_type, user_id
        ) VALUES (
            v_org_id, v_ref, p_date, 'صرف سلفة للموظف ' || COALESCE(v_emp_name, ''), 'draft', false, v_advance_id, 'employee_advance', auth.uid()
        ) RETURNING id INTO v_journal_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id);

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id);

        UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    END IF;

    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'advance_id', v_advance_id,
        'reference', v_ref,
        'journal_id', v_journal_id,
        'employee_name', v_emp_name,
        'amount', p_amount
    );
EXCEPTION
    WHEN OTHERS THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE;
END;
$$;
