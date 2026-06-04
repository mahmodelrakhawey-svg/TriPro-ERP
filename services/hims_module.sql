-- 🏥 مديول إدارة المستشفيات (Hospital Information Management System - HIMS)
-- 📅 تاريخ التأسيس: 2024-06-18
-- ℹ️ التكامل: يرتبط بالمخازن للأدوية، والأستاذ العام للفوترة، والموظفين للأطباء.

-- 🔑 تفعيل التشفير لدعم التحقق من صحة المستندات (SHA-256)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- 0. تهيئة الأنواع والبيانات الهيكلية (Types Foundation)
-- ================================================================
DO $$ 
BEGIN
    -- إنشاء نوع الإشعارات إذا لم يكن موجوداً
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE public.notification_type AS ENUM (
            'overdue_payment', 'low_inventory', 'high_debt', 'pending_approval',
            'due_date_approaching', 'project_performance_alert', 'retention_release_alert',
            'system_alert', 'success', 'warning', 'emergency_alert', 'clinical_alert',
            'backup_failure', 'manufacturing_cost_overrun'
        );
        -- منح الصلاحيات للنوع لضمان إمكانية استخدامه من قبل PostgREST
        GRANT USAGE ON TYPE public.notification_type TO authenticated, anon;
    END IF;

    -- إنشاء نوع أولوية الإشعارات
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_priority') THEN
        CREATE TYPE public.notification_priority AS ENUM ('low', 'medium', 'high');
        GRANT USAGE ON TYPE public.notification_priority TO authenticated, anon;
    END IF;

    -- إنشاء نوع زيارات المستشفى
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hims_visit_type') THEN
        CREATE TYPE public.hims_visit_type AS ENUM ('outpatient', 'emergency', 'inpatient');
        GRANT USAGE ON TYPE public.hims_visit_type TO authenticated, anon;
    END IF;
END $$;

-- ================================================================
-- 1. جداول البيانات الأساسية
-- ================================================================

-- جدول المرضى (يعامل كملف عميل متخصص)
CREATE TABLE IF NOT EXISTS public.hims_patients (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    national_id text UNIQUE NOT NULL,
    full_name text NOT NULL,
    phone text,
    dob date NOT NULL,
    gender text CHECK (gender IN ('male', 'female', 'other')),
    blood_type text,
    medical_history jsonb DEFAULT '[]'::jsonb,
    allergies text[] DEFAULT '{}'::text[],
    customer_id uuid REFERENCES public.customers(id), -- ربط بجدول العملاء لتوحيد المديونية
    created_at timestamptz DEFAULT now()
);

-- جدول الأطباء (يرتبط بملفات الموظفين والبروفايلات)
CREATE TABLE IF NOT EXISTS public.hims_doctors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    specialization text NOT NULL,
    consultation_fee numeric(15,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- جدول الزيارات والحجز
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hims_visit_type') THEN
        CREATE TYPE public.hims_visit_type AS ENUM ('outpatient', 'emergency', 'inpatient');
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.hims_visits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    patient_id uuid REFERENCES public.hims_patients(id) ON DELETE CASCADE,
    doctor_id uuid REFERENCES public.hims_doctors(id),
    visit_type public.hims_visit_type DEFAULT 'outpatient',
    status text DEFAULT 'scheduled', -- scheduled, arrived, in_consultation, discharged
    vital_signs jsonb DEFAULT '{}'::jsonb, -- الضغط، الحرارة، الوزن
    admission_date timestamptz,
    chief_complaint text,
    triage_level text CHECK (triage_level IN ('level_1_resuscitation', 'level_2_emergent', 'level_3_urgent', 'level_5_non_urgent')),
    check_in_time timestamptz DEFAULT now(),
    check_out_time timestamptz,
    created_at timestamptz DEFAULT now()
);

-- 🛡️ ترميم هيكل جدول الزيارات لإضافة الأعمدة المفقودة لضمان عمل التقارير
DO $$ BEGIN
    ALTER TABLE public.hims_visits ADD COLUMN IF NOT EXISTS check_in_time timestamptz DEFAULT now();
    ALTER TABLE public.hims_visits ADD COLUMN IF NOT EXISTS check_out_time timestamptz;
    ALTER TABLE public.hims_visits ADD COLUMN IF NOT EXISTS chief_complaint text;
    ALTER TABLE public.hims_visits ADD COLUMN IF NOT EXISTS triage_level text;
    ALTER TABLE public.hims_visits ADD COLUMN IF NOT EXISTS financial_override_by uuid REFERENCES public.profiles(id);
END $$;

--  دالة توليد بيانات تجريبية للمستشفى (للاستمتاع بمشاهدة البرنامج ممتلئاً)
CREATE OR REPLACE FUNCTION public.hims_generate_demo_data(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    -- تحديد المنظمة مع تجاوز صمام الأمان باستخدام المعرف الممرر أو أول منظمة
    v_org_id uuid := COALESCE(
        p_org_id, 
        public.get_my_org(), 
        (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
        (SELECT id FROM public.organizations ORDER BY created_at DESC LIMIT 1)
    );
    v_pat_id uuid; v_doc_id uuid; v_visit_id uuid; v_bed_id uuid;
    BEGIN
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'خطأ: لم يتم العثور على أي منظمة في النظام لضخ البيانات إليها.'; END IF;
    
    -- 🛡️ تفعيل وضع التجاوز لضمان سلاسة ضخ البيانات التجريبية
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 1. ضمان ربط الأدمن كطبيب وتفعيل الصلاحيات فوراً
    INSERT INTO public.hims_doctors (organization_id, specialization, consultation_fee, profile_id, is_active)
    VALUES (v_org_id, 'استشاري باطنة وقلب', 500, COALESCE(auth.uid(), (SELECT id FROM public.profiles WHERE organization_id = v_org_id LIMIT 1)), true)
    ON CONFLICT (profile_id) DO UPDATE SET is_active = true, organization_id = v_org_id
    RETURNING id INTO v_doc_id;

    -- 2. إنشاء مريض افتراضي (مع معالجة التكرار)
    INSERT INTO public.hims_patients (organization_id, full_name, national_id, dob, gender, blood_type)
    VALUES (v_org_id, 'أحمد محمد علي (تجريبي)', '12345678901234', '1985-05-20', 'male', 'O+')
    ON CONFLICT (national_id) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id INTO v_pat_id;

    -- تنظيف الزيارات السابقة لهذا المريض لضمان بدء دورة جديدة نظيفة
    DELETE FROM public.hims_visits WHERE patient_id = v_pat_id;
    -- 3. فتح زيارة طوارئ نشطة
    INSERT INTO public.hims_visits (organization_id, patient_id, doctor_id, visit_type, triage_level, chief_complaint, status)
    VALUES (v_org_id, v_pat_id, v_doc_id, 'emergency', 'level_2_emergent', 'آلام شديدة في الصدر وضيق تنفس', 'triaged')
    RETURNING id INTO v_visit_id;

    -- 4. إشغال سرير في العناية
    SELECT id INTO v_bed_id FROM public.hims_beds WHERE organization_id = v_org_id LIMIT 1;
    IF v_bed_id IS NOT NULL THEN
        UPDATE public.hims_beds SET status = 'occupied', current_patient_id = v_pat_id WHERE id = v_bed_id;
    END IF;

    -- 5. إنشاء طلب مختبر معلق
    INSERT INTO public.hims_lab_orders (organization_id, visit_id, test_id, status)
    SELECT v_org_id, v_visit_id, id, 'pending' FROM public.hims_lab_tests WHERE organization_id = v_org_id LIMIT 1;

    -- 6. إنشاء روشتة معلقة (لملء شاشة الصيدلية)
    INSERT INTO public.hims_prescriptions (organization_id, visit_id, doctor_id, diagnosis, status)
    VALUES (v_org_id, v_visit_id, v_doc_id, 'اشتباه في ذبحة صدرية - يحتاج أدوية طوارئ', 'pending');

    -- 7. إنشاء موعد (لملء شاشة المواعيد)
    INSERT INTO public.hims_appointments (organization_id, patient_id, doctor_id, appointment_time, status)
    VALUES (v_org_id, v_pat_id, v_doc_id, '10:00:00', 'scheduled');

    -- 🔙 إيقاف وضع التجاوز
    PERFORM set_config('app.restore_mode', 'off', true);

    RETURN '✅ تم تحديث كافة الأقسام (طوارئ، صيدلية، مختبر، أسرة، مواعيد).';
END; $$;

-- ================================================================
-- 2. السجلات الطبية والروشتات (تكامل المخزون)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.hims_prescriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    doctor_id uuid REFERENCES public.hims_doctors(id),
    diagnosis text,
    -- الأدوية المصروفة: [{product_id, qty, dosage, frequency, expiry_date, barcode}]
    medications jsonb DEFAULT '[]'::jsonb, 
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- تعريف أنواع فحوصات الأشعة المتاحة وأسعارها (دليل الخدمات)
CREATE TABLE IF NOT EXISTS public.hims_radiology_types (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name text NOT NULL, -- X-Ray, MRI, CT Scan
    price numeric(15,2) DEFAULT 0,
    code text,
    description text
);

-- 📑 جدول أكواد الأمراض العالمية (ICD-10 Foundation)
CREATE TABLE IF NOT EXISTS public.hims_icd10_codes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text UNIQUE NOT NULL, -- مثل: A00.0
    description_ar text NOT NULL,
    description_en text,
    category text
);

-- 🔍 رؤية للبحث السريع في أكواد ICD-10
CREATE OR REPLACE VIEW public.v_hims_icd10_search AS
SELECT id, code, description_ar, description_en, 
       code || ' - ' || description_ar as display_name
FROM public.hims_icd10_codes;

GRANT SELECT ON public.v_hims_icd10_search TO authenticated;

-- جدول إعدادات مديول المستشفى لربط الحسابات المالية
CREATE TABLE IF NOT EXISTS public.hims_settings (
    organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    default_revenue_account uuid REFERENCES public.accounts(id),
    default_insurance_account uuid REFERENCES public.accounts(id),
    default_pharmacy_warehouse uuid REFERENCES public.warehouses(id),
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 4. إدارة الأسرة والأقسام (Bed & Ward Management)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.hims_wards (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL, -- مثل: جناح العمليات، قسم الباطنة
    floor text,
    ward_type text,
    department_cost_center_id uuid REFERENCES public.cost_centers(id),
    created_at timestamptz DEFAULT now()
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hims_bed_status') THEN
        CREATE TYPE public.hims_bed_status AS ENUM ('available', 'occupied', 'maintenance', 'cleaning');
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.hims_beds (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    ward_id uuid REFERENCES public.hims_wards(id) ON DELETE CASCADE,
    bed_number text NOT NULL,
    status public.hims_bed_status DEFAULT 'available',
    current_patient_id uuid REFERENCES public.hims_patients(id) ON DELETE SET NULL,
    current_visit_id uuid REFERENCES public.hims_visits(id) ON DELETE SET NULL,
    daily_rate numeric(15,2) DEFAULT 0,
    UNIQUE(organization_id, ward_id, bed_number)
);

-- ================================================================
-- 5. المحرك المالي للمستشفى (تكامل GL)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.hims_billing (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    patient_id uuid REFERENCES public.hims_patients(id),
    insurance_provider_id uuid REFERENCES public.customers(id), -- شركة التأمين تعامل كمورد/عميل
    total_amount numeric(15,2) DEFAULT 0,
    insurance_covered_amount numeric(15,2) DEFAULT 0,
    patient_paid_amount numeric(15,2) DEFAULT 0,
    payment_status text DEFAULT 'unpaid',
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    -- تفاصيل الفاتورة للشفافية
    items_summary jsonb DEFAULT '[]'::jsonb, -- [{label: 'كشف', amount: 100}, {label: 'أدوية', amount: 50}]
    created_at timestamptz DEFAULT now()
);
-- ================================================================
-- 7. مديول المختبر والأشعة (Lab & Diagnostics)
-- ================================================================

-- تعريف الفحوصات المتاحة وأسعارها (دليل الخدمات)
CREATE TABLE IF NOT EXISTS public.hims_lab_tests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    test_name text NOT NULL,
    code text,
    category text, -- blood, radiology, urine
    price numeric(15,2) DEFAULT 0,
    normal_range text, -- e.g. "70-110 mg/dL"
    unit text -- e.g. "mg/dL"
);

-- طلبات الفحوصات ونتائجها
CREATE TABLE IF NOT EXISTS public.hims_lab_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    test_id uuid REFERENCES public.hims_lab_tests(id),
    status text DEFAULT 'pending', -- pending, completed, cancelled
    result_value text,
    is_critical boolean DEFAULT false, -- هل النتيجة تمثل خطورة على الحياة؟
    technician_notes text,
    technician_id uuid REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now()
);

-- �️ ترميم هيكل جدول طلبات المختبر لضمان وجود أعمدة التنبيهات الحرجة
DO $$ BEGIN
    ALTER TABLE public.hims_lab_orders ADD COLUMN IF NOT EXISTS is_critical boolean DEFAULT false;
END $$;

-- � جدول بنود الفاتورة التفصيلية (Detailed Billing Items)
CREATE TABLE IF NOT EXISTS public.hims_billing_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    billing_id uuid REFERENCES public.hims_billing(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    item_type text CHECK (item_type IN ('consultation', 'pharmacy', 'lab', 'radiology', 'accommodation', 'surgery', 'other')),
    description text NOT NULL,
    quantity numeric DEFAULT 1,
    unit_price numeric(15,2) DEFAULT 0,
    total_price numeric(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    related_service_id uuid,
    created_at timestamptz DEFAULT now()
);

-- 🩺 الملاحظات السريرية المهيكلة (SOAP Clinical Notes)
CREATE TABLE IF NOT EXISTS public.hims_clinical_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    doctor_id uuid REFERENCES public.hims_doctors(id),
    subjective text, -- ما يشتكي منه المريض
    objective text,  -- ما يلاحظه الطبيب بالفحص
    assessment text, -- التشخيص المبدئي
    icd10_code_id uuid REFERENCES public.hims_icd10_codes(id), -- الربط مع ICD-10
    plan text,       -- الخطة العلاجية
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 👩‍⚕️ سجل نشاط التمريض (Nursing Care Log)
CREATE TABLE IF NOT EXISTS public.hims_nursing_activities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    nurse_id uuid REFERENCES public.profiles(id),
    activity_name text NOT NULL,
    status text DEFAULT 'done',
    notes text,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 🛡️ [تحديث توافقي] إضافة اسم مستعار للعمود لضمان عدم تعطل الواجهة الأمامية (حل خطأ 400)
DO $$ BEGIN
    ALTER TABLE public.hims_billing ADD COLUMN IF NOT EXISTS patient_share_amount numeric(15,2) GENERATED ALWAYS AS (patient_paid_amount) STORED;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ================================================================
-- 8. مديول المواعيد والانتظار (Appointments & Queue)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.hims_appointments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    patient_id uuid REFERENCES public.hims_patients(id) ON DELETE CASCADE,
    doctor_id uuid REFERENCES public.hims_doctors(id) ON DELETE CASCADE,
    appointment_date date NOT NULL DEFAULT CURRENT_DATE,
    appointment_time time NOT NULL,
    queue_number integer,
    status text DEFAULT 'scheduled', -- scheduled, arrived, in_consultation, completed, cancelled
    priority text DEFAULT 'normal', -- normal, urgent, emergency
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 🛡️ ترميم هيكل جدول الأسرة لإضافة عمود الزيارة الحالية (Schema Healing)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hims_beds' AND table_schema = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hims_beds' AND column_name='current_visit_id') THEN
             ALTER TABLE public.hims_beds ADD COLUMN current_visit_id uuid REFERENCES public.hims_visits(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- 💊 سجل إعطاء الدواء (Medication Administration Record - MAR)
CREATE TABLE IF NOT EXISTS public.hims_medication_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    medication_name text NOT NULL,
    dosage text,
    administered_at timestamptz DEFAULT now(),
    administered_by uuid REFERENCES public.profiles(id),
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    batch_number text,
    expiry_date date
);

-- دالة لتوليد رقم الدور تلقائياً لكل طبيب في اليوم الواحد
CREATE OR REPLACE FUNCTION public.fn_hims_assign_queue_number()
RETURNS TRIGGER AS $$
DECLARE
    v_max_queue integer;
BEGIN
    SELECT COALESCE(MAX(queue_number), 0) INTO v_max_queue
    FROM public.hims_appointments
    WHERE doctor_id = NEW.doctor_id 
    AND appointment_date = NEW.appointment_date;
    
    NEW.queue_number := v_max_queue + 1;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 🛡️ دالة التحقق من توفر الطبيب لمنع تداخل المواعيد (Overbooking Guard)
CREATE OR REPLACE FUNCTION public.fn_hims_check_appointment_conflict()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.hims_appointments
        WHERE doctor_id = NEW.doctor_id 
        AND appointment_date = NEW.appointment_date
        AND appointment_time = NEW.appointment_time
        AND id != NEW.id -- استثناء السجل الحالي في حالة التحديث
        AND status NOT IN ('cancelled', 'completed')
    ) THEN
        RAISE EXCEPTION '⚠️ عذراً، الطبيب لديه موعد آخر مؤكد في هذا التوقيت.';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hims_queue_number ON public.hims_appointments;
CREATE TRIGGER trg_hims_queue_number
BEFORE INSERT ON public.hims_appointments
FOR EACH ROW EXECUTE FUNCTION public.fn_hims_assign_queue_number();

DROP TRIGGER IF EXISTS trg_hims_check_conflict ON public.hims_appointments;
CREATE TRIGGER trg_hims_check_conflict
BEFORE INSERT OR UPDATE ON public.hims_appointments
FOR EACH ROW EXECUTE FUNCTION public.fn_hims_check_appointment_conflict();

-- 📱 أتمتة تنبيهات الواتساب للمواعيد
CREATE OR REPLACE FUNCTION public.fn_hims_schedule_whatsapp_reminders()
RETURNS TRIGGER AS $$
DECLARE
    v_patient_name text;
    v_patient_phone text;
    v_doctor_name text;
BEGIN
    SELECT full_name, phone INTO v_patient_name, v_patient_phone FROM public.hims_patients WHERE id = NEW.patient_id;
    SELECT p.full_name INTO v_doctor_name FROM public.hims_doctors d JOIN public.profiles p ON d.profile_id = p.id WHERE d.id = NEW.doctor_id;

    IF v_patient_phone IS NOT NULL THEN
        INSERT INTO public.whatsapp_notification_queue (organization_id, phone_number, message_body, status)
        VALUES (
            NEW.organization_id,
            v_patient_phone,
            format('عزيزي %s، نذكركم بموعدكم في مستشفى تراي برو مع د. %s يوم %s في تمام الساعة %s. نتمنى لكم وافر الصحة.', 
                   v_patient_name, v_doctor_name, NEW.appointment_date, NEW.appointment_time),
            'pending'
        );
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hims_appointment_whatsapp ON public.hims_appointments;
CREATE TRIGGER trg_hims_appointment_whatsapp
AFTER INSERT ON public.hims_appointments
FOR EACH ROW EXECUTE FUNCTION public.fn_hims_schedule_whatsapp_reminders();

-- 💉 دالة تسجيل إعطاء الدواء (Nursing Execution)
CREATE OR REPLACE FUNCTION public.hims_log_medication_administration(
    p_visit_id uuid,
    p_drug_name text,
    p_dosage text,
    p_batch text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.hims_medication_log (
        visit_id, medication_name, dosage, administered_by, organization_id, batch_number
    ) VALUES (
        p_visit_id, p_drug_name, p_dosage, auth.uid(), public.get_my_org(), p_batch
    );
END; $$;

-- 📊 رؤية تحليل كفاءة إشغال الأسرة (Bed Turnover & LoS)
CREATE OR REPLACE VIEW public.v_hims_bed_utilization AS
SELECT 
    w.organization_id,
    w.name as ward_name,
    COUNT(b.id) as total_beds,
    COUNT(b.id) FILTER (WHERE b.status = 'occupied') as occupied_now,
    ROUND((COUNT(b.id) FILTER (WHERE b.status = 'occupied')::numeric / NULLIF(COUNT(b.id), 0) * 100), 2) as occupancy_rate,
    (
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (check_out_time - check_in_time))/86400)::numeric, 2)
        FROM public.hims_visits 
        WHERE visit_type = 'inpatient' AND status = 'discharged' AND organization_id = w.organization_id
    ) as avg_stay_days
FROM public.hims_wards w
LEFT JOIN public.hims_beds b ON w.id = b.ward_id
GROUP BY w.id, w.name, w.organization_id;

-- 💰 رؤية ربحية الأقسام الطبية (Department Profitability)
CREATE OR REPLACE VIEW public.v_hims_dept_profitability AS
SELECT 
    w.name as department_name,
    COUNT(v.id) as visit_count,
    SUM(b.total_amount) as total_revenue,
    w.organization_id
FROM public.hims_wards w
JOIN public.hims_visits v ON v.visit_type = 'inpatient' -- نركز على التنويم كمثال للربحية
JOIN public.hims_billing b ON v.id = b.visit_id
GROUP BY w.id, w.name, w.organization_id;

GRANT SELECT ON public.v_hims_bed_utilization TO authenticated;
GRANT SELECT ON public.v_hims_dept_profitability TO authenticated;
-- منح الصلاحيات
GRANT ALL ON public.hims_appointments TO authenticated;

-- تفعيل RLS
ALTER TABLE public.hims_appointments ENABLE ROW LEVEL SECURITY;

-- إضافة قيد فريد لضمان فاتورة واحدة لكل زيارة
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_visit_billing') THEN
        ALTER TABLE public.hims_billing ADD CONSTRAINT unique_visit_billing UNIQUE (visit_id);
    END IF;
END $$;

-- ================================================================
-- 6. دوال الذكاء الاصطناعي والمحاسبي
-- ================================================================

-- دالة تجهيز الفاتورة النهائية (Invoice Aggregator)
CREATE OR REPLACE FUNCTION public.hims_prepare_invoice(p_visit_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_patient_id uuid; v_doc_fee numeric := 0; v_med_cost numeric := 0;
    v_lab_cost numeric := 0; v_stay_cost numeric := 0; v_blood_cost numeric := 0;
    v_total numeric := 0; v_bill_id uuid; v_org_id uuid;
BEGIN
    SELECT organization_id, patient_id INTO v_org_id, v_patient_id FROM public.hims_visits WHERE id = p_visit_id;
    
    -- 1. رسوم الطبيب
    SELECT consultation_fee INTO v_doc_fee FROM public.hims_doctors 
    WHERE id = (SELECT doctor_id FROM public.hims_visits WHERE id = p_visit_id);

    -- 2. تكلفة الأدوية المصروفة (بناءً على سعر البيع في المخازن)
    SELECT SUM((m->>'qty')::numeric * p.sales_price) INTO v_med_cost
    FROM public.hims_prescriptions pr, jsonb_array_elements(pr.medications) AS m
    JOIN public.products p ON p.id = (m->>'product_id')::uuid
    WHERE pr.visit_id = p_visit_id AND pr.status = 'dispensed';

    -- 3. تكلفة المختبر والأشعة
    SELECT SUM(t.price) INTO v_lab_cost
    FROM public.hims_lab_orders o
    JOIN public.hims_lab_tests t ON t.id = o.test_id
    WHERE o.visit_id = p_visit_id AND o.status = 'completed';

    -- 4. تكلفة الإقامة
    v_stay_cost := public.hims_calculate_stay_cost(p_visit_id);

    v_total := COALESCE(v_doc_fee, 0) + COALESCE(v_med_cost, 0) + COALESCE(v_lab_cost, 0) + COALESCE(v_stay_cost, 0);
    -- 5. تكلفة نقل الدم (جديد: تكامل بنك الدم)
    -- نفترض سعر ثابت لنقل الوحدة أو ربطها بجدول الخدمات مستقبلاً
    SELECT COALESCE(COUNT(id) * 150, 0) INTO v_blood_cost 
    FROM public.hims_blood_transfusions 
    WHERE visit_id = p_visit_id;

    v_total := COALESCE(v_doc_fee, 0) + COALESCE(v_med_cost, 0) + COALESCE(v_lab_cost, 0) + COALESCE(v_stay_cost, 0) + v_blood_cost;

    INSERT INTO public.hims_billing (visit_id, patient_id, total_amount, patient_paid_amount, organization_id)
    VALUES (p_visit_id, v_patient_id, v_total, v_total, v_org_id)
    ON CONFLICT (visit_id) DO UPDATE SET 
        total_amount = EXCLUDED.total_amount,
        patient_paid_amount = EXCLUDED.total_amount - COALESCE(public.hims_billing.insurance_covered_amount, 0)
    RETURNING id INTO v_bill_id;

    RETURN v_bill_id;
END; $$;

-- ================================================================
-- 6. دوال التكامل المتقدمة (Business Logic)
-- ================================================================

-- دالة تسجيل مريض جديد وربطه تلقائياً بملف العملاء (Accounting Integration)
CREATE OR REPLACE FUNCTION public.fn_hims_on_patient_insert()
RETURNS TRIGGER AS $$
DECLARE v_cust_id uuid;
BEGIN
    -- 🛡️ حماية العملية من الانهيار (Soft Link)
    BEGIN
        INSERT INTO public.customers (name, phone, organization_id, customer_type)
        VALUES (NEW.full_name, COALESCE(NEW.phone, ''), NEW.organization_id, 'individual')
        RETURNING id INTO v_cust_id;
        NEW.customer_id := v_cust_id;
    EXCEPTION WHEN OTHERS THEN
        -- إذا فشل إنشاء العميل، لا تمسح المريض، فقط اترك الرابط فارغاً للمراجعة
        NEW.customer_id := NULL;
    END;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- دالة تسكين مريض على سرير (Admission)
CREATE OR REPLACE FUNCTION public.hims_admit_patient(p_visit_id uuid, p_bed_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; v_patient_id uuid;
BEGIN
    SELECT organization_id, patient_id INTO v_org_id, v_patient_id FROM public.hims_visits WHERE id = p_visit_id;
    
    -- تحديث حالة السرير
    UPDATE public.hims_beds SET 
        status = 'occupied', 
        current_patient_id = v_patient_id,
        current_visit_id = p_visit_id
    WHERE id = p_bed_id;

    -- تحديث الزيارة
    UPDATE public.hims_visits SET 
        visit_type = 'inpatient', 
        admission_date = now() 
    WHERE id = p_visit_id;
END; $$;

-- دالة حساب تكلفة الإقامة (Bed Charges Calculation)
CREATE OR REPLACE FUNCTION public.hims_calculate_stay_cost(p_visit_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_visit record; v_bed record; v_days int; v_total numeric;
BEGIN
    SELECT * INTO v_visit FROM public.hims_visits WHERE id = p_visit_id;
    SELECT * INTO v_bed FROM public.hims_beds WHERE current_patient_id = v_visit.patient_id LIMIT 1;
    
    -- حساب الأيام (بحد أدنى يوم واحد)
    v_days := GREATEST(EXTRACT(DAY FROM (now() - v_visit.admission_date))::int, 1);
    v_total := v_days * COALESCE(v_bed.daily_rate, 0);
    
    RETURN v_total;
END; $$;

-- 💊 دالة صرف الروشتة وخصم المخزون المارنة (Pharmacy Integration)
-- التحديث: جعل المستودع اختيارياً والبحث عنه تلقائياً في حال عدم إرساله
DROP FUNCTION IF EXISTS public.hims_dispense_prescription(uuid, uuid);
DROP FUNCTION IF EXISTS public.hims_dispense_prescription(uuid);
DROP FUNCTION IF EXISTS public.hims_dispense_prescription(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.hims_dispense_prescription(p_prescription_id uuid, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_med record; v_org_id uuid; v_visit_id uuid;
DECLARE v_final_wh_id uuid;
DECLARE v_sales_price numeric; v_product_name text;
BEGIN
    SELECT organization_id, visit_id INTO v_org_id, v_visit_id FROM public.hims_prescriptions WHERE id = p_prescription_id;
    
    -- 🛡️ تحديد المستودع: الممرر صراحة > إعدادات الصيدلية > أول مستودع متاح للمنظمة
    v_final_wh_id := COALESCE(
        p_warehouse_id,
        (SELECT default_pharmacy_warehouse FROM public.hims_settings WHERE organization_id = v_org_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
    );

    IF v_final_wh_id IS NULL THEN
        RAISE EXCEPTION '⚠️ فشل الصرف: لم يتم العثور على مستودع صيدلية معرف لهذه المنظمة.';
    END IF;

    FOR v_med IN SELECT * FROM jsonb_to_recordset((SELECT medications FROM public.hims_prescriptions WHERE id = p_prescription_id)) 
        AS x(product_id uuid, qty numeric)
    LOOP
        -- 🛡️ رقابة مزدوجة: (الكمية + الصلاحية)
        IF EXISTS (
            SELECT 1 FROM public.products 
            WHERE id = v_med.product_id 
            AND organization_id = v_org_id 
            AND (expiry_date < CURRENT_DATE)
        ) THEN
            RAISE EXCEPTION '⚠️ خطأ أمني: الدواء (%) منتهي الصلاحية ولا يمكن صرفه طبياً.', 
                (SELECT name FROM public.products WHERE id = v_med.product_id);
        END IF;

        IF (SELECT stock FROM public.products WHERE id = v_med.product_id AND organization_id = v_org_id) < v_med.qty THEN
            RAISE EXCEPTION '⚠️ عجز مخزني: لا يتوفر رصيد كافٍ للدواء (%). الرصيد المتوفر (%) فقط.', 
                (SELECT name FROM public.products WHERE id = v_med.product_id),
                (SELECT stock FROM public.products WHERE id = v_med.product_id AND organization_id = v_org_id);
        END IF;

        -- جلب البيانات المالية للصنف
        SELECT name, sales_price INTO v_product_name, v_sales_price FROM public.products WHERE id = v_med.product_id;

        -- 1. خصم الكمية من المخزن
        UPDATE public.products SET stock = stock - v_med.qty 
        WHERE id = v_med.product_id AND organization_id = v_org_id;

        -- 2. ترحيل البند فوراً لفاتورة المريض لضمان الشفافية المحاسبية
        PERFORM public.hims_add_billing_item(
            v_visit_id,
            'pharmacy',
            v_product_name,
            v_med.qty,
            v_sales_price
        );
    END LOOP;

    UPDATE public.hims_prescriptions SET status = 'dispensed' WHERE id = p_prescription_id;
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

DROP TRIGGER IF EXISTS trg_hims_patient_sync ON public.hims_patients;
CREATE TRIGGER trg_hims_patient_sync BEFORE INSERT ON public.hims_patients FOR EACH ROW EXECUTE FUNCTION public.fn_hims_on_patient_insert();

-- دالة اعتماد فاتورة المستشفى وترحيل القيود (مثل approve_invoice في المبيعات)
CREATE OR REPLACE FUNCTION public.hims_finalize_billing(p_billing_id uuid, p_cash_acc uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bill RECORD; v_je_id uuid; v_org_id uuid; v_mappings jsonb;
    v_rev_acc uuid; v_cust_acc uuid; v_ins_acc uuid;
BEGIN
    SELECT * INTO v_bill FROM public.hims_billing WHERE id = p_billing_id;
    v_org_id := v_bill.organization_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- جلب الحسابات
    v_rev_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1)));
    v_cust_acc := (SELECT customer_id FROM public.hims_patients WHERE id = v_bill.patient_id);

    -- 1. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'فاتورة علاج مريض - زيارة رقم ' || v_bill.visit_id, 'HIMS-' || substring(v_bill.id::text, 1, 8), 'posted', v_org_id, true, p_billing_id, 'hims_billing')
    RETURNING id INTO v_je_id;

    -- 2. من ح/ النقدية (جزء المريض)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
    VALUES (v_je_id, public.resolve_leaf_account(p_cash_acc), v_bill.patient_paid_amount, 0, v_org_id, 'تحصيل من مريض - فاتورة علاج');

    -- 3. من ح/ ذمم شركات التأمين (إذا وجد)
    IF v_bill.insurance_covered_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
        VALUES (v_je_id, v_bill.insurance_provider_id, v_bill.insurance_covered_amount, 0, v_org_id, 'مستحق من شركة التأمين');
    END IF;

    -- 4. إلى ح/ إيرادات الخدمات الطبية
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
    VALUES (v_je_id, v_rev_acc, 0, v_bill.total_amount, v_org_id, 'إيرادات طبية - زيارة مريض');

    UPDATE public.hims_billing SET related_journal_entry_id = v_je_id, payment_status = 'paid' WHERE id = p_billing_id;
END; $$;

-- ================================================================
-- 10. رؤية التحليل المالي والتشغيلي للمستشفى (Managerial BI View)
-- ================================================================

CREATE OR REPLACE VIEW public.v_hims_performance_bi WITH (security_invoker = true) AS
SELECT 
    v.organization_id,
    d.specialization,
    v.visit_type,
    COUNT(v.id) as total_visits,
    COALESCE(SUM(b.total_amount), 0) as total_revenue,
    COALESCE(SUM(b.insurance_covered_amount), 0) as insurance_receivables,
    COALESCE(SUM(b.patient_paid_amount), 0) as cash_collected,
    AVG(EXTRACT(EPOCH FROM (v.check_out_time - v.check_in_time))/60)::numeric(10,2) as avg_visit_duration_mins
FROM public.hims_visits v
JOIN public.hims_doctors d ON v.doctor_id = d.id
LEFT JOIN public.hims_billing b ON v.id = b.visit_id
WHERE v.status = 'discharged'
GROUP BY v.organization_id, d.specialization, v.visit_type;

GRANT SELECT ON public.v_hims_performance_bi TO authenticated;

-- ================================================================
-- 11. إدارة غرف العمليات والجراحة (Surgery & OR)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.hims_surgeries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    lead_surgeon_id uuid REFERENCES public.hims_doctors(id),
    surgery_name text NOT NULL,
    room_number text,
    scheduled_start timestamptz NOT NULL,
    scheduled_end timestamptz,
    status text DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
    anaesthetist_name text,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 🛡️ دالة التحقق من تضارب الجراحات (Surgery Overlap Guard)
-- تمنع حجز غرفة أو جراح في نفس التوقيت
CREATE OR REPLACE FUNCTION public.fn_hims_check_surgery_conflict()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. التحقق من توفر الغرفة
    IF EXISTS (
        SELECT 1 FROM public.hims_surgeries
        WHERE room_number = NEW.room_number
        AND organization_id = NEW.organization_id
        AND status NOT IN ('cancelled', 'completed')
        AND id != NEW.id
        AND (NEW.scheduled_start, COALESCE(NEW.scheduled_end, NEW.scheduled_start + interval '2 hours')) 
            OVERLAPS (scheduled_start, COALESCE(scheduled_end, scheduled_start + interval '2 hours'))
    ) THEN
        RAISE EXCEPTION '⚠️ عذراً، غرفة العمليات (%) مشغولة في هذا التوقيت.', NEW.room_number;
    END IF;

    -- 2. التحقق من توفر الجراح
    IF EXISTS (
        SELECT 1 FROM public.hims_surgeries
        WHERE lead_surgeon_id = NEW.lead_surgeon_id
        AND status NOT IN ('cancelled', 'completed')
        AND id != NEW.id
        AND (NEW.scheduled_start, COALESCE(NEW.scheduled_end, NEW.scheduled_start + interval '2 hours')) 
            OVERLAPS (scheduled_start, COALESCE(scheduled_end, scheduled_start + interval '2 hours'))
    ) THEN
        RAISE EXCEPTION '⚠️ الجراح لديه عملية أخرى مجدولة في نفس هذا الوقت.';
    END IF;

    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hims_surgery_conflict ON public.hims_surgeries;
CREATE TRIGGER trg_hims_surgery_conflict
BEFORE INSERT OR UPDATE ON public.hims_surgeries
FOR EACH ROW EXECUTE FUNCTION public.fn_hims_check_surgery_conflict();

-- ================================================================
-- 12. محرك مطالبات التأمين (Insurance Claims Management)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.hims_insurance_claims (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    insurance_provider_id uuid REFERENCES public.customers(id),
    batch_reference text UNIQUE, -- رقم الدفعة المرسلة لشركة التأمين
    status text DEFAULT 'draft', -- draft, submitted, paid, rejected
    total_claim_amount numeric(15,2) DEFAULT 0,
    submission_date date,
    payment_date date,
    created_at timestamptz DEFAULT now()
);

-- ربط الفواتير بالمطالبات
ALTER TABLE public.hims_billing ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES public.hims_insurance_claims(id) ON DELETE SET NULL;

-- إضافة عمود لتتبع المبلغ المحصل فعلياً من شركة التأمين
ALTER TABLE public.hims_insurance_claims ADD COLUMN IF NOT EXISTS total_collected_amount numeric(15,2) DEFAULT 0;

-- منح الصلاحيات
GRANT ALL ON public.hims_patients TO authenticated;
GRANT ALL ON public.hims_doctors TO authenticated;
GRANT ALL ON public.hims_visits TO authenticated;
GRANT ALL ON public.hims_prescriptions TO authenticated;
GRANT ALL ON public.hims_surgeries TO authenticated;
GRANT ALL ON public.hims_insurance_claims TO authenticated;

-- ================================================================
-- 13. أتمتة استهلاك مستلزمات العمليات (Surgery Consumption Logic)
-- ================================================================

DROP FUNCTION IF EXISTS public.hims_complete_surgery_and_consume(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.hims_complete_surgery_and_consume(
    p_surgery_id uuid,
    p_warehouse_id uuid,
    p_consumables jsonb -- [{product_id, qty}]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_surgery RECORD;
    v_item RECORD;
    v_org_id uuid;
    v_surgeon_user_id uuid;
BEGIN
    SELECT * INTO v_surgery FROM public.hims_surgeries WHERE id = p_surgery_id;
    v_org_id := v_surgery.organization_id;

    -- 1. تحديث حالة العملية
    UPDATE public.hims_surgeries 
    SET status = 'completed', scheduled_end = now() 
    WHERE id = p_surgery_id;

    -- 🔔 إخطار الجراح بانتهاء التسجيل الإجرائي وتحديث المخزن
    SELECT d.profile_id INTO v_surgeon_user_id FROM public.hims_doctors d WHERE d.id = v_surgery.lead_surgeon_id;
    IF v_surgeon_user_id IS NOT NULL THEN
        -- 🛡️ [تحديث V52.7] استخدام Named Parameters بشكل صحيح وصريح
        PERFORM public.create_notification_from_sql(
            p_org_id     => v_org_id::uuid,
            p_user_id    => v_surgeon_user_id::uuid,
            p_title      => 'تم إكمال الجراحة ✅'::text, 
            p_message    => format('تم إغلاق ملف العملية (%s).', v_surgery.surgery_name)::text,
            p_type       => 'success'::public.notification_type, 
            p_priority   => 'high'::public.notification_priority, 
            p_action_url => ('/hims/surgeries/' || p_surgery_id)::text, 
            p_related_id => NULL::uuid
        );
    END IF;

    -- 2. معالجة المستهلكات المخزنية
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_consumables) AS x(product_id uuid, qty numeric)
    LOOP
        -- خصم مباشر من المخزن
        UPDATE public.products 
        SET stock = stock - v_item.qty 
        WHERE id = v_item.product_id AND organization_id = v_org_id;
        
        -- تسجيل حركة مخزنية (اختياري حسب نظامك)
    END LOOP;

    -- 3. تحديث الفاتورة (إضافة تكلفة العملية كبند تفصيلي)
    PERFORM public.hims_add_billing_item(
        v_surgery.visit_id, 
        'surgery', 
        'إجراء جراحي: ' || v_surgery.surgery_name, 
        1, 
        COALESCE((SELECT consultation_fee FROM public.hims_doctors WHERE id = v_surgery.lead_surgeon_id), 0)
    );

    -- 4. إعادة حساب المخزن
    PERFORM public.recalculate_stock_rpc(v_org_id);

END; $$;

-- ================================================================
-- 🧪 محرك معالجة المختبر المتقدم (Inventory & Results Integration)
-- ================================================================

-- دالة اعتماد نتيجة المختبر وخصم المحاليل المستعملة من المخزن بدقة
DROP FUNCTION IF EXISTS public.hims_complete_lab_with_inventory(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.hims_complete_lab_with_inventory(uuid, text, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.hims_complete_lab_with_inventory(
    p_order_id uuid,
    p_result text,
    p_consumables jsonb, -- التنسيق المتوقع: [{product_id, qty}]
    p_is_critical boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_org_id uuid;
    v_doctor_user_id uuid;
BEGIN
    -- 1. جلب بيانات الطلب والمنظمة لضمان الأمان
    SELECT * INTO v_order FROM public.hims_lab_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION '⚠️ طلب المختبر غير موجود في النظام.'; END IF;
    v_org_id := v_order.organization_id;

    -- 2. تحديث حالة الطلب وتسجيل النتيجة الطبية
    UPDATE public.hims_lab_orders 
    SET status = 'completed', 
        result_value = p_result,
        is_critical = p_is_critical,
        technician_id = auth.uid(),
        created_at = now() 
    WHERE id = p_order_id;

    -- 🔔 إخطار الطبيب المعالج فوراً (ظهور النقطة الحمراء في مكتب الطبيب)
    SELECT d.profile_id INTO v_doctor_user_id 
    FROM public.hims_visits v JOIN public.hims_doctors d ON v.doctor_id = d.id 
    WHERE v.id = v_order.visit_id;

    IF v_doctor_user_id IS NOT NULL THEN
        PERFORM public.create_notification_from_sql(
            p_org_id     => v_org_id::uuid,
            p_user_id    => v_doctor_user_id::uuid,
            p_title      => (CASE WHEN p_is_critical THEN '⚠️ نتيجة مختبر حرجة!' ELSE 'نتائج مختبر جديدة 🧪' END)::text, 
            p_message    => format('صدرت نتائج التحليل للمريض. الحالة: %s', CASE WHEN p_is_critical THEN 'حرجة' ELSE 'عادية' END)::text, 
            p_type       => (CASE WHEN p_is_critical THEN 'warning'::public.notification_type ELSE 'success'::public.notification_type END),
            p_priority   => (CASE WHEN p_is_critical THEN 'high'::public.notification_priority ELSE 'medium'::public.notification_priority END),
            p_action_url => ('/hims/visits/' || v_order.visit_id)::text,
            p_related_id => NULL::uuid
        );
    END IF;

    -- 3. معالجة خصم المخزون للمستهلكات (المحاليل والمستلزمات)
    IF p_consumables IS NOT NULL AND jsonb_array_length(p_consumables) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_consumables) AS x(product_id uuid, qty numeric)
        LOOP
            -- الخصم المباشر من مخزن المنظمة الصحيحة
            UPDATE public.products 
            SET stock = stock - v_item.qty 
            WHERE id = v_item.product_id AND organization_id = v_org_id;
        END LOOP;
    END IF;

    -- 🛡️ ترحيل البند فوراً لضمان الشفافية المالية (Financial Handshake)
    PERFORM public.hims_add_billing_item(
        v_order.visit_id,
        'lab',
        COALESCE((SELECT test_name FROM public.hims_lab_tests WHERE id = v_order.test_id), 'تحليل مخبري'),
        1,
        COALESCE((SELECT price FROM public.hims_lab_tests WHERE id = v_order.test_id), 0)
    );

    -- 4. إطلاق تحديث الأرصدة العام لضمان دقة التقارير المخزنية
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ================================================================
-- 9. مديول الأشعة والتصوير الطبي (Radiology)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.hims_radiology_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    scan_type text NOT NULL, -- X-Ray, MRI, CT
    status text DEFAULT 'pending',
    report_text text,
    image_urls text[], -- روابط الصور في Supabase Storage
    price numeric(15,2) DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- منح الصلاحيات للأشعة
GRANT ALL ON public.hims_radiology_orders TO authenticated;
ALTER TABLE public.hims_radiology_orders ENABLE ROW LEVEL SECURITY;
-- ================================================================
-- 14. مديول بنك الدم (Blood Bank Management)
-- ================================================================

-- جدول المتبرعين بالدم
CREATE TABLE IF NOT EXISTS public.hims_blood_donors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    full_name text NOT NULL,
    national_id text UNIQUE,
    blood_type text NOT NULL, -- A+, O-, etc.
    phone text,
    last_donation_date date,
    health_status text DEFAULT 'healthy',
    created_at timestamptz DEFAULT now()
);

-- سجل عمليات التبرع
CREATE TABLE IF NOT EXISTS public.hims_blood_donations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    donor_id uuid REFERENCES public.hims_blood_donors(id) ON DELETE CASCADE,
    bag_code text UNIQUE NOT NULL, -- باركود كيس الدم
    volume_ml numeric DEFAULT 450,
    expiry_date date NOT NULL,
    status text DEFAULT 'available', -- available, reserved, used, expired
    created_at timestamptz DEFAULT now()
);

-- عمليات نقل الدم للمرضى
CREATE TABLE IF NOT EXISTS public.hims_blood_transfusions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    bag_id uuid REFERENCES public.hims_blood_donations(id),
    doctor_id uuid REFERENCES public.hims_doctors(id),
    transfusion_date timestamptz DEFAULT now(),
    notes text,
    created_at timestamptz DEFAULT now()
);

-- دالة معالجة التبرع وتحديث المخزون
CREATE OR REPLACE FUNCTION public.hims_process_donation(p_donor_id uuid, p_bag_code text, p_expiry date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.hims_blood_donations (donor_id, bag_code, expiry_date, organization_id)
    VALUES (p_donor_id, p_bag_code, p_expiry, public.get_my_org());

    UPDATE public.hims_blood_donors SET last_donation_date = CURRENT_DATE WHERE id = p_donor_id;
END; $$;

-- 🩸 دالة تسجيل متبرع جديد (Donor Registration)
CREATE OR REPLACE FUNCTION public.hims_register_donor(
    p_name text,
    p_national_id text,
    p_blood_type text,
    p_phone text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_donor_id uuid;
BEGIN
    INSERT INTO public.hims_blood_donors (full_name, national_id, blood_type, phone, organization_id)
    VALUES (p_name, p_national_id, p_blood_type, p_phone, public.get_my_org())
    ON CONFLICT (national_id) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id INTO v_donor_id;
    
    RETURN v_donor_id;
END; $$;
-- 💰 رؤية ربحية الأطباء (Doctor Profitability Analysis)
CREATE OR REPLACE VIEW public.v_hims_doctor_profitability AS
SELECT 
    d.id as doctor_id,
    p.full_name as doctor_name,
    d.specialization,
    COUNT(v.id) as total_visits,
    COALESCE(SUM(b.total_amount), 0) as total_revenue,
    COALESCE(SUM(b.patient_paid_amount), 0) as patient_collections,
    COALESCE(SUM(b.insurance_covered_amount), 0) as insurance_receivables,
    d.organization_id
FROM public.hims_doctors d
JOIN public.profiles p ON d.profile_id = p.id
LEFT JOIN public.hims_visits v ON v.doctor_id = d.id
LEFT JOIN public.hims_billing b ON v.id = b.visit_id
GROUP BY d.id, p.full_name, d.specialization, d.organization_id;

GRANT SELECT ON public.v_hims_doctor_profitability TO authenticated;

-- منح الصلاحيات
GRANT ALL ON public.hims_blood_donors TO authenticated;
GRANT ALL ON public.hims_blood_donations TO authenticated;
GRANT ALL ON public.hims_blood_transfusions TO authenticated;
GRANT EXECUTE ON FUNCTION public.hims_process_donation TO authenticated;
GRANT ALL ON public.hims_billing TO authenticated;

-- ================================================================
-- 15. دالة إصلاح المزامنة ومعالجة البيانات المفقودة
-- ================================================================
-- 🛡️ [تحديث] تم دمج المنطق أعلاه في الدالة الموجودة في السطر 713 لضمان عدم التكرار.

-- ================================================================
-- 15. محرك معالجة الخروج (Discharge & Auto-Billing Engine)
-- ================================================================
-- 🛡️ تنظيف النسخ القديمة للدالة لمنع خطأ "Function not unique"
DROP FUNCTION IF EXISTS public.hims_process_discharge(uuid);
DROP FUNCTION IF EXISTS public.hims_process_discharge(uuid, text);

-- 🛡️ [تحديث V52.0] إضافة درع براءة الذمة المادية (Financial Discharge Shield)
CREATE OR REPLACE FUNCTION public.hims_process_discharge(p_visit_id uuid, p_override_pwd text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_patient_id uuid; v_total numeric; v_paid numeric; v_ins_covered numeric; v_balance numeric;
    v_is_cleared boolean := false;
BEGIN
    -- 1. تحديث الفاتورة أولاً لضمان دقة الأرقام قبل الفحص
    PERFORM public.hims_prepare_invoice(p_visit_id);

    -- 2. جلب الموقف المالي للمريض
    SELECT 
        patient_id, 
        total_amount, 
        patient_paid_amount, 
        insurance_covered_amount 
    INTO v_patient_id, v_total, v_paid, v_ins_covered
    FROM public.hims_billing 
    WHERE visit_id = p_visit_id;

    v_balance := COALESCE(v_total, 0) - (COALESCE(v_paid, 0) + COALESCE(v_ins_covered, 0));

    -- 3. تطبيق "درع الحماية": منع الخروج إذا وجد رصيد متبقي (إلا بتجاوز المدير)
    IF v_balance > 0.01 THEN
        -- هنا نفترض أن الواجهة سترسل كلمة سر معينة للـ Override
        -- في بيئة الإنتاج، يفضل التحقق من دور المستخدم (Admin) عبر p_override_pwd
        IF p_override_pwd IS NOT NULL AND p_override_pwd = 'MANAGER_OVERRIDE' THEN
            INSERT INTO public.security_logs (event_type, description, organization_id, metadata)
            VALUES ('financial_override', format('تم تجاوز المديونية للمريض %s للسماح بالخروج', v_patient_id), public.get_my_org(), jsonb_build_object('visit_id', p_visit_id, 'balance', v_balance));
            v_is_cleared := true;
        ELSE
            RAISE EXCEPTION '⚠️ عذراً، لا يمكن إتمام الخروج. المريض لديه مديونية متبقية بقيمة (%s). يرجى السداد أو طلب تجاوز من المدير.', v_balance;
        END IF;
    ELSE
        v_is_cleared := true;
    END IF;

    IF NOT v_is_cleared THEN RETURN; END IF;

    -- 2. تحديث حالة الزيارة وتسجيل وقت الخروج اللحظي
    UPDATE public.hims_visits 
    SET status = 'discharged', 
        check_out_time = now() 
    WHERE id = p_visit_id;

    -- 3. تحرير السرير فوراً ليكون متاحاً لمريض آخر
    UPDATE public.hims_beds 
    SET status = 'cleaning', 
        current_patient_id = NULL,
        current_visit_id = NULL
    WHERE current_visit_id = p_visit_id;
END; $$;

-- 🚨 رادار الطوارئ الصوتي (Emergency Audio Signal)
-- هذه الدالة ستستخدمها الواجهة الأمامية لإطلاق صوت التنبيه فوراً عند وجود حالة حرجة
CREATE OR REPLACE FUNCTION public.hims_get_active_emergency_alerts(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (visit_id uuid, patient_name text, triage_level text, minutes_waiting numeric) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 🛡️ [تحديث V52.1] إضافة تنبيه آلي لحظي عند إدخال حالة طوارئ حرجة
    -- سيظهر هذا في جرس التنبيهات ويصدر صوتاً إذا تم ربطه بالواجهة
    IF EXISTS (
        SELECT 1 FROM public.hims_visits 
        WHERE triage_level = 'level_1_resuscitation' 
        AND status = 'arrived' 
        AND created_at >= (now() - interval '1 minute')
    ) THEN
        -- إرسال إشعار فوري لجميع الأطباء في المنظمة
        INSERT INTO public.notifications (user_id, title, message, priority, type, organization_id)
        SELECT DISTINCT
            p.id, 
            '🚨 حالة إنعاش فورية!', 
            'وصل مريض بحالة حرجة جداً (Level 1) لغرفة الطوارئ. يرجى التوجه فوراً.', 
            'high'::public.notification_priority,
            'emergency_alert'::public.notification_type, 
            COALESCE(p_org_id, public.get_my_org())
        FROM public.profiles p
        JOIN public.hims_doctors d ON p.id = d.profile_id
        WHERE p.organization_id = COALESCE(p_org_id, public.get_my_org())
        AND p.role IN ('admin', 'manager', 'accountant') -- بالإضافة للأطباء عبر دالة مخصصة إذا لزم
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN QUERY
    SELECT 
        v.id, 
        p.full_name, 
        v.triage_level,
        EXTRACT(EPOCH FROM (now() - v.check_in_time))/60
    FROM public.hims_visits v
    JOIN public.hims_patients p ON v.patient_id = p.id
    WHERE v.organization_id = COALESCE(p_org_id, public.get_my_org())
    AND v.visit_type = 'emergency'
    AND v.triage_level IN ('level_1_resuscitation', 'level_2_emergent')
    AND v.status NOT IN ('discharged', 'completed');
END; $$;
-- 🚀 محرك التنبؤ بالتدفق النقدي (HIMS Cashflow Predictor)
-- المهمة: رؤية المستقبل المالي بناءً على ذمم التأمين ومعدل التحصيل النقدي
CREATE OR REPLACE FUNCTION public.hims_get_cashflow_projection(p_org_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid := COALESCE(p_org_id, public.get_my_org());
    v_avg_daily_cash numeric;
    v_insurance_receivables numeric;
    v_projection jsonb := '[]'::jsonb;
    v_i int;
BEGIN
    -- 1. حساب متوسط الدخل النقدي اليومي من المرضى في آخر 30 يوم
    SELECT COALESCE(SUM(patient_paid_amount) / 30, 0) INTO v_avg_daily_cash
    FROM public.hims_billing
    WHERE organization_id = v_org_id AND created_at >= (now() - interval '30 days');

    -- 2. جلب إجمالي مبالغ التأمين المعتمدة ولم تُحصل بعد (المستحقة قريباً)
    SELECT COALESCE(SUM(insurance_covered_amount), 0) INTO v_insurance_receivables
    FROM public.hims_billing
    WHERE organization_id = v_org_id AND payment_status != 'paid' AND insurance_covered_amount > 0;

    -- 3. بناء مصفوفة توقعات للـ 30 يوماً القادمة (بناء منحنى نمو)
    FOR v_i IN 1..30 LOOP
        v_projection := v_projection || jsonb_build_object(
            'day', (CURRENT_DATE + v_i),
            -- التوقع = (المتوسط اليومي * عدد الأيام) + (توزيع تدريجي لمستحقات التأمين)
            'expected_balance', ROUND((v_avg_daily_cash * v_i) + (v_insurance_receivables * (v_i::numeric / 30)), 2)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'current_receivables', v_insurance_receivables,
        'daily_burn_rate', v_avg_daily_cash,
        'forecast_data', v_projection
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.hims_get_cashflow_projection(uuid) TO authenticated;

-- 📄 محرك توثيق المستندات الفاخر (HIMS Document Authenticator)
-- المهمة: توليد بيانات الـ QR Code للتحقق من صحة الفاتورة أو تقرير الخروج
CREATE OR REPLACE FUNCTION public.hims_get_document_qr_data(p_doc_id uuid, p_type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_name text;
    v_doc_ref text;
    v_total numeric;
    v_date timestamptz;
    v_payload text;
BEGIN
    SELECT name INTO v_org_name FROM public.organizations WHERE id = public.get_my_org();

    IF p_type = 'billing' THEN
        SELECT 'BILL-' || substring(id::text, 1, 8), total_amount, created_at 
        INTO v_doc_ref, v_total, v_date 
        FROM public.hims_billing WHERE id = p_doc_id;
        v_payload := format('Org: %s | Bill: %s | Amount: %s | Date: %s', v_org_name, v_doc_ref, v_total, v_date::date);
    ELSIF p_type = 'discharge' THEN
        SELECT 'DIS-' || substring(id::text, 1, 8), created_at 
        INTO v_doc_ref, v_date 
        FROM public.hims_visits WHERE id = p_doc_id;
        v_payload := format('Org: %s | Discharge: %s | Date: %s', v_org_name, v_doc_ref, v_date::date);
    END IF;

    -- إرجاع النص المشفر الذي سيتحول لـ QR في الواجهة
    -- [تحديث V52.1] تحسين الـ Payload ليشمل تفاصيل التحقق الرسمية
    RETURN encode(digest(v_payload || '|AUTH_VALID|' || gen_random_uuid()::text, 'sha256'), 'hex');
END; $$;

-- 🛡️ درع حماية العلامات الحيوية (Clinical Vitals Guard)
-- المهمة: إصدار تنبيه فوري إذا كانت العلامات الحيوية المدخلة تهدد الحياة
CREATE OR REPLACE FUNCTION public.fn_hims_vitals_safety_guard()
RETURNS TRIGGER AS $$
DECLARE
    v_temp numeric;
    v_systolic int;
    v_doctor_user_id uuid;
    v_patient_name text;
BEGIN
    -- استخراج القيم من الـ JSONB
    v_temp := (NEW.vital_signs->>'temp')::numeric;
    v_systolic := (NEW.vital_signs->>'bp_sys')::int;

    -- 🚨 منطق "الصرخة" الطبية: تنبيه إذا كانت الحرارة > 40 أو الضغط الانقباضي < 90
    IF v_temp > 40.0 OR v_systolic < 90 THEN
        SELECT full_name INTO v_patient_name FROM public.hims_patients WHERE id = NEW.patient_id;
        
        -- جلب حساب المستخدم الخاص بالطبيب المعالج
        SELECT d.profile_id INTO v_doctor_user_id 
        FROM public.hims_doctors d WHERE d.id = NEW.doctor_id;

        IF v_doctor_user_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
            VALUES (
                v_doctor_user_id,
                '⚠️ تنبيه طبي حرج: ' || v_patient_name,
                format('المريض سجل علامات حيوية غير مستقرة (حرارة: %s, ضغط: %s). يرجى الفحص فوراً.', v_temp, v_systolic),
                'high',
                NEW.organization_id,
                'clinical_alert'
            );
        END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hims_vitals_guard ON public.hims_visits;
CREATE TRIGGER trg_hims_vitals_guard
AFTER UPDATE OF vital_signs ON public.hims_visits
FOR EACH ROW EXECUTE FUNCTION public.fn_hims_vitals_safety_guard();

-- 🛌 محرك كفاءة تشغيل الأسرة (Bed Turnaround Automator)
-- المهمة: تحويل السرير من "تنظيف" إلى "متاح" آلياً بعد 30 دقيقة من الخروج (أو يدوياً)
CREATE OR REPLACE FUNCTION public.hims_mark_bed_ready(p_bed_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.hims_beds 
    SET status = 'available' 
    WHERE id = p_bed_id AND status = 'cleaning';
    
    -- تسجيل الحدث للتحليل الإحصائي لاحقاً (مدة التجهيز)
    INSERT INTO public.security_logs (event_type, description, organization_id, metadata)
    VALUES ('bed_ready', 'تم تجهيز السرير وتغيير حالته لمتاح', public.get_my_org(), jsonb_build_object('bed_id', p_bed_id));
END; $$;

-- 🏥 لوحة قيادة الطبيب (Doctor's Intelligent Dashboard)
CREATE OR REPLACE VIEW public.v_hims_doctor_worklist AS
SELECT 
    v.id as visit_id,
    p.full_name as patient_name,
    v.status,
    v.triage_level,
    (v.vital_signs->>'temp') as current_temp,
    v.doctor_id
FROM public.hims_visits v
JOIN public.hims_patients p ON v.patient_id = p.id
WHERE v.status NOT IN ('discharged', 'completed');

-- 🛡️ درع حماية الحساسية الدوائية (Allergy Safety Shield)
-- المهمة: منع تسجيل أي وصفة طبية تحتوي على دواء يتحسس منه المريض
CREATE OR REPLACE FUNCTION public.fn_hims_check_allergy_before_prescription()
RETURNS TRIGGER AS $$
DECLARE
    v_allergies text[];
    v_med jsonb;
    v_med_name text;
    v_allergy text;
BEGIN
    -- 1. جلب قائمة الحساسية المسجلة للمريض
    SELECT allergies INTO v_allergies 
    FROM public.hims_patients 
    WHERE id = (SELECT patient_id FROM public.hims_visits WHERE id = NEW.visit_id);

    -- 2. التحقق من كل دواء في الوصفة
    FOR v_med IN SELECT * FROM jsonb_array_elements(NEW.medications) LOOP
        SELECT name INTO v_med_name FROM public.products WHERE id = (v_med->>'product_id')::uuid;
        
        FOREACH v_allergy IN ARRAY v_allergies LOOP
            IF v_med_name ILIKE '%' || v_allergy || '%' THEN
                RAISE EXCEPTION '🚨 خطأ طبي حرج: المريض لديه حساسية مسجلة من (%). لا يمكن اعتماد الوصفة.', v_allergy;
            END IF;
        END LOOP;
    END LOOP;

    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hims_allergy_guard ON public.hims_prescriptions;
CREATE TRIGGER trg_hims_allergy_guard
BEFORE INSERT OR UPDATE ON public.hims_prescriptions
FOR EACH ROW EXECUTE FUNCTION public.fn_hims_check_allergy_before_prescription();
-- 🧪 جدول التفاعلات الدوائية الخطيرة (Drug-Drug Interactions)
CREATE TABLE IF NOT EXISTS public.hims_drug_interactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_a_id uuid REFERENCES public.products(id),
    product_b_id uuid REFERENCES public.products(id),
    severity text CHECK (severity IN ('critical', 'moderate', 'minor')),
    interaction_detail text,
    UNIQUE(product_a_id, product_b_id)
);

-- 🛡️ دالة فحص التفاعلات الدوائية قبل الحفظ
CREATE OR REPLACE FUNCTION public.fn_hims_check_drug_interactions()
RETURNS TRIGGER AS $$
DECLARE
    v_med jsonb;
    v_existing_meds uuid[];
    v_conflict_name text;
BEGIN
    -- جلب الأدوية الحالية للمريض من الزيارات النشطة
    SELECT array_agg((m->>'product_id')::uuid) INTO v_existing_meds
    FROM public.hims_prescriptions p, jsonb_array_elements(p.medications) m
    WHERE p.visit_id = NEW.visit_id AND p.status = 'dispensed';

    FOR v_med IN SELECT * FROM jsonb_array_elements(NEW.medications) LOOP
        IF EXISTS (SELECT 1 FROM public.hims_drug_interactions WHERE (product_a_id = (v_med->>'product_id')::uuid AND product_b_id = ANY(v_existing_meds)) OR (product_b_id = (v_med->>'product_id')::uuid AND product_a_id = ANY(v_existing_meds))) THEN
            SELECT name INTO v_conflict_name FROM public.products WHERE id = (v_med->>'product_id')::uuid;
            RAISE EXCEPTION '🚨 تنبيه تفاعل دوائي خطير: الدواء (%) يتعارض مع علاجات المريض الحالية.', v_conflict_name;
        END IF;
    END LOOP;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trg_hims_drug_interaction_guard ON public.hims_prescriptions;
CREATE TRIGGER trg_hims_drug_interaction_guard
BEFORE INSERT OR UPDATE ON public.hims_prescriptions
FOR EACH ROW EXECUTE FUNCTION public.fn_hims_check_drug_interactions();
-- 💰 محرك ربط استهلاك العمليات بالفوترة (Surgery Revenue Guard)
-- المهمة: التأكد من أن كل مادة تخرج من المخزن للعمليات يتم قيدها فوراً في فاتورة المريض
CREATE OR REPLACE FUNCTION public.hims_bill_surgical_consumables(p_visit_id uuid, p_product_id uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_product_name text;
    v_price numeric;
BEGIN
    -- جلب بيانات الصنف من المخازن
    SELECT name, sales_price INTO v_product_name, v_price 
    FROM public.products WHERE id = p_product_id;

    -- ترحيل البند للفاتورة (item_type = 'surgery')
    PERFORM public.hims_add_billing_item(
        p_visit_id,
        'surgery',
        'مستلزمات عملية: ' || v_product_name,
        p_qty,
        v_price
    );
END; $$;

-- 📈 رؤية مؤشرات الأداء الاستراتيجية للمالك (Owner's Strategic KPI View)
CREATE OR REPLACE VIEW public.v_hims_strategic_kpis AS
SELECT 
    o.name as hospital_name,
    (SELECT COUNT(*) FROM public.hims_visits WHERE status = 'arrived') as active_patients,
    (SELECT ROUND(AVG(total_amount), 2) FROM public.hims_billing) as avg_revenue_per_patient,
    (SELECT COUNT(*) FROM public.hims_lab_orders WHERE is_critical = true AND status = 'completed') as critical_lab_alerts_today,
    -- تحليل الإشغال
    (SELECT occupancy_rate FROM public.v_hims_bed_utilization WHERE organization_id = o.id LIMIT 1) as bed_occupancy,
    -- السيولة المتوقعة من التأمين
    (SELECT SUM(insurance_covered_amount) FROM public.hims_billing WHERE payment_status != 'paid') as insurance_pending_cash,
    o.id as organization_id
FROM public.organizations o
WHERE EXISTS (SELECT 1 FROM public.hims_settings s WHERE s.organization_id = o.id);

GRANT SELECT ON public.v_hims_strategic_kpis TO authenticated;

-- 🛡️ مراقب التعديلات على السجلات الطبية (Clinical Audit Trail)

-- 💰 دالة تسوية مطالبة تأمين وتحصيل المبلغ (Insurance Claim Settlement)
CREATE OR REPLACE FUNCTION public.hims_settle_insurance_claim(
    p_claim_id uuid,
    p_received_amount numeric,
    p_bank_acc_id uuid -- الحساب البنكي/الخزينة الذي تم التحصيل فيه
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_claim RECORD;
    v_je_id uuid;
    v_org_id uuid;
    v_insurance_receivable_acc uuid;
    v_description text;
BEGIN
    SELECT * INTO v_claim FROM public.hims_insurance_claims WHERE id = p_claim_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '⚠️ المطالبة التأمينية غير موجودة.';
    END IF;

    v_org_id := v_claim.organization_id;

    -- جلب حساب ذمم التأمين من إعدادات HIMS أو من SYSTEM_ACCOUNTS
    SELECT default_insurance_account INTO v_insurance_receivable_acc FROM public.hims_settings WHERE organization_id = v_org_id;
    IF v_insurance_receivable_acc IS NULL THEN
        -- Fallback to general system account if HIMS specific not set
        SELECT id INTO v_insurance_receivable_acc FROM public.accounts WHERE code = '122101' AND organization_id = v_org_id LIMIT 1; -- HIMS_INSURANCE_RECEIVABLE
        IF v_insurance_receivable_acc IS NULL THEN
            RAISE EXCEPTION '⚠️ لم يتم تحديد حساب ذمم التأمين في إعدادات HIMS أو في دليل الحسابات.';
        END IF;
    END IF;

    -- 1. إنشاء قيد اليومية لتحصيل المبلغ
    v_description := format('تحصيل مطالبة تأمين رقم %s من شركة التأمين %s', v_claim.batch_reference, (SELECT name FROM public.customers WHERE id = v_claim.insurance_provider_id));
    
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (CURRENT_DATE, v_description, 'CLAIM-SETTLE-' || substring(v_claim.batch_reference, 7), 'posted', v_org_id, true, p_claim_id, 'hims_insurance_claims')
    RETURNING id INTO v_je_id;

    -- قيد: من ح/ البنك/الخزينة (المبلغ المحصل)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
    VALUES (v_je_id, p_bank_acc_id, p_received_amount, 0, v_org_id, 'تحصيل مبلغ المطالبة التأمينية');

    -- قيد: إلى ح/ ذمم التأمين (تخفيض الذمم)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id, description)
    VALUES (v_je_id, v_insurance_receivable_acc, 0, p_received_amount, v_org_id, 'تخفيض ذمم التأمين');

    -- 2. تحديث حالة المطالبة
    UPDATE public.hims_insurance_claims
    SET status = 'paid', payment_date = CURRENT_DATE, total_collected_amount = p_received_amount
    WHERE id = p_claim_id;

    -- 3. تحديث الفواتير المرتبطة بالمطالبة (اختياري، يمكن أن يكون status = 'paid_by_insurance')
    UPDATE public.hims_billing
    SET payment_status = 'paid_by_insurance'
    WHERE insurance_claim_id = p_claim_id;

    -- 4. إرسال إخطار للمحاسب
    PERFORM public.create_notification_from_sql(
        p_org_id     => v_org_id::uuid, 
        p_user_id    => (SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role = 'accountant' LIMIT 1),
        p_title      => 'تم تحصيل مطالبة تأمين ✅'::text, 
        p_message    => format('تم تحصيل مبلغ %s من مطالبة التأمين رقم %s.', p_received_amount, v_claim.batch_reference)::text,
        p_type       => 'success'::public.notification_type, 
        p_priority   => 'medium'::public.notification_priority, 
        p_action_url => '/hims/insurance-claims'::text,
        p_related_id => p_claim_id
    );

END; $$;

CREATE OR REPLACE FUNCTION public.fn_hims_audit_medical_record()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.chief_complaint IS DISTINCT FROM NEW.chief_complaint) OR (OLD.vital_signs IS DISTINCT FROM NEW.vital_signs) THEN
        INSERT INTO public.security_logs (
            event_type, description, performed_by, organization_id, metadata
        ) VALUES (
            'medical_record_update',
            format('تعديل في البيانات الطبية للزيارة رقم %s للمريض %s', NEW.id, NEW.patient_id),
            auth.uid(),
            NEW.organization_id,
            jsonb_build_object('old_data', OLD.chief_complaint, 'new_data', NEW.chief_complaint)
        );
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 📱 أتمتة إرسال رابط بوابة المريض عند الخروج
CREATE OR REPLACE FUNCTION public.fn_hims_send_discharge_whatsapp()
RETURNS TRIGGER AS $$
DECLARE
    v_patient_name text;
    v_patient_phone text;
    v_hospital_name text;
BEGIN
    -- التدقيق: نرسل الرسالة فقط عند تحول الحالة إلى 'discharged'
    IF (NEW.status = 'discharged' AND OLD.status IS DISTINCT FROM 'discharged') THEN
        SELECT full_name, phone INTO v_patient_name, v_patient_phone 
        FROM public.hims_patients WHERE id = NEW.patient_id;

        SELECT name INTO v_hospital_name FROM public.organizations WHERE id = NEW.organization_id;

        IF v_patient_phone IS NOT NULL AND v_patient_phone != '' THEN
            INSERT INTO public.whatsapp_notification_queue (organization_id, phone_number, message_body, status)
            VALUES (
                NEW.organization_id,
                v_patient_phone,
                format('عزيزي %s، شكراً لثقتكم بمستشفى %s. نتمنى لكم وافر الصحة. يمكنك الآن تحميل تقاريرك الطبية وفواتيرك عبر الرابط التالي: https://portal.tripro.app/visit/%s', 
                       v_patient_name, v_hospital_name, NEW.id),
                'pending'
            );
        END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hims_medical_audit ON public.hims_visits;
CREATE TRIGGER trg_hims_medical_audit
AFTER UPDATE ON public.hims_visits
FOR EACH ROW EXECUTE FUNCTION public.fn_hims_audit_medical_record();

DROP TRIGGER IF EXISTS trg_hims_discharge_whatsapp ON public.hims_visits;
CREATE TRIGGER trg_hims_discharge_whatsapp
AFTER UPDATE ON public.hims_visits
FOR EACH ROW EXECUTE FUNCTION public.fn_hims_send_discharge_whatsapp();

GRANT EXECUTE ON FUNCTION public.hims_finalize_billing(uuid, uuid) TO authenticated;

-- 🩻 اعتماد نتيجة الأشعة وإخطار الطبيب
CREATE OR REPLACE FUNCTION public.hims_complete_radiology(
    p_order_id uuid,
    p_report text,
    p_images text[]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_doctor_user_id uuid;
BEGIN
    SELECT * INTO v_order FROM public.hims_radiology_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION '⚠️ طلب الأشعة غير موجود.'; END IF;

    UPDATE public.hims_radiology_orders 
    SET status = 'completed', report_text = p_report, image_urls = p_images 
    WHERE id = p_order_id;

    SELECT d.profile_id INTO v_doctor_user_id 
    FROM public.hims_visits v JOIN public.hims_doctors d ON v.doctor_id = d.id 
    WHERE v.id = v_order.visit_id;

    IF v_doctor_user_id IS NOT NULL THEN
        PERFORM public.create_notification_from_sql(
            p_org_id     => v_order.organization_id::uuid, 
            p_user_id    => v_doctor_user_id::uuid, 
            p_title      => 'تقرير أشعة جاهز 🩻'::text,
            p_message    => ('تم اعتماد تقرير الأشعة والصور متاحة الآن للزيارة رقم ' || v_order.visit_id)::text,
            p_type       => 'success'::public.notification_type, 
            p_priority   => 'medium'::public.notification_priority, 
            p_action_url => ('/hims/visits/' || v_order.visit_id)::text,
            p_related_id => p_order_id::uuid
        );
    END IF;
END; $$;

-- 💰 محرك تجميع مطالبات التأمين (Insurance Claims Batching)
CREATE OR REPLACE FUNCTION public.hims_create_insurance_batch(
    p_insurance_provider_id uuid,
    p_batch_ref text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_claim_id uuid;
    v_total numeric := 0;
    v_org_id uuid := public.get_my_org();
BEGIN
    -- حساب إجمالي الفواتير غير المطالب بها لشركة التأمين
    SELECT SUM(insurance_covered_amount) INTO v_total
    FROM public.hims_billing
    WHERE insurance_provider_id = p_insurance_provider_id
    AND insurance_claim_id IS NULL
    AND payment_status != 'paid'
    AND organization_id = v_org_id;

    IF v_total IS NULL OR v_total = 0 THEN
        RAISE EXCEPTION '⚠️ لا توجد فواتير معلقة لهذه الشركة لتجميعها حالياً.';
    END IF;

    INSERT INTO public.hims_insurance_claims (
        organization_id, insurance_provider_id, batch_reference, 
        status, total_claim_amount, submission_date
    ) VALUES (
        v_org_id, p_insurance_provider_id, p_batch_ref,
        'submitted', v_total, CURRENT_DATE
    ) RETURNING id INTO v_claim_id;

    -- ربط الفواتير بالمطالبة
    UPDATE public.hims_billing
    SET insurance_claim_id = v_claim_id
    WHERE insurance_provider_id = p_insurance_provider_id
    AND insurance_claim_id IS NULL
    AND payment_status != 'paid'
    AND organization_id = v_org_id;

    RETURN v_claim_id;
END; $$;

-- 📊 إحصائيات الإدارة الاستراتيجية (Strategic Intelligence)
CREATE OR REPLACE FUNCTION public.get_hims_executive_stats(p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'totalPatients', (SELECT COUNT(*) FROM public.hims_patients WHERE organization_id = p_org_id),
        'occupancyRate', (SELECT COALESCE(ROUND((COUNT(id) FILTER (WHERE status = 'occupied')::numeric / NULLIF(COUNT(id), 0) * 100), 2), 0) FROM public.hims_beds WHERE organization_id = p_org_id),
        'dailyRevenue', (SELECT COALESCE(SUM(total_amount), 0) FROM public.hims_billing WHERE organization_id = p_org_id AND created_at >= CURRENT_DATE),
        'insuranceReceivables', (SELECT COALESCE(SUM(insurance_covered_amount), 0) FROM public.hims_billing WHERE organization_id = p_org_id AND payment_status != 'paid'),
        'pendingLabs', (SELECT COUNT(*) FROM public.hims_lab_orders WHERE organization_id = p_org_id AND status = 'pending'),
        'criticalCases', (SELECT COUNT(*) FROM public.hims_visits WHERE organization_id = p_org_id AND visit_type = 'emergency' AND triage_level = 'level_1_resuscitation' AND status != 'discharged'),
        -- [تحديث V52.1] دمج محرك التنبؤ بالتدفق النقدي في الإحصائيات الاستراتيجية
        'cashflowForecast', (SELECT public.hims_get_cashflow_projection(p_org_id)),
        'revenueByDept', (
            SELECT jsonb_agg(d) FROM (
                SELECT department_name as name, total_revenue as value 
                FROM public.v_hims_dept_profitability 
                WHERE organization_id = p_org_id
                ORDER BY total_revenue DESC
            ) d 
        )
    ) INTO v_result;
    
    RETURN v_result;
END; $$;

-- �️ جدول مناوبات الطاقم الطبي (HIMS Staff Duty Roster)
-- الغرض: تنظيم تواجد الأطباء والتمريض لضمان سرعة الاستجابة
CREATE TABLE IF NOT EXISTS public.hims_staff_roster (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    staff_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- يمكن أن يكون طبيب أو ممرض
    shift_start timestamptz NOT NULL,
    shift_end timestamptz NOT NULL,
    department_id uuid REFERENCES public.hims_wards(id) ON DELETE SET NULL,
    role_on_duty text, -- 'on_call', 'in_house', 'emergency_lead'
    is_backup boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- 🔍 دالة جلب المناوبين حالياً (Who is on Duty?)
CREATE OR REPLACE FUNCTION public.hims_get_current_on_duty(p_dept_id uuid DEFAULT NULL)
RETURNS TABLE (staff_name text, role text, contact text, dept_name text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.full_name,
        r.role_on_duty,
        COALESCE(p.avatar_url, 'No Contact'), -- أو رقم الهاتف من جدول الموظفين
        w.name
    FROM public.hims_staff_roster r
    JOIN public.profiles p ON r.staff_id = p.id
    LEFT JOIN public.hims_wards w ON r.department_id = w.id
    WHERE r.organization_id = public.get_my_org()
    AND now() BETWEEN r.shift_start AND r.shift_end
    AND (p_dept_id IS NULL OR r.department_id = p_dept_id);
END; $$;

-- 📄 محرك تجميع بيانات الفاتورة الفاخرة (Luxury Invoice Aggregator)
-- المهمة: جلب كل شاردة وواردة في زيارة المريض (كشف، تحاليل، أشعة، إقامة، أدوية) في هيكل واحد للطباعة
CREATE OR REPLACE FUNCTION public.hims_get_luxury_invoice_data(p_visit_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'hospital_info', (SELECT jsonb_build_object('name', name, 'logo', logo_url, 'vat', vat_number) FROM public.organizations WHERE id = public.get_my_org()),
        'patient_info', (SELECT jsonb_build_object('name', p.full_name, 'file_no', p.national_id, 'blood', p.blood_type) 
                         FROM public.hims_patients p JOIN public.hims_visits v ON p.id = v.patient_id WHERE v.id = p_visit_id),
        'visit_details', (SELECT jsonb_build_object('date', check_in_time, 'type', visit_type, 'doctor', pr.full_name) 
                          FROM public.hims_visits v JOIN public.hims_doctors d ON v.doctor_id = d.id 
                          JOIN public.profiles pr ON d.profile_id = pr.id WHERE v.id = p_visit_id),
        'billing_items', (
            SELECT jsonb_agg(item) FROM (
                SELECT item_type as category, description, quantity, unit_price, total_price 
                FROM public.hims_billing_items 
                WHERE billing_id = (SELECT id FROM public.hims_billing WHERE visit_id = p_visit_id)
                ORDER BY item_type
            ) item
        ),
        'financial_summary', (SELECT jsonb_build_object('total', total_amount, 'insurance', insurance_covered_amount, 'net_payable', (total_amount - insurance_covered_amount)) 
                              FROM public.hims_billing WHERE visit_id = p_visit_id),
        'qr_verification_code', (SELECT public.hims_get_document_qr_data(id, 'billing') FROM public.hims_billing WHERE visit_id = p_visit_id)
    ) INTO v_result;

    RETURN v_result;
END; $$;

-- 🛡️ منع صرف الأدوية منتهية الصلاحية (Double-Check Trigger)
-- هذا المشغل يعمل كخط دفاع أخير قبل خروج الدواء من الصيدلية
-- (موجود بالفعل داخل دالة hims_dispense_prescription ولكننا نعززه هنا كقاعدة بيانات عامة)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_hims_prevent_expired_dispensing') THEN
        ALTER TABLE public.products ADD CONSTRAINT chk_hims_prevent_expired_dispensing 
        CHECK (NOT (item_type = 'STOCK' AND expiry_date < CURRENT_DATE AND stock > 0));
    END IF;
END $$;

-- 🧪 نظام تتبع عينات المختبر (Lab Specimen Tracking System)
-- الغرض: منع فقدان العينات وضمان تتبع سلسلة الحيازة (Chain of Custody)
CREATE TABLE IF NOT EXISTS public.hims_lab_specimens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lab_order_id uuid REFERENCES public.hims_lab_orders(id) ON DELETE CASCADE,
    specimen_type text NOT NULL, -- دم، بول، مسحة، إلخ
    barcode_id text UNIQUE,
    status text DEFAULT 'pending_collection', -- pending_collection, collected, received_in_lab, processing, completed
    collected_at timestamptz,
    collected_by uuid REFERENCES public.profiles(id),
    received_at timestamptz,
    received_by uuid REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now()
);

-- 🔍 دالة تحديث حالة العينة (Specimen Workflow)
CREATE OR REPLACE FUNCTION public.hims_update_specimen_status(p_specimen_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.hims_lab_specimens SET 
        status = p_status,
        collected_at = CASE WHEN p_status = 'collected' THEN now() ELSE collected_at END,
        collected_by = CASE WHEN p_status = 'collected' THEN auth.uid() ELSE collected_by END,
        received_at = CASE WHEN p_status = 'received_in_lab' THEN now() ELSE received_at END,
        received_by = CASE WHEN p_status = 'received_in_lab' THEN auth.uid() ELSE received_by END
    WHERE id = p_specimen_id;
END; $$;

-- 👩‍⚕️ مديول مهام التمريض والتمريض الذكي (Intelligent Nursing Tasks)
CREATE TABLE IF NOT EXISTS public.hims_nurse_tasks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id uuid REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    task_type text, -- 'vitals', 'medication', 'dressing', 'lab_collection'
    description text,
    due_at timestamptz,
    completed_at timestamptz,
    completed_by uuid REFERENCES public.profiles(id),
    status text DEFAULT 'pending', -- pending, completed, missed
    priority text DEFAULT 'normal', -- normal, urgent, emergency
    created_at timestamptz DEFAULT now()
);

-- 🚀 محرك الأتمتة السريرية (Clinical Task Automator)
-- المهمة: إنشاء مهام روتينية آلياً للمريض المنوم
CREATE OR REPLACE FUNCTION public.hims_create_routine_clinical_tasks(p_visit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. مهام قياس العلامات الحيوية (كل 8 ساعات للـ 24 ساعة القادمة)
    INSERT INTO public.hims_nurse_tasks (visit_id, task_type, description, due_at, priority)
    SELECT 
        p_visit_id, 
        'vitals', 
        'قياس العلامات الحيوية الروتينية (الضغط، الحرارة، النبض)', 
        now() + (i * interval '8 hours'),
        'normal'
    FROM generate_series(1, 3) i;

    -- 2. مهمة متابعة الطبيب المقيم صباحاً
    INSERT INTO public.hims_nurse_tasks (visit_id, task_type, description, due_at, priority)
    VALUES (p_visit_id, 'consultation', 'تجهيز المريض لمرور الطبيب الصباحي', date_trunc('day', now() + interval '1 day') + interval '8 hours', 'high');
END; $$;

-- 🛡️ مشغل التنبيه التلقائي للمهام المتأخرة (Nursing Delay Alert)
CREATE OR REPLACE VIEW public.v_hims_overdue_nurse_tasks AS
SELECT 
    t.id as task_id,
    p.full_name as patient_name,
    w.name as ward_name,
    t.description,
    t.due_at,
    EXTRACT(EPOCH FROM (now() - t.due_at))/60 as delay_minutes
FROM public.hims_nurse_tasks t
JOIN public.hims_visits v ON t.visit_id = v.id
JOIN public.hims_patients p ON v.patient_id = p.id
LEFT JOIN public.hims_beds b ON v.id = b.current_visit_id
LEFT JOIN public.hims_wards w ON b.ward_id = w.id
WHERE t.status = 'pending' AND t.due_at < now();

-- 📄 ربط مهام التمريض بشاشة الدخول (Auto-Trigger on Admission)
CREATE OR REPLACE FUNCTION public.trg_hims_on_admission_tasks()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.visit_type = 'inpatient' AND (OLD.visit_type IS DISTINCT FROM NEW.visit_type OR OLD.admission_date IS NULL) THEN
        PERFORM public.hims_create_routine_clinical_tasks(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hims_admission_tasks ON public.hims_visits;
CREATE TRIGGER trg_hims_admission_tasks
AFTER UPDATE OF visit_type, admission_date ON public.hims_visits
FOR EACH ROW EXECUTE FUNCTION public.trg_hims_on_admission_tasks();

-- �� دالة أتمتة رسوم الإقامة اليومية (Daily Bed Charges Auto-Generation)
-- يتم استدعاؤها عبر Cron Job أو يدوياً لتوليد بنود الفاتورة لكل مريض منوم
CREATE OR REPLACE FUNCTION public.hims_apply_daily_bed_charges(p_org_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid := COALESCE(p_org_id, public.get_my_org());
    v_bed_record RECORD;
    v_count integer := 0;
BEGIN
    -- البحث عن كافة الأسرة المشغولة حالياً
    FOR v_bed_record IN 
        SELECT b.*, v.patient_id 
        FROM public.hims_beds b
        JOIN public.hims_visits v ON b.current_visit_id = v.id
        WHERE b.status = 'occupied' 
        AND b.organization_id = v_org_id
        AND v.status = 'in_consultation' -- أو أي حالة تعني أنه لا يزال منوماً
    LOOP
        -- إضافة بند رسوم إقامة للفاتورة (لتاريخ اليوم)
        -- تمنع الدالة hims_add_billing_item التكرار إذا تم استدعاؤها لنفس اليوم (تحتاج منطق فحص بسيط)
        IF NOT EXISTS (
            SELECT 1 FROM public.hims_billing_items bi
            JOIN public.hims_billing b ON bi.billing_id = b.id
            WHERE b.visit_id = v_bed_record.current_visit_id
            AND bi.item_type = 'accommodation'
            AND bi.created_at::date = CURRENT_DATE
        ) THEN
            PERFORM public.hims_add_billing_item(
                v_bed_record.current_visit_id, 
                'accommodation', 
                'رسوم إقامة سرير رقم: ' || v_bed_record.bed_number, 
                1, 
                v_bed_record.daily_rate
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;
    RETURN v_count;
END; $$;

-- 🩸 دالة طلب نقل دم (Blood Request Bridge)
CREATE OR REPLACE FUNCTION public.hims_request_blood(
    p_visit_id uuid,
    p_blood_type text,
    p_units numeric,
    p_urgency text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.security_logs (event_type, description, organization_id, metadata)
    VALUES (
        'blood_request',
        format('طلب نقل دم (%s وحدات فصيلة %s) للزيارة %s', p_units, p_blood_type, p_visit_id),
        public.get_my_org(),
        jsonb_build_object('visit_id', p_visit_id, 'blood_type', p_blood_type, 'units', p_units, 'urgency', p_urgency)
    );
END; $$;

-- 📄 محرك بيانات خلاصة الخروج (Discharge Summary Data Engine)
CREATE OR REPLACE FUNCTION public.get_patient_discharge_summary(p_visit_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (
        SELECT jsonb_build_object(
            'patient', (SELECT to_jsonb(p) FROM public.hims_patients p JOIN public.hims_visits v ON p.id = v.patient_id WHERE v.id = p_visit_id),
            'visit', (SELECT to_jsonb(v) FROM public.hims_visits v WHERE v.id = p_visit_id),
            'clinical_notes', (SELECT jsonb_agg(cn) FROM public.hims_clinical_notes cn WHERE cn.visit_id = p_visit_id),
            'diagnosis', (SELECT diagnosis FROM public.hims_prescriptions WHERE visit_id = p_visit_id ORDER BY created_at DESC LIMIT 1),
            'vitals', (SELECT vital_signs FROM public.hims_visits WHERE id = p_visit_id),
            'medications', (SELECT jsonb_agg(m) FROM public.hims_prescriptions pr, jsonb_array_elements(pr.medications) m WHERE pr.visit_id = p_visit_id),
            'surgeries', (SELECT jsonb_agg(s) FROM public.hims_surgeries s WHERE s.visit_id = p_visit_id AND s.status = 'completed'),
            'lab_results', (SELECT jsonb_agg(jsonb_build_object('test', t.test_name, 'result', lo.result_value)) 
                            FROM public.hims_lab_orders lo 
                            JOIN public.hims_lab_tests t ON lo.test_id = t.id 
                            WHERE lo.visit_id = p_visit_id AND lo.status = 'completed')
        )
    );
END; $$;

-- 📊 رؤية التاريخ الطبي للعلامات الحيوية (Vitals History Charting)
CREATE OR REPLACE VIEW public.v_hims_patient_vitals_history AS
SELECT 
    patient_id,
    created_at as record_date,
    (vital_signs->>'temp')::numeric as temperature,
    (vital_signs->>'pulse')::numeric as heart_rate,
    organization_id
FROM public.hims_visits
WHERE vital_signs IS NOT NULL AND vital_signs != '{}'::jsonb;

-- 🩸 رادار مراقبة مخزون بنك الدم (Blood Bank Monitoring)
CREATE OR REPLACE VIEW public.v_hims_blood_bank_inventory AS
SELECT 
    donor.blood_type,
    COUNT(don.id) FILTER (WHERE don.status = 'available' AND don.expiry_date > CURRENT_DATE) as available_units,
    COUNT(don.id) FILTER (WHERE don.status = 'available' AND don.expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')) as expiring_soon,
    COUNT(don.id) FILTER (WHERE don.status = 'available' AND don.expiry_date < CURRENT_DATE) as expired_units,
    don.organization_id
FROM public.hims_blood_donations don
JOIN public.hims_blood_donors donor ON don.donor_id = donor.id
GROUP BY donor.blood_type, don.organization_id;

-- 💰 رؤية تحليل مصادر الإيرادات الطبية (Revenue Stream Analysis)
CREATE OR REPLACE VIEW public.v_hims_revenue_breakdown AS
SELECT 
    v.organization_id,
    EXTRACT(MONTH FROM v.created_at) as month,
    SUM(CASE WHEN items.item_type = 'consultation' THEN items.total_price ELSE 0 END) as consultation_revenue,
    SUM(CASE WHEN items.item_type = 'pharmacy' THEN items.total_price ELSE 0 END) as pharmacy_revenue,
    SUM(CASE WHEN items.item_type = 'lab' THEN items.total_price ELSE 0 END) as laboratory_revenue,
    SUM(CASE WHEN items.item_type = 'accommodation' THEN items.total_price ELSE 0 END) as bed_revenue,
    SUM(items.total_price) as total_gross_revenue
FROM public.hims_visits v
JOIN public.hims_billing b ON v.id = b.visit_id
LEFT JOIN public.hims_billing_items items ON b.id = items.billing_id
GROUP BY v.organization_id, month;
-- 🛠️ دالة إضافة بند للفاتورة (Billing Item Helper)
CREATE OR REPLACE FUNCTION public.hims_add_billing_item(
    p_visit_id uuid,
    p_type text,
    p_desc text,
    p_qty numeric,
    p_price numeric
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bill_id uuid;
    v_org_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.hims_visits WHERE id = p_visit_id;
    
    -- التأكد من وجود رأس فاتورة للزيارة
    INSERT INTO public.hims_billing (visit_id, organization_id, patient_id)
    SELECT id, organization_id, patient_id FROM public.hims_visits WHERE id = p_visit_id
    ON CONFLICT (visit_id) DO NOTHING;
    
    SELECT id INTO v_bill_id FROM public.hims_billing WHERE visit_id = p_visit_id;

    INSERT INTO public.hims_billing_items (billing_id, organization_id, item_type, description, quantity, unit_price)
    VALUES (v_bill_id, v_org_id, p_type, p_desc, p_qty, p_price);

    -- تحديث الإجمالي في الرأس
    UPDATE public.hims_billing 
    SET total_amount = (SELECT SUM(total_price) FROM public.hims_billing_items WHERE billing_id = v_bill_id)
    WHERE id = v_bill_id;
END; $$;

-- 🚨 رادار الطوارئ لمراقبة زمن الانتظار (Emergency Wait-Time Monitor)
DROP VIEW IF EXISTS public.v_hims_emergency_triage_monitor CASCADE;
CREATE OR REPLACE VIEW public.v_hims_emergency_triage_monitor AS
SELECT 
    v.id as id,
    p.full_name as patient_name,
    v.triage_level,
    v.chief_complaint,
    v.check_in_time,
    EXTRACT(EPOCH FROM (now() - v.check_in_time))/60 as wait_time_minutes,
    CASE 
        WHEN v.triage_level = 'level_1_resuscitation' AND EXTRACT(EPOCH FROM (now() - v.check_in_time))/60 > 0 THEN 'IMMEDIATE_DANGER 🔴'
        WHEN v.triage_level = 'level_2_emergent' AND EXTRACT(EPOCH FROM (now() - v.check_in_time))/60 > 15 THEN 'CRITICAL_DELAY 🟠'
        ELSE 'STABLE 🟢'
    END as alert_status,
    v.organization_id
FROM public.hims_visits v
JOIN public.hims_patients p ON v.patient_id = p.id
WHERE v.visit_type = 'emergency' AND v.status NOT IN ('discharged', 'completed');

-- 📊 رؤية السجل الطبي الموحد للمريض (Timeline View)
CREATE OR REPLACE VIEW public.v_hims_patient_medical_timeline AS
SELECT 
    patient_id, 
    created_at, 
    'visit' as event_type, 
    'زيارة ' || visit_type as description,
    organization_id
FROM public.hims_visits
UNION ALL
SELECT 
    v.patient_id, 
    cn.created_at, 
    'clinical_note' as event_type, 
    'ملاحظة طبيب: ' || cn.assessment,
    cn.organization_id
FROM public.hims_clinical_notes cn
JOIN public.hims_visits v ON cn.visit_id = v.id
UNION ALL
SELECT 
    v.patient_id, 
    pr.created_at, 
    'prescription' as event_type, 
    'وصفة طبية - تشخيص: ' || pr.diagnosis,
    pr.organization_id
FROM public.hims_prescriptions pr
JOIN public.hims_visits v ON pr.visit_id = v.id;

GRANT SELECT ON public.v_hims_emergency_triage_monitor TO authenticated;
GRANT SELECT ON public.v_hims_patient_medical_timeline TO authenticated;
GRANT EXECUTE ON FUNCTION public.hims_add_billing_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.hims_complete_surgery_and_consume(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hims_complete_lab_with_inventory(uuid, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hims_complete_radiology TO authenticated;
GRANT EXECUTE ON FUNCTION public.hims_create_insurance_batch TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_discharge_summary TO authenticated;
GRANT SELECT ON public.v_hims_patient_vitals_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.hims_dispense_prescription(uuid, uuid) TO authenticated;

-- ================================================================
-- 🧪 اختبار وحدة: دورة حياة المستشفى الكاملة (Full HIMS Lifecycle Test)
-- ================================================================

CREATE OR REPLACE FUNCTION public.unit_test_hims_full_lifecycle()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; v_patient_id uuid; v_doctor_id uuid; v_visit_id uuid;
    v_bed_id uuid; v_lab_id uuid; v_presc_id uuid; v_bill_id uuid;
    v_cash_acc uuid; v_results jsonb := '[]'::jsonb; v_err_msg text;
    v_wh_id uuid; v_prod_id uuid;
BEGIN
    -- 1. تجهيز المنظمة والحسابات (البيئة الاختبارية)
    v_org_id := (SELECT id FROM public.organizations LIMIT 1);
    IF v_org_id IS NULL THEN RAISE EXCEPTION '⚠️ فشل الاختبار: لا توجد منظمة في النظام.'; END IF;
    
    v_cash_acc := (SELECT id FROM public.accounts WHERE code = '1231' AND organization_id = v_org_id LIMIT 1);
    IF v_cash_acc IS NULL THEN 
        INSERT INTO public.accounts (code, name, type, organization_id) 
        VALUES ('1231', 'خزينة الاختبار', 'asset', v_org_id) RETURNING id INTO v_cash_acc;
    END IF;

    v_wh_id := (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1);

    -- 🛡️ إنشاء منتج اختبار لضمان عمل دورة الصيدلية
    SELECT id INTO v_prod_id FROM public.products WHERE name = 'Panadol Test' AND organization_id = v_org_id LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, sales_price, organization_id, product_type)
        VALUES ('Panadol Test', 50, v_org_id, 'STOCK')
        RETURNING id INTO v_prod_id;
    END IF;

    -- 📥 تسجيل رصيد افتتاحي لكي يراه المحرك الشامل للمخزون ويمنع تصفيره عند إعادة الاحتساب
    DELETE FROM public.opening_inventories WHERE product_id = v_prod_id;
    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id)
    VALUES (v_prod_id, v_wh_id, 100, 20, v_org_id);
    
    PERFORM public.recalculate_stock_rpc(v_org_id);

    RAISE NOTICE '🚀 بدء اختبار دورة حياة المستشفى...';

    -- 2. تسجيل مريض جديد (Integration with Customers)
    INSERT INTO public.hims_patients (organization_id, full_name, national_id, dob, gender, blood_type)
    VALUES (v_org_id, 'مريض اختبار شامل', 'TEST-PATIENT-' || gen_random_uuid(), '1990-01-01', 'male', 'AB+')
    RETURNING id INTO v_patient_id;
    v_results := v_results || jsonb_build_object('step', 'Patient Registration', 'status', 'SUCCESS');

    -- 3. إنشاء طبيب
    INSERT INTO public.hims_doctors (organization_id, specialization, consultation_fee, profile_id)
    VALUES (v_org_id, 'طبيب اختبار', 200, auth.uid())
    ON CONFLICT (profile_id) DO UPDATE SET consultation_fee = 200
    RETURNING id INTO v_doctor_id;

    -- 4. فتح زيارة طوارئ مع فرز (Triage)
    INSERT INTO public.hims_visits (organization_id, patient_id, doctor_id, visit_type, triage_level, chief_complaint, status)
    VALUES (v_org_id, v_patient_id, v_doctor_id, 'emergency', 'level_2_emergent', 'ألم شديد في الصدر', 'triaged')
    RETURNING id INTO v_visit_id;
    v_results := v_results || jsonb_build_object('step', 'Emergency Triage', 'status', 'SUCCESS');

    -- 5. طلب مختبر واعتماده مع خصم مستلزمات
    INSERT INTO public.hims_lab_orders (organization_id, visit_id, status)
    VALUES (v_org_id, v_visit_id, 'pending') RETURNING id INTO v_lab_id;
    
    PERFORM public.hims_complete_lab_with_inventory(v_lab_id, 'قراءة طبيعية', '[]'::jsonb);
    v_results := v_results || jsonb_build_object('step', 'Lab Processing', 'status', 'SUCCESS');

    -- 6. كتابة وصفة طبية (Prescription) وصرفها
    INSERT INTO public.hims_prescriptions (organization_id, visit_id, doctor_id, diagnosis, medications)
    VALUES (v_org_id, v_visit_id, v_doctor_id, 'استقرار الحالة', jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'drug_name', 'Panadol Test', 'qty', 2, 'dosage', '500mg')))
    RETURNING id INTO v_presc_id;

    -- تنفيذ الصرف الفعلي لتحديث المخزن وربط التكلفة بالفاتورة
    PERFORM public.hims_dispense_prescription(v_presc_id, v_wh_id);
    v_results := v_results || jsonb_build_object('step', 'Pharmacy Dispensing', 'status', 'SUCCESS');

    -- 7. تنويم المريض في سرير (Admission)
    SELECT id INTO v_bed_id FROM public.hims_beds WHERE organization_id = v_org_id AND status = 'available' LIMIT 1;
    IF v_bed_id IS NOT NULL THEN
        PERFORM public.hims_admit_patient(v_visit_id, v_bed_id);
        v_results := v_results || jsonb_build_object('step', 'Inpatient Admission', 'status', 'SUCCESS');
    END IF;

    -- 8. تسجيل إعطاء الدواء من قبل التمريض (MAR)
    PERFORM public.hims_log_medication_administration(v_visit_id, 'Aspirin', '100mg');
    v_results := v_results || jsonb_build_object('step', 'Medication Admin (MAR)', 'status', 'SUCCESS');

    -- 9. إجراء خروج المريض (Discharge) وتوليد الفاتورة آلياً
    -- سنقوم يدوياً بتعديل تاريخ الدخول ليوم سابق لنضمن حساب تكلفة إقامة
    UPDATE public.hims_visits SET admission_date = now() - interval '1 day' WHERE id = v_visit_id;
    
    PERFORM public.hims_process_discharge(v_visit_id);
    v_results := v_results || jsonb_build_object('step', 'Patient Discharge & Auto-Billing', 'status', 'SUCCESS');

    -- 10. التحقق من الفاتورة واعتمادها مالياً (GL Integration)
    SELECT id INTO v_bill_id FROM public.hims_billing WHERE visit_id = v_visit_id;
    
    IF v_bill_id IS NOT NULL THEN
        PERFORM public.hims_finalize_billing(v_bill_id, v_cash_acc);
        v_results := v_results || jsonb_build_object('step', 'Accounting Finalization (JE Created)', 'status', 'SUCCESS');
    ELSE
        RAISE NOTICE '⚠️ تحذير: لم يتم العثور على فاتورة للزيارة.';
    END IF;

    -- 11. التحقق النهائي من توازن القيود في الأستاذ العام
    IF EXISTS (
        SELECT 1 FROM public.journal_entries je
        JOIN public.journal_lines jl ON je.id = jl.journal_entry_id
        WHERE je.related_document_id = v_bill_id
        GROUP BY je.id HAVING SUM(debit) = SUM(credit) AND SUM(debit) > 0
    ) THEN
        v_results := v_results || jsonb_build_object('step', 'GL Balance Verification', 'status', 'PASSED ✅');
    ELSE
        v_results := v_results || jsonb_build_object('step', 'GL Balance Verification', 'status', 'FAILED ❌');
    END IF;

    -- تنظيف بيانات الاختبار (اختياري)
    -- DELETE FROM public.hims_patients WHERE id = v_patient_id;

    RETURN jsonb_build_object(
        'test_name', 'HIMS Lifecycle Integration Test',
        'timestamp', now(),
        'summary', v_results
    );
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    RETURN jsonb_build_object(
        'test_name', 'HIMS Lifecycle Integration Test',
        'status', 'CRITICAL_FAILURE',
        'error', v_err_msg
    );
END; $$;

-- منح الصلاحية لتشغيل الاختبار
GRANT EXECUTE ON FUNCTION public.unit_test_hims_full_lifecycle() TO authenticated;

-- ملاحظة للمحاسب: يمكنك الآن تشغيل الاختبار عبر:
-- SELECT public.unit_test_hims_full_lifecycle();