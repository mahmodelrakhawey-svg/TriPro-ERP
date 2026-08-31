-- ==============================================================================
-- 👔 TriPro ERP - الحزمة المتقدمة للموارد البشرية والرواتب (HR & Payroll Advanced Suite)
-- Leaves & Balances, End of Service Clearance, Attendance & Overtime
-- التاريخ: 2026-08-31
-- ==============================================================================

-- 1. جدول أرصدة إجازات الموظفين السنوية (Employee Leave Balances)
CREATE TABLE IF NOT EXISTS public.hr_leave_balances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL,
    fiscal_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    annual_leave_allowance numeric(5,2) NOT NULL DEFAULT 21, -- رصيد الإجازة السنوية المستحق (مثال 21 أو 30 يوم)
    used_days numeric(5,2) NOT NULL DEFAULT 0, -- الأيام المستهلكة
    remaining_days numeric(5,2) NOT NULL DEFAULT 21, -- الرصيد المتبقي
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT unique_emp_year_balance UNIQUE (organization_id, employee_id, fiscal_year)
);

-- 2. جدول طلبات وسجلات الإجازات (Leave Requests)
CREATE TABLE IF NOT EXISTS public.hr_leave_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL,
    leave_type text NOT NULL, -- ANNUAL (سنوية مدفوعة), SICK (مرضية), CASUAL (عارضة), UNPAID (بدون راتب), HAJJ (حج), MATERNITY (أمومة)
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_days numeric(5,2) NOT NULL DEFAULT 1,
    is_paid boolean DEFAULT true,
    reason text,
    status text DEFAULT 'PENDING', -- PENDING (قيد المراجعة), APPROVED (معتمدة), REJECTED (مرفوضة)
    approved_by text,
    approval_date date,
    rejection_reason text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. جدول مخالصات ومكافأة نهاية الخدمة (End of Service Settlements)
CREATE TABLE IF NOT EXISTS public.hr_end_of_service_settlements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    settlement_number text NOT NULL,
    employee_id uuid NOT NULL,
    joining_date date NOT NULL,
    termination_date date NOT NULL,
    service_years numeric(5,2) NOT NULL DEFAULT 0,
    service_months integer NOT NULL DEFAULT 0,
    service_days integer NOT NULL DEFAULT 0,
    last_basic_salary numeric(15,2) NOT NULL DEFAULT 0,
    termination_type text NOT NULL, -- RESIGNATION (استقالة الموظف), COMPANY_TERMINATION (إنهاء عقد من الشركة), CONTRACT_EXPIRY (انتهاء مدة العقد), DEATH_DISABILITY (وفاة/عجز)
    gratuity_amount numeric(15,2) NOT NULL DEFAULT 0, -- قيمة مكافأة نهاية الخدمة
    leave_compensation_amount numeric(15,2) NOT NULL DEFAULT 0, -- بدل رصيد الإجازات المتبقي
    outstanding_advances numeric(15,2) NOT NULL DEFAULT 0, -- استقطاع السلف والقروض القائمة
    other_additions numeric(15,2) NOT NULL DEFAULT 0, -- مستحقات إضافية / مكافآت
    other_deductions numeric(15,2) NOT NULL DEFAULT 0, -- استقطاعات أخرى
    final_net_settlement numeric(15,2) NOT NULL DEFAULT 0, -- صافي المخالصة المستحق
    payment_status text DEFAULT 'PENDING', -- PENDING, PAID, CANCELLED
    settlement_date date NOT NULL DEFAULT CURRENT_DATE,
    approved_by text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. جدول سجل الحضور والانصراف والبصمة (Attendance & Overtime Logs)
CREATE TABLE IF NOT EXISTS public.hr_attendance_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL,
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    check_in_time time,
    check_out_time time,
    late_minutes integer NOT NULL DEFAULT 0,
    overtime_hours numeric(5,2) NOT NULL DEFAULT 0,
    status text DEFAULT 'PRESENT', -- PRESENT (حاضر), ABSENT (غائب), ON_LEAVE (إجازة), LATE (متأخر)
    source text DEFAULT 'MANUAL', -- MANUAL, BIOMETRIC_DEVICE, EXCEL_IMPORT
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- فهارس الأداء
CREATE INDEX IF NOT EXISTS idx_hr_leaves_org ON public.hr_leave_requests(organization_id, employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_eos_org ON public.hr_end_of_service_settlements(organization_id, settlement_number);
CREATE INDEX IF NOT EXISTS idx_hr_att_org ON public.hr_attendance_logs(organization_id, log_date DESC, employee_id);

-- سياسات الأمان RLS
ALTER TABLE public.hr_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_end_of_service_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "hr_balances_org_policy" ON public.hr_leave_balances;
    CREATE POLICY "hr_balances_org_policy" ON public.hr_leave_balances
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "hr_leaves_org_policy" ON public.hr_leave_requests;
    CREATE POLICY "hr_leaves_org_policy" ON public.hr_leave_requests
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "hr_eos_org_policy" ON public.hr_end_of_service_settlements;
    CREATE POLICY "hr_eos_org_policy" ON public.hr_end_of_service_settlements
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "hr_att_org_policy" ON public.hr_attendance_logs;
    CREATE POLICY "hr_att_org_policy" ON public.hr_attendance_logs
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;
