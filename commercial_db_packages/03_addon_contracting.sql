-- =============================================================================
-- 🏗️ TriPro ERP — Commercial Add-on: Contracting & Projects (03_addon_contracting.sql)
-- 🏢 مديول المقاولات: المشاريع، جداول الكميات BOQ، المستخلصات، مقاولي الباطن، ونسب الهالك
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. جدول المشاريع الإنشائية وعقود العملاء
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    description TEXT,
    customer_id UUID REFERENCES public.customers(id),
    contract_value NUMERIC(15,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    cost_center_account_id UUID REFERENCES public.accounts(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. المراحل الزمنية ومخطط جانت للمشروع (Project Milestones)
CREATE TABLE IF NOT EXISTS public.project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    expected_start_date DATE NOT NULL,
    expected_end_date DATE NOT NULL,
    actual_completion_date DATE,
    progress_percentage NUMERIC(5,2) DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delayed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. مقايسات الأعمال وجداول الكميات (BOQ)
CREATE TABLE IF NOT EXISTS public.project_boq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    unit TEXT DEFAULT 'م3',
    estimated_quantity NUMERIC(15,2) DEFAULT 0,
    unit_price NUMERIC(15,2) DEFAULT 0,
    total_price NUMERIC(15,2) GENERATED ALWAYS AS (estimated_quantity * unit_price) STORED,
    material_cost_per_unit NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. مستخلصات العميل الجارية والختامية (Client Progress Billings)
CREATE TABLE IF NOT EXISTS public.project_progress_billings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    billing_number TEXT NOT NULL,
    billing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completion_percentage NUMERIC(5,2) DEFAULT 0,
    gross_amount NUMERIC(15,2) NOT NULL,
    retention_amount NUMERIC(15,2) DEFAULT 0, -- تأمين أعمال محتجز
    advance_deduction NUMERIC(15,2) DEFAULT 0, -- استهلاك دفعة مقدمة
    net_amount NUMERIC(15,2) GENERATED ALWAYS AS (gross_amount - retention_amount - advance_deduction) STORED,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    status TEXT DEFAULT 'approved' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    items_progress JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. مقاولو الباطن وعقودهم ومستخلصاتهم (Subcontractors)
CREATE TABLE IF NOT EXISTS public.subcontractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    specialty TEXT,
    phone TEXT,
    tax_number TEXT,
    balance NUMERIC(15,2) DEFAULT 0,
    gl_account_id UUID REFERENCES public.accounts(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subcontractor_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    subcontractor_id UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
    contract_number TEXT NOT NULL,
    scope_of_work TEXT,
    total_amount NUMERIC(15,2) NOT NULL,
    start_date DATE,
    end_date DATE,
    retention_pct NUMERIC(5,2) DEFAULT 5.0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subcontractor_billings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    contract_id UUID NOT NULL REFERENCES public.subcontractor_contracts(id) ON DELETE CASCADE,
    billing_number TEXT NOT NULL,
    billing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    gross_amount NUMERIC(15,2) NOT NULL,
    retention_amount NUMERIC(15,2) DEFAULT 0,
    penalty_deduction NUMERIC(15,2) DEFAULT 0,
    net_amount NUMERIC(15,2) GENERATED ALWAYS AS (gross_amount - retention_amount - penalty_deduction) STORED,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    status TEXT DEFAULT 'approved',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. أذون صرف المواد للمواقع (Material Issues)
CREATE TABLE IF NOT EXISTS public.project_material_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    issue_number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'APPROVED',
    notes TEXT,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_material_issue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES public.project_material_issues(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    boq_item_id UUID REFERENCES public.project_boq(id),
    quantity NUMERIC(15,2) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(15,2) DEFAULT 0,
    total_cost NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
);

-- 7. مطالبات فروق الأسعار والتضخم (Price Escalations)
CREATE TABLE IF NOT EXISTS public.project_price_escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    claim_number TEXT NOT NULL,
    billing_period TEXT,
    material_category TEXT NOT NULL,
    contract_base_price NUMERIC(15,2) NOT NULL,
    current_market_price NUMERIC(15,2) NOT NULL,
    weight_factor NUMERIC(5,2) NOT NULL,
    executed_work_value NUMERIC(15,2) NOT NULL,
    calculated_escalation_amount NUMERIC(15,2) NOT NULL,
    status TEXT DEFAULT 'PENDING_APPROVAL',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. الرؤى التحليلية لمؤشرات الأداء للمشاريع
CREATE OR REPLACE VIEW public.v_project_performance_dashboard AS
SELECT 
    p.id AS project_id,
    p.organization_id,
    p.name AS project_name,
    p.status,
    p.contract_value AS bac,
    COALESCE((SELECT SUM(gross_amount) FROM public.project_progress_billings WHERE project_id = p.id AND status = 'approved'), 0) AS earned_value,
    COALESCE((SELECT SUM(jl.debit - jl.credit) FROM public.journal_lines jl WHERE jl.cost_center_id = p.cost_center_account_id), 0) AS actual_cost,
    ROUND(COALESCE((SELECT AVG(progress_percentage) FROM public.project_milestones WHERE project_id = p.id), 0), 1) AS progress_pct
FROM public.projects p;

-- 9. تفعيل RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_boq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_progress_billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_issues ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_projects ON public.projects FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_boq ON public.project_boq FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
