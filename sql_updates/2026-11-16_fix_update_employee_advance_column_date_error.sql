-- ==============================================================================
-- 🚀 TriPro ERP — Fix Employee Advance Update RPC (Remove nonexistent 'date' column)
-- File: sql_updates/2026-11-16_fix_update_employee_advance_column_date_error.sql
-- ==============================================================================
-- هذا الباتش يعالج الخطأ الحاسم:
-- column "date" of relation "journal_entries" does not exist
-- عند استدعاء update_employee_advance من شاشة سلف العاملين.
-- جدول journal_entries يعتمد حصراً على العمود: transaction_date وليس date.
-- ==============================================================================

-- 0. فتح تصريح تعديل القيود المالية للجلسة
SELECT set_config('app.allow_financial_ledger_mutation', 'true', false);

-- 1. إسقاط الدوال المتعارضة أو القديمة ذات التوقيعات المختلفة
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, uuid, numeric, date, date, integer, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, numeric, integer, text, uuid);
DROP FUNCTION IF EXISTS public.update_employee_advance(uuid, uuid, numeric, date, uuid, text);

-- 2. تثبيت الدالة المركزية الموحدة لتعديل سلف العاملين ومزامنة قيودها بالكامل
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
    v_caller_id uuid := auth.uid();
    v_caller_role text;
BEGIN
    -- أ. التحقق من صلاحية المستخدم المالية
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المالية اللازمة لتعديل السلفة.';
        END IF;
    END IF;

    -- ب. تحديد المنظمة بدقة
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id FROM public.employee_advances WHERE id = p_advance_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة للسلفة.';
    END IF;

    -- ج. التحقق من وجود السلفة وجلب مرجعها
    SELECT reference, organization_id INTO v_ref, v_org_id
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin' OR auth.role() = 'service_role');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو لا تملك صلاحية تعديلها.';
    END IF;

    IF v_ref IS NULL OR TRIM(v_ref) = '' THEN
        v_ref := 'ADV-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::text, 6, '0');
    END IF;

    -- د. جلب اسم الموظف الجديد
    SELECT COALESCE(full_name, name, 'موظف') INTO v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    -- هـ. تحديث سجل السلفة في جدول employee_advances
    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_date,
        advance_date = p_date,
        treasury_account_id = p_treasury_id,
        notes = p_notes,
        reference = v_ref
    WHERE id = p_advance_id;

    -- و. جلب حساب سلف الموظفين (1223)
    SELECT id INTO v_advances_acc_id
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1223' OR name LIKE '%سلف%')
    ORDER BY CASE WHEN code = '1223' THEN 1 ELSE 2 END
    LIMIT 1;

    -- ز. تفعيل تصريح تعديل القيود المالية المحصنة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- ح. فحص القيد المحاسبي المرتبط بالسلفة
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE organization_id = v_org_id
      AND (
          (related_document_id = p_advance_id AND related_document_type = 'employee_advance')
          OR reference = v_ref
          OR reference = 'ADV-' || v_ref
          OR reference = REPLACE(v_ref, 'ADV-', '')
          OR description ILIKE '%' || v_ref || '%'
      )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
        -- تحديث رأس القيد: استخدام transaction_date فقط (العمود الحقيقي في جدول journal_entries)
        UPDATE public.journal_entries
        SET transaction_date = p_date,
            description = 'صرف سلفة للموظف ' || COALESCE(v_emp_name, '')
        WHERE id = v_journal_id;

        -- حذف الأسطر السابقة بالكامل لمنع أي تكرار أو عدم توازن
        DELETE FROM public.journal_lines
        WHERE journal_entry_id = v_journal_id;

        -- إدراج السطرين المحدثين
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
        -- إنشاء القيد فوراً إن لم يكن مسجلاً سابقاً
        IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
            INSERT INTO public.journal_entries (
                organization_id,
                reference,
                transaction_date,
                description,
                status,
                is_posted,
                related_document_id,
                related_document_type
            ) VALUES (
                v_org_id,
                v_ref,
                p_date,
                'صرف سلفة للموظف ' || COALESCE(v_emp_name, ''),
                'posted',
                true,
                p_advance_id,
                'employee_advance'
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

    -- ط. إغلاق تصريح التعديل المحاسبي
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE;
END;
$$;

-- 3. الصلاحيات
REVOKE EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) TO authenticated, service_role, anon;

-- 4. إغلاق تصريح التعديل المحاسبي للجلسة
SELECT set_config('app.allow_financial_ledger_mutation', 'false', false);

-- 5. إشعار PostgREST بتحديث كاش المخطط (Schema Cache Reload)
NOTIFY pgrst, 'reload schema';
