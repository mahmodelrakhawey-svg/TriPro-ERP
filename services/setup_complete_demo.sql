-- 🌟 ملف الإعداد الشامل للنسخة التجريبية (Golden Setup Script)
-- يقوم بإنشاء جميع الجداول، الدوال، وإضافة بيانات أساسية.

-- ========= 0. تنظيف قاعدة البيانات (Drop All) =========
-- ⚠️ تحذير: تم تعطيل حذف المخطط (Schema) لضمان عدم ضياع هيكل النظام المطور.
-- إذا كنت بحاجة لمسح شامل، فقم بتشغيل DROP SCHEMA public CASCADE يدوياً بحذر شديد.
CREATE SCHEMA IF NOT EXISTS public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ========= 1. الجداول الأساسية (Core Tables) =========

-- المنظمات
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    activity_type text,
    vat_number text,
    address text,
    phone text,
    email text,
    logo_url text,
    footer_text text,
    allowed_modules text[] DEFAULT '{"accounting"}',
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    max_users integer DEFAULT 5,
    subscription_expiry date,
    total_collected numeric DEFAULT 0
);

-- إعدادات الشركة
CREATE TABLE IF NOT EXISTS public.company_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name text,
    tax_number text,
    phone text,
    address text,
    footer_text text,
    logo_url text,
    vat_rate numeric DEFAULT 0.14,
    currency text DEFAULT 'EGP',
    enable_tax boolean DEFAULT true,
    allow_negative_stock boolean DEFAULT false,
    prevent_price_modification boolean DEFAULT false,
    last_closed_date date,
    updated_at timestamptz DEFAULT now()
);

-- الأدوار والصلاحيات
CREATE TABLE IF NOT EXISTS public.roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    UNIQUE(name, organization_id)
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    module text NOT NULL,
    action text NOT NULL,
    UNIQUE(module, action)
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
    UNIQUE(role_id, permission_id)
);

-- المستخدمين (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    full_name text,
    role text DEFAULT 'viewer',
    role_id uuid REFERENCES public.roles(id),
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- مراكز التكلفة
CREATE TABLE IF NOT EXISTS public.cost_centers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    code text,
    description text,
    created_at timestamptz DEFAULT now()
);

-- دليل الحسابات
CREATE TABLE IF NOT EXISTS public.accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code varchar(50) NOT NULL,
    name varchar(255) NOT NULL,
    type varchar(50) NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    parent_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id),
    balance numeric DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    deletion_reason text,
    UNIQUE(organization_id, code)
);

-- القيود المحاسبية
CREATE TABLE IF NOT EXISTS public.journal_entries (
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

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid REFERENCES public.accounts(id),
    debit numeric(19,4) DEFAULT 0,
    credit numeric(19,4) DEFAULT 0,
    description text,
    cost_center_id uuid REFERENCES public.cost_centers(id),
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE IF NOT EXISTS public.journal_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric,
    created_at timestamptz DEFAULT now()
);

-- العملاء والموردين
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text, -- alias for tax_number
    address text,
    credit_limit numeric DEFAULT 0,
    balance numeric DEFAULT 0,
    customer_type text DEFAULT 'individual',
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text, -- alias
    address text,
    contact_person text,
    balance numeric DEFAULT 0,
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- المخزون والمنتجات
CREATE TABLE IF NOT EXISTS public.warehouses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    location text,
    type text DEFAULT 'warehouse',
    deleted_at timestamptz,
    deletion_reason text
);

CREATE TABLE IF NOT EXISTS public.products (
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

CREATE TABLE IF NOT EXISTS public.bill_of_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id),
    quantity_required numeric NOT NULL DEFAULT 1
);

-- المبيعات
CREATE TABLE IF NOT EXISTS public.invoices (
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

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric,
    cost numeric DEFAULT 0,
    modifiers jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.quotations (
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

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id uuid REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric
);

CREATE TABLE IF NOT EXISTS public.sales_returns (
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

CREATE TABLE IF NOT EXISTS public.sales_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sales_return_id uuid REFERENCES public.sales_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric
);

-- المشتريات
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
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

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
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

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric
);

CREATE TABLE IF NOT EXISTS public.purchase_returns (
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

CREATE TABLE IF NOT EXISTS public.purchase_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_return_id uuid REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric
);

-- المالية (سندات وشيكات)
CREATE TABLE IF NOT EXISTS public.receipt_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    customer_id uuid REFERENCES public.customers(id),
    receipt_date date,
    amount numeric,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_vouchers (
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

CREATE TABLE IF NOT EXISTS public.cheques (
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
CREATE TABLE IF NOT EXISTS public.assets (
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
CREATE TABLE IF NOT EXISTS public.employees (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    position text,
    phone text,
    department text, -- 🛠️ إضافة عمود القسم (Department)
    email text,
    salary numeric, -- basic salary
    hire_date date,
    deleted_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payrolls (
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

CREATE TABLE IF NOT EXISTS public.payroll_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payroll_id uuid REFERENCES public.payrolls(id) ON DELETE CASCADE,
    employee_id uuid REFERENCES public.employees(id),
    gross_salary numeric,
    additions numeric,
    advances_deducted numeric,
    other_deductions numeric,
    net_salary numeric
);

-- مديول المطاعم ونقاط البيع (POS & Restaurant)
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    capacity integer DEFAULT 4,
    status text DEFAULT 'AVAILABLE',
    qr_access_key uuid DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    bill_requested boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.table_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id),
    start_time timestamptz DEFAULT now(),
    end_time timestamptz,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    status text DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text,
    session_id uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL,
    customer_id uuid REFERENCES public.customers(id),
    status text DEFAULT 'PENDING',
    subtotal numeric DEFAULT 0,
    total_tax numeric DEFAULT 0,
    grand_total numeric DEFAULT 0,
    delivery_fee numeric DEFAULT 0,
    order_type text DEFAULT 'DINE_IN',
    warehouse_id uuid REFERENCES public.warehouses(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 1,
    unit_price numeric NOT NULL DEFAULT 0,
    total_price numeric DEFAULT 0,
    unit_cost numeric DEFAULT 0,
    modifiers jsonb DEFAULT '[]'::jsonb,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
    status text DEFAULT 'NEW',
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    status_updated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- الوردات (Shifts)
CREATE TABLE IF NOT EXISTS public.shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id),
    start_time timestamptz DEFAULT now(),
    end_time timestamptz,
    opening_balance numeric DEFAULT 0,
    actual_cash numeric DEFAULT 0,
    treasury_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    status text DEFAULT 'OPEN',
    notes text,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- طلبات التوصيل (Delivery Orders)
CREATE TABLE IF NOT EXISTS public.delivery_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_name text,
    customer_phone text,
    delivery_address text,
    delivery_fee numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- سلف الموظفين (Employee Advances)
CREATE TABLE IF NOT EXISTS public.employee_advances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    amount numeric NOT NULL DEFAULT 0,
    advance_date date DEFAULT now(),
    status text DEFAULT 'paid',
    payroll_item_id uuid,
    treasury_account_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- عمليات المخزون المتقدمة
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_number text,
    from_warehouse_id uuid REFERENCES public.warehouses(id),
    to_warehouse_id uuid REFERENCES public.warehouses(id),
    transfer_date date,
    status text,
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_transfer_id uuid REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric
);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    adjustment_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    adjustment_date date,
    status text,
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustment_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_adjustment_id uuid REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    type text -- increase / decrease
);

CREATE TABLE IF NOT EXISTS public.inventory_counts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    count_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    count_date date,
    status text,
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_count_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_count_id uuid REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    system_quantity numeric,
    counted_quantity numeric,
    difference numeric
);

-- النظام (إشعارات وسجلات)
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text,
    message text,
    type text,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL,
    description text,
    performed_by uuid REFERENCES auth.users(id),
    target_user_id uuid REFERENCES public.profiles(id),
    metadata jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.budgets (
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
-- ملاحظة: تم نقل دوال recalculate_stock_rpc و recalculate_partner_balances 
-- إلى ملف deploy_all_functionss.sql لتوحيد منطق الـ SaaS والتصنيع.

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
    INSERT INTO public.company_settings (company_name, currency, enable_tax) VALUES ('الشركة النموذجية للتجارة', 'EGP', true);
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
