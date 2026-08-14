-- ==============================================================================
-- 🚀 ترقية ومعالجة قيود المقاولات وصرف العهد والمواد (Construction Accounting Fix)
-- التاريخ: 14 أغسطس 2026
-- ==============================================================================

-- 1. دالة إنشاء وصرف العهدة المالية مع قيد الصرف الفوري من الخزينة/البنك
CREATE OR REPLACE FUNCTION public.fn_create_and_disburse_custody(
    p_project_id UUID,
    p_custody_name TEXT,
    p_employee_id UUID,
    p_amount NUMERIC,
    p_source_account_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id UUID;
    v_custody_id UUID;
    v_je_id UUID;
    v_custody_acc UUID;
    v_emp_name TEXT;
    v_proj_name TEXT;
BEGIN
    SELECT organization_id, name INTO v_org_id, v_proj_name FROM public.projects WHERE id = p_project_id;
    IF v_org_id IS NULL THEN
        v_org_id := public.get_my_org();
    END IF;

    SELECT full_name INTO v_emp_name FROM public.employees WHERE id = p_employee_id;

    -- 1. إنشاء سجل العهدة
    INSERT INTO public.project_custodies (
        project_id, organization_id, custody_name, employee_id, total_advanced, current_balance, status
    ) VALUES (
        p_project_id, v_org_id, p_custody_name, p_employee_id, COALESCE(p_amount, 0), COALESCE(p_amount, 0), 'active'
    ) RETURNING id INTO v_custody_id;

    -- 2. إذا كان هناك مبلغ مصروف، يتم إنشاء القيد المالي فوراً
    IF COALESCE(p_amount, 0) > 0 THEN
        IF p_source_account_id IS NULL THEN
            RAISE EXCEPTION '⚠️ يرجى تحديد حساب الخزينة أو البنك الذي تم صرف العهدة منه.';
        END IF;

        -- حساب عهد الموظفين (1224)
        v_custody_acc := public.resolve_leaf_account(COALESCE(
            (SELECT (account_mappings->>'EMPLOYEE_CUSTODIES')::UUID FROM public.company_settings WHERE organization_id = v_org_id),
            (SELECT id FROM public.accounts WHERE code = '1224' AND organization_id = v_org_id LIMIT 1)
        ));

        IF v_custody_acc IS NULL THEN
            SELECT id INTO v_custody_acc FROM public.accounts 
            WHERE organization_id = v_org_id AND (name LIKE '%عهد%' OR code = '1224') LIMIT 1;
        END IF;

        IF v_custody_acc IS NULL THEN
            RAISE EXCEPTION '⚠️ حساب عهد الموظفين (1224) غير معرف في دليل الحسابات.';
        END IF;

        -- إنشاء قيد الصرف
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
        ) VALUES (
            CURRENT_DATE, 
            'صرف عهدة نقدية: ' || p_custody_name || ' للموظف ' || COALESCE(v_emp_name, '') || ' - مشروع ' || COALESCE(v_proj_name, ''),
            'CUST-ADV-' || SUBSTRING(v_custody_id::text, 1, 8),
            'posted', v_org_id, v_custody_id, 'custody_advance', true
        ) RETURNING id INTO v_je_id;

        -- من ح/ عهد الموظفين (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_custody_acc, p_amount, 0, 'صرف عهدة للموظف ' || COALESCE(v_emp_name, ''), v_org_id);

        -- إلى ح/ الخزينة أو البنك (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, p_source_account_id, 0, p_amount, 'خروج نقدية لصرف عهدة ' || p_custody_name, v_org_id);
    END IF;

    RETURN v_custody_id;
END;
$$;

-- 2. دالة تغذية العهدة المالية
CREATE OR REPLACE FUNCTION public.fn_top_up_custody(
    p_custody_id UUID, 
    p_amount NUMERIC,
    p_source_account_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_custody RECORD;
    v_project RECORD;
    v_emp_name TEXT;
    v_org_id UUID;
    v_je_id UUID;
    v_custody_acc UUID;
BEGIN
    SELECT * INTO v_custody FROM public.project_custodies WHERE id = p_custody_id;
    IF v_custody IS NULL THEN
        RAISE EXCEPTION 'العهدة غير موجودة.';
    END IF;

    v_org_id := v_custody.organization_id;
    SELECT * INTO v_project FROM public.projects WHERE id = v_custody.project_id;
    SELECT full_name INTO v_emp_name FROM public.employees WHERE id = v_custody.employee_id;

    IF COALESCE(p_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر.';
    END IF;

    -- إذا تم تمرير حساب مصدر للخزينة أو البنك، يتم إنشاء القيد المالي
    IF p_source_account_id IS NOT NULL THEN
        v_custody_acc := public.resolve_leaf_account(COALESCE(
            (SELECT (account_mappings->>'EMPLOYEE_CUSTODIES')::UUID FROM public.company_settings WHERE organization_id = v_org_id),
            (SELECT id FROM public.accounts WHERE code = '1224' AND organization_id = v_org_id LIMIT 1)
        ));

        IF v_custody_acc IS NULL THEN
            SELECT id INTO v_custody_acc FROM public.accounts 
            WHERE organization_id = v_org_id AND (name LIKE '%عهد%' OR code = '1224') LIMIT 1;
        END IF;

        IF v_custody_acc IS NOT NULL THEN
            INSERT INTO public.journal_entries (
                transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
            ) VALUES (
                CURRENT_DATE, 
                'تغذية عهدة: ' || v_custody.custody_name || ' للموظف ' || COALESCE(v_emp_name, '') || ' - مشروع ' || COALESCE(v_project.name, ''),
                'CUST-TOP-' || SUBSTRING(gen_random_uuid()::text, 1, 8),
                'posted', v_org_id, p_custody_id, 'custody_topup', true
            ) RETURNING id INTO v_je_id;

            -- من ح/ عهد الموظفين (مدين)
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_custody_acc, p_amount, 0, 'تغذية عهدة الموظف ' || COALESCE(v_emp_name, ''), v_org_id);

            -- إلى ح/ الخزينة أو البنك (دائن)
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, p_source_account_id, 0, p_amount, 'خروج نقدية لتغذية عهدة ' || v_custody.custody_name, v_org_id);
        END IF;
    END IF;

    -- تحديث أرصدة العهدة
    UPDATE public.project_custodies 
    SET total_advanced = total_advanced + p_amount,
        current_balance = current_balance + p_amount
    WHERE id = p_custody_id;
END;
$$;

-- 3. دالة اعتماد صرف المواد للمشروع مع الحل الآمن لحساب المشروع
CREATE OR REPLACE FUNCTION public.fn_approve_material_issue(p_issue_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_issue RECORD;
    v_item RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_inv_acc UUID;
    v_project_acc UUID;
    v_parent_id UUID;
    v_account_code TEXT;
    v_total_cost NUMERIC := 0;
BEGIN
    SELECT * INTO v_issue FROM public.project_material_issues WHERE id = p_issue_id;
    IF v_issue IS NULL THEN
        RAISE EXCEPTION 'إذن الصرف غير موجود.';
    END IF;

    SELECT * INTO v_project FROM public.projects WHERE id = v_issue.project_id;
    IF v_project IS NULL THEN
        RAISE EXCEPTION 'المشروع غير موجود.';
    END IF;

    -- حساب مخزون المواد الخام
    v_inv_acc := public.resolve_leaf_account(COALESCE(
        (SELECT (account_mappings->>'INVENTORY_RAW_MATERIALS')::UUID FROM public.company_settings WHERE organization_id = v_issue.organization_id),
        (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_issue.organization_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE code = '103' AND organization_id = v_issue.organization_id LIMIT 1)
    ));

    -- حل وتثبيت حساب المشروع (مشروعات تحت التنفيذ WIP كأصل)
    IF v_project.cost_center_account_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.accounts WHERE id = v_project.cost_center_account_id) THEN
        v_project_acc := v_project.cost_center_account_id;
    ELSE
        -- البحث عن حساب للمشروع بالاسم
        SELECT id INTO v_project_acc FROM public.accounts 
        WHERE organization_id = v_issue.organization_id 
          AND (name = 'مشروع: ' || v_project.name OR name = v_project.name)
        LIMIT 1;

        -- إذا لم يوجد، نقوم بإنشائه تحت 10303
        IF v_project_acc IS NULL THEN
            SELECT id INTO v_parent_id FROM public.accounts 
            WHERE organization_id = v_issue.organization_id AND (code = '10303' OR code = '103')
            ORDER BY code DESC LIMIT 1;

            IF v_parent_id IS NOT NULL THEN
                v_account_code := (SELECT code FROM public.accounts WHERE id = v_parent_id) || '-' || (SELECT COALESCE(COUNT(*), 0) + 1 FROM public.accounts WHERE parent_id = v_parent_id);
                INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
                VALUES (v_issue.organization_id, 'مشروع: ' || v_project.name, v_account_code, v_parent_id, 'asset', TRUE, FALSE)
                RETURNING id INTO v_project_acc;
            ELSE
                -- استخدام حساب WIP الافتراضي
                v_project_acc := public.resolve_leaf_account(COALESCE(
                    (SELECT (account_mappings->>'INVENTORY_WIP')::UUID FROM public.company_settings WHERE organization_id = v_issue.organization_id),
                    (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_issue.organization_id LIMIT 1)
                ));
            END IF;
        END IF;

        IF v_project_acc IS NOT NULL THEN
            UPDATE public.projects SET cost_center_account_id = v_project_acc WHERE id = v_project.id;
        END IF;
    END IF;

    IF v_project_acc IS NULL THEN
        RAISE EXCEPTION '⚠️ تعذر تحديد الحساب المالي للمشروع، يرجى التأكد من وجود حساب مشروعات تحت التنفيذ (10303).';
    END IF;

    FOR v_item IN SELECT * FROM public.project_material_issue_items WHERE issue_id = p_issue_id LOOP
        v_total_cost := v_total_cost + (v_item.quantity * v_item.unit_cost);
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_issue.issue_date, 'صرف مواد لمشروع: ' || v_project.name, v_issue.issue_number, 'posted', v_issue.organization_id, p_issue_id, 'material_issue', true)
    RETURNING id INTO v_je_id;

    -- من ح/ تكاليف المشروع (مشروعات تحت التنفيذ)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project_acc, v_total_cost, 0, 'تحميل تكلفة مواد منصرفة', v_issue.organization_id);

    -- إلى ح/ مخزون المواد الخام
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_inv_acc, 0, v_total_cost, 'صرف خامات من المخزن للمشروع', v_issue.organization_id);

    UPDATE public.project_material_issues SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_issue_id;
    PERFORM public.recalculate_stock_rpc(v_issue.organization_id);
END; $$;

-- 4. دالة اعتماد مصروف العهدة مع الحل الآمن لحساب المشروع
CREATE OR REPLACE FUNCTION public.fn_approve_custody_expense(p_expense_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_expense RECORD;
    v_custody RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_employee_acc UUID;
    v_project_acc UUID;
    v_parent_id UUID;
    v_account_code TEXT;
BEGIN
    SELECT * INTO v_expense FROM public.project_custody_expenses WHERE id = p_expense_id;
    IF v_expense IS NULL THEN
        RAISE EXCEPTION 'المصروف غير موجود.';
    END IF;

    SELECT * INTO v_custody FROM public.project_custodies WHERE id = v_expense.custody_id;
    SELECT * INTO v_project FROM public.projects WHERE id = v_custody.project_id;

    -- حل وتثبيت حساب المشروع
    IF v_project.cost_center_account_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.accounts WHERE id = v_project.cost_center_account_id) THEN
        v_project_acc := v_project.cost_center_account_id;
    ELSE
        SELECT id INTO v_project_acc FROM public.accounts 
        WHERE organization_id = v_expense.organization_id 
          AND (name = 'مشروع: ' || v_project.name OR name = v_project.name)
        LIMIT 1;

        IF v_project_acc IS NULL THEN
            SELECT id INTO v_parent_id FROM public.accounts 
            WHERE organization_id = v_expense.organization_id AND (code = '10303' OR code = '103')
            ORDER BY code DESC LIMIT 1;

            IF v_parent_id IS NOT NULL THEN
                v_account_code := (SELECT code FROM public.accounts WHERE id = v_parent_id) || '-' || (SELECT COALESCE(COUNT(*), 0) + 1 FROM public.accounts WHERE parent_id = v_parent_id);
                INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
                VALUES (v_expense.organization_id, 'مشروع: ' || v_project.name, v_account_code, v_parent_id, 'asset', TRUE, FALSE)
                RETURNING id INTO v_project_acc;
            ELSE
                v_project_acc := public.resolve_leaf_account(COALESCE(
                    (SELECT (account_mappings->>'INVENTORY_WIP')::UUID FROM public.company_settings WHERE organization_id = v_expense.organization_id),
                    (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_expense.organization_id LIMIT 1)
                ));
            END IF;
        END IF;

        IF v_project_acc IS NOT NULL THEN
            UPDATE public.projects SET cost_center_account_id = v_project_acc WHERE id = v_project.id;
        END IF;
    END IF;

    -- حساب عهد الموظفين (1224)
    v_employee_acc := public.resolve_leaf_account(COALESCE(
        (SELECT (account_mappings->>'EMPLOYEE_CUSTODIES')::UUID FROM public.company_settings WHERE organization_id = v_expense.organization_id),
        (SELECT id FROM public.accounts WHERE code = '1224' AND organization_id = v_expense.organization_id LIMIT 1)
    ));

    IF v_employee_acc IS NULL THEN
        SELECT id INTO v_employee_acc FROM public.accounts 
        WHERE organization_id = v_expense.organization_id AND (name LIKE '%عهد%' OR code = '1224') LIMIT 1;
    END IF;

    -- 1. إنشاء القيد المحاسبي
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_expense.expense_date, 'مصروف عهدة: ' || v_expense.description || ' - مشروع ' || v_project.name, 'CUST-' || SUBSTRING(v_expense.id::text, 1, 8), 'posted', v_expense.organization_id, p_expense_id, 'custody_expense', true)
    RETURNING id INTO v_je_id;

    -- 2. من ح/ تكاليف المشروع
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project_acc, v_expense.amount, 0, v_expense.description, v_expense.organization_id);

    -- 3. إلى ح/ عهد الموظفين (تخفيض العهدة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_employee_acc, 0, v_expense.amount, 'تسوية جزء من عهدة ' || v_custody.custody_name, v_expense.organization_id);

    -- 4. تحديث حالة المصروف ورصيد العهدة
    UPDATE public.project_custody_expenses SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_expense_id;
    UPDATE public.project_custodies SET current_balance = current_balance - v_expense.amount WHERE id = v_expense.custody_id;
END;
$$;

-- 5. إصلاح أي قيود تاريخية تشير إلى حسابات غير موجودة أو مشاريع معلقة
DO $$
DECLARE
    v_proj RECORD;
    v_parent_id UUID;
    v_acc_id UUID;
    v_acc_code TEXT;
BEGIN
    -- فحص المشاريع التي لا تملك حساباً أو حسابها محذوف
    FOR v_proj IN SELECT * FROM public.projects LOOP
        IF v_proj.cost_center_account_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_proj.cost_center_account_id) THEN
            -- البحث عن حساب بالاسم
            SELECT id INTO v_acc_id FROM public.accounts 
            WHERE organization_id = v_proj.organization_id AND (name = 'مشروع: ' || v_proj.name OR name = v_proj.name)
            LIMIT 1;

            IF v_acc_id IS NULL THEN
                SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_proj.organization_id AND (code = '10303' OR code = '103') ORDER BY code DESC LIMIT 1;
                IF v_parent_id IS NOT NULL THEN
                    v_acc_code := (SELECT code FROM public.accounts WHERE id = v_parent_id) || '-' || (SELECT COALESCE(COUNT(*), 0) + 1 FROM public.accounts WHERE parent_id = v_parent_id);
                    INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
                    VALUES (v_proj.organization_id, 'مشروع: ' || v_proj.name, v_acc_code, v_parent_id, 'asset', TRUE, FALSE)
                    RETURNING id INTO v_acc_id;
                ELSE
                    v_acc_id := (SELECT id FROM public.accounts WHERE code = '10303' AND organization_id = v_proj.organization_id LIMIT 1);
                END IF;
            END IF;

            IF v_acc_id IS NOT NULL THEN
                UPDATE public.projects SET cost_center_account_id = v_acc_id WHERE id = v_proj.id;
            END IF;
        END IF;
    END LOOP;

    -- معالجة سطور القيود التي كانت مرتبطة بمعرف غير موجود في القيود الخاصة بإذن الصرف أو العهد
    UPDATE public.journal_lines jl
    SET account_id = p.cost_center_account_id
    FROM public.journal_entries je
    JOIN public.projects p ON je.description LIKE '%' || p.name || '%'
    WHERE jl.journal_entry_id = je.id
      AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = jl.account_id)
      AND p.cost_center_account_id IS NOT NULL;

END $$;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.fn_create_and_disburse_custody(UUID, TEXT, UUID, NUMERIC, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_top_up_custody(UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_material_issue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_custody_expense(UUID) TO authenticated;
