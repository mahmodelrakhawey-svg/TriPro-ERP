-- 🌟 ملف التأسيس الشامل (Master Setup) - TriPro ERP
-- 📅 تاريخ التحديث: 2026-06-16 (Safe Idempotent Version)
-- ℹ️ الوصف: النسخة الهيكلية الآمنة - تحديث الهيكل دون مسح البيانات.
-- ================================================================
-- 0. إعداد المخطط (Schema Setup)
-- ================================================================
-- ⚠️ تم إيقاف المسح الكامل للمخطط لسلامة بيئة SaaS
-- في حال الرغبة في مسح شامل، قم بتشغيل DROP SCHEMA public CASCADE يدوياً مرة واحدة فقط.
CREATE SCHEMA IF NOT EXISTS public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ================================================================
-- 1. الجداول الأساسية (Core Tables)
-- ================================================================

-- المنظمات والإعدادات
CREATE TABLE IF NOT EXISTS public.organizations (
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
    suspension_reason text,
    total_collected numeric DEFAULT 0,
    next_payment_date date,
    activity_type text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- جدول النسخ الاحتياطية للمنظمات (SaaS Backups) - تم نقل دالة الإنشاء لملف الدوال
CREATE TABLE IF NOT EXISTS public.organization_backups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    backup_date timestamptz DEFAULT now(),
    backup_data jsonb NOT NULL,
    file_size_kb numeric,
    created_by uuid REFERENCES auth.users(id),
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- ================================================================
-- 1.5 دوال الهوية الموحدة (Standard Identity Helpers)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _role text;
BEGIN
    -- 1. فحص التوكن أولاً (JWT Claims)
    _role := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', '');
    IF _role IS NULL THEN
        _role := NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
    END IF;
    IF _role IS NOT NULL THEN RETURN _role; END IF;
    -- 2. الرجوع للجدول (Fall-back)
    SELECT role INTO _role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN COALESCE(_role, 'viewer');
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _org_id uuid;
BEGIN
    -- 1. البحث في البروفايل (الأولوية القصوى للأدمن والمستخدمين)
    SELECT organization_id INTO _org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;

    -- 2. السوبر أدمن: البحث في التوكن للتنقل
    _org_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'org_id', '')::uuid;
    RETURN _org_id;
END; $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN (public.get_my_role() IN ('super_admin', 'admin', 'owner')); END; $$;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (public.get_my_role() = 'super_admin');
END; $$;

-- الصلاحيات والمستخدمين
CREATE TABLE IF NOT EXISTS public.roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    UNIQUE(name, organization_id) -- السماح بنفس الاسم لشركات مختلفة
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    module text NOT NULL,
    action text NOT NULL,
    description text,
    UNIQUE(module, action)
);

-- تعبئة الصلاحيات الأساسية للنظام لضمان منحها للأدمن تلقائياً عند إنشاء شركة جديدة
INSERT INTO public.permissions (module, action, description) VALUES
('sales', 'view', 'عرض المبيعات'),
('sales', 'create', 'إنشاء فاتورة مبيعات'),
('sales', 'update', 'تعديل فاتورة مبيعات'),
('sales', 'delete', 'حذف فاتورة مبيعات'),
('sales', 'approve', 'اعتماد الفواتير'),
('sales', 'return', 'إدارة مرتجعات المبيعات'),
('sales', 'quotation', 'إدارة عروض الأسعار'),
('purchases', 'view', 'عرض المشتريات'),
('purchases', 'create', 'إنشاء فاتورة مشتريات'),
('purchases', 'update', 'تعديل فاتورة مشتريات'),
('purchases', 'delete', 'حذف فاتورة مشتريات'),
('products', 'view', 'عرض المنتجات'),
('products', 'create', 'إضافة منتجات'),
('products', 'update', 'تعديل منتجات'),
('products', 'delete', 'حذف منتجات'),
('products', 'bom', 'إدارة وصفات التصنيع'),
('inventory', 'view', 'عرض المخزون والتقارير'),
('inventory', 'manage', 'إدارة تسويات المخازن'),
('inventory', 'transfer', 'إدارة التحويلات المخزنية'),
('hr', 'view', 'عرض الموظفين'),
('hr', 'manage', 'إدارة الرواتب'),
('accounting', 'view', 'عرض القيود والتقارير'),
('accounting', 'coa', 'إدارة دليل الحسابات'),
('accounting', 'create', 'إنشاء قيود محاسبية'),
('accounting', 'update', 'تعديل القيود المحاسبية'),
('accounting', 'delete', 'حذف القيود المحاسبية'),
('accounting', 'post', 'ترحيل القيود المحاسبية'),
('treasury', 'view', 'عرض الخزينة'),
('treasury', 'create', 'إنشاء سندات'),
('treasury', 'update', 'تعديل سندات'),
('treasury', 'manage', 'إدارة الخزينة'),
('restaurant', 'manage', 'إدارة المطعم'),
('restaurant', 'pos', 'الوصول لنقطة البيع'),
('restaurant', 'kitchen', 'عرض شاشة المطبخ'),
('assets', 'manage', 'إدارة الأصول الثابتة'),
('reports', 'view_financial', 'عرض التقارير المالية الحساسة'),
('admin', 'manage', 'إدارة الصلاحيات')
ON CONFLICT (module, action) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    full_name text,
    role text DEFAULT 'viewer',
    role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL,
    avatar_url text,
    is_active boolean DEFAULT true NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(organization_id);

-- جدول الدعوات (Invitations) للتحكم في من يمكنه الانضمام للنظام
CREATE TABLE IF NOT EXISTS public.invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text NOT NULL UNIQUE,
    role text DEFAULT 'viewer',
    organization_id uuid REFERENCES public.organizations(id),
    invited_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    accepted_at timestamptz
);

-- دالة معالجة المستخدمين الجدد عند التسجيل (Signup)
-- [تم نقل دوال الـ Triggers والمنطق البرمجي إلى deploy_all_functionss.sql]

CREATE TABLE IF NOT EXISTS public.company_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name text,
    tax_number text,
    activity_type text,
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
    decimal_places integer DEFAULT 2,
    max_cash_deficit_limit numeric DEFAULT 500,
    account_mappings jsonb DEFAULT '{}'::jsonb,
    default_warehouse_id uuid, -- عمود لربط المستودع الافتراضي
    default_treasury_id uuid,  -- عمود لربط الخزينة الافتراضية
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org() UNIQUE,
    updated_at timestamptz DEFAULT now()
);

-- جداول تقنية مفقودة (تم استنتاجها من الدوال)
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
CREATE TABLE IF NOT EXISTS public.cost_centers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    code text,
    description text,
    created_at timestamptz DEFAULT now(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    parent_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    balance numeric DEFAULT 0,
    sub_type text,
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT accounts_organization_id_code_key UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_date date DEFAULT now(),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now(),
    description text,
    reference text,
    status text DEFAULT 'draft',
    is_posted boolean DEFAULT false,
    user_id uuid REFERENCES public.profiles(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    related_document_id uuid,
    related_document_type text,
    CONSTRAINT journal_entries_reference_org_unique UNIQUE (organization_id, reference)
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid REFERENCES public.accounts(id),
    debit numeric(19,4) DEFAULT 0 CHECK (debit >= 0),
    credit numeric(19,4) DEFAULT 0 CHECK (credit >= 0),
    description text,
    cost_center_id uuid REFERENCES public.cost_centers(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    CONSTRAINT journal_lines_debit_credit_check CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE TABLE IF NOT EXISTS public.journal_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text, -- Changed to text for consistency
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

-- العملاء والموردين
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text,
    address text,
    credit_limit numeric DEFAULT 0,
    opening_balance numeric DEFAULT 0,
    customer_type text DEFAULT 'individual', -- individual, store, online
    balance numeric DEFAULT 0, -- حقل محسوب (اختياري للأداء)
    deleted_at timestamptz, -- Changed to timestamptz for consistency
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    responsible_user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    tax_number text,
    tax_id text,
    address text,
    contact_person text,
    opening_balance numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    balance numeric DEFAULT 0, -- Changed to numeric for consistency
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    credit_limit numeric DEFAULT 0
);

-- المخزون والمنتجات
CREATE TABLE IF NOT EXISTS public.warehouses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    location text,
    manager text,
    phone text,
    type text DEFAULT 'warehouse',
     organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    deleted_at timestamptz,
     deletion_reason text,
     UNIQUE (organization_id, name)
);
-- تصنيفات الأصناف (موجود في الهيكل الحالي)
CREATE TABLE IF NOT EXISTS public.item_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    image_url text,
    display_order integer DEFAULT 0,
    default_inventory_account_id uuid REFERENCES public.accounts(id),
    default_cogs_account_id uuid REFERENCES public.accounts(id),
    default_sales_account_id uuid REFERENCES public.accounts(id), -- Changed to uuid for consistency
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (organization_id, name)
);

-- فهرس البحث السريع للتصنيفات
CREATE INDEX IF NOT EXISTS idx_item_categories_name_search ON public.item_categories (organization_id, name);

CREATE TABLE IF NOT EXISTS public.products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    sku text,
    barcode text,
    sales_price numeric DEFAULT 0,
    purchase_price numeric DEFAULT 0,
    description text,
    cost numeric(19,4) DEFAULT 0,
    manufacturing_cost numeric(19,4) DEFAULT 0,
    labor_cost numeric(19,4) DEFAULT 0,
    overhead_cost numeric(19,4) DEFAULT 0,
    is_overhead_percentage boolean DEFAULT false,
    opening_balance numeric DEFAULT 0,
    weighted_average_cost numeric(19,4) DEFAULT 0,
    stock numeric DEFAULT 0,
    unit text,
min_stock numeric DEFAULT 5,
    min_stock_level numeric DEFAULT 0,
    item_type text DEFAULT 'STOCK',
    product_type text DEFAULT 'STOCK', -- إضافة هذا العمود لتوافق الواجهة الأمامية
    mfg_type text DEFAULT 'standard', -- raw, standard, intermediate
    requires_serial boolean DEFAULT false,
    price numeric DEFAULT 0,
    inventory_account_id uuid REFERENCES public.accounts(id),
    cogs_account_id uuid REFERENCES public.accounts(id),
    sales_account_id uuid REFERENCES public.accounts(id),
    image_url text,
    warehouse_stock jsonb DEFAULT '{}',
    category_id uuid REFERENCES public.item_categories(id),
    expiry_date date,
    available_modifiers jsonb DEFAULT '[]'::jsonb,
    
    -- حقول العروض
    offer_price numeric,
    offer_start_date date,
    offer_end_date date,
    offer_max_qty numeric,
    
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
);
-- ================================================================
-- 1.7 جداول مديول التصنيع (MFG Module Tables)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.mfg_work_centers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    hourly_rate numeric DEFAULT 0,
    overhead_rate numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_routings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    name text NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    is_default boolean DEFAULT true,
    deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.mfg_routing_steps (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    routing_id uuid REFERENCES public.mfg_routings(id) ON DELETE CASCADE,
    step_order integer NOT NULL,
    work_center_id uuid REFERENCES public.mfg_work_centers(id) ON DELETE SET NULL,
    operation_name text NOT NULL,
    standard_time_minutes numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.mfg_production_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text UNIQUE,
    product_id uuid REFERENCES public.products(id),
    quantity_to_produce numeric NOT NULL,
    status text DEFAULT 'draft',
    start_date date,
    end_date date,
    batch_number text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_order_progress (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    step_id uuid REFERENCES public.mfg_routing_steps(id),
    status text DEFAULT 'pending',
    actual_start_time timestamptz,
    actual_end_time timestamptz,
    produced_qty numeric DEFAULT 0,
    labor_cost_actual numeric DEFAULT 0,
    qc_verified boolean DEFAULT NULL,
    employee_id uuid REFERENCES public.employees(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_step_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    step_id uuid REFERENCES public.mfg_routing_steps(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_required numeric NOT NULL DEFAULT 1,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_actual_material_usage (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id),
    standard_quantity numeric NOT NULL,
    actual_quantity numeric NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_scrap_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric NOT NULL,
    reason text,
    scrap_type text DEFAULT 'material',
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_production_variances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    actual_total_cost numeric DEFAULT 0,
    standard_total_cost numeric DEFAULT 0,
    variance_amount numeric DEFAULT 0,
    variance_percentage numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    UNIQUE(production_order_id)
);

CREATE TABLE IF NOT EXISTS public.mfg_batch_serials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    serial_number text NOT NULL,
    status text DEFAULT 'in_stock',
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_serial_per_org ON public.mfg_batch_serials (serial_number, organization_id);

-- ================================================================
-- 1.8 مديول الجودة وطلبات الصرف
-- ==============================================

CREATE TABLE IF NOT EXISTS public.mfg_qc_inspections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    progress_id uuid REFERENCES public.mfg_order_progress(id) ON DELETE CASCADE,
    inspector_id uuid REFERENCES auth.users(id),
    status text CHECK (status IN ('pass', 'fail', 'rework')),
    defect_type text,
    notes text,
    created_at timestamptz DEFAULT now(),
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

CREATE TABLE IF NOT EXISTS public.mfg_material_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    production_order_id uuid REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    request_number text UNIQUE NOT NULL,
    request_date date DEFAULT now(),
    status text DEFAULT 'pending',
    requested_by uuid REFERENCES public.profiles(id),
    issued_by uuid REFERENCES public.profiles(id),
    issue_date timestamptz,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mfg_material_request_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    material_request_id uuid REFERENCES public.mfg_material_requests(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_requested numeric NOT NULL,
    quantity_issued numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.bill_of_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    quantity_required numeric NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.opening_inventories (
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
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    customer_id uuid REFERENCES public.customers(id),
    salesperson_id uuid, -- يمكن ربطه بجدول المستخدمين
    invoice_date date,
    due_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    paid_amount numeric(19,4) DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    status text, -- draft, posted, paid, partial
    notes text,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    cost_center_id uuid REFERENCES public.cost_centers(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    currency text DEFAULT 'EGP',
    exchange_rate numeric DEFAULT 1,
    approver_id uuid REFERENCES auth.users(id), -- عمود جديد
    reference text, -- عمود جديد
    deleted_at timestamptz,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT invoices_number_org_unique UNIQUE (organization_id, invoice_number)
);

-- 2. جداول المبيعات والمشتريات (Detailed Version)
-- تم استبدال الكتل المبسطة والمكررة بهذه النسخة السيادية الموحدة

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 0,
    unit_price numeric NOT NULL DEFAULT 0,
    total numeric(19,4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    discount numeric DEFAULT 0,
    tax_rate numeric DEFAULT 0,
    custom_fields jsonb,
    cost numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

-- ================================================================
-- 2. جداول العمليات الأساسية (Missing Core Tables)
-- ================================================================

-- المشتريات
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text,
    supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
    invoice_date date,
    due_date date,
    total_amount numeric,
    tax_amount numeric(19,4),
    subtotal numeric,
    status text DEFAULT 'draft',
    notes text,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
    currency text DEFAULT 'EGP',
    exchange_rate numeric(19,4) DEFAULT 1,
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now() NOT NULL,
    paid_amount numeric DEFAULT 0,
    delivery_fee numeric DEFAULT 0,
    order_type text DEFAULT 'DINE_IN',
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    CONSTRAINT purchase_invoices_number_org_unique UNIQUE (organization_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 0,
    unit_price numeric(19,4) NOT NULL DEFAULT 0,
    total numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

-- الخزينة والسندات
CREATE TABLE IF NOT EXISTS public.receipt_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    customer_id uuid REFERENCES public.customers(id),
    receipt_date date DEFAULT now(),
    amount numeric NOT NULL DEFAULT 0,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    payment_method text DEFAULT 'cash',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (organization_id, voucher_number)
);

CREATE TABLE IF NOT EXISTS public.payment_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    payment_date date DEFAULT now(),
    amount numeric NOT NULL DEFAULT 0,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    payment_method text DEFAULT 'cash',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (organization_id, voucher_number)
);

-- المطاعم ونقاط البيع
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    capacity integer DEFAULT 4,
    status text DEFAULT 'AVAILABLE',
    qr_access_key uuid DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    bill_requested boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.table_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id),
    start_time timestamptz DEFAULT now(),
    end_time timestamptz,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
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
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    user_id uuid REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 1,
    unit_price numeric NOT NULL DEFAULT 0,
    total_price numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
    unit_cost numeric DEFAULT 0,
    modifiers jsonb DEFAULT '[]'::jsonb,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- الموارد البشرية
CREATE TABLE IF NOT EXISTS public.employees (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name text NOT NULL,
    salary numeric DEFAULT 0,
    hire_date date,
    status text DEFAULT 'active',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
    status text DEFAULT 'NEW',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status_updated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- جداول الروابط والوردات (Missing in Master Setup)
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

CREATE TABLE IF NOT EXISTS public.employee_allowances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    name text NOT NULL,
    amount numeric NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.payroll_variables (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    month integer NOT NULL,
    year integer NOT NULL,
    type text CHECK (type IN ('addition', 'deduction')),
    amount numeric NOT NULL,
    is_processed boolean DEFAULT false,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- ================================================================
-- 3. جداول إضافية (مرفقات، إقفال، إشعارات)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.receipt_voucher_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_id uuid REFERENCES public.receipt_vouchers(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text, -- Changed to text for consistency
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payment_voucher_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_id uuid REFERENCES public.payment_vouchers(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric, -- Changed to numeric for consistency
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cheque_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cheque_id uuid REFERENCES public.cheques(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text, -- Changed to text for consistency
    file_size numeric,
    organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_closings (
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

CREATE TABLE IF NOT EXISTS public.rejected_cash_closings (
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

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    credit_note_number text,
    customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    original_invoice_number text, -- Changed to text for consistency
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.debit_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    debit_note_number text,
    supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
    note_date date,
    amount_before_tax numeric,
    tax_amount numeric,
    total_amount numeric,
    notes text,
    status text DEFAULT 'draft',
    original_invoice_number text, -- Changed to text for consistency
    organization_id uuid REFERENCES public.organizations(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL,
    description text,
    performed_by uuid REFERENCES auth.users(id),
    target_user_id uuid REFERENCES public.profiles(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    metadata jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.budgets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    year integer,
    month integer,
    items jsonb,
    name text,
    total_amount numeric, -- Changed to numeric for consistency
    organization_id uuid REFERENCES public.organizations(id),
    created_at timestamptz DEFAULT now()
);

-- (تم تنظيف كافة التكرارات والكتل المبسطة لضمان "المرجعية الواحدة" للبيانات)
-- (الملف الآن ينتهي بآخر تعريف سيادي للجداول قبل مرحلة الدوال والسياسات)

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read ON public.notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
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
  high_debt_threshold_percent INTEGER DEFAULT 90, -- Changed to INTEGER for consistency
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  organization_id UUID REFERENCES public.organizations(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.notification_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(50),
  organization_id UUID REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 📊 21. عرض انحراف المواد (BOM Variance View)
-- هذا العرض مطلوب للوحة التحكم الصناعية لمراقبة فروقات الاستهلاك
DROP VIEW IF EXISTS public.v_mfg_bom_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_bom_variance WITH (security_invoker = true) AS
SELECT 
    po.order_number,
    p.name as product_name,
    rm.name as material_name,
    SUM(amu.standard_quantity) as standard_quantity,
    SUM(amu.actual_quantity) as actual_quantity,
    SUM(amu.actual_quantity - amu.standard_quantity) as variance_qty,
    CASE 
        WHEN SUM(amu.standard_quantity) > 0 
        THEN ROUND((SUM(amu.actual_quantity - amu.standard_quantity) / SUM(amu.standard_quantity) * 100), 2)
        ELSE 0 
    END as variance_percentage,
    po.organization_id
FROM public.mfg_actual_material_usage amu
JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
JOIN public.mfg_production_orders po ON op.production_order_id = po.id
LEFT JOIN public.products p ON po.product_id = p.id -- Use LEFT JOIN for robustness
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id -- Use LEFT JOIN for robustness
GROUP BY po.id, po.order_number, p.name, rm.name, po.organization_id;
-- Ensure security_invoker is set for views
-- إضافة اسم بديل للتوافق (Compatibility Alias)
DROP VIEW IF EXISTS public.v_mfg_material_variance CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_material_variance WITH (security_invoker = true) AS 
SELECT * FROM public.v_mfg_bom_variance;

GRANT SELECT ON public.v_mfg_bom_variance TO authenticated;
GRANT SELECT ON public.v_mfg_material_variance TO authenticated;

-- 📊 22. عرض كفاءة مراكز العمل (Work Center Efficiency View)
DROP VIEW IF EXISTS public.v_mfg_work_center_efficiency CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_work_center_efficiency WITH (security_invoker = true) AS
SELECT 
    wc.id as work_center_id,
    wc.name as work_center_name,
    COUNT(op.id) as tasks_completed,
    SUM(rs.standard_time_minutes * op.produced_qty) as total_standard_minutes,
    GREATEST(SUM(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 60), 1) as total_actual_minutes,
    ROUND((SUM(rs.standard_time_minutes * op.produced_qty) / GREATEST(SUM(EXTRACT(EPOCH FROM (op.actual_end_time - op.actual_start_time)) / 60), 1) * 100), 2) as efficiency_percentage,
    wc.organization_id
FROM public.mfg_work_centers wc -- Use LEFT JOIN for robustness
LEFT JOIN public.mfg_routing_steps rs ON wc.id = rs.work_center_id
LEFT JOIN public.mfg_order_progress op ON rs.id = op.step_id
WHERE op.status = 'completed' OR op.status IS NULL -- Include NULL status for robustness
GROUP BY wc.id, wc.name, wc.organization_id;

-- 📊 27. رؤية تقييم WIP
DROP VIEW IF EXISTS public.v_mfg_wip_valuation CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_valuation WITH (security_invoker = true) AS
WITH request_costs AS (
    SELECT mr.production_order_id,
           SUM(mri.quantity_issued * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)) as total_request
    FROM public.mfg_material_request_items mri
    JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
    JOIN public.products p ON mri.raw_material_id = p.id
    WHERE mr.status = 'issued' AND mr.organization_id = public.get_my_org() -- Add organization_id filter
    GROUP BY mr.production_order_id
)
SELECT po.id AS production_order_id, po.order_number, p.name AS product_name, po.quantity_to_produce, po.status, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS total_labor_cost_incurred,
       (COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) + COALESCE(rc.total_request, 0)) AS total_material_cost_incurred,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) + COALESCE(rc.total_request, 0)) AS total_wip_value -- Ensure rc.total_request is included
FROM public.mfg_production_orders po
JOIN public.products p ON po.product_id = p.id
LEFT JOIN public.mfg_order_progress op ON po.id = op.production_order_id
LEFT JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id
LEFT JOIN request_costs rc ON po.id = rc.production_order_id
WHERE po.status = 'in_progress'
GROUP BY po.id, po.order_number, p.name, po.quantity_to_produce, po.status, po.organization_id, rc.total_request; -- Group by rc.total_request

-- 29. تقرير ملخص شهري WIP
DROP VIEW IF EXISTS public.v_mfg_wip_monthly_summary CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_wip_monthly_summary WITH (security_invoker = true) AS
SELECT to_char(po.created_at, 'YYYY-MM') AS month, p.name AS product_name, wc.name AS work_center_name, po.organization_id,
       COALESCE(SUM(op.labor_cost_actual), 0) AS monthly_labor_cost,
       COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0) AS monthly_material_cost,
       (COALESCE(SUM(op.labor_cost_actual), 0) + COALESCE(SUM(amu.actual_quantity * COALESCE(rm.weighted_average_cost, rm.cost, rm.purchase_price, 0)), 0)) AS total_monthly_wip_value
FROM public.mfg_production_orders po -- Use LEFT JOIN for robustness
LEFT JOIN public.products p ON po.product_id = p.id
LEFT JOIN public.mfg_order_progress op ON po.id = op.production_order_id
LEFT JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
LEFT JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
LEFT JOIN public.mfg_actual_material_usage amu ON op.id = amu.order_progress_id
LEFT JOIN public.products rm ON amu.raw_material_id = rm.id
WHERE po.status = 'in_progress' OR po.status IS NULL -- Include NULL status for robustness
GROUP BY 1, 2, 3, 4;

-- 📊 31. رؤية لوحة التحكم الصناعية (Manufacturing Dashboard View)
-- هذه الرؤية ضرورية لعمل لوحة القيادة وحساب نسبة الإنجاز وصلاحية الإغلاق
DROP VIEW IF EXISTS public.v_mfg_dashboard CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_dashboard WITH (security_invoker = true) AS
WITH progress_stats AS (
    SELECT 
        production_order_id,
        count(*) as total_steps,
        count(*) FILTER (WHERE status = 'completed') as completed_steps,
        count(*) FILTER (WHERE qc_verified = true) as qc_passed_steps,
        SUM(labor_cost_actual) as total_labor_cost
    FROM public.mfg_order_progress
    GROUP BY production_order_id
),
serial_stats AS (
    SELECT 
        production_order_id,
        count(*) as total_serials
    FROM public.mfg_batch_serials
    GROUP BY production_order_id
)
SELECT 
    po.id as order_id,
    po.order_number,
    po.batch_number,
    p.name as product_name,
    po.quantity_to_produce,
    po.status,
    po.start_date,
    po.end_date,
    po.created_at,
    ps.total_steps,
    (po.status = 'in_progress' AND COALESCE(ps.total_steps, 0) > 0 AND COALESCE(ps.completed_steps, 0) = COALESCE(ps.total_steps, 0)) as can_finalize, -- Handle NULLs
    ps.completed_steps,
    COALESCE(ps.qc_passed_steps, 0) as qc_passed_steps,
    CASE WHEN ps.total_steps > 0 THEN ROUND((ps.completed_steps::numeric / ps.total_steps::numeric) * 100, 2) ELSE 0 END as completion_percentage,
    COALESCE(ps.total_labor_cost, 0) as current_labor_cost,
    po.organization_id,
    pv.variance_amount,
    pv.variance_percentage,
    COALESCE(ss.total_serials, 0) as total_serials_generated,
    COALESCE(p.requires_serial, false) as requires_serial -- Handle NULL for requires_serial
FROM public.mfg_production_orders po -- Use LEFT JOIN for robustness
JOIN public.products p ON po.product_id = p.id
LEFT JOIN progress_stats ps ON po.id = ps.production_order_id
LEFT JOIN public.mfg_production_variances pv ON po.id = pv.production_order_id
LEFT JOIN serial_stats ss ON po.id = ss.production_order_id;

GRANT SELECT ON public.v_mfg_dashboard TO authenticated;

-- 1. إنشاء رؤية السيريالات المتاحة في المخازن
DROP VIEW IF EXISTS public.v_mfg_available_serials CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_available_serials WITH (security_invoker = true) AS
SELECT 
    bs.id,
    bs.serial_number,
    p.name as product_name,
    p.sku as product_code,
    po.order_number,
    po.batch_number,
    bs.created_at as production_date,
    bs.organization_id,
    bs.status as serial_status
FROM public.mfg_batch_serials bs -- Use LEFT JOIN for robustness
LEFT JOIN public.products p ON bs.product_id = p.id
LEFT JOIN public.mfg_production_orders po ON bs.production_order_id = po.id
WHERE bs.status = 'in_stock';

-- 2. رؤية التتبع الشاملة لكافة السيريالات وحالاتها (Traceability Master Table)
-- مخصصة للمحاسب لتتبع حركة كل قطعة من الإنتاج حتى البيع النهائي
DROP VIEW IF EXISTS public.v_mfg_serials_master_tracker CASCADE;
CREATE OR REPLACE VIEW public.v_mfg_serials_master_tracker WITH (security_invoker = true) AS
SELECT 
    bs.serial_number,
    p.name as product_name,
    p.sku as product_sku,
    po.order_number,
    po.batch_number,
    bs.status as serial_status,
    bs.created_at as production_date,
    bs.organization_id -- Use LEFT JOIN for robustness
FROM public.mfg_batch_serials bs 
JOIN public.products p ON bs.product_id = p.id
JOIN public.mfg_production_orders po ON bs.production_order_id = po.id;

GRANT SELECT ON public.v_mfg_serials_master_tracker TO authenticated;
GRANT SELECT ON public.v_mfg_available_serials TO authenticated;
-- ================================================================
-- 2.5 التقارير واللوحات البرمجية (Views)
-- ================================================================
DROP VIEW IF EXISTS public.monthly_sales_dashboard CASCADE;
CREATE OR REPLACE VIEW public.monthly_sales_dashboard WITH (security_invoker = true) AS
 SELECT 
    jl.id,
    je.transaction_date,
    (jl.credit - jl.debit) AS amount,
    CASE 
        WHEN a.code = '411' THEN 'Wholesale'
        WHEN a.code LIKE '4111%' OR a.code LIKE '4112%' THEN 'Restaurant'
        WHEN a.code LIKE '412%' THEN 'Returns'
        ELSE 'Other Revenue'
    END as sales_type,
    je.organization_id
 FROM public.journal_lines jl
 JOIN public.journal_entries je ON jl.journal_entry_id = je.id
 JOIN public.accounts a ON jl.account_id = a.id
 WHERE je.status = 'posted' AND (a.type ILIKE '%revenue%' OR a.code LIKE '4%');

-- ملاحظة: استخدام security_invoker يضمن أن الـ View يحترم سياسات RLS الخاصة بالجداول الأصلية

-- 🚀 ملف الماستر انتهى هيكلياً. الرصيد والدوال في deploy_all_functionss والسياسات في setup_rls.

-- ================================================================
-- 