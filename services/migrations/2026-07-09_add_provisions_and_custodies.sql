-- Migration: Add provision accounts (Doubtful Debts, Agio, Cash Discount) and Employee Custody account to all organizations
-- Date: 09 July 2026

DO $$
DECLARE
    v_org record;
    v_parent_id uuid;
    v_inserted_count integer := 0;
BEGIN
    FOR v_org IN SELECT id, name FROM public.organizations LOOP
        -- Get the parent account '122' (العملاء والمدينون) for this organization
        SELECT id INTO v_parent_id FROM public.accounts WHERE code = '122' AND organization_id = v_org.id LIMIT 1;
        
        IF v_parent_id IS NOT NULL THEN
            -- 1. Insert '1224' - عهد موظفين if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1224' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('1224', 'عهد موظفين', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;

            -- 2. Insert '1225' - مخصص ديون مشكوك فيها if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1225' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('1225', 'مخصص ديون مشكوك فيها', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;

            -- 3. Insert '1226' - مخصص أجيوم if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1226' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('1226', 'مخصص أجيوم', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;

            -- 4. Insert '1227' - مخصص خصم مسموح به if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1227' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('1227', 'مخصص خصم مسموح به', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;
        ELSE
            RAISE NOTICE '⚠️ Organization % (%) does not have parent account 122', v_org.name, v_org.id;
        END IF;
    END LOOP;
    
    RAISE NOTICE '🎉 Successfully added % missing accounts across organizations.', v_inserted_count;
END $$;
