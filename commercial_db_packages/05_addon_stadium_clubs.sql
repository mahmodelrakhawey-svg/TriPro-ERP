-- =============================================================================
-- ⚽ TriPro ERP — Commercial Add-on: Stadiums & Sports Clubs (05_addon_stadium_clubs.sql)
-- 🏆 مديول النوادي والملاعب: العضويات والاشتراكات، بوابات Turnstile الذكية، حجز الملاعب، الأكاديميات
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. جدول المرافق والملاعب (Stadium Facilities)
CREATE TABLE IF NOT EXISTS public.stadium_facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'football' CHECK (type IN ('football','tennis','basketball','gym','multi_purpose','swimming','other')),
    capacity INT DEFAULT 100,
    price_per_hour NUMERIC(12,2) NOT NULL DEFAULT 0,
    peak_price_per_hour NUMERIC(12,2) DEFAULT 0,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. جدول الأعضاء وبطاقات العضوية الذكية (Members)
CREATE TABLE IF NOT EXISTS public.stadium_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    full_name TEXT NOT NULL,
    national_id TEXT,
    phone TEXT,
    email TEXT,
    membership_no TEXT NOT NULL,
    membership_type TEXT NOT NULL DEFAULT 'individual' CHECK (membership_type IN ('individual','family','corporate','vip','honorary')),
    category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended','pending')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    photo_url TEXT,
    qr_code TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stadium_members_no UNIQUE(organization_id, membership_no)
);

-- 3. سجل الاشتراكات والدفعات (Subscriptions)
CREATE TABLE IF NOT EXISTS public.stadium_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    member_id UUID NOT NULL REFERENCES public.stadium_members(id) ON DELETE CASCADE,
    membership_type TEXT NOT NULL,
    duration_months INT NOT NULL DEFAULT 12,
    amount_paid NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    receipt_no TEXT,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. سجل مسح بوابات الدخول والأمان (Smart Gate Access Logs)
CREATE TABLE IF NOT EXISTS public.stadium_gate_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    member_id UUID REFERENCES public.stadium_members(id) ON DELETE SET NULL,
    gate_name TEXT NOT NULL,
    scan_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_granted BOOLEAN NOT NULL DEFAULT TRUE,
    denial_reason TEXT,
    direction TEXT DEFAULT 'IN' CHECK (direction IN ('IN', 'OUT'))
);

-- 5. حجوزات الملاعب والمرافق بالساعة (Hourly Pitch Bookings)
CREATE TABLE IF NOT EXISTS public.stadium_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    facility_id UUID NOT NULL REFERENCES public.stadium_facilities(id) ON DELETE CASCADE,
    booker_name TEXT NOT NULL,
    booker_phone TEXT,
    member_id UUID REFERENCES public.stadium_members(id),
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    is_peak_hours BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'paid', 'cancelled', 'completed')),
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. الأكاديميات والبرامج الرياضية (Training Programs)
CREATE TABLE IF NOT EXISTS public.stadium_coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    full_name TEXT NOT NULL,
    phone TEXT,
    specialty TEXT,
    commission_pct NUMERIC(5,2) DEFAULT 0,
    monthly_salary NUMERIC(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stadium_training_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    coach_id UUID REFERENCES public.stadium_coaches(id),
    capacity INT DEFAULT 30,
    fee_per_participant NUMERIC(12,2) NOT NULL,
    schedule_description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stadium_program_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    program_id UUID NOT NULL REFERENCES public.stadium_training_programs(id) ON DELETE CASCADE,
    participant_name TEXT NOT NULL,
    participant_phone TEXT,
    member_id UUID REFERENCES public.stadium_members(id),
    amount_paid NUMERIC(12,2) NOT NULL,
    enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. عقود تأجير المحلات والمرافق (Rental Contracts)
CREATE TABLE IF NOT EXISTS public.stadium_rental_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    facility_id UUID NOT NULL REFERENCES public.stadium_facilities(id),
    tenant_name TEXT NOT NULL,
    tenant_phone TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('weekly', 'monthly', 'annual')),
    amount_per_cycle NUMERIC(12,2) NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stadium_rental_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    contract_id UUID NOT NULL REFERENCES public.stadium_rental_contracts(id) ON DELETE CASCADE,
    amount_paid NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. تفعيل RLS
ALTER TABLE public.stadium_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_gate_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_stadium_members ON public.stadium_members FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_stadium_facilities ON public.stadium_facilities FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
