-- Migration: Create invoice_items table + indexes + trigger

BEGIN;

-- Ensure pgcrypto so gen_random_uuid() is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- If the table doesn't exist, create it. If it exists, add missing columns.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_items') THEN
    CREATE TABLE invoice_items (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      invoice_id uuid NOT NULL,
      line_no integer NOT NULL DEFAULT 1,
      description text,
      quantity numeric(18,4) NOT NULL DEFAULT 1,
      unit_price numeric(18,4) NOT NULL DEFAULT 0,
      discount numeric(18,4) NOT NULL DEFAULT 0,
      tax_rate numeric(5,2) NOT NULL DEFAULT 0,
      custom_fields jsonb DEFAULT '{}'::jsonb,
      created_by uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  ELSE
    -- Add columns if any are missing (avoids failing when table pre-exists without columns)
    BEGIN
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS invoice_id uuid;
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS line_no integer DEFAULT 1;
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS description text;
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS quantity numeric(18,4) DEFAULT 1;
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit_price numeric(18,4) DEFAULT 0;
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount numeric(18,4) DEFAULT 0;
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) DEFAULT 0;
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS created_by uuid;
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    EXCEPTION WHEN others THEN
      -- If any single ALTER fails, continue; we'll surface errors when running interactively
      RAISE NOTICE 'One or more ALTER TABLE operations failed: %', SQLERRM;
    END;
  END IF;
END$$;

-- 2) Add FK to sales_invoices if table exists and FK not already defined
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_invoices') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'invoice_items' AND c.contype = 'f'
    ) THEN
      BEGIN
        ALTER TABLE invoice_items
        ADD CONSTRAINT invoice_items_invoice_fkey FOREIGN KEY (invoice_id)
        REFERENCES sales_invoices(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END IF;
END$$;

-- 3) Indexes (safe idempotent)
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
-- created_by index: create only if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_items' AND column_name='created_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoice_items_created_by ON invoice_items(created_by)';
  END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_invoice_items_custom_fields_gin ON invoice_items USING gin (custom_fields);

-- 4) Trigger to set updated_at
CREATE OR REPLACE FUNCTION trg_set_updated_at_invoice_items()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Only create trigger if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_items') THEN
    BEGIN
      DROP TRIGGER IF EXISTS set_updated_at_invoice_items ON invoice_items;
      CREATE TRIGGER set_updated_at_invoice_items
      BEFORE UPDATE ON invoice_items
      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at_invoice_items();
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Trigger creation problem: %', SQLERRM;
    END;
  END IF;
END$$;

COMMIT;


-- Migration helper: example migration from legacy single-item columns in sales_invoices
-- Adjust column names below to match your legacy schema, run only if applicable.
--
-- INSERT INTO invoice_items (invoice_id, line_no, description, quantity, unit_price, discount, tax_rate, custom_fields)
-- SELECT id, 1,
--        item_description,
--        COALESCE(item_quantity,1),
--        COALESCE(item_unit_price,0),
--        COALESCE(item_discount,0),
--        COALESCE(item_tax_rate,0),
--        jsonb_build_object('migrated_from','legacy_columns')
-- FROM sales_invoices
-- WHERE item_description IS NOT NULL;
