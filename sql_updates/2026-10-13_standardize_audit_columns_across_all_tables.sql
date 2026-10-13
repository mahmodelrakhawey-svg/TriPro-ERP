-- ==============================================================================
-- TriPro ERP — Migration: Standardize audit & tracking columns across all core tables
-- Date: 2026-10-13
-- Description:
--   1. Adds created_by, updated_by, deleted_at to customers, employees, warehouses,
--      accounts, and cheques.
--   2. Adds updated_by to payment_vouchers, receipt_vouchers, invoices, purchase_invoices,
--      and journal_entries.
--   3. Reloads PostgREST schema cache to ensure complete frontend/database synchronization.
-- ==============================================================================

DO $$
BEGIN
    -- 1. customers table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
        ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
    END IF;

    -- 2. employees table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employees') THEN
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
    END IF;

    -- 3. warehouses table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouses') THEN
        ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
    END IF;

    -- 4. cheques table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cheques') THEN
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
    END IF;

    -- 5. accounts table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts') THEN
        ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
    END IF;

    -- 6. payment_vouchers & receipt_vouchers
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_vouchers') THEN
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'receipt_vouchers') THEN
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;

    -- 7. invoices & purchase_invoices
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_invoices') THEN
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;

    -- 8. journal_entries
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'journal_entries') THEN
        ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
