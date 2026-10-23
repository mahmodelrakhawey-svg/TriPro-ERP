-- ========================================================================================
-- TriPro ERP — Add updated_at Column to Invoices, Purchase Invoices & Vouchers
-- Date: 2026-10-23
-- Purpose:
--   Resolves 400 Bad Request error on save_sales_invoice_draft RPC (PostgreSQL 42703:
--   column "updated_at" of relation "invoices" does not exist) and standardizes
--   updated_at timestamps across all document tables (sales, purchases, vouchers).
-- Target: Both General Database (pjvphxfschfllpawfewn) & Lenza Database (jsgmrspnthtlsracbmcq)
-- ========================================================================================

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.purchase_invoices 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.payment_vouchers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.receipt_vouchers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Function to maintain updated_at timestamp automatically on updates
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_invoices ON public.invoices;
CREATE TRIGGER trg_set_updated_at_invoices
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_purchase_invoices ON public.purchase_invoices;
CREATE TRIGGER trg_set_updated_at_purchase_invoices
BEFORE UPDATE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_payment_vouchers ON public.payment_vouchers;
CREATE TRIGGER trg_set_updated_at_payment_vouchers
BEFORE UPDATE ON public.payment_vouchers
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_receipt_vouchers ON public.receipt_vouchers;
CREATE TRIGGER trg_set_updated_at_receipt_vouchers
BEFORE UPDATE ON public.receipt_vouchers
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

