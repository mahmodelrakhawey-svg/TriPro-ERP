-- ==============================================================================
-- 🚀 تحديث: تحصين إدارة سلف الموظفين، إضافة إجراء الحذف، وإنشاء القيود المفقودة تلقائياً عند التعديل
-- File: sql_updates/2026-10-22_enhance_employee_advances_management.sql
-- ==============================================================================

-- 1. تحديث إجراء تعديل السلفة: يقوم بإنشاء قيد محاسبي فوراً إذا لم يكن موجوداً من قبل
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
        SELECT organization_id INTO v_org_id FROM public.employee_advances WHERE id = p_advance_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة الحالية للسلفة.';
    END IF;

    -- 1. التأكد من وجود السلفة وجلب مرجعها
    SELECT reference INTO v_ref
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو ليس لديك صلاحية تعديلها.';
    END IF;

    -- إذا لم يكن هناك مرجع للسلفة، نقوم بتوليد مرجع فريد لها
    IF v_ref IS NULL OR TRIM(v_ref) = '' THEN
        v_ref := 'ADV-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::text, 6, '0');
    END IF;

    -- 2. تحديث سجل السلفة
    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_date,
        advance_date = p_date,
        treasury_account_id = p_treasury_id,
        notes = p_notes,
        reference = v_ref
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

    -- 5. فتح تصريح تعديل القيود المالية
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- 6. فحص ما إذا كان هناك قيد محاسبي مسجل مسبقاً بهذا المرجع
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE reference = v_ref
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin')
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
        -- القيد موجود: فك ترحيله مؤقتاً لتحديث أسطره
        UPDATE public.journal_entries
        SET status = 'draft',
            is_posted = false,
            date = p_date,
            transaction_date = p_date,
            description = 'صرف سلفة للموظف ' || COALESCE(v_emp_name, '')
        WHERE id = v_journal_id;

        -- حذف الأسطر القديمة
        DELETE FROM public.journal_lines
        WHERE journal_entry_id = v_journal_id;

        -- إدراج الأسطر المحدثة
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

    ELSE
        -- 🌟 الحماية الاستباقية: القيد غير موجود! ننشئ قيداً جديداً فوراً
        IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
            INSERT INTO public.journal_entries (
                organization_id,
                entry_number,
                reference,
                date,
                transaction_date,
                description,
                status,
                is_posted
            ) VALUES (
                v_org_id,
                'JE-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0'),
                v_ref,
                p_date,
                p_date,
                'صرف سلفة للموظف ' || COALESCE(v_emp_name, ''),
                'posted',
                true
            ) RETURNING id INTO v_journal_id;

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
    END IF;

    -- إغلاق تصريح التعديل المالي
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) TO authenticated, service_role, anon;


-- 2. إنشاء إجراء حذف السلفة وإلغاء القيد المحاسبي بأمان
CREATE OR REPLACE FUNCTION public.delete_employee_advance(
    p_advance_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_ref text;
    v_status text;
    v_payroll_item_id uuid;
    v_journal_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id FROM public.employee_advances WHERE id = p_advance_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة الحالية للسلفة.';
    END IF;

    -- التحقق من السلفة وحالتها
    SELECT reference, status, payroll_item_id
    INTO v_ref, v_status, v_payroll_item_id
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو تم حذفها مسبقاً.';
    END IF;

    -- حماية السلف المخصومة في مسير الرواتب
    IF v_status = 'deducted' OR v_payroll_item_id IS NOT NULL THEN
        RAISE EXCEPTION 'لا يمكن حذف هذه السلفة؛ لأنها مسواة ومخصومة بالفعل في مسير رواتب الموظفين.';
    END IF;

    -- فتح تصريح تعديل القيود المالية
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- حذف القيد المحاسبي وأسطره إن وجد
    IF v_ref IS NOT NULL AND TRIM(v_ref) <> '' THEN
        FOR v_journal_id IN
            SELECT id FROM public.journal_entries
            WHERE reference = v_ref
              AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin')
        LOOP
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END LOOP;
    END IF;

    -- حذف سجل السلفة
    DELETE FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin');

    -- إغلاق تصريح التعديل المالي
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    -- إعادة احتساب الأرصدة
    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_employee_advance(uuid) TO authenticated, service_role, anon;
