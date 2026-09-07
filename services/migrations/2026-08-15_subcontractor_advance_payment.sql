-- ==============================================================================
-- 🚀 ترقية صرف الدفعات المقدمة لمقاولي الباطن (Subcontractor Advance Payments)
-- التاريخ: 15 أغسطس 2026
-- ==============================================================================

-- 1. التأكد من وجود عمود advance_payment_balance في جدول العقود
ALTER TABLE public.subcontractor_contracts 
ADD COLUMN IF NOT EXISTS advance_payment_balance NUMERIC(15,2) DEFAULT 0;

-- 2. دالة صرف الدفعة المقدمة للمقاول مع توليد القيد المحاسبي المباشر
CREATE OR REPLACE FUNCTION public.fn_disburse_subcontractor_advance(
    p_contract_id UUID,
    p_amount NUMERIC,
    p_source_account_id UUID,
    p_date DATE DEFAULT CURRENT_DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_contract RECORD;
    v_project RECORD;
    v_sub RECORD;
    v_org_id UUID;
    v_je_id UUID;
    v_mappings JSONB;
    v_advance_acc UUID;
    v_parent_id UUID;
BEGIN
    SELECT * INTO v_contract FROM public.subcontractor_contracts WHERE id = p_contract_id;
    IF v_contract IS NULL THEN
        RAISE EXCEPTION 'عقد مقاول الباطن غير موجود.';
    END IF;

    SELECT * INTO v_project FROM public.projects WHERE id = v_contract.project_id;
    SELECT * INTO v_sub FROM public.subcontractors WHERE id = v_contract.subcontractor_id;
    v_org_id := v_contract.organization_id;

    IF COALESCE(p_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'مبلغ الدفعة المقدمة يجب أن يكون أكبر من صفر.';
    END IF;

    IF p_source_account_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد حساب الخزينة أو البنك المصروف منه.';
    END IF;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- تحديد حساب دفعات مقدمة للمقاولين (1245)
    v_advance_acc := public.resolve_leaf_account(COALESCE(
        (v_mappings->>'ADVANCE_PAYMENT_SUBCONTRACTOR')::UUID,
        (SELECT id FROM public.accounts WHERE code = '1245' AND organization_id = v_org_id LIMIT 1),
        (SELECT id FROM public.accounts WHERE (code = '1225' OR name LIKE '%دفعات مقدمة%مقاول%') AND organization_id = v_org_id LIMIT 1)
    ));

    IF v_advance_acc IS NULL THEN
        SELECT id INTO v_parent_id FROM public.accounts WHERE code = '12' AND organization_id = v_org_id LIMIT 1;
        INSERT INTO public.accounts (
            organization_id, name, code, parent_id, type, is_active, is_group
        ) VALUES (
            v_org_id, 'دفعات مقدمة لمقاولي الباطن', '1245', v_parent_id, 'asset', true, false
        ) RETURNING id INTO v_advance_acc;

        UPDATE public.company_settings
        SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('ADVANCE_PAYMENT_SUBCONTRACTOR', v_advance_acc::text)
        WHERE organization_id = v_org_id;
    END IF;

    -- 1. إنشاء القيد المحاسبي
    INSERT INTO public.journal_entries (
        transaction_date, 
        description, 
        reference, 
        status, 
        organization_id, 
        related_document_id, 
        related_document_type, 
        is_posted
    ) VALUES (
        COALESCE(p_date, CURRENT_DATE),
        'صرف دفعة مقدمة لمقاول باطن: ' || COALESCE(v_sub.name, '') || ' - عقد: ' || v_contract.contract_name || ' - مشروع: ' || COALESCE(v_project.name, ''),
        'SUB-ADV-' || SUBSTRING(p_contract_id::text, 1, 8),
        'posted',
        v_org_id,
        p_contract_id,
        'subcontractor_advance',
        true
    ) RETURNING id INTO v_je_id;

    -- من ح/ دفعات مقدمة لمقاولي الباطن (مدين)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_advance_acc, p_amount, 0, COALESCE(p_notes, 'صرف دفعة مقدمة للمقاول ' || COALESCE(v_sub.name, '')), v_org_id);

    -- إلى ح/ الخزينة أو البنك (دائن)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, p_source_account_id, 0, p_amount, 'خروج نقدية لسداد دفعة مقدمة عقد ' || v_contract.contract_name, v_org_id);

    -- 2. زيادة رصيد الدفعة المقدمة في العقد
    UPDATE public.subcontractor_contracts 
    SET advance_payment_balance = COALESCE(advance_payment_balance, 0) + p_amount
    WHERE id = p_contract_id;

    RETURN v_je_id;
END;
$$;

-- 3. تحديث دالة اعتماد مستخلص المقاول لخصم الدفعة المقدمة من رصيد العقد
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

    -- من ح/ تكاليف المشروع - بالقيمة الإجمالية
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project.cost_center_account_id, v_billing.gross_amount, 0, 'تكلفة أعمال مقاول باطن', v_org_id);

    -- من ح/ ضريبة القيمة المضافة (مدخلات)
    IF COALESCE(v_billing.vat_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc, v_billing.vat_amount, 0, 'ضريبة قيمة مضافة مشتريات', v_org_id);
    END IF;

    -- إلى ح/ المقاول (بالصافي المستحق)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_supp_acc, 0, v_billing.net_amount, 'صافي مستحق للمقاول', v_org_id);

    -- إلى ح/ محجوز ضمان مقاولين (Liability)
    IF v_billing.retention_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_retention_supp_acc, 0, v_billing.retention_amount, 'محتجز ضمان مقاول', v_org_id);
    END IF;

    -- إلى ح/ الدفعات المقدمة (تخفيض الأصل)
    IF COALESCE(v_billing.advance_deduction, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_advance_supp_acc, 0, v_billing.advance_deduction, 'استهلاك دفعة مقدمة مقاول', v_org_id);
        
        -- تخفيض رصيد الدفعة المقدمة المتبقي في العقد
        UPDATE public.subcontractor_contracts 
        SET advance_payment_balance = GREATEST(0, COALESCE(advance_payment_balance, 0) - v_billing.advance_deduction)
        WHERE id = v_billing.contract_id;
    END IF;

    -- إلى ح/ ضريبة الخصم والتحصيل (التزام)
    IF COALESCE(v_billing.wht_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wht_pay_acc, 0, v_billing.wht_amount, 'ضريبة خصم وتحصيل من المنبع', v_org_id);
    END IF;

    UPDATE public.subcontractor_billings SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_billing_id;
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_disburse_subcontractor_advance(UUID, NUMERIC, UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_sub_billing(UUID) TO authenticated;
