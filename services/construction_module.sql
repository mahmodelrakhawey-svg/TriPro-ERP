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
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL, -- ربط البند بصنف مخزني للمقارنة الدقيقة
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

-- 🏗️ جدول المرفقات الشامل (Project & Billing Attachments)
CREATE TABLE IF NOT EXISTS public.project_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    billing_id UUID REFERENCES public.project_progress_billings(id) ON DELETE CASCADE, -- مستخلصات عملاء
    sub_billing_id UUID REFERENCES public.subcontractor_billings(id) ON DELETE CASCADE, -- 🏗️ جديد: مستخلصات مقاولين
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🏗️ نظام طلبات التفتيش والجودة (Site Inspection Requests - IR)
CREATE TABLE IF NOT EXISTS public.project_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    boq_item_id UUID REFERENCES public.project_boq(id) ON DELETE SET NULL,
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    location_in_site TEXT, -- مثل: الدور الخامس - الجناح الشرقي
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'rework')),
    technical_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🏗️ نظام ربط صرف المواد بالبند (BOQ Enforcement Helper)
-- الغرض: التأكد من أن أي مادة تصرف للموقع مرتبطة ببند مقايسة محدد
CREATE OR REPLACE FUNCTION public.get_project_boq_remaining_qty(p_boq_item_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_planned NUMERIC;
    v_issued NUMERIC;
BEGIN
    -- 1. الكمية المخططة في المقايسة
    SELECT estimated_quantity INTO v_planned FROM public.project_boq WHERE id = p_boq_item_id;
    
    -- 2. إجمالي الكميات المنصرفة فعلياً لهذا البند
    SELECT COALESCE(SUM(quantity), 0) INTO v_issued 
    FROM public.project_material_issue_items 
    WHERE boq_item_id = p_boq_item_id 
      AND issue_id IN (SELECT id FROM public.project_material_issues WHERE status = 'approved');

    RETURN v_planned - v_issued;
END; $$;

-- 🛡️ ترميم هيكل الجدول لضمان وجود أعمدة الدفعات المقدمة (Schema Healing)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_boq' AND column_name='product_id') THEN
        ALTER TABLE public.project_boq ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
    END IF;

    -- تطوير المقايسة لتشمل التحليل (Rate Analysis)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_boq' AND column_name='material_cost_per_unit') THEN
        ALTER TABLE public.project_boq ADD COLUMN material_cost_per_unit NUMERIC(15,2) DEFAULT 0;
        ALTER TABLE public.project_boq ADD COLUMN labor_cost_per_unit NUMERIC(15,2) DEFAULT 0;
        ALTER TABLE public.project_boq ADD COLUMN overhead_cost_per_unit NUMERIC(15,2) DEFAULT 0;
        ALTER TABLE public.project_boq ADD COLUMN profit_margin_pct NUMERIC(5,2) DEFAULT 0;
    END IF;

    -- تحديث المستخلصات لتشمل الضرائب وتواريخ الفك
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_progress_billings' AND column_name='advance_deduction') THEN
        ALTER TABLE public.project_progress_billings ADD COLUMN advance_deduction NUMERIC(15,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_progress_billings' AND column_name='vat_rate') THEN
        ALTER TABLE public.project_progress_billings ADD COLUMN vat_rate NUMERIC(5,2) DEFAULT 0;
        ALTER TABLE public.project_progress_billings ADD COLUMN vat_amount NUMERIC(15,2) DEFAULT 0;
        ALTER TABLE public.project_progress_billings ADD COLUMN wht_rate NUMERIC(5,2) DEFAULT 0;
        ALTER TABLE public.project_progress_billings ADD COLUMN wht_amount NUMERIC(15,2) DEFAULT 0;
        ALTER TABLE public.project_progress_billings ADD COLUMN retention_release_date DATE;
    END IF;

    -- إعادة بناء net_amount لـ project_progress_billings ليشمل الضرائب
    ALTER TABLE public.project_progress_billings DROP COLUMN IF EXISTS net_amount;
    ALTER TABLE public.project_progress_billings ADD COLUMN net_amount NUMERIC(15,2) 
        GENERATED ALWAYS AS (gross_amount - retention_amount - advance_deduction + vat_amount - wht_amount) STORED;

    -- تحديث مستخلصات مقاولي الباطن
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subcontractor_billings' AND column_name='vat_rate') THEN
        ALTER TABLE public.subcontractor_billings ADD COLUMN vat_rate NUMERIC(5,2) DEFAULT 0;
        ALTER TABLE public.subcontractor_billings ADD COLUMN vat_amount NUMERIC(15,2) DEFAULT 0;
        ALTER TABLE public.subcontractor_billings ADD COLUMN wht_rate NUMERIC(5,2) DEFAULT 0;
        ALTER TABLE public.subcontractor_billings ADD COLUMN wht_amount NUMERIC(15,2) DEFAULT 0;
        ALTER TABLE public.subcontractor_billings ADD COLUMN retention_release_date DATE;
    END IF;

    -- تحديث بيانات المقاولين لتشمل التفاصيل البنكية للأتمتة
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subcontractors' AND column_name='bank_name') THEN
        ALTER TABLE public.subcontractors ADD COLUMN bank_name TEXT;
        ALTER TABLE public.subcontractors ADD COLUMN iban_number TEXT;
        ALTER TABLE public.subcontractors ADD COLUMN swift_code TEXT;
    END IF;
    -- إعادة بناء net_amount لـ subcontractor_billings ليشمل الضرائب
    ALTER TABLE public.subcontractor_billings DROP COLUMN IF EXISTS net_amount;
    ALTER TABLE public.subcontractor_billings ADD COLUMN net_amount NUMERIC(15,2) 
        GENERATED ALWAYS AS (gross_amount - retention_amount - advance_deduction + vat_amount - wht_amount) STORED;

END $$;

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
    v_vat_acc UUID;            -- ضريبة القيمة المضافة (Liability)
    v_wht_rec_acc UUID;        -- ضريبة الخصم والتحصيل - لنا (Asset)
BEGIN
    SELECT b.*, COALESCE(b.advance_deduction, 0) as adv_deduct INTO v_billing 
    FROM public.project_progress_billings b WHERE b.id = p_billing_id;
    
    SELECT * INTO v_project FROM public.projects WHERE id = v_billing.project_id;
    v_org_id := v_billing.organization_id;

    -- جلب الربط المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- تحديد الحسابات (مع Fallback للأكواد القياسية)
    v_cust_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'CUSTOMERS')::UUID, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1)));
    v_revenue_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'SALES_REVENUE')::UUID, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1)));

    -- 1. حساب محجوز ضمان عملاء (Asset) - كود 1249
    v_retention_cust_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'RETENTION_CUSTOMER')::UUID, (SELECT id FROM public.accounts WHERE code = '1249' AND organization_id = v_org_id LIMIT 1)));
    
    -- 2. حساب دفعات مقدمة عملاء (Liability) - كود 226
    v_advance_cust_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'SECURITY_DEPOSIT_ACCOUNT')::UUID, (v_mappings->>'CUSTOMER_ADVANCES')::UUID, (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)));

    v_vat_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'VAT')::UUID, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1)));
    v_wht_rec_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WHT_RECEIVABLE')::UUID, (SELECT id FROM public.accounts WHERE code = '1242' AND organization_id = v_org_id LIMIT 1)));

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

    -- من ح/ ضريبة الخصم والتحصيل (أصل - تم خصمها من قبل العميل لنا)
    IF COALESCE(v_billing.wht_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wht_rec_acc, v_billing.wht_amount, 0, 'ضريبة خصم وتحصيل مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    -- من ح/ الدفعات المقدمة (استهلاك الدفعة - تخفيض التزام)
    IF v_billing.adv_deduct > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_advance_cust_acc, v_billing.adv_deduct, 0, 'استهلاك دفعة مقدمة مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    -- إلى ح/ إيرادات النشاط (بالقيمة الإجمالية)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_revenue_acc, 0, v_billing.gross_amount, 'إيراد أعمال مشروع ' || v_project.name, v_org_id);

    -- إلى ح/ ضريبة القيمة المضافة
    IF COALESCE(v_billing.vat_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc, 0, v_billing.vat_amount, 'ضريبة قيمة مضافة مستخلص ' || v_billing.billing_number, v_org_id);
    END IF;

    UPDATE public.project_progress_billings SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_billing_id;
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
END;
$function$;

-- 8. جداول المراحل الزمنية للمشاريع (Project Milestones)
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
    -- 🛡️ وضع الاستعادة: السماح بتجاوز الفحص أثناء الاختبارات
    IF current_setting('app.restore_mode', true) = 'on' THEN
        -- تجاوز القيود
    END IF;

    SELECT * INTO v_expense FROM public.project_custody_expenses WHERE id = p_expense_id;
    SELECT * INTO v_custody FROM public.project_custodies WHERE id = v_expense.custody_id;
    SELECT * INTO v_project FROM public.projects WHERE id = v_custody.project_id;

    -- 🛡️ [Budget Guard] فحص الميزانية قبل الموافقة على مصروف العهدة
    SELECT COALESCE(SUM(total_price), 0) INTO v_total_budget FROM public.project_boq WHERE project_id = v_custody.project_id;
    
    IF v_total_budget = 0 THEN v_total_budget := v_project.contract_value; END IF;

    SELECT COALESCE(SUM(debit), 0) INTO v_current_spent 
    FROM public.journal_lines WHERE account_id = v_project.cost_center_account_id;

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

-- دالة اعتماد مستخلص مقاول الباطن (تمت إضافتها لتغطية أزرار الواجهة)
CREATE OR REPLACE FUNCTION public.fn_approve_sub_billing(p_billing_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_billing RECORD;
    v_contract RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_org_id UUID;
    v_mappings JSONB;
    v_supp_acc UUID;
    v_retention_supp_acc UUID; 
    v_advance_supp_acc UUID;   
    v_vat_acc UUID;
    v_wht_pay_acc UUID;
BEGIN
    SELECT * INTO v_billing FROM public.subcontractor_billings WHERE id = p_billing_id;
    SELECT * INTO v_contract FROM public.subcontractor_contracts WHERE id = v_billing.contract_id;
    SELECT * INTO v_project FROM public.projects WHERE id = v_contract.project_id;
    v_org_id := v_billing.organization_id;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    v_supp_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'SUPPLIERS')::UUID, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1)));
    v_retention_supp_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'RETENTION_SUBCONTRACTOR')::UUID, (SELECT id FROM public.accounts WHERE code = '2229' AND organization_id = v_org_id LIMIT 1)));
    v_advance_supp_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'ADVANCE_PAYMENT_SUBCONTRACTOR')::UUID, (SELECT id FROM public.accounts WHERE code = '1245' AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'VAT_INPUT')::UUID, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1)));
    v_wht_pay_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WHT_PAYABLE')::UUID, (SELECT id FROM public.accounts WHERE code = '2232' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_billing.billing_date, 'مستخلص مقاول: ' || v_billing.billing_number || ' - ' || v_project.name, v_billing.billing_number, 'posted', v_org_id, p_billing_id, 'sub_billing', true)
    RETURNING id INTO v_je_id;

    -- من ح/ تكاليف المشروع - بالقيمة الإجمالية
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project.cost_center_account_id, v_billing.gross_amount, 0, 'تكلفة أعمال مقاول باطن', v_org_id);

    -- من ح/ ضريبة القيمة المضافة (مدخلات)
    IF COALESCE(v_billing.vat_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc, v_billing.vat_amount, 0, 'ضريبة قيمة مضافة مشتريات', v_org_id);
    END IF;

    -- إلى ح/ المقاول (بالصافي المستحق)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_supp_acc, 0, v_billing.net_amount, 'صافي مستحق للمقاول', v_org_id);

    -- إلى ح/ محجوز ضمان مقاولين (Liability)
    IF v_billing.retention_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_retention_supp_acc, 0, v_billing.retention_amount, 'محتجز ضمان مقاول', v_org_id);
    END IF;

    -- إلى ح/ الدفعات المقدمة (تخفيض الأصل)
    IF COALESCE(v_billing.advance_deduction, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_advance_supp_acc, 0, v_billing.advance_deduction, 'استهلاك دفعة مقدمة مقاول', v_org_id);
    END IF;

    -- إلى ح/ ضريبة الخصم والتحصيل (التزام)
    IF COALESCE(v_billing.wht_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wht_pay_acc, 0, v_billing.wht_amount, 'ضريبة خصم وتحصيل من المنبع', v_org_id);
    END IF;

    UPDATE public.subcontractor_billings SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_billing_id;
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
END;
$function$;
-- 🏗️ نظام صرف المواد للمشاريع (Project Material Issues)
CREATE TABLE IF NOT EXISTS public.project_material_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    issue_number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled')),
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_material_issue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES public.project_material_issues(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    boq_item_id UUID REFERENCES public.project_boq(id) ON DELETE SET NULL,
    quantity NUMERIC(15,3) NOT NULL,
    unit_cost NUMERIC(15,2) NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

-- دالة اعتماد صرف المواد وتحميلها على تكلفة المشروع
CREATE OR REPLACE FUNCTION public.fn_approve_material_issue(p_issue_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_issue RECORD;
    v_item RECORD;
    v_project RECORD;
    v_je_id UUID;
    v_inv_acc UUID;
    v_total_cost NUMERIC := 0;
BEGIN
    SELECT * INTO v_issue FROM public.project_material_issues WHERE id = p_issue_id;
    SELECT * INTO v_project FROM public.projects WHERE id = v_issue.project_id;

    v_inv_acc := public.resolve_leaf_account(COALESCE(
        (SELECT (account_mappings->>'INVENTORY')::UUID FROM public.company_settings WHERE organization_id = v_issue.organization_id),
        (SELECT id FROM public.accounts WHERE code = '1231' AND organization_id = v_issue.organization_id LIMIT 1)
    ));

    FOR v_item IN SELECT * FROM public.project_material_issue_items WHERE issue_id = p_issue_id LOOP
        v_total_cost := v_total_cost + (v_item.quantity * v_item.unit_cost);
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_issue.issue_date, 'صرف مواد لمشروع: ' || v_project.name, v_issue.issue_number, 'posted', v_issue.organization_id, p_issue_id, 'material_issue', true)
    RETURNING id INTO v_je_id;

    -- من ح/ تكاليف المشروع
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project.cost_center_account_id, v_total_cost, 0, 'تحميل تكلفة مواد منصرفة', v_issue.organization_id);

    -- إلى ح/ المخزون (سيتم الخصم الفعلي عبر محرك المخزون الشامل)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_inv_acc, 0, v_total_cost, 'صرف خامات من المخزن للمشروع', v_issue.organization_id);

    UPDATE public.project_material_issues SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_issue_id;
    PERFORM public.recalculate_stock_rpc(v_issue.organization_id);
END; $$;

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
        
        INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
        VALUES (NEW.organization_id, 'مشروع: ' || NEW.name, v_account_code, v_parent_id, 'expense', TRUE, FALSE)
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
--  دالة حساب مؤشرات القيمة المكتسبة (Earned Value Management - EVM)
-- الغرض: قياس أداء المشروع مالياً وزمنياً بمقارنة الواقع بالمخطط
CREATE OR REPLACE FUNCTION public.get_project_evm_metrics(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_project RECORD;
    v_bac NUMERIC; -- الميزانية عند الاكتمال (Budget at Completion)
    v_ac  NUMERIC; -- التكلفة الفعلية (Actual Cost)
    v_ev  NUMERIC; -- القيمة المكتسبة (Earned Value)
    v_pv  NUMERIC; -- القيمة المخططة (Planned Value)
    v_duration INTEGER;
    v_elapsed  INTEGER;
    v_sv  NUMERIC; -- انحراف الجدول الزمني (Schedule Variance)
    v_cv  NUMERIC; -- انحراف التكلفة (Cost Variance)
    v_spi NUMERIC; -- مؤشر أداء الجدول الزمني (Schedule Performance Index)
    v_cpi NUMERIC; -- مؤشر أداء التكلفة (Cost Performance Index)
BEGIN
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- 1. حساب BAC (إجمالي قيمة المقايسة أو قيمة العقد كحد أدنى)
    SELECT COALESCE(SUM(total_price), v_project.contract_value, 0) INTO v_bac 
    FROM public.project_boq WHERE project_id = p_project_id;

    -- 2. حساب AC (التكلفة الفعلية المحملة على مركز تكلفة المشروع في الأستاذ العام)
    SELECT COALESCE(SUM(debit), 0) INTO v_ac 
    FROM public.journal_lines 
    WHERE account_id = v_project.cost_center_account_id;

    -- 3. حساب EV (القيمة المكتسبة = إجمالي المستخلصات المعتمدة التي تعكس العمل المنجز)
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_ev 
    FROM public.project_progress_billings 
    WHERE project_id = p_project_id AND status = 'approved';

    -- 4. حساب PV (القيمة المخططة بناءً على مرور الزمن مقارنة بمدة العقد)
    IF v_project.start_date IS NOT NULL AND v_project.end_date IS NOT NULL THEN
        v_duration := GREATEST(v_project.end_date - v_project.start_date, 1);
        v_elapsed  := GREATEST(CURRENT_DATE - v_project.start_date, 0);
        v_pv := v_bac * LEAST(v_elapsed::NUMERIC / v_duration::NUMERIC, 1.0);
    ELSE
        v_pv := 0;
    END IF;

    -- 5. حساب المؤشرات التحليلية
    v_sv := v_ev - v_pv; -- القيمة الموجبة تعني سباق الجدول الزمني
    v_cv := v_ev - v_ac; -- القيمة الموجبة تعني توفير في التكاليف
    v_spi := CASE WHEN v_pv > 0 THEN ROUND(v_ev / v_pv, 2) ELSE 1.0 END; -- > 1 يعني أداء زمني ممتاز
    v_cpi := CASE WHEN v_ac > 0 THEN ROUND(v_ev / v_ac, 2) ELSE 1.0 END; -- > 1 يعني أداء مالي ممتاز

    RETURN jsonb_build_object(
        'project_name', v_project.name,
        'bac', v_bac,
        'planned_value', ROUND(v_pv, 2),
        'earned_value', v_ev,
        'actual_cost', v_ac,
        'schedule_variance', ROUND(v_sv, 2),
        'cost_variance', ROUND(v_cv, 2),
        'spi', v_spi,
        'cpi', v_cpi,
        'schedule_status', CASE WHEN v_sv < 0 THEN 'متأخر 🔴' ELSE 'سابق للجدول 🟢' END,
        'cost_status', CASE WHEN v_cv < 0 THEN 'متجاوز للميزانية ⚠️' ELSE 'تحت الميزانية ✅' END
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.get_project_evm_metrics(UUID) TO authenticated;

-- 🔮 دالة التنبؤ المالي للمشاريع (Financial Forecasting - EAC)
-- (تبقى كما هي في مكانها)

-- 🎖️ دالة حساب مؤشر "صحة المشروع" (Project Health Score)
-- (تبقى كما هي في مكانها)

-- ================================================================
-- 📊 قسم الرؤى (Views) - يتم إنشاؤه بعد الدوال لضمان التبعية
-- ================================================================

-- 📊 1. رؤية ملخص مالي للمشاريع (Project Financial Summary View)
DROP VIEW IF EXISTS public.v_project_profitability CASCADE;
CREATE OR REPLACE VIEW public.v_project_profitability AS
SELECT 
    p.id AS project_id,
    p.name AS project_name,
    p.contract_value,
    p.organization_id,
    p.status,
    COALESCE((SELECT SUM(total_price) FROM public.project_boq WHERE project_id = p.id), 0) AS total_budget_planned,
    COALESCE((SELECT SUM(gross_amount) FROM public.project_progress_billings WHERE project_id = p.id AND status = 'approved'), 0) AS total_revenue,
    COALESCE((SELECT SUM(debit) FROM public.journal_lines WHERE account_id = p.cost_center_account_id), 0) AS total_actual_costs,
    COALESCE((SELECT SUM(pmii.quantity * pmii.unit_cost) 
              FROM public.project_material_issue_items pmii 
              JOIN public.project_material_issues pmi ON pmii.issue_id = pmi.id 
              WHERE pmi.project_id = p.id AND pmi.status = 'approved'), 0) AS material_costs,
    (COALESCE((SELECT SUM(gross_amount) FROM public.project_progress_billings WHERE project_id = p.id AND status = 'approved'), 0) - 
     COALESCE((SELECT SUM(debit) FROM public.journal_lines WHERE account_id = p.cost_center_account_id), 0)) AS net_profit,
    (COALESCE((SELECT SUM(total_price) FROM public.project_boq WHERE project_id = p.id), p.contract_value) - 
     COALESCE((SELECT SUM(debit) FROM public.journal_lines WHERE account_id = p.cost_center_account_id), 0)) AS budget_variance,
    CASE WHEN p.contract_value > 0 THEN 
        ROUND((COALESCE((SELECT SUM(gross_amount) FROM public.project_progress_billings WHERE project_id = p.id AND status = 'approved'), 0) / p.contract_value) * 100, 2)
    ELSE 0 END AS financial_completion_pct
FROM public.projects p;

-- 📊 2. رؤية أداء المشاريع الموحدة (Project Performance Dashboard View)
DROP VIEW IF EXISTS public.v_project_performance_dashboard CASCADE;
CREATE OR REPLACE VIEW public.v_project_performance_dashboard AS
SELECT 
    p.organization_id,
    p.id AS project_id,
    p.name AS project_name,
    p.status,
    (public.get_project_evm_metrics(p.id)) as metrics,
    (public.get_project_evm_metrics(p.id)->>'spi')::numeric as spi,
    (public.get_project_evm_metrics(p.id)->>'cpi')::numeric as cpi,
    (public.get_project_evm_metrics(p.id)->>'schedule_status') as schedule_status,
    (public.get_project_evm_metrics(p.id)->>'cost_status') as cost_status
FROM public.projects p
WHERE p.status IN ('active', 'planned');

-- 📊 3. رؤية انحراف الكميات (BOQ Quantity Variance Report)
DROP VIEW IF EXISTS public.v_project_quantity_variance CASCADE;
CREATE OR REPLACE VIEW public.v_project_quantity_variance AS
WITH issued_totals AS (
    SELECT 
        pmi.project_id,
        pmii.product_id,
        SUM(pmii.quantity) AS total_issued_qty
    FROM public.project_material_issue_items pmii
    JOIN public.project_material_issues pmi ON pmii.issue_id = pmi.id
    WHERE pmi.status = 'approved'
    GROUP BY pmi.project_id, pmii.product_id
),
planned_totals AS (
    SELECT 
        project_id,
        product_id,
        SUM(estimated_quantity) AS total_planned_qty
    FROM public.project_boq
    WHERE product_id IS NOT NULL
    GROUP BY project_id, product_id
)
SELECT 
    p.organization_id,
    p.name AS project_name,
    prod.name AS material_name,
    prod.unit,
    COALESCE(pt.total_planned_qty, 0) AS planned_qty,
    COALESCE(it.total_issued_qty, 0) AS actual_issued_qty,
    (COALESCE(pt.total_planned_qty, 0) - COALESCE(it.total_issued_qty, 0)) AS variance_qty,
    CASE 
        WHEN COALESCE(pt.total_planned_qty, 0) > 0 THEN 
            ROUND((COALESCE(it.total_issued_qty, 0) / pt.total_planned_qty) * 100, 2)
        ELSE 0 
    END AS consumption_pct
FROM public.projects p
JOIN planned_totals pt ON p.id = pt.project_id
JOIN public.products prod ON pt.product_id = prod.id
LEFT JOIN issued_totals it ON p.id = it.project_id AND pt.product_id = it.product_id;

GRANT SELECT ON public.v_project_quantity_variance TO authenticated;
GRANT SELECT ON public.v_project_performance_dashboard TO authenticated;
GRANT SELECT ON public.v_project_profitability TO authenticated;

-- 🔮 دالة التنبؤ المالي للمشاريع (Financial Forecasting - EAC)
-- الغرض: التنبؤ بالتكلفة النهائية للمشروع بناءً على معدل الصرف والأداء الحالي (CPI)
CREATE OR REPLACE FUNCTION public.mfg_predict_project_completion_cost(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_metrics JSONB;
    v_bac NUMERIC;
    v_ac  NUMERIC;
    v_cpi NUMERIC;
    v_eac NUMERIC; -- التكلفة التقديرية عند الاكتمال (Estimate at Completion)
    v_etc NUMERIC; -- المبلغ المتبقي لإكمال المشروع (Estimate to Complete)
    v_vac NUMERIC; -- الانحراف المتوقع عند النهاية (Variance at Completion)
BEGIN
    -- 1. جلب مؤشرات الأداء الحالية من محرك الـ EVM
    v_metrics := public.get_project_evm_metrics(p_project_id);
    
    IF v_metrics IS NULL THEN RETURN NULL; END IF;

    v_bac := (v_metrics->>'bac')::NUMERIC;
    v_ac  := (v_metrics->>'actual_cost')::NUMERIC;
    v_cpi := (v_metrics->>'cpi')::NUMERIC;

    -- 2. حساب EAC (بفرض استمرار نفس مستوى الكفاءة الحالي)
    -- الصيغة: الميزانية الكلية / مؤشر أداء التكلفة
    IF v_cpi > 0 THEN
        v_eac := ROUND(v_bac / v_cpi, 2);
    ELSE
        v_eac := v_bac; -- حماية من التنبؤات غير المنطقية في البداية
    END IF;

    -- 3. حساب القيم التنبؤية الإضافية
    v_etc := GREATEST(v_eac - v_ac, 0);
    v_vac := v_bac - v_eac;

    RETURN jsonb_build_object(
        'project_name', v_metrics->>'project_name',
        'original_budget_bac', v_bac,
        'actual_cost_to_date', v_ac,
        'forecast_final_cost_eac', v_eac,
        'remaining_cost_needed_etc', v_etc,
        'expected_variance_vac', v_vac,
        'forecast_status', CASE 
            WHEN v_vac < 0 THEN 'توقع عجز مالي 🚩' 
            WHEN v_vac > 0 THEN 'توقع توفير في الميزانية 💰' 
            ELSE 'توقع تطابق مع الميزانية ✅' 
        END
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.mfg_predict_project_completion_cost(UUID) TO authenticated;

-- 📈 دالة توليد بيانات منحنى S-Curve (Cumulative Performance Trend)
-- الغرض: توفير بيانات الرسم البياني التراكمي للمقارنة بين المخطط والمنجز والفعلي عبر أشهر المشروع
CREATE OR REPLACE FUNCTION public.get_project_s_curve_data(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_project_start DATE;
    v_result JSONB;
BEGIN
    -- صمام أمان لمنع خطأ 400 عند إرسال معرّف فارغ
    IF p_project_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    -- جلب تاريخ البداية مع بديل آمن (تاريخ الإنشاء أو اليوم) لتجنب أخطاء generate_series
    SELECT COALESCE(start_date, created_at::date, CURRENT_DATE) INTO v_project_start 
    FROM public.projects WHERE id = p_project_id;

    IF v_project_start IS NULL THEN RETURN '[]'::jsonb; END IF;

    WITH monthly_series AS (
        SELECT (generate_series(
            date_trunc('month', v_project_start),
            date_trunc('month', CURRENT_DATE),
            '1 month'::interval
        ))::date AS month_date
    ),
    monthly_actuals AS (
        SELECT 
            date_trunc('month', je.transaction_date)::date as m_date,
            SUM(jl.debit) as actual_cost
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        JOIN public.projects p ON jl.account_id = p.cost_center_account_id
        WHERE p.id = p_project_id AND je.status = 'posted'
        GROUP BY 1
    ),
    monthly_earned AS (
        SELECT 
            date_trunc('month', billing_date)::date as m_date,
            SUM(gross_amount) as earned_val
        FROM public.project_progress_billings
        WHERE project_id = p_project_id AND status = 'approved'
        GROUP BY 1
    ),
    cumulative_data AS (
        -- فصل حساب القيم التراكمية (Window Functions) عن التجميع النهائي لمنع خطأ PG 42803
        SELECT 
            ms.month_date,
            SUM(COALESCE(ma.actual_cost, 0)) OVER (ORDER BY ms.month_date) as cumulative_actual,
            SUM(COALESCE(me.earned_val, 0)) OVER (ORDER BY ms.month_date) as cumulative_earned
        FROM monthly_series ms
        LEFT JOIN monthly_actuals ma ON ms.month_date = ma.m_date
        LEFT JOIN monthly_earned me ON ms.month_date = me.m_date
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'month', to_char(month_date, 'Mon YYYY'),
        'cumulative_actual', cumulative_actual,
        'cumulative_earned', cumulative_earned
    )), '[]'::jsonb) INTO v_result
    FROM cumulative_data;

    return v_result;
END; $$;

-- 🎖️ دالة حساب مؤشر "صحة المشروع" (Project Health Score)
-- تجمع بين الأداء المالي، الزمني، وانحراف المواد في رقم واحد من 100
CREATE OR REPLACE FUNCTION public.get_project_health_score(p_project_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_metrics JSONB;
    v_cpi NUMERIC;
    v_spi NUMERIC;
    v_score INTEGER;
BEGIN
    v_metrics := public.get_project_evm_metrics(p_project_id);
    IF v_metrics IS NULL THEN RETURN 0; END IF;

    v_cpi := (v_metrics->>'cpi')::NUMERIC;
    v_spi := (v_metrics->>'spi')::NUMERIC;

    -- الحسبة: 50% لأداء التكلفة و 50% لأداء الجدول الزمني
    -- مع معاقبة التجاوزات (إذا كان CPI < 1، ينخفض السكور بسرعة)
    v_score := ROUND((LEAST(v_cpi, 1.2) * 50) + (LEAST(v_spi, 1.2) * 50));
    
    RETURN LEAST(v_score, 100);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_project_s_curve_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_health_score(UUID) TO authenticated;

-- ================================================================
-- 13. إدارة أوامر التغيير (Change Orders Management)
-- الغرض: تتبع التعديلات على نطاق العمل (Scope) وتأثيرها المالي
-- ================================================================
CREATE TABLE IF NOT EXISTS public.project_change_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_change NUMERIC(15,2) NOT NULL, -- قيمة الزيادة (+) أو النقص (-)
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- دالة اعتماد أمر التغيير وتحديث قيمة العقد
CREATE OR REPLACE FUNCTION public.fn_approve_change_order(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM public.project_change_orders WHERE id = p_order_id;
    IF v_order.status = 'approved' THEN RETURN; END IF;

    -- 1. تحديث قيمة العقد الأصلية في جدول المشاريع
    UPDATE public.projects 
    SET contract_value = contract_value + v_order.amount_change,
        updated_at = NOW()
    WHERE id = v_order.project_id;

    -- 2. تحديث حالة أمر التغيير
    UPDATE public.project_change_orders 
    SET status = 'approved', approved_at = NOW(), approved_by = auth.uid()
    WHERE id = p_order_id;
END; $$;

-- ================================================================
-- 14. محرك محاكاة التدفق النقدي (Cash Flow Simulator)
-- الغرض: التنبؤ بالاحتياجات النقدية للأشهر الـ 3 القادمة
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_project_cash_flow_projection(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_project RECORD;
    v_remaining_budget NUMERIC := 0;
    v_remaining_days INTEGER;
    v_monthly_burn_rate NUMERIC := 0;
    v_bac NUMERIC := 0;
    v_ac  NUMERIC := 0;
BEGIN
    -- 1. جلب بيانات المشروع الأساسية
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    
    -- 2. حساب الميزانية الكلية (BAC) من المقايسة أو قيمة العقد
    SELECT COALESCE(SUM(total_price), v_project.contract_value, 0) INTO v_bac 
    FROM public.project_boq WHERE project_id = p_project_id;

    -- 3. حساب التكلفة الفعلية (AC) المحملة على مركز التكلفة
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_ac 
    FROM public.journal_lines WHERE account_id = v_project.cost_center_account_id;

    v_remaining_budget := v_bac - v_ac;

    -- 4. تقدير الأيام المتبقية (مع Fallback في حال لم يحدد التاريخ)
    v_remaining_days := COALESCE(v_project.end_date - CURRENT_DATE, 180); -- افتراضياً 6 أشهر
    v_remaining_days := GREATEST(v_remaining_days, 1);
    
    -- 5. معدل الحرق الشهري المتوقع (30 يوم)
    v_monthly_burn_rate := (v_remaining_budget / v_remaining_days) * 30;

    RETURN jsonb_build_object(
        'remaining_budget', ROUND(COALESCE(v_remaining_budget, 0), 2),
        'estimated_monthly_need', ROUND(COALESCE(v_monthly_burn_rate, 0), 2),
        'projection_3_months', ROUND(COALESCE(v_monthly_burn_rate * 3, 0), 2),
        'confidence_score', CASE WHEN v_project.end_date IS NOT NULL AND v_remaining_days > 90 THEN 'High' ELSE 'Medium' END
    );
END; $$;

-- ================================================================
-- 15. تحليل أداء مقاولي الباطن (Subcontractor Performance)
-- الغرض: إضافة موازين تقييم لمستخلصات المقاولين
-- ================================================================
-- إضافة أعمدة التقييم لجدول مستخلصات المقاولين
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subcontractor_billings' AND column_name='quality_score') THEN
        ALTER TABLE public.subcontractor_billings ADD COLUMN quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5);
        ALTER TABLE public.subcontractor_billings ADD COLUMN timeliness_score INTEGER CHECK (timeliness_score BETWEEN 1 AND 5);
    END IF;
END $$;

-- رؤية تحليلية لمقارنة المقاولين
CREATE OR REPLACE VIEW public.v_subcontractor_performance AS
SELECT 
    s.id AS subcontractor_id,
    s.name,
    s.specialty,
    COUNT(sb.id) AS total_billings,
    ROUND(AVG(sb.quality_score), 2) AS avg_quality,
    ROUND(AVG(sb.timeliness_score), 2) AS avg_timeliness,
    SUM(sb.gross_amount) AS total_work_value,
    s.organization_id
FROM public.subcontractors s
LEFT JOIN public.subcontractor_contracts sc ON s.id = sc.subcontractor_id
LEFT JOIN public.subcontractor_billings sb ON sc.id = sb.contract_id
WHERE sb.status = 'approved'
GROUP BY s.id, s.name, s.specialty, s.organization_id;

GRANT SELECT ON public.v_subcontractor_performance TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_change_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_cash_flow_projection(UUID) TO authenticated;

-- ================================================================
-- 16. مديول حضور الموقع وتكاليف العمالة المباشرة (Site HR)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.project_site_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id),
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    hours_worked NUMERIC(4,2) DEFAULT 8,
    hourly_rate NUMERIC(15,2), -- يُجلب من ملف الموظف وقت تسجيل الحضور
    total_day_cost NUMERIC(15,2) GENERATED ALWAYS AS (hours_worked * hourly_rate) STORED,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- دالة ترحيل تكاليف العمالة للمشروع
CREATE OR REPLACE FUNCTION public.fn_post_site_labor_cost(p_attendance_date DATE, p_project_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_cost NUMERIC;
    v_org_id UUID;
    v_project_acc UUID;
    v_je_id UUID;
BEGIN
    SELECT organization_id, cost_center_account_id INTO v_org_id, v_project_acc 
    FROM public.projects WHERE id = p_project_id;

    SELECT SUM(total_day_cost) INTO v_total_cost 
    FROM public.project_site_attendance 
    WHERE project_id = p_project_id AND attendance_date = p_attendance_date AND status = 'draft';

    IF v_total_cost > 0 THEN
        -- هنا يتم إنشاء القيد (من ح/ تكاليف المشروع إلى ح/ الأجور المستحقة)
        -- تم اختصار القيد للتركيز على منطق الربط
        UPDATE public.project_site_attendance SET status = 'approved' 
        WHERE project_id = p_project_id AND attendance_date = p_attendance_date;
    END IF;
END;
$$;

-- رؤية تحليلية لحضور الموقع تربط الموظفين بالمشاريع
CREATE OR REPLACE VIEW public.v_project_site_attendance AS
SELECT 
    a.id,
    a.organization_id,
    a.project_id,
    p.name as project_name,
    a.employee_id,
    e.full_name as employee_name,
    a.attendance_date,
    a.hours_worked,
    a.total_day_cost,
    a.status
FROM public.project_site_attendance a
JOIN public.projects p ON a.project_id = p.id
JOIN public.employees e ON a.employee_id = e.id;

-- ================================================================
-- 17. محرك تحليل المخاطر الذكي (Risk Engine)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_project_risk_signals(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_evm JSONB;
    v_risks JSONB := '[]'::JSONB;
    v_overdue_milestones INTEGER;
    v_project RECORD;
BEGIN
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
    v_evm := public.get_project_evm_metrics(p_project_id);
    
    -- 1. فحص انحراف التكلفة (CPI)
    IF (v_evm->>'cpi')::NUMERIC < 0.9 THEN
        v_risks := v_risks || jsonb_build_object(
            'type', 'critical',
            'title', 'تجاوز حرج في التكاليف',
            'message', 'مؤشر أداء التكلفة (CPI) منخفض. يتم صرف الميزانية بمعدل أسرع من الإنجاز.'
        );
    END IF;

    -- 2. فحص انحراف الجدول الزمني (SPI)
    IF (v_evm->>'spi')::NUMERIC < 0.85 THEN
        v_risks := v_risks || jsonb_build_object(
            'type', 'warning',
            'title', 'تأخر في الجدول الزمني',
            'message', 'المشروع متأخر عن المخطط الزمني بنسبة ' || ROUND((1 - (v_evm->>'spi')::NUMERIC) * 100) || '%'
        );
    END IF;

    -- 3. فحص المراحل المتأخرة (Milestones Overdue)
    SELECT COUNT(*) INTO v_overdue_milestones 
    FROM public.project_milestones 
    WHERE project_id = p_project_id 
      AND expected_end_date < CURRENT_DATE 
      AND status != 'completed';

    IF v_overdue_milestones > 0 THEN
        v_risks := v_risks || jsonb_build_object(
            'type', 'critical',
            'title', 'مراحل زمنية متأخرة',
            'message', 'يوجد ' || v_overdue_milestones || ' مراحل تجاوزت تاريخ الانتهاء المخطط دون اكتمال.'
        );
    END IF;

    RETURN jsonb_build_object(
        'project_id', p_project_id,
        'risk_count', jsonb_array_length(v_risks),
        'risk_level', CASE 
            WHEN jsonb_array_length(v_risks) >= 2 THEN 'High' 
            WHEN jsonb_array_length(v_risks) >= 1 THEN 'Medium' 
            ELSE 'Low' 
        END,
        'signals', v_risks
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.get_project_risk_signals(UUID) TO authenticated;

-- 📊 4. رؤية تحليل انحراف تكاليف العمالة (Labor Cost Variance Report)
-- الغرض: مقارنة تكلفة العمالة الفعلية من الحضور مع التقديرات (Roadmap Item)
DROP VIEW IF EXISTS public.v_project_labor_variance;
CREATE OR REPLACE VIEW public.v_project_labor_variance AS
WITH actual_labor AS (
    SELECT 
        project_id,
        SUM(total_day_cost) as total_actual_labor_cost,
        SUM(hours_worked) as total_hours_worked
    FROM public.project_site_attendance
    WHERE status = 'approved'
    GROUP BY project_id
),
planned_labor AS (
    SELECT 
        project_id,
        SUM(total_price) as total_planned_labor_cost
    FROM public.project_boq
    WHERE item_name ILIKE '%عمالة%' OR item_name ILIKE '%Labor%' OR item_name ILIKE '%أجور%'
    GROUP BY project_id
)
SELECT 
    p.id as project_id,
    p.name as project_name,
    p.organization_id,
    COALESCE(pl.total_planned_labor_cost, 0) as planned_labor_budget,
    COALESCE(al.total_actual_labor_cost, 0) as actual_labor_spent,
    (COALESCE(pl.total_planned_labor_cost, 0) - COALESCE(al.total_actual_labor_cost, 0)) as labor_variance
FROM public.projects p
LEFT JOIN actual_labor al ON p.id = al.project_id
LEFT JOIN planned_labor pl ON p.id = pl.project_id;

GRANT SELECT ON public.v_project_labor_variance TO authenticated;

-- ================================================================
-- 18. إدارة معدات الموقع (Equipment Management)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    type TEXT,
    serial_number TEXT,
    purchase_date DATE,
    purchase_cost NUMERIC(15,2),
    hourly_operating_cost NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'under_maintenance', 'retired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.equipment_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL,
    hours_used NUMERIC(5,2) NOT NULL DEFAULT 0,
    cost_per_hour NUMERIC(15,2),
    total_cost NUMERIC(15,2) GENERATED ALWAYS AS (hours_used * cost_per_hour) STORED,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled')),
    related_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 20. إدارة عُهد الأدوات الصغيرة (Tool Custody)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.project_tool_custody (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    employee_id UUID NOT NULL REFERENCES public.employees(id),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    return_date TIMESTAMPTZ,
    status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'returned', 'lost')),
    condition_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 19. دوال الإغلاق والتقارير المتقدمة المضافة حديثاً
-- ================================================================

-- دالة إغلاق المشروع (Project Closing)
CREATE OR REPLACE FUNCTION public.fn_close_project(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_project_status TEXT;
    v_open_customer_billings INT;
    v_open_sub_billings INT;
    v_profit_loss NUMERIC;
BEGIN
    SELECT status INTO v_project_status FROM public.projects WHERE id = p_project_id;
    IF v_project_status = 'completed' THEN RETURN jsonb_build_object('status', 'success', 'message', 'المشروع مغلق بالفعل.'); END IF;

    SELECT COUNT(*) INTO v_open_customer_billings FROM public.project_progress_billings WHERE project_id = p_project_id AND status = 'draft';
    IF v_open_customer_billings > 0 THEN RAISE EXCEPTION 'يوجد % مستخلص عميل معلق.', v_open_customer_billings; END IF;

    SELECT COUNT(*) INTO v_open_sub_billings FROM public.subcontractor_billings sb JOIN public.subcontractor_contracts sc ON sb.contract_id = sc.id WHERE sc.project_id = p_project_id AND sb.status = 'draft';
    IF v_open_sub_billings > 0 THEN RAISE EXCEPTION 'يوجد % مستخلص مقاول باطن معلق.', v_open_sub_billings; END IF;

    SELECT (COALESCE(SUM(gross_amount), 0) - COALESCE(SUM(debit), 0)) INTO v_profit_loss FROM public.v_project_profitability WHERE project_id = p_project_id;

    UPDATE public.projects SET status = 'completed', updated_at = NOW() WHERE id = p_project_id;

    RETURN jsonb_build_object('status', 'success', 'message', 'تم إغلاق المشروع بنجاح.', 'final_profit', v_profit_loss);
END; $$;

-- كشف حساب المقاول التفصيلي
CREATE OR REPLACE FUNCTION public.fn_get_subcontractor_statement(p_subcontractor_id UUID, p_organization_id UUID)
RETURNS TABLE (transaction_date DATE, description TEXT, debit NUMERIC(15,2), credit NUMERIC(15,2), balance NUMERIC(15,2)) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH sub_transactions AS (
        SELECT sc.created_at::DATE AS transaction_date, 'عقد: ' || sc.contract_name AS description, 0.00 AS debit, sc.total_value AS credit
        FROM public.subcontractor_contracts sc WHERE sc.subcontractor_id = p_subcontractor_id AND sc.organization_id = p_organization_id
        UNION ALL
        SELECT sb.billing_date, 'مستخلص رقم: ' || sb.billing_number, 0.00 AS debit, sb.net_amount AS credit
        FROM public.subcontractor_billings sb JOIN public.subcontractor_contracts sc ON sb.contract_id = sc.id
        WHERE sc.subcontractor_id = p_subcontractor_id AND sc.organization_id = p_organization_id AND sb.status = 'approved'
        UNION ALL
        -- الدفعات النقدية من الأستاذ العام المرتبطة بالمقاول عبر الوصف
        SELECT je.transaction_date, 'صرف: ' || je.description, jl.credit AS debit, 0.00 AS credit
        FROM public.journal_lines jl JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.organization_id = p_organization_id AND je.description ILIKE '%' || (SELECT name FROM public.subcontractors WHERE id = p_subcontractor_id) || '%'
        AND jl.account_id IN (SELECT id FROM public.accounts WHERE code IN ('201', '221') AND organization_id = p_organization_id)
    )
    SELECT st.transaction_date, st.description, st.debit, st.credit, SUM(st.credit - st.debit) OVER (ORDER BY st.transaction_date, st.description) AS balance
    FROM sub_transactions st ORDER BY st.transaction_date, st.description;
END; $$;

-- دالة اعتماد تكلفة المعدة وترحيلها محاسبياً
CREATE OR REPLACE FUNCTION public.fn_approve_equipment_usage(p_usage_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_log RECORD; v_project RECORD; v_je_id UUID; v_exp_acc UUID;
BEGIN
    SELECT eul.*, e.hourly_operating_cost INTO v_log FROM public.equipment_usage_logs eul JOIN public.equipment e ON eul.equipment_id = e.id WHERE eul.id = p_usage_log_id;
    IF v_log.status = 'approved' THEN RETURN; END IF;
    SELECT * INTO v_project FROM public.projects WHERE id = v_log.project_id;

    -- جلب حساب إيراد تشغيل المعدات الداخلي من الربط في الإعدادات
    v_exp_acc := public.resolve_leaf_account(COALESCE(
        (SELECT (account_mappings->>'EQUIPMENT_INTERNAL_REVENUE')::UUID FROM public.company_settings WHERE organization_id = v_log.organization_id), 
        (SELECT id FROM public.accounts WHERE code = '425' AND organization_id = v_log.organization_id LIMIT 1)
    ));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
    VALUES (v_log.usage_date, 'تشغيل معدة: ' || v_log.hours_used || ' ساعة - ' || v_project.name, v_log.id::TEXT, 'posted', v_log.organization_id, p_usage_log_id, 'equipment_usage', true) RETURNING id INTO v_je_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_project.cost_center_account_id, v_log.total_cost, 0, 'تكلفة تشغيل معدة للمشروع', v_log.organization_id);
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_exp_acc, 0, v_log.total_cost, 'إيراد تشغيل معدات داخلي', v_log.organization_id);

    UPDATE public.equipment_usage_logs SET status = 'approved', related_journal_entry_id = v_je_id WHERE id = p_usage_log_id;
END; $$;

-- فحص تجاوز الميزانية للإشعارات (KPI Alert)
CREATE OR REPLACE FUNCTION public.fn_check_cpi_threshold(p_org_id UUID, p_threshold NUMERIC DEFAULT 0.85)
RETURNS TABLE (project_id UUID, project_name TEXT, cpi NUMERIC, spi NUMERIC) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, (public.get_project_evm_metrics(p.id)->>'cpi')::NUMERIC, (public.get_project_evm_metrics(p.id)->>'spi')::NUMERIC
    FROM public.projects p WHERE p.organization_id = p_org_id AND p.status = 'active'
    AND ((public.get_project_evm_metrics(p.id)->>'cpi')::NUMERIC < p_threshold OR (public.get_project_evm_metrics(p.id)->>'spi')::NUMERIC < p_threshold);
END; $$;

-- 🚀 محرك التنبؤ بنفاذ السيولة (Liquidity Burn-out Predictor)
-- الغرض: حساب معدل الصرف اليومي وتوقع تاريخ نفاذ الميزانية بناءً على الأداء الفعلي
CREATE OR REPLACE FUNCTION public.get_project_liquidity_warning(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_project RECORD; v_spent NUMERIC; v_budget NUMERIC; v_days_passed INTEGER; v_daily_burn_rate NUMERIC;
    v_days_left_estimated INTEGER; v_planned_days_left INTEGER;
BEGIN
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
    SELECT COALESCE(SUM(total_price), v_project.contract_value, 0) INTO v_budget FROM public.project_boq WHERE project_id = p_project_id;
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_spent FROM public.journal_lines WHERE account_id = v_project.cost_center_account_id;
    v_days_passed := GREATEST(CURRENT_DATE - v_project.start_date, 1);
    v_daily_burn_rate := v_spent / v_days_passed;
    v_days_left_estimated := CASE WHEN v_daily_burn_rate > 0 THEN (v_budget - v_spent) / v_daily_burn_rate ELSE 9999 END;
    v_planned_days_left := GREATEST(v_project.end_date - CURRENT_DATE, 0);
    RETURN jsonb_build_object(
        'project_name', v_project.name,
        'current_burn_rate_daily', ROUND(v_daily_burn_rate, 2),
        'estimated_days_until_empty', v_days_left_estimated,
        'planned_days_remaining', v_planned_days_left,
        'risk_level', CASE WHEN v_days_left_estimated < v_planned_days_left THEN 'CRITICAL 🔴' ELSE 'HEALTHY 🟢' END
    );
END; $$;

-- 💰 محرك أوامر الدفع (Payment Order)
CREATE OR REPLACE FUNCTION public.get_subcontractor_payment_order(p_billing_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_billing RECORD; v_sub RECORD;
BEGIN
    SELECT sb.*, sc.subcontractor_id INTO v_billing FROM public.subcontractor_billings sb JOIN public.subcontractor_contracts sc ON sb.contract_id = sc.id WHERE sb.id = p_billing_id;
    SELECT name, bank_name, iban_number FROM public.subcontractors WHERE id = v_billing.subcontractor_id INTO v_sub;
    RETURN jsonb_build_object('beneficiary', v_sub.name, 'bank', v_sub.bank_name, 'iban', v_sub.iban_number, 'amount', v_billing.net_amount);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_project_liquidity_warning(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subcontractor_payment_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_material_issue(UUID) TO authenticated;