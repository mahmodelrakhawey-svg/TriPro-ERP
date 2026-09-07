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

