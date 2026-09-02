-- =============================================================================
-- 🏥 TriPro ERP — Commercial Add-on: Healthcare & Hospitals (06_addon_hims_healthcare.sql)
-- 🩺 مديول المستشفيات: المرضى، العيادات، الطوارئ، التنويم، العمليات، المعمل، الأشعة، بنك الدم، التأمين
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. جدول المرضى والسجلات الطبية (Patients Directory)
CREATE TABLE IF NOT EXISTS public.hims_patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    mrn TEXT NOT NULL, -- Medical Record Number
    full_name TEXT NOT NULL,
    national_id TEXT,
    phone TEXT,
    gender TEXT CHECK (gender IN ('male', 'female')),
    dob DATE,
    blood_type TEXT,
    allergies TEXT[] DEFAULT '{}',
    chronic_diseases TEXT[] DEFAULT '{}',
    insurance_policy_no TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hims_patients_org_mrn UNIQUE(organization_id, mrn)
);

-- 2. الأطباء والعيادات والأقسام (Doctors & Clinics)
CREATE TABLE IF NOT EXISTS public.hims_doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    user_id UUID,
    full_name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    license_number TEXT,
    consultation_fee NUMERIC(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hims_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    patient_id UUID NOT NULL REFERENCES public.hims_patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.hims_doctors(id),
    appointment_date DATE NOT NULL,
    time_slot TIME NOT NULL,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'arrived', 'completed', 'cancelled', 'no_show')),
    fee NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. زيارات الكشف وفرز الطوارئ (Visits & ER Triage)
CREATE TABLE IF NOT EXISTS public.hims_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    patient_id UUID NOT NULL REFERENCES public.hims_patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES public.hims_doctors(id),
    visit_type TEXT DEFAULT 'outpatient' CHECK (visit_type IN ('outpatient', 'emergency', 'inpatient')),
    triage_level TEXT CHECK (triage_level IN ('level_1_resuscitation', 'level_2_emergent', 'level_3_urgent', 'level_5_non_urgent')),
    chief_complaint TEXT,
    vital_signs JSONB DEFAULT '{}', -- { bp, pulse, temp, spo2 }
    diagnosis TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'completed', 'admitted', 'discharged')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. الملاحظات الطبية السريرية (Clinical SOAP Notes)
CREATE TABLE IF NOT EXISTS public.hims_clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id UUID NOT NULL REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. الروشتات وصرف الأدوية (Prescriptions)
CREATE TABLE IF NOT EXISTS public.hims_prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id UUID NOT NULL REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hims_prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES public.hims_prescriptions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    drug_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    duration_days INT DEFAULT 5,
    quantity NUMERIC(10,2) DEFAULT 1,
    is_dispensed BOOLEAN DEFAULT FALSE
);

-- 6. التنويم والأجنحة والأسرة (Inpatient Wards & Beds)
CREATE TABLE IF NOT EXISTS public.hims_wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    ward_type TEXT DEFAULT 'GENERAL',
    daily_rate NUMERIC(12,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.hims_beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_id UUID NOT NULL REFERENCES public.hims_wards(id) ON DELETE CASCADE,
    bed_number TEXT NOT NULL,
    status TEXT DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'))
);

CREATE TABLE IF NOT EXISTS public.hims_admissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    patient_id UUID NOT NULL REFERENCES public.hims_patients(id) ON DELETE CASCADE,
    bed_id UUID NOT NULL REFERENCES public.hims_beds(id),
    admission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    discharge_date TIMESTAMPTZ,
    status TEXT DEFAULT 'ADMITTED' CHECK (status IN ('ADMITTED', 'DISCHARGED'))
);

-- 7. العمليات الجراحية (Operating Theaters & Surgeries)
CREATE TABLE IF NOT EXISTS public.hims_surgeries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    surgery_name TEXT NOT NULL,
    lead_surgeon_id UUID REFERENCES public.hims_doctors(id),
    room_number TEXT DEFAULT 'OR-1',
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. التحاليل والمختبر وبنك الدم (Lab & Blood Bank)
CREATE TABLE IF NOT EXISTS public.hims_lab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    test_name TEXT NOT NULL,
    test_code TEXT,
    category TEXT,
    price NUMERIC(12,2) DEFAULT 0,
    unit TEXT,
    normal_range TEXT
);

CREATE TABLE IF NOT EXISTS public.hims_lab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id UUID REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES public.hims_lab_tests(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sample_collected', 'in_analysis', 'completed')),
    result_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hims_blood_donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    donor_name TEXT NOT NULL,
    blood_type TEXT NOT NULL,
    quantity_ml NUMERIC(10,2) DEFAULT 450,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'used', 'expired')),
    expiry_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. الأشعة والتصوير الطبي (Radiology & PACS)
CREATE TABLE IF NOT EXISTS public.hims_radiology_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id UUID REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    scan_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scanned', 'reported')),
    report_text TEXT,
    dicom_pacs_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. تفعيل RLS
ALTER TABLE public.hims_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hims_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hims_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hims_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hims_lab_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_hims_patients ON public.hims_patients FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_hims_visits ON public.hims_visits FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
