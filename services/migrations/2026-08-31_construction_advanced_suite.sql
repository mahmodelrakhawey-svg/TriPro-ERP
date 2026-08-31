-- ==============================================================================
-- 🏗️ TriPro ERP - الحزمة المتقدمة للمقاولات والإنشاءات
-- Construction Advanced Suite: WIR / MIR, Material Waste Variance, Price Escalations
-- التاريخ: 2026-08-31
-- ==============================================================================

-- 1. جدول طلبات فحص واستلام الأعمال واستلام المواد (WIR / MIR)
CREATE TABLE IF NOT EXISTS public.project_inspection_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    wir_number text NOT NULL,
    request_type text DEFAULT 'WORK', -- WORK (استلام أعمال WIR), MATERIAL (استلام مواد بالموقع MIR)
    discipline text DEFAULT 'مدني / إنشائي',
    title text NOT NULL,
    location_details text NOT NULL, -- المبنى، الدور، المحاور
    boq_item_reference text,
    contractor_engineer text,
    requested_inspection_date timestamptz NOT NULL DEFAULT now(),
    inspection_status text DEFAULT 'PENDING', -- PENDING (بانتظار الفحص), APPROVED_A (معتمد بالكامل), APPROVED_WITH_COMMENTS_B (معتمد بملاحظات), REJECTED_C (مرفوض)
    consultant_engineer text,
    consultant_verdict_date date,
    consultant_notes text,
    cube_test_required boolean DEFAULT false,
    cube_test_results text, -- نتائج تكسير مكعبات الخرسانة (7 أيام / 28 يوم)
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. جدول تحليلات ومراقبة الهدر المعياري للخامات (Material Waste & Yield Analytics)
CREATE TABLE IF NOT EXISTS public.project_material_waste_analysis (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    material_name text NOT NULL, -- حديد تسليح، خرسانة جاهزة، أسمنت، رمل، سن، سيراميك، دهانات
    unit text NOT NULL, -- طن، م3، شيكارة، م2
    theoretical_quantity numeric(15,3) NOT NULL DEFAULT 0, -- الكمية المحسوبة هندسياً من المخططات والمقايسة
    actual_issued_quantity numeric(15,3) NOT NULL DEFAULT 0, -- الكمية المنصرفة فعلياً من أذون الصرف
    allowed_waste_percentage numeric(5,2) NOT NULL DEFAULT 3.0, -- نسبة الهدر المسموح بها هندسياً
    unit_cost numeric(15,2) NOT NULL DEFAULT 0,
    analysis_date date NOT NULL DEFAULT CURRENT_DATE,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. جدول مطالبات وحساب فروق أسعار الخامات (Price Escalation Claims)
CREATE TABLE IF NOT EXISTS public.project_price_escalations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    claim_number text NOT NULL,
    billing_period text NOT NULL, -- مثال: مستخلص رقم 4 - يوليو 2026
    material_category text NOT NULL, -- حديد تسليح، أسمنت بورتلاندي، بيتومين/عزل، محروقات وسولار، عمالة
    contract_base_price numeric(15,2) NOT NULL DEFAULT 0, -- السعر الأساسي بالعقد P0
    current_market_price numeric(15,2) NOT NULL DEFAULT 0, -- السعر القياسي وقت التنفيذ Pt
    weight_factor numeric(5,3) NOT NULL DEFAULT 0.25, -- معامل وزن الخامة في المقايسة
    executed_work_value numeric(15,2) NOT NULL DEFAULT 0, -- قيمة الأعمال المنفذة خلال الفترة
    calculated_escalation_amount numeric(15,2) NOT NULL DEFAULT 0, -- قيمة التعويض المستحق
    status text DEFAULT 'PENDING_APPROVAL', -- DRAFT, PENDING_APPROVAL, APPROVED_BY_CLIENT, REJECTED
    consultant_notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- فهارس الأداء
CREATE INDEX IF NOT EXISTS idx_p_inspections_proj ON public.project_inspection_requests(project_id, wir_number);
CREATE INDEX IF NOT EXISTS idx_p_inspections_org ON public.project_inspection_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_p_waste_proj ON public.project_material_waste_analysis(project_id);
CREATE INDEX IF NOT EXISTS idx_p_waste_org ON public.project_material_waste_analysis(organization_id);
CREATE INDEX IF NOT EXISTS idx_p_escalations_proj ON public.project_price_escalations(project_id);
CREATE INDEX IF NOT EXISTS idx_p_escalations_org ON public.project_price_escalations(organization_id);

-- سياسات الأمان RLS
ALTER TABLE public.project_inspection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_waste_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_price_escalations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "inspections_org_policy" ON public.project_inspection_requests;
    CREATE POLICY "inspections_org_policy" ON public.project_inspection_requests
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "waste_org_policy" ON public.project_material_waste_analysis;
    CREATE POLICY "waste_org_policy" ON public.project_material_waste_analysis
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "escalations_org_policy" ON public.project_price_escalations;
    CREATE POLICY "escalations_org_policy" ON public.project_price_escalations
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;
