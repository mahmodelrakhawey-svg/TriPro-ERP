-- ==============================================================================
-- TriPro ERP - Off-Site S3 / Cloudflare R2 Remote Backup Configuration
-- Date: 2026-09-16
-- ==============================================================================

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS s3_endpoint text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS s3_bucket text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS s3_access_key text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS s3_secret_key text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS s3_region text DEFAULT 'us-east-1';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS s3_is_active boolean DEFAULT false;

-- Add notes column to organization_backups if not exists
ALTER TABLE public.organization_backups ADD COLUMN IF NOT EXISTS notes text;
