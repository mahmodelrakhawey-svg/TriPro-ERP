-- ==============================================================================
-- 🚀 تحديث: إضافة إجراء تعديل سلفة الموظف ومزامنة القيد المحاسبي
-- File: sql_updates/2026-10-08_add_update_employee_advance_rpc.sql
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_employee_advance(
    p_advance_id uuid,
    p_employee_id uuid,
    p_amount numeric,
    p_date date,
    p_treasury_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_ref text;
    v_journal_id uuid;
    v_emp_name text;
    v_advances_acc_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        -- Fallback إذا لم يتم جلب المنظمة من الـ JWT
        SELECT organization_id INTO v_org_id FROM public.employee_advances WHERE id = p_advance_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة الحالية للسلفة.';
    END IF;

    -- 1. التأكد من وجود السلفة
    SELECT reference INTO v_ref
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو ليس لديك صلاحية تعديلها.';
    END IF;

    -- 2. تحديث سجل السلفة
    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_date,
        advance_date = p_date,
        treasury_account_id = p_treasury_id,
        notes = p_notes
    WHERE id = p_advance_id;

    -- 3. جلب اسم الموظف
    SELECT COALESCE(full_name, name, 'موظف') INTO v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    -- 4. جلب حساب سلف الموظفين (1223)
    SELECT id INTO v_advances_acc_id
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1223' OR name LIKE '%سلف%')
    ORDER BY CASE WHEN code = '1223' THEN 1 ELSE 2 END
    LIMIT 1;

    -- 5. مزامنة القيد المحاسبي إن وجد مرجع
    IF v_ref IS NOT NULL AND v_ref <> '' THEN
        SELECT id INTO v_journal_id
        FROM public.journal_entries
        WHERE reference = v_ref
          AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin')
        LIMIT 1;

        IF v_journal_id IS NOT NULL THEN
            -- فك الترحيل مؤقتاً لتخطي حماية أسطر القيود المرحّلة
            UPDATE public.journal_entries
            SET status = 'draft',
                is_posted = false,
                transaction_date = p_date,
                description = 'صرف سلفة للموظف ' || COALESCE(v_emp_name, '')
            WHERE id = v_journal_id;

            -- حذف الأسطر القديمة
            DELETE FROM public.journal_lines
            WHERE journal_entry_id = v_journal_id;

            -- إدراج الأسطر الجديدة
            IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
                -- مدين: سلف العاملين
                INSERT INTO public.journal_lines (
                    journal_entry_id, account_id, debit, credit, description, organization_id
                ) VALUES (
                    v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id
                );

                -- دائن: الخزينة أو البنك
                INSERT INTO public.journal_lines (
                    journal_entry_id, account_id, debit, credit, description, organization_id
                ) VALUES (
                    v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id
                );
            END IF;

            -- إعادة ترحيل القيد
            UPDATE public.journal_entries
            SET status = 'posted',
                is_posted = true
            WHERE id = v_journal_id;
        END IF;
    END IF;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) TO service_role;
