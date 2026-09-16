-- ==============================================================================
-- TriPro ERP - Egyptian Tax Authority (ETA) E-Invoicing & E-Receipt Enhancements
-- Date: 2026-09-16
-- Description: Ensures ETA tracking columns on invoices and orders with optimized indexes.
-- ==============================================================================

-- 1. Invoices table ETA columns & indexes
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_status text DEFAULT 'draft';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_uuid text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_submission_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_error text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS eta_qr_code text;

CREATE INDEX IF NOT EXISTS idx_invoices_eta_uuid ON public.invoices(eta_uuid) WHERE eta_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_eta_status ON public.invoices(organization_id, eta_status);

-- 2. Restaurant / POS Orders table ETA columns & indexes
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS eta_status text DEFAULT 'draft';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS eta_uuid text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS eta_submission_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS eta_error text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS eta_qr_code text;

CREATE INDEX IF NOT EXISTS idx_orders_eta_uuid ON public.orders(eta_uuid) WHERE eta_uuid IS NOT NULL;

-- 3. Company settings ETA configuration
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_taxpayer_id text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_client_id text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_client_secret text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_environment text DEFAULT 'sandbox';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_is_active boolean DEFAULT false;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS eta_activity_code text DEFAULT '4610';

-- 4. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
