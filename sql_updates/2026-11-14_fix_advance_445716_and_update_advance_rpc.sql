-- ==============================================================================
-- 🚀 تحديث: معالجة وتصحيح قيد سلفة الموظف ADV-445716 وإزالة التكرار وتحديث دالة update_employee_advance
-- File: sql_updates/2026-11-14_fix_advance_445716_and_update_advance_rpc.sql
-- ==============================================================================

-- 0. فتح تصريح تعديل القيود المالية للجلسة
SELECT set_config('app.allow_financial_ledger_mutation', 'true', false);

-- ==============================================================================
-- 1. تصحيح القيد ADV-445716 وإزالة التكرار (من 400 ج.م إلى 200 ج.م) وتحديث اسم الموظف
-- ==============================================================================
DO $$
DECLARE
    v_org_id uuid;
    v_journal_id uuid;
    v_new_emp_id uuid;
    v_new_emp_name text;
    v_advances_acc_id uuid;
    v_treasury_acc_id uuid;
BEGIN
    -- 1. البحث عن الموظف الصحيح (محمد هانى سعيد)
    SELECT id, COALESCE(full_name, name)
    INTO v_new_emp_id, v_new_emp_name
    FROM public.employees
    WHERE full_name ILIKE '%محمد هان%سعيد%' OR full_name ILIKE '%محمد هاني سعيد%'
    LIMIT 1;

    IF v_new_emp_id IS NULL THEN
        SELECT id, COALESCE(full_name, name)
        INTO v_new_emp_id, v_new_emp_name
        FROM public.employees
        WHERE full_name ILIKE '%سعيد%'
        LIMIT 1;
    END IF;

    -- 2. جلب القيد المحاسبي ADV-445716
    SELECT id, organization_id
    INTO v_journal_id, v_org_id
    FROM public.journal_entries
    WHERE reference ILIKE '%445716%'
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
        -- جلب حساب السلف وحساب الخزينة من أسطر القيد الحالي
        SELECT account_id INTO v_advances_acc_id
        FROM public.journal_lines
        WHERE journal_entry_id = v_journal_id AND debit > 0
        LIMIT 1;

        SELECT account_id INTO v_treasury_acc_id
        FROM public.journal_lines
        WHERE journal_entry_id = v_journal_id AND credit > 0
        LIMIT 1;

        -- حذف كافة الأسطر المكررة للقيد
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;

        -- إدراج السطرين الصحيحين فقط (200 ج.م مدين و 200 ج.م دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES
        (v_journal_id, v_advances_acc_id, 200.00, 0, 'سلفة موظف - ' || COALESCE(v_new_emp_name, 'محمد هانى سعيد'), v_org_id),
        (v_journal_id, v_treasury_acc_id, 0, 200.00, 'صرف نقدية لسلفة', v_org_id);

        -- تحديث رأس القيد بالوصف الصحيح واسم الموظف الصحيح
        UPDATE public.journal_entries
        SET description = 'صرف سلفة للموظف ' || COALESCE(v_new_emp_name, 'محمد هانى سعيد')
        WHERE id = v_journal_id;

        RAISE NOTICE '✅ تم تصحيح القيد ADV-445716 بنجاح وإزالة التكرار وضبط القيمة على 200 ج.م.';
    ELSE
        RAISE NOTICE '⚠️ لم يتم العثور على القيد ADV-445716.';
    END IF;

    -- 3. تحديث سجل السلفة في جدول employee_advances
    IF v_new_emp_id IS NOT NULL THEN
        UPDATE public.employee_advances
        SET employee_id = v_new_emp_id,
            amount = 200.00
        WHERE reference ILIKE '%445716%' OR notes ILIKE '%445716%';

        RAISE NOTICE '✅ تم ربط السلفة بالموظف الجديد: %', v_new_emp_name;
    END IF;
END $$;

-- ==============================================================================
-- 2. إسقاط الدوال القديمة المتعارضة
-- ==============================================================================
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, uuid, numeric, date, uuid, text);
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, uuid, numeric, date, date, int, text, uuid, uuid);

-- ==============================================================================
-- 3. تثبيت الدالة المركزية الموحدة لتعديل سلف الموظفين وتحديث قيودها فورياً
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
    -- 1. تحديد المنظمة
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id FROM public.employee_advances WHERE id = p_advance_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة للسلفة.';
    END IF;

    -- 2. التحقق من وجود السلفة وجلب مرجعها
    SELECT reference INTO v_ref
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin' OR auth.role() = 'service_role');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو لا تملك صلاحية تعديلها.';
    END IF;

    IF v_ref IS NULL OR TRIM(v_ref) = '' THEN
        v_ref := 'ADV-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::text, 6, '0');
    END IF;

    -- 3. جلب اسم الموظف الجديد بأمان
    SELECT COALESCE(full_name, name, 'موظف') INTO v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    -- 4. تحديث سجل السلفة في جدول employee_advances
    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_date,
        advance_date = p_date,
        treasury_account_id = p_treasury_id,
        notes = p_notes,
        reference = v_ref
    WHERE id = p_advance_id;

    -- 5. جلب حساب سلف الموظفين (1223)
    SELECT id INTO v_advances_acc_id
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1223' OR name LIKE '%سلف%')
    ORDER BY CASE WHEN code = '1223' THEN 1 ELSE 2 END
    LIMIT 1;

    -- 6. تفعيل تصريح تعديل القيود المالية المحصنة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- 7. فحص القيد المحاسبي المرتبط
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE organization_id = v_org_id
      AND (
          reference = v_ref
          OR reference = 'ADV-' || v_ref
          OR reference = REPLACE(v_ref, 'ADV-', '')
          OR description ILIKE '%' || v_ref || '%'
      )
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
        -- تحديث رأس القيد
        UPDATE public.journal_entries
        SET date = p_date,
            transaction_date = p_date,
            description = 'صرف سلفة للموظف ' || COALESCE(v_emp_name, '')
        WHERE id = v_journal_id;

        -- حذف الأسطر السابقة بالكامل لمنع أي تكرار
        DELETE FROM public.journal_lines
        WHERE journal_entry_id = v_journal_id;

        -- إدراج السطرين الصحيحين
        IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
            -- مدين: سلف الموظفين
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
    ELSE
        -- إنشاء القيد فوراً إن لم يكن مسجلاً
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

            INSERT INTO public.journal_lines (
                journal_entry_id, account_id, debit, credit, description, organization_id
            ) VALUES (
                v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id
            );

            INSERT INTO public.journal_lines (
                journal_entry_id, account_id, debit, credit, description, organization_id
            ) VALUES (
                v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id
            );
        END IF;
    END IF;

    -- 8. إغلاق تصريح التعديل المحاسبي
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE;
END;
$$;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) TO authenticated, service_role, anon;

-- 9. إغلاق تصريح التعديل المحاسبي للجلسة
SELECT set_config('app.allow_financial_ledger_mutation', 'false', false);
