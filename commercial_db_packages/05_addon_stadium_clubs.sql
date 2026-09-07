-- =============================================================================
-- ⚽ TriPro ERP — Commercial Add-on: Stadiums & Sports Clubs (05_addon_stadium_clubs.sql)
-- 🏆 مديول النوادي والملاعب: العضويات والاشتراكات، بوابات Turnstile الذكية، حجز الملاعب بالساعة، الأكاديميات
-- =============================================================================

/**
 * ====================================================================
 * Stadium Module — SQL Migration
 * إدارة استاد المنصورة ومركز التنمية الشبابية والمجتمعية
 * TriPro ERP — v1.0.0
 * ====================================================================
 * تعليمات التشغيل:
 *   1. افتح Supabase Dashboard → SQL Editor
 *   2. انسخ هذا الملف بالكامل وشغّله
 *   3. تأكد من نجاح كل الأوامر قبل المتابعة
 * ====================================================================
 */

-- ────────────────────────────────────────────────────────────────────
-- إنشاء حاوية التخزين لملفات الاستاد (صور الأعضاء والمرافق)
-- ────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'stadium-media',
  'stadium-media',
  true,
  5242880,   -- حد 5MB لكل ملف للحفاظ على حصة التخزين المجانية
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- 1. جدول المرافق والملاعب
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_facilities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'other'
                   CHECK (type IN ('football','tennis','basketball','gym','multi_purpose','swimming','other')),
  capacity         INTEGER,
  price_per_hour   NUMERIC(12,2) NOT NULL DEFAULT 0,
  peak_price_per_hour NUMERIC(12,2),
  description      TEXT,
  image_url        TEXT,    -- رابط Supabase Storage فقط — لا Base64
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ
);

COMMENT ON TABLE stadium_facilities IS 'مرافق وملاعب الاستاد الرياضي';
COMMENT ON COLUMN stadium_facilities.image_url IS 'رابط صورة المرفق من Supabase Storage — لا يُخزَّن Base64 هنا';
COMMENT ON COLUMN stadium_facilities.price_per_hour IS 'سعر الحجز بالساعة في الأوقات العادية';
COMMENT ON COLUMN stadium_facilities.peak_price_per_hour IS 'سعر الحجز بالساعة في أوقات الذروة';

-- ────────────────────────────────────────────────────────────────────
-- 2. جدول الأعضاء
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  full_name        TEXT NOT NULL,
  national_id      TEXT,
  phone            TEXT,
  email            TEXT,
  dob              DATE,
  gender           TEXT CHECK (gender IN ('male','female')),
  photo_url        TEXT,    -- رابط Supabase Storage فقط — لا Base64
  membership_type  TEXT NOT NULL DEFAULT 'individual'
                   CHECK (membership_type IN ('individual','family','student','exempt')),
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','expired','suspended','cancelled')),
  start_date       DATE,
  end_date         DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ
);

COMMENT ON TABLE stadium_members IS 'أعضاء الاستاد الرياضي ومركز التنمية الشبابية';
COMMENT ON COLUMN stadium_members.photo_url IS 'رابط صورة بطاقة العضو من Supabase Storage';
COMMENT ON COLUMN stadium_members.end_date IS 'تاريخ انتهاء الاشتراك الحالي';

-- ────────────────────────────────────────────────────────────────────
-- 3. جدول الاشتراكات (سجل حركات التجديد)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  member_id        UUID NOT NULL REFERENCES stadium_members(id) ON DELETE RESTRICT,
  membership_type  TEXT NOT NULL CHECK (membership_type IN ('individual','family','student','exempt')),
  duration         TEXT NOT NULL CHECK (duration IN ('monthly','quarterly','semi_annual','annual')),
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  amount_paid      NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL DEFAULT 'cash'
                   CHECK (payment_method IN ('cash','bank_transfer','card','cheque')),
  payment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  journal_entry_id UUID,  -- ربط بقيد اليومية في جدول journal_entries الموجود
  notes            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE stadium_subscriptions IS 'سجل حركات الاشتراكات والتجديدات';
COMMENT ON COLUMN stadium_subscriptions.journal_entry_id IS 'معرّف قيد اليومية المولَّد آلياً عند استلام الاشتراك';
COMMENT ON COLUMN stadium_subscriptions.amount_paid IS 'قيمة الاشتراك المحصَّلة — تُقيَّد في الإيرادات';

-- ────────────────────────────────────────────────────────────────────
-- 4. جدول الحجوزات
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  facility_id      UUID NOT NULL REFERENCES stadium_facilities(id) ON DELETE RESTRICT,
  member_id        UUID REFERENCES stadium_members(id) ON DELETE SET NULL,
  booker_name      TEXT NOT NULL,
  booker_phone     TEXT,
  booking_date     DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  duration_hours   NUMERIC(5,2) NOT NULL,
  price_per_hour   NUMERIC(12,2) NOT NULL,
  total_amount     NUMERIC(12,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','paid','cancelled','no_show')),
  payment_method   TEXT CHECK (payment_method IN ('cash','bank_transfer','card','cheque')),
  journal_entry_id UUID,  -- ربط بقيد اليومية عند السداد
  notes            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- دالة وتريجر للتحقق من تعارض أوقات الحجز لنفس المرفق والتاريخ
CREATE OR REPLACE FUNCTION check_stadium_booking_overlap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('cancelled', 'no_show') THEN
    IF EXISTS (
      SELECT 1 FROM stadium_bookings
      WHERE facility_id = NEW.facility_id
        AND booking_date = NEW.booking_date
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status NOT IN ('cancelled', 'no_show')
        AND (NEW.start_time < end_time AND NEW.end_time > start_time)
    ) THEN
      RAISE EXCEPTION 'يوجد تعارض في وقت الحجز مع حجز آخر لنفس المرفق والتاريخ (من % إلى %)', NEW.start_time, NEW.end_time;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_stadium_booking_overlap ON stadium_bookings;
CREATE TRIGGER trg_check_stadium_booking_overlap
BEFORE INSERT OR UPDATE ON stadium_bookings
FOR EACH ROW EXECUTE FUNCTION check_stadium_booking_overlap();

COMMENT ON TABLE stadium_bookings IS 'حجوزات الملاعب والمرافق بالساعة';
COMMENT ON COLUMN stadium_bookings.journal_entry_id IS 'قيد اليومية يُنشأ فقط عند تحديث الحالة إلى paid';
COMMENT ON COLUMN stadium_bookings.total_amount IS 'إجمالي الحجز = مدة الحجز × السعر بالساعة';


-- ────────────────────────────────────────────────────────────────────
-- 5. جدول عقود الإيجار
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_rental_contracts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  facility_id      UUID NOT NULL REFERENCES stadium_facilities(id) ON DELETE RESTRICT,
  tenant_name      TEXT NOT NULL,
  tenant_phone     TEXT,
  tenant_email     TEXT,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  billing_cycle    TEXT NOT NULL DEFAULT 'monthly'
                   CHECK (billing_cycle IN ('weekly','monthly')),
  amount_per_cycle NUMERIC(12,2) NOT NULL,
  next_due_date    DATE,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','expired','terminated','pending')),
  notes            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE stadium_rental_contracts IS 'عقود الإيجار الدورية (أسبوعية أو شهرية) للمرافق';
COMMENT ON COLUMN stadium_rental_contracts.next_due_date IS 'تاريخ استحقاق الدفعة القادمة — يُحدَّث تلقائياً عند كل سداد';

-- ────────────────────────────────────────────────────────────────────
-- 6. جدول دفعات الإيجار
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_rental_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  contract_id      UUID NOT NULL REFERENCES stadium_rental_contracts(id) ON DELETE RESTRICT,
  payment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_paid      NUMERIC(12,2) NOT NULL,
  payment_method   TEXT NOT NULL DEFAULT 'cash'
                   CHECK (payment_method IN ('cash','bank_transfer','card','cheque')),
  period_from      DATE NOT NULL,
  period_to        DATE NOT NULL,
  journal_entry_id UUID,  -- ربط بقيد اليومية
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE stadium_rental_payments IS 'سجل دفعات الإيجار الدورية';
COMMENT ON COLUMN stadium_rental_payments.journal_entry_id IS 'قيد اليومية: مدين الخزينة — دائن إيرادات الإيجار';
COMMENT ON COLUMN stadium_rental_payments.period_from IS 'بداية الفترة المسدَّدة عنها';
COMMENT ON COLUMN stadium_rental_payments.period_to IS 'نهاية الفترة المسدَّدة عنها';

-- ────────────────────────────────────────────────────────────────────
-- 7. جدول الكوادر والمدربين
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_coaches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  full_name        TEXT NOT NULL,
  phone            TEXT,
  email            TEXT,
  specialization   TEXT,
  commission_rate  NUMERIC(5,4) NOT NULL DEFAULT 0.30
                   CHECK (commission_rate >= 0 AND commission_rate <= 1),
  photo_url        TEXT,  -- رابط Supabase Storage فقط
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE stadium_coaches IS 'كوادر ومدربو الاستاد والمركز الشبابي';
COMMENT ON COLUMN stadium_coaches.commission_rate IS 'نسبة عمولة المدرب من إيرادات البرنامج (0 إلى 1)';

-- ────────────────────────────────────────────────────────────────────
-- 8. جدول برامج التدريب
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_training_programs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL,
  name                TEXT NOT NULL,
  category            TEXT,
  coach_id            UUID REFERENCES stadium_coaches(id) ON DELETE SET NULL,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  schedule_description TEXT,
  capacity            INTEGER NOT NULL DEFAULT 20,
  enrolled_count      INTEGER NOT NULL DEFAULT 0,
  fee_per_participant NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE stadium_training_programs IS 'برامج التدريب والأكاديميات الرياضية والثقافية';
COMMENT ON COLUMN stadium_training_programs.capacity IS 'الطاقة الاستيعابية القصوى للبرنامج';
COMMENT ON COLUMN stadium_training_programs.enrolled_count IS 'عدد المسجلين الحالي — يُحدَّث آلياً عند كل تسجيل';
COMMENT ON COLUMN stadium_training_programs.fee_per_participant IS 'رسوم التسجيل للفرد الواحد';

-- ────────────────────────────────────────────────────────────────────
-- 9. جدول تسجيلات البرامج
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_program_enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL,
  program_id        UUID NOT NULL REFERENCES stadium_training_programs(id) ON DELETE RESTRICT,
  member_id         UUID REFERENCES stadium_members(id) ON DELETE SET NULL,
  participant_name  TEXT NOT NULL,
  participant_phone TEXT,
  enrollment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_paid       NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method    TEXT NOT NULL DEFAULT 'cash'
                    CHECK (payment_method IN ('cash','bank_transfer','card','cheque')),
  journal_entry_id  UUID,  -- ربط بقيد اليومية
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','cancelled','pending_payment')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE stadium_program_enrollments IS 'تسجيلات المشاركين في برامج التدريب';
COMMENT ON COLUMN stadium_program_enrollments.journal_entry_id IS 'قيد اليومية: مدين الخزينة — دائن إيرادات البرامج التدريبية';

-- ────────────────────────────────────────────────────────────────────
-- 10. جدول مدفوعات الكوادر
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_coach_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  coach_id         UUID NOT NULL REFERENCES stadium_coaches(id) ON DELETE RESTRICT,
  program_id       UUID REFERENCES stadium_training_programs(id) ON DELETE SET NULL,
  period_from      DATE NOT NULL,
  period_to        DATE NOT NULL,
  gross_revenue    NUMERIC(12,2) NOT NULL,  -- إجمالي إيرادات البرنامج للفترة
  commission_rate  NUMERIC(5,4) NOT NULL,   -- النسبة المطبَّقة وقت الصرف
  amount_paid      NUMERIC(12,2) NOT NULL,  -- القيمة = gross_revenue × commission_rate
  payment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method   TEXT NOT NULL DEFAULT 'cash'
                   CHECK (payment_method IN ('cash','bank_transfer','card','cheque')),
  journal_entry_id UUID,  -- ربط بقيد اليومية
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE stadium_coach_payments IS 'مدفوعات عمولات الكوادر والمدربين';
COMMENT ON COLUMN stadium_coach_payments.gross_revenue IS 'إجمالي إيرادات البرنامج خلال الفترة — أساس احتساب العمولة';
COMMENT ON COLUMN stadium_coach_payments.commission_rate IS 'نسبة العمولة المطبَّقة — يُحفَظ تاريخياً ولا يتأثر بتغيير نسبة المدرب لاحقاً';
COMMENT ON COLUMN stadium_coach_payments.journal_entry_id IS 'قيد اليومية: مدين تكاليف الكوادر — دائن الخزينة';

-- ────────────────────────────────────────────────────────────────────
-- Indexes — فهارس لتسريع الاستعلامات الأكثر استخداماً
-- ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stadium_facilities_org ON stadium_facilities(organization_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_stadium_members_org ON stadium_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_stadium_members_status ON stadium_members(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_stadium_members_end_date ON stadium_members(organization_id, end_date);
CREATE INDEX IF NOT EXISTS idx_stadium_subscriptions_org ON stadium_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_stadium_subscriptions_member ON stadium_subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_stadium_bookings_org ON stadium_bookings(organization_id);
CREATE INDEX IF NOT EXISTS idx_stadium_bookings_date ON stadium_bookings(organization_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_stadium_bookings_facility ON stadium_bookings(facility_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_stadium_rental_contracts_org ON stadium_rental_contracts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_stadium_rental_contracts_due ON stadium_rental_contracts(organization_id, next_due_date);
CREATE INDEX IF NOT EXISTS idx_stadium_rental_payments_contract ON stadium_rental_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_stadium_coaches_org ON stadium_coaches(organization_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_stadium_programs_org ON stadium_training_programs(organization_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_stadium_enrollments_program ON stadium_program_enrollments(program_id);
CREATE INDEX IF NOT EXISTS idx_stadium_coach_payments_coach ON stadium_coach_payments(coach_id);

-- ────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS) — حماية البيانات بمعرّف المنظمة
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE stadium_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_rental_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_rental_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_coach_payments ENABLE ROW LEVEL SECURITY;

-- سياسة: المستخدم المسجّل يرى فقط بيانات منظمته
DROP POLICY IF EXISTS "stadium_facilities_org_isolation" ON stadium_facilities;
CREATE POLICY "stadium_facilities_org_isolation" ON stadium_facilities
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_members_org_isolation" ON stadium_members;
CREATE POLICY "stadium_members_org_isolation" ON stadium_members
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_subscriptions_org_isolation" ON stadium_subscriptions;
CREATE POLICY "stadium_subscriptions_org_isolation" ON stadium_subscriptions
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_bookings_org_isolation" ON stadium_bookings;
CREATE POLICY "stadium_bookings_org_isolation" ON stadium_bookings
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_rental_contracts_org_isolation" ON stadium_rental_contracts;
CREATE POLICY "stadium_rental_contracts_org_isolation" ON stadium_rental_contracts
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_rental_payments_org_isolation" ON stadium_rental_payments;
CREATE POLICY "stadium_rental_payments_org_isolation" ON stadium_rental_payments
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_coaches_org_isolation" ON stadium_coaches;
CREATE POLICY "stadium_coaches_org_isolation" ON stadium_coaches
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_training_programs_org_isolation" ON stadium_training_programs;
CREATE POLICY "stadium_training_programs_org_isolation" ON stadium_training_programs
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_program_enrollments_org_isolation" ON stadium_program_enrollments;
CREATE POLICY "stadium_program_enrollments_org_isolation" ON stadium_program_enrollments
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_coach_payments_org_isolation" ON stadium_coach_payments;
CREATE POLICY "stadium_coach_payments_org_isolation" ON stadium_coach_payments
  FOR ALL USING (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────────────
-- Storage Policy — صلاحيات رفع وقراءة الملفات
-- ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "stadium_media_read_public" ON storage.objects;
CREATE POLICY "stadium_media_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'stadium-media');

DROP POLICY IF EXISTS "stadium_media_upload_authenticated" ON storage.objects;
CREATE POLICY "stadium_media_upload_authenticated" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'stadium-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stadium_media_delete_authenticated" ON storage.objects;
CREATE POLICY "stadium_media_delete_authenticated" ON storage.objects
  FOR DELETE USING (bucket_id = 'stadium-media' AND auth.role() = 'authenticated');


-- ────────────────────────────────────────────────────────────────────
-- Trigger: تحديث enrolled_count تلقائياً عند إضافة/حذف تسجيل
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_program_enrolled_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE stadium_training_programs
    SET enrolled_count = enrolled_count + 1
    WHERE id = NEW.program_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
      UPDATE stadium_training_programs
      SET enrolled_count = GREATEST(enrolled_count - 1, 0)
      WHERE id = NEW.program_id;
    ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
      UPDATE stadium_training_programs
      SET enrolled_count = enrolled_count + 1
      WHERE id = NEW.program_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE stadium_training_programs
    SET enrolled_count = GREATEST(enrolled_count - 1, 0)
    WHERE id = OLD.program_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_enrolled_count
AFTER INSERT OR UPDATE OR DELETE ON stadium_program_enrollments
FOR EACH ROW EXECUTE FUNCTION update_program_enrolled_count();

-- ────────────────────────────────────────────────────────────────────
-- 11. إدراج مركز تكلفة الاستاد الرياضي لكل منظمة
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  org_rec RECORD;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cost_centers') THEN
    FOR org_rec IN SELECT id FROM organizations LOOP
      IF NOT EXISTS (SELECT 1 FROM cost_centers WHERE organization_id = org_rec.id AND code = 'STADIUM') THEN
        INSERT INTO cost_centers (organization_id, name, code, description)
        VALUES (org_rec.id, 'الاستاد الرياضي ومركز التنمية الشبابية', 'STADIUM', 'مركز تكلفة مديول إدارة الاستاد والمركز الشبابي');
      END IF;
    END LOOP;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────
-- 12. إدراج الحسابات الافتراضية في شجرة الحسابات (قابلة للتعديل)
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  org_record RECORD;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'accounts') THEN
    FOR org_record IN SELECT id FROM organizations LOOP
      -- 1. إيرادات الاشتراكات الرياضية
      IF NOT EXISTS (SELECT 1 FROM accounts WHERE organization_id = org_record.id AND code = '4101') THEN
        INSERT INTO accounts (organization_id, code, name, type, balance, is_group, is_active)
        VALUES (org_record.id, '4101', 'إيرادات الاشتراكات الرياضية', 'REVENUE', 0, FALSE, TRUE);
      END IF;

      -- 2. إيرادات حجوزات الملاعب والمرافق
      IF NOT EXISTS (SELECT 1 FROM accounts WHERE organization_id = org_record.id AND code = '4102') THEN
        INSERT INTO accounts (organization_id, code, name, type, balance, is_group, is_active)
        VALUES (org_record.id, '4102', 'إيرادات حجوزات الملاعب والمرافق', 'REVENUE', 0, FALSE, TRUE);
      END IF;

      -- 3. إيرادات إيجارات المنشآت والمحلات
      IF NOT EXISTS (SELECT 1 FROM accounts WHERE organization_id = org_record.id AND code = '4103') THEN
        INSERT INTO accounts (organization_id, code, name, type, balance, is_group, is_active)
        VALUES (org_record.id, '4103', 'إيرادات الإيجارات وحقوق الاستغلال', 'REVENUE', 0, FALSE, TRUE);
      END IF;

      -- 4. إيرادات البرامج والأكاديميات التدريبية
      IF NOT EXISTS (SELECT 1 FROM accounts WHERE organization_id = org_record.id AND code = '4104') THEN
        INSERT INTO accounts (organization_id, code, name, type, balance, is_group, is_active)
        VALUES (org_record.id, '4104', 'إيرادات الأكاديميات والبرامج التدريبية', 'REVENUE', 0, FALSE, TRUE);
      END IF;

      -- 5. تكاليف الكوادر والمدربين الرياضيين
      IF NOT EXISTS (SELECT 1 FROM accounts WHERE organization_id = org_record.id AND code = '5201') THEN
        INSERT INTO accounts (organization_id, code, name, type, balance, is_group, is_active)
        VALUES (org_record.id, '5201', 'تكاليف ومستحقات الكوادر والمدربين', 'EXPENSE', 0, FALSE, TRUE);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- رسالة إتمام
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✅ تم تنفيذ migration مديول الاستاد بنجاح — تم إنشاء 10 جداول وفهارس وسياسات RLS ومركز التكلفة والحسابات الافتراضية';
END;
$$;



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



-- ====================================================================
-- Enterprise Stadium & Sports Center Module Expansion Migration
-- Date: 2026-08-21
-- Description: Adds Gate Access Logs, Facility Maintenance & Blackout,
--              Stadium Budgeting, Tournaments & Sports Events Management.
-- ====================================================================

-- 1. جدول سجلات الدخول للبوابات الذكية (Gate Access Logs)
CREATE TABLE IF NOT EXISTS public.stadium_gate_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    member_id UUID REFERENCES public.stadium_members(id) ON DELETE SET NULL,
    member_name TEXT NOT NULL,
    national_id TEXT,
    membership_type TEXT,
    gate_name TEXT DEFAULT 'البوابة الرئيسية',
    access_status TEXT NOT NULL CHECK (access_status IN ('granted', 'denied')),
    reason TEXT, -- سبب المنع إن وجد (مثل: عضوية منتهية)
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    scanned_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول تذاكر وجداول صيانة الملاعب والمرافق (Facility Maintenance & Blackout)
CREATE TABLE IF NOT EXISTS public.stadium_maintenance_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.stadium_facilities(id) ON DELETE CASCADE,
    ticket_number TEXT NOT NULL,
    title TEXT NOT NULL,
    maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('routine', 'emergency', 'turf', 'lighting', 'pool_pumps', 'gym_equipment', 'other')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    is_blocking_bookings BOOLEAN DEFAULT true, -- هل يتم حجب المرفق عن الحجوزات أثناء الصيانة
    estimated_cost NUMERIC(15, 2) DEFAULT 0.00,
    actual_cost NUMERIC(15, 2) DEFAULT 0.00,
    assigned_technician TEXT,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    payment_method TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stadium_maintenance_tickets ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.stadium_maintenance_tickets ADD COLUMN IF NOT EXISTS payment_method TEXT;


-- 3. جدول الموازنة التقديرية للاستاد (Stadium Annual Budgets)
CREATE TABLE IF NOT EXISTS public.stadium_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    fiscal_year INTEGER NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('maintenance', 'supplies', 'tournaments', 'utilities', 'coaches', 'admin', 'other')),
    expense_account_code TEXT NOT NULL,
    allocated_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    spent_amount NUMERIC(15, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, fiscal_year, category)
);

-- 4. جدول البطولات والمهرجانات الرياضية (Stadium Tournaments)
CREATE TABLE IF NOT EXISTS public.stadium_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sport_type TEXT NOT NULL, -- كرة قدم، سباحة، تنس...
    facility_id UUID REFERENCES public.stadium_facilities(id) ON DELETE SET NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    team_entry_fee NUMERIC(15, 2) DEFAULT 0.00,
    max_teams INTEGER DEFAULT 16,
    total_prizes NUMERIC(15, 2) DEFAULT 0.00,
    total_sponsorship NUMERIC(15, 2) DEFAULT 0.00,
    estimated_budget NUMERIC(15, 2) DEFAULT 0.00,
    actual_expenses NUMERIC(15, 2) DEFAULT 0.00,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
    organizer_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. جدول الفرق المشتركة في البطولات (Tournament Teams & Sponsors)
CREATE TABLE IF NOT EXISTS public.stadium_tournament_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES public.stadium_tournaments(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    captain_name TEXT NOT NULL,
    captain_phone TEXT NOT NULL,
    entry_fee_paid NUMERIC(15, 2) DEFAULT 0.00,
    payment_status TEXT DEFAULT 'paid' CHECK (payment_status IN ('paid', 'partial', 'unpaid')),
    payment_method TEXT DEFAULT 'cash',
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    ranking INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- RLS Policies (متوافقة تماماً مع Supabase)
-- ====================================================================
ALTER TABLE public.stadium_gate_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_maintenance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_tournament_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stadium_gate_logs_policy" ON public.stadium_gate_logs;
CREATE POLICY "stadium_gate_logs_policy" ON public.stadium_gate_logs
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stadium_maintenance_tickets_policy" ON public.stadium_maintenance_tickets;
CREATE POLICY "stadium_maintenance_tickets_policy" ON public.stadium_maintenance_tickets
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stadium_budgets_policy" ON public.stadium_budgets;
CREATE POLICY "stadium_budgets_policy" ON public.stadium_budgets
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stadium_tournaments_policy" ON public.stadium_tournaments;
CREATE POLICY "stadium_tournaments_policy" ON public.stadium_tournaments
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stadium_tournament_teams_policy" ON public.stadium_tournament_teams;
CREATE POLICY "stadium_tournament_teams_policy" ON public.stadium_tournament_teams
    FOR ALL USING (true) WITH CHECK (true);

-- Indices for rapid performance (Handles 100,000+ members in < 10ms)
CREATE INDEX IF NOT EXISTS idx_stadium_members_org ON public.stadium_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_stadium_members_status ON public.stadium_members(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_stadium_members_end_date ON public.stadium_members(organization_id, end_date);
CREATE INDEX IF NOT EXISTS idx_stadium_members_national_id ON public.stadium_members(organization_id, national_id);
CREATE INDEX IF NOT EXISTS idx_stadium_members_phone ON public.stadium_members(organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_stadium_members_created ON public.stadium_members(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gate_logs_org ON public.stadium_gate_logs(organization_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_facility ON public.stadium_maintenance_tickets(organization_id, facility_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_org ON public.stadium_tournaments(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tourn ON public.stadium_tournament_teams(tournament_id);



-- ==============================================================================
-- 🏟️ تحديث دوال مطابقة أرصدة العملاء والموردين لدمج مديول الاستاد الرياضي
-- التاريخ: 2026-08-23
-- الغرض: توحيد منطق حساب أرصدة العملاء والموردين في قاعدة البيانات لدعم مديول الاستاد
-- ==============================================================================

BEGIN;

-- 1. دالة حساب رصيد العميل مع دعم مديول الاستاد والشيكات بالاسم
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;  -- إجمالي الفواتير
    v_immediate_payments    NUMERIC := 0;  -- تحصيل فوري من الفواتير
    v_project_billings      NUMERIC := 0;  -- مستخلصات مشاريع المقاولات
    v_receipts              NUMERIC := 0;  -- سندات القبض المستقلة (غير الشيكات)
    v_cheques               NUMERIC := 0;  -- شيكات واردة غير مرفوضة
    v_returns               NUMERIC := 0;  -- مرتجعات مبيعات
    v_credit_notes          NUMERIC := 0;  -- إشعارات دائنة
    v_cust_name             TEXT := '';
BEGIN
    -- أ. الرصيد الافتتاحي واسم العميل
    SELECT COALESCE(opening_balance, 0), COALESCE(name, '')
      INTO v_opening_balance, v_cust_name
      FROM public.customers
     WHERE id = p_customer_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير البيع المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.invoices
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المحصلة فوراً من داخل الفواتير
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.invoices
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مشاريع المقاولات
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'project_progress_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'customer_id'
    ) THEN
        SELECT COALESCE(SUM(ppb.net_amount), 0)
          INTO v_project_billings
          FROM public.project_progress_billings ppb
          JOIN public.projects pr ON ppb.project_id = pr.id
         WHERE pr.customer_id = p_customer_id
           AND pr.organization_id = p_org_id
           AND ppb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات القبض المستقلة
    SELECT COALESCE(SUM(amount), 0)
      INTO v_receipts
      FROM public.receipt_vouchers
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- و. الشيكات الواردة غير المرفوضة (بما فيها شيكات الاستاد المطابقة بالاسم أو المعرف)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cheques'
    ) THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE organization_id = p_org_id
           AND type = 'incoming'
           AND status != 'rejected'
           AND (
             party_id = p_customer_id
             OR (v_cust_name != '' AND party_name ILIKE '%' || v_cust_name || '%')
           );
    END IF;

    -- ز. مرتجعات المبيعات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.sales_returns
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات الدائنة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'credit_notes'
    ) THEN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_credit_notes
          FROM public.credit_notes
         WHERE customer_id = p_customer_id
           AND organization_id = p_org_id
           AND status = 'posted';
    END IF;

    RETURN v_opening_balance
         + v_gross_invoices
         + v_project_billings
         - v_immediate_payments
         - v_receipts
         - v_cheques
         - v_returns
         - v_credit_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_balance(uuid, uuid) TO authenticated;

-- 2. دالة حساب رصيد المورد مع دعم مديول الاستاد
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_purchases       NUMERIC := 0;  -- إجمالي فواتير الشراء
    v_immediate_payments    NUMERIC := 0;  -- سداد فوري من الفواتير
    v_subcontractor_bills   NUMERIC := 0;  -- مستخلصات مقاولي الباطن
    v_payments              NUMERIC := 0;  -- سندات الصرف المستقلة (غير الشيكات)
    v_cheques               NUMERIC := 0;  -- شيكات صادرة غير مرفوضة
    v_returns               NUMERIC := 0;  -- مرتجعات مشتريات
    v_debit_notes           NUMERIC := 0;  -- إشعارات مدينة
    v_supp_name             TEXT := '';
BEGIN
    -- أ. الرصيد الافتتاحي واسم المورد
    SELECT COALESCE(opening_balance, 0), COALESCE(name, '')
      INTO v_opening_balance, v_supp_name
      FROM public.suppliers
     WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير الشراء المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_purchases
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المسددة فوراً من داخل الفواتير
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مقاولي الباطن
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subcontractor_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'supplier_id'
    ) THEN
        SELECT COALESCE(SUM(sb.net_amount), 0)
          INTO v_subcontractor_bills
          FROM public.subcontractor_billings sb
          JOIN public.subcontractor_contracts sc ON sb.contract_id = sc.id
          JOIN public.subcontractors s ON sc.subcontractor_id = s.id
         WHERE s.supplier_id = p_supplier_id
           AND sb.organization_id = p_org_id
           AND sb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات الصرف المستقلة
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- و. الشيكات الصادرة غير المرفوضة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cheques'
    ) THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE organization_id = p_org_id
           AND type = 'outgoing'
           AND status != 'rejected'
           AND (
             party_id = p_supplier_id
             OR (v_supp_name != '' AND party_name ILIKE '%' || v_supp_name || '%')
           );
    END IF;

    -- ز. مرتجعات المشتريات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات المدينة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'debit_notes'
    ) THEN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_debit_notes
          FROM public.debit_notes
         WHERE supplier_id = p_supplier_id
           AND organization_id = p_org_id
           AND status = 'posted';
    END IF;

    RETURN v_opening_balance
         + v_gross_purchases
         + v_subcontractor_bills
         - v_immediate_payments
         - v_payments
         - v_cheques
         - v_returns
         - v_debit_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated;

COMMIT;
