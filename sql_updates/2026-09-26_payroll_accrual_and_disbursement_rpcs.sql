-- ================================================================
-- Migration: Add Payroll Accrual & Disbursement Support
-- Date: 2026-09-26
-- Description:
--   1. Adds accrual_date, treasury_account_id, accrual_je_id, payment_je_id to payrolls table.
--   2. Adds run_payroll_accrual_rpc:
--      Posts Accrual Entry on month-end (e.g. 30/09):
--      Debit: 531 (Salaries), 5312 (Bonuses)
--      Credit: 1223 (Advances), 422 (Deductions), 2233 (Taxes), 2251 (Accrued Salaries & Wages)
--   3. Adds pay_accrued_payroll_rpc:
--      Posts Payment Entry on payment date (e.g. 02/10):
--      Debit: 2251 (Accrued Salaries & Wages)
--      Credit: Selected Treasury / Bank Account
-- ================================================================

-- 1. إضافة الأعمدة الداعمة لجدول مسير الرواتب
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS accrual_date date;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS accrual_je_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS payment_je_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- 2. دالة إثبات قيد استحقاق الرواتب (Run Payroll Accrual)
CREATE OR REPLACE FUNCTION public.run_payroll_accrual_rpc(
    p_month integer,
    p_year integer,
    p_date date,
    p_items jsonb,
    p_org_id uuid DEFAULT NULL
) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
    v_existing_payroll record;
    v_payroll_id uuid;
    v_total_gross numeric := 0; 
    v_total_additions numeric := 0; 
    v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; 
    v_total_net numeric := 0; 
    v_total_payroll_tax numeric := 0;
    v_item jsonb; 
    v_je_id uuid; 
    v_mappings jsonb; 
    v_payroll_item_id uuid;
    v_salaries_acc_id uuid; 
    v_bonuses_acc_id uuid; 
    v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; 
    v_payroll_tax_id uuid; 
    v_accrued_salaries_acc_id uuid;
    v_parent_acc_id uuid;
    v_liab_parent_id uuid;
    v_fixed_allowances numeric := 0; 
    v_monthly_additions numeric := 0; 
    v_monthly_deductions numeric := 0; 
    v_emp_net numeric := 0;
BEGIN
    -- 🛡️ تحديد المنظمة
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN 
        RAISE EXCEPTION 'فشل تحديد المنظمة، يرجى إعادة تسجيل الدخول.'; 
    END IF;

    -- 🛡️ التحقق من حالة المسير الحالي للشهر والسنة
    SELECT * INTO v_existing_payroll 
    FROM public.payrolls 
    WHERE payroll_month = p_month AND payroll_year = p_year AND organization_id = v_org_id 
    LIMIT 1;

    IF v_existing_payroll.id IS NOT NULL THEN
        IF v_existing_payroll.status = 'paid' THEN
            RAISE EXCEPTION 'تم اعتماد وصرف مسير الرواتب لشهر (%) سنة (%) مسبقاً لهذه المنظمة ولا يمكن إعادة الاستحقاق.', p_month, p_year;
        ELSE
            -- إذا كان مسجلاً كاستحقاق سابق (accrued)، يتم تنظيف القيود والبنود السابقة لإعادة الاستحقاق المحدث
            UPDATE public.employee_advances 
            SET status = 'paid', payroll_item_id = NULL 
            WHERE payroll_item_id IN (SELECT id FROM public.payroll_items WHERE payroll_id = v_existing_payroll.id);

            UPDATE public.payroll_variables 
            SET is_processed = false 
            WHERE month = p_month AND year = p_year AND organization_id = v_org_id;

            DELETE FROM public.journal_entries 
            WHERE (id = v_existing_payroll.accrual_je_id OR (related_document_id = v_existing_payroll.id AND related_document_type = 'payroll'))
            AND organization_id = v_org_id;

            DELETE FROM public.payrolls WHERE id = v_existing_payroll.id;
        END IF;
    END IF;

    -- 🛡️ جلب إعدادات الربط المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- حساب مصروف الرواتب
    v_salaries_acc_id := COALESCE((v_mappings->>'SALARIES_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('531', '5201', '5311') AND organization_id = v_org_id LIMIT 1));
    IF v_salaries_acc_id IS NULL THEN 
        RAISE EXCEPTION 'حساب مصروف الرواتب (531) غير معرف في الدليل المحاسبي.'; 
    END IF;

    -- حساب المكافآت والحوافز
    v_bonuses_acc_id := COALESCE((v_mappings->>'EMPLOYEE_BONUSES')::uuid, (SELECT id FROM public.accounts WHERE code IN ('5312', '520102', '5313') AND organization_id = v_org_id LIMIT 1));

    -- حساب الخصومات والجزاءات
    v_deductions_acc_id := COALESCE((v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('422', '223301', '421') AND organization_id = v_org_id LIMIT 1));

    -- حساب سلف الموظفين
    v_advances_acc_id := COALESCE((v_mappings->>'EMPLOYEE_ADVANCES')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1223', '1209') AND organization_id = v_org_id LIMIT 1));
    IF v_advances_acc_id IS NULL THEN 
        RAISE EXCEPTION 'حساب سلف الموظفين (1223) غير معرف في الدليل المحاسبي.'; 
    END IF;

    -- حساب ضريبة كسب العمل
    v_payroll_tax_id := COALESCE((v_mappings->>'PAYROLL_TAX')::uuid, (SELECT id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1));

    -- حساب رواتب وأجور مستحقة (2251)
    v_accrued_salaries_acc_id := COALESCE(
        (v_mappings->>'ACCRUED_SALARIES')::uuid,
        (SELECT id FROM public.accounts WHERE code = '2251' AND organization_id = v_org_id LIMIT 1)
    );

    -- 🛡️ إنشاء حساب 2251 تلقائياً إن لم يكن موجوداً
    IF v_accrued_salaries_acc_id IS NULL THEN
        SELECT id INTO v_parent_acc_id FROM public.accounts WHERE code = '225' AND organization_id = v_org_id LIMIT 1;
        IF v_parent_acc_id IS NULL THEN
            SELECT id INTO v_liab_parent_id FROM public.accounts WHERE code = '22' AND organization_id = v_org_id LIMIT 1;
            IF v_liab_parent_id IS NULL THEN
                SELECT id INTO v_liab_parent_id FROM public.accounts WHERE code = '2' AND organization_id = v_org_id LIMIT 1;
            END IF;
            INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
            VALUES ('225', 'مصروفات مستحقة', 'liability', true, v_liab_parent_id, v_org_id)
            RETURNING id INTO v_parent_acc_id;
        END IF;

        INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
        VALUES ('2251', 'رواتب وأجور مستحقة', 'liability', false, v_parent_acc_id, v_org_id)
        RETURNING id INTO v_accrued_salaries_acc_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items)) THEN 
        RAISE EXCEPTION 'لا توجد بيانات موظفين صالحة في المسير.'; 
    END IF;

    -- 1. حساب الإجماليات
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_fixed_allowances := 0; v_monthly_additions := 0; v_monthly_deductions := 0;

        SELECT COALESCE(SUM(amount), 0) INTO v_fixed_allowances 
        FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id;

        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_additions 
        FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid 
        AND month = p_month AND year = p_year AND type = 'addition' AND is_processed = false AND organization_id = v_org_id;

        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_deductions 
        FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid 
        AND month = p_month AND year = p_year AND type = 'deduction' AND is_processed = false AND organization_id = v_org_id;

        v_emp_net := COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - COALESCE((v_item->>'advances_deducted')::numeric, 0) - COALESCE((v_item->>'payroll_tax')::numeric, 0);

        v_total_gross := v_total_gross + COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances;
        v_total_additions := v_total_additions + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions;
        v_total_deductions := v_total_deductions + COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions;
        v_total_advances := v_total_advances + COALESCE((v_item->>'advances_deducted')::numeric, 0);
        v_total_payroll_tax := v_total_payroll_tax + COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_net := v_total_net + COALESCE(v_emp_net, 0);
    END LOOP;

    -- 2. إدراج سجل المسير بحالة accrued
    INSERT INTO public.payrolls (
        payroll_month, payroll_year, accrual_date, 
        total_gross_salary, total_additions, total_deductions, 
        total_net_salary, status, organization_id
    ) VALUES (
        p_month, p_year, p_date, 
        v_total_gross, v_total_additions, 
        (v_total_deductions + v_total_advances + v_total_payroll_tax), 
        v_total_net, 'accrued', v_org_id
    ) RETURNING id INTO v_payroll_id;

    -- 3. إدراج بنود الموظفين وتحديث السلف والمتغيرات
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_fixed_allowances := 0; v_monthly_additions := 0; v_monthly_deductions := 0;
        SELECT COALESCE(SUM(amount), 0) INTO v_fixed_allowances FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id;
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_additions FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'addition' AND organization_id = v_org_id;
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_deductions FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'deduction' AND organization_id = v_org_id;
        
        v_emp_net := (v_item->>'gross_salary')::numeric + v_fixed_allowances + (v_item->>'additions')::numeric + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - (v_item->>'advances_deducted')::numeric - COALESCE((v_item->>'payroll_tax')::numeric, 0);

        INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, payroll_tax, advances_deducted, other_deductions, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, 
               (v_item->>'gross_salary')::numeric + v_fixed_allowances, 
               (v_item->>'additions')::numeric + v_monthly_additions, 
               COALESCE((v_item->>'payroll_tax')::numeric, 0), (v_item->>'advances_deducted')::numeric, 
               COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions, 
               v_emp_net, v_org_id)
        RETURNING id INTO v_payroll_item_id;

        UPDATE public.payroll_variables SET is_processed = true 
        WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year;

        IF (v_item->>'advances_deducted')::numeric > 0 THEN
            UPDATE public.employee_advances 
            SET status = 'deducted', payroll_item_id = v_payroll_item_id
            WHERE employee_id = (v_item->>'employee_id')::uuid 
            AND status = 'paid'
            AND organization_id = v_org_id;
        END IF;
    END LOOP;

    -- 4. إنشاء قيد الاستحقاق المحاسبي
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, 
        organization_id, is_posted, related_document_id, related_document_type, user_id
    ) VALUES (
        p_date, 
        'استحقاق مسير رواتب شهر ' || p_month || '/' || p_year, 
        'PAYROLL-ACC-' || p_month || '-' || p_year, 
        'posted', v_org_id, true, v_payroll_id, 'payroll', auth.uid()
    ) RETURNING id INTO v_je_id;

    UPDATE public.payrolls SET accrual_je_id = v_je_id WHERE id = v_payroll_id;

    -- 5. أسطر قيد الاستحقاق:
    -- الطرف المدين: إجمالي الرواتب الأساسية والبدلات
    IF v_total_gross > 0 AND v_salaries_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب شهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    -- الطرف المدين: المكافآت والحوافز
    IF v_total_additions > 0 AND v_bonuses_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز شهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    -- الطرف الدائن: استرداد السلف
    IF v_total_advances > 0 AND v_advances_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف من رواتب شهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    -- الطرف الدائن: الخصومات والجزاءات
    IF v_total_deductions > 0 AND v_deductions_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات شهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    -- الطرف الدائن: ضريبة كسب العمل
    IF v_total_payroll_tax > 0 AND v_payroll_tax_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_payroll_tax_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل شهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    -- الطرف الدائن: حساب رواتب وأجور مستحقة (2251) بصافي الرواتب
    IF ABS(COALESCE(v_total_net, 0)) > 0.001 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_accrued_salaries_acc_id, 0, v_total_net, 'صافي رواتب وأجور مستحقة شهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    -- 🛡️ موازنة القيد آلياً لضمان الدقة المحاسبية
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);

    RETURN jsonb_build_object(
        'success', true,
        'payroll_id', v_payroll_id,
        'accrual_je_id', v_je_id,
        'total_gross', v_total_gross,
        'total_net', v_total_net
    );
END;
$$;

-- 3. دالة صرف الرواتب المستحقة وترحيل قيد النقدية (Pay Accrued Payroll)
CREATE OR REPLACE FUNCTION public.pay_accrued_payroll_rpc(
    p_payroll_id uuid DEFAULT NULL,
    p_month integer DEFAULT NULL,
    p_year integer DEFAULT NULL,
    p_payment_date date DEFAULT CURRENT_DATE,
    p_treasury_acc uuid DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
    v_payroll record;
    v_treasury_name text;
    v_accrued_salaries_acc_id uuid;
    v_mappings jsonb;
    v_parent_acc_id uuid;
    v_liab_parent_id uuid;
    v_je_id uuid;
BEGIN
    -- 🛡️ تحديد المنظمة
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN 
        RAISE EXCEPTION 'فشل تحديد المنظمة، يرجى إعادة تسجيل الدخول.'; 
    END IF;

    -- 🛡️ البحث عن مسير الرواتب المستحق
    IF p_payroll_id IS NOT NULL THEN
        SELECT * INTO v_payroll FROM public.payrolls WHERE id = p_payroll_id AND organization_id = v_org_id;
    ELSE
        SELECT * INTO v_payroll FROM public.payrolls 
        WHERE payroll_month = p_month AND payroll_year = p_year AND organization_id = v_org_id 
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_payroll.id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على مسير رواتب مسجل لهذه الفترة.';
    END IF;

    IF v_payroll.status = 'paid' THEN
        RAISE EXCEPTION 'مسير الرواتب لهذا الشهر تم صرفه مسبقاً.';
    END IF;

    IF p_treasury_acc IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد حساب الخزينة أو البنك لصرف الرواتب.';
    END IF;

    SELECT name INTO v_treasury_name FROM public.accounts WHERE id = p_treasury_acc AND organization_id = v_org_id;
    IF v_treasury_name IS NULL THEN
        RAISE EXCEPTION 'حساب الخزينة/البنك المختار غير صحيح أو لا ينتمي لهذه المنظمة.';
    END IF;

    -- جلب حساب رواتب وأجور مستحقة (2251)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_accrued_salaries_acc_id := COALESCE(
        (v_mappings->>'ACCRUED_SALARIES')::uuid,
        (SELECT id FROM public.accounts WHERE code = '2251' AND organization_id = v_org_id LIMIT 1)
    );

    IF v_accrued_salaries_acc_id IS NULL THEN
        SELECT id INTO v_parent_acc_id FROM public.accounts WHERE code = '225' AND organization_id = v_org_id LIMIT 1;
        IF v_parent_acc_id IS NULL THEN
            SELECT id INTO v_liab_parent_id FROM public.accounts WHERE code = '22' AND organization_id = v_org_id LIMIT 1;
            IF v_liab_parent_id IS NULL THEN
                SELECT id INTO v_liab_parent_id FROM public.accounts WHERE code = '2' AND organization_id = v_org_id LIMIT 1;
            END IF;
            INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
            VALUES ('225', 'مصروفات مستحقة', 'liability', true, v_liab_parent_id, v_org_id)
            RETURNING id INTO v_parent_acc_id;
        END IF;

        INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
        VALUES ('2251', 'رواتب وأجور مستحقة', 'liability', false, v_parent_acc_id, v_org_id)
        RETURNING id INTO v_accrued_salaries_acc_id;
    END IF;

    -- 🛡️ منع تكرار قيد الصرف
    DELETE FROM public.journal_entries 
    WHERE (id = v_payroll.payment_je_id OR (related_document_id = v_payroll.id AND description LIKE 'صرف مسير رواتب%'))
    AND organization_id = v_org_id;

    -- 1. إنشاء قيد الصرف المحاسبي
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, 
        organization_id, is_posted, related_document_id, related_document_type, user_id
    ) VALUES (
        p_payment_date, 
        'صرف مسير رواتب شهر ' || v_payroll.payroll_month || '/' || v_payroll.payroll_year || ' من: ' || v_treasury_name, 
        'PAYROLL-PAY-' || v_payroll.payroll_month || '-' || v_payroll.payroll_year, 
        'posted', v_org_id, true, v_payroll.id, 'payroll', auth.uid()
    ) RETURNING id INTO v_je_id;

    -- 2. أسطر قيد الصرف:
    -- الطرف المدين: إقفال الرواتب والأجور المستحقة (2251)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_accrued_salaries_acc_id, v_payroll.total_net_salary, 0, 'إقفال رواتب مستحقة شهر ' || v_payroll.payroll_month || '/' || v_payroll.payroll_year, v_org_id);

    -- الطرف الدائن: خروج النقدية من الخزينة أو البنك
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, p_treasury_acc, 0, v_payroll.total_net_salary, 'صرف صافي رواتب شهر ' || v_payroll.payroll_month || '/' || v_payroll.payroll_year || ' - ' || v_treasury_name, v_org_id);

    -- 🛡️ موازنة القيد
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);

    -- 3. تحديث حالة المسير إلى paid وتخزين تاريخ الصرف وحساب الخزينة ورقم قيد الصرف
    UPDATE public.payrolls
    SET status = 'paid',
        payment_date = p_payment_date,
        treasury_account_id = p_treasury_acc,
        payment_je_id = v_je_id
    WHERE id = v_payroll.id;

    RETURN jsonb_build_object(
        'success', true,
        'payroll_id', v_payroll.id,
        'payment_je_id', v_je_id,
        'total_net', v_payroll.total_net_salary,
        'payment_date', p_payment_date
    );
END;
$$;

-- 4. منح صلاحيات التنفيذ
GRANT EXECUTE ON FUNCTION public.run_payroll_accrual_rpc(integer, integer, date, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_accrued_payroll_rpc(uuid, integer, integer, date, uuid, uuid) TO authenticated;
