-- ==============================================================================
-- 🏭 TriPro ERP - الحزمة الصناعية المتقدمة لموديول التصنيع والإنتاج
-- Manufacturing Advanced Suite: OEE & Downtime, Preventive Maintenance, Capacity Planning
-- التاريخ: 2026-08-31
-- ==============================================================================

-- 1. جدول تسجيل ومراقبة مؤشر كفاءة المعدات OEE وأوقات التوقف (Machine OEE Logs)
CREATE TABLE IF NOT EXISTS public.mfg_machine_oee_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    machine_name text NOT NULL, -- اسم الماكينة / خط الإنتاج
    work_center_id uuid, -- مركز العمل
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    shift_name text DEFAULT 'الوردية الصباحية (الأولى)',
    planned_production_time_minutes numeric(10,2) NOT NULL DEFAULT 480, -- الوقت المخطط للإنتاج (8 ساعات = 480 دقيقة)
    downtime_minutes numeric(10,2) NOT NULL DEFAULT 0, -- إجمالي وقت التوقف
    downtime_reason text, -- عطل ميكانيكي، تغيير قوالب وتهيئة Setup، نقص خامات، غياب مشغلين، صيانة طارئة
    ideal_cycle_time_seconds numeric(10,2) NOT NULL DEFAULT 10, -- الزمن المعياري لإنتاج الوحدة بالثواني
    total_produced_units numeric(12,2) NOT NULL DEFAULT 0, -- إجمالي الوحدات المنتجة
    good_units numeric(12,2) NOT NULL DEFAULT 0, -- الوحدات السليمة المطابقة للمواصفات
    rejected_units numeric(12,2) NOT NULL DEFAULT 0, -- الوحدات المعيبة / الهالك
    availability_percentage numeric(5,2) NOT NULL DEFAULT 0, -- نسبة التوافر %
    performance_percentage numeric(5,2) NOT NULL DEFAULT 0, -- نسبة الأداء %
    quality_percentage numeric(5,2) NOT NULL DEFAULT 0, -- نسبة الجودة %
    oee_percentage numeric(5,2) NOT NULL DEFAULT 0, -- المؤشر العام OEE %
    operator_name text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. جدول أوامر الصيانة الوقائية والطارئة للماكينات (Machinery Maintenance Orders)
CREATE TABLE IF NOT EXISTS public.mfg_maintenance_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    order_number text NOT NULL,
    machine_name text NOT NULL,
    maintenance_type text DEFAULT 'PREVENTIVE', -- PREVENTIVE (صيانة وقائية دورية), CORRECTIVE (صيانة علاجية/طارئة), CALIBRATION (معايرة وضبط)
    priority text DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, CRITICAL
    issue_description text NOT NULL,
    scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
    completed_date date,
    assigned_technician text,
    status text DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, CANCELLED
    spare_parts_used jsonb DEFAULT '[]'::jsonb, -- [{ part_name: 'سير محرك 120مم', qty: 2, unit_cost: 450 }]
    total_cost numeric(15,2) NOT NULL DEFAULT 0,
    maintenance_interval_hours integer DEFAULT 500, -- التكرار الدوري بالساعات
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. جدول معايير وتخطيط السعة الإنتاجية لمراكز العمل (Work Center Capacity Planning)
CREATE TABLE IF NOT EXISTS public.mfg_work_center_capacities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    work_center_name text NOT NULL,
    daily_capacity_hours numeric(10,2) NOT NULL DEFAULT 16, -- السعة اليومية المتاحة بالساعات (ورديتين = 16 ساعة)
    efficiency_factor numeric(5,2) NOT NULL DEFAULT 90.0, -- معامل كفاءة مركز العمل %
    current_planned_hours numeric(10,2) NOT NULL DEFAULT 0, -- الساعات المحجوزة لأوامر الإنتاج المفتوحة
    is_bottleneck boolean DEFAULT false, -- هل يشكل عنق زجاجة
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- فهارس الأداء
CREATE INDEX IF NOT EXISTS idx_mfg_oee_org ON public.mfg_machine_oee_logs(organization_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_mfg_maint_org ON public.mfg_maintenance_orders(organization_id, order_number);
CREATE INDEX IF NOT EXISTS idx_mfg_cap_org ON public.mfg_work_center_capacities(organization_id);

-- سياسات الأمان RLS
ALTER TABLE public.mfg_machine_oee_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_maintenance_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_work_center_capacities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "mfg_oee_org_policy" ON public.mfg_machine_oee_logs;
    CREATE POLICY "mfg_oee_org_policy" ON public.mfg_machine_oee_logs
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "mfg_maint_org_policy" ON public.mfg_maintenance_orders;
    CREATE POLICY "mfg_maint_org_policy" ON public.mfg_maintenance_orders
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "mfg_cap_org_policy" ON public.mfg_work_center_capacities;
    CREATE POLICY "mfg_cap_org_policy" ON public.mfg_work_center_capacities
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;
