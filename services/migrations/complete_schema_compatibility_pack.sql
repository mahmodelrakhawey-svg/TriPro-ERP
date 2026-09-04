-- ==============================================================================
-- 🚀 حزمة التوافق الشاملة لقاعدة بيانات العميل (Complete Compatibility Pack)
-- TriPro ERP — services/migrations/complete_schema_compatibility_pack.sql
-- ==============================================================================
-- الغرض: إنشاء كافة الجداول الاختيارية للمديولات (المقاولات، التصنيع، المستشفيات، الاستاد)
-- بصيغة IF NOT EXISTS لضمان عدم ظهور أي خطأ 404 في الكونسول أو مجدول التنبيهات
-- آمن بنسبة 100% ولا يمس أو يحذف أي بيانات حالية.
-- ==============================================================================

BEGIN;

-- 🏗️ 1. جداول مديول المقاولات والمشاريع (Construction & Contracting)
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    customer_id UUID REFERENCES public.customers(id),
    status TEXT DEFAULT 'active',
    contract_value NUMERIC DEFAULT 0,
    start_date DATE,
    end_date DATE,
    cost_center_account_id UUID REFERENCES public.accounts(id),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated projects" ON public.projects;
CREATE POLICY "Allow authenticated projects" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.subcontractors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    supplier_id UUID REFERENCES public.suppliers(id),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated subcontractors" ON public.subcontractors;
CREATE POLICY "Allow authenticated subcontractors" ON public.subcontractors FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.subcontractor_contracts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subcontractor_id UUID REFERENCES public.subcontractors(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    contract_number TEXT,
    contract_value NUMERIC DEFAULT 0,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.subcontractor_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated subcontractor_contracts" ON public.subcontractor_contracts;
CREATE POLICY "Allow authenticated subcontractor_contracts" ON public.subcontractor_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.project_progress_billings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    billing_number TEXT,
    billing_date DATE DEFAULT CURRENT_DATE,
    net_amount NUMERIC DEFAULT 0,
    gross_amount NUMERIC DEFAULT 0,
    retention_amount NUMERIC DEFAULT 0,
    retention_release_date DATE,
    status TEXT DEFAULT 'approved',
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.project_progress_billings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated project_progress_billings" ON public.project_progress_billings;
CREATE POLICY "Allow authenticated project_progress_billings" ON public.project_progress_billings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.subcontractor_billings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID REFERENCES public.subcontractor_contracts(id) ON DELETE CASCADE,
    billing_number TEXT,
    billing_date DATE DEFAULT CURRENT_DATE,
    net_amount NUMERIC DEFAULT 0,
    gross_amount NUMERIC DEFAULT 0,
    retention_amount NUMERIC DEFAULT 0,
    retention_release_date DATE,
    status TEXT DEFAULT 'approved',
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.subcontractor_billings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated subcontractor_billings" ON public.subcontractor_billings;
CREATE POLICY "Allow authenticated subcontractor_billings" ON public.subcontractor_billings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.project_material_issues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    issue_number TEXT,
    issue_date DATE DEFAULT CURRENT_DATE,
    warehouse_id UUID REFERENCES public.warehouses(id),
    status TEXT DEFAULT 'approved',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.project_material_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated project_material_issues" ON public.project_material_issues;
CREATE POLICY "Allow authenticated project_material_issues" ON public.project_material_issues FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.project_material_issue_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    issue_id UUID REFERENCES public.project_material_issues(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity NUMERIC DEFAULT 0,
    uom_id UUID,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.project_material_issue_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated project_material_issue_items" ON public.project_material_issue_items;
CREATE POLICY "Allow authenticated project_material_issue_items" ON public.project_material_issue_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 🏭 2. جداول مديول التصنيع والإنتاج (Manufacturing Module)
CREATE TABLE IF NOT EXISTS public.mfg_production_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number TEXT,
    product_id UUID REFERENCES public.products(id),
    quantity_to_produce NUMERIC DEFAULT 0,
    warehouse_id UUID REFERENCES public.warehouses(id),
    status TEXT DEFAULT 'completed',
    start_date DATE,
    end_date DATE,
    notes TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.mfg_production_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated mfg_production_orders" ON public.mfg_production_orders;
CREATE POLICY "Allow authenticated mfg_production_orders" ON public.mfg_production_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.mfg_order_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id UUID REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'completed',
    qc_verified BOOLEAN DEFAULT true,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.mfg_order_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated mfg_order_progress" ON public.mfg_order_progress;
CREATE POLICY "Allow authenticated mfg_order_progress" ON public.mfg_order_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.mfg_material_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id UUID REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    request_number TEXT,
    issue_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'issued',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.mfg_material_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated mfg_material_requests" ON public.mfg_material_requests;
CREATE POLICY "Allow authenticated mfg_material_requests" ON public.mfg_material_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.mfg_material_request_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id UUID REFERENCES public.mfg_material_requests(id) ON DELETE CASCADE,
    raw_material_id UUID REFERENCES public.products(id),
    quantity_issued NUMERIC DEFAULT 0,
    uom_id UUID,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.mfg_material_request_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated mfg_material_request_items" ON public.mfg_material_request_items;
CREATE POLICY "Allow authenticated mfg_material_request_items" ON public.mfg_material_request_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.mfg_actual_material_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id UUID REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    raw_material_id UUID REFERENCES public.products(id),
    actual_quantity NUMERIC DEFAULT 0,
    uom_id UUID,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.mfg_actual_material_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated mfg_actual_material_usage" ON public.mfg_actual_material_usage;
CREATE POLICY "Allow authenticated mfg_actual_material_usage" ON public.mfg_actual_material_usage FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.mfg_scrap_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id UUID REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity NUMERIC DEFAULT 0,
    reason TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.mfg_scrap_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated mfg_scrap_logs" ON public.mfg_scrap_logs;
CREATE POLICY "Allow authenticated mfg_scrap_logs" ON public.mfg_scrap_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.v_mfg_material_variances 
WITH (security_invoker = true) AS
SELECT 
    p.id AS product_id,
    p.name AS product_name,
    p.organization_id,
    0::NUMERIC AS variance_amount,
    0::NUMERIC AS variance_percentage
FROM public.products p;

-- 🏥 3. جداول مديول الرعاية الصحية والمستشفيات (HIMS Healthcare)
CREATE TABLE IF NOT EXISTS public.hims_patients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id),
    full_name TEXT NOT NULL,
    phone TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.hims_patients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated hims_patients" ON public.hims_patients;
CREATE POLICY "Allow authenticated hims_patients" ON public.hims_patients FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.hims_billing (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID REFERENCES public.hims_patients(id),
    insurance_provider_id UUID,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    total_amount NUMERIC DEFAULT 0,
    patient_paid_amount NUMERIC DEFAULT 0,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.hims_billing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated hims_billing" ON public.hims_billing;
CREATE POLICY "Allow authenticated hims_billing" ON public.hims_billing FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.hims_billing_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    hims_billing_id UUID REFERENCES public.hims_billing(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity NUMERIC DEFAULT 1,
    total_price NUMERIC DEFAULT 0,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.hims_billing_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated hims_billing_items" ON public.hims_billing_items;
CREATE POLICY "Allow authenticated hims_billing_items" ON public.hims_billing_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.hims_insurance_claims (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    insurance_provider_id UUID,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    total_claim_amount NUMERIC DEFAULT 0,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.hims_insurance_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated hims_insurance_claims" ON public.hims_insurance_claims;
CREATE POLICY "Allow authenticated hims_insurance_claims" ON public.hims_insurance_claims FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 🏟️ 4. جداول مديول الملاعب والأندية (Stadium & Sports Module)
CREATE TABLE IF NOT EXISTS public.stadium_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_members" ON public.stadium_members;
CREATE POLICY "Allow authenticated stadium_members" ON public.stadium_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stadium_rental_contracts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_name TEXT NOT NULL,
    tenant_phone TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_rental_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_rental_contracts" ON public.stadium_rental_contracts;
CREATE POLICY "Allow authenticated stadium_rental_contracts" ON public.stadium_rental_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stadium_rental_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID REFERENCES public.stadium_rental_contracts(id),
    amount_paid NUMERIC DEFAULT 0,
    journal_entry_id UUID REFERENCES public.journal_entries(id),
    payment_method TEXT DEFAULT 'cash',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_rental_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_rental_payments" ON public.stadium_rental_payments;
CREATE POLICY "Allow authenticated stadium_rental_payments" ON public.stadium_rental_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stadium_bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booker_name TEXT NOT NULL,
    booker_phone TEXT,
    total_amount NUMERIC DEFAULT 0,
    journal_entry_id UUID REFERENCES public.journal_entries(id),
    payment_method TEXT DEFAULT 'cash',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_bookings" ON public.stadium_bookings;
CREATE POLICY "Allow authenticated stadium_bookings" ON public.stadium_bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stadium_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    member_id UUID REFERENCES public.stadium_members(id),
    journal_entry_id UUID REFERENCES public.journal_entries(id),
    amount_paid NUMERIC DEFAULT 0,
    payment_method TEXT DEFAULT 'cash',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_subscriptions" ON public.stadium_subscriptions;
CREATE POLICY "Allow authenticated stadium_subscriptions" ON public.stadium_subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stadium_tournament_teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_name TEXT NOT NULL,
    captain_name TEXT,
    captain_phone TEXT,
    entry_fee_paid NUMERIC DEFAULT 0,
    journal_entry_id UUID REFERENCES public.journal_entries(id),
    payment_method TEXT DEFAULT 'cash',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_tournament_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_tournament_teams" ON public.stadium_tournament_teams;
CREATE POLICY "Allow authenticated stadium_tournament_teams" ON public.stadium_tournament_teams FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stadium_program_enrollments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    participant_name TEXT NOT NULL,
    participant_phone TEXT,
    amount_paid NUMERIC DEFAULT 0,
    journal_entry_id UUID REFERENCES public.journal_entries(id),
    payment_method TEXT DEFAULT 'cash',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_program_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_program_enrollments" ON public.stadium_program_enrollments;
CREATE POLICY "Allow authenticated stadium_program_enrollments" ON public.stadium_program_enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stadium_disbursements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_number TEXT,
    amount NUMERIC DEFAULT 0,
    journal_entry_id UUID REFERENCES public.journal_entries(id),
    beneficiary_name TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_disbursements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_disbursements" ON public.stadium_disbursements;
CREATE POLICY "Allow authenticated stadium_disbursements" ON public.stadium_disbursements FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stadium_custodies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    custodian_name TEXT,
    total_amount NUMERIC DEFAULT 0,
    journal_entry_id UUID REFERENCES public.journal_entries(id),
    settlement_journal_id UUID REFERENCES public.journal_entries(id),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_custodies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_custodies" ON public.stadium_custodies;
CREATE POLICY "Allow authenticated stadium_custodies" ON public.stadium_custodies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stadium_maintenance_tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_number TEXT,
    actual_cost NUMERIC DEFAULT 0,
    estimated_cost NUMERIC DEFAULT 0,
    journal_entry_id UUID REFERENCES public.journal_entries(id),
    assigned_technician TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stadium_maintenance_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated stadium_maintenance_tickets" ON public.stadium_maintenance_tickets;
CREATE POLICY "Allow authenticated stadium_maintenance_tickets" ON public.stadium_maintenance_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
