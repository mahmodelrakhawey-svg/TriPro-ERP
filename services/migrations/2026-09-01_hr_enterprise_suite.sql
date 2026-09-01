-- ==============================================================================
-- Migration: HR & Payroll Enterprise Suite Upgrade (10/10)
-- التاريخ: 2026-09-01
-- الميزات: أجهزة البصمة ZKTeco، الورديات الذكية، لائحة الجزاءات والمكافآت، ومفردات المرتب
-- ==============================================================================

-- 1. إضافة حقل رقم البصمة للموظفين إن لم يكن موجوداً
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'biometric_id'
    ) THEN
        ALTER TABLE public.employees ADD COLUMN biometric_id VARCHAR(100);
    END IF;
END $$;

-- 2. جدول ماكينات وأجهزة البصمة (Biometric Devices Hub)
CREATE TABLE IF NOT EXISTS public.hr_biometric_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    serial_number VARCHAR(100),
    ip_address VARCHAR(100),
    port INT DEFAULT 4370,
    device_type VARCHAR(50) DEFAULT 'ZKTECO_ADMS', -- ZKTECO_ADMS, ZKTECO_STANDALONE, HIKVISION, ANVIZ
    location_branch VARCHAR(255) DEFAULT 'الفرع الرئيسي',
    status VARCHAR(50) DEFAULT 'ONLINE', -- ONLINE, OFFLINE, SYNCING
    last_sync_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. جدول الحركات الخام المستلمة من ماكينات البصمة (Biometric Raw Logs)
CREATE TABLE IF NOT EXISTS public.hr_biometric_raw_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.hr_biometric_devices(id) ON DELETE SET NULL,
    biometric_id VARCHAR(100) NOT NULL,
    log_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    punch_state VARCHAR(50) DEFAULT 'CHECK_IN', -- CHECK_IN, CHECK_OUT, BREAK_OUT, BREAK_IN, AUTO
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. جدول الورديات ومواعيد العمل (Work Shifts)
CREATE TABLE IF NOT EXISTS public.hr_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL DEFAULT '09:00:00',
    end_time TIME NOT NULL DEFAULT '17:00:00',
    grace_period_minutes INT DEFAULT 15, -- دقائق السماح بالتأخير
    overtime_start_minutes INT DEFAULT 30, -- يبدأ احتساب الإضافي بعد انتهاء الوردية بـ X دقيقة
    half_day_hours NUMERIC(4,2) DEFAULT 4.0,
    color VARCHAR(50) DEFAULT '#3b82f6',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. جدول لائحة الجزاءات والمكافآت الإدارية (Penalties & Rewards)
CREATE TABLE IF NOT EXISTS public.hr_penalties_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- PENALTY (جزاء/خصم), REWARD (مكافأة/حافز), WARNING (إنذار/لفت نظر)
    category VARCHAR(100) NOT NULL, -- تأخير, غياب, سوء سلوك, إنجاز متميز, كفاءة
    reason TEXT NOT NULL,
    amount_type VARCHAR(50) DEFAULT 'DAYS', -- DAYS (خصم/مكافأة أيام), FIXED_AMOUNT (مبلغ مالي ثابت)
    amount_value NUMERIC(15,2) NOT NULL DEFAULT 1.00,
    calculated_amount NUMERIC(15,2) DEFAULT 0.00,
    action_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payroll_month INT,
    payroll_year INT,
    status VARCHAR(50) DEFAULT 'APPROVED', -- PENDING, APPROVED, CANCELLED
    is_applied_to_payroll BOOLEAN DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. سياسات الأمان RLS وصلاحيات الوصول
ALTER TABLE public.hr_biometric_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_biometric_raw_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_penalties_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_devices" ON public.hr_biometric_devices;
CREATE POLICY "allow_all_devices" ON public.hr_biometric_devices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_raw_logs" ON public.hr_biometric_raw_logs;
CREATE POLICY "allow_all_raw_logs" ON public.hr_biometric_raw_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_shifts" ON public.hr_shifts;
CREATE POLICY "allow_all_shifts" ON public.hr_shifts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_penalties" ON public.hr_penalties_rewards;
CREATE POLICY "allow_all_penalties" ON public.hr_penalties_rewards FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.hr_biometric_devices TO authenticated, anon;
GRANT ALL ON public.hr_biometric_raw_logs TO authenticated, anon;
GRANT ALL ON public.hr_shifts TO authenticated, anon;
GRANT ALL ON public.hr_penalties_rewards TO authenticated, anon;

-- 7. زرع وردية افتراضية إذا لم تكن موجودة
INSERT INTO public.hr_shifts (name, code, start_time, end_time, grace_period_minutes, overtime_start_minutes)
SELECT 'الوردية الصباحية القياسية', 'SHIFT-MORN', '09:00:00', '17:00:00', 15, 30
WHERE NOT EXISTS (SELECT 1 FROM public.hr_shifts WHERE code = 'SHIFT-MORN');

SELECT '✅ تم تجهيز جداول موديول الموارد البشرية المتطور (HR Enterprise 10/10) بنجاح' as status;
