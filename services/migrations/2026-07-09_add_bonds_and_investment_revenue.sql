-- Migration: Add Bond Loan, Bond Interest Expense, and Investment Income accounts to all organizations
-- Date: 09 July 2026

DO $$
DECLARE
    v_org record;
    v_parent_42 uuid;
    v_parent_21 uuid;
    v_parent_53 uuid;
    v_inserted_count integer := 0;
BEGIN
    FOR v_org IN SELECT id, name FROM public.organizations LOOP
        -- 1. إيراد استثمارات (424) under '42'
        SELECT id INTO v_parent_42 FROM public.accounts WHERE code = '42' AND organization_id = v_org.id LIMIT 1;
        IF v_parent_42 IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '424' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('424', 'إيراد استثمارات', 'REVENUE', false, v_parent_42, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;
        END IF;

        -- 2. قروض طويلة الأجل (211) & قرض السندات (212) under '21'
        SELECT id INTO v_parent_21 FROM public.accounts WHERE code = '21' AND organization_id = v_org.id LIMIT 1;
        IF v_parent_21 IS NOT NULL THEN
            -- 211
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '211' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('211', 'قروض طويلة الأجل', 'LIABILITY', false, v_parent_21, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;
            -- 212
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '212' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('212', 'قرض السندات', 'LIABILITY', false, v_parent_21, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;
        END IF;

        -- 3. مصروف فائدة قرض السندات (5342) under '53'
        SELECT id INTO v_parent_53 FROM public.accounts WHERE code = '53' AND organization_id = v_org.id LIMIT 1;
        IF v_parent_53 IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '5342' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('5342', 'مصروف فائدة قرض السندات', 'EXPENSE', false, v_parent_53, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;
        END IF;

    END LOOP;
    
    RAISE NOTICE '🎉 Successfully added % missing bond/investment accounts across organizations.', v_inserted_count;
END $$;
