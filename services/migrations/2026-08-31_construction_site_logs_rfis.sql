-- ==============================================================================
-- 🏗️ TriPro ERP - منظومة يوميات الموقع الميدانية وطلبات الاستفسار والاعتمادات الهندسية
-- Construction Suite: Daily Site Diary, RFIs & Engineering Submittals
-- التاريخ: 2026-08-31
-- ==============================================================================

-- 1. جدول يوميات وسجلات الموقع الميدانية (Daily Site Logs)
CREATE TABLE IF NOT EXISTS public.project_daily_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    weather_condition text DEFAULT 'مشمس ومعتدل',
    temperature text,
    site_condition text DEFAULT 'طبيعي - العمل منتظم',
    workforce jsonb DEFAULT '[]'::jsonb, -- [{ trade: 'حدادين مسلح', count: 12, hours: 8, overtime: 2 }]
    equipment jsonb DEFAULT '[]'::jsonb, -- [{ name: 'حفار كاتربيلر', count: 2, hours: 7, status: 'عاملة' }]
    work_executed jsonb DEFAULT '[]'::jsonb, -- [{ boq_item: 'صب خرسانة مسلحة', location: 'المبنى A - الدور الأول', qty: 45, unit: 'م3' }]
    materials_received jsonb DEFAULT '[]'::jsonb, -- [{ material: 'حديد تسليح 16مم', qty: 15, unit: 'طن', supplier: 'عز الدخيلة' }]
    safety_incidents text,
    work_delays_and_issues text,
    visitors_notes text,
    site_engineer_name text,
    status text DEFAULT 'SUBMITTED', -- DRAFT, SUBMITTED, APPROVED_BY_PM
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. جدول طلبات المعلومات الهندسية (Requests For Information - RFIs)
CREATE TABLE IF NOT EXISTS public.project_rfis (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    rfi_number text NOT NULL,
    subject text NOT NULL,
    discipline text DEFAULT 'مدني / إنشائي', -- إنشائي، معماري، ميكانيكا، كهرباء، صحي، مساحة
    specification_reference text,
    drawing_reference text,
    cost_impact boolean DEFAULT false,
    cost_impact_amount numeric(15,2) DEFAULT 0,
    schedule_impact boolean DEFAULT false,
    schedule_impact_days integer DEFAULT 0,
    priority text DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, URGENT
    question_description text NOT NULL,
    proposed_solution text,
    requested_by text,
    required_response_date date,
    status text DEFAULT 'OPEN', -- OPEN, UNDER_REVIEW, ANSWERED, CLOSED, VOID
    official_reply text,
    replied_by text,
    reply_date date,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. جدول تقديمات واعتمادات المواد والرسومات التنفيذية (Engineering Submittals)
CREATE TABLE IF NOT EXISTS public.project_submittals (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    submittal_number text NOT NULL,
    submittal_type text DEFAULT 'MATERIAL', -- MATERIAL (عينة مادة), SHOP_DRAWING (رسم تنفيذي), METHOD_STATEMENT (طريقة تنفيذ), PREQUALIFICATION (اعتماد مقاول/مورد)
    title text NOT NULL,
    discipline text DEFAULT 'مدني / إنشائي',
    boq_item_reference text,
    manufacturer_or_supplier text,
    submission_date date NOT NULL DEFAULT CURRENT_DATE,
    required_approval_date date,
    review_status text DEFAULT 'UNDER_REVIEW', -- UNDER_REVIEW, APPROVED_A, APPROVED_WITH_COMMENTS_B, REVISE_AND_RESUBMIT_C, REJECTED_D
    consultant_comments text,
    reviewed_by text,
    review_date date,
    revision_number integer DEFAULT 0,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- فهارس الأداء السريع
CREATE INDEX IF NOT EXISTS idx_p_daily_logs_proj ON public.project_daily_logs(project_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_p_daily_logs_org ON public.project_daily_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_p_rfis_proj ON public.project_rfis(project_id, rfi_number);
CREATE INDEX IF NOT EXISTS idx_p_rfis_org ON public.project_rfis(organization_id);
CREATE INDEX IF NOT EXISTS idx_p_submittals_proj ON public.project_submittals(project_id, submittal_number);
CREATE INDEX IF NOT EXISTS idx_p_submittals_org ON public.project_submittals(organization_id);

-- تفعيل سياسات الأمان RLS
ALTER TABLE public.project_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_submittals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "daily_logs_org_policy" ON public.project_daily_logs;
    CREATE POLICY "daily_logs_org_policy" ON public.project_daily_logs
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "rfis_org_policy" ON public.project_rfis;
    CREATE POLICY "rfis_org_policy" ON public.project_rfis
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "submittals_org_policy" ON public.project_submittals;
    CREATE POLICY "submittals_org_policy" ON public.project_submittals
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;
