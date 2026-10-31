-- ==============================================================================
-- 🚀 تحديث عاجل وشامل: إصلاح خصم سلف مسير الرواتب واستعادة سلف أكتوبر 2026
-- Date: 2026-10-31
-- File: sql_updates/2026-10-31_fix_payroll_advance_deduction_and_restore_october.sql
-- ==============================================================================

-- 1️⃣ استعادة فورية لجميع سلف شهر أكتوبر 2026 المسحوبة بالخطأ وإعادتها لحالة "قائمة (paid)"
UPDATE public.employee_advances
SET status = 'paid', payroll_item_id = NULL
WHERE status = 'deducted'
  AND COALESCE(request_date, advance_date, created_at::date) >= '2026-10-01'
  AND (
    payroll_item_id IS NULL OR 
    payroll_item_id IN (
      SELECT pi.id 
      FROM public.payroll_items pi 
      JOIN public.payrolls p ON pi.payroll_id = p.id
      WHERE (p.payroll_year < 2026 OR (p.payroll_year = 2026 AND p.payroll_month < 10))
    )
  );

-- 2️⃣ دالة المعالجة الذاتية التلقائية لاستعادة السلف المخصومة خطأ في أي وقت (Self-Healing RPC)
CREATE OR REPLACE FUNCTION public.heal_erroneous_advances_rpc(
    p_org_id uuid DEFAULT NULL,
    p_target_date date DEFAULT '2026-10-01'::date
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
    v_count integer := 0;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'فشل تحديد المنظمة، يرجى إعادة تسجيل الدخول.';
    END IF;

    WITH affected AS (
        UPDATE public.employee_advances
        SET status = 'paid', payroll_item_id = NULL
        WHERE organization_id = v_org_id
          AND status = 'deducted'
          AND COALESCE(request_date, advance_date, created_at::date) >= p_target_date
          AND (
            payroll_item_id IS NULL OR 
            payroll_item_id IN (
              SELECT pi.id 
              FROM public.payroll_items pi 
              JOIN public.payrolls p ON pi.payroll_id = p.id
              WHERE p.organization_id = v_org_id
                AND (p.payroll_year < EXTRACT(YEAR FROM p_target_date)::integer OR 
                    (p.payroll_year = EXTRACT(YEAR FROM p_target_date)::integer AND p.payroll_month < EXTRACT(MONTH FROM p_target_date)::integer))
            )
          )
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM affected;

    RETURN jsonb_build_object(
        'success', true,
        'restored_count', v_count,
        'message', 'تم استعادة ' || v_count || ' سلفة بنجاح وإعادتها كـ (قائمة) بانتظار مسير رواتب الشهر.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.heal_erroneous_advances_rpc(uuid, date) TO authenticated, service_role;

-- 3️⃣ تحصين دالة إثبات قيد الاستحقاق (run_payroll_accrual_rpc) بمنع خصم أي سلفة بعد نهاية شهر المسير قطعياً
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
    v_month_end_date date;
    v_cutoff_date date;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN 
        RAISE EXCEPTION 'فشل تحديد المنظمة، يرجى إعادة تسجيل الدخول.'; 
    END IF;

    -- حساب تاريخ نهاية شهر المسير بدقة متناهية
    v_month_end_date := ((p_year || '-' || LPAD(p_month::text, 2, '0') || '-01')::date + INTERVAL '1 month - 1 day')::date;
    v_cutoff_date := LEAST(v_month_end_date, COALESCE(p_date, v_month_end_date));

    -- التحقق من حالة المسير الحالي للشهر والسنة
    SELECT * INTO v_existing_payroll 
    FROM public.payrolls 
    WHERE payroll_month = p_month AND payroll_year = p_year AND organization_id = v_org_id 
    LIMIT 1;

    IF v_existing_payroll.id IS NOT NULL THEN
        IF v_existing_payroll.status = 'paid' THEN
            RAISE EXCEPTION 'تم اعتماد وصرف مسير الرواتب لشهر (%) سنة (%) مسبقاً ولا يمكن إعادة الاستحقاق.', p_month, p_year;
        ELSE
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

    -- جلب إعدادات الربط المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_salaries_acc_id := COALESCE((v_mappings->>'SALARIES_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('531', '5201', '5311') AND organization_id = v_org_id LIMIT 1));
    IF v_salaries_acc_id IS NULL THEN 
        RAISE EXCEPTION 'حساب مصروف الرواتب (531) غير معرف في الدليل المحاسبي.'; 
    END IF;

    v_bonuses_acc_id := COALESCE((v_mappings->>'EMPLOYEE_BONUSES')::uuid, (SELECT id FROM public.accounts WHERE code IN ('5312', '520102', '5313') AND organization_id = v_org_id LIMIT 1));
    v_deductions_acc_id := COALESCE((v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('422', '223301', '421') AND organization_id = v_org_id LIMIT 1));
    v_advances_acc_id := COALESCE((v_mappings->>'EMPLOYEE_ADVANCES')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1223', '1209') AND organization_id = v_org_id LIMIT 1));
    IF v_advances_acc_id IS NULL THEN 
        RAISE EXCEPTION 'حساب سلف الموظفين (1223) غير معرف في الدليل المحاسبي.'; 
    END IF;

    v_payroll_tax_id := COALESCE((v_mappings->>'PAYROLL_TAX')::uuid, (SELECT id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1));

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

    -- 3. إدراج بنود الموظفين وتحديث السلف
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

        -- 🛡️ حماية صارمة: التقييد بتاريخ نهاية شهر المسير وتاريخ الصرف لمنع سحب سلف أي شهر لاحق قطعيّاً
        IF (v_item->>'advances_deducted')::numeric > 0 THEN
            IF v_item->'advances_ids' IS NOT NULL AND jsonb_array_length(v_item->'advances_ids') > 0 THEN
                UPDATE public.employee_advances 
                SET status = 'deducted', payroll_item_id = v_payroll_item_id
                WHERE id IN (SELECT (jsonb_array_elements_text(v_item->'advances_ids'))::uuid)
                  AND COALESCE(request_date, advance_date, created_at::date) <= v_cutoff_date
                  AND organization_id = v_org_id;
            ELSE
                UPDATE public.employee_advances 
                SET status = 'deducted', payroll_item_id = v_payroll_item_id
                WHERE employee_id = (v_item->>'employee_id')::uuid 
                  AND status = 'paid'
                  AND COALESCE(request_date, advance_date, created_at::date) <= v_cutoff_date
                  AND organization_id = v_org_id;
            END IF;
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

    -- 5. أسطر قيد الاستحقاق
    IF v_total_gross > 0 AND v_salaries_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب شهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    IF v_total_additions > 0 AND v_bonuses_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز شهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    IF v_total_advances > 0 AND v_advances_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف العاملين لشهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    IF v_total_deductions > 0 AND v_deductions_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'استقطاعات وجزاءات وغياب شهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    IF v_total_payroll_tax > 0 AND v_payroll_tax_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_payroll_tax_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل لشهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    IF v_total_net > 0 AND v_accrued_salaries_acc_id IS NOT NULL THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_accrued_salaries_acc_id, 0, v_total_net, 'صافي رواتب وأجور مستحقة غير منصرفة لشهر ' || p_month || '/' || p_year, v_org_id); 
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'payroll_id', v_payroll_id, 
        'accrual_je_id', v_je_id, 
        'net_salary', v_total_net,
        'message', 'تم ترحيل قيد استحقاق الرواتب بنجاح.'
    );
END;
$$;

-- 4️⃣ تحصين دالة الصرف المباشر الفوري (run_payroll_rpc) بمنع خصم سلف أي شهر لاحق
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(
    p_month integer, 
    p_year integer, 
    p_date date, 
    p_treasury_acc uuid, 
    p_items jsonb, 
    p_org_id uuid DEFAULT NULL
) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; 
    v_payroll_id uuid; 
    v_total_gross numeric := 0; 
    v_total_additions numeric := 0; 
    v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; 
    v_total_net numeric := 0; 
    v_item jsonb; 
    v_je_id uuid; 
    v_mappings jsonb; 
    v_user_id uuid; 
    v_payroll_item_id uuid;
    v_salaries_acc_id uuid; 
    v_bonuses_acc_id uuid; 
    v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; 
    v_payroll_tax_id uuid; 
    v_total_payroll_tax numeric := 0;
    v_fixed_allowances numeric := 0; 
    v_monthly_additions numeric := 0; 
    v_monthly_deductions numeric := 0; 
    v_emp_net numeric := 0;
    v_month_end_date date;
    v_cutoff_date date;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة، يرجى إعادة تسجيل الدخول.'; END IF;

    IF EXISTS (SELECT 1 FROM public.payrolls WHERE payroll_month = p_month AND payroll_year = p_year AND organization_id = v_org_id AND status = 'paid') THEN
        RAISE EXCEPTION 'تم اعتماد وصرف مسير الرواتب لشهر (%) سنة (%) مسبقاً لهذه المنظمة.', p_month, p_year;
    END IF;

    v_month_end_date := ((p_year || '-' || LPAD(p_month::text, 2, '0') || '-01')::date + INTERVAL '1 month - 1 day')::date;
    v_cutoff_date := LEAST(v_month_end_date, COALESCE(p_date, v_month_end_date));

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_salaries_acc_id := COALESCE((v_mappings->>'SALARIES_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('531', '5201', '5311') AND organization_id = v_org_id LIMIT 1));
    IF v_salaries_acc_id IS NULL THEN RAISE EXCEPTION 'حساب مصروف الرواتب (SALARIES_EXPENSE) غير معرف في الدليل المحاسبي.'; END IF;
    v_bonuses_acc_id := COALESCE((v_mappings->>'EMPLOYEE_BONUSES')::uuid, (SELECT id FROM public.accounts WHERE code IN ('5312', '520102', '5313') AND organization_id = v_org_id LIMIT 1));
    v_deductions_acc_id := COALESCE((v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('422', '223301', '421') AND organization_id = v_org_id LIMIT 1));
    v_advances_acc_id := COALESCE((v_mappings->>'EMPLOYEE_ADVANCES')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1223', '1209') AND organization_id = v_org_id LIMIT 1));
    IF v_advances_acc_id IS NULL THEN RAISE EXCEPTION 'حساب سلف الموظفين (EMPLOYEE_ADVANCES) غير معرف في الدليل المحاسبي.'; END IF;
    v_payroll_tax_id := COALESCE((v_mappings->>'PAYROLL_TAX')::uuid, (SELECT id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1));

    IF p_treasury_acc IS NULL THEN 
        RAISE EXCEPTION 'يرجى تحديد حساب الخزينة أو البنك لصرف الرواتب.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_treasury_acc AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'حساب الخزينة/البنك المختار غير صحيح أو لا ينتمي لهذه المنظمة.';
    END IF;
    
    DELETE FROM public.journal_entries WHERE related_document_type = 'payroll' AND organization_id = v_org_id
    AND description LIKE 'مسير رواتب ' || p_month || '/' || p_year || '%';

    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items)) THEN RAISE EXCEPTION 'لا توجد بيانات موظفين صالحة في المسير.'; END IF;

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

    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances + v_total_payroll_tax), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

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

        -- 🛡️ حماية صارمة: منع خصم أي سلفة تاريخها يتجاوز تاريخ نهاية شهر المسير المحدد
        IF (v_item->>'advances_deducted')::numeric > 0 THEN
            IF v_item->'advances_ids' IS NOT NULL AND jsonb_array_length(v_item->'advances_ids') > 0 THEN
                UPDATE public.employee_advances 
                SET status = 'deducted', payroll_item_id = v_payroll_item_id
                WHERE id IN (SELECT (jsonb_array_elements_text(v_item->'advances_ids'))::uuid)
                  AND COALESCE(request_date, advance_date, created_at::date) <= v_cutoff_date
                  AND organization_id = v_org_id;
            ELSE
                UPDATE public.employee_advances 
                SET status = 'deducted', payroll_item_id = v_payroll_item_id
                WHERE employee_id = (v_item->>'employee_id')::uuid 
                  AND status = 'paid'
                  AND COALESCE(request_date, advance_date, created_at::date) <= v_cutoff_date
                  AND organization_id = v_org_id;
            END IF;
        END IF;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year, 'posted', v_org_id, true, v_payroll_id, 'payroll', auth.uid()) RETURNING id INTO v_je_id;

    IF v_total_gross > 0 AND v_salaries_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'رواتب وأجور أساسية شهر ' || p_month || '/' || p_year, v_org_id);
    END IF;

    IF v_total_additions > 0 AND v_bonuses_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز شهر ' || p_month || '/' || p_year, v_org_id);
    END IF;

    IF v_total_advances > 0 AND v_advances_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف من رواتب شهر ' || p_month || '/' || p_year, v_org_id);
    END IF;

    IF v_total_deductions > 0 AND v_deductions_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'استقطاعات وجزاءات شهر ' || p_month || '/' || p_year, v_org_id);
    END IF;

    IF v_total_payroll_tax > 0 AND v_payroll_tax_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_payroll_tax_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل شهر ' || p_month || '/' || p_year, v_org_id);
    END IF;

    IF v_total_net > 0 AND p_treasury_acc IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, p_treasury_acc, 0, v_total_net, 'صافي رواتب منصرفة شهر ' || p_month || '/' || p_year, v_org_id);
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_payroll_rpc(integer, integer, date, uuid, jsonb, uuid) TO authenticated, service_role;
