-- مديول المقاولات - الإصدار الأول
-- 🏗️ مديول المقاولات المطور - TriPro ERP
-- Construction Module - V1.1 (Production Ready)

-- 1. جدول المشاريع
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    description TEXT,
    customer_id UUID REFERENCES public.customers(id),
    contract_value NUMERIC(15,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    cost_center_account_id UUID REFERENCES public.accounts(id),
    status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول بنود المقايسة (BOQ)
CREATE TABLE IF NOT EXISTS public.project_boq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    item_name TEXT NOT NULL,
    unit TEXT,
    estimated_quantity NUMERIC(15,2) DEFAULT 0,
    unit_price NUMERIC(15,2) DEFAULT 0,
    total_price NUMERIC(15,2) GENERATED ALWAYS AS (estimated_quantity * unit_price) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول المستخلصات
CREATE TABLE IF NOT EXISTS public.project_progress_billings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    billing_number TEXT NOT NULL,
    billing_date DATE NOT NULL,
    completion_percentage NUMERIC(5,2) CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    gross_amount NUMERIC(15,2) NOT NULL,
    retention_amount NUMERIC(15,2) DEFAULT 0, -- الاستقطاعات (ضمان أعمال)
    advance_deduction NUMERIC(15,2) DEFAULT 0, -- استهلاك الدفعة المقدمة
    net_amount NUMERIC(15,2) GENERATED ALWAYS AS (gross_amount - retention_amount - advance_deduction) STORED,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🛡️ ترميم هيكل الجدول لضمان وجود أعمدة الدفعات المقدمة (Schema Healing)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_progress_billings' AND column_name='advance_deduction') THEN
        ALTER TABLE public.project_progress_billings ADD COLUMN advance_deduction NUMERIC(15,2) DEFAULT 0;
        -- إعادة إنشاء العمود المحسوب ليشمل الخصم الجديد لضمان دقة صافي المستخلص
        ALTER TABLE public.project_progress_billings DROP COLUMN IF EXISTS net_amount;
        ALTER TABLE public.project_progress_billings ADD COLUMN net_amount NUMERIC(15,2) 
            GENERATED ALWAYS AS (gross_amount - retention_amount - advance_deduction) STORED;
    END IF;
END $$;

-- تفعيل حماية البيانات (RLS) لكل شركة
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaaS_Project_Isolation" ON public.projects;
CREATE POLICY "SaaS_Project_Isolation" ON public.projects FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- تفعيل حماية البيانات للمقايسات
ALTER TABLE public.project_boq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaaS_BOQ_Isolation" ON public.project_boq;
CREATE POLICY "SaaS_BOQ_Isolation" ON public.project_boq FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- 6. جداول مقاولين الباطن
CREATE TABLE IF NOT EXISTS public.subcontractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    phone TEXT,
    specialty TEXT, -- تخصص المقاول (كهرباء، سباكة، إلخ)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subcontractor_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    subcontractor_id UUID REFERENCES public.subcontractors(id) ON DELETE CASCADE,
    contract_name TEXT NOT NULL,
    total_value NUMERIC(15,2) DEFAULT 0,
    retention_percentage NUMERIC(5,2) DEFAULT 5, -- نسبة محتجز الضمان
    advance_payment_balance NUMERIC(15,2) DEFAULT 0, -- رصيد الدفعة المقدمة المتبقي
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subcontractor_billings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    contract_id UUID REFERENCES public.subcontractor_contracts(id) ON DELETE CASCADE,
    billing_number TEXT NOT NULL,
    billing_date DATE NOT NULL,
    gross_amount NUMERIC(15,2) NOT NULL, -- قيمة الأعمال المنفذة
    retention_amount NUMERIC(15,2) DEFAULT 0, -- محتجز الضمان (خصم)
    advance_deduction NUMERIC(15,2) DEFAULT 0, -- استرداد الدفعة المقدمة (خصم)
    net_amount NUMERIC(15,2) GENERATED ALWAYS AS (gross_amount - retention_amount - advance_deduction) STORED,
    status TEXT DEFAULT 'draft',
    related_journal_entry_id UUID REFERENCES public.journal_entries(id)
);

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_billings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SaaS_Subcontractor_Isolation" ON public.subcontractors;
CREATE POLICY "SaaS_Subcontractor_Isolation" ON public.subcontractors FOR ALL TO authenticated USING (organization_id = public.get_my_org());
DROP POLICY IF EXISTS "SaaS_Sub_Contract_Isolation" ON public.subcontractor_contracts;
CREATE POLICY "SaaS_Sub_Contract_Isolation" ON public.subcontractor_contracts FOR ALL TO authenticated USING (organization_id = public.get_my_org());
DROP POLICY IF EXISTS "SaaS_Sub_Billing_Isolation" ON public.subcontractor_billings;
CREATE POLICY "SaaS_Sub_Billing_Isolation" ON public.subcontractor_billings FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- 5. دالة اعتماد المستخلص وتوليد القيد المحاسبي
CREATE OR REPLACE FUNCTION public.fn_approve_project_billing(p_billing_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_billing RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_org_id UUID;
    v_mappings JSONB;
    v_cust_acc UUID;
    v_revenue_acc UUID;
    v_retention_cust_acc UUID; -- 1. محجوز ضمان عملاء (Asset)
    v_advance_cust_acc UUID;   -- 2. دفعات مقدمة عملاء (Liability)
BEGIN
    SELECT b.*, COALESCE(b.advance_deduction, 0) as adv_deduct INTO v_billing 
    FROM public.project_progress_billings b WHERE b.id = p_billing_id;
    
    SELECT * INTO v_project FROM public.projects WHERE id = v_billing.project_id;
    v_org_id := v_billing.organization_id;

    -- جلب الربط المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- تحديد الحسابات (مع Fallback للأكواد القياسية)
    v_cust_acc := COALESCE((v_mappings->>'CUSTOMERS')::UUID, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_revenue_acc := COALESCE((v_mappings->>'SALES_REVENUE')::UUID, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));

    -- 1. حساب محجوز ضمان عملاء (Asset) - كود 1249
    SELECT id INTO v_retention_cust_acc FROM public.accounts WHERE code = '1249' AND organization_id = v_org_id LIMIT 1;
    
    -- 2. حساب دفعات مقدمة عملاء (Liability) - كود 226
    SELECT id INTO v_advance_cust_acc FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1;

    -- إنشاء القيد المحاسبي
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_billing.billing_date, 'مستخلص رقم ' || v_billing.billing_number || ' - مشروع ' || v_project.name, v_billing.billing_number, 'posted', v_org_id, p_billing_id, 'construction_billing', true)
    RETURNING id INTO v_je_id;

    -- من ح/ العميل (بالصافي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_cust_acc, v_billing.net_amount, 0, 'صافي المستخلص المستحق', v_org_id);

    -- من ح/ ضمان الأعمال (المبلغ المستقطع)
    IF v_billing.retention_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_retention_cust_acc, v_billing.retention_amount, 0, 'محتجز ضمان مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    -- إلى ح/ الدفعات المقدمة (استهلاك الدفعة)
    IF v_billing.adv_deduct > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_advance_cust_acc, 0, v_billing.adv_deduct, 'استهلاك دفعة مقدمة مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    -- إلى ح/ الإيرادات (بالإجمالي) - مربوط بمركز تكلفة المشروع
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_revenue_acc, 0, v_billing.gross_amount, 'إيراد أعمال منفذة للمشروع', v_org_id);

    -- تحديث المستخلص
    UPDATE public.project_progress_billings 
    SET status = 'approved', related_journal_entry_id = v_je_id 
    WHERE id = p_billing_id;
END;
$function$;

-- 7. دالة اعتماد مستخلص مقاول الباطن
CREATE OR REPLACE FUNCTION public.fn_approve_sub_billing(p_billing_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_billing RECORD;
    v_contract RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_sub_acc UUID;        -- ح/ الموردين (مقاولين الباطن)
    v_retention_sub_acc UUID; -- 3. محجوز ضمان مقاولين (Liability)
    v_advance_sub_acc UUID;   -- 4. دفعات مقدمة مقاولين (Asset)
BEGIN
    SELECT b.* INTO v_billing FROM public.subcontractor_billings b WHERE b.id = p_billing_id;
    SELECT * INTO v_contract FROM public.subcontractor_contracts WHERE id = v_billing.contract_id;
    SELECT * INTO v_project FROM public.projects WHERE id = v_contract.project_id;

    -- تحديد الحسابات
    v_sub_acc := (SELECT id FROM public.accounts WHERE code = '221' AND organization_id = v_billing.organization_id LIMIT 1);
    -- كود 2229: محتجز ضمان لمقاولي الباطن (التزام)
    v_retention_sub_acc := (SELECT id FROM public.accounts WHERE code = '2229' AND organization_id = v_billing.organization_id LIMIT 1);
    -- كود 1245: دفعات مقدمة للمقاولين (أصل)
    v_advance_sub_acc := (SELECT id FROM public.accounts WHERE code = '1245' AND organization_id = v_billing.organization_id LIMIT 1);

    -- إنشاء القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_billing.billing_date, 'مستخلص مقاول باطن: ' || v_billing.billing_number, v_billing.billing_number, 'posted', v_billing.organization_id, p_billing_id, 'sub_billing', true)
    RETURNING id INTO v_je_id;

    -- من ح/ تكاليف المشروع (مركز التكلفة) - بالإجمالي
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project.cost_center_account_id, v_billing.gross_amount, 0, 'أعمال منفذة من مقاول الباطن', v_billing.organization_id);

    -- إلى ح/ محتجز ضمان مقاولين (Liability)
    IF v_billing.retention_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_retention_sub_acc, 0, v_billing.retention_amount, 'محتجز ضمان مقاول مستخلص ' || v_billing.billing_number, v_billing.organization_id);
    END IF;

    -- إلى ح/ دفعات مقدمة مقاولين (Asset reduction)
    IF v_billing.advance_deduction > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_advance_sub_acc, 0, v_billing.advance_deduction, 'استرداد دفعة مقدمة مقاول مستخلص ' || v_billing.billing_number, v_billing.organization_id);
    END IF;

    -- إلى ح/ الموردين (الصافي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_sub_acc, 0, v_billing.net_amount, 'صافي مستحق لمقاول الباطن', v_billing.organization_id);

    UPDATE public.subcontractor_billings SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_billing_id;
END;
$function$;

-- 8. جداول صرف المواد للمشاريع
CREATE TABLE IF NOT EXISTS public.project_material_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id),
    issue_number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled')),
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_material_issue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID REFERENCES public.project_material_issues(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity NUMERIC(15,3) NOT NULL,
    unit_cost NUMERIC(15,2) -- التكلفة وقت الصرف (FIFO/Average)
);

-- دالة اعتماد صرف المواد وترحيل التكاليف
CREATE OR REPLACE FUNCTION public.fn_approve_material_issue(p_issue_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_issue RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_current_issue_cost NUMERIC(15,2) := 0;
    v_total_budget NUMERIC(15,2);
    v_current_spent NUMERIC(15,2);   
BEGIN
    SELECT * INTO v_issue FROM public.project_material_issues WHERE id = p_issue_id;
    SELECT * INTO v_project FROM public.projects WHERE id = v_issue.project_id;

    -- 🛡️ [Budget Guard] تفعيل درع الميزانية
    -- 1. حساب الميزانية الإجمالية من المقايسة (BOQ)
    SELECT COALESCE(SUM(total_price), 0) INTO v_total_budget 
    FROM public.project_boq WHERE project_id = v_issue.project_id;

    -- إذا لم يتم إدخال مقايسة، نستخدم قيمة العقد كحد أقصى مؤقت
    IF v_total_budget = 0 THEN
        v_total_budget := v_project.contract_value;
    END IF;

    -- 2. حساب إجمالي المصاريف الفعلية المرحلة (من الأستاذ العام)
    SELECT COALESCE(SUM(debit), 0) INTO v_current_spent 
    FROM public.journal_lines WHERE cost_center_id = v_project.cost_center_account_id;

    -- 3. حساب تكلفة إذن الصرف الحالي
    SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_current_issue_cost 
    FROM public.project_material_issue_items WHERE issue_id = p_issue_id;

    -- منع الاعتماد إذا تجاوزت التكلفة الإجمالية الميزانية + 5% هامش أمان
    IF (v_current_spent + v_current_issue_cost) > (v_total_budget * 1.05) THEN
        RAISE EXCEPTION '❌ تم حظر الصرف: إجمالي التكاليف (%) سيتجاوز ميزانية المشروع المخططة (%)', 
            (v_current_spent + v_current_issue_cost), v_total_budget;
    END IF;

    -- 1. إنشاء القيد المحاسبي (بشرط تجاوز فحص الميزانية)
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_issue.issue_date, 'صرف مواد لمشروع: ' || v_project.name, v_issue.issue_number, 'posted', v_issue.organization_id, p_issue_id, 'material_issue', true)
    RETURNING id INTO v_je_id;

    -- 2. إنشاء أسطر القيد (تأمين التوازن المحاسبي)
    -- أ. جانب المدين: تحميل التكلفة على حساب المشروع (مركز التكلفة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project.cost_center_account_id, v_current_issue_cost, 0, 'تحميل تكلفة مواد منصرفة للمشروع: ' || v_project.name, v_issue.organization_id);

    -- ب. جانب الدائن: خصم القيمة من حسابات المخزون (تجميع حسب الحساب المرتبط بالمنتج)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    SELECT 
        v_je_id, 
        COALESCE(p.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_issue.organization_id LIMIT 1)), 
        0, 
        SUM(pmii.quantity * pmii.unit_cost), 
        'إقفال قيمة مواد منصرفة للموقع', 
        v_issue.organization_id
    FROM public.project_material_issue_items pmii
    JOIN public.products p ON pmii.product_id = p.id
    WHERE pmii.issue_id = p_issue_id
    GROUP BY p.inventory_account_id;

    UPDATE public.project_material_issues SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_issue_id;
    
    -- 3. تحديث المخزون عبر المحرك المركزي 🚀
    PERFORM public.recalculate_stock_rpc(v_issue.organization_id);
END;
$function$;

-- 10. جداول التقارير الميدانية (Daily Progress Reports)
CREATE TABLE IF NOT EXISTS public.project_daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    work_description TEXT NOT NULL,
    weather_condition TEXT,
    manpower_count INTEGER DEFAULT 0,
    equipment_status TEXT,
    site_images TEXT[], -- روابط الصور المرفوعة
    reported_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- تفعيل RLS للتقارير
ALTER TABLE public.project_daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaaS_Daily_Report_Isolation" ON public.project_daily_reports;
CREATE POLICY "SaaS_Daily_Report_Isolation" ON public.project_daily_reports 
FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- دالة استرداد محجوز الضمان (Retention Release)
-- 11. جدول استرداد محجوزات الضمان
CREATE TABLE IF NOT EXISTS public.project_retention_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    subcontractor_id UUID REFERENCES public.subcontractors(id) ON DELETE SET NULL, -- اختياري: إذا كان للمقاول
    release_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(15,2) NOT NULL,
    release_type TEXT NOT NULL CHECK (release_type IN ('customer', 'subcontractor')),
    reference_number TEXT,
    status TEXT DEFAULT 'posted',
    notes TEXT,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_retention_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaaS_Retention_Release_Isolation" ON public.project_retention_releases;
CREATE POLICY "SaaS_Retention_Release_Isolation" ON public.project_retention_releases 
FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- دالة استرداد محجوز الضمان (Retention Release) مع القيود المحاسبية
CREATE OR REPLACE FUNCTION public.fn_release_retention(
    p_project_id UUID, 
    p_amount NUMERIC, 
    p_type TEXT, 
    p_notes TEXT,
    p_subcontractor_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_je_id UUID;
    v_project RECORD;
    v_org_id UUID;
    v_cash_acc UUID; -- حساب النقدية/البنك
    v_retention_acc UUID;
BEGIN
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
    v_org_id := v_project.organization_id;

    -- جلب حساب النقدية الافتراضي من الإعدادات
    SELECT (account_mappings->>'CASH')::UUID INTO v_cash_acc 
    FROM public.company_settings WHERE organization_id = v_org_id;

    IF p_type = 'customer' THEN
        -- استلام محجوز ضمان من العميل (أصل متداول)
        -- كود 1249: محتجز ضمان لدى الغير
        v_retention_acc := (SELECT id FROM public.accounts WHERE code = '1249' AND organization_id = v_org_id LIMIT 1);
        
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_type, is_posted)
        VALUES (CURRENT_DATE, 'استرداد محجوز ضمان عميل - مشروع: ' || v_project.name, 'RET-CUST-' || substring(p_project_id::text, 1, 5), 'posted', v_org_id, 'retention_release', true)
        RETURNING id INTO v_je_id;

        -- من ح/ النقدية (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id)
        VALUES (v_je_id, v_cash_acc, p_amount, 0, v_org_id);
        -- إلى ح/ محتجز ضمان عملاء (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id)
        VALUES (v_je_id, v_retention_acc, 0, p_amount, v_org_id);

    ELSE
        -- صرف محجوز ضمان لمقاول باطن (التزام)
        -- كود 2229: محتجز ضمان لمقاولي الباطن
        v_retention_acc := (SELECT id FROM public.accounts WHERE code = '2229' AND organization_id = v_org_id LIMIT 1);

        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_type, is_posted)
        VALUES (CURRENT_DATE, 'رد محجوز ضمان مقاول - مشروع: ' || v_project.name, 'RET-SUB-' || substring(p_project_id::text, 1, 5), 'posted', v_org_id, 'retention_release', true)
        RETURNING id INTO v_je_id;

        -- من ح/ محتجز ضمان مقاولين (مدين)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id)
        VALUES (v_je_id, v_retention_acc, p_amount, 0, v_org_id);
        -- إلى ح/ النقدية (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id)
        VALUES (v_je_id, v_cash_acc, 0, p_amount, v_org_id);
    END IF;

    -- تسجيل العملية في جدول الاستردادات
    INSERT INTO public.project_retention_releases (project_id, subcontractor_id, amount, release_type, notes, related_journal_entry_id, organization_id)
    VALUES (p_project_id, p_subcontractor_id, p_amount, p_type, p_notes, v_je_id, v_org_id);

    RETURN v_je_id;
END;
$function$;

-- 12. جدول الجدولة الزمنية (Project Milestones/Timeline)
CREATE TABLE IF NOT EXISTS public.project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    expected_start_date DATE,
    expected_end_date DATE,
    actual_completion_date DATE,
    progress_percentage NUMERIC(5,2) DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delayed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaaS_Milestones_Isolation" ON public.project_milestones;
CREATE POLICY "SaaS_Milestones_Isolation" ON public.project_milestones 
FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- 9. جداول العهد المالية للمشاريع (Financial Custody)
CREATE TABLE IF NOT EXISTS public.project_custodies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id), -- الموظف المسؤول عن العهدة
    custody_name TEXT NOT NULL, -- اسم العهدة (مثلاً: عهدة نثريات الموقع)
    total_advanced NUMERIC(15,2) DEFAULT 0, -- إجمالي المبلغ المسلم للموظف
    current_balance NUMERIC(15,2) DEFAULT 0, -- الرصيد الحالي
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_custody_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    custody_id UUID REFERENCES public.project_custodies(id) ON DELETE CASCADE,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(15,2) NOT NULL,
    description TEXT NOT NULL,
    category TEXT, -- عمالة، نثريات، نقل، إلخ
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- دالة اعتماد مصروف العهدة وتحميله على المشروع
CREATE OR REPLACE FUNCTION public.fn_approve_custody_expense(p_expense_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_expense RECORD;
    v_custody RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_employee_acc UUID;
    v_total_budget NUMERIC(15,2);
    v_current_spent NUMERIC(15,2);
BEGIN
    SELECT * INTO v_expense FROM public.project_custody_expenses WHERE id = p_expense_id;
    SELECT * INTO v_custody FROM public.project_custodies WHERE id = v_expense.custody_id;
    SELECT * INTO v_project FROM public.projects WHERE id = v_custody.project_id;

    -- 🛡️ [Budget Guard] فحص الميزانية قبل الموافقة على مصروف العهدة
    SELECT COALESCE(SUM(total_price), 0) INTO v_total_budget FROM public.project_boq WHERE project_id = v_custody.project_id;
    
    IF v_total_budget = 0 THEN v_total_budget := v_project.contract_value; END IF;

    SELECT COALESCE(SUM(debit), 0) INTO v_current_spent 
    FROM public.journal_lines WHERE cost_center_id = v_project.cost_center_account_id;

    IF (v_current_spent + v_expense.amount) > (v_total_budget * 1.10) THEN -- سماح بـ 10% للعهد
        RAISE EXCEPTION '⚠️ تجاوز حرج للميزانية! إجمالي المصاريف (%) سيتجاوز سقف المشروع (%).', 
            (v_current_spent + v_expense.amount), v_total_budget;
    END IF;

    -- تحديد حساب عهدة الموظف (نفترض وجود ربط في جدول الموظفين أو كود مالي)
    -- تم التعديل للكود 1224 ليتوافق مع الدليل المصري
    v_employee_acc := (SELECT id FROM public.accounts WHERE code = '1224' AND organization_id = v_expense.organization_id LIMIT 1);

    -- 1. إنشاء القيد المحاسبي
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_expense.expense_date, 'مصروف عهدة: ' || v_expense.description || ' - مشروع ' || v_project.name, 'CUST-' || v_expense.id, 'posted', v_expense.organization_id, p_expense_id, 'custody_expense', true)
    RETURNING id INTO v_je_id;

    -- 2. من ح/ تكاليف المشروع (مركز التكلفة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project.cost_center_account_id, v_expense.amount, 0, v_expense.description, v_expense.organization_id);

    -- 3. إلى ح/ عهد الموظفين (تخفيض العهدة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_employee_acc, 0, v_expense.amount, 'تسوية جزء من عهدة ' || v_custody.custody_name, v_expense.organization_id);

    -- 4. تحديث حالة المصروف ورصيد العهدة
    UPDATE public.project_custody_expenses SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_expense_id;
    UPDATE public.project_custodies SET current_balance = current_balance - v_expense.amount WHERE id = v_expense.custody_id;
END;
$function$;

ALTER TABLE public.project_custodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_custody_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaaS_Custody_Isolation" ON public.project_custodies;
CREATE POLICY "SaaS_Custody_Isolation" ON public.project_custodies FOR ALL TO authenticated USING (organization_id = public.get_my_org());
DROP POLICY IF EXISTS "SaaS_Custody_Exp_Isolation" ON public.project_custody_expenses;
CREATE POLICY "SaaS_Custody_Exp_Isolation" ON public.project_custody_expenses FOR ALL TO authenticated USING (organization_id = public.get_my_org());

GRANT EXECUTE ON FUNCTION public.fn_approve_project_billing(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_sub_billing(UUID) TO authenticated;

-- 4. دالة إنشاء حساب مركز التكلفة للمشروع آلياً
CREATE OR REPLACE FUNCTION public.fn_create_project_account()
RETURNS TRIGGER AS $$
DECLARE
    v_parent_id UUID;
    v_new_account_id UUID;
    v_account_code TEXT;
BEGIN
    -- 1. البحث عن حساب "مشروعات تحت التنفيذ" أو حساب أب للمشاريع
    SELECT id INTO v_parent_id FROM public.accounts 
    WHERE organization_id = NEW.organization_id AND (code = '10303' OR name LIKE '%مشاريع%' OR name LIKE '%Work in Progress%')
    LIMIT 1;

    -- 2. إذا لم يوجد، نستخدم أي حساب تكاليف أو ننشئ حساباً افتراضياً
    IF v_parent_id IS NOT NULL THEN
        v_account_code := (SELECT code FROM public.accounts WHERE id = v_parent_id) || '-' || (SELECT COALESCE(COUNT(*), 0) + 1 FROM public.accounts WHERE parent_id = v_parent_id);
        
        INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active)
        VALUES (NEW.organization_id, 'مشروع: ' || NEW.name, v_account_code, v_parent_id, 'expense', TRUE)
        RETURNING id INTO v_new_account_id;

        -- تحديث المشروع بربطه بالحساب المالي الجديد
        UPDATE public.projects SET cost_center_account_id = v_new_account_id WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تفعيل التريجر
DROP TRIGGER IF EXISTS trg_after_project_insert ON public.projects;
CREATE TRIGGER trg_after_project_insert
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.fn_create_project_account();

-- 📊 رؤية ملخص مالي للمشاريع (Project Financial Summary View)
-- هذه الرؤية تمهد الطريق لبناء "لوحة تحكم الربحية"
CREATE OR REPLACE VIEW public.v_project_profitability AS
SELECT 
    p.id AS project_id,
    p.name AS project_name,
    p.contract_value,
    p.organization_id,
    -- إجمالي الإيرادات (المستخلصات المعتمدة)
    COALESCE((SELECT SUM(gross_amount) FROM public.project_progress_billings WHERE project_id = p.id AND status = 'approved'), 0) AS total_revenue,
    -- إجمالي التكاليف الفعلية (من الأستاذ العام المرتبط بمركز التكلفة)
    COALESCE((SELECT SUM(debit) FROM public.journal_lines WHERE account_id = p.cost_center_account_id), 0) AS total_actual_costs,
    -- تكلفة المواد المنصرفة فقط
    COALESCE((SELECT SUM(pmii.quantity * pmii.unit_cost) 
              FROM public.project_material_issue_items pmii 
              JOIN public.project_material_issues pmi ON pmii.issue_id = pmi.id 
              WHERE pmi.project_id = p.id AND pmi.status = 'approved'), 0) AS material_costs,
    -- الربح الحالي
    (COALESCE((SELECT SUM(gross_amount) FROM public.project_progress_billings WHERE project_id = p.id AND status = 'approved'), 0) - 
     COALESCE((SELECT SUM(debit) FROM public.journal_lines WHERE account_id = p.cost_center_account_id), 0)) AS current_profit,
    -- نسبة الإنجاز المالي
    CASE WHEN p.contract_value > 0 THEN 
        ROUND((COALESCE((SELECT SUM(gross_amount) FROM public.project_progress_billings WHERE project_id = p.id AND status = 'approved'), 0) / p.contract_value) * 100, 2)
    ELSE 0 END AS financial_completion_pct
FROM public.projects p;

COMMENT ON TABLE public.projects IS 'إدارة مشاريع المقاولات مع دعم العزل الكامل للبيانات';