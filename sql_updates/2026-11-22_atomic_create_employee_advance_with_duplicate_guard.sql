-- ==============================================================================
-- 🛡️ TriPro ERP — Migration: 2026-11-22
-- تحصين سلف الموظفين: إنشاء إجراء ذري موحد (create_employee_advance) مع درع منع التكرار
-- File: sql_updates/2026-11-22_atomic_create_employee_advance_with_duplicate_guard.sql
-- ==============================================================================

-- 1. فهرس تسريع فحص التكرار اللحظي للسلف
CREATE INDEX IF NOT EXISTS idx_employee_advances_dup_guard 
ON public.employee_advances (employee_id, organization_id, amount, advance_date);

-- 2. دالة الحفظ الذرية الشاملة لسلف الموظفين مع درع منع التكرار (Atomic Transaction)
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
    v_recent_count int;
BEGIN
    -- أ. التحقق من المدخلات الأساسية
    IF p_employee_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد الموظف المستفيد من السلفة.';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ السلفة يجب أن يكون أكبر من الصفر.';
    END IF;

    IF p_treasury_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد حساب الخزينة أو البنك المنصرف منه.';
    END IF;

    -- ب. تحديد المنظمة (Organization ID)
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id FROM public.employees WHERE id = p_employee_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة للموظف.';
    END IF;

    -- ج. درع منع التكرار اللحظي والمزدوج (Anti-Duplicate Guard)
    -- فحص ما إذا كانت هناك سلفة مطابقة لنفس الموظف ونفس المبلغ خلال آخر 15 دقيقة أو في نفس تاريخ اليوم
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

    -- د. جلب اسم الموظف
    SELECT COALESCE(full_name, name, 'موظف') INTO v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    -- هـ. توليد مرجع فريد ذكي للسلفة
    v_ref := 'ADV-' || to_char(COALESCE(p_date, CURRENT_DATE), 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0');

    -- و. إدراج السلفة في جدول employee_advances
    INSERT INTO public.employee_advances (
        organization_id,
        employee_id,
        amount,
        request_date,
        advance_date,
        status,
        notes,
        treasury_account_id,
        reference
    ) VALUES (
        v_org_id,
        p_employee_id,
        p_amount,
        p_date,
        p_date,
        'paid',
        p_notes,
        p_treasury_id,
        v_ref
    ) RETURNING id INTO v_advance_id;

    -- ز. جلب حساب سلف الموظفين (1223)
    SELECT id INTO v_advances_acc_id
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1223' OR name LIKE '%سلف%')
    ORDER BY CASE WHEN code = '1223' THEN 1 ELSE 2 END
    LIMIT 1;

    -- ح. إنشاء القيد المحاسبي في الخزينة ذرياً (Atomic Journal Entry)
    IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
        -- فتح تصريح تعديل القيود المالية
        PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

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
            v_advance_id,
            'employee_advance'
        ) RETURNING id INTO v_journal_id;

        -- مدين: سلف العاملين (1223)
        INSERT INTO public.journal_lines (
            journal_entry_id, account_id, debit, credit, description, organization_id
        ) VALUES (
            v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id
        );

        -- دائن: الخزينة أو البنك المنصرف منه
        INSERT INTO public.journal_lines (
            journal_entry_id, account_id, debit, credit, description, organization_id
        ) VALUES (
            v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id
        );

        -- إغلاق تصريح التعديل المالي
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    END IF;

    -- ط. إعادة احتساب وتحديث الأرصدة فوراً
    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- ي. إرجاع النتيجة
    RETURN jsonb_build_object(
        'success', true,
        'advance_id', v_advance_id,
        'reference', v_ref,
        'journal_id', v_journal_id,
        'employee_name', v_emp_name,
        'amount', p_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_employee_advance(uuid, numeric, date, uuid, text, boolean) TO authenticated, service_role, anon;
