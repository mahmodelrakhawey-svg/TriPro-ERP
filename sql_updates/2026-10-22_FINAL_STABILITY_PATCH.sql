-- ==============================================================================
-- 🛡️ سكريبت الاستقرار الشامل والنهائي • TriPro ERP Final Stability Patch
-- التاريخ: 2026-10-22
-- يشمل:
-- 1. إصلاح فواتير المبيعات ومنع تكرار خطأ record "new" has no field "type"
-- 2. إضافة الأعمدة الوقائية المفقودة (invoices.type & orders.payment_method)
-- 3. تفعيل مشغلات الاعتماد التلقائي بدون أي قيود أو تعارض
-- 4. تفعيل تعديل وحذف سلف الموظفين ومزامنة القيود تلقائياً
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. الأعمدة الوقائية
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- إضافة عمود type لجدول invoices إن لم يكن موجوداً
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'type'
    ) THEN
        ALTER TABLE public.invoices ADD COLUMN type text DEFAULT 'sale';
    END IF;

    -- إضافة عمود payment_method لجدول orders إن لم يكن موجوداً
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_method text DEFAULT 'CASH';
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 2. تحصين مشغلات فواتير المبيعات ضد أي أخطاء ومنع التكرار نهائياً
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- حارس الأمان لتجنب التكرار أثناء التعديلات المالية
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- تشغيل الاعتماد التلقائي وقيد اليومية عند اعتماد الفاتورة وعدم وجود قيد مرتبط
    IF NEW.status = 'posted' AND NEW.related_journal_entry_id IS NULL THEN
        PERFORM public.approve_invoice(
            NEW.id,
            NEW.organization_id,
            NEW.warehouse_id
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_items_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.invoices
        WHERE id = NEW.invoice_id
          AND status = 'posted'
          AND related_journal_entry_id IS NULL
    ) THEN
        PERFORM public.approve_invoice(
            NEW.invoice_id,
            (SELECT organization_id FROM public.invoices WHERE id = NEW.invoice_id),
            (SELECT warehouse_id    FROM public.invoices WHERE id = NEW.invoice_id)
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_invoice ON public.invoices;
CREATE TRIGGER trg_auto_approve_invoice
    AFTER INSERT OR UPDATE OF status ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_insert();

DROP TRIGGER IF EXISTS trg_auto_approve_invoice_items ON public.invoice_items;
CREATE TRIGGER trg_auto_approve_invoice_items
    AFTER INSERT ON public.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_items_insert();


-- ------------------------------------------------------------------------------
-- 3. دالة تعديل سلفة الموظف وإنشاء القيد المحاسبي المفقود تلقائياً
-- ------------------------------------------------------------------------------
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

    SELECT reference INTO v_ref
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو ليس لديك صلاحية تعديلها.';
    END IF;

    IF v_ref IS NULL OR TRIM(v_ref) = '' THEN
        v_ref := 'ADV-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::text, 6, '0');
    END IF;

    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_date,
        advance_date = p_date,
        treasury_account_id = p_treasury_id,
        notes = p_notes,
        reference = v_ref
    WHERE id = p_advance_id;

    SELECT COALESCE(full_name, name, 'موظف') INTO v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    SELECT id INTO v_advances_acc_id
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1223' OR name LIKE '%سلف%')
    ORDER BY CASE WHEN code = '1223' THEN 1 ELSE 2 END
    LIMIT 1;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE reference = v_ref
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin')
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
        UPDATE public.journal_entries
        SET status = 'draft',
            is_posted = false,
            date = p_date,
            transaction_date = p_date,
            description = 'صرف سلفة للموظف ' || COALESCE(v_emp_name, '')
        WHERE id = v_journal_id;

        DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;

        IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id);

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id);
        END IF;

        UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;
    ELSE
        IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
            INSERT INTO public.journal_entries (
                organization_id, entry_number, reference, date, transaction_date, description, status, is_posted
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

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id);

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id);
        END IF;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) TO authenticated, service_role, anon;


-- ------------------------------------------------------------------------------
-- 4. دالة حذف سلفة الموظف وإلغاء القيد المرتبط بها
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_employee_advance(p_advance_id uuid)
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

    SELECT reference, status, payroll_item_id
    INTO v_ref, v_status, v_payroll_item_id
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو تم حذفها مسبقاً.';
    END IF;

    IF v_status = 'deducted' OR v_payroll_item_id IS NOT NULL THEN
        RAISE EXCEPTION 'لا يمكن حذف هذه السلفة؛ لأنها مسواة ومخصومة بالفعل في مسير رواتب الموظفين.';
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

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

    DELETE FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin');

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_employee_advance(uuid) TO authenticated, service_role, anon;

-- تحديث الذاكرة المؤقتة لمخطط قاعدة البيانات فورياً
NOTIFY pgrst, 'reload schema';
