-- Migration: Egyptian Tax Authority (ETA) Integration Fields
-- Date: 2026-08-04
-- Description: Adds configuration columns to company_settings and tracking columns to invoices.

-- 1. Add columns to company_settings
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_taxpayer_id text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_client_id text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_client_secret text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_environment text DEFAULT 'sandbox';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_is_active boolean DEFAULT false;

-- 2. Add columns to invoices (Sales Invoices)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_status text DEFAULT 'draft';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_uuid text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_submission_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_error text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_qr_code text;

-- 3. Ensure permissions are granted to the authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
