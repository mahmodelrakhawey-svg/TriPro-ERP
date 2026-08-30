-- =====================================================================
-- Migration: Create retail_promotions table for Supermarkets & Hypermarkets
-- Date: 2026-08-30
-- Description: Supports BOGO, Tiered Quantity pricing, Category discounts, and Bundles
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.retail_promotions (
    id TEXT PRIMARY KEY DEFAULT ('promo_' || gen_random_uuid()::text),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BOGO', 'TIERED_QTY', 'BUNDLE', 'CATEGORY_DISCOUNT', 'MIN_SPEND')),
    is_active BOOLEAN DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT,
    category_id UUID REFERENCES public.item_categories(id) ON DELETE SET NULL,
    buy_qty INTEGER DEFAULT 2,
    get_free_qty INTEGER DEFAULT 1,
    tiered_qty INTEGER DEFAULT 3,
    tiered_fixed_price NUMERIC(12,2) DEFAULT 0,
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    min_spend_amount NUMERIC(12,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_retail_promotions_org_active
    ON public.retail_promotions (organization_id, is_active);

-- Enable RLS
ALTER TABLE public.retail_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage promotions in their organization"
    ON public.retail_promotions
    FOR ALL
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

GRANT ALL ON public.retail_promotions TO authenticated;
GRANT SELECT ON public.retail_promotions TO anon;
