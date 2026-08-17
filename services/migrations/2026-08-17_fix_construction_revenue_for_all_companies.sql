-- ==============================================================================
-- 🚀 ترقية وإصلاح شامل: حسابات مستخلصات العملاء ومستخلصات مقاولي الباطن
-- التاريخ: 17 أغسطس 2026
-- الهدف:
-- 1. التأكد من وجود حساب (41103 - إيراد عقود ومشاريع / مستخلصات) في كافة الشركات وربطه تلقائياً في الإعدادات.
-- 2. تصحيح قيود مستخلصات العملاء لتذهب إلى 41103 بدلاً من عقود صيانة مقدمة.
-- 3. تصحيح قيود مستخلصات مقاولي الباطن (SUB-BILL) وتوزيع أطرافها الدائنة بدقة:
--    - صافي المستحق للمقاول -> الموردين (201)
--    - محتجز ضمان مقاول الباطن -> محتجز ضمان لمقاولي الباطن (2229)
--    - استهلاك الدفعة المقدمة -> دفعات مقدمة للمقاولين والموردين (1245)
--    - ضريبة الخصم والتحصيل -> ضريبة الخصم والتحصيل علينا (2232)
-- 4. تحديث دوال النظام لضمان الدقة في أي شركة جديدة أو مستخلصات قادمة.
-- ==============================================================================

-- 1. إنشاء الحسابات وربطها وتصحيح قيود مستخلصات العملاء
DO $$
DECLARE
    v_org RECORD;
    v_parent_id UUID;
    v_rev_acc_id UUID;
BEGIN
    FOR v_org IN SELECT id, name FROM public.organizations LOOP
        -- أ. جلب معرف الحساب الأب 41 (إيرادات النشاط) أو 4 (الإيرادات)
        SELECT id INTO v_parent_id 
        FROM public.accounts 
        WHERE organization_id = v_org.id AND code = '41' 
        LIMIT 1;

        IF v_parent_id IS NULL THEN
            SELECT id INTO v_parent_id 
            FROM public.accounts 
            WHERE organization_id = v_org.id AND code = '4' 
            LIMIT 1;
        END IF;

        -- ب. التحقق من وجود حساب 41103
        SELECT id INTO v_rev_acc_id 
        FROM public.accounts 
        WHERE organization_id = v_org.id AND code = '41103' 
        LIMIT 1;

        IF v_rev_acc_id IS NULL THEN
            INSERT INTO public.accounts (
                organization_id, name, code, parent_id, type, is_active, is_group
            ) VALUES (
                v_org.id, 'إيراد عقود ومشاريع (مستخلصات)', '41103', v_parent_id, 'revenue', true, false
            ) RETURNING id INTO v_rev_acc_id;
        ELSE
            UPDATE public.accounts
            SET type = 'revenue',
                parent_id = COALESCE(parent_id, v_parent_id),
                is_active = true
            WHERE id = v_rev_acc_id;
        END IF;

        -- ج. تحديث الربط التلقائي في إعدادات الشركة
        UPDATE public.company_settings
        SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('CONSTRUCTION_REVENUE', v_rev_acc_id::text)
        WHERE organization_id = v_org.id;

        -- د. تصحيح قيود مستخلصات العملاء فقط (التي لا تخص مقاولي الباطن)
        UPDATE public.journal_lines jl
        SET account_id = v_rev_acc_id
        FROM public.journal_entries je
        WHERE jl.journal_entry_id = je.id
          AND je.organization_id = v_org.id
          AND (je.related_document_type = 'construction_billing' OR (je.description LIKE '%مستخلص%' AND je.description NOT LIKE '%مستخلص مقاول%' AND je.description NOT LIKE '%SUB-BILL%'))
          AND jl.credit > 0
          -- استثناء ضريبة القيمة المضافة مخرجات 2231
          AND jl.account_id NOT IN (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org.id)
          AND jl.account_id != v_rev_acc_id
          AND (
              jl.account_id IN (SELECT id FROM public.accounts WHERE code IN ('124305', '1243', '411') AND organization_id = v_org.id)
              OR jl.account_id IN (SELECT id FROM public.accounts WHERE type != 'revenue' AND organization_id = v_org.id)
          );

    END LOOP;
END $$;


-- 2. تصحيح قيود مستخلصات مقاولي الباطن (SUB-BILL) وإرجاع حساباتها الصحيحة
DO $$
DECLARE
    r_sub RECORD;
    v_je_id UUID;
    v_supp_acc UUID;
    v_retention_supp_acc UUID;
    v_advance_supp_acc UUID;
    v_wht_pay_acc UUID;
BEGIN
    FOR r_sub IN 
        SELECT sb.*, c.project_id
        FROM public.subcontractor_billings sb
        LEFT JOIN public.subcontractor_contracts c ON c.id = sb.contract_id
    LOOP
        SELECT id INTO v_supp_acc FROM public.accounts WHERE organization_id = r_sub.organization_id AND code = '201' LIMIT 1;
        SELECT id INTO v_retention_supp_acc FROM public.accounts WHERE organization_id = r_sub.organization_id AND code = '2229' LIMIT 1;
        SELECT id INTO v_advance_supp_acc FROM public.accounts WHERE organization_id = r_sub.organization_id AND code = '1245' LIMIT 1;
        SELECT id INTO v_wht_pay_acc FROM public.accounts WHERE organization_id = r_sub.organization_id AND code = '2232' LIMIT 1;

        v_je_id := r_sub.related_journal_entry_id;
        IF v_je_id IS NULL THEN
            SELECT id INTO v_je_id FROM public.journal_entries 
            WHERE organization_id = r_sub.organization_id 
              AND (reference = r_sub.billing_number OR description LIKE '%' || r_sub.billing_number || '%')
            LIMIT 1;
        END IF;

        IF v_je_id IS NOT NULL THEN
            -- 1. صافي المستحق للمقاول -> حساب الموردين (201)
            UPDATE public.journal_lines
            SET account_id = v_supp_acc
            WHERE journal_entry_id = v_je_id 
              AND credit > 0 
              AND (description LIKE '%صافي%' OR description LIKE '%مستحق للمقاول%' OR credit = (r_sub.gross_amount - COALESCE(r_sub.retention_amount, 0) - COALESCE(r_sub.advance_deduction, 0) + COALESCE(r_sub.vat_amount, 0) - COALESCE(r_sub.wht_amount, 0)));

            -- 2. محتجز ضمان مقاول -> حساب محتجز ضمان لمقاولي الباطن (2229)
            IF COALESCE(r_sub.retention_amount, 0) > 0 THEN
                UPDATE public.journal_lines
                SET account_id = v_retention_supp_acc
                WHERE journal_entry_id = v_je_id 
                  AND credit > 0 
                  AND (description LIKE '%محتجز ضمان%' OR description LIKE '%ضمان مقاول%' OR (credit = r_sub.retention_amount AND account_id != v_supp_acc));
            END IF;

            -- 3. استهلاك الدفعة المقدمة -> حساب دفعات مقدمة للمقاولين (1245)
            IF COALESCE(r_sub.advance_deduction, 0) > 0 THEN
                UPDATE public.journal_lines
                SET account_id = v_advance_supp_acc
                WHERE journal_entry_id = v_je_id 
                  AND credit > 0 
                  AND (description LIKE '%دفعة مقدمة%' OR description LIKE '%استهلاك%' OR (credit = r_sub.advance_deduction AND account_id NOT IN (v_supp_acc, v_retention_supp_acc)));
            END IF;

            -- 4. ضريبة الخصم والتحصيل -> ضريبة الخصم والتحصيل علينا (2232)
            IF COALESCE(r_sub.wht_amount, 0) > 0 THEN
                UPDATE public.journal_lines
                SET account_id = v_wht_pay_acc
                WHERE journal_entry_id = v_je_id 
                  AND credit > 0 
                  AND (description LIKE '%خصم وتحصيل%' OR (credit = r_sub.wht_amount AND account_id NOT IN (v_supp_acc, v_retention_supp_acc, v_advance_supp_acc)));
            END IF;
        END IF;
    END LOOP;

    -- معالجة إضافية عامة لأي قيود مستخلصات مقاولين
    FOR v_je_id IN 
        SELECT id FROM public.journal_entries 
        WHERE (description LIKE 'مستخلص مقاول:%' OR description LIKE '%SUB-BILL%')
    LOOP
        -- سطر الصافي
        UPDATE public.journal_lines jl
        SET account_id = (SELECT id FROM public.accounts WHERE organization_id = je.organization_id AND code = '201' LIMIT 1)
        FROM public.journal_entries je
        WHERE jl.journal_entry_id = je.id AND je.id = v_je_id
          AND jl.credit > 0 AND jl.description LIKE '%صافي%';

        -- سطر الضمان
        UPDATE public.journal_lines jl
        SET account_id = (SELECT id FROM public.accounts WHERE organization_id = je.organization_id AND code = '2229' LIMIT 1)
        FROM public.journal_entries je
        WHERE jl.journal_entry_id = je.id AND je.id = v_je_id
          AND jl.credit > 0 AND jl.description LIKE '%ضمان%';

        -- سطر الدفعة المقدمة
        UPDATE public.journal_lines jl
        SET account_id = (SELECT id FROM public.accounts WHERE organization_id = je.organization_id AND code = '1245' LIMIT 1)
        FROM public.journal_entries je
        WHERE jl.journal_entry_id = je.id AND je.id = v_je_id
          AND jl.credit > 0 AND (jl.description LIKE '%دفعة مقدمة%' OR jl.description LIKE '%استهلاك%');

        -- سطر الخصم والتحصيل
        UPDATE public.journal_lines jl
        SET account_id = (SELECT id FROM public.accounts WHERE organization_id = je.organization_id AND code = '2232' LIMIT 1)
        FROM public.journal_entries je
        WHERE jl.journal_entry_id = je.id AND je.id = v_je_id
          AND jl.credit > 0 AND jl.description LIKE '%خصم وتحصيل%';
    END LOOP;
END $$;


-- 3. تحديث دالة اعتماد مستخلصات العملاء (fn_approve_project_billing)
CREATE OR REPLACE FUNCTION public.fn_approve_project_billing(p_billing_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_billing RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_org_id UUID;
    v_mappings JSONB;
    v_cust_acc UUID;
    v_revenue_acc UUID;
    v_retention_cust_acc UUID;
    v_advance_cust_acc UUID;
    v_vat_acc UUID;
    v_wht_rec_acc UUID;
BEGIN
    SELECT b.*, COALESCE(b.advance_deduction, 0) as adv_deduct INTO v_billing 
    FROM public.project_progress_billings b WHERE b.id = p_billing_id;
    
    SELECT * INTO v_project FROM public.projects WHERE id = v_billing.project_id;
    v_org_id := v_billing.organization_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    v_cust_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'CUSTOMERS')::UUID, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1)));
    
    v_revenue_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'CONSTRUCTION_REVENUE')::UUID, 
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND type = 'revenue' AND (code = '41103' OR name LIKE '%إيراد%عقود%' OR name LIKE '%إيراد%مشاريع%' OR name LIKE '%مستخلص%') ORDER BY CASE WHEN code = '41103' THEN 1 ELSE 2 END LIMIT 1),
        (v_mappings->>'SALES_REVENUE')::UUID, 
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '411' LIMIT 1)
    ));

    IF v_revenue_acc IS NULL THEN
        INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
        VALUES (
            v_org_id, 
            'إيراد عقود ومشاريع (مستخلصات)', 
            '41103', 
            COALESCE(
                (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '41' LIMIT 1),
                (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '4' LIMIT 1)
            ), 
            'revenue', 
            true, 
            false
        )
        ON CONFLICT (organization_id, code) DO UPDATE SET is_active = true, type = 'revenue'
        RETURNING id INTO v_revenue_acc;

        UPDATE public.company_settings
        SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('CONSTRUCTION_REVENUE', v_revenue_acc::text)
        WHERE organization_id = v_org_id;
    END IF;

    v_retention_cust_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'RETENTION_CUSTOMER')::UUID, (SELECT id FROM public.accounts WHERE code = '1249' AND organization_id = v_org_id LIMIT 1)));
    v_advance_cust_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'SECURITY_DEPOSIT_ACCOUNT')::UUID, (v_mappings->>'CUSTOMER_ADVANCES')::UUID, (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'VAT')::UUID, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1)));
    v_wht_rec_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WHT_RECEIVABLE')::UUID, (SELECT id FROM public.accounts WHERE code = '1242' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_billing.billing_date, 'مستخلص رقم ' || v_billing.billing_number || ' - مشروع ' || v_project.name, v_billing.billing_number, 'posted', v_org_id, p_billing_id, 'construction_billing', true)
    RETURNING id INTO v_je_id;

    -- من ح/ العميل (صافي المستحق)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_cust_acc, v_billing.net_amount, 0, 'صافي المستخلص المستحق', v_org_id);

    -- من ح/ ضمان الأعمال (أصل لدى الغير)
    IF v_billing.retention_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_retention_cust_acc, v_billing.retention_amount, 0, 'محتجز ضمان مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    -- من ح/ ضريبة الخصم والتحصيل لنا
    IF COALESCE(v_billing.wht_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wht_rec_acc, v_billing.wht_amount, 0, 'ضريبة خصم وتحصيل مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    -- من ح/ الدفعات المقدمة (تخفيض التزام)
    IF v_billing.adv_deduct > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_advance_cust_acc, v_billing.adv_deduct, 0, 'استهلاك دفعة مقدمة مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    -- إلى ح/ إيراد عقود ومشاريع (مستخلصات)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_revenue_acc, 0, v_billing.gross_amount, 'إيراد أعمال مشروع ' || v_project.name, v_org_id);

    -- إلى ح/ ضريبة القيمة المضافة
    IF COALESCE(v_billing.vat_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc, 0, v_billing.vat_amount, 'ضريبة قيمة مضافة مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    UPDATE public.project_progress_billings SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_billing_id;
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_approve_project_billing(UUID) TO authenticated;


-- 4. تحديث دالة اعتماد مستخلصات مقاولي الباطن (fn_approve_sub_billing)
CREATE OR REPLACE FUNCTION public.fn_approve_sub_billing(p_billing_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_billing RECORD;
    v_contract RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_org_id UUID;
    v_mappings JSONB;
    v_supp_acc UUID;
    v_retention_supp_acc UUID; 
    v_advance_supp_acc UUID;   
    v_vat_acc UUID;
    v_wht_pay_acc UUID;
BEGIN
    SELECT * INTO v_billing FROM public.subcontractor_billings WHERE id = p_billing_id;
    SELECT * INTO v_contract FROM public.subcontractor_contracts WHERE id = v_billing.contract_id;
    SELECT * INTO v_project FROM public.projects WHERE id = v_contract.project_id;
    v_org_id := v_billing.organization_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    v_supp_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'SUPPLIERS')::UUID, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1)));
    v_retention_supp_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'RETENTION_SUBCONTRACTOR')::UUID, (SELECT id FROM public.accounts WHERE code = '2229' AND organization_id = v_org_id LIMIT 1)));
    v_advance_supp_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'ADVANCE_PAYMENT_SUBCONTRACTOR')::UUID, (SELECT id FROM public.accounts WHERE code = '1245' AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'VAT_INPUT')::UUID, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1)));
    v_wht_pay_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WHT_PAYABLE')::UUID, (SELECT id FROM public.accounts WHERE code = '2232' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_billing.billing_date, 'مستخلص مقاول: ' || v_billing.billing_number || ' - ' || v_project.name, v_billing.billing_number, 'posted', v_org_id, p_billing_id, 'sub_billing', true)
    RETURNING id INTO v_je_id;

    -- من ح/ تكاليف المشروع (بالإجمالي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project.cost_center_account_id, v_billing.gross_amount, 0, 'تكلفة أعمال مقاول باطن', v_org_id);

    -- من ح/ ضريبة القيمة المضافة (مدخلات)
    IF COALESCE(v_billing.vat_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc, v_billing.vat_amount, 0, 'ضريبة قيمة مضافة مشتريات', v_org_id);
    END IF;

    -- إلى ح/ المقاول (صافي المستحق)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_supp_acc, 0, v_billing.net_amount, 'صافي مستحق للمقاول', v_org_id);

    -- إلى ح/ محجوز ضمان مقاولين (2229)
    IF v_billing.retention_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_retention_supp_acc, 0, v_billing.retention_amount, 'محتجز ضمان مقاول', v_org_id);
    END IF;

    -- إلى ح/ الدفعات المقدمة (1245)
    IF COALESCE(v_billing.advance_deduction, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_advance_supp_acc, 0, v_billing.advance_deduction, 'استهلاك دفعة مقدمة مقاول', v_org_id);
    END IF;

    -- إلى ح/ ضريبة الخصم والتحصيل علينا (2232)
    IF COALESCE(v_billing.wht_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wht_pay_acc, 0, v_billing.wht_amount, 'ضريبة خصم وتحصيل من المنبع', v_org_id);
    END IF;

    UPDATE public.subcontractor_billings SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_billing_id;
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_approve_sub_billing(UUID) TO authenticated;
