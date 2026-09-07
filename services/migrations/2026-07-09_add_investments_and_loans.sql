-- Migration: Add investment and loan asset accounts (112, 113) under Non-current Assets (11) to all organizations
-- Date: 09 July 2026

DO $$
DECLARE
    v_org record;
    v_parent_id uuid;
    v_inserted_count integer := 0;
BEGIN
    FOR v_org IN SELECT id, name FROM public.organizations LOOP
        -- Get the parent account '11' (الأصول غير المتداولة) for this organization
        SELECT id INTO v_parent_id FROM public.accounts WHERE code = '11' AND organization_id = v_org.id LIMIT 1;
        
        IF v_parent_id IS NOT NULL THEN
            -- 1. Insert '112' - استثمارات مالية if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '112' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('112', 'استثمارات مالية', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;

            -- 2. Insert '113' - قروض ممنوحة للغير if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '113' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('113', 'قروض ممنوحة للغير', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;
        ELSE
            RAISE NOTICE '⚠️ Organization % (%) does not have parent account 11', v_org.name, v_org.id;
        END IF;
    END LOOP;
    
    RAISE NOTICE '🎉 Successfully added % missing investment/loan accounts across organizations.', v_inserted_count;
END $$;
