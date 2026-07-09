-- Migration: Add specific accumulated depreciation accounts (11192, 11193, 11194, 11195, 11196) under Fixed Assets (111) to all organizations
-- Date: 09 July 2026

DO $$
DECLARE
    v_org record;
    v_parent_id uuid;
    v_inserted_count integer := 0;
BEGIN
    FOR v_org IN SELECT id, name FROM public.organizations LOOP
        -- Get the parent account '111' (الأصول الثابتة) for this organization
        SELECT id INTO v_parent_id FROM public.accounts WHERE code = '111' AND organization_id = v_org.id LIMIT 1;
        
        IF v_parent_id IS NOT NULL THEN
            -- 1. Insert '11192' - مجمع إهلاك المباني والإنشاءات if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '11192' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('11192', 'مجمع إهلاك المباني والإنشاءات', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;

            -- 2. Insert '11193' - مجمع إهلاك الآلات والمعدات if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '11193' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('11193', 'مجمع إهلاك الآلات والمعدات', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;

            -- 3. Insert '11194' - مجمع إهلاك وسائل النقل والانتقال (السيارات) if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '11194' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('11194', 'مجمع إهلاك وسائل النقل والانتقال (السيارات)', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;

            -- 4. Insert '11195' - مجمع إهلاك الأثاث والتجهيزات المكتبية if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '11195' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('11195', 'مجمع إهلاك الأثاث والتجهيزات المكتبية', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;

            -- 5. Insert '11196' - مجمع إهلاك أجهزة حاسب آلي وبرمجيات if not exists
            IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '11196' AND organization_id = v_org.id) THEN
                INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id)
                VALUES ('11196', 'مجمع إهلاك أجهزة حاسب آلي وبرمجيات', 'ASSET', false, v_parent_id, v_org.id);
                v_inserted_count := v_inserted_count + 1;
            END IF;
        ELSE
            RAISE NOTICE '⚠️ Organization % (%) does not have parent account 111', v_org.name, v_org.id;
        END IF;
    END LOOP;
    
    RAISE NOTICE '🎉 Successfully added % missing accumulated depreciation accounts across organizations.', v_inserted_count;
END $$;
