-- Migration: Add hypermarket and retail suite columns to products
-- Date: 2026-09-04
-- Ensures all hypermarket product card features have underlying database columns

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS barcode2 TEXT,
ADD COLUMN IF NOT EXISTS is_scale_item BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS plu_number INTEGER,
ADD COLUMN IF NOT EXISTS scale_prefix TEXT DEFAULT '22',
ADD COLUMN IF NOT EXISTS shelf_location TEXT,
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS country_of_origin TEXT,
ADD COLUMN IF NOT EXISTS age_restricted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tax_rate_override NUMERIC,
ADD COLUMN IF NOT EXISTS unit_barcodes JSONB DEFAULT '[]'::jsonb;

-- Indexes for hypermarket speed
CREATE INDEX IF NOT EXISTS idx_products_barcode2 ON public.products(barcode2);
CREATE INDEX IF NOT EXISTS idx_products_plu ON public.products(plu_number);
CREATE INDEX IF NOT EXISTS idx_products_shelf ON public.products(shelf_location);
