-- ==============================================================================
-- TriPro ERP — Migration: Add missing audit & metadata columns to suppliers and products
-- Date: 2026-10-13
-- Description:
--   1. Adds created_by and updated_by to suppliers table.
--   2. Adds created_by, updated_by, egs_code, eta_unit_code, and item_code_type to products table.
--   3. Reloads PostgREST schema cache to eliminate PGRST204 errors.
-- ==============================================================================

DO $$
BEGIN
    -- 1. Suppliers table: add created_by, updated_by
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'suppliers') THEN
        ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;

    -- 2. Products table: add created_by, updated_by, egs_code, eta_unit_code, item_code_type
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS egs_code text;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS eta_unit_code text;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS item_code_type text DEFAULT 'EGS';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
