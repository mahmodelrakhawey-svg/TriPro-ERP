-- ==============================================================================
-- TriPro ERP - Migration: Setup Real Advanced Manufacturing Module Tables
-- Date: 2026-09-02
-- 1. Updates mfg_production_orders with work_center_id, priority, progress_percent
-- 2. Creates mfg_work_center_capacities table
-- 3. Creates mfg_maintenance_orders table
-- 4. Creates mfg_machine_oee_logs table
-- 5. Enables RLS and syncs existing real work centers (e.g. ورشة الفساتين)
-- ==============================================================================

-- 1. ربط أوامر الإنتاج بمركز العمل ودرجة الأولوية ونسبة الإنجاز
ALTER TABLE public.mfg_production_orders 
ADD COLUMN IF NOT EXISTS work_center_id uuid REFERENCES public.mfg_work_centers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'MEDIUM',
ADD COLUMN IF NOT EXISTS progress_percent numeric DEFAULT 0;

-- 2. جدول تخطيط السعة الإنتاجية لمراكز العمل (Capacity Planning)
CREATE TABLE IF NOT EXISTS public.mfg_work_center_capacities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    work_center_name text NOT NULL,
    daily_capacity_hours numeric NOT NULL DEFAULT 16,
    efficiency_factor numeric NOT NULL DEFAULT 90,
    current_planned_hours numeric NOT NULL DEFAULT 0,
    is_bottleneck boolean NOT NULL DEFAULT false,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 3. جدول أوامر الصيانة الوقائية والطارئة للماكينات (Machinery Maintenance)
CREATE TABLE IF NOT EXISTS public.mfg_maintenance_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    order_number text NOT NULL,
    machine_name text NOT NULL,
    maintenance_type text NOT NULL DEFAULT 'PREVENTIVE', -- PREVENTIVE, CORRECTIVE, CALIBRATION
    priority text NOT NULL DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, CRITICAL
    issue_description text,
    scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
    completed_date date,
    assigned_technician text,
    status text NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, CANCELLED
    spare_parts_used jsonb DEFAULT '[]'::jsonb,
    total_cost numeric DEFAULT 0,
    maintenance_interval_hours numeric DEFAULT 500,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 4. جدول سجلات كفاءة المعدات الشاملة (OEE Tracker)
CREATE TABLE IF NOT EXISTS public.mfg_machine_oee_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    machine_name text NOT NULL,
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    shift_name text NOT NULL DEFAULT 'الوردية الأولى',
    planned_production_time_minutes numeric NOT NULL DEFAULT 480,
    downtime_minutes numeric NOT NULL DEFAULT 0,
    downtime_reason text,
    ideal_cycle_time_seconds numeric NOT NULL DEFAULT 10,
    total_produced_units numeric NOT NULL DEFAULT 0,
    good_units numeric NOT NULL DEFAULT 0,
    rejected_units numeric NOT NULL DEFAULT 0,
    availability_percentage numeric NOT NULL DEFAULT 100,
    performance_percentage numeric NOT NULL DEFAULT 100,
    quality_percentage numeric NOT NULL DEFAULT 100,
    oee_percentage numeric NOT NULL DEFAULT 100,
    operator_name text,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 5. تفعيل سياسات الأمان RLS
ALTER TABLE public.mfg_work_center_capacities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_maintenance_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_machine_oee_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "allow_all_authenticated_mfg_cap" ON public.mfg_work_center_capacities;
    CREATE POLICY "allow_all_authenticated_mfg_cap" ON public.mfg_work_center_capacities FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_authenticated_mfg_maint" ON public.mfg_maintenance_orders;
    CREATE POLICY "allow_all_authenticated_mfg_maint" ON public.mfg_maintenance_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "allow_all_authenticated_mfg_oee" ON public.mfg_machine_oee_logs;
    CREATE POLICY "allow_all_authenticated_mfg_oee" ON public.mfg_machine_oee_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $$;

-- 6. مزامنة وتوليد السعات آلياً لمراكز العمل الفعلية الموجودة بالمنشأة (مثل ورشة الفساتين)
INSERT INTO public.mfg_work_center_capacities (organization_id, work_center_name, daily_capacity_hours, efficiency_factor, current_planned_hours, is_bottleneck)
SELECT 
    wc.organization_id, 
    wc.name, 
    16, 
    90, 
    0, 
    false
FROM public.mfg_work_centers wc
WHERE NOT EXISTS (
    SELECT 1 FROM public.mfg_work_center_capacities cap 
    WHERE cap.organization_id = wc.organization_id AND cap.work_center_name = wc.name
);

-- 7. تحديث أوامر الإنتاج السابقة وربطها بأول مركز عمل متاح
UPDATE public.mfg_production_orders po
SET work_center_id = (
    SELECT id FROM public.mfg_work_centers 
    WHERE organization_id = po.organization_id 
    ORDER BY created_at ASC LIMIT 1
)
WHERE po.work_center_id IS NULL 
  AND EXISTS (SELECT 1 FROM public.mfg_work_centers WHERE organization_id = po.organization_id);
