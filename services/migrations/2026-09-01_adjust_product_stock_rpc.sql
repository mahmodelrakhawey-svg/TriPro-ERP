-- ==============================================================================
-- Migration: Stored Procedure for Adjusting Product Stock (RPC)
-- Date: 2026-09-01
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
    p_product_id UUID,
    p_quantity NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.products
    SET stock = COALESCE(stock, 0) + p_quantity,
        updated_at = now()
    WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(UUID, NUMERIC) TO authenticated, anon;
