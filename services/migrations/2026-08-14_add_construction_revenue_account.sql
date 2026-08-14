-- ==============================================================================
-- 🚀 ترقية وتخصيص حساب إيراد العقود والمشاريع (Construction Revenue Upgrade)
-- التاريخ: 14 أغسطس 2026
-- ==============================================================================

DO $$
DECLARE
    v_org RECORD;
    v_parent_id UUID;
    v_rev_acc_id UUID;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        -- 1. التأكد من وجود حساب الأب 41 (الإيرادات)
        SELECT id INTO v_parent_id FROM public.accounts 
        WHERE organization_id = v_org.id AND code = '41' LIMIT 1;

        -- 2. التحقق من وجود حساب 41103 (إيراد عقود ومشاريع)
        SELECT id INTO v_rev_acc_id FROM public.accounts 
        WHERE organization_id = v_org.id AND code = '41103' LIMIT 1;

        IF v_rev_acc_id IS NULL THEN
            INSERT INTO public.accounts (
                organization_id, name, code, parent_id, type, is_active, is_group
            ) VALUES (
                v_org.id, 'إيراد عقود ومشاريع (مستخلصات)', '41103', v_parent_id, 'revenue', true, false
            ) RETURNING id INTO v_rev_acc_id;
        END IF;

        -- 3. تحديث الربط التلقائي في إعدادات الشركة
        UPDATE public.company_settings
        SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('CONSTRUCTION_REVENUE', v_rev_acc_id::text)
        WHERE organization_id = v_org.id;

        -- 4. تعديل القيود المحاسبية التاريخية الخاصة بالمستخلصات لتستخدم الحساب الجديد بدلاً من 411
        UPDATE public.journal_lines jl
        SET account_id = v_rev_acc_id
        FROM public.journal_entries je
        WHERE jl.journal_entry_id = je.id
          AND je.organization_id = v_org.id
          AND (je.related_document_type = 'construction_billing' OR je.description LIKE '%مستخلص%')
          AND jl.credit > 0
          AND jl.account_id IN (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org.id);
    END LOOP;
END $$;

-- 5. تحديث دالة اعتماد المستخلصات
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
        (SELECT id FROM public.accounts WHERE (code = '41103' OR name LIKE '%عقود%' OR name LIKE '%مستخلص%') AND organization_id = v_org_id LIMIT 1),
        (v_mappings->>'SALES_REVENUE')::UUID, 
        (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1)
    ));

    v_retention_cust_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'RETENTION_CUSTOMER')::UUID, (SELECT id FROM public.accounts WHERE code = '1249' AND organization_id = v_org_id LIMIT 1)));
    v_advance_cust_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'SECURITY_DEPOSIT_ACCOUNT')::UUID, (v_mappings->>'CUSTOMER_ADVANCES')::UUID, (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'VAT')::UUID, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1)));
    v_wht_rec_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WHT_RECEIVABLE')::UUID, (SELECT id FROM public.accounts WHERE code = '1242' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_billing.billing_date, 'مستخلص رقم ' || v_billing.billing_number || ' - مشروع ' || v_project.name, v_billing.billing_number, 'posted', v_org_id, p_billing_id, 'construction_billing', true)
    RETURNING id INTO v_je_id;

    -- من ح/ العميل (بالصافي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_cust_acc, v_billing.net_amount, 0, 'صافي المستخلص المستحق', v_org_id);

    -- من ح/ ضمان الأعمال (المبلغ المستقطع)
    IF v_billing.retention_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_retention_cust_acc, v_billing.retention_amount, 0, 'محتجز ضمان مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    -- من ح/ ضريبة الخصم والتحصيل (أصل)
    IF COALESCE(v_billing.wht_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wht_rec_acc, v_billing.wht_amount, 0, 'ضريبة خصم وتحصيل مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    -- من ح/ الدفعات المقدمة (استهلاك الدفعة)
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
        VALUES (v_je_id, v_vat_acc, 0, v_billing.vat_amount, 'ضريبة القيمة المضافة مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    UPDATE public.project_progress_billings SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_billing_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_approve_project_billing(UUID) TO authenticated;
