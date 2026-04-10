-- 🌟 ملف إعادة بناء النظام بالكامل (Full System Rebuild) - النسخة الموحدة والنهائية
-- 📅 تاريخ التحديث: 2026-04-08 (SaaS Production Ready)
-- ℹ️ الوصف: يقوم هذا الملف بمسح قاعدة البيانات بالكامل وإعادة إنشائها من الصفر
-- مع جميع الجداول، الدوال، السياسات، ودعم الـ SaaS.
-- ⚠️ تحذير: تشغيل هذا الملف سيقوم بمسح جميع البيانات الموجودة في قاعدة البيانات!

-- ================================================================
-- 0. تنظيف وإعداد المخطط (Reset Schema)
-- ================================================================
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ================================================================
-- 1. الجداول الأساسية (Core Tables) - من master_setup.sql
-- ================================================================

-- المنظمات والإعدادات
CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    vat_number text,
    address text,
    phone text,
    email text,
    logo_url text,
    footer_text text,
    allowed_modules text[] DEFAULT '{"accounting"}',
    is_active boolean DEFAULT true,
    subscription_expiry date,
    max_users integer DEFAULT 5,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- ================================================================
-- 1.5 دوال الحماية المساعدة (Security Helpers) - من master_setup.sql
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _role text;
BEGIN
    _role := (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'role')::text;
    RETURN COALESCE(_role, (SELECT (raw_user_meta_data->>'role')::text FROM auth.users WHERE id = (nullif(current_setting('request.jwt.auth.uid', true), '')::uuid)));
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid,
        (SELECT (raw_user_meta_data->>'org_id')::uuid FROM auth.users WHERE id = auth.uid())
    );
END; $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (public.get_my_role() IN ('super_admin', 'admin'));
END; $$;

-- الصلاحيات والمستخدمين
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

CREATE TABLE public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    full_name text,
    role text DEFAULT 'viewer',
    role_id uuid REFERENCES public.roles(id),
    avatar_url text,
    is_active boolean DEFAULT true NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now() NOT NULL
);

-- جدول الدعوات (Invitations) للتحكم في من يمكنه الانضمام للنظام
CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text NOT NULL UNIQUE,
    role text DEFAULT 'viewer',
    organization_id uuid REFERENCES public.organizations(id),
    invited_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    accepted_at timestamptz
);

-- دالة معالجة المستخدمين الجدد عند التسجيل (Signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org_id uuid;
    v_role text;
    v_invitation record;
BEGIN
    v_org_id := (new.raw_user_meta_data->>'org_id')::uuid;
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'admin');

    IF v_org_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.profiles) THEN
        INSERT INTO public.organizations (name) VALUES ('الشركة الرئيسية') RETURNING id INTO v_org_id;
        v_role := 'super_admin';
    END IF;

    IF v_org_id IS NULL THEN
        SELECT organization_id, role INTO v_org_id, v_role FROM public.invitations 
        WHERE email = new.email AND accepted_at IS NULL LIMIT 1;
        
        IF v_org_id IS NOT NULL THEN
            UPDATE public.invitations SET accepted_at = now() WHERE email = new.email;
        END IF;
    END IF;

    INSERT INTO public.profiles (id, full_name, role, organization_id)
    VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'), v_role, v_org_id)
    ON CONFLICT (id) DO NOTHING;

    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
        jsonb_build_object('org_id', v_org_id, 'role', v_role)
    WHERE id = new.id;

    RETURN new;
END;
$$;

-- إنشاء التريجر ليربط مع نظام الحماية الخاص بـ Supabase (auth.users)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- دالة التحقق من عدد المستخدمين (منع تجاوز حدود الباقة)
CREATE OR REPLACE FUNCTION public.check_user_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_max_users integer;
    v_current_users integer;
BEGIN
    IF public.get_my_role() = 'super_admin' OR NEW.role = 'super_admin' THEN
        RETURN NEW;
    END IF;

    SELECT max_users INTO v_max_users FROM public.organizations WHERE id = NEW.organization_id;
    
    SELECT count(*) INTO v_current_users FROM public.profiles 
    WHERE organization_id = NEW.organization_id AND role != 'super_admin';

    IF v_current_users >= COALESCE(v_max_users, 5) THEN
        RAISE EXCEPTION '⚠️ عذراً، لقد وصلت للحد الأقصى للمستخدمين المسموح بهم في باقتك الحالية (%). يرجى ترقية الباقة لإضافة المزيد.', v_max_users;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_limit_users ON public.profiles;
CREATE TRIGGER trg_limit_users
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_user_limit();

CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name text,
    tax_number text,
    activity_type text,
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
    decimal_places integer DEFAULT 2,
    max_cash_deficit_limit numeric DEFAULT 500,
    account_mappings jsonb DEFAULT '{}'::jsonb,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org() UNIQUE,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    error_message text,
    error_code text,
    context jsonb,
    function_name text,
    user_id uuid,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- المحاسبة
CREATE TABLE public.cost_centers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    code text,
    description text,
    created_at timestamptz DEFAULT now(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    parent_id uuid REFERENCES public.accounts(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    balance numeric DEFAULT 0,
    sub_type text,
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (organization_id, code)
);

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    description text,
    reference text,
    status text DEFAULT 'draft',
    is_posted boolean DEFAULT false,
    user_id uuid REFERENCES public.profiles(id),
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    related_document_id uuid,
    related_document_type text,
    created_at timestamptz DEFAULT now() NOT NULL,
    transaction_date date,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.journal_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid REFERENCES public.accounts(id),
    debit numeric(19,4) DEFAULT 0,
    credit numeric(19,4) DEFAULT 0,
    description text,
    cost_center_id uuid REFERENCES public.cost_centers(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE public.journal_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

-- العملاء والموردين
CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text,
    address text,
    credit_limit numeric DEFAULT 0,
    customer_type text DEFAULT 'individual',
    balance numeric DEFAULT 0,
    deleted_at timestamptz,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    responsible_user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid()
);

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text,
    address text,
    contact_person text,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    balance numeric DEFAULT 0,
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- المخزون والمنتجات
CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    location text,
    manager text,
    phone text,
    type text DEFAULT 'warehouse',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    deleted_at timestamptz,
    deletion_reason text
);

CREATE TABLE public.item_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name varchar NOT NULL,
    description text,
    image_url text,
    display_order integer DEFAULT 0,
    default_inventory_account_id uuid REFERENCES public.accounts(id),
    default_cogs_account_id uuid REFERENCES public.accounts(id),
    default_sales_account_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    sku text,
    barcode text,
    sales_price numeric DEFAULT 0,
    purchase_price numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    manufacturing_cost numeric DEFAULT 0,
    weighted_average_cost numeric DEFAULT 0,
    stock numeric DEFAULT 0,
    unit text,
    min_stock_level numeric DEFAULT 0,
    item_type text DEFAULT 'STOCK',
    product_type text DEFAULT 'STOCK',
    inventory_account_id uuid REFERENCES public.accounts(id),
    cogs_account_id uuid REFERENCES public.accounts(id),
    sales_account_id uuid REFERENCES public.accounts(id),
    image_url text,
    warehouse_stock jsonb DEFAULT '{}',
    category_id uuid REFERENCES public.item_categories(id),
    expiry_date date,
    
    offer_price numeric,
    offer_start_date date,
    offer_end_date date,
    offer_max_qty numeric,
    
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    labor_cost numeric(19,4) DEFAULT 0,
    overhead_cost numeric(19,4) DEFAULT 0,
    is_overhead_percentage boolean DEFAULT false
);

CREATE TABLE public.bill_of_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    quantity_required numeric NOT NULL DEFAULT 1
);

CREATE TABLE public.opening_inventories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
    quantity numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- المبيعات والمشتريات
CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    customer_id uuid REFERENCES public.customers(id),
    salesperson_id uuid,
    invoice_date date,
    due_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    paid_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    status text,
    notes text,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    approver_id uuid REFERENCES auth.users(id),
    reference text,
    deleted_at timestamptz,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric,
    discount numeric DEFAULT 0,
    tax_rate numeric DEFAULT 0,
    custom_fields jsonb,
    cost numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id)
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
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    organization_id uuid REFERENCES public.organizations(id),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.sales_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sales_return_id uuid REFERENCES public.sales_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE public.purchase_invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    invoice_date date,
    due_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    status text,
    notes text,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    additional_expenses numeric DEFAULT 0,
    approver_id uuid REFERENCES auth.users(id),
    reference text,
    deleted_at timestamptz,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.purchase_invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
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
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.purchase_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    return_id uuid REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE public.quotations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_number text,
    customer_id uuid REFERENCES public.customers(id),
    salesperson_id uuid REFERENCES public.profiles(id),
    quotation_date date,
    expiry_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    status text DEFAULT 'draft',
    notes text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.quotation_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id uuid REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    order_date date,
    delivery_date date,
    total_amount numeric,
    tax_amount numeric,
    status text DEFAULT 'draft',
    notes text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

-- السندات والشيكات
CREATE TABLE public.receipt_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    customer_id uuid REFERENCES public.customers(id),
    receipt_date date,
    amount numeric,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    payment_method text DEFAULT 'cash',
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    type text DEFAULT 'receipt',
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
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
    payment_method text DEFAULT 'cash',
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    recipient_name text,
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.cheques (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cheque_number text,
    bank_name text,
    amount numeric,
    due_date date,
    status text DEFAULT 'pending',
    type text,
    party_id uuid,
    party_name text,
    notes text,
    transfer_account_number text,
    transfer_bank_name text,
    transfer_date date,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    related_voucher_id uuid,
    organization_id uuid REFERENCES public.organizations(id),
    current_account_id uuid REFERENCES public.accounts(id),
    created_at timestamptz DEFAULT now()
);

-- جداول إضافية (مرفقات، إقفال، إشعارات)
CREATE TABLE public.receipt_voucher_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_id uuid REFERENCES public.receipt_vouchers(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payment_voucher_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_id uuid REFERENCES public.payment_vouchers(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.cheque_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cheque_id uuid REFERENCES public.cheques(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.cash_closings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    closing_date timestamptz DEFAULT now(),
    treasury_account_id uuid REFERENCES public.accounts(id),
    system_balance numeric DEFAULT 0,
    actual_balance numeric DEFAULT 0,
    difference numeric DEFAULT 0,
    notes text,
    status text DEFAULT 'closed',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.rejected_cash_closings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rejection_date timestamptz DEFAULT now(),
    treasury_account_id uuid REFERENCES public.accounts(id),
    system_balance numeric NOT NULL,
    actual_balance numeric NOT NULL,
    difference numeric NOT NULL,
    notes text,
    rejected_by uuid REFERENCES public.profiles(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    max_allowed_deficit numeric
);

CREATE TABLE public.credit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    credit_note_number text,
    customer_id uuid REFERENCES public.customers(id),
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    original_invoice_number text,
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.debit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    debit_note_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    original_invoice_number text,
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.security_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL,
    description text,
    performed_by uuid REFERENCES auth.users(id),
    target_user_id uuid REFERENCES public.profiles(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    metadata jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    year integer,
    month integer,
    items jsonb,
    name text,
    total_amount numeric,
    organization_id uuid REFERENCES public.organizations(id),
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
    current_value numeric,
    asset_account_id uuid REFERENCES public.accounts(id),
    accumulated_depreciation_account_id uuid REFERENCES public.accounts(id),
    depreciation_expense_account_id uuid REFERENCES public.accounts(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status text DEFAULT 'active',
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now()
);

-- الموارد البشرية
CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name text NOT NULL,
    position text,
    department text,
    phone text,
    email text,
    salary numeric,
    hire_date date,
    status text DEFAULT 'active',
    notes text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    deleted_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payrolls (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payroll_month integer,
    payroll_year integer,
    payment_date date DEFAULT CURRENT_DATE,
    total_gross_salary numeric,
    total_additions numeric,
    total_deductions numeric,
    total_net_salary numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status text DEFAULT 'draft',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payroll_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payroll_id uuid REFERENCES public.payrolls(id) ON DELETE CASCADE,
    employee_id uuid REFERENCES public.employees(id),
    gross_salary numeric,
    additions numeric,
    payroll_tax numeric DEFAULT 0,
    advances_deducted numeric,
    other_deductions numeric,
    net_salary numeric,
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE public.employee_advances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id),
    amount numeric,
    request_date date,
    status text DEFAULT 'pending',
    notes text,
    reference text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    payroll_item_id uuid REFERENCES public.payroll_items(id),
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 2.4 جداول نظام المطاعم (Restaurant Module)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    capacity integer DEFAULT 4,
    status text DEFAULT 'AVAILABLE',
    section text,
    reservation_info jsonb,
    qr_access_key uuid DEFAULT gen_random_uuid(),
    qr_code text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    display_order integer DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.table_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    opened_by uuid REFERENCES auth.users(id),
    customer_name text,
    opened_at timestamptz DEFAULT now(),
    closed_at timestamptz,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status text DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS public.shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    start_time timestamptz DEFAULT now(),
    end_time timestamptz,
    opening_balance numeric,
    closing_balance numeric,
    expected_cash numeric DEFAULT 0,
    actual_cash numeric DEFAULT 0,
    difference numeric DEFAULT 0,
    notes text,
    organization_id uuid REFERENCES public.organizations(id),
    status text DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text UNIQUE,
    session_id uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL,
    customer_id uuid REFERENCES public.customers(id),
    order_type text,
    status text DEFAULT 'PENDING',
    notes text,
    subtotal numeric DEFAULT 0,
    total_tax numeric DEFAULT 0,
    total_discount numeric DEFAULT 0,
    grand_total numeric DEFAULT 0,
    warehouse_id uuid REFERENCES public.warehouses(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    user_id uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric NOT NULL,
    price numeric NOT NULL,
    total_price numeric NOT NULL,
    unit_cost numeric DEFAULT 0,
    notes text,
    modifiers jsonb DEFAULT '[]'::jsonb,
    vat_rate numeric DEFAULT 0.14,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    status text DEFAULT 'NEW',
    status_updated_at timestamptz DEFAULT now(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_name text,
    customer_phone text,
    delivery_address text,
    delivery_fee numeric DEFAULT 0,
    status text DEFAULT 'PENDING',
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_method text,
    amount numeric NOT NULL,
    status text DEFAULT 'COMPLETED',
    transaction_ref text,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

-- نظام الإضافات (Advanced Modifiers)
CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    selection_type TEXT NOT NULL CHECK (selection_type IN ('SINGLE', 'MULTIPLE')) DEFAULT 'MULTIPLE',
    is_required BOOLEAN NOT NULL DEFAULT false,
    min_selection INT NOT NULL DEFAULT 0,
    max_selection INT,
    display_order INT DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.modifiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
    modifier_group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    is_default BOOLEAN NOT NULL DEFAULT false,
    display_order INT DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
    order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    modifier_id uuid NOT NULL REFERENCES public.modifiers(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    price_at_order NUMERIC(10, 2) NOT NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    PRIMARY KEY (order_item_id, modifier_id)
);

-- جدول صلاحيات المستخدمين المباشرة
CREATE TABLE public.user_permissions (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id),
    permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
    has_permission boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
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
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_transfer_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_transfer_id uuid REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    adjustment_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    adjustment_date date,
    status text,
    reason text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_adjustment_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_adjustment_id uuid REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    type text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE public.inventory_counts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    count_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    count_date date,
    status text,
    notes text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.inventory_count_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_count_id uuid REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id),
    system_qty numeric,
    actual_qty numeric,
    difference numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- التصنيع (Manufacturing)
CREATE TABLE public.work_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text,
    product_id uuid REFERENCES public.products(id),
    warehouse_id uuid REFERENCES public.warehouses(id),
    quantity numeric,
    start_date date,
    end_date date,
    status text DEFAULT 'draft',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.work_order_costs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    work_order_id uuid REFERENCES public.work_orders(id) ON DELETE CASCADE,
    cost_type text,
    amount numeric,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    description text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.bank_reconciliations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id uuid REFERENCES public.accounts(id),
    statement_date date,
    statement_balance numeric,
    book_balance numeric,
    opening_balance numeric,
    total_deposits numeric,
    total_payments numeric,
    reconciled_ids jsonb,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status text,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 2. نظام الإخطارات (Notifications)
-- ================================================================

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium',
  is_read BOOLEAN DEFAULT FALSE,
  action_url VARCHAR(500),
  related_id VARCHAR(100),
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_is_read ON notifications(user_id, is_read);

CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enable_overdue_payments BOOLEAN DEFAULT TRUE,
  enable_low_inventory BOOLEAN DEFAULT TRUE,
  enable_high_debt BOOLEAN DEFAULT TRUE,
  enable_pending_approval BOOLEAN DEFAULT TRUE,
  enable_due_date_alerts BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT FALSE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  push_notifications BOOLEAN DEFAULT TRUE,
  overdue_payment_threshold_days INTEGER DEFAULT 1,
  low_inventory_threshold_percent INTEGER DEFAULT 20,
  high_debt_threshold_percent INTEGER DEFAULT 90,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  organization_id UUID REFERENCES public.organizations(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.notification_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(50),
  organization_id UUID REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================================
-- 2.5 التقارير واللوحات البرمجية (Views)
-- ================================================================
CREATE OR REPLACE VIEW public.monthly_sales_dashboard AS
 SELECT 
    i.id,
    i.invoice_date AS transaction_date,
    i.subtotal AS amount,
    (SELECT COALESCE(SUM(ii.cost * ii.quantity), 0) FROM public.invoice_items ii WHERE ii.invoice_id = i.id) AS total_cost,
    'Standard Invoice'::text AS type,
    i.organization_id
 FROM public.invoices i
 WHERE i.status != 'draft' AND i.deleted_at IS NULL
 UNION ALL
 SELECT 
    o.id,
    o.created_at::date AS transaction_date,
    o.subtotal AS amount,
    (SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0) FROM public.order_items oi WHERE oi.order_id = o.id) AS total_cost,
    'Restaurant Order'::text AS type,
    o.organization_id
 FROM public.orders o
 WHERE o.status IN ('COMPLETED', 'PAID', 'posted', 'PENDING');

-- ================================================================
-- دالة تحديث كاش النظام (Refresh Supabase Schema Cache)
-- هذه الدالة ضرورية لحل مشكلة "Function not found" أو "Column not found" بعد تحديث الدوال أو الجداول
CREATE OR REPLACE FUNCTION public.refresh_saas_schema()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    EXECUTE 'NOTIFY pgrst, ''reload config''';
    RETURN 'تم تحديث هيكل البيانات وتنشيط الكاش بنجاح ✅';
END; $$;

-- ================================================================
-- مراقب تحديث حالة طلبات المطبخ
-- ================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_update_kitchen_status_time()
RETURNS TRIGGER AS $t$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.status_updated_at = now();
    END IF;
    RETURN NEW;
END; $t$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kitchen_status_time ON public.kitchen_orders;
CREATE TRIGGER trg_kitchen_status_time
BEFORE UPDATE ON public.kitchen_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_update_kitchen_status_time();

-- تنفيذ التحديث فوراً لضمان التعرف على عمود product_type الجديد
SELECT public.refresh_saas_schema();

-- ================================================================
-- نظام حساب تكلفة الوجبات التلقائي بناءً على المكونات (BOM)
-- ================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_sync_meal_cost() RETURNS TRIGGER AS $t$
BEGIN
    UPDATE public.products
    SET cost = (
        SELECT COALESCE(SUM(bom.quantity_required * COALESCE(ing.cost, ing.purchase_price, 0)), 0)
        FROM public.bill_of_materials bom
        JOIN public.products ing ON bom.raw_material_id = ing.id
        WHERE bom.product_id = COALESCE(NEW.product_id, OLD.product_id)
    )
    WHERE id = COALESCE(NEW.product_id, OLD.product_id);
    RETURN NULL;
END; $t$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meal_cost_sync ON public.bill_of_materials;
CREATE TRIGGER trg_meal_cost_sync 
AFTER INSERT OR UPDATE OR DELETE ON public.bill_of_materials
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_meal_cost();

-- ================================================================
-- دوال إدارة الورديات (Shift Management)
-- ================================================================

-- دالة بدء الوردية
CREATE OR REPLACE FUNCTION public.start_shift(p_user_id uuid, p_opening_balance numeric, p_resume_existing boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_existing_shift_id UUID; v_new_shift_id UUID;
BEGIN
    SET search_path = public;
    SELECT id INTO v_existing_shift_id FROM public.shifts WHERE user_id = p_user_id AND end_time IS NULL LIMIT 1;
    IF v_existing_shift_id IS NOT NULL AND p_resume_existing THEN RETURN v_existing_shift_id; END IF;
    IF v_existing_shift_id IS NOT NULL THEN RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم'; END IF;
    INSERT INTO public.shifts (user_id, start_time, opening_balance, organization_id)
    VALUES (p_user_id, now(), p_opening_balance, public.get_my_org()) RETURNING id INTO v_new_shift_id;
    RETURN v_new_shift_id;
END; $$;

-- ================================================================
-- 3.7 صيانة وتحديث الأرصدة (Balance Maintenance)
-- ================================================================

-- تحديث رصيد العميل الواحد (مدين - دائن)
CREATE OR REPLACE FUNCTION public.update_single_customer_balance(p_customer_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_balance numeric := 0;
BEGIN
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_balance FROM public.invoices WHERE customer_id = p_customer_id AND status != 'draft';
    SELECT v_balance - COALESCE((SELECT SUM(amount) FROM public.receipt_vouchers WHERE customer_id = p_customer_id), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.sales_returns WHERE customer_id = p_customer_id AND status = 'posted'), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.credit_notes WHERE customer_id = p_customer_id AND status = 'posted'), 0) INTO v_balance;

    UPDATE public.customers SET balance = v_balance WHERE id = p_customer_id;
END; $$;

-- تحديث رصيد المورد الواحد
CREATE OR REPLACE FUNCTION public.update_single_supplier_balance(p_supplier_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_balance numeric := 0;
BEGIN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_balance FROM public.purchase_invoices WHERE supplier_id = p_supplier_id AND status != 'draft';
    SELECT v_balance - COALESCE((SELECT SUM(amount) FROM public.payment_vouchers WHERE supplier_id = p_supplier_id), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.purchase_returns WHERE supplier_id = p_supplier_id AND status = 'posted'), 0) INTO v_balance;
    SELECT v_balance - COALESCE((SELECT SUM(total_amount) FROM public.debit_notes WHERE supplier_id = p_supplier_id AND status = 'posted'), 0) INTO v_balance;

    UPDATE public.suppliers SET balance = v_balance WHERE id = p_supplier_id;
END; $$;

-- تحديث رصيد المخزن لصنف معين
CREATE OR REPLACE FUNCTION public.update_product_stock(p_product_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_stock numeric := 0;
BEGIN
    SELECT COALESCE((SELECT SUM(quantity) FROM public.opening_inventories WHERE product_id = p_product_id), 0) INTO v_stock;
    SELECT v_stock + COALESCE((SELECT SUM(pii.quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id WHERE pii.product_id = p_product_id AND pi.status != 'draft'), 0) INTO v_stock;
    SELECT v_stock - COALESCE((SELECT SUM(ii.quantity) FROM public.invoice_items ii JOIN public.invoices i ON ii.invoice_id = i.id WHERE ii.product_id = p_product_id AND i.status != 'draft'), 0) INTO v_stock;
    SELECT v_stock + COALESCE((SELECT SUM(sri.quantity) FROM public.sales_return_items sri JOIN public.sales_returns sr ON sri.sales_return_id = sr.id WHERE sri.product_id = p_product_id AND sr.status != 'draft'), 0) INTO v_stock;
    SELECT v_stock - COALESCE((SELECT SUM(pri.quantity) FROM public.purchase_return_items pri JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id WHERE pri.product_id = p_product_id AND pr.status != 'draft'), 0) INTO v_stock;
    SELECT v_stock + COALESCE((SELECT SUM(CASE WHEN type = 'in' THEN quantity WHEN type = 'out' THEN -quantity ELSE 0 END) FROM public.stock_adjustment_items sai JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id WHERE sai.product_id = p_product_id AND sa.status != 'draft'), 0) INTO v_stock;

    UPDATE public.products SET stock = v_stock WHERE id = p_product_id;
END; $$;

-- إضافة منتج مع رصيد افتتاحي وقيد محاسبي آلي
CREATE OR REPLACE FUNCTION public.add_product_with_opening_balance(p_name text, p_sku text, p_sales_price numeric, p_purchase_price numeric, p_stock numeric, p_org_id uuid, p_item_type text, p_inventory_account_id uuid, p_cogs_account_id uuid, p_sales_account_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_product_id uuid; BEGIN
    INSERT INTO public.products (name, sku, sales_price, purchase_price, stock, organization_id, item_type, inventory_account_id, cogs_account_id, sales_account_id)
    VALUES (p_name, p_sku, p_sales_price, p_purchase_price, p_stock, p_org_id, p_item_type, p_inventory_account_id, p_cogs_account_id, p_sales_account_id) RETURNING id INTO v_product_id;
    RETURN v_product_id;
END; $$;

-- ================================================================
-- 4. البيانات الأولية (Seeding) - من master_setup.sql
-- ================================================================
DO $$ 
DECLARE 
    v_org_id uuid; v_cat_id uuid;
BEGIN
    INSERT INTO public.organizations (name) VALUES ('الشركة النموذجية للتجارة') RETURNING id INTO v_org_id;
    INSERT INTO public.company_settings (organization_id, company_name, currency, vat_rate) VALUES (v_org_id, 'الشركة النموذجية للتجارة', 'SAR', 0.15);
    INSERT INTO public.warehouses (organization_id, name) VALUES (v_org_id, 'المستودع الرئيسي');
    
    INSERT INTO public.accounts (organization_id, code, name, type, is_group) VALUES
    (v_org_id, '1', 'الأصول', 'ASSET', true),
    (v_org_id, '2', 'الخصوم', 'LIABILITY', true),
    (v_org_id, '3', 'حقوق الملكية', 'EQUITY', true),
    (v_org_id, '4', 'الإيرادات', 'REVENUE', true),
    (v_org_id, '5', 'المصروفات', 'EXPENSE', true);

    INSERT INTO public.roles (name, description) VALUES ('super_admin', 'المدير العام');
    INSERT INTO public.item_categories (organization_id, name) VALUES (v_org_id, 'عام') RETURNING id INTO v_cat_id;

    UPDATE public.products p SET cost = (
        SELECT COALESCE(SUM(bom.quantity_required * COALESCE(ing.cost, ing.purchase_price, 0)), 0)
        FROM public.bill_of_materials bom JOIN public.products ing ON bom.raw_material_id = ing.id WHERE bom.product_id = p.id
    ) WHERE EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = p.id);
END $$;

-- ================================================================
-- 5. الدوال البرمجية (Functions) - من deploy_all_functionss.sql (مع التعديلات)
-- ================================================================

-- 1. دوال الاعتماد المالي (Financial Approvals)

-- أ. اعتماد فاتورة المبيعات (Sales Invoice)
DROP FUNCTION IF EXISTS public.approve_invoice(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid;
    v_customer_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_journal_id uuid;
    v_discount_acc_id uuid; v_treasury_acc_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_exchange_rate numeric; 
    v_modifier_json jsonb; v_bom_item record;
    v_total_amount_base numeric; v_paid_amount_base numeric; v_subtotal_base numeric;
    v_tax_amount_base numeric; v_discount_amount_base numeric;
    v_mappings jsonb;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    v_org_id := public.get_my_org(); -- 🔒 فرض مؤسسة المستخدم الحالي
    IF v_invoice.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: لا يمكنك اعتماد فاتورة لا تنتمي لمؤسستك'; 
    END IF;

    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

      -- 1. جلب روابط الحسابات المخصصة من إعدادات الشركة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 2. جلب الحسابات (الأولوية للربط المخصص Mapping ثم الكود الافتراضي)
    v_sales_acc_id := (v_mappings->>'SALES_REVENUE')::uuid;
    IF v_sales_acc_id IS NULL THEN
        SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_vat_acc_id := (v_mappings->>'VAT')::uuid;
    IF v_vat_acc_id IS NULL THEN
        SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_customer_acc_id := (v_mappings->>'CUSTOMERS')::uuid;
    IF v_customer_acc_id IS NULL THEN
        SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_cogs_acc_id := (v_mappings->>'COGS')::uuid;
    IF v_cogs_acc_id IS NULL THEN
        SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_inventory_acc_id := (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid;
    IF v_inventory_acc_id IS NULL THEN
        SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;

    v_discount_acc_id := (v_mappings->>'SALES_DISCOUNT')::uuid;
    IF v_discount_acc_id IS NULL THEN
        SELECT id INTO v_discount_acc_id FROM public.accounts WHERE code = '4102' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    END IF;  
   
    v_treasury_acc_id := v_invoice.treasury_account_id;

    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        SELECT weighted_average_cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_item.quantity);

        IF EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = v_item.product_id AND organization_id = v_org_id) THEN
            FOR v_bom_item IN SELECT raw_material_id, quantity_required FROM public.bill_of_materials WHERE product_id = v_item.product_id AND organization_id = v_org_id LOOP
                UPDATE public.products 
                SET stock = stock - (v_bom_item.quantity_required * v_item.quantity),
                    warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - (v_bom_item.quantity_required * v_item.quantity)))
                WHERE id = v_bom_item.raw_material_id AND organization_id = v_org_id;
            END LOOP;
        ELSE
            UPDATE public.products 
            SET stock = stock - v_item.quantity,
                warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_item.quantity))
            WHERE id = v_item.product_id AND organization_id = v_org_id;
        END IF;
        IF v_item.modifiers IS NOT NULL THEN
            FOR v_modifier_json IN SELECT * FROM jsonb_array_elements(v_item.modifiers) LOOP
                IF (v_modifier_json->>'id') IS NOT NULL THEN
                    FOR v_bom_item IN SELECT raw_material_id, quantity_required FROM public.bill_of_materials WHERE product_id = (v_modifier_json->>'id')::uuid AND organization_id = v_org_id LOOP
                        UPDATE public.products 
                        SET stock = stock - (v_bom_item.quantity_required * v_item.quantity),
                            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - (v_bom_item.quantity_required * v_item.quantity)))
                        WHERE id = v_bom_item.raw_material_id AND organization_id = v_org_id;
                    END LOOP;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_paid_amount_base := COALESCE(v_invoice.paid_amount, 0) * v_exchange_rate;
    v_subtotal_base := v_invoice.subtotal * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_discount_amount_base := COALESCE(v_invoice.discount_amount, 0) * v_exchange_rate;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'invoice', true) 
    RETURNING id INTO v_journal_id;

    IF (v_total_amount_base - v_paid_amount_base) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, (v_total_amount_base - v_paid_amount_base), 0, 'استحقاق عميل', v_org_id);
    END IF;
    IF v_paid_amount_base > 0 THEN
        IF v_treasury_acc_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة للمبلغ المدفوع'; END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_treasury_acc_id, v_paid_amount_base, 0, 'تحصيل نقدي', v_org_id);
    END IF;
    IF v_discount_amount_base > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_discount_acc_id, v_discount_amount_base, 0, 'خصم ممنوح', v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_acc_id, 0, v_subtotal_base, 'إيراد مبيعات', v_org_id);
    
    IF v_tax_amount_base > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_tax_amount_base, 'ضريبة القيمة المضافة', v_org_id);
    END IF;

    IF v_total_cost > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
        (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات', v_org_id),
        (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id);
    END IF;

    UPDATE public.invoices SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ب. اعتماد فاتورة المشتريات (Purchase Invoice)
DROP FUNCTION IF EXISTS public.approve_purchase_invoice(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
    v_current_stock numeric; v_current_avg_cost numeric; v_new_avg_cost numeric; v_item_price_base numeric;
    v_total_amount_base numeric; v_tax_amount_base numeric; v_net_amount_base numeric;
    v_mappings jsonb;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_invoice.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: لا يمكنك اعتماد فاتورة شراء لا تنتمي لمؤسستك'; 
    END IF;

    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- جلب روابط الحسابات المخصصة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_inventory_acc_id := (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid;
    IF v_inventory_acc_id IS NULL THEN
        SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_vat_acc_id := (v_mappings->>'VAT_INPUT')::uuid;
    IF v_vat_acc_id IS NULL THEN
        SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_supplier_acc_id := (v_mappings->>'SUPPLIERS')::uuid;
    IF v_supplier_acc_id IS NULL THEN
        SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1;
    END IF;

    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        v_item_price_base := v_item.price * COALESCE(v_invoice.exchange_rate, 1);
        SELECT stock, weighted_average_cost INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_current_stock := COALESCE(v_current_stock, 0); v_current_avg_cost := COALESCE(v_current_avg_cost, 0);
        
        IF (v_current_stock + v_item.quantity) > 0 THEN
            v_new_avg_cost := ((v_current_stock * v_current_avg_cost) + (v_item.quantity * v_item_price_base)) / (v_current_stock + v_item.quantity);
        ELSE
            v_new_avg_cost := v_item_price_base;
        END IF;

        UPDATE public.products 
        SET stock = stock + v_item.quantity, 
            weighted_average_cost = v_new_avg_cost, 
            cost = v_new_avg_cost,
            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_item.quantity))
        WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    v_total_amount_base := v_invoice.total_amount * COALESCE(v_invoice.exchange_rate, 1);
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * COALESCE(v_invoice.exchange_rate, 1);
    v_net_amount_base := v_total_amount_base - v_tax_amount_base;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات', v_org_id);
    IF v_tax_amount_base > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات', v_org_id); END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد', v_org_id);

    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- ج. اعتماد سند القبض (Receipt Voucher)
DROP FUNCTION IF EXISTS public.approve_receipt_voucher(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org(); -- 🔒 فرض العزل التام
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود أو لا تملك صلاحية الوصول له'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id),
    (v_journal_id, p_credit_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;

-- د. اعتماد سند الصرف (Payment Voucher)
DROP FUNCTION IF EXISTS public.approve_payment_voucher(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org(); -- 🔒 فرض العزل التام
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود أو لا تملك صلاحية الوصول له'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true) RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id),
    (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);

    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$;

-- هـ. اعتماد مرتجع المبيعات (Sales Return) مع معالجة التكلفة والمخزون
DROP FUNCTION IF EXISTS public.approve_sales_return(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_acc_sales_ret uuid; v_acc_vat uuid; v_acc_cust uuid;
    v_acc_cogs uuid; v_acc_inv uuid;
    v_total_cost numeric := 0; v_item_cost numeric;
BEGIN
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF v_return.status = 'posted' THEN RETURN; END IF;
    
    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_return.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: محاولة تلاعب بالبيانات'; 
    END IF;

    SELECT id INTO v_acc_sales_ret FROM public.accounts WHERE code = '412' AND organization_id = v_org_id LIMIT 1; -- مسموحات ومرتجعات مبيعات
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1;      -- ضريبة مخرجات
    SELECT id INTO v_acc_cust FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1;     -- العملاء
    SELECT id INTO v_acc_cogs FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1;      -- تكلفة مبيعات
    SELECT id INTO v_acc_inv FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;     -- مخزون منتج تام

    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        SELECT weighted_average_cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_item.quantity);

        UPDATE public.products 
        SET stock = stock + v_item.quantity,
            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity))
        WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_sales_ret, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مرتجع مبيعات', v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, v_return.tax_amount, 0, 'ضريبة المرتجع', v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cust, 0, v_return.total_amount, 'تخفيض حساب العميل', v_org_id);

    IF v_total_cost > 0 AND v_acc_cogs IS NOT NULL AND v_acc_inv IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_inv, v_total_cost, 0, 'إعادة للمخزون (مرتجع)', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cogs, 0, v_total_cost, 'عكس تكلفة مبيعات', v_org_id);
    END IF;

    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
    UPDATE public.customers SET balance = COALESCE(balance, 0) - v_return.total_amount WHERE id = v_return.customer_id AND organization_id = v_org_id;
END; $$;

-- و. اعتماد مرتجع المشتريات (Purchase Return)
DROP FUNCTION IF EXISTS public.approve_purchase_return(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_acc_inv uuid; v_acc_vat uuid; v_acc_supp uuid;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF v_return.status = 'posted' THEN RETURN; END IF;

    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_return.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: محاولة تلاعب بالبيانات'; 
    END IF;

    SELECT id INTO v_acc_inv FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1; -- مخزون منتج تام
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1;  -- ضريبة مدخلات
    SELECT id INTO v_acc_supp FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1; -- الموردين

    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock - v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مشتريات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'purchase_return', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_supp, v_return.total_amount, 0, 'تخفيض حساب المورد', v_org_id),
    (v_journal_id, v_acc_inv, 0, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 'تخفيض المخزون', v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, 0, v_return.tax_amount, 'عكس ضريبة مدخلات', v_org_id);
    END IF;

    UPDATE public.purchase_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
    UPDATE public.suppliers SET balance = COALESCE(balance, 0) - v_return.total_amount WHERE id = v_return.supplier_id AND organization_id = v_org_id;
END; $$;

-- ز. اعتماد الإشعار الدائن (Credit Note)
DROP FUNCTION IF EXISTS public.approve_credit_note(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid;
    v_acc_allowance uuid; v_acc_vat uuid; v_acc_cust uuid;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    IF v_note.status = 'posted' THEN RETURN; END IF;

    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_note.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: محاولة تلاعب بالبيانات'; 
    END IF;

    SELECT id INTO v_acc_allowance FROM public.accounts WHERE code = '413' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_cust FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1;

    IF v_acc_allowance IS NULL OR v_acc_cust IS NULL THEN RAISE EXCEPTION 'حسابات المسموحات أو العملاء غير معرّفة (413, 1221)'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار دائن رقم ' || v_note.credit_note_number, v_note.credit_note_number, 'posted', v_org_id, p_note_id, 'credit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_allowance, v_note.amount_before_tax, 0, 'مسموحات مبيعات', v_org_id);
    
    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, v_note.tax_amount, 0, 'ضريبة إشعار دائن', v_org_id);
    END IF;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_cust, 0, v_note.total_amount, 'تخفيض مديونية عميل', v_org_id);

    UPDATE public.credit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
    UPDATE public.customers SET balance = COALESCE(balance, 0) - v_note.total_amount WHERE id = v_note.customer_id AND organization_id = v_org_id;
END; $$;

-- ح. اعتماد الإشعار المدين (Debit Note)
DROP FUNCTION IF EXISTS public.approve_debit_note(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid;
    v_acc_supp uuid; v_acc_cogs uuid; v_acc_vat uuid;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    IF v_note.status = 'posted' THEN RETURN; END IF;

    v_org_id := public.get_my_org(); -- 🔒 درع الحماية
    IF v_note.organization_id != v_org_id THEN 
        RAISE EXCEPTION 'تحذير أمني: محاولة تلاعب بالبيانات'; 
    END IF;

    SELECT id INTO v_acc_supp FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_cogs FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1;

    IF v_acc_supp IS NULL OR v_acc_cogs IS NULL THEN RAISE EXCEPTION 'حسابات الموردين أو المشتريات غير معرّفة (201, 511)'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار مدين رقم ' || v_note.debit_note_number, v_note.debit_note_number, 'posted', v_org_id, p_note_id, 'debit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_supp, v_note.total_amount, 0, 'تخفيض حساب المورد', v_org_id),
    (v_journal_id, v_acc_cogs, 0, v_note.amount_before_tax, 'تسوية تكلفة مشتريات', v_org_id);

    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, 0, v_note.tax_amount, 'عكس ضريبة مدخلات', v_org_id);
    END IF;

    UPDATE public.debit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
    UPDATE public.suppliers SET balance = COALESCE(balance, 0) - v_note.total_amount WHERE id = v_note.supplier_id AND organization_id = v_org_id;
END; $$;
-- أ. فتح جلسة طاولة
DROP FUNCTION IF EXISTS public.open_table_session(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.open_table_session(p_table_id uuid, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_session_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    IF EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id = p_table_id AND status != 'AVAILABLE' AND organization_id = v_org_id) THEN RAISE EXCEPTION 'الطاولة غير متاحة حالياً'; END IF;
    INSERT INTO public.table_sessions (table_id, opened_by, status, opened_at, organization_id) VALUES (p_table_id, p_user_id, 'OPEN', now(), v_org_id) RETURNING id INTO v_session_id;
    UPDATE public.restaurant_tables SET status = 'OCCUPIED' WHERE id = p_table_id;
    RETURN v_session_id;
END; $$;

-- ب. إنشاء طلب مطعم متكامل
DROP FUNCTION IF EXISTS public.create_restaurant_order(uuid, uuid, text, text, jsonb, uuid, uuid, jsonb) CASCADE;
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order_id uuid; v_item jsonb; v_order_num text; v_order_item_id uuid; v_tax_rate numeric; v_subtotal numeric := 0;
DECLARE v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT (vat_rate) INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1;
    IF v_tax_rate IS NULL THEN v_tax_rate := 0.14; END IF;
    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));
    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, p_warehouse_id) RETURNING id INTO v_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.order_items (order_id, product_id, quantity, price, total_price, unit_cost, notes, organization_id)
        VALUES (v_order_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::numeric, (v_item->>'unitPrice')::numeric, ((v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric), COALESCE((v_item->>'unitCost')::numeric, 0), v_item->>'notes', v_org_id) RETURNING id INTO v_order_item_id;
        v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric);
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;
    UPDATE public.orders SET subtotal = v_subtotal, total_tax = v_subtotal * v_tax_rate, grand_total = v_subtotal + (v_subtotal * v_tax_rate) WHERE id = v_order_id;
     IF p_delivery_info IS NOT NULL THEN
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0), v_org_id);
    END IF;   
    RETURN v_order_id;
END; $$;

-- ================================================================
-- 3. دوال المخزون والمحاسبة (Inventory & Accounting)
-- ================================================================

-- أ. إعادة احتساب أرصدة المخزون بالكامل
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC; v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL AND organization_id = v_org_id LOOP
        total_qty := 0; wh_json := '{}'::jsonb;
        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL AND organization_id = v_org_id LOOP
            wh_qty := 0;
            SELECT COALESCE(SUM(oi.quantity), 0) INTO wh_qty FROM public.opening_inventories oi WHERE oi.product_id = prod_record.id AND oi.warehouse_id = wh_record.id AND oi.organization_id = v_org_id;
            SELECT wh_qty + COALESCE((SELECT SUM(pii.quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft' AND pi.organization_id = v_org_id), 0) INTO wh_qty;
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft' AND i.organization_id = v_org_id), 0) INTO wh_qty;
            SELECT wh_qty + COALESCE((SELECT SUM(sri.quantity) FROM public.sales_return_items sri JOIN public.sales_returns sr ON sri.sales_return_id = sr.id WHERE sri.product_id = prod_record.id AND sr.warehouse_id = wh_record.id AND sr.status = 'posted' AND sr.organization_id = v_org_id), 0) INTO wh_qty;
            SELECT wh_qty - COALESCE((SELECT SUM(pri.quantity) FROM public.purchase_return_items pri JOIN public.purchase_returns pr ON pri.return_id = pr.id WHERE pri.product_id = prod_record.id AND pr.warehouse_id = wh_record.id AND pr.status = 'posted' AND pr.organization_id = v_org_id), 0) INTO wh_qty;
            total_qty := total_qty + wh_qty;
            IF wh_qty <> 0 THEN wh_json := wh_json || jsonb_build_object(wh_record.id, wh_qty); END IF;
        END LOOP;
        UPDATE products SET stock = total_qty, warehouse_stock = wh_json WHERE id = prod_record.id;
    END LOOP;
END; $$;

-- ب. إنشاء قيد يومية متوازن
DROP FUNCTION IF EXISTS public.create_journal_entry(date, text, text, jsonb, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.create_journal_entry(entry_date date, description text, reference text, entries jsonb, status text DEFAULT 'posted', org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_entry_id uuid; entry_record jsonb; v_debit numeric := 0; v_credit numeric := 0;
BEGIN
    SELECT SUM((item->>'debit')::numeric), SUM((item->>'credit')::numeric) INTO v_debit, v_credit FROM jsonb_array_elements(entries) AS item;
    IF ABS(COALESCE(v_debit, 0) - COALESCE(v_credit, 0)) > 0.01 THEN RAISE EXCEPTION 'القيد غير متوازن: المدين % لا يساوي الدائن %', v_debit, v_credit; END IF;
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id) VALUES (entry_date, description, reference, status, COALESCE(org_id, public.get_my_org())) RETURNING id INTO new_entry_id;
    FOR entry_record IN SELECT * FROM jsonb_array_elements(entries) LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (new_entry_id, (entry_record->>'account_id')::uuid, (entry_record->>'debit')::numeric, (entry_record->>'credit')::numeric, (entry_record->>'description'), COALESCE(org_id, public.get_my_org()));
    END LOOP;
    RETURN new_entry_id;
END; $$;

-- ================================================================
-- 4. دوال شؤون الموظفين (HR & Payroll)
-- ================================================================

-- تشغيل مسير الرواتب
DROP FUNCTION IF EXISTS public.run_payroll_rpc(integer, integer, date, uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.run_payroll_rpc(int, int, date, uuid, jsonb, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(
    p_month integer, 
    p_year integer, 
    p_date date, 
    p_treasury_account_id uuid, 
    p_items jsonb
) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; 
    v_total_additions numeric := 0; v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; v_total_net numeric := 0; 
    v_item jsonb; v_je_id uuid; v_mappings jsonb;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; v_payroll_tax_acc_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_salaries_acc_id := (v_mappings->>'SALARIES_EXPENSE')::uuid;
    IF v_salaries_acc_id IS NULL THEN
        SELECT id INTO v_salaries_acc_id FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_bonuses_acc_id := (v_mappings->>'EMPLOYEE_BONUSES')::uuid;
    IF v_bonuses_acc_id IS NULL THEN
        SELECT id INTO v_bonuses_acc_id FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_deductions_acc_id := (v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid;
    IF v_deductions_acc_id IS NULL THEN
        SELECT id INTO v_deductions_acc_id FROM public.accounts WHERE code = '422' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_advances_acc_id := (v_mappings->>'EMPLOYEE_ADVANCES')::uuid;
    IF v_advances_acc_id IS NULL THEN
        SELECT id INTO v_advances_acc_id FROM public.accounts WHERE code = '1223' AND organization_id = v_org_id LIMIT 1;
    END IF;

    v_payroll_tax_acc_id := (v_mappings->>'PAYROLL_TAX')::uuid;
    IF v_payroll_tax_acc_id IS NULL THEN
        SELECT id INTO v_payroll_tax_acc_id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1;
    END IF;

    IF v_salaries_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الرواتب الرئيسي (531) غير موجود.'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_total_gross := v_total_gross + (v_item->>'gross_salary')::numeric;
        v_total_additions := v_total_additions + (v_item->>'additions')::numeric;
        v_total_deductions := v_total_deductions + COALESCE((v_item->>'other_deductions')::numeric, 0);
        v_total_advances := v_total_advances + (v_item->>'advances_deducted')::numeric;
        v_total_payroll_tax := v_total_payroll_tax + COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_net := v_total_net + (v_item->>'net_salary')::numeric;
    END LOOP;

    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances + v_total_payroll_tax), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, payroll_tax, advances_deducted, other_deductions, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, (v_item->>'gross_salary')::numeric, (v_item->>'additions')::numeric, COALESCE((v_item->>'payroll_tax')::numeric, 0), (v_item->>'advances_deducted')::numeric, (v_item->>'other_deductions')::numeric, (v_item->>'net_salary')::numeric, v_org_id);
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year || '-' || floor(random()*1000)::text, 'posted', v_org_id, true) RETURNING id INTO v_je_id;

    IF v_total_gross > 0 AND v_salaries_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 AND v_bonuses_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF;
    IF v_total_advances > 0 AND v_advances_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 AND v_deductions_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_payroll_tax > 0 AND v_payroll_tax_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_payroll_tax_acc_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل', v_org_id); END IF;
    IF v_total_net > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_account_id, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;
END; $$;

-- ================================================================
-- 4. دوال الأصول والعمولات (Assets & Commissions)
-- ================================================================

-- أ. تشغيل الإهلاك الشهري (Run Depreciation)
DROP FUNCTION IF EXISTS public.run_period_depreciation(date, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.run_period_depreciation(p_date date, p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_asset record; v_monthly_dep numeric; v_journal_id uuid; v_processed int := 0; v_skipped int := 0;
    v_dep_exp_acc_id uuid; v_acc_dep_acc_id uuid;
BEGIN
    p_org_id := public.get_my_org();

    FOR v_asset IN SELECT * FROM public.assets WHERE status = 'active' AND (purchase_cost - salvage_value) > 0 AND organization_id = p_org_id LOOP
        PERFORM 1 FROM public.journal_entries WHERE related_document_id = v_asset.id AND related_document_type = 'asset_depreciation' AND to_char(transaction_date, 'YYYY-MM') = to_char(p_date, 'YYYY-MM');
        IF FOUND THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

        IF v_asset.useful_life > 0 THEN 
            v_monthly_dep := (v_asset.purchase_cost - v_asset.salvage_value) / (v_asset.useful_life * 12); 
        ELSE v_monthly_dep := 0; END IF;

        IF v_monthly_dep > 0 THEN
            v_dep_exp_acc_id := COALESCE(v_asset.depreciation_expense_account_id, (SELECT id FROM public.accounts WHERE code = '533' AND organization_id = p_org_id LIMIT 1));
            v_acc_dep_acc_id := COALESCE(v_asset.accumulated_depreciation_account_id, (SELECT id FROM public.accounts WHERE code = '1119' AND organization_id = p_org_id LIMIT 1));

            IF v_dep_exp_acc_id IS NOT NULL AND v_acc_dep_acc_id IS NOT NULL THEN
                INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id, related_document_id, related_document_type) 
                VALUES (p_date, 'إهلاك أصل: ' || v_asset.name, 'DEP-' || substring(v_asset.id::text, 1, 6), 'posted', true, p_org_id, v_asset.id, 'asset_depreciation') RETURNING id INTO v_journal_id;
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_dep_exp_acc_id, v_monthly_dep, 0, 'مصروف إهلاك', p_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_dep_acc_id, 0, v_monthly_dep, 'مجمع إهلاك', p_org_id);
                v_processed := v_processed + 1;
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('processed', v_processed, 'skipped', v_skipped);
END; $$;

-- ب. حساب عمولة المندوبين (Sales Commission)
DROP FUNCTION IF EXISTS public.calculate_sales_commission(uuid, date, date, numeric) CASCADE;
CREATE OR REPLACE FUNCTION public.calculate_sales_commission(p_salesperson_id uuid, p_start_date date, p_end_date date, p_rate numeric DEFAULT 1.0) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sales numeric; v_returns numeric; v_net numeric; v_comm numeric;
BEGIN
    SELECT COALESCE(SUM(subtotal), 0) INTO v_sales FROM public.invoices WHERE salesperson_id = p_salesperson_id AND status IN ('posted', 'paid') AND invoice_date BETWEEN p_start_date AND p_end_date;
    SELECT COALESCE(SUM(sr.total_amount - COALESCE(sr.tax_amount, 0)), 0) INTO v_returns FROM public.sales_returns sr JOIN public.invoices i ON sr.original_invoice_id = i.id WHERE i.salesperson_id = p_salesperson_id AND sr.status = 'posted' AND sr.return_date BETWEEN p_start_date AND p_end_date;
    v_net := v_sales - v_returns;
    v_comm := v_net * (p_rate / 100);
    RETURN jsonb_build_object('total_sales', v_sales, 'net_sales', v_net, 'commission_amount', v_comm);
END; $$;

-- ج. تقرير مبيعات المطعم التفصيلي (Restaurant Sales Report)
DROP FUNCTION IF EXISTS public.get_restaurant_sales_report(text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_restaurant_sales_report(text, text) CASCADE;
CREATE OR REPLACE FUNCTION public.get_restaurant_sales_report(p_start_date text, p_end_date text, p_org_id uuid DEFAULT NULL) 
RETURNS TABLE(item_name text, category_name text, quantity numeric, total_sales numeric) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
  v_target_org := COALESCE(p_org_id, public.get_my_org());
  RETURN QUERY
  SELECT p.name::text, COALESCE(mc.name, 'غير مصنف')::text, COALESCE(SUM(oi.quantity), 0)::numeric, COALESCE(SUM(oi.total_price), 0)::numeric
  FROM public.order_items oi 
  JOIN public.orders o ON oi.order_id = o.id 
  JOIN public.products p ON oi.product_id = p.id
  LEFT JOIN public.menu_categories mc ON p.category_id = mc.id
  WHERE o.organization_id = v_target_org
  AND o.status IN ('CONFIRMED', 'COMPLETED') 
  AND o.created_at >= p_start_date::timestamptz 
  AND o.created_at <= p_end_date::timestamptz
  GROUP BY 1, 2 ORDER BY total_sales DESC;
END; $$;

-- هـ. تقرير مبيعات الكاشير (Sales By User Report)
DROP FUNCTION IF EXISTS public.get_sales_by_user_report(text, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_sales_by_user_report(p_start_date text, p_end_date text, p_org_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, user_name text, total_orders bigint, total_sales numeric) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
  v_target_org := COALESCE(p_org_id, public.get_my_org());
  RETURN QUERY
  SELECT
    au.id AS user_id,
    COALESCE(p.full_name, au.email) AS user_name,
    COUNT(o.id) AS total_orders,
    COALESCE(SUM(o.grand_total), 0)::numeric AS total_sales
  FROM public.orders o
  JOIN auth.users au ON o.user_id = au.id
  LEFT JOIN public.profiles p ON au.id = p.id AND p.organization_id = v_target_org
  WHERE o.organization_id = v_target_org
    AND o.status IN ('COMPLETED', 'PAID')
    AND o.created_at >= p_start_date::timestamptz
    AND o.created_at <= p_end_date::timestamptz
  GROUP BY au.id, p.full_name, au.email
  ORDER BY total_sales DESC;
END; $$;

-- ================================================================
-- 5. دوال التقارير والرقابة (Reporting & SaaS Control)
-- ================================================================

-- أ. التحقق من حدود المستخدمين (منع التجاوز)
CREATE OR REPLACE FUNCTION public.check_user_limit() RETURNS TRIGGER AS $$
DECLARE v_max integer; v_curr integer;
BEGIN
    SELECT max_users INTO v_max FROM public.organizations WHERE id = NEW.organization_id;
    SELECT count(*) INTO v_curr FROM public.profiles WHERE organization_id = NEW.organization_id AND role != 'super_admin';
    IF v_curr >= COALESCE(v_max, 5) THEN RAISE EXCEPTION 'وصلت للحد الأقصى للمستخدمين (%)', v_max; END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_limit_users ON public.profiles;
CREATE TRIGGER trg_limit_users BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.check_user_limit();

-- ب. إحصائيات لوحة البيانات
DROP FUNCTION IF EXISTS public.get_dashboard_stats() CASCADE;
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_month_sales numeric; v_receivables numeric; v_payables numeric;
    v_low_stock_count integer; v_chart_data json; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT COALESCE(SUM(amount), 0) INTO v_month_sales 
    FROM public.monthly_sales_dashboard 
    WHERE organization_id = v_org_id AND date_trunc('month', transaction_date) = date_trunc('month', CURRENT_DATE);
    
    SELECT COALESCE(SUM(balance), 0) INTO v_receivables FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '1221%';
    SELECT COALESCE(SUM(ABS(balance)), 0) INTO v_payables FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '201%';
    
    SELECT COUNT(*) INTO v_low_stock_count FROM public.products WHERE organization_id = v_org_id AND stock <= COALESCE(min_stock_level, 0) AND deleted_at IS NULL;
    
    SELECT json_agg(t) INTO v_chart_data FROM (
        SELECT to_char(month, 'YYYY-MM') as name, 
               COALESCE((SELECT SUM(amount) FROM public.monthly_sales_dashboard WHERE organization_id = v_org_id AND date_trunc('month', transaction_date) = month), 0) as sales
        FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE), '1 month') as month
    ) t;

    RETURN json_build_object(
        'monthSales', v_month_sales,
        'receivables', v_receivables,
        'payables', v_payables,
        'lowStockCount', v_low_stock_count,
        'chartData', v_chart_data
    );
END; $$;

-- ج. جلب العملاء المتجاوزين لحد الائتمان
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_over_limit_customers() CASCADE;
CREATE OR REPLACE FUNCTION public.get_over_limit_customers(p_org_id uuid)
RETURNS TABLE (id UUID, name TEXT, total_debt NUMERIC, credit_limit NUMERIC) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY SELECT c.id, c.name, COALESCE(c.balance, 0), COALESCE(c.credit_limit, 0) 
    FROM public.customers c WHERE c.organization_id = p_org_id AND COALESCE(c.balance, 0) > COALESCE(c.credit_limit, 0) AND COALESCE(c.credit_limit, 0) > 0;
END; $$;

-- د. جلب النسب المالية التاريخية
DROP FUNCTION IF EXISTS public.get_historical_ratios(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_historical_ratios(p_org_id uuid DEFAULT NULL) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profit jsonb; v_liquidity jsonb; v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    
    SELECT jsonb_agg(jsonb_build_object('name', month_key, 'ربحية', margin)) INTO v_profit FROM (
        SELECT to_char(je.transaction_date, 'YYYY-MM') as month_key,
            CASE WHEN SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END) > 0 
                 THEN ROUND(((SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END) - SUM(CASE WHEN a.code LIKE '5%' THEN jl.debit - jl.credit ELSE 0 END)) / NULLIF(SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit ELSE 0 END), 0)) * 100, 2)
                 ELSE 0 END as margin
        FROM public.journal_entries je JOIN public.journal_lines jl ON je.id = jl.journal_entry_id JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_target_org AND je.status = 'posted' AND je.transaction_date >= (date_trunc('month', now()) - interval '6 months')::date
        GROUP BY 1 ORDER BY 1
    ) sub;

    SELECT jsonb_agg(jsonb_build_object('name', month_key, 'سيولة', ratio)) INTO v_liquidity FROM (
        SELECT to_char(je.transaction_date, 'YYYY-MM') as month_key,
            CASE WHEN SUM(CASE WHEN a.code LIKE '2%' THEN jl.credit - jl.debit ELSE 0 END) != 0 
                 THEN ROUND(SUM(CASE WHEN (a.code LIKE '12%' OR a.code LIKE '103%') THEN jl.debit - jl.credit ELSE 0 END) / NULLIF(ABS(SUM(CASE WHEN a.code LIKE '2%' THEN jl.credit - jl.debit ELSE 0 END), 0), 2)
                 ELSE 0 END as ratio
        FROM public.journal_entries je JOIN public.journal_lines jl ON je.id = jl.journal_entry_id JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_target_org AND je.status = 'posted' AND je.transaction_date >= (date_trunc('month', now()) - interval '6 months')::date
        GROUP BY 1 ORDER BY 1
    ) sub;

    RETURN jsonb_build_object(
        'profitabilityData', COALESCE(v_profit, '[]'::jsonb),
        'liquidityData', COALESCE(v_liquidity, '[]'::jsonb)
    );
END; $$;

-- و. دالة التحقق من القيود غير المرحلة (Check Unposted Entries)
DROP FUNCTION IF EXISTS public.check_unposted_entries(date, date, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.check_unposted_entries(p_start_date date, p_end_date date, p_org_id uuid DEFAULT NULL)
RETURNS TABLE (entry_id uuid, entry_date date, entry_description text, entry_reference text, current_status text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    RETURN QUERY
    SELECT id, transaction_date, description, reference, status
    FROM public.journal_entries
    WHERE organization_id = v_target_org
      AND status != 'posted'
      AND transaction_date BETWEEN p_start_date AND p_end_date;
END; $$;

-- تنشيط الكاش فوراً لضمان تعرف الواجهة على التغييرات
SELECT public.refresh_saas_schema();

-- دالة تحليل تكاليف الإنتاج (حل مشكلة PGRST202)
DROP FUNCTION IF EXISTS public.get_manufacturing_analysis(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.get_manufacturing_analysis(date, uuid, date) CASCADE;
CREATE OR REPLACE FUNCTION public.get_manufacturing_analysis(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    id uuid,
    order_number text,
    product_name text,
    quantity numeric,
    end_date date,
    standard_cost numeric,
    actual_cost numeric,
    material_variance numeric,
    wastage_qty numeric,
    variance numeric,
    variance_percent numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH order_standard_costs AS (
        SELECT 
            wo_inner.id as wo_id,
            COALESCE(SUM(bom.quantity_required * COALESCE(p_raw.cost, p_raw.purchase_price, 0)), 0) as unit_standard_cost
        FROM public.work_orders wo_inner
        LEFT JOIN public.bill_of_materials bom ON wo_inner.product_id = bom.product_id
        LEFT JOIN public.products p_raw ON bom.raw_material_id = p_raw.id
        GROUP BY wo_inner.id
    )
    SELECT 
        wo.id,
        wo.order_number,
        p.name as product_name,
        wo.quantity,
        wo.end_date,
        (osc.unit_standard_cost * wo.quantity)::numeric as standard_cost,
        COALESCE((SELECT SUM(amount) FROM public.work_order_costs WHERE work_order_id = wo.id), 0)::numeric as actual_cost,
        0::numeric as material_variance,
        0::numeric as wastage_qty,
        (COALESCE((SELECT SUM(amount) FROM public.work_order_costs WHERE work_order_id = wo.id), 0) - (osc.unit_standard_cost * wo.quantity))::numeric as variance,
        CASE WHEN (osc.unit_standard_cost * wo.quantity) > 0 
             THEN (((COALESCE((SELECT SUM(amount) FROM public.work_order_costs WHERE work_order_id = wo.id), 0) / (osc.unit_standard_cost * wo.quantity)) - 1) * 100)::numeric
             ELSE 0 END as variance_percent
    FROM public.work_orders wo
    JOIN public.products p ON wo.product_id = p.id
    JOIN order_standard_costs osc ON wo.id = osc.wo_id
    WHERE wo.organization_id = p_org_id 
      AND wo.status = 'completed'
      AND wo.end_date BETWEEN p_start_date AND p_end_date;
END; $$;
-- هـ. تسجيل أخطاء النظام (System Error Logger)
DROP FUNCTION IF EXISTS public.log_system_error(text, text, jsonb, text) CASCADE;
CREATE OR REPLACE FUNCTION public.log_system_error(p_message text, p_code text, p_context jsonb, p_func text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.system_error_logs (error_message, error_code, context, function_name, user_id, organization_id)
    VALUES (p_message, p_code, p_context, p_func, auth.uid(), public.get_my_org());
END; $$;

-- ================================================================
-- 29. دالة جلب إحصائيات المنصة الشاملة (للسوبر أدمن فقط)
-- ================================================================
DROP FUNCTION IF EXISTS public.get_admin_platform_metrics() CASCADE;
CREATE OR REPLACE FUNCTION public.get_admin_platform_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    total_sales DECIMAL;
    total_orgs INTEGER;
    active_orgs INTEGER;
    new_orgs_this_month INTEGER;
    new_orgs_last_month INTEGER;
    growth_percentage DECIMAL;
    result JSON;
BEGIN
    SELECT COALESCE(SUM(total_amount), 0) INTO total_sales
    FROM invoices 
    WHERE status = 'posted';

    SELECT COUNT(*) INTO total_orgs FROM organizations;
    SELECT COUNT(*) INTO active_orgs FROM organizations WHERE is_active = true AND subscription_expiry > CURRENT_DATE;

    SELECT COUNT(*) INTO new_orgs_this_month 
    FROM organizations 
    WHERE created_at >= date_trunc('month', CURRENT_DATE);

    SELECT COUNT(*) INTO new_orgs_last_month 
    FROM organizations 
    WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') 
      AND created_at < date_trunc('month', CURRENT_DATE);

    IF new_orgs_last_month > 0 THEN
        growth_percentage := ((new_orgs_this_month::DECIMAL - new_orgs_last_month) / new_orgs_last_month) * 100;
    ELSE
        growth_percentage := 100;
    END IF;

    result := json_build_object(
        'total_platform_sales', total_sales,
        'total_organizations', total_orgs,
        'active_subscriptions', active_orgs,
        'growth_this_month_percent', ROUND(growth_percentage, 2),
        'new_registrations_today', (SELECT COUNT(*) FROM organizations WHERE created_at::DATE = CURRENT_DATE)
    );
    RETURN result;
END; $$;

-- ================================================================
-- 29.5 دالة قسرية لمنح صلاحيات مدير لمستخدم معين (حل مشكلة الصلاحيات)
-- ================================================================ 
DROP FUNCTION IF EXISTS public.force_grant_admin_access(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.force_grant_admin_access(p_user_id uuid, p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, organization_id, role, is_active)
    VALUES (p_user_id, p_org_id, 'admin', true)
    ON CONFLICT (id) DO UPDATE 
    SET organization_id = EXCLUDED.organization_id,
        role = 'admin',
        is_active = true;

    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('org_id', p_org_id, 'role', 'admin')
    WHERE id = p_user_id;
END; $$;

-- ================================================================
-- 29.6 تهيئة الدليل المحاسبي المصري لشركة جديدة
-- ================================================================ 
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id uuid, p_activity_type text DEFAULT 'commercial', p_admin_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_vat_rate numeric; v_admin_id uuid; v_retained_id uuid; v_org_name text;
    v_cash_id uuid; v_sales_id uuid; v_cust_id uuid; v_cogs_id uuid; v_inv_id uuid; v_vat_id uuid; v_supp_id uuid; v_vat_in_id uuid; v_disc_id uuid;
    v_wht_pay_id uuid; v_payroll_tax_id uuid; v_wht_rec_id uuid;
    v_sal_exp_id uuid; v_bonus_id uuid; v_ded_id uuid; v_adv_id uuid;
BEGIN
    v_vat_rate := CASE WHEN p_activity_type = 'construction' THEN 0.05 WHEN p_activity_type = 'charity' THEN 0.00 ELSE 0.14 END;
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    CREATE TEMPORARY TABLE coa_temp (code text PRIMARY KEY, name text NOT NULL, type text NOT NULL, is_group boolean NOT NULL, parent_code text) ON COMMIT DROP;

    INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
    ('1', 'الأصول', 'asset', true, NULL),
    ('2', 'الخصوم', 'liability', true, NULL),
    ('3', 'حقوق الملكية', 'equity', true, NULL),
    ('4', 'الإيرادات', 'revenue', true, NULL),
    ('5', 'المصروفات', 'expense', true, NULL),
    ('12', 'الأصول المتداولة', 'asset', true, '1'),
    ('31', 'رأس المال والاحتياطيات', 'equity', true, '3'),
    ('123', 'النقدية وما في حكمها', 'asset', true, '12'),
    ('1232', 'البنوك - حسابات جارية', 'asset', true, '123'),
    ('1233', 'المحافظ الإلكترونية', 'asset', true, '123'),
    ('124', 'أرصدة مدينة أخرى', 'asset', true, '12'),
    ('223', 'مصلحة الضرائب (التزامات)', 'liability', true, '2'),
    ('1221', 'العملاء', 'asset', false, '12'),
    ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'asset', false, '124'),
    ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'asset', false, '124'),
    ('1231', 'الخزينة الرئيسية', 'asset', false, '123'),
    ('123201', 'البنك الأهلي المصري', 'asset', false, '1232'),
    ('123202', 'بنك مصر', 'asset', false, '1232'),
    ('123203', 'البنك التجاري الدولي (CIB)', 'asset', false, '1232'),
    ('123204', 'بنك QNB الأهلي', 'asset', false, '1232'),
    ('123205', 'بنك القاهرة', 'asset', false, '1232'),
    ('123301', 'فودافون كاش', 'asset', false, '1233'),
    ('123302', 'اتصالات كاش', 'asset', false, '1233'),
    ('123303', 'أورنج كاش', 'asset', false, '1233'),
    ('123304', 'وي باي (WE Pay)', 'asset', false, '1233'),
    ('123305', 'انستا باي (InstaPay)', 'asset', false, '1233'),
    ('10302', 'مخزون منتج تام', 'asset', false, '12'),
    ('1119', 'مجمع إهلاك الأصول', 'asset', false, '1'),
    ('201', 'الموردين', 'liability', false, '2'),
    ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'liability', false, '223'),
    ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'liability', false, '223'),
    ('2233', 'ضريبة كسب العمل', 'liability', false, '223'),
    ('311', 'رأس المال المدفوع', 'equity', false, '31'),
    ('32', 'الأرباح المبقاة', 'equity', false, '3'),
    ('3999', 'الأرصدة الافتتاحية', 'equity', false, '3'),
    ('411', 'إيراد مبيعات', 'revenue', false, '4'),
    ('4102', 'خصم مسموح به', 'revenue', false, '4'),
    ('511', 'تكلفة مبيعات', 'expense', false, '5'),
    ('531', 'رواتب وأجور الموظفين', 'expense', false, '5'),
    ('533', 'مصروف إهلاك الأصول', 'expense', false, '5');

    v_admin_id := COALESCE(p_admin_id, auth.uid());
    IF v_admin_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, organization_id, role, is_active)
        VALUES (v_admin_id, p_org_id, 'admin', true)
        ON CONFLICT (id) DO UPDATE SET 
            organization_id = EXCLUDED.organization_id,
            role = 'admin',
            is_active = true;
            
        INSERT INTO public.company_settings (organization_id, company_name, vat_rate, activity_type)
        VALUES (p_org_id, v_org_name, v_vat_rate, p_activity_type)
        ON CONFLICT (organization_id) DO UPDATE SET activity_type = EXCLUDED.activity_type, vat_rate = EXCLUDED.vat_rate, company_name = EXCLUDED.company_name;
    END IF;

    INSERT INTO public.accounts (organization_id, code, name, type, is_group, is_active)
    SELECT p_org_id, code, name, type, is_group, true FROM coa_temp ON CONFLICT DO NOTHING;

    SELECT id INTO v_retained_id FROM public.accounts WHERE organization_id = p_org_id AND code = '32' LIMIT 1;
    SELECT id INTO v_cash_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1231' LIMIT 1;
    SELECT id INTO v_sales_id FROM public.accounts WHERE organization_id = p_org_id AND code = '411' LIMIT 1;
    SELECT id INTO v_cust_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1;
    SELECT id INTO v_cogs_id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1;
    SELECT id INTO v_inv_id FROM public.accounts WHERE organization_id = p_org_id AND code = '10302' LIMIT 1;
    SELECT id INTO v_vat_id FROM public.accounts WHERE organization_id = p_org_id AND code = '2231' LIMIT 1;
    SELECT id INTO v_supp_id FROM public.accounts WHERE organization_id = p_org_id AND code = '201' LIMIT 1;
    SELECT id INTO v_vat_in_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1241' LIMIT 1;
    SELECT id INTO v_disc_id FROM public.accounts WHERE organization_id = p_org_id AND code = '4102' LIMIT 1;
    SELECT id INTO v_wht_pay_id FROM public.accounts WHERE organization_id = p_org_id AND code = '2232' LIMIT 1;
    SELECT id INTO v_payroll_tax_id FROM public.accounts WHERE organization_id = p_org_id AND code = '2233' LIMIT 1;
    SELECT id INTO v_wht_rec_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1242' LIMIT 1;
    SELECT id INTO v_sal_exp_id FROM public.accounts WHERE organization_id = p_org_id AND code = '531' LIMIT 1;
    SELECT id INTO v_bonus_id FROM public.accounts WHERE organization_id = p_org_id AND code = '5312' LIMIT 1;
    SELECT id INTO v_ded_id FROM public.accounts WHERE organization_id = p_org_id AND code = '422' LIMIT 1;
    SELECT id INTO v_adv_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1223' LIMIT 1;
    
    UPDATE public.company_settings 
    SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object(
        'RETAINED_EARNINGS', COALESCE(v_retained_id, (account_mappings->>'RETAINED_EARNINGS')::uuid),
        'CASH', COALESCE(v_cash_id, (account_mappings->>'CASH')::uuid),
        'SALES_REVENUE', COALESCE(v_sales_id, (account_mappings->>'SALES_REVENUE')::uuid),
        'CUSTOMERS', COALESCE(v_cust_id, (account_mappings->>'CUSTOMERS')::uuid),
        'COGS', COALESCE(v_cogs_id, (account_mappings->>'COGS')::uuid),
        'INVENTORY_FINISHED_GOODS', COALESCE(v_inv_id, (account_mappings->>'INVENTORY_FINISHED_GOODS')::uuid),
        'VAT', COALESCE(v_vat_id, (account_mappings->>'VAT')::uuid),
        'SUPPLIERS', COALESCE(v_supp_id, (account_mappings->>'SUPPLIERS')::uuid),
        'VAT_INPUT', COALESCE(v_vat_in_id, (account_mappings->>'VAT_INPUT')::uuid),
        'SALES_DISCOUNT', COALESCE(v_disc_id, (account_mappings->>'SALES_DISCOUNT')::uuid),
        'WHT_PAYABLE', v_wht_pay_id,
        'PAYROLL_TAX', v_payroll_tax_id,
        'WHT_RECEIVABLE', v_wht_rec_id,
        'SALARIES_EXPENSE', v_sal_exp_id,
        'EMPLOYEE_BONUSES', v_bonus_id,
        'EMPLOYEE_DEDUCTIONS', v_ded_id,
        'EMPLOYEE_ADVANCES', v_adv_id
    )
    WHERE organization_id = p_org_id;

    UPDATE public.accounts a SET parent_id = p.id FROM coa_temp t JOIN public.accounts p ON p.organization_id = p_org_id AND p.code = t.parent_code
    WHERE a.organization_id = p_org_id AND a.code = t.code;

    RETURN '✅ تم التأسيس بنجاح.';
END; $$;

-- ================================================================
-- 29.7 الدالة الشاملة لإنشاء عميل جديد (SaaS Global Creator)
-- ================================================================ 
CREATE OR REPLACE FUNCTION public.create_new_client_v2(
    p_name text,
    p_email text,
    p_activity_type text DEFAULT 'commercial',
    p_vat_number text DEFAULT NULL,
    p_admin_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    INSERT INTO public.organizations (name, email, vat_number, is_active)
    VALUES (p_name, p_email, p_vat_number, true)
    RETURNING id INTO v_org_id;

    PERFORM public.initialize_egyptian_coa(v_org_id, p_activity_type, p_admin_id);

    RETURN v_org_id;
END; $$;

-- ================================================================
-- 29.9 دالة حماية السوبر أدمن عند حذف الشركة
-- ================================================================ 
CREATE OR REPLACE FUNCTION public.protect_super_admin_on_org_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET organization_id = NULL
    WHERE organization_id = OLD.id AND role = 'super_admin';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_protect_super_admin_on_org_delete
BEFORE DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_on_org_delete();

-- ================================================================
-- 30. دالة إصلاح وتنشيط هيكل بيانات الـ SaaS
-- ================================================================ 
DROP FUNCTION IF EXISTS public.refresh_saas_schema() CASCADE;
CREATE OR REPLACE FUNCTION public.refresh_saas_schema()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='max_users') THEN
        ALTER TABLE public.organizations ADD COLUMN max_users INTEGER DEFAULT 5;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='suspension_reason') THEN
        ALTER TABLE public.organizations ADD COLUMN suspension_reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='total_collected') THEN
        ALTER TABLE public.organizations ADD COLUMN total_collected NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='next_payment_date') THEN
        ALTER TABLE public.organizations ADD COLUMN next_payment_date DATE;
    END IF;

    EXECUTE 'NOTIFY pgrst, ''reload config''';
    
    RETURN 'تم تحديث هيكل البيانات وتنشيط الكاش بنجاح ✅';
END; $$;

-- ================================================================
-- 31. دوال الصيانة الذاتية للعميل (Client Self-Maintenance)
-- ================================================================

-- أ. فحص وإنشاء الحسابات الأساسية المفقودة (Repair Missing Accounts)
DROP FUNCTION IF EXISTS public.repair_missing_accounts() CASCADE;
DROP FUNCTION IF EXISTS public.repair_missing_accounts(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.repair_missing_accounts(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid; v_count int := 0;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1231' AND organization_id = v_target_org) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('1231', 'الصندوق الرئيسي', 'ASSET', v_target_org);
        v_count := v_count + 1;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '411' AND organization_id = v_target_org) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('411', 'إيرادات المبيعات', 'REVENUE', v_target_org);
        v_count := v_count + 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '511' AND organization_id = v_target_org) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('511', 'تكلفة المبيعات', 'EXPENSE', v_target_org);
        v_count := v_count + 1;
    END IF;

    RETURN 'تم فحص الدليل وإضافة (' || v_count || ') حساباً مفقوداً بنجاح ✅';
END; $$;

-- ب. تنظيف الأصناف والبيانات المحذوفة نهائياً (Purge Deleted Items)
DROP FUNCTION IF EXISTS public.purge_deleted_records() CASCADE;
DROP FUNCTION IF EXISTS public.purge_deleted_records(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.purge_deleted_records(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    DELETE FROM public.products WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.accounts WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.customers WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.suppliers WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    
    RETURN 'تم تنظيف كافة البيانات المحذوفة نهائياً بنجاح ✅';
END; $$;

-- ج. إعادة مزامنة الأرصدة الشاملة (Recalculate All Balances)
DROP FUNCTION IF EXISTS public.recalculate_all_system_balances(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_all_system_balances() CASCADE;
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; r record;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'لم يتم العثور على معرف المنظمة. يرجى تسجيل الدخول.'; END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);

    UPDATE public.accounts a
    SET balance = (
        SELECT COALESCE(SUM(jl.debit - jl.credit), 0) 
        FROM public.journal_lines jl 
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id 
        WHERE jl.account_id = a.id 
          AND je.status = 'posted'
          AND je.organization_id = v_org_id
    )
    WHERE a.organization_id = v_org_id;

    RETURN 'تمت إعادة مطابقة الأرصدة المالية والمخزنية بنجاح ✅';
END; $$;

-- ================================================================
-- 32. دالة إغلاق السنة المالية (Close Financial Year)
-- ================================================================ 
DROP FUNCTION IF EXISTS public.close_financial_year(integer, date) CASCADE;
CREATE OR REPLACE FUNCTION public.close_financial_year(p_year integer, p_closing_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; v_je_id uuid; v_start_date date; v_end_date date;
    v_retained_earnings_id uuid; v_net_result numeric := 0; v_row record; v_ref text;
BEGIN
    v_org_id := public.get_my_org();
    v_ref := 'CLOSE-' || p_year;
    v_start_date := (p_year || '-01-01')::date;
    v_end_date := (p_year || '-12-31')::date;

    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reference = v_ref AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'السنة المالية % مغلقة بالفعل.', p_year;
    END IF;

    SELECT id INTO v_retained_earnings_id FROM public.accounts 
    WHERE (code = '32' OR code = '3103') AND organization_id = v_org_id LIMIT 1;
    
    IF v_retained_earnings_id IS NULL THEN RAISE EXCEPTION 'حساب الأرباح المبقاة (32) غير موجود في الدليل.'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id)
    VALUES (p_closing_date, 'قيد إقفال السنة المالية ' || p_year, v_ref, 'posted', true, v_org_id)
    RETURNING id INTO v_je_id;

    FOR v_row IN 
        SELECT jl.account_id, a.name, SUM(jl.debit - jl.credit) as balance
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_org_id AND je.status = 'posted' 
          AND je.transaction_date BETWEEN v_start_date AND v_end_date
          AND (a.code LIKE '4%' OR a.code LIKE '5%')
        GROUP BY jl.account_id, a.name
        HAVING ABS(SUM(jl.debit - jl.credit)) > 0.001
    LOOP
        v_net_result := v_net_result + v_row.balance;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_row.account_id, CASE WHEN v_row.balance < 0 THEN ABS(v_row.balance) ELSE 0 END, CASE WHEN v_row.balance > 0 THEN v_row.balance ELSE 0 END, 'إقفال حساب ' || v_row.name, v_org_id);
    END LOOP;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_retained_earnings_id, CASE WHEN v_net_result > 0 THEN v_net_result ELSE 0 END, CASE WHEN v_net_result < 0 THEN ABS(v_net_result) ELSE 0 END, 'ترحيل نتيجة العام ' || p_year, v_org_id);

    UPDATE public.company_settings SET last_closed_date = p_closing_date WHERE organization_id = v_org_id;
    RETURN v_je_id;
END; $$;

-- جلب أرصدة كافة الحسابات (إجمالي مدين - إجمالي دائن) لمنظمة معينة
CREATE OR REPLACE FUNCTION public.get_all_account_balances(p_org_id uuid)
RETURNS TABLE (account_id uuid, balance numeric) 
LANGUAGE plpgsql 
SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id as account_id,
        COALESCE(SUM(jl.debit - jl.credit), 0) as balance
    FROM public.accounts a
    LEFT JOIN public.journal_lines jl ON a.id = jl.account_id
    LEFT JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE a.organization_id = p_org_id
      AND (je.status = 'posted' OR je.id IS NULL)
      AND a.deleted_at IS NULL
    GROUP BY a.id;
END; $$;

-- ================================================================
-- 12. موديول التأسيس (Initialization)
-- ================================================================

DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid, text) CASCADE;
CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count int := 0;
    v_parent_id uuid;
    v_admin_id uuid;
    v_org_name text;
    v_rec record;
BEGIN
    CREATE TEMPORARY TABLE coa_template (
        code text PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL,
        is_group boolean NOT NULL,
        parent_code text
    ) ON COMMIT DROP;

    INSERT INTO coa_template (code, name, type, is_group, parent_code) VALUES
    ('1', 'الأصول', 'ASSET', true, NULL),
    ('2', 'الخصوم (الإلتزامات)', 'LIABILITY', true, NULL),
    ('3', 'حقوق الملكية', 'EQUITY', true, NULL),
    ('4', 'الإيرادات', 'REVENUE', true, NULL),
    ('5', 'المصروفات', 'EXPENSE', true, NULL),
    ('11', 'الأصول غير المتداولة', 'ASSET', true, '1'),
    ('12', 'الأصول المتداولة', 'ASSET', true, '1'),
    ('21', 'الخصوم غير المتداولة', 'LIABILITY', true, '2'),
    ('22', 'الخصوم المتداولة', 'LIABILITY', true, '2'),
    ('31', 'رأس المال', 'EQUITY', false, '3'),
    ('32', 'الأرباح المبقاة / المرحلة', 'EQUITY', false, '3'),
    ('33', 'جاري الشركاء', 'EQUITY', false, '3'),
    ('34', 'احتياطيات', 'EQUITY', false, '3'),
    ('41', 'إيرادات النشاط (المبيعات)', 'REVENUE', true, '4'),
    ('42', 'إيرادات أخرى', 'REVENUE', true, '4'),
    ('51', 'تكلفة المبيعات (COGS)', 'EXPENSE', true, '5'),
    ('52', 'مصروفات البيع والتسويق', 'EXPENSE', true, '5'),
    ('53', 'المصروفات الإدارية والعمومية', 'EXPENSE', true, '5'),
    ('111', 'الأصول الثابتة (بالصافي)', 'ASSET', true, '11'),
    ('1111', 'الأراضي', 'ASSET', false, '111'),
    ('1112', 'المباني والإنشاءات', 'ASSET', false, '111'),
    ('1113', 'الآلات والمعدات', 'ASSET', false, '111'),
    ('1114', 'وسائل النقل والانتقال', 'ASSET', false, '111'),
    ('1115', 'الأثاث والتجهيزات المكتبية', 'ASSET', false, '111'),
    ('1116', 'أجهزة حاسب آلي وبرمجيات', 'ASSET', false, '111'),
    ('1119', 'مجمع إهلاك الأصول الثابتة', 'ASSET', false, '111'),
    ('103', 'المخزون', 'ASSET', true, '12'),
    ('10301', 'مخزون المواد الخام', 'ASSET', false, '103'),
    ('10302', 'مخزون المنتج التام', 'ASSET', false, '103'),
    ('122', 'العملاء والمدينون', 'ASSET', true, '12'),
    ('1221', 'العملاء', 'ASSET', false, '122'),
    ('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'ASSET', false, '122'),
    ('1223', 'سلف الموظفين', 'ASSET', false, '122'),
    ('1224', 'عهد موظفين', 'ASSET', false, '122'),
    ('123', 'النقدية وما في حكمها', 'ASSET', true, '12'),
    ('1231', 'النقدية بالصندوق (الخزينة الرئيسية)', 'ASSET', false, '123'),
    ('1232', 'البنوك (حسابات جارية)', 'ASSET', true, '123'),
    ('123201', 'البنك الأهلي المصري', 'ASSET', false, '1232'),
    ('123202', 'بنك مصر', 'ASSET', false, '1232'),
    ('123203', 'البنك التجاري الدولي (CIB)', 'ASSET', false, '1232'),
    ('123204', 'بنك QNB الأهلي', 'ASSET', false, '1232'),
    ('123205', 'بنك القاهرة', 'ASSET', false, '1232'),
    ('123206', 'بنك فيصل الإسلامي', 'ASSET', false, '1232'),
    ('123207', 'بنك الإسكندرية', 'ASSET', false, '1232'),
    ('1233', 'المحافظ الإلكترونية (Digital Wallets)', 'ASSET', true, '123'),
    ('123301', 'فودافون كاش (Vodafone Cash)', 'ASSET', false, '1233'),
    ('123302', 'اتصالات كاش (Etisalat Cash)', 'ASSET', false, '1233'),
    ('123303', 'أورنج كاش (Orange Cash)', 'ASSET', false, '1233'),
    ('123304', 'وي باي (WE Pay)', 'ASSET', false, '1233'),
    ('123305', 'انستا باي (InstaPay - تسوية)', 'ASSET', false, '1233'),
    ('124', 'أرصدة مدينة أخرى', 'ASSET', true, '12'),
    ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'ASSET', false, '124'),
    ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'ASSET', false, '124'),
    ('1243', 'مصروفات مدفوعة مقدماً', 'ASSET', true, '124'),
    ('124301', 'إيجار مقدم', 'ASSET', false, '1243'),
    ('124302', 'تأمين طبي مقدم', 'ASSET', false, '1243'),
    ('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'ASSET', false, '1243'),
    ('124304', 'حملات إعلانية مقدمة', 'ASSET', false, '1243'),
    ('124305', 'عقود صيانة مقدمة', 'ASSET', false, '1243'),
    ('1244', 'إيرادات مستحقة', 'ASSET', true, '124'),
    ('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'ASSET', false, '1244'),
    ('124402', 'فوائد بنكية مستحقة القبض', 'ASSET', false, '1244'),
    ('124403', 'إيجارات دائنة مستحقة', 'ASSET', false, '1244'),
    ('124404', 'إيرادات أوراق مالية مستحقة', 'ASSET', false, '1244'),
    ('211', 'قروض طويلة الأجل', 'LIABILITY', false, '21'),
    ('201', 'الموردين', 'LIABILITY', false, '22'),
    ('222', 'أوراق الدفع (شيكات صادرة)', 'LIABILITY', false, '22'),
    ('223', 'مصلحة الضرائب (التزامات)', 'LIABILITY', true, '22'),
    ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'LIABILITY', false, '223'),
    ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'LIABILITY', false, '223'),
    ('2233', 'ضريبة كسب العمل', 'LIABILITY', false, '223'),
    ('224', 'هيئة التأمينات الاجتماعية', 'LIABILITY', false, '22'),
    ('225', 'مصروفات مستحقة', 'LIABILITY', true, '22'),
    ('2251', 'رواتب وأجور مستحقة', 'LIABILITY', false, '225'),
    ('2252', 'إيجارات مستحقة', 'LIABILITY', false, '225'),
    ('2253', 'كهرباء ومياه وغاز مستحقة', 'LIABILITY', false, '225'),
    ('2254', 'أتعاب مهنية ومراجعة مستحقة', 'LIABILITY', false, '225'),
    ('2255', 'عمولات بيع مستحقة', 'LIABILITY', false, '225'),
    ('2256', 'فوائد بنكية مستحقة', 'LIABILITY', false, '225'),
    ('2257', 'اشتراكات وتراخيص مستحقة', 'LIABILITY', false, '225'),
    ('226', 'تأمينات ودفعات مقدمة من العملاء', 'LIABILITY', false, '22'),
    ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'EQUITY', false, '3'),
    ('411', 'إيراد المبيعات', 'REVENUE', false, '41'),
    ('412', 'مردودات المبيعات', 'REVENUE', false, '41'),
    ('413', 'خصم مسموح به', 'REVENUE', false, '41'),
    ('42', 'إيرادات أخرى', 'REVENUE', true, '4'),
    ('421', 'إيرادات متنوعة', 'REVENUE', false, '42'),
    ('422', 'إيراد خصومات وجزاءات الموظفين', 'REVENUE', false, '42'),
    ('423', 'فوائد بنكية دائنة', 'REVENUE', false, '42'),
    ('511', 'تكلفة البضاعة المباعة', 'EXPENSE', false, '51'),
    ('512', 'تسويات الجرد (عجز المخزون)', 'EXPENSE', false, '51'),
    ('521', 'دعاية وإعلان', 'EXPENSE', false, '52'),
    ('522', 'عمولات بيع وتسويق', 'EXPENSE', false, '52'),
    ('523', 'نقل ومشال للخارج', 'EXPENSE', false, '52'),
    ('524', 'تعبئة وتغليف', 'EXPENSE', false, '52'),
    ('525', 'عمولات تحصيل إلكتروني', 'EXPENSE', true, '52'),
    ('5251', 'عمولة فودافون كاش', 'EXPENSE', false, '525'),
    ('5252', 'عمولة فوري', 'EXPENSE', false, '525'),
    ('5253', 'عمولة تحويلات بنكية', 'EXPENSE', false, '525'),
    ('531', 'الرواتب والأجور', 'EXPENSE', false, '53'),
    ('5311', 'بدلات وانتقالات', 'EXPENSE', false, '53'),
    ('5312', 'مكافآت وحوافز', 'EXPENSE', false, '53'),
    ('532', 'إيجار مقرات إدارية', 'EXPENSE', false, '53'),
    ('533', 'إهلاك الأصول الثابتة', 'EXPENSE', false, '53'),
    ('534', 'رسوم ومصروفات بنكية', 'EXPENSE', false, '53'),
    ('535', 'كهرباء ومياه وغاز', 'EXPENSE', false, '53'),
    ('536', 'اتصالات وإنترنت', 'EXPENSE', false, '53'),
    ('537', 'صيانة وإصلاح', 'EXPENSE', false, '53'),
    ('538', 'أدوات مكتبية ومطبوعات', 'EXPENSE', false, '53'),
    ('539', 'ضيافة واستقبال', 'EXPENSE', false, '53'),
    ('541', 'تسوية عجز الصندوق', 'EXPENSE', false, '53'),
    ('542', 'إكراميات', 'EXPENSE', false, '53'),
    ('543', 'مصاريف نظافة', 'EXPENSE', false, '53');

    v_admin_id := COALESCE(p_admin_id, auth.uid());
    IF v_admin_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, organization_id, role, is_active)
        VALUES (v_admin_id, p_org_id, 'admin', true)
        ON CONFLICT (id) DO UPDATE SET 
            organization_id = EXCLUDED.organization_id,
            role = 'admin',
            is_active = true;
            
        INSERT INTO public.company_settings (organization_id, company_name, vat_rate, activity_type)
        VALUES (p_org_id, v_org_name, v_vat_rate, p_activity_type)
        ON CONFLICT (organization_id) DO UPDATE SET activity_type = EXCLUDED.activity_type, vat_rate = EXCLUDED.vat_rate, company_name = EXCLUDED.company_name;
    END IF;

    INSERT INTO public.accounts (organization_id, code, name, type, is_group, is_active)
    SELECT p_org_id, code, name, type, is_group, true FROM coa_temp ON CONFLICT DO NOTHING;

    SELECT id INTO v_retained_id FROM public.accounts WHERE organization_id = p_org_id AND code = '32' LIMIT 1;
    SELECT id INTO v_cash_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1231' LIMIT 1;
    SELECT id INTO v_sales_id FROM public.accounts WHERE organization_id = p_org_id AND code = '411' LIMIT 1;
    SELECT id INTO v_cust_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1;
    SELECT id INTO v_cogs_id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1;
    SELECT id INTO v_inv_id FROM public.accounts WHERE organization_id = p_org_id AND code = '10302' LIMIT 1;
    SELECT id INTO v_vat_id FROM public.accounts WHERE organization_id = p_org_id AND code = '2231' LIMIT 1;
    SELECT id INTO v_supp_id FROM public.accounts WHERE organization_id = p_org_id AND code = '201' LIMIT 1;
    SELECT id INTO v_vat_in_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1241' LIMIT 1;
    SELECT id INTO v_disc_id FROM public.accounts WHERE organization_id = p_org_id AND code = '4102' LIMIT 1;
    SELECT id INTO v_wht_pay_id FROM public.accounts WHERE organization_id = p_org_id AND code = '2232' LIMIT 1;
    SELECT id INTO v_payroll_tax_id FROM public.accounts WHERE organization_id = p_org_id AND code = '2233' LIMIT 1;
    SELECT id INTO v_wht_rec_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1242' LIMIT 1;
    SELECT id INTO v_sal_exp_id FROM public.accounts WHERE organization_id = p_org_id AND code = '531' LIMIT 1;
    SELECT id INTO v_bonus_id FROM public.accounts WHERE organization_id = p_org_id AND code = '5312' LIMIT 1;
    SELECT id INTO v_ded_id FROM public.accounts WHERE organization_id = p_org_id AND code = '422' LIMIT 1;
    SELECT id INTO v_adv_id FROM public.accounts WHERE organization_id = p_org_id AND code = '1223' LIMIT 1;
    
    UPDATE public.company_settings 
    SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object(
        'RETAINED_EARNINGS', COALESCE(v_retained_id, (account_mappings->>'RETAINED_EARNINGS')::uuid),
        'CASH', COALESCE(v_cash_id, (account_mappings->>'CASH')::uuid),
        'SALES_REVENUE', COALESCE(v_sales_id, (account_mappings->>'SALES_REVENUE')::uuid),
        'CUSTOMERS', COALESCE(v_cust_id, (account_mappings->>'CUSTOMERS')::uuid),
        'COGS', COALESCE(v_cogs_id, (account_mappings->>'COGS')::uuid),
        'INVENTORY_FINISHED_GOODS', COALESCE(v_inv_id, (account_mappings->>'INVENTORY_FINISHED_GOODS')::uuid),
        'VAT', COALESCE(v_vat_id, (account_mappings->>'VAT')::uuid),
        'SUPPLIERS', COALESCE(v_supp_id, (account_mappings->>'SUPPLIERS')::uuid),
        'VAT_INPUT', COALESCE(v_vat_in_id, (account_mappings->>'VAT_INPUT')::uuid),
        'SALES_DISCOUNT', COALESCE(v_disc_id, (account_mappings->>'SALES_DISCOUNT')::uuid),
        'WHT_PAYABLE', v_wht_pay_id,
        'PAYROLL_TAX', v_payroll_tax_id,
        'WHT_RECEIVABLE', v_wht_rec_id,
        'SALARIES_EXPENSE', v_sal_exp_id,
        'EMPLOYEE_BONUSES', v_bonus_id,
        'EMPLOYEE_DEDUCTIONS', v_ded_id,
        'EMPLOYEE_ADVANCES', v_adv_id
    )
    WHERE organization_id = p_org_id;

    UPDATE public.accounts a SET parent_id = p.id FROM coa_temp t JOIN public.accounts p ON p.organization_id = p_org_id AND p.code = t.parent_code
    WHERE a.organization_id = p_org_id AND a.code = t.code;

    RETURN '✅ تم التأسيس بنجاح.';
END; $$;

-- ================================================================
-- 29.7 الدالة الشاملة لإنشاء عميل جديد (SaaS Global Creator)
-- ================================================================ 
DROP FUNCTION IF EXISTS public.create_new_client_v2(text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_new_client_v2(text, text, text, text, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.create_new_client_v2(
    p_name text,
    p_email text,
    p_activity_type text DEFAULT 'commercial',
    p_vat_number text DEFAULT NULL,
    p_admin_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    INSERT INTO public.organizations (name, email, vat_number, is_active)
    VALUES (p_name, p_email, p_vat_number, true)
    RETURNING id INTO v_org_id;

    PERFORM public.initialize_egyptian_coa(v_org_id, p_activity_type, p_admin_id);

    RETURN v_org_id;
END; $$;

-- ================================================================
-- 29.9 دالة حماية السوبر أدمن عند حذف الشركة
-- ================================================================ 
CREATE OR REPLACE FUNCTION public.protect_super_admin_on_org_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET organization_id = NULL
    WHERE organization_id = OLD.id AND role = 'super_admin';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_super_admin_on_org_delete ON public.organizations;
CREATE TRIGGER trg_protect_super_admin_on_org_delete
BEFORE DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_on_org_delete();

-- ================================================================
-- 30. دالة إصلاح وتنشيط هيكل بيانات الـ SaaS
-- ================================================================ 
DROP FUNCTION IF EXISTS public.refresh_saas_schema() CASCADE;
CREATE OR REPLACE FUNCTION public.refresh_saas_schema()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='max_users') THEN
        ALTER TABLE public.organizations ADD COLUMN max_users INTEGER DEFAULT 5;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='suspension_reason') THEN
        ALTER TABLE public.organizations ADD COLUMN suspension_reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='total_collected') THEN
        ALTER TABLE public.organizations ADD COLUMN total_collected NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='next_payment_date') THEN
        ALTER TABLE public.organizations ADD COLUMN next_payment_date DATE;
    END IF;

    EXECUTE 'NOTIFY pgrst, ''reload config''';
    
    RETURN 'تم تحديث هيكل البيانات وتنشيط الكاش بنجاح ✅';
END; $$;

-- ================================================================
-- 31. دوال الصيانة الذاتية للعميل (Client Self-Maintenance)
-- ================================================================

-- أ. فحص وإنشاء الحسابات الأساسية المفقودة (Repair Missing Accounts)
DROP FUNCTION IF EXISTS public.repair_missing_accounts() CASCADE;
DROP FUNCTION IF EXISTS public.repair_missing_accounts(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.repair_missing_accounts(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid; v_count int := 0;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1231' AND organization_id = v_target_org) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('1231', 'الصندوق الرئيسي', 'ASSET', v_target_org);
        v_count := v_count + 1;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '411' AND organization_id = v_target_org) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('411', 'إيرادات المبيعات', 'REVENUE', v_target_org);
        v_count := v_count + 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '511' AND organization_id = v_target_org) THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('511', 'تكلفة المبيعات', 'EXPENSE', v_target_org);
        v_count := v_count + 1;
    END IF;

    RETURN 'تم فحص الدليل وإضافة (' || v_count || ') حساباً مفقوداً بنجاح ✅';
END; $$;

-- ب. تنظيف الأصناف والبيانات المحذوفة نهائياً (Purge Deleted Items)
DROP FUNCTION IF EXISTS public.purge_deleted_records() CASCADE;
DROP FUNCTION IF EXISTS public.purge_deleted_records(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.purge_deleted_records(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    DELETE FROM public.products WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.accounts WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.customers WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    DELETE FROM public.suppliers WHERE deleted_at IS NOT NULL AND organization_id = v_org_id;
    
    RETURN 'تم تنظيف كافة البيانات المحذوفة نهائياً بنجاح ✅';
END; $$;

-- ج. إعادة مزامنة الأرصدة الشاملة (Recalculate All Balances)
DROP FUNCTION IF EXISTS public.recalculate_all_system_balances(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_all_system_balances() CASCADE;
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid; r record;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'لم يتم العثور على معرف المنظمة. يرجى تسجيل الدخول.'; END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);

    UPDATE public.accounts a
    SET balance = (
        SELECT COALESCE(SUM(jl.debit - jl.credit), 0) 
        FROM public.journal_lines jl 
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id 
        WHERE jl.account_id = a.id 
          AND je.status = 'posted'
          AND je.organization_id = v_org_id
    )
    WHERE a.organization_id = v_org_id;

    RETURN 'تمت إعادة مطابقة الأرصدة المالية والمخزنية بنجاح ✅';
END; $$;

-- ================================================================
-- 32. دالة إغلاق السنة المالية (Close Financial Year)
-- ================================================================ 
DROP FUNCTION IF EXISTS public.close_financial_year(integer, date) CASCADE;
CREATE OR REPLACE FUNCTION public.close_financial_year(p_year integer, p_closing_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; v_je_id uuid; v_start_date date; v_end_date date;
    v_retained_earnings_id uuid; v_net_result numeric := 0; v_row record; v_ref text;
BEGIN
    v_org_id := public.get_my_org();
    v_ref := 'CLOSE-' || p_year;
    v_start_date := (p_year || '-01-01')::date;
    v_end_date := (p_year || '-12-31')::date;

    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reference = v_ref AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'السنة المالية % مغلقة بالفعل.', p_year;
    END IF;

    SELECT id INTO v_retained_earnings_id FROM public.accounts 
    WHERE (code = '32' OR code = '3103') AND organization_id = v_org_id LIMIT 1;
    
    IF v_retained_earnings_id IS NULL THEN RAISE EXCEPTION 'حساب الأرباح المبقاة (32) غير موجود في الدليل.'; END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id)
    VALUES (p_closing_date, 'قيد إقفال السنة المالية ' || p_year, v_ref, 'posted', true, v_org_id)
    RETURNING id INTO v_je_id;

    FOR v_row IN 
        SELECT jl.account_id, a.name, SUM(jl.debit - jl.credit) as balance
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_org_id AND je.status = 'posted' 
          AND je.transaction_date BETWEEN v_start_date AND v_end_date
          AND (a.code LIKE '4%' OR a.code LIKE '5%')
        GROUP BY jl.account_id, a.name
        HAVING ABS(SUM(jl.debit - jl.credit)) > 0.001
    LOOP
        v_net_result := v_net_result + v_row.balance;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_row.account_id, CASE WHEN v_row.balance < 0 THEN ABS(v_row.balance) ELSE 0 END, CASE WHEN v_row.balance > 0 THEN v_row.balance ELSE 0 END, 'إقفال حساب ' || v_row.name, v_org_id);
    END LOOP;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_retained_earnings_id, CASE WHEN v_net_result > 0 THEN v_net_result ELSE 0 END, CASE WHEN v_net_result < 0 THEN ABS(v_net_result) ELSE 0 END, 'ترحيل نتيجة العام ' || p_year, v_org_id);

    UPDATE public.company_settings SET last_closed_date = p_closing_date WHERE organization_id = v_org_id;
    RETURN v_je_id;
END; $$;

-- جلب أرصدة كافة الحسابات (إجمالي مدين - إجمالي دائن) لمنظمة معينة
CREATE OR REPLACE FUNCTION public.get_all_account_balances(p_org_id uuid)
RETURNS TABLE (account_id uuid, balance numeric) 
LANGUAGE plpgsql 
SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id as account_id,
        COALESCE(SUM(jl.debit - jl.credit), 0) as balance
    FROM public.accounts a
    LEFT JOIN public.journal_lines jl ON a.id = jl.account_id
    LEFT JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE a.organization_id = p_org_id
      AND (je.status = 'posted' OR je.id IS NULL)
      AND a.deleted_at IS NULL
    GROUP BY a.id;
END; $$;

-- ================================================================
-- 33. دالة تحليل تكاليف التصنيع (Manufacturing Cost Analysis)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_manufacturing_analysis(p_org_id uuid, p_start_date date, p_end_date date)
RETURNS TABLE (
    id uuid,
    order_number text,
    product_name text,
    quantity numeric,
    end_date date,
    standard_cost numeric,
    actual_cost numeric,
    material_variance numeric,
    wastage_qty numeric,
    variance numeric,
    variance_percent numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH order_standard_costs AS (
        SELECT 
            wo_inner.id as wo_id,
            COALESCE(SUM(bom.quantity_required * COALESCE(p_raw.cost, p_raw.purchase_price, 0)), 0) as unit_standard_cost
        FROM public.work_orders wo_inner
        LEFT JOIN public.bill_of_materials bom ON wo_inner.product_id = bom.product_id
        LEFT JOIN public.products p_raw ON bom.raw_material_id = p_raw.id
        GROUP BY wo_inner.id
    ),
    actual_additional AS (
        SELECT 
            work_order_id,
            SUM(amount) as add_cost
        FROM public.work_order_costs
        WHERE organization_id = p_org_id
        GROUP BY work_order_id
    ),
    actual_usage AS (
        SELECT 
            work_order_id,
            SUM(actual_quantity * COALESCE(p.weighted_average_cost, p.purchase_price, p.cost, 0)) as actual_mat_cost,
            SUM(wastage_quantity) as total_wastage
        FROM public.work_order_material_usage um
        JOIN public.products p ON um.product_id = p.id
        WHERE um.organization_id = p_org_id
        GROUP BY work_order_id
    )
    SELECT 
        wo.id,
        wo.order_number,
        pr.name as product_name,
        wo.quantity,
        wo.end_date,
        COALESCE(bs.std_unit_cost, 0) * wo.quantity as standard_cost,
        COALESCE(au.actual_mat_cost, COALESCE(bs.std_unit_cost, 0) * wo.quantity) + COALESCE(aa.add_cost, 0) as actual_cost,
        COALESCE(au.actual_mat_cost - (COALESCE(bs.std_unit_cost, 0) * wo.quantity), 0) as material_variance,
        COALESCE(au.total_wastage, 0) as wastage_qty,
        (COALESCE(au.actual_mat_cost, COALESCE(bs.std_unit_cost, 0) * wo.quantity) + COALESCE(aa.add_cost, 0)) - (COALESCE(bs.std_unit_cost, 0) * wo.quantity) as variance,
        CASE WHEN (COALESCE(bs.std_unit_cost, 0) * wo.quantity) > 0 
             THEN (((COALESCE(au.actual_mat_cost, COALESCE(bs.std_unit_cost, 0) * wo.quantity) + COALESCE(aa.add_cost, 0)) - (COALESCE(bs.std_unit_cost, 0) * wo.quantity)) / (COALESCE(bs.std_unit_cost, 0) * wo.quantity)) * 100 ELSE 0 END as variance_percent
    FROM public.work_orders wo
    JOIN public.products pr ON wo.product_id = pr.id
    LEFT JOIN bom_summary bs ON wo.product_id = bs.product_id
    LEFT JOIN actual_usage au ON wo.id = au.work_order_id
    LEFT JOIN actual_additional aa ON wo.id = aa.work_order_id
    WHERE wo.organization_id = p_org_id AND wo.status = 'completed' AND wo.end_date BETWEEN p_start_date AND p_end_date;
END; $$;

DROP FUNCTION IF EXISTS public.get_tree_balances(uuid, date) CASCADE;
CREATE OR REPLACE FUNCTION public.get_tree_balances(p_org_id uuid, p_as_of_date date DEFAULT CURRENT_DATE) 
RETURNS TABLE (account_id uuid, account_code text, account_name text, parent_id uuid, level_num int, total_debit numeric, total_credit numeric, net_balance numeric, is_group boolean) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    RETURN QUERY
    WITH RECURSIVE account_hierarchy AS (
        SELECT a.id, a.code, a.name, a.parent_id, a.is_group, 1 as level_num
        FROM public.accounts a WHERE a.organization_id = v_org_id AND a.parent_id IS NULL
        UNION ALL
        SELECT a.id, a.code, a.name, a.parent_id, a.is_group, ah.level_num + 1
        FROM public.accounts a JOIN account_hierarchy ah ON a.parent_id = ah.id
    ),
    ledger_sums AS (
        SELECT jl.account_id, SUM(jl.debit) as deb, SUM(jl.credit) as cre
        FROM public.journal_lines jl JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.organization_id = v_org_id AND je.status = 'posted' AND je.transaction_date <= p_as_of_date
        GROUP BY jl.account_id
    )
    SELECT 
        ah.id, ah.code, ah.name, ah.parent_id, ah.level_num,
        COALESCE((SELECT SUM(ls.deb) FROM ledger_sums ls WHERE ls.account_id IN (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE ah.code || '%')), 0),
        COALESCE((SELECT SUM(ls.cre) FROM ledger_sums ls WHERE ls.account_id IN (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE ah.code || '%')), 0),
        COALESCE((SELECT SUM(ls.deb - ls.cre) FROM ledger_sums ls WHERE ls.account_id IN (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE ah.code || '%')), 0),
        ah.is_group
    FROM account_hierarchy ah ORDER BY ah.code;
END; $$;

DROP FUNCTION IF EXISTS public.get_all_account_balances(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_all_account_balances(p_org_id uuid) 
RETURNS TABLE (account_id uuid, account_code text, account_name text, parent_id uuid, level_num int, total_debit numeric, total_credit numeric, net_balance numeric, is_group boolean) AS $$
    SELECT * FROM public.get_tree_balances(public.get_my_org(), CURRENT_DATE);
$$ LANGUAGE sql SECURITY DEFINER;

-- ================================================================
-- 12. موديول التأسيس (Initialization)
-- ================================================================

DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(uuid, text) CASCADE;
CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count int := 0;
    v_parent_id uuid;
    v_admin_id uuid;
    v_org_name text;
    v_rec record;
BEGIN
    CREATE TEMPORARY TABLE coa_template (
        code text PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL,
        is_group boolean NOT NULL,
        parent_code text
    ) ON COMMIT DROP;

    INSERT INTO coa_template (code, name, type, is_group, parent_code) VALUES
    ('1', 'الأصول', 'ASSET', true, NULL),
    ('2', 'الخصوم (الإلتزامات)', 'LIABILITY', true, NULL),
    ('3', 'حقوق الملكية', 'EQUITY', true, NULL),
    ('4', 'الإيرادات', 'REVENUE', true, NULL),
    ('5', 'المصروفات', 'EXPENSE', true, NULL),
    ('11', 'الأصول غير المتداولة', 'ASSET', true, '1'),
    ('12', 'الأصول المتداولة', 'ASSET', true, '1'),
    ('21', 'الخصوم غير المتداولة', 'LIABILITY', true, '2'),
    ('22', 'الخصوم المتداولة', 'LIABILITY', true, '2'),
    ('31', 'رأس المال', 'EQUITY', false, '3'),
    ('32', 'الأرباح المبقاة / المرحلة', 'EQUITY', false, '3'),
    ('33', 'جاري الشركاء', 'EQUITY', false, '3'),
    ('34', 'احتياطيات', 'EQUITY', false, '3'),
    ('41', 'إيرادات النشاط (المبيعات)', 'REVENUE', true, '4'),
    ('42', 'إيرادات أخرى', 'REVENUE', true, '4'),
    ('51', 'تكلفة المبيعات (COGS)', 'EXPENSE', true, '5'),
    ('52', 'مصروفات البيع والتسويق', 'EXPENSE', true, '5'),
    ('53', 'المصروفات الإدارية والعمومية', 'EXPENSE', true, '5'),
    ('111', 'الأصول الثابتة (بالصافي)', 'ASSET', true, '11'),
    ('1111', 'الأراضي', 'ASSET', false, '111'),
    ('1112', 'المباني والإنشاءات', 'ASSET', false, '111'),
    ('1113', 'الآلات والمعدات', 'ASSET', false, '111'),
    ('1114', 'وسائل النقل والانتقال', 'ASSET', false, '111'),
    ('1115', 'الأثاث والتجهيزات المكتبية', 'ASSET', false, '111'),
    ('1116', 'أجهزة حاسب آلي وبرمجيات', 'ASSET', false, '111'),
    ('1119', 'مجمع إهلاك الأصول الثابتة', 'ASSET', false, '111'),
    ('103', 'المخزون', 'ASSET', true, '12'),
    ('10301', 'مخزون المواد الخام', 'ASSET', false, '103'),
    ('10302', 'مخزون المنتج التام', 'ASSET', false, '103'),
    ('122', 'العملاء والمدينون', 'ASSET', true, '12'),
    ('1221', 'العملاء', 'ASSET', false, '122'),
    ('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'ASSET', false, '122'),
    ('1223', 'سلف الموظفين', 'ASSET', false, '122'),
    ('1224', 'عهد موظفين', 'ASSET', false, '122'),
    ('123', 'النقدية وما في حكمها', 'ASSET', true, '12'),
    ('1231', 'النقدية بالصندوق (الخزينة الرئيسية)', 'ASSET', false, '123'),
    ('1232', 'البنوك (حسابات جارية)', 'ASSET', true, '123'),
    ('123201', 'البنك الأهلي المصري', 'ASSET', false, '1232'),
    ('123202', 'بنك مصر', 'ASSET', false, '1232'),
    ('123203', 'البنك التجاري الدولي (CIB)', 'ASSET', false, '1232'),
    ('123204', 'بنك QNB الأهلي', 'ASSET', false, '1232'),
    ('123205', 'بنك القاهرة', 'ASSET', false, '1232'),
    ('123206', 'بنك فيصل الإسلامي', 'ASSET', false, '1232'),
    ('123207', 'بنك الإسكندرية', 'ASSET', false, '1232'),
    ('1233', 'المحافظ الإلكترونية (Digital Wallets)', 'ASSET', true, '123'),
    ('123301', 'فودافون كاش (Vodafone Cash)', 'ASSET', false, '1233'),
    ('123302', 'اتصالات كاش (Etisalat Cash)', 'ASSET', false, '1233'),
    ('123303', 'أورنج كاش (Orange Cash)', 'ASSET', false, '1233'),
    ('123304', 'وي باي (WE Pay)', 'ASSET', false, '1233'),
    ('123305', 'انستا باي (InstaPay - تسوية)', 'ASSET', false, '1233'),
    ('124', 'أرصدة مدينة أخرى', 'ASSET', true, '12'),
    ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'ASSET', false, '124'),
    ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'ASSET', false, '124'),
    ('1243', 'مصروفات مدفوعة مقدماً', 'ASSET', true, '124'),
    ('124301', 'إيجار مقدم', 'ASSET', false, '1243'),
    ('124302', 'تأمين طبي مقدم', 'ASSET', false, '1243'),
    ('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'ASSET', false, '1243'),
    ('124304', 'حملات إعلانية مقدمة', 'ASSET', false, '1243'),
    ('124305', 'عقود صيانة مقدمة', 'ASSET', false, '1243'),
    ('1244', 'إيرادات مستحقة', 'ASSET', true, '124'),
    ('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'ASSET', false, '1244'),
    ('124402', 'فوائد بنكية مستحقة القبض', 'ASSET', false, '1244'),
    ('124403', 'إيجارات دائنة مستحقة', 'ASSET', false, '1244'),
    ('124404', 'إيرادات أوراق مالية مستحقة', 'ASSET', false, '1244'),
    ('211', 'قروض طويلة الأجل', 'LIABILITY', false, '21'),
    ('201', 'الموردين', 'LIABILITY', false, '22'),
    ('222', 'أوراق الدفع (شيكات صادرة)', 'LIABILITY', false, '22'),
    ('223', 'مصلحة الضرائب (التزامات)', 'LIABILITY', true, '22'),
    ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'LIABILITY', false, '223'),
    ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'LIABILITY', false, '223'),
    ('2233', 'ضريبة كسب العمل', 'LIABILITY', false, '223'),
    ('224', 'هيئة التأمينات الاجتماعية', 'LIABILITY', false, '22'),
    ('225', 'مصروفات مستحقة', 'LIABILITY', true, '22'),
    ('2251', 'رواتب وأجور مستحقة', 'LIABILITY', false, '225'),
    ('2252', 'إيجارات مستحقة', 'LIABILITY', false, '225'),
    ('2253', 'كهرباء ومياه وغاز مستحقة', 'LIABILITY', false, '225'),
    ('2254', 'أتعاب مهنية ومراجعة مستحقة', 'LIABILITY', false, '225'),
    ('2255', 'عمولات بيع مستحقة', 'LIABILITY', false, '225'),
    ('2256', 'فوائد بنكية مستحقة', 'LIABILITY', false, '225'),
    ('2257', 'اشتراكات وتراخيص مستحقة', 'LIABILITY', false, '225'),
    ('226', 'تأمينات ودفعات مقدمة من العملاء', 'LIABILITY', false, '22'),
    ('311', 'رأس المال المدفوع', 'EQUITY', false, '31'),
    ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'EQUITY', false, '3'),
    ('411', 'إيراد المبيعات', 'REVENUE', false, '41'),
    ('412', 'مردودات المبيعات', 'REVENUE', false, '41'),
    ('413', 'خصم مسموح به', 'REVENUE', false, '41'),
    ('42', 'إيرادات أخرى', 'REVENUE', true, '4'),
    ('421', 'إيرادات متنوعة', 'REVENUE', false, '42'),
    ('422', 'إيراد خصومات وجزاءات الموظفين', 'REVENUE', false, '42'),
    ('423', 'فوائد بنكية دائنة', 'REVENUE', false, '42'),
    ('511', 'تكلفة البضاعة المباعة', 'EXPENSE', false, '51'),
    ('512', 'تسويات الجرد (عجز المخزون)', 'EXPENSE', false, '51'),
    ('521', 'دعاية وإعلان', 'EXPENSE', false, '52'),
    ('522', 'عمولات بيع وتسويق', 'EXPENSE', false, '52'),
    ('523', 'نقل ومشال للخارج', 'EXPENSE', false, '52'),
    ('524', 'تعبئة وتغليف', 'EXPENSE', false, '52'),
    ('525', 'عمولات تحصيل إلكتروني', 'EXPENSE', true, '52'),
    ('5251', 'عمولة فودافون كاش', 'EXPENSE', false, '525'),
    ('5252', 'عمولة فوري', 'EXPENSE', false, '525'),
    ('5253', 'عمولة تحويلات بنكية', 'EXPENSE', false, '525'),
    ('531', 'الرواتب والأجور', 'EXPENSE', false, '53'),
    ('5311', 'بدلات وانتقالات', 'EXPENSE', false, '53'),
    ('5312', 'مكافآت وحوافز', 'EXPENSE', false, '53'),
    ('532', 'إيجار مقرات إدارية', 'EXPENSE', false, '53'),
    ('533', 'إهلاك الأصول الثابتة', 'EXPENSE', false, '53'),
    ('534', 'رسوم ومصروفات بنكية', 'EXPENSE', false, '53'),
    ('535', 'كهرباء ومياه وغاز', 'EXPENSE', false, '53'),
    ('536', 'اتصالات وإنترنت', 'EXPENSE', false, '53'),
    ('537', 'صيانة وإصلاح', 'EXPENSE', false, '53'),
    ('538', 'أدوات مكتبية ومطبوعات', 'EXPENSE', false, '53'),
    ('539', 'ضيافة واستقبال', 'EXPENSE', false, '53'),
    ('541', 'تسوية عجز الصندوق', 'EXPENSE', false, '53'),
    ('542', 'إكراميات', 'EXPENSE', false, '53'),
    ('543', 'مصاريف نظافة', 'EXPENSE', false, '53');

    v_admin_id := auth.uid();
    IF v_admin_id IS NOT NULL THEN
        UPDATE public.profiles 
        SET role = 'admin', organization_id = p_org_id, is_active = true,
            role_id = (SELECT id FROM public.roles WHERE name = 'admin' LIMIT 1)
        WHERE id = v_admin_id;
        
        SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;
        INSERT INTO public.company_settings (organization_id, company_name)
        VALUES (p_org_id, v_org_name)
        ON CONFLICT (organization_id) DO UPDATE SET company_name = EXCLUDED.company_name;
    END IF;

    FOR v_rec IN SELECT * FROM coa_template ORDER BY code ASC LOOP
        v_parent_id := NULL;
        IF v_rec.parent_code IS NOT NULL THEN
            SELECT id INTO v_parent_id FROM public.accounts 
            WHERE code = v_rec.parent_code AND organization_id = p_org_id LIMIT 1;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = v_rec.code AND organization_id = p_org_id) THEN
            INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id, is_active)
            VALUES (v_rec.code, v_rec.name, LOWER(v_rec.type), v_rec.is_group, v_parent_id, p_org_id, true);
            v_count := v_count + 1;
        ELSE
            UPDATE public.accounts 
            SET parent_id = v_parent_id, type = LOWER(v_rec.type), is_group = v_rec.is_group
            WHERE code = v_rec.code AND organization_id = p_org_id AND parent_id IS DISTINCT FROM v_parent_id;
        END IF;
    END LOOP;

    RETURN 'تمت معالجة الدليل المصري بنجاح. الحسابات الجديدة: (' || v_count || '). تم تفعيل صلاحيات المدير للمستخدم الحالي ✅';
END; $$;

DROP FUNCTION IF EXISTS public.clear_demo_data(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.clear_demo_data(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org_id uuid;
BEGIN
    v_target_org_id := COALESCE(p_org_id, public.get_my_org());
    
    DELETE FROM public.journal_lines WHERE organization_id = v_target_org_id;
    DELETE FROM public.journal_entries WHERE organization_id = v_target_org_id;
    DELETE FROM public.invoice_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_invoice_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.sales_return_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_return_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.quotation_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_order_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.stock_transfer_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.stock_adjustment_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.inventory_count_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.work_order_costs WHERE organization_id = v_target_org_id;
    -- DELETE FROM public.work_order_material_usage WHERE organization_id = v_target_org_id; -- غير موجود في هذا السياق
    DELETE FROM public.order_items WHERE organization_id = v_target_org_id;
    DELETE FROM public.kitchen_orders WHERE organization_id = v_target_org_id;
    DELETE FROM public.payments WHERE organization_id = v_target_org_id;

    DELETE FROM public.invoices WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = v_target_org_id;
    DELETE FROM public.sales_returns WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_returns WHERE organization_id = v_target_org_id;
    DELETE FROM public.quotations WHERE organization_id = v_target_org_id;
    DELETE FROM public.purchase_orders WHERE organization_id = v_target_org_id;
    DELETE FROM public.receipt_vouchers WHERE organization_id = v_target_org_id;
    DELETE FROM public.payment_vouchers WHERE organization_id = v_target_org_id;
    DELETE FROM public.cheques WHERE organization_id = v_target_org_id;
    DELETE FROM public.credit_notes WHERE organization_id = v_target_org_id;
    DELETE FROM public.debit_notes WHERE organization_id = v_target_org_id;
    DELETE FROM public.stock_transfers WHERE organization_id = v_target_org_id;
    DELETE FROM public.stock_adjustments WHERE organization_id = v_target_org_id;
    DELETE FROM public.inventory_counts WHERE organization_id = v_target_org_id;
    DELETE FROM public.work_orders WHERE organization_id = v_target_org_id;
    DELETE FROM public.orders WHERE organization_id = v_target_org_id;
    DELETE FROM public.table_sessions WHERE organization_id = v_target_org_id;

    UPDATE public.products SET stock = 0, warehouse_stock = '{}'::jsonb, weighted_average_cost = 0 WHERE organization_id = v_target_org_id;
    UPDATE public.customers SET balance = 0 WHERE organization_id = v_target_org_id;
    UPDATE public.suppliers SET balance = 0 WHERE organization_id = v_target_org_id;
    UPDATE public.accounts SET balance = 0 WHERE organization_id = v_target_org_id;

    RETURN 'تم تنظيف كافة البيانات التشغيلية للمؤسسة الحالية بنجاح ✅';
END; $$;

DROP FUNCTION IF EXISTS public.repair_missing_accounts() CASCADE;
DROP FUNCTION IF EXISTS public.repair_missing_accounts(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.repair_missing_accounts(p_org_id uuid DEFAULT NULL) 
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    RETURN public.initialize_egyptian_coa(v_target_org);
END; $$;

DROP FUNCTION IF EXISTS public.force_grant_admin_access(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.force_grant_admin_access(p_user_id uuid, p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.profiles  
    SET role = 'admin', 
        organization_id = p_org_id, 
        is_active = true,
        role_id = (SELECT id FROM public.roles WHERE name = 'admin' LIMIT 1)
    WHERE id = p_user_id;
    
    IF NOT FOUND THEN RETURN 'خطأ: لم يتم العثور على المستخدم المذكور ❌'; END IF;
    
    RETURN 'تم منح صلاحيات المدير وتصحيح تبعية المنظمة بنجاح ✅ (يرجى إعادة تسجيل الدخول)';
END; $$;

-- ================================================================
-- 6. تفعيل نظام الحماية (RLS) الشامل - من updated_system_stabilization.sql
-- ================================================================

-- 0. إصلاح الدوال الأساسية للهوية (Core Identity Functions)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role',
    (SELECT role::text FROM public.profiles WHERE id = auth.uid())
  );
END; $$;

-- 1. توحيد أسماء أعمدة المرتجعات (Schema Standardization)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'sales_return_id') THEN
            ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'purchase_return_id') THEN
            ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id;
        END IF;
    END IF;
END $$;

-- 1.5 توحيد أعمدة نقاط البيع والمطاعم (POS Schema Sync)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='created_by') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='user_id') THEN
            ALTER TABLE public.orders RENAME COLUMN created_by TO user_id;
        ELSE
            UPDATE public.orders SET user_id = created_by WHERE user_id IS NULL;
            ALTER TABLE public.orders DROP COLUMN created_by;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='unit_price') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='price') THEN
            ALTER TABLE public.order_items RENAME COLUMN unit_price TO price;
        ELSE
            UPDATE public.order_items SET price = unit_price WHERE price IS NULL;
            ALTER TABLE public.order_items DROP COLUMN unit_price;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='total') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='total_price') THEN
            ALTER TABLE public.order_items RENAME COLUMN total TO total_price;
        ELSE
            UPDATE public.order_items SET total_price = total WHERE total_price IS NULL;
            ALTER TABLE public.order_items DROP COLUMN total;
        END IF;
    END IF;
    
    RAISE NOTICE '✅ تم توحيد مسميات أعمدة الـ POS بنجاح.';
END $$;

-- 2. إضافة أعمدة الـ SaaS والاشتراكات لجدول المنظمات
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS allowed_modules text[] DEFAULT '{"accounting"}';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_expiry date;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 5;

-- 3. تحديث إعدادات الشركة (Company Settings)
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS decimal_places integer DEFAULT 2;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS max_cash_deficit_limit numeric DEFAULT 500;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS activity_type text;

ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_organization_id_unique;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_organization_id_unique UNIQUE (organization_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_select_policy" ON public.organizations;
CREATE POLICY "org_select_policy" ON public.organizations FOR SELECT TO authenticated USING (id = public.get_my_org() OR public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "org_update_policy" ON public.organizations;
CREATE POLICY "org_update_policy" ON public.organizations FOR UPDATE TO authenticated USING ((id = public.get_my_org() AND public.get_my_role() IN ('admin', 'super_admin')) OR public.get_my_role() = 'super_admin');

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ 
BEGIN
    EXECUTE (SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.profiles;', ' ') FROM pg_policies WHERE tablename = 'profiles');
END $$;

DROP POLICY IF EXISTS "profiles_select_v2" ON public.profiles;
CREATE POLICY "profiles_select_v2" ON public.profiles FOR SELECT TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = 'super_admin');
DROP POLICY IF EXISTS "profiles_update_v2" ON public.profiles;
CREATE POLICY "profiles_update_v2" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid() OR public.get_my_role() IN ('admin', 'super_admin')) WITH CHECK (id = auth.uid() OR public.get_my_role() IN ('admin', 'super_admin'));
DROP POLICY IF EXISTS "profiles_insert_v2" ON public.profiles;
CREATE POLICY "profiles_insert_v2" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

-- 5. تحديثات الجداول المالية (Financial Linkage)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS current_account_id uuid REFERENCES public.accounts(id);

ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.invoices(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.purchase_invoices(id);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturing_cost numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.14;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS payroll_tax numeric DEFAULT 0;
ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();

-- 6. إصلاح نظام الإشعارات (Notifications Fix)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'notification_type') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'type') THEN
            ALTER TABLE public.notifications RENAME COLUMN notification_type TO "type";
        ELSE
            ALTER TABLE public.notifications ALTER COLUMN notification_type DROP NOT NULL;
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create notifications') THEN
        CREATE POLICY "Users can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.get_my_role() != 'demo');
    END IF;
END $$;

-- 7. تهيئة التسلسلات والعملات (Localization)
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;
UPDATE public.company_settings SET currency = 'EGP', vat_rate = 0.14 WHERE currency IS NULL OR currency = 'SAR';

-- 8. درع الحماية الشامل (The Shield - Multi-tenancy Isolation)
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[
        'accounts', 'products', 'customers', 'suppliers', 'warehouses', 'cost_centers', 
        'orders', 'order_items', 'payments', 'shifts', 'journal_entries', 'journal_lines', 
        'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 'receipt_vouchers', 'payment_vouchers', 'menu_categories',
        'cheques', 'credit_notes', 'debit_notes', 'stock_adjustments', 'stock_transfers', 'inventory_counts', 'work_orders',
        'assets', 'employees', 'payrolls', 'payroll_items', 'notifications'
    ];
    v_count_before int;
BEGIN 
    FOREACH t IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) AND t NOT IN ('accounts', 'profiles') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()', t);
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.get_my_org()', t);
            EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', t) INTO v_count_before;
            EXECUTE format('UPDATE public.%I SET organization_id = COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1)) WHERE organization_id IS NULL', t);
            
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            
            EXECUTE format('DROP POLICY IF EXISTS "
