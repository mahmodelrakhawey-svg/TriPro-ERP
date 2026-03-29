-- 🌟 ملف التأسيس الشامل (Master Setup) - TriPro ERP
-- 📅 تاريخ التحديث: 2026-04-03 (نسخة الإنتاج - Production Ready)
-- ℹ️ الوصف: يقوم هذا الملف بإنشاء قاعدة البيانات بالكامل (الجداول، الدوال، الإخطارات، الحسابات، الحماية) دفعة واحدة.
-- ⚠️ تحذير: تشغيل هذا الملف سيقوم بمسح جميع البيانات الموجودة في قاعدة البيانات!

-- ================================================================
-- 0. تنظيف وإعداد المخطط (Reset Schema)
-- ================================================================
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ================================================================
-- 1. الجداول الأساسية (Core Tables)
-- ================================================================

-- المنظمات والإعدادات
CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- ================================================================
-- 1.5 دوال الحماية المساعدة (Security Helpers) - يجب أن تكون في البداية
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (SELECT role::text FROM public.profiles WHERE id = auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (SELECT organization_id FROM public.profiles WHERE id = auth.uid());
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
    is_active boolean DEFAULT true,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now() NOT NULL
);

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
    decimal_places integer DEFAULT 2,
    max_cash_deficit_limit numeric DEFAULT 500,
    account_mappings jsonb DEFAULT '{}'::jsonb,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    updated_at timestamptz DEFAULT now()
);

-- المحاسبة
CREATE TABLE public.cost_centers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    code text,
    description text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    type text NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    parent_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    balance numeric DEFAULT 0,
    sub_type text,
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    description text,
    reference text,
    status text DEFAULT 'draft',
    is_posted boolean DEFAULT false,
    user_id uuid REFERENCES auth.users(id),
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
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()
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
    customer_type text DEFAULT 'individual', -- individual, store, online
    balance numeric DEFAULT 0, -- حقل محسوب (اختياري للأداء)
    deleted_at timestamptz,
    organization_id uuid REFERENCES public.organizations(id),
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
    organization_id uuid REFERENCES public.organizations(id),
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
    organization_id uuid REFERENCES public.organizations(id),
    deleted_at timestamptz,
    deletion_reason text
);

-- تصنيفات الأصناف (موجود في الهيكل الحالي)
CREATE TABLE public.item_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name varchar NOT NULL,
    default_inventory_account_id uuid REFERENCES public.accounts(id),
    default_cogs_account_id uuid REFERENCES public.accounts(id),
    default_sales_account_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    sku text,
    barcode text,
    sales_price numeric DEFAULT 0,
    purchase_price numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    manufacturing_cost numeric DEFAULT 0, -- عمود جديد
    weighted_average_cost numeric DEFAULT 0,
    stock numeric DEFAULT 0,
    min_stock_level numeric DEFAULT 0,
    item_type text DEFAULT 'STOCK', -- STOCK, SERVICE
    inventory_account_id uuid REFERENCES public.accounts(id),
    cogs_account_id uuid REFERENCES public.accounts(id),
    sales_account_id uuid REFERENCES public.accounts(id),
    image_url text,
    warehouse_stock jsonb DEFAULT '{}',
    category_id uuid REFERENCES public.item_categories(id),
    expiry_date date,
    
    -- حقول العروض
    offer_price numeric,
    offer_start_date date,
    offer_end_date date,
    offer_max_qty numeric,

    organization_id uuid REFERENCES public.organizations(id),
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
    organization_id uuid REFERENCES public.organizations(id),
    quantity_required numeric NOT NULL DEFAULT 1
);

CREATE TABLE public.opening_inventories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
    quantity numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- المبيعات والمشتريات
CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    customer_id uuid REFERENCES public.customers(id),
    salesperson_id uuid, -- يمكن ربطه بجدول المستخدمين
    invoice_date date,
    due_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    paid_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    status text, -- draft, posted, paid, partial
    notes text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    approver_id uuid REFERENCES auth.users(id), -- عمود جديد
    reference text, -- عمود جديد
    deleted_at timestamptz,
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
    cost numeric DEFAULT 0, -- Cost at time of sale
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
    organization_id uuid REFERENCES public.organizations(id)
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
    warehouse_id uuid REFERENCES public.warehouses(id),
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    additional_expenses numeric DEFAULT 0, -- عمود جديد
    approver_id uuid REFERENCES auth.users(id),
    reference text,
    deleted_at timestamptz,
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
    organization_id uuid REFERENCES public.organizations(id)
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
    organization_id uuid REFERENCES public.organizations(id),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.purchase_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_return_id uuid REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    price numeric,
    total numeric,
    organization_id uuid REFERENCES public.organizations(id)
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
    status text DEFAULT 'draft', -- draft, sent, accepted, rejected, converted
    notes text,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.quotation_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id uuid REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric,
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    po_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    order_date date,
    delivery_date date,
    total_amount numeric,
    tax_amount numeric,
    status text DEFAULT 'draft',
    notes text,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    unit_price numeric,
    total numeric,
    organization_id uuid REFERENCES public.organizations(id)
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
    type text DEFAULT 'receipt', -- receipt, deposit
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
    status text DEFAULT 'pending', -- received, deposited, collected, rejected, issued, cashed
    type text, -- incoming, outgoing
    party_id uuid, -- Customer or Supplier ID
    party_name text,
    notes text,
    transfer_account_number text,
    transfer_bank_name text,
    transfer_date date,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    related_voucher_id uuid, -- عمود جديد
    organization_id uuid REFERENCES public.organizations(id),
    current_account_id uuid REFERENCES public.accounts(id), -- عمود جديد
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
    organization_id uuid REFERENCES public.organizations(id),
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
    organization_id uuid REFERENCES public.organizations(id),
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
    organization_id uuid REFERENCES public.organizations(id),
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
    organization_id uuid REFERENCES public.organizations(id),
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
    salary numeric, -- basic salary
    hire_date date,
    status text DEFAULT 'active',
    notes text,
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
    organization_id uuid REFERENCES public.organizations(id),
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
    net_salary numeric,
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE public.employee_advances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id),
    amount numeric,
    request_date date,
    status text DEFAULT 'pending', -- pending, approved, paid, deducted
    notes text,
    reference text,
    treasury_account_id uuid REFERENCES public.accounts(id),
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
    status text DEFAULT 'AVAILABLE', -- AVAILABLE, OCCUPIED, RESERVED
    section text,
    reservation_info jsonb,
    qr_access_key uuid DEFAULT gen_random_uuid(),
    qr_code text,
    organization_id uuid REFERENCES public.organizations(id),
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
    organization_id uuid REFERENCES public.organizations(id),
    status text DEFAULT 'OPEN' -- OPEN, CLOSED
);

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text UNIQUE,
    session_id uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL,
    customer_id uuid REFERENCES public.customers(id),
    order_type text, -- DINEIN, TAKEAWAY, DELIVERY
    status text DEFAULT 'PENDING', -- PENDING, COMPLETED, CANCELLED, PAID
    notes text,
    subtotal numeric DEFAULT 0,
    total_tax numeric DEFAULT 0,
    total_discount numeric DEFAULT 0,
    grand_total numeric DEFAULT 0,
    warehouse_id uuid REFERENCES public.warehouses(id),
    organization_id uuid REFERENCES public.organizations(id),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    total_price numeric NOT NULL,
    unit_cost numeric DEFAULT 0,
    notes text,
    modifiers jsonb DEFAULT '[]'::jsonb,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_method text, -- CASH, CARD, WALLET
    amount numeric NOT NULL,
    status text DEFAULT 'COMPLETED', -- COMPLETED, REFUNDED
    transaction_ref text,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

-- جدول صلاحيات المستخدمين المباشرة (موجود في الهيكل)
CREATE TABLE public.user_permissions (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id),
    permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE, -- Corrected type to uuid
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
    organization_id uuid REFERENCES public.organizations(id),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_transfer_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_transfer_id uuid REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    adjustment_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    adjustment_date date,
    status text,
    reason text,
    organization_id uuid REFERENCES public.organizations(id),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_adjustment_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_adjustment_id uuid REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric, -- الموجب زيادة، السالب عجز
    type text, -- in / out
    organization_id uuid REFERENCES public.organizations(id)
);

CREATE TABLE public.inventory_counts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    count_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    count_date date,
    status text,
    notes text,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.inventory_count_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_count_id uuid REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id),
    system_qty numeric,
    actual_qty numeric,
    difference numeric,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
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
    status text DEFAULT 'draft', -- draft, in_progress, completed, cancelled
    organization_id uuid REFERENCES public.organizations(id),
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.work_order_costs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    work_order_id uuid REFERENCES public.work_orders(id) ON DELETE CASCADE,
    cost_type text, -- labor, overhead, other
    amount numeric,
    organization_id uuid REFERENCES public.organizations(id),
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
    reconciled_ids jsonb, -- Array of reconciled transaction IDs
    organization_id uuid REFERENCES public.organizations(id),
    status text, -- balanced, unbalanced
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
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================================
-- 2.5 التقارير واللوحات البرمجية (Views)
-- ================================================================
CREATE OR REPLACE VIEW public.monthly_sales_dashboard AS
 SELECT 
    i.id,
    i.invoice_date AS transaction_date,
    i.total_amount AS amount,
    (SELECT COALESCE(SUM(ii.cost * ii.quantity), 0) FROM public.invoice_items ii WHERE ii.invoice_id = i.id) AS total_cost,
    'Standard Invoice'::text AS type,
    i.organization_id
 FROM public.invoices i
 WHERE i.status != 'draft' AND i.deleted_at IS NULL
 UNION ALL
 SELECT 
    o.id,
    o.created_at::date AS transaction_date,
    (SELECT COALESCE(SUM(oi.total_price), 0) FROM public.order_items oi WHERE oi.order_id = o.id) AS amount,
    (SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0) FROM public.order_items oi WHERE oi.order_id = o.id) AS total_cost,
    'Restaurant Order'::text AS type,
    o.organization_id
 FROM public.orders o;

-- ================================================================
-- 3. الدوال البرمجية (Functions)
-- ================================================================

-- دالة اعتماد الفاتورة
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_invoice record; 
    v_item record; 
    v_org_id uuid; 
    v_sales_acc_id uuid; 
    v_vat_acc_id uuid; 
    v_customer_acc_id uuid; 
    v_cogs_acc_id uuid;
    v_inventory_acc_id uuid;
    v_journal_id uuid; 
    v_exchange_rate numeric;
    v_total_cost numeric := 0;
    v_item_cost numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RETURN; END IF;
    
    -- تحديد المنظمة الحالية وجلب الحسابات الخاصة بها فقط
    v_org_id := public.get_my_org();
    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;

    IF v_sales_acc_id IS NULL OR v_vat_acc_id IS NULL OR v_customer_acc_id IS NULL OR v_cogs_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
        RAISE EXCEPTION 'خطأ: بعض الحسابات الأساسية غير معرّفة في الدليل (411, 2231, 1221, 511, 10302)';
    END IF;

    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);

    -- تحديث المخزون وحساب التكلفة الإجمالية للفاتورة
    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        SELECT COALESCE(weighted_average_cost, cost, purchase_price, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_item.quantity);

        UPDATE public.products SET stock = stock - v_item.quantity WHERE id = v_item.product_id;
    END LOOP;

    -- إنشاء القيد المحاسبي
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || v_invoice.invoice_number, v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'invoice', true) 
    RETURNING id INTO v_journal_id;

    -- 1. المدين: العملاء (الإجمالي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES 
    (v_journal_id, v_customer_acc_id, (v_invoice.total_amount * v_exchange_rate), 0, 'استحقاق عميل - فاتورة ' || v_invoice.invoice_number);
    
    -- 2. الدائن: المبيعات (الصافي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES 
    (v_journal_id, v_sales_acc_id, 0, (v_invoice.subtotal * v_exchange_rate), 'إيراد مبيعات - فاتورة ' || v_invoice.invoice_number);
    
    -- 3. الدائن: الضريبة (القيمة)
    IF COALESCE(v_invoice.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES 
        (v_journal_id, v_vat_acc_id, 0, (v_invoice.tax_amount * v_exchange_rate), 'ضريبة القيمة المضافة');
    END IF;

    -- 4. إثبات تكلفة المبيعات (الجرد المستمر)
    IF v_total_cost > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
        (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة - فاتورة ' || v_invoice.invoice_number, v_org_id),
        (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون - فاتورة ' || v_invoice.invoice_number, v_org_id);
    END IF;

    UPDATE public.invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END; $$;

-- حذف الدالة القديمة أولاً لتمكين تغيير نوع المخرجات أو المعاملات
DROP FUNCTION IF EXISTS public.run_payroll_rpc(integer, integer, date, uuid, jsonb);

-- دالة تشغيل الرواتب المطورة (تمنع خطأ الحسابات غير المعرفة)
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(
    p_month int,
    p_year int,
    p_date date,
    p_treasury_account_id uuid,
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payroll_id uuid;
    v_journal_id uuid;
    v_item jsonb;
    v_org_id uuid;
    v_salaries_acc uuid;
    v_bonuses_acc uuid;
    v_deductions_acc uuid;
    v_advances_acc uuid;
    v_total_gross numeric := 0;
    v_total_additions numeric := 0;
    v_total_advances numeric := 0;
    v_total_deductions numeric := 0;
    v_total_net numeric := 0;
BEGIN
    v_org_id := public.get_my_org();
    SELECT id INTO v_salaries_acc FROM public.accounts WHERE code = '531' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    SELECT id INTO v_bonuses_acc FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    SELECT id INTO v_deductions_acc FROM public.accounts WHERE code = '422' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;
    SELECT id INTO v_advances_acc FROM public.accounts WHERE code = '1223' AND organization_id = v_org_id AND deleted_at IS NULL LIMIT 1;

    IF v_salaries_acc IS NULL THEN RAISE EXCEPTION 'حساب الرواتب (531) غير موجود.'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_total_gross := v_total_gross + (v_item->>'gross_salary')::numeric;
        v_total_additions := v_total_additions + (v_item->>'additions')::numeric;
        v_total_advances := v_total_advances + (v_item->>'advances_deducted')::numeric;
        v_total_deductions := v_total_deductions + (v_item->>'other_deductions')::numeric;
        v_total_net := v_total_net + (v_item->>'net_salary')::numeric;
    END LOOP;

    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_advances + v_total_deductions), v_total_net, 'posted', v_org_id)
    RETURNING id INTO v_payroll_id;

    INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, advances_deducted, other_deductions, net_salary, organization_id)
    SELECT v_payroll_id, (item->>'employee_id')::uuid, (item->>'gross_salary')::numeric, (item->>'additions')::numeric, (item->>'advances_deducted')::numeric, (item->>'other_deductions')::numeric, (item->>'net_salary')::numeric, v_org_id
    FROM jsonb_array_elements(p_items) AS item;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id)
    VALUES (p_date, 'مسير رواتب شهر ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year || '-' || floor(random()*1000), 'posted', true, v_org_id)
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_salaries_acc, v_total_gross, 0, 'مصاريف الرواتب', v_org_id);

    IF v_total_additions > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_bonuses_acc, v_total_additions, 0, 'المكافآت والحوافز', v_org_id);
    END IF;
    IF v_total_advances > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_advances_acc, 0, v_total_advances, 'استرداد سلف', v_org_id);
    END IF;
    IF v_total_deductions > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_deductions_acc, 0, v_total_deductions, 'جزاءات الموظفين', v_org_id);
    END IF;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, p_treasury_account_id, 0, v_total_net, 'صرف صافي الرواتب', v_org_id);

    RETURN v_payroll_id;
END;
$$;

-- دالة اعتماد فاتورة المشتريات
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid; v_current_stock numeric; v_current_avg_cost numeric; v_new_avg_cost numeric; v_exchange_rate numeric; v_item_price_base numeric; v_total_amount_base numeric; v_tax_amount_base numeric; v_net_amount_base numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' LIMIT 1; -- استخدام حساب المنتج التام
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '1241' LIMIT 1;
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' LIMIT 1;

    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        v_item_price_base := v_item.price * v_exchange_rate;
        SELECT stock, weighted_average_cost INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_item.product_id;
        v_current_stock := COALESCE(v_current_stock, 0);
        v_current_avg_cost := COALESCE(v_current_avg_cost, 0);

        IF (v_current_stock + v_item.quantity) > 0 THEN v_new_avg_cost := ((v_current_stock * v_current_avg_cost) + (v_item.quantity * v_item_price_base)) / (v_current_stock + v_item.quantity); ELSE v_new_avg_cost := v_item.price; END IF;

        UPDATE public.products SET stock = stock + v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_item.quantity)), purchase_price = v_item_price_base, weighted_average_cost = v_new_avg_cost, cost = v_new_avg_cost WHERE id = v_item.product_id;
    END LOOP;

    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_net_amount_base := v_total_amount_base - v_tax_amount_base;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات', v_org_id);
    IF v_tax_amount_base > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات', v_org_id); END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد', v_org_id);

    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END;
$$;

-- دالة اعتماد مرتجع المبيعات
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_acc_sales_ret uuid; v_acc_vat uuid; v_acc_cust uuid;
BEGIN
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF v_return.status = 'posted' THEN RETURN; END IF;
    
    v_org_id := public.get_my_org();
    SELECT id INTO v_acc_sales_ret FROM public.accounts WHERE code = '412' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_cust FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1;

    IF v_acc_sales_ret IS NULL OR v_acc_cust IS NULL THEN RAISE EXCEPTION 'حسابات المرتجعات أو العملاء غير معرّفة (412, 1221)'; END IF;

    -- تحديث المخزون
    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock + v_item.quantity WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_sales_ret, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مرتجع مبيعات', v_org_id);
    
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, v_return.tax_amount, 0, 'ضريبة المرتجع', v_org_id);
    END IF;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES 
    (v_journal_id, v_acc_cust, 0, v_return.total_amount, 'تخفيض حساب العميل', v_org_id);

    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END; $$;

-- دالة اعتماد مرتجع المشتريات
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_journal_id uuid;
    v_acc_inv uuid; v_acc_vat uuid; v_acc_supp uuid;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF v_return.status = 'posted' THEN RETURN; END IF;

    v_org_id := public.get_my_org();
    SELECT id INTO v_acc_inv FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_acc_supp FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1;

    IF v_acc_inv IS NULL OR v_acc_supp IS NULL THEN RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة (10302, 201)'; END IF;

    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock - v_item.quantity WHERE id = v_item.product_id AND organization_id = v_org_id;
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
END; $$;

-- دالة اعتماد الإشعار الدائن
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_note record; v_org_id uuid; v_journal_id uuid;
    v_acc_allowance uuid; v_acc_vat uuid; v_acc_cust uuid;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    IF v_note.status = 'posted' THEN RETURN; END IF;

    v_org_id := public.get_my_org();
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
END; $$;

-- دالة اعتماد الإشعار المدين
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_note record; v_org_id uuid; v_journal_id uuid;
    v_acc_supp uuid; v_acc_cogs uuid; v_acc_vat uuid;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    IF v_note.status = 'posted' THEN RETURN; END IF;

    v_org_id := public.get_my_org();
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
END; $$;

-- ================================================================
-- دوال الاعتماد المفقودة (Financial Approvals)
-- ================================================================

CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid)
RETURNS void AS $$
DECLARE v_voucher record; v_org_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    v_org_id := public.get_my_org();
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض رقم ' || COALESCE(v_voucher.voucher_number, '-'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true) RETURNING id INTO v_journal_id;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, p_credit_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid)
RETURNS void AS $$
DECLARE v_voucher record; v_org_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    v_org_id := public.get_my_org();
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف رقم ' || COALESCE(v_voucher.voucher_number, '-'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true) RETURNING id INTO v_journal_id;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END; $$ LANGUAGE plpgsql;

-- ================================================================
-- دوال المطاعم (Restaurant POS Logic)
-- ================================================================

CREATE OR REPLACE FUNCTION public.open_table_session(p_table_id uuid, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_session_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    IF EXISTS (SELECT 1 FROM public.restaurant_tables WHERE id = p_table_id AND status != 'AVAILABLE') THEN RAISE EXCEPTION 'الطاولة غير متاحة'; END IF;
    INSERT INTO public.table_sessions (table_id, opened_by, status, opened_at, organization_id) VALUES (p_table_id, p_user_id, 'OPEN', now(), v_org_id) RETURNING id INTO v_session_id;
    UPDATE public.restaurant_tables SET status = 'OCCUPIED', updated_at = now() WHERE id = p_table_id;
    RETURN v_session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb, p_customer_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order_id uuid; v_item jsonb; v_order_num text; v_org_id uuid; v_order_item_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));
    INSERT INTO public.orders (session_id, created_by, order_type, notes, status, customer_id, order_number, organization_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'PENDING', p_customer_id, v_order_num, v_org_id) RETURNING id INTO v_order_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total_price, unit_cost, notes, organization_id)
        VALUES (v_order_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::numeric, (v_item->>'unitPrice')::numeric, 
               ((v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric), COALESCE((v_item->>'unitCost')::numeric, 0), v_item->>'notes', v_org_id)
        RETURNING id INTO v_order_item_id;
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;
    RETURN v_order_id;
END; $$;

-- دالة إعادة احتساب المخزون
CREATE OR REPLACE FUNCTION recalculate_stock_rpc()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC;
BEGIN
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL LOOP
        total_qty := 0; wh_json := '{}'::jsonb;
        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL LOOP
            wh_qty := 0;
            -- Sales (Direct + BOM + Modifiers)
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft' AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = ii.product_id)), 0) INTO wh_qty;
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity * bom.quantity_required) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id WHERE bom.raw_material_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft'), 0) INTO wh_qty;
            SELECT wh_qty - COALESCE((SELECT SUM(ii.quantity * bom.quantity_required) FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ii.modifiers, '[]'::jsonb)) AS m JOIN public.bill_of_materials bom ON bom.product_id = (m->>'id')::uuid WHERE bom.raw_material_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft'), 0) INTO wh_qty;
            
            -- Purchases (Direct + BOM)
            SELECT wh_qty + COALESCE((SELECT SUM(pii.quantity) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft' AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = pii.product_id)), 0) INTO wh_qty;
            SELECT wh_qty + COALESCE((SELECT SUM(pii.quantity * bom.quantity_required) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id JOIN public.bill_of_materials bom ON bom.product_id = pii.product_id WHERE bom.raw_material_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft'), 0) INTO wh_qty;

            SELECT wh_qty + COALESCE(SUM(sri.quantity), 0) INTO wh_qty FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.sales_return_id WHERE sri.product_id = prod_record.id AND sr.warehouse_id = wh_record.id AND sr.status != 'draft';
            SELECT wh_qty - COALESCE(SUM(pri.quantity), 0) INTO wh_qty FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.purchase_return_id WHERE pri.product_id = prod_record.id AND pr.warehouse_id = wh_record.id AND pr.status != 'draft';
            SELECT wh_qty - COALESCE(SUM(sti.quantity), 0) INTO wh_qty FROM stock_transfer_items sti JOIN stock_transfers st ON st.id = sti.stock_transfer_id WHERE sti.product_id = prod_record.id AND st.from_warehouse_id = wh_record.id AND st.status != 'draft';
            SELECT wh_qty + COALESCE(SUM(sti.quantity), 0) INTO wh_qty FROM stock_transfer_items sti JOIN stock_transfers st ON st.id = sti.stock_transfer_id WHERE sti.product_id = prod_record.id AND st.to_warehouse_id = wh_record.id AND st.status != 'draft';
            SELECT wh_qty + COALESCE(SUM(oi.quantity), 0) INTO wh_qty FROM opening_inventories oi WHERE oi.product_id = prod_record.id AND oi.warehouse_id = wh_record.id;
            
            -- إضافة حركات التصنيع
            SELECT wh_qty + COALESCE(SUM(wo.quantity), 0) INTO wh_qty FROM work_orders wo WHERE wo.product_id = prod_record.id AND wo.warehouse_id = wh_record.id AND wo.status = 'completed';
            -- خصم المواد الخام (يحتاج منطق BOM معقد، للتبسيط هنا نفترض التحديث المباشر عند الإكمال)

            total_qty := total_qty + wh_qty;
            IF wh_qty <> 0 THEN wh_json := wh_json || jsonb_build_object(wh_record.id, wh_qty); END IF;
        END LOOP;
        UPDATE products SET stock = total_qty, warehouse_stock = wh_json WHERE id = prod_record.id;
    END LOOP;
END;
$$;

-- دالة إنشاء قيد يومية
CREATE OR REPLACE FUNCTION public.create_journal_entry(
    entry_date date,
    description text,
    reference text,
    entries jsonb,
    status text DEFAULT 'posted',
    org_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE new_entry_id uuid; entry_record jsonb;
BEGIN
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id) VALUES (entry_date, description, reference, status, org_id) RETURNING id INTO new_entry_id;
    FOR entry_record IN SELECT * FROM jsonb_array_elements(entries) LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, cost_center_id, organization_id) VALUES (new_entry_id, (entry_record->>'account_id')::uuid, (entry_record->>'debit')::numeric, (entry_record->>'credit')::numeric, (entry_record->>'description'), (entry_record->>'cost_center_id')::uuid, org_id);
    END LOOP;
    RETURN new_entry_id;
END;
$$;

-- ================================================================
-- 4. البيانات الأولية (Seeding)
-- ================================================================
-- إنشاء المنظمة والإعدادات الافتراضية
INSERT INTO public.organizations (name) VALUES ('الشركة النموذجية للتجارة');
INSERT INTO public.company_settings (company_name, currency, enable_tax) VALUES ('الشركة النموذجية للتجارة', 'SAR', true);
-- إنشاء مستودع افتراضي
INSERT INTO public.warehouses (name, location) VALUES ('المستودع الرئيسي', 'الفرع الرئيسي');
-- إنشاء مركز تكلفة افتراضي
INSERT INTO public.cost_centers (name, code, description) VALUES ('المركز الرئيسي', 'MAIN', 'مركز التكلفة الرئيسي');

-- ================================================================
-- 4. الأدوار والصلاحيات الأساسية
-- ================================================================
INSERT INTO public.roles (name, description) VALUES
('super_admin', 'مدير عام - صلاحيات كاملة'),
('admin', 'مدير - صلاحيات إدارية'),
('manager', 'مدير قسم - صلاحيات محدودة'),
('accountant', 'محاسب - صلاحيات محاسبية'),
('sales', 'مبيعات - صلاحيات مبيعات'),
('purchases', 'مشتريات - صلاحيات مشتريات'),
('viewer', 'عارض - قراءة فقط');

-- الصلاحيات الأساسية
INSERT INTO public.permissions (module, action) VALUES
-- المحاسبة
('accounting', 'view'),
('accounting', 'create'),
('accounting', 'edit'),
('accounting', 'delete'),
-- المبيعات
('sales', 'view'),
('sales', 'create'),
('sales', 'edit'),
('sales', 'delete'),
-- المشتريات
('purchases', 'view'),
('purchases', 'create'),
('purchases', 'edit'),
('purchases', 'delete'),
-- المخزون
('inventory', 'view'),
('inventory', 'create'),
('inventory', 'edit'),
('inventory', 'delete'),
-- الإدارة
('admin', 'view'),
('admin', 'create'),
('admin', 'edit'),
('admin', 'delete');

-- ربط الصلاحيات بالأدوار
-- Super Admin - جميع الصلاحيات
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p WHERE r.name = 'super_admin';

-- Admin - معظم الصلاحيات
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'admin' AND p.module IN ('accounting', 'sales', 'purchases', 'inventory', 'admin');

-- Manager - صلاحيات محدودة
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'manager' AND p.action IN ('view', 'create', 'edit') AND p.module IN ('sales', 'purchases', 'inventory');

-- Accountant - محاسبة فقط
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'accountant' AND p.module = 'accounting';

-- Sales - مبيعات فقط
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'sales' AND p.module = 'sales';

-- Purchases - مشتريات فقط
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'purchases' AND p.module = 'purchases';

-- Viewer - قراءة فقط
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p 
WHERE r.name = 'viewer' AND p.action = 'view';
-- 1. الحسابات الرئيسية
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('1', 'الأصول', 'ASSET', true, NULL),
('2', 'الخصوم (الإلتزامات)', 'LIABILITY', true, NULL),
('3', 'حقوق الملكية', 'EQUITY', true, NULL),
('4', 'الإيرادات', 'REVENUE', true, NULL),
('5', 'المصروفات', 'EXPENSE', true, NULL);

-- 11 الأصول غير المتداولة
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('11', 'الأصول غير المتداولة', 'ASSET', true, (SELECT id FROM accounts WHERE code = '1'));
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('111', 'الأصول الثابتة (بالصافي)', 'ASSET', true, (SELECT id FROM accounts WHERE code = '11')),
('1111', 'الأراضي', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1112', 'المباني والإنشاءات', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1113', 'الآلات والمعدات', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1114', 'وسائل النقل والانتقال', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1115', 'الأثاث والتجهيزات المكتبية', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1116', 'أجهزة حاسب آلي وبرمجيات', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1119', 'مجمع إهلاك الأصول الثابتة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111'));

-- 12 الأصول المتداولة
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('12', 'الأصول المتداولة', 'ASSET', true, (SELECT id FROM accounts WHERE code = '1'));
-- 103 المخزون (النظام الموحد)
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('103', 'المخزون', 'ASSET', true, (SELECT id FROM accounts WHERE code = '12')),
('10301', 'مخزون المواد الخام', 'ASSET', false, (SELECT id FROM accounts WHERE code = '103')),
('10302', 'مخزون المنتج التام', 'ASSET', false, (SELECT id FROM accounts WHERE code = '103'));

-- 122 العملاء والمدينون
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('122', 'العملاء والمدينون', 'ASSET', true, (SELECT id FROM accounts WHERE code = '12')),
('1221', 'العملاء', 'ASSET', false, (SELECT id FROM accounts WHERE code = '122')),
('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '122')),
('1223', 'سلف الموظفين', 'ASSET', false, (SELECT id FROM accounts WHERE code = '122')),
('1224', 'عهد موظفين', 'ASSET', false, (SELECT id FROM accounts WHERE code = '122'));

-- 123 النقدية وما في حكمها
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('123', 'النقدية وما في حكمها', 'ASSET', true, (SELECT id FROM accounts WHERE code = '12')),
('1231', 'النقدية بالصندوق (الخزينة الرئيسية)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '123')),
('1232', 'البنوك (حسابات جارية)', 'ASSET', true, (SELECT id FROM accounts WHERE code = '123')),
('123201', 'البنك الأهلي المصري', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123202', 'بنك مصر', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123203', 'البنك التجاري الدولي (CIB)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123204', 'بنك QNB الأهلي', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123205', 'بنك القاهرة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123206', 'بنك فيصل الإسلامي', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123207', 'بنك الإسكندرية', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('1233', 'المحافظ الإلكترونية (Digital Wallets)', 'ASSET', true, (SELECT id FROM accounts WHERE code = '123')),
('123301', 'فودافون كاش (Vodafone Cash)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233')),
('123302', 'اتصالات كاش (Etisalat Cash)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233')),
('123303', 'أورنج كاش (Orange Cash)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233')),
('123304', 'وي باي (WE Pay)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233')),
('123305', 'انستا باي (InstaPay - تسوية)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233'));

-- 124 أرصدة مدينة أخرى
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('124', 'أرصدة مدينة أخرى', 'ASSET', true, (SELECT id FROM accounts WHERE code = '12')),
('1241', 'ضريبة القيمة المضافة (مدخلات)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '124')),
('1242', 'ضريبة الخصم والتحصيل (لنا)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '124')),
('1243', 'مصروفات مدفوعة مقدماً', 'ASSET', true, (SELECT id FROM accounts WHERE code = '124')),
('124301', 'إيجار مقدم', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('124302', 'تأمين طبي مقدم', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('124304', 'حملات إعلانية مقدمة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('124305', 'عقود صيانة مقدمة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('1244', 'إيرادات مستحقة', 'ASSET', true, (SELECT id FROM accounts WHERE code = '124')),
('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1244')),
('124402', 'فوائد بنكية مستحقة القبض', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1244')),
('124403', 'إيجارات دائنة مستحقة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1244')),
('124404', 'إيرادات أوراق مالية مستحقة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1244'));

-- 2. الخصوم
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('21', 'الخصوم غير المتداولة', 'LIABILITY', true, (SELECT id FROM accounts WHERE code = '2')),
('211', 'قروض طويلة الأجل', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '21'));

INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('22', 'الخصوم المتداولة', 'LIABILITY', true, (SELECT id FROM accounts WHERE code = '2')),
('201', 'الموردين', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '22')),
('222', 'أوراق الدفع (شيكات صادرة)', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '22')),
('223', 'مصلحة الضرائب (التزامات)', 'LIABILITY', true, (SELECT id FROM accounts WHERE code = '22')),
('2231', 'ضريبة القيمة المضافة (مخرجات)', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '223')),
('2232', 'ضريبة الخصم والتحصيل (علينا)', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '223')),
('2233', 'ضريبة كسب العمل', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '223')),
('224', 'هيئة التأمينات الاجتماعية', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '22')),
('225', 'مصروفات مستحقة', 'LIABILITY', true, (SELECT id FROM accounts WHERE code = '22')),
('2251', 'رواتب وأجور مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2252', 'إيجارات مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2253', 'كهرباء ومياه وغاز مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2254', 'أتعاب مهنية ومراجعة مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2255', 'عمولات بيع مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2256', 'فوائد بنكية مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2257', 'اشتراكات وتراخيص مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('226', 'تأمينات ودفعات مقدمة من العملاء', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '22'));

-- 3. حقوق الملكية
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('31', 'رأس المال', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3')),
('32', 'الأرباح المبقاة / المرحلة', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3')),
('33', 'جاري الشركاء', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3')),
('34', 'احتياطيات', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3')),
('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3'));

-- 4. الإيرادات
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('41', 'إيرادات النشاط (المبيعات)', 'REVENUE', true, (SELECT id FROM accounts WHERE code = '4')),
('411', 'إيراد المبيعات', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '41')),
('412', 'مردودات المبيعات', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '41')),
('413', 'خصم مسموح به', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '41')),
('42', 'إيرادات أخرى', 'REVENUE', true, (SELECT id FROM accounts WHERE code = '4')),
('421', 'إيرادات متنوعة', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '42')),
('422', 'إيراد خصومات وجزاءات الموظفين', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '42')),
('423', 'فوائد بنكية دائنة', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '42'));

-- 5. المصروفات
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('51', 'تكلفة المبيعات (COGS)', 'EXPENSE', true, (SELECT id FROM accounts WHERE code = '5')),
('511', 'تكلفة البضاعة المباعة', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '51')),
('512', 'تسويات الجرد (عجز المخزون)', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '51')),

('52', 'مصروفات البيع والتسويق', 'EXPENSE', true, (SELECT id FROM accounts WHERE code = '5')),
('521', 'دعاية وإعلان', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '52')),
('522', 'عمولات بيع وتسويق', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '52')),
('523', 'نقل ومشال للخارج', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '52')),
('524', 'تعبئة وتغليف', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '52')),
('525', 'عمولات تحصيل إلكتروني', 'EXPENSE', true, (SELECT id FROM accounts WHERE code = '52')),
('5251', 'عمولة فودافون كاش', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '525')),
('5252', 'عمولة فوري', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '525')),
('5253', 'عمولة تحويلات بنكية', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '525')),

('53', 'المصروفات الإدارية والعمومية', 'EXPENSE', true, (SELECT id FROM accounts WHERE code = '5')),
('531', 'الرواتب والأجور', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('5311', 'بدلات وانتقالات', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('5312', 'مكافآت وحوافز', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('532', 'إيجار مقرات إدارية', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('533', 'إهلاك الأصول الثابتة', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('534', 'رسوم ومصروفات بنكية', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('535', 'كهرباء ومياه وغاز', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('536', 'اتصالات وإنترنت', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('537', 'صيانة وإصلاح', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('538', 'أدوات مكتبية ومطبوعات', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('539', 'ضيافة واستقبال', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('541', 'تسوية عجز الصندوق', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('542', 'إكراميات', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('543', 'مصاريف نظافة', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53'));

-- ================================================================
-- 6. بيانات تجريبية أساسية
-- ================================================================
-- عملاء تجريبيين
INSERT INTO public.customers (name, phone, email, address, credit_limit, customer_type) VALUES
('عميل تجريبي 1', '0500000000', 'customer1@example.com', 'الرياض', 50000, 'individual'),
('شركة الأفق للتجارة', '0501234567', 'horizon@example.com', 'الرياض', 100000, 'store');

-- موردين تجريبيين
INSERT INTO public.suppliers (name, phone, email, address, contact_person) VALUES
('مورد تجريبي 1', '0509999999', 'supplier1@example.com', 'جدة', 'أحمد محمد'),
('شركة التوريدات العالمية', '0509988776', 'supply@example.com', 'جدة', 'فاطمة علي');

-- فئات المنتجات
INSERT INTO public.item_categories (name, default_inventory_account_id, default_cogs_account_id, default_sales_account_id) VALUES
('إلكترونيات', (SELECT id FROM accounts WHERE code = '10302'), (SELECT id FROM accounts WHERE code = '511'), (SELECT id FROM accounts WHERE code = '411')),
('ملابس', (SELECT id FROM accounts WHERE code = '10302'), (SELECT id FROM accounts WHERE code = '511'), (SELECT id FROM accounts WHERE code = '411')),
('أغذية', (SELECT id FROM accounts WHERE code = '10302'), (SELECT id FROM accounts WHERE code = '511'), (SELECT id FROM accounts WHERE code = '411'));

-- منتجات تجريبية
INSERT INTO public.products (name, sku, sales_price, purchase_price, cost, stock, min_stock_level, item_type, category_id, sales_account_id, cogs_account_id, inventory_account_id) VALUES
('منتج تجريبي 1', 'PROD-001', 100, 80, 80, 100, 10, 'STOCK', (SELECT id FROM item_categories WHERE name = 'إلكترونيات'), 
 (SELECT id FROM accounts WHERE code = '411'), (SELECT id FROM accounts WHERE code = '511'), (SELECT id FROM accounts WHERE code = '10302')),
('منتج تجريبي 2', 'PROD-002', 200, 150, 150, 50, 5, 'STOCK', (SELECT id FROM item_categories WHERE name = 'ملابس'), 
 (SELECT id FROM accounts WHERE code = '411'), (SELECT id FROM accounts WHERE code = '511'), (SELECT id FROM accounts WHERE code = '10302'));

-- بيانات تجريبية للمطاعم
DECLARE
    v_menu_cat_appetizers_id uuid;
    v_menu_cat_main_id uuid;
    v_menu_cat_drinks_id uuid;
    v_menu_cat_desserts_id uuid;
    v_burger_id uuid;
    v_pizza_id uuid;
    v_cola_id uuid;
    v_cake_id uuid;
BEGIN
    -- جلب معرف المنظمة الحالي لربط البيانات التجريبية
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN SELECT id INTO v_org_id FROM public.organizations LIMIT 1; END IF;

    -- فئات المنيو
    INSERT INTO public.item_categories (name, organization_id) VALUES ('مقبلات', v_org_id) RETURNING id INTO v_menu_cat_appetizers_id;
    INSERT INTO public.item_categories (name, organization_id) VALUES ('وجبات رئيسية', v_org_id) RETURNING id INTO v_menu_cat_main_id;
    INSERT INTO public.item_categories (name, organization_id) VALUES ('مشروبات', v_org_id) RETURNING id INTO v_menu_cat_drinks_id;
    INSERT INTO public.item_categories (name, organization_id) VALUES ('حلويات', v_org_id) RETURNING id INTO v_menu_cat_desserts_id;

    -- أصناف المنيو (منتجات)
    INSERT INTO public.products (name, sku, sales_price, purchase_price, cost, stock, min_stock_level, item_type, category_id, sales_account_id, cogs_account_id, inventory_account_id, organization_id) VALUES
    ('برجر لحم', 'BURGER-001', 50, 25, 25, 100, 10, 'STOCK', v_menu_cat_main_id, 
     (SELECT id FROM accounts WHERE code = '411' AND organization_id = v_org_id), (SELECT id FROM accounts WHERE code = '511' AND organization_id = v_org_id), (SELECT id FROM accounts WHERE code = '10302' AND organization_id = v_org_id), v_org_id) RETURNING id INTO v_burger_id;
    INSERT INTO public.products (name, sku, sales_price, purchase_price, cost, stock, min_stock_level, item_type, category_id, sales_account_id, cogs_account_id, inventory_account_id, organization_id) VALUES
    ('بيتزا مارجريتا', 'PIZZA-001', 70, 35, 35, 80, 8, 'STOCK', v_menu_cat_main_id, 
     (SELECT id FROM accounts WHERE code = '411' AND organization_id = v_org_id), (SELECT id FROM accounts WHERE code = '511' AND organization_id = v_org_id), (SELECT id FROM accounts WHERE code = '10302' AND organization_id = v_org_id), v_org_id) RETURNING id INTO v_pizza_id;
    INSERT INTO public.products (name, sku, sales_price, purchase_price, cost, stock, min_stock_level, item_type, category_id, sales_account_id, cogs_account_id, inventory_account_id, organization_id) VALUES
    ('كولا', 'DRINK-001', 10, 5, 5, 200, 20, 'STOCK', v_menu_cat_drinks_id, 
     (SELECT id FROM accounts WHERE code = '411' AND organization_id = v_org_id), (SELECT id FROM accounts WHERE code = '511' AND organization_id = v_org_id), (SELECT id FROM accounts WHERE code = '10302' AND organization_id = v_org_id), v_org_id) RETURNING id INTO v_cola_id;
    INSERT INTO public.products (name, sku, sales_price, purchase_price, cost, stock, min_stock_level, item_type, category_id, sales_account_id, cogs_account_id, inventory_account_id, organization_id) VALUES
    ('كيك الشوكولاتة', 'DESSERT-001', 30, 15, 15, 60, 6, 'STOCK', v_menu_cat_desserts_id, 
     (SELECT id FROM accounts WHERE code = '411' AND organization_id = v_org_id), (SELECT id FROM accounts WHERE code = '511' AND organization_id = v_org_id), (SELECT id FROM accounts WHERE code = '10302' AND organization_id = v_org_id), v_org_id) RETURNING id INTO v_cake_id;

    -- طاولات المطعم
    INSERT INTO public.restaurant_tables (name, capacity, section, organization_id) VALUES
    ('طاولة 1', 4, 'الداخل', v_org_id),
    ('طاولة 2', 2, 'الداخل', v_org_id),
    ('طاولة 3', 6, 'الخارج', v_org_id),
    ('طاولة VIP 1', 8, 'VIP', v_org_id);
END;
$$;

-- ================================================================
-- 7. تفعيل نظام الحماية (RLS) الشامل
-- ================================================================

-- تفعيل RLS على جميع جداول النظام بدون استثناء
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[
        'profiles', 'organizations', 'company_settings', 'roles', 'permissions', 'role_permissions', 'user_permissions',
        'accounts', 'cost_centers', 'journal_entries', 'journal_lines', 'journal_attachments',
        'customers', 'suppliers', 'warehouses', 'item_categories', 'products', 'bill_of_materials', 'opening_inventories',
        'invoices', 'invoice_items', 'sales_returns', 'sales_return_items', 'quotations', 'quotation_items',
        'purchase_invoices', 'purchase_invoice_items', 'purchase_returns', 'purchase_return_items', 'purchase_orders', 'purchase_order_items',
        'receipt_vouchers', 'payment_vouchers', 'receipt_voucher_attachments', 'payment_voucher_attachments',
        'cheques', 'cheque_attachments', 'cash_closings', 'rejected_cash_closings', 'credit_notes', 'debit_notes',
        'assets', 'employees', 'payrolls', 'payroll_items', 'employee_advances',
        'restaurant_tables', 'table_sessions', 'orders', 'order_items', 'payments',
        'stock_transfers', 'stock_transfer_items', 'stock_adjustments', 'stock_adjustment_items', 'inventory_counts', 'inventory_count_items',
        'work_orders', 'work_order_costs', 'bank_reconciliations', 'notifications', 'notification_preferences', 'notification_audit_log'
    ];
BEGIN 
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', t);
    END LOOP;
END $$;

-- سياسات الوصول (Policies)
-- 1. Profiles
CREATE POLICY "Profiles isolated by org" ON profiles FOR SELECT USING (organization_id = get_my_org());
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins manage profiles" ON profiles FOR ALL USING (is_admin() AND organization_id = get_my_org());

-- 2. Organizations
CREATE POLICY "Users view own org" ON organizations FOR SELECT USING (id = get_my_org());

-- 2. Settings
CREATE POLICY "Settings isolated by org" ON company_settings FOR SELECT TO authenticated USING (organization_id = get_my_org());
CREATE POLICY "Admins update settings" ON company_settings FOR UPDATE USING (is_admin() AND organization_id = get_my_org());

-- 3. البيانات الأساسية (Basic Data)
-- تكرار السياسة لجميع جداول التعريفات لضمان الحماية
DO $$ 
DECLARE 
    t text;
    basic_tables text[] := ARRAY['products', 'customers', 'suppliers', 'warehouses', 'accounts', 'cost_centers', 'item_categories', 'bill_of_materials', 'assets', 'employees'];
BEGIN 
    FOREACH t IN ARRAY basic_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Policy_Select_%I" ON %I;', t, t);
        EXECUTE format('CREATE POLICY "Policy_Select_%I" ON %I FOR SELECT TO authenticated USING (organization_id = public.get_my_org());', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Policy_Staff_%I" ON %I;', t, t);
        EXECUTE format('CREATE POLICY "Policy_Staff_%I" ON %I FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN (''super_admin'', ''admin'', ''manager'', ''sales'', ''purchases'', ''accountant''));', t, t);
    END LOOP;
END $$;

-- 4. Transactions
-- تشمل الفواتير، السندات، القيود، وطلبات المطعم
DO $$ 
DECLARE 
    t text;
    trans_tables text[] := ARRAY[
        'invoices', 'invoice_items', 'purchase_invoices', 'purchase_invoice_items', 'journal_entries', 'journal_lines', 
        'receipt_vouchers', 'payment_vouchers', 'orders', 'order_items', 'payments', 'payrolls', 'payroll_items',
        'sales_returns', 'sales_return_items', 'purchase_returns', 'purchase_return_items', 'stock_adjustments', 'stock_transfers'
    ];
BEGIN 
    FOREACH t IN ARRAY trans_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Trans_Select_%I" ON %I;', t, t);
        EXECUTE format('CREATE POLICY "Trans_Select_%I" ON %I FOR SELECT TO authenticated USING (organization_id = public.get_my_org());', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Trans_Staff_%I" ON %I;', t, t);
        EXECUTE format('CREATE POLICY "Trans_Staff_%I" ON %I FOR ALL USING (organization_id = public.get_my_org() AND get_my_role() IN (''super_admin'', ''admin'', ''manager'', ''accountant'', ''sales'', ''purchases''));', t, t);
    END LOOP;
END $$;

-- 5. Notifications (User specific)
CREATE POLICY "Users view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id AND organization_id = get_my_org());
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id AND organization_id = get_my_org());

-- 6. Security Logs (Insert for all, View for Admin)
CREATE POLICY "Everyone insert logs" ON security_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = performed_by AND organization_id = get_my_org());
CREATE POLICY "Admins view logs" ON security_logs FOR SELECT USING (is_admin() AND organization_id = get_my_org());

-- تم الانتهاء من إعداد قاعدة البيانات بالكامل! ✅
