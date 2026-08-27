-- ==============================================================================
-- TriPro ERP — Fix cashier_shifts & petty cash tables permissions and constraints
-- ==============================================================================

DO $$ 
BEGIN
  -- 1. التأكد من وجود جدول cashier_shifts
  CREATE TABLE IF NOT EXISTS public.cashier_shifts (
      id VARCHAR(100) PRIMARY KEY,
      organization_id UUID,
      cashier_id UUID,
      cashier_name VARCHAR(255) NOT NULL,
      opened_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      opening_float NUMERIC(15, 2) DEFAULT 0.00,
      total_cash_sales NUMERIC(15, 2) DEFAULT 0.00,
      total_card_sales NUMERIC(15, 2) DEFAULT 0.00,
      total_petty_cash_payouts NUMERIC(15, 2) DEFAULT 0.00,
      total_cash_in NUMERIC(15, 2) DEFAULT 0.00,
      total_tips_collected NUMERIC(15, 2) DEFAULT 0.00,
      expected_cash_in_drawer NUMERIC(15, 2) DEFAULT 0.00,
      actual_cash_counted NUMERIC(15, 2),
      cash_difference NUMERIC(15, 2),
      cash_breakdown JSONB,
      status VARCHAR(50) DEFAULT 'OPEN',
      closing_notes TEXT,
      adjustment_journal_entry_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- 2. تحويل id إلى VARCHAR(100) إذا كان UUID لدعم كافة المعرفات
  ALTER TABLE public.cashier_shifts ALTER COLUMN id TYPE VARCHAR(100);

  -- 3. إزالة أي قيد أجنبي مقيد على cashier_id
  ALTER TABLE public.cashier_shifts DROP CONSTRAINT IF EXISTS cashier_shifts_cashier_id_fkey;

  -- 4. منح الصلاحيات الكاملة للأدوار
  GRANT ALL ON TABLE public.cashier_shifts TO anon, authenticated, service_role;
  GRANT ALL ON TABLE public.pos_petty_cash_payouts TO anon, authenticated, service_role;

  -- 5. تفعيل RLS وسياسة شاملة
  ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS allow_shifts_all ON public.cashier_shifts;
  CREATE POLICY allow_shifts_all ON public.cashier_shifts FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS allow_payouts_all ON public.pos_petty_cash_payouts;
  CREATE POLICY allow_payouts_all ON public.pos_petty_cash_payouts FOR ALL USING (true) WITH CHECK (true);
END $$;
