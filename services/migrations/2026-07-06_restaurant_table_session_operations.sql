-- TriPro ERP - Restaurant Table Session Operations (Transfer and Merge)
-- Date: July 6, 2026
-- Description: Adds database functions for transferring a session to another table and merging two table sessions.

-- 1. Function to Transfer a Table Session
CREATE OR REPLACE FUNCTION public.transfer_table_session(
    p_session_id UUID,
    p_target_table_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_source_table_id UUID;
    v_org_id UUID;
BEGIN
    -- Get session details
    SELECT organization_id, table_id INTO v_org_id, v_source_table_id 
    FROM public.table_sessions 
    WHERE id = p_session_id AND status = 'OPEN';

    IF v_source_table_id IS NULL THEN
        RAISE EXCEPTION 'Active session not found or already closed.';
    END IF;

    -- Verify target table exists and belongs to the same organization
    IF NOT EXISTS (
        SELECT 1 FROM public.restaurant_tables 
        WHERE id = p_target_table_id AND organization_id = v_org_id
    ) THEN
        RAISE EXCEPTION 'Target table not found or belongs to a different organization.';
    END IF;

    -- Verify target table is not already occupied
    IF EXISTS (
        SELECT 1 FROM public.restaurant_tables 
        WHERE id = p_target_table_id AND status = 'OCCUPIED'
    ) THEN
        RAISE EXCEPTION 'Target table is already occupied.';
    END IF;

    -- Update session to point to the new table
    UPDATE public.table_sessions 
    SET table_id = p_target_table_id 
    WHERE id = p_session_id;

    -- Make the source table AVAILABLE
    UPDATE public.restaurant_tables 
    SET status = 'AVAILABLE' 
    WHERE id = v_source_table_id;

    -- Make the target table OCCUPIED
    UPDATE public.restaurant_tables 
    SET status = 'OCCUPIED' 
    WHERE id = p_target_table_id;

    RETURN TRUE;
END;
$$;

-- 2. Function to Merge Two Table Sessions
CREATE OR REPLACE FUNCTION public.merge_table_sessions(
    p_source_session_id UUID,
    p_target_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_source_table_id UUID;
    v_target_table_id UUID;
    v_org_id UUID;
    v_source_order_id UUID;
    v_target_order_id UUID;
    v_subtotal NUMERIC;
    v_total_tax NUMERIC;
    v_total_discount NUMERIC;
    v_grand_total NUMERIC;
    v_tax_rate NUMERIC;
BEGIN
    -- Get source session info
    SELECT table_id, organization_id INTO v_source_table_id, v_org_id 
    FROM public.table_sessions 
    WHERE id = p_source_session_id AND status = 'OPEN';

    IF v_source_table_id IS NULL THEN
        RAISE EXCEPTION 'Source session not found or already closed.';
    END IF;

    -- Get target session info
    SELECT table_id INTO v_target_table_id 
    FROM public.table_sessions 
    WHERE id = p_target_session_id AND status = 'OPEN' AND organization_id = v_org_id;

    IF v_target_table_id IS NULL THEN
        RAISE EXCEPTION 'Target session not found, closed, or belongs to a different organization.';
    END IF;

    -- Find active open orders for source and target sessions
    -- (status not in cancelled, draft, paid, completed, posted)
    SELECT id INTO v_source_order_id FROM public.orders
    WHERE session_id = p_source_session_id 
      AND status NOT IN ('CANCELLED', 'DRAFT', 'posted', 'paid', 'PAID', 'COMPLETED')
      AND organization_id = v_org_id
    ORDER BY created_at DESC LIMIT 1;

    SELECT id INTO v_target_order_id FROM public.orders
    WHERE session_id = p_target_session_id 
      AND status NOT IN ('CANCELLED', 'DRAFT', 'posted', 'paid', 'PAID', 'COMPLETED')
      AND organization_id = v_org_id
    ORDER BY created_at DESC LIMIT 1;

    -- If both sessions have active orders, merge their items
    IF v_source_order_id IS NOT NULL AND v_target_order_id IS NOT NULL THEN
        -- Move all items from source order to target order
        UPDATE public.order_items 
        SET order_id = v_target_order_id 
        WHERE order_id = v_source_order_id;

        -- Get tax rate for the organization
        SELECT COALESCE(vat_rate, 0.15) INTO v_tax_rate 
        FROM public.company_settings 
        WHERE organization_id = v_org_id 
        LIMIT 1;

        -- Calculate new totals for the target order
        SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_subtotal 
        FROM public.order_items 
        WHERE order_id = v_target_order_id;

        SELECT COALESCE(total_discount, 0) INTO v_total_discount 
        FROM public.orders 
        WHERE id = v_target_order_id;

        v_total_tax := (v_subtotal - v_total_discount) * v_tax_rate;
        IF v_total_tax < 0 THEN
            v_total_tax := 0;
        END IF;

        v_grand_total := v_subtotal - v_total_discount + v_total_tax;

        -- Update target order totals
        UPDATE public.orders 
        SET subtotal = v_subtotal,
            total_tax = v_total_tax,
            grand_total = v_grand_total
        WHERE id = v_target_order_id;

        -- Delete the empty source order
        DELETE FROM public.orders WHERE id = v_source_order_id;

    -- If only source session has an active order, move the entire order to target session
    ELSIF v_source_order_id IS NOT NULL AND v_target_order_id IS NULL THEN
        UPDATE public.orders 
        SET session_id = p_target_session_id 
        WHERE id = v_source_order_id;
    END IF;

    -- Close the source session
    UPDATE public.table_sessions 
    SET status = 'CLOSED', end_time = now() 
    WHERE id = p_source_session_id;

    -- Make the source table AVAILABLE
    UPDATE public.restaurant_tables 
    SET status = 'AVAILABLE' 
    WHERE id = v_source_table_id;

    -- Ensure target table is OCCUPIED
    UPDATE public.restaurant_tables 
    SET status = 'OCCUPIED' 
    WHERE id = v_target_table_id;

    RETURN TRUE;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.transfer_table_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_table_session(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.merge_table_sessions(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_table_sessions(UUID, UUID) TO anon;
