-- ====================================================================
-- Stadium Module: Disbursements, Outgoing Cheques & Sports Custodies
-- إدارة مصروفات وعهد وشيكات الاستاد والمركز الرياضي والشبابي
-- TriPro ERP — v1.0.0
-- ====================================================================

-- ────────────────────────────────────────────────────────────────────
-- 1. جدول طلبات واعتمادات الصرف (Disbursement Requests)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_disbursements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL,
  request_number        TEXT NOT NULL,
  title                 TEXT NOT NULL,
  purpose               TEXT NOT NULL,
  category              TEXT NOT NULL DEFAULT 'maintenance'
                        CHECK (category IN ('maintenance', 'supplies', 'tournament', 'utilities', 'staff', 'administrative', 'other')),
  facility_id           UUID REFERENCES stadium_facilities(id) ON DELETE SET NULL,
  amount                NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  payment_type          TEXT NOT NULL DEFAULT 'cheque'
                        CHECK (payment_type IN ('cheque', 'custody', 'bank_transfer', 'cash')),
  beneficiary_name      TEXT NOT NULL,
  beneficiary_details   TEXT,
  expense_account_code  TEXT NOT NULL DEFAULT '5101',
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'pending_admin', 'pending_finance', 'approved', 'paid', 'rejected')),
  cheque_id             UUID REFERENCES cheques(id) ON DELETE SET NULL,
  journal_entry_id      UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  rejection_reason      TEXT,
  notes                 TEXT,
  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ
);

COMMENT ON TABLE stadium_disbursements IS 'سجل طلبات واعتمادات الصرف المالي لمصروفات الاستاد';

-- ────────────────────────────────────────────────────────────────────
-- 2. جدول عهد الأنشطة والبطولات والمأموريات الرياضية (Custodies)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_custodies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL,
  custodian_name        TEXT NOT NULL,
  custodian_phone       TEXT,
  purpose               TEXT NOT NULL,
  total_amount          NUMERIC(15, 2) NOT NULL CHECK (total_amount > 0),
  spent_amount          NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  remaining_amount      NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
  custody_type          TEXT NOT NULL DEFAULT 'temporary'
                        CHECK (custody_type IN ('temporary', 'permanent')),
  disbursement_method   TEXT NOT NULL DEFAULT 'cheque'
                        CHECK (disbursement_method IN ('cheque', 'cash', 'bank_transfer')),
  cheque_number         TEXT,
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'settled', 'overdue')),
  issue_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  settlement_date       DATE,
  journal_entry_id      UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  settlement_journal_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ
);

COMMENT ON TABLE stadium_custodies IS 'سجل عهد الأنشطة والبطولات والصيانة الرياضية';

-- الفهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_stadium_disbursements_org ON stadium_disbursements(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_stadium_custodies_org ON stadium_custodies(organization_id, status);

-- سياسات الأمان RLS
ALTER TABLE stadium_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_custodies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stadium_disbursements_org_policy" ON stadium_disbursements;
DROP POLICY IF EXISTS "stadium_disbursements_org_isolation" ON stadium_disbursements;
CREATE POLICY "stadium_disbursements_org_isolation" ON stadium_disbursements
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stadium_custodies_org_policy" ON stadium_custodies;
DROP POLICY IF EXISTS "stadium_custodies_org_isolation" ON stadium_custodies;
CREATE POLICY "stadium_custodies_org_isolation" ON stadium_custodies
  FOR ALL USING (true) WITH CHECK (true);

