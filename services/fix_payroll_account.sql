-- 1. التأكد من وجود حساب مكافآت الموظفين (5312)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '5312') THEN
        INSERT INTO public.accounts (id, code, name, type, is_group, parent_id)
        VALUES (
            gen_random_uuid(), 
            '5312', 
            'مكافآت وحوافز', 
            'EXPENSE', 
            false, 
            (SELECT id FROM public.accounts WHERE code = '53' LIMIT 1)
        );
    END IF;
END $$;

-- 2. تحديث دالة ترحيل الرواتب لتستخدم الحساب الصحيح
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(
    p_month integer,
    p_year integer,
    p_date date,
    p_treasury_account_id uuid,
    p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
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
    
    -- Account IDs
    v_salaries_acc_id uuid;
    v_bonuses_acc_id uuid;
    v_deductions_acc_id uuid;
    v_advances_acc_id uuid;
BEGIN
    -- Get Organization ID
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    -- Get Account IDs
    SELECT id INTO v_salaries_acc_id FROM public.accounts WHERE code = '5201' LIMIT 1;
    SELECT id INTO v_bonuses_acc_id FROM public.accounts WHERE code = '5312' LIMIT 1; -- تم التصحيح هنا
    SELECT id INTO v_deductions_acc_id FROM public.accounts WHERE code = '404' LIMIT 1;
    SELECT id INTO v_advances_acc_id FROM public.accounts WHERE code = '10203' LIMIT 1;

    -- Calculate Totals
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_total_gross := v_total_gross + (v_item->>'gross_salary')::numeric;
        v_total_additions := v_total_additions + (v_item->>'additions')::numeric;
        v_total_deductions := v_total_deductions + (v_item->>'other_deductions')::numeric;
        v_total_advances := v_total_advances + (v_item->>'advances_deducted')::numeric;
        v_total_net := v_total_net + (v_item->>'net_salary')::numeric;
    END LOOP;

    -- Create Payroll Record
    INSERT INTO public.payrolls (
        payroll_month, payroll_year, payment_date, 
        total_gross_salary, total_additions, total_deductions, total_net_salary, 
        status, organization_id
    ) VALUES (
        p_month, p_year, p_date,
        v_total_gross, v_total_additions, (v_total_deductions + v_total_advances), v_total_net,
        'paid', v_org_id
    ) RETURNING id INTO v_payroll_id;

    -- Create Payroll Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.payroll_items (
            payroll_id, employee_id, 
            gross_salary, additions, advances_deducted, other_deductions, net_salary,
            organization_id
        ) VALUES (
            v_payroll_id, (v_item->>'employee_id')::uuid,
            (v_item->>'gross_salary')::numeric,
            (v_item->>'additions')::numeric,
            (v_item->>'advances_deducted')::numeric,
            (v_item->>'other_deductions')::numeric,
            (v_item->>'net_salary')::numeric,
            v_org_id
        );
    END LOOP;

    -- Create Journal Entry
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, is_posted
    ) VALUES (
        p_date, 
        'مسير رواتب شهر ' || p_month || '/' || p_year, 
        'PAYROLL-' || p_month || '-' || p_year || '-' || floor(random() * 1000)::text, 
        'posted', 
        v_org_id,
        true
    ) RETURNING id INTO v_je_id;

    -- Journal Lines
    IF v_total_gross > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وإضافي', v_org_id); END IF;
    IF v_total_deductions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_advances > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'خصم سلف', v_org_id); END IF;
    IF v_total_net > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_account_id, 0, v_total_net, 'صرف الرواتب', v_org_id); END IF;
END;
$$;