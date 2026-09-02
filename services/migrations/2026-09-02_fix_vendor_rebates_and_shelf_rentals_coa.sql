-- ==============================================================================
-- TriPro ERP - Migration: Fix Vendor Rebates & Shelf Rental COA & Historical Entries
-- 1. Temporarily bypasses trg_protect_posted_journal_lines to safely update the posted entry
-- 2. Adds 42101 (Shelf Rental) and 42102 (Earned Discounts/Rebates) to all orgs
-- 3. Updates company_settings account_mappings
-- 4. Fixes REB-2026-2610 and switches debit line from 1245 to 201 (Suppliers)
-- 5. Re-enables trg_protect_posted_journal_lines
-- ==============================================================================

-- 1. تعطيل تريجر الحماية مؤقتاً لتصحيح القيود المرحلة
ALTER TABLE public.journal_lines DISABLE TRIGGER trg_protect_posted_journal_lines;

DO $$
DECLARE
    r_org RECORD;
    v_parent_id UUID;
    v_shelf_id UUID;
    v_rebate_id UUID;
    v_supp_id UUID;
BEGIN
    -- 1. إضافة حسابات البونص وإيجار الأرفف لكافة الشركات
    FOR r_org IN SELECT id FROM public.organizations LOOP
        SELECT id INTO v_parent_id FROM public.accounts 
        WHERE organization_id = r_org.id AND (code = '42' OR code = '4') 
        ORDER BY LENGTH(code) DESC LIMIT 1;

        -- أ) إيرادات إيجار أرفف ومساحات ترويجية (42101)
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = r_org.id AND code = '42101') THEN
            INSERT INTO public.accounts (organization_id, name, code, type, is_group, parent_id, balance)
            VALUES (r_org.id, 'إيرادات إيجار أرفف ومساحات ترويجية', '42101', 'revenue', false, v_parent_id, 0)
            RETURNING id INTO v_shelf_id;
        ELSE
            SELECT id INTO v_shelf_id FROM public.accounts WHERE organization_id = r_org.id AND code = '42101' LIMIT 1;
        END IF;

        -- ب) خصم مكتسب وبوانص موردين تجارية (42102)
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = r_org.id AND code = '42102') THEN
            INSERT INTO public.accounts (organization_id, name, code, type, is_group, parent_id, balance)
            VALUES (r_org.id, 'خصم مكتسب وبوانص موردين تجارية', '42102', 'revenue', false, v_parent_id, 0)
            RETURNING id INTO v_rebate_id;
        ELSE
            SELECT id INTO v_rebate_id FROM public.accounts WHERE organization_id = r_org.id AND code = '42102' LIMIT 1;
        END IF;

        -- ج) جلب حساب الموردين الرئيسي (201)
        SELECT id INTO v_supp_id FROM public.accounts 
        WHERE organization_id = r_org.id AND code = '201' LIMIT 1;

        -- د) تحديث الروابط السيادية في إعدادات المنظمة
        UPDATE public.company_settings 
        SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object(
            'SHELF_RENTAL_REVENUE', v_shelf_id,
            'EARNED_DISCOUNTS', v_rebate_id,
            'SUPPLIERS', COALESCE((account_mappings->>'SUPPLIERS')::UUID, v_supp_id)
        )
        WHERE organization_id = r_org.id;
    END LOOP;

    -- 2. تصحيح القيد REB-2026-2610 وأي قيد مسجل بالخطأ على حساب الدفعات المقدمة (1245)
    FOR r_org IN 
        SELECT DISTINCT je.id as entry_id, je.organization_id, jl.id as line_id
        FROM public.journal_entries je
        JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
        JOIN public.accounts acc ON acc.id = jl.account_id
        WHERE (je.reference ILIKE 'REB-%' OR je.description ILIKE '%إثبات استحقاق بونص%')
          AND acc.code = '1245'
          AND jl.debit > 0
    LOOP
        -- جلب حساب الموردين (201)
        SELECT id INTO v_supp_id FROM public.accounts 
        WHERE organization_id = r_org.organization_id 
          AND (code = '201' OR code = '20101' OR (name ILIKE '%الموردين%' AND type = 'liability'))
        LIMIT 1;

        IF v_supp_id IS NOT NULL THEN
            UPDATE public.journal_lines 
            SET account_id = v_supp_id
            WHERE id = r_org.line_id;
        END IF;
    END LOOP;

    NOTIFY pgrst, 'reload schema';
END $$;

-- 2. إعادة تفعيل تريجر الحماية فوراً
ALTER TABLE public.journal_lines ENABLE TRIGGER trg_protect_posted_journal_lines;
