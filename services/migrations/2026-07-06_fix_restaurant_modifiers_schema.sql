-- TriPro ERP - Fix Restaurant Modifiers Schema and Functions
-- Date: July 6, 2026
-- Description: Ensures all required columns for restaurant modifier groups and modifiers exist in the database, and adds copy_modifiers_to_product function.

DO $$
BEGIN
    -- 1. Ensure selection_type column exists on modifier_groups
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'modifier_groups' AND column_name = 'selection_type'
    ) THEN
        ALTER TABLE public.modifier_groups ADD COLUMN selection_type TEXT NOT NULL DEFAULT 'MULTIPLE';
        ALTER TABLE public.modifier_groups ADD CONSTRAINT modifier_groups_selection_type_check CHECK (selection_type IN ('SINGLE', 'MULTIPLE'));
    END IF;

    -- 2. Ensure is_default column exists on modifiers
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'modifiers' AND column_name = 'is_default'
    ) THEN
        ALTER TABLE public.modifiers ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;
    END IF;

    -- 3. Ensure unit_price column exists on modifiers (rename from price if price exists)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'modifiers' AND column_name = 'unit_price'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'modifiers' AND column_name = 'price'
        ) THEN
            ALTER TABLE public.modifiers RENAME COLUMN price TO unit_price;
        ELSE
            ALTER TABLE public.modifiers ADD COLUMN unit_price NUMERIC(10,2) NOT NULL DEFAULT 0;
        END IF;
    END IF;

    -- 4. Ensure cost column exists on modifiers
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'modifiers' AND column_name = 'cost'
    ) THEN
        ALTER TABLE public.modifiers ADD COLUMN cost NUMERIC(10,2) NOT NULL DEFAULT 0;
    END IF;

    -- 5. Ensure is_available column exists on modifiers
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'modifiers' AND column_name = 'is_available'
    ) THEN
        ALTER TABLE public.modifiers ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT true;
    END IF;

END $$;

-- 6. Grant permissions on tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modifier_groups TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modifiers TO authenticated, anon;

-- 7. Add copy_modifiers_to_product function
CREATE OR REPLACE FUNCTION public.copy_modifiers_to_product(
    source_product_id UUID,
    target_product_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_group RECORD;
    v_modifier RECORD;
    v_new_group_id UUID;
    v_org_id UUID;
BEGIN
    -- Get organization_id of the target product
    SELECT organization_id INTO v_org_id FROM public.products WHERE id = target_product_id;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Target product not found';
    END IF;

    -- Loop through modifier groups of the source product
    FOR v_group IN 
        SELECT * FROM public.modifier_groups 
        WHERE product_id = source_product_id
    LOOP
        -- Insert new modifier group for the target product
        INSERT INTO public.modifier_groups (
            name, product_id, selection_type, is_required, 
            min_selection, max_selection, display_order, organization_id
        )
        VALUES (
            v_group.name, target_product_id, v_group.selection_type, v_group.is_required,
            v_group.min_selection, v_group.max_selection, v_group.display_order, v_org_id
        )
        RETURNING id INTO v_new_group_id;

        -- Loop through modifiers in this group and insert them under the new group
        FOR v_modifier IN 
            SELECT * FROM public.modifiers 
            WHERE modifier_group_id = v_group.id
        LOOP
            INSERT INTO public.modifiers (
                modifier_group_id, name, unit_price, cost, 
                is_available, display_order, organization_id, is_default
            )
            VALUES (
                v_new_group_id, v_modifier.name, v_modifier.unit_price, v_modifier.cost,
                v_modifier.is_available, v_modifier.display_order, v_org_id, v_modifier.is_default
            );
        END LOOP;
    END LOOP;

    RETURN TRUE;
END;
$$;

-- Grant execution permissions on the function
GRANT EXECUTE ON FUNCTION public.copy_modifiers_to_product(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_modifiers_to_product(UUID, UUID) TO anon;
