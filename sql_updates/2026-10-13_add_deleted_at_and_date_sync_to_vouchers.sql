-- ==============================================================================
-- TriPro ERP — Migration: Add deleted_at & date columns to vouchers & cheques
-- Date: 2026-10-13
-- Description:
--   1. Adds deleted_at column to payment_vouchers, receipt_vouchers, and cheques.
--   2. Adds date column to payment_vouchers and receipt_vouchers with auto-sync trigger.
--   3. Prevents PostgREST 400 Bad Request errors when filtering deleted_at or ordering by date.
-- ==============================================================================

DO $$
BEGIN
    -- 1. payment_vouchers
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_vouchers') THEN
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
        CREATE INDEX IF NOT EXISTS idx_payment_vouchers_deleted_at ON public.payment_vouchers(deleted_at) WHERE deleted_at IS NULL;

        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS date date;
        UPDATE public.payment_vouchers SET date = payment_date WHERE date IS NULL AND payment_date IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_payment_vouchers_date ON public.payment_vouchers(date);
    END IF;

    -- 2. receipt_vouchers
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'receipt_vouchers') THEN
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
        CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_deleted_at ON public.receipt_vouchers(deleted_at) WHERE deleted_at IS NULL;

        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS date date;
        UPDATE public.receipt_vouchers SET date = receipt_date WHERE date IS NULL AND receipt_date IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_date ON public.receipt_vouchers(date);
    END IF;

    -- 3. cheques
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cheques') THEN
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
        CREATE INDEX IF NOT EXISTS idx_cheques_deleted_at ON public.cheques(deleted_at) WHERE deleted_at IS NULL;
    END IF;
END $$;

-- Trigger function to keep date and payment_date / receipt_date in sync
CREATE OR REPLACE FUNCTION fn_sync_voucher_dates()
RETURNS trigger AS $$
BEGIN
    IF TG_TABLE_NAME = 'payment_vouchers' THEN
        IF NEW.payment_date IS NOT NULL AND NEW.date IS NULL THEN
            NEW.date := NEW.payment_date;
        ELSIF NEW.date IS NOT NULL AND NEW.payment_date IS NULL THEN
            NEW.payment_date := NEW.date;
        END IF;
    ELSIF TG_TABLE_NAME = 'receipt_vouchers' THEN
        IF NEW.receipt_date IS NOT NULL AND NEW.date IS NULL THEN
            NEW.date := NEW.receipt_date;
        ELSIF NEW.date IS NOT NULL AND NEW.receipt_date IS NULL THEN
            NEW.receipt_date := NEW.date;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_payment_voucher_dates ON public.payment_vouchers;
CREATE TRIGGER trg_sync_payment_voucher_dates
BEFORE INSERT OR UPDATE ON public.payment_vouchers
FOR EACH ROW EXECUTE FUNCTION fn_sync_voucher_dates();

DROP TRIGGER IF EXISTS trg_sync_receipt_voucher_dates ON public.receipt_vouchers;
CREATE TRIGGER trg_sync_receipt_voucher_dates
BEFORE INSERT OR UPDATE ON public.receipt_vouchers
FOR EACH ROW EXECUTE FUNCTION fn_sync_voucher_dates();
