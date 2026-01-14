-- 🌟 ملف الإعداد الشامل للنسخة التجريبية (Golden Setup Script)
-- يقوم بإنشاء جميع الجداول، الدوال، وإضافة بيانات أساسية.

-- ========= 0. تنظيف قاعدة البيانات (Drop All) =========
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ========= 1. الجداول الأساسية (Core Tables) =========

-- المنظمات
CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- إعدادات الشركة
CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name text,
    tax_number text,
    phone text,
    address text,
    footer_text text,
    logo_url text,
    vat_rate numeric DEFAULT 0.15,
    currency text DEFAULT 'SAR',
    enable_tax boolean DEFAULT true,
    allow_negative_stock boolean DEFAULT false,
    prevent_price_modification boolean DEFAULT false,
    last_closed_date date,
    updated_at timestamptz DEFAULT now()
);

-- الأدوار والصلاحيات
CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text
);

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    module text NOT NULL,
    action text NOT NULL,
    UNIQUE(module, action)
);

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
    UNIQUE(role_id, permission_id)
);

-- المستخدمين (Profiles)
CREATE TABLE public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    full_name text,
    role text DEFAULT 'viewer',
    role_id uuid REFERENCES public.roles(id),
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- مراكز التكلفة
CREATE TABLE public.cost_centers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    code text,
    description text,
    created_at timestamptz DEFAULT now()
);

-- دليل الحسابات
CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code varchar(50) NOT NULL UNIQUE,
    name varchar(255) NOT NULL,
    type varchar(50) NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    parent_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id),
    balance numeric DEFAULT 0,
    deleted_at timestamptz,
    deletion_reason text
);

-- القيود المحاسبية
CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_date date NOT NULL,
    description text,
    reference text,
    status text DEFAULT 'draft',
    is_posted boolean DEFAULT false,
    user_id uuid REFERENCES auth.users(id),
    organization_id uuid REFERENCES public.organizations(id),
    related_document_id uuid,
    related_document_type text,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.journal_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid REFERENCES public.accounts(id),
    debit numeric(19,4) DEFAULT 0,
    credit numeric(19,4) DEFAULT 0,
    description text,
    cost_center_id uuid REFERENCES public.cost_centers(id),
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE public.journal_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric,
    created_at timestamptz DEFAULT now()
);

-- العملاء والموردين
CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text, -- alias for tax_number
    address text,
    credit_limit numeric DEFAULT 0,
    customer_type text DEFAULT 'individual',
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text, -- alias
    address text,
    contact_person text,
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- المخزون والمنتجات
CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    location text,
    type text DEFAULT 'warehouse',
    deleted_at timestamptz,
    deletion_reason text
);

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    sku text,
    sales_price numeric DEFAULT 0,
    purchase_price numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    stock numeric DEFAULT 0,
    item_type text DEFAULT 'STOCK',
    inventory_account_id uuid REFERENCES public.accounts(id),
    cogs_account_id uuid REFERENCES public.accounts(id),
    sales_account_id uuid REFERENCES public.accounts(id),
    image_url text,
    warehouse_stock jsonb DEFAULT '{}',
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.bill_of_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id),
    quantity_required numeric NOT NULL DEFAULT 1
);

-- المبيعات
CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    customer_id uuid REFERENCES public.customers(id),
    salesperson_id uuid, -- REFERENCES public.profiles(id) or users
    invoice_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    paid_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    status text,
    notes text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric,
    cost numeric DEFAULT 0
);

CREATE TABLE public.quotations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_number text,
    customer_id uuid REFERENCES public.customers(id),
    salesperson_id uuid,
    quotation_date date,
    total_amount numeric,
    tax_amount numeric,
    status text DEFAULT 'draft',
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.quotation_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id uuid REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric
);

CREATE TABLE public.sales_returns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    return_number text,
    original_invoice_id uuid REFERENCES public.invoices(id),
    customer_id uuid REFERENCES public.customers(id),
    return_date date,
    total_amount numeric,
    tax_amount numeric,
    status text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.sales_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sales_return_id uuid REFERENCES public.sales_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric
);

-- المشتريات
CREATE TABLE public.purchase_invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    invoice_date date,
    total_amount numeric,
    tax_amount numeric,
    status text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.purchase_invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric
);

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    po_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    order_date date,
    total_amount numeric,
    tax_amount numeric,
    status text DEFAULT 'draft',
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric
);

CREATE TABLE public.purchase_returns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    return_number text,
    original_invoice_id uuid REFERENCES public.purchase_invoices(id),
    supplier_id uuid REFERENCES public.suppliers(id),
    return_date date,
    total_amount numeric,
    tax_amount numeric,
    status text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.purchase_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_return_id uuid REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric
);

-- المالية (سندات وشيكات)
CREATE TABLE public.receipt_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    customer_id uuid REFERENCES public.customers(id),
    receipt_date date,
    amount numeric,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payment_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    payment_date date,
    amount numeric,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.cheques (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cheque_number text,
    bank_name text,
    amount numeric,
    due_date date,
    status text DEFAULT 'pending', -- pending, collected, bounced
    type text, -- in, out
    party_id uuid, -- customer or supplier id
    party_name text,
    created_at timestamptz DEFAULT now()
);

-- الأصول الثابتة
CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    purchase_date date,
    purchase_cost numeric,
    salvage_value numeric,
    useful_life numeric,
    asset_account_id uuid REFERENCES public.accounts(id),
    accumulated_depreciation_account_id uuid REFERENCES public.accounts(id),
    depreciation_expense_account_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id),
    deleted_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- الموارد البشرية
CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    position text,
    phone text,
    email text,
    salary numeric, -- basic salary
    hire_date date,
    deleted_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payrolls (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payroll_month integer,
    payroll_year integer,
    total_gross_salary numeric,
    total_additions numeric,
    total_deductions numeric,
    total_net_salary numeric,
    status text DEFAULT 'draft',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payroll_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payroll_id uuid REFERENCES public.payrolls(id) ON DELETE CASCADE,
    employee_id uuid REFERENCES public.employees(id),
    gross_salary numeric,
    additions numeric,
    advances_deducted numeric,
    other_deductions numeric,
    net_salary numeric
);

-- عمليات المخزون المتقدمة
CREATE TABLE public.stock_transfers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_number text,
    from_warehouse_id uuid REFERENCES public.warehouses(id),
    to_warehouse_id uuid REFERENCES public.warehouses(id),
    transfer_date date,
    status text,
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_transfer_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_transfer_id uuid REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric
);

CREATE TABLE public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    adjustment_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    adjustment_date date,
    status text,
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_adjustment_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_adjustment_id uuid REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    type text -- increase / decrease
);

CREATE TABLE public.inventory_counts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    count_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    count_date date,
    status text,
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.inventory_count_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_count_id uuid REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    system_quantity numeric,
    counted_quantity numeric,
    difference numeric
);

-- النظام (إشعارات وسجلات)
CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text,
    message text,
    type text,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.security_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL,
    description text,
    performed_by uuid REFERENCES auth.users(id),
    target_user_id uuid REFERENCES public.profiles(id),
    metadata jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text,
    start_date date,
    end_date date,
    total_amount numeric,
    created_at timestamptz DEFAULT now()
);

-- ========= 2. الدوال المخزنة (Stored Procedures) =========

-- دالة إنشاء قيد يومية (مهمة جداً للتطبيق)
CREATE OR REPLACE FUNCTION public.create_journal_entry(
    entry_date date,
    description text,
    reference text,
    entries jsonb,
    status text DEFAULT 'posted',
    org_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    new_entry_id uuid;
    entry_record jsonb;
BEGIN
    -- 1. Create Header
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id)
    VALUES (entry_date, description, reference, status, org_id)
    RETURNING id INTO new_entry_id;

    -- 2. Create Lines
    FOR entry_record IN SELECT * FROM jsonb_array_elements(entries)
    LOOP
        INSERT INTO public.journal_lines (
            journal_entry_id, account_id, debit, credit, description, cost_center_id, organization_id
        ) VALUES (
            new_entry_id,
            (entry_record->>'account_id')::uuid,
            (entry_record->>'debit')::numeric,
            (entry_record->>'credit')::numeric,
            (entry_record->>'description'),
            (entry_record->>'cost_center_id')::uuid,
            org_id
        );
    END LOOP;

    RETURN new_entry_id;
END;
$$;

-- ========= 3. البيانات الأولية (Seeding) =========

DO $$
DECLARE
    v_org_id uuid;
    v_warehouse_id uuid;
    v_assets_id uuid; v_liabilities_id uuid; v_equity_id uuid; v_revenue_id uuid; v_expenses_id uuid;
    v_current_assets_id uuid; v_current_liabilities_id uuid;
    v_cash_group_id uuid; v_cash_acc_id uuid;
    v_inventory_acc_id uuid; v_cogs_acc_id uuid; v_sales_acc_id uuid; 
    v_customers_acc_id uuid; v_suppliers_acc_id uuid; v_vat_acc_id uuid; v_vat_input_acc_id uuid;
BEGIN
    -- 1. المنظمة والإعدادات
    INSERT INTO public.organizations (name) VALUES ('الشركة النموذجية للتجارة') RETURNING id INTO v_org_id;
    INSERT INTO public.company_settings (company_name, currency, enable_tax) VALUES ('الشركة النموذجية للتجارة', 'SAR', true);
    INSERT INTO public.warehouses (name, location) VALUES ('المستودع الرئيسي', 'الرياض') RETURNING id INTO v_warehouse_id;

    -- 2. دليل الحسابات (مختصر)
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('1', 'الأصول', 'ASSET', true, v_org_id) RETURNING id INTO v_assets_id;
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('2', 'الخصوم', 'LIABILITY', true, v_org_id) RETURNING id INTO v_liabilities_id;
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('3', 'حقوق الملكية', 'EQUITY', true, v_org_id) RETURNING id INTO v_equity_id;
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('4', 'الإيرادات', 'REVENUE', true, v_org_id) RETURNING id INTO v_revenue_id;
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('5', 'المصروفات', 'EXPENSE', true, v_org_id) RETURNING id INTO v_expenses_id;

    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('11', 'الأصول المتداولة', 'ASSET', true, v_assets_id, v_org_id) RETURNING id INTO v_current_assets_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('21', 'الخصوم المتداولة', 'LIABILITY', true, v_liabilities_id, v_org_id) RETURNING id INTO v_current_liabilities_id;

    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('1101', 'النقدية', 'ASSET', true, v_current_assets_id, v_org_id) RETURNING id INTO v_cash_group_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('110101', 'الصندوق الرئيسي', 'ASSET', false, v_cash_group_id, v_org_id) RETURNING id INTO v_cash_acc_id;
    
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('1102', 'العملاء', 'ASSET', false, v_current_assets_id, v_org_id) RETURNING id INTO v_customers_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('1105', 'المخزون', 'ASSET', false, v_current_assets_id, v_org_id) RETURNING id INTO v_inventory_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('1205', 'ضريبة مدخلات', 'ASSET', false, v_current_assets_id, v_org_id) RETURNING id INTO v_vat_input_acc_id;
    
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('2103', 'ضريبة القيمة المضافة', 'LIABILITY', false, v_current_liabilities_id, v_org_id) RETURNING id INTO v_vat_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('2201', 'الموردين', 'LIABILITY', false, v_current_liabilities_id, v_org_id) RETURNING id INTO v_suppliers_acc_id;
    
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('4101', 'إيراد المبيعات', 'REVENUE', false, v_revenue_id, v_org_id) RETURNING id INTO v_sales_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('4102', 'خصم مسموح به', 'REVENUE', false, v_revenue_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('5101', 'تكلفة البضاعة', 'EXPENSE', false, v_expenses_id, v_org_id) RETURNING id INTO v_cogs_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('5201', 'الرواتب والأجور', 'EXPENSE', false, v_expenses_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('5301', 'فروقات جرد', 'EXPENSE', false, v_expenses_id, v_org_id);

    -- 3. بيانات وهمية
    INSERT INTO public.customers (name, phone, email, address, credit_limit) VALUES ('مؤسسة الأفق للتجارة', '0501234567', 'horizon@example.com', 'الرياض', 50000);
    INSERT INTO public.suppliers (name, phone, email, address) VALUES ('شركة التوريدات العالمية', '0509988776', 'supply@example.com', 'جدة');
END $$;

SELECT 'تم إعداد قاعدة البيانات الذهبية بالكامل بنجاح! ✅' as result;
