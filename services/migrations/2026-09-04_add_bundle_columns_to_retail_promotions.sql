-- Migration: Add bundle promotion columns to retail_promotions
-- Date: 2026-09-04
-- Supports cross-item bundle promotions (صنف أ + صنف ب بسعر مخفض)

ALTER TABLE public.retail_promotions 
ADD COLUMN IF NOT EXISTS secondary_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS secondary_product_name TEXT,
ADD COLUMN IF NOT EXISTS bundle_fixed_price NUMERIC(12,2) DEFAULT 0;

GRANT ALL ON public.retail_promotions TO authenticated;
GRANT SELECT ON public.retail_promotions TO anon;
