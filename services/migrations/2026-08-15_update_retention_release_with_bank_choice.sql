-- ==============================================================================
-- 🚀 ترقية استرداد محجوزات الضمان واختيار حساب الخزينة/البنك
-- التاريخ: 15 أغسطس 2026
-- ==============================================================================

-- التأكد من وجود جدول استرداد المحجوزات
CREATE TABLE IF NOT EXISTS public.project_retention_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    subcontractor_id UUID REFERENCES public.subcontractors(id) ON DELETE CASCADE,
    release_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    release_type TEXT NOT NULL CHECK (release_type IN ('customer', 'subcontractor')),
    notes TEXT,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_retention_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SaaS_Retention_Releases_Isolation" ON public.project_retention_releases;
CREATE POLICY "SaaS_Retention_Releases_Isolation" ON public.project_retention_releases
    FOR ALL USING (organization_id = public.get_my_org());

-- دالة تسجيل واسترداد محجوز الضمان مع دعم تحديد حساب الخزينة أو البنك
CREATE OR REPLACE FUNCTION public.fn_release_retention(
    p_project_id UUID,
    p_amount NUMERIC,
    p_type TEXT,
    p_notes TEXT DEFAULT NULL,
    p_subcontractor_id UUID DEFAULT NULL,
    p_source_account_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id UUID;
    v_project RECORD;
    v_sub RECORD;
    v_release_id UUID;
    v_je_id UUID;
    v_mappings JSONB;
    v_treasury_acc UUID;
    v_retention_acc UUID;
    v_description TEXT;
    v_reference TEXT;
BEGIN
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
    IF v_project IS NULL THEN
        RAISE EXCEPTION 'المشروع غير موجود.';
    END IF;

    v_org_id := v_project.organization_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    IF COALESCE(p_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'مبلغ الاسترداد يجب أن يكون أكبر من صفر.';
    END IF;

    -- 1. تحديد حساب النقدية / البنك (المختار أو الافتراضي للخزينة)
    IF p_source_account_id IS NOT NULL THEN
        v_treasury_acc := p_source_account_id;
    ELSE
        v_treasury_acc := public.resolve_leaf_account(COALESCE(
            (v_mappings->>'TREASURY')::UUID,
            (SELECT id FROM public.accounts WHERE code = '1231' AND organization_id = v_org_id LIMIT 1),
            (SELECT id FROM public.accounts WHERE code = '123' AND organization_id = v_org_id LIMIT 1)
        ));
    END IF;

    -- 2. إدخال سجل الاسترداد
    INSERT INTO public.project_retention_releases (
        organization_id, project_id, subcontractor_id, release_date, amount, release_type, notes
    ) VALUES (
        v_org_id, p_project_id, p_subcontractor_id, CURRENT_DATE, p_amount, p_type, p_notes
    ) RETURNING id INTO v_release_id;

    -- 3. معالجة القيد المحاسبي حسب نوع الاسترداد
    IF p_type = 'customer' THEN
        -- استرداد من العميل (وارد إلى الخزينة/البنك وتخفيض محتجز الضمان لدى الغير)
        v_retention_acc := public.resolve_leaf_account(COALESCE(
            (v_mappings->>'RETENTION_CUSTOMER')::UUID,
            (SELECT id FROM public.accounts WHERE code = '1249' AND organization_id = v_org_id LIMIT 1),
            (SELECT id FROM public.accounts WHERE (name LIKE '%محتجز ضمان لدى الغير%' OR name LIKE '%محتجز ضمان%عملاء%') AND organization_id = v_org_id LIMIT 1)
        ));

        v_description := 'استرداد محجوز ضمان عميل - مشروع: ' || v_project.name;
        v_reference := 'RET-CUST-' || SUBSTRING(v_release_id::text, 1, 8);

        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
        ) VALUES (
            CURRENT_DATE, v_description, v_reference, 'posted', v_org_id, v_release_id, 'retention_release_customer', true
        ) RETURNING id INTO v_je_id;

        -- من ح/ الخزينة أو البنك (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_treasury_acc, p_amount, 0, 'استلام محجوز ضمان العميل', v_org_id);

        -- إلى ح/ محتجز ضمان لدى الغير - عملاء (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_retention_acc, 0, p_amount, 'إقفال محتجز ضمان مشروع ' || v_project.name, v_org_id);

    ELSIF p_type = 'subcontractor' THEN
        -- رد لمقاول باطن (صرف من الخزينة/البنك وتخفيض التزام محتجز الضمان لمقاولي الباطن)
        SELECT * INTO v_sub FROM public.subcontractors WHERE id = p_subcontractor_id;

        v_retention_acc := public.resolve_leaf_account(COALESCE(
            (v_mappings->>'RETENTION_SUBCONTRACTOR')::UUID,
            (SELECT id FROM public.accounts WHERE code = '2229' AND organization_id = v_org_id LIMIT 1),
            (SELECT id FROM public.accounts WHERE (name LIKE '%محتجز ضمان لمقاولي%' OR name LIKE '%محتجز ضمان%باطن%') AND organization_id = v_org_id LIMIT 1)
        ));

        v_description := 'رد محجوز ضمان لمقاول باطن: ' || COALESCE(v_sub.name, '') || ' - مشروع: ' || v_project.name;
        v_reference := 'RET-SUB-' || SUBSTRING(v_release_id::text, 1, 8);

        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
        ) VALUES (
            CURRENT_DATE, v_description, v_reference, 'posted', v_org_id, v_release_id, 'retention_release_subcontractor', true
        ) RETURNING id INTO v_je_id;

        -- من ح/ محتجز ضمان مقاولي الباطن (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_retention_acc, p_amount, 0, 'رد ضمان مقاول باطن ' || COALESCE(v_sub.name, ''), v_org_id);

        -- إلى ح/ الخزينة أو البنك (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_treasury_acc, 0, p_amount, 'سداد ضمان مقاول باطن ' || COALESCE(v_sub.name, ''), v_org_id);
    END IF;

    -- ربط القيد بالسجل
    UPDATE public.project_retention_releases SET related_journal_entry_id = v_je_id WHERE id = v_release_id;

    RETURN v_release_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_release_retention(UUID, NUMERIC, TEXT, TEXT, UUID, UUID) TO authenticated;
