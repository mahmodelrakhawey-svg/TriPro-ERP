-- ==============================================================================
-- TriPro ERP — Advanced Restaurant Phase 4 SQL Migration
-- Features: Blind Shifts, Petty Cash, Tips Pooling, Waiter Calls, Multi-Channel Pricing
-- ==============================================================================

-- 1. جدول ورديات الكاشير والجرد الأعمى
CREATE TABLE IF NOT EXISTS cashier_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    cashier_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    cashier_name VARCHAR(255) NOT NULL,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_float NUMERIC(15, 2) DEFAULT 0.00,
    
    -- الأرقام المسجلة على النظام
    total_cash_sales NUMERIC(15, 2) DEFAULT 0.00,
    total_card_sales NUMERIC(15, 2) DEFAULT 0.00,
    total_petty_cash_payouts NUMERIC(15, 2) DEFAULT 0.00,
    total_cash_in NUMERIC(15, 2) DEFAULT 0.00,
    total_tips_collected NUMERIC(15, 2) DEFAULT 0.00,
    expected_cash_in_drawer NUMERIC(15, 2) DEFAULT 0.00,
    
    -- الجرد الأعمى (المدخل الفعلي من الكاشير)
    actual_cash_counted NUMERIC(15, 2),
    cash_difference NUMERIC(15, 2), -- موجب: زيادة / سالب: عجز
    cash_breakdown JSONB, -- فئات النقود (200, 100, 50, 20, 10, 5, فكة)
    
    status VARCHAR(50) DEFAULT 'OPEN', -- 'OPEN', 'BLIND_SUBMITTED', 'CLOSED', 'AUDITED'
    closing_notes TEXT,
    adjustment_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول الصرف النثري وسحب النقدية من الدرج (Petty Cash Payouts)
CREATE TABLE IF NOT EXISTS pos_petty_cash_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    shift_id UUID REFERENCES cashier_shifts(id) ON DELETE CASCADE,
    cashier_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    amount NUMERIC(15, 2) NOT NULL,
    payout_type VARCHAR(50) DEFAULT 'EXPENSE', -- 'EXPENSE', 'SAFE_DROP', 'SUPPLIER_PAYMENT'
    reason VARCHAR(255) NOT NULL,
    expense_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
    receipt_attachment_url TEXT,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول مجمع وتوزيع التبس والإكراميات (Tips Pooling)
CREATE TABLE IF NOT EXISTS tips_distribution_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    shift_id UUID REFERENCES cashier_shifts(id) ON DELETE SET NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_tips_amount NUMERIC(15, 2) NOT NULL,
    floor_staff_share_pct NUMERIC(5, 2) DEFAULT 60.00,
    kitchen_staff_share_pct NUMERIC(5, 2) DEFAULT 40.00,
    distribution_details JSONB, -- [{ employee_id, employee_name, role, points, amount_earned }]
    status VARCHAR(50) DEFAULT 'DISTRIBUTED', -- 'DRAFT', 'DISTRIBUTED', 'PAID_OUT'
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول نداءات الويتر وخدمة الطاولات (Waiter Calls)
CREATE TABLE IF NOT EXISTS waiter_call_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    table_name VARCHAR(100) NOT NULL,
    request_type VARCHAR(50) DEFAULT 'CALL_WAITER', -- 'CALL_WAITER', 'REQUEST_BILL', 'ASSISTANCE', 'CLEANING'
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'ACKNOWLEDGED', 'COMPLETED'
    notes TEXT,
    responded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 5. جدول التسعير المتعدد حسب قنوات البيع (Multi-Channel Pricing)
CREATE TABLE IF NOT EXISTS product_channel_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    channel_code VARCHAR(50) NOT NULL, -- 'DINE_IN', 'TAKEAWAY', 'DELIVERY', 'TALABAT', 'JAHEZ', 'HUNGERSTATION'
    price NUMERIC(15, 2) NOT NULL,
    markup_pct NUMERIC(5, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, channel_code)
);

-- تفعيل RLS
ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_petty_cash_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_distribution_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiter_call_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_channel_prices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cashier_shifts' AND policyname = 'allow_shifts_all') THEN
    CREATE POLICY allow_shifts_all ON cashier_shifts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pos_petty_cash_payouts' AND policyname = 'allow_payouts_all') THEN
    CREATE POLICY allow_payouts_all ON pos_petty_cash_payouts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tips_distribution_records' AND policyname = 'allow_tips_all') THEN
    CREATE POLICY allow_tips_all ON tips_distribution_records FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'waiter_call_requests' AND policyname = 'allow_waiter_calls_all') THEN
    CREATE POLICY allow_waiter_calls_all ON waiter_call_requests FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_channel_prices' AND policyname = 'allow_channel_prices_all') THEN
    CREATE POLICY allow_channel_prices_all ON product_channel_prices FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
