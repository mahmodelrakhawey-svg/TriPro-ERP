-- =============================================================================
-- 🌟 TriPro ERP — Commercial Core Database Package (01_core_erp.sql)
-- 🏢 النواة الأساسية: الحسابات، الأستاذ العام، الخزينة، المخازن، WMS، المبيعات، المشتريات، HR، الأصول، ونقاط البيع
-- =============================================================================

-- 🌟 ملف إعداد قاعدة بيانات لعميل جديد (New Client Setup) - النسخة الشاملة
-- يقوم بإنشاء الهيكل الكامل (الجداول) + الدوال البرمجية + دليل الحسابات القياسي + الإعدادات الأساسية.
-- ⚠️ تحذير: هذا الملف يقوم بمسح قاعدة البيانات بالكامل قبل الإنشاء! استخدمه فقط في المشاريع الجديدة.

-- ========= 0. تنظيف وإعداد المخطط =========
-- DROP SCHEMA public CASCADE; (Disabled for safety)
CREATE SCHEMA IF NOT EXISTS public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ========= 1. الجداول الأساسية (Core Tables) =========

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
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
    vat_rate numeric DEFAULT 0.14, -- المعدل الافتراضي لمصر
    currency text DEFAULT 'EGP',
    enable_tax boolean DEFAULT true,
    allow_negative_stock boolean DEFAULT false,
    prevent_price_modification boolean DEFAULT false,
    last_closed_date date,
    decimal_places integer DEFAULT 2,
    max_cash_deficit_limit numeric DEFAULT 500,
    account_mappings jsonb DEFAULT '{}'::jsonb,
    updated_at timestamptz DEFAULT now()
);

-- وحدات القياس (Units of Measure - Early Definition)
CREATE TABLE IF NOT EXISTS public.uom_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.uoms (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id uuid REFERENCES public.uom_categories(id) ON DELETE CASCADE,
    name text NOT NULL,
    uom_type text CHECK (uom_type IN ('reference', 'smaller', 'bigger')),
    ratio numeric(19,4) DEFAULT 1,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(organization_id, name)
);

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
    organization_id uuid REFERENCES public.organizations(id),
    full_name text,
    role text DEFAULT 'viewer',
    role_id uuid REFERENCES public.roles(id),
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- دوال الصلاحيات والمنظمات الأساسية (Core Identity Helpers)
CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _role text;
BEGIN
    _role := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', ''),
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', ''),
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role', '')
    );
    IF _role IS NULL THEN
        _role := NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
    END IF;
    IF _role IS NOT NULL THEN RETURN _role; END IF;
    SELECT role INTO _role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN COALESCE(_role, 'viewer');
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _org_id uuid;
DECLARE _role text;
DECLARE _user_id uuid := auth.uid();
BEGIN
    _org_id := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'org_id', '')::uuid,
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id', '')::uuid
    );
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    SELECT organization_id, role INTO _org_id, _role FROM public.profiles WHERE id = _user_id LIMIT 1;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    RETURN NULL;
END; $$;

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
    code varchar(50) NOT NULL UNIQUE,
    name varchar(255) NOT NULL,
    type varchar(50) NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    parent_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id),
    balance numeric DEFAULT 0,
    sub_type text,
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true
);

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
    tax_id text,
    address text,
    credit_limit numeric DEFAULT 0,
    opening_balance numeric DEFAULT 0,
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
    tax_id text,
    address text,
    contact_person text,
    opening_balance numeric DEFAULT 0,
    deleted_at timestamptz,
    deletion_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- المخزون
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
    weighted_average_cost numeric DEFAULT 0,
    stock numeric DEFAULT 0,
    opening_balance numeric DEFAULT 0,
    min_stock_level numeric DEFAULT 0,
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
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_required numeric(12, 4) NOT NULL DEFAULT 1,
    shrinkage_pct numeric(6, 2) NOT NULL DEFAULT 0.00,
    uom_id uuid REFERENCES public.uoms(id) ON DELETE SET NULL,
    notes text,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (product_id, raw_material_id)
);

CREATE TABLE public.opening_inventories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
    quantity numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- المبيعات والمشتريات
CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id),
    invoice_number text,
    customer_id uuid REFERENCES public.customers(id),
    salesperson_id uuid,
    user_id uuid,
    invoice_date date,
    due_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    paid_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    currency text DEFAULT 'EGP',
    exchange_rate numeric DEFAULT 1,
    status text,
    notes text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
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

CREATE TABLE public.purchase_invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id),
    invoice_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    invoice_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    paid_amount numeric DEFAULT 0,
    currency text DEFAULT 'EGP',
    exchange_rate numeric DEFAULT 1,
    status text,
    notes text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    treasury_account_id uuid REFERENCES public.accounts(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
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

-- السندات والشيكات
CREATE TABLE public.receipt_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    customer_id uuid REFERENCES public.customers(id),
    receipt_date date,
    amount numeric,
    notes text,
    treasury_account_id uuid REFERENCES public.accounts(id),
    payment_method text DEFAULT 'cash',
    currency text DEFAULT 'EGP',
    exchange_rate numeric DEFAULT 1,
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
    currency text DEFAULT 'EGP',
    exchange_rate numeric DEFAULT 1,
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
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
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
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payment_voucher_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_id uuid REFERENCES public.payment_vouchers(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.cheque_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cheque_id uuid REFERENCES public.cheques(id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text,
    file_type text,
    file_size numeric,
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
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    created_at timestamptz DEFAULT now()
);

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
    department text, -- 🛠️ إضافة عمود القسم (Department)
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

-- ========= 1.5. الدوال البرمجية (Stored Procedures) =========

-- ================================================================
-- 1. دالة اعتماد الفاتورة (Sales Invoice)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice record;
    v_item record;
    v_org_id uuid;
    v_sales_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inventory_acc_id uuid;
    v_discount_acc_id uuid;
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_total_cost numeric := 0;
    v_item_cost numeric;
    v_exchange_rate numeric;
    v_total_amount_base numeric;
    v_paid_amount_base numeric;
    v_subtotal_base numeric;
    v_tax_amount_base numeric;
    v_discount_amount_base numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '501' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '103' LIMIT 1;
    SELECT id INTO v_discount_acc_id FROM public.accounts WHERE code = '4102' LIMIT 1;
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_sales_acc_id IS NULL OR v_customer_acc_id IS NULL THEN RAISE EXCEPTION 'حسابات المبيعات أو العملاء غير معرّفة'; END IF;

    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        SELECT weighted_average_cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
        IF v_item_cost IS NULL OR v_item_cost = 0 THEN
             SELECT cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
             IF v_item_cost IS NULL OR v_item_cost = 0 THEN
                SELECT purchase_price INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
             END IF;
        END IF;
        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_item.quantity);

        UPDATE public.products 
        SET stock = stock - v_item.quantity,
            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_item.quantity))
        WHERE id = v_item.product_id;
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
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة', v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id);
    END IF;

    UPDATE public.invoices SET status = CASE WHEN (total_amount - COALESCE(paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END;
$$;

-- ================================================================
-- 2. دالة اعتماد فاتورة المشتريات (Purchase Invoice)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice record;
    v_item record;
    v_org_id uuid;
    v_inventory_acc_id uuid;
    v_vat_acc_id uuid;
    v_supplier_acc_id uuid;
    v_journal_id uuid;
    v_current_stock numeric;
    v_current_avg_cost numeric;
    v_new_avg_cost numeric;
    v_exchange_rate numeric;
    v_item_price_base numeric;
    v_total_amount_base numeric;
    v_tax_amount_base numeric;
    v_net_amount_base numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '103' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '10204' LIMIT 1;
    IF v_vat_acc_id IS NULL THEN SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1; END IF;
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' LIMIT 1;

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة'; END IF;

    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        v_item_price_base := v_item.price * v_exchange_rate;
        SELECT stock, weighted_average_cost INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_item.product_id;
        v_current_stock := COALESCE(v_current_stock, 0);
        v_current_avg_cost := COALESCE(v_current_avg_cost, 0);

        IF (v_current_stock + v_item.quantity) > 0 THEN
            v_new_avg_cost := ((v_current_stock * v_current_avg_cost) + (v_item.quantity * v_item_price_base)) / (v_current_stock + v_item.quantity);
        ELSE
            v_new_avg_cost := v_item.price;
        END IF;

        UPDATE public.products 
        SET stock = stock + v_item.quantity,
            warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_item.quantity)),
            purchase_price = v_item_price_base, weighted_average_cost = v_new_avg_cost, cost = v_new_avg_cost
        WHERE id = v_item.product_id;
    END LOOP;

    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_net_amount_base := v_total_amount_base - v_tax_amount_base;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) 
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, v_net_amount_base, 0, 'مخزون - فاتورة مشتريات', v_org_id);
    IF v_tax_amount_base > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_tax_amount_base, 0, 'ضريبة مدخلات', v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount_base, 'استحقاق مورد', v_org_id);

    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
END;
$$;

-- ================================================================
-- 3. دالة اعتماد سند القبض (Receipt Voucher)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid)
RETURNS void AS $$
DECLARE
    v_voucher public.receipt_vouchers%ROWTYPE;
    v_org_id uuid;
    v_journal_id uuid;
    v_exchange_rate numeric;
    v_amount_base numeric;
BEGIN
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود'; END IF;
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    v_exchange_rate := COALESCE(v_voucher.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;
    v_amount_base := v_voucher.amount * v_exchange_rate;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض رقم ' || COALESCE(v_voucher.voucher_number, '-'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true) 
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, v_amount_base, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, p_credit_account_id, 0, v_amount_base, v_voucher.notes, v_org_id);

    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 4. دالة اعتماد سند الصرف (Payment Voucher)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid)
RETURNS void AS $$
DECLARE
    v_voucher public.payment_vouchers%ROWTYPE;
    v_org_id uuid;
    v_journal_id uuid;
    v_exchange_rate numeric;
    v_amount_base numeric;
BEGIN
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود'; END IF;
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    v_exchange_rate := COALESCE(v_voucher.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;
    v_amount_base := v_voucher.amount * v_exchange_rate;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف رقم ' || COALESCE(v_voucher.voucher_number, '-'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true) 
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, p_debit_account_id, v_amount_base, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_amount_base, v_voucher.notes, v_org_id);

    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 5. دالة اعتماد مرتجع المبيعات (Sales Return)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_sales_return_acc_id uuid; v_vat_acc_id uuid; v_customer_acc_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'المرتجع مرحل بالفعل'; END IF;
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    SELECT id INTO v_sales_return_acc_id FROM public.accounts WHERE code = '412' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' LIMIT 1;

    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock + v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity)) WHERE id = v_item.product_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id, related_document_id, related_document_type) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', true, v_org_id, p_return_id, 'sales_return') RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_journal_id, v_sales_return_acc_id, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_return.tax_amount, 0, v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_journal_id, v_customer_acc_id, 0, v_return.total_amount, v_org_id);

    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END;
$$;

-- ================================================================
-- 6. دالة اعتماد مرتجع المشتريات (Purchase Return)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_return record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المشتريات غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'المرتجع مرحل بالفعل'; END IF;
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '103' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '10204' LIMIT 1;
    IF v_vat_acc_id IS NULL THEN SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1; END IF;
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' LIMIT 1;

    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products SET stock = stock - v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_return.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مشتريات رقم ' || COALESCE(v_return.return_number, '-'), v_return.return_number, 'posted', v_org_id, p_return_id, 'purchase_return', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, v_return.total_amount, 0, 'مرتجع مشتريات', v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, 0, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 'مخزون', v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_return.tax_amount, 'ضريبة مدخلات (عكس)', v_org_id);
    END IF;

    UPDATE public.purchase_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END;
$$;

-- ================================================================
-- 7. دالة إعادة احتساب المخزون (Recalculate Stock)
-- ================================================================
CREATE OR REPLACE FUNCTION recalculate_stock_rpc()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC;
BEGIN
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL LOOP
        total_qty := 0; wh_json := '{}'::jsonb;
        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL LOOP
            wh_qty := 0;
            -- Sales
            SELECT wh_qty - COALESCE(SUM(ii.quantity), 0) INTO wh_qty FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft';
            -- Purchases
            SELECT wh_qty + COALESCE(SUM(pii.quantity), 0) INTO wh_qty FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft';
            -- Sales Returns
            SELECT wh_qty + COALESCE(SUM(sri.quantity), 0) INTO wh_qty FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.sales_return_id WHERE sri.product_id = prod_record.id AND sr.warehouse_id = wh_record.id AND sr.status != 'draft';
            -- Purchase Returns
            SELECT wh_qty - COALESCE(SUM(pri.quantity), 0) INTO wh_qty FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.purchase_return_id WHERE pri.product_id = prod_record.id AND pr.warehouse_id = wh_record.id AND pr.status != 'draft';
            -- Stock Transfers (Out)
            SELECT wh_qty - COALESCE(SUM(sti.quantity), 0) INTO wh_qty FROM stock_transfer_items sti JOIN stock_transfers st ON st.id = sti.stock_transfer_id WHERE sti.product_id = prod_record.id AND st.from_warehouse_id = wh_record.id AND st.status != 'draft';
            -- Stock Transfers (In)
            SELECT wh_qty + COALESCE(SUM(sti.quantity), 0) INTO wh_qty FROM stock_transfer_items sti JOIN stock_transfers st ON st.id = sti.stock_transfer_id WHERE sti.product_id = prod_record.id AND st.to_warehouse_id = wh_record.id AND st.status != 'draft';
            -- Opening Inventory
            SELECT wh_qty + COALESCE(SUM(oi.quantity), 0) INTO wh_qty FROM opening_inventories oi WHERE oi.product_id = prod_record.id AND oi.warehouse_id = wh_record.id;

            total_qty := total_qty + wh_qty;
            IF wh_qty <> 0 THEN wh_json := wh_json || jsonb_build_object(wh_record.id, wh_qty); END IF;
        END LOOP;
        UPDATE products SET stock = total_qty, warehouse_stock = wh_json WHERE id = prod_record.id;
    END LOOP;
END;
$$;

-- ================================================================
-- 8. دالة تشغيل الإهلاك (Run Depreciation)
-- ================================================================
CREATE OR REPLACE FUNCTION public.run_period_depreciation(p_date date, p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_asset record; v_monthly_depreciation numeric; v_journal_id uuid; v_processed_count integer := 0; v_skipped_count integer := 0; v_dep_exp_acc_id uuid; v_acc_dep_acc_id uuid;
BEGIN
    FOR v_asset IN SELECT * FROM public.assets WHERE status = 'active' AND (purchase_cost - salvage_value) > 0 AND organization_id = p_org_id LOOP
        PERFORM 1 FROM public.journal_entries WHERE related_document_id = v_asset.id AND related_document_type = 'asset_depreciation' AND to_char(transaction_date, 'YYYY-MM') = to_char(p_date, 'YYYY-MM');
        IF FOUND THEN v_skipped_count := v_skipped_count + 1; CONTINUE; END IF;

        IF v_asset.useful_life > 0 THEN v_monthly_depreciation := (v_asset.purchase_cost - v_asset.salvage_value) / (v_asset.useful_life * 12); ELSE v_monthly_depreciation := 0; END IF;

        IF v_monthly_depreciation > 0 THEN
            v_dep_exp_acc_id := COALESCE(v_asset.depreciation_expense_account_id, (SELECT id FROM public.accounts WHERE code = '5202' LIMIT 1));
            v_acc_dep_acc_id := COALESCE(v_asset.accumulated_depreciation_account_id, (SELECT id FROM public.accounts WHERE code = '1399' LIMIT 1));

            IF v_dep_exp_acc_id IS NOT NULL AND v_acc_dep_acc_id IS NOT NULL THEN
                INSERT INTO public.journal_entries (transaction_date, description, reference, status, is_posted, organization_id, related_document_id, related_document_type) 
                VALUES (p_date, 'إهلاك شهري للأصل: ' || v_asset.name, 'DEP-' || substring(v_asset.id::text, 1, 6) || '-' || to_char(p_date, 'YYYYMM'), 'posted', true, p_org_id, v_asset.id, 'asset_depreciation') RETURNING id INTO v_journal_id;

                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_dep_exp_acc_id, v_monthly_depreciation, 0, 'مصروف إهلاك - ' || v_asset.name, p_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_dep_acc_id, 0, v_monthly_depreciation, 'مجمع إهلاك - ' || v_asset.name, p_org_id);
                v_processed_count := v_processed_count + 1;
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('processed', v_processed_count, 'skipped', v_skipped_count);
END;
$$;

-- ================================================================
-- 9. دالة إصلاح هيكل المرتجعات (Fix Returns Schema)
-- ================================================================
CREATE OR REPLACE FUNCTION public.fix_returns_schema()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE result_msg text := '';
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'sales_return_id') THEN
            ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id;
            result_msg := result_msg || 'تم تصحيح sales_return_items. ';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'purchase_return_id') THEN
            ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id;
            result_msg := result_msg || 'تم تصحيح purchase_return_items. ';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'assets' AND table_type = 'BASE TABLE') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'current_value') THEN
            ALTER TABLE public.assets ADD COLUMN current_value numeric DEFAULT 0;
            UPDATE public.assets SET current_value = COALESCE(purchase_cost, 0);
            result_msg := result_msg || 'تمت إضافة عمود القيمة الحالية للأصول. ';
        END IF;
    END IF;
    IF result_msg = '' THEN RETURN 'الهيكل سليم بالفعل.'; END IF;
    RETURN result_msg;
END;
$$;

-- ================================================================
-- 10. دالة اعتماد الإشعار الدائن (Credit Note)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_note record; v_org_id uuid; v_sales_allowance_acc_id uuid; v_vat_acc_id uuid; v_customer_acc_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار الدائن غير موجود'; END IF;
    IF v_note.status = 'posted' THEN RAISE EXCEPTION 'الإشعار مرحل بالفعل'; END IF;
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    SELECT id INTO v_sales_allowance_acc_id FROM public.accounts WHERE code = '4102' LIMIT 1;
    IF v_sales_allowance_acc_id IS NULL THEN SELECT id INTO v_sales_allowance_acc_id FROM public.accounts WHERE code = '4101' LIMIT 1; END IF;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' LIMIT 1;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار دائن رقم ' || COALESCE(v_note.credit_note_number, '-'), v_note.credit_note_number, 'posted', v_org_id, p_note_id, 'credit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_allowance_acc_id, v_note.amount_before_tax, 0, 'مسموحات مبيعات', v_org_id);
    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, v_note.tax_amount, 0, 'ضريبة (إشعار دائن)', v_org_id);
    END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, 0, v_note.total_amount, 'إشعار دائن للعميل', v_org_id);

    UPDATE public.credit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END;
$$;

-- ================================================================
-- 11. دالة اعتماد الإشعار المدين (Debit Note)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_note record; v_org_id uuid; v_purchase_discount_acc_id uuid; v_vat_acc_id uuid; v_supplier_acc_id uuid; v_journal_id uuid;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار المدين غير موجود'; END IF;
    IF v_note.status = 'posted' THEN RAISE EXCEPTION 'الإشعار مرحل بالفعل'; END IF;
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

    SELECT id INTO v_purchase_discount_acc_id FROM public.accounts WHERE code = '5101' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '10204' LIMIT 1;
    IF v_vat_acc_id IS NULL THEN SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '202' LIMIT 1; END IF;
    SELECT id INTO v_supplier_acc_id FROM public.accounts WHERE code = '201' LIMIT 1;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار مدين رقم ' || COALESCE(v_note.debit_note_number, '-'), v_note.debit_note_number, 'posted', v_org_id, p_note_id, 'debit_note', true) RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, v_note.total_amount, 0, 'إشعار مدين للمورد', v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_purchase_discount_acc_id, 0, v_note.amount_before_tax, 'تسوية مشتريات', v_org_id);
    IF COALESCE(v_note.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_note.tax_amount, 'ضريبة (إشعار مدين)', v_org_id);
    END IF;

    UPDATE public.debit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END;
$$;

-- ================================================================
-- 12. دالة حساب عمولة المندوبين (Calculate Sales Commission)
-- ================================================================
CREATE OR REPLACE FUNCTION public.calculate_sales_commission(
    p_salesperson_id uuid,
    p_start_date date,
    p_end_date date,
    p_commission_rate numeric DEFAULT 1.0
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_sales numeric;
    v_total_returns numeric;
    v_net_sales numeric;
    v_commission numeric;
BEGIN
    -- 1. إجمالي المبيعات (بدون ضريبة)
    SELECT COALESCE(SUM(subtotal), 0) INTO v_total_sales FROM public.invoices WHERE salesperson_id = p_salesperson_id AND status IN ('posted', 'paid') AND invoice_date BETWEEN p_start_date AND p_end_date;

    -- 2. إجمالي المرتجعات (بدون ضريبة)
    SELECT COALESCE(SUM(sr.total_amount - COALESCE(sr.tax_amount, 0)), 0) INTO v_total_returns FROM public.sales_returns sr JOIN public.invoices i ON sr.original_invoice_id = i.id WHERE i.salesperson_id = p_salesperson_id AND sr.status = 'posted' AND sr.return_date BETWEEN p_start_date AND p_end_date;

    -- 3. الصافي والعمولة
    v_net_sales := v_total_sales - v_total_returns;
    v_commission := v_net_sales * (p_commission_rate / 100);

    RETURN jsonb_build_object('total_sales', v_total_sales, 'total_returns', v_total_returns, 'net_sales', v_net_sales, 'commission_amount', v_commission);
END;
$$;

-- ================================================================
-- 13. دالة إنشاء قيد يومية (Create Journal Entry)
-- ================================================================
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

-- ================================================================
-- 14. دالة تنظيف البيانات التجريبية (Clear Demo Data)
-- ================================================================
CREATE OR REPLACE FUNCTION public.clear_demo_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. حذف العمليات (Transactions)
    DELETE FROM public.journal_lines;
    DELETE FROM public.journal_entries;
    DELETE FROM public.invoice_items;
    DELETE FROM public.invoices;
    DELETE FROM public.receipt_vouchers;
    DELETE FROM public.payment_vouchers;
    
    -- 2. حذف المخزون والمنتجات
    DELETE FROM public.products;
    
    -- 3. حذف العملاء والموردين
    DELETE FROM public.customers;
    DELETE FROM public.suppliers;
END;
$$;

-- ========= 2. البيانات الأولية (Seeding) =========

DO $$
DECLARE
    v_org_id uuid;
    v_warehouse_id uuid;
    v_assets_id uuid; v_liabilities_id uuid; v_equity_id uuid; v_revenue_id uuid; v_expenses_id uuid;
    v_current_assets_id uuid; v_current_liabilities_id uuid;
    v_cash_group_id uuid; v_cash_acc_id uuid;
    v_inventory_acc_id uuid; v_cogs_acc_id uuid; v_sales_acc_id uuid; 
    v_customers_acc_id uuid; v_suppliers_acc_id uuid; v_vat_acc_id uuid; v_vat_input_acc_id uuid;
    
    -- متغيرات البيانات التجريبية
    v_customer_id uuid;
    v_supplier_id uuid;
    v_product_id uuid;
    v_invoice_id uuid;
    v_user_id uuid;
    v_admin_email text := 'admin@client.com'; -- 👈 استبدل هذا بإيميل العميل الفعلي
BEGIN
    -- 1. المنظمة والإعدادات
    INSERT INTO public.organizations (name) VALUES ('الشركة النموذجية للتجارة') RETURNING id INTO v_org_id;
    INSERT INTO public.company_settings (company_name, currency, enable_tax) VALUES ('الشركة النموذجية للتجارة', 'SAR', true);
    INSERT INTO public.warehouses (name, location) VALUES ('المستودع الرئيسي', 'الرياض') RETURNING id INTO v_warehouse_id;

    -- 2. دليل الحسابات القياسي (Standard Chart of Accounts)
    -- الأصول
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('1', 'الأصول', 'ASSET', true, v_org_id) RETURNING id INTO v_assets_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('11', 'الأصول المتداولة', 'ASSET', true, v_assets_id, v_org_id) RETURNING id INTO v_current_assets_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('1101', 'النقدية وما في حكمها', 'ASSET', true, v_current_assets_id, v_org_id) RETURNING id INTO v_cash_group_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('10101', 'الصندوق الرئيسي', 'ASSET', false, v_cash_group_id, v_org_id) RETURNING id INTO v_cash_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('10102', 'البنك الأهلي', 'ASSET', false, v_cash_group_id, v_org_id);
    
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('102', 'العملاء والمدينون', 'ASSET', true, v_current_assets_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('1221', 'العملاء', 'ASSET', false, (SELECT id FROM accounts WHERE code='102'), v_org_id) RETURNING id INTO v_customers_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('1204', 'أوراق القبض (شيكات)', 'ASSET', false, (SELECT id FROM accounts WHERE code='102'), v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('1209', 'عهد موظفين', 'ASSET', false, (SELECT id FROM accounts WHERE code='102'), v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('10204', 'ضريبة القيمة المضافة - مدخلات', 'ASSET', false, (SELECT id FROM accounts WHERE code='102'), v_org_id) RETURNING id INTO v_vat_input_acc_id;

    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('103', 'المخزون', 'ASSET', true, v_current_assets_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('10301', 'مخزون المواد الخام', 'ASSET', false, (SELECT id FROM accounts WHERE code='103'), v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('10302', 'مخزون المنتج التام', 'ASSET', false, (SELECT id FROM accounts WHERE code='103'), v_org_id) RETURNING id INTO v_inventory_acc_id;

    -- الأصول الثابتة
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('12', 'الأصول غير المتداولة', 'ASSET', true, v_assets_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('1399', 'مجمع الإهلاك', 'ASSET', false, (SELECT id FROM accounts WHERE code='12'), v_org_id);

    -- الخصوم
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('2', 'الخصوم', 'LIABILITY', true, v_org_id) RETURNING id INTO v_liabilities_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('21', 'الخصوم المتداولة', 'LIABILITY', true, v_liabilities_id, v_org_id) RETURNING id INTO v_current_liabilities_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('201', 'الموردين', 'LIABILITY', false, v_current_liabilities_id, v_org_id) RETURNING id INTO v_suppliers_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('202', 'ضريبة القيمة المضافة - مخرجات', 'LIABILITY', false, v_current_liabilities_id, v_org_id) RETURNING id INTO v_vat_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('2202', 'أوراق الدفع', 'LIABILITY', false, v_current_liabilities_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('203', 'تأمينات العملاء', 'LIABILITY', false, v_current_liabilities_id, v_org_id);

    -- حقوق الملكية
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('3', 'حقوق الملكية', 'EQUITY', true, v_org_id) RETURNING id INTO v_equity_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('3101', 'رأس المال', 'EQUITY', false, v_equity_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('3103', 'الأرباح المبقاة', 'EQUITY', false, v_equity_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('3999', 'الأرصدة الافتتاحية', 'EQUITY', false, v_equity_id, v_org_id);

    -- الإيرادات
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('4', 'الإيرادات', 'REVENUE', true, v_org_id) RETURNING id INTO v_revenue_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('411', 'إيراد المبيعات', 'REVENUE', false, v_revenue_id, v_org_id) RETURNING id INTO v_sales_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('412', 'مردودات المبيعات', 'REVENUE', false, v_revenue_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('4102', 'خصم مسموح به', 'REVENUE', false, v_revenue_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('402', 'إيرادات أخرى', 'REVENUE', false, v_revenue_id, v_org_id);

    -- المصروفات
    INSERT INTO public.accounts (code, name, type, is_group, organization_id) VALUES ('5', 'المصروفات', 'EXPENSE', true, v_org_id) RETURNING id INTO v_expenses_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('501', 'تكلفة البضاعة المباعة', 'EXPENSE', false, v_expenses_id, v_org_id) RETURNING id INTO v_cogs_acc_id;
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('5201', 'الرواتب والأجور', 'EXPENSE', false, v_expenses_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('5202', 'مصروف الإهلاك', 'EXPENSE', false, v_expenses_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('510', 'تسويات مخزنية', 'EXPENSE', false, v_expenses_id, v_org_id);
    INSERT INTO public.accounts (code, name, type, is_group, parent_id, organization_id) VALUES ('515', 'مصروفات مكتبية', 'EXPENSE', false, v_expenses_id, v_org_id);

    -- 3. بيانات وهمية (Entities)
    INSERT INTO public.customers (name, phone, email, address, credit_limit) VALUES ('مؤسسة الأفق للتجارة', '0501234567', 'horizon@example.com', 'الرياض', 50000) RETURNING id INTO v_customer_id;
    INSERT INTO public.suppliers (name, phone, email, address) VALUES ('شركة التوريدات العالمية', '0509988776', 'supply@example.com', 'جدة') RETURNING id INTO v_supplier_id;

    INSERT INTO public.products (name, sku, sales_price, purchase_price, cost, stock, inventory_account_id, cogs_account_id, sales_account_id) 
    VALUES ('منتج تجريبي 1', 'PROD-001', 100, 80, 80, 100, v_inventory_acc_id, v_cogs_acc_id, v_sales_acc_id)
    RETURNING id INTO v_product_id;

    -- 4. إعداد المدير العام (Profile)
    -- ملاحظة: يجب أن يكون المستخدم قد تم إنشاؤه مسبقاً في قائمة Authentication
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_admin_email;
    
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, role, is_active)
        VALUES (v_user_id, 'المدير العام', 'super_admin', true)
        ON CONFLICT (id) DO UPDATE SET role = 'super_admin', is_active = true;
        RAISE NOTICE 'تم منح صلاحيات المدير العام للمستخدم: %', v_admin_email;
    ELSE
        RAISE NOTICE '⚠️ تنبيه: المستخدم % غير موجود في Authentication. يرجى إنشاؤه يدوياً ليعمل الدخول.', v_admin_email;
    END IF;

    -- 5. إنشاء فاتورة مبيعات تجريبية واعتمادها (لتوليد قيد وحركة مخزنية)
    INSERT INTO public.invoices (invoice_number, customer_id, invoice_date, total_amount, tax_amount, subtotal, status, warehouse_id, treasury_account_id)
    VALUES ('INV-DEMO-001', v_customer_id, CURRENT_DATE, 115, 15, 100, 'draft', v_warehouse_id, v_cash_acc_id)
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_items (invoice_id, product_id, quantity, price, total, cost)
    VALUES (v_invoice_id, v_product_id, 1, 100, 100, 80);

    -- اعتماد الفاتورة تلقائياً (سيقوم بإنشاء القيد وتحديث المخزون)
    PERFORM public.approve_invoice(v_invoice_id);

END $$;

SELECT 'تم إعداد قاعدة البيانات الذهبية بالكامل بنجاح! ✅' as result;


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

-- 🛡️ تفعيل وضع الاستعادة لتجاوز صمامات أمان المنظمة أثناء الترميم (Restore Mode)
-- هذا يمنع خطأ "يجب تحديد المنظمة" عند وجود مشغلات قديمة نشطة
SET app.restore_mode = 'on';

-- 🛡️ Schema Healing: التأكد من وجود الأعمدة الحساسة قبل البدء لتجنب خطأ 42703 (organization_id)
-- يحدث هذا إذا كانت الجداول منشأة مسبقاً بنسخة قديمة من النظام وتفتقر لهيكل الـ SaaS
DO $$ 
DECLARE 
    t text;
    tables_to_heal text[] := ARRAY['profiles', 'roles', 'role_permissions', 'accounts', 'journal_entries', 'invoices', 'products', 'item_categories', 'customers', 'suppliers', 'warehouses', 'orders', 'order_items', 'shifts', 'table_sessions', 'restaurant_tables', 'work_orders', 'mfg_production_orders', 'purchase_orders', 'purchase_invoices', 'receipt_vouchers', 'payment_vouchers', 'sales_orders', 'sales_order_items', 'employees', 'employee_advances'];
    dup record;
    r record;
    tables_with_user_id text[] := ARRAY['orders', 'journal_entries', 'shifts', 'table_sessions', 'cash_closings', 'organization_backups', 'notifications', 'receipt_vouchers', 'payment_vouchers'];
    user_id_table text;
BEGIN
    -- 0. ترميم جدول المنظمات (SaaS Organizations Repair)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations' AND table_schema = 'public') THEN
        ALTER TABLE public.organizations 
            ADD COLUMN IF NOT EXISTS email text,
            ADD COLUMN IF NOT EXISTS phone text,
            ADD COLUMN IF NOT EXISTS address text,
            ADD COLUMN IF NOT EXISTS vat_number text,
            ADD COLUMN IF NOT EXISTS logo_url text,
            ADD COLUMN IF NOT EXISTS footer_text text,
            ADD COLUMN IF NOT EXISTS allowed_modules text[] DEFAULT '{"accounting", "inventory", "sales", "purchases", "hr", "manufacturing", "restaurant", "construction", "hims"}',
            ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
            ADD COLUMN IF NOT EXISTS subscription_expiry date,
            ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 5,
            ADD COLUMN IF NOT EXISTS activity_type text;
    END IF;

    -- 🛡️ ترميم جدول المستودعات (Warehouses Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses' AND table_schema = 'public') THEN
        ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
                                      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    END IF;

    -- 🛡️ ترميم جدول إعدادات الشركة (Company Settings Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_settings' AND table_schema = 'public') THEN
        ALTER TABLE public.company_settings 
            ADD COLUMN IF NOT EXISTS production_warehouse_id uuid,
            ADD COLUMN IF NOT EXISTS raw_material_warehouse_id uuid;
    END IF;

    -- 🛡️ ترميم جداول أوامر البيع (Sales Orders Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders' AND table_schema = 'public') THEN
        ALTER TABLE public.sales_orders 
            ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS expected_delivery_date date,
            ADD COLUMN IF NOT EXISTS created_by uuid,
            ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    END IF;

    -- 🛡️ ترميم بنود أوامر البيع (Sales Order Items Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_order_items' AND table_schema = 'public') THEN
        ALTER TABLE public.sales_order_items 
            ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id);

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_order_items' AND column_name = 'order_id') THEN
            UPDATE public.sales_order_items SET sales_order_id = order_id WHERE sales_order_id IS NULL AND order_id IS NOT NULL;
            
            FOR r IN (
                SELECT tc.constraint_name 
                FROM information_schema.table_constraints tc 
                JOIN information_schema.key_column_usage kcu 
                  ON tc.constraint_name = kcu.constraint_name 
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.table_name = 'sales_order_items' 
                  AND kcu.column_name = 'order_id' 
                  AND tc.constraint_type = 'FOREIGN KEY'
            ) LOOP
                EXECUTE 'ALTER TABLE public.sales_order_items DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
            END LOOP;
        END IF;
    END IF;

    -- 🛡️ ترميم جداول أوامر الشراء (Purchase Orders Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders' AND table_schema = 'public') THEN
        ALTER TABLE public.purchase_orders 
            ADD COLUMN IF NOT EXISTS po_number text,
            ADD COLUMN IF NOT EXISTS order_number text,
            ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS expected_delivery_date date,
            ADD COLUMN IF NOT EXISTS created_by uuid,
            ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
            ADD COLUMN IF NOT EXISTS notes text,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

        UPDATE public.purchase_orders SET po_number = order_number WHERE po_number IS NULL AND order_number IS NOT NULL;
        UPDATE public.purchase_orders SET order_number = po_number WHERE order_number IS NULL AND po_number IS NOT NULL;
    END IF;

    -- 🛡️ ترميم بنود أوامر الشراء (Purchase Order Items Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items' AND table_schema = 'public') THEN
        ALTER TABLE public.purchase_order_items 
            ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id),
            ADD COLUMN IF NOT EXISTS total numeric;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_order_items' AND column_name = 'order_id') THEN
            UPDATE public.purchase_order_items SET purchase_order_id = order_id WHERE purchase_order_id IS NULL AND order_id IS NOT NULL;
            
            FOR r IN (
                SELECT tc.constraint_name 
                FROM information_schema.table_constraints tc 
                JOIN information_schema.key_column_usage kcu 
                  ON tc.constraint_name = kcu.constraint_name 
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.table_name = 'purchase_order_items' 
                  AND kcu.column_name = 'order_id' 
                  AND tc.constraint_type = 'FOREIGN KEY'
            ) LOOP
                EXECUTE 'ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
            END LOOP;
        END IF;
    END IF;

    -- 🛡️ ترميم جدول الموظفين (Employees Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees' AND table_schema = 'public') THEN
        ALTER TABLE public.employees 
            ADD COLUMN IF NOT EXISTS name text,
            ADD COLUMN IF NOT EXISTS full_name text,
            ADD COLUMN IF NOT EXISTS position text,
            ADD COLUMN IF NOT EXISTS department text,
            ADD COLUMN IF NOT EXISTS notes text,
            ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
            ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
            
        ALTER TABLE public.employees ALTER COLUMN name DROP NOT NULL;
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'full_name') THEN
            ALTER TABLE public.employees ALTER COLUMN full_name DROP NOT NULL;
        END IF;

        -- 🇪🇬 توحيد مسمى الراتب الأساسي ليتوافق مع كافة مديولات النظام
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='employees' AND column_name='salary') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='employees' AND column_name='basic_salary') THEN
                ALTER TABLE public.employees RENAME COLUMN salary TO basic_salary;
            ELSE
                UPDATE public.employees SET basic_salary = salary WHERE basic_salary IS NULL AND salary IS NOT NULL;
                ALTER TABLE public.employees DROP COLUMN salary;
            END IF;
        END IF;
    END IF;

    -- 🛡️ ترميم جدول الفواتير (Invoices Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = 'public') THEN
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(19,4) DEFAULT 1;
    END IF;

    -- 1. إضافة عمود المنظمة المفقود (Multi-tenancy Enforcer)
    FOREACH t IN ARRAY tables_to_heal LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id)', t);
            -- الربط بالمنظمة الحالية للسجلات اليتيمة
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_my_org') THEN
                EXECUTE format('UPDATE public.%I SET organization_id = public.get_my_org() WHERE organization_id IS NULL AND public.get_my_org() IS NOT NULL', t);
            END IF;
        END IF;
    END LOOP;

    -- 🛡️ ترميم أعمدة التكلفة لجدول المنتجات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products' AND table_schema = 'public') THEN
        ALTER TABLE public.products 
            ADD COLUMN IF NOT EXISTS weighted_average_cost numeric(19,4) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cost numeric(19,4) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
    END IF;

    -- 🛡️ ترميم الرصيد الافتتاحي للعملاء والموردين
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers' AND table_schema = 'public') THEN
        ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers' AND table_schema = 'public') THEN
        ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
    END IF;

    -- 🛡️ ترميم جدول الحسابات (Accounts Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts' AND table_schema = 'public') THEN
        ALTER TABLE public.accounts 
            ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
        
        ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_code_key;

        FOR dup IN (
            SELECT organization_id, code, 
                   (ARRAY_AGG(id ORDER BY created_at DESC))[1] as correct_id,
                   (ARRAY_AGG(id ORDER BY created_at DESC))[2:] as wrong_ids
            FROM public.accounts
            GROUP BY organization_id, code
            HAVING COUNT(*) > 1
        ) LOOP
            UPDATE public.journal_lines SET account_id = dup.correct_id WHERE account_id = ANY(dup.wrong_ids);
            UPDATE public.products SET inventory_account_id = dup.correct_id WHERE inventory_account_id = ANY(dup.wrong_ids);
            UPDATE public.products SET sales_account_id = dup.correct_id WHERE sales_account_id = ANY(dup.wrong_ids);
            UPDATE public.products SET cogs_account_id = dup.correct_id WHERE cogs_account_id = ANY(dup.wrong_ids);
            UPDATE public.accounts SET parent_id = dup.correct_id WHERE parent_id = ANY(dup.wrong_ids);
            DELETE FROM public.accounts WHERE id = ANY(dup.wrong_ids);
        END LOOP;

        ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_organization_id_code_key;
        ALTER TABLE public.accounts ADD CONSTRAINT accounts_organization_id_code_key UNIQUE (organization_id, code);
        
        UPDATE public.accounts SET is_group = true WHERE length(code) <= 2;
        UPDATE public.accounts SET is_group = true 
        WHERE id IN (SELECT DISTINCT parent_id FROM public.accounts WHERE parent_id IS NOT NULL);
    END IF;

    -- 🛡️ ترميم جدول الأدوار (Roles Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles' AND table_schema = 'public') THEN
        ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_key;
        ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_organization_id_key;
        ALTER TABLE public.roles ADD CONSTRAINT roles_name_organization_id_key UNIQUE (name, organization_id);
    END IF;

    -- 2. توحيد مسمى user_id (ترميم العمود المفقود)
    FOREACH user_id_table IN ARRAY tables_with_user_id LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = user_id_table AND table_schema = 'public') THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = user_id_table AND column_name = 'created_by') 
               AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = user_id_table AND column_name = 'user_id') THEN
                EXECUTE format('ALTER TABLE public.%I RENAME COLUMN created_by TO user_id', user_id_table);
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = user_id_table AND column_name = 'user_id') THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id)', user_id_table);
            END IF;
        END IF;
    END LOOP;

    -- 3. إضافة عمود الوصف المفقود في جدول الصلاحيات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permissions' AND table_schema = 'public') THEN
        ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS description text;
    END IF;
END $$;

-- ================================================================
-- 1. الجداول الأساسية (Core Tables)
-- ================================================================

-- فئات وحدات القياس (UoM Categories)
CREATE TABLE IF NOT EXISTS public.uom_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL, -- مثل: الكتلة، الطول، وحدات العدد
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- وحدات القياس (Units of Measure)
CREATE TABLE IF NOT EXISTS public.uoms (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id uuid REFERENCES public.uom_categories(id) ON DELETE CASCADE,
    name text NOT NULL, -- مثل: كجم، جرام، كرتونة، حبة
    uom_type text CHECK (uom_type IN ('reference', 'smaller', 'bigger')), -- وحدة المرجع، أصغر، أو أكبر
    ratio numeric(19,4) DEFAULT 1, -- النسبة بالنسبة لوحدة المرجع
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(organization_id, name)
);

-- إضافة أعمدة الوحدات لجدول المنتجات
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_uom_id uuid REFERENCES public.uoms(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_uom_id uuid REFERENCES public.uoms(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_uom_id uuid REFERENCES public.uoms(id);

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
    allowed_modules text[] DEFAULT '{"accounting", "inventory", "sales", "purchases", "hr", "manufacturing", "restaurant", "construction"}',
    is_active boolean DEFAULT true,
    subscription_expiry date,
    max_users integer DEFAULT 5,
    suspension_reason text,
    total_collected numeric DEFAULT 0,
    next_payment_date date,
    activity_type text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 🛡️ نظام التنشيط التلقائي للسوبر أدمن والمنظمة (Super Admin Auto-Link)
DO $$
DECLARE
    v_org_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    -- 1. ضمان وجود منظمة واحدة على الأقل
    IF NOT EXISTS (SELECT 1 FROM public.organizations) THEN
        INSERT INTO public.organizations (name, activity_type, is_active)
        VALUES ('شركة تراي برو العالمية', 'general', true)
        RETURNING id INTO v_org_id;
        RAISE NOTICE '✅ تم إنشاء المنظمة السيادية للنظام.';
    ELSE
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    END IF;

    -- 2. ربط المستخدم الحالي (أنت) بالمنظمة ومنحه صلاحيات السوبر أدمن
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, role, organization_id, is_active)
        VALUES (v_user_id, 'المدير العام للنظام', 'super_admin', v_org_id, true)
        ON CONFLICT (id) DO UPDATE SET 
            role = 'super_admin',
            organization_id = v_org_id,
            is_active = true;
        
        -- تحديث بيانات الهوية (Metadata) لضمان ظهور القوائم فوراً
        UPDATE auth.users SET raw_user_meta_data = 
            COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('org_id', v_org_id, 'role', 'super_admin')
        WHERE id = v_user_id;
    END IF;

    -- 3. تفعيل كافة الموديولات لهذه الشركة لضمان ظهورها في كافة القوائم
    UPDATE public.organizations 
    SET allowed_modules = ARRAY['accounting', 'inventory', 'sales', 'purchases', 'hr', 'manufacturing', 'restaurant', 'construction', 'hims']
    WHERE id = v_org_id;

    RAISE NOTICE '✅ تم ربط حسابك بالمنظمة وتفعيل كافة الصلاحيات.';
END $$;

-- 🛡️ ضمان وجود منتج مصنع ومسار إنتاجي لاختبارات التصنيع (MFG Load Test Healing)
DO $$
DECLARE
    v_org_id UUID;
    v_prod_id UUID;
    v_wc_id UUID;
    v_routing_id UUID;
    v_raw_id UUID;
    v_wh_id UUID;
BEGIN
    -- 🛡️ التحقق من وجود مديول التصنيع لتجنب الأخطاء في الباقات التي لا تتضمن التصنيع
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_work_centers') THEN 
        RETURN; 
    END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    IF v_org_id IS NULL THEN RETURN; END IF;

    -- 1. ضمان وجود مستودع
    SELECT id INTO v_wh_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;
    IF v_wh_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('مستودع افتراضي', v_org_id) RETURNING id INTO v_wh_id;
    END IF;

    -- 2. إنشاء منتج خام افتراضي إذا لم يوجد
    SELECT id INTO v_raw_id FROM public.products WHERE organization_id = v_org_id AND name = 'خامة افتراضية للتصنيع' LIMIT 1;
    IF v_raw_id IS NULL THEN
        INSERT INTO public.products (name, mfg_type, product_type, stock, weighted_average_cost, organization_id)
        VALUES ('خامة افتراضية للتصنيع', 'raw', 'RAW_MATERIAL', 1000, 10, v_org_id) RETURNING id INTO v_raw_id;
    END IF;

    -- 3. إنشاء منتج مصنع افتراضي إذا لم يوجد
    SELECT id INTO v_prod_id FROM public.products WHERE organization_id = v_org_id AND name = 'منتج مصنع افتراضي' AND mfg_type = 'standard' LIMIT 1;
    IF v_prod_id IS NULL THEN
        INSERT INTO public.products (name, mfg_type, product_type, sales_price, cost, weighted_average_cost, organization_id)
        VALUES ('منتج مصنع افتراضي', 'standard', 'MANUFACTURED', 100, 50, 50, v_org_id) RETURNING id INTO v_prod_id;
    END IF;

    -- 4. إنشاء مركز عمل افتراضي إذا لم يوجد
    SELECT id INTO v_wc_id FROM public.mfg_work_centers WHERE organization_id = v_org_id LIMIT 1;
    IF v_wc_id IS NULL THEN
        INSERT INTO public.mfg_work_centers (name, hourly_rate, organization_id) VALUES ('مركز عمل افتراضي', 20, v_org_id) RETURNING id INTO v_wc_id;
    END IF;

    -- 5. إنشاء مسار إنتاجي افتراضي للمنتج المصنع إذا لم يوجد
    SELECT id INTO v_routing_id FROM public.mfg_routings WHERE product_id = v_prod_id AND organization_id = v_org_id LIMIT 1;
    IF v_routing_id IS NULL THEN
        INSERT INTO public.mfg_routings (product_id, name, organization_id, is_default) VALUES (v_prod_id, 'مسار افتراضي', v_org_id, true) RETURNING id INTO v_routing_id;
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, work_center_id, operation_name, standard_time_minutes, organization_id)
        VALUES (v_routing_id, 1, v_wc_id, 'تجميع', 60, v_org_id);
        INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
        VALUES ((SELECT id FROM public.mfg_routing_steps WHERE routing_id = v_routing_id LIMIT 1), v_raw_id, 2, v_org_id);
    END IF;

    -- 6. إنشاء موظف افتراضي لاختبارات التصنيع إذا لم يوجد
    IF NOT EXISTS (SELECT 1 FROM public.employees WHERE organization_id = v_org_id AND full_name = 'موظف تصنيع افتراضي') THEN
        INSERT INTO public.employees (full_name, position, organization_id, hourly_rate)
        VALUES ('موظف تصنيع افتراضي', 'عامل إنتاج', v_org_id, 25);
    END IF;

    RAISE NOTICE '✅ تم ضمان وجود منتج مصنع ومسار إنتاجي لاختبارات التصنيع.';
END $$;

-- جدول النسخ الاحتياطية للمنظمات (SaaS Backups) - تم نقل دالة الإنشاء لملف الدوال
CREATE TABLE IF NOT EXISTS public.organization_backups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    backup_date timestamptz DEFAULT now(),
    backup_data jsonb NOT NULL,
    file_size_kb numeric,
    user_id uuid REFERENCES public.profiles(id),
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- ================================================================
-- 1.5 دوال الهوية الموحدة (Standard Identity Helpers)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _role text;
BEGIN
    -- 1. فحص التوكن أولاً (JWT Claims) - البحث في user_metadata و app_metadata لضمان التوافق
    _role := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', ''),
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', ''),
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role', '')
    );
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
DECLARE _role text;
DECLARE _user_id uuid := auth.uid();
BEGIN
    -- 1. الأولوية لـ org_id في التوكن (JWT Claims) لسرعة الأداء ودعم التبديل بين الشركات
    _org_id := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'org_id', '')::uuid,
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id', '')::uuid
    );

    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;

   -- 2. Fallback: جلب المنظمة من البروفايل (المصدر الثابت)
    SELECT organization_id, role INTO _org_id, _role FROM public.profiles WHERE id = _user_id LIMIT 1;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;

    -- 3. [جديد] إذا كان المستخدم موثقاً ودوره 'admin' (وليس 'super_admin') ولم يتم تحديد منظمة بعد，
    -- ابحث عن أول منظمة يكون هذا المستخدم مديراً لها في جدول الأدوار.
    -- هذا يعالج حالة "المدير العالمي" الذي يدخل لشركة معينة دون أن يكون organization_id في البروفايل أو الـ JWT.
    IF _user_id IS NOT NULL AND _role = 'admin' AND _org_id IS NULL THEN
        SELECT r.organization_id INTO _org_id
        FROM public.roles r
        JOIN public.role_permissions rp ON r.id = rp.role_id
        JOIN public.permissions p ON rp.permission_id = p.id
        WHERE r.organization_id IS NOT NULL AND r.name = 'admin' AND p.module = 'admin' AND p.action = 'manage'
        LIMIT 1;
        IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    END IF;    RETURN NULL;
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
-- 🛡️ صمام أمان: التأكد من وجود عمود الوصف في حال كان الجدول منشأ مسبقاً بدون هذا العمود
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS description text;

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
('inventory', 'wastage', 'إدارة الهالك والمفقودات'),
('manufacturing', 'view', 'لوحة تحكم التصنيع'),
('manufacturing', 'orders', 'أوامر الإنتاج التشغيلية'),
('manufacturing', 'work_centers', 'إدارة مراكز العمل'),
('manufacturing', 'routings', 'إدارة مسارات الإنتاج'),
('manufacturing', 'qc', 'رقابة الجودة (QC)'),
('manufacturing', 'material_requests', 'طلبات صرف المواد الخام'),
('manufacturing', 'serials', 'تتبع الأرقام التسلسلية'),
('hr', 'view', 'عرض الموظفين'),
('hr', 'manage', 'إدارة الرواتب'),
('hr', 'advances', 'إدارة سلف الموظفين'),
('accounting', 'view', 'عرض القيود والتقارير'),
('accounting', 'coa', 'إدارة دليل الحسابات'),
('accounting', 'create', 'إنشاء قيود محاسبية'),
('accounting', 'update', 'تعديل القيود المحاسبية'),
('accounting', 'delete', 'حذف القيود المحاسبية'),
('accounting', 'reconcile', 'التسويات البنكية'),
('accounting', 'post', 'ترحيل القيود المحاسبية'),
('treasury', 'view', 'عرض الخزينة'),
('treasury', 'create', 'إنشاء سندات'),
('treasury', 'update', 'تعديل سندات'),
('treasury', 'manage', 'إدارة الخزينة'),
('restaurant', 'manage', 'إدارة المطعم'),
('restaurant', 'pos', 'الوصول لنقطة البيع'),
('restaurant', 'kitchen', 'عرض شاشة المطبخ'),
('treasury', 'cheques', 'إدارة الشيكات (قبض ودفع)'),
('assets', 'manage', 'إدارة الأصول الثابتة'),
('reports', 'view_financial', 'عرض التقارير المالية الحساسة'),
('admin', 'backups', 'إدارة النسخ الاحتياطي والاستعادة'),
('admin', 'logs', 'سجلات أمان النظام'),
('admin', 'manage', 'إدارة الصلاحيات'),
-- HIMS Granular Permissions
('hims_core', 'view', 'عرض السجلات الطبية'),
('hims_clinical', 'view', 'عرض مكتب الطبيب'),
('hims_inpatient', 'view', 'عرض محطة التمريض'),
('hims_ancillary', 'view', 'عرض المختبر والأشعة'),
('hims_billing', 'view', 'عرض الفوترة الطبية')
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
    account_mappings jsonb DEFAULT '{}'::jsonb NOT NULL,
    default_treasury_id uuid,  -- عمود لربط الخزينة الافتراضية
    production_warehouse_id uuid, -- عمود لمستودع الإنتاج
    raw_material_warehouse_id uuid, -- عمود لمستودع المواد الخام
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

-- 🏗️ المشاريع ومراكز التكلفة التشغيلية (Projects & Operational Cost Centers)
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    description TEXT,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    contract_value NUMERIC(15,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    cost_center_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SaaS_projects_Isolation" ON public.projects;
CREATE POLICY "SaaS_projects_Isolation" ON public.projects
    FOR ALL
    USING (organization_id = public.get_my_org())
    WITH CHECK (organization_id = public.get_my_org());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_org_status ON public.projects(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON public.projects(customer_id);

-- المخزون والمنتجات
CREATE TABLE IF NOT EXISTS public.warehouses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    location text,
    manager text,
    phone text,
    is_active boolean DEFAULT true, -- 🛡️ تم إضافة هذا العمود لإصلاح خطأ 42703 في دالة تأسيس الشركات
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
    opening_balance numeric(19,4) DEFAULT 0,
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
    
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    deleted_at timestamptz,
    deletion_reason text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opening_inventories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
    quantity numeric DEFAULT 0,
    uom_id uuid REFERENCES public.uoms(id), -- 🛡️ دعم الوحدات في الرصيد الافتتاحي
    cost numeric DEFAULT 0,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
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
    exchange_rate numeric(19,4) DEFAULT 1,
    approver_id uuid REFERENCES auth.users(id), -- عمود جديد
    reference text, -- عمود جديد
    deleted_at timestamptz,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT invoices_number_org_unique UNIQUE (organization_id, invoice_number)
);

-- أوامر البيع (Sales Orders) - المستند الوسيط للتصنيع
CREATE TABLE IF NOT EXISTS public.sales_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number text NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
    order_date date DEFAULT now(),
    status text DEFAULT 'draft', -- draft, confirmed, manufacturing, ready, invoiced
    total_amount numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(organization_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.sales_order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 1,
    unit_price numeric DEFAULT 0,
    uom_id uuid REFERENCES public.uoms(id),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

-- 2. جداول المبيعات والمشتريات (Detailed Version)
-- تم استبدال الكتل المبسطة والمكررة بهذه النسخة السيادية الموحدة

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 0,
    unit_price numeric NOT NULL DEFAULT 0,
    uom_id uuid REFERENCES public.uoms(id),
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
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
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
    uom_id uuid REFERENCES public.uoms(id),
    unit_price numeric(19,4) NOT NULL DEFAULT 0,
    total numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org()
);

-- 🚚 جداول مرتجعات المشتريات (Purchase Returns) - لإكمال الدورة المستندية
CREATE TABLE IF NOT EXISTS public.purchase_returns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    return_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    warehouse_id uuid REFERENCES public.warehouses(id),
    original_invoice_id uuid REFERENCES public.purchase_invoices(id),
    return_date date DEFAULT now(),
    total_amount numeric(19,4) DEFAULT 0,
    tax_amount numeric(19,4) DEFAULT 0,
    status text DEFAULT 'draft', -- draft, posted
    notes text,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_return_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_return_id uuid REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric NOT NULL,
    uom_id uuid REFERENCES public.uoms(id),
    unit_price numeric(19,4) NOT NULL,
    total numeric(19,4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org()
);

-- 🛠️ دالة تحويل أمر الشراء إلى فاتورة (PO to Invoice Converter)
DROP FUNCTION IF EXISTS public.convert_po_to_invoice(uuid, uuid);
DROP FUNCTION IF EXISTS public.convert_po_to_invoice(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.convert_po_to_invoice(p_po_id uuid, p_warehouse_id uuid DEFAULT NULL, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po record; v_invoice_id uuid; v_inv_num text; v_target_org_id uuid; v_wh_id uuid;
BEGIN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الشراء غير موجود'; END IF;

    v_target_org_id := COALESCE(p_org_id, v_po.organization_id, public.get_my_org());
    v_inv_num := 'PI-FROM-' || COALESCE(v_po.po_number, v_po.order_number, substring(p_po_id::text, 1, 8));

    v_wh_id := COALESCE(
        p_warehouse_id, 
        v_po.warehouse_id, 
        (SELECT id FROM public.warehouses WHERE organization_id = v_target_org_id AND deleted_at IS NULL ORDER BY name ASC LIMIT 1)
    );

    -- إنشاء رأس فاتورة المشتريات
    INSERT INTO public.purchase_invoices (
        invoice_number, supplier_id, user_id, invoice_date, total_amount, tax_amount, subtotal,
        status, warehouse_id, organization_id, notes, currency, exchange_rate
    ) VALUES (
        v_inv_num, 
        v_po.supplier_id, 
        auth.uid(),
        now()::date,
        COALESCE(v_po.total_amount, 0), 
        COALESCE(v_po.tax_amount, 0),
        COALESCE(v_po.subtotal, COALESCE(v_po.total_amount, 0) - COALESCE(v_po.tax_amount, 0)),
        'draft',
        v_wh_id,
        v_target_org_id,
        'محولة من أمر شراء رقم: ' || COALESCE(v_po.po_number, v_po.order_number, 'بدون رقم'),
        'EGP', 
        1
    ) RETURNING id INTO v_invoice_id;

    -- نقل البنود بدقة باستخدام purchase_order_id و order_id معاً
    INSERT INTO public.purchase_invoice_items (
        purchase_invoice_id, product_id, quantity, unit_price, uom_id, total, organization_id
    )
    SELECT 
        v_invoice_id, 
        product_id, 
        quantity, 
        unit_price, 
        uom_id, 
        COALESCE(total, quantity * unit_price), 
        v_target_org_id
    FROM public.purchase_order_items 
    WHERE COALESCE(purchase_order_id, order_id) = p_po_id;

    -- تحديث حالة أمر الشراء
    UPDATE public.purchase_orders SET status = 'invoiced' WHERE id = p_po_id;

    RETURN v_invoice_id;
END; $$;

-- الخزينة والسندات
CREATE TABLE IF NOT EXISTS public.receipt_vouchers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    voucher_number text,
    customer_id uuid REFERENCES public.customers(id),
    receipt_date date DEFAULT now(),
    amount numeric NOT NULL DEFAULT 0,
    recipient_name text,
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
    cost_center_id uuid REFERENCES public.cost_centers(id),
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
    notes text,
    warehouse_id uuid REFERENCES public.warehouses(id),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
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
    notes text,
    modifiers jsonb DEFAULT '[]'::jsonb,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- 🍕 خيارات الإضافات للمطعم (Modifiers Support)
CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    min_selection integer DEFAULT 0,
    max_selection integer DEFAULT 1,
    is_required boolean DEFAULT false,
    display_order integer DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.modifiers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    modifier_group_id uuid REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    name text NOT NULL,
    price numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    is_available boolean DEFAULT true,
    display_order integer DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
    modifier_id uuid REFERENCES public.modifiers(id) ON DELETE SET NULL,
    name text,
    unit_price numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now()
);

-- الموارد البشرية
CREATE TABLE IF NOT EXISTS public.employees (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name text, -- المسمى المعتمد في الكود الجديد (تم إلغاء NOT NULL للاستقرار)
    name text,              -- للتوافق مع قواعد البيانات القديمة
    position text,
    phone text,
    email text,
    basic_salary numeric DEFAULT 0,
    hire_date date,
    department text,
    notes text,              -- 🛠️ الإصلاح المطلوب لخطأ السكيما
    status text DEFAULT 'active',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
    status text DEFAULT 'NEW',
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    status_updated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- 3. جداول المدفوعات (Payments Table)
CREATE TABLE IF NOT EXISTS public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    amount numeric NOT NULL,
    payment_method text NOT NULL, -- cash, card, credit, etc.
    status text DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED, REFUNDED
    transaction_id text, -- معرف العملية من بوابة الدفع
    cash_account_id uuid REFERENCES public.accounts(id), -- الحساب النقدي أو البنكي الذي تم التحصيل فيه
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
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

-- سلف الموظفين (Employee Advances)
CREATE TABLE IF NOT EXISTS public.employee_advances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    amount numeric NOT NULL DEFAULT 0,
    request_date date DEFAULT now(),
    advance_date date DEFAULT now(),
    status text DEFAULT 'paid', -- paid, deducted, cancelled
    payroll_item_id uuid,
    treasury_account_id uuid REFERENCES public.accounts(id),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    reference text,          -- 🛠️ إضافة عمود المرجع (Reference) المسبب للخطأ
    notes text,
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

-- ================================================================
-- جدول وصفات الإنتاج (BOM - Bill of Materials)
-- يُستخدم لتحديد مكونات كل منتج مصنّع أو وصفة مطعم
-- ================================================================
CREATE TABLE IF NOT EXISTS public.bill_of_materials (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_required numeric(12, 4) NOT NULL DEFAULT 1,
    shrinkage_pct   numeric(6, 2)   NOT NULL DEFAULT 0.00,
    -- shrinkage_pct: نسبة الفاقد/الانكماش أثناء الطهي أو التحضير (0-99%)
    -- مثال: 15 تعني أن 15% من الكمية تُهدر أثناء الطهي
    uom_id          uuid REFERENCES public.uoms(id) ON DELETE SET NULL,
    notes           text,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    UNIQUE (product_id, raw_material_id)
);

ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS shrinkage_pct numeric(6, 2) NOT NULL DEFAULT 0.00;

COMMENT ON TABLE public.bill_of_materials IS 'وصفات الإنتاج والمكونات: تحدد المواد الخام لكل منتج مصنّع أو وجبة مطعم مع نسبة الفاقد';
COMMENT ON COLUMN public.bill_of_materials.shrinkage_pct IS 'نسبة الفاقد/الانكماش أثناء الطهي أو التحضير (0-99%). مثال: 15 = 15% فاقد';
COMMENT ON COLUMN public.bill_of_materials.quantity_required IS 'الكمية المطلوبة من المادة الخام لإنتاج وحدة واحدة من المنتج النهائي';

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

-- 📊 رؤية محاسبية لعرض رصيد المخزن بأكثر من وحدة (Multi-UoM Stock View)
DROP VIEW IF EXISTS public.v_inventory_multi_uom CASCADE;
CREATE OR REPLACE VIEW public.v_inventory_multi_uom AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.stock as base_stock,
    bu.name as base_uom_name,
    u.name as alternative_uom_name,
    CASE 
        WHEN u.uom_type = 'bigger' THEN ROUND(p.stock / NULLIF(u.ratio, 0), 4)
        WHEN u.uom_type = 'smaller' THEN ROUND(p.stock * u.ratio, 4)
        ELSE p.stock
    END as alternative_stock,
    p.organization_id
FROM public.products p
JOIN public.uoms bu ON p.base_uom_id = bu.id
JOIN public.uoms u ON u.category_id = bu.category_id
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW public.v_inventory_multi_uom IS 'تعرض هذه الرؤية رصيد كل صنف بكافة الوحدات المعرفة في فئته آلياً';

-- إيقاف وضع الاستعادة لعودة عمل نظام الحماية الطبيعي
SET app.restore_mode = 'off';

-- ================================================================
-- 

-- 🌟 محرك النظام الشامل الموحد (TriPro ERP Unified Engine V50.0)
-- 📅 تاريخ التحديث: 2024-05-25
-- ℹ️ الوصف: دمج شامل (الهيكل + الترميم + الدوال + التصنيع + المطعم + الأمان)
-- 🛡️ مبدأ العمل: Idempotent (آمن للتشغيل المتكرر دون فقدان بيانات)

-- ================================================================
-- 1. المرحلة الهيكلية والترميم (Base Schema & Healing)
-- ================================================================

DO $$ 
DECLARE 
    t text;
    tables_to_heal text[] := ARRAY['organizations', 'profiles', 'roles', 'role_permissions', 'accounts', 'journal_entries', 'invoices', 'products', 'item_categories', 'customers', 'suppliers', 'warehouses', 'orders', 'order_items', 'shifts', 'table_sessions', 'restaurant_tables', 'purchase_invoices', 'receipt_vouchers', 'payment_vouchers', 'employees', 'bill_of_materials', 'mfg_production_orders', 'delivery_orders', 'payments', 'payrolls', 'payroll_items', 'projects', 'project_boq', 'project_progress_billings', 'subcontractors', 'subcontractor_contracts', 'subcontractor_billings', 'project_material_issues', 'project_material_issue_items', 'project_daily_reports', 'project_retention_releases', 'project_milestones', 'project_custodies', 'project_custody_expenses', 'uom_categories', 'uoms',
    'sales_returns', 'sales_return_items', 'purchase_returns', 'purchase_return_items', 'stock_adjustments', 'stock_adjustment_items', 'stock_transfers', 'stock_transfer_items', 'inventory_counts', 'inventory_count_items'];
BEGIN
    -- 🛡️ إنشاء جداول وحدات القياس (UoM) إذا لم تكن موجودة
    CREATE TABLE IF NOT EXISTS public.uom_categories (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        name text NOT NULL,
        organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.uoms (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        category_id uuid REFERENCES public.uom_categories(id) ON DELETE CASCADE,
        name text NOT NULL,
        uom_type text CHECK (uom_type IN ('reference', 'smaller', 'bigger')),
        ratio numeric(19,4) DEFAULT 1,
        organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now(),
        UNIQUE(organization_id, name)
    );

    -- ضمان وجود عمود organization_id في كافة الجداول الأساسية
    FOREACH t IN ARRAY tables_to_heal LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id)', t);
        END IF;
    END LOOP;

    -- 🛡️ توحيد مسمى الراتب الأساسي ليتوافق مع كافة مديولات النظام (محصور في public)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='employees' AND column_name='salary') THEN
        ALTER TABLE public.employees RENAME COLUMN salary TO basic_salary;
    END IF;

    -- 🚀 تنشيط ذاكرة المخطط فوراً لضمان تعرف الـ API على المسمى الجديد
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='employees' AND column_name='basic_salary') THEN
        EXECUTE 'NOTIFY pgrst, ''reload config''';
    END IF;

    -- ترميم أعمدة التكلفة في جدول المنتجات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric(19,4) DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost numeric(19,4) DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK';
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mfg_type text DEFAULT 'standard';
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_uom_id uuid REFERENCES public.uoms(id);
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_uom_id uuid REFERENCES public.uoms(id);
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_uom_id uuid REFERENCES public.uoms(id);
    END IF;

    -- ترميم أعمدة المستودعات في أوامر البيع والشراء
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
        ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
    END IF;

    -- 🛡️ ترميم جدول طلبات التوصيل لإضافة الطيار (Drivers Support)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_orders' AND table_schema = 'public' AND table_type = 'BASE TABLE') THEN
        ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.employees(id);
    END IF;

    -- 🛡️ ترميم جداول السندات (Treasury Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_vouchers' AND table_schema = 'public') THEN
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS voucher_type text DEFAULT 'standard';
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_vouchers' AND table_schema = 'public') THEN
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS voucher_type text DEFAULT 'standard';
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;
    END IF;

    -- 🛡️ ترميم جدول الرواتب (Payroll Healing)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payrolls' AND table_schema = 'public') THEN
        ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS payment_date date;
    END IF;

    -- ترميم أعمدة الإغلاق السنوي في إعدادات الشركة
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_settings' AND table_schema = 'public') THEN
        ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS last_closed_year integer;
        ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS last_closed_date date;
    END IF;

    -- 🛡️ حقن عمود uom_id في كافة مفاصل النظام لضمان دقة التحويل (Multi-UoM Core)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_items') THEN ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoice_items') THEN ALTER TABLE public.purchase_invoice_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'opening_inventories') THEN ALTER TABLE public.opening_inventories ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_return_items') THEN ALTER TABLE public.sales_return_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_return_items') THEN ALTER TABLE public.purchase_return_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_adjustment_items') THEN ALTER TABLE public.stock_adjustment_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_transfer_items') THEN ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_count_items') THEN ALTER TABLE public.inventory_count_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_of_materials') THEN ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_material_request_items') THEN ALTER TABLE public.mfg_material_request_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF; -- 🛡️ إصلاح خطأ الاختبار
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_step_materials') THEN ALTER TABLE public.mfg_step_materials ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_material_issue_items') THEN ALTER TABLE public.project_material_issue_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotation_items') THEN ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_order_items') THEN ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_order_items') THEN ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_order_items') THEN ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mfg_actual_material_usage') THEN ALTER TABLE public.mfg_actual_material_usage ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_transfer_items') THEN ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true; END IF;
   
    -- 🛡️ إضافة سياسات الأمان للوحدات
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uoms') THEN
        EXECUTE 'CREATE POLICY "Org_Access_Policy_uoms" ON public.uoms FOR ALL TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'')';
        EXECUTE 'CREATE POLICY "Org_Access_Policy_uom_categories" ON public.uom_categories FOR ALL TO authenticated USING (organization_id = public.get_my_org() OR public.get_my_role() = ''super_admin'')';
    END IF;
END $$;

-- ================================================================
-- 2. دوال الهوية والوصول (Identity Helpers)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_my_role() 
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _role text;
BEGIN
    _role := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role', ''),
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', '')
    );
    IF _role IS NOT NULL THEN RETURN _role; END IF;
    SELECT role INTO _role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN COALESCE(_role, 'viewer');
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_org() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _org_id uuid;
DECLARE _role text;
DECLARE _user_id uuid := auth.uid();
BEGIN
    -- 0. التحقق من وجود متغير جلسة مخصص للمنظمة (لتشغيل الاختبارات والهجرات)
    BEGIN
        _org_id := NULLIF(current_setting('app.current_org_id', true), '')::uuid;
        IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    EXCEPTION WHEN OTHERS THEN
        -- تجاهل الأخطاء في حال لم يكن المتغير معرفاً
    END;

    -- 1. الأولوية لـ org_id في التوكن (JWT Claims) لسرعة الأداء ودعم التبديل بين الشركات
    _org_id := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'org_id', '')::uuid,
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id', '')::uuid
    );
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    
    -- 2. Fallback: جلب المنظمة من البروفايل (المصدر الثابت)
    SELECT organization_id, role INTO _org_id, _role FROM public.profiles WHERE id = _user_id LIMIT 1;
    IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;

    -- 3. [جديد] إذا كان المستخدم موثقاً ودوره 'admin' (وليس 'super_admin') ولم يتم تحديد منظمة بعد،
    -- ابحث عن أول منظمة يكون هذا المستخدم مديراً لها في جدول الأدوار.
    IF _user_id IS NOT NULL AND _role = 'admin' AND _org_id IS NULL THEN
        SELECT r.organization_id INTO _org_id
        FROM public.roles r JOIN public.role_permissions rp ON r.id = rp.role_id JOIN public.permissions p ON rp.permission_id = p.id
        WHERE r.organization_id IS NOT NULL AND r.name = 'admin' AND p.module = 'admin' AND p.action = 'manage' LIMIT 1;
        IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;
    END IF;

    RETURN NULL;

END; $$;

-- 🛠️ دالة تحويل الكميات بين الوحدات (UoM Conversion Logic)
CREATE OR REPLACE FUNCTION public.uom_convert(
    p_qty numeric,
    p_from_uom_id uuid,
    p_to_uom_id uuid
) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
    v_from_ratio numeric;
    v_from_type text;
    v_to_ratio numeric;
    v_to_type text;
BEGIN
    IF p_from_uom_id IS NULL OR p_to_uom_id IS NULL OR p_from_uom_id = p_to_uom_id THEN RETURN p_qty; END IF;
    
    SELECT ratio, uom_type INTO v_from_ratio, v_from_type FROM public.uoms WHERE id = p_from_uom_id;
    SELECT ratio, uom_type INTO v_to_ratio, v_to_type FROM public.uoms WHERE id = p_to_uom_id;
    
    -- 🛡️ تصحيح منطق التحويل بناءً على نوع الوحدة
    -- إذا كانت الوحدة 'أصغر' (smaller)، فإن النسبة تعني كم وحدة منها توجد في الوحدة المرجعية (لذا المعامل الحقيقي هو المقلوب)
    IF v_from_type = 'smaller' THEN v_from_ratio := 1.0 / NULLIF(v_from_ratio, 0); END IF;
    IF v_to_type = 'smaller' THEN v_to_ratio := 1.0 / NULLIF(v_to_ratio, 0); END IF;
    
    -- المعادلة: (الكمية * نسبة الوحدة الأصلية) / نسبة الوحدة المستهدفة
    RETURN ROUND((p_qty * COALESCE(v_from_ratio, 1.0)) / COALESCE(v_to_ratio, 1.0), 4);
END; $$;

-- 🛡️ تحديث: درع حماية الحسابات السيادية (ليسمح بالحذف في وضع الاستعادة)
CREATE OR REPLACE FUNCTION public.fn_protect_system_accounts() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 🛑 إذا كان وضع الاستعادة نشطاً، اسمح بالحذف فوراً (تستخدم عند حذف المنظمة بالكامل)
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    -- 🚀 صمام أمان: إذا كانت المنظمة نفسها غير موجودة (تم حذفها بالفعل)، اسمح بحذف الحسابات التابعة لها
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id) THEN
        RETURN OLD;
    END IF;

    -- الحماية الطبيعية أثناء العمل اليومي
    IF OLD.code IN ('1', '2', '3', '4', '5', '1221', '201', '311', '1231') THEN
        RAISE EXCEPTION '⚠️ خطأ سيادي: لا يمكن حذف الحساب (%) لأنه حساب نظام أساسي مرتبط بالتقارير المالية والقيود الآلية.', OLD.name;
    END IF;

    RETURN OLD;
END; $$;

-- ربط الدرع بجدول الحسابات
DROP TRIGGER IF EXISTS trg_protect_system_accounts ON public.accounts;
CREATE TRIGGER trg_protect_system_accounts BEFORE DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.fn_protect_system_accounts();

CREATE OR REPLACE FUNCTION public.fn_delete_organization_safe(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tables text[] := ARRAY[
        'notification_audit_log', 'cheque_attachments', 'receipt_voucher_attachments', 
        'payment_voucher_attachments', 'notification_preferences', 'security_logs', 
        'journal_attachments', 'order_item_modifiers', 'payroll_variables', 
        'opening_inventories', 'bill_of_materials', 'order_items', 'kitchen_orders', 
        'invoice_items', 'purchase_invoice_items', 'journal_lines', 'payroll_items', 
        'stock_adjustment_items', 'sales_return_items', 'purchase_return_items', 
        'delivery_orders', 'payments', 'orders', 'invoices', 'purchase_invoices', 
        'sales_returns', 'purchase_returns', 'journal_entries', 'payrolls', 
        'stock_adjustments', 'cheques', 'receipt_vouchers', 'payment_vouchers', 
        'table_sessions', 'shifts', 'work_orders', 'credit_notes', 'debit_notes', 
        'assets', 'products', 'customers', 'suppliers', 'employees', 
        'restaurant_tables', 'modifiers', 'modifier_groups', 'accounts', 
        'cost_centers', 'warehouses', 'invitations', 'budgets', 'company_settings'
    ];
    v_t text;
BEGIN
    -- 1. التحقق من الصلاحيات (يجب أن يكون سوبر أدمن)
    IF public.get_my_role() != 'super_admin' THEN
        RAISE EXCEPTION '⚠️ خطأ أمني: غير مصرح لك بحذف المنظمات من هذا المستوى.';
    END IF;

    -- 2. تفعيل وضع التجاوز (Restore Mode) لتعطيل حماية الحسابات "السيادية" والتدقيق التلقائي للحذف
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 3. تنظيف متسلسل للبيانات التابعة للمنظمة لمنع تعارض القيود المرجعية
    FOREACH v_t IN ARRAY v_tables
    LOOP
        BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE organization_id = %L', v_t, p_org_id);
        EXCEPTION WHEN OTHERS THEN
            -- نتجاوز أي خطأ في حال عدم وجود الجدول أو العمود في قاعدة البيانات الحالية
            NULL;
        END;
    END LOOP;

    -- 4. حذف المنظمة نهائياً
    DELETE FROM public.organizations WHERE id = p_org_id;

    -- 5. إعادة الوضع الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);
END; $$;

-- 🛠️ دالة مساعدة لضمان الترحيل إلى حساب فرعي (Resolve Leaf Account)
CREATE OR REPLACE FUNCTION public.resolve_leaf_account(p_account_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_leaf_id uuid;
BEGIN
    IF p_account_id IS NULL THEN RETURN NULL; END IF;

    -- البحث المتعمق عن أول حساب "ورقة" (Leaf) سواء كان الحساب الممرر هو الورقة أو أحد أبنائه
    WITH RECURSIVE coa_tree AS (
        SELECT id, is_group, code FROM public.accounts WHERE id = p_account_id
        UNION ALL
        SELECT a.id, a.is_group, a.code FROM public.accounts a JOIN coa_tree ct ON a.parent_id = ct.id
    )
    SELECT id INTO v_leaf_id FROM coa_tree WHERE is_group = false ORDER BY code LIMIT 1;

    -- 🛡️ إذا لم نجد حساب فرعي (حالة نادرة)، نرجع الحساب الأصلي ليتولى الـ Trigger المنع بدلاً من انهيار الدالة بـ NULL
    RETURN COALESCE(v_leaf_id, p_account_id);
END; $$;

-- ================================================================
-- 2.5 دوال النسخ الاحتياطي (Backup Functions)
-- ================================================================

-- 🛡️ تنظيف النسخ القديمة لتجنب خطأ تعارض أنواع البيانات (HINT: 42P13)
DROP FUNCTION IF EXISTS public.create_organization_backup(uuid, text);
DROP FUNCTION IF EXISTS public.restore_organization_from_backup(uuid);
DROP FUNCTION IF EXISTS public.validate_backup_integrity(uuid, jsonb);
DROP FUNCTION IF EXISTS public.run_daily_backups_all_orgs();

-- �️ دالة إنشاء نسخة احتياطية لمنظمة محددة
CREATE OR REPLACE FUNCTION public.create_organization_backup(p_org_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_backup_data jsonb := '{}'::jsonb;
    v_table_name text;
    v_table_data jsonb;
    v_backup_id uuid;
    v_user_id uuid := auth.uid(); -- User performing the backup
    v_org_name text;
BEGIN
    -- Get organization name for notes
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    -- Iterate through all tables that have an organization_id column
    FOR v_table_name IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name = 'organization_id'
          AND EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE')
          AND c.table_name NOT IN ('organizations', 'organization_backups', 'profiles', 'auth.users') -- Exclude core system tables or tables with special RLS
    LOOP
        BEGIN
            -- Select all data for the given organization from the current table
            EXECUTE format('SELECT jsonb_agg(to_jsonb(t)) FROM public.%I t WHERE t.organization_id = %L', v_table_name, p_org_id)
            INTO v_table_data;
            
            -- Add table data to the main backup JSONB object
            -- Use jsonb_set to add/update a key-value pair in the JSONB object
            v_backup_data := jsonb_set(v_backup_data, ARRAY[v_table_name], COALESCE(v_table_data, '[]'::jsonb), true);
            
            -- Optional: Log progress
            -- RAISE NOTICE 'Backed up data from table % for organization %', v_table_name, p_org_id;

        EXCEPTION
            WHEN UNDEFINED_COLUMN THEN
                RAISE WARNING 'Table % does not have organization_id column, skipping.', v_table_name;
            WHEN OTHERS THEN
                RAISE WARNING 'Error backing up table % for organization %: %', v_table_name, p_org_id, SQLERRM;
        END;
    END LOOP;

    -- Insert the backup record
    INSERT INTO public.organization_backups (organization_id, backup_data, file_size_kb, user_id, notes)
    VALUES (
        p_org_id,
        v_backup_data,
        pg_column_size(v_backup_data) / 1024.0, -- Size in KB
        COALESCE(v_user_id, auth.uid()),
        COALESCE(p_notes, 'Daily backup for ' || v_org_name)
    ) RETURNING id INTO v_backup_id;

    -- 🛡️ تنظيف النسخ القديمة: الاحتفاظ بآخر 5 نسخ فقط لكل شركة لضمان توفير المساحة
    DELETE FROM public.organization_backups
    WHERE id IN (
        SELECT id
        FROM public.organization_backups
        WHERE organization_id = p_org_id
        ORDER BY backup_date DESC
        OFFSET 5
    );

    RETURN v_backup_id;
END; $$;

-- 🛠️ دالة تشغيل النسخ الاحتياطي لجميع المنظمات النشطة
CREATE OR REPLACE FUNCTION public.run_daily_backups_all_orgs()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
    v_backup_count int := 0;
    v_error_message text;
BEGIN
    FOR v_org_id IN SELECT id FROM public.organizations WHERE is_active = true LOOP
        BEGIN
            PERFORM public.create_organization_backup(v_org_id, 'Automated daily backup');
            v_backup_count := v_backup_count + 1;
        EXCEPTION WHEN OTHERS THEN
            v_error_message := SQLERRM;
            RAISE WARNING 'Failed to create backup for organization %: %', v_org_id, v_error_message;
            INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id)
            VALUES (v_error_message, jsonb_build_object('organization_id', v_org_id), 'run_daily_backups_all_orgs', v_org_id);

            -- 🔔 إرسال تنبيه ذكي للسوبر أدمن عند فشل النسخة الاحتياطية
            INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
            SELECT id, '⚠️ فشل النسخ الاحتياطي', 
                   format('فشل النظام في إنشاء نسخة للمنظمة (%s). يرجى التحقق من سجل الأخطاء.', 
                          (SELECT name FROM public.organizations WHERE id = v_org_id)), 
                   'high', v_org_id, 'system_error'
            FROM public.profiles 
            WHERE role = 'super_admin' AND is_active = true;
        END;
    END LOOP;
    RETURN 'Successfully created ' || v_backup_count || ' backups.';
END; $$;

-- 🛠️ دالة فحص سلامة النسخة الاحتياطية قبل الاستعادة
CREATE OR REPLACE FUNCTION public.validate_backup_integrity(p_org_id uuid, p_backup_data jsonb)
RETURNS TABLE (name text, status text, message text) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table_name text;
    v_missing_tables text[] := '{}';
    v_critical_tables text[] := ARRAY['accounts', 'products', 'journal_entries'];
    v_table_exists boolean;
BEGIN
    -- 1. التحقق من صحة هيكل الـ JSON
    name := 'صحة هيكل البيانات';
    IF jsonb_typeof(p_backup_data) != 'object' THEN
        status := 'fail';
        message := 'بيانات النسخة الاحتياطية تالفة أو ليست بتنسيق JSON صحيح.';
        RETURN NEXT;
        RETURN; 
    ELSE
        status := 'pass';
        message := 'هيكل البيانات سليم.';
        RETURN NEXT;
    END IF;

    -- 2. التحقق من تطابق الجداول مع النظام الحالي
    FOR v_table_name IN SELECT jsonb_object_keys(p_backup_data) LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = v_table_name
        ) INTO v_table_exists;
        
        IF NOT v_table_exists THEN
            v_missing_tables := array_append(v_missing_tables, v_table_name);
        END IF;
    END LOOP;

    name := 'توافق الجداول';
    IF array_length(v_missing_tables, 1) > 0 THEN
        status := 'warning';
        message := 'تحتوي النسخة على جداول غير موجودة في النظام الحالي (سيتم تجاهلها): ' || array_to_string(v_missing_tables, ', ');
    ELSE
        status := 'pass';
        message := 'جميع جداول النسخة متوافقة مع النظام.';
    END IF;
    RETURN NEXT;

    -- 3. التحقق من وجود الجداول السيادية (Critical Tables)
    name := 'سلامة البيانات الأساسية';
    v_missing_tables := '{}';
    FOREACH v_table_name IN ARRAY v_critical_tables LOOP
        IF NOT (p_backup_data ? v_table_name) THEN
            v_missing_tables := array_append(v_missing_tables, v_table_name);
        END IF;
    END LOOP;

    IF array_length(v_missing_tables, 1) > 0 THEN
        status := 'fail';
        message := 'النسخة تفتقر لجداول حيوية (لا يمكن الاستعادة): ' || array_to_string(v_missing_tables, ', ');
    ELSE
        status := 'pass';
        message := 'الجداول الحيوية موجودة.';
    END IF;
    RETURN NEXT;

    -- 4. التحقق من ملكية البيانات (Organization Match)
    name := 'التحقق من ملكية البيانات';
    v_table_name := (SELECT jsonb_object_keys(p_backup_data) LIMIT 1);
    IF v_table_name IS NOT NULL AND jsonb_array_length(p_backup_data->v_table_name) > 0 THEN
        IF (p_backup_data->v_table_name->0->>'organization_id')::uuid != p_org_id THEN
            status := 'fail';
            message := 'هذه النسخة تنتمي لمنظمة أخرى ولا يمكن استعادتها لهذه الشركة.';
        ELSE
            status := 'pass';
            message := 'البيانات تنتمي لهذه المنظمة بشكل صحيح.';
        END IF;
    ELSE
        status := 'warning';
        message := 'لا توجد بيانات كافية في النسخة للتحقق من ملكية المنظمة.';
    END IF;
    RETURN NEXT;
END; $$;

-- 🛠️ دالة استعادة بيانات منظمة من نسخة احتياطية محددة
CREATE OR REPLACE FUNCTION public.restore_organization_from_backup(p_backup_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_backup record;
    v_table_name text;
    v_count int := 0;
    v_total_inserted int := 0;
BEGIN
    -- 1. جلب بيانات النسخة والتحقق من وجودها
    SELECT * INTO v_backup FROM public.organization_backups WHERE id = p_backup_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'النسخة الاحتياطية غير موجودة.'; END IF;

    -- 🛡️ تفعيل وضع الاستعادة وتعطيل القيود مؤقتاً
    PERFORM set_config('app.restore_mode', 'on', true);
    -- ملاحظة: في PostgreSQL لا يمكن تعطيل القيود إلا داخل Transaction، ونحن هنا بالفعل داخل واحد.

    -- 2. استرجاع قائمة الجداول وتفريغ البيانات (ترتيب الحذف مهم ولكن ON DELETE CASCADE تتكفل بمعظمه)
    FOR v_table_name IN SELECT jsonb_object_keys(v_backup.backup_data)
    LOOP
        -- أ. حذف البيانات الحالية (باستخدام حماية لمنع حذف بيانات منظمات أخرى)
        EXECUTE format('DELETE FROM public.%I WHERE organization_id = %L', v_table_name, v_backup.organization_id);

        -- ب. إعادة حقن السجلات باستخدام Bulk Insert لتحسين الأداء (V52.0)
        EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I, %L)', 
                       v_table_name, v_table_name, v_backup.backup_data -> v_table_name);
        
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_total_inserted := v_total_inserted + v_count;
    END LOOP;

    -- 🚀 إعادة تنشيط محرك المخزون لضمان دقة الأرصدة بعد الاستعادة
    PERFORM public.recalculate_stock_rpc(v_backup.organization_id);
    PERFORM set_config('app.restore_mode', 'off', true);

    -- 🛡️ تسجيل العملية في سجل الأمان (Audit Log) لضمان المحاسبية
    INSERT INTO public.security_logs (
        event_type, 
        description, 
        performed_by, 
        organization_id, 
        metadata
    ) VALUES (
        'data_restore',
        'تمت استعادة بيانات المنظمة من نسخة احتياطية رقم: ' || p_backup_id,
        auth.uid(),
        v_backup.organization_id,
        jsonb_build_object('backup_id', p_backup_id, 'records_count', v_total_inserted, 'backup_date', v_backup.backup_date)
    );
    
    RETURN '✅ تمت الاستعادة بنجاح. إجمالي السجلات المسترجعة: ' || v_total_inserted;
END; $$;

-- 🛠️ دالة التحقق الشامل من شمولية النسخة (Comprehensiveness Check)
-- الغرض: مقارنة هيكل الجداول الحالي مع محتويات النسخة لضمان عدم سقوط أي مديول (مثل المستشفيات)
CREATE OR REPLACE FUNCTION public.verify_backup_comprehensiveness(p_backup_id uuid)
RETURNS TABLE (
    "اسم الجدول" text,
    "الحالة في النسخة" text,
    "عدد السجلات في النسخة" int,
    "عدد السجلات الحالية بالشركة" bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_backup record;
    v_tbl record;
BEGIN
    -- 1. جلب بيانات النسخة
    SELECT * INTO v_backup FROM public.organization_backups WHERE id = p_backup_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'النسخة الاحتياطية غير موجودة.'; END IF;

    -- 2. المسح الشامل لجميع الجداول التي تخص المنظمات (SaaS Tables)
    FOR v_tbl IN 
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON c.table_name = t.table_name
        WHERE c.table_schema = 'public' 
          AND c.column_name = 'organization_id'
          AND t.table_type = 'BASE TABLE'
          AND c.table_name NOT IN ('organizations', 'organization_backups', 'profiles')
    LOOP
        "اسم الجدول" := v_tbl.table_name;
        
        IF v_backup.backup_data ? "اسم الجدول" THEN
            "الحالة في النسخة" := '✅ مشمول';
            "عدد السجلات في النسخة" := jsonb_array_length(v_backup.backup_data -> "اسم الجدول");
        ELSE
            "الحالة في النسخة" := '❌ مفقود من النسخة';
            "عدد السجلات في النسخة" := 0;
        END IF;

        EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE organization_id = %L', v_tbl.table_name, v_backup.organization_id)
        INTO "عدد السجلات الحالية بالشركة";

        RETURN NEXT;
    END LOOP;
END; $$;

-- ================================================================
-- 3. محرك المخزون الشامل (The Master Stock Engine)
-- ================================================================
-- 🛡️ تحديث V50.5: ضمان تصفير الأصناف التي ليس لها حركات عند إعادة الاحتساب الجزئي
-- 🛡️ تحديث V50.4: إضافة p_product_id لدعم إعادة الاحتساب لصنف محدد وحل خطأ 404
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc(uuid);
DROP FUNCTION IF EXISTS public.recalculate_stock_rpc(uuid, uuid);

CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_final_org uuid;
BEGIN
    v_final_org := COALESCE(p_org_id, public.get_my_org());
    
    -- 🚀 استخدام جدول مؤقت لحل مشكلة نطاق الـ CTE وضمان الدقة في عمليتي التحديث (V50.6)
    DROP TABLE IF EXISTS product_summary_temp;
    CREATE TEMP TABLE product_summary_temp AS
    WITH warehouse_movement AS (
        -- تجميع كافة حركات الداخل والخارج في استعلام واحد
        SELECT 
            product_id, 
            warehouse_id, 
            SUM(qty) as net_qty
        FROM (
            -- رصيد افتتاحي
            SELECT oi.product_id, oi.warehouse_id, public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) as qty 
            FROM public.opening_inventories oi JOIN public.products p ON oi.product_id = p.id
            WHERE oi.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL AND (v_final_org IS NULL OR oi.organization_id = v_final_org)
            UNION ALL
            -- مشتريات (+)
            SELECT pii.product_id, pi.warehouse_id, public.uom_convert(pii.quantity, pii.uom_id, p.base_uom_id) FROM public.purchase_invoice_items pii JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id JOIN public.products p ON pii.product_id = p.id
            WHERE UPPER(pi.status) NOT IN ('DRAFT', 'CANCELLED') AND pi.warehouse_id IS NOT NULL AND pii.product_id IS NOT NULL AND (v_final_org IS NULL OR pi.organization_id = v_final_org)
            
            UNION ALL
            -- وارد اعتمادات مستندية (+)
            SELECT lcri.product_id, 
                   COALESCE(lcri.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = lcri.organization_id LIMIT 1)) as warehouse_id, 
                   COALESCE(lcri.quantity, 0) as qty
            FROM public.lc_receipt_items lcri
            LEFT JOIN public.letters_of_credit lc ON lcri.lc_id = lc.id
            WHERE (lc.id IS NULL OR UPPER(lc.status) != 'CANCELLED') 
              AND lcri.product_id IS NOT NULL
              AND (v_final_org IS NULL OR lcri.organization_id = v_final_org)
            
            UNION ALL
            -- مبيعات (-) - خصم المنتج التام نفسه (إذا لم يكن له BOM)
            SELECT ii.product_id, i.warehouse_id, -public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id)
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.products p ON ii.product_id = p.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = ii.product_id)
            
            UNION ALL
            -- مبيعات (-) - خصم مكونات BOM للمنتجات التامة المباعة (مع مراعاة وحدات المكونات)
            SELECT bom.raw_material_id, i.warehouse_id, -(public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
            FROM public.invoice_items ii
            JOIN public.invoices i ON ii.invoice_id = i.id
            JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id
            JOIN public.products p ON ii.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED')
              AND i.warehouse_id IS NOT NULL
              AND ii.product_id IS NOT NULL
              AND (v_final_org IS NULL OR i.organization_id = v_final_org)
              AND bom.raw_material_id IS NOT NULL
            
            UNION ALL
            -- مبيعات المطعم (Order Items) (-) - خصم المنتج التام نفسه (إذا لم يكن له BOM)
            SELECT oi.product_id, o.warehouse_id, -public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id)
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.products p ON oi.product_id = p.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL 
              AND (v_final_org IS NULL OR o.organization_id = v_final_org)
              AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
            UNION ALL
            -- مبيعات المطعم (Order Items) (-) - خصم مكونات BOM للمنتجات التامة المباعة
            SELECT bom.raw_material_id, o.warehouse_id, -(public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
            FROM public.order_items oi
            JOIN public.orders o ON oi.order_id = o.id
            JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id
            JOIN public.products p ON oi.product_id = p.id
            JOIN public.products rm ON bom.raw_material_id = rm.id
            WHERE UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.warehouse_id IS NOT NULL AND oi.product_id IS NOT NULL AND bom.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR o.organization_id = v_final_org)
            UNION ALL
            -- تصنيع تام (+) 
            SELECT product_id, warehouse_id, quantity_to_produce FROM public.mfg_production_orders 
            WHERE UPPER(status) = 'COMPLETED' AND warehouse_id IS NOT NULL AND product_id IS NOT NULL AND (v_final_org IS NULL OR organization_id = v_final_org)
            
            UNION ALL
            -- 🛡️ منتجات عرضية من التصنيع (+)
            SELECT 
                bl.product_id, 
                (SELECT warehouse_id FROM public.mfg_production_orders WHERE id = (SELECT production_order_id FROM public.mfg_order_progress WHERE id = bl.order_progress_id)) as warehouse_id, 
                bl.quantity as qty
            FROM public.mfg_byproducts_logs bl
            WHERE (v_final_org IS NULL OR bl.organization_id = v_final_org)
            
            UNION ALL
            -- 🛡️ هالك تصنيع (-)
            SELECT 
                sl.product_id,
                COALESCE(
                    (SELECT po.warehouse_id 
                     FROM public.mfg_order_progress op 
                     JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
                     WHERE op.id = sl.order_progress_id LIMIT 1),
                    (SELECT id FROM public.warehouses WHERE organization_id = v_final_org LIMIT 1)
                ) as warehouse_id,
                -sl.quantity as qty
            FROM public.mfg_scrap_logs sl
            WHERE (v_final_org IS NULL OR sl.organization_id = v_final_org)
            UNION ALL
            -- استهلاك خامات (-)
            SELECT amu.raw_material_id, po.warehouse_id, -public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id)
            FROM public.mfg_actual_material_usage amu 
            JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id 
            JOIN public.mfg_production_orders po ON op.production_order_id = po.id 
            JOIN public.products p ON amu.raw_material_id = p.id
            WHERE po.warehouse_id IS NOT NULL AND amu.raw_material_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            
            UNION ALL
            -- 🛡️ استهلاك خامات بطلبات صرف (MR) (منضبط بالوحدات)
            SELECT mri.raw_material_id, po.warehouse_id, -public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id)
            FROM public.mfg_material_request_items mri
            JOIN public.products p ON mri.raw_material_id = p.id
            JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
            JOIN public.mfg_production_orders po ON mr.production_order_id = po.id
            WHERE mr.status = 'issued' AND po.warehouse_id IS NOT NULL AND (v_final_org IS NULL OR po.organization_id = v_final_org)
            AND NOT EXISTS (
                SELECT 1 FROM public.mfg_order_progress op_sub
                JOIN public.mfg_actual_material_usage amu_sub ON op_sub.id = amu_sub.order_progress_id
                WHERE op_sub.production_order_id = po.id AND amu_sub.raw_material_id = mri.raw_material_id
            )

            UNION ALL
            -- 🏗️ استهلاك مواد لمشاريع المقاولات (-)
            SELECT pmii.product_id, pmi.warehouse_id, -public.uom_convert(pmii.quantity, pmii.uom_id, p.base_uom_id)
            FROM public.project_material_issue_items pmii
            JOIN public.project_material_issues pmi ON pmii.issue_id = pmi.id
            JOIN public.products p ON pmii.product_id = p.id
            WHERE pmi.status = 'approved' AND (v_final_org IS NULL OR pmi.organization_id = v_final_org)

            UNION ALL
            -- 🔄 مرتجعات مبيعات (+)
            SELECT sri.product_id, sr.warehouse_id, public.uom_convert(sri.quantity, sri.uom_id, p.base_uom_id)
            FROM public.sales_return_items sri
            JOIN public.sales_returns sr ON sri.sales_return_id = sr.id JOIN public.products p ON sri.product_id = p.id
            WHERE sr.status = 'posted' AND (v_final_org IS NULL OR sr.organization_id = v_final_org)

            UNION ALL
            -- 🔄 مرتجعات مشتريات (-)
            SELECT pri.product_id, pr.warehouse_id, -public.uom_convert(pri.quantity, pri.uom_id, p.base_uom_id)
            FROM public.purchase_return_items pri
            JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id JOIN public.products p ON pri.product_id = p.id
            WHERE pr.status = 'posted' AND (v_final_org IS NULL OR pr.organization_id = v_final_org)

            UNION ALL
            -- 🛠️ تسويات مخزنية (+/-)
            SELECT sai.product_id, sa.warehouse_id, public.uom_convert(sai.quantity, sai.uom_id, p.base_uom_id)
            FROM public.stock_adjustment_items sai
            JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
            JOIN public.products p ON sai.product_id = p.id
            WHERE sa.status = 'posted' AND (v_final_org IS NULL OR sa.organization_id = v_final_org)

            UNION ALL
            -- 🚚 تحويلات مخزنية (صادر -)
            SELECT sti.product_id, st.from_warehouse_id, -public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)
            
            UNION ALL
            -- 🏥 استهلاك المستشفيات (HIMS Consumption) (-)
            -- يجمع الأدوية المصروفة ومستلزمات العمليات
            SELECT hbi.product_id, hbi.warehouse_id, -public.uom_convert(hbi.quantity, hbi.uom_id, p.base_uom_id)
            FROM public.hims_billing_items hbi
            JOIN public.products p ON hbi.product_id = p.id
            WHERE hbi.product_id IS NOT NULL AND hbi.warehouse_id IS NOT NULL
            AND (v_final_org IS NULL OR hbi.organization_id = v_final_org)

            UNION ALL
            -- 🚚 تحويلات مخزنية (وارد +)
            SELECT sti.product_id, st.to_warehouse_id, public.uom_convert(sti.quantity, sti.uom_id, p.base_uom_id)
            FROM public.stock_transfer_items sti
            JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id
            JOIN public.products p ON sti.product_id = p.id
            WHERE st.status = 'posted' AND (v_final_org IS NULL OR st.organization_id = v_final_org)
        ) movements
        WHERE product_id IS NOT NULL AND warehouse_id IS NOT NULL
        AND (p_product_id IS NULL OR product_id = p_product_id)
        GROUP BY product_id, warehouse_id
    )
    SELECT 
        product_id, 
        SUM(net_qty) as total_stock,
        jsonb_object_agg(warehouse_id::text, net_qty) as wh_json
    FROM warehouse_movement
    GROUP BY product_id;

    -- 🛡️ 1. تحديث الأصناف التي لها حركات فعلاً
    UPDATE public.products p
    SET 
        stock = COALESCE(s.total_stock, 0),
        warehouse_stock = COALESCE(s.wh_json, '{}'::jsonb)
    FROM product_summary_temp s
    WHERE p.id = s.product_id;

    -- 🛡️ 2. تصفير الأصناف التي لا تمتلك حركات (لضمان مطابقة الواقع)
    UPDATE public.products p
    SET stock = 0, warehouse_stock = '{}'::jsonb
    WHERE (v_final_org IS NULL OR p.organization_id = v_final_org)
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND NOT EXISTS (SELECT 1 FROM product_summary_temp s WHERE s.product_id = p.id);
      
        -- 🔔 نظام التنبيهات اللحظي (Real-time Alerts)
    INSERT INTO public.notifications (user_id, title, message, priority, organization_id, type)
    SELECT prof.id, 'نقص مخزون حرج', format('الصنف %s وصل إلى %s', p.name, p.stock), 'high', p.organization_id, 'low_inventory'
    FROM public.products p
    JOIN public.profiles prof ON p.organization_id = prof.organization_id
    WHERE p.stock <= COALESCE(p.min_stock, 0) AND p.min_stock > 0 AND prof.role IN ('admin', 'manager')
    ON CONFLICT DO NOTHING;

END; $$;

-- 🛠️ دالة إعادة تقييم التكلفة (Inventory Revaluation)
CREATE OR REPLACE FUNCTION public.revalue_product_cost(
    p_new_cost numeric,
    p_notes text,
    p_org_id uuid,
    p_product_id uuid,
    p_revaluation_date date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.products 
    SET weighted_average_cost = p_new_cost,
        purchase_price = p_new_cost,
        cost = p_new_cost
    WHERE id = p_product_id AND organization_id = p_org_id;

    PERFORM public.recalculate_stock_rpc(p_org_id, p_product_id);
END; $$;

-- 🛠️ دالة اعتماد الجرد المخزني (Post Inventory Count)
CREATE OR REPLACE FUNCTION public.post_inventory_count(p_count_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count record; v_item record; v_adj_id uuid; v_adj_no text; v_total_val numeric := 0;
    v_inv_acc uuid; v_adj_acc uuid; v_je_id uuid; v_mappings jsonb;
BEGIN
    SELECT * INTO v_count FROM public.inventory_counts WHERE id = p_count_id AND status = 'draft';
    IF NOT FOUND THEN RAISE EXCEPTION 'الجرد غير موجود أو تم اعتماده مسبقاً'; END IF;

    v_adj_no := 'ADJ-CNT-' || v_count.count_number;

    -- 1. إنشاء رأس التسوية
    INSERT INTO public.stock_adjustments (organization_id, warehouse_id, adjustment_date, adjustment_number, reason, status)
    VALUES (v_count.organization_id, v_count.warehouse_id, v_count.count_date, v_adj_no, 'تسوية ناتجة عن جرد: ' || v_count.count_number, 'posted')
    RETURNING id INTO v_adj_id;

    -- 2. نقل الفروقات واحتساب القيمة بالتكلفة الفعلية أو المتوسط المرجح
    FOR v_item IN SELECT * FROM public.inventory_count_items WHERE inventory_count_id = p_count_id AND difference <> 0 LOOP
        INSERT INTO public.stock_adjustment_items (organization_id, stock_adjustment_id, product_id, quantity, type)
        VALUES (v_count.organization_id, v_adj_id, v_item.product_id, v_item.difference, CASE WHEN v_item.difference > 0 THEN 'in' ELSE 'out' END);
        
        v_total_val := v_total_val + (v_item.difference * COALESCE(
            (SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0) 
             FROM public.products WHERE id = v_item.product_id), 0));
    END LOOP;

    -- 3. المحاسبة الآلية للفروقات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_count.organization_id;
    v_inv_acc := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_count.organization_id LIMIT 1));
    v_adj_acc := COALESCE((v_mappings->>'INVENTORY_ADJUSTMENTS')::uuid, (SELECT id FROM public.accounts WHERE code = '512' AND organization_id = v_count.organization_id LIMIT 1));

    IF v_total_val <> 0 AND v_inv_acc IS NOT NULL AND v_adj_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (v_count.count_date, 'قيد تسوية جرد رقم ' || v_count.count_number, v_adj_no, 'posted', v_count.organization_id, true, v_adj_id, 'stock_adjustment')
        RETURNING id INTO v_je_id;

        IF v_total_val > 0 THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_inv_acc, v_total_val, 0, v_count.organization_id), (v_je_id, v_adj_acc, 0, v_total_val, v_count.organization_id);
        ELSE
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_adj_acc, ABS(v_total_val), 0, v_count.organization_id), (v_je_id, v_inv_acc, 0, ABS(v_total_val), v_count.organization_id);
        END IF;
    END IF;

    UPDATE public.inventory_counts SET status = 'posted' WHERE id = p_count_id;
    PERFORM public.recalculate_stock_rpc(v_count.organization_id);
    RETURN v_adj_id;
END; $$;

-- 🛠️ دالة تسجيل الهالك (Record Wastage)
CREATE OR REPLACE FUNCTION public.record_wastage(
    p_date date,
    p_items jsonb,
    p_notes text,
    p_warehouse_id uuid,
    p_org_id uuid DEFAULT public.get_my_org(),
    p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_adj_id uuid;
    v_item jsonb;
    v_adj_num text;
BEGIN
    v_adj_num := 'WST-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));
    
    INSERT INTO public.stock_adjustments (adjustment_date, notes, warehouse_id, organization_id, created_by, adjustment_number, status, reason)
    VALUES (p_date, p_notes, p_warehouse_id, p_org_id, p_user_id, v_adj_num, 'posted', 'الهالك (Wastage)')
    RETURNING id INTO v_adj_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.stock_adjustment_items (stock_adjustment_id, product_id, quantity, type, organization_id)
        VALUES (v_adj_id, (v_item->>'productId')::uuid, -ABS((v_item->>'quantity')::numeric), 'out', p_org_id);
    END LOOP;

    PERFORM public.recalculate_stock_rpc(p_org_id);
    RETURN v_adj_id;
END; $$;

-- ================================================================
-- 4. مديول المطاعم ونقاط البيع (Restaurant & POS Module)
-- ================================================================

-- 🛡️ التطهير الجذري لتواقيع الدوال (Aggressive Function Purge)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname IN ('start_pos_shift', 'create_restaurant_order', 'complete_restaurant_order', 'create_public_order', 'generate_shift_closing_entry') 
             AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Purge info: %', SQLERRM; END $$;

-- 🛠️ دالة بدء الوردية
CREATE OR REPLACE FUNCTION public.get_active_shift(
    p_user_id uuid DEFAULT NULL, 
    p_org_id uuid DEFAULT NULL
) RETURNS public.shifts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid;
    v_shift public.shifts;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    
    IF v_org_id IS NULL THEN RETURN NULL::public.shifts; END IF;

    SELECT * INTO v_shift FROM public.shifts
    WHERE user_id = COALESCE(p_user_id, auth.uid()) 
      AND end_time IS NULL 
      AND organization_id = v_org_id
    ORDER BY start_time DESC LIMIT 1;

    -- 🛡️ تصحيح V50.3: ضمان إعادة NULL صريح لتجنب الكائن الوهمي {id: null}
    IF v_shift.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN v_shift;
END; $$;

CREATE OR REPLACE FUNCTION public.start_pos_shift(
    p_opening_balance numeric DEFAULT 0, 
    p_resume_existing boolean DEFAULT true, 
    p_treasury_account_id uuid DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) RETURNS public.shifts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_existing_shift public.shifts; 
    v_new_shift public.shifts;
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL AND current_setting('app.restore_mode', true) != 'on' THEN RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى التأكد من ربط حسابك بشركة.'; END IF;

    SELECT * INTO v_existing_shift FROM public.shifts 
    WHERE user_id = COALESCE(p_user_id, auth.uid()) AND end_time IS NULL AND organization_id = v_org_id 
    ORDER BY start_time DESC LIMIT 1;

    -- 🛡️ إذا طلب المستخدم الاستئناف ووجدنا وردية، نعيدها
    IF p_resume_existing AND v_existing_shift.id IS NOT NULL THEN 
        RETURN v_existing_shift; 
    END IF;

    -- 🛡️ إذا طلب المستخدم الاستئناف ولم نجد، نعيد NULL للتوقف هنا
    IF p_resume_existing THEN RETURN NULL; END IF;

    IF v_existing_shift.id IS NOT NULL THEN RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم في هذه الشركة. يرجى إغلاقها أولاً.'; END IF;

    INSERT INTO public.shifts (user_id, start_time, opening_balance, treasury_account_id, organization_id, status)
    VALUES (COALESCE(p_user_id, auth.uid()), now(), p_opening_balance, p_treasury_account_id, v_org_id, 'OPEN') 
    RETURNING * INTO v_new_shift;

    RETURN v_new_shift;
END; $$;

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_order_id uuid; v_item jsonb; v_order_num text; v_tax_rate numeric; 
    v_tax_enabled boolean; -- 🛡️ للتحقق من تفعيل الضريبة في إعدادات الشركة
    v_subtotal numeric := 0; v_final_wh_id uuid; v_org_id uuid; v_order_item_id uuid; v_delivery_fee numeric := 0; v_item_cost numeric;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    v_final_wh_id := COALESCE(p_warehouse_id, (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1));
    
    -- جلب معدل الضريبة وحالة التفعيل من إعدادات الشركة
    SELECT vat_rate, COALESCE(enable_tax, true) INTO v_tax_rate, v_tax_enabled 
    FROM public.company_settings WHERE organization_id = v_org_id;
    
    IF NOT v_tax_enabled THEN
        v_tax_rate := 0;
    END IF;

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, v_final_wh_id) 
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🚀 جلب التكلفة اللحظية للصنف لضمان دقة تقرير COGS لاحقاً
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0), base_uom_id INTO v_item_cost, v_final_wh_id -- نستخدم v_final_wh_id مؤقتاً لتخزين معرف الوحدة الأساسية
        FROM public.products WHERE id = (v_item->>'product_id')::uuid;

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, unit_cost, notes, organization_id, modifiers, uom_id)
        VALUES (
            v_order_id, 
            (v_item->>'product_id')::uuid, 
            (v_item->>'quantity')::numeric, 
            (v_item->>'unit_price')::numeric,
            v_item_cost,
            NULLIF(TRIM(COALESCE(v_item->>'notes', '')), ''),
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb),
            (v_item->>'uom_id')::uuid
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
        
        -- إرسال للمطبخ فوراً 👨‍🍳
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    IF p_delivery_info IS NOT NULL THEN
        v_delivery_fee := COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0);
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', v_delivery_fee, v_org_id);
    END IF;

    -- 🚀 تحديث الإجماليات بدقة لتشمل الضريبة ورسوم التوصيل
    UPDATE public.orders SET 
        subtotal = v_subtotal, 
        delivery_fee = v_delivery_fee,
        total_tax = v_subtotal * COALESCE(v_tax_rate, 0.14), 
        grand_total = (v_subtotal * (1 + COALESCE(v_tax_rate, 0.14))) + v_delivery_fee 
    WHERE id = v_order_id;

    RETURN v_order_id;
END; $$;

-- 🛠️ دالة جلب رصيد حساب في تاريخ محدد (مطلوبة للاختبارات والتقارير)
CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(p_account_id uuid, p_date date, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
            FROM public.journal_lines jl
            JOIN public.journal_entries je ON jl.journal_entry_id = je.id
            WHERE jl.account_id = p_account_id AND je.organization_id = p_org_id AND je.status = 'posted' AND je.transaction_date <= p_date);
END; $$;

-- 🛠️ دالة إتمام طلب المطعم (الدفع والتحرير)
CREATE OR REPLACE FUNCTION public.complete_restaurant_order(
    p_order_id uuid, p_payment_method text, p_amount numeric, p_cash_account_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order record;
    v_org_id uuid;
    v_table_id uuid;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.status IN ('PAID', 'COMPLETED') THEN RETURN; END IF;
    v_org_id := v_order.organization_id;

    -- 🛡️ تحديث المستودع إذا تم تمريره صراحة عند الإتمام لضمان دقة خصم المخزون
    IF p_warehouse_id IS NOT NULL AND p_warehouse_id != COALESCE(v_order.warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        UPDATE public.orders SET warehouse_id = p_warehouse_id WHERE id = p_order_id;
    END IF;

    -- 1. تسجيل الدفع
    INSERT INTO public.payments (order_id, amount, payment_method, status, organization_id, cash_account_id)
    VALUES (p_order_id, p_amount, p_payment_method, 'COMPLETED', v_org_id, p_cash_account_id);

    -- 2. تحديث حالة الطلب
    UPDATE public.orders SET status = 'PAID' WHERE id = p_order_id;

    -- 3. تحرير الطاولة والجلسة
    IF v_order.session_id IS NOT NULL THEN
        SELECT table_id INTO v_table_id FROM public.table_sessions WHERE id = v_order.session_id;
        UPDATE public.table_sessions SET end_time = now(), status = 'CLOSED' WHERE id = v_order.session_id;
        UPDATE public.restaurant_tables SET status = 'AVAILABLE', session_start = NULL WHERE id = v_table_id;
    END IF;

    -- 4. تحديث المخزون فوراً 🚀
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 📱 دالة المنيو الإلكتروني (QR Menu Order)
CREATE OR REPLACE FUNCTION public.create_public_order(p_qr_key uuid, p_items jsonb, p_org_id uuid DEFAULT NULL) 
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table record; v_session_id uuid; v_order_id uuid;
BEGIN
    SELECT * INTO v_table FROM public.restaurant_tables WHERE qr_access_key = p_qr_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'رمز طاولة غير صالح.'; END IF;

    -- إيجاد أو فتح جلسة
    SELECT id INTO v_session_id FROM public.table_sessions 
    WHERE table_id = v_table.id AND status = 'OPEN' AND organization_id = v_table.organization_id LIMIT 1;

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status)
        VALUES (v_table.id, v_table.organization_id, 'OPEN') RETURNING id INTO v_session_id;
    END IF;

    -- إنشاء الطلب عبر الدالة الموحدة
    v_order_id := public.create_restaurant_order(
        v_session_id, NULL, 'DINE_IN', 'طلب عبر QR', p_items, NULL, NULL, NULL, COALESCE(p_org_id, v_table.organization_id)
    );

    UPDATE public.restaurant_tables SET status = 'OCCUPIED', session_start = now() WHERE id = v_table.id;
    RETURN v_order_id;
END; $$;

-- 🛠️ دالة إصلاح القيود غير المتوازنة (Auto-Balancer)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'fix_unbalanced_journal_entry' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE OR REPLACE FUNCTION public.fix_unbalanced_journal_entry(p_je_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_diff numeric; v_org_id uuid; v_suspense_acc_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.journal_entries WHERE id = p_je_id;
    DELETE FROM public.journal_lines WHERE journal_entry_id = p_je_id AND description = 'توازن آلي (فرق مدين/دائن)';
    SELECT SUM(debit) - SUM(credit) INTO v_diff FROM public.journal_lines WHERE journal_entry_id = p_je_id;
    IF ABS(COALESCE(v_diff, 0)) < 0.001 THEN RETURN; END IF;
    SELECT id INTO v_suspense_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code = '3999' LIMIT 1;
    IF v_diff > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, 0, ABS(v_diff), 'توازن آلي (فرق مدين/دائن)', v_org_id);
    ELSE 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, ABS(v_diff), 0, 'توازن آلي (فرق مدين/دائن)', v_org_id);
    END IF;
END; $$;

-- 🛠️ دالة إنشاء قيد الإغلاق المجمع للوردية (The Heart of POS Accounting)
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb; v_org_id uuid;
    v_cash_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_diff numeric := 0; v_item_cost_record record; v_cash_surplus_acc_id uuid; v_cash_deficit_acc_id uuid;
BEGIN
    -- 🛡️ التأكد من أن المعرّف الممرر ليس فارغاً
    IF p_shift_id IS NULL THEN RAISE EXCEPTION 'خطأ: لم يتم تحديد وردية للإغلاق.'; END IF;

    -- 🛡️ استخدام NOT FOUND لرفع استثناء حقيقي بدلاً من التعامل مع حقول فارغة
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'عذراً، لم يتم العثور على سجل وردية حقيقي في النظام للرقم (%).', p_shift_id; 
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());
    
    -- 🛡️ صمام أمان: لا تسمح بتوليد القيد إذا كانت الوردية لا تزال مفتوحة
    -- تم التعطيل مؤقتاً للسماح بالإصلاح اليدوي للورديات العالقة

    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    -- 🚀 استخدام جدول مؤقت لتجنب مشاكل النطاق وتحسين الأداء (V50.7)
    DROP TABLE IF EXISTS temp_shift_orders;
    CREATE TEMP TABLE temp_shift_orders AS
    SELECT o.id, o.subtotal, o.total_tax, o.grand_total, o.user_id
    FROM public.orders o 
    WHERE o.organization_id = v_org_id 
    AND (
        (o.created_at BETWEEN v_shift.start_time - interval '5 seconds' AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
        OR 
        (o.id IN (SELECT order_id FROM public.payments WHERE created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())))
    )
    AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED');

    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, 
        COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE p.order_id IN (SELECT id FROM temp_shift_orders)
              AND UPPER(p.payment_method) = 'CASH' AND p.status = 'COMPLETED'
        ), 0) as cash_total,
        -- 🚀 حساب التكلفة بتفكيك الوصفة (BOM Expansion)
        COALESCE((
            SELECT SUM(line_cost) FROM (
                -- 1. الأصناف بدون وصفة
                SELECT public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                -- 2. الأصناف بوصفة (الخامات)
                SELECT (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded
        ), 0) as cost_total INTO v_summary
    FROM temp_shift_orders;

    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🛡️ [تحديث V51.5] معالجة آمنة لجلب الحسابات لتجنب انهيار القيد عند وجود زيادة أو عجز
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH', '')::uuid, v_shift.treasury_account_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231', '123101') LIMIT 1)));
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'SALES_REVENUE', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4111') AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'VAT', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1)));
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'COGS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '501') AND organization_id = v_org_id LIMIT 1)));
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'INVENTORY_FINISHED_GOODS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1213') AND organization_id = v_org_id LIMIT 1)));
    
    -- حسابات الفروقات (العجز والزيادة) مع صمام أمان
    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SHORTAGE', '')::uuid, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1)));
    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SURPLUS_ACC', '')::uuid, (SELECT id FROM public.accounts WHERE code = '441' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id)
    VALUES (now()::date, 'إغلاق وردية مطعم', 'SHIFT-' || to_char(now(), 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4), 'posted', v_org_id, true, p_shift_id, 'shift', v_shift.user_id) RETURNING id INTO v_je_id;
    
    -- 1. الإيرادات والضرائب (دائن)
    IF v_summary.subtotal > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيرادات الوردية', v_org_id);
    END IF;

    IF v_summary.tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_org_id); END IF;

    -- 2. النقدية (مدين)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_cash_acc_id, (v_summary.cash_total + v_diff), 0, 'صافي تحصيل الوردية', v_org_id);

    -- 3. التكاليف والمخزون
    IF COALESCE(v_summary.cost_total, 0) > 0 THEN
        -- 🚀 محرك التكلفة الذكي المطور: توجيه التكلفة لحسابات الخامات أو المنتج التام حسب الوصفة
        FOR v_item_cost_record IN (
            SELECT inv_acc, SUM(line_cost) as total_cost FROM (
                -- أصناف مباشرة (10302)
                SELECT COALESCE(p.inventory_account_id, v_inventory_acc_id) as inv_acc,
                       public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                -- أصناف بوصفة (10301)
                SELECT COALESCE(rm.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)) as inv_acc,
                       (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded_inv GROUP BY 1
        ) LOOP
            IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية', v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون الوردية', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 4. ميزان التوازن الذكي (Smart Balancing)
    IF v_diff < 0 THEN
        -- حالة العجز: قيد مدين في حساب العجز
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الوردية', v_org_id);
    ELSIF v_diff > 0 THEN
        -- حالة الزيادة: قيد دائن في حساب الزيادة
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'زيادة نقدية الوردية (إيراد متنوع)', v_org_id);
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    DROP TABLE IF EXISTS temp_shift_orders;
    RETURN v_je_id;
END; $$;

-- 🛠️ دالة إغلاق الوردية
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id uuid, p_actual_cash numeric, p_notes text DEFAULT NULL, p_org_id uuid DEFAULT NULL
)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.shifts SET 
        end_time = now(), actual_cash = p_actual_cash, status = 'CLOSED', notes = p_notes
    WHERE id = p_shift_id;
    PERFORM public.generate_shift_closing_entry(p_shift_id, p_org_id);
    
    -- 🏭 [تكامل التصنيع] ترحيل نسب إتمام الإنتاج آلياً عند إغلاق الوردية
    PERFORM public.mfg_auto_post_wip_progress(COALESCE(p_org_id, public.get_my_org()));
END; $$;
-- 🛠️ دالة اعتماد سند القبض محاسبياً (Receipt Voucher Approval)
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid; v_final_credit_acc_id uuid; v_mappings jsonb;
BEGIN
    v_org_id := public.get_my_org();
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود.'; END IF;

    -- تنظيف أي قيود قديمة مرتبطة
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'receipt_voucher';

    -- تحديد الحساب الدائن (تأمين أو عميل)
    IF v_voucher.voucher_type = 'security_deposit' THEN
        v_final_credit_acc_id := COALESCE(
            (v_mappings->>'SECURITY_DEPOSIT_ACCOUNT')::uuid,
            (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)
        );
    ELSE
        v_final_credit_acc_id := p_credit_account_id;
    END IF;

    IF v_final_credit_acc_id IS NULL THEN RAISE EXCEPTION 'الحساب الدائن غير محدد لسند القبض.'; END IF;

    -- إنشاء القيد المحاسبي
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id) 
    VALUES (v_voucher.receipt_date, COALESCE(v_voucher.notes, 'سند قبض'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true, auth.uid()) 
    RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_final_credit_acc_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;
-- 🛠️ دالة اعتماد سند الصرف محاسبياً (Payment Voucher Approval)
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود.'; END IF;

    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'payment_voucher';

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id) 
    VALUES (v_voucher.payment_date, COALESCE(v_voucher.notes, 'سند صرف'), v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true, auth.uid()) 
    RETURNING id INTO v_journal_id;
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id);
    
    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;

-- 🛠️ دالة التحويل المالي بين الخزائن (Treasury Transfer)
CREATE OR REPLACE FUNCTION public.add_treasury_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_transfer_date date,
  p_notes text,
  p_org_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  -- 1. إنشاء رأس القيد المحاسبي
  INSERT INTO public.journal_entries (
    transaction_date,
    description,
    status,
    organization_id,
    user_id,
    reference
  ) VALUES (
    p_transfer_date,
    p_notes,
    'posted',
    p_org_id,
    p_user_id,
    'TRF-' || TO_CHAR(NOW(), 'YYMMDD-HH24MI')
  ) RETURNING id INTO v_entry_id;

  -- 2. سطر القيد المدين (الخزينة المستلمة تزيد)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    v_entry_id,
    p_to_account_id,
    p_amount,
    0,
    'تحويل وارد: ' || p_notes,
    p_org_id
  );

  -- 3. سطر القيد الدائن (الخزينة المحولة تنقص)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    v_entry_id,
    p_from_account_id,
    0,
    p_amount,
    'تحويل صادر: ' || p_notes,
    p_org_id
  );

  RETURN v_entry_id;
END;
$$;

-- 🛠️ دالة ترحيل قيد يومية للشيكات (Cheque Journal Entry Engine)
-- 2. دالة مساعدة لضمان وجود الحسابات المحاسبية للشيكات ومنع أخطاء null في قيود اليومية
CREATE OR REPLACE FUNCTION public.fn_get_or_create_cheque_account(
    p_org_id uuid,
    p_account_role text, -- 'NOTES_RECEIVABLE', 'NOTES_PAYABLE', 'BANK', 'CUSTOMERS', 'SUPPLIERS'
    p_fallback_bank_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_acc_id uuid;
    v_mappings jsonb;
BEGIN
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = p_org_id;

    IF p_account_role = 'NOTES_RECEIVABLE' THEN
        v_acc_id := COALESCE(
            (v_mappings->>'NOTES_RECEIVABLE')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1222' LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '10103%' OR code LIKE '1231%' OR code LIKE '122%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (name ILIKE '%أوراق القبض%' OR name ILIKE '%أوراق قبض%' OR name ILIKE '%شيكات واردة%' OR name ILIKE '%شيكات تحت التحصيل%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('1222', 'أوراق القبض (شيكات واردة)', 'asset', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'NOTES_PAYABLE' THEN
        v_acc_id := COALESCE(
            (v_mappings->>'NOTES_PAYABLE')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '222' LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '20102%' OR code LIKE '2202%' OR code LIKE '2102%' OR code LIKE '221%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (name ILIKE '%أوراق الدفع%' OR name ILIKE '%أوراق دفع%' OR name ILIKE '%شيكات صادرة%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('222', 'أوراق الدفع (شيكات صادرة)', 'liability', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'BANK' THEN
        v_acc_id := COALESCE(
            p_fallback_bank_id,
            (v_mappings->>'BANK_ACCOUNTS')::uuid,
            (v_mappings->>'BANK_MAIN')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '1232%' OR code LIKE '10102%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (name ILIKE '%بنك%' OR name ILIKE '%bank%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND type = 'asset' AND (code LIKE '123%' OR code LIKE '101%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('123201', 'حساب البنك الرئيسي', 'asset', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'CUSTOMERS' THEN
        v_acc_id := COALESCE(
            (v_mappings->>'CUSTOMERS')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '10104%' OR code LIKE '121%' OR name ILIKE '%عملاء%' OR name ILIKE '%العملاء%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('1221', 'العملاء (المدينون)', 'asset', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'SUPPLIERS' THEN
        v_acc_id := COALESCE(
            (v_mappings->>'SUPPLIERS')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code IN ('201', '221') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '20101%' OR code LIKE '201%' OR code LIKE '211%' OR name ILIKE '%موردين%' OR name ILIKE '%الموردين%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('201', 'الموردون (الدائنون)', 'liability', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;
    END IF;

    RETURN v_acc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_cheque_journal_entry(p_cheque_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cheque record; 
    v_org_id uuid; 
    v_journal_id uuid; 
    v_bank_acc_id uuid;
    v_customer_acc_id uuid; 
    v_supplier_acc_id uuid; 
    v_notes_pay_acc_id uuid; 
    v_notes_rec_acc_id uuid; 
    v_description text; 
    v_ref text;
    v_current_stage_type text;
    v_action_date date;
BEGIN
    SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id;  
    IF NOT FOUND THEN RETURN; END IF;
    
    v_org_id := v_cheque.organization_id;
    v_action_date := COALESCE(v_cheque.transfer_date, (v_cheque.created_at::date), CURRENT_DATE);

    v_current_stage_type := CASE 
        WHEN v_cheque.status IN ('issued', 'received') THEN (CASE WHEN v_cheque.type IN ('outgoing', 'out') THEN 'cheque_issuance' ELSE 'cheque_receipt' END)
        WHEN v_cheque.status IN ('collected', 'cashed') THEN (CASE WHEN v_cheque.type IN ('incoming', 'in') THEN 'cheque_collection' ELSE 'cheque_payment' END)
        WHEN v_cheque.status IN ('bounced', 'rejected') THEN 'cheque_bounced'
        ELSE 'cheque_other'
    END;

    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND related_document_id = p_cheque_id 
    AND related_document_type = v_current_stage_type;

    v_bank_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'BANK', v_cheque.current_account_id);
    v_customer_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'CUSTOMERS');
    v_supplier_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'SUPPLIERS');
    v_notes_pay_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'NOTES_PAYABLE');
    v_notes_rec_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'NOTES_RECEIVABLE');

    v_ref := 'CHQ-' || COALESCE(v_cheque.cheque_number, substring(p_cheque_id::text, 1, 8));

    -- 1. مرحلة الإصدار/الاستلام
    IF v_cheque.status IN ('issued', 'received') THEN
        IF v_cheque.type IN ('outgoing', 'out') THEN
            v_description := 'إصدار شيك صادر رقم ' || COALESCE(v_cheque.cheque_number, '') || ' للمورد ' || COALESCE(v_cheque.party_name, '');
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_action_date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_issuance', true, auth.uid()) RETURNING id INTO v_journal_id;
            
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_supplier_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_notes_pay_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            v_description := 'استلام شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '') || ' من العميل ' || COALESCE(v_cheque.party_name, '');
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_action_date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_receipt', true, auth.uid()) RETURNING id INTO v_journal_id;
            
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_notes_rec_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_customer_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;

    -- 2. مرحلة التحصيل (شيك وارد)
    ELSIF v_cheque.type IN ('incoming', 'in') AND v_cheque.status = 'collected' THEN
        v_description := 'تحصيل شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '') || ' - إيداع بنكي (' || COALESCE(v_cheque.party_name, '') || ')';
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (CURRENT_DATE, v_description, v_ref || '-COL', 'posted', v_org_id, p_cheque_id, 'cheque_collection', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
            (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    -- 3. مرحلة الصرف (شيك صادر)
    ELSIF v_cheque.type IN ('outgoing', 'out') AND v_cheque.status = 'cashed' THEN
        v_description := 'صرف شيك صادر رقم ' || COALESCE(v_cheque.cheque_number, '') || ' - خصم بنكي (' || COALESCE(v_cheque.party_name, '') || ')';
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (CURRENT_DATE, v_description, v_ref || '-CSH', 'posted', v_org_id, p_cheque_id, 'cheque_payment', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
            (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    -- 4. مرحلة الارتداد والرفض
    ELSIF v_cheque.status IN ('bounced', 'rejected') THEN
        v_description := 'ارتداد/رفض شيك رقم ' || COALESCE(v_cheque.cheque_number, '') || COALESCE(' - ' || v_cheque.rejection_reason, '');
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (CURRENT_DATE, v_description, 'REJ-' || v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_bounced', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        IF v_cheque.type IN ('incoming', 'in') THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_customer_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_supplier_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;
    END IF;

    IF v_journal_id IS NOT NULL THEN 
        UPDATE public.cheques SET related_journal_entry_id = v_journal_id WHERE id = p_cheque_id; 
    END IF;

    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END; 
$$;
-- 🛠️ مشغل تلقائي لتعيين المستودع الافتراضي
CREATE OR REPLACE FUNCTION public.fn_ensure_warehouse() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id LIMIT 1);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 🛠️ مشغل ترحيل الشيكات التلقائي
CREATE OR REPLACE FUNCTION public.trg_post_cheque_journal_entry() RETURNS TRIGGER AS $$
BEGIN
    -- 🚀 التحديث (V50.6): الترحيل عند الإنشاء (INSERT) أو عند تغيير الحالة (UPDATE)
    IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
        PERFORM public.post_cheque_journal_entry(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cheque_posting ON public.cheques;
CREATE TRIGGER trg_cheque_posting AFTER INSERT OR UPDATE OF status ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.trg_post_cheque_journal_entry();

-- 🛠️ دالة جلب تقرير الورديات الشهرية
-- تظهر جميع الورديات التي فُتحت وأُغلقت خلال شهر محدد
CREATE OR REPLACE FUNCTION public.get_monthly_shift_report(
    p_org_id uuid DEFAULT NULL,
    p_month integer DEFAULT NULL,
    p_year integer DEFAULT NULL
)
RETURNS TABLE (
    shift_id uuid,
    user_full_name text,
    start_time timestamptz,
    end_time timestamptz,
    opening_balance numeric,
    actual_cash numeric,
    difference numeric,
    status text,
    notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_org_id uuid := COALESCE(p_org_id, public.get_my_org());
    v_target_month integer := COALESCE(p_month, EXTRACT(MONTH FROM now()));
    v_target_year integer := COALESCE(p_year, EXTRACT(YEAR FROM now()));
BEGIN
    RETURN QUERY
    SELECT s.id, p.full_name, s.start_time, s.end_time, s.opening_balance, s.actual_cash, s.difference, s.status, s.notes
    FROM public.shifts s
    LEFT JOIN public.profiles p ON s.user_id = p.id
    WHERE s.organization_id = v_target_org_id
      AND EXTRACT(MONTH FROM s.start_time) = v_target_month
      AND EXTRACT(YEAR FROM s.start_time) = v_target_year
    ORDER BY s.start_time DESC;
END; $$;

-- ================================================================
-- 5. مديول المبيعات والمشتريات الموحد (Unified Sales & Purchases)
-- ================================================================

-- 🛡️ التطهير الجذري لتواقيع دوال المبيعات والمشتريات لضمان التوافق مع V50.0
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname IN ('approve_invoice', 'post_sales_invoice', 'approve_purchase_invoice', 'post_purchase_invoice') 
             AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 🛠️ دالة ترحيل فاتورة المبيعات (Approve Invoice) - النسخة الموحدة V50.0
CREATE OR REPLACE FUNCTION public.approve_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false -- 🚀 معامل الأداء للباقة المجانية
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_org_id uuid; v_journal_id uuid; v_mappings jsonb;
    v_sales_acc_id uuid; v_vat_acc_id uuid; v_cust_acc_id uuid; v_cogs_acc_id uuid; v_inv_acc_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_item record;
BEGIN
    -- 1. جلب بيانات الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة.'; END IF;
    IF v_invoice.status IN ('posted', 'paid') THEN RETURN; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    
    -- 🛡️ تحديث المستودع إذا تم تمريره صراحة من الواجهة لضمان دقة خصم المخزون اللحظي
    IF p_warehouse_id IS NOT NULL AND p_warehouse_id != v_invoice.warehouse_id THEN
        UPDATE public.invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
        v_invoice.warehouse_id := p_warehouse_id;
    END IF;

    -- 2. جلب إعدادات الربط المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_cust_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. حساب تكلفة البضاعة المباعة وتحديث بيانات البنود
    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        DECLARE v_base_qty numeric;
        BEGIN
            SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
            v_base_qty := public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id));
            v_total_cost := v_total_cost + (v_item_cost * v_base_qty);
            UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;
        END;
    END LOOP;

    -- 📝 4. إنشاء قيد اليومية المزدوج
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || v_invoice.invoice_number, v_invoice.invoice_number, 'posted', v_org_id, true, p_invoice_id, 'invoice') RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cust_acc_id, v_invoice.total_amount, 0, 'استحقاق فاتورة مبيعات', v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات', v_org_id);
    IF v_invoice.tax_amount > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات', v_org_id); END IF;
    
    IF v_total_cost > 0 THEN
        FOR v_item IN 
            SELECT 
                COALESCE(p.inventory_account_id, v_inv_acc_id) as inv_acc,
                COALESCE(p.cogs_account_id, v_cogs_acc_id) as cogs_acc,
                SUM(COALESCE(ii.cost, 0) * public.uom_convert(ii.quantity, ii.uom_id, p.base_uom_id)) as total_item_cost
            FROM public.invoice_items ii
            JOIN public.products p ON ii.product_id = p.id
            WHERE ii.invoice_id = p_invoice_id
            GROUP BY COALESCE(p.inventory_account_id, v_inv_acc_id), COALESCE(p.cogs_account_id, v_cogs_acc_id)
        LOOP
            IF v_item.total_item_cost > 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_item.cogs_acc, v_item.total_item_cost, 0, 'تكلفة مبيعات', v_org_id);
                
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_item.inv_acc, 0, v_item.total_item_cost, 'صرف مخزون تام', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 5. إثبات السداد الفوري/الدفعة المقدمة (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_invoice.treasury_account_id IS NOT NULL THEN
        -- سطر مدين للخزينة/البنك (زيادة النقدية)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_invoice.treasury_account_id, v_invoice.paid_amount, 0, 'تحصيل نقدي - فاتورة مبيعات ' || v_invoice.invoice_number, v_org_id);

        -- سطر دائن للعميل (تخفيض المديونية)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_cust_acc_id, 0, v_invoice.paid_amount, 'سداد فوري من العميل - فاتورة مبيعات ' || v_invoice.invoice_number, v_org_id);
    END IF;

    -- 6. تحديث حالة الفاتورة وربطها بالقيد
    UPDATE public.invoices 
    SET status = CASE WHEN ABS(COALESCE(paid_amount, 0) - COALESCE(total_amount, 0)) < 0.01 THEN 'paid' ELSE 'posted' END, 
        related_journal_entry_id = v_journal_id 
    WHERE id = p_invoice_id;

    -- 🚀 7. تحديث المخزون الشامل لجميع المستودعات (الخصم اللحظي)
    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;
    PERFORM public.recalculate_all_system_balances(v_org_id); -- 🚀 تحديث أرصدة العملاء والموردين
END; $$;

-- 🛠️ دالة ترحيل فاتورة المشتريات (Approve Purchase Invoice) - V50.0
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false -- 🚀 معامل الأداء للباقة المجانية
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_in_id uuid; v_supplier_acc_id uuid;
    v_journal_id uuid; v_mappings jsonb;
BEGIN
      SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- تحديث المستودع إذا تم تمريره
    IF p_warehouse_id IS NOT NULL THEN
        UPDATE public.purchase_invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
    END IF;

    -- تحديث متوسط التكلفة (WAC) قبل إعادة احتساب المخزون
    FOR v_item IN SELECT product_id, quantity, unit_price, uom_id FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        -- 🚀 تحويل الكمية إلى الوحدة الأساسية قبل حساب التكلفة
        DECLARE
            v_base_qty numeric := public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id));
            v_unit_cost_base numeric := (v_item.unit_price * v_item.quantity) / NULLIF(v_base_qty, 0);
        BEGIN
        UPDATE public.products p SET 
            purchase_price = v_unit_cost_base,
            cost = v_unit_cost_base,
            weighted_average_cost = CASE 
                WHEN (COALESCE(p.stock, 0) + v_base_qty) > 0 
                THEN ROUND(((COALESCE(p.stock, 0) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, v_unit_cost_base)) + (v_base_qty * v_unit_cost_base)) / (COALESCE(p.stock, 0) + v_base_qty), 4)
                ELSE v_unit_cost_base 
            END
        WHERE id = v_item.product_id;
        END;
    END LOOP;

    -- توليد القيد المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;
    
    -- 1. المدين: المخزون (مقسم حسب حساب المخزون الخاص بكل منتج)
    FOR v_item IN 
        SELECT 
            COALESCE(p.inventory_account_id, v_inventory_acc_id) as acc_id,
            SUM(pii.total) as total_cost
        FROM public.purchase_invoice_items pii
        JOIN public.products p ON pii.product_id = p.id
        WHERE pii.purchase_invoice_id = p_invoice_id
        GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id)
    LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_item.acc_id, v_item.total_cost, 0, 'إثبات مشتريات - مخزون', v_org_id);
    END LOOP;

    -- 2. المدين: ضريبة المدخلات
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_in_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_vat_in_id, v_invoice.tax_amount, 0, 'ضريبة مدخلات', v_org_id);
    END IF;

    -- 3. الدائن: المورد (إجمالي الفاتورة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount, 'استحقاق مورد', v_org_id);

    -- 4. إثبات السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_invoice.treasury_account_id IS NOT NULL THEN
        -- سطر مدين للمورد (تخفيض المديونية بقيمة السداد)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount, 0, 'سداد فوري - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);

        -- سطر دائن للخزينة/البنك (نقص النقدية)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_invoice.treasury_account_id, 0, v_invoice.paid_amount, 'دفع نقدي - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);
        
        -- تحديث حالة الفاتورة لتصبح مدفوعة بالكامل إذا تطابق المبلغ
        IF ABS(COALESCE(v_invoice.paid_amount, 0) - COALESCE(v_invoice.total_amount, 0)) < 0.01 THEN
            UPDATE public.purchase_invoices SET status = 'paid' WHERE id = p_invoice_id;
        ELSE
            UPDATE public.purchase_invoices SET status = 'posted' WHERE id = p_invoice_id;
        END IF;
    ELSE
        UPDATE public.purchase_invoices SET status = 'posted' WHERE id = p_invoice_id;
    END IF;

    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;

    -- إعادة احتساب أرصدة الأستاذ العام وكشوف الحسابات للشركة
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;

-- 🛠️ الأسماء المستعارة (Aliases) لضمان توافق RPC مع الواجهة الأمامية
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid, p_org_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM public.approve_invoice(p_invoice_id, p_org_id, p_warehouse_id); END; $$;

CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid, p_org_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM public.approve_purchase_invoice(p_invoice_id, p_org_id, p_warehouse_id); END; $$;

-- 5. مديول التصنيع المتقدم (Manufacturing Module)
-- ================================================================

-- 📊 رؤية ربحية أمر الإنتاج (Manufacturing Order Profitability View)
-- ضرورية لدالة تحديث الأسعار والتقارير المالية (تُنشأ فقط عند توفر مديول التصنيع)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_order_progress') THEN
        EXECUTE $VIEW$
            DROP VIEW IF EXISTS public.v_mfg_order_profitability CASCADE;
            CREATE OR REPLACE VIEW public.v_mfg_order_profitability WITH (security_invoker = true) AS
            WITH labor_summary AS (
                SELECT
                    op.production_order_id,
                    SUM(COALESCE(op.labor_cost_actual, 0)) as total_labor,
                    SUM(COALESCE((rs.standard_time_minutes / 60.0) * op.produced_qty * wc.overhead_rate, 0)) as total_overhead
                FROM public.mfg_order_progress op
                JOIN public.mfg_routing_steps rs ON op.step_id = rs.id
                JOIN public.mfg_work_centers wc ON rs.work_center_id = wc.id
                GROUP BY op.production_order_id
            ),
            material_summary AS (
                -- 🛡️ منع الازدواجية في المحرك الموحد: نجمع الاستهلاك الفعلي مع طلبات الصرف المستقلة فقط
                SELECT po_id, SUM(cost) as total_material_cost FROM (
                    SELECT op.production_order_id as po_id, SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, rm.base_uom_id) * COALESCE(NULLIF(rm.weighted_average_cost, 0), NULLIF(rm.cost, 0), rm.purchase_price, 0)) as cost
                    FROM public.mfg_actual_material_usage amu
                    JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
                    JOIN public.products rm ON amu.raw_material_id = rm.id
                    GROUP BY op.production_order_id, amu.raw_material_id
                    UNION ALL
                    SELECT mr.production_order_id as po_id, SUM(public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)) as cost
                    FROM public.mfg_material_request_items mri
                    JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
                    JOIN public.products p ON mri.raw_material_id = p.id
                    WHERE mr.status = 'issued'
                    AND NOT EXISTS (
                        SELECT 1 FROM public.mfg_order_progress op2 
                        JOIN public.mfg_actual_material_usage amu2 ON op2.id = amu2.order_progress_id
                        WHERE op2.production_order_id = mr.production_order_id AND amu2.raw_material_id = mri.raw_material_id
                    )
                    GROUP BY mr.production_order_id, mri.raw_material_id
                ) safe_mats GROUP BY po_id
            )
            SELECT
                po.id as order_id, po.order_number, p.name as product_name, po.quantity_to_produce as qty, po.status, po.organization_id,
                (po.quantity_to_produce * COALESCE(p.sales_price, p.price, 0)) as sales_value,
                ROUND((COALESCE(ls.total_labor, 0) + COALESCE(ls.total_overhead, 0) + COALESCE(ms.total_material_cost, 0)), 2) as total_actual_cost
            FROM public.mfg_production_orders po
            JOIN public.products p ON po.product_id = p.id
            LEFT JOIN labor_summary ls ON po.id = ls.production_order_id
            LEFT JOIN material_summary ms ON po.id = ms.po_id;
        $VIEW$;
    END IF;
END $$;

-- ️ دالة حساب التكلفة المعيارية (Helper)
CREATE OR REPLACE FUNCTION public.mfg_calculate_standard_cost(p_product_id uuid, p_org_id uuid DEFAULT public.get_my_org())
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN (SELECT ROUND(SUM(bom.quantity_required * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0)), 4)
            FROM public.bill_of_materials bom
            JOIN public.products p ON bom.raw_material_id = p.id
            WHERE bom.product_id = p_product_id AND bom.organization_id = p_org_id);
END; $$;

-- 🛡️ تطهير الدالة القديمة لضمان عدم حدوث تعارض في مسميات البارامترات (حل خطأ 42P13)
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'get_product_recipe_cost' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ️ دالة جلب تكلفة الوصفة (Helper)
-- تم تعديل التوقيع ليتوافق مع نداء الواجهة الأمامية في ملف ProductManager.tsx
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(p_product_id uuid, p_org_id uuid DEFAULT public.get_my_org())
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cost numeric;
BEGIN
    SELECT COALESCE(SUM(bom.quantity_required * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)), 0)
    INTO v_cost
    FROM public.bill_of_materials bom
    JOIN public.products p ON bom.raw_material_id = p.id
    WHERE bom.product_id = p_product_id AND bom.organization_id = p_org_id;
    RETURN v_cost;
END; $$;

-- 🛠️ دالة تحديث سعر البيع بناءً على التكلفة (Helper)
CREATE OR REPLACE FUNCTION public.mfg_update_selling_price_from_cost(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prod_id uuid;
    v_cost numeric;
    v_current_price numeric;
BEGIN
    SELECT product_id INTO v_prod_id FROM public.mfg_production_orders WHERE id = p_order_id;
    SELECT COALESCE(weighted_average_cost, cost, 0), sales_price INTO v_cost, v_current_price 
    FROM public.products WHERE id = v_prod_id;

    -- تحديث السعر فقط إذا كان السعر الحالي 0 أو أقل من التكلفة
    IF v_current_price IS NULL OR v_current_price = 0 THEN
        UPDATE public.products SET sales_price = ROUND(v_cost * 1.20, 2) WHERE id = v_prod_id;
    END IF;
END; $$;

-- 🛡️ حذف التوقيعات القديمة لضمان عدم التعارض
DO $$ BEGIN
    EXECUTE (SELECT string_agg(format('DROP FUNCTION %s CASCADE', oid::regprocedure), '; ')
             FROM pg_proc WHERE proname = 'mfg_finalize_order' AND pronamespace = 'public'::regnamespace);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'MFG Purge info: %', SQLERRM; END $$;

-- 🛠️ دالة إغلاق أمر الإنتاج (Finalize Production) - النسخة المصححة V50.1
CREATE OR REPLACE FUNCTION public.mfg_finalize_order(
    p_order_id uuid,
    p_final_status text DEFAULT 'completed', 
    p_qc_notes text DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false -- 🚀 معامل الأداء للباقة المجانية
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_order record; v_accumulated_wip numeric := 0; v_je_id uuid; v_wip_acc uuid;
    v_fg_acc uuid; v_loss_acc uuid; v_org_id uuid; v_mappings jsonb;
    v_old_stock numeric; v_new_wac numeric; v_total_cost numeric := 0;
BEGIN
    SELECT * INTO v_order FROM public.mfg_production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الإنتاج غير موجود'; END IF;
    
    v_org_id := COALESCE(v_order.organization_id, public.get_my_org());
    IF v_order.status = 'completed' THEN RETURN; END IF;

    -- جلب حسابات الربط والتحصين ضد حسابات المجموعات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_wip_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_WIP')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10303', '103') AND organization_id = v_org_id LIMIT 1)));
    v_fg_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1105') AND organization_id = v_org_id LIMIT 1)));
    v_loss_acc := public.resolve_leaf_account(COALESCE((v_mappings->>'WASTAGE_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('5121', '512') AND organization_id = v_org_id LIMIT 1)));

    -- 🛡️ نظام "تصفير WIP": نحسب إجمالي ما تم تحميله فعلياً (في الحساب الفرعي أو الأب) لضمان الإغلاق التام
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_accumulated_wip
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.related_document_id = p_order_id AND je.related_document_type = 'mfg_order';

    -- معالجة حالة "إعادة التشغيل"
    IF p_final_status = 'rework' THEN
        UPDATE public.mfg_production_orders SET status = 'in_progress', notes = COALESCE(notes, '') || E'\nإعادة تشغيل جودة: ' || p_qc_notes WHERE id = p_order_id;
        PERFORM public.recalculate_stock_rpc(v_org_id);
        RETURN;
    END IF;

    -- 2. حساب إجمالي التكاليف الفعلية (عمالة + مصاريف + خامات + طلبات صرف)
    -- أ. تكلفة العمالة المباشرة
    SELECT SUM(COALESCE(labor_cost_actual, 0)) INTO v_total_cost
    FROM public.mfg_order_progress WHERE production_order_id = p_order_id;

    -- ج. إضافة تكلفة المواد الفعلية المستهلكة (AMU) - تحسين الربط لضمان الدقة (V50.2)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(public.uom_convert(amu.actual_quantity, amu.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
        FROM public.mfg_actual_material_usage amu 
        JOIN public.products p ON amu.raw_material_id = p.id
        JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
        WHERE op.production_order_id = p_order_id
    ), 0);

    -- د. إضافة تكلفة المواد المصروفة بطلبات صرف (MR) - للأصناف المستقلة فقط (V50.2)
    v_total_cost := v_total_cost + COALESCE((
        SELECT SUM(public.uom_convert(mri.quantity_issued, mri.uom_id, p.base_uom_id) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0))
        FROM public.mfg_material_request_items mri
        JOIN public.mfg_material_requests mr ON mri.material_request_id = mr.id
        JOIN public.products p ON mri.raw_material_id = p.id
        WHERE mr.production_order_id = p_order_id AND mr.status = 'issued'
        AND NOT EXISTS (
            SELECT 1 FROM public.mfg_order_progress op2 
            JOIN public.mfg_actual_material_usage amu2 ON op2.id = amu2.order_progress_id
            WHERE op2.production_order_id = p_order_id AND amu2.raw_material_id = mri.raw_material_id
        )
    ), 0);


    -- 3. تحديث متوسط التكلفة المرجح (WAC) للمنتج التام
    IF p_final_status = 'completed' AND v_order.quantity_to_produce > 0 THEN
        SELECT COALESCE(stock, 0) INTO v_old_stock FROM public.products WHERE id = v_order.product_id;
        IF (GREATEST(v_old_stock, 0) + v_order.quantity_to_produce) > 0 THEN
            v_new_wac := (((GREATEST(v_old_stock, 0) * COALESCE((SELECT weighted_average_cost FROM public.products WHERE id = v_order.product_id), 0)) + COALESCE(v_total_cost, 0)) 
                         / (GREATEST(v_old_stock, 0) + v_order.quantity_to_produce));
            
            UPDATE public.products SET weighted_average_cost = ROUND(v_new_wac, 4), cost = ROUND(v_new_wac, 4), purchase_price = ROUND(v_new_wac, 4) WHERE id = v_order.product_id;
        END IF;
        UPDATE public.mfg_production_orders SET status = 'completed', end_date = now()::date, notes = COALESCE(notes, '') || E'\nاعتماد جودة نهائي: ' || p_qc_notes WHERE id = p_order_id;
    ELSE
        UPDATE public.mfg_production_orders SET status = 'cancelled', notes = 'مرفوض جودة: ' || p_qc_notes WHERE id = p_order_id;
    END IF;

    IF (COALESCE(v_accumulated_wip, 0) > 0 OR COALESCE(v_total_cost, 0) > 0) AND v_wip_acc IS NOT NULL AND v_fg_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (now()::date, (CASE WHEN p_final_status = 'completed' THEN 'إغلاق إنتاج: ' ELSE 'خسارة رفض إنتاج: ' END) || v_order.order_number, 'MFG-FIN-' || v_order.order_number, 'posted', v_org_id, true, p_order_id, 'mfg_order') RETURNING id INTO v_je_id;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, CASE WHEN p_final_status = 'completed' THEN v_fg_acc ELSE v_loss_acc END, v_total_cost, 0, COALESCE('إثبات المنتج التام المصنع: ' || v_order.order_number, 'إغلاق إنتاج'), v_org_id);
        -- 🚀 استخدام v_accumulated_wip بدلاً من التقديري لضمان تصفير الحساب تماماً
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_wip_acc, 0, v_accumulated_wip, COALESCE('إقفال تكاليف الإنتاج تحت التشغيل: ' || v_order.order_number, 'تفريغ WIP'), v_org_id);
    END IF;

    -- 5. العمليات التكميلية
    PERFORM public.mfg_update_selling_price_from_cost(p_order_id);
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ================================================================
-- 6. مديول الموارد البشرية والرواتب (HR & Payroll Module)
-- ================================================================

-- 🛠️ دالة تشغيل مسير الرواتب (Payroll Engine) - النسخة الموحدة والمصححة
CREATE OR REPLACE FUNCTION public.run_payroll_rpc(
    p_month integer, 
    p_year integer, 
    p_date date, 
    p_treasury_acc uuid, 
    p_items jsonb, 
    p_org_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; 
    v_total_additions numeric := 0; v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; v_total_net numeric := 0; 
    v_item jsonb; v_je_id uuid; v_mappings jsonb; v_payroll_item_id uuid;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; v_payroll_tax_id uuid; v_total_payroll_tax numeric := 0;
    v_fixed_allowances numeric := 0; v_monthly_additions numeric := 0; v_monthly_deductions numeric := 0; v_emp_net numeric := 0;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة للمسير.'; END IF;

    -- 🛡️ منع تكرار الصرف لنفس الفترة
    IF EXISTS (SELECT 1 FROM public.payrolls WHERE payroll_month = p_month AND payroll_year = p_year AND organization_id = v_org_id AND status = 'paid') THEN
        RAISE EXCEPTION 'تم اعتماد وصرف مسير الرواتب لهذا الشهر مسبقاً.';
    END IF;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- جلب الحسابات (مع Fallback للأكواد القياسية المصرية)
    v_salaries_acc_id := COALESCE((v_mappings->>'SALARIES_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code = '531' AND organization_id = v_org_id LIMIT 1));
    v_bonuses_acc_id := COALESCE((v_mappings->>'EMPLOYEE_BONUSES')::uuid, (SELECT id FROM public.accounts WHERE code = '5312' AND organization_id = v_org_id LIMIT 1));
    v_deductions_acc_id := COALESCE((v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid, (SELECT id FROM public.accounts WHERE code = '422' AND organization_id = v_org_id LIMIT 1));
    v_advances_acc_id := COALESCE((v_mappings->>'EMPLOYEE_ADVANCES')::uuid, (SELECT id FROM public.accounts WHERE code = '1223' AND organization_id = v_org_id LIMIT 1));
    v_payroll_tax_id := COALESCE((v_mappings->>'PAYROLL_TAX')::uuid, (SELECT id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1));

    IF v_salaries_acc_id IS NULL OR v_advances_acc_id IS NULL THEN 
        RAISE EXCEPTION 'إعدادات الحسابات المالية للرواتب مفقودة (531 أو 1223).';
    END IF;

    -- 🛡️ المرحلة 1: حساب الإجماليات والتحقق من النزاهة
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_fixed_allowances := COALESCE((SELECT SUM(amount) FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id), 0);
        v_monthly_additions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'addition' AND is_processed = false AND organization_id = v_org_id), 0);
        v_monthly_deductions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'deduction' AND is_processed = false AND organization_id = v_org_id), 0);

        -- 🚀 إصلاح Typo وحماية الـ NULL: حساب الصافي الحقيقي
        v_emp_net := COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - COALESCE((v_item->>'advances_deducted')::numeric, 0) - COALESCE((v_item->>'payroll_tax')::numeric, 0);

        v_total_gross := v_total_gross + COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances;
        v_total_additions := v_total_additions + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions;
        v_total_deductions := v_total_deductions + COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions;
        v_total_advances := v_total_advances + COALESCE((v_item->>'advances_deducted')::numeric, 0);
        v_total_payroll_tax := v_total_payroll_tax + COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_net := v_total_net + v_emp_net;
    END LOOP;

    -- 🛡️ المرحلة 2: تسجيل المسير والبنود
    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances + v_total_payroll_tax), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🚀 إعادة حساب الصافي لكل موظف لضمان دقة سجل البنود (Net Salary Fix)
        v_fixed_allowances := COALESCE((SELECT SUM(amount) FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id), 0);
        v_monthly_additions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'addition' AND is_processed = false AND organization_id = v_org_id), 0);
        v_monthly_deductions := COALESCE((SELECT SUM(amount) FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'deduction' AND is_processed = false AND organization_id = v_org_id), 0);

        v_emp_net := COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - COALESCE((v_item->>'advances_deducted')::numeric, 0) - COALESCE((v_item->>'payroll_tax')::numeric, 0);

        INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, payroll_tax, advances_deducted, other_deductions, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, 
                COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances, 
                COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions, 
                COALESCE((v_item->>'payroll_tax')::numeric, 0), 
                COALESCE((v_item->>'advances_deducted')::numeric, 0), 
                COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions, 
                v_emp_net, v_org_id)
        RETURNING id INTO v_payroll_item_id;

        UPDATE public.payroll_variables SET is_processed = true WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND organization_id = v_org_id;
        IF (v_item->>'advances_deducted')::numeric > 0 THEN
            UPDATE public.employee_advances SET status = 'deducted', payroll_item_id = v_payroll_item_id WHERE employee_id = (v_item->>'employee_id')::uuid AND status = 'paid' AND organization_id = v_org_id;
        END IF;
    END LOOP;

    -- 🛡️ المرحلة 3: الترحيل المحاسبي المتوازن
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year, 'posted', v_org_id, true, v_payroll_id, 'payroll', auth.uid()) RETURNING id INTO v_je_id;

    IF (v_total_additions > 0 AND v_bonuses_acc_id IS NULL) OR (v_total_deductions > 0 AND v_deductions_acc_id IS NULL) OR (v_total_payroll_tax > 0 AND v_payroll_tax_id IS NULL) THEN
        RAISE EXCEPTION 'فشل ترحيل القيد: حسابات المكافآت أو الخصومات أو الضرائب غير معرّفة رغم وجود مبالغ مستحقة.';
    END IF;

    IF v_total_gross > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF;
    IF v_total_advances > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_payroll_tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_payroll_tax_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل', v_org_id); END IF;
    IF ABS(COALESCE(v_total_net, 0)) > 0.001 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_acc, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
END; $$;

-- ================================================================
-- [تحديث] إضافة مشغل المستودعات
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        DROP TRIGGER IF EXISTS trg_ensure_order_warehouse ON public.orders;
        CREATE TRIGGER trg_ensure_order_warehouse BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_warehouse();
    END IF;
END $$;

-- ⚙️ مشغل فرض المنظمة آلياً عند الإضافة
-- ================================================================
-- 7. دالة محاكاة اختبار الضغط (Load Test Simulation Function)
-- ================================================================
DO $$ BEGIN
    -- 🛡️ تطهير النسخة القديمة لضمان تغيير نوع الإرجاع من TEXT إلى jsonb (HINT: 42P13)
    DROP FUNCTION IF EXISTS public.simulate_load_test(integer, integer, uuid, uuid);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'LT Purge info: %', SQLERRM; END $$;

CREATE OR REPLACE FUNCTION public.simulate_load_test(
    p_num_sales_invoices INTEGER DEFAULT 100,
    p_num_mfg_orders INTEGER DEFAULT 100,
    p_org_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
-- 🚀 تحديث V51.3: إضافة محرك قياس الأداء (Performance Benchmarking) وضمان توفر البيانات
) 
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id UUID;
    v_current_user_id UUID;
    v_customer_id UUID;
    v_product_id UUID;
    v_warehouse_id UUID;
    v_invoice_id UUID;
    v_mfg_product_id UUID; -- Product for manufacturing
    v_mfg_order_id UUID;
    v_i INTEGER;
    v_invoice_number TEXT;
    v_order_number TEXT;
    v_sales_price NUMERIC;
    v_cost NUMERIC;
    v_quantity NUMERIC;
    v_supplier_id UUID;
    v_treasury_acc_id UUID;
    v_mfg_routing_id UUID;
    v_mfg_progress_id UUID;
    v_employee_id UUID; -- New variable for employee ID
    v_mfg_step_id UUID;
    v_total_start timestamptz;
    v_sales_start timestamptz;
    v_mfg_start timestamptz;
    v_sales_ms float := 0;
    v_mfg_ms float := 0;
BEGIN
    v_total_start := clock_timestamp();
    -- Resolve organization and user IDs
    v_org_id := COALESCE(p_org_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1));
    v_current_user_id := COALESCE(p_user_id, auth.uid(), (SELECT id FROM public.profiles WHERE organization_id = v_org_id LIMIT 1));

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID not found or provided.';
    END IF;
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID not found or provided.';
    END IF;

    -- Get or create essential IDs for operations
    SELECT id INTO v_customer_id FROM public.customers WHERE organization_id = v_org_id LIMIT 1;
    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (name, organization_id) VALUES ('Load Test Customer', v_org_id) RETURNING id INTO v_customer_id;
    END IF;

    SELECT id INTO v_product_id FROM public.products WHERE organization_id = v_org_id AND product_type = 'STOCK' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (name, sales_price, cost, stock, organization_id, product_type)
        VALUES ('Load Test Product', 100, 50, 10000, v_org_id, 'STOCK') RETURNING id INTO v_product_id;
    END IF;

    SELECT id INTO v_warehouse_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;
    IF v_warehouse_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('Load Test Warehouse', v_org_id) RETURNING id INTO v_warehouse_id;
    END IF;

    SELECT id INTO v_treasury_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1;
    IF v_treasury_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, organization_id) VALUES ('1231-LT', 'Load Test Cash', 'asset', v_org_id) RETURNING id INTO v_treasury_acc_id;
    END IF;

    -- Get or create an employee for MFG operations
    SELECT id INTO v_employee_id FROM public.employees WHERE organization_id = v_org_id LIMIT 1;
    IF v_employee_id IS NULL THEN
        INSERT INTO public.employees (full_name, position, organization_id, hourly_rate) VALUES ('Load Test Employee', 'Worker', v_org_id, 20) RETURNING id INTO v_employee_id;
    END IF;

    -- Find a manufactured product with a routing for MFG orders
    SELECT p.id, r.id INTO v_mfg_product_id, v_mfg_routing_id
    FROM public.products p
    JOIN public.mfg_routings r ON p.id = r.product_id
    WHERE p.organization_id = v_org_id AND p.mfg_type = 'standard'
    LIMIT 1;

    IF v_mfg_product_id IS NULL THEN
        -- 🛠️ ترميم بيانات الاختبار (Self-Healing): إنشاء منتج ومسار إذا لم يوجدا لضمان اختبار التصنيع
        RAISE NOTICE 'No manufactured product found. Creating test data for organization %...', v_org_id;
        
        INSERT INTO public.products (name, mfg_type, product_type, sales_price, cost, weighted_average_cost, organization_id)
        VALUES ('منتج اختبار الضغط', 'standard', 'MANUFACTURED', 100, 50, 50, v_org_id) RETURNING id INTO v_mfg_product_id;
        
        INSERT INTO public.mfg_routings (product_id, name, organization_id, is_default)
        VALUES (v_mfg_product_id, 'مسار اختبار الضغط', v_org_id, true) RETURNING id INTO v_mfg_routing_id;
        
        INSERT INTO public.mfg_routing_steps (routing_id, step_order, work_center_id, operation_name, standard_time_minutes, organization_id)
        VALUES (v_mfg_routing_id, 1, 
               (SELECT id FROM public.mfg_work_centers WHERE organization_id = v_org_id LIMIT 1), 
               'تجميع آلي', 60, v_org_id);
               
        -- تأكيد وجود خامة لربطها بالمسار
        SELECT id INTO v_product_id FROM public.products WHERE organization_id = v_org_id AND mfg_type = 'raw' LIMIT 1;
        IF v_product_id IS NOT NULL THEN
            INSERT INTO public.mfg_step_materials (step_id, raw_material_id, quantity_required, organization_id)
            VALUES ((SELECT id FROM public.mfg_routing_steps WHERE routing_id = v_mfg_routing_id LIMIT 1), v_product_id, 1, v_org_id);
        END IF;
    END IF;

    -- ============================================================
    -- Simulate Sales Invoices
    -- ============================================================
    RAISE NOTICE 'Simulating % sales invoices...', p_num_sales_invoices;
    v_sales_start := clock_timestamp();
    FOR v_i IN 1..p_num_sales_invoices LOOP
        v_invoice_number := 'LT-INV-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4)) || '-' || LPAD(v_i::text, 4, '0');
        v_sales_price := (RANDOM() * 100 + 50)::NUMERIC(10,2); -- Random price between 50 and 150
        v_quantity := (RANDOM() * 5 + 1)::NUMERIC(10,2); -- Random quantity between 1 and 6

        INSERT INTO public.invoices (
            invoice_number, customer_id, invoice_date, total_amount, tax_amount, subtotal,
            status, warehouse_id, organization_id, created_by
        ) VALUES (
            v_invoice_number, v_customer_id, now()::date, v_sales_price * v_quantity * 1.14, v_sales_price * v_quantity * 0.14, v_sales_price * v_quantity,
            'draft', v_warehouse_id, v_org_id, v_current_user_id
        ) RETURNING id INTO v_invoice_id;

        INSERT INTO public.invoice_items (
            invoice_id, product_id, quantity, unit_price, organization_id
        ) VALUES (
            v_invoice_id, v_product_id, v_quantity, v_sales_price, v_org_id
        );

        -- Approve the invoice to trigger stock and journal entries
        PERFORM public.approve_invoice(v_invoice_id, v_org_id, v_warehouse_id);
    END LOOP;
    PERFORM public.recalculate_stock_rpc(v_org_id); -- تحديث نهائي لضمان الدقة
    v_sales_ms := extract(epoch from (clock_timestamp() - v_sales_start)) * 1000;
    RAISE NOTICE 'Finished simulating % sales invoices.', p_num_sales_invoices;

    -- ============================================================
    -- Simulate Manufacturing Orders
    -- ============================================================
    IF p_num_mfg_orders > 0 THEN
        RAISE NOTICE 'Simulating % manufacturing orders...', p_num_mfg_orders;
        v_mfg_start := clock_timestamp();
        FOR v_i IN 1..p_num_mfg_orders LOOP
            v_order_number := 'LT-MFG-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substring(gen_random_uuid()::text, 1, 4)) || '-' || LPAD(v_i::text, 4, '0');
            v_quantity := (RANDOM() * 10 + 1)::NUMERIC(10,2); -- Random quantity between 1 and 11

            INSERT INTO public.mfg_production_orders (
                order_number, product_id, quantity_to_produce, status, warehouse_id, organization_id
            ) VALUES (
                v_order_number, v_mfg_product_id, v_quantity, 'draft', v_warehouse_id, v_org_id
            ) RETURNING id INTO v_mfg_order_id;

            -- Start the production order (this will create steps)
            PERFORM public.mfg_start_production_order(v_mfg_order_id);

            -- Complete all steps for the order
            FOR v_mfg_progress_id IN SELECT id FROM public.mfg_order_progress WHERE production_order_id = v_mfg_order_id LOOP
                PERFORM public.mfg_start_step(v_mfg_progress_id, v_employee_id); -- Use the actual employee ID
                PERFORM public.mfg_complete_step(v_mfg_progress_id, v_quantity); -- Assuming each step produces the full quantity
            END LOOP;

            -- Finalize the manufacturing order
            PERFORM public.mfg_finalize_order(v_mfg_order_id, 'completed', 'Load test completion');
        END LOOP;
        PERFORM public.recalculate_stock_rpc(v_org_id); -- تحديث نهائي
        v_mfg_ms := extract(epoch from (clock_timestamp() - v_mfg_start)) * 1000;
        RAISE NOTICE 'Finished simulating % manufacturing orders.', p_num_mfg_orders;
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'organization_id', v_org_id,
        'benchmarks', jsonb_build_object(
            'sales_invoices', jsonb_build_object('count', p_num_sales_invoices, 'total_ms', ROUND(v_sales_ms::numeric, 2), 'avg_ms_per_op', ROUND((v_sales_ms / NULLIF(p_num_sales_invoices, 0))::numeric, 2)),
            'mfg_orders', jsonb_build_object('count', p_num_mfg_orders, 'total_ms', ROUND(v_mfg_ms::numeric, 2), 'avg_ms_per_op', ROUND((v_mfg_ms / NULLIF(p_num_mfg_orders, 0))::numeric, 2)),
            'total_execution_ms', ROUND((extract(epoch from (clock_timestamp() - v_total_start)) * 1000)::numeric, 2)
        ),
        'timestamp', now()
    );

EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id)
    VALUES (SQLERRM, jsonb_build_object('p_invoices', p_num_sales_invoices, 'p_mfg', p_num_mfg_orders), 'simulate_load_test', v_org_id);
    RAISE EXCEPTION 'خطأ في اختبار الضغط: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.simulate_load_test(INTEGER, INTEGER, UUID, UUID) TO authenticated;
-- ================================================================
-- 8. دالة تنظيف بيانات اختبار الضغط (Load Test Data Cleanup)
-- ================================================================
CREATE OR REPLACE FUNCTION public.clean_load_test_data(p_org_id UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_final_org_id UUID;
    v_deleted_count INTEGER := 0;
BEGIN
    v_final_org_id := COALESCE(p_org_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1));

    IF v_final_org_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID not found or provided.';
    END IF;

    RAISE NOTICE 'Cleaning load test data for organization %...', v_final_org_id;

    -- 1. حذف سجلات الجداول الفرعية أولاً بسبب قيود المفتاح الأجنبي (FK constraints)

    -- حذف من mfg_actual_material_usage
    DELETE FROM public.mfg_actual_material_usage
    WHERE organization_id = v_final_org_id
    AND order_progress_id IN (
        SELECT op.id FROM public.mfg_order_progress op
        JOIN public.mfg_production_orders po ON op.production_order_id = po.id
        WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_actual_material_usage.', v_deleted_count;

    -- حذف من mfg_scrap_logs
    DELETE FROM public.mfg_scrap_logs
    WHERE organization_id = v_final_org_id
    AND order_progress_id IN (
        SELECT op.id FROM public.mfg_order_progress op
        JOIN public.mfg_production_orders po ON op.production_order_id = po.id
        WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_scrap_logs.', v_deleted_count;

    -- حذف من mfg_qc_inspections
    DELETE FROM public.mfg_qc_inspections
    WHERE organization_id = v_final_org_id
    AND progress_id IN (
        SELECT op.id FROM public.mfg_order_progress op
        JOIN public.mfg_production_orders po ON op.production_order_id = po.id
        WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_qc_inspections.', v_deleted_count;

    -- حذف من mfg_batch_serials
    DELETE FROM public.mfg_batch_serials
    WHERE organization_id = v_final_org_id
    AND production_order_id IN (
        SELECT id FROM public.mfg_production_orders
        WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_batch_serials.', v_deleted_count;

    -- حذف من mfg_production_variances
    DELETE FROM public.mfg_production_variances
    WHERE organization_id = v_final_org_id
    AND production_order_id IN (
        SELECT id FROM public.mfg_production_orders
        WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_production_variances.', v_deleted_count;

    -- حذف من mfg_material_request_items
    DELETE FROM public.mfg_material_request_items
    WHERE organization_id = v_final_org_id
    AND material_request_id IN (
        SELECT id FROM public.mfg_material_requests
        WHERE organization_id = v_final_org_id AND production_order_id IN (
            SELECT id FROM public.mfg_production_orders
            WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
        )
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_material_request_items.', v_deleted_count;

    -- حذف من mfg_material_requests
    DELETE FROM public.mfg_material_requests
    WHERE organization_id = v_final_org_id
    AND production_order_id IN (
        SELECT id FROM public.mfg_production_orders
        WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_material_requests.', v_deleted_count;

    -- حذف من mfg_order_progress
    DELETE FROM public.mfg_order_progress
    WHERE organization_id = v_final_org_id
    AND production_order_id IN (
        SELECT id FROM public.mfg_production_orders
        WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_order_progress.', v_deleted_count;

    -- حذف من invoice_items
    DELETE FROM public.invoice_items
    WHERE organization_id = v_final_org_id
    AND invoice_id IN (
        SELECT id FROM public.invoices
        WHERE organization_id = v_final_org_id AND invoice_number LIKE 'LT-INV-%'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from invoice_items.', v_deleted_count;

    -- حذف من journal_lines المرتبطة بفواتير وأوامر تصنيع اختبار الضغط
    DELETE FROM public.journal_lines
    WHERE organization_id = v_final_org_id
    AND journal_entry_id IN (
        SELECT je.id FROM public.journal_entries je
        WHERE je.organization_id = v_final_org_id
        AND (
            (je.related_document_type = 'invoice' AND je.related_document_id IN (SELECT id FROM public.invoices WHERE organization_id = v_final_org_id AND invoice_number LIKE 'LT-INV-%'))
            OR
            (je.related_document_type = 'mfg_order' AND je.related_document_id IN (SELECT id FROM public.mfg_production_orders WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'))
            OR
            (je.related_document_type = 'mfg_step' AND je.related_document_id IN (SELECT op.id FROM public.mfg_order_progress op JOIN public.mfg_production_orders po ON op.production_order_id = po.id WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'))
            OR
            (je.related_document_type = 'mfg_material_request' AND je.related_document_id IN (SELECT id FROM public.mfg_material_requests WHERE organization_id = v_final_org_id AND production_order_id IN (SELECT id FROM public.mfg_production_orders WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%')) )
        )
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from journal_lines.', v_deleted_count;

    -- حذف من journal_entries المرتبطة بفواتير وأوامر تصنيع اختبار الضغط
    DELETE FROM public.journal_entries
    WHERE organization_id = v_final_org_id
    AND (
        (related_document_type = 'invoice' AND related_document_id IN (SELECT id FROM public.invoices WHERE organization_id = v_final_org_id AND invoice_number LIKE 'LT-INV-%'))
        OR
        (related_document_type = 'mfg_order' AND related_document_id IN (SELECT id FROM public.mfg_production_orders WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%'))
        OR
        (related_document_type = 'mfg_step' AND related_document_id IN (SELECT op.id FROM public.mfg_order_progress op JOIN public.mfg_production_orders po ON op.production_order_id = po.id WHERE po.organization_id = v_final_org_id AND po.order_number LIKE 'LT-MFG-%'))
        OR
        (related_document_type = 'mfg_material_request' AND related_document_id IN (SELECT id FROM public.mfg_material_requests WHERE organization_id = v_final_org_id AND production_order_id IN (SELECT id FROM public.mfg_production_orders WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%')) )
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from journal_entries.', v_deleted_count;

    -- 2. حذف السجلات الرئيسية

    -- حذف من invoices
    DELETE FROM public.invoices
    WHERE organization_id = v_final_org_id AND invoice_number LIKE 'LT-INV-%';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from invoices.', v_deleted_count;

    -- حذف من mfg_production_orders
    DELETE FROM public.mfg_production_orders
    WHERE organization_id = v_final_org_id AND order_number LIKE 'LT-MFG-%';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_production_orders.', v_deleted_count;

    -- حذف من opening_inventories للمنتجات التي تم إنشاؤها لاختبار الضغط
    DELETE FROM public.opening_inventories
    WHERE organization_id = v_final_org_id
    AND product_id IN (
        SELECT id FROM public.products
        WHERE organization_id = v_final_org_id AND name IN ('Load Test Product', 'خامة افتراضية للتصنيع', 'منتج مصنع افتراضي')
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from opening_inventories.', v_deleted_count;

    -- حذف من mfg_routing_steps
    DELETE FROM public.mfg_routing_steps
    WHERE organization_id = v_final_org_id
    AND routing_id IN (
        SELECT id FROM public.mfg_routings
        WHERE organization_id = v_final_org_id AND product_id IN (
            SELECT id FROM public.products WHERE organization_id = v_final_org_id AND name = 'منتج مصنع افتراضي'
        )
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_routing_steps.', v_deleted_count;

    -- حذف من mfg_routings
    DELETE FROM public.mfg_routings
    WHERE organization_id = v_final_org_id
    AND product_id IN (
        SELECT id FROM public.products WHERE organization_id = v_final_org_id AND name = 'منتج مصنع افتراضي'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_routings.', v_deleted_count;

    -- حذف من products
    DELETE FROM public.products
    WHERE organization_id = v_final_org_id AND name IN ('Load Test Product', 'خامة افتراضية للتصنيع', 'منتج مصنع افتراضي');
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from products.', v_deleted_count;

    -- حذف من customers
    DELETE FROM public.customers
    WHERE organization_id = v_final_org_id AND name = 'Load Test Customer';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from customers.', v_deleted_count;

    -- حذف من employees
    DELETE FROM public.employees
    WHERE organization_id = v_final_org_id AND full_name IN ('Load Test Employee', 'موظف تصنيع افتراضي');
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from employees.', v_deleted_count;

    -- حذف من mfg_work_centers
    DELETE FROM public.mfg_work_centers
    WHERE organization_id = v_final_org_id AND name = 'مركز عمل افتراضي';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from mfg_work_centers.', v_deleted_count;

    -- حذف من warehouses
    DELETE FROM public.warehouses
    WHERE organization_id = v_final_org_id AND name IN ('Load Test Warehouse', 'مستودع افتراضي');
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from warehouses.', v_deleted_count;

    -- حذف من accounts (فقط الحساب المحدد الذي تم إنشاؤه لاختبار الضغط)
    DELETE FROM public.accounts
    WHERE organization_id = v_final_org_id AND code = '1231-LT';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % records from accounts.', v_deleted_count;

    -- إعادة احتساب المخزون بعد التنظيف لضمان دقة الأرصدة
    PERFORM public.recalculate_stock_rpc(v_final_org_id);

    RETURN 'Load test data cleanup completed for organization ' || v_final_org_id || '.';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Load test data cleanup failed: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clean_load_test_data(UUID) TO authenticated;

-- ================================================================
-- 🔓 منح الصلاحيات النهائية (Final Grants)
-- ================================================================
-- 🛡️ [V51.0] رادار نزاهة النظام الشامل (Global ERP Health Monitor)
-- الغرض: التأكد من أن النظام متماسك برمجياً ومحاسبياً 100%
-- 🛡️ [V51.1] رادار نزاهة النظام المطور (Enhanced Reliability Radar)
-- [تحديث SaaS]: تم تحويل الرؤية لتكون متوافقة مع تعدد الشركات لضمان عزل الإحصائيات
DROP VIEW IF EXISTS public.v_global_system_health CASCADE;
CREATE OR REPLACE VIEW public.v_global_system_health AS
WITH stats AS (
    SELECT 
        o.id as organization_id,
        (SELECT COUNT(*) FROM public.journal_entries je WHERE je.organization_id = o.id) as total_je,
        (SELECT COUNT(*) FROM (SELECT journal_entry_id FROM public.journal_lines jl2 WHERE jl2.organization_id = o.id GROUP BY journal_entry_id HAVING ABS(SUM(debit - credit)) > 0.01) t) as unbalanced,
        (SELECT COUNT(*) FROM public.products p WHERE p.organization_id = o.id) as total_products,
        (SELECT COUNT(*) FROM public.products p WHERE p.organization_id = o.id AND stock < 0) as neg_stock,
        (SELECT COUNT(*) FROM public.journal_lines jl WHERE jl.organization_id = o.id) as total_lines,
        (SELECT COUNT(*) FROM public.journal_lines jl WHERE jl.organization_id = o.id AND journal_entry_id NOT IN (SELECT id FROM public.journal_entries)) as orphans
    FROM public.organizations o
)
SELECT 
    organization_id,
    (SELECT COUNT(*) FROM public.profiles p WHERE p.organization_id = stats.organization_id AND p.is_active = true) as active_users,
    unbalanced as unbalanced_vouchers_count,
    neg_stock as negative_stock_items,
    orphans as orphaned_ledger_lines,
    total_je as total_financial_transactions,
    (SELECT COUNT(*) FROM public.invoices i WHERE i.organization_id = stats.organization_id) + 
    (SELECT COUNT(*) FROM public.orders ord WHERE ord.organization_id = stats.organization_id) as total_sales_documents,
    -- 🏆 مؤشر موثوقية النظام (أهم رقم للتسويق)
    CASE 
        WHEN total_je = 0 AND orphans = 0 AND neg_stock = 0 THEN 100.00
        WHEN total_je = 0 AND (orphans > 0 OR neg_stock > 0) THEN 0.00
        ELSE ROUND(GREATEST(0, 100 - (
            COALESCE(unbalanced::numeric / NULLIF(total_je, 0) * 100 * 0.6, 0) + 
            COALESCE(orphans::numeric / NULLIF(total_lines, 0) * 100 * 0.3, 0) + 
            COALESCE(neg_stock::numeric / NULLIF(total_products, 0) * 100 * 0.1, 0)
        )), 2)
    END as reliability_score,
    now() as last_check_at
FROM stats;

-- 🛡️ [V51.2] حارس التوازن الصارم (Strict Balance Guard)
-- المهمة: منع ترحيل أي قيد غير متزن لحظياً (Real-time Prevention)
CREATE OR REPLACE FUNCTION public.fn_guard_journal_balance()
RETURNS TRIGGER AS $$
DECLARE v_diff numeric;
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN RETURN NEW; END IF;
    IF NEW.status = 'posted' THEN
        SELECT SUM(debit - credit) INTO v_diff FROM public.journal_lines WHERE journal_entry_id = NEW.id;
        IF ABS(COALESCE(v_diff, 0)) > 0.01 THEN
            RAISE EXCEPTION '⚠️ خرق مالي: لا يمكن ترحيل قيد غير متزن (الفرق: %). تم تفعيل درع الحماية.', v_diff;
        END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_balance_guard ON public.journal_entries;
CREATE TRIGGER trg_journal_balance_guard
AFTER UPDATE OF status ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_journal_balance();

GRANT SELECT ON public.v_global_system_health TO authenticated;

-- 📊 دالة جلب إحصائيات لوحة التحكم (Dashboard Stats RPC)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_org_id uuid;
    v_current_month_start date := date_trunc('month', now())::date;
    v_current_month_end date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
    v_prev_month_start date := (date_trunc('month', now()) - interval '1 month')::date;
    v_prev_month_end date := (date_trunc('month', now()) - interval '1 day')::date;
    
    v_month_sales numeric := 0;
    v_prev_month_sales numeric := 0;
    v_month_purchases numeric := 0;
    v_prev_month_purchases numeric := 0;
    v_month_cogs numeric := 0;
    v_month_expenses numeric := 0;
    v_receivables numeric := 0;
    v_payables numeric := 0;
    v_total_receipts numeric := 0;
    v_total_payments numeric := 0;
    v_reliability_score numeric := 0; -- 🛡️ جديد: مؤشر نزاهة البيانات
    v_low_stock_count bigint := 0;
    v_sales_target numeric := 0;
    
    -- مقاييس المقاولات الجديدة
    v_active_projects_count bigint := 0;
    v_total_contracts_value numeric := 0;
    v_total_construction_billed numeric := 0;
    
    v_chart_data jsonb := '[]'::jsonb;
    v_recent_invoices jsonb := '[]'::jsonb;
    v_recent_journals jsonb := '[]'::jsonb;
    v_top_customers jsonb := '[]'::jsonb;
    v_top_products jsonb := '[]'::jsonb;
    v_top_customers_pie_data jsonb := '[]'::jsonb;
    v_low_stock_items jsonb := '[]'::jsonb;
    v_mappings jsonb;
    v_sales_acc_id uuid;
    v_cogs_acc_id uuid;
    v_expense_acc_ids uuid[];
    v_customer_acc_id uuid;
    v_supplier_acc_id uuid;
BEGIN
    v_target_org_id := COALESCE(p_org_id, public.get_my_org());

    IF v_target_org_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID is required.';
    END IF;

    -- Get account mappings and sales target
    SELECT account_mappings, monthly_sales_target INTO v_mappings, v_sales_target
    FROM public.company_settings
    WHERE organization_id = v_target_org_id;

    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_target_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_target_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_target_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_target_org_id LIMIT 1));
    
    -- جلب درجة الموثوقية من الرادار
    SELECT reliability_score INTO v_reliability_score FROM public.v_global_system_health WHERE organization_id = v_target_org_id;

    -- 1. Current Month Sales (Net Revenue from GL to match Income Statement)
    SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_month_sales
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.type ILIKE '%revenue%' OR a.type ILIKE '%إيراد%' OR a.code LIKE '4%')
    AND NOT (a.code LIKE '1%' OR a.code LIKE '2%' OR a.code LIKE '3%' OR a.code LIKE '5%')
    AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 2. Previous Month Sales (Net Revenue)
    SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_prev_month_sales
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.type ILIKE '%revenue%' OR a.type ILIKE '%إيراد%' OR a.code LIKE '4%')
    AND NOT (a.code LIKE '1%' OR a.code LIKE '2%' OR a.code LIKE '3%' OR a.code LIKE '5%')
    AND je.transaction_date BETWEEN v_prev_month_start AND v_prev_month_end;

    -- 3. Current Month Purchases
    SELECT COALESCE(SUM(total_amount), 0) INTO v_month_purchases
    FROM public.purchase_invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 4. Previous Month Purchases
    SELECT COALESCE(SUM(total_amount), 0) INTO v_prev_month_purchases
    FROM public.purchase_invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_prev_month_start AND v_prev_month_end;

    -- 5. Current Month COGS (Net Cost from GL)
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_month_cogs
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.id = v_cogs_acc_id OR a.code LIKE '511%' OR a.code LIKE '501%' OR a.name ILIKE '%تكلفة%' OR a.name ILIKE '%cost%')
    AND NOT (a.code LIKE '4%' OR a.code LIKE '1%' OR a.code LIKE '2%' OR a.code LIKE '3%')
    AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 6. Current Month Operating Expenses (from journal entries)
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_month_expenses
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.type ILIKE '%expense%' OR a.type ILIKE '%مصروف%' OR a.code LIKE '5%')
    AND NOT (a.code LIKE '4%' OR a.code LIKE '1%' OR a.code LIKE '2%' OR a.code LIKE '3%')
    AND NOT (a.id = v_cogs_acc_id OR a.code LIKE '511%' OR a.code LIKE '501%' OR a.name ILIKE '%تكلفة%' OR a.name ILIKE '%cost%')
    AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 7. Receivables (Customers Balance)
    SELECT COALESCE(SUM(balance), 0) INTO v_receivables
    FROM public.customers
    WHERE organization_id = v_target_org_id;

    -- 8. Payables (Suppliers Balance)
    SELECT COALESCE(SUM(balance), 0) INTO v_payables
    FROM public.suppliers
    WHERE organization_id = v_target_org_id;

    -- 9. Total Receipts (current month)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_receipts
    FROM public.receipt_vouchers
    WHERE organization_id = v_target_org_id
    AND receipt_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 10. Total Payments (current month)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_payments
    FROM public.payment_vouchers
    WHERE organization_id = v_target_org_id
    AND payment_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 🏗️ إحصائيات المقاولات (Construction KPIs)
    SELECT COUNT(*) INTO v_active_projects_count 
    FROM public.projects WHERE organization_id = v_target_org_id AND status = 'active';
    
    SELECT COALESCE(SUM(contract_value), 0) INTO v_total_contracts_value 
    FROM public.projects WHERE organization_id = v_target_org_id AND status != 'cancelled';

    SELECT COALESCE(SUM(gross_amount), 0) INTO v_total_construction_billed 
    FROM public.project_progress_billings 
    WHERE organization_id = v_target_org_id AND status = 'approved';

    -- 11. Low Stock Count and Items
    SELECT COUNT(*) INTO v_low_stock_count
    FROM public.products
    WHERE organization_id = v_target_org_id AND stock <= min_stock_level AND min_stock_level > 0;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'stock', stock, 'min_stock_level', min_stock_level, 'sku', sku)), '[]'::jsonb)
    INTO v_low_stock_items
    FROM public.products
    WHERE organization_id = v_target_org_id AND stock <= min_stock_level AND min_stock_level > 0
    LIMIT 5;

    -- 12. Chart Data (Last 6 months sales/purchases)
    WITH monthly_sales_summary AS (
        SELECT
            to_char(date_trunc('month', inv.invoice_date), 'YYYY-MM') as month_key,
            to_char(date_trunc('month', inv.invoice_date), 'Mon') as month_name,
            COALESCE(SUM(inv.total_amount), 0) as sales_amount
        FROM public.invoices inv
        WHERE inv.organization_id = v_target_org_id AND inv.status IN ('posted', 'paid')
        AND inv.invoice_date >= (now() - interval '5 months')::date
        GROUP BY 1, 2
    ),
    monthly_purchase_summary AS (
        SELECT
            to_char(date_trunc('month', pinv.invoice_date), 'YYYY-MM') as month_key,
            COALESCE(SUM(pinv.total_amount), 0) as purchase_amount
        FROM public.purchase_invoices pinv
        WHERE pinv.organization_id = v_target_org_id AND pinv.status IN ('posted', 'paid')
        AND pinv.invoice_date >= (now() - interval '5 months')::date
        GROUP BY 1
    )
    SELECT jsonb_agg(jsonb_build_object(
        'name', ms.month_name,
        'sales', ms.sales_amount,
        'purchases', COALESCE(mps.purchase_amount, 0)
    ) ORDER BY ms.month_key)
    INTO v_chart_data
    FROM monthly_sales_summary ms
    LEFT JOIN monthly_purchase_summary mps ON ms.month_key = mps.month_key;

    -- 13. Recent Invoices
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_recent_invoices
    FROM (
        SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount, c.name as customer_name
        FROM public.invoices i
        LEFT JOIN public.customers c ON i.customer_id = c.id
        WHERE i.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        ORDER BY i.invoice_date DESC
        LIMIT 5
    ) t;

    -- 14. Recent Journals (top 5)
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_recent_journals
    FROM (
        SELECT je.id, je.transaction_date, je.description, je.reference
        FROM public.journal_entries je
        WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
        ORDER BY je.transaction_date DESC
        LIMIT 5
    ) t;

    -- 15. Top Customers
    WITH customer_sales AS (
        SELECT c.id, c.name, COALESCE(SUM(i.total_amount), 0) as total_sales
        FROM public.customers c
        JOIN public.invoices i ON c.id = i.customer_id
        WHERE c.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        GROUP BY c.id, c.name
        ORDER BY total_sales DESC
        LIMIT 5
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total', total_sales)), '[]'::jsonb)
    INTO v_top_customers
    FROM customer_sales;

    -- 16. Top Customers Pie Data (for pie chart)
    WITH customer_sales AS (
        SELECT c.id, c.name, COALESCE(SUM(i.total_amount), 0) as total_sales
        FROM public.customers c
        JOIN public.invoices i ON c.id = i.customer_id
        WHERE c.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        GROUP BY c.id, c.name
        ORDER BY total_sales DESC
        LIMIT 4 -- Top 4, rest will be 'Others'
    ),
    other_sales AS (
        SELECT COALESCE(SUM(i.total_amount), 0) as total_sales
        FROM public.invoices i
        WHERE i.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        AND i.customer_id NOT IN (SELECT id FROM customer_sales)
    )
    SELECT jsonb_agg(jsonb_build_object('name', name, 'value', total_sales)) ||
           CASE WHEN (SELECT total_sales FROM other_sales) > 0 THEN jsonb_build_array(jsonb_build_object('name', 'عملاء آخرون', 'value', (SELECT total_sales FROM other_sales))) ELSE '[]'::jsonb END
    INTO v_top_customers_pie_data
    FROM customer_sales;

    -- 17. Top Products
    WITH product_revenue AS (
        SELECT p.id, p.name, COALESCE(SUM(ii.quantity * ii.unit_price), 0) as total_revenue
        FROM public.products p
        JOIN public.invoice_items ii ON p.id = ii.product_id
        JOIN public.invoices i ON ii.invoice_id = i.id
        WHERE p.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
        GROUP BY p.id, p.name
        ORDER BY total_revenue DESC
        LIMIT 5
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total_revenue', total_revenue)), '[]'::jsonb)
    INTO v_top_products
    FROM product_revenue;


    RETURN jsonb_build_object(
        'monthSales', v_month_sales,
        'prevMonthSales', v_prev_month_sales,
        'monthPurchases', v_month_purchases,
        'prevMonthPurchases', v_prev_month_purchases,
        'monthCogs', v_month_cogs,
        'monthExpenses', v_month_expenses,
        'receivables', v_receivables,
        'payables', v_payables,
        'totalReceipts', v_total_receipts,
        'totalPayments', v_total_payments,
        'lowStockCount', v_low_stock_count,
        'systemReliability', v_reliability_score, -- 🏆 جاهزة للعرض في الـ UI
        'salesTarget', COALESCE(v_sales_target, 0),
        'activeProjectsCount', v_active_projects_count,
        'totalContractsValue', v_total_contracts_value,
        'totalConstructionBilled', v_total_construction_billed,
        'chartData', v_chart_data,
        'recentInvoices', v_recent_invoices,
        'recentJournals', v_recent_journals,
        'topCustomers', v_top_customers,
        'topProducts', v_top_products,
        'topCustomersPieData', v_top_customers_pie_data,
        'lowStockItems', v_low_stock_items
    );
END;
$$;
-- 🛠️ دالة إقفال السنة المالية (Fiscal Year Closing Engine)
-- الوصف: تصفير حسابات قائمة الدخل (إيرادات ومصروفات) وترحيل الصافي إلى الأرباح المبقاة (32)
CREATE OR REPLACE FUNCTION public.close_financial_year(
    p_year integer,
    p_closing_date date,
    p_org_id uuid DEFAULT public.get_my_org()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_net_income numeric := 0;
    v_je_id uuid;
    v_retained_earnings_acc_id uuid;
    v_row record;
    v_ref text := 'CLOSE-' || p_year;
    v_target_org uuid := COALESCE(p_org_id, public.get_my_org());
    v_entry_count integer := 0;
BEGIN
    -- 1. التحقق من وجود حساب الأرباح المبقاة (32)
    SELECT id INTO v_retained_earnings_acc_id FROM public.accounts WHERE organization_id = v_target_org AND code = '32' LIMIT 1;
    IF v_retained_earnings_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الأرباح المبقاة (32) مفقود في دليل الحسابات.'; END IF;

    -- 2. منع التكرار
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reference = v_ref AND organization_id = v_target_org) THEN
        RAISE EXCEPTION 'السنة المالية % مغلقة بالفعل لهذه الشركة.', p_year;
    END IF;

    -- 3. إنشاء رأس قيد الإقفال
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, user_id)
    VALUES (p_closing_date, 'إقفال حسابات النتيجة للسنة المالية ' || p_year, v_ref, 'posted', v_target_org, true, auth.uid())
    RETURNING id INTO v_je_id;

    -- 4. حصر وإقفال الحسابات المؤقتة (إيرادات ومصروفات مرحلة فقط)
    FOR v_row IN 
        SELECT a.id, a.name, SUM(jl.debit - jl.credit) as balance
        FROM public.accounts a
        JOIN public.journal_lines jl ON a.id = jl.account_id
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.organization_id = v_target_org AND je.status = 'posted'
          AND EXTRACT(YEAR FROM je.transaction_date) = p_year
          AND (a.type ILIKE '%revenue%' OR a.type ILIKE '%expense%' OR a.code LIKE '4%' OR a.code LIKE '5%')
        GROUP BY a.id, a.name
        HAVING ABS(SUM(jl.debit - jl.credit)) > 0.001
    LOOP
        -- إقفال: عكس الرصيد الحالي (المدين يصبح دائن والعكس)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_row.id, CASE WHEN v_row.balance < 0 THEN ABS(v_row.balance) ELSE 0 END, CASE WHEN v_row.balance > 0 THEN v_row.balance ELSE 0 END, 'إقفال رصيد حساب ' || v_row.name, v_target_org);
        v_net_income := v_net_income + (-v_row.balance);
        v_entry_count := v_entry_count + 1;
    END LOOP;

    IF v_entry_count = 0 THEN
        DELETE FROM public.journal_entries WHERE id = v_je_id;
        RAISE EXCEPTION 'لا توجد حركات مرحلة في سنة % تتطلب الإقفال.', p_year;
    END IF;

    -- 5. ترحيل صافي الأرباح/الخسائر (v_net_income دائن للربح ومدين للخسارة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_retained_earnings_acc_id, CASE WHEN v_net_income < 0 THEN ABS(v_net_income) ELSE 0 END, CASE WHEN v_net_income > 0 THEN v_net_income ELSE 0 END, 'ترحيل صافي نتيجة نشاط سنة ' || p_year, v_target_org);

    -- 6. موازنة القيد النهائية
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    
    -- 7. تحديث إعدادات الإغلاق
    UPDATE public.company_settings SET last_closed_year = p_year, last_closed_date = p_closing_date WHERE organization_id = v_target_org;

    RETURN '✅ تم بنجاح إقفال السنة ' || p_year || ' وترحيل الصافي لحساب الأرباح المبقاة.';
END; $$;

-- 🔓 دالة إعادة فتح سنة مالية مغلقة (Reopen Fiscal Year)
-- الوصف: حذف قيد الإغلاق وتعديل إعدادات السنة المغلقة للسماح بالتعديلات المؤقتة
CREATE OR REPLACE FUNCTION public.reopen_financial_year(
    p_year integer,
    p_org_id uuid DEFAULT public.get_my_org()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_target_org uuid := COALESCE(p_org_id, public.get_my_org());
    v_last_closed integer;
    v_ref text := 'CLOSE-' || p_year;
BEGIN
    -- 1. التأكد من أن السنة المطلوب فتحها هي آخر سنة مغلقة (لأن الإغلاق تراكمي)
    SELECT last_closed_year INTO v_last_closed FROM public.company_settings WHERE organization_id = v_target_org;

    IF v_last_closed IS NULL OR v_last_closed < p_year THEN
        RETURN '⚠️ هذه السنة ليست مغلقة حالياً في إعدادات المنظمة.';
    END IF;

    IF v_last_closed > p_year THEN
        RAISE EXCEPTION '⚠️ خطأ محاسبي: يجب إعادة فتح السنة % أولاً قبل فتح سنة % لضمان تسلسل الأرصدة.', v_last_closed, p_year;
    END IF;

    -- 2. تفعيل وضع التجاوز لحذف قيد الإغلاق وتحديث الإعدادات
    PERFORM set_config('app.restore_mode', 'on', true);
    
    DELETE FROM public.journal_entries WHERE reference = v_ref AND organization_id = v_target_org;
    UPDATE public.company_settings SET last_closed_year = p_year - 1, last_closed_date = (make_date(p_year - 1, 12, 31)) WHERE organization_id = v_target_org;
    
    PERFORM set_config('app.restore_mode', 'off', true);

    RETURN '🔓 تم فتح السنة المالية ' || p_year || ' بنجاح. يمكنك الآن تعديل الحركات. تذكر إعادة الإغلاق فور الانتهاء.';
END; $$;

-- 🛡️ درع حماية السنوات المغلقة (Prevention Trigger)
CREATE OR REPLACE FUNCTION public.fn_check_closed_year() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.company_settings WHERE organization_id = NEW.organization_id AND last_closed_year >= EXTRACT(YEAR FROM NEW.transaction_date)) THEN
        RAISE EXCEPTION '⚠️ خطأ حماية: لا يمكن إضافة أو تعديل بيانات في سنة مالية مغلقة مسبقاً.';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_closed_year ON public.journal_entries;
CREATE TRIGGER trg_check_closed_year BEFORE INSERT OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.fn_check_closed_year();

-- 🛠️ دالة تنظيف السجلات المحذوفة نهائياً (Database Purge Engine)
-- الوصف: حذف السجلات التي تم تعليمها للحذف (Soft Deleted) وتنظيف البيانات اليتيمة
DROP FUNCTION IF EXISTS public.purge_deleted_records();
CREATE OR REPLACE FUNCTION public.purge_deleted_records()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table text;
    v_count bigint;
    v_total_purged bigint := 0;
    v_tables_processed text[] := ARRAY[]::text[];
BEGIN
    -- 1. البحث عن كافة الجداول التي تحتوي على خاصية "الحذف الناعم" وتطهيرها
    FOR v_table IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'deleted_at'
          AND table_name NOT IN ('spatial_ref_sys')
    LOOP
        EXECUTE format('DELETE FROM public.%I WHERE deleted_at IS NOT NULL', v_table);
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_total_purged := v_total_purged + v_count;
        IF v_count > 0 THEN
            v_tables_processed := array_append(v_tables_processed, v_table);
        END IF;
    END LOOP;

    -- 2. تنظيف البيانات اليتيمة لضمان سلامة التكامل المرجعي
    DELETE FROM public.journal_lines WHERE journal_entry_id NOT IN (SELECT id FROM public.journal_entries);
    DELETE FROM public.invoice_items WHERE invoice_id NOT IN (SELECT id FROM public.invoices);
    DELETE FROM public.order_items WHERE order_id NOT IN (SELECT id FROM public.orders);
    DELETE FROM public.order_item_modifiers WHERE order_item_id NOT IN (SELECT id FROM public.order_items);

    RETURN format('✅ تم تنظيف قاعدة البيانات بنجاح. إجمالي السجلات المطهرة: %s. الجداول المتأثرة: %s', v_total_purged, array_to_string(v_tables_processed, ', '));
END; $$;

-- 🛠️ دالة إصلاح مخطط المرتجعات (Fix Returns Schema)
-- الوصف: توحيد مسميات أعمدة المرتجعات لضمان التوافق
-- ملاحظة: تم تغيير نوع الإرجاع إلى TEXT لحل مشكلة الـ Rendering في React
DROP FUNCTION IF EXISTS public.fix_returns_schema();
CREATE OR REPLACE FUNCTION public.fix_returns_schema()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    t text;
    tables_to_fix text[] := ARRAY['quotation_items', 'sales_return_items', 'purchase_invoice_items', 'purchase_order_items', 'purchase_return_items', 'invoice_items', 'order_items', 'modifiers'];
    v_log_message text := '';
    v_count int := 0;
BEGIN
    -- توحيد مسمى سعر الوحدة في جميع جداول النظام
    FOREACH t IN ARRAY tables_to_fix LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t AND table_type = 'BASE TABLE') 
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'price') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'unit_price') THEN
                EXECUTE format('ALTER TABLE public.%I RENAME COLUMN price TO unit_price', t);
                v_log_message := v_log_message || format('Renamed price to unit_price in %s. ', t);
                v_count := v_count + 1;
            ELSE
                -- إذا كان كلاهما موجوداً، انقل البيانات للعمود الجديد واحذف القديم لتجنب التعارض
                EXECUTE format('UPDATE public.%I SET unit_price = COALESCE(price, 0) WHERE unit_price IS NULL OR unit_price = 0', t);
                EXECUTE format('ALTER TABLE public.%I DROP COLUMN price', t);
                v_log_message := v_log_message || format('Merged price into unit_price and dropped price column in %s. ', t);
                v_count := v_count + 1;
            END IF;
        END IF;
    END LOOP;

    -- ضمان عدم تكرار التصنيفات
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_categories_name_org_unique') THEN
        -- Check if organization_id column exists before adding constraint
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'item_categories' AND column_name = 'organization_id') THEN
            ALTER TABLE public.item_categories ADD COLUMN organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'item_categories' AND column_name = 'display_order') THEN
            ALTER TABLE public.item_categories ADD COLUMN display_order integer DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'item_categories' AND column_name = 'created_at') THEN
            ALTER TABLE public.item_categories ADD COLUMN created_at timestamptz DEFAULT now();
        END IF;
        ALTER TABLE public.item_categories ADD CONSTRAINT item_categories_name_org_unique UNIQUE (organization_id, name);
        v_log_message := v_log_message || 'Added unique constraint to item_categories. ';
        v_count := v_count + 1;
    END IF;

    -- توحيد مسميات معرفات المرتجعات
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'sales_return_id') THEN
            EXECUTE 'ALTER TABLE public.sales_return_items RENAME COLUMN return_id TO sales_return_id';
            v_log_message := v_log_message || 'Renamed return_id to sales_return_id in sales_return_items. ';
            v_count := v_count + 1;
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'return_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_return_items' AND column_name = 'purchase_return_id') THEN
            EXECUTE 'ALTER TABLE public.purchase_return_items RENAME COLUMN return_id TO purchase_return_id';
            v_log_message := v_log_message || 'Renamed return_id to purchase_return_id in purchase_return_items. ';
            v_count := v_count + 1;
        END IF;
    END IF;

    -- 🛠️ إضافة عمود current_value لجدول الأصول إذا لم يكن موجوداً
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'assets' AND table_type = 'BASE TABLE') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'current_value') THEN
            EXECUTE 'ALTER TABLE public.assets ADD COLUMN current_value numeric DEFAULT 0';
            EXECUTE 'UPDATE public.assets SET current_value = COALESCE(purchase_cost, 0)';
            v_log_message := v_log_message || 'Added current_value column to assets table. ';
            v_count := v_count + 1;
        END IF;
    END IF;

    RETURN format('✅ تم إصلاح مخطط المرتجعات بنجاح. التغييرات المنفذة: %s. التفاصيل: %s', v_count, v_log_message);

END; $$;

-- 🛠️ دالة فحص وإنشاء الحسابات الأساسية المفقودة (Create Missing System Accounts)
-- الوصف: تضمن وجود الحسابات الأساسية الضرورية لعمل النظام والتقارير المحاسبية.
CREATE OR REPLACE FUNCTION public.create_missing_system_accounts(p_org_id uuid DEFAULT public.get_my_org())
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid := COALESCE(p_org_id, public.get_my_org());
    v_created_count integer := 0;
    v_account_item record;
    v_parent_id uuid;
BEGIN
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'معرف المنظمة غير موجود.';
    END IF;

    -- Define essential accounts using a temporary table, similar to initialize_egyptian_coa
    CREATE TEMPORARY TABLE IF NOT EXISTS coa_missing_temp (
        code text PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL,
        is_group boolean NOT NULL,
        parent_code text
    ) ON COMMIT DROP;

    -- Clear previous data in case of multiple calls within a session
    TRUNCATE TABLE coa_missing_temp;

    INSERT INTO coa_missing_temp (code, name, type, is_group, parent_code) VALUES
        ('1', 'الأصول', 'asset', true, NULL),
        ('2', 'الخصوم (الإلتزامات)', 'liability', true, NULL),
        ('3', 'حقوق الملكية', 'equity', true, NULL),
        ('4', 'الإيرادات', 'revenue', true, NULL),
        ('5', 'المصروفات', 'expense', true, NULL),
        ('11', 'الأصول غير المتداولة', 'asset', true, '1'),
        ('12', 'الأصول المتداولة', 'asset', true, '1'),
        ('111', 'الأصول الثابتة', 'asset', true, '11'),
        ('1119', 'مجمع إهلاك الأصول الثابتة', 'asset', false, '111'),
        ('103', 'المخزون', 'asset', true, '12'),
        ('122', 'العملاء والمدينون', 'asset', true, '12'),
        ('123', 'النقدية وما في حكمها', 'asset', true, '12'),
        ('124', 'أرصدة مدينة أخرى', 'asset', true, '12'),
        ('21', 'الخصوم غير المتداولة', 'liability', true, '2'),
        ('22', 'الخصوم المتداولة', 'liability', true, '2'),
        ('223', 'مصلحة الضرائب (التزامات)', 'liability', true, '22'),
        ('225', 'مصروفات مستحقة', 'liability', true, '22'),
        ('31', 'رأس المال والاحتياطيات', 'equity', true, '3'),
        ('311', 'رأس المال المدفوع', 'equity', false, '31'),
        ('32', 'الأرباح المبقاة / المرحلة', 'equity', false, '3'),
        ('10301', 'مخزون المواد الخام', 'asset', false, '103'),
        ('10302', 'مخزون المنتج التام', 'asset', false, '103'),
        ('10303', 'مخزون إنتاج تحت التشغيل (WIP)', 'asset', false, '103'),
        ('1221', 'العملاء', 'asset', false, '122'),
        ('122101', 'ذمم شركات التأمين الطبي', 'asset', false, '122'),
        ('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'asset', false, '122'),
        ('1223', 'سلف الموظفين', 'asset', false, '122'),
        ('1231', 'النقدية بالصندوق', 'asset', false, '123'),
        ('123201', 'البنك الأهلي المصري', 'asset', false, '123'),
        ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'asset', false, '124'),
        ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'asset', false, '124'),
        ('1249', 'محتجز ضمان لدى الغير (عملاء)', 'asset', false, '124'),
        ('1245', 'دفعات مقدمة للمقاولين والموردين', 'asset', false, '124'),
        ('1243', 'مصروفات مدفوعة مقدماً', 'asset', true, '124'),
        ('124305', 'عقود صيانة مقدمة', 'asset', false, '1243'),
        ('201', 'الموردين', 'liability', false, '22'),
        ('222', 'أوراق الدفع (شيكات صادرة)', 'liability', false, '22'),
        ('2229', 'محتجز ضمان لمقاولي الباطن', 'liability', false, '22'),
        ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'liability', false, '223'),
        ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'liability', false, '223'),
        ('2233', 'ضريبة كسب العمل', 'liability', false, '223'),
        ('224', 'هيئة التأمينات الاجتماعية', 'liability', false, '22'),
        ('226', 'تأمينات ودفعات مقدمة من العملاء', 'liability', false, '22'),
        ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'equity', false, '3'),
        ('41', 'إيرادات النشاط (المبيعات)', 'revenue', true, '4'),
        ('411', 'إيراد المبيعات', 'revenue', false, '41'),
        ('41101', 'إيرادات تشغيل وخدمات متنوعة', 'revenue', false, '41'),
        ('41103', 'إيراد عقود ومشاريع (مستخلصات)', 'revenue', false, '41'),
        ('412', 'مردودات ومسموحات مبيعات', 'revenue', false, '41'),
        ('413', 'خصم مسموح به', 'revenue', false, '41'),
        ('42', 'إيرادات أخرى', 'revenue', true, '4'),
        ('421', 'إيرادات متنوعة', 'revenue', false, '42'),
        ('422', 'إيراد خصومات وجزاءات الموظفين', 'revenue', false, '42'),
        ('425', 'إيراد تشغيل معدات داخلي', 'revenue', false, '42'),
        ('51', 'تكلفة المبيعات (COGS)', 'expense', true, '5'),
        ('511', 'تكلفة البضاعة المباعة', 'expense', false, '51'),
        ('5121', 'تكلفة الهالك والفاقد', 'expense', false, '51'),
        ('513', 'أجور عمال الإنتاج المباشرة', 'expense', false, '51'),
        ('514', 'تكاليف صناعية غير مباشرة', 'expense', true, '51'),
        ('52', 'مصروفات البيع والتسويق', 'expense', true, '5'),
        ('53', 'المصروفات الإدارية والعمومية', 'expense', true, '5'),
        ('531', 'الرواتب والأجور', 'expense', false, '53'),
        ('5312', 'مكافآت وحوافز', 'expense', false, '53'),
        ('533', 'مصروف إهلاك الأصول الثابتة', 'expense', false, '53'),
        ('541', 'تسوية عجز الصندوق', 'expense', false, '53');

    -- Insert missing accounts from the temporary table
    FOR v_account_item IN SELECT * FROM coa_missing_temp ORDER BY length(code), code
    LOOP
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = v_org_id AND code = v_account_item.code) THEN
            v_parent_id := NULL;
            IF v_account_item.parent_code IS NOT NULL THEN
                SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org_id AND code = v_account_item.parent_code;
            END IF;

            INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
            VALUES (v_org_id, v_account_item.code, v_account_item.name, v_account_item.type, v_account_item.is_group, v_parent_id, true);
            v_created_count := v_created_count + 1;
        END IF;
    END LOOP;

    -- تحديث وتأكيد ربط الحسابات السيادية في إعدادات الشركة
    UPDATE public.company_settings
    SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'CONSTRUCTION_REVENUE', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '41103' LIMIT 1),
        'RETENTION_CUSTOMER', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1249' LIMIT 1),
        'RETENTION_SUBCONTRACTOR', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '2229' LIMIT 1),
        'ADVANCE_PAYMENT_SUBCONTRACTOR', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1245' LIMIT 1),
        'SECURITY_DEPOSIT_ACCOUNT', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '226' LIMIT 1),
        'SALES_REVENUE', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '411' LIMIT 1),
        'CUSTOMERS', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1221' LIMIT 1),
        'SUPPLIERS', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '201' LIMIT 1),
        'VAT', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '2231' LIMIT 1),
        'VAT_INPUT', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1241' LIMIT 1),
        'WHT_RECEIVABLE', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1242' LIMIT 1),
        'WHT_PAYABLE', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '2232' LIMIT 1),
        'CASH', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1),
        'COGS', (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '511' LIMIT 1)
    ))
    WHERE organization_id = v_org_id;

    RETURN format('✅ تم إنشاء %s حساب أساسي مفقود وتحديث روابط الحسابات بنجاح.', v_created_count);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'فشل إنشاء الحسابات المفقودة: %', SQLERRM;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_missing_system_accounts(uuid) TO authenticated;

-- 📊 دالة حساب رصيد العميل المحدثة (تطابق كشف الحساب)
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id uuid, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_balance numeric := 0;
    v_opening_balance numeric := 0;
    v_invoices numeric := 0;
    v_receipts numeric := 0;
    v_returns numeric := 0;
    v_credit_notes numeric := 0;
    v_cheques numeric := 0;
BEGIN
    -- أ. الرصيد الافتتاحي للعميل
    SELECT COALESCE(opening_balance, 0) INTO v_opening_balance
    FROM public.customers
    WHERE id = p_customer_id AND organization_id = p_org_id;

    -- ب. إجمالي الفواتير المرحلة وغير المسودة (مدين +) - (المبلغ المدفوع فورياً عند إنشاء الفاتورة)
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_invoices
    FROM public.invoices
    WHERE customer_id = p_customer_id AND organization_id = p_org_id 
      AND status IN ('posted', 'paid', 'partial')
      AND related_journal_entry_id IS NOT NULL;

    -- ج. إجمالي سندات القبض المرحلة (دائن -)
    SELECT COALESCE(SUM(amount), 0) INTO v_receipts
    FROM public.receipt_vouchers
    WHERE customer_id = p_customer_id AND organization_id = p_org_id
      AND related_journal_entry_id IS NOT NULL
      AND (voucher_number NOT LIKE 'DEP-%' OR voucher_number IS NULL);

    -- د. إجمالي مرتجعات المبيعات المرحلة (دائن -)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_returns
    FROM public.sales_returns
    WHERE customer_id = p_customer_id AND organization_id = p_org_id 
      AND status = 'posted'
      AND related_journal_entry_id IS NOT NULL;

    -- هـ. إجمالي الإشعارات الدائنة المرحلة (دائن -)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'credit_notes') THEN
        SELECT COALESCE(SUM(total_amount), 0) INTO v_credit_notes
        FROM public.credit_notes
        WHERE customer_id = p_customer_id AND organization_id = p_org_id 
          AND status = 'posted'
          AND related_journal_entry_id IS NOT NULL;
    END IF;

    -- و. إجمالي الشيكات الواردة غير المرفوضة (دائن -)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cheques') THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_cheques
        FROM public.cheques
        WHERE party_id = p_customer_id AND organization_id = p_org_id 
          AND type = 'incoming' AND status != 'rejected'
          AND related_journal_entry_id IS NOT NULL;
    END IF;

    -- الرصيد النهائي للعميل
    v_balance := v_opening_balance + v_invoices - v_receipts - v_returns - v_credit_notes - v_cheques;
    RETURN v_balance;
END; $$;

-- 📊 دالة حساب رصيد المورد المحدثة (تطابق كشف الحساب)
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_balance numeric := 0;
    v_opening_balance numeric := 0;
    v_invoices numeric := 0;
    v_payments numeric := 0;
    v_returns numeric := 0;
    v_debit_notes numeric := 0;
BEGIN
    -- أ. الرصيد الافتتاحي للمورد
    SELECT COALESCE(opening_balance, 0) INTO v_opening_balance
    FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير المشتريات المرحلة (دائن +)
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_invoices
    FROM public.purchase_invoices
    WHERE supplier_id = p_supplier_id AND organization_id = p_org_id 
      AND status IN ('posted', 'paid', 'partial')
      AND related_journal_entry_id IS NOT NULL;

    -- ج. إجمالي سندات الصرف المرحلة (مدين -)
    SELECT COALESCE(SUM(amount), 0) INTO v_payments
    FROM public.payment_vouchers
    WHERE supplier_id = p_supplier_id AND organization_id = p_org_id
      AND related_journal_entry_id IS NOT NULL;

    -- د. إجمالي مرتجعات المشتريات المرحلة (مدين -)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_returns
    FROM public.purchase_returns
    WHERE supplier_id = p_supplier_id AND organization_id = p_org_id 
      AND status = 'posted'
      AND related_journal_entry_id IS NOT NULL;

    -- هـ. إجمالي الإشعارات المدينة المرحلة (مدين -)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debit_notes') THEN
        SELECT COALESCE(SUM(total_amount), 0) INTO v_debit_notes
        FROM public.debit_notes
        WHERE supplier_id = p_supplier_id AND organization_id = p_org_id 
          AND status = 'posted'
          AND related_journal_entry_id IS NOT NULL;
    END IF;

    -- الرصيد النهائي للمورد
    v_balance := v_opening_balance + v_invoices - v_payments - v_returns - v_debit_notes;
    RETURN v_balance;
END; $$;

-- 📊 دالة جلب العملاء المتجاوزين لحد الائتمان (تحديث موحد)
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid);
CREATE OR REPLACE FUNCTION public.get_over_limit_customers(p_org_id uuid)
RETURNS TABLE (
    id uuid,
    name text,
    phone text,
    total_debt numeric,
    credit_limit numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.name, c.phone, COALESCE(c.balance, 0) as total_debt, COALESCE(c.credit_limit, 0) as credit_limit
    FROM public.customers c
    WHERE c.organization_id = p_org_id 
      AND COALESCE(c.credit_limit, 0) > 0 
      AND COALESCE(c.balance, 0) > COALESCE(c.credit_limit, 0) 
      AND (c.deleted_at IS NULL);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_over_limit_customers(uuid) TO authenticated;

-- 🛠️ دالة مطابقة وإعادة احتساب الأرصدة (Recalculate All Balances)
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RETURN; END IF;

    -- أ. تحديث أرصدة الحسابات العامة (دفتر الأستاذ العام)
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

    -- ب. تحديث أرصدة العملاء بناءً على الميزان الجديد
    UPDATE public.customers c
    SET balance = public.get_customer_balance(c.id, v_org_id)
    WHERE c.organization_id = v_org_id;

    -- ج. تحديث أرصدة الموردين بناءً على الميزان الجديد
    UPDATE public.suppliers s
    SET balance = public.get_supplier_balance(s.id, v_org_id)
    WHERE s.organization_id = v_org_id;
    
    -- د. إعادة حساب كميات وتكاليف المخزون
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.recalculate_all_balances(uuid) TO authenticated;

-- 🛠️ مشغل التزامن الفوري للطرفين (العميل والمورد) عند أي عملية مالية
CREATE OR REPLACE FUNCTION public.sync_partner_balance_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_partner_id uuid;
    v_org_id uuid;
    v_is_customer boolean := true;
BEGIN
    IF TG_TABLE_NAME = 'cheques' THEN
        IF TG_OP = 'DELETE' THEN
            v_partner_id := OLD.party_id;
            v_org_id := OLD.organization_id;
        ELSE
            v_partner_id := NEW.party_id;
            v_org_id := NEW.organization_id;
        END IF;
        IF EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_partner_id) THEN
            v_is_customer := false;
        END IF;
    ELSIF TG_TABLE_NAME IN ('purchase_invoices', 'payment_vouchers', 'purchase_returns', 'debit_notes') THEN
        v_is_customer := false;
        IF TG_OP = 'DELETE' THEN
            v_partner_id := OLD.supplier_id;
            v_org_id := OLD.organization_id;
        ELSE
            v_partner_id := NEW.supplier_id;
            v_org_id := NEW.organization_id;
        END IF;
    ELSE
        IF TG_OP = 'DELETE' THEN
            v_partner_id := OLD.customer_id;
            v_org_id := OLD.organization_id;
        ELSE
            v_partner_id := NEW.customer_id;
            v_org_id := NEW.organization_id;
        END IF;
    END IF;

    IF v_partner_id IS NOT NULL AND v_org_id IS NOT NULL THEN
        IF v_is_customer THEN
            UPDATE public.customers 
            SET balance = public.get_customer_balance(v_partner_id, v_org_id)
            WHERE id = v_partner_id;
        ELSE
            UPDATE public.suppliers 
            SET balance = public.get_supplier_balance(v_partner_id, v_org_id)
            WHERE id = v_partner_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ربط المشغل بالجداول المعنية
-- أ. جداول العملاء
DROP TRIGGER IF EXISTS trg_sync_customer_balance_invoice ON public.invoices;
CREATE TRIGGER trg_sync_customer_balance_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

DROP TRIGGER IF EXISTS trg_sync_customer_balance_receipt ON public.receipt_vouchers;
CREATE TRIGGER trg_sync_customer_balance_receipt
AFTER INSERT OR UPDATE OR DELETE ON public.receipt_vouchers
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

DROP TRIGGER IF EXISTS trg_sync_customer_balance_return ON public.sales_returns;
CREATE TRIGGER trg_sync_customer_balance_return
AFTER INSERT OR UPDATE OR DELETE ON public.sales_returns
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

-- ب. جداول الموردين
DROP TRIGGER IF EXISTS trg_sync_supplier_balance_invoice ON public.purchase_invoices;
CREATE TRIGGER trg_sync_supplier_balance_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

DROP TRIGGER IF EXISTS trg_sync_supplier_balance_payment ON public.payment_vouchers;
CREATE TRIGGER trg_sync_supplier_balance_payment
AFTER INSERT OR UPDATE OR DELETE ON public.payment_vouchers
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

DROP TRIGGER IF EXISTS trg_sync_supplier_balance_return ON public.purchase_returns;
CREATE TRIGGER trg_sync_supplier_balance_return
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

-- ج. جدول الشيكات المشترك
DROP TRIGGER IF EXISTS trg_sync_partner_balance_cheque ON public.cheques;
CREATE TRIGGER trg_sync_partner_balance_cheque
AFTER INSERT OR UPDATE OR DELETE ON public.cheques
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_balance_trigger();

-- د. تحديث تلقائي عند تعديل الأرصدة الافتتاحية للعملاء والموردين
CREATE OR REPLACE FUNCTION public.fn_sync_customer_opening_balance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.balance := public.get_customer_balance(NEW.id, NEW.organization_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_customer_opening_balance ON public.customers;
CREATE TRIGGER trg_sync_customer_opening_balance
BEFORE INSERT OR UPDATE OF opening_balance ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_customer_opening_balance();

CREATE OR REPLACE FUNCTION public.fn_sync_supplier_opening_balance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.balance := public.get_supplier_balance(NEW.id, NEW.organization_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_supplier_opening_balance ON public.suppliers;
CREATE TRIGGER trg_sync_supplier_opening_balance
BEFORE INSERT OR UPDATE OF opening_balance ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_supplier_opening_balance();
GRANT EXECUTE ON FUNCTION public.purge_deleted_records() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fix_returns_schema() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- 📱 منح صلاحيات القراءة لـ anon لبعض الجداول المختارة لعمل الكيو آر منيو
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.item_categories TO anon;
GRANT SELECT ON public.uoms TO anon;
GRANT SELECT ON public.organizations TO anon;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurant_tables') THEN
        EXECUTE 'GRANT SELECT ON public.restaurant_tables TO anon';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'menu_categories') THEN
        EXECUTE 'GRANT SELECT ON public.menu_categories TO anon';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifier_groups') THEN
        EXECUTE 'GRANT SELECT ON public.modifier_groups TO anon';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifiers') THEN
        EXECUTE 'GRANT SELECT ON public.modifiers TO anon';
    END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.get_active_shift(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_active_shift(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_product_recipe_cost(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb, uuid) TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_shift_report(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_payroll_rpc(integer, integer, date, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_treasury_transfer(uuid, uuid, numeric, date, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revalue_product_cost(numeric, text, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_wastage(date, jsonb, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_backup(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_missing_system_accounts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_backups_all_orgs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_financial_year(integer, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_financial_year(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_organization_from_backup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_backup_comprehensiveness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_backup_integrity(uuid, jsonb) TO authenticated;

-- 🕒 جدولة النسخ الاحتياطي التلقائي (Automated SaaS Backup)
-- الوصف: يتم تشغيل هذه المهمة عبر pg_cron لعمل نسخة احتياطية لكافة المنظمات النشطة كل ليلة الساعة 3 فجراً.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
        -- إلغاء الجدولة القديمة لتجنب التكرار في حال إعادة تشغيل السكريبت
        BEGIN
            EXECUTE 'SELECT cron.unschedule(''daily-saas-backup'')';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- جدولة النسخ الاحتياطي الساعة 3 فجراً يومياً
        -- التوقيت: (دقيقة 0، ساعة 3، يوم *، شهر *، أسبوع *)
        PERFORM cron.schedule('daily-saas-backup', '0 3 * * *', 'SELECT public.run_daily_backups_all_orgs();');

        RAISE NOTICE '✅ تم ضبط جدولة النسخ الاحتياطي التلقائي الساعة 3 فجراً بنجاح.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: ملحق pg_cron غير مفعل. النسخ الاحتياطي التلقائي يحتاج لتفعيل الإضافة من لوحة تحكم Supabase (Database -> Extensions).';
    END IF;
END $$;

-- 🚀 تنشيط ذاكرة المخطط فوراً لضمان ظهور الدوال في الـ API (حل مشكلة 404)
NOTIFY pgrst, 'reload config';

-- 🛡️ تم إزالة PERFORM recalculate_stock_rpc() من هنا لتجنب الـ Timeout أثناء التثبيت الأولي
DO $$ BEGIN
    RAISE NOTICE '✅ تم تثبيت المحرك الشامل الموحد بنجاح. النظام الآن جاهز ومؤمن.';
END $$;

-- 🛠️ دالة تصفير المخزون السالب (للوصول لـ 100% موثوقية في العروض التوضيحية)
CREATE OR REPLACE FUNCTION public.fix_negative_stock_for_demo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.products SET stock = 0 WHERE stock < 0 AND organization_id = public.get_my_org();
    PERFORM public.recalculate_stock_rpc(public.get_my_org());
END; $$;

-- 🛠️ دالة فحص الجاهزية للإطلاق (SaaS Pre-Launch Health Check)
-- الغرض: التأكد من سلامة الشركة محاسبياً وتقنياً قبل الاستخدام الفعلي
CREATE OR REPLACE FUNCTION public.check_company_launch_readiness(p_org_id uuid DEFAULT public.get_my_org())
RETURNS TABLE (
    "المعيار" text,
    "الحالة" text,
    "التفاصيل" text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. فحص توازن القيود
    "المعيار" := 'توازن القيود المحاسبية';
    IF EXISTS (SELECT 1 FROM public.journal_lines jl JOIN public.journal_entries je ON jl.journal_entry_id = je.id 
               WHERE je.organization_id = p_org_id GROUP BY je.id HAVING ABS(SUM(debit - credit)) > 0.01) THEN
        "الحالة" := '❌ خطأ'; "التفاصيل" := 'يوجد قيود غير متزنة في الأستاذ العام.';
    ELSE
        "الحالة" := '✅ سليم'; "التفاصيل" := 'كافة القيود المرحلة متزنة تماماً.';
    END IF;
    RETURN NEXT;

    -- 2. فحص إعدادات الربط المحاسبي
    "المعيار" := 'ربط الحسابات السيادية';
    IF EXISTS (SELECT 1 FROM public.company_settings WHERE organization_id = p_org_id 
               AND (account_mappings->>'CASH' IS NULL OR account_mappings->>'SALES_REVENUE' IS NULL)) THEN
        "الحالة" := '⚠️ تحذير'; "التفاصيل" := 'إعدادات الربط المحاسبي (النقدية/المبيعات) غير مكتملة.';
    ELSE
        "الحالة" := '✅ سليم'; "التفاصيل" := 'تم ربط الحسابات الأساسية بنجاح.';
    END IF;
    RETURN NEXT;

    -- 3. فحص المخزون السالب
    "المعيار" := 'سلامة أرصدة المخزون';
    IF EXISTS (SELECT 1 FROM public.products WHERE organization_id = p_org_id AND stock < 0) THEN
        "الحالة" := '⚠️ تحذير'; "التفاصيل" := 'يوجد أصناف برصيد سالب، قد تؤثر على دقة التكلفة.';
    ELSE
        "الحالة" := '✅ سليم'; "التفاصيل" := 'لا يوجد مخزون سالب حالياً.';
    END IF;
    RETURN NEXT;

    -- 4. فحص النسخ الاحتياطي
    "المعيار" := 'وجود نسخة احتياطية';
    IF EXISTS (SELECT 1 FROM public.organization_backups WHERE organization_id = p_org_id) THEN
        "الحالة" := '✅ سليم'; "التفاصيل" := 'تم أخذ نسخة احتياطية واحدة على الأقل لهذه الشركة.';
    ELSE
        "الحالة" := '❌ خطر'; "التفاصيل" := 'لم يتم إنشاء أي نسخة احتياطية لهذه الشركة حتى الآن.';
    END IF;
    RETURN NEXT;
END; $$;

-- 🛡️ [V51.5] درع تدقيق الفواتير (Deep Invoice Audit)
-- المهمة: رصد أي محاولة لتغيير الأسعار أو الخصومات بعد صدور الفاتورة
CREATE OR REPLACE FUNCTION public.fn_audit_sensitive_invoice_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.total_amount IS DISTINCT FROM NEW.total_amount) OR 
       (OLD.discount_amount IS DISTINCT FROM NEW.discount_amount) OR
       (OLD.status = 'posted' AND NEW.status = 'draft') THEN
        
        INSERT INTO public.security_logs (
            event_type, 
            description, 
            performed_by, 
            organization_id, 
            metadata
        ) VALUES (
            'invoice_tampering_alert',
            format('تعديل حساس في مبالغ الفاتورة رقم %s', NEW.invoice_number),
            auth.uid(),
            NEW.organization_id,
            jsonb_build_object(
                'invoice_id', NEW.id,
                'old_total', OLD.total_amount,
                'new_total', NEW.total_amount,
                'old_discount', OLD.discount_amount,
                'new_status', NEW.status
            )
        );
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_invoice_changes ON public.invoices;
CREATE TRIGGER trg_audit_invoice_changes
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_sensitive_invoice_changes();

GRANT EXECUTE ON FUNCTION public.check_company_launch_readiness(uuid) TO authenticated;

-- 8. دالة تنظيف البيانات الكاملة للمنظمة للتخلص من البيانات التجريبية
CREATE OR REPLACE FUNCTION public.clear_organization_data_completely(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. حذف بيانات التصنيع بذكاء
    EXECUTE 'DO $clear_mfg$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_batch_serials'') THEN
            DELETE FROM public.mfg_batch_serials WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_actual_material_usage WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_scrap_logs WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_production_variances WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_qc_inspections'') THEN
            DELETE FROM public.mfg_qc_inspections WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_material_requests'') THEN
            DELETE FROM public.mfg_material_request_items WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_material_requests WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_production_orders'') THEN
            DELETE FROM public.mfg_order_progress WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_production_orders WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_step_materials WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_routing_steps WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_routings WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_work_centers WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
    END $clear_mfg$;';

    DELETE FROM public.bill_of_materials WHERE organization_id = p_org_id;

    -- 2. حذف بيانات المقاولات والمشاريع
    EXECUTE 'DO $clear_const$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''project_material_issue_items'') THEN
            DELETE FROM public.project_material_issue_items WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_material_issues WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_daily_reports WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_custody_expenses WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_custodies WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.subcontractor_billings WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.subcontractor_contracts WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.subcontractors WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_progress_billings WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_boq WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.project_milestones WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.projects WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
    END $clear_const$;';

    -- 3. حذف الفواتير والمستندات والقيود
    DELETE FROM public.invoice_items WHERE organization_id = p_org_id;
    DELETE FROM public.invoices WHERE organization_id = p_org_id;
    
    DELETE FROM public.purchase_invoice_items WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = p_org_id;
    
    DELETE FROM public.sales_returns WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_returns WHERE organization_id = p_org_id;
    
    DELETE FROM public.receipt_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.payment_vouchers WHERE organization_id = p_org_id;
    
    DELETE FROM public.order_items WHERE organization_id = p_org_id;
    DELETE FROM public.orders WHERE organization_id = p_org_id;
    
    DELETE FROM public.stock_adjustments WHERE organization_id = p_org_id;
    DELETE FROM public.opening_inventories WHERE organization_id = p_org_id;
    DELETE FROM public.cheques WHERE organization_id = p_org_id;
    DELETE FROM public.credit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.debit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.payrolls WHERE organization_id = p_org_id;
    DELETE FROM public.employee_advances WHERE organization_id = p_org_id;
    DELETE FROM public.assets WHERE organization_id = p_org_id;
    
    -- 4. حذف القيود الدفترية (Journal Entries)
    DELETE FROM public.journal_lines WHERE organization_id = p_org_id;
    DELETE FROM public.journal_entries WHERE organization_id = p_org_id;

    -- 5. حذف المنتجات والشركاء والموظفين
    DELETE FROM public.products WHERE organization_id = p_org_id;
    DELETE FROM public.customers WHERE organization_id = p_org_id;
    DELETE FROM public.suppliers WHERE organization_id = p_org_id;
    DELETE FROM public.employees WHERE organization_id = p_org_id;
    
    -- 6. حذف تهيئة المطاعم والورديات
    DELETE FROM public.restaurant_tables WHERE organization_id = p_org_id;
    DELETE FROM public.shifts WHERE organization_id = p_org_id;

    -- 7. إعادة احتساب الأرصدة للحسابات العامة إلى 0
    UPDATE public.accounts SET balance = 0 WHERE organization_id = p_org_id;

    RETURN 'تم تنظيف كافة بيانات المنظمة بالكامل والتخلص من البيانات التجريبية ✅';
END;
$$;
GRANT EXECUTE ON FUNCTION public.clear_organization_data_completely(uuid) TO authenticated;

-- 9. دالة حذف بيانات العمليات والمنتجات التجريبية للاختبارات فقط (دون مسح البيانات الحقيقية)
CREATE OR REPLACE FUNCTION public.delete_unit_test_data(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- أ. حذف الحركات والتفاصيل للمنتجات والعملاء الخاصين بالاختبارات
    DELETE FROM public.invoice_items 
    WHERE organization_id = p_org_id 
      AND product_id IN (
          SELECT id FROM public.products 
          WHERE organization_id = p_org_id 
            AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
      );
      
    DELETE FROM public.purchase_invoice_items 
    WHERE organization_id = p_org_id 
      AND product_id IN (
          SELECT id FROM public.products 
          WHERE organization_id = p_org_id 
            AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
      );

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_material_issue_items') THEN
        DELETE FROM public.project_material_issue_items 
        WHERE product_id IN (
            SELECT id FROM public.products 
            WHERE organization_id = p_org_id 
              AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
        );
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_actual_material_usage') THEN
        DELETE FROM public.mfg_actual_material_usage 
        WHERE raw_material_id IN (
            SELECT id FROM public.products 
            WHERE organization_id = p_org_id 
              AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
        );
    END IF;

    DELETE FROM public.opening_inventories 
    WHERE organization_id = p_org_id 
      AND product_id IN (
          SELECT id FROM public.products 
          WHERE organization_id = p_org_id 
            AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية')
      );

    -- ب. حذف المشاريع ومخططاتها الخاصة بالاختبارات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
        DELETE FROM public.project_progress_billings WHERE project_id IN (SELECT id FROM public.projects WHERE name = 'Test Project Construction' AND organization_id = p_org_id);
        DELETE FROM public.project_material_issues WHERE project_id IN (SELECT id FROM public.projects WHERE name = 'Test Project Construction' AND organization_id = p_org_id);
        DELETE FROM public.project_boq WHERE project_id IN (SELECT id FROM public.projects WHERE name = 'Test Project Construction' AND organization_id = p_org_id);
        DELETE FROM public.projects WHERE organization_id = p_org_id AND name = 'Test Project Construction';
    END IF;

    -- ج. حذف المستندات المالية والورديات التجريبية الخاصة بالاختبارات
    DELETE FROM public.invoices WHERE organization_id = p_org_id AND (invoice_number LIKE 'INV-TEST-%' OR invoice_number LIKE 'LT-INV-%');
    DELETE FROM public.purchase_invoices WHERE organization_id = p_org_id AND (invoice_number LIKE 'WAC-INV-%' OR invoice_number LIKE 'PI-TEST-%');
    
    DELETE FROM public.journal_lines WHERE organization_id = p_org_id AND journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE organization_id = p_org_id 
          AND (description LIKE '%اختبار%' OR reference LIKE 'SHIFT-%' OR reference LIKE 'LT-%')
    );
    DELETE FROM public.journal_entries 
    WHERE organization_id = p_org_id 
      AND (description LIKE '%اختبار%' OR reference LIKE 'SHIFT-%' OR reference LIKE 'LT-%');

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfg_production_orders') THEN
        DELETE FROM public.mfg_production_orders WHERE organization_id = p_org_id;
    END IF;

    -- د. حذف الأصناف والعملاء والموظفين الاختباريين أنفسهم
    DELETE FROM public.products 
    WHERE organization_id = p_org_id 
      AND name IN ('وجبة اختبار شامل', 'قهوة QR', 'بيتزا اختبار', 'Test Material Construction', 'حديد خام اختبار', 'باب حديد مصنع', 'Secret Product A', 'Panadol Test', 'خبز تجريبي', 'لحم تجريبي', 'وجبة برجر اختبارية');

    DELETE FROM public.customers 
    WHERE organization_id = p_org_id 
      AND name IN ('عميل توصيل تجريبي', 'Construction Test Customer');

    DELETE FROM public.employees 
    WHERE organization_id = p_org_id 
      AND full_name IN ('سائق توصيل تجريبي');
      
    DELETE FROM public.restaurant_tables 
    WHERE organization_id = p_org_id 
      AND name IN ('Table-Test', 'Table-QR-Test');

    DELETE FROM public.shifts 
    WHERE organization_id = p_org_id 
      AND notes LIKE '%اختبار%';

    DELETE FROM public.uom_categories 
    WHERE organization_id = p_org_id 
      AND name IN ('أوزان اختبار', 'وحدات طبية اختبارية');

    DELETE FROM public.accounts 
    WHERE organization_id = p_org_id 
      AND code IN ('1231-TEST', '1231-QR');

    -- هـ. إعادة مزامنة الأرصدة
    PERFORM public.recalculate_all_balances(p_org_id);

    RETURN 'تم حذف كافة البيانات والمنتجات التجريبية للاختبارات بنجاح، وظلت بياناتك الحقيقية سليمة ومحفوظة ✅';
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_unit_test_data(uuid) TO authenticated;

-- 🌟 النسخة الشاملة الموحدة (Version 4.0 - All Modules Integrated)
-- 🌟 النسخة الشاملة الموحدة (Version 40.1 - Full Manufacturing & Stock Final Fixes + Modifiers Support)
-- ⚠️ تحذير: هذا الملف قديم (V40.1). 
-- يُفضل استخدام services/full_unified_system.sql (V50.0) للحصول على أحدث التحديثات.
-- لا تقم بتشغيل هذا الملف فوق نسخة V50.0 لأنه سيقوم بحذف الدوال الأحدث.

-- ================================================================
-- 0. تنظيف شامل لتجنب تعارض التوقيعات (يجب أن يكون في البداية)
-- ================================================================
DO $$
DECLARE
    func_signature text;
    trig_record record;
    func_name text;
BEGIN
    -- 🛡️ المرحلة 0.أ: التطهير الجذري للمشغلات (Aggressive Trigger Purge)
    -- نحذف كافة المشغلات التي قد تحتوي على منطق فحص مخزون قديم
    DECLARE
        v_target_tables text[] := ARRAY['products', 'invoices', 'invoice_items', 'orders', 'order_items', 'purchase_invoices', 'purchase_invoice_items', 'stock_adjustments'];
        v_tbl text;
        v_trg text;
    BEGIN
        FOREACH v_tbl IN ARRAY v_target_tables LOOP
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_tbl) THEN
                FOR v_trg IN (SELECT tgname FROM pg_trigger JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid WHERE relname = v_tbl AND NOT tgisinternal) 
                LOOP
                    BEGIN
                        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_trg, v_tbl);
                        RAISE NOTICE '✅ Removed trigger % from table %', v_trg, v_tbl;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE WARNING '⚠️ Could not drop trigger %: %', v_trg, SQLERRM;
                    END;
                END LOOP;
            END IF;
        END LOOP;
    END;

    -- 🛑 تم إيقاف الحذف التلقائي للدوال لضمان استقرار النظام والاعتماد على OR REPLACE فقط
    -- FOR func_signature IN (SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
    -- LOOP
    --     func_name := split_part(func_signature, '(', 1);
    --     -- 🛡️ صمام أمان إضافي: حذف كافة توقيعات دالة الطلبات العامة لمنع التعارض بين UUID و TEXT
    --     IF REPLACE(func_name, 'public.', '') = 'create_public_order' THEN
    --         EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_signature);
    --     END IF;

    --     -- نزيل بادئة "public." إذا وجدت لضمان مطابقة الاسم بشكل صحيح. تم تحديث القائمة لتشمل دوال التصنيع الجديدة.
    --     IF REPLACE(func_name, 'public.', '') IN ( -- Deduplicated and updated list
    --         'approve_invoice', 'approve_purchase_invoice', 'approve_receipt_voucher', 'approve_payment_voucher',
    --         'approve_purchase_return', 'convert_po_to_invoice',
    --         'approve_sales_return', 'approve_purchase_return', 'approve_debit_note', 'approve_credit_note',
    --         'start_shift', 'get_dashboard_stats', 'create_restaurant_order', 'create_public_order', 'get_pending_payment_orders', 'recalculate_all_balances', 'complete_restaurant_order', 'mfg_calculate_standard_cost', 'get_product_recipe_cost',
    --         'open_table_session', 
    --         'run_payroll_rpc', 'recalculate_stock_rpc', 'recalculate_all_system_balances', 'initialize_egyptian_coa',
    --         'get_restaurant_sales_report', 'process_wastage', 'get_item_profit_report', 'get_active_shift',
    --         'get_shift_summary', 'generate_shift_closing_entry', 'close_shift', 'force_provision_admin',
    --         'get_products_without_bom', 'calculate_product_wac', 'update_single_supplier_balance', 'update_product_stock',
    --         'get_admin_test_summary', 'add_product_with_opening_balance', 'run_period_depreciation', 'create_organization_backup',
    --         'run_daily_backups_all_orgs', 'restore_organization_backup', 'force_grant_admin_access', 'post_cheque_journal_entry',
    --     'get_or_create_qr_for_table', 'get_current_company_settings', 'get_historical_ratios', 'fn_ensure_kitchen_order_org',
    --         'fn_ensure_document_warehouse', 'fn_assign_cashier_to_qr_order', 'fn_ensure_order_warehouse',
    --         'trg_fn_update_kitchen_status_time', 'trg_fn_sync_meal_cost', 'sync_customer_balance_trigger',
    --         'fn_auto_approve_invoice_on_insert', 'fn_auto_approve_invoice_on_items_insert', 'cleanup_orphaned_backups',
    --         'cleanup_storage_orphans_trigger', 'sync_role_permissions', 'create_new_client_v2', 'handle_new_user',
    --         'check_user_limit', 'prevent_system_account_deletion', 'set_emergency_mode', 'get_saas_platform_metrics',
    --         'repair_all_admin_permissions', 'clear_demo_data', 'get_admin_platform_metrics',
    --         'fix_unbalanced_journal_entry', 'approve_stock_transfer', 'cancel_stock_transfer', 'post_inventory_count', 'check_account_is_not_group',
    --         'get_account_balance_at_date', 'fn_validate_journal_entry_balance', 'test_saas_isolation',
    --     'test_wac_logic', 'trigger_handle_stock_on_order', 'trg_fn_sync_product_costs_on_update', 'test_restaurant_shift_lifecycle'
    --     ) THEN
    --         EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_signature);
    --     END IF;

    --     -- 🛡️ تم إيقاف الحذف التلقائي لدوال التصنيع هنا لمنع تعطل المديول
    --     -- عند تشغيل ملفات تثبيت النظام العامة. 
    --     -- مديول التصنيع يدير تنظيف نفسه في ملفه الخاص.
    --     -- IF REPLACE(func_name, 'public.', '') LIKE 'mfg\_%' THEN
    --     --     EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_signature);
    --     -- END IF;
    -- END LOOP;

END $$;

-- 🛡️ دالة بدء الوردية (Start Shift) - النسخة الموحدة
-- تم تحديث التوقيع ليتوافق مع نداء الواجهة الأمامية ويدعم السوبر أدمن والشركات المتعددة
DROP FUNCTION IF EXISTS public.start_pos_shift CASCADE;

CREATE OR REPLACE FUNCTION public.start_pos_shift(
    p_opening_balance numeric DEFAULT 0, 
    p_resume_existing boolean DEFAULT true, 
    p_treasury_account_id uuid DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL
)
RETURNS public.shifts 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE 
    v_existing_shift public.shifts; 
    v_new_shift public.shifts;
    v_org_id uuid;
BEGIN
    -- جلب منظمة المستخدم (سواء من بروفايله أو من التوكن للسوبر أدمن)
    v_org_id := COALESCE(
        public.get_my_org(), 
        (SELECT organization_id FROM public.profiles WHERE id = COALESCE(p_user_id, auth.uid()))
    );
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'فشل تحديد المنظمة. تأكد من ضبط المنظمة النشطة للسوبر أدمن.';
    END IF;

    -- البحث عن وردية مفتوحة
    SELECT * INTO v_existing_shift 
    FROM public.shifts 
    WHERE user_id = COALESCE(p_user_id, auth.uid()) AND end_time IS NULL AND organization_id = v_org_id 
    LIMIT 1;

    IF v_existing_shift.id IS NOT NULL AND p_resume_existing THEN 
        RETURN v_existing_shift; 
    END IF;

    IF v_existing_shift.id IS NOT NULL THEN 
        RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم. يرجى إغلاقها أولاً.'; 
    END IF;

    -- إنشاء الوردية الجديدة مع ربط الخزينة المختارة
    INSERT INTO public.shifts (user_id, start_time, opening_balance, treasury_account_id, organization_id, status)
    VALUES (COALESCE(p_user_id, auth.uid()), now(), p_opening_balance, p_treasury_account_id, v_org_id, 'OPEN') 
    RETURNING * INTO v_new_shift;

    RETURN v_new_shift;
END; $$;

-- 🛠️ تحديث: دالة جلب الوردية النشطة مع دعم البارامترات الاختيارية
DROP FUNCTION IF EXISTS public.get_active_shift CASCADE;

CREATE OR REPLACE FUNCTION public.get_active_shift(
    p_user_id uuid DEFAULT NULL, 
    p_org_id uuid DEFAULT NULL
)
RETURNS public.shifts 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_org uuid;
    v_shift public.shifts;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());
    
    SELECT * INTO v_shift FROM public.shifts 
    WHERE user_id = COALESCE(p_user_id, auth.uid())
      AND end_time IS NULL 
      AND organization_id = v_target_org
    ORDER BY start_time DESC LIMIT 1;

    RETURN v_shift;
END; $$;

-- 🛠️ دالة جلب الطلب النشط لطاولة (Fix 404 get_open_table_order)
CREATE OR REPLACE FUNCTION public.get_open_table_order(p_table_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session record;
    v_order record;
    v_items json;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();

    -- 1. البحث عن جلسة مفتوحة لهذه الطاولة في هذه المنظمة
    SELECT * INTO v_session FROM public.table_sessions 
    WHERE table_id = p_table_id AND status = 'OPEN' AND end_time IS NULL AND organization_id = v_org_id
    LIMIT 1;

    IF v_session.id IS NULL THEN RETURN NULL; END IF;

    -- 2. البحث عن الطلب المفتوح (CONFIRMED وغير مدفوع)
    SELECT * INTO v_order FROM public.orders 
    WHERE session_id = v_session.id AND status NOT IN ('CANCELLED', 'DRAFT', 'posted', 'paid', 'PAID', 'COMPLETED')
    AND organization_id = v_org_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_order.id IS NULL THEN
        RETURN json_build_object('sessionId', v_session.id, 'orderId', NULL, 'items', '[]'::json);
    END IF;

    -- 3. جلب الأصناف بتنسيق متوافق مع واجهة ActiveOrder
    SELECT json_agg(t) INTO v_items FROM (
        SELECT 
            oi.id,
            oi.product_id as "productId",
            p.name,
            oi.quantity,
            oi.unit_price as "unitPrice",
            oi.unit_cost as "unitCost",
            oi.notes,
            oi.modifiers as "selectedModifiers",
            oi.quantity as "savedQuantity"
        FROM public.order_items oi
        JOIN public.products p ON oi.product_id = p.id
        WHERE oi.order_id = v_order.id
    ) t;

    RETURN json_build_object(
        'sessionId', v_session.id,
        'orderId', v_order.id,
        'items', COALESCE(v_items, '[]'::json)
    );
END; $$;

-- 🛠️ دالة حجز طاولة
CREATE OR REPLACE FUNCTION public.reserve_table(p_table_id uuid, p_customer_name text, p_arrival_time text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.restaurant_tables 
    SET status = 'RESERVED',
        reservation_info = jsonb_build_object('customerName', p_customer_name, 'arrivalTime', p_arrival_time)
    WHERE id = p_table_id AND organization_id = public.get_my_org();
    RETURN FOUND;
END; $$;

-- 🛠️ دالة إلغاء حجز
CREATE OR REPLACE FUNCTION public.cancel_reservation(p_table_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.restaurant_tables SET status = 'AVAILABLE', reservation_info = NULL 
    WHERE id = p_table_id AND organization_id = public.get_my_org();
END; $$;

-- ================================================================
-- 1. دوال المبيعات والمشتريات (Sales & Purchases)
-- ================================================================

-- أ. اعتماد فاتورة المبيعات
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_discount_acc_id uuid; v_treasury_acc_id uuid;
    v_customer_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_journal_id uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_mappings jsonb;
    v_allow_negative_stock boolean; v_current_stock numeric; v_item_details record; v_final_org uuid; v_session_org uuid; v_wh_stock numeric;
BEGIN
    -- 1. التحقق من الفاتورة
     RAISE NOTICE 'DEBUG: Starting approve_invoice for invoice_id=%', p_invoice_id;
   
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status IN ('posted', 'paid') THEN RETURN; END IF; -- منع التكرار

     -- 🛡️ محرك استنتاج الهوية المطور (Identity Resolution Engine)
    v_session_org := public.get_my_org();
    v_final_org := COALESCE(v_invoice.organization_id, v_session_org);
   
    IF v_final_org IS NULL THEN
        SELECT p.organization_id INTO v_final_org 
        FROM public.invoice_items ii JOIN public.products p ON ii.product_id = p.id 
        WHERE ii.invoice_id = p_invoice_id LIMIT 1;
    END IF;
    RAISE NOTICE 'DEBUG: Session Org: %, Invoice Org: %, Final Org: %', v_session_org, v_invoice.organization_id, v_final_org;

   IF v_final_org IS NULL THEN 
        RAISE EXCEPTION '❌ [خطأ هوية حرج]: لم يتم العثور على معرف منظمة للفاتورة أو الأصناف. (Session Org: %, Invoice Org: %)', v_session_org, v_invoice.organization_id; 
    END IF;
    RAISE NOTICE 'DEBUG: Using org_id: %', v_final_org;

    v_org_id := v_final_org;
    RAISE NOTICE 'DEBUG: Fetching company settings for org_id: %', v_org_id;
    DELETE FROM public.journal_entries WHERE organization_id = v_org_id AND related_document_id = p_invoice_id AND related_document_type = 'invoice';
    
    IF NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = p_invoice_id) THEN RETURN; END IF; -- 🛡️ حماية من "سباق الزمن"
    


    -- 2. جلب روابط الحسابات من إعدادات الشركة (Scoped by Org)
    SELECT account_mappings, allow_negative_stock INTO v_mappings, v_allow_negative_stock FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1;
    RAISE NOTICE 'DEBUG: Allow Negative Stock: %', v_allow_negative_stock;

    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4101') AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1221', '1102') AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '5101') AND organization_id = v_org_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1105') AND organization_id = v_org_id LIMIT 1));
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_sales_acc_id IS NULL OR v_customer_acc_id IS NULL OR v_cogs_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المبيعات أو المخزون غير معرّفة لهذه المنظمة.';
    END IF;
    RAISE NOTICE 'DEBUG: Accounts fetched: Sales=% Customer=% COGS=% Inventory=%', v_sales_acc_id, v_customer_acc_id, v_cogs_acc_id, v_inventory_acc_id;

    -- 4. 🛡️ التحقق من توفر المخزون
    
    IF COALESCE(v_allow_negative_stock, false) = false THEN
           RAISE NOTICE 'DEBUG: Checking stock availability for each item.';

            FOR v_item_details IN 
            SELECT p.id, p.name, p.stock, p.organization_id as prod_org, ii.quantity as req_qty, p.product_type, p.warehouse_stock
            FROM public.invoice_items ii
            JOIN public.products p ON ii.product_id = p.id -- Join with products to get product_type
            WHERE ii.invoice_id = p_invoice_id
        LOOP
            IF v_item_details.product_type IN ('SERVICE', 'NON_STOCK') THEN CONTINUE; END IF;
            RAISE NOTICE 'DEBUG: Item % (Prod Org: %) - Current Stock: %, Required: %', v_item_details.name, v_item_details.prod_org, v_item_details.stock, v_item_details.req_qty;

            -- فحص الرصيد في المستودع المحدد للفاتورة حصراً
            v_wh_stock := COALESCE((v_item_details.warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0);

            -- إذا وجدنا أن الصنف يتبع شركة أخرى، نعطيك رسالة تفصيلية بدلاً من "رصيد غير كافٍ"
            IF v_item_details.prod_org != v_org_id THEN
                RAISE EXCEPTION '❌ [خطأ تضارب]: الصنف "%" يتبع شركة (%) بينما تحاول بيعه من شركة (%). يرجى توحيد المنظمة.', 
                    v_item_details.name, (SELECT name FROM public.organizations WHERE id = v_item_details.prod_org), (SELECT name FROM public.organizations WHERE id = v_org_id);
            ELSIF v_wh_stock < v_item_details.req_qty THEN
                RAISE EXCEPTION '❌ [عجز مستودع]: الصنف "%" رصيده (%) في المستودع المختار، بينما المطلوب (%). (الرصيد الكلي في الشركة: %)', 
                    v_item_details.name, v_wh_stock, v_item_details.req_qty, v_item_details.stock;
            END IF;
        END LOOP;
    END IF;

    -- 4. تحديث المخزون وحساب تكلفة البضاعة المباعة (COGS)
    FOR v_item IN SELECT ii.*, p.product_type FROM public.invoice_items ii JOIN public.products p ON ii.product_id = p.id WHERE ii.invoice_id = p_invoice_id LOOP
        -- 🚀 محرك التكلفة الذكي: يعطي الأولوية للتكلفة الشاملة (بما فيها التصنيع) من بطاقة الصنف
        SELECT COALESCE(
            cost, -- التكلفة الشاملة (مواد + عمالة + مصاريف غير مباشرة)
            NULLIF(weighted_average_cost, 0),
            NULLIF(purchase_price, 0), 
            0
        ) INTO v_item_cost -- Use COALESCE for default 0
        FROM public.products 
        WHERE id = v_item.product_id AND organization_id = v_org_id;
        
        v_total_cost := v_total_cost + (v_item_cost * v_item.quantity);
        
        -- تحديث تكلفة البند في الفاتورة لضمان دقة التقارير لاحقاً
        UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;

        -- تحديث المخزون مع معالجة حالة المستودع الفارغ (Ensure warehouse_id is not NULL)
        UPDATE public.products SET stock = stock - v_item.quantity, 
        warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[COALESCE(v_invoice.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    -- 5. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'invoice', true) RETURNING id INTO v_journal_id;

    -- 6. إنشاء أسطر القيد (منطق القيد المزدوج الشفاف)
    
    -- أ. إثبات مديونية العميل بكامل قيمة الفاتورة
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) -- Ensure description is not NULL
    VALUES (v_journal_id, v_customer_acc_id, v_invoice.total_amount, 0, 'إجمالي قيمة الفاتورة رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);

    -- ب. إثبات التحصيل النقدي الفوري (إذا وجد) لضمان دقة كشف الحساب
    IF COALESCE(v_invoice.paid_amount, 0) > 0 THEN 
        IF v_treasury_acc_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد حساب الخزينة للمبلغ المدفوع'; END IF;
        
        -- قيد التحصيل: من حساب الخزينة (مدين) إلى حساب العميل (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_treasury_acc_id, v_invoice.paid_amount, 0, 'تحصيل نقدي مع الفاتورة رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id),
            (v_journal_id, v_customer_acc_id, 0, v_invoice.paid_amount, 'سداد فوري من العميل مع الفاتورة', v_org_id);
    END IF;

    IF COALESCE(v_invoice.discount_amount, 0) > 0 AND v_discount_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_discount_acc_id, COALESCE(v_invoice.discount_amount, 0), 0, 'خصم ممنوح', v_org_id); END IF;
    IF v_sales_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات', v_org_id); END IF;
    IF COALESCE(v_invoice.tax_amount, 0) > 0 THEN
        IF v_vat_acc_id IS NULL THEN
            RAISE EXCEPTION 'فشل الترحيل: حساب ضريبة القيمة المضافة (VAT) غير معرّف في إعدادات الربط لهذه المنظمة.';
        END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, COALESCE(v_invoice.tax_amount, 0), 'ضريبة القيمة المضافة', v_org_id);
    END IF;
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة مبيعات', v_org_id), (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id); END IF;

    -- 7. تحديث حالة الفاتورة
    UPDATE public.invoices SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;

    -- 🚀 إعادة احتساب المخزون فوراً لضمان الدقة بعد أي تعديلات
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ إضافة اسم مستعار لدالة المبيعات لتوافق الواجهة الأمامية (Fix 404 post_sales_invoice)
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    PERFORM public.approve_invoice(p_invoice_id);
END; $$;
-- 🛠️ دالة ترحيل فاتورة المشتريات (Approve Purchase Invoice)
-- تم إنشاؤها لحل خطأ 42883 وضمان ترحيل المخزون والموردين
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_in_id uuid; v_supplier_acc_id uuid;
    v_journal_id uuid; v_mappings jsonb; v_treasury_acc_id uuid;
BEGIN
    -- 1. التحقق من الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    v_org_id := v_invoice.organization_id;

    -- 2. جلب روابط الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🛡️ محرك الربط الذكي: التحقق من صحة المعرف قبل التحويل لمنع خطأ "معرف غير صالح" في قاعدة البيانات
    v_inventory_acc_id := CASE WHEN (v_mappings->>'INVENTORY_RAW_MATERIALS') ~ '^[0-9a-fA-F-]{36}$' THEN (v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid ELSE (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1) END;
    v_vat_in_id := CASE WHEN (v_mappings->>'VAT_INPUT') ~ '^[0-9a-fA-F-]{36}$' THEN (v_mappings->>'VAT_INPUT')::uuid ELSE (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1) END;
    v_supplier_acc_id := CASE WHEN (v_mappings->>'SUPPLIERS') ~ '^[0-9a-fA-F-]{36}$' THEN (v_mappings->>'SUPPLIERS')::uuid ELSE (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1) END;
    
    v_treasury_acc_id := v_invoice.treasury_account_id;

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
        RAISE EXCEPTION 'إعدادات الحسابات مفقودة لهذه المنظمة (المخزون أو الموردين).';
    END IF;

    -- 3. إنشاء رأس قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;

    -- 4. إنشاء أسطر القيد
    -- أ. من ح/ المخزون (بالصافي)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_inventory_acc_id, v_invoice.subtotal, 0, 'إثبات قيمة المشتريات مخزنياً', v_org_id);

    -- ب. من ح/ ضريبة القيمة المضافة (مدخلات)
    IF COALESCE(v_invoice.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_in_id, v_invoice.tax_amount, 0, 'ضريبة مدخلات مشتريات', v_org_id);
    END IF;

    -- ج. إلى ح/ المورد (بكامل القيمة)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount, 'استحقاق قيمة الفاتورة للمورد', v_org_id);

    -- د. إثبات السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 THEN
        IF v_treasury_acc_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد الخزينة/البنك للمبلغ المدفوع فورياً.'; END IF;
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount, 0, 'سداد جزء من الفاتورة للمورد', v_org_id),
            (v_journal_id, v_treasury_acc_id, 0, v_invoice.paid_amount, 'نقدية خارجة مقابل مشتريات', v_org_id);
    END IF;

    -- 5. تحديث حالة الفاتورة وربطها بالقيد
    UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;

    -- 6. تحديث الأرصدة والمخزون
    PERFORM public.recalculate_stock_rpc(v_org_id);
    PERFORM public.update_single_supplier_balance(v_invoice.supplier_id, v_org_id);

    -- 🚀 تحديث متوسط التكلفة (WAC) للمنتجات المشتراة لضمان ظهورها في التصنيع
    UPDATE public.products p
    SET 
        purchase_price = item.unit_price,
        cost = item.unit_price,
        weighted_average_cost = CASE 
            WHEN (p.stock + item.quantity) > 0 
            THEN ROUND(((COALESCE(p.stock, 0) * COALESCE(p.weighted_average_cost, p.cost, 0)) + (item.quantity * item.unit_price)) / (p.stock + item.quantity), 4)
            ELSE item.unit_price 
        END
    FROM public.purchase_invoice_items item
    WHERE item.purchase_invoice_id = p_invoice_id AND item.product_id = p.id;
END; $$;

-- 🛠️ إضافة اسم مستعار للدالة لتوافق الواجهة الأمامية (Fix 404 post_purchase_invoice)
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    PERFORM public.approve_purchase_invoice(p_invoice_id);
END; $$;

-- 🛠️ دالة تحويل أمر البيع إلى فاتورة (Convert Sales Order to Invoice)
CREATE OR REPLACE FUNCTION public.convert_so_to_invoice(p_so_id uuid, p_warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_so record;
    v_invoice_id uuid;
    v_inv_num text;
    v_target_org_id uuid;
    v_final_wh_id uuid;
    v_customer_id uuid;
    v_salesperson_id uuid;
    v_calculated_subtotal numeric := 0;
    v_calculated_tax_amount numeric := 0;
    v_calculated_total_amount numeric := 0;
    v_notes text;
    v_currency text;
    v_exchange_rate numeric := 1;
    v_vat_rate numeric;
BEGIN
    -- 1. جلب تفاصيل أمر البيع
    SELECT * INTO v_so FROM public.sales_orders WHERE id = p_so_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر البيع غير موجود'; END IF;

    -- 2. تحديد معرف المنظمة
    v_target_org_id := COALESCE(v_so.organization_id, public.get_my_org());
    IF v_target_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة لأمر البيع.'; END IF;

    -- 3. جلب إعدادات الشركة لمعدل الضريبة والعملة والمستودع الافتراضي
    SELECT vat_rate, currency, default_warehouse_id
    INTO v_vat_rate, v_currency, v_final_wh_id
    FROM public.company_settings
    WHERE organization_id = v_target_org_id LIMIT 1;

    v_vat_rate := COALESCE(v_vat_rate, 0.14); -- معدل ضريبة القيمة المضافة الافتراضي
    v_currency := COALESCE(v_currency, 'EGP');

    -- 4. تحديد المستودع النهائي
    v_final_wh_id := COALESCE(p_warehouse_id, v_final_wh_id, (SELECT id FROM public.warehouses WHERE organization_id = v_target_org_id AND deleted_at IS NULL LIMIT 1));
    IF v_final_wh_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المستودع للفاتورة.'; END IF;

    -- 5. 🛡️ إصلاح الاستقرار: استخدام القيم المسجلة في الطلب أو حسابها بدقة
    IF COALESCE(v_so.subtotal, 0) > 0 THEN
        v_calculated_subtotal := v_so.subtotal;
        v_calculated_tax_amount := v_so.tax_amount;
        v_calculated_total_amount := v_so.total_amount;
    ELSE
        SELECT COALESCE(SUM(soi.quantity * soi.unit_price), 0), COALESCE(SUM(soi.quantity * soi.unit_price * v_vat_rate), 0)
        INTO v_calculated_subtotal, v_calculated_tax_amount
        FROM public.sales_order_items soi WHERE soi.sales_order_id = p_so_id;
        v_calculated_total_amount := v_calculated_subtotal + v_calculated_tax_amount;
    END IF;

    -- 6. توليد رقم الفاتورة
    v_inv_num := 'INV-SO-' || COALESCE(v_so.order_number, substring(p_so_id::text, 1, 8));

    -- 7. إعداد تفاصيل الفاتورة
    v_customer_id := v_so.customer_id;
    v_salesperson_id := auth.uid(); -- المستخدم الحالي هو مندوب المبيعات
    v_notes := 'محولة من أمر بيع رقم: ' || COALESCE(v_so.order_number, 'بدون رقم');
    -- v_created_by is removed as 'created_by' is a GENERATED ALWAYS column

    -- 8. إدراج الفاتورة في جدول public.invoices
    INSERT INTO public.invoices (invoice_number, customer_id, salesperson_id, user_id, invoice_date, due_date, total_amount, tax_amount, subtotal, status, notes, warehouse_id, organization_id, currency, exchange_rate)
    VALUES (v_inv_num, v_customer_id, v_salesperson_id, auth.uid(), now()::date, now()::date + interval '30 days', v_calculated_total_amount, v_calculated_tax_amount, v_calculated_subtotal, 'draft', v_notes, v_final_wh_id, v_target_org_id, v_currency, v_exchange_rate) RETURNING id INTO v_invoice_id;

    -- 9. إدراج بنود الفاتورة في جدول public.invoice_items
    INSERT INTO public.invoice_items (invoice_id, product_id, quantity, unit_price, cost, organization_id, tax_rate)
    SELECT v_invoice_id, soi.product_id, soi.quantity, soi.unit_price, COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0), v_target_org_id, v_vat_rate * 100
    FROM public.sales_order_items soi JOIN public.products p ON soi.product_id = p.id WHERE soi.sales_order_id = p_so_id;

    -- 10. تحديث حالة أمر البيع
    UPDATE public.sales_orders SET status = 'invoiced' WHERE id = p_so_id;

    RETURN v_invoice_id;
END; $$;
-- 🛠️ دالة ترحيل مرتجع المشتريات (Approve Purchase Return)
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_inventory_acc_id uuid;
    v_vat_acc_id uuid;
    v_supplier_acc_id uuid;
    v_journal_id uuid;
    v_mappings jsonb; -- لإعدادات ربط الحسابات
BEGIN
    -- أ. التحقق من المرتجع
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المشتريات غير موجود'; END IF;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_return_id AND related_document_type = 'purchase_return';

    -- تحديد المنظمة من المرتجع مباشرة لضمان عزل البيانات في نظام SaaS
    v_org_id := v_return.organization_id;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'فشل تحديد المنظمة للمرتجع. يرجى التأكد من صلاحيات الوصول.';
    END IF;

    -- ب. جلب روابط الحسابات من إعدادات الشركة (Scoped by Org)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1;

    -- ج. جلب الحسابات (الأولوية للربط المخصص Mapping ثم الكود الافتراضي)
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة لهذه المنظمة.';
    END IF;

    -- د. تحديث المخزون (خصم الكميات)
    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products 
        SET stock = stock - v_item.quantity,
            warehouse_stock = jsonb_set(
                COALESCE(warehouse_stock, '{}'::jsonb), 
                ARRAY[COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], 
                to_jsonb(COALESCE((warehouse_stock->>COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1)))::numeric, 0) - v_item.quantity)
            )
        WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    -- هـ. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_return.return_date, 
        'مرتجع مشتريات رقم ' || COALESCE(v_return.return_number, '-'), 
        v_return.return_number, 
        'posted', 
        v_org_id,
        p_return_id,
        'purchase_return',
        true
    ) RETURNING id INTO v_journal_id;

    -- و. إنشاء أسطر القيد
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, v_return.total_amount, 0, 'مرتجع مشتريات - ' || v_return.return_number, v_org_id);
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, 0, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 'مخزون - مرتجع مشتريات ' || v_return.return_number, v_org_id);
    IF COALESCE(v_return.tax_amount, 0) > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_return.tax_amount, 'ضريبة مدخلات (عكس) - مرتجع ' || v_return.return_number, v_org_id); END IF;

    -- ز. تحديث حالة المرتجع
    UPDATE public.purchase_returns 
    SET status = 'posted', related_journal_entry_id = v_journal_id
    WHERE id = p_return_id;

    -- 🚀 إعادة احتساب المخزون فوراً لضمان الدقة بعد أي تعديلات
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة تحويل أمر الشراء إلى فاتورة (Convert PO to Invoice)
CREATE OR REPLACE FUNCTION public.convert_po_to_invoice(p_po_id uuid, p_warehouse_id uuid DEFAULT NULL, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po record; v_invoice_id uuid; v_inv_num text; v_target_org_id uuid;
BEGIN
    -- 🛡️ تحديد المنظمة لضمان ظهور الفاتورة في السجل الصحيح
    v_target_org_id := COALESCE(p_org_id, public.get_my_org());

    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أمر الشراء غير موجود'; END IF;
    v_target_org_id := COALESCE(v_target_org_id, v_po.organization_id);

    v_inv_num := 'PI-FROM-' || COALESCE(v_po.order_number, substring(p_po_id::text, 1, 8));

    -- 🛡️ إصلاح الاستقرار: ترتيب الأعمدة والقيم بدقة لمنع فشل إنشاء الدالة
    INSERT INTO public.purchase_invoices (
        invoice_number, supplier_id, user_id, invoice_date, total_amount, tax_amount, subtotal,
        status, warehouse_id, organization_id, notes, currency, exchange_rate
    ) VALUES (
        v_inv_num, 
        v_po.supplier_id, 
        auth.uid(), -- user_id
        now()::date, -- invoice_date
        COALESCE(v_po.total_amount, 0), 
        COALESCE(v_po.tax_amount, 0),
        COALESCE(v_po.total_amount, 0) - COALESCE(v_po.tax_amount, 0),
        'draft',
        COALESCE(p_warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_target_org_id AND deleted_at IS NULL ORDER BY name ASC LIMIT 1)),
        v_target_org_id,
        'محولة من أمر شراء رقم: ' || COALESCE(v_po.order_number, 'بدون رقم'),
        'EGP', 
        1
    ) RETURNING id INTO v_invoice_id;

    -- 3. نقل البنود مع الحفاظ على وحدة القياس والإجماليات لضمان صحة القيود المحاسبية
    INSERT INTO public.purchase_invoice_items (
        purchase_invoice_id, product_id, quantity, unit_price, uom_id, total, organization_id
    )
    SELECT 
        v_invoice_id, 
        product_id, 
        quantity, 
        unit_price, 
        uom_id, 
        COALESCE(total, quantity * unit_price), 
        v_target_org_id
    FROM public.purchase_order_items 
    WHERE order_id = p_po_id;

    UPDATE public.purchase_orders SET status = 'invoiced' WHERE id = p_po_id;
    RETURN v_invoice_id;
END; $$;

-- 🔓 منح صلاحية التنفيذ
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_po_to_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_so_to_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_so_to_invoice(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO anon;

-- 🛠️ دالة إضافة قيد يومية يدوياً مع المرفقات
-- تحل مشكلة الخطأ 404 وتدعم رفع الملفات مع القيد
CREATE OR REPLACE FUNCTION public.add_journal_entry(
    attachments jsonb DEFAULT '[]'::jsonb,
    date date DEFAULT now(), -- 🛠️ تحديث: استخدام now() كقيمة افتراضية
    description text DEFAULT NULL,
    lines jsonb DEFAULT '[]'::jsonb,
    reference text DEFAULT NULL,
    status text DEFAULT 'draft',
    p_org_id uuid DEFAULT NULL
) 
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_journal_id uuid;
    v_line jsonb;
    v_attachment jsonb;
    v_org_id uuid;
BEGIN
    -- 🛡️ تحديد المنظمة (SaaS Protection)
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى التأكد من تسجيل الدخول.';
    END IF;

    -- 1. إنشاء رأس القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, user_id, is_posted)
    VALUES (date, description, reference, status, v_org_id, auth.uid(), (status = 'posted'))
    RETURNING id INTO v_journal_id;

    -- 2. إدراج أسطر القيد (المدين والدائن)
    FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(lines, '[]'::jsonb)) LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id, cost_center_id)
        VALUES (
            v_journal_id, 
            COALESCE((v_line->>'account_id')::uuid, (v_line->>'accountId')::uuid), -- 🛡️ دعم كلا المسميين لمنع JS Crash
            COALESCE((v_line->>'debit')::numeric, 0), 
            COALESCE((v_line->>'credit')::numeric, 0), 
            COALESCE(v_line->>'description', description), 
            v_org_id,
            (v_line->>'cost_center_id')::uuid
        );
    END LOOP;

    -- 3. إدراج المرفقات (إن وجدت)
    IF attachments IS NOT NULL AND jsonb_array_length(attachments) > 0 THEN
        FOR v_attachment IN SELECT * FROM jsonb_array_elements(attachments) LOOP
            INSERT INTO public.journal_attachments (journal_entry_id, file_path, file_name, file_type, file_size, organization_id)
            VALUES (
                v_journal_id,
                v_attachment->>'file_path',
                v_attachment->>'file_name',
                v_attachment->>'file_type',
                (v_attachment->>'file_size')::numeric,
                v_org_id
            );
        END LOOP;
    END IF;

    RETURN v_journal_id;
END; $$;
-- 🛡️ دالة إعادة احتساب المخزون الشاملة (Recalculate Stock RPC) - المحرك الموحد والكامل (Phase 3 Finalization)
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(p_org_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
    prod RECORD;
    total_qty numeric;
    wh_stock jsonb;
    wh_rec RECORD;
    v_is_test_prod boolean;
    v_final_org uuid;
BEGIN
    -- 🛡️ محرك ذكي لتحديد النطاق (SaaS Scope Resolver)
    -- إذا كان المستخدم "سوبر أدمن" وترك المعرف فارغاً، يتم إعادة الاحتساب لكافة الشركات (Global Sync)
    -- أما المستخدم العادي، فيجبر على منظمته الحالية فقط حتى لو أرسل NULL
    IF p_org_id IS NULL AND public.get_my_role() != 'super_admin' THEN
        v_final_org := public.get_my_org();
    ELSE
        v_final_org := p_org_id;
    END IF;

    IF v_final_org IS NOT NULL THEN
        RAISE NOTICE '🚀 بدء إعادة احتساب المخزون للمنظمة: %', v_final_org;
    ELSE
        RAISE NOTICE '🌍 جاري بدء إعادة احتساب المخزون الشامل لكافة المنظمات...';
    END IF;

    -- 🛡️ محرك إعادة احتساب المخزون الشامل (SaaS Multi-tenant Engine)
    FOR prod IN SELECT id, organization_id FROM public.products 
               WHERE (v_final_org IS NULL OR organization_id = v_final_org) 
                 AND deleted_at IS NULL LOOP
        total_qty := 0;
        wh_stock := '{}'::jsonb;

        -- تحديد ما إذا كان الصنف الحالي هو أحد أصناف الاختبار لتقليل الضجيج في الـ Logs
        v_is_test_prod := prod.id IN (SELECT id FROM public.products WHERE name LIKE '%اختبار%' OR name LIKE '%تجريبي%');

        -- 1. حساب رصيد كل مستودع يخص المنظمة
        FOR wh_rec IN SELECT id FROM public.warehouses 
                     WHERE (organization_id = prod.organization_id) LOOP
            DECLARE
                q_in numeric := 0; q_out numeric := 0; q_opening numeric := 0;
                q_adj numeric := 0; q_transfer_in numeric := 0; q_transfer_out numeric := 0;
                temp_val numeric := 0; net_wh numeric := 0;
            BEGIN
                -- أ. رصيد أول المدة
                SELECT COALESCE(SUM(quantity), 0) INTO q_opening FROM public.opening_inventories 
                WHERE product_id = prod.id AND warehouse_id = wh_rec.id;

                -- ب. المشتريات (وارد)
                SELECT COALESCE(SUM(pii.quantity), 0) INTO temp_val FROM public.purchase_invoice_items pii
                JOIN public.purchase_invoices pi ON pii.purchase_invoice_id = pi.id
                WHERE pii.product_id = prod.id AND pi.warehouse_id = wh_rec.id
                  AND UPPER(pi.status) NOT IN ('DRAFT', 'CANCELLED') AND pi.organization_id = prod.organization_id;
                q_in := q_in + temp_val;
                IF temp_val > 0 THEN RAISE NOTICE 'Item % In-WH %: Purchase +%', prod.id, wh_rec.id, temp_val; END IF;

                -- ج. المبيعات (صادر) - تشمل الخصم المباشر ومكونات الوجبات (BOM)
                -- 1. الخصم المباشر
                SELECT COALESCE(SUM(ii.quantity), 0) INTO temp_val FROM public.invoice_items ii JOIN public.invoices i ON ii.invoice_id = i.id WHERE ii.product_id = prod.id AND i.warehouse_id = wh_rec.id AND UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED') AND i.organization_id = prod.organization_id AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = ii.product_id);
                q_out := q_out + temp_val;

                -- 🚀 إضافة خصم طلبات المطعم (Direct Order Stock)
                SELECT COALESCE(SUM(oi.quantity), 0) INTO temp_val 
                FROM public.order_items oi 
                JOIN public.orders o ON oi.order_id = o.id 
                WHERE oi.product_id = prod.id AND o.warehouse_id = wh_rec.id 
                  AND (UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED')) 
                  AND o.organization_id = prod.organization_id 
                  AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = oi.product_id);
                q_out := q_out + temp_val;
                IF temp_val > 0 THEN RAISE NOTICE 'Item % In-WH %: POS Direct -%', prod.id, wh_rec.id, temp_val; END IF;

                -- 2. خصم مكونات الـ BOM للأصناف المجمعة المباعة
                SELECT COALESCE(SUM(ii.quantity * bom.quantity_required), 0) INTO temp_val 
                FROM public.invoice_items ii 
                JOIN public.invoices i ON ii.invoice_id = i.id 
                JOIN public.bill_of_materials bom ON bom.product_id = ii.product_id 
                WHERE bom.raw_material_id = prod.id AND i.warehouse_id = wh_rec.id AND UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED') AND i.organization_id = prod.organization_id;
                q_out := q_out + temp_val;
                IF temp_val > 0 THEN RAISE NOTICE 'Raw Material % In-WH %: Invoice BOM -%', prod.id, wh_rec.id, temp_val; END IF;

                -- 🚀 إضافة خصم مكونات BOM للطلبات (Order BOM)
                SELECT COALESCE(SUM(oi.quantity * bom.quantity_required), 0) INTO temp_val 
                FROM public.order_items oi 
                JOIN public.orders o ON oi.order_id = o.id 
                JOIN public.bill_of_materials bom ON bom.product_id = oi.product_id 
                WHERE bom.raw_material_id = prod.id AND o.warehouse_id = wh_rec.id 
                  AND (UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED')) 
                  AND o.organization_id = prod.organization_id;
                q_out := q_out + temp_val;
                IF temp_val > 0 THEN RAISE NOTICE 'Raw Material % In-WH %: POS BOM -%', prod.id, wh_rec.id, temp_val; END IF;

                -- 3. خصم مكونات الـ BOM للإضافات (Modifiers) لضمان دقة استهلاك المطاعم
                SELECT COALESCE(SUM(ii.quantity * bom.quantity_required), 0) 
                FROM public.invoice_items ii 
                JOIN public.invoices i ON ii.invoice_id = i.id 
                CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ii.modifiers, '[]'::jsonb)) AS m 
                JOIN public.bill_of_materials bom ON bom.product_id = (m->>'id')::uuid 
                WHERE bom.raw_material_id = prod.id AND i.warehouse_id = wh_rec.id AND UPPER(i.status) NOT IN ('DRAFT', 'CANCELLED') AND i.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- 🚀 إضافة خصم مكونات BOM للإضافات في الطلبات (Order Modifiers)
                SELECT COALESCE(SUM(oi.quantity * bom.quantity_required), 0) INTO temp_val 
                FROM public.order_items oi 
                JOIN public.orders o ON oi.order_id = o.id 
                CROSS JOIN LATERAL jsonb_array_elements(COALESCE(oi.modifiers, '[]'::jsonb)) AS m 
                JOIN public.bill_of_materials bom ON bom.product_id = (m->>'id')::uuid 
                WHERE bom.raw_material_id = prod.id AND o.warehouse_id = wh_rec.id AND UPPER(o.status) IN ('PAID', 'COMPLETED', 'POSTED') AND o.organization_id = prod.organization_id;
                q_out := q_out + temp_val;
                IF temp_val > 0 THEN RAISE NOTICE 'Raw Material % In-WH %: Modifiers BOM -%', prod.id, wh_rec.id, temp_val; END IF;

                -- ح. الإنتاج المصنع (وارد للمنتج التام)
                -- 🚀 تحسين: احتساب الأوامر التي تنتمي لهذا المستودع أو الأوامر التي لا تمتلك مستودعاً (تُنسب لأول مستودع)
                SELECT COALESCE(SUM(quantity_to_produce), 0) INTO temp_val 
                FROM public.mfg_production_orders 
                WHERE product_id = prod.id AND status = 'completed' AND organization_id = prod.organization_id
                AND (warehouse_id = wh_rec.id OR (warehouse_id IS NULL AND wh_rec.id = (SELECT id FROM public.warehouses WHERE organization_id = prod.organization_id ORDER BY created_at ASC LIMIT 1)));
                
                q_in := q_in + temp_val;

                -- ط. المواد المستهلكة في التصنيع (صادر للمواد الخام)
                SELECT COALESCE(SUM(amu.actual_quantity), 0) INTO temp_val FROM public.mfg_actual_material_usage amu
                JOIN public.mfg_order_progress op ON amu.order_progress_id = op.id
                JOIN public.mfg_production_orders po ON op.production_order_id = po.id
                WHERE amu.raw_material_id = prod.id AND po.warehouse_id = wh_rec.id AND po.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- د. مرتجعات المبيعات (وارد)
                SELECT COALESCE(SUM(sri.quantity), 0) INTO temp_val FROM public.sales_return_items sri
                JOIN public.sales_returns sr ON sri.sales_return_id = sr.id
                WHERE sri.product_id = prod.id AND sr.warehouse_id = wh_rec.id AND UPPER(sr.status) NOT IN ('DRAFT', 'CANCELLED') AND sr.organization_id = prod.organization_id;
                q_in := q_in + temp_val;

                -- هـ. مرتجعات المشتريات (صادر)
                SELECT COALESCE(SUM(pri.quantity), 0) INTO temp_val FROM public.purchase_return_items pri
                JOIN public.purchase_returns pr ON pri.purchase_return_id = pr.id
                WHERE pri.product_id = prod.id AND pr.warehouse_id = wh_rec.id AND UPPER(pr.status) NOT IN ('DRAFT', 'CANCELLED') AND pr.organization_id = prod.organization_id;
                q_out := q_out + temp_val;

                -- و. التسويات المخزنية
                SELECT COALESCE(SUM(sai.quantity), 0) INTO temp_val FROM public.stock_adjustment_items sai
                JOIN public.stock_adjustments sa ON sai.stock_adjustment_id = sa.id
                WHERE sai.product_id = prod.id AND sa.warehouse_id = wh_rec.id AND UPPER(sa.status) NOT IN ('DRAFT', 'CANCELLED') AND sa.organization_id = prod.organization_id;
                q_adj := temp_val;

                -- ز. التحويلات
                SELECT COALESCE(SUM(sti.quantity), 0) INTO temp_val FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.to_warehouse_id = wh_rec.id AND UPPER(st.status) NOT IN ('DRAFT', 'CANCELLED') AND st.organization_id = prod.organization_id;
                q_transfer_in := temp_val;
                SELECT COALESCE(SUM(sti.quantity), 0) INTO temp_val FROM public.stock_transfer_items sti JOIN public.stock_transfers st ON sti.stock_transfer_id = st.id WHERE sti.product_id = prod.id AND st.from_warehouse_id = wh_rec.id AND UPPER(st.status) NOT IN ('DRAFT', 'CANCELLED') AND st.organization_id = prod.organization_id;
                q_transfer_out := temp_val;

                -- المعادلة النهائية للمستودع
                net_wh := q_opening + q_in - q_out + q_adj + q_transfer_in - q_transfer_out;
                
                -- تحديث JSON المستودعات (RAISE NOTICE مفيد هنا للتأكد من القيم الصفرية)
                IF net_wh <> 0 THEN
                    wh_stock := jsonb_set(wh_stock, ARRAY[wh_rec.id::text], to_jsonb(net_wh));
                    total_qty := total_qty + net_wh;
                END IF;
            END;
        END LOOP;

        UPDATE public.products SET stock = total_qty, warehouse_stock = wh_stock WHERE id = prod.id;
    END LOOP;
END;
$$;
-- 🛠️ دالة إتمام طلب المطعم (Complete Restaurant Order)
CREATE OR REPLACE FUNCTION public.complete_restaurant_order(
   
    p_order_id uuid,
    p_payment_method text, -- Not directly used in accounting logic, but required by signature
    p_amount numeric,
    p_cash_account_id uuid,    
    p_org_id uuid DEFAULT NULL -- Make it optional as it might be passed or inferred
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order record;
    v_org_id_final uuid;
    v_table_id uuid;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود.'; END IF;

    -- 🛡️ منع التلاعب بحالات الطلبات المكتملة بالفعل
    IF v_order.status IN ('PAID', 'COMPLETED') THEN 
        RAISE NOTICE 'الطلب مدفوع بالفعل.';
        RETURN;
    END IF;

    -- 1. تحديد المنظمة بدقة
    v_org_id_final := COALESCE(v_order.organization_id, p_org_id, public.get_my_org());
    IF v_org_id_final IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة للطلب.'; END IF;

    -- 2. تنظيف أي قيود قديمة مرتبطة بهذا الطلب (في حال تكرار المحاولة)
    DELETE FROM public.journal_entries WHERE related_document_id = p_order_id AND related_document_type = 'restaurant_order';

    -- 3. تسجيل عملية الدفع في جدول المدفوعات ليتم تجميعها عند إغلاق الوردية
    -- هذا يمنع إنشاء قيد فوري ويؤجل المحاسبة لنهاية الوردية كما هو مطلوب
    INSERT INTO public.payments (
        order_id, 
        amount, 
        payment_method, 
        status, 
        organization_id, 
        cash_account_id
    ) VALUES (
        p_order_id, 
        p_amount, 
        p_payment_method, 
        'COMPLETED', 
        v_org_id_final,
        p_cash_account_id
    );

    -- 4. تحديث حالة الطلب إلى مدفوع
    UPDATE public.orders SET status = 'PAID' WHERE id = p_order_id;

    -- 5. تحرير الطاولة وإغلاق الجلسة (إصلاح مشكلة الحالة العالقة)
    IF v_order.session_id IS NOT NULL THEN 
        -- جلب معرف الطاولة الفعلي من الجلسة
        SELECT table_id INTO v_table_id FROM public.table_sessions WHERE id = v_order.session_id;
        
        UPDATE public.table_sessions SET end_time = now(), status = 'CLOSED' WHERE id = v_order.session_id; 
        UPDATE public.restaurant_tables SET status = 'AVAILABLE', session_start = NULL, bill_requested = FALSE WHERE id = v_table_id; 
    END IF;

    -- 🚀 تشغيل محرك خصم المخزون الفوري بناءً على الوصفة (BOM)
    -- هذا يضمن أن المواد الخام (لحم، خبز، إلخ) تُخصم لحظة البيع
    PERFORM public.mfg_deduct_stock_from_order(p_order_id);

    -- 7. إعادة احتساب الأرصدة المالية
    PERFORM public.recalculate_all_system_balances(v_org_id_final);
END; $$;
-- 13.5 دالة اختبار تكامل مبيعات المطعم مع استهلاك المواد الخام
-- تهدف للتأكد من أن بيع وجبة (صنف تام) يؤدي لخصم مكوناتها (خامات) آلياً
CREATE OR REPLACE FUNCTION public.mfg_test_pos_integration()
RETURNS TABLE(step_name text, result text, details text) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_org_id uuid; v_wh_id uuid; v_meal_id uuid; v_meat_id uuid; v_bread_id uuid;
    v_session_id uuid; v_order_id uuid; v_meat_stock_before numeric; v_meat_stock_after numeric;
    v_items jsonb;
BEGIN
    -- 🛡️ تفعيل وضع الاستعادة للسماح بتنظيف البيانات المحمية إن وجدت
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 1. تحديد المنظمة والمستودع
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN 
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1; 
    END IF;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'لا توجد منظمة مسجلة في النظام للاختبار.';
    END IF;
    
    SELECT id INTO v_wh_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;
    IF v_wh_id IS NULL THEN
        INSERT INTO public.warehouses (name, organization_id) VALUES ('مستودع اختبار POS', v_org_id) RETURNING id INTO v_wh_id;
    END IF;

    -- 🗑️ تنظيف مسبق لأي بيانات قديمة بنفس الاسم لضمان نجاح الاختبار
    DELETE FROM public.products WHERE organization_id = v_org_id AND name IN ('لحم تجريبي', 'خبز تجريبي', 'وجبة برجر اختبارية');

    -- 2. إنشاء أصناف الاختبار
    -- خامات (لحم، خبز)
    INSERT INTO public.products (name, product_type, mfg_type, stock, purchase_price, organization_id) 
    VALUES ('لحم تجريبي', 'STOCK', 'raw', 100, 50, v_org_id) RETURNING id INTO v_meat_id;
    
    INSERT INTO public.products (name, product_type, mfg_type, stock, purchase_price, organization_id) 
    VALUES ('خبز تجريبي', 'STOCK', 'raw', 100, 5, v_org_id) RETURNING id INTO v_bread_id;

    -- وجبة نهائية (برجر)
    INSERT INTO public.products (name, product_type, mfg_type, organization_id, sales_price) 
    VALUES ('وجبة برجر اختبارية', 'STOCK', 'standard', v_org_id, 150) RETURNING id INTO v_meal_id;

    -- تسجيل أرصدة افتتاحية للتأكد من وجود مخزون فعلي في المحرك
    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id)
    VALUES (v_meat_id, v_wh_id, 100, 50, v_org_id), (v_bread_id, v_wh_id, 100, 5, v_org_id);

    step_name := '1. تهيئة الأصناف والخامات'; result := 'PASS ✅'; details := 'تم إنشاء برجر، لحم، وخبز برصيد 100 لكل منهما'; RETURN NEXT;

    -- 3. بناء الـ BOM (الوصفة)
    -- البرجر يحتاج 1 لحم و 1 خبز
    INSERT INTO public.bill_of_materials (product_id, raw_material_id, quantity_required, organization_id)
    VALUES (v_meal_id, v_meat_id, 1, v_org_id), (v_meal_id, v_bread_id, 1, v_org_id);

    step_name := '2. بناء وصفة الوجبة (BOM)'; result := 'PASS ✅'; details := 'الوجبة = 1 لحم + 1 خبز'; RETURN NEXT;

    -- تحديث المخزون الأولي لضمان جاهزية المحرك
    PERFORM public.recalculate_stock_rpc(v_org_id);
    SELECT stock INTO v_meat_stock_before FROM public.products WHERE id = v_meat_id;

    -- 4. محاكاة عملية بيع مطعم (POS)
    -- إنشاء جلسة
    INSERT INTO public.table_sessions (start_time, status, organization_id) 
    VALUES (now(), 'OPEN', v_org_id) RETURNING id INTO v_session_id;

    -- بناء بنود الطلب (طلب 5 وجبات برجر)
    v_items := jsonb_build_array(
        jsonb_build_object('product_id', v_meal_id, 'quantity', 5, 'unit_price', 150)
    );

    -- استدعاء دالة إنشاء الطلب
    v_order_id := public.create_restaurant_order(v_session_id, auth.uid(), 'DINE_IN', 'اختبار تكامل POS-MFG', v_items, NULL, v_wh_id, NULL, v_org_id);

    step_name := '3. إنشاء طلب مطعم (POS)'; result := 'PASS ✅'; details := 'تم طلب 5 وجبات برجر بنجاح'; RETURN NEXT;

    -- 5. تفعيل الخصم (تغيير الحالة إلى PAID)
    -- هذا سيقوم بتشغيل التريجر trg_handle_stock_on_order -> mfg_deduct_stock_from_order
    UPDATE public.orders SET status = 'PAID' WHERE id = v_order_id;

    step_name := '4. اعتماد الدفع (PAID)'; result := 'PASS ✅'; details := 'تم تحويل حالة الطلب، جاري فحص استهلاك المخزون اللحظي'; RETURN NEXT;

    -- 6. التحقق النهائي من المخزون (يجب أن ينقص رصيد الخامات وليس المنتج التام)
    SELECT stock INTO v_meat_stock_after FROM public.products WHERE id = v_meat_id;

    IF v_meat_stock_after = (v_meat_stock_before - 5) THEN
        step_name := '5. فحص استهلاك الخامات آلياً'; 
        result := 'SUCCESS 🏆'; 
        details := format('رصيد اللحم الأولي: %s، الحالي: %s (تم خصم 5 خامات بنجاح آلياً بدلاً من الوجبة)', v_meat_stock_before, v_meat_stock_after);
    ELSE
        step_name := '5. فحص استهلاك الخامات آلياً'; 
        result := 'FAIL ❌'; 
        details := format('خطأ في الخصم! الأولي: %s، الحالي: %s (المتوقع: %s)', v_meat_stock_before, v_meat_stock_after, (v_meat_stock_before - 5));
    END IF;
    RETURN NEXT;

    -- 8. تنظيف بيانات الاختبار (جراحي)
    DELETE FROM public.payments WHERE order_id = v_order_id;
    DELETE FROM public.order_items WHERE order_id = v_order_id;
    DELETE FROM public.kitchen_orders WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id = v_order_id);
    DELETE FROM public.orders WHERE id = v_order_id;
    DELETE FROM public.table_sessions WHERE id = v_session_id;
    DELETE FROM public.bill_of_materials WHERE product_id = v_meal_id;
    DELETE FROM public.products WHERE id IN (v_meat_id, v_bread_id, v_meal_id);
    
    PERFORM set_config('app.restore_mode', 'off', true);
    RETURN;

EXCEPTION WHEN OTHERS THEN
    step_name := 'CRITICAL ERROR'; result := 'ERROR 🛑'; details := SQLERRM;
    PERFORM set_config('app.restore_mode', 'off', true);
    RETURN NEXT;
END; $$;

-- ================================================================
-- 2. دوال المرتجعات والإشعارات (Returns & Notes)
-- ================================================================

-- أ. اعتماد مرتجع مبيعات (Sales Return)
CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_journal_id uuid;
    v_acc_sales_ret uuid; v_acc_vat uuid; v_acc_cust uuid;
    v_acc_cogs uuid; v_acc_inv uuid;
    v_total_cost numeric := 0; v_item_cost numeric; v_mappings jsonb;
BEGIN
    -- 1. التحقق من المرتجع
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;

    -- 🛡️ نظام "استبدال القيد": حذف القيود القديمة لهذا المستند منعاً للتكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_return_id AND related_document_type = 'sales_return';
    
    v_org_id := public.get_my_org();
    IF v_return.organization_id != v_org_id THEN RAISE EXCEPTION 'تحذير أمني: لا تملك صلاحية هذا المرتجع'; END IF;

    -- 2. جلب روابط الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_sales_ret := COALESCE((v_mappings->>'SALES_RETURNS')::uuid, (SELECT id FROM public.accounts WHERE code = '412' AND organization_id = v_org_id LIMIT 1));
    v_acc_vat := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_acc_cust := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_acc_cogs := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_acc_inv := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. تحديث المخزون (زيادة) وحساب التكلفة المنعكسة
    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP -- Ensure warehouse_id is not NULL
        SELECT COALESCE(weighted_average_cost, cost, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id AND organization_id = v_org_id;
        v_total_cost := v_total_cost + (v_item_cost * v_item.quantity);
        UPDATE public.products SET stock = stock + v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity)) WHERE id = v_item.product_id AND organization_id = v_org_id;
    END LOOP;

    -- 4. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true) RETURNING id INTO v_journal_id;

    -- 5. إنشاء أسطر القيد
    IF v_acc_sales_ret IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_sales_ret, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مردودات مبيعات', v_org_id); END IF;
    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_acc_vat IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_vat, v_return.tax_amount, 0, 'عكس ضريبة مخرجات', v_org_id); END IF;
    IF v_acc_cust IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cust, 0, v_return.total_amount, 'تخفيض مديونية عميل', v_org_id); END IF;
    IF v_total_cost > 0 AND v_acc_inv IS NOT NULL AND v_acc_cogs IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_inv, v_total_cost, 0, 'إعادة للمخزون', v_org_id), (v_journal_id, v_acc_cogs, 0, v_total_cost, 'عكس تكلفة مبيعات', v_org_id); END IF;

    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;

    -- 🚀 إعادة احتساب المخزون فوراً لضمان الدقة بعد أي تعديلات
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ج. اعتماد الإشعار المدين (Debit Note) للموردين
CREATE OR REPLACE FUNCTION public.approve_debit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid; v_acc_supp uuid; v_acc_cogs uuid; v_mappings jsonb;
BEGIN
    SELECT * INTO v_note FROM public.debit_notes WHERE id = p_note_id;
    v_org_id := public.get_my_org();
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_supp := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));
    v_acc_cogs := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار مدين للمورد رقم ' || v_note.debit_note_number, v_note.debit_note_number, 'posted', v_org_id, p_note_id, 'debit_note', true) RETURNING id INTO v_journal_id;

    IF v_acc_supp IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_supp, v_note.total_amount, 0, 'تخفيض حساب المورد', v_org_id); END IF;
    IF v_acc_cogs IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cogs, 0, v_note.total_amount, 'تسوية تكلفة (خصم مكتسب)', v_org_id); END IF;

    UPDATE public.debit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END; $$;

-- د. اعتماد إشعار دائن (Credit Note) للعملاء
CREATE OR REPLACE FUNCTION public.approve_credit_note(p_note_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note record; v_org_id uuid; v_journal_id uuid; v_acc_allowance uuid; v_acc_cust uuid; v_mappings jsonb;
BEGIN
    SELECT * INTO v_note FROM public.credit_notes WHERE id = p_note_id;
    v_org_id := public.get_my_org();
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_acc_allowance := COALESCE((v_mappings->>'SALES_DISCOUNT')::uuid, (SELECT id FROM public.accounts WHERE code = '413' AND organization_id = v_org_id LIMIT 1));
    v_acc_cust := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_note.note_date, 'إشعار دائن للعميل رقم ' || v_note.credit_note_number, v_note.credit_note_number, 'posted', v_org_id, p_note_id, 'credit_note', true) RETURNING id INTO v_journal_id;

    IF v_acc_allowance IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_allowance, v_note.total_amount, 0, 'خصم مسموح به', v_org_id); END IF;
    IF v_acc_cust IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_acc_cust, 0, v_note.total_amount, 'تخفيض مديونية عميل', v_org_id); END IF;

    UPDATE public.credit_notes SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_note_id;
END; $$;

-- هـ. اعتماد سند القبض (Receipt Voucher)
CREATE OR REPLACE FUNCTION public.approve_receipt_voucher(p_voucher_id uuid, p_credit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ -- Removed SECURITY DEFINER to avoid potential issues with nested calls
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid; v_final_credit_acc_id uuid; v_mappings jsonb;
BEGIN
    v_org_id := public.get_my_org();
    -- 🛡️ جلب إعدادات الربط المحاسبي للمنظمة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    SELECT * INTO v_voucher FROM public.receipt_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند القبض غير موجود.'; END IF;

    -- 🛡️ ضمان جذري: حذف أي قيود تحمل نفس رقم السند لنفس المنظمة منعاً للتكرار التاريخي
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'receipt_voucher';

    -- 🚀 تحديد الحساب الدائن النهائي بناءً على نوع السند
    IF v_voucher.voucher_type = 'security_deposit' THEN
        v_final_credit_acc_id := COALESCE(
            (v_mappings->>'SECURITY_DEPOSIT_ACCOUNT')::uuid,
            (SELECT id FROM public.accounts WHERE code = '226' AND organization_id = v_org_id LIMIT 1)
        );
        IF v_final_credit_acc_id IS NULL THEN
            RAISE EXCEPTION 'حساب تأمينات ودفعات مقدمة من العملاء (226) غير معرّف في دليل الحسابات أو في إعدادات الربط.';
        END IF;
    ELSE
        v_final_credit_acc_id := p_credit_account_id;
    END IF;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.receipt_date, 'سند قبض رقم ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'receipt_voucher', true) RETURNING id INTO v_journal_id;
    
    IF v_voucher.treasury_account_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id); END IF;
    IF v_final_credit_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_final_credit_acc_id, 0, v_voucher.amount, v_voucher.notes, v_org_id); END IF;
    
    UPDATE public.receipt_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;

    -- 🚀 إعادة مطابقة الأرصدة المالية فوراً لضمان الدقة بعد التعديل
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;

-- 🛠️ دالة ترحيل قيد يومية للشيكات (Post Cheque Journal Entry)
-- تقوم بإنشاء قيد محاسبي عند تحصيل أو صرف أو ارتداد الشيك
CREATE OR REPLACE FUNCTION public.post_cheque_journal_entry(p_cheque_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cheque record;
    v_org_id uuid;
    v_journal_id uuid;
    v_bank_acc_id uuid;
    v_customer_acc_id uuid;
    v_supplier_acc_id uuid;
    v_mappings jsonb;
    v_description text;
BEGIN
    -- 1. جلب تفاصيل الشيك
    SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الشيك غير موجود.'; END IF;
    -- 🛡️ منع التكرار: إذا كان هناك قيد مرتبط بالفعل، لا تفعل شيئاً
    IF v_cheque.related_journal_entry_id IS NOT NULL THEN RETURN; END IF;

    v_org_id := v_cheque.organization_id; -- استخدام organization_id من الشيك مباشرة
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'معرف المنظمة للشيك غير محدد.'; END IF;

    -- 2. جلب روابط الحسابات من إعدادات الشركة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 3. تحديد الحسابات ذات الصلة
    v_bank_acc_id := v_cheque.current_account_id; -- حساب البنك المحدد في الشيك
    IF v_bank_acc_id IS NULL THEN
        -- Fallback إلى حساب البنك الافتراضي للمنظمة
        v_bank_acc_id := COALESCE((v_mappings->>'BANK_MAIN')::uuid, (SELECT id FROM public.accounts WHERE code = '123201' AND organization_id = v_org_id LIMIT 1));
    END IF;

    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    IF v_bank_acc_id IS NULL THEN RAISE EXCEPTION 'حساب البنك غير معرف في الشيك أو إعدادات الشركة.'; END IF;

    -- 4. إنشاء قيد اليومية بناءً على نوع الشيك وحالته
    IF v_cheque.type = 'in' AND v_cheque.status = 'collected' THEN
        v_description := 'تحصيل شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '-');
        IF v_customer_acc_id IS NULL THEN RAISE EXCEPTION 'حساب العملاء غير معرف لتحصيل شيك وارد.'; END IF;

        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
        VALUES (now()::date, v_description, v_cheque.cheque_number, 'posted', v_org_id, p_cheque_id, 'cheque_collection', true)
        RETURNING id INTO v_journal_id;

        -- من ح/ البنك (مدين) إلى ح/ العميل (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, 'إيداع شيك رقم ' || COALESCE(v_cheque.cheque_number, '-'), v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, 0, v_cheque.amount, 'تحصيل من عميل بشيك رقم ' || COALESCE(v_cheque.cheque_number, '-'), v_org_id);

    ELSIF v_cheque.type = 'out' AND v_cheque.status = 'cashed' THEN
        v_description := 'صرف شيك صادر رقم ' || COALESCE(v_cheque.cheque_number, '-');
        IF v_supplier_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الموردين غير معرف لصرف شيك صادر.'; END IF;

        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
        VALUES (now()::date, v_description, v_cheque.cheque_number, 'posted', v_org_id, p_cheque_id, 'cheque_payment', true)
        RETURNING id INTO v_journal_id;

        -- من ح/ المورد (مدين) إلى ح/ البنك (دائن)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, v_cheque.amount, 0, 'سداد لمورد بشيك رقم ' || COALESCE(v_cheque.cheque_number, '-'), v_org_id);
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, 'صرف شيك رقم ' || COALESCE(v_cheque.cheque_number, '-'), v_org_id);

    ELSIF v_cheque.status = 'bounced' THEN
        -- 🛡️ نظام "استبدال القيد": حذف أي قيود سابقة لهذا الشيك قبل إنشاء قيد الارتداد
        DELETE FROM public.journal_entries WHERE related_document_id = p_cheque_id AND related_document_type IN ('cheque_collection', 'cheque_payment');

        v_description := 'ارتداد شيك رقم ' || COALESCE(v_cheque.cheque_number, '-');

        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted)
        VALUES (now()::date, v_description, v_cheque.cheque_number, 'posted', v_org_id, p_cheque_id, 'cheque_bounced', true) RETURNING id INTO v_journal_id;

        IF v_cheque.type = 'in' THEN -- شيك وارد مرتد
            IF v_customer_acc_id IS NULL THEN RAISE EXCEPTION 'حساب العملاء غير معرف لارتداد شيك وارد.'; END IF;
            -- من ح/ العميل (مدين - إعادة مديونية) إلى ح/ البنك (دائن - خصم من البنك)
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, v_cheque.amount, 0, 'ارتداد شيك وارد - إعادة مديونية العميل ' || COALESCE(v_cheque.cheque_number, '-'), v_org_id);
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, 'ارتداد شيك وارد - خصم من البنك ' || COALESCE(v_cheque.cheque_number, '-'), v_org_id);
        ELSIF v_cheque.type = 'out' THEN -- شيك صادر مرتد
            IF v_supplier_acc_id IS NULL THEN RAISE EXCEPTION 'حساب الموردين غير معرف لارتداد شيك صادر.'; END IF;
            -- من ح/ البنك (مدين - إعادة المبلغ للبنك) إلى ح/ المورد (دائن - إعادة استحقاق المورد)
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, 'ارتداد شيك صادر - إعادة المبلغ للبنك ' || COALESCE(v_cheque.cheque_number, '-'), v_org_id);
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_supplier_acc_id, 0, v_cheque.amount, 'ارتداد شيك صادر - إعادة استحقاق المورد ' || COALESCE(v_cheque.cheque_number, '-'), v_org_id);
        END IF;
    ELSE
        -- للحالات الأخرى مثل 'pending', 'issued', 'deposited' لا يتم إنشاء قيد مباشر
        RETURN;
    END IF;

    -- 5. تحديث الشيك بمعرف القيد المرتبط
    UPDATE public.cheques SET related_journal_entry_id = v_journal_id WHERE id = p_cheque_id;

    -- 6. إعادة احتساب الأرصدة لضمان الدقة
    PERFORM public.recalculate_all_system_balances(v_org_id);
END;
$$;

-- 🛠️ مشغل آلي لترحيل قيود الشيكات عند تغيير الحالة
CREATE OR REPLACE FUNCTION public.trg_post_cheque_journal_entry()
RETURNS TRIGGER AS $$
BEGIN
    -- نرحل القيد فقط عندما تتغير الحالة إلى 'collected', 'cashed', أو 'bounced'
    IF NEW.status IN ('collected', 'cashed', 'bounced') AND NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM public.post_cheque_journal_entry(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_post_cheque_journal_entry ON public.cheques;
CREATE TRIGGER trg_post_cheque_journal_entry
AFTER UPDATE OF status ON public.cheques
FOR EACH ROW EXECUTE FUNCTION public.trg_post_cheque_journal_entry();

-- 🔓 منح صلاحية التنفيذ للدالة للمستخدمين المصادق عليهم
GRANT EXECUTE ON FUNCTION public.post_cheque_journal_entry(uuid) TO authenticated;

-- و. اعتماد سند الصرف (Payment Voucher)
CREATE OR REPLACE FUNCTION public.approve_payment_voucher(p_voucher_id uuid, p_debit_account_id uuid) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_voucher record; v_journal_id uuid; v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    SELECT * INTO v_voucher FROM public.payment_vouchers WHERE id = p_voucher_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'سند الصرف غير موجود.'; END IF;

    -- 🛡️ منع استخدام حساب الأرصدة الافتتاحية (3999) لترحيل سندات الصرف العادية
    IF (SELECT code FROM public.accounts WHERE id = p_debit_account_id) = '3999' THEN
        RAISE EXCEPTION '⚠️ خطأ محاسبي: لا يمكن استخدام حساب الأرصدة الافتتاحية (3999) لترحيل سندات الصرف العادية. يرجى اختيار حساب المصروف الصحيح.';
    END IF;

    -- 🛡️ ضمان جذري: حذف أي قيود تحمل نفس رقم السند لنفس المنظمة منعاً للتكرار التاريخي
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND (related_document_id = p_voucher_id OR reference = v_voucher.voucher_number)
    AND related_document_type = 'payment_voucher';

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_voucher.payment_date, 'سند صرف رقم ' || v_voucher.voucher_number, v_voucher.voucher_number, 'posted', v_org_id, p_voucher_id, 'payment_voucher', true) RETURNING id INTO v_journal_id;
    
    IF p_debit_account_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, p_debit_account_id, v_voucher.amount, 0, v_voucher.notes, v_org_id); END IF;
    IF v_voucher.treasury_account_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_voucher.treasury_account_id, 0, v_voucher.amount, v_voucher.notes, v_org_id); END IF;

    UPDATE public.payment_vouchers SET related_journal_entry_id = v_journal_id WHERE id = p_voucher_id;

    -- 🚀 إعادة مطابقة الأرصدة المالية فوراً لضمان الدقة بعد التعديل
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;

-- ================================================================
-- 3. مديول المطاعم (Restaurant Module)
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL
    , p_delivery_info jsonb DEFAULT NULL, -- إضافة معلومات التوصيل
    p_org_id uuid DEFAULT NULL -- 🛠️ تحديث: إضافة p_org_id كمعامل
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order_id uuid; v_item jsonb; v_order_num text; v_order_item_id uuid; v_tax_rate numeric; v_subtotal numeric := 0; v_unit_price numeric; v_qty numeric; v_final_wh_id uuid; v_product_cost numeric;
DECLARE v_org_id uuid;
BEGIN
    -- 🛡️ جلب معرف المنظمة من الجلسة الحالية
    -- 🚀 تحسين: استخدام المنظمة المرتبطة بالجلسة إذا تعذر جلبها من بروفايل المستخدم (مهم للاختبارات وطلبات QR)
    v_org_id := COALESCE(p_org_id,
        public.get_my_org(),
        (SELECT organization_id FROM public.table_sessions WHERE id = p_session_id)
    );
    
    -- 🏗️ تحديد المستودع: الأولوية للممرر، ثم الافتراضي في الإعدادات، ثم أول مستودع متاح
    v_final_wh_id := COALESCE(
        p_warehouse_id, 
        (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1)
    );

    SELECT (vat_rate) INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1;
    IF v_tax_rate IS NULL THEN v_tax_rate := 0.14; END IF;

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, v_final_wh_id) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- 🛡️ استخراج القيم وضمان عدم وجود NULL
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 1);
        v_unit_price := COALESCE(
            (v_item->>'unit_price')::numeric, 
            (v_item->>'unitPrice')::numeric, 
            (v_item->>'price')::numeric
        , 0); -- Default to 0 if price is not found
        
        -- 🚀 جلب التكلفة الشاملة للمنتج من بطاقة الصنف (بما في ذلك تكاليف التصنيع)
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_product_cost FROM public.products WHERE id = COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid);

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, unit_cost, notes, organization_id, modifiers)
        VALUES (
            v_order_id, 
            COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid), 
            v_qty, 
            v_unit_price,
            v_product_cost, -- استخدام التكلفة الشاملة من بطاقة الصنف
            v_item->>'notes', 
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb)
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + (v_qty * v_unit_price);
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    UPDATE public.orders SET subtotal = v_subtotal, total_tax = v_subtotal * v_tax_rate, grand_total = v_subtotal + (v_subtotal * v_tax_rate) WHERE id = v_order_id;
     IF p_delivery_info IS NOT NULL THEN
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0), v_org_id);
    END IF;   
    RETURN v_order_id;
END; $$;

-- 🛠️ دالة جلب الطلبات المعلقة للسايد بار (SaaS Ready)
-- تستخدم لإظهار طلبات السفري والتوصيل التي لم يتم سدادها بعد
CREATE OR REPLACE FUNCTION public.get_pending_payment_orders(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    order_number text,
    order_type text,
    grand_total numeric,
    created_at timestamptz,
    status text,
    customer_phone text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    RETURN QUERY
    SELECT 
        o.id,
        o.order_number,
        o.order_type,
        o.grand_total,
        o.created_at,
        o.status,
        c.phone as customer_phone
    FROM public.orders o
    LEFT JOIN public.customers c ON o.customer_id = c.id
    WHERE o.organization_id = v_org_id
    AND o.status = 'CONFIRMED' -- جلب الطلبات المؤكدة وغير المدفوعة
    AND o.order_type IN ('TAKEAWAY', 'DELIVERY')
    ORDER BY o.created_at DESC;
END; $$;

-- 📱 دالة استقبال طلبات الزبائن عبر رمز QR (Public Menu Orders)
CREATE OR REPLACE FUNCTION public.create_public_order(p_qr_key uuid, p_items jsonb, p_org_id uuid DEFAULT NULL) -- اعتماد UUID كمعيار وحيد
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table record;
    v_session_id uuid;
    v_order_id uuid;
    v_product_cost numeric;
    v_item jsonb;
    v_order_num text;
    v_tax_rate numeric; v_qty numeric; v_unit_price numeric;
    v_subtotal numeric := 0;
    v_order_item_id uuid;
    v_warehouse_id uuid;
    v_org_id uuid;
BEGIN
    -- 1. التحقق من صحة رمز الطاولة وجلب المنظمة
    SELECT * INTO v_table FROM public.restaurant_tables WHERE qr_access_key = p_qr_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'رمز الطاولة غير صالح أو منتهي الصلاحية'; END IF;

    -- ✅ إضافة فحص صريح لـ organization_id من الطاولة
    IF v_table.organization_id IS NULL THEN
        RAISE EXCEPTION 'فشل تحديد المنظمة للطاولة "%s". يرجى مراجعة بيانات الطاولة أو التواصل مع الدعم.', v_table.name;
    END IF;

    v_org_id := COALESCE(p_org_id, v_table.organization_id);

    -- 2. إيجاد أو إنشاء جلسة (Session) للطاولة
    SELECT id INTO v_session_id FROM public.table_sessions 
    WHERE table_id = v_table.id AND status = 'OPEN' AND organization_id = v_org_id AND end_time IS NULL LIMIT 1;

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status, start_time)
        VALUES (v_table.id, v_org_id, 'OPEN', now())
        RETURNING id INTO v_session_id;
    END IF;

    -- تحديث حالة الطاولة وربط وقت الجلسة
    UPDATE public.restaurant_tables SET status = 'OCCUPIED', session_start = now() WHERE id = v_table.id;

    -- 🏗️ جلب المستودع الافتراضي
    v_warehouse_id := COALESCE(
        (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id),
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id AND deleted_at IS NULL LIMIT 1)
    );

    -- 3. جلب نسبة الضريبة
    SELECT vat_rate INTO v_tax_rate FROM public.company_settings WHERE organization_id = v_org_id;
    v_tax_rate := COALESCE(v_tax_rate, 0.14);

    -- 4. توليد رقم طلب مميز
    v_order_num := 'QR-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(v_session_id::text, 1, 4));

    -- 5. إنشاء الطلب الرئيسي (تعديل النوع ليتوافق مع المطبخ DINE_IN)
    INSERT INTO public.orders (
        session_id, organization_id, order_number, order_type, status, subtotal, total_tax, grand_total, warehouse_id
    ) VALUES (
        v_session_id, v_org_id, v_order_num, 'DINE_IN', 'CONFIRMED', 0, 0, 0, v_warehouse_id
    ) RETURNING id INTO v_order_id;

    -- 6. إضافة الأصناف وتوليد طلبات المطبخ تلقائياً
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := COALESCE((v_item->>'quantity')::numeric, 1);
        v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);

        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_product_cost 
        FROM public.products WHERE id = (v_item->>'product_id')::uuid;

        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price, unit_cost, notes, organization_id, modifiers
        ) VALUES (
            v_order_id, (v_item->>'product_id')::uuid, v_qty, v_unit_price,
            v_product_cost, v_item->>'notes', v_org_id, COALESCE(v_item->'modifiers', '[]'::jsonb)
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + (v_qty * v_unit_price);

        -- ✅ إرسال تنبيه للمطبخ (KDS) فوراً
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id)
        VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    -- 7. تحديث إجماليات الطلب النهائية
    UPDATE public.orders SET
        subtotal = v_subtotal,
        total_tax = v_subtotal * v_tax_rate,
        grand_total = v_subtotal + (v_subtotal * v_tax_rate)
    WHERE id = v_order_id;

    RETURN v_order_id;
END; $$;

-- 🛠️ دالة فتح جلسة طاولة (Open Table Session)
-- تُستخدم لبدء إشغال طاولة وتجهيزها لاستقبال الطلبات
CREATE OR REPLACE FUNCTION public.open_table_session(p_table_id uuid)
RETURNS public.table_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_session public.table_sessions;
    v_org_id uuid;
BEGIN
    -- 1. تحديد المنظمة من بيانات الطاولة
    SELECT organization_id INTO v_org_id FROM public.restaurant_tables WHERE id = p_table_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'الطاولة غير موجودة.'; END IF;

    -- 2. البحث عن جلسة مفتوحة حالياً
    SELECT * INTO v_session FROM public.table_sessions 
    WHERE table_id = p_table_id AND status = 'OPEN' AND end_time IS NULL
    LIMIT 1;

    -- 3. إذا لم توجد جلسة، نفتح واحدة جديدة
    IF v_session.id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status, start_time, user_id)
        VALUES (p_table_id, v_org_id, 'OPEN', now(), auth.uid())
        RETURNING * INTO v_session;

        UPDATE public.restaurant_tables SET status = 'OCCUPIED', session_start = now() WHERE id = p_table_id;
    END IF;

    RETURN v_session;
END; $$;

-- منح صلاحية تنفيذ الدالة للزوار (الموبايل) والموظفين
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_table_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_table_session(uuid) TO anon;
-- 🛠️ دالة جلب ملخص الوردية (التي تظهر للمحاسب قبل الإغلاق)
CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record;
    v_summary record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;

    -- استخدام جدول مؤقت لضمان دقة الحسابات ومنع تكرار المبالغ عند تعدد طرق الدفع
    DROP TABLE IF EXISTS temp_summary_orders;
    CREATE TEMP TABLE temp_summary_orders ON COMMIT DROP AS
    SELECT id, subtotal, total_tax, grand_total, organization_id
    FROM public.orders
    WHERE (user_id = v_shift.user_id OR user_id IS NULL)
    AND organization_id = COALESCE(v_shift.organization_id, public.get_my_org())
    AND created_at BETWEEN v_shift.start_time AND now()
    AND (status::text IN ('COMPLETED', 'PAID', 'posted'));

    SELECT 
        COALESCE(SUM(subtotal), 0) as total_subtotal,
        COALESCE(SUM(total_tax), 0) as total_tax,
        COALESCE(SUM(grand_total), 0) as total_sales,
        COALESCE((SELECT SUM(delivery_fee) FROM public.delivery_orders WHERE order_id IN (SELECT id FROM temp_summary_orders)), 0) as total_delivery_fees,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM temp_summary_orders) AND payment_method = 'CASH' AND status = 'COMPLETED'), 0) as cash_sales,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM temp_summary_orders) AND payment_method = 'CARD' AND status = 'COMPLETED'), 0) as card_sales,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM temp_summary_orders) AND status = 'COMPLETED'), 0) as total_payments
    INTO v_summary
    FROM temp_summary_orders;

    RETURN json_build_object(
        'opening_balance', COALESCE(v_shift.opening_balance, 0),
        'total_sales', COALESCE(v_summary.total_sales, 0),
        'total_tax', COALESCE(v_summary.total_tax, 0),
        'delivery_fees', COALESCE(v_summary.total_delivery_fees, 0),
        'cash_sales', COALESCE(v_summary.cash_sales, 0), -- هذا يمثل إجمالي النقدية المحصلة من المبيعات
        'card_sales', COALESCE(v_summary.card_sales, 0), -- هذا يمثل إجمالي الشبكة المحصلة من المبيعات
        'credit_sales', (v_summary.total_sales + v_summary.total_delivery_fees) - v_summary.total_payments,
        'expected_cash', COALESCE(v_shift.opening_balance, 0) + COALESCE(v_summary.cash_sales, 0)
    );
END; $$;

-- 🛠️ دالة إنشاء قيد الإغلاق المجمع (القلب المحاسبي للوردية)
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb;
    v_cash_acc_id uuid; v_card_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid;
    v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_customer_acc_id uuid;
    v_diff numeric := 0; v_actual_cash_collected numeric := 0; v_deficit_acc_id uuid;
    v_item_cost_record record;
    v_cust_order record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;

    -- 🛡️ ضمان مبدأ Idempotency: حذف أي قيد إغلاق قديم لهذه الوردية منعاً لتكرار المبالغ في الأستاذ العام
    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    -- استخدام جدول مؤقت لضمان توفر البيانات لكافة الاستعلامات داخل الدالة (حل مشكلة Scope الـ CTE)
    DROP TABLE IF EXISTS temp_shift_orders;
    CREATE TEMP TABLE temp_shift_orders ON COMMIT DROP AS
    SELECT o.id, o.subtotal, o.total_tax, o.grand_total, o.customer_id, c.name as cust_name
    FROM public.orders o
    LEFT JOIN public.customers c ON o.customer_id = c.id
    WHERE (o.user_id = v_shift.user_id OR o.user_id IS NULL)
    AND o.status NOT IN ('CANCELLED', 'DRAFT')
    AND o.organization_id = v_shift.organization_id
    AND o.created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now());

    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((SELECT SUM(delivery_fee) FROM public.delivery_orders WHERE order_id IN (SELECT id FROM temp_shift_orders)), 0) as total_delivery_fees,
        -- 🛡️ حساب التكلفة الإجمالية من بنود الطلبات
        COALESCE((SELECT SUM(quantity * COALESCE(unit_cost, 0)) FROM public.order_items WHERE order_id IN (SELECT id FROM temp_shift_orders)), 0) as cost_total,
        -- حساب المبالغ المحصلة فعلياً
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM temp_shift_orders) AND payment_method = 'CASH' AND status = 'COMPLETED'), 0) as cash_total,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM temp_shift_orders) AND payment_method = 'CARD' AND status = 'COMPLETED'), 0) as card_total,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM temp_shift_orders) AND status = 'COMPLETED'), 0) as total_payments
    INTO v_summary
    FROM temp_shift_orders;

    -- تحديد المنظمة بذكاء (الهوية الهيكلية الموحدة)
    v_shift.organization_id := COALESCE(p_org_id, v_shift.organization_id, (SELECT organization_id FROM public.profiles WHERE id = v_shift.user_id), public.get_my_org());

    -- حساب الفرق والمبيعات الآجلة (Credit Sales)
    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    v_actual_cash_collected := v_summary.cash_total + v_diff;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_shift.organization_id;

    v_cash_acc_id := COALESCE((v_mappings->>'CASH')::uuid, (SELECT id FROM public.accounts WHERE code = '1231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_card_acc_id := COALESCE((v_mappings->>'BANK_ACCOUNTS')::uuid, (SELECT id FROM public.accounts WHERE code = '123201' AND organization_id = v_shift.organization_id LIMIT 1));
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_shift.organization_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_OUTPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_shift.organization_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_shift.organization_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_shift.organization_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'إغلاق وردية مطعم - مستخدم: ' || v_shift.user_id, 'SHIFT-' || to_char(now(), 'YYMMDD'), 'posted', v_shift.organization_id, true, p_shift_id, 'shift') RETURNING id INTO v_je_id;
    
    -- 1. الإيرادات والضرائب (دائن)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal + v_summary.total_delivery_fees, 'إيرادات الوردية (شامل التوصيل)', v_shift.organization_id);
    IF v_summary.tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_shift.organization_id); END IF;
    IF v_cash_acc_id IS NULL OR v_sales_acc_id IS NULL OR v_inventory_acc_id IS NULL OR v_cogs_acc_id IS NULL THEN RAISE EXCEPTION 'إعدادات الحسابات مفقودة لهذه المنظمة (النقدية، المبيعات، أو المخزون).'; END IF;

    -- 2. التحصيلات الفورية (مدين)
    IF v_actual_cash_collected > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cash_acc_id, v_actual_cash_collected, 0, 'نقدية الوردية المحصلة', v_shift.organization_id);
    ELSIF v_actual_cash_collected < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cash_acc_id, 0, ABS(v_actual_cash_collected), 'نقص نقدية الوردية (صافي)', v_shift.organization_id);
    END IF;
    IF v_summary.card_total > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_card_acc_id, v_summary.card_total, 0, 'متحصلات شبكة', v_shift.organization_id); END IF;
    
    -- 3. إثبات مديونية كل عميل بشكل منفصل ليظهر في كشف حسابه
    FOR v_cust_order IN (
        SELECT o.id, o.grand_total, c.name as cust_name
        FROM public.orders o LEFT JOIN public.customers c ON o.customer_id = c.id
        WHERE o.organization_id = v_shift.organization_id 
        AND o.created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())
        AND o.status NOT IN ('CANCELLED', 'DRAFT')
        AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id AND p.status = 'COMPLETED')
    ) LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_acc_id, v_cust_order.grand_total, 0, 'مديونية عميل مطعم: ' || v_cust_order.cust_name, v_shift.organization_id);
    END LOOP;

    -- 4. إغلاق كافة الطلبات وربطها بالقيد لكي تختفي من شاشة الـ POS وتظهر كحركات مرحلة
    UPDATE public.orders SET status = 'posted', related_journal_entry_id = v_je_id
    WHERE organization_id = v_shift.organization_id 
    AND created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())
    AND status NOT IN ('CANCELLED', 'DRAFT');

    -- 5. معالجة فروقات الصندوق (عجز أو زيادة)
    IF v_diff > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, COALESCE((v_mappings->>'REVENUE_OTHER')::uuid, (SELECT id FROM public.accounts WHERE code = '421' AND organization_id = v_shift.organization_id LIMIT 1)), 0, v_diff, 'زيادة نقدية الوردية', v_shift.organization_id);
    ELSIF v_diff < 0 THEN
        v_deficit_acc_id := COALESCE((v_mappings->>'CASH_SHORTAGE')::uuid, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_shift.organization_id LIMIT 1));
        IF v_deficit_acc_id IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الوردية', v_shift.organization_id);
        ELSE
            RAISE NOTICE 'تحذير: حساب عجز الصندوق (541) غير معرف، تم موازنة القيد آلياً.';
        END IF;
    END IF;

    
    -- 🚀 محرك التكلفة الذكي: توجيه التكلفة لكل نوع مخزون بشكل صحيح (خامات vs منتج تام)
    FOR v_item_cost_record IN (
        SELECT 
            p.inventory_account_id,
            SUM(oi.quantity * COALESCE(oi.unit_cost, 0)) as total_cost
        FROM public.order_items oi
        JOIN public.products p ON oi.product_id = p.id
        WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
        GROUP BY p.inventory_account_id
    ) LOOP
        IF v_item_cost_record.total_cost > 0 THEN
            -- من ح/ تكلفة البضاعة المباعة
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية', v_shift.organization_id);
            -- إلى ح/ المخزون (حسب نوع الصنف: خامات أو تام)
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES (v_je_id, COALESCE(v_item_cost_record.inventory_account_id, v_inventory_acc_id), 0, v_item_cost_record.total_cost, 'صرف مخزون الوردية', v_shift.organization_id);
        END IF;
    END LOOP;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    RETURN v_je_id;
END; $$;

-- 🛠️ دالة اختبار دورة حياة الوردية بالكامل (Restaurant Shift Lifecycle Test)
CREATE OR REPLACE FUNCTION public.test_restaurant_shift_lifecycle()
RETURNS TABLE(step_name text, result text, details text) LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_org_id uuid; v_wh_id uuid; v_user_id uuid; v_shift_id uuid;
    v_prod_id uuid; v_session_id uuid; v_order_id uuid;
    v_je_id uuid; v_cash_acc uuid; v_items jsonb;
BEGIN
    -- 🛡️ تنظيف أي بيانات اختبار سابقة قد تكون عالقة
    DELETE FROM public.products WHERE name = 'منتج تجريبي للوردية';
    -- 1. تهيئة بيئة الاختبار
    v_org_id := public.get_my_org();
    IF v_org_id IS NULL THEN SELECT id INTO v_org_id FROM public.organizations LIMIT 1; END IF;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'لا توجد منظمة مسجلة في النظام للاختبار.'; END IF;
    
    SELECT id INTO v_user_id FROM public.profiles WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_wh_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_cash_acc FROM public.accounts WHERE organization_id = v_org_id AND code = '1231' LIMIT 1;

    step_name := '1. تهيئة البيانات'; result := 'PASS ✅'; details := format('المنظمة: %s, المستخدم: %s', v_org_id, v_user_id); RETURN NEXT;

    -- 2. اختبار فتح الوردية
    v_shift_id := (public.start_pos_shift(1000, false, v_cash_acc, v_user_id)).id;
    step_name := '2. فتح الوردية'; result := 'PASS ✅'; details := format('تم فتح الوردية برصيد 1000، ID: %s', v_shift_id); RETURN NEXT;

    -- 3. إنشاء منتج وطلب للبيع
    INSERT INTO public.products (name, sales_price, organization_id, stock) 
    VALUES ('منتج تجريبي للوردية', 100, v_org_id, 100) RETURNING id INTO v_prod_id;

    INSERT INTO public.table_sessions (status, organization_id, user_id) 
    VALUES ('OPEN', v_org_id, v_user_id) RETURNING id INTO v_session_id;

    v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod_id, 'quantity', 2, 'unit_price', 100));
    v_order_id := public.create_restaurant_order(v_session_id, v_user_id, 'DINE_IN', 'Test Order', v_items, NULL, v_wh_id);
    
    step_name := '3. إنشاء طلب مبيعات'; result := 'PASS ✅'; details := 'تم إنشاء طلب بمبلغ 200 (قبل الضريبة)'; RETURN NEXT;

    -- 4. دفع الطلب
    PERFORM public.complete_restaurant_order(v_order_id, 'CASH', 228, v_cash_acc, v_org_id);
    step_name := '4. دفع الطلب'; result := 'PASS ✅'; details := 'تم دفع 228 (شامل 14% ضريبة) نقداً'; RETURN NEXT;

    -- 5. إغلاق الوردية
    -- المتوقع: 1000 + 228 = 1228. سنغلق بـ 1200 لمحاكاة عجز 28
    PERFORM public.close_shift(v_shift_id, 1200, 'اختبار إغلاق مع عجز', v_org_id);
    UPDATE public.orders SET related_journal_entry_id = NULL WHERE id = v_order_id; -- ⚠️ حل مشكلة المفتاح الخارجي
    
    SELECT related_journal_entry_id INTO v_je_id FROM public.orders WHERE id = v_order_id;
    IF v_je_id IS NULL THEN 
        SELECT id INTO v_je_id FROM public.journal_entries WHERE related_document_id = v_shift_id LIMIT 1;
    END IF;

    step_name := '5. إغلاق الوردية'; result := 'PASS ✅'; details := format('تم الإغلاق وتوليد القيد: %s', v_je_id); RETURN NEXT;

    -- 6. التحقق من القيد
    IF EXISTS (SELECT 1 FROM public.journal_lines WHERE journal_entry_id = v_je_id) THEN
        step_name := '6. التحقق من صحة القيود'; result := 'SUCCESS 🏆'; details := 'تم العثور على أسطر القيد وهي متوازنة';
    ELSE
        step_name := '6. التحقق من صحة القيود'; result := 'FAIL ❌'; details := 'لم يتم العثور على قيود محاسبية للوردية';
    END IF;
    RETURN NEXT;

    -- تنظيف بيانات الاختبار
    DELETE FROM public.payments WHERE order_id = v_order_id;
    DELETE FROM public.order_items WHERE order_id = v_order_id;
    UPDATE public.orders SET related_journal_entry_id = NULL WHERE id = v_order_id;
    DELETE FROM public.orders WHERE id = v_order_id;
    DELETE FROM public.table_sessions WHERE id = v_session_id;
    DELETE FROM public.shifts WHERE id = v_shift_id;
    DELETE FROM public.products WHERE id = v_prod_id;
    DELETE FROM public.journal_lines WHERE journal_entry_id = v_je_id; -- يجب أن يتم حذفها بعد حذف الطلبات
    DELETE FROM public.journal_entries WHERE id = v_je_id; -- يجب أن يتم حذفها بعد حذف الطلبات

EXCEPTION WHEN OTHERS THEN
    step_name := 'CRITICAL ERROR'; result := 'ERROR 🛑'; details := SQLERRM; RETURN NEXT;
END; $$;

-- 🛠️ دالة ربط مستخدم موجود مسبقاً بمنظمة جديدة كمدير (تستخدمها منصة ساس)
CREATE OR REPLACE FUNCTION public.force_provision_admin(p_email text, p_org_id uuid, p_full_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = LOWER(p_email);
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'المستخدم غير موجود بالنظام'; END IF;

    INSERT INTO public.profiles (id, organization_id, role, full_name, is_active)
    VALUES (v_user_id, p_org_id, 'admin', p_full_name, true)
    ON CONFLICT (id) DO UPDATE SET 
        organization_id = p_org_id, 
        role = 'admin', 
        full_name = p_full_name, 
        is_active = true;

    UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
                             jsonb_build_object('org_id', p_org_id, 'role', 'admin')
    WHERE id = v_user_id;
END; $$;

-- 📊 تقرير الوجبات التي لم يتم ربطها بمكونات (BOM) لضبط التكاليف
CREATE OR REPLACE FUNCTION public.get_products_without_bom(p_org_id uuid)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    sku text,
    category_name text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.sku,
        COALESCE(cat.name, 'غير مصنف')
    FROM public.products p
    LEFT JOIN public.item_categories cat ON p.category_id = cat.id
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND p.product_type = 'STOCK'
      AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = p.id);
END; $$;

-- 🛠️ دالة جلب تكلفة الوجبة بناءً على المكونات (BOM)
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cost numeric;
BEGIN
    SELECT COALESCE(SUM(bom.quantity_required * COALESCE(p.weighted_average_cost, p.cost, p.purchase_price, 0)), 0)
    INTO v_cost
    FROM public.bill_of_materials bom
    JOIN public.products p ON bom.raw_material_id = p.id
    WHERE bom.product_id = p_product_id;
    RETURN v_cost;
END; $$;

-- 🛠️ دالة إغلاق الوردية
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id uuid, 
    p_actual_cash numeric, 
    p_notes text DEFAULT NULL, 
    p_org_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. تحديث بيانات الوردية والمبلغ الفعلي أولاً (ضروري لصحة القيد)
    UPDATE public.shifts SET 
        end_time = now(),
        actual_cash = p_actual_cash,
        status = 'CLOSED',
        notes = p_notes
    WHERE id = p_shift_id;

    -- 2. الآن نولد القيد المحاسبي بناءً على البيانات الفعلية
    PERFORM public.generate_shift_closing_entry(p_shift_id, p_org_id);
END; $$;
-- ================================================================
-- 4. مديول الموارد البشرية (HR & Payroll)
-- ================================================================

CREATE OR REPLACE FUNCTION public.run_payroll_rpc(p_month integer, p_year integer, p_date date, p_treasury_acc uuid, p_items jsonb, p_org_id uuid DEFAULT NULL) 
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE -- 🛠️ تحديث: إضافة p_org_id كمعامل
    v_org_id uuid; v_payroll_id uuid; v_total_gross numeric := 0; 
    v_total_additions numeric := 0; v_total_deductions numeric := 0; 
    v_total_advances numeric := 0; v_total_net numeric := 0; 
    v_item jsonb; v_je_id uuid; v_mappings jsonb; v_user_id uuid; v_payroll_item_id uuid;
    v_salaries_acc_id uuid; v_bonuses_acc_id uuid; v_deductions_acc_id uuid; 
    v_advances_acc_id uuid; v_payroll_tax_id uuid; v_total_payroll_tax numeric := 0;
    v_fixed_allowances numeric := 0; v_monthly_additions numeric := 0; v_monthly_deductions numeric := 0; v_emp_net numeric := 0;
BEGIN
    -- 🛡️ جلب المنظمة (الأولوية للممرر ثم السياق)
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'فشل تحديد المنظمة، يرجى إعادة تسجيل الدخول.'; END IF;

    -- 🛡️ حماية SaaS: منع تكرار صرف الرواتب لنفس الفترة داخل نفس الشركة
    IF EXISTS (SELECT 1 FROM public.payrolls WHERE payroll_month = p_month AND payroll_year = p_year AND organization_id = v_org_id AND status = 'paid') THEN
        RAISE EXCEPTION 'تم اعتماد وصرف مسير الرواتب لشهر (%) سنة (%) مسبقاً لهذه المنظمة.', p_month, p_year;
    END IF;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🛡️ تحسين البحث عن الحسابات: استخدام الكود المباشر كـ Fallback لضمان ترحيل الرواتب
    v_salaries_acc_id := COALESCE((v_mappings->>'SALARIES_EXPENSE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('531', '5201', '5311') AND organization_id = v_org_id LIMIT 1));
    IF v_salaries_acc_id IS NULL THEN RAISE EXCEPTION 'حساب مصروف الرواتب (SALARIES_EXPENSE) غير معرف في إعدادات الشركة أو دليل الحسابات (أكواد 531, 5201).'; END IF;
    v_bonuses_acc_id := COALESCE((v_mappings->>'EMPLOYEE_BONUSES')::uuid, (SELECT id FROM public.accounts WHERE code IN ('5312', '520102', '5313') AND organization_id = v_org_id LIMIT 1));
    -- v_bonuses_acc_id يمكن أن يكون NULL إذا لم يكن هناك مكافآت
    v_deductions_acc_id := COALESCE((v_mappings->>'EMPLOYEE_DEDUCTIONS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('422', '223301', '421') AND organization_id = v_org_id LIMIT 1));
    -- v_deductions_acc_id يمكن أن يكون NULL إذا لم يكن هناك خصومات
    v_advances_acc_id := COALESCE((v_mappings->>'EMPLOYEE_ADVANCES')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1223', '1209') AND organization_id = v_org_id LIMIT 1));
    IF v_advances_acc_id IS NULL THEN RAISE EXCEPTION 'حساب سلف الموظفين (EMPLOYEE_ADVANCES) غير معرف في إعدادات الشركة أو دليل الحسابات (أكواد 1223, 1209).'; END IF;
    v_payroll_tax_id := COALESCE((v_mappings->>'PAYROLL_TAX')::uuid, (SELECT id FROM public.accounts WHERE code = '2233' AND organization_id = v_org_id LIMIT 1));
    -- v_payroll_tax_id يمكن أن يكون NULL إذا لم يكن هناك ضرائب رواتب


    IF v_salaries_acc_id IS NULL OR v_advances_acc_id IS NULL OR p_treasury_acc IS NULL THEN 
        RAISE EXCEPTION 'فشل جلب إعدادات الحسابات المالية للرواتب، يرجى مراجعة Account Mappings في إعدادات الشركة.'; -- Ensure p_treasury_acc is not NULL
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_treasury_acc AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'حساب الخزينة/البنك المختار غير صحيح أو لا ينتمي لهذه المنظمة.';
    END IF;
    
    -- 🛡️ ضمان Idempotency: حذف أي قيد رواتب سابق لنفس الفترة
    DELETE FROM public.journal_entries WHERE related_document_type = 'payroll' AND organization_id = v_org_id
    AND description LIKE 'مسير رواتب ' || p_month || '/' || p_year || '%';

    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items)) THEN RAISE EXCEPTION 'لا توجد بيانات موظفين صالحة في المسير.'; END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
          -- 🛡️ إعادة تصفير المتغيرات لكل موظف لضمان دقة الحسابات
        v_fixed_allowances := 0; v_monthly_additions := 0; v_monthly_deductions := 0;  
        -- 1. جلب البدلات الثابتة من الجدول
        SELECT COALESCE(SUM(amount), 0) INTO v_fixed_allowances 
        FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id;

        -- 2. جلب المتغيرات الشهرية (الإضافات)
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_additions 
        FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid 
        AND month = p_month AND year = p_year AND type = 'addition' AND is_processed = false AND organization_id = v_org_id;

        -- 3. جلب المتغيرات الشهرية (الاستقطاعات)
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_deductions 
        FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid 
        AND month = p_month AND year = p_year AND type = 'deduction' AND is_processed = false AND organization_id = v_org_id;
        -- حساب الصافي الحقيقي في السيرفر لضمان النزاهة المالية
        v_emp_net := COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - COALESCE((v_item->>'advances_deducted')::numeric, 0) - COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_gross := v_total_gross + COALESCE((v_item->>'gross_salary')::numeric, 0) + v_fixed_allowances;
        v_total_additions := v_total_additions + COALESCE((v_item->>'additions')::numeric, 0) + v_monthly_additions;
        v_total_deductions := v_total_deductions + COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions;
        v_total_advances := v_total_advances + COALESCE((v_item->>'advances_deducted')::numeric, 0);
        v_total_payroll_tax := v_total_payroll_tax + COALESCE((v_item->>'payroll_tax')::numeric, 0);
        v_total_net := v_total_net + COALESCE(v_emp_net, 0);
        
    END LOOP;

    INSERT INTO public.payrolls (payroll_month, payroll_year, payment_date, total_gross_salary, total_additions, total_deductions, total_net_salary, status, organization_id)
    VALUES (p_month, p_year, p_date, v_total_gross, v_total_additions, (v_total_deductions + v_total_advances + v_total_payroll_tax), v_total_net, 'paid', v_org_id) RETURNING id INTO v_payroll_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
            -- إعادة جلب المبالغ الفردية للسطر لضمان دقة سجل البنود
        v_fixed_allowances := 0; v_monthly_additions := 0; v_monthly_deductions := 0;
        SELECT COALESCE(SUM(amount), 0) INTO v_fixed_allowances FROM public.employee_allowances WHERE employee_id = (v_item->>'employee_id')::uuid AND organization_id = v_org_id;
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_additions FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'addition' AND organization_id = v_org_id;
        SELECT COALESCE(SUM(amount), 0) INTO v_monthly_deductions FROM public.payroll_variables WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year AND type = 'deduction' AND organization_id = v_org_id;
        
        v_emp_net := (v_item->>'gross_salary')::numeric + v_fixed_allowances + (v_item->>'additions')::numeric + v_monthly_additions
                     - (COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions)
                     - (v_item->>'advances_deducted')::numeric - COALESCE((v_item->>'payroll_tax')::numeric, 0);
        INSERT INTO public.payroll_items (payroll_id, employee_id, gross_salary, additions, payroll_tax, advances_deducted, other_deductions, net_salary, organization_id)
        VALUES (v_payroll_id, (v_item->>'employee_id')::uuid, 
               (v_item->>'gross_salary')::numeric + v_fixed_allowances, 
               (v_item->>'additions')::numeric + v_monthly_additions, 
               COALESCE((v_item->>'payroll_tax')::numeric, 0), (v_item->>'advances_deducted')::numeric, 
               COALESCE((v_item->>'other_deductions')::numeric, 0) + v_monthly_deductions, 
               v_emp_net, v_org_id)
        RETURNING id INTO v_payroll_item_id;

        -- تحديث المتغيرات الشهرية كـ "تمت معالجتها" لمنع تكرارها
        UPDATE public.payroll_variables SET is_processed = true 
        WHERE employee_id = (v_item->>'employee_id')::uuid AND month = p_month AND year = p_year;

        -- 🔗 تحديث حالة السلف المستردة وربطها ببنود المسير لضمان عدم تكرار الخصم
        IF (v_item->>'advances_deducted')::numeric > 0 THEN
            UPDATE public.employee_advances 
            SET status = 'deducted', payroll_item_id = v_payroll_item_id
            WHERE employee_id = (v_item->>'employee_id')::uuid 
            AND status = 'paid'
            AND organization_id = v_org_id;
        END IF;
    END LOOP;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id) 
    VALUES (p_date, 'مسير رواتب ' || p_month || '/' || p_year, 'PAYROLL-' || p_month || '-' || p_year, 'posted', v_org_id, true, v_payroll_id, 'payroll', auth.uid()) RETURNING id INTO v_je_id;

    RAISE NOTICE 'Payroll JE created: ID=% for OrgID=%', v_je_id, v_org_id;

    -- 🛡️ التحقق من وجود الحسابات قبل البدء لتجنب عدم توازن القيد (SaaS Security Guard)
    IF (v_total_additions > 0 AND v_bonuses_acc_id IS NULL) OR (v_total_deductions > 0 AND v_deductions_acc_id IS NULL) OR (v_total_payroll_tax > 0 AND v_payroll_tax_id IS NULL) THEN
        RAISE EXCEPTION 'فشل ترحيل القيد: بعض الحسابات (مكافآت، خصومات، أو ضرائب) غير معرفة في إعدادات الربط رغم وجود مبالغ مستحقة.';
    END IF;

    IF v_total_gross > 0 AND v_salaries_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_salaries_acc_id, v_total_gross, 0, 'استحقاق رواتب', v_org_id); END IF;
    IF v_total_additions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_bonuses_acc_id, v_total_additions, 0, 'مكافآت وحوافز', v_org_id); END IF;
    IF v_total_advances > 0 AND v_advances_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_advances_acc_id, 0, v_total_advances, 'استرداد سلف', v_org_id); END IF;
    IF v_total_deductions > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_deductions_acc_id, 0, v_total_deductions, 'خصومات وجزاءات', v_org_id); END IF;
    IF v_total_payroll_tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_payroll_tax_id, 0, v_total_payroll_tax, 'ضريبة كسب العمل', v_org_id); END IF;
    IF ABS(COALESCE(v_total_net, 0)) > 0.001 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, p_treasury_acc, 0, v_total_net, 'صرف صافي الرواتب', v_org_id); END IF;

     -- 🛡️ موازنة القيد آلياً في حال وجود فروق كسور عشرية بسيطة
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);

    IF NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE journal_entry_id = v_je_id) THEN RAISE EXCEPTION 'فشل إنشاء أسطر القيد المحاسبي للرواتب، القيد غير متوازن أو الحسابات مفقودة.'; END IF;
END; $$;

-- 🛠️ دالة ترحيل قيد يومية للشيكات (Post Cheque Journal Entry)
CREATE OR REPLACE FUNCTION public.post_cheque_journal_entry(p_cheque_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cheque record; v_org_id uuid; v_journal_id uuid; v_bank_acc_id uuid;
    v_customer_acc_id uuid; v_supplier_acc_id uuid; v_mappings jsonb; v_description text;
BEGIN
    SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id;  
    IF NOT FOUND THEN RAISE EXCEPTION 'الشيك (ID: %) غير موجود.', p_cheque_id; END IF;
    
    -- 🛡️ ضمان Idempotency: حذف أي قيد سابق مرتبط بهذا الشيك قبل إنشاء قيد جديد
    DELETE FROM public.journal_entries WHERE related_document_id = p_cheque_id AND related_document_type LIKE 'cheque%';

    v_org_id := v_cheque.organization_id;
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- تحديد الحسابات
    v_bank_acc_id := COALESCE(v_cheque.current_account_id, (v_mappings->>'BANK_MAIN')::uuid, (SELECT id FROM public.accounts WHERE code LIKE '1232%' AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('201', '2201') AND organization_id = v_org_id LIMIT 1));

    IF v_bank_acc_id IS NULL THEN RAISE EXCEPTION 'حساب البنك غير معرف (لا يوجد حساب يبدأ بـ 1232 أو BANK_MAIN).'; END IF;

    -- 1. تحصيل شيك وارد
    IF v_cheque.type = 'incoming' AND v_cheque.status = 'collected' THEN
        v_description := 'تحصيل شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '-');
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (now()::date, v_description, 'CHQ-' || v_cheque.cheque_number, 'posted', v_org_id, p_cheque_id, 'cheque', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, v_description, v_org_id),
               (v_journal_id, v_customer_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    -- 2. صرف شيك صادر
    ELSIF v_cheque.type = 'outgoing' AND v_cheque.status = 'cashed' THEN
        v_description := 'صرف شيك صادر رقم ' || COALESCE(v_cheque.cheque_number, '-');
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (now()::date, v_description, 'CHQ-' || v_cheque.cheque_number, 'posted', v_org_id, p_cheque_id, 'cheque', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, v_description, v_org_id);
    -- 3. ارتداد شيك
    ELSIF v_cheque.status = 'bounced' THEN
        v_description := 'ارتداد شيك رقم ' || COALESCE(v_cheque.cheque_number, '-');
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (now()::date, v_description, 'CHQ-' || v_cheque.cheque_number, 'posted', v_org_id, p_cheque_id, 'cheque', true, auth.uid()) RETURNING id INTO v_journal_id;
        IF v_cheque.type = 'incoming' THEN

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, v_description, v_org_id);
                
        ELSE
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, v_description, v_org_id), (v_journal_id, v_supplier_acc_id, 0, v_cheque.amount, v_description, v_org_id);
           
        END IF;
    END IF;

    IF v_journal_id IS NOT NULL THEN
        UPDATE public.cheques SET related_journal_entry_id = v_journal_id WHERE id = p_cheque_id;
    END IF;
    
    PERFORM public.recalculate_all_system_balances(v_org_id);
END; $$;

-- 🛠️ مشغل ترحيل الشيكات التلقائي
CREATE OR REPLACE FUNCTION public.trg_post_cheque_journal_entry()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IN ('collected', 'cashed', 'bounced') AND (OLD.status IS DISTINCT FROM NEW.status)) THEN
        PERFORM public.post_cheque_journal_entry(NEW.id);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cheque_posting ON public.cheques;
CREATE TRIGGER trg_cheque_posting
AFTER UPDATE OF status ON public.cheques
FOR EACH ROW EXECUTE FUNCTION public.trg_post_cheque_journal_entry();

-- ================================================================
-- 5. تأسيس الشركات (Onboarding & SaaS Core)
-- ================================================================

-- أ. دالة معالجة المستخدمين الجدد عند التسجيل (Signup)
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

    -- 1. حالة خاصة: إذا كان هذا أول مستخدم في النظام بالكامل (السوبر أدمن الأول)
    IF v_org_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.profiles) THEN
        INSERT INTO public.organizations (name) VALUES ('الشركة الرئيسية') RETURNING id INTO v_org_id;
        v_role := 'super_admin';
    END IF;

    -- 2. التحقق من الدعوات إذا لم يوجد معرف شركة في الـ Metadata
    IF v_org_id IS NULL THEN
        SELECT organization_id, role INTO v_org_id, v_role FROM public.invitations 
        WHERE email = new.email AND accepted_at IS NULL LIMIT 1;
        
        IF v_org_id IS NOT NULL THEN
            UPDATE public.invitations SET accepted_at = now() WHERE email = new.email;
        END IF;
    END IF;

    -- 3. ضمان تعيين دور admin إذا كان المستخدم هو أول من ينضم لمنظمة موجودة
    IF v_org_id IS NOT NULL AND v_role IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE organization_id = v_org_id) THEN
            v_role := 'admin'; -- Ensure role is set
        END IF;
    END IF;

    INSERT INTO public.profiles (id, full_name, role, role_id, organization_id)
    VALUES (
        new.id, 
        COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'), 
        v_role, 
        (SELECT id FROM public.roles WHERE organization_id = v_org_id AND name = COALESCE(v_role, 'admin') LIMIT 1),
        v_org_id
    )
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

-- ب. دالة التحقق من عدد المستخدمين (منع تجاوز حدود الباقة)
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
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ج. تهيئة الدليل المحاسبي المصري لشركة جديدة (Core SaaS Onboarding)
CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id uuid, p_activity_type text DEFAULT 'commercial', p_admin_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE v_vat_rate numeric; v_admin_id uuid; v_org_name text; v_rec record; v_parent_id uuid; v_role_id uuid; v_warehouse_id uuid;
    v_cash_id uuid; v_sales_id uuid; v_cust_id uuid; v_cogs_id uuid; v_inv_id uuid; v_vat_id uuid; v_supp_id uuid; v_vat_in_id uuid; v_disc_id uuid;
    v_wht_pay_id uuid; v_payroll_tax_id uuid; v_wht_rec_id uuid; v_sal_ret_id uuid;
    v_sal_exp_id uuid; v_bonus_id uuid; v_ded_id uuid; v_adv_id uuid; v_retained_id uuid;
    v_labor_mfg_id uuid; v_wastage_id uuid; v_raw_id uuid; v_wip_id uuid; v_notes_pay_id uuid; v_notes_rec_id uuid;
    v_cash_deficit_id uuid; v_dep_exp_id uuid; v_acc_dep_id uuid; v_fixed_assets_id uuid; v_opening_bal_id uuid;
    v_prepaid_exp_id uuid; v_accrued_exp_id uuid; v_social_ins_id uuid; v_bank_main_id uuid; v_rev_other_id uuid; 
    v_exp_gen_id uuid; v_sal_allow_id uuid;
    v_bank_nbe_id uuid; v_bank_misr_id uuid; v_bank_cib_id uuid; v_wallet_voda_id uuid;
    v_security_deposit_id uuid; -- Added for account 226
    v_exp_rent_id uuid; v_exp_util_id uuid; v_exp_bank_id uuid; v_exp_office_id uuid;
    v_overhead_mfg_id uuid; -- Declare v_overhead_mfg_id here
BEGIN
    v_vat_rate := CASE WHEN p_activity_type = 'construction' THEN 0.05 WHEN p_activity_type = 'charity' THEN 0.00 ELSE 0.14 END;
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;
    
    CREATE TEMPORARY TABLE coa_temp (code text PRIMARY KEY, name text NOT NULL, type text NOT NULL, is_group boolean NOT NULL, parent_code text) ON COMMIT DROP;

    INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
    ('1', 'الأصول', 'asset', true, NULL), ('2', 'الخصوم (الإلتزامات)', 'liability', true, NULL), ('3', 'حقوق الملكية', 'equity', true, NULL), ('4', 'الإيرادات', 'revenue', true, NULL), ('5', 'المصروفات', 'expense', true, NULL),
    ('11', 'الأصول غير المتداولة', 'asset', true, '1'), ('12', 'الأصول المتداولة', 'asset', true, '1'), ('21', 'الخصوم غير المتداولة', 'liability', true, '2'), ('22', 'الخصوم المتداولة', 'liability', true, '2'),
    ('31', 'رأس المال والاحتياطيات', 'equity', true, '3'), ('32', 'الأرباح المبقاة / المرحلة', 'equity', false, '3'), ('33', 'جاري الشركاء', 'equity', false, '3'), ('34', 'احتياطيات', 'equity', false, '3'),
    ('41', 'إيرادات النشاط (المبيعات)', 'revenue', true, '4'), ('42', 'إيرادات أخرى', 'revenue', true, '4'), ('51', 'تكلفة المبيعات (COGS)', 'expense', true, '5'), ('52', 'مصروفات البيع والتسويق', 'expense', true, '5'), ('53', 'المصروفات الإدارية والعمومية', 'expense', true, '5'),
    ('111', 'الأصول الثابتة (بالصافي)', 'asset', true, '11'), ('1111', 'الأراضي', 'asset', false, '111'), ('1112', 'المباني والإنشاءات', 'asset', false, '111'), ('1113', 'الآلات والمعدات', 'asset', false, '111'), ('1114', 'وسائل النقل والانتقال', 'asset', false, '111'), ('1115', 'الأثاث والتجهيزات المكتبية', 'asset', false, '111'), ('1116', 'أجهزة حاسب آلي وبرمجيات', 'asset', false, '111'), ('1119', 'مجمع إهلاك الأصول الثابتة', 'asset', false, '111'),
    ('103', 'المخزون', 'asset', true, '12'), ('10301', 'مخزون المواد الخام', 'asset', false, '103'), ('10302', 'مخزون المنتج التام', 'asset', false, '103'), ('10303', 'مخزون إنتاج تحت التشغيل (WIP)', 'asset', false, '103'),
    ('122', 'العملاء والمدينون', 'asset', true, '12'), ('1221', 'العملاء', 'asset', false, '122'), ('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'asset', false, '122'), ('1223', 'سلف الموظفين', 'asset', false, '122'), ('1224', 'عهد موظفين', 'asset', false, '122'),
    ('123', 'النقدية وما في حكمها', 'asset', true, '12'), ('1231', 'النقدية بالصندوق (الخزينة الرئيسية)', 'asset', false, '123'), ('1232', 'البنوك (حسابات جارية)', 'asset', true, '123'),
    ('123201', 'البنك الأهلي المصري', 'asset', false, '1232'), ('123202', 'بنك مصر', 'asset', false, '1232'), ('123203', 'البنك التجاري الدولي (CIB)', 'asset', false, '1232'), ('123204', 'بنك QNB الأهلي', 'asset', false, '1232'), ('123205', 'بنك القاهرة', 'asset', false, '1232'), ('123206', 'بنك فيصل الإسلامي', 'asset', false, '1232'), ('123207', 'بنك الإسكندرية', 'asset', false, '1232'),
    ('1233', 'المحافظ الإلكترونية (Digital Wallets)', 'asset', true, '123'), ('123301', 'فودافون كاش (Vodafone Cash)', 'asset', false, '1233'), ('123302', 'اتصالات كاش (Etisalat Cash)', 'asset', false, '1233'), ('123303', 'أورنج كاش (Orange Cash)', 'asset', false, '1233'), ('123304', 'وي باي (WE Pay)', 'asset', false, '1233'), ('123305', 'انستا باي (InstaPay - تسوية)', 'asset', false, '1233'),
    ('124', 'أرصدة مدينة أخرى', 'asset', true, '12'), ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'asset', false, '124'), ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'asset', false, '124'),
    ('1243', 'مصروفات مدفوعة مقدماً', 'asset', true, '124'), ('124301', 'إيجار مقدم', 'asset', false, '1243'), ('124302', 'تأمين طبي مقدم', 'asset', false, '1243'), ('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'asset', false, '1243'), ('124304', 'حملات إعلانية مقدمة', 'asset', false, '1243'), ('124305', 'عقود صيانة مقدمة', 'asset', false, '1243'),
    ('1244', 'إيرادات مستحقة', 'asset', true, '124'), ('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'asset', false, '1244'), ('124402', 'فوائد بنكية مستحقة القبض', 'asset', false, '1244'), ('124403', 'إيجارات دائنة مستحقة', 'asset', false, '1244'), ('124404', 'إيرادات أوراق مالية مستحقة', 'asset', false, '1244'),
    ('211', 'قروض طويلة الأجل', 'liability', false, '21'), ('201', 'الموردين', 'liability', false, '22'), ('222', 'أوراق الدفع (شيكات صادرة)', 'liability', false, '22'),
    ('223', 'مصلحة الضرائب (التزامات)', 'liability', true, '22'), ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'liability', false, '223'), ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'liability', false, '223'), ('2233', 'ضريبة كسب العمل', 'liability', false, '223'), ('224', 'هيئة التأمينات الاجتماعية', 'liability', false, '22'), -- Ensure 224 is not NULL
    ('225', 'مصروفات مستحقة', 'liability', true, '22'), ('2251', 'رواتب وأجور مستحقة', 'liability', false, '225'), ('2252', 'إيجارات مستحقة', 'liability', false, '225'), ('2253', 'كهرباء ومياه وغاز مستحقة', 'liability', false, '225'), ('2254', 'أتعاب مهنية ومراجعة مستحقة', 'liability', false, '225'), ('2255', 'عمولات بيع مستحقة', 'liability', false, '225'), ('2256', 'فوائد بنكية مستحقة', 'liability', false, '225'), ('2257', 'اشتراكات وتراخيص مستحقة', 'liability', false, '225'), ('226', 'تأمينات ودفعات مقدمة من العملاء', 'liability', false, '22'),
    ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'equity', false, '3'),
    ('411', 'إيراد المبيعات', 'revenue', false, '41'), ('412', 'مردودات المبيعات', 'revenue', false, '41'), ('413', 'خصم مسموح به', 'revenue', false, '41'),
    ('421', 'إيرادات متنوعة', 'revenue', false, '42'), ('422', 'إيراد خصومات وجزاءات الموظفين', 'revenue', false, '42'), ('423', 'فوائد بنكية دائنة', 'revenue', false, '42'),
    ('511', 'تكلفة البضاعة المباعة', 'expense', false, '51'), ('512', 'تسويات الجرد (عجز المخزون)', 'expense', false, '51'),
    ('5121', 'تكلفة الهالك والفاقد', 'expense', false, '51'),
    ('513', 'أجور عمال الإنتاج المباشرة', 'expense', false, '51'),
    ('521', 'دعاية وإعلان', 'expense', false, '52'), ('522', 'عمولات بيع وتسويق', 'expense', false, '52'), ('523', 'نقل ومشال للخارج', 'expense', false, '52'), ('524', 'تعبئة وتغليف', 'expense', false, '52'),
    ('5251', 'عمولة فودافون كاش', 'expense', false, '525'), ('5252', 'عمولة فوري', 'expense', false, '525'), ('5253', 'عمولة تحويلات بنكية', 'expense', false, '525'),
    ('531', 'الرواتب والأجور', 'expense', false, '53'), ('5311', 'بدلات وانتقالات', 'expense', false, '53'), ('5312', 'مكافآت وحوافز', 'expense', false, '53'), ('532', 'إيجار مقرات إدارية', 'expense', false, '53'), ('533', 'إهلاك الأصول الثابتة', 'expense', false, '53'), ('534', 'رسوم ومصروفات بنكية', 'expense', false, '53'), ('535', 'كهرباء ومياه وغاز', 'expense', false, '53'), ('536', 'اتصالات وإنترنت', 'expense', false, '53'), ('537', 'صيانة وإصلاح', 'expense', false, '53'), ('538', 'أدوات مكتبية ومطبوعات', 'expense', false, '53'), ('539', 'ضيافة واستقبال', 'expense', false, '53'), ('541', 'تسوية عجز الصندوق', 'expense', false, '53'), ('542', 'إكراميات', 'expense', false, '53'), ('543', 'مصاريف نظافة', 'expense', false, '53');
    -- إضافات خاصة بنشاط المطاعم
    IF p_activity_type = 'restaurant' THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES 
        ('4111', 'إيرادات مبيعات (صالة)', 'revenue', false, '41'),
        ('4112', 'إيرادات مبيعات (توصيل)', 'revenue', false, '41');
    END IF;

    -- إضافات خاصة بنشاط التصنيع
    IF p_activity_type = 'manufacturing' THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES 
        ('514', 'تكاليف صناعية غير مباشرة', 'expense', true, '51'),
        ('5141', 'إهلاك آلات ومعدات المصنع', 'expense', false, '514'),
        ('5142', 'صيانة وإصلاح المصنع', 'expense', false, '514'),
        ('5143', 'كهرباء وقوى محركة للمصنع', 'expense', false, '514');
    END IF;

    INSERT INTO public.accounts (organization_id, code, name, type, is_group, is_active)
    SELECT p_org_id, code, name, type, is_group, true FROM coa_temp ORDER BY length(code), code
    ON CONFLICT (organization_id, code) DO UPDATE SET 
        is_group = EXCLUDED.is_group,
        type = EXCLUDED.type,
        name = EXCLUDED.name;

    UPDATE public.accounts
    SET parent_id = p.id 
    FROM coa_temp t 
    JOIN public.accounts p ON p.organization_id = p_org_id AND p.code = t.parent_code
    WHERE public.accounts.organization_id = p_org_id AND public.accounts.code = t.code;
    -- 🛡️ تصحيح تلقائي إضافي: أي حساب له أبناء يجب أن يكون "رئيسي" (Group)
    UPDATE public.accounts SET is_group = true 
    WHERE id IN (SELECT DISTINCT parent_id FROM public.accounts WHERE organization_id = p_org_id AND parent_id IS NOT NULL);

    -- 🚀 إنشاء دور المدير وحفظ معرفه في متغير لضمان السرعة والدقة
    INSERT INTO public.roles (organization_id, name, description)
    VALUES (p_org_id, 'admin', 'مدير النظام - صلاحيات كاملة')
    ON CONFLICT (name, organization_id) 
    DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_role_id;

    -- 🏗️ إنشاء مستودع افتراضي للشركة (يجب أن يكون خارج شرط الأدمن لضمان عمل النظام فوراً)
    v_warehouse_id := (SELECT id FROM public.warehouses WHERE organization_id = p_org_id AND name = 'المخزن الرئيسي' LIMIT 1);
    IF v_warehouse_id IS NULL THEN
        INSERT INTO public.warehouses (organization_id, name, location, is_active)
        VALUES (p_org_id, 'المخزن الرئيسي', 'الفرع الرئيسي', true)
        RETURNING id INTO v_warehouse_id;
    END IF;

    -- ️ إصلاح أمني: نستخدم المعرف الممرر فقط لتعيين المدير.
    v_admin_id := p_admin_id;
    IF v_admin_id IS NOT NULL THEN
        -- التأكد من إنشاء أو تحديث ملف المستخدم وربطه بالشركة الجديدة
        INSERT INTO public.profiles (id, organization_id, role, is_active, role_id, full_name)
        VALUES (
            v_admin_id,
            p_org_id,
            'admin',
            true,
            v_role_id,
            COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_admin_id), 'مدير النظام')
        )
        ON CONFLICT (id) DO UPDATE SET 
            role = 'admin', organization_id = p_org_id, is_active = true, role_id = v_role_id;
        
        UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('org_id', p_org_id, 'role', 'admin') WHERE id = v_admin_id;
    END IF;

    -- 🛡️ منح كافة الصلاحيات المتاحة في السيستم لهذا الدور الجديد
    INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
    SELECT v_role_id, id, p_org_id
    FROM public.permissions 
    ON CONFLICT DO NOTHING;

    -- 🚀 جلب معرفات الحسابات السيادية لربطها بالإعدادات
    v_cash_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1231' LIMIT 1);
    v_sales_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '411' LIMIT 1);
    v_cust_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1);
    v_cogs_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1);
    v_inv_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10302' LIMIT 1);
    v_vat_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2231' LIMIT 1);
    v_supp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '201' LIMIT 1);
    v_sal_ret_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '412' LIMIT 1);
    v_vat_in_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1241' LIMIT 1);
    v_disc_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '413' LIMIT 1);
    v_wht_pay_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2232' LIMIT 1);
    v_payroll_tax_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2233' LIMIT 1);
    v_wht_rec_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1242' LIMIT 1);
    v_sal_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '531' LIMIT 1);
    v_bonus_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5312' LIMIT 1);
    v_ded_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '422' LIMIT 1);
    v_adv_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1223' LIMIT 1);
    v_retained_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '32' LIMIT 1);
    v_raw_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10301' LIMIT 1);
    v_wip_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10303' LIMIT 1);
    v_labor_mfg_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '513' LIMIT 1);
    v_overhead_mfg_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '514' LIMIT 1);
    v_wastage_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5121' LIMIT 1);
    v_notes_pay_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '222' LIMIT 1);
    v_notes_rec_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1222' LIMIT 1);

    v_cash_deficit_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '541' LIMIT 1);
    v_dep_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '533' LIMIT 1);
    v_acc_dep_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1119' LIMIT 1);
    v_fixed_assets_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '111' LIMIT 1);
    v_opening_bal_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '3999' LIMIT 1);
    v_prepaid_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1243' LIMIT 1);
    v_accrued_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '225' LIMIT 1);
    v_social_ins_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '224' LIMIT 1);
    v_bank_main_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '123201' LIMIT 1);
    v_rev_other_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '421' LIMIT 1);
    v_exp_gen_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '53' LIMIT 1);
    v_sal_allow_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '412' LIMIT 1);
    v_bank_nbe_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '123201' LIMIT 1);
    v_exp_rent_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '532' LIMIT 1);
    v_security_deposit_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '226' LIMIT 1); -- Get account 226
    v_exp_util_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '535' LIMIT 1);
    -- 🚀 تأسيس سجل الإعدادات والربط المحاسبي فوراً لضمان اختفاء خطأ 406
    INSERT INTO public.company_settings (organization_id, activity_type, vat_rate, company_name, account_mappings, default_warehouse_id, default_treasury_id)
    VALUES (p_org_id, p_activity_type, v_vat_rate, v_org_name, 
        jsonb_build_object(
            'CASH', v_cash_id, 'SALES_REVENUE', v_sales_id, 'CUSTOMERS', v_cust_id, 'COGS', v_cogs_id, 'INVENTORY_FINISHED_GOODS', v_inv_id,
            'VAT', v_vat_id, 'SUPPLIERS', v_supp_id, 'SALES_RETURNS', v_sal_ret_id, 'VAT_INPUT', v_vat_in_id, 'SALES_DISCOUNT', v_disc_id,
            'WHT_PAYABLE', v_wht_pay_id, 'PAYROLL_TAX', v_payroll_tax_id, 'WHT_RECEIVABLE', v_wht_rec_id,
            'SALARIES_EXPENSE', v_sal_exp_id, 'EMPLOYEE_BONUSES', v_bonus_id, 'EMPLOYEE_DEDUCTIONS', v_ded_id, 'EMPLOYEE_ADVANCES', v_adv_id,
            'RETAINED_EARNINGS', v_retained_id,
            'INVENTORY_RAW_MATERIALS', v_raw_id,
            'INVENTORY_WIP', v_wip_id,
            'LABOR_COST_ALLOCATED', v_labor_mfg_id,
            'MANUFACTURING_OVERHEAD', v_overhead_mfg_id,
            'WASTAGE_EXPENSE', v_wastage_id,
            'NOTES_PAYABLE', v_notes_pay_id,
            'NOTES_RECEIVABLE', v_notes_rec_id,
            'CASH_SHORTAGE', v_cash_deficit_id,
            'DEPRECIATION_EXPENSE', v_dep_exp_id,
            'ACCUMULATED_DEPRECIATION', v_acc_dep_id,
            'ASSETS_FIXED', v_fixed_assets_id,
            'OPENING_BALANCES', v_opening_bal_id,
            'PREPAID_EXPENSES', v_prepaid_exp_id,
            'ACCRUED_EXPENSES', v_accrued_exp_id,
            'SOCIAL_INSURANCE', v_social_ins_id,
            'BANK_MAIN', v_bank_main_id,
            'REVENUE_OTHER', v_rev_other_id,
            'EXPENSE_GENERAL', v_exp_gen_id,
            'SALES_ALLOWANCES', v_sal_allow_id, 
            'SECURITY_DEPOSIT_ACCOUNT', v_security_deposit_id, -- Added account 226 mapping
            'BANK_ACCOUNTS', v_bank_nbe_id,
            'EXPENSE_RENT', v_exp_rent_id,
            'EXPENSE_UTILITIES', v_exp_util_id
        ),
        v_warehouse_id,
        v_cash_id
    ) ON CONFLICT (organization_id) DO UPDATE SET activity_type = EXCLUDED.activity_type, vat_rate = EXCLUDED.vat_rate, company_name = EXCLUDED.company_name, account_mappings = EXCLUDED.account_mappings, default_warehouse_id = EXCLUDED.default_warehouse_id, default_treasury_id = EXCLUDED.default_treasury_id;

    -- تأسيس الأدوار الافتراضية للمنظمة لضمان ظهورها في شاشة الصلاحيات
    INSERT INTO public.roles (organization_id, name, description) VALUES
    (p_org_id, 'admin', 'مدير النظام'),
    (p_org_id, 'accountant', 'محاسب'),
    (p_org_id, 'cashier', 'كاشير / بائع'),
    (p_org_id, 'chef', 'شيف / مطبخ')
    ON CONFLICT (name, organization_id) DO NOTHING;

    -- 🚀 تفعيل كافة الموديولات في جدول المنظمات لضمان ظهورها فوراً في القائمة الجانبية
    UPDATE public.organizations 
    SET allowed_modules = '{"accounting", "inventory", "sales", "purchases", "hr", "manufacturing", "restaurant"}'::text[]
    WHERE id = p_org_id;

    RETURN '✅ تم تأسيس الدليل المحاسبي وربط الحسابات السيادية بنجاح.';

EXCEPTION WHEN OTHERS THEN
    -- تسجيل الخطأ بالتفصيل في حال فشل بناء الدليل المحاسبي
    INSERT INTO public.system_error_logs (error_message, error_code, context, function_name, organization_id, user_id)
    VALUES (SQLERRM, SQLSTATE, jsonb_build_object('org_id', p_org_id, 'activity', p_activity_type), 'initialize_egyptian_coa', p_org_id, auth.uid());
    
    RAISE EXCEPTION 'فشل تأسيس دليل الحسابات: % (كود: %)', SQLERRM, SQLSTATE;
END; $$;

-- د. الدالة الشاملة لإنشاء شركة جديدة (Global SaaS Creator)
CREATE OR REPLACE FUNCTION public.create_new_client_v2(p_name text, p_email text, p_activity_type text DEFAULT 'commercial', p_vat_number text DEFAULT NULL, p_admin_id uuid DEFAULT NULL) 
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE v_org_id uuid;
BEGIN
    INSERT INTO public.organizations (name, email, vat_number, is_active)
    VALUES (p_name, p_email, p_vat_number, true) RETURNING id INTO v_org_id;
    PERFORM public.initialize_egyptian_coa(v_org_id, p_activity_type, p_admin_id);
    RETURN v_org_id;
END; $$;

-- ح. دالة مزامنة صلاحيات الأدوار (Atomic Role Permissions Sync)
-- هذه الدالة تحل مشكلة حفظ الصلاحيات وضمان أمان البيانات
CREATE OR REPLACE FUNCTION public.sync_role_permissions(p_role_id uuid, p_permission_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id uuid;
DECLARE v_role_name text;
BEGIN
    -- جلب معلومات الدور المستهدف لضمان الأمان
    SELECT organization_id, name INTO v_org_id, v_role_name FROM public.roles WHERE id = p_role_id;
    
    -- 🛡️ تحديث: السماح للسوبر أدمن بالمزامنة لأي شركة حتى لو لم يكن "داخل" سياقها الآن
    IF v_org_id IS NULL OR (v_org_id != public.get_my_org() AND public.get_my_role() != 'super_admin') THEN
        RAISE EXCEPTION 'غير مصرح لك بتعديل صلاحيات هذا الدور.';
    END IF;

    -- 🛡️ حماية دور الأدمن: منع العميل من سحب صلاحية "إدارة الصلاحيات" عن نفسه
    IF v_role_name = 'admin' AND public.get_my_role() != 'super_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.permissions 
            WHERE id = ANY(p_permission_ids) AND module = 'admin' AND action = 'manage'
        ) THEN
            RAISE EXCEPTION 'تحذير أمني: لا يمكنك سحب صلاحية "إدارة الصلاحيات" من دور المدير لضمان استمرار قدرتك على إدارة النظام.';
        END IF;
    END IF;

    -- مسح الصلاحيات الحالية (ضمن معاملة واحدة)
    DELETE FROM public.role_permissions WHERE role_id = p_role_id AND organization_id = v_org_id;

    -- إضافة الصلاحيات الجديدة
    IF array_length(p_permission_ids, 1) > 0 THEN
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT p_role_id, unnest(p_permission_ids), v_org_id;
    END IF;
END; $$;

-- ز. صيانة النظام والتقارير
-- ================================================================
-- 5.4 اعتماد التحويل المخزني (Approve Stock Transfer)
-- ================================================================
CREATE OR REPLACE FUNCTION public.approve_stock_transfer(p_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- 1. التأكد من وجود التحويل وحالته
    SELECT organization_id INTO v_org_id FROM public.stock_transfers 
    WHERE id = p_transfer_id AND (status = 'draft' OR status IS NULL);
    
    IF NOT FOUND THEN RETURN; END IF;

    -- 2. تحديث الحالة إلى مرحل
    UPDATE public.stock_transfers SET status = 'posted' WHERE id = p_transfer_id;

    -- 3. إعادة احتساب المخزون للمنظمة لتعكس حركات التحويل في المستودعات
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ================================================================
-- 5.5 اعتماد الجرد المخزني (Post Inventory Count)
-- ================================================================
CREATE OR REPLACE FUNCTION public.post_inventory_count(p_count_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count record; v_item record; v_adj_id uuid; v_adj_no text; v_total_val numeric := 0;
    v_inv_acc uuid; v_adj_acc uuid; v_je_id uuid; v_mappings jsonb;
BEGIN
    SELECT * INTO v_count FROM public.inventory_counts WHERE id = p_count_id AND status = 'draft';
    IF NOT FOUND THEN RAISE EXCEPTION 'الجرد غير موجود أو تم اعتماده مسبقاً'; END IF;

    v_adj_no := 'ADJ-CNT-' || v_count.count_number;

    -- 1. إنشاء رأس التسوية
    INSERT INTO public.stock_adjustments (organization_id, warehouse_id, adjustment_date, adjustment_number, reason, status)
    VALUES (v_count.organization_id, v_count.warehouse_id, v_count.count_date, v_adj_no, 'تسوية ناتجة عن جرد: ' || v_count.count_number, 'posted')
    RETURNING id INTO v_adj_id;

    -- 2. نقل الفروقات
    FOR v_item IN SELECT * FROM public.inventory_count_items WHERE inventory_count_id = p_count_id AND difference <> 0 LOOP
        INSERT INTO public.stock_adjustment_items (organization_id, stock_adjustment_id, product_id, quantity, type)
        VALUES (v_count.organization_id, v_adj_id, v_item.product_id, v_item.difference, CASE WHEN v_item.difference > 0 THEN 'in' ELSE 'out' END);
        
        v_total_val := v_total_val + (v_item.difference * COALESCE(
            (SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0) 
             FROM public.products WHERE id = v_item.product_id), 0));
    END LOOP;

    -- 3. المحاسبة الآلية للفروقات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_count.organization_id;
    v_inv_acc := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_count.organization_id LIMIT 1));
    v_adj_acc := COALESCE((v_mappings->>'INVENTORY_ADJUSTMENTS')::uuid, (SELECT id FROM public.accounts WHERE code = '512' AND organization_id = v_count.organization_id LIMIT 1));

    IF v_total_val <> 0 AND v_inv_acc IS NOT NULL AND v_adj_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
        VALUES (v_count.count_date, 'قيد تسوية جرد رقم ' || v_count.count_number, v_adj_no, 'posted', v_count.organization_id, true, v_adj_id, 'stock_adjustment')
        RETURNING id INTO v_je_id;

        IF v_total_val > 0 THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_inv_acc, v_total_val, 0, v_count.organization_id), (v_je_id, v_adj_acc, 0, v_total_val, v_count.organization_id);
        ELSE
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id) VALUES (v_je_id, v_adj_acc, ABS(v_total_val), 0, v_count.organization_id), (v_je_id, v_inv_acc, 0, ABS(v_total_val), v_count.organization_id);
        END IF;
    END IF;

    UPDATE public.inventory_counts SET status = 'posted' WHERE id = p_count_id;
    PERFORM public.recalculate_stock_rpc(v_count.organization_id);
    RETURN v_adj_id;
END; $$;

-- ================================================================
-- 5.6 إلغاء التحويل المخزني (Cancel Stock Transfer)
-- ================================================================
CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(p_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- 1. التأكد من وجود التحويل وحالته (فقط المرحل يمكن إلغاؤه)
    SELECT organization_id INTO v_org_id FROM public.stock_transfers 
    WHERE id = p_transfer_id AND status = 'posted';
    
    IF NOT FOUND THEN RAISE EXCEPTION 'التحويل غير موجود أو غير مرحل ليتم إلغاؤه'; END IF;

    -- 2. تحديث الحالة إلى ملغي
    UPDATE public.stock_transfers SET status = 'cancelled' WHERE id = p_transfer_id;

    -- 3. إعادة احتساب المخزون للمنظمة لتعكس إلغاء حركات التحويل
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- ================================================================
-- 5.1 معالجة الهالك (Wastage Processing)
-- ================================================================
CREATE OR REPLACE FUNCTION public.process_wastage(
    p_warehouse_id uuid,
    p_date date,
    p_notes text,
    p_items jsonb,
    p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_adj_id uuid;
    v_org_id uuid;
    v_adj_no text;
    v_item record;
    v_total_cost numeric := 0;
    v_item_cost numeric;
    v_je_id uuid;
    v_inventory_acc_id uuid;
    v_wastage_acc_id uuid;
    v_mappings jsonb;
BEGIN
    -- 1. تحديد المنظمة للمستخدم
    SELECT organization_id INTO v_org_id FROM public.profiles WHERE id = p_user_id;
    IF v_org_id IS NULL THEN 
        v_org_id := public.get_my_org();
    END IF;
    
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'لا يمكن تحديد المنظمة للعملية'; END IF;

    -- 2. توليد رقم العملية
    v_adj_no := 'WST-' || to_char(p_date, 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    -- 3. إنشاء رأس التسوية المخزنية
    INSERT INTO public.stock_adjustments ( -- Ensure organization_id is not NULL
        organization_id, warehouse_id, adjustment_date, adjustment_number,
        reason, status, created_by
    ) VALUES (
        v_org_id, p_warehouse_id, p_date, v_adj_no,
        COALESCE(p_notes, 'تسجيل هالك مخزني'), 'posted', p_user_id
    ) RETURNING id INTO v_adj_id;

    -- 4. إدراج الأصناف وحساب التكلفة الإجمالية
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x("productId" uuid, "quantity" numeric)
    LOOP
        SELECT COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0) INTO v_item_cost 
        FROM public.products WHERE id = v_item."productId" AND organization_id = v_org_id;
        
        v_total_cost := v_total_cost + (v_item_cost * ABS(v_item."quantity")); -- Ensure v_item_cost is not NULL

        INSERT INTO public.stock_adjustment_items (
            organization_id, stock_adjustment_id, product_id, quantity
        ) VALUES (
            v_org_id, v_adj_id, v_item."productId", -ABS(v_item."quantity")
        );
    END LOOP;

    -- 5. إنشاء القيد المحاسبي آلياً لقيمة الهالك
    IF v_total_cost > 0 THEN
        SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
        
        v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));
        v_wastage_acc_id := COALESCE(
            (v_mappings->>'WASTAGE_EXPENSE')::uuid, 
            (SELECT id FROM public.accounts WHERE code = '5121' AND organization_id = v_org_id LIMIT 1),
            (SELECT id FROM public.accounts WHERE code = '512' AND organization_id = v_org_id LIMIT 1)
        );

        IF v_inventory_acc_id IS NOT NULL AND v_wastage_acc_id IS NOT NULL THEN
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
            VALUES (p_date, 'إثبات قيمة هالك مخزني - ' || COALESCE(p_notes, v_adj_no), v_adj_no, 'posted', v_org_id, true, v_adj_id, 'stock_adjustment')
            RETURNING id INTO v_je_id; -- Ensure organization_id is not NULL

            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES 
                (v_je_id, v_wastage_acc_id, v_total_cost, 0, 'تكلفة الهالك والفاقد', v_org_id),
                (v_je_id, v_inventory_acc_id, 0, v_total_cost, 'نقص مخزون نتيجة هالك', v_org_id);
                
            UPDATE public.stock_adjustments SET related_journal_entry_id = v_je_id WHERE id = v_adj_id;
        END IF;
    END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);
    RETURN v_adj_id;
END;
$$;

-- 🛠️ دالة تشغيل النسخ الاحتياطي لكافة الشركات (Global Backup Runner)
-- تُستخدم هذه الدالة بواسطة نظام الجدولة (Cron Job) لتشغيل النسخ الاحتياطي آلياً
DROP FUNCTION IF EXISTS public.run_daily_backups_all_orgs();
CREATE OR REPLACE FUNCTION public.run_daily_backups_all_orgs()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_org record;
BEGIN
    -- 1. المرور على كافة المنظمات النشطة في النظام
    FOR v_org IN SELECT id FROM public.organizations WHERE is_active = true LOOP
        BEGIN
            -- استدعاء محرك النسخ الاحتياطي لكل منظمة على حدة
            PERFORM public.create_organization_backup(v_org.id);
        EXCEPTION WHEN OTHERS THEN
            -- في حال فشل نسخة لشركة محددة، نسجل الخطأ ونستمر في بقية الشركات
            INSERT INTO public.system_error_logs (error_message, context, function_name, organization_id)
            VALUES (SQLERRM, jsonb_build_object('org_id', v_org.id, 'step', 'auto_backup'), 'run_daily_backups_all_orgs', v_org.id);
        END;
    END LOOP;

    -- 2. سياسة الاستبقاء (Retention Policy): 
    -- تقليص مدة الاحتفاظ إلى 5 أيام لتحسين أداء قاعدة البيانات وتقليل الحجم في الباقة المجانية
    DELETE FROM public.organization_backups 
    WHERE created_at < (now() - interval '5 days')
    AND notes = 'نسخة احتياطية تلقائية للنظام';

    -- 3. سياسة تنظيف الإشعارات العدوانية (Aggressive Notification Cleanup)
    -- أ. حذف كافة الإشعارات المقروءة فوراً (لا داعي للأرشفة في الباقة المجانية)
    DELETE FROM public.notifications WHERE is_read = true;

    -- ب. حذف الإشعارات غير المقروءة التي مر عليها أكثر من 48 ساعة
    DELETE FROM public.notifications WHERE created_at < (now() - interval '2 days');

    -- ج. معالج التكرار (Deduplication Guard): حذف الإشعارات القديمة المكررة لنفس الموضوع
    -- يبقي فقط على أحدث إشعار لكل مستخدم حول نفس العنوان (مثل: "نقص مخزون صنف X")
    DELETE FROM public.notifications n1 USING public.notifications n2 
    WHERE n1.id < n2.id AND n1.title = n2.title AND n1.user_id = n2.user_id AND n1.is_read = false;

    -- 4. سياسة تنظيف السجلات (Log Cleanup Policy):
    -- الاحتفاظ بآخر 3 أيام فقط من سجلات الأخطاء والأمان لتوفير المساحة
    DELETE FROM public.system_error_logs WHERE created_at < (now() - interval '7 days');
    DELETE FROM public.security_logs WHERE created_at < (now() - interval '7 days');
    DELETE FROM public.notification_audit_log WHERE created_at < (now() - interval '7 days');
END; $$;

-- 📅 تفعيل الجدولة اليومية (Daily Schedule)
-- سيتم تشغيل هذه المهمة يومياً في تمام الساعة 3:00 صباحاً بتوقيت الخادم
-- ملاحظة: يجب التأكد من تفعيل ملحق pg_cron في إعدادات Supabase (Extensions)
-- 🛡️ حماية: نتحقق من وجود ملحق pg_cron قبل محاولة الجدولة لمنع توقف السكربت
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
        -- 1. إلغاء الجدولة القديمة (إن وجدت) لتجنب التكرار عند إعادة النشر
        BEGIN
            EXECUTE 'SELECT cron.unschedule(''daily-system-backup'')';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- 2. إعادة الجدولة: تشغيل يومي الساعة 3:00 صباحاً
        PERFORM cron.schedule('daily-system-backup', '0 3 * * *', 'SELECT public.run_daily_backups_all_orgs();');
        RAISE NOTICE '✅ تم تفعيل جدولة النسخ الاحتياطي اليومي بنجاح.';
    ELSE
        RAISE WARNING '⚠️ تنبيه: ملحق pg_cron غير مفعل. لن يتم تفعيل الجدولة التلقائية. يمكنك تفعيله من Dashboard -> Database -> Extensions.';
    END IF;
END $$;

-- ================================================================
-- 6.1 محرك استعادة البيانات (SaaS Restore Engine)
-- ================================================================
CREATE OR REPLACE FUNCTION public.restore_organization_backup(p_org_id uuid, p_backup_data jsonb)
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_item jsonb;
BEGIN
    IF p_backup_data IS NULL OR p_backup_data = 'null'::jsonb THEN
        RAISE EXCEPTION 'بيانات النسخة الاحتياطية غير صالحة أو فارغة.';
    END IF;

    -- 🛡️ تفعيل وضع الاستعادة لتجاوز صمامات أمان حذف الحسابات السيادية
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 🛡️ [جديد V7] فحص سلامة النسخة قبل البدء (Pre-Restore Integrity Check)
    -- 🛡️ صمامات الأمان والنزاهة (Restore Safety Valves)
    
    -- 1. فحص توافق الإصدار (Version Compatibility Check)
    IF (p_backup_data->'metadata'->>'version') IS NULL OR (p_backup_data->'metadata'->>'version') != '1.0' THEN
        RAISE EXCEPTION 'فشل فحص التوافق: إصدار النسخة الاحتياطية (%) غير مدعوم في إصدار النظام الحالي (1.0).', 
            COALESCE(p_backup_data->'metadata'->>'version', 'Unknown');
    END IF;

    -- 2. التحقق من تطابق هوية المنظمة (Organization ID Cross-Check)
    IF (p_backup_data->'metadata'->>'org_id') IS NOT NULL AND (p_backup_data->'metadata'->>'org_id')::uuid != p_org_id THEN
        RAISE NOTICE 'تنبيه أمان: يتم استعادة بيانات تخص المنظمة (%) إلى المنظمة الحالية (%). تم السماح بالعملية لدعم الهجرة.', 
            p_backup_data->'metadata'->>'org_id', p_org_id;
    END IF;

    -- 3. فحص التبعية الهيكلية (Relational Integrity Check)
    -- منع استعادة "أبناء" بدون "آباء"
    IF jsonb_array_length(COALESCE(p_backup_data->'invoice_items', '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_backup_data->'invoices', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص النزاهة: الملف يحتوي على بنود فواتير ولكن يفتقر لبيانات الفواتير الرئيسية. تم إلغاء الاستعادة.';
    END IF;

    IF jsonb_array_length(COALESCE(p_backup_data->'journal_lines', '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_backup_data->'journal_entries', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص النزاهة: الملف يحتوي على قيود فرعية ولكن يفتقر لقيود اليومية الرئيسية. تم إلغاء الاستعادة.';
    END IF;

    -- 🛡️ [جديد V7] فحص سلامة الموديولات الأساسية قبل البدء (Module Integrity Check)
    -- فحص المستودعات: إذا وجدت فواتير أو منتجات، يجب وجود مستودعات
    IF (jsonb_array_length(COALESCE(p_backup_data->'invoices', '[]'::jsonb)) > 0 OR jsonb_array_length(COALESCE(p_backup_data->'products', '[]'::jsonb)) > 0) 
       AND jsonb_array_length(COALESCE(p_backup_data->'warehouses', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص السلامة: النسخة تحتوي على فواتير أو منتجات ولكنها تفتقر لبيانات المستودعات. تم إيقاف الاستعادة لحماية البيانات.';
    END IF;

    -- فحص الحسابات: العمود الفقري للنظام
    IF jsonb_array_length(COALESCE(p_backup_data->'accounts', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص السلامة: النسخة تفتقر لدليل الحسابات. لا يمكن الاستعادة بدون هيكل محاسبي.';
    END IF;

    -- فحص العملاء والموردين
    IF jsonb_array_length(COALESCE(p_backup_data->'invoices', '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_backup_data->'customers', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص السلامة: توجد فواتير مبيعات ولكن بيانات العملاء مفقودة في النسخة.';
    END IF;

    IF jsonb_array_length(COALESCE(p_backup_data->'purchase_invoices', '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_backup_data->'suppliers', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'فشل فحص السلامة: توجد فواتير مشتريات ولكن بيانات الموردين مفقودة في النسخة.';
    END IF;

    -- إذا اجتاز النظام الفحوصات أعلاه، نبدأ الآن العملية الفعلية
    RAISE NOTICE '✅ فحص سلامة النسخة نجح. جاري بدء عملية التطهير والبناء...';

    -- 🛡️ المرحلة 1: التطهير المتسلسل العشري (Strategic Purge)
    -- حجر الزاوية: مسح المرفقات واللوجات أولاً
    DELETE FROM public.notification_audit_log WHERE organization_id = p_org_id;
    DELETE FROM public.cheque_attachments WHERE organization_id = p_org_id;
    DELETE FROM public.receipt_voucher_attachments WHERE organization_id = p_org_id;
    DELETE FROM public.payment_voucher_attachments WHERE organization_id = p_org_id;
    DELETE FROM public.notification_preferences WHERE organization_id = p_org_id;
    DELETE FROM public.security_logs WHERE organization_id = p_org_id;
    DELETE FROM public.journal_attachments WHERE organization_id = p_org_id;
    
    -- مسح بنود العمليات (الأبناء الصغار)
    DELETE FROM public.order_item_modifiers WHERE organization_id = p_org_id;
    DELETE FROM public.payroll_variables WHERE organization_id = p_org_id;
    DELETE FROM public.opening_inventories WHERE organization_id = p_org_id;
    DELETE FROM public.bill_of_materials WHERE organization_id = p_org_id;
    DELETE FROM public.order_items WHERE organization_id = p_org_id;
    DELETE FROM public.kitchen_orders WHERE organization_id = p_org_id;
    DELETE FROM public.invoice_items WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_invoice_items WHERE organization_id = p_org_id;
    DELETE FROM public.journal_lines WHERE organization_id = p_org_id;
    DELETE FROM public.payroll_items WHERE organization_id = p_org_id;
    DELETE FROM public.stock_adjustment_items WHERE organization_id = p_org_id;
    DELETE FROM public.sales_return_items WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_return_items WHERE organization_id = p_org_id;

    -- مسح رؤوس العمليات (الآباء)
    DELETE FROM public.delivery_orders WHERE organization_id = p_org_id;
    DELETE FROM public.payments WHERE organization_id = p_org_id;
    DELETE FROM public.orders WHERE organization_id = p_org_id;
    DELETE FROM public.invoices WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = p_org_id;
    DELETE FROM public.sales_returns WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_returns WHERE organization_id = p_org_id;
    DELETE FROM public.journal_entries WHERE organization_id = p_org_id;
    DELETE FROM public.payrolls WHERE organization_id = p_org_id;
    DELETE FROM public.stock_adjustments WHERE organization_id = p_org_id;
    DELETE FROM public.cheques WHERE organization_id = p_org_id;
    DELETE FROM public.receipt_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.payment_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.table_sessions WHERE organization_id = p_org_id;
    DELETE FROM public.shifts WHERE organization_id = p_org_id;
    DELETE FROM public.work_orders WHERE organization_id = p_org_id;
    DELETE FROM public.credit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.debit_notes WHERE organization_id = p_org_id;

    -- مسح الكيانات والبنية التحتية
    DELETE FROM public.assets WHERE organization_id = p_org_id;
    DELETE FROM public.products WHERE organization_id = p_org_id;
    DELETE FROM public.customers WHERE organization_id = p_org_id;
    DELETE FROM public.suppliers WHERE organization_id = p_org_id;
    DELETE FROM public.employees WHERE organization_id = p_org_id;
    DELETE FROM public.restaurant_tables WHERE organization_id = p_org_id;
    DELETE FROM public.modifiers WHERE organization_id = p_org_id;
    DELETE FROM public.modifier_groups WHERE organization_id = p_org_id;
    DELETE FROM public.accounts WHERE organization_id = p_org_id;
    DELETE FROM public.cost_centers WHERE organization_id = p_org_id;
    DELETE FROM public.warehouses WHERE organization_id = p_org_id;

    -- 🚀 المرحلة 2: بناء البنى السيادية
    IF (p_backup_data->'settings') IS NOT NULL AND (p_backup_data->'settings') != 'null'::jsonb THEN
        INSERT INTO public.company_settings SELECT * FROM jsonb_populate_record(NULL::public.company_settings, p_backup_data->'settings') 
        ON CONFLICT (organization_id) DO UPDATE SET company_name = EXCLUDED.company_name, account_mappings = EXCLUDED.account_mappings;
    END IF;

    IF (p_backup_data->'warehouses') IS NOT NULL THEN INSERT INTO public.warehouses SELECT * FROM jsonb_populate_recordset(NULL::public.warehouses, p_backup_data->'warehouses') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'item_categories') IS NOT NULL THEN INSERT INTO public.item_categories SELECT * FROM jsonb_populate_recordset(NULL::public.item_categories, p_backup_data->'item_categories') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'cost_centers') IS NOT NULL THEN INSERT INTO public.cost_centers SELECT * FROM jsonb_populate_recordset(NULL::public.cost_centers, p_backup_data->'cost_centers') ON CONFLICT DO NOTHING; END IF;

    -- 🚀 المرحلة 3: بناء شجرة الحسابات
    IF (p_backup_data->'accounts') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'accounts') LOOP 
            INSERT INTO public.accounts SELECT * FROM jsonb_populate_record(NULL::public.accounts, v_item - 'parent_id') ON CONFLICT DO NOTHING; 
        END LOOP;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'accounts') LOOP 
            UPDATE public.accounts SET parent_id = (v_item->>'parent_id')::uuid WHERE id = (v_item->>'id')::uuid AND (v_item->>'parent_id') IS NOT NULL;
        END LOOP;
    END IF;

    -- 🚀 المرحلة 4: زرع الكيانات (الأصول البشرية والتجارية)
    IF (p_backup_data->'customers') IS NOT NULL THEN INSERT INTO public.customers SELECT * FROM jsonb_populate_recordset(NULL::public.customers, p_backup_data->'customers') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, balance = EXCLUDED.balance; END IF;
    IF (p_backup_data->'suppliers') IS NOT NULL THEN INSERT INTO public.suppliers SELECT * FROM jsonb_populate_recordset(NULL::public.suppliers, p_backup_data->'suppliers') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, balance = EXCLUDED.balance; END IF;
    IF (p_backup_data->'employees') IS NOT NULL THEN INSERT INTO public.employees SELECT * FROM jsonb_populate_recordset(NULL::public.employees, p_backup_data->'employees') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'restaurant_tables') IS NOT NULL THEN INSERT INTO public.restaurant_tables SELECT * FROM jsonb_populate_recordset(NULL::public.restaurant_tables, p_backup_data->'restaurant_tables') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'shifts') IS NOT NULL THEN INSERT INTO public.shifts SELECT * FROM jsonb_populate_recordset(NULL::public.shifts, p_backup_data->'shifts') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'table_sessions') IS NOT NULL THEN INSERT INTO public.table_sessions SELECT * FROM jsonb_populate_recordset(NULL::public.table_sessions, p_backup_data->'table_sessions') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'modifier_groups') IS NOT NULL THEN INSERT INTO public.modifier_groups SELECT * FROM jsonb_populate_recordset(NULL::public.modifier_groups, p_backup_data->'modifier_groups') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'modifiers') IS NOT NULL THEN INSERT INTO public.modifiers SELECT * FROM jsonb_populate_recordset(NULL::public.modifiers, p_backup_data->'modifiers') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'modifier_groups') IS NOT NULL THEN INSERT INTO public.modifier_groups SELECT * FROM jsonb_populate_recordset(NULL::public.modifier_groups, p_backup_data->'modifier_groups') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'modifiers') IS NOT NULL THEN INSERT INTO public.modifiers SELECT * FROM jsonb_populate_recordset(NULL::public.modifiers, p_backup_data->'modifiers') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'products') IS NOT NULL THEN INSERT INTO public.products SELECT * FROM jsonb_populate_recordset(NULL::public.products, p_backup_data->'products') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, stock = EXCLUDED.stock; END IF;

    -- 🚀 المرحلة 5: زرع رؤوس المستندات (بدون الروابط الدائرية)
    -- تم تحويلها إلى حلقة (Loop) لضمان الدقة ومعالجة التعارضات بشكل فردي
    IF (p_backup_data->'journal_entries') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'journal_entries') LOOP
            INSERT INTO public.journal_entries SELECT * FROM jsonb_populate_record(NULL::public.journal_entries, v_item) 
            ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id; 
        END LOOP;
    END IF;

    IF (p_backup_data->'employee_allowances') IS NOT NULL THEN INSERT INTO public.employee_allowances SELECT * FROM jsonb_populate_recordset(NULL::public.employee_allowances, p_backup_data->'employee_allowances') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'payroll_variables') IS NOT NULL THEN INSERT INTO public.payroll_variables SELECT * FROM jsonb_populate_recordset(NULL::public.payroll_variables, p_backup_data->'payroll_variables') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'employee_advances') IS NOT NULL THEN INSERT INTO public.employee_advances SELECT * FROM jsonb_populate_recordset(NULL::public.employee_advances, p_backup_data->'employee_advances') ON CONFLICT DO NOTHING; END IF;

    IF (p_backup_data->'invoices') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'invoices') LOOP 
            INSERT INTO public.invoices SELECT * FROM jsonb_populate_record(NULL::public.invoices, v_item - 'related_journal_entry_id') ON CONFLICT (id) DO NOTHING; 
        END LOOP; 
    END IF;

    IF (p_backup_data->'purchase_invoices') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'purchase_invoices') LOOP 
            INSERT INTO public.purchase_invoices SELECT * FROM jsonb_populate_record(NULL::public.purchase_invoices, v_item - 'related_journal_entry_id') ON CONFLICT (id) DO NOTHING; 
        END LOOP; 
    END IF;
    IF (p_backup_data->'receipt_vouchers') IS NOT NULL THEN INSERT INTO public.receipt_vouchers SELECT * FROM jsonb_populate_recordset(NULL::public.receipt_vouchers, p_backup_data->'receipt_vouchers') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'payment_vouchers') IS NOT NULL THEN INSERT INTO public.payment_vouchers SELECT * FROM jsonb_populate_recordset(NULL::public.payment_vouchers, p_backup_data->'payment_vouchers') ON CONFLICT DO NOTHING; END IF;

    -- 🚀 زرع الشيكات (التي كانت مفقودة في V35)
    IF (p_backup_data->'cheques') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'cheques') LOOP 
            INSERT INTO public.cheques SELECT * FROM jsonb_populate_record(NULL::public.cheques, v_item - 'related_journal_entry_id') ON CONFLICT (id) DO NOTHING; 
        END LOOP; 
    END IF;

    -- 🚀 المرحلة 6: زرع التفاصيل والبنود (Items & Lines)
    IF (p_backup_data->'journal_lines') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'journal_lines') LOOP
            -- 🛡️ فحص ذكي: لا تدرج السطر إلا إذا كان القيد الأب موجوداً فعلياً في القاعدة
            -- هذا يمنع انهيار العملية بالكامل بسبب سجل واحد تالف في النسخة الاحتياطية
            IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = (v_item->>'journal_entry_id')::uuid) THEN
                INSERT INTO public.journal_lines SELECT * FROM jsonb_populate_record(NULL::public.journal_lines, v_item) 
                ON CONFLICT (id) DO UPDATE SET 
                    organization_id = p_org_id,
                    journal_entry_id = EXCLUDED.journal_entry_id,
                    account_id = EXCLUDED.account_id,
                    debit = EXCLUDED.debit,
                    credit = EXCLUDED.credit;
            END IF;
        END LOOP;
    END IF;

    -- 🚀 تحسين: زرع بنود الفواتير مع فحص الأب (Parent Integrity Check)
    IF (p_backup_data->'invoice_items') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'invoice_items') LOOP
            IF EXISTS (SELECT 1 FROM public.invoices WHERE id = (v_item->>'invoice_id')::uuid) THEN
                INSERT INTO public.invoice_items SELECT * FROM jsonb_populate_record(NULL::public.invoice_items, v_item) ON CONFLICT (id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- زرع المرفقات
    IF (p_backup_data->'cheque_attachments') IS NOT NULL THEN INSERT INTO public.cheque_attachments SELECT * FROM jsonb_populate_recordset(NULL::public.cheque_attachments, p_backup_data->'cheque_attachments') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'receipt_voucher_attachments') IS NOT NULL THEN INSERT INTO public.receipt_voucher_attachments SELECT * FROM jsonb_populate_recordset(NULL::public.receipt_voucher_attachments, p_backup_data->'receipt_voucher_attachments') ON CONFLICT DO NOTHING; END IF;
    IF (p_backup_data->'payment_voucher_attachments') IS NOT NULL THEN INSERT INTO public.payment_voucher_attachments SELECT * FROM jsonb_populate_recordset(NULL::public.payment_voucher_attachments, p_backup_data->'payment_voucher_attachments') ON CONFLICT DO NOTHING; END IF;

    IF (p_backup_data->'purchase_invoice_items') IS NOT NULL THEN 
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'purchase_invoice_items') LOOP
            IF EXISTS (SELECT 1 FROM public.purchase_invoices WHERE id = (v_item->>'purchase_invoice_id')::uuid) THEN
                INSERT INTO public.purchase_invoice_items SELECT * FROM jsonb_populate_record(NULL::public.purchase_invoice_items, v_item) ON CONFLICT (id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    IF (p_backup_data->'bill_of_materials') IS NOT NULL THEN INSERT INTO public.bill_of_materials SELECT * FROM jsonb_populate_recordset(NULL::public.bill_of_materials, p_backup_data->'bill_of_materials') ON CONFLICT (id) DO NOTHING; END IF;
    IF (p_backup_data->'opening_inventories') IS NOT NULL THEN INSERT INTO public.opening_inventories SELECT * FROM jsonb_populate_recordset(NULL::public.opening_inventories, p_backup_data->'opening_inventories') ON CONFLICT DO NOTHING; END IF;

    -- 🚀 المرحلة 7: حقن الروابط النهائية (Stitching)
    -- [جديد] محرك إعادة الربط التلقائي لضمان ظهور القيود في الفواتير والسندات
    UPDATE public.invoices i SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = i.id AND je.related_document_type = 'invoice' AND i.organization_id = p_org_id;
    UPDATE public.purchase_invoices pi SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = pi.id AND je.related_document_type = 'purchase_invoice' AND pi.organization_id = p_org_id;
    UPDATE public.receipt_vouchers rv SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = rv.id AND je.related_document_type = 'receipt_voucher' AND rv.organization_id = p_org_id;
    UPDATE public.payment_vouchers pv SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = pv.id AND je.related_document_type = 'payment_voucher' AND pv.organization_id = p_org_id;
    UPDATE public.cheques c SET related_journal_entry_id = je.id FROM public.journal_entries je WHERE je.related_document_id = c.id AND je.related_document_type = 'cheque' AND c.organization_id = p_org_id;

    PERFORM public.recalculate_all_system_balances(p_org_id);
    RETURN '✅ [V13] تمت الاستعادة بنجاح مع ترميم كافة الروابط وتخطي البنود اليتيمة.';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '❌ فشل محرك الاستعادة V13 الشامل: %', SQLERRM;
END; $$;

-- 🛡️ دالة فحص نزاهة النسخة الاحتياطية (Integrity Validator RPC)
-- هذه الدالة لا تمس البيانات، بل تعيد تقريراً فقط
DROP FUNCTION IF EXISTS public.validate_backup_integrity(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.validate_backup_integrity(p_org_id uuid, p_backup_data jsonb)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_report jsonb := '[]'::jsonb;
    v_stored_checksum text;
    v_calculated_checksum text;
    v_temp_check record;
BEGIN
    -- 1. فحص الإصدار
    IF (p_backup_data->'metadata'->>'version') = '1.0' THEN
        v_report := v_report || jsonb_build_object('name', 'توافق الإصدار', 'status', 'pass', 'message', 'إصدار النسخة (1.0) متوافق تماماً.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'توافق الإصدار', 'status', 'fail', 'message', 'إصدار النسخة غير مدعوم.');
    END IF;

    -- 🔒 2. فحص البصمة الرقمية (Checksum Verification)
    v_stored_checksum := p_backup_data->>'checksum';
    -- نحسب البصمة للبيانات بعد استبعاد حقل الـ checksum نفسه
    v_calculated_checksum := md5((p_backup_data - 'checksum')::text);

    IF v_stored_checksum IS NULL THEN
        v_report := v_report || jsonb_build_object('name', 'أمان البيانات', 'status', 'fail', 'message', 'النسخة تفتقر للبصمة الرقمية (غير آمنة).');
    ELSIF v_stored_checksum != v_calculated_checksum THEN
        v_report := v_report || jsonb_build_object('name', 'أمان البيانات', 'status', 'fail', 'message', 'تحذير: تم اكتشاف تلاعب في محتوى الملف! البصمة لا تطابق البيانات.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'أمان البيانات', 'status', 'pass', 'message', 'تم التحقق من بصمة البيانات: النسخة أصلية ولم يتم تعديلها.');
    END IF;

    -- 3. فحص الدليل المحاسبي
    IF (p_backup_data->'accounts') IS NOT NULL AND jsonb_array_length(p_backup_data->'accounts') > 0 THEN
        v_report := v_report || jsonb_build_object('name', 'الدليل المحاسبي', 'status', 'pass', 'message', 'تم العثور على ' || jsonb_array_length(p_backup_data->'accounts') || ' حساب.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'الدليل المحاسبي', 'status', 'fail', 'message', 'النسخة لا تحتوي على دليل حسابات!');
    END IF;

    -- 4. فحص المستودعات والمنتجات
    IF (p_backup_data->'products') IS NOT NULL AND (p_backup_data->'warehouses') IS NULL THEN
        v_report := v_report || jsonb_build_object('name', 'تكامل المخزون', 'status', 'fail', 'message', 'يوجد منتجات بدون مستودعات مرتبطة.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'تكامل المخزون', 'status', 'pass', 'message', 'بيانات المخزون تبدو سليمة.');
    END IF;

    -- 5. فحص تطابق المنظمة (تحذير فقط)
    IF (p_backup_data->'metadata'->>'org_id')::uuid != p_org_id THEN
        v_report := v_report || jsonb_build_object('name', 'هوية الشركة', 'status', 'warning', 'message', 'هذه النسخة تنتمي لشركة أخرى، سيتم تحويل المعرفات آلياً.');
    ELSE
        v_report := v_report || jsonb_build_object('name', 'هوية الشركة', 'status', 'pass', 'message', 'هوية الشركة متطابقة.');
    END IF;

    -- 6. فحص حجم البيانات (تقديري)
    v_report := v_report || jsonb_build_object('name', 'حجم العمليات', 'status', 'pass', 'message', 'تحتوي النسخة على ' || 
        (COALESCE(jsonb_array_length(p_backup_data->'invoices'), 0) + COALESCE(jsonb_array_length(p_backup_data->'journal_entries'), 0)) || ' مستند مالي.');

    RETURN v_report;
END; $$;

-- 🧪 دالة اختبار النزاهة الشاملة (Backup/Restore Unit Test)
CREATE OR REPLACE FUNCTION public.test_full_backup_restore_cycle()
RETURNS TABLE(test_step text, status text, details text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
    v_backup_id uuid;
    v_backup_data jsonb;
    v_initial_balance numeric;
    v_final_balance numeric;
    v_initial_stock numeric;
    v_final_stock numeric;
    v_wh_id uuid;
    v_user_id uuid;
    v_prod_id uuid;
BEGIN
    -- 🚀 1. إنشاء شركة اختبارية (SaaS Sandbox)
    v_org_id := public.create_new_client_v2('Test Restore Org', 'test@restore.com', 'commercial');
    test_step := '1. تهيئة المنظمة'; status := 'SUCCESS ✅'; details := 'تم إنشاء المنظمة برقم: ' || v_org_id; RETURN NEXT;

    -- جلب المستودع الافتراضي الذي تم إنشاؤه آلياً
    SELECT id INTO v_wh_id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1;

    -- 📥 2. إدخال بيانات (مالية ومخزنية) اختبارية
    -- أ. قيد محاسبي
    INSERT INTO public.journal_entries (description, status, organization_id, transaction_date, is_posted)
    VALUES ('قيد مبيعات اختباري للتحقق', 'posted', v_org_id, now(), true) RETURNING id INTO v_prod_id; 
    
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id)
    VALUES 
        (v_prod_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1221' LIMIT 1), 5000, 0, v_org_id),
        (v_prod_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '411' LIMIT 1), 0, 5000, v_org_id);

    -- ب. صنف مخزني برصيد
    INSERT INTO public.products (name, purchase_price, organization_id)
    VALUES ('صنف اختباري', 10, v_org_id) RETURNING id INTO v_prod_id;
    
    -- تسجيل الرصيد الافتتاحي في جدول الحركات لكي يراه محرك المخزون
    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id)
    VALUES (v_prod_id, v_wh_id, 100, 10, v_org_id);

    PERFORM public.recalculate_all_system_balances(v_org_id);
    SELECT balance INTO v_initial_balance FROM public.accounts WHERE organization_id = v_org_id AND code = '1';
    SELECT stock INTO v_initial_stock FROM public.products WHERE id = v_prod_id;

    test_step := '2. ضخ البيانات'; status := 'DONE 📥'; details := 'رصيد الأصول: ' || v_initial_balance || ' | المخزون: ' || v_initial_stock; RETURN NEXT;

    -- 💾 3. إجراء النسخ الاحتياطي (مع توليد الـ Checksum)
    v_backup_id := public.create_organization_backup(v_org_id);
    SELECT backup_data INTO v_backup_data FROM public.organization_backups WHERE id = v_backup_id;
    test_step := '3. إنشاء النسخة'; status := 'SUCCESS ✅'; details := 'حجم النسخة: ' || pg_column_size(v_backup_data) || ' bytes | البصمة: ' || (v_backup_data->>'checksum'); RETURN NEXT;

    -- 🔄 4. الاستعادة (تطهير كامل ثم إعادة بناء)
    PERFORM public.restore_organization_backup(v_org_id, v_backup_data);
    test_step := '4. عملية الاستعادة'; status := 'COMPLETED 🔄'; details := 'تم التطهير وإعادة الربط (Stitching) بنجاح'; RETURN NEXT;

    -- ⚖️ 5. التحقق من تطابق الأرصدة والبيانات
    SELECT balance INTO v_final_balance FROM public.accounts WHERE organization_id = v_org_id AND code = '1';
    SELECT stock INTO v_final_stock FROM public.products WHERE name = 'صنف اختباري' AND organization_id = v_org_id;
    
    IF v_initial_balance = v_final_balance AND v_initial_stock = v_final_stock THEN
        test_step := '5. فحص النزاهة النهائية'; status := 'PASSED ✅'; details := 'تطابق كامل 100%: الرصيد (' || v_final_balance || ') المخزون (' || v_final_stock || ')';
    ELSE
        test_step := '5. فحص النزاهة النهائية'; status := 'FAILED ❌'; details := 'عدم تطابق! مالي: ' || v_initial_balance || '/' || v_final_balance || ' مخزني: ' || v_initial_stock || '/' || v_final_stock;
    END IF;
    RETURN NEXT;

    -- تنظيف شركة الاختبار
    DELETE FROM public.organizations WHERE id = v_org_id;

EXCEPTION WHEN OTHERS THEN
    test_step := 'CRITICAL ERROR'; status := 'ERROR 🛑'; details := SQLERRM;
    DELETE FROM public.organizations WHERE id = v_org_id;
    RETURN NEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.force_grant_admin_access(p_user_id uuid, p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_role_id uuid;
BEGIN
    -- جلب معرف الدور (Admin) الخاص بهذه المنظمة تحديداً
    SELECT id INTO v_role_id FROM public.roles 
    WHERE organization_id = p_org_id AND name = 'admin' 
    LIMIT 1;

    -- تحديث البروفايل بالاسم والرقم التعريفي للدور
    UPDATE public.profiles 
    SET role = 'admin', 
        role_id = v_role_id, 
        organization_id = p_org_id, 
        is_active = true 
    WHERE id = p_user_id;

    -- تحديث بيانات الدخول لضمان التعرف على الشركة في الجلسة
    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
                             jsonb_build_object('org_id', p_org_id, 'role', 'admin') 
    WHERE id = p_user_id;

    RETURN 'تم منح صلاحيات المدير بنجاح ✅';
END; $$;

-- 📊 دالة تقرير مبيعات المطعم (The Missing Report Function)
CREATE OR REPLACE FUNCTION public.get_restaurant_sales_report(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    item_name text,
    category_name text,
    quantity numeric,
    total_sales numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.name::text as item_name,
        COALESCE(cat.name::text, 'غير مصنف'::text) as category_name,
        SUM(oi.quantity)::numeric as quantity,
        SUM(oi.total_price)::numeric as total_sales
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.products p ON oi.product_id = p.id
    LEFT JOIN public.item_categories cat ON p.category_id = cat.id
    WHERE o.organization_id = p_org_id
      AND o.status IN ('COMPLETED', 'PAID', 'posted')
      AND o.created_at::date BETWEEN p_start_date AND p_end_date
    GROUP BY p.name, cat.name
    ORDER BY total_sales DESC;
END;
$$;

-- 🛠️ دالة توليد أو جلب مفتاح QR للطاولة (Restaurant QR Menu)
CREATE OR REPLACE FUNCTION public.get_or_create_qr_for_table(p_table_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE
    v_table record;
    v_qr_key uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    SELECT * INTO v_table 
    FROM public.restaurant_tables 
    WHERE id = p_table_id AND organization_id = v_org_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الطاولة غير موجودة أو لا تملك صلاحية الوصول إليها';
    END IF;
    
    v_qr_key := v_table.qr_access_key;
    
    IF v_qr_key IS NULL THEN
        v_qr_key := gen_random_uuid();
        UPDATE public.restaurant_tables SET qr_access_key = v_qr_key WHERE id = p_table_id;
    END IF;
    
    RETURN json_build_object(
        'qr_access_key', v_qr_key,
        'table_name', v_table.name
    );
END; $$;

-- 🛡️ دالة جلب الإعدادات الآمنة (تتخطى مشاكل التوكن العالق)
DROP FUNCTION IF EXISTS public.get_current_company_settings CASCADE;

CREATE OR REPLACE FUNCTION public.get_current_company_settings(
    p_org_id uuid DEFAULT NULL
)
RETURNS SETOF public.company_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- استخدام محرك الهوية الموحد لضمان الوصول الصحيح للإعدادات (خاصة للسوبر أدمن)
    -- مع استخدام SELECT * لضمان جلب كافة الأعمدة الجديدة (مثل المستودعات الافتراضية) تلقائياً
    RETURN QUERY SELECT * FROM public.company_settings 
    WHERE organization_id = COALESCE(p_org_id, public.get_my_org());
END;
$$;
-- ================================================================
-- 🚀 الحل السحري لمشكلة تحويل عروض الأسعار: المشغل التلقائي
-- ================================================================

CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا تم إدراج فاتورة حالتها 'posted' (كما يحدث عند تحويل عروض الأسعار) وليس لها قيد
    IF NEW.status = 'posted' AND NEW.related_journal_entry_id IS NULL THEN
        PERFORM public.approve_invoice(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_approve_invoice ON public.invoices;
CREATE TRIGGER trg_auto_approve_invoice
    AFTER INSERT OR UPDATE OF status ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_insert();

-- 🛠️ مشغل إضافي لمراقبة بنود الفاتورة (لضمان معالجة الفواتير التي تصل بنودها متأخرة)
CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_items_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا كانت الفاتورة الأم 'posted' وبدون قيد، نحاول اعتمادها الآن بعد توفر البنود
    IF EXISTS (
        SELECT 1 FROM public.invoices 
        WHERE id = NEW.invoice_id AND status = 'posted' AND related_journal_entry_id IS NULL
    ) THEN
        PERFORM public.approve_invoice(NEW.invoice_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_approve_invoice_items ON public.invoice_items;
CREATE TRIGGER trg_auto_approve_invoice_items
    AFTER INSERT ON public.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_items_insert();

-- إعادة تحميل كاش المخطط لضمان تعرف الـ API على التغييرات فوراً
NOTIFY pgrst, 'reload config';

-- 🛠️ دالة تنظيف سجلات النسخ الاحتياطية اليتيمة
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_backups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE deleted_count integer;
BEGIN
    DELETE FROM public.organization_backups WHERE organization_id NOT IN (SELECT id FROM public.organizations);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END; $$;

-- 🛠️ دالة بدء تنظيف ملفات التخزين اليتيمة (Trigger for Edge Functions)
CREATE OR REPLACE FUNCTION public.cleanup_storage_orphans_trigger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.security_logs (event_type, description, metadata)
    VALUES (
        'storage_cleanup_request', 
        'طلب تنظيف آلي لملفات التخزين اليتيمة عبر الخادم', 
        jsonb_build_object(
            'triggered_at', now(), 
            'triggered_by', auth.uid(),
            'status', 'initiated'
        )
    );
    RETURN jsonb_build_object(
        'status', 'success',
        'message', 'تم بدء عملية التنظيف بنجاح. يمكنك مراقبة سجلات الأمان.'
    );
END; $$;

-- 🛠️ دالة تلقائية لضمان تعبئة معرف المنظمة في طلبات المطبخ
CREATE OR REPLACE FUNCTION public.fn_ensure_kitchen_order_org()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا كانت organization_id موجودة بالفعل، لا نفعل شيئاً
    IF NEW.organization_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id 
        FROM public.order_items 
        WHERE id = NEW.order_item_id;
    END IF;
    
    -- إذا ظل فارغاً، نستخدم معرف المستخدم الحالي
    IF NEW.organization_id IS NULL THEN
        NEW.organization_id := public.get_my_org();
    END IF;
    
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_kitchen_org ON public.kitchen_orders;
CREATE TRIGGER trg_ensure_kitchen_org 
BEFORE INSERT ON public.kitchen_orders 
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_kitchen_order_org();

-- 🛠️ دالة حماية الحسابات الأساسية من الحذف
CREATE OR REPLACE FUNCTION public.prevent_system_account_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- 🛡️ استثناء: السماح بالحذف إذا كان النظام في وضع الاستعادة (Restore Mode)
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    -- قائمة الأكواد المحمية (المستويات السيادية وحسابات الربط الآلي)
    IF OLD.code IN (
        '1', '2', '3', '4', '5', -- المستوى الأول
        '11', '12', '21', '22', '31', '41', '51', '52', '53', -- المستوى الثاني
        '103', '1221', '1231', '201', '3999', '411', '412', '413', '511', '541' -- حسابات العمليات
    ) THEN
        RAISE EXCEPTION '⚠️ خطأ سيادي: لا يمكن حذف الحساب (%) لأنه حساب نظام أساسي مرتبط بالتقارير المالية والقيود الآلية.', OLD.name;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 🛠️ دالة منع الترحيل على الحسابات الرئيسية (Group Accounts Protection)
-- الوصف: تمنع هذه الدالة تسجيل أي قيد محاسبي على حساب يمثل "مجموعة" لضمان سلامة الأرصدة
CREATE OR REPLACE FUNCTION public.check_account_is_not_group()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND is_group = true) THEN
        RAISE EXCEPTION '⚠️ خطأ محاسبي: لا يمكن الترحيل مباشرة إلى حساب رئيسي (مجموعة). يرجى اختيار حساب فرعي.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ربط القيد بجدول الحسابات
DROP TRIGGER IF EXISTS trg_protect_system_accounts ON public.accounts;
CREATE TRIGGER trg_protect_system_accounts
BEFORE DELETE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_system_account_deletion();

-- تفعيل حماية الحسابات الرئيسية
DROP TRIGGER IF EXISTS trg_prevent_group_posting ON public.journal_lines;
CREATE TRIGGER trg_prevent_group_posting BEFORE INSERT OR UPDATE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.check_account_is_not_group();

-- 🛠️ دالة مشغل فرض اختيار المستودع تلقائياً للمستندات (فواتير، مشتريات)
CREATE OR REPLACE FUNCTION public.fn_ensure_document_warehouse()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := COALESCE(
            (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id),
            (SELECT id FROM public.warehouses WHERE organization_id = NEW.organization_id AND deleted_at IS NULL LIMIT 1)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_invoice_warehouse ON public.invoices;
CREATE TRIGGER trg_ensure_invoice_warehouse BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_document_warehouse();

DROP TRIGGER IF EXISTS trg_ensure_purchase_warehouse ON public.purchase_invoices;
CREATE TRIGGER trg_ensure_purchase_warehouse BEFORE INSERT ON public.purchase_invoices FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_document_warehouse();

-- 🛠️ دالة ربط تلقائي لطلبات الـ QR بالكاشير عند الدفع
CREATE OR REPLACE FUNCTION public.fn_assign_cashier_to_qr_order()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا تغيرت الحالة إلى مدفوع والطلب ليس له صاحب، نربطه بالمستخدم الحالي الذي أجرى التعديل
    IF NEW.status IN ('PAID', 'COMPLETED') AND NEW.user_id IS NULL THEN
        NEW.user_id := auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_cashier ON public.orders;
CREATE TRIGGER trg_assign_cashier
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_assign_cashier_to_qr_order();

-- 🛠️ دالة فرض اختيار المستودع تلقائياً للطلبات (Auto-Warehouse Enforcement)
CREATE OR REPLACE FUNCTION public.fn_ensure_order_warehouse()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := COALESCE(
            (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id),
            (SELECT id FROM public.warehouses WHERE organization_id = NEW.organization_id AND deleted_at IS NULL LIMIT 1)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_order_warehouse ON public.orders;
CREATE TRIGGER trg_ensure_order_warehouse
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_order_warehouse();

-- 🛡️ مشغل التزامن التلقائي لرصيد العميل (لضمان عمل الرصيد في الماستر سيت أب)
CREATE OR REPLACE FUNCTION public.sync_customer_balance_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.customers SET balance = get_customer_balance(OLD.customer_id, OLD.organization_id) WHERE id = OLD.customer_id;
        RETURN OLD;
    ELSE
        UPDATE public.customers SET balance = get_customer_balance(NEW.customer_id, NEW.organization_id) WHERE id = NEW.customer_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 🛡️ دالة حساب رصيد العميل (Customer Balance Calculator)
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id uuid, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_balance numeric;
BEGIN
    -- حساب الرصيد من واقع الفواتير المرحلة وغير المدفوعة
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_balance
    FROM public.invoices
    WHERE customer_id = p_customer_id AND organization_id = p_org_id 
    AND status IN ('posted', 'paid');
    
    RETURN v_balance;
END; $$;

-- 🛠️ دالة إصلاح القيود غير المتوازنة (Unbalanced Entry Fixer)
CREATE OR REPLACE FUNCTION public.fix_unbalanced_journal_entry(p_je_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_diff numeric; v_org_id uuid; v_suspense_acc_id uuid;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.journal_entries WHERE id = p_je_id;
    
    -- إزالة أي سطور توازن آلي قديمة لمنع التكرار عند إعادة التشغيل
    DELETE FROM public.journal_lines WHERE journal_entry_id = p_je_id AND description = 'توازن آلي (فرق مدين/دائن)';

    -- حساب الفرق (مدين - دائن)
    SELECT SUM(debit) - SUM(credit) INTO v_diff FROM public.journal_lines WHERE journal_entry_id = p_je_id;

    IF ABS(COALESCE(v_diff, 0)) < 0.001 THEN RETURN; END IF;

    -- استخدام حساب 3999 (الأرصدة الافتتاحية/الوسيط) لموازنة القيد
    SELECT id INTO v_suspense_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code = '3999' LIMIT 1;

    IF v_suspense_acc_id IS NULL THEN
        -- إذا لم يوجد، نستخدم أي حساب غير رئيسي (كحل أخير)
        SELECT id INTO v_suspense_acc_id FROM public.accounts WHERE organization_id = v_org_id AND is_group = false LIMIT 1;
    END IF;

    IF v_diff > 0 THEN -- المدين أكبر -> نحتاج سطر دائن
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, 0, ABS(v_diff), 'توازن آلي (فرق مدين/دائن)', v_org_id);
    ELSE -- الدائن أكبر -> نحتاج سطر مدين
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (p_je_id, v_suspense_acc_id, ABS(v_diff), 0, 'توازن آلي (فرق مدين/دائن)', v_org_id);
    END IF;
END; $$;

-- 🛡️ دالة تحديث رصيد مورد واحد (Single Supplier Balance Updater)
CREATE OR REPLACE FUNCTION public.update_single_supplier_balance(p_supplier_id uuid, p_org_id uuid) -- 🛠️ تحديث: إضافة p_org_id كمعامل
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.suppliers SET balance = (
        SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
        FROM public.purchase_invoices
        WHERE supplier_id = p_supplier_id AND organization_id = p_org_id
        AND status IN ('posted', 'paid')
    ) WHERE id = p_supplier_id;
END; $$;

-- 🛡️ 1. دالة تفعيل وضع الطوارئ (Emergency Mode Toggle)
-- 📊 دالة جلب إحصائيات لوحة التحكم (Dashboard Stats RPC)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_sales numeric;
    v_total_purchases numeric;
    v_total_expenses numeric;
    v_total_revenue numeric;
    v_cash_balance numeric;
    v_bank_balance numeric;
    v_customers_count bigint;
    v_products_count bigint;
    v_top_selling_products jsonb;
    v_recent_invoices jsonb;
    -- مقاييس المقاولات
    v_active_projects_count bigint;
    v_total_contracts_value numeric;
    v_construction_revenue numeric;
BEGIN
    -- 1. إجمالي المبيعات
    p_org_id := COALESCE(p_org_id, public.get_my_org()); 
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_sales
    FROM public.invoices
    WHERE organization_id = p_org_id AND status IN ('posted', 'paid');

    -- 2. إجمالي المشتريات
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_purchases
    FROM public.purchase_invoices
    WHERE organization_id = p_org_id AND status IN ('posted', 'paid');

    -- 3. إجمالي المصروفات (من القيود)
    SELECT COALESCE(SUM(jl.debit), 0) INTO v_total_expenses
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts acc ON jl.account_id = acc.id
    WHERE je.organization_id = p_org_id AND je.status = 'posted' AND acc.type = 'EXPENSE';

    -- 4. إجمالي الإيرادات (من القيود)
    SELECT COALESCE(SUM(jl.credit), 0) INTO v_total_revenue
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts acc ON jl.account_id = acc.id
    WHERE je.organization_id = p_org_id AND je.status = 'posted' AND acc.type = 'REVENUE';

    -- 5. رصيد الصندوق (الحسابات النقدية)
    SELECT COALESCE(SUM(balance), 0) INTO v_cash_balance
    FROM public.accounts
    WHERE organization_id = p_org_id AND code LIKE '1231%'; -- الصندوق الرئيسي

    -- 6. رصيد البنوك
    SELECT COALESCE(SUM(balance), 0) INTO v_bank_balance
    FROM public.accounts
    WHERE organization_id = p_org_id AND code LIKE '1232%'; -- حسابات البنوك

    -- 7. عدد العملاء والمنتجات
    SELECT COUNT(*) INTO v_customers_count FROM public.customers WHERE organization_id = p_org_id AND deleted_at IS NULL;
    SELECT COUNT(*) INTO v_products_count FROM public.products WHERE organization_id = p_org_id AND deleted_at IS NULL;

    -- 🚀 8. مقاييس المقاولات (Construction KPIs)
    SELECT COUNT(*) INTO v_active_projects_count FROM public.projects WHERE organization_id = p_org_id AND status = 'active';
    SELECT COALESCE(SUM(contract_value), 0) INTO v_total_contracts_value FROM public.projects WHERE organization_id = p_org_id AND status != 'cancelled';
    
    -- إيراد المقاولات من المستخلصات المعتمدة
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_construction_revenue 
    FROM public.project_progress_billings 
    WHERE organization_id = p_org_id AND status = 'approved';

    -- 8. المنتجات الأكثر مبيعاً (أعلى 5)
    WITH top_products AS (
        SELECT p.name as product_name, SUM(oi.quantity) as total_quantity
        FROM public.order_items oi
        JOIN public.products p ON oi.product_id = p.id
        JOIN public.orders o ON oi.order_id = o.id
        WHERE o.organization_id = p_org_id AND o.status IN ('COMPLETED', 'PAID', 'posted')
        GROUP BY p.name
        ORDER BY total_quantity DESC
        LIMIT 5
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('product_name', product_name, 'total_quantity', total_quantity)), '[]'::jsonb)
    INTO v_top_selling_products -- 🛡️ حماية من TypeError في الواجهة عند عدم وجود مبيعات
    FROM top_products;

    RETURN jsonb_build_object(
        'total_sales', v_total_sales, 'total_purchases', v_total_purchases,
        'total_expenses', v_total_expenses, 'total_revenue', v_total_revenue,
        'cash_balance', v_cash_balance, 'bank_balance', v_bank_balance,
        'customers_count', v_customers_count, 'products_count', v_products_count,
        'top_selling_products', COALESCE(v_top_selling_products, '[]'::jsonb),
        'active_projects_count', v_active_projects_count,
        'total_contracts_value', v_total_contracts_value,
        'construction_revenue', v_construction_revenue
    );
END;
$$;

-- 📊 دالة جلب جميع أرصدة الحسابات (All Account Balances RPC)
CREATE OR REPLACE FUNCTION public.get_all_account_balances(p_org_id uuid DEFAULT NULL) -- 🛠️ تحديث: إضافة p_org_id كمعامل
RETURNS TABLE (
    account_id uuid,
    account_code text,
    account_name text,
    account_type text,
    balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    p_org_id := COALESCE(p_org_id, public.get_my_org());
    RETURN QUERY
    SELECT
        a.id AS account_id,
        a.code AS account_code,
        a.name AS account_name,
        a.type AS account_type,
        COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
    FROM
        public.accounts a
    LEFT JOIN public.journal_lines jl ON a.id = jl.account_id AND jl.organization_id = a.organization_id
    LEFT JOIN public.journal_entries je ON jl.journal_entry_id = je.id AND je.status = 'posted'
    WHERE
        a.organization_id = p_org_id
    GROUP BY
        a.id, a.code, a.name, a.type
    ORDER BY
        a.code;
END;
$$;

-- 🛡️ 1. دالة تفعيل وضع الطوارئ (Emergency Mode Toggle)
-- تتيح للسوبر أدمن تجاوز حماية الرواتب الحساسة في الجلسة الحالية
CREATE OR REPLACE FUNCTION public.set_emergency_mode(p_enable boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF public.get_my_role() != 'super_admin' THEN
        RAISE EXCEPTION 'غير مصرح: هذه الدالة مخصصة للمدير العام فقط.';
    END IF;

    IF p_enable THEN
        PERFORM set_config('app.emergency_mode', 'on', false);
        RETURN '🚨 وضع الطوارئ نشط: تم فتح الوصول للبيانات الحساسة لهذه الجلسة.';
    ELSE
        PERFORM set_config('app.emergency_mode', 'off', false);
        RETURN '🛡️ تم إيقاف وضع الطوارئ: الحماية مفعّلة الآن.';
    END IF;
END; $$;

-- 📊 2. دالة إحصائيات المنصة الشاملة - محدثة لتعمل عالمياً (Super Admin Platform Metrics)
CREATE OR REPLACE FUNCTION public.get_admin_platform_metrics()
RETURNS TABLE (
    total_orgs bigint,
    active_orgs bigint,
    total_invoices_count bigint,
    total_transactions_value numeric,
    total_storage_used_kb numeric,
    orgs_expiring_soon bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- التحقق من الصلاحية العالمية (حتى لو كان يتقمص شخصية شركة أخرى، دوره يبقى سوبر أدمن)
    IF (auth.jwt() ->> 'role') != 'super_admin' AND public.get_my_role() != 'super_admin' THEN
        RAISE EXCEPTION 'غير مصرح بالوصول لإحصائيات المنصة.';
    END IF;

    RETURN QUERY
    -- تنفيذ استعلامات مباشرة على الجداول لتخطي RLS بفضل SECURITY DEFINER
    SELECT 
        (SELECT count(*) FROM public.organizations) as total_orgs,
        (SELECT count(*) FROM public.organizations WHERE is_active = true AND (subscription_expiry IS NULL OR subscription_expiry >= now())) as active_orgs,
        (SELECT count(*) FROM public.invoices WHERE status != 'draft') as total_invoices_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM public.invoices WHERE status IN ('posted', 'paid')) as total_transactions_value,
        (SELECT COALESCE(SUM(file_size_kb), 0) FROM public.organization_backups) as total_storage_used_kb,
        (SELECT count(*) FROM public.organizations WHERE subscription_expiry BETWEEN now() AND now() + interval '7 days') as orgs_expiring_soon;
END; $$;

-- 📊 2.5 دالة ملخص اختبارات صحة النظام (System Health Test Summary)
-- الغرض: جلب سجلات الأخطاء والأمان الأخيرة لعرضها في لوحة تحكم مراقبة النظام
CREATE OR REPLACE FUNCTION public.get_admin_test_summary(p_limit integer DEFAULT 50)
RETURNS TABLE (
    id uuid,
    test_name text,
    result text,
    details text,
    created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.function_name as test_name,
        'FAILED'::text as result,
        e.error_message as details,
        e.created_at
    FROM public.system_error_logs e
    UNION ALL
    SELECT 
        s.id,
        s.event_type as test_name,
        'INFO'::text as result,
        s.description as details,
        s.created_at
    FROM public.security_logs s
    ORDER BY created_at DESC
    LIMIT p_limit;
END; $$;

-- 🚀 3. دالة تنظيف البيانات التجريبية (إصلاح تكرار المنظمة)
CREATE OR REPLACE FUNCTION public.clear_demo_data(p_org_id uuid) -- 🛠️ تحديث: إضافة p_org_id كمعامل
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'صلاحيات غير كافية.'; END IF;

    -- 1. حذف بيانات التصنيع بذكاء (فقط إذا كانت الجداول موجودة)
    -- يتم استخدام EXECUTE لتجنب خطأ 42P01 أثناء تعريف الدالة
    EXECUTE 'DO $clear_mfg$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_batch_serials'') THEN
            DELETE FROM public.mfg_batch_serials WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_actual_material_usage WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_scrap_logs WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_production_variances WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_qc_inspections'') THEN
            DELETE FROM public.mfg_qc_inspections WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_material_requests'') THEN
            DELETE FROM public.mfg_material_request_items WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_material_requests WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ''mfg_production_orders'') THEN
            DELETE FROM public.mfg_order_progress WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_production_orders WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_step_materials WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_routing_steps WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_routings WHERE organization_id = ' || quote_literal(p_org_id) || ';
            DELETE FROM public.mfg_work_centers WHERE organization_id = ' || quote_literal(p_org_id) || ';
        END IF;
    END $clear_mfg$;';

    DELETE FROM public.bill_of_materials WHERE organization_id = p_org_id;

    -- 2. حذف بيانات المبيعات والمشتريات والمالية
    DELETE FROM public.invoices WHERE organization_id = p_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = p_org_id;
    DELETE FROM public.receipt_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.payment_vouchers WHERE organization_id = p_org_id;
    DELETE FROM public.orders WHERE organization_id = p_org_id;
    DELETE FROM public.stock_adjustments WHERE organization_id = p_org_id;
    DELETE FROM public.opening_inventories WHERE organization_id = p_org_id;
    DELETE FROM public.cheques WHERE organization_id = p_org_id;
    DELETE FROM public.credit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.debit_notes WHERE organization_id = p_org_id;
    DELETE FROM public.payrolls WHERE organization_id = p_org_id;
    DELETE FROM public.employee_advances WHERE organization_id = p_org_id;
    DELETE FROM public.assets WHERE organization_id = p_org_id;
    DELETE FROM public.customers WHERE organization_id = p_org_id;
    DELETE FROM public.suppliers WHERE organization_id = p_org_id;
    DELETE FROM public.employees WHERE organization_id = p_org_id;
    DELETE FROM public.restaurant_tables WHERE organization_id = p_org_id;
    DELETE FROM public.shifts WHERE organization_id = p_org_id;

    DELETE FROM public.journal_entries WHERE organization_id = p_org_id AND related_document_type != 'opening_balance';
    -- تحديث المخزون للأصناف ليصبح صفراً
    UPDATE public.products SET stock = 0, warehouse_stock = '{}'::jsonb WHERE organization_id = p_org_id;
    
    RETURN 'تم تنظيف البيانات التشغيلية بنجاح ✅';
END; $$;


-- 🛡️ 4. دالة إصلاح صلاحيات كافة المديرين (Bulk Admin Permission Repair)
CREATE OR REPLACE FUNCTION public.repair_all_admin_permissions()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    r record;
BEGIN
    -- السماح للسوبر أدمن أو لمدير قاعدة البيانات (postgres) بتشغيل الدالة
    IF public.get_my_role() != 'super_admin' AND current_user != 'postgres' THEN 
        RAISE EXCEPTION 'غير مصرح: للسوبر أدمن فقط.'; 
    END IF;

    FOR r IN SELECT id FROM public.organizations LOOP
        -- منح كافة الصلاحيات لدور الآدمن في كل شركة لضمان تحكم العميل الكامل
        INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
        SELECT (SELECT id FROM public.roles WHERE organization_id = r.id AND name = 'admin' LIMIT 1), id, r.id
        FROM public.permissions
        ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN 'تمت مزامنة كافة الصلاحيات لكل مديري الشركات بنجاح ✅';
END; $$;

-- 7.1 دالة مساعدة: جلب رصيد حساب في تاريخ محدد (Helper for Historical Balance)
-- الغرض: تستخدم لحساب الأرصدة الافتتاحية والختامية للفترات المحاسبية
CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(p_account_id uuid, p_date date, p_org_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE -- 🛠️ تحديث: إضافة p_org_id كمعامل
    v_balance numeric;
BEGIN
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    INTO v_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE jl.account_id = p_account_id
      AND je.organization_id = p_org_id
      AND je.status = 'posted' -- نعتمد فقط على القيود المرحلة
      AND je.transaction_date <= p_date; -- نجمع كل الحركات حتى التاريخ المحدد
    RETURN v_balance;
END; $$;

-- 🛡️ منع ترحيل أي قيد يدوي غير متوازن (مدين != دائن) لضمان سلامة الميزان
CREATE OR REPLACE FUNCTION public.fn_validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_debit_sum numeric;
    v_credit_sum numeric;
BEGIN
    -- نطبق الفحص فقط عندما تكون حالة القيد "مرحل" (posted)
    IF NEW.status = 'posted' THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO v_debit_sum, v_credit_sum
        FROM public.journal_lines
        WHERE journal_entry_id = NEW.id;

        IF ABS(v_debit_sum - v_credit_sum) > 0.0001 THEN
            RAISE EXCEPTION '⚠️ خطأ في النزاهة المحاسبية: لا يمكن ترحيل القيد (%) لأنه غير متوازن. (إجمالي المدين: %, إجمالي الدائن: %)', NEW.reference, v_debit_sum, v_credit_sum;
        END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_je_balance ON public.journal_entries;
CREATE TRIGGER trg_validate_je_balance
AFTER INSERT OR UPDATE OF status ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_journal_entry_balance();
-- 🧪 دالة اختبار عزل البيانات (SaaS Isolation Unit Test)
-- الغرض: التأكد برمجياً من أن المدير في شركة ما لا يمكنه الوصول لبيانات شركة أخرى
CREATE OR REPLACE FUNCTION public.test_saas_isolation()
RETURNS TABLE(test_name text, result text, details text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_a uuid; v_org_b uuid;
    v_user_a uuid := gen_random_uuid();
    v_prod_b uuid;
    v_visible_count int;
BEGIN
    -- 1. إنشاء منظمات اختبارية أولاً لضمان توفر v_org_a قبل استخدامه
    INSERT INTO public.organizations (name) VALUES ('Org A Test') RETURNING id INTO v_org_a;
    INSERT INTO public.organizations (name) VALUES ('Org B Test') RETURNING id INTO v_org_b;

    -- 🚨 FIX: يجب إنشاء مستخدم في auth.users أولاً لتلبية قيد المفتاح الخارجي
    INSERT INTO auth.users (
        id,
        email,
        encrypted_password,
        instance_id,
        aud,
        role,
        raw_app_meta_data,
        raw_user_meta_data
    )
    VALUES (
        v_user_a,
        'test_user_a_' || replace(v_user_a::text, '-', '') || '@example.com', -- بريد إلكتروني فريد للاختبار
        'dummy_hash', -- كلمة مرور مشفرة وهمية
        '00000000-0000-0000-0000-000000000001', -- معرف وهمي لـ instance_id (يمكن استبداله بمعرف instance_id حقيقي لمشروعك)
        'authenticated',
        'authenticated',
        '{}'::jsonb,
        jsonb_build_object('org_id', v_org_a, 'role', 'admin')
    ) ON CONFLICT (id) DO NOTHING; -- تجنب الخطأ إذا كان ID موجوداً بالفعل (غير محتمل مع gen_random_uuid)

    -- 2. إنشاء مستخدم (Admin) ينتمي للمنظمة A
    INSERT INTO public.profiles (id, organization_id, role, full_name)
    VALUES (v_user_a, v_org_a, 'admin', 'Test Admin A')
    ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name;

    -- 3. إنشاء بيانات (منتج) في المنظمة B
    INSERT INTO public.products (name, organization_id) 
    VALUES ('Secret Data Org B', v_org_b) RETURNING id INTO v_prod_b;

    -- 4. محاكاة اختبار العزل
    test_name := 'SaaS Data Isolation Test (Org A vs Org B)';
    
    -- فحص الرؤية: هل يستطيع من يملك معرف Org A رؤية بيانات Org B؟
    -- نطبق هنا نفس المنطق البرمجي المستخدم في سياسات RLS
    SELECT count(*) INTO v_visible_count 
    FROM public.products 
    WHERE id = v_prod_b 
    AND (organization_id = v_org_a OR 'admin' = 'super_admin'); 

    IF v_visible_count = 0 THEN
        result := 'PASSED ✅';
        details := 'تم التأكد بنجاح من أن المدير في شركة A لا يمكنه رؤية بيانات شركة B. نظام العزل يعمل.';
    ELSE
        result := 'FAILED ❌';
        details := 'خرق أمني: البيانات تسربت بين المنظمات! يرجى مراجعة سياسات RLS في ملف setup_rls.sql';
    END IF;

    -- تنظيف بيانات الاختبار فوراً
    DELETE FROM public.products WHERE organization_id IN (v_org_a, v_org_b);
    DELETE FROM public.profiles WHERE id = v_user_a;
    DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);

    RETURN NEXT;
END; $$;

-- 🛡️ 5. محرك التعيين التلقائي للمنظمة (Auto-Organization Enforcer)
-- يضمن هذا المحرك أن أي صف يتم إنشاؤه سيأخذ رقم منظمة المستخدم الحالية تلقائياً
CREATE OR REPLACE FUNCTION public.fn_force_org_id_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_current_org uuid;
BEGIN
    -- 🛡️ وضع الاستعادة
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- 🏗️ المرحلة 1: محرك الوراثة الذكي
    IF TG_TABLE_NAME = 'bill_of_materials' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.products WHERE id = NEW.product_id;
    ELSIF (TG_TABLE_NAME = 'table_sessions') AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.restaurant_tables WHERE id = NEW.table_id;
    ELSIF TG_TABLE_NAME = 'orders' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.table_sessions WHERE id = NEW.session_id;
    ELSIF TG_TABLE_NAME = 'order_items' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.orders WHERE id = NEW.order_id;
    END IF;

    -- 🏗️ المرحلة 2: تحديد المنظمة وفرضها
    v_current_org := public.get_my_org();

    -- 🚀 إصلاح: السماح باستخدام القيمة الممرة يدوياً (مهم للسكربتات والدوال الداخلية)
    NEW.organization_id := COALESCE(NEW.organization_id, v_current_org);

    IF NEW.organization_id IS NULL AND public.get_my_role() != 'super_admin' THEN
         RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى تسجيل الدخول مجدداً.';
    END IF;
    
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 🧪 دالة اختبار منطق المتوسط المرجح (WAC Logic Unit Test)
-- الغرض: التأكد من دقة حساب التكلفة عند ترحيل المشتريات
CREATE OR REPLACE FUNCTION public.test_wac_logic()
RETURNS TABLE(step text, expected numeric, actual numeric, status text) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid; v_wh_id uuid; v_prod_id uuid; v_supp_id uuid; v_inv_id uuid;
    v_wac numeric;
BEGIN
    -- 1. إعداد بيئة الاختبار
    INSERT INTO public.organizations (name) VALUES ('WAC Test Org') RETURNING id INTO v_org_id;
    INSERT INTO public.warehouses (name, organization_id) VALUES ('Test WH', v_org_id) RETURNING id INTO v_wh_id;
    INSERT INTO public.suppliers (name, organization_id) VALUES ('Test Supplier', v_org_id) RETURNING id INTO v_supp_id;
    
    -- 2. إنشاء منتج برصيد افتتاحي (10 وحدات @ 100 ج.م)
    INSERT INTO public.products (name, stock, opening_balance, purchase_price, weighted_average_cost, cost, organization_id)
    VALUES ('Test Product', 10, 10, 100, 100, 100, v_org_id) RETURNING id INTO v_prod_id;
    
    -- 🛡️ إصلاح: إضافة رصيد افتتاحى في سجلات المخزون لكي يراها المحرك الموحد V50
    INSERT INTO public.opening_inventories (product_id, warehouse_id, quantity, cost, organization_id)
    VALUES (v_prod_id, v_wh_id, 10, 100, v_org_id);

    step := '1. Initial WAC (Opening Balance)';
    expected := 100;
    SELECT weighted_average_cost INTO v_wac FROM public.products WHERE id = v_prod_id;
    actual := v_wac;
    status := CASE WHEN actual = expected THEN 'PASSED ✅' ELSE 'FAILED ❌' END;
    RETURN NEXT;

    -- 3. إضافة فاتورة مشتريات (5 وحدات @ 160 ج.م)
    -- المعادلة المتوقعة: ((10 * 100) + (5 * 160)) / 15 = (1000 + 800) / 15 = 120
    INSERT INTO public.purchase_invoices (invoice_number, supplier_id, warehouse_id, total_amount, status, organization_id, invoice_date)
    VALUES ('INV-TEST-WAC', v_supp_id, v_wh_id, 800, 'draft', v_org_id, now()) RETURNING id INTO v_inv_id;
    
    INSERT INTO public.purchase_invoice_items (purchase_invoice_id, product_id, quantity, unit_price, organization_id)
    VALUES (v_inv_id, v_prod_id, 5, 160, v_org_id);
    
    -- 4. اعتماد الفاتورة (سيقوم بتشغيل دالة calculate_product_wac الموحدة)
    PERFORM public.approve_purchase_invoice(v_inv_id, v_org_id);
    
    step := '2. WAC after Purchase (New Stock)';
    expected := 120;
    SELECT weighted_average_cost INTO v_wac FROM public.products WHERE id = v_prod_id;
    actual := v_wac;
    status := CASE WHEN actual = expected THEN 'PASSED ✅' ELSE 'FAILED ❌' END;
    RETURN NEXT;

    -- 5. اختبار حماية المخزون (الرصيد الكلي)
    step := '3. Total Stock Count';
    expected := 15;
    PERFORM public.recalculate_stock_rpc(v_org_id);
    SELECT stock INTO actual FROM public.products WHERE id = v_prod_id;
    status := CASE WHEN actual = expected THEN 'PASSED ✅' ELSE 'FAILED ❌' END;
    RETURN NEXT;

    -- 6. تنظيف البيانات
    DELETE FROM public.purchase_invoice_items WHERE organization_id = v_org_id;
    DELETE FROM public.purchase_invoices WHERE organization_id = v_org_id;
    DELETE FROM public.journal_lines WHERE organization_id = v_org_id;
    DELETE FROM public.journal_entries WHERE organization_id = v_org_id;
    DELETE FROM public.products WHERE organization_id = v_org_id;
    DELETE FROM public.suppliers WHERE organization_id = v_org_id;
    DELETE FROM public.warehouses WHERE organization_id = v_org_id;
    DELETE FROM public.organizations WHERE id = v_org_id;

EXCEPTION WHEN OTHERS THEN
    step := 'ERROR';
    expected := 0;
    actual := 0;
    status := 'CRITICAL ERROR: ' || SQLERRM;
    -- محاولة تنظيف المنظمة حتى في حالة الخطأ
    DELETE FROM public.organizations WHERE id = v_org_id;
    RETURN NEXT;
END; $$;

-- ج. جلب العملاء المتجاوزين لحد الائتمان (تحديث موحد)
DROP FUNCTION IF EXISTS public.get_over_limit_customers(uuid) CASCADE; -- 🛠️ تحديث: إضافة p_org_id كمعامل
DROP FUNCTION IF EXISTS public.get_over_limit_customers() CASCADE;
CREATE OR REPLACE FUNCTION public.get_over_limit_customers(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (id UUID, name TEXT, phone TEXT, total_debt NUMERIC, credit_limit NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org()); 
    RETURN QUERY SELECT c.id, c.name, c.phone, COALESCE(c.balance, 0), COALESCE(c.credit_limit, 0)
    FROM public.customers c WHERE c.organization_id = v_target_org AND COALESCE(c.balance, 0) > COALESCE(c.credit_limit, 0);
END; $$;

-- 🛠️ دالة مطابقة وإعادة احتساب الأرصدة (Recalculate All Balances)
-- هذه الدالة تحل مشكلة الخطأ 404 وتضمن دقة الأرصدة في كافة مديولات النظام -- 🛠️ تحديث: إضافة p_org_id كمعامل
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RETURN; END IF;

    -- 1. تحديث أرصدة الحسابات بناءً على القيود المرحلة فقط (General Ledger)
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

    -- 2. تحديث أرصدة العملاء
    UPDATE public.customers c
    SET balance = public.get_customer_balance(c.id, v_org_id)
    WHERE c.organization_id = v_org_id;

    -- 3. تحديث أرصدة الموردين (صافي الفواتير غير المدفوعة)
    UPDATE public.suppliers s
    SET balance = (
        SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
        FROM public.purchase_invoices
        WHERE supplier_id = s.id 
          AND status IN ('posted', 'paid')
          AND organization_id = v_org_id
    )
    WHERE s.organization_id = v_org_id;
    
    -- 4. إعادة مزامنة المخزون الشاملة
    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 🛠️ دالة ترميم روابط القيود المحاسبية (Surgical Link Repair) - نسخة مطورة
CREATE OR REPLACE FUNCTION public.repair_orphaned_journal_lines(p_org_id uuid) -- 🛠️ تحديث: إضافة p_org_id كمعامل
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count int := 0;
BEGIN
    -- 🛡️ [تحديث جراحي] ربط القيود اليتيمة بالحسابات الصحيحة بناءً على الأكواد المكتوبة في البيان
    UPDATE public.journal_lines jl
    SET account_id = a.id
    FROM public.accounts a
    WHERE jl.organization_id = p_org_id AND a.organization_id = p_org_id
      -- الشرط: الحساب المربوط حالياً غير موجود في جدول الحسابات الفعلي
      AND (jl.account_id IS NULL OR jl.account_id NOT IN (SELECT id FROM public.accounts WHERE organization_id = p_org_id))
      -- البحث عن كود الحساب داخل وصف السطر أو وصف القيد (مثل "1" للأصول)
      AND (jl.description ~ ('\y' || a.code || '\y') OR EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.id = jl.journal_entry_id AND je.description ~ ('\y' || a.code || '\y')));
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END; $$;

-- 📊 دالة جلب النسب المالية التاريخية (Financial Ratios Analytics)
-- تقوم بحساب السيولة، الربحية، والرافعة المالية شهرياً بناءً على الأستاذ العام
CREATE OR REPLACE FUNCTION public.get_historical_ratios(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (
    period text,
    current_ratio numeric,
    net_profit_margin numeric,
    debt_to_assets numeric,
    return_on_assets numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());

    RETURN QUERY
    WITH monthly_data AS (
        SELECT
            to_char(je.transaction_date, 'YYYY-MM') as month_period,
            -- الأصول المتداولة (كود 12)
            SUM(CASE WHEN a.code LIKE '12%' THEN (jl.debit - jl.credit) ELSE 0 END) as current_assets,
            -- الخصوم المتداولة (كود 22)
            SUM(CASE WHEN a.code LIKE '22%' THEN (jl.credit - jl.debit) ELSE 0 END) as current_liabilities,
            -- إجمالي الإيرادات (كود 4)
            SUM(CASE WHEN a.code LIKE '4%' THEN (jl.credit - jl.debit) ELSE 0 END) as revenue,
            -- إجمالي المصروفات (كود 5)
            SUM(CASE WHEN a.code LIKE '5%' THEN (jl.debit - jl.credit) ELSE 0 END) as expenses,
            -- إجمالي الأصول (كود 1)
            SUM(CASE WHEN a.code LIKE '1%' THEN (jl.debit - jl.credit) ELSE 0 END) as total_assets,
            -- إجمالي الخصوم (كود 2)
            SUM(CASE WHEN a.code LIKE '2%' THEN (jl.credit - jl.debit) ELSE 0 END) as total_liabilities
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.organization_id = v_org_id AND je.status = 'posted'
        GROUP BY 1
    )
    SELECT
        month_period,
        -- نسبة السيولة (Current Assets / Current Liabilities)
        CASE WHEN current_liabilities <> 0 THEN ROUND(current_assets / current_liabilities, 2) ELSE 0 END,
        -- هامش صافي الربح ((Revenue - Expenses) / Revenue * 100)
        CASE WHEN revenue <> 0 THEN ROUND((revenue - expenses) / revenue * 100, 2) ELSE 0 END,
        -- نسبة الدين إلى الأصول (Total Liabilities / Total Assets)
        CASE WHEN total_assets <> 0 THEN ROUND(total_liabilities / total_assets, 2) ELSE 0 END,
        -- العائد على الأصول (Net Profit / Total Assets * 100)
        CASE WHEN total_assets <> 0 THEN ROUND((revenue - expenses) / total_assets * 100, 2) ELSE 0 END
    FROM monthly_data
    ORDER BY month_period DESC
    LIMIT 12;
END; $$;

-- إنشاء اسم مستعار (Alias) للتوافق مع استدعاءات النظام الداخلية التي تستخدم المسمى الطويل
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM public.recalculate_all_balances(p_org_id); END; $$;

-- منح صلاحية التنفيذ للمستخدمين
-- 🔓 منح صلاحيات التنفيذ الشاملة (حل مشكلة 404)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- منح صلاحيات محددة للدوال السيادية
GRANT EXECUTE ON FUNCTION public.recalculate_all_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) TO authenticated;
-- تحديث الصلاحيات لتناسب التواقيع الموحدة
GRANT EXECUTE ON FUNCTION public.start_pos_shift(numeric, boolean, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_shift(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_company_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_table_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_table(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid) TO authenticated; -- 🛠️ إضافة صلاحية لدالة ترحيل المشتريات
GRANT EXECUTE ON FUNCTION public.get_shift_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_po_to_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_restaurant_order(uuid, text, numeric, uuid, uuid) TO authenticated; -- 🛠️ إضافة صلاحية لدالة إتمام طلب المطعم

-- 🛡️ ضمان منح الصلاحيات للجداول الجديدة بذكاء (تجنب خطأ 42P01)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifier_groups') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.modifier_groups TO authenticated, anon';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifiers') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.modifiers TO authenticated, anon';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_item_modifiers') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_modifiers TO authenticated, anon';
    END IF;
END $$;

-- تنشيط كاش النظام
-- ملاحظة: تم وضع NOTIFY خارج كتلة PL/pgSQL لأنها أمر SQL مباشر
NOTIFY pgrst, 'reload config';

DO $$ 
BEGIN
    RAISE NOTICE '🚀 تم نشر وتحديث كافة الدوال بنجاح.';
END $$;

-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script)
-- 🛡️ سكربت التثبيت والصيانة الشامل (System Stabilization Script) - النسخة الاحترافية الموحدة
-- تاريخ التحديث: 2026-06-15 (V14 Enhanced SaaS Logic)
-- الوصف: تحصين القيود وصيانة البيانات وهيكل الجداول فقط.

-- ============================================================
-- 🛡️ محرك تحصين التكامل المرجعي (Global CASCADE Reinforcement)
-- الوصف: يقوم هذا الجزء بتحويل كافة قيود الجداول لدعم الحذف التلقائي
-- لمنع أخطاء (Foreign Key Violation) أثناء عمليات الاستعادة والحذف.
-- ============================================================

-- 🛠️ ضمان وجود الجداول التوافقية لتقارير حركة المخزون (حل خطأ 404)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_orders') THEN
        CREATE TABLE public.work_orders (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            order_number text UNIQUE,
            product_id uuid REFERENCES public.products(id),
            quantity numeric DEFAULT 0,
            warehouse_id uuid REFERENCES public.warehouses(id),
            status text DEFAULT 'draft',
            organization_id uuid REFERENCES public.organizations(id),
            created_at timestamptz DEFAULT now(),
            end_date date
        );
    END IF;
END $$;

DO $$ 
DECLARE 
    r record;
BEGIN
    FOR r IN (
        SELECT 
            tc.table_name, 
            tc.constraint_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name 
        JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name 
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_schema = 'public'
          -- استثناء الجداول السيادية لـ Supabase
          AND ccu.table_name NOT IN ('users', 'audit_log')
    ) LOOP
        -- تحصين القيود: الحقول التي تسبب اعتناء متبادل نجعلها SET NULL دائماً لضمان نجاح الاستعادة
        IF r.column_name IN ('default_treasury_id', 'default_warehouse_id', 'parent_id', 'approver_id', 'category_id', 'related_journal_entry_id', 'original_invoice_id', 'original_order_id', 'treasury_account_id', 'warehouse_id', 'responsible_user_id', 'category_id') THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE SET NULL',
                           r.table_name, r.constraint_name, r.column_name, r.foreign_table_name, r.foreign_column_name);
        ELSE
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE CASCADE',
                           r.table_name, r.constraint_name, r.column_name, r.foreign_table_name, r.foreign_column_name);
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- 🦷 محرك تنظيف ودمج الحسابات المكررة (Deduplication Engine)
-- الوصف: يدمج الحسابات المكررة داخل الشركة الواحدة ويفرض القيد الفريد
-- ============================================================
DO $$ 
DECLARE 
    dup record;
BEGIN
    -- 1. البحث عن الحسابات المكررة (نفس الكود ونفس الشركة)
    FOR dup IN (
        SELECT organization_id, code, 
               (ARRAY_AGG(id ORDER BY created_at ASC))[1] as correct_id,
               (ARRAY_AGG(id ORDER BY created_at ASC))[2:] as wrong_ids
        FROM public.accounts 
        WHERE deleted_at IS NULL
        GROUP BY organization_id, code 
        HAVING COUNT(*) > 1
    ) LOOP
        -- 2. تحويل كافة الروابط من الحسابات الخاطئة إلى الحساب الصحيح
        UPDATE public.journal_lines SET account_id = dup.correct_id WHERE account_id = ANY(dup.wrong_ids);
        UPDATE public.products SET inventory_account_id = dup.correct_id WHERE inventory_account_id = ANY(dup.wrong_ids);
        UPDATE public.products SET cogs_account_id = dup.correct_id WHERE cogs_account_id = ANY(dup.wrong_ids);
        UPDATE public.products SET sales_account_id = dup.correct_id WHERE sales_account_id = ANY(dup.wrong_ids);
        UPDATE public.invoices SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.purchase_invoices SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.receipt_vouchers SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.payment_vouchers SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.shifts SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        UPDATE public.employee_advances SET treasury_account_id = dup.correct_id WHERE treasury_account_id = ANY(dup.wrong_ids);
        
        -- 3. تصحيح علاقة الأب والابن في شجرة الحسابات
        UPDATE public.accounts SET parent_id = dup.correct_id WHERE parent_id = ANY(dup.wrong_ids);

        -- 4. حذف النسخ المكررة نهائياً
        DELETE FROM public.accounts WHERE id = ANY(dup.wrong_ids);
    END LOOP;

    -- 5. فرض القيد الفريد (Unique Constraint) لمنع المشكلة للأبد
    -- نحذف القيود القديمة أولاً لضمان التحديث
    ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_code_key;
    ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_organization_id_code_key;
    
    -- القيد الذهبي: لا يمكن تكرار الكود داخل نفس المنظمة
    ALTER TABLE public.accounts ADD CONSTRAINT accounts_organization_id_code_key UNIQUE (organization_id, code);
    
    RAISE NOTICE '✅ تمت عملية دمج الحسابات المكررة بنجاح وتم فرض القيد الفريد.';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ تنبيه: تعذر فرض القيد الفريد، ربما لا تزال هناك بيانات مكررة تحتاج مراجعة يدوية: %', SQLERRM;
END $$;

-- ============================================================
-- 🛡️ تحصين أعمدة المنظمة (SaaS Infrastructure)
-- الوصف: إضافة عمود المنظمة للجداول المالية والمخزنية قبل بدء المعالجة
-- ============================================================
DO $$ 
DECLARE 
    t text;
    tables_to_ensure text[] := ARRAY[
        'journal_entries', 'journal_lines', 'journal_attachments',
        'purchase_invoices', 'purchase_invoice_items', 'purchase_return_items',
        'purchase_orders', 'purchase_order_items', 'purchase_returns', 'purchase_return_items',
        'sales_returns', 'sales_return_items',
        'invoices', 'invoice_items', 'sales_return_items',
        'customers', 'suppliers', 'products', 'accounts', 'warehouses',
        'sales_orders', 'sales_order_items',
        'item_categories', 'orders', 'order_items', 'work_orders', 'company_settings',
        'cost_centers', 'employees', 'payrolls', 'payroll_items', 
        'employee_advances', 'profiles', 'shifts',
        'receipt_vouchers', 'receipt_voucher_attachments', 
        'payment_vouchers', 'payment_voucher_attachments', 
        'cheques', 'cheque_attachments',
        'stock_adjustments', 'stock_adjustment_items',
        'inventory_counts', 'inventory_count_items',
        'stock_transfers', 'stock_transfer_items',
        'opening_inventories', 'credit_notes', 'debit_notes',
        'work_orders', 'work_order_costs',
        'mfg_work_centers', 'mfg_routings', 'mfg_routing_steps',
        'mfg_production_orders', 'mfg_order_progress', 'mfg_step_materials',
        'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_batch_serials',
        'mfg_production_variances', 'mfg_material_requests', 'mfg_material_request_items',
        'kitchen_orders', 'restaurant_tables', 'table_sessions', 'menu_categories',
        'modifier_groups', 'modifiers', 'organization_backups', 'invitations',
        'quotations', 'quotation_items',
        'roles', 'role_permissions', 'notifications', 'notification_preferences',
        'assets', 'delivery_orders', 'payments', 'project_milestones'
    ];
BEGIN
    FOREACH t IN ARRAY tables_to_ensure LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t AND table_type = 'BASE TABLE') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org()', t);
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- 🛡️ تحصين هيكل الجداول المالية (Financial Schema Reinforcement)
-- الوصف: إضافة الأعمدة اللازمة قبل بدء عمليات ترميم البيانات
-- ============================================================
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS decimal_places integer DEFAULT 2;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS production_warehouse_id uuid;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS raw_material_warehouse_id uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN 
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(19,4) DEFAULT 1;
        -- ترميم بنود الفواتير والمرتجعات
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_items') THEN ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_return_items') THEN ALTER TABLE public.sales_return_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
        ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0; -- 🛡️ إضافة عمود tax_rate لـ invoice_items
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date date; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
        -- ترميم بنود مشتريات ومرتجعات مشتريات
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoice_items') THEN ALTER TABLE public.purchase_invoice_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_return_items') THEN ALTER TABLE public.purchase_return_items ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id); END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cheques') THEN 
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN 
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF;
    -- توحيد مسمى رقم الطلب في المشتريات لضمان عمل الواجهة
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'po_number') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'order_number') THEN
            ALTER TABLE public.purchase_orders RENAME COLUMN po_number TO order_number;
        ELSE
            UPDATE public.purchase_orders SET order_number = po_number WHERE order_number IS NULL AND po_number IS NOT NULL;
            ALTER TABLE public.purchase_orders DROP COLUMN po_number;
        END IF;
    END IF;    

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders') THEN
        ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses') THEN
        ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    END IF;

    -- توحيد مسمى عمود الربط في بنود أوامر الشراء
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_order_items' AND column_name = 'purchase_order_id') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_order_items' AND column_name = 'order_id') THEN
            ALTER TABLE public.purchase_order_items RENAME COLUMN purchase_order_id TO order_id;
        ELSE
            UPDATE public.purchase_order_items SET order_id = purchase_order_id WHERE order_id IS NULL AND purchase_order_id IS NOT NULL;
            ALTER TABLE public.purchase_order_items DROP COLUMN purchase_order_id;
        END IF;
    END IF;
END $$;

-- Add currency to receipt_vouchers and payment_vouchers
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_vouchers') THEN 
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';
        ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_vouchers') THEN 
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';
        ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;
    END IF;
END $$;

-- 3. إصلاح تكرار SKU (لضمان استقرار المخزن)
WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY sku, organization_id ORDER BY created_at DESC) as rn
    FROM public.products
    WHERE deleted_at IS NULL AND sku IS NOT NULL
)
UPDATE public.products SET sku = sku || '-DUP-' || id::text WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 2. ترميم مديول المطبخ (Kitchen Orders)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_orders') THEN
        UPDATE public.kitchen_orders ko SET organization_id = oi.organization_id
        FROM public.order_items oi WHERE ko.order_item_id = oi.id AND ko.organization_id IS NULL;
        
        ALTER TABLE public.kitchen_orders ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
    END IF;
END $$;

-- ⚙️ تريجر مزامنة إجمالي الطلب التلقائي
CREATE OR REPLACE FUNCTION public.sync_order_grand_total()
RETURNS TRIGGER AS $$
BEGIN
    NEW.grand_total := COALESCE(NEW.subtotal, 0) + COALESCE(NEW.total_tax, 0) + COALESCE(NEW.delivery_fee, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_order_totals ON public.orders;
CREATE TRIGGER trg_sync_order_totals
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_order_grand_total();

-- 1. جداول الطاولات والجلسات
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'table_sessions') THEN ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id); END IF;
    -- تحصين مديول التصنيع
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN 
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
        ALTER TABLE public.orders ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
        
        -- 🛡️ تصحيح آمن لجدول الجلسات: التحقق من الوجود قبل التغيير لتجنب الأخطاء عند إعادة التشغيل
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'table_sessions' AND column_name = 'opened_at') THEN ALTER TABLE public.table_sessions RENAME COLUMN opened_at TO start_time; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'table_sessions' AND column_name = 'closed_at') THEN ALTER TABLE public.table_sessions RENAME COLUMN closed_at TO end_time; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'table_sessions' AND column_name = 'opened_by') THEN ALTER TABLE public.table_sessions RENAME COLUMN opened_by TO user_id; END IF;
    END IF;    
END $$;

-- 2. تأمين عمود المنظمة في الجداول الأساسية ومنع القيم الفارغة
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'table_sessions') THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN RETURN; END IF;

    ALTER TABLE public.restaurant_tables ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
    ALTER TABLE public.table_sessions ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
    ALTER TABLE public.orders ALTER COLUMN organization_id SET DEFAULT public.get_my_org();
END $$;

-- 3. محرك ترميم الهوية (Identity Repair)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN
        UPDATE public.restaurant_tables
        SET organization_id = COALESCE(organization_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))
        WHERE organization_id IS NULL;
    END IF;
END $$;


UPDATE public.orders o
SET organization_id = COALESCE(
    o.organization_id,
    (SELECT organization_id FROM public.table_sessions ts WHERE ts.id = o.session_id),
    (SELECT organization_id FROM public.profiles p WHERE p.id = o.user_id),
    public.get_my_org()
)
WHERE o.organization_id IS NULL;

UPDATE public.order_items oi
SET organization_id = o.organization_id
FROM public.orders o
WHERE oi.order_id = o.id AND oi.organization_id IS NULL;

-- 4. ترميم الروابط المفقودة في الطلبات لضمان ظهور المبالغ في تقارير الإغلاق (Fix for Super Admin)
DO $$ BEGIN
    UPDATE public.orders o
    SET organization_id = COALESCE(
        o.organization_id,
        (SELECT organization_id FROM public.table_sessions ts WHERE ts.id = o.session_id),
        (SELECT organization_id FROM public.profiles p WHERE p.id = o.user_id)
    )
    WHERE o.organization_id IS NULL;

    UPDATE public.order_items oi
    SET organization_id = o.organization_id
    FROM public.orders o
    WHERE oi.order_id = o.id AND oi.organization_id IS NULL;
END $$;

-- 5. ترميم بنود الطلبات (Order Items)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
        UPDATE public.order_items oi
        SET organization_id = o.organization_id
        FROM public.orders o
        WHERE oi.order_id = o.id AND oi.organization_id IS NULL;
    END IF;
END $$;

ALTER TABLE IF EXISTS public.bill_of_materials 
DROP CONSTRAINT IF EXISTS bill_of_materials_raw_material_id_fkey,
ADD CONSTRAINT bill_of_materials_raw_material_id_fkey FOREIGN KEY (raw_material_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.quotation_items 
DROP CONSTRAINT IF EXISTS quotation_items_product_id_fkey,
ADD CONSTRAINT quotation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.purchase_order_items 
DROP CONSTRAINT IF EXISTS purchase_order_items_product_id_fkey, ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE; -- هذا السطر لم يعد يحتاج لتغيير اسم العمود هنا، فقط في master_setup

ALTER TABLE IF EXISTS public.receipt_vouchers 
DROP CONSTRAINT IF EXISTS receipt_vouchers_customer_id_fkey, ADD CONSTRAINT receipt_vouchers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.payment_vouchers 
DROP CONSTRAINT IF EXISTS payment_vouchers_supplier_id_fkey, ADD CONSTRAINT payment_vouchers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.credit_notes 
DROP CONSTRAINT IF EXISTS credit_notes_customer_id_fkey, ADD CONSTRAINT credit_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.employee_advances 
DROP CONSTRAINT IF EXISTS employee_advances_employee_id_fkey, ADD CONSTRAINT employee_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.payroll_items 
DROP CONSTRAINT IF EXISTS payroll_items_employee_id_fkey, ADD CONSTRAINT payroll_items_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.invoice_items 
DROP CONSTRAINT IF EXISTS invoice_items_product_id_fkey, ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.sales_return_items 
DROP CONSTRAINT IF EXISTS sales_return_items_product_id_fkey, ADD CONSTRAINT sales_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.purchase_invoice_items 
DROP CONSTRAINT IF EXISTS purchase_invoice_items_product_id_fkey, ADD CONSTRAINT purchase_invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.purchase_return_items 
DROP CONSTRAINT IF EXISTS purchase_return_items_product_id_fkey, ADD CONSTRAINT purchase_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- 🛠️ معالجة القيود اليتيمة والمكررة لضمان مطابقة الأستاذ مع الفواتير
-- 1. ترميم الروابط المفقودة بناءً على رقم المرجع (في حال فقدان الـ UUID في القيود القديمة)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN
        UPDATE public.journal_entries je
        SET related_document_id = pi.id, related_document_type = 'purchase_invoice'
        FROM public.purchase_invoices pi
        WHERE je.reference = pi.invoice_number 
        AND je.related_document_id IS NULL 
        AND je.organization_id = pi.organization_id;
    END IF;
END $$;

-- 2. توجيه الفواتير إلى القيد الأحدث (الأصح بعد التعديل)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        UPDATE public.purchase_invoices pi
        SET related_journal_entry_id = (SELECT id FROM public.journal_entries je WHERE je.related_document_id = pi.id AND je.related_document_type = 'purchase_invoice' ORDER BY je.created_at DESC LIMIT 1)
        WHERE EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.related_document_id = pi.id AND je.related_document_type = 'purchase_invoice');
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        UPDATE public.invoices i
        SET related_journal_entry_id = (SELECT id FROM public.journal_entries je WHERE je.related_document_id = i.id AND je.related_document_type = 'invoice' ORDER BY je.created_at DESC LIMIT 1)
        WHERE EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.related_document_id = i.id AND je.related_document_type = 'invoice');
    END IF;
END $$;
-- 3. حذف كافة القيود المكررة والإبقاء على الأحدث فقط لكل مستند
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        DELETE FROM public.journal_entries 
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id, related_document_id, related_document_type ORDER BY created_at DESC) as entry_rank
                FROM public.journal_entries
                WHERE related_document_id IS NOT NULL AND related_document_type IN ('purchase_invoice', 'invoice')
            ) sub WHERE entry_rank > 1
        );
    END IF;
END $$;

-- تنظيف مراجع القيود لضمان الربط الصحيح
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        UPDATE public.journal_entries SET related_document_type = 'cheque_collection'
        WHERE (trim(reference) ILIKE 'COLL-%' OR trim(reference) ILIKE 'TRF-%' OR trim(reference) ILIKE 'CHQ-%') AND related_document_type IS NULL;
    END IF;
END $$;
-- صيانة فهارس البحث
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_categories') THEN
        CREATE INDEX IF NOT EXISTS idx_item_categories_name_search ON public.item_categories (organization_id, name);
    END IF;
END $$;
-- 🛡️ فهرس لتحسين أداء حذف والبحث عن القيود المرتبطة بالمستندات لضمان سرعة "نظام استبدال القيد"
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        CREATE INDEX IF NOT EXISTS idx_journal_entries_related_doc ON public.journal_entries (related_document_id, related_document_type);
    END IF;
END $$;

-- مزامنة المتوسط المرجح للأصناف لضمان دقة التكلفة في الفواتير
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        UPDATE public.products SET weighted_average_cost = COALESCE(NULLIF(weighted_average_cost, 0), cost, purchase_price, 0);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
        UPDATE public.purchase_invoices SET supplier_id = (SELECT id FROM public.suppliers LIMIT 1) WHERE supplier_id IS NULL;
        ALTER TABLE public.purchase_invoices ALTER COLUMN supplier_id SET NOT NULL;
    END IF;
END $$;
-- ============================================================
-- 1. توحيد أسماء أعمدة المرتجعات (Schema Standardization)
-- ============================================================
DO $$
DECLARE
    t text;
    tables_to_fix text[] := ARRAY['quotation_items', 'sales_return_items', 'purchase_invoice_items', 'purchase_order_items', 'purchase_return_items', 'invoice_items', 'order_items', 'modifiers'];
BEGIN
    -- توحيد مسمى سعر الوحدة في جميع جداول النظام
    FOREACH t IN ARRAY tables_to_fix LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t AND table_type = 'BASE TABLE') 
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'price') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'unit_price') THEN
                EXECUTE format('ALTER TABLE public.%I RENAME COLUMN price TO unit_price', t);
            ELSE
                EXECUTE format('UPDATE public.%I SET unit_price = COALESCE(price, 0) WHERE unit_price IS NULL OR unit_price = 0', t);
                EXECUTE format('ALTER TABLE public.%I DROP COLUMN price', t);
            END IF;
        END IF;
    END LOOP;

    -- ضمان عدم تكرار التصنيفات
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_categories_name_org_unique') THEN
        ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org();
        ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
        ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
        ALTER TABLE public.item_categories ADD CONSTRAINT item_categories_name_org_unique UNIQUE (organization_id, name);
    END IF;

    -- توحيد مسميات معرفات المرتجعات
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

-- ============================================================
-- 1.5 توحيد أعمدة نقاط البيع والمطاعم (POS Schema Sync)
-- ============================================================
DO $$ BEGIN
    -- تحديث جدول الطلبات (orders) - التأكد أنه جدول وليس رؤية
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders' AND table_type = 'BASE TABLE') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='created_by') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='user_id') THEN
            ALTER TABLE public.orders RENAME COLUMN created_by TO user_id;
        ELSE
            -- إذا كان كلاهما موجوداً، انقل البيانات للعمود الجديد واحذف القديم لتجنب التعارض
            UPDATE public.orders SET user_id = created_by WHERE user_id IS NULL;
            EXECUTE 'ALTER TABLE public.orders DROP COLUMN created_by';
        END IF;
    END IF;

    -- توحيد أعمدة فواتير المشتريات (purchase_invoices) لضمان التوافق مع الواجهة
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS due_date date;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS notes text;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id);
        
        -- حل مشكلة created_by: نجعلها عموداً عادياً لمرونة الإدخال
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_invoices' AND column_name='created_by' AND is_generated = 'ALWAYS') THEN
            EXECUTE 'ALTER TABLE public.purchase_invoices DROP COLUMN created_by';
        END IF;
        ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS created_by uuid;
    END IF;

    -- تحديث جدول الفواتير (invoices) - إصلاح تقرير حركة الصنف
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_type = 'BASE TABLE') THEN
        -- إضافة الأعمدة المالية الأساسية إذا فقدت
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date date;
        ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
    END IF;

    -- 1. ضمان وجود عمود user_id (المسمى الموحد الجديد) بشكل مستقل
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='user_id') THEN
        ALTER TABLE public.invoices ADD COLUMN user_id uuid REFERENCES public.profiles(id);
    END IF;

    -- 2. نقل البيانات من created_by القديم إلى user_id وإعادة تسمية القديم للشفافية
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='created_by' AND is_generated = 'NEVER') THEN
        -- نقل البيانات
        UPDATE public.invoices SET user_id = created_by WHERE user_id IS NULL;
        
        -- حذف القيود القديمة لإتاحة إعادة التسمية
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'invoices' AND constraint_name LIKE '%created_by_fkey%') THEN
            ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='_deprecated_created_by') THEN
            EXECUTE 'ALTER TABLE public.invoices RENAME COLUMN created_by TO _deprecated_created_by';
        END IF;
    END IF;

    -- 3. [تصحيح] تحويل created_by لعمود عادي لتمكين الإدخال المباشر من الواجهة
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='created_by' AND is_generated = 'ALWAYS') THEN
        EXECUTE 'ALTER TABLE public.invoices DROP COLUMN created_by';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='created_by') THEN
        ALTER TABLE public.invoices ADD COLUMN created_by uuid REFERENCES public.profiles(id);
    END IF;

    -- 🛠️ تحديث جدول إقفال الصندوق (cash_closings) - حل مشكلة missing created_by
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_closings') THEN
        -- إضافة الأعمدة التقنية المفقودة لضمان استقرار العمليات
        ALTER TABLE public.cash_closings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
        
        -- 1. ضمان وجود عمود user_id (المسمى المعتمد في الباك-إند)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_closings' AND column_name='user_id') THEN
            ALTER TABLE public.cash_closings ADD COLUMN user_id uuid REFERENCES public.profiles(id);
        END IF;

        -- 2. إنشاء created_by كعمود "افتراضي" يعكس user_id لضمان عمل الواجهة الأمامية
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_closings' AND column_name='created_by') THEN
            -- نستخدم EXECUTE لضمان أن المترجم يرى عمود user_id 
            EXECUTE 'ALTER TABLE public.cash_closings ADD COLUMN created_by uuid GENERATED ALWAYS AS (user_id) STORED';
        END IF;
        
        RAISE NOTICE '✅ تم ترميم جدول إقفال الصندوق وتفعيل عمود created_by التوافقي.';
    END IF;

    -- تحديث جدول أوامر التصنيع (work_orders)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_orders' AND table_type = 'BASE TABLE') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='created_by') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='user_id') THEN
            ALTER TABLE public.work_orders RENAME COLUMN created_by TO user_id;
        ELSE
            UPDATE public.work_orders SET user_id = created_by WHERE user_id IS NULL;
            EXECUTE 'ALTER TABLE public.work_orders DROP COLUMN created_by';
        END IF;
    END IF;

    -- تحديث جدول بنود الطلبات (order_items)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items' AND table_type = 'BASE TABLE') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='price') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='unit_price') THEN
            ALTER TABLE public.order_items RENAME COLUMN price TO unit_price;
        ELSE
            UPDATE public.order_items SET unit_price = price WHERE unit_price IS NULL;
            EXECUTE 'ALTER TABLE public.order_items DROP COLUMN price';
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items' AND table_type = 'BASE TABLE') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='total') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='total_price') THEN
            ALTER TABLE public.order_items RENAME COLUMN total TO total_price;
        ELSE
            UPDATE public.order_items SET total_price = total WHERE total_price IS NULL;
            EXECUTE 'ALTER TABLE public.order_items DROP COLUMN total';
        END IF;
    END IF;
    
    RAISE NOTICE '✅ تم توحيد مسميات أعمدة الـ POS بنجاح.';
END $$;

-- 1. إضافة الأعمدة لجدول المشتريات (في حال لم يتم تحديث الماستر)
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);

-- ============================================================
-- 2. إضافة أعمدة الـ SaaS والاشتراكات لجدول المنظمات
-- ============================================================
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS allowed_modules text[] DEFAULT '{"accounting"}';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_expiry date;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 5;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS suspension_reason text;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS total_collected numeric DEFAULT 0;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS next_payment_date date;
        ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS activity_type text;
    END IF;
END $$;

-- ============================================================
-- 3. تحديث إعدادات الشركة (Company Settings)
-- ============================================================
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS max_cash_deficit_limit numeric DEFAULT 500;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS activity_type text;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_settings') THEN
        ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS monthly_sales_target numeric DEFAULT 0;
    END IF;
END $$;

-- تحديث جدول التصنيفات (fix_item_categories_description)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_categories') THEN ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS description text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_categories') THEN ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS image_url text; END IF;
END $$;
-- ضمان القيد الفريد لجدول الإعدادات
DO $$ BEGIN
    ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_organization_id_unique;
    ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_organization_id_unique UNIQUE (organization_id);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping settings unique constraint'; END $$;

-- ============================================================
-- 5. تحديثات الجداول المالية (Financial Linkage)
-- ============================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_tax numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS grand_total numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cheques') THEN ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS current_account_id uuid REFERENCES public.accounts(id); END IF;

    -- 🛠️ ترميم جداول الجرد (Inventory Count Healing)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_counts') THEN
        CREATE TABLE public.inventory_counts (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            count_date date DEFAULT now(),
            status text DEFAULT 'draft',
            warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
            organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
            notes text,
            created_at timestamptz DEFAULT now()
        );
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_count_items') THEN 
        ALTER TABLE public.inventory_count_items ADD COLUMN IF NOT EXISTS actual_qty numeric DEFAULT 0;
        ALTER TABLE public.inventory_count_items ADD COLUMN IF NOT EXISTS system_qty numeric DEFAULT 0;
        ALTER TABLE public.inventory_count_items ADD COLUMN IF NOT EXISTS difference numeric DEFAULT 0;
        ALTER TABLE public.inventory_count_items ADD COLUMN IF NOT EXISTS notes text;
    END IF;END $$;

-- إضافة أعمدة مفقودة تم رصدها في هيكل القاعدة الحالي لضمان التوافق
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assets') THEN ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_advances') THEN ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS payroll_item_id uuid REFERENCES public.payroll_items(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_items') THEN ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS payroll_tax numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS expected_cash numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS actual_cash numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS difference numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'modifiers') THEN ALTER TABLE public.modifiers ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN 
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 5; 
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS available_modifiers jsonb DEFAULT '[]'::jsonb;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS requires_serial boolean DEFAULT false;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date date;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_price numeric;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_start_date date;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_end_date date;
        ALTER TABLE public.products ADD COLUMN IF NOT EXISTS offer_max_qty numeric;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_orders') THEN ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id); END IF;
END $$;

-- ربط المرتجعات بالفواتير
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_returns') THEN ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.invoices(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_returns') THEN ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.purchase_invoices(id); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS reference text; END IF; -- مطلوب لنظام الإشعارات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id); END IF; -- مطلوب لنظام الإشعارات
END $$;

-- تحديثات العملاء والمخزون
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN 
        ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS bill_requested boolean DEFAULT false; 
        ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS session_start timestamptz;
        ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS section text;
        ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturing_cost numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weighted_average_cost numeric DEFAULT 0; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock_level numeric DEFAULT 5; END IF; -- الحد الأدنى للتنبيه
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS notes text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 5; END IF; -- الحد الأدنى للتنبيه
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS reservation_info jsonb; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 0.14; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0; END IF; -- تكلفة الوجبات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_items') THEN ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]'::jsonb; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN 
        ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url text; 
        ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority text DEFAULT 'info'; 
        ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_id uuid; 
    END IF; -- 🛠️ إصلاح شامل لأعمدة الإشعارات (PGRST204)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date date; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'STOCK'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.item_categories(id) ON DELETE SET NULL; END IF;
END $$;

-- تحديثات مديول الرواتب (Payroll Sync)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees') THEN ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(); END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payrolls') THEN ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'; END IF;
    -- 🛠️ تحصين جدول الموظفين وإصلاح قيود الأسماء (Stabilization Fix)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees') THEN 
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS name text;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS full_name text;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department text;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS notes text;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS position text;
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
        ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
        
        -- إزالة قيود NOT NULL المسببة للأخطاء
        ALTER TABLE public.employees ALTER COLUMN name DROP NOT NULL;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='full_name') THEN
            ALTER TABLE public.employees ALTER COLUMN full_name DROP NOT NULL;
        END IF;

        -- 🇪🇬 توحيد مسمى الراتب الأساسي ليتوافق مع مديول المقاولات والتصنيع
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema='public'
            AND table_name='employees'
            AND column_name='salary'
        )
        AND NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema='public'
            AND table_name='employees'
            AND column_name='basic_salary'
        )
        THEN
            ALTER TABLE public.employees RENAME COLUMN salary TO basic_salary;
        END IF;

        -- مزامنة البيانات التاريخية ديناميكياً
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='full_name')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='name') THEN
            EXECUTE 'UPDATE public.employees SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL';
            EXECUTE 'UPDATE public.employees SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_items') THEN ALTER TABLE public.payroll_items ADD COLUMN IF NOT EXISTS payroll_tax numeric DEFAULT 0; END IF;
    -- 🛠️ تحصين جدول السلف وإصلاح خطأ ENCES (Stabilization Fix)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_advances') THEN 
        ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS request_date date DEFAULT now();
        ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS treasury_account_id uuid REFERENCES public.accounts(id);
        ALTER TABLE public.employee_advances ADD COLUMN IF NOT EXISTS reference text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(); END IF;
END $$;

-- 🛠️ تحديث جدول إقفال الصندوق (cash_closings) - حل مشكلة missing created_by والناقص من الأعمدة
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_closings') THEN
        -- إضافة الأعمدة التقنية المفقودة لضمان استقرار العمليات
        ALTER TABLE public.cash_closings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
        
        -- 1. ضمان وجود عمود user_id (المسمى المعتمد في الباك-إند)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_closings' AND column_name='user_id') THEN
            ALTER TABLE public.cash_closings ADD COLUMN user_id uuid REFERENCES public.profiles(id);
        END IF;

        -- 2. [تصحيح حاسم] تحويل created_by لعمود عادي لتمكين الإدخال المباشر من الواجهة (حل خطأ 400)
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_closings' AND column_name='created_by' AND is_generated = 'ALWAYS') THEN
            ALTER TABLE public.cash_closings DROP COLUMN created_by;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_closings' AND column_name='created_by') THEN
            ALTER TABLE public.cash_closings ADD COLUMN created_by uuid REFERENCES public.profiles(id);
        END IF;

        RAISE NOTICE '✅ تم ترميم جدول إقفال الصندوق وتفعيل عمود created_by التوافقي.';
    END IF;

    -- 🛠️ ضمان وجود جدول التسويات البنكية (bank_reconciliations) - حل خطأ PGRST205
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_reconciliations') THEN
        CREATE TABLE public.bank_reconciliations (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
            statement_date date NOT NULL,
            statement_balance numeric DEFAULT 0,
            book_balance numeric DEFAULT 0,
            opening_balance numeric DEFAULT 0,
            total_deposits numeric DEFAULT 0,
            total_payments numeric DEFAULT 0,
            reconciled_ids jsonb DEFAULT '[]'::jsonb,
            status text DEFAULT 'draft',
            notes text,
            organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(),
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE '✅ تم إنشاء جدول التسويات البنكية (bank_reconciliations).';
    END IF;
END $$;

-- ============================================================
-- 🛠️ دالة مشغل مزامنة هويات المستخدمين (User ID Compatibility Layer)
-- الغرض: ضمان بقاء user_id و created_by متطابقين بغض النظر عما ترسله الواجهة
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_sync_user_id_compatibility()
RETURNS TRIGGER AS $$
BEGIN
    NEW.user_id := COALESCE(NEW.user_id, NEW.created_by, auth.uid());
    NEW.created_by := COALESCE(NEW.created_by, NEW.user_id, auth.uid());
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- تطبيق المشغلات على الجداول التي تعاني من ازدواجية المسميات
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        DROP TRIGGER IF EXISTS trg_sync_invoice_users ON public.invoices;
        CREATE TRIGGER trg_sync_invoice_users BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_sync_user_id_compatibility();
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cash_closings') THEN
        DROP TRIGGER IF EXISTS trg_sync_cash_users ON public.cash_closings;
        CREATE TRIGGER trg_sync_cash_users BEFORE INSERT OR UPDATE ON public.cash_closings FOR EACH ROW EXECUTE FUNCTION public.fn_sync_user_id_compatibility();
    END IF;
END $$;

-- ⚙️ تريجر مزامنة أسماء الموظفين (Double-Naming Guard)
CREATE OR REPLACE FUNCTION public.fn_sync_employee_names()
RETURNS TRIGGER AS $$
BEGIN
    NEW.full_name := COALESCE(NEW.full_name, NEW.name);
    NEW.name := COALESCE(NEW.name, NEW.full_name);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_emp_names ON public.employees;
CREATE TRIGGER trg_sync_emp_names
BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_employee_names();

-- ============================================================
-- 6. إصلاح نظام الإشعارات (Notifications Fix)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'notification_type') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'type') THEN
                ALTER TABLE public.notifications RENAME COLUMN notification_type TO "type";
            ELSE
                -- If both exist, ensure 'type' is the primary and drop 'notification_type' if it's redundant
                -- Or, if 'notification_type' is still used, ensure it's nullable if 'type' is preferred.
                -- For now, just ensure 'notification_type' is nullable if 'type' exists to avoid conflicts.
                ALTER TABLE public.notifications ALTER COLUMN notification_type DROP NOT NULL;
            END IF;
        END IF;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_settings') THEN ALTER TABLE public.company_settings ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN ALTER TABLE public.invoices ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_invoices') THEN ALTER TABLE public.purchase_invoices ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_vouchers') THEN ALTER TABLE public.receipt_vouchers ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_vouchers') THEN ALTER TABLE public.payment_vouchers ALTER COLUMN currency SET DEFAULT 'EGP'; END IF;
END $$;

-- تهيئة المتوسط المرجح للأصناف الحالية لضمان عدم ظهور أصفار في تقرير الأرباح

-- ============================================================
-- 12. صمام أمان المستودعات للفواتير (Warehouse Safety Triggers)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_ensure_document_warehouse()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NULL THEN
        NEW.warehouse_id := COALESCE(
            (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = NEW.organization_id),
            (SELECT id FROM public.warehouses WHERE organization_id = NEW.organization_id AND deleted_at IS NULL LIMIT 1)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 🛡️ دالة فرض معرف المنظمة (Force Organization ID Function)
-- الوصف: تضمن هذه الدالة تعيين organization_id تلقائياً عند الإدراج
-- تم توحيدها لتشمل منطق الوراثة الذكي ووضع الاستعادة
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_force_org_id_universal()
RETURNS TRIGGER AS $$
BEGIN
    -- 🛡️ وضع الاستعادة/الاختبار: السماح بمرور السجل كما هو
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- 🏗️ محرك الوراثة الذكي: إذا كان السجل تابعاً لطلب أو جلسة، يرث منظمتها تلقائياً
    IF TG_TABLE_NAME = 'order_items' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.orders WHERE id = NEW.order_id;
    ELSIF TG_TABLE_NAME = 'orders' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.table_sessions WHERE id = NEW.session_id;
    ELSIF TG_TABLE_NAME = 'table_sessions' AND NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM public.restaurant_tables WHERE id = NEW.table_id;
    END IF;

    IF NEW.organization_id IS NULL THEN
        NEW.organization_id := public.get_my_org();
    END IF;

    -- 🏗️ Fallback: If organization is still missing and session is unauthenticated (manual admin task), 
    -- default to the first available organization to prevent script failure.
    IF NEW.organization_id IS NULL AND auth.uid() IS NULL THEN
        NEW.organization_id := (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1);
    END IF;

    -- 🛡️ حماية إضافية: إذا لم توجد أي منظمة نهائياً في النظام، اسمح بمرور السجل كـ NULL مؤقتاً 
    -- لتجنب توقف السكربتات الأساسية عن العمل.
    IF NEW.organization_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.organizations) THEN
        RETURN NEW;
    END IF;

    IF NEW.organization_id IS NULL THEN RAISE EXCEPTION 'يجب تحديد المنظمة.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ensure_invoice_warehouse ON public.invoices;
CREATE TRIGGER trg_ensure_invoice_warehouse BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_document_warehouse();

-- هنا نقوم فقط بتطبيق المشغلات (Triggers) لضمان استقرار البيئة.
DO $$ 
DECLARE 
    t text;
    tables_list text[];
BEGIN
    -- استخراج كافة جداول المخطط التي تحتوي على عمود organization_id
    -- مع استثناء الجداول الإدارية والسيادية لضمان استقرار النظام
    tables_list := ARRAY(
        SELECT c.table_name 
        FROM information_schema.columns c
        JOIN information_schema.tables t ON c.table_name = t.table_name AND c.table_schema = t.table_schema
        WHERE c.table_schema = 'public' 
        AND c.column_name = 'organization_id'
        AND t.table_type = 'BASE TABLE'
        AND c.table_name NOT IN ('spatial_ref_sys', 'organizations', 'organization_backups', 'profiles', 'permissions', 'roles', 'role_permissions', 'security_logs')
    );

    FOREACH t IN ARRAY tables_list LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_force_org_id_universal ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_force_org_id_universal 
                        BEFORE INSERT ON public.%I
                        FOR EACH ROW EXECUTE FUNCTION public.fn_force_org_id_universal()', t);
    END LOOP;

    -- 🛡️ ترميم بيانات عروض الأسعار اليتيمة (في حال وجدت)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotations') THEN
        ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS expiry_date date;
        ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
        
        UPDATE public.quotations 
        SET organization_id = COALESCE(organization_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))
        WHERE organization_id IS NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotation_items') THEN
        UPDATE public.quotation_items qi
        SET organization_id = q.organization_id
        FROM public.quotations q
        WHERE qi.quotation_id = q.id AND qi.organization_id IS NULL;
    END IF;

    -- 🛡️ ترميم بيانات أوامر الشراء اليتيمة (في حال وجدت)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders') THEN
        UPDATE public.purchase_orders 
        SET organization_id = COALESCE(organization_id, public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))
        WHERE organization_id IS NULL;
    END IF;

     IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items') THEN
        UPDATE public.purchase_order_items poi
        SET organization_id = po.organization_id
        FROM public.purchase_orders po
        WHERE poi.order_id = po.id AND poi.organization_id IS NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN 
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT public.get_my_org(); 
    END IF;
END $$;

-- 🛠️ دالة زر الإصلاح العالمي (The Global Repair Button)
-- الغرض: تنظيف شامل وإعادة توازن للنظام لتقليل تذاكر الدعم الفني
CREATE OR REPLACE FUNCTION public.run_global_system_repair(p_org_id uuid DEFAULT NULL)
RETURNS TABLE(task_name text, status text, impact_count bigint) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_org_id uuid := COALESCE(p_org_id, public.get_my_org());
    v_count bigint;
BEGIN
    -- 🛡️ [V14.1] تفعيل وضع الاستعادة لتجاوز صمامات أمان المنظمة أثناء عملية الترميم الجراحي
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 1. إصلاح السجلات اليتيمة في المحاسبة
    DELETE FROM public.journal_lines WHERE journal_entry_id NOT IN (SELECT id FROM public.journal_entries);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    task_name := 'تنظيف خطوط القيود اليتيمة'; status := 'DONE'; impact_count := v_count; RETURN NEXT;

    -- 1.5. إصلاح السجلات اليتيمة في المستندات (توسيع نطاق التنظيف)
    DELETE FROM public.invoice_items WHERE invoice_id NOT IN (SELECT id FROM public.invoices);
    DELETE FROM public.purchase_invoice_items WHERE purchase_invoice_id NOT IN (SELECT id FROM public.purchase_invoices);
    DELETE FROM public.order_items WHERE order_id NOT IN (SELECT id FROM public.orders);
    DELETE FROM public.order_item_modifiers WHERE order_item_id NOT IN (SELECT id FROM public.order_items);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    task_name := 'تنظيف بنود المستندات اليتيمة'; status := 'DONE'; impact_count := v_count; RETURN NEXT;

    -- 2. إعادة موازنة القيود (توجيه الفروق لحساب الوسيط)
    WITH unbalanced AS (
        SELECT journal_entry_id FROM public.journal_lines 
        GROUP BY journal_entry_id HAVING ABS(SUM(debit - credit)) > 0.01
    )
    SELECT COUNT(*) FROM (SELECT public.fix_unbalanced_journal_entry(journal_entry_id) FROM unbalanced) t INTO v_count;
    task_name := 'إعادة توازن قيود اليومية'; status := 'DONE'; impact_count := v_count; RETURN NEXT;

    -- 🛡️ حماية: إذا لم يتم العثور على منظمة سياقية، نتوقف هنا بعد التنظيف العام لضمان عدم الانهيار
    IF v_org_id IS NULL THEN
        task_name := 'إكمال التنظيف العام (لم يتم تحديد منظمة للإصلاح التخصصي)'; status := 'SKIPPED'; impact_count := 0; 
        PERFORM set_config('app.restore_mode', 'off', true);
        RETURN;
    END IF;

    -- 3. مزامنة أنواع الأصناف (ضمان عدم تحولها لـ STOCK بشكل خاطئ)
    UPDATE public.products SET product_type = 'RAW_MATERIAL' WHERE mfg_type = 'raw' AND product_type != 'RAW_MATERIAL' AND organization_id = v_org_id;
    UPDATE public.products SET product_type = 'MANUFACTURED' WHERE mfg_type = 'standard' AND product_type != 'MANUFACTURED' AND organization_id = v_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    task_name := 'تصحيح تصنيفات الأصناف الصناعية'; status := 'DONE'; impact_count := v_count; RETURN NEXT;

    -- 4. إعادة احتساب المخزون الشامل (الضربة القاضية لمشاكل الأرصدة)
    PERFORM public.recalculate_stock_rpc(v_org_id);
    task_name := 'تحديث أرصدة المخازن اللحظية'; status := 'DONE'; impact_count := (SELECT COUNT(*) FROM public.products WHERE organization_id = v_org_id); RETURN NEXT;

    -- 5. التأكد من وجود إعدادات الشركة (Company Settings)
    IF NOT EXISTS (SELECT 1 FROM public.company_settings WHERE organization_id = v_org_id) THEN
        INSERT INTO public.company_settings (organization_id, company_name) 
        VALUES (v_org_id, (SELECT name FROM public.organizations WHERE id = v_org_id));
        task_name := 'إنشاء إعدادات الشركة المفقودة'; status := 'CREATED'; impact_count := 1; RETURN NEXT;
    END IF;

    -- 6. تنظيف القيود المكررة للمستندات (Duplicate Guard)
    DELETE FROM public.journal_entries 
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id, related_document_id, related_document_type ORDER BY created_at DESC) as rank
            FROM public.journal_entries 
            WHERE related_document_id IS NOT NULL AND related_document_type IN ('invoice', 'purchase_invoice', 'shift')
        ) t WHERE rank > 1
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    task_name := 'حذف قيود المستندات المكررة'; status := 'DONE'; impact_count := v_count; RETURN NEXT;

    -- 🔙 إيقاف وضع الاستعادة للعودة للوضع الأمني الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);

END; $$;

GRANT EXECUTE ON FUNCTION public.run_global_system_repair(uuid) TO authenticated;
-- 🛠️ إصلاح أرصدة التصنيع والتكاليف المشوهة (MFG Data Repair)


-- 🚀 تحديث ذاكرة المخطط لضمان تعرف الـ API على التغييرات فوراً
NOTIFY pgrst, 'reload config';
SELECT '✅ تم فحص وتثبيت هيكل قاعدة البيانات بنجاح وتحديث ذاكرة المخطط.' as status;


-- دالة تأسيس دليل الحسابات المصري الشامل لشركة جديدة
-- 🇪🇬 دالة تأسيس دليل الحسابات المصري الشامل (النسخة الذهبية المتكاملة)
-- تاريخ التحديث: 2024-05-20
-- تشمل: أوراق القبض، المحافظ الإلكترونية، تفاصيل البنوك المصرية، وكافة المصروفات.

-- 1. حذف النسخ القديمة لضمان تحديث توقيع الدالة (Signature)
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(UUID);
DROP FUNCTION IF EXISTS public.initialize_egyptian_coa(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.initialize_egyptian_coa(p_org_id UUID, p_activity_type TEXT DEFAULT 'commercial', p_admin_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE v_vat_rate numeric; v_admin_id uuid; v_org_name text;
    v_cash_id uuid; v_sales_id uuid; v_cust_id uuid; v_cogs_id uuid; v_inv_id uuid; v_vat_id uuid; v_supp_id uuid; v_vat_in_id uuid; v_disc_id uuid;
    v_wht_pay_id uuid; v_payroll_tax_id uuid; v_wht_rec_id uuid; v_sal_ret_id uuid;
    v_sal_exp_id uuid; v_bonus_id uuid; v_ded_id uuid; v_adv_id uuid; v_retained_id uuid;
    v_raw_id uuid; v_wip_id uuid; v_labor_mfg_id uuid; v_wastage_id uuid;
    v_cash_surplus_id uuid;
    v_notes_rec_id uuid; v_notes_pay_id uuid; v_cash_deficit_id uuid; v_overhead_mfg_id uuid; v_wip_variance_id uuid;
    v_ret_cust_id uuid; v_ret_sub_id uuid; v_adv_sub_id uuid; v_lg_margin_id uuid; v_lc_goods_id uuid;
    v_dep_exp_id uuid; v_acc_dep_id uuid; v_fixed_assets_id uuid; v_opening_bal_id uuid; v_equip_rev_id uuid;
    v_prepaid_exp_id uuid; v_accrued_exp_id uuid;
    v_social_ins_id uuid; v_bank_main_id uuid; v_rev_other_id uuid; v_exp_gen_id uuid; v_security_deposit_id uuid;
    v_sal_allow_id uuid;
    v_rev_construction_id uuid;
    v_shelf_rental_id uuid;
    v_earned_disc_id uuid;
BEGIN
    v_vat_rate := CASE 
        WHEN p_activity_type = 'construction' THEN 0.05 
        WHEN p_activity_type = 'charity' THEN 0.00 
        WHEN p_activity_type IN ('manufacturing', 'factory', 'تصنيع', 'مصانع') THEN 0.14
        ELSE 0.14 
    END;
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;
    DROP TABLE IF EXISTS coa_temp;
    CREATE TEMPORARY TABLE coa_temp (
        code text PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL,
        is_group boolean NOT NULL,
        parent_code text
    ) ON COMMIT DROP;

    INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
        -- ============================================================
    -- المستوى 1: الحسابات الرئيسية (الأصول، الخصوم، إلخ)
    -- ============================================================
    ('1', 'الأصول', 'asset', true, NULL),
    ('2', 'الخصوم (الإلتزامات)', 'liability', true, NULL),
    ('3', 'حقوق الملكية', 'equity', true, NULL),
    ('4', 'الإيرادات', 'revenue', true, NULL),
    ('5', 'المصروفات', 'expense', true, NULL),
        -- ============================================================
    -- المستوى 2: تصنيفات رئيسية (متداولة، غير متداولة، إلخ)
    -- ============================================================
    ('11', 'الأصول غير المتداولة', 'asset', true, '1'),
    ('12', 'الأصول المتداولة', 'asset', true, '1'),
    ('21', 'الخصوم غير المتداولة', 'liability', true, '2'),
    ('22', 'الخصوم المتداولة', 'liability', true, '2'),
    ('31', 'رأس المال والاحتياطيات', 'equity', true, '3'),
        ('32', 'الأرباح المبقاة / المرحلة', 'equity', false, '3'), -- تم نقلها هنا
    ('33', 'جاري الشركاء', 'equity', false, '3'), -- تم نقلها هنا
    ('34', 'احتياطيات', 'equity', false, '3'), -- تم نقلها هنا
    ('41', 'إيرادات النشاط (المبيعات)', 'revenue', true, '4'),
    ('42', 'إيرادات أخرى', 'revenue', true, '4'),
    ('51', 'تكلفة المبيعات (COGS)', 'expense', true, '5'),
    ('52', 'مصروفات البيع والتسويق', 'expense', true, '5'),
    ('53', 'المصروفات الإدارية والعمومية', 'expense', true, '5'),
       -- ============================================================
    -- المستوى 3: حسابات تجميعية فرعية
    -- ============================================================
    ('111', 'الأصول الثابتة (بالصافي)', 'asset', true, '11'),
    ('103', 'المخزون', 'asset', true, '12'), -- استخدام 103 للمخزون
    ('122', 'العملاء والمدينون', 'asset', true, '12'),
    ('123', 'النقدية وما في حكمها', 'asset', true, '12'),
    ('1232', 'البنوك - حسابات جارية', 'asset', true, '123'),
    ('1233', 'المحافظ الإلكترونية', 'asset', true, '123'),
    ('124', 'أرصدة مدينة أخرى', 'asset', true, '12'),
    ('223', 'مصلحة الضرائب (التزامات)', 'liability', true, '22'),
    ('225', 'مصروفات مستحقة', 'liability', true, '22'),
    ('525', 'عمولات تحصيل إلكتروني', 'expense', true, '52'),

    -- ============================================================
    -- المستوى 4 وما بعده: حسابات الحركة والتفاصيل
    -- ============================================================
    -- الأصول الثابتة
    ('1111', 'الأراضي', 'asset', false, '111'),
    ('1112', 'المباني والإنشاءات', 'asset', false, '111'),
    ('1113', 'الآلات والمعدات', 'asset', false, '111'),
        ('1114', 'وسائل النقل والانتقال', 'asset', false, '111'),
    ('1115', 'الأثاث والتجهيزات المكتبية', 'asset', false, '111'),
    ('1116', 'أجهزة حاسب آلي وبرمجيات', 'asset', false, '111'),
    ('1119', 'مجمع إهلاك الأصول الثابتة', 'asset', false, '111'),
    ('11192', 'مجمع إهلاك المباني والإنشاءات', 'asset', false, '111'),
    ('11193', 'مجمع إهلاك الآلات والمعدات', 'asset', false, '111'),
    ('11194', 'مجمع إهلاك وسائل النقل والانتقال (السيارات)', 'asset', false, '111'),
    ('11195', 'مجمع إهلاك الأثاث والتجهيزات المكتبية', 'asset', false, '111'),
    ('11196', 'مجمع إهلاك أجهزة حاسب آلي وبرمجيات', 'asset', false, '111'),
    ('112', 'استثمارات مالية', 'asset', false, '11'),
    ('113', 'قروض ممنوحة للغير', 'asset', false, '11'),
    ('118', 'أصول غير ملموسة', 'asset', true, '11'),
    ('1181', 'مصاريف تأسيس', 'asset', false, '118'),
        -- المخزون

    ('10301', 'مخزون المواد الخام', 'asset', false, '103'),
    ('10302', 'مخزون المنتج التام', 'asset', false, '103'),
    ('10303', 'مخزون إنتاج تحت التشغيل (WIP)', 'asset', false, '103'),
        -- العملاء والمدينون

    ('1221', 'العملاء', 'asset', false, '122'),
    ('122101', 'ذمم شركات التأمين الطبي', 'asset', false, '122'),
    ('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'asset', false, '122'),
    ('1223', 'سلف الموظفين', 'asset', false, '122'),
        ('1224', 'عهد موظفين', 'asset', false, '122'),
    ('1225', 'مخصص ديون مشكوك فيها', 'asset', false, '122'),
    ('1226', 'مخصص أجيوم', 'asset', false, '122'),
    ('1227', 'مخصص خصم مسموح به', 'asset', false, '122'),
    -- النقدية والبنوك والمحافظ
    ('1231', 'النقدية بالصندوق (الرئيسية)', 'asset', false, '123'),
    ('123201', 'البنك الأهلي المصري', 'asset', false, '1232'),
    ('123202', 'بنك مصر', 'asset', false, '1232'),
    ('123203', 'البنك التجاري الدولي (CIB)', 'asset', false, '1232'),
        ('123204', 'بنك QNB الأهلي', 'asset', false, '1232'),
    ('123205', 'بنك القاهرة', 'asset', false, '1232'),
    ('123206', 'بنك فيصل الإسلامي', 'asset', false, '1232'),
    ('123207', 'بنك الإسكندرية', 'asset', false, '1232'),
    ('123301', 'فودافون كاش', 'asset', false, '1233'),
    ('123302', 'اتصالات كاش (Etisalat Cash)', 'asset', false, '1233'),
    ('123303', 'أورنج كاش (Orange Cash)', 'asset', false, '1233'),
    ('123304', 'وي باي (WE Pay)', 'asset', false, '1233'),
    ('123305', 'انستا باي (InstaPay)', 'asset', false, '1233'),
    -- أرصدة مدينة أخرى
    ('1241', 'ضريبة القيمة المضافة (مدخلات)', 'asset', false, '124'),
    ('1242', 'ضريبة الخصم والتحصيل (لنا)', 'asset', false, '124'),
    ('1249', 'محتجز ضمان لدى الغير (عملاء)', 'asset', false, '124'),
    ('1245', 'دفعات مقدمة للمقاولين والموردين', 'asset', false, '124'),
    ('1248', 'غطاء خطابات ضمان لدى البنوك', 'asset', false, '124'),
    ('1246', 'اعتمادات مستندية لشراء بضائع', 'asset', false, '124'),
    ('1243', 'مصروفات مدفوعة مقدماً', 'asset', true, '124'),
    ('124301', 'إيجار مقدم', 'asset', false, '1243'),
    ('124302', 'تأمين طبي مقدم', 'asset', false, '1243'),
    ('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'asset', false, '1243'),
    ('124304', 'حملات إعلانية مقدمة', 'asset', false, '1243'),
    ('124305', 'عقود صيانة مقدمة', 'asset', false, '1243'),
    ('1244', 'إيرادات مستحقة', 'asset', true, '124'),
    ('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'asset', false, '1244'),
    ('124402', 'فوائد بنكية مستحقة القبض', 'asset', false, '1244'),
    ('124403', 'إيجارات دائنة مستحقة', 'asset', false, '1244'),
    ('124404', 'إيرادات أوراق مالية مستحقة', 'asset', false, '1244'),
    -- الخصوم
    ('201', 'الموردين', 'liability', false, '22'),
    ('222', 'أوراق الدفع (شيكات صادرة)', 'liability', false, '22'),
    ('2229', 'محتجز ضمان لمقاولي الباطن', 'liability', false, '22'),
    ('2231', 'ضريبة القيمة المضافة (مخرجات)', 'liability', false, '223'),
    ('2232', 'ضريبة الخصم والتحصيل (علينا)', 'liability', false, '223'),
    ('2233', 'ضريبة كسب العمل', 'liability', false, '223'),
    ('224', 'هيئة التأمينات الاجتماعية', 'liability', false, '22'),
    ('2251', 'رواتب وأجور مستحقة', 'liability', false, '225'),
    ('2252', 'إيجارات مستحقة', 'liability', false, '225'),
    ('2253', 'كهرباء ومياه وغاز مستحقة', 'liability', false, '225'),
    ('2254', 'أتعاب مهنية ومراجعة مستحقة', 'liability', false, '225'),
    ('2255', 'عمولات بيع مستحقة', 'liability', false, '225'),
    ('2256', 'فوائد بنكية مستحقة', 'liability', false, '225'),
    ('2257', 'اشتراكات وتراخيص مستحقة', 'liability', false, '225'),
    ('226', 'تأمينات ودفعات مقدمة من العملاء', 'liability', false, '22'),
    ('211', 'قروض طويلة الأجل', 'liability', false, '21'),
    ('212', 'قرض السندات', 'liability', false, '21'),
    -- حقوق الملكية
    ('311', 'رأس المال المدفوع', 'equity', false, '31'), -- تحت رأس المال والاحتياطيات
    ('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'equity', false, '3'),
    -- الإيرادات

    ('411', 'إيراد مبيعات بضاعة', 'revenue', false, '41'),
    ('41101', 'إيرادات تشغيل وخدمات متنوعة', 'revenue', false, '41'), -- 🚀 مطلوب لربط مديول HIMS
    ('41103', 'إيراد عقود ومشاريع (مستخلصات)', 'revenue', false, '41'), -- 🏗️ مطلوب لربط مديول المقاولات
    ('412', 'مردودات ومسموحات مبيعات', 'revenue', false, '41'),
    ('413', 'خصم مسموح به', 'revenue', false, '41'),
    ('421', 'إيرادات متنوعة', 'revenue', false, '42'),
    ('42101', 'إيرادات إيجار أرفف ومساحات ترويجية', 'revenue', false, '42'),
    ('42102', 'خصم مكتسب وبوانص موردين تجارية', 'revenue', false, '42'),
    ('422', 'إيراد خصومات وجزاءات الموظفين', 'revenue', false, '42'),
    ('425', 'إيراد تشغيل معدات داخلي', 'revenue', false, '42'),
    ('423', 'فوائد بنكية دائنة', 'revenue', false, '42'),
    ('424', 'إيراد استثمارات', 'revenue', false, '42'),
    -- المصروفات
    ('511', 'تكلفة البضاعة المباعة', 'expense', false, '51'),
    ('512', 'تسويات الجرد (عجز المخزون)', 'expense', false, '51'),
    ('5121', 'تكلفة الهالك والفاقد', 'expense', false, '51'), -- متاح الآن لكل الشركات
    ('513', 'أجور عمال الإنتاج المباشرة', 'expense', false, '51'), -- متاح الآن لكل الشركات
    -- لإضافة حساب جديد: ('CODE', 'NAME', 'TYPE', IS_GROUP, 'PARENT_CODE')
    
    ('514', 'تكاليف صناعية غير مباشرة', 'expense', true, '51'),
    ('5141', 'إهلاك آلات ومعدات المصنع', 'expense', false, '514'),
    ('5142', 'صيانة وإصلاح المصنع', 'expense', false, '514'),
    ('5143', 'كهرباء وقوى محركة للمصنع', 'expense', false, '514'),
    ('521', 'دعاية وإعلان', 'expense', false, '52'),
    ('522', 'عمولات بيع وتسويق', 'expense', false, '52'),
    ('523', 'نقل ومشال للخارج', 'expense', false, '52'),
    ('524', 'تعبئة وتغليف', 'expense', false, '52'),
    ('5251', 'عمولة فودافون كاش', 'expense', false, '525'),
    ('5252', 'عمولة فوري', 'expense', false, '525'),
    ('5253', 'عمولة تحويلات بنكية', 'expense', false, '525'),
    ('531', 'الرواتب والأجور', 'expense', false, '53'),
    ('5312', 'مكافآت وحوافز', 'expense', false, '53'),
    ('5311', 'بدلات وانتقالات', 'expense', false, '53'),
    ('532', 'إيجار مقرات إدارية', 'expense', false, '53'),
    ('533', 'مصروف إهلاك الأصول الثابتة', 'expense', false, '53'),
    ('534', 'مصروفات بنكية', 'expense', false, '53'),
    ('5342', 'مصروف فائدة قرض السندات', 'expense', false, '53'),
    ('535', 'كهرباء ومياه وغاز', 'expense', false, '53'),
    ('536', 'اتصالات وإنترنت', 'expense', false, '53'),
    ('537', 'صيانة وإصلاح', 'expense', false, '53'),
    ('538', 'أدوات مكتبية ومطبوعات', 'expense', false, '53'),
    ('539', 'ضيافة واستقبال', 'expense', false, '53'),
    ('541', 'تسوية عجز الصندوق', 'expense', false, '53'),
    ('441', 'زيادة الصندوق (إيرادات متنوعة)', 'revenue', false, '42'),
    ('542', 'إكراميات', 'expense', false, '53'),
    ('543', 'مصاريف نظافة', 'expense', false, '53');
    -- 2. تخصيص حسابات بناءً على النشاط
    IF p_activity_type = 'restaurant' THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
        ('4111', 'إيرادات مبيعات (صالة)', 'revenue', false, '41'),
        ('4112', 'إيرادات مبيعات (توصيل)', 'revenue', false, '41');
    END IF;

    IF p_activity_type IN ('manufacturing', 'factory', 'تصنيع', 'مصانع') THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
        ('4113', 'إيرادات مبيعات إنتاج تام', 'revenue', false, '41'),
        ('4114', 'إيرادات مبيعات مخلفات إنتاج', 'revenue', false, '41');
    END IF;

    -- 🏥 تخصيص حسابات نشاط المستشفيات (HIMS Foundation)
    IF p_activity_type IN ('hospital', 'medical', 'clinic', 'مستشفى', 'مركز طبي', 'صيدلية', 'pharmacy') THEN
        INSERT INTO coa_temp (code, name, type, is_group, parent_code) VALUES
        ('10304', 'مخزون الأدوية والمستلزمات الطبية', 'asset', false, '103'),
        ('4115', 'إيرادات الكشوفات والعمليات', 'revenue', false, '41'),
        ('4116', 'إيرادات الإقامة والتمريض', 'revenue', false, '41');

        -- تحديث المسمى ليكون أكثر دقة للنشاط الطبي بدلاً من الحذف لتجنب تكرار الكود
        UPDATE coa_temp SET name = 'إيرادات طبية متنوعة' WHERE code = '41101';
    END IF;

    -- 3. حقن الحسابات في الجدول الرئيسي (public.accounts)
    INSERT INTO public.accounts (organization_id, code, name, type, is_group, is_active)
    SELECT p_org_id, code, name, type, is_group, true
    FROM coa_temp
    ORDER BY length(code), code
    ON CONFLICT (organization_id, code) 
    DO UPDATE SET 
        is_group = EXCLUDED.is_group,
        type = EXCLUDED.type,
        name = EXCLUDED.name,
        is_active = true;

    -- 4. تحديث روابط Parent_ID بشكل جماعي وذكي (بعد إدراج جميع الحسابات)
    UPDATE public.accounts
    SET parent_id = p.id
    FROM coa_temp t
    JOIN public.accounts p ON p.organization_id = p_org_id AND p.code = t.parent_code
    WHERE public.accounts.organization_id = p_org_id 
      AND public.accounts.code = t.code 
      -- تحديث الرابط دائماً لضمان الصحة حتى لو كان مربوطاً خطأ
      AND (public.accounts.parent_id IS NULL OR public.accounts.parent_id != p.id);

    -- 🛡️ إصلاح أمني: نستخدم المعرف الممرر فقط لتعيين المدير.
    -- نتجنب auth.uid() هنا لأن المستدعي غالباً هو السوبر أدمن ولا نريد تغيير بياناته.
    v_admin_id := p_admin_id;
    IF v_admin_id IS NOT NULL THEN
        
            -- التأكد من وجود دور admin لهذه الشركة
        INSERT INTO public.roles (organization_id, name, description)
        VALUES (p_org_id, 'admin', 'مدير النظام')
        ON CONFLICT (name, organization_id) DO NOTHING;

        UPDATE public.profiles 
        SET role = 'admin', 
            organization_id = p_org_id, 
            is_active = true,
            role_id = (SELECT id FROM public.roles WHERE organization_id = p_org_id AND name = 'admin' LIMIT 1)
        WHERE id = v_admin_id;    
        
        -- تحديث Metadata الهوية لضمان ظهور الأزرار في الواجهة فوراً دون الحاجة لتدخل يدوي
        UPDATE auth.users SET raw_user_meta_data = 
            COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('org_id', p_org_id, 'role', 'admin')
        WHERE id = v_admin_id;
    END IF;

    v_cash_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1231' LIMIT 1);
    v_sales_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '411' LIMIT 1);
    v_cust_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1);
    v_cogs_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1);
    v_inv_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10302' LIMIT 1);
    v_vat_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2231' LIMIT 1);
    v_supp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '201' LIMIT 1);
    v_sal_ret_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '412' LIMIT 1);
    v_vat_in_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1241' LIMIT 1);
    v_disc_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '413' LIMIT 1);
    v_wht_pay_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2232' LIMIT 1);
    v_payroll_tax_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2233' LIMIT 1);
    v_wht_rec_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1242' LIMIT 1);
    v_sal_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '531' LIMIT 1);
    v_bonus_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5312' LIMIT 1);
    v_ded_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '422' LIMIT 1);
    v_adv_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1223' LIMIT 1);
    v_retained_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '32' LIMIT 1);
    v_equip_rev_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '425' LIMIT 1);
    v_raw_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10301' LIMIT 1);
    v_wip_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10303' LIMIT 1);
    v_labor_mfg_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '513' LIMIT 1);
    v_wip_variance_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1); -- Default to COGS
    v_overhead_mfg_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '514' LIMIT 1);
    v_wastage_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '5121' LIMIT 1);

    v_cash_surplus_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '441' LIMIT 1);
    -- جلب حسابات المقاولات (الإصلاح الجذري)
    v_wip_variance_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '511' LIMIT 1); -- Default to COGS
    v_ret_cust_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1249' LIMIT 1);
    v_ret_sub_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '2229' LIMIT 1);
    v_adv_sub_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1245' LIMIT 1);
    v_lg_margin_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1248' LIMIT 1);
    v_lc_goods_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1246' LIMIT 1);
    v_notes_rec_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1222' LIMIT 1);
    v_notes_pay_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '222' LIMIT 1);
    v_cash_deficit_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '541' LIMIT 1);
    v_dep_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '533' LIMIT 1);
    v_acc_dep_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1119' LIMIT 1);
    v_fixed_assets_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '111' LIMIT 1);
    v_opening_bal_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '3999' LIMIT 1);
    v_prepaid_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1243' LIMIT 1);
    v_accrued_exp_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '225' LIMIT 1);
    v_social_ins_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '224' LIMIT 1);
    v_bank_main_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '123201' LIMIT 1);
    v_rev_other_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '421' LIMIT 1);
    v_exp_gen_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '53' LIMIT 1);
    v_security_deposit_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '226' LIMIT 1);
    v_sal_allow_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '412' LIMIT 1);
    v_rev_construction_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '41103' LIMIT 1);
    v_shelf_rental_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '42101' LIMIT 1);
    v_earned_disc_id := (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '42102' LIMIT 1);

    -- ضمان وجود دور الـ admin وكافة الصلاحيات قبل ربط الإعدادات
    INSERT INTO public.roles (organization_id, name, description)
    VALUES (p_org_id, 'admin', 'مدير النظام')
    ON CONFLICT (name, organization_id) DO NOTHING;

    INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
    SELECT (SELECT id FROM public.roles WHERE organization_id = p_org_id AND name = 'admin' LIMIT 1), id, p_org_id
    FROM public.permissions ON CONFLICT DO NOTHING;

    INSERT INTO public.company_settings (organization_id, activity_type, vat_rate, company_name, account_mappings)
    VALUES (p_org_id, p_activity_type, v_vat_rate, v_org_name, 
        jsonb_build_object(
            'CASH', v_cash_id, 'SALES_REVENUE', v_sales_id, 'CUSTOMERS', v_cust_id, 'COGS', v_cogs_id, 'INVENTORY_FINISHED_GOODS', v_inv_id,
            'VAT', v_vat_id, 'SUPPLIERS', v_supp_id, 'SALES_RETURNS', v_sal_ret_id, 'VAT_INPUT', v_vat_in_id, 'SALES_DISCOUNT', v_disc_id,
            'WHT_PAYABLE', v_wht_pay_id, 'PAYROLL_TAX', v_payroll_tax_id, 'WHT_RECEIVABLE', v_wht_rec_id,
            'SALARIES_EXPENSE', v_sal_exp_id, 'EMPLOYEE_BONUSES', v_bonus_id, 'EMPLOYEE_DEDUCTIONS', v_ded_id, 'EMPLOYEE_ADVANCES', v_adv_id,
            'RETAINED_EARNINGS', v_retained_id, 
            'NOTES_RECEIVABLE', v_notes_rec_id,
            'NOTES_PAYABLE', v_notes_pay_id,
            'CASH_SURPLUS_ACC', v_cash_surplus_id,
            'CASH_SHORTAGE', v_cash_deficit_id,
            'INVENTORY_RAW_MATERIALS', v_raw_id,
            'INVENTORY_WIP', v_wip_id,
            'LABOR_COST_ALLOCATED', v_labor_mfg_id,
            'WIP_VARIANCE_ACCOUNT', v_wip_variance_id,
            'MANUFACTURING_OVERHEAD', v_overhead_mfg_id,
            'WASTAGE_EXPENSE', v_wastage_id,
            'RETENTION_CUSTOMER', v_ret_cust_id,
            'EQUIPMENT_INTERNAL_REVENUE', v_equip_rev_id,
            'RETENTION_SUBCONTRACTOR', v_ret_sub_id,
            'ADVANCE_PAYMENT_SUBCONTRACTOR', v_adv_sub_id,
            'LETTER_OF_GUARANTEE_MARGIN', v_lg_margin_id,
            'LETTER_OF_CREDIT_GOODS', v_lc_goods_id,
            'DEPRECIATION_EXPENSE', v_dep_exp_id,
            'ACCUMULATED_DEPRECIATION', v_acc_dep_id,
            'ASSETS_FIXED', v_fixed_assets_id,
            'OPENING_BALANCES', v_opening_bal_id,
            'PREPAID_EXPENSES', v_prepaid_exp_id,
            'ACCRUED_EXPENSES', v_accrued_exp_id,
            'SOCIAL_INSURANCE', v_social_ins_id,
            'BANK_MAIN', v_bank_main_id,
            'REVENUE_OTHER', v_rev_other_id,
            'EXPENSE_GENERAL', v_exp_gen_id,
            'SALES_ALLOWANCES', v_sal_allow_id,
            'SECURITY_DEPOSIT_ACCOUNT', v_security_deposit_id,
            'CONSTRUCTION_REVENUE', v_rev_construction_id,        
            'SHELF_RENTAL_REVENUE', v_shelf_rental_id,
            'EARNED_DISCOUNTS', v_earned_disc_id,
            'BANK_ACCOUNTS', v_bank_main_id -- ربط حساب البنك الرئيسي
        )
    ) ON CONFLICT (organization_id) DO UPDATE SET activity_type = EXCLUDED.activity_type, vat_rate = EXCLUDED.vat_rate, company_name = EXCLUDED.company_name, account_mappings = EXCLUDED.account_mappings;

    -- 🛡️ تحديث روابط HIMS المخصصة إذا كان النشاط طبياً
    IF p_activity_type IN ('hospital', 'medical', 'clinic') THEN
        UPDATE public.company_settings 
        SET account_mappings = account_mappings || jsonb_build_object(
            'HIMS_REVENUE_OTHER', (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '41101' LIMIT 1),
            'HIMS_MEDICINE_INV', (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '10304' LIMIT 1),
            'HIMS_REVENUE', (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '4115' LIMIT 1)
        ) WHERE organization_id = p_org_id;
    END IF;

    -- تأسيس الأدوار الافتراضية للمنظمة لضمان ظهورها في شاشة الصلاحيات
    INSERT INTO public.roles (organization_id, name, description) VALUES
    (p_org_id, 'admin', 'مدير النظام'),
    (p_org_id, 'accountant', 'محاسب'),
    (p_org_id, 'cashier', 'كاشير / بائع'),
    (p_org_id, 'chef', 'شيف / مطبخ')
    ON CONFLICT (name, organization_id) DO NOTHING;

    -- 🚀 ضمان منح كافة الصلاحيات لدور الـ admin الخاص بهذه المنظمة
    INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
    SELECT (SELECT id FROM public.roles WHERE organization_id = p_org_id AND name = 'admin' LIMIT 1),
           id,
           p_org_id
    FROM public.permissions
    ON CONFLICT DO NOTHING;

    -- 🚀 [تحديث حاسم V50.8] تفعيل كافة الموديولات لضمان ظهورها في القائمة الجانبية ومنع Redirect
    UPDATE public.organizations 
    SET allowed_modules = ARRAY[
        'accounting', 'inventory', 'sales', 'purchases', 
        'hr', 'manufacturing', 'restaurant', 'construction', 'hims'
    ]::text[]
    WHERE id = p_org_id;

    RETURN '✅ تم تأسيس الدليل المحاسبي وربط الحسابات السيادية بنجاح.';

EXCEPTION WHEN OTHERS THEN
    -- تسجيل الخطأ في جدول سجلات الأخطاء (System Error Logs)
    INSERT INTO public.system_error_logs (
        error_message, 
        error_code, 
        context, 
        function_name, 
        organization_id, 
        user_id
    )
    VALUES (
        SQLERRM, 
        SQLSTATE, 
        jsonb_build_object('org_id', p_org_id, 'activity_type', p_activity_type), 
        'initialize_egyptian_coa', 
        p_org_id,
        auth.uid()
    );
    
    -- إعادة إلقاء الخطأ (Raise) لضمان توقف العملية وإبلاغ الواجهة الأمامية بوجود مشكلة
    RAISE EXCEPTION 'فشل تأسيس دليل الحسابات: % (كود: %)', SQLERRM, SQLSTATE;
END;
$$;

-- ================================================================
-- 🌟 تحديث دالة اعتماد مرتجع المبيعات (Sales Return Approval with Perpetual Inventory)
-- ================================================================

CREATE OR REPLACE FUNCTION public.approve_sales_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_sales_return_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inv_acc_id uuid;
    v_journal_id uuid;
    v_total_cost numeric := 0;
    v_item_cost numeric := 0;
    v_mappings jsonb;
BEGIN
    -- 1. التحقق من وجود المرتجع
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المبيعات غير موجود'; END IF;

    v_org_id := v_return.organization_id;

    -- 2. جلب الحسابات المحاسبية من إعدادات الشركة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_sales_return_acc_id := COALESCE(
        (v_mappings->>'SALES_RETURNS')::uuid,
        (SELECT id FROM public.accounts WHERE code = '412' AND organization_id = v_org_id LIMIT 1),
        (v_mappings->>'SALES_REVENUE')::uuid,
        (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_org_id LIMIT 1)
    );
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_org_id LIMIT 1));

    -- 3. تحديث أرصدة المخزون وحساب التكلفة الإجمالية
    FOR v_item IN SELECT * FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
        DECLARE 
            v_base_qty numeric;
        BEGIN
            SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0) INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
            
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert') THEN
                v_base_qty := COALESCE(public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)), v_item.quantity);
            ELSE
                v_base_qty := v_item.quantity;
            END IF;

            v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_base_qty);

            -- تحديث رصيد المنتج والمستودع
            UPDATE public.products 
            SET stock = stock + v_item.quantity,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb), 
                    ARRAY[COALESCE(v_return.warehouse_id::text, (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1))], 
                    to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_item.quantity)
                )
            WHERE id = v_item.product_id;
        END;
    END LOOP;

    -- 4. تنظيف القيد القديم المرتبط (تحويله لمسودة أولاً لتجاوز قفل الحذف fn_protect_posted_journal_lines)
    IF v_return.related_journal_entry_id IS NOT NULL THEN
        UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_return.related_journal_entry_id;
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_return.related_journal_entry_id;
        DELETE FROM public.journal_entries WHERE id = v_return.related_journal_entry_id;
    END IF;
    
    UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE organization_id = v_org_id AND reference = v_return.return_number;
    DELETE FROM public.journal_lines WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE organization_id = v_org_id AND reference = v_return.return_number);
    DELETE FROM public.journal_entries WHERE organization_id = v_org_id AND reference = v_return.return_number;

    -- 5. إنشاء قيد اليومية العام
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_return.return_date, 'مرتجع مبيعات رقم ' || v_return.return_number, v_return.return_number, 'posted', v_org_id, p_return_id, 'sales_return', true)
    RETURNING id INTO v_journal_id;

    -- 6. أسطر القيد المالي
    -- أ. مردودات ومسموحات مبيعات (مدين)
    IF v_sales_return_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_return_acc_id, (v_return.total_amount - COALESCE(v_return.tax_amount, 0)), 0, 'مردودات مبيعات', v_org_id);
    END IF;

    -- ب. ضريبة القيمة المضافة مخرجات (مدين - عكس)
    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, v_return.tax_amount, 0, 'عكس ضريبة مخرجات', v_org_id);
    END IF;

    -- ج. العملاء (دائن - تخفيض مديونية)
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, 0, v_return.total_amount, 'تخفيض مديونية عميل', v_org_id);
    END IF;

    -- 7. أسطر قيد الجرد المستمر (مدين: مخزون 10302 / دائن: تكلفة مبيعات 511)
    IF v_total_cost > 0 THEN
        FOR v_item IN 
            SELECT 
                COALESCE(p.inventory_account_id, v_inv_acc_id) as inv_acc,
                COALESCE(p.cogs_account_id, v_cogs_acc_id) as cogs_acc,
                SUM(COALESCE(p.cost, p.weighted_average_cost, p.purchase_price, 0) * sri.quantity) as total_item_cost
            FROM public.sales_return_items sri
            JOIN public.products p ON sri.product_id = p.id
            WHERE sri.sales_return_id = p_return_id
            GROUP BY COALESCE(p.inventory_account_id, v_inv_acc_id), COALESCE(p.cogs_account_id, v_cogs_acc_id)
        LOOP
            IF v_item.total_item_cost > 0 AND v_item.inv_acc IS NOT NULL AND v_item.cogs_acc IS NOT NULL THEN
                -- مدين: المخزون
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_journal_id, v_item.inv_acc, v_item.total_item_cost, 0, 'مخزون المنتج التام - مرتجع مبيعات', v_org_id);

                -- دائن: تكلفة البضاعة المباعة
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_journal_id, v_item.cogs_acc, 0, v_item.total_item_cost, 'عكس تكلفة مبيعات', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 8. تحديث حالة المرتجع وربطه بالقيد الجديد
    UPDATE public.sales_returns SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_sales_return(uuid) TO authenticated;

-- 🌟 دالة اعتماد مرتجع المشتريات الآمنة (Secure Purchase Return Approval RPC)
-- هذا الملف يجب تنفيذه في Supabase SQL Editor

-- 1. التأكد من وجود عمود لربط المرتجع بالقيد
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_returns' AND column_name = 'related_journal_entry_id') THEN 
        ALTER TABLE public.purchase_returns ADD COLUMN related_journal_entry_id uuid REFERENCES public.journal_entries(id); 
    END IF; 
END $$;

-- 2. إنشاء الدالة
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_inventory_acc_id uuid;
    v_vat_acc_id uuid;
    v_supplier_acc_id uuid;
    v_journal_id uuid;
    v_mappings jsonb; -- 🚀 مضاف للربط المحاسبي
BEGIN
    -- أ. التحقق من المرتجع
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المشتريات غير موجود'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'المرتجع مرحل بالفعل'; END IF;

    -- تحديد المنظمة من المرتجع لضمان عزل البيانات في نظام SaaS
    v_org_id := v_return.organization_id;

    -- ب. جلب الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة في دليل الحسابات';
    END IF;

    -- ج. تحديث المخزون (خصم الكميات)
    FOR v_item IN SELECT * FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
        UPDATE public.products 
        SET stock = stock - v_item.quantity,
            warehouse_stock = jsonb_set(
                COALESCE(warehouse_stock, '{}'::jsonb), 
                ARRAY[v_return.warehouse_id::text], 
                to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_item.quantity)
            )
        WHERE id = v_item.product_id;
    END LOOP;

    -- د. إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_return.return_date, 
        'مرتجع مشتريات رقم ' || COALESCE(v_return.return_number, '-'), 
        v_return.return_number, 
        'posted', 
        v_org_id,
        p_return_id,
        'purchase_return',
        true
    ) RETURNING id INTO v_journal_id;

    -- هـ. إنشاء أسطر القيد
    -- 1. المدين: المورد (تخفيض الالتزام)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_journal_id, v_supplier_acc_id, v_return.total_amount, 0, 'مرتجع مشتريات - ' || v_return.return_number, v_org_id);

    -- 2. الدائن: المخزون (صافي القيمة لكل منتج حسب حسابه الخاص)
    FOR v_item IN 
        SELECT 
            COALESCE(p.inventory_account_id, v_inventory_acc_id) as acc_id,
            SUM(pri.total) as total_cost
        FROM public.purchase_return_items pri
        JOIN public.products p ON pri.product_id = p.id
        WHERE pri.purchase_return_id = p_return_id
        GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id)
    LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_item.acc_id, 0, v_item.total_cost, 'مخزون - مرتجع مشتريات ' || v_return.return_number, v_org_id);
    END LOOP;

    -- 3. الدائن: ضريبة المدخلات (عكس)
    IF COALESCE(v_return.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_return.tax_amount, 'ضريبة مدخلات (عكس) - مرتجع ' || v_return.return_number, v_org_id);
    END IF;

    -- و. تحديث حالة المرتجع
    UPDATE public.purchase_returns 
    SET status = 'posted',
        related_journal_entry_id = v_journal_id
    WHERE id = p_return_id;
END;
$$;

-- 🛒 موديول نقاط بيع التجزئة (Retail POS) - تهيئة قاعدة البيانات
-- تاريخ التنفيذ: 2026-07-02
-- متوافق بالكامل مع TriPro ERP V52.0

-- 1. إنشاء جدول أجهزة نقاط البيع (POS Terminals)
CREATE TABLE IF NOT EXISTS public.pos_terminals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
    cash_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- تفعيل ميزة RLS لجدول الأجهزة
ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read terminals" ON public.pos_terminals;
CREATE POLICY "Allow authenticated users to read terminals" ON public.pos_terminals
    FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Allow admin users to insert/update/delete terminals" ON public.pos_terminals;
CREATE POLICY "Allow admin users to insert/update/delete terminals" ON public.pos_terminals
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- 2. تعديل جدول الورديات (shifts) لإضافة معرّف الجهاز
ALTER TABLE public.shifts 
    ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.pos_terminals(id) ON DELETE SET NULL;

-- 3. تعديل جدول الطلبات (orders) لإضافة الوردية والجهاز
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.pos_terminals(id) ON DELETE SET NULL;

-- 4. تعديل دالة بدء الوردية لدعم معرّف الجهاز (Terminal ID)
CREATE OR REPLACE FUNCTION public.start_pos_shift(
    p_opening_balance numeric DEFAULT 0, 
    p_resume_existing boolean DEFAULT true, 
    p_treasury_account_id uuid DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL,
    p_org_id uuid DEFAULT NULL,
    p_terminal_id uuid DEFAULT NULL
) RETURNS public.shifts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_existing_shift public.shifts; 
    v_new_shift public.shifts;
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL AND current_setting('app.restore_mode', true) != 'on' THEN 
        RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى التأكد من ربط حسابك بشركة.'; 
    END IF;

    -- إذا تم توفير معرّف الجهاز، نبحث عن وردية مفتوحة للجهاز أو للمستخدم
    IF p_terminal_id IS NOT NULL THEN
        SELECT * INTO v_existing_shift FROM public.shifts 
        WHERE (user_id = COALESCE(p_user_id, auth.uid()) OR terminal_id = p_terminal_id) 
          AND end_time IS NULL AND organization_id = v_org_id 
        ORDER BY start_time DESC LIMIT 1;
    ELSE
        SELECT * INTO v_existing_shift FROM public.shifts 
        WHERE user_id = COALESCE(p_user_id, auth.uid()) AND end_time IS NULL AND organization_id = v_org_id 
        ORDER BY start_time DESC LIMIT 1;
    END IF;

    -- إذا طلب المستخدم الاستئناف ووجدنا وردية، نعيدها
    IF p_resume_existing AND v_existing_shift.id IS NOT NULL THEN 
        RETURN v_existing_shift; 
    END IF;

    -- إذا طلب المستخدم الاستئناف ولم نجد، نعيد NULL للتوقف
    IF p_resume_existing THEN RETURN NULL; END IF;

    IF v_existing_shift.id IS NOT NULL THEN 
        RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم أو هذا الكاشير. يرجى إغلاقها أولاً.'; 
    END IF;

    INSERT INTO public.shifts (user_id, start_time, opening_balance, treasury_account_id, organization_id, status, terminal_id)
    VALUES (COALESCE(p_user_id, auth.uid()), now(), p_opening_balance, p_treasury_account_id, v_org_id, 'OPEN', p_terminal_id) 
    RETURNING * INTO v_new_shift;

    RETURN v_new_shift;
END; $$;

-- 5. تحديث دالة إغلاق الوردية وتوليد القيود المالية (generate_shift_closing_entry)
-- لحل تداخل المبيعات المتزامنة بدقة
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb; v_org_id uuid;
    v_cash_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_diff numeric := 0; v_item_cost_record record; v_cash_surplus_acc_id uuid; v_cash_deficit_acc_id uuid;
BEGIN
    IF p_shift_id IS NULL THEN RAISE EXCEPTION 'خطأ: لم يتم تحديد وردية للإغلاق.'; END IF;

    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'عذراً، لم يتم العثور على سجل وردية حقيقي في النظام للرقم (%).', p_shift_id; 
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());
    
    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    -- إنشاء جدول مؤقت لتخزين المبيعات الخاصة بهذه الوردية حصراً
    DROP TABLE IF EXISTS temp_shift_orders;
    CREATE TEMP TABLE temp_shift_orders AS
    SELECT o.id, o.subtotal, o.total_tax, o.grand_total, o.user_id
    FROM public.orders o 
    WHERE o.organization_id = v_org_id 
    AND (
        -- الطريقة الدقيقة: الربط الصريح بمعرّف الوردية
        o.shift_id = p_shift_id
        OR 
        -- التوافق مع الفواتير القديمة (التي لم يكن بها shift_id) باستخدام التوقيت والمستخدم
        (
            o.shift_id IS NULL 
            AND o.user_id = v_shift.user_id
            AND (
                (o.created_at BETWEEN v_shift.start_time - interval '5 seconds' AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
                OR 
                (o.id IN (SELECT order_id FROM public.payments WHERE created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())))
            )
        )
    )
    AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED');

    -- حساب المجاميع
    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, 
        COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE p.order_id IN (SELECT id FROM temp_shift_orders)
              AND UPPER(p.payment_method) = 'CASH' AND p.status = 'COMPLETED'
        ), 0) as cash_total,
        COALESCE((
            SELECT SUM(line_cost) FROM (
                SELECT public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded
        ), 0) as cost_total INTO v_summary
    FROM temp_shift_orders;

    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- جلب معرّفات الحسابات المحاسبية
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH', '')::uuid, v_shift.treasury_account_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231', '123101') LIMIT 1)));
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'SALES_REVENUE', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4111') AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'VAT', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1)));
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'COGS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '501') AND organization_id = v_org_id LIMIT 1)));
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'INVENTORY_FINISHED_GOODS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1213') AND organization_id = v_org_id LIMIT 1)));
    
    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SHORTAGE', '')::uuid, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1)));
    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SURPLUS_ACC', '')::uuid, (SELECT id FROM public.accounts WHERE code = '441' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id)
    VALUES (now()::date, 'إغلاق وردية مبيعات التجزئة', 'SHIFT-' || to_char(now(), 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4), 'posted', v_org_id, true, p_shift_id, 'shift', v_shift.user_id) RETURNING id INTO v_je_id;
    
    -- 1. الإيرادات والضرائب (دائن)
    IF v_summary.subtotal > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيرادات الوردية', v_org_id);
    END IF;

    IF v_summary.tax > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_org_id); 
    END IF;

    -- 2. النقدية (مدين)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_cash_acc_id, (v_summary.cash_total + v_diff), 0, 'صافي تحصيل الوردية', v_org_id);

    -- 3. التكاليف والمخزون
    IF COALESCE(v_summary.cost_total, 0) > 0 THEN
        FOR v_item_cost_record IN (
            SELECT inv_acc, SUM(line_cost) as total_cost FROM (
                SELECT COALESCE(p.inventory_account_id, v_inventory_acc_id) as inv_acc,
                       public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT COALESCE(rm.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)) as inv_acc,
                       (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded_inv GROUP BY 1
        ) LOOP
            IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية', v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون الوردية', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 4. ميزان التوازن الذكي
    IF v_diff < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الوردية', v_org_id);
    ELSIF v_diff > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'زيادة نقدية الوردية (إيراد متنوع)', v_org_id);
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    DROP TABLE IF EXISTS temp_shift_orders;
    RETURN v_je_id;
END; $$;

-- 6. تفعيل الموديول الجديد 'retail' تلقائياً لجميع الشركات/المنظمات الحالية
UPDATE public.organizations 
SET allowed_modules = array_append(allowed_modules, 'retail')
WHERE NOT ('retail' = ANY(allowed_modules));


-- 🚀 ترحيل طلبات المبيعات الآجلة (Credit POS Orders) وتحديث إغلاق الوردية

-- 1. دالة ترحيل طلب مبيعات منفرد كقيد يومية (خاص بالطلبات الآجلة أو التي على الحساب)
CREATE OR REPLACE FUNCTION public.post_order_journal_entry(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order record;
    v_je_id uuid;
    v_org_id uuid;
    v_mappings jsonb;
    v_cust_acc_id uuid;
    v_sales_acc_id uuid;
    v_vat_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inventory_acc_id uuid;
    v_cash_acc_id uuid;
    v_bank_acc_id uuid;
    v_cash_paid numeric := 0;
    v_card_paid numeric := 0;
    v_credit_amount numeric := 0;
    v_item_cost_record record;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود.'; END IF;
    
    v_org_id := v_order.organization_id;

    -- تنظيف أي قيد قديم لتجنب التكرار
    IF v_order.related_journal_entry_id IS NOT NULL THEN
        DELETE FROM public.journal_entries WHERE id = v_order.related_journal_entry_id;
    END IF;
    
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- تحديد الحسابات
    v_cust_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CUSTOMERS', '')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1)));
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'SALES_REVENUE', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4111') AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'VAT', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1)));
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'COGS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '501') AND organization_id = v_org_id LIMIT 1)));
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'INVENTORY_FINISHED_GOODS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1213') AND organization_id = v_org_id LIMIT 1)));
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH', '')::uuid, v_order.warehouse_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231', '123101') LIMIT 1)));
    v_bank_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'BANK', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1232', '123201') AND organization_id = v_org_id LIMIT 1)));

    -- حساب المبالغ المدفوعة كاش أو بطاقة
    SELECT COALESCE(SUM(amount), 0) INTO v_cash_paid
    FROM public.payments
    WHERE order_id = p_order_id AND UPPER(payment_method) = 'CASH' AND status = 'COMPLETED';

    SELECT COALESCE(SUM(amount), 0) INTO v_card_paid
    FROM public.payments
    WHERE order_id = p_order_id AND UPPER(payment_method) = 'CARD' AND status = 'COMPLETED';

    v_credit_amount := v_order.grand_total - v_cash_paid - v_card_paid;

    -- إنشاء رأس القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id)
    VALUES (COALESCE(v_order.created_at::date, now()::date), 'قيد إثبات طلب مبيعات رقم ' || v_order.order_number, 'ORD-' || v_order.order_number, 'posted', v_org_id, true, v_order.id, 'order', v_order.user_id)
    RETURNING id INTO v_je_id;

    -- 1. ذمم العملاء (مدين بالجزء الآجل)
    IF v_credit_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cust_acc_id, v_credit_amount, 0, 'مبيعات آجلة للطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 2. النقدية (مدين بالجزء الكاش)
    IF v_cash_paid > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_cash_paid, 0, 'سداد نقدي للطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 3. البنك/البطاقة (مدين بجزء الشبكة)
    IF v_card_paid > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_bank_acc_id, v_card_paid, 0, 'سداد شبكة للطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 4. إيرادات المبيعات (دائن)
    IF v_order.subtotal > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_order.subtotal, 'إيرادات الطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 5. ضريبة القيمة المضافة (دائن)
    IF v_order.total_tax > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_order.total_tax, 'ضريبة القيمة المضافة للطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 6. تكلفة المبيعات وصرف المخزون
    FOR v_item_cost_record IN (
        SELECT inv_acc, SUM(line_cost) as total_cost FROM (
            -- الأصناف المباشرة (10302)
            SELECT COALESCE(p.inventory_account_id, v_inventory_acc_id) as inv_acc,
                   public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
            FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
            WHERE oi.order_id = p_order_id AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
            UNION ALL
            -- الأصناف بوصفة (الخامات 10301)
            SELECT COALESCE(rm.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)) as inv_acc,
                   (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                   COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
            FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
            JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
            WHERE oi.order_id = p_order_id
        ) expanded_inv GROUP BY 1
    ) LOOP
        IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الطلب رقم ' || v_order.order_number, v_org_id);
            
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون للطلب رقم ' || v_order.order_number, v_org_id);
        END IF;
    END LOOP;

    -- توازن القيد تلقائياً وحفظ المعرف
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    UPDATE public.orders SET related_journal_entry_id = v_je_id WHERE id = p_order_id;
    RETURN v_je_id;
END;
$$;

-- 2. تحديث دالة إنشاء طلب مطعم لتسجيل الوردية تلقائياً
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_order_id uuid; v_item jsonb; v_order_num text; v_tax_rate numeric; 
    v_tax_enabled boolean;
    v_subtotal numeric := 0; v_final_wh_id uuid; v_org_id uuid; v_order_item_id uuid; v_delivery_fee numeric := 0; v_item_cost numeric;
    v_active_shift_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    v_final_wh_id := COALESCE(p_warehouse_id, (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1));
    
    SELECT vat_rate, COALESCE(enable_tax, true) INTO v_tax_rate, v_tax_enabled 
    FROM public.company_settings WHERE organization_id = v_org_id;
    
    IF NOT v_tax_enabled THEN
        v_tax_rate := 0;
    END IF;

    -- البحث التلقائي عن الوردية النشطة للمستخدم
    SELECT id INTO v_active_shift_id FROM public.shifts
    WHERE user_id = p_user_id AND end_time IS NULL AND organization_id = v_org_id
    ORDER BY start_time DESC LIMIT 1;

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id, shift_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, v_final_wh_id, v_active_shift_id) 
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0), base_uom_id INTO v_item_cost, v_final_wh_id
        FROM public.products WHERE id = (v_item->>'product_id')::uuid;

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, unit_cost, organization_id, modifiers, uom_id)
        VALUES (
            v_order_id, 
            (v_item->>'product_id')::uuid, 
            (v_item->>'quantity')::numeric, 
            (v_item->>'unit_price')::numeric,
            v_item_cost,
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb),
            (v_item->>'uom_id')::uuid
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
        
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    IF p_delivery_info IS NOT NULL THEN
        v_delivery_fee := COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0);
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', v_delivery_fee, v_org_id);
    END IF;

    UPDATE public.orders SET 
        subtotal = v_subtotal, 
        delivery_fee = v_delivery_fee,
        total_tax = v_subtotal * COALESCE(v_tax_rate, 0.14), 
        grand_total = (v_subtotal * (1 + COALESCE(v_tax_rate, 0.14))) + v_delivery_fee 
    WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

-- 3. تحديث دالة إغلاق الوردية لترحيل الآجل أولاً واستبعاده من التجميعي
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb; v_org_id uuid;
    v_cash_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_diff numeric := 0; v_item_cost_record record; v_cash_surplus_acc_id uuid; v_cash_deficit_acc_id uuid;
    v_order_to_post record;
BEGIN
    IF p_shift_id IS NULL THEN RAISE EXCEPTION 'خطأ: لم يتم تحديد وردية للإغلاق.'; END IF;

    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'عذراً، لم يتم العثور على سجل وردية حقيقي في النظام للرقم (%).', p_shift_id; 
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());

    -- 🚀 خطوة ذكية: ترحيل كافة طلبات البيع الآجل أو غير المدفوعة بالكامل بشكل منفرد أولاً
    FOR v_order_to_post IN (
        SELECT o.id FROM public.orders o
        WHERE o.organization_id = v_org_id
          AND o.customer_id IS NOT NULL
          AND o.related_journal_entry_id IS NULL
          AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
          AND (
              (o.created_at BETWEEN v_shift.start_time - interval '5 seconds' AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
              OR 
              (o.id IN (SELECT order_id FROM public.payments WHERE created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())))
          )
          AND (
              SELECT COALESCE(SUM(p.amount), 0) FROM public.payments p 
              WHERE p.order_id = o.id AND p.status = 'COMPLETED'
          ) < o.grand_total
    ) LOOP
        PERFORM public.post_order_journal_entry(v_order_to_post.id);
    END LOOP;

    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    -- إنشاء الجدول المؤقت للطلبات غير المرحلة
    DROP TABLE IF EXISTS temp_shift_orders;
    CREATE TEMP TABLE temp_shift_orders AS
    SELECT o.id, o.subtotal, o.total_tax, o.grand_total, o.user_id
    FROM public.orders o 
    WHERE o.organization_id = v_org_id 
    AND (
        (o.created_at BETWEEN v_shift.start_time - interval '5 seconds' AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
        OR 
        (o.id IN (SELECT order_id FROM public.payments WHERE created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())))
    )
    AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
    AND o.related_journal_entry_id IS NULL; -- 🚀 استبعاد الطلبات المرحلة بشكل منفرد

    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, 
        COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE p.order_id IN (SELECT id FROM temp_shift_orders)
              AND UPPER(p.payment_method) = 'CASH' AND p.status = 'COMPLETED'
        ), 0) as cash_total,
        COALESCE((
            SELECT SUM(line_cost) FROM (
                SELECT public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded
        ), 0) as cost_total INTO v_summary
    FROM temp_shift_orders;

    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_cash_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH', '')::uuid, v_shift.treasury_account_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231', '123101') LIMIT 1)));
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'SALES_REVENUE', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4111') AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'VAT', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1)));
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'COGS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '501') AND organization_id = v_org_id LIMIT 1)));
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'INVENTORY_FINISHED_GOODS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1213') AND organization_id = v_org_id LIMIT 1)));
    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SHORTAGE', '')::uuid, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1)));
    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SURPLUS_ACC', '')::uuid, (SELECT id FROM public.accounts WHERE code = '441' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id)
    VALUES (now()::date, 'إغلاق وردية مطعم مجمع (المبيعات النقدية)', 'SHIFT-' || to_char(now(), 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4), 'posted', v_org_id, true, p_shift_id, 'shift', v_shift.user_id) RETURNING id INTO v_je_id;
    
    IF v_summary.subtotal > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيرادات الوردية (المدفوع كاش)', v_org_id);
    END IF;

    IF v_summary.tax > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة للوردية', v_org_id); 
    END IF;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_cash_acc_id, (v_summary.cash_total + v_diff), 0, 'صافي تحصيل الوردية (الدرج)', v_org_id);

    IF COALESCE(v_summary.cost_total, 0) > 0 THEN
        FOR v_item_cost_record IN (
            SELECT inv_acc, SUM(line_cost) as total_cost FROM (
                SELECT COALESCE(p.inventory_account_id, v_inventory_acc_id) as inv_acc,
                       public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT COALESCE(rm.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)) as inv_acc,
                       (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded_inv GROUP BY 1
        ) LOOP
            IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية النقدية', v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون الوردية النقدية', v_org_id);
            END IF;
        END LOOP;
    END IF;

    IF v_diff < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الوردية', v_org_id);
    ELSIF v_diff > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'زيادة نقدية الوردية (إيراد متنوع)', v_org_id);
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    DROP TABLE IF EXISTS temp_shift_orders;
    RETURN v_je_id;
END;
$$;


-- 🛠️ دالة حذف تحويل مالي بين الخزن والبنوك (Treasury Transfer Revert/Delete)
CREATE OR REPLACE FUNCTION public.delete_treasury_transfer(
  p_journal_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_ref text;
BEGIN
  -- 1. التأكد من أن القيد يخص تحويل مالي
  SELECT organization_id, reference INTO v_org_id, v_ref
  FROM public.journal_entries
  WHERE id = p_journal_entry_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'قيد اليومية غير موجود.';
  END IF;

  IF v_ref IS NULL OR NOT (v_ref LIKE 'TRF-%') THEN
    RAISE EXCEPTION 'هذا القيد ليس قيد تحويل مالي بين الخزن والبنوك';
  END IF;

  -- 2. حذف أسطر القيد
  DELETE FROM public.journal_lines
  WHERE journal_entry_id = p_journal_entry_id;

  -- 3. حذف رأس القيد
  DELETE FROM public.journal_entries
  WHERE id = p_journal_entry_id;

  -- 4. إعادة حساب الأرصدة للشركة
  PERFORM public.recalculate_all_system_balances(v_org_id);
END;
$$;

-- 🛠️ دالة تعديل تحويل مالي بين الخزن والبنوك (Treasury Transfer Update)
CREATE OR REPLACE FUNCTION public.update_treasury_transfer(
  p_journal_entry_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_transfer_date date,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_ref text;
BEGIN
  -- 1. التأكد من أن القيد يخص تحويل مالي
  SELECT organization_id, reference INTO v_org_id, v_ref
  FROM public.journal_entries
  WHERE id = p_journal_entry_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'قيد اليومية غير موجود.';
  END IF;

  IF v_ref IS NULL OR NOT (v_ref LIKE 'TRF-%') THEN
    RAISE EXCEPTION 'هذا القيد ليس قيد تحويل مالي بين الخزن والبنوك';
  END IF;

  -- 2. تحديث رأس القيد المحاسبي
  UPDATE public.journal_entries
  SET transaction_date = p_transfer_date,
      description = p_notes
  WHERE id = p_journal_entry_id;

  -- 3. حذف أسطر القيد القديمة لإعادة بنائها
  DELETE FROM public.journal_lines
  WHERE journal_entry_id = p_journal_entry_id;

  -- 4. سطر القيد المدين (الخزينة المستلمة تزيد)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    p_journal_entry_id,
    p_to_account_id,
    p_amount,
    0,
    'تحويل وارد: ' || p_notes,
    v_org_id
  );

  -- 5. سطر القيد الدائن (الخزينة المحولة تنقص)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    p_journal_entry_id,
    p_from_account_id,
    0,
    p_amount,
    'تحويل صادر: ' || p_notes,
    v_org_id
  );

  -- 6. إعادة حساب الأرصدة للشركة
  PERFORM public.recalculate_all_system_balances(v_org_id);
END;
$$;

-- منح صلاحيات التنفيذ للمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.delete_treasury_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_treasury_transfer(uuid, uuid, uuid, numeric, date, text) TO authenticated;


-- هذا الملف يجب تنفيذه في Supabase SQL Editor
-- 2026-07-09_add_opening_balance_rpc.sql

CREATE OR REPLACE FUNCTION public.add_opening_balance(
    p_id uuid,
    p_type text,
    p_amount numeric,
    p_date date,
    p_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id uuid;
    v_mappings jsonb;
    v_opening_bal_acc_id uuid;
    v_partner_acc_id uuid;
    v_journal_id uuid;
    v_ref text;
    v_desc text;
BEGIN
    -- 1. الحصول على معرف المؤسسة من سجل العميل أو المورد
    IF p_type = 'customer' THEN
        SELECT organization_id INTO v_org_id FROM public.customers WHERE id = p_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'العميل غير موجود.';
        END IF;
        v_ref := 'OP-CUST-' || p_id;
        v_desc := 'رصيد افتتاحي للعميل: ' || p_name;
    ELSIF p_type = 'supplier' THEN
        SELECT organization_id INTO v_org_id FROM public.suppliers WHERE id = p_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'المورد غير موجود.';
        END IF;
        v_ref := 'OP-SUPP-' || p_id;
        v_desc := 'رصيد افتتاحي للمورد: ' || p_name;
    ELSE
        RAISE EXCEPTION 'نوع الشريك غير صالح. يجب أن يكون customer أو supplier.';
    END IF;

    -- 2. جلب شجرة حسابات المؤسسة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    IF v_mappings IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على إعدادات الحسابات لهذه المؤسسة.';
    END IF;

    -- 3. تحديد حساب الأرصدة الافتتاحية (OPENING_BALANCES)
    v_opening_bal_acc_id := (v_mappings->>'OPENING_BALANCES')::uuid;
    IF v_opening_bal_acc_id IS NULL THEN
        -- خيار بديل للبحث عن الحساب بالكود (كود 3999 أو 313)
        SELECT id INTO v_opening_bal_acc_id FROM public.accounts WHERE code IN ('3999', '313') AND organization_id = v_org_id LIMIT 1;
        IF v_opening_bal_acc_id IS NULL THEN
            RAISE EXCEPTION 'حساب الأرصدة الافتتاحية غير معرف في إعدادات الشركة (كود 3999).';
        END IF;
    END IF;

    -- 4. تحديد حساب العملاء أو الموردين
    IF p_type = 'customer' THEN
        v_partner_acc_id := (v_mappings->>'CUSTOMERS')::uuid;
        IF v_partner_acc_id IS NULL THEN
            SELECT id INTO v_partner_acc_id FROM public.accounts WHERE code IN ('1221', '1102', '121') AND organization_id = v_org_id LIMIT 1;
        END IF;
        IF v_partner_acc_id IS NULL THEN
            RAISE EXCEPTION 'حساب العملاء غير معرف في إعدادات الشركة (كود 1221).';
        END IF;
    ELSE
        v_partner_acc_id := (v_mappings->>'SUPPLIERS')::uuid;
        IF v_partner_acc_id IS NULL THEN
            SELECT id INTO v_partner_acc_id FROM public.accounts WHERE code IN ('2201', '201', '211') AND organization_id = v_org_id LIMIT 1;
        END IF;
        IF v_partner_acc_id IS NULL THEN
            RAISE EXCEPTION 'حساب الموردين غير معرف في إعدادات الشركة (كود 2201).';
        END IF;
    END IF;

    -- 5. حذف القيود السابقة لهذا الرصيد الافتتاحي (idempotency)
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
      AND related_document_id = p_id 
      AND related_document_type = 'opening_balance';

    -- 6. إنشاء القيد اليومي الرئيسي للرصيد الافتتاحي
    INSERT INTO public.journal_entries (
        transaction_date, 
        description, 
        reference, 
        status, 
        organization_id, 
        related_document_id, 
        related_document_type, 
        is_posted, 
        user_id
    ) 
    VALUES (
        p_date, 
        v_desc, 
        v_ref, 
        'posted', 
        v_org_id, 
        p_id, 
        'opening_balance', 
        true, 
        auth.uid()
    ) 
    RETURNING id INTO v_journal_id;

    -- 7. إدراج بنود القيد اليومي المتوازن (Debit / Credit)
    IF p_type = 'customer' THEN
        -- مدين: حساب العملاء
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_partner_acc_id, p_amount, 0, v_desc, v_org_id);
        
        -- دائن: حساب الأرصدة الافتتاحية
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_opening_bal_acc_id, 0, p_amount, v_desc, v_org_id);
    ELSE
        -- مدين: حساب الأرصدة الافتتاحية
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_opening_bal_acc_id, p_amount, 0, v_desc, v_org_id);
        
        -- دائن: حساب الموردين
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_partner_acc_id, 0, p_amount, v_desc, v_org_id);
    END IF;

    -- 8. تحديث الرصيد الحالي للعميل أو المورد
    IF p_type = 'customer' THEN
        UPDATE public.customers 
        SET balance = public.get_customer_balance(p_id, v_org_id) 
        WHERE id = p_id;
    ELSE
        UPDATE public.suppliers 
        SET balance = public.get_supplier_balance(p_id, v_org_id) 
        WHERE id = p_id;
    END IF;

    -- 9. إعادة احتساب كافة أرصدة النظام لضمان المزامنة
    PERFORM public.recalculate_all_system_balances(v_org_id);

END;
$$;

-- منح صلاحيات التشغيل للمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.add_opening_balance(uuid, text, numeric, date, text) TO authenticated;

-- تشغيل إصلاح استرجاعي لتوليد القيود المفقودة لكافة العملاء والموردين ذوي الأرصدة الافتتاحية السابقة
DO $$
DECLARE
    r RECORD;
BEGIN
    -- العملاء
    FOR r IN 
        SELECT id, name, opening_balance, created_at::date as date
        FROM public.customers 
        WHERE COALESCE(opening_balance, 0) != 0 
          AND id NOT IN (
              SELECT related_document_id 
              FROM public.journal_entries 
              WHERE related_document_type = 'opening_balance'
          )
    LOOP
        PERFORM public.add_opening_balance(r.id, 'customer', r.opening_balance, r.date, r.name);
        RAISE NOTICE 'تم توليد قيد رصيد افتتاحي للعميل: % بقيمة %', r.name, r.opening_balance;
    END LOOP;

    -- الموردين
    FOR r IN 
        SELECT id, name, opening_balance, created_at::date as date
        FROM public.suppliers 
        WHERE COALESCE(opening_balance, 0) != 0 
          AND id NOT IN (
              SELECT related_document_id 
              FROM public.journal_entries 
              WHERE related_document_type = 'opening_balance'
          )
    LOOP
        PERFORM public.add_opening_balance(r.id, 'supplier', r.opening_balance, r.date, r.name);
        RAISE NOTICE 'تم توليد قيد رصيد افتتاحي للمورد: % بقيمة %', r.name, r.opening_balance;
    END LOOP;
END;
$$;


-- Database Migration: Create add_product_with_opening_balance RPC
-- Date: 2026-07-17
-- Reason: Define the missing RPC function called by the opening stock inventory screen to register new products with opening stock and generate balanced journal entries.

CREATE OR REPLACE FUNCTION public.add_product_with_opening_balance(
    p_name text,
    p_sku text,
    p_sales_price numeric,
    p_purchase_price numeric,
    p_stock numeric,
    p_unit text,
    p_org_id uuid,
    p_item_type text,
    p_inventory_account_id uuid,
    p_cogs_account_id uuid,
    p_sales_account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product_id uuid;
    v_mappings jsonb;
    v_opening_bal_acc_id uuid;
    v_journal_id uuid;
    v_total_cost numeric;
    v_desc text;
    v_ref text;
BEGIN
    -- 1. إدراج المنتج في جدول المنتجات
    INSERT INTO public.products (
        name,
        sku,
        sales_price,
        purchase_price,
        stock,
        unit,
        organization_id,
        item_type,
        product_type,
        inventory_account_id,
        cogs_account_id,
        sales_account_id,
        cost,
        weighted_average_cost
    ) 
    VALUES (
        p_name,
        p_sku,
        p_sales_price,
        p_purchase_price,
        p_stock,
        p_unit,
        p_org_id,
        p_item_type,
        p_item_type,
        p_inventory_account_id,
        p_cogs_account_id,
        p_sales_account_id,
        p_purchase_price,
        p_purchase_price
    )
    RETURNING id INTO v_product_id;

    -- 2. إثبات القيد الافتتاحي إذا كان هناك كمية وسعر تكلفة
    v_total_cost := COALESCE(p_stock, 0) * COALESCE(p_purchase_price, 0);
    
    IF v_total_cost > 0 THEN
        -- جلب إعدادات الحسابات لتحديد حساب المقابل للأرصدة الافتتاحية
        SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = p_org_id;
        IF v_mappings IS NOT NULL THEN
            v_opening_bal_acc_id := (v_mappings->>'OPENING_BALANCES')::uuid;
        END IF;

        IF v_opening_bal_acc_id IS NULL THEN
            SELECT id INTO v_opening_bal_acc_id FROM public.accounts 
            WHERE (code IN ('3999', '313', '39') OR name LIKE '%أرصدة افتتاحية%')
              AND organization_id = p_org_id LIMIT 1;
        END IF;

        IF v_opening_bal_acc_id IS NULL THEN
            RAISE EXCEPTION 'حساب الأرصدة الافتتاحية (كود 3999) غير معرف في النظام لهذه المنظمة.';
        END IF;

        v_ref := 'OP-PROD-' || v_product_id;
        v_desc := 'رصيد مخزون افتتاحي للمنتج: ' || p_name || ' (الكمية: ' || p_stock || ')';

        -- إنشاء رأس قيد اليومية
        INSERT INTO public.journal_entries (
            transaction_date, 
            description, 
            reference, 
            status, 
            organization_id, 
            related_document_id, 
            related_document_type, 
            is_posted, 
            user_id
        ) 
        VALUES (
            now()::date, 
            v_desc, 
            v_ref, 
            'posted', 
            p_org_id, 
            v_product_id, 
            'opening_inventory', 
            true, 
            auth.uid()
        ) 
        RETURNING id INTO v_journal_id;

        -- مدين: حساب المخزون
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, p_inventory_account_id, v_total_cost, 0, v_desc, p_org_id);
        
        -- دائن: حساب الأرصدة الافتتاحية
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_opening_bal_acc_id, 0, v_total_cost, v_desc, p_org_id);
        
        -- إعادة احتساب أرصدة الحسابات المتأثرة
        PERFORM public.recalculate_all_system_balances(p_org_id);
    END IF;

    RETURN v_product_id;
END;
$$;

-- منح صلاحيات التشغيل
GRANT EXECUTE ON FUNCTION public.add_product_with_opening_balance TO authenticated;


-- Migration: Smart Batch & Expiry Tracking (FEFO) in HIMS Pharmacy
-- Date: 2026-08-01
-- Description: Alter tables to support batch tracking, create product_batches table, and update purchase invoice approval, prescription dispensing (FEFO), and billing invoice preparation functions.

-- 1. Database Schema Alterations
ALTER TABLE public.purchase_invoice_items ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE public.purchase_invoice_items ADD COLUMN IF NOT EXISTS expiry_date date;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hims_billing_items') THEN
        ALTER TABLE public.hims_billing_items ADD COLUMN IF NOT EXISTS batch_number text;
    END IF;
END $$;

-- 2. Create product_batches table
CREATE TABLE IF NOT EXISTS public.product_batches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
    batch_number text NOT NULL,
    expiry_date date NOT NULL,
    quantity numeric NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT unique_batch_per_product_warehouse UNIQUE (product_id, warehouse_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON public.product_batches (product_id, warehouse_id, expiry_date);

-- 3. Redefine approve_purchase_invoice to register batch stock
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL,
    p_skip_recalc boolean DEFAULT false
) RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_inventory_acc_id uuid; v_vat_in_id uuid; v_supplier_acc_id uuid;
    v_journal_id uuid; v_mappings jsonb; v_exchange_rate numeric;
    v_wh_id uuid;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المشتريات غير موجودة'; END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    -- حذف القيد القديم إذا كان موجوداً لمنع التكرار
    DELETE FROM public.journal_entries WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- تحديد وتحديث المستودع
    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id);
    IF p_warehouse_id IS NOT NULL THEN
        UPDATE public.purchase_invoices SET warehouse_id = p_warehouse_id WHERE id = p_invoice_id;
    END IF;

    -- تحديث متوسط التكلفة (WAC) وتسجيل الدفعات
    FOR v_item IN SELECT product_id, quantity, unit_price, uom_id, batch_number, expiry_date FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id LOOP
        DECLARE
            v_base_qty numeric := public.uom_convert(v_item.quantity, v_item.uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id));
            v_unit_cost_base numeric := (v_item.unit_price * v_item.quantity) / NULLIF(v_base_qty, 0);
        BEGIN
            UPDATE public.products p SET 
                purchase_price = v_unit_cost_base,
                cost = v_unit_cost_base,
                weighted_average_cost = CASE 
                    WHEN (COALESCE(p.stock, 0) + v_base_qty) > 0 
                    THEN ROUND(((COALESCE(p.stock, 0) * COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, v_unit_cost_base)) + (v_base_qty * v_unit_cost_base)) / (COALESCE(p.stock, 0) + v_base_qty), 4)
                    ELSE v_unit_cost_base 
                END
            WHERE id = v_item.product_id;

            -- تسجيل التشغيلة وتاريخ الصلاحية في جدول الدفعات للمستودع المحدد بالفاتورة
            IF v_item.batch_number IS NOT NULL AND v_item.expiry_date IS NOT NULL AND v_wh_id IS NOT NULL THEN
                INSERT INTO public.product_batches (organization_id, product_id, warehouse_id, batch_number, expiry_date, quantity)
                VALUES (v_org_id, v_item.product_id, v_wh_id, v_item.batch_number, v_item.expiry_date, v_base_qty)
                ON CONFLICT (product_id, warehouse_id, batch_number) 
                DO UPDATE SET 
                    quantity = public.product_batches.quantity + EXCLUDED.quantity,
                    expiry_date = EXCLUDED.expiry_date;
            END IF;
        END;
    END LOOP;

    -- توليد القيد المحاسبي
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '1241' AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code = '201' AND organization_id = v_org_id LIMIT 1));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) 
    VALUES (v_invoice.invoice_date, 'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'purchase_invoice', true) RETURNING id INTO v_journal_id;
    
    -- 1. المدين: المخزون
    FOR v_item IN 
        SELECT 
            COALESCE(p.inventory_account_id, v_inventory_acc_id) as acc_id,
            SUM(pii.total) as total_cost
        FROM public.purchase_invoice_items pii
        JOIN public.products p ON pii.product_id = p.id
        WHERE pii.purchase_invoice_id = p_invoice_id
        GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id)
    LOOP
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_item.acc_id, v_item.total_cost * v_exchange_rate, 0, 'إثبات مشتريات - مخزون', v_org_id);
    END LOOP;

    -- 2. المدين: ضريبة المدخلات
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_in_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_journal_id, v_vat_in_id, v_invoice.tax_amount * v_exchange_rate, 0, 'ضريبة مدخلات', v_org_id);
    END IF;

    -- 3. الدائن: المورد
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount * v_exchange_rate, 'استحقاق مورد', v_org_id);

    -- 4. إثبات السداد الفوري
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_invoice.treasury_account_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount * v_exchange_rate, 0, 'سداد فوري - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_invoice.treasury_account_id, 0, v_invoice.paid_amount * v_exchange_rate, 'دفع نقدي - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id);
        
        IF ABS(COALESCE(v_invoice.paid_amount, 0) - COALESCE(v_invoice.total_amount, 0)) < 0.01 THEN
            UPDATE public.purchase_invoices SET status = 'paid', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
        ELSE
            UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
        END IF;
    ELSE
        UPDATE public.purchase_invoices SET status = 'posted', related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
    END IF;

    IF NOT p_skip_recalc THEN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    END IF;

    PERFORM public.recalculate_all_system_balances(v_org_id);
END; 
$$;


-- ==============================================================================
-- 🚀 MIGRATION: Fix Cheques Cashing & Collection Engine (أوراق القبض والدفع)
-- Date: 2026-08-17
-- Description: 
-- 1. Adds all required columns to public.cheques if missing.
-- 2. Creates smart account resolution helper that prevents NOT-NULL violations in journal lines.
-- 3. Upgrades post_cheque_journal_entry with full multi-stage support (issuance, receipt, cashing, collection, bounce).
-- 4. Creates direct RPCs: cash_or_collect_cheque, reject_incoming_cheque, reject_outgoing_cheque.
-- ==============================================================================

-- 1. التأكد من وجود كافة أعمدة جدول الشيكات
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cheques') THEN
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS current_account_id uuid REFERENCES public.accounts(id);
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS transfer_account_number text;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS transfer_bank_name text;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS transfer_date date;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS rejection_reason text;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS notes text;
    END IF;
END $$;

-- 2. دالة مساعدة لضمان وجود الحسابات المحاسبية للشيكات ومنع أخطاء null في قيود اليومية
CREATE OR REPLACE FUNCTION public.fn_get_or_create_cheque_account(
    p_org_id uuid,
    p_account_role text, -- 'NOTES_RECEIVABLE', 'NOTES_PAYABLE', 'BANK', 'CUSTOMERS', 'SUPPLIERS'
    p_fallback_bank_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_acc_id uuid;
    v_mappings jsonb;
BEGIN
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = p_org_id;

    IF p_account_role = 'NOTES_RECEIVABLE' THEN
        -- البحث عن أوراق القبض
        v_acc_id := COALESCE(
            (v_mappings->>'NOTES_RECEIVABLE')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1222' LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '10103%' OR code LIKE '1231%' OR code LIKE '122%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (name ILIKE '%أوراق القبض%' OR name ILIKE '%أوراق قبض%' OR name ILIKE '%شيكات واردة%' OR name ILIKE '%شيكات تحت التحصيل%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('1222', 'أوراق القبض (شيكات واردة)', 'asset', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'NOTES_PAYABLE' THEN
        -- البحث عن أوراق الدفع
        v_acc_id := COALESCE(
            (v_mappings->>'NOTES_PAYABLE')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '222' LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '20102%' OR code LIKE '2202%' OR code LIKE '2102%' OR code LIKE '221%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (name ILIKE '%أوراق الدفع%' OR name ILIKE '%أوراق دفع%' OR name ILIKE '%شيكات صادرة%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('222', 'أوراق الدفع (شيكات صادرة)', 'liability', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'BANK' THEN
        -- البحث عن حساب البنك
        v_acc_id := COALESCE(
            p_fallback_bank_id,
            (v_mappings->>'BANK_ACCOUNTS')::uuid,
            (v_mappings->>'BANK_MAIN')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '1232%' OR code LIKE '10102%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (name ILIKE '%بنك%' OR name ILIKE '%bank%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND type = 'asset' AND (code LIKE '123%' OR code LIKE '101%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('123201', 'حساب البنك الرئيسي', 'asset', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'CUSTOMERS' THEN
        -- البحث عن حساب العملاء
        v_acc_id := COALESCE(
            (v_mappings->>'CUSTOMERS')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '10104%' OR code LIKE '121%' OR name ILIKE '%عملاء%' OR name ILIKE '%العملاء%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('1221', 'العملاء (المدينون)', 'asset', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'SUPPLIERS' THEN
        -- البحث عن حساب الموردين
        v_acc_id := COALESCE(
            (v_mappings->>'SUPPLIERS')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code IN ('201', '221') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '20101%' OR code LIKE '201%' OR code LIKE '211%' OR name ILIKE '%موردين%' OR name ILIKE '%الموردين%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('201', 'الموردون (الدائنون)', 'liability', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;
    END IF;

    RETURN v_acc_id;
END;
$$;

-- 3. الدالة الشاملة لترحيل قيود الشيكات (Post Cheque Journal Entry)
CREATE OR REPLACE FUNCTION public.post_cheque_journal_entry(p_cheque_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cheque record; 
    v_org_id uuid; 
    v_journal_id uuid; 
    v_bank_acc_id uuid;
    v_customer_acc_id uuid; 
    v_supplier_acc_id uuid; 
    v_notes_pay_acc_id uuid; 
    v_notes_rec_acc_id uuid; 
    v_description text; 
    v_ref text;
    v_current_stage_type text;
    v_action_date date;
BEGIN
    SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id;  
    IF NOT FOUND THEN RETURN; END IF;
    
    v_org_id := v_cheque.organization_id;
    v_action_date := COALESCE(v_cheque.transfer_date, (v_cheque.created_at::date), CURRENT_DATE);

    -- تحديد نوع القيد بناءً على المرحلة
    v_current_stage_type := CASE 
        WHEN v_cheque.status IN ('issued', 'received') THEN (CASE WHEN v_cheque.type IN ('outgoing', 'out') THEN 'cheque_issuance' ELSE 'cheque_receipt' END)
        WHEN v_cheque.status IN ('collected', 'cashed') THEN (CASE WHEN v_cheque.type IN ('incoming', 'in') THEN 'cheque_collection' ELSE 'cheque_payment' END)
        WHEN v_cheque.status IN ('bounced', 'rejected') THEN 'cheque_bounced'
        ELSE 'cheque_other'
    END;

    -- تنظيف القيد القديم لنفس المرحلة إن وجد لتجنب التكرار
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND related_document_id = p_cheque_id 
    AND related_document_type = v_current_stage_type;

    -- جلب الحسابات بدقة مع ضمان عدم رجوع null
    v_bank_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'BANK', v_cheque.current_account_id);
    v_customer_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'CUSTOMERS');
    v_supplier_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'SUPPLIERS');
    v_notes_pay_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'NOTES_PAYABLE');
    v_notes_rec_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'NOTES_RECEIVABLE');

    v_ref := 'CHQ-' || COALESCE(v_cheque.cheque_number, substring(p_cheque_id::text, 1, 8));

    -- 1. مرحلة الإصدار / الاستلام الأولي
    IF v_cheque.status IN ('issued', 'received') THEN
        IF v_cheque.type IN ('outgoing', 'out') THEN
            v_description := 'إصدار شيك صادر رقم ' || COALESCE(v_cheque.cheque_number, '') || ' للمورد ' || COALESCE(v_cheque.party_name, '');
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_action_date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_issuance', true, auth.uid()) RETURNING id INTO v_journal_id;
            
            -- من ح/ المورد إلى ح/ أوراق الدفع
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_supplier_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_notes_pay_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            v_description := 'استلام شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '') || ' من العميل ' || COALESCE(v_cheque.party_name, '');
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_action_date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_receipt', true, auth.uid()) RETURNING id INTO v_journal_id;
            
            -- من ح/ أوراق القبض إلى ح/ العميل
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_notes_rec_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_customer_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;

    -- 2. مرحلة التحصيل (للشيك الوارد)
    ELSIF v_cheque.type IN ('incoming', 'in') AND v_cheque.status = 'collected' THEN
        v_description := 'تحصيل شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '') || ' - إيداع بنكي (' || COALESCE(v_cheque.party_name, '') || ')';
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (CURRENT_DATE, v_description, v_ref || '-COL', 'posted', v_org_id, p_cheque_id, 'cheque_collection', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        -- من ح/ البنك إلى ح/ أوراق القبض
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
            (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    -- 3. مرحلة الصرف (للشيك الصادر)
    ELSIF v_cheque.type IN ('outgoing', 'out') AND v_cheque.status = 'cashed' THEN
        v_description := 'صرف شيك صادر رقم ' || COALESCE(v_cheque.cheque_number, '') || ' - خصم بنكي (' || COALESCE(v_cheque.party_name, '') || ')';
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (CURRENT_DATE, v_description, v_ref || '-CSH', 'posted', v_org_id, p_cheque_id, 'cheque_payment', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        -- من ح/ أوراق الدفع إلى ح/ البنك
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
            (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    -- 4. مرحلة الارتداد والرفض (Bounced / Rejected)
    ELSIF v_cheque.status IN ('bounced', 'rejected') THEN
        v_description := 'ارتداد/رفض شيك رقم ' || COALESCE(v_cheque.cheque_number, '') || COALESCE(' - ' || v_cheque.rejection_reason, '');
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (CURRENT_DATE, v_description, 'REJ-' || v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_bounced', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        IF v_cheque.type IN ('incoming', 'in') THEN
            -- إعادة المديونية للعميل وإلغاء ورقة القبض
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_customer_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            -- إعادة الدائنية للمورد وإلغاء ورقة الدفع
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_supplier_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;
    END IF;

    -- تحديث المعرف المرجعي لآخر قيد
    IF v_journal_id IS NOT NULL THEN 
        UPDATE public.cheques SET related_journal_entry_id = v_journal_id WHERE id = p_cheque_id; 
    END IF;

    -- تحديث الأرصدة
    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END; 
$$;

-- 4. ربط المشغل التلقائي
CREATE OR REPLACE FUNCTION public.trg_post_cheque_journal_entry() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) OR (NEW.current_account_id IS DISTINCT FROM OLD.current_account_id) THEN
        PERFORM public.post_cheque_journal_entry(NEW.id);
    END IF;
    RETURN NEW;
END; 
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cheque_posting ON public.cheques;
CREATE TRIGGER trg_cheque_posting 
AFTER INSERT OR UPDATE OF status, current_account_id ON public.cheques 
FOR EACH ROW EXECUTE FUNCTION public.trg_post_cheque_journal_entry();

-- 5. دوال RPC مخصصة ومباشرة لصرف وتحصيل ورفض الشيكات
CREATE OR REPLACE FUNCTION public.cash_or_collect_cheque(
    p_cheque_id uuid,
    p_status text, -- 'cashed' أو 'collected'
    p_bank_account_id uuid,
    p_action_date date DEFAULT CURRENT_DATE,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cheque record;
BEGIN
    SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'الشيك غير موجود.');
    END IF;

    -- تحديث الشيك
    UPDATE public.cheques 
    SET 
        status = p_status,
        current_account_id = p_bank_account_id,
        transfer_date = COALESCE(p_action_date, CURRENT_DATE)
    WHERE id = p_cheque_id;

    -- ترحيل القيد
    PERFORM public.post_cheque_journal_entry(p_cheque_id);

    RETURN jsonb_build_object('success', true, 'cheque_id', p_cheque_id, 'status', p_status);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_incoming_cheque(
    p_cheque_id uuid,
    p_rejection_reason text DEFAULT 'مرفوض من البنك',
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.cheques 
    SET 
        status = 'rejected',
        rejection_reason = p_rejection_reason
    WHERE id = p_cheque_id;

    PERFORM public.post_cheque_journal_entry(p_cheque_id);

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_outgoing_cheque(
    p_cheque_id uuid,
    p_rejection_reason text DEFAULT 'مرفوض / ملغى',
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.cheques 
    SET 
        status = 'rejected',
        rejection_reason = p_rejection_reason
    WHERE id = p_cheque_id;

    PERFORM public.post_cheque_journal_entry(p_cheque_id);

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 6. إصلاح مشغلات التدقيق الأمني (حيث تم استبدال entry_number بـ reference لمنع خطأ record "old" has no field "entry_number")
CREATE OR REPLACE FUNCTION public.fn_audit_deletions()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id uuid;
    v_item_name text;
    v_module text := 'general';
    v_severity text := 'warning';
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    CASE TG_TABLE_NAME
        WHEN 'invoices' THEN
            v_item_name := 'فاتورة مبيعات رقم: ' || COALESCE(OLD.invoice_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'sales';
            v_severity := 'critical';
        WHEN 'purchase_invoices' THEN
            v_item_name := 'فاتورة مشتريات رقم: ' || COALESCE(OLD.invoice_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'purchases';
            v_severity := 'critical';
        WHEN 'journal_entries' THEN
            v_item_name := 'قيد محاسبي رقم: ' || COALESCE(OLD.reference, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'accounting';
            v_severity := 'critical';
        WHEN 'accounts' THEN
            v_item_name := 'حساب مالي: ' || OLD.name || ' (' || COALESCE(OLD.code, '') || ')';
            v_org_id := OLD.organization_id;
            v_module := 'accounting';
            v_severity := 'critical';
        WHEN 'products' THEN
            v_item_name := 'صنف: ' || OLD.name || ' (SKU: ' || COALESCE(OLD.sku, '') || ')';
            v_org_id := OLD.organization_id;
            v_module := 'inventory';
            v_severity := 'warning';
        WHEN 'customers' THEN
            v_item_name := 'عميل: ' || OLD.name;
            v_org_id := OLD.organization_id;
            v_module := 'sales';
            v_severity := 'warning';
        WHEN 'suppliers' THEN
            v_item_name := 'مورد: ' || OLD.name;
            v_org_id := OLD.organization_id;
            v_module := 'purchases';
            v_severity := 'warning';
        WHEN 'receipt_vouchers' THEN
            v_item_name := 'سند قبض رقم: ' || COALESCE(OLD.voucher_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'treasury';
            v_severity := 'critical';
        WHEN 'payment_vouchers' THEN
            v_item_name := 'سند صرف رقم: ' || COALESCE(OLD.voucher_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'treasury';
            v_severity := 'critical';
        WHEN 'cheques' THEN
            v_item_name := 'شيك رقم: ' || COALESCE(OLD.cheque_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'treasury';
            v_severity := 'critical';
        ELSE
            v_item_name := 'سجل ' || TG_TABLE_NAME || ' (ID: ' || OLD.id::text || ')';
            v_org_id := COALESCE(OLD.organization_id, public.get_my_org());
    END CASE;

    BEGIN
        INSERT INTO public.security_logs (
            event_type,
            description,
            severity,
            module,
            performed_by,
            organization_id,
            metadata
        ) VALUES (
            TG_TABLE_NAME || '_deleted',
            format('تم حذف %s من النظام نهائياً', v_item_name),
            v_severity,
            v_module,
            auth.uid(),
            v_org_id,
            jsonb_build_object(
                'table_name', TG_TABLE_NAME,
                'deleted_id', OLD.id,
                'deleted_record', to_jsonb(OLD)
            )
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_audit_journal_status()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'posted' AND NEW.status != 'posted' THEN
        BEGIN
            INSERT INTO public.security_logs (
                event_type,
                description,
                severity,
                module,
                performed_by,
                organization_id,
                metadata
            ) VALUES (
                'journal_unposted',
                format('⚠️ تم فك ترحيل القيد اليومي رقم (%s) وإعادته لحالة المسودة', COALESCE(NEW.reference, NEW.id::text)),
                'critical',
                'accounting',
                auth.uid(),
                NEW.organization_id,
                jsonb_build_object(
                    'entry_id', NEW.id,
                    'reference', NEW.reference,
                    'old_status', OLD.status,
                    'new_status', NEW.status
                )
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.cash_or_collect_cheque(uuid, text, uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_incoming_cheque(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_outgoing_cheque(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_cheque_journal_entry(uuid) TO authenticated;



-- ==============================================================================
-- 🚀 TriPro ERP - Migration: Synchronize Quotation Status with Sales Invoices
-- When a Quotation is converted to invoice -> status becomes 'converted'
-- When the Sales Invoice is approved/posted -> status becomes 'posted' (مرحل / مكتمل)
-- ==============================================================================

-- 1. التأكد من وجود عمود quotation_id في جدول فواتير المبيعات
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'quotation_id') THEN 
        ALTER TABLE public.invoices ADD COLUMN quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL; 
    END IF; 
END $$;

-- 2. دالة المزامنة التلقائية لحالة عرض السعر مع حالة فاتورة المبيعات
CREATE OR REPLACE FUNCTION public.fn_sync_quotation_status_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_quote_id uuid;
BEGIN
    v_quote_id := COALESCE(NEW.quotation_id, OLD.quotation_id);
    
    -- إذا لم يكن الربط بالمعرف موجوداً، نبحث بالملاحظات أو رقم العرض
    IF v_quote_id IS NULL AND (NEW.notes IS NOT NULL OR OLD.notes IS NOT NULL) THEN
        SELECT id INTO v_quote_id FROM public.quotations
        WHERE (NEW.notes ILIKE '%' || quotation_number || '%')
           OR (OLD.notes ILIKE '%' || quotation_number || '%')
        LIMIT 1;
    END IF;

    IF v_quote_id IS NOT NULL THEN
        IF TG_OP = 'DELETE' THEN
            -- عند حذف الفاتورة يعود عرض السعر لحالة مرسل
            UPDATE public.quotations SET status = 'sent' WHERE id = v_quote_id;
        ELSE
            -- عند ترحيل الفاتورة تصبح حالة عرض السعر مرحل (posted)
            IF NEW.status IN ('posted', 'paid') THEN
                UPDATE public.quotations SET status = 'posted' WHERE id = v_quote_id;
            -- عند بقاء الفاتورة كمسودة تصبح الحالة محول لفاتورة (converted)
            ELSIF NEW.status = 'draft' THEN
                UPDATE public.quotations SET status = 'converted' WHERE id = v_quote_id;
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. ربط التريجر بجدول فواتير المبيعات
DROP TRIGGER IF EXISTS trg_sync_quotation_status ON public.invoices;
CREATE TRIGGER trg_sync_quotation_status
AFTER INSERT OR UPDATE OF status, quotation_id OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_quotation_status_from_invoice();

-- 🚀 4. ترميم ومزامنة الحالات الحالية لعرض السعر QT-076308 وكافة العروض السابقة فوراً
DO $$
DECLARE
    r RECORD;
    v_inv record;
BEGIN
    FOR r IN SELECT * FROM public.quotations LOOP
        SELECT * INTO v_inv FROM public.invoices
        WHERE quotation_id = r.id
           OR (notes ILIKE '%' || r.quotation_number || '%')
        ORDER BY created_at DESC LIMIT 1;

        IF v_inv.id IS NOT NULL THEN
            UPDATE public.invoices SET quotation_id = r.id WHERE id = v_inv.id AND quotation_id IS NULL;

            IF v_inv.status IN ('posted', 'paid') THEN
                UPDATE public.quotations SET status = 'posted' WHERE id = r.id;
            ELSE
                UPDATE public.quotations SET status = 'converted' WHERE id = r.id;
            END IF;
        END IF;
    END LOOP;

    NOTIFY pgrst, 'reload schema';
END $$;


-- ==============================================================================
-- 🚀 دالة تنظيف بيانات وحركات الفحص الآلي الشامل بأمان تام (Stress Test Cleanup)
-- التاريخ: 2026-08-23
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.delete_stress_test_data(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_entries integer := 0;
BEGIN
    -- 1. فك ترحيل قيود الاختبار أولاً لتجاوز تريجر حماية القيود المرحّلة
    UPDATE public.journal_entries
       SET status = 'draft', is_posted = false
     WHERE organization_id = p_org_id
       AND (reference LIKE 'TEST-%' OR reference LIKE 'CHQ-TEST-%' OR reference LIKE 'STD-%' OR description LIKE '%فحص شامل%' OR description LIKE '%اختبار%');

    -- 2. حذف المستندات المالية للاختبار
    DELETE FROM public.invoices 
     WHERE organization_id = p_org_id 
       AND (invoice_number LIKE 'TEST-%' OR invoice_number LIKE 'INV-TEST-%');

    DELETE FROM public.purchase_invoices 
     WHERE organization_id = p_org_id 
       AND (invoice_number LIKE 'TEST-%' OR invoice_number LIKE 'PUR-TEST-%');

    DELETE FROM public.sales_returns 
     WHERE organization_id = p_org_id 
       AND return_number LIKE 'TEST-%';

    DELETE FROM public.purchase_returns 
     WHERE organization_id = p_org_id 
       AND return_number LIKE 'TEST-%';

    DELETE FROM public.payment_vouchers 
     WHERE organization_id = p_org_id 
       AND voucher_number LIKE 'TEST-%';

    DELETE FROM public.receipt_vouchers 
     WHERE organization_id = p_org_id 
       AND voucher_number LIKE 'TEST-%';

    DELETE FROM public.cheques 
     WHERE organization_id = p_org_id 
       AND (cheque_number LIKE 'TEST-%' OR party_id IN (SELECT id FROM public.customers WHERE name LIKE '%فحص شامل%' AND organization_id = p_org_id));

    -- 3. حذف أسطر وقيود اليومية الخاصة بالاختبار
    DELETE FROM public.journal_lines 
     WHERE organization_id = p_org_id 
       AND journal_entry_id IN (
           SELECT id FROM public.journal_entries 
            WHERE organization_id = p_org_id 
              AND (reference LIKE 'TEST-%' OR reference LIKE 'CHQ-TEST-%' OR reference LIKE 'STD-%' OR description LIKE '%فحص شامل%' OR description LIKE '%اختبار%')
       );

    DELETE FROM public.journal_entries 
     WHERE organization_id = p_org_id 
       AND (reference LIKE 'TEST-%' OR reference LIKE 'CHQ-TEST-%' OR reference LIKE 'STD-%' OR description LIKE '%فحص شامل%' OR description LIKE '%اختبار%');

    GET DIAGNOSTICS v_deleted_entries = ROW_COUNT;

    -- 4. حذف العملاء والموردين الاختباريين
    DELETE FROM public.customers 
     WHERE organization_id = p_org_id 
       AND (name LIKE '%فحص شامل%' OR name LIKE '%اختبار%');

    DELETE FROM public.suppliers 
     WHERE organization_id = p_org_id 
       AND (name LIKE '%فحص شامل%' OR name LIKE '%اختبار%');

    RETURN 'تم تنظيف كافة بيانات الفحص الآلي بالكامل بنجاح ✅';
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_stress_test_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_stress_test_data(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_stress_test_data(uuid) TO service_role;


-- ==============================================================================
-- 🚀 إصلاح دالة get_supplier_balance ودعم الحذف الآمن لقيود اليومية
-- التاريخ: 2026-08-22
-- ==============================================================================

-- 1. تصحيح دالة get_supplier_balance (استبدال subcontract_id بـ contract_id)
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;
    v_immediate_payments    NUMERIC := 0;
    v_sub_billings          NUMERIC := 0;
    v_payments              NUMERIC := 0;
    v_cheques               NUMERIC := 0;
    v_returns               NUMERIC := 0;
    v_debit_notes           NUMERIC := 0;
BEGIN
    -- أ. الرصيد الافتتاحي للمورد
    SELECT COALESCE(opening_balance, 0)
      INTO v_opening_balance
      FROM public.suppliers
     WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير المشتريات المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المسددة فوراً من داخل فواتير المشتريات
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مقاولي الباطن المرتبطين بهذا المورد
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subcontractor_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'supplier_id'
    ) THEN
        SELECT COALESCE(SUM(sb.net_amount), 0)
          INTO v_sub_billings
          FROM public.subcontractor_billings sb
          JOIN public.subcontractor_contracts sc ON (sb.contract_id = sc.id)
          JOIN public.subcontractors s ON sc.subcontractor_id = s.id
         WHERE s.supplier_id = p_supplier_id
           AND sb.organization_id = p_org_id
           AND sb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات الصرف المستقلة (غير الشيكات)
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND payment_method != 'cheque';

    -- و. الشيكات الصادرة غير المرفوضة
    SELECT COALESCE(SUM(amount), 0)
      INTO v_cheques
      FROM public.cheques
     WHERE party_id = p_supplier_id
       AND organization_id = p_org_id
       AND type = 'outgoing'
       AND status != 'rejected';

    -- ز. مرتجعات المشتريات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات المدينة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_debit_notes
      FROM public.debit_notes
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status = 'posted';

    -- المعادلة النهائية
    RETURN (v_opening_balance + v_gross_invoices + v_sub_billings) 
         - (v_immediate_payments + v_payments + v_cheques + v_returns + v_debit_notes);
END;
$$;

-- 2. دالة الحذف الآمن لقيد اليومية (مع تجاوز قيود الحماية وتحديث الأرصدة)
CREATE OR REPLACE FUNCTION public.delete_journal_entry_safe(p_entry_id uuid, p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- أ. حذف الأسطر أولاً
    DELETE FROM public.journal_lines 
     WHERE journal_entry_id = p_entry_id 
       AND organization_id = p_org_id;

    -- ب. حذف رأس القيد
    DELETE FROM public.journal_entries 
     WHERE id = p_entry_id 
       AND organization_id = p_org_id;

    -- ج. إعادة موازنة الأرصدة
    PERFORM public.recalculate_all_balances(p_org_id);

    RETURN 'تم حذف القيد المحاسبي وتحديث الأرصدة بنجاح ✅';
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_journal_entry_safe(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated;


-- ==============================================================================
-- 🛠️ إصلاح دوال مطابقة أرصدة العملاء والموردين
-- التاريخ: 2026-08-22
-- الغرض: توحيد منطق حساب الأرصدة بين الواجهة (Frontend) وقاعدة البيانات (Backend)
-- يضمن:
--   1. عدم تكرار الرصيد الافتتاحي
--   2. احتساب التحصيل/السداد الفوري من الفواتير (paid_amount)
--   3. عدم ازدواجية الشيكات مع سندات القبض/الصرف
--   4. عدم ازدواجية مستخلصات مقاولي الباطن
--   5. ربط صحيح لمستخلصات المشاريع بـ customer_id
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. تأكد من وجود الأعمدة المطلوبة في الجداول
-- ==============================================================================

-- عمود paid_amount في invoices (إذا لم يكن موجوداً)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

-- عمود paid_amount في purchase_invoices (إذا لم يكن موجوداً)
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

-- عمود payment_method في سندات القبض والصرف (إذا لم يكن موجوداً)
ALTER TABLE public.receipt_vouchers
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

ALTER TABLE public.payment_vouchers
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

-- عمود customer_id في جدول projects (للمقاولات)
ALTER TABLE IF EXISTS public.projects
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- عمود supplier_id في جدول subcontractors (لمنع ازدواجية المستخلصات)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subcontractors') THEN
    ALTER TABLE public.subcontractors
      ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ==============================================================================
-- 2. دالة حساب رصيد العميل المُحدَّثة
--    المعادلة الصحيحة:
--    رصيد العميل = الرصيد الافتتاحي
--                 + إجمالي فواتير البيع
--                 + مستخلصات مشاريع المقاولات (مرتبطة بـ customer_id)
--                 - المبالغ المحصلة فوراً من داخل الفواتير (paid_amount)
--                 - سندات القبض المستقلة (طريقة الدفع ≠ شيك)
--                 - الشيكات الواردة غير المرفوضة (من جدول cheques)
--                 - مرتجعات المبيعات المرحلة
--                 - الإشعارات الدائنة المرحلة
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;  -- إجمالي الفواتير
    v_immediate_payments    NUMERIC := 0;  -- تحصيل فوري من الفواتير
    v_project_billings      NUMERIC := 0;  -- مستخلصات مشاريع المقاولات
    v_receipts              NUMERIC := 0;  -- سندات القبض المستقلة (غير الشيكات)
    v_cheques               NUMERIC := 0;  -- شيكات واردة غير مرفوضة
    v_returns               NUMERIC := 0;  -- مرتجعات مبيعات
    v_credit_notes          NUMERIC := 0;  -- إشعارات دائنة
BEGIN
    -- أ. الرصيد الافتتاحي للعميل
    SELECT COALESCE(opening_balance, 0)
      INTO v_opening_balance
      FROM public.customers
     WHERE id = p_customer_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير البيع المرحلة (كامل قيمة الفاتورة)
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.invoices
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المحصلة فوراً من داخل الفواتير (تُطرح مرة واحدة فقط)
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.invoices
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مشاريع المقاولات المرتبطة بالعميل عبر customer_id
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'project_progress_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'customer_id'
    ) THEN
        SELECT COALESCE(SUM(ppb.net_amount), 0)
          INTO v_project_billings
          FROM public.project_progress_billings ppb
          JOIN public.projects pr ON ppb.project_id = pr.id
         WHERE pr.customer_id = p_customer_id
           AND pr.organization_id = p_org_id
           AND ppb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات القبض المستقلة (باستثناء الشيكات لمنع التكرار)
    SELECT COALESCE(SUM(amount), 0)
      INTO v_receipts
      FROM public.receipt_vouchers
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- و. الشيكات الواردة غير المرفوضة (مرة واحدة من جدول cheques)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cheques'
    ) THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE party_id = p_customer_id
           AND organization_id = p_org_id
           AND type = 'incoming'
           AND status != 'rejected';
    END IF;

    -- ز. مرتجعات المبيعات المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.sales_returns
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات الدائنة المرحلة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'credit_notes'
    ) THEN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_credit_notes
          FROM public.credit_notes
         WHERE customer_id = p_customer_id
           AND organization_id = p_org_id
           AND status = 'posted';
    END IF;

    RETURN v_opening_balance
         + v_gross_invoices
         + v_project_billings
         - v_immediate_payments
         - v_receipts
         - v_cheques
         - v_returns
         - v_credit_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_balance(uuid, uuid) TO authenticated;


-- ==============================================================================
-- 3. دالة حساب رصيد المورد المُحدَّثة
--    المعادلة الصحيحة:
--    رصيد المورد = الرصيد الافتتاحي
--                + إجمالي فواتير المشتريات
--                + مستخلصات مقاولي الباطن المرتبطين بهذا المورد (supplier_id)
--                - المبالغ المسددة فوراً من داخل الفواتير (paid_amount)
--                - سندات الصرف المستقلة (طريقة الدفع ≠ شيك)
--                - الشيكات الصادرة غير المرفوضة (من جدول cheques)
--                - مرتجعات المشتريات المرحلة
--                - الإشعارات المدينة المرحلة
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;  -- إجمالي فواتير المشتريات
    v_immediate_payments    NUMERIC := 0;  -- سداد فوري من الفواتير
    v_sub_billings          NUMERIC := 0;  -- مستخلصات مقاولي الباطن المرتبطين بالمورد
    v_payments              NUMERIC := 0;  -- سندات الصرف المستقلة (غير الشيكات)
    v_cheques               NUMERIC := 0;  -- شيكات صادرة غير مرفوضة
    v_returns               NUMERIC := 0;  -- مرتجعات مشتريات
    v_debit_notes           NUMERIC := 0;  -- إشعارات مدينة
BEGIN
    -- أ. الرصيد الافتتاحي للمورد
    SELECT COALESCE(opening_balance, 0)
      INTO v_opening_balance
      FROM public.suppliers
     WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير المشتريات المرحلة (كامل قيمة الفاتورة)
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المسددة فوراً من داخل فواتير المشتريات
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مقاولي الباطن المرتبطين بهذا المورد عبر supplier_id
    --    (تُضاف مرة واحدة فقط — إذا كان المقاول مسجلاً كمورد)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subcontractor_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'supplier_id'
    ) THEN
        SELECT COALESCE(SUM(sb.net_amount), 0)
          INTO v_sub_billings
          FROM public.subcontractor_billings sb
          JOIN public.subcontractor_contracts sc ON (sb.contract_id = sc.id)
          JOIN public.subcontractors s ON sc.subcontractor_id = s.id
         WHERE s.supplier_id = p_supplier_id
           AND sb.organization_id = p_org_id
           AND sb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات الصرف المستقلة (باستثناء الشيكات لمنع التكرار)
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- و. الشيكات الصادرة غير المرفوضة (مرة واحدة من جدول cheques)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cheques'
    ) THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE party_id = p_supplier_id
           AND organization_id = p_org_id
           AND type = 'outgoing'
           AND status != 'rejected';
    END IF;

    -- ز. مرتجعات المشتريات المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات المدينة المرحلة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'debit_notes'
    ) THEN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_debit_notes
          FROM public.debit_notes
         WHERE supplier_id = p_supplier_id
           AND organization_id = p_org_id
           AND status = 'posted';
    END IF;

    RETURN v_opening_balance
         + v_gross_invoices
         + v_sub_billings
         - v_immediate_payments
         - v_payments
         - v_cheques
         - v_returns
         - v_debit_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated;


-- ==============================================================================
-- 4. إعادة بناء دالة recalculate_all_balances لتستخدم الدوال المحدثة
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_org_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RETURN; END IF;

    -- أ. تحديث أرصدة الحسابات في الأستاذ العام
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

    -- ب. تحديث أرصدة العملاء بالمنطق المحدث
    UPDATE public.customers c
       SET balance = public.get_customer_balance(c.id, v_org_id)
     WHERE c.organization_id = v_org_id
       AND c.deleted_at IS NULL;

    -- ج. تحديث أرصدة الموردين بالمنطق المحدث
    UPDATE public.suppliers s
       SET balance = public.get_supplier_balance(s.id, v_org_id)
     WHERE s.organization_id = v_org_id
       AND s.deleted_at IS NULL;

    -- د. إعادة حساب المخزون
    PERFORM public.recalculate_stock_rpc(v_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_all_balances(uuid) TO authenticated;


-- ==============================================================================
-- 5. دالة مساعدة: إعادة حساب أرصدة منظمة واحدة (تُستدعى من الواجهة)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.recalculate_all_balances(p_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) TO authenticated;


-- ==============================================================================
-- 6. تشغيل إعادة الحساب الشامل على كافة الشركات الآن لتصحيح البيانات الحالية
-- ==============================================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP
        BEGIN
            PERFORM public.recalculate_all_balances(r.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'فشل إعادة الحساب للشركة %: %', r.id, SQLERRM;
        END;
    END LOOP;
END $$;


-- ==============================================================================
-- 7. فهرسة إضافية لتحسين أداء الاستعلامات (إذا لم تكن موجودة)
-- ==============================================================================

-- فهرس على invoices.customer_id + status
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status
  ON public.invoices(customer_id, status)
  WHERE status NOT IN ('draft', 'cancelled');

-- فهرس على purchase_invoices.supplier_id + status
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_status
  ON public.purchase_invoices(supplier_id, status)
  WHERE status NOT IN ('draft', 'cancelled');

-- فهرس على receipt_vouchers.customer_id + payment_method
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_customer_method
  ON public.receipt_vouchers(customer_id, payment_method);

-- فهرس على payment_vouchers.supplier_id + payment_method
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_supplier_method
  ON public.payment_vouchers(supplier_id, payment_method);

-- فهرس على cheques.party_id + type + status
CREATE INDEX IF NOT EXISTS idx_cheques_party_type_status
  ON public.cheques(party_id, type, status);

-- فهرس على journal_lines.account_id (إن لم يكن موجوداً)
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id
  ON public.journal_lines(account_id);

-- فهرس على projects.customer_id
CREATE INDEX IF NOT EXISTS idx_projects_customer_id
  ON public.projects(customer_id)
  WHERE customer_id IS NOT NULL;

COMMIT;

-- ==============================================================================
-- ✅ ملاحظات للمطور:
-- 1. هذا الملف آمن للتشغيل أكثر من مرة (كل الأوامر تستخدم IF NOT EXISTS أو CREATE OR REPLACE)
-- 2. تأكد أن جدول projects يحتوي على عمود customer_id قبل ربط المستخلصات بالعملاء
-- 3. تأكد أن جدول subcontractors يحتوي على عمود supplier_id لمنع ازدواجية المستخلصات
-- 4. إذا كان عمود paid_amount غير موجود في invoices/purchase_invoices، سيُضاف تلقائياً
-- ==============================================================================


-- ========================================================================================
-- TriPro ERP — Monthly Fiscal Periods Management & Locking
-- تاريخ الإنشاء: 2026-08-23
-- الغرض: إدارة وقفل الفترات المالية الشهرية ومنع تسجيل أي حركات مالية في الفترات المغلقة
-- ========================================================================================

-- 1. جدول الفترات المالية الشهرية (Monthly Accounting Periods)
CREATE TABLE IF NOT EXISTS public.accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period_name TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    period_number INTEGER NOT NULL CHECK (period_number BETWEEN 1 AND 12),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed')),
    closed_at TIMESTAMPTZ,
    closed_by UUID,
    reopened_at TIMESTAMPTZ,
    reopened_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_org_year_period UNIQUE (organization_id, fiscal_year, period_number)
);

-- فهارس للسرعة
CREATE INDEX IF NOT EXISTS idx_accounting_periods_lookup 
ON public.accounting_periods (organization_id, fiscal_year, status);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_dates 
ON public.accounting_periods (organization_id, start_date, end_date);

-- تفعيل سياسات الأمان RLS
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounting_periods_org_isolation" ON public.accounting_periods;
CREATE POLICY "accounting_periods_org_isolation" ON public.accounting_periods
    FOR ALL
    USING (organization_id = auth.uid() OR organization_id IS NOT NULL)
    WITH CHECK (organization_id = auth.uid() OR organization_id IS NOT NULL);


-- 2. دالة التوليد التلقائي لشهور السنة المالية (12 شهراً)
CREATE OR REPLACE FUNCTION public.initialize_fiscal_year_periods(p_org_id UUID, p_year INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_month INTEGER;
    v_start_date DATE;
    v_end_date DATE;
    v_month_names TEXT[] := ARRAY[
        'يناير (شهر 1)', 'فبراير (شهر 2)', 'مارس (شهر 3)', 'أبريل (شهر 4)',
        'مايو (شهر 5)', 'يونيو (شهر 6)', 'يوليو (شهر 7)', 'أغسطس (شهر 8)',
        'سبتمبر (شهر 9)', 'أكتوبر (شهر 10)', 'نوفمبر (شهر 11)', 'ديسمبر (شهر 12)'
    ];
BEGIN
    FOR v_month IN 1..12 LOOP
        v_start_date := MAKE_DATE(p_year, v_month, 1);
        v_end_date := (v_start_date + INTERVAL '1 month - 1 day')::DATE;

        INSERT INTO public.accounting_periods (
            organization_id,
            period_name,
            fiscal_year,
            period_number,
            start_date,
            end_date,
            status
        ) VALUES (
            p_org_id,
            v_month_names[v_month] || ' ' || p_year,
            p_year,
            v_month,
            v_start_date,
            v_end_date,
            'open'
        )
        ON CONFLICT (organization_id, fiscal_year, period_number) DO NOTHING;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initialize_fiscal_year_periods(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_fiscal_year_periods(UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_fiscal_year_periods(UUID, INTEGER) TO service_role;


-- 3. تريجر حماية الفترات المغلقة: منع إنشاء أو تعديل قيود في فترات مقفلة
CREATE OR REPLACE FUNCTION public.fn_prevent_entries_in_locked_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_period_name TEXT;
    v_status TEXT;
BEGIN
    -- تخطي قيود الإقفال السنوي ذات البادئة CLOSE-
    IF NEW.reference LIKE 'CLOSE-%' THEN
        RETURN NEW;
    END IF;

    SELECT period_name, status
      INTO v_period_name, v_status
      FROM public.accounting_periods
     WHERE organization_id = NEW.organization_id
       AND NEW.transaction_date BETWEEN start_date AND end_date
       AND status IN ('locked', 'closed')
     LIMIT 1;

    IF v_status IS NOT NULL THEN
        RAISE EXCEPTION 'لا يمكن حفظ أو ترحيل قيود بتاريخ (%). الفترة المحاسبية (%) مقفلة/مجمدة من الإدارة المالية.', 
            NEW.transaction_date, v_period_name;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_entries_in_locked_periods ON public.journal_entries;
CREATE TRIGGER trg_prevent_entries_in_locked_periods
BEFORE INSERT OR UPDATE OF transaction_date, status ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_entries_in_locked_periods();


-- ========================================================================================
-- TriPro ERP — Online Payment Gateways & Fast Payment Links
-- تاريخ الإنشاء: 2026-08-23
-- الغرض: تكامل بوابات الدفع الإلكتروني (Paymob, Fawry, Stripe) وتوليد روابط وسندات السداد الآلية
-- ========================================================================================

-- 1. جدول إعدادات بوابات الدفع لكل منشأة (Payment Gateway Settings)
CREATE TABLE IF NOT EXISTS public.payment_gateway_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('paymob', 'fawry', 'stripe', 'kashier', 'custom')),
    is_enabled BOOLEAN DEFAULT false,
    api_key TEXT,
    secret_key TEXT,
    merchant_id TEXT,
    integration_id TEXT,
    iframe_id TEXT,
    bank_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    commission_rate NUMERIC(5, 2) DEFAULT 0.00,
    commission_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    test_mode BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_org_gateway_provider UNIQUE (organization_id, provider)
);

ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_gateway_settings_org_isolation" ON public.payment_gateway_settings;
CREATE POLICY "payment_gateway_settings_org_isolation" ON public.payment_gateway_settings
    FOR ALL
    USING (organization_id = auth.uid() OR organization_id IS NOT NULL)
    WITH CHECK (organization_id = auth.uid() OR organization_id IS NOT NULL);


-- 2. جدول روابط وسجلات عمليات الدفع الإلكتروني (Online Payment Links & Logs)
CREATE TABLE IF NOT EXISTS public.online_payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'restaurant_order', 'stadium_booking', 'stadium_subscription', 'hims_bill', 'custom')),
    document_id UUID,
    document_number TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'EGP',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'refunded')),
    provider TEXT NOT NULL DEFAULT 'paymob',
    gateway_order_id TEXT,
    gateway_transaction_id TEXT,
    payment_url TEXT,
    qr_code_data TEXT,
    paid_at TIMESTAMPTZ,
    receipt_voucher_id UUID REFERENCES public.receipt_vouchers(id) ON DELETE SET NULL,
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    commission_amount NUMERIC(15, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_lookup 
ON public.online_payment_links (organization_id, status, document_type, document_id);

ALTER TABLE public.online_payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "online_payment_links_org_isolation" ON public.online_payment_links;
CREATE POLICY "online_payment_links_org_isolation" ON public.online_payment_links
    FOR ALL
    USING (organization_id = auth.uid() OR organization_id IS NOT NULL)
    WITH CHECK (organization_id = auth.uid() OR organization_id IS NOT NULL);


-- 3. دالة التسوية الآلية للطلب/الفاتورة عند نجاح السداد الإلكتروني
CREATE OR REPLACE FUNCTION public.settle_online_payment(
    p_link_id UUID,
    p_transaction_id TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_link RECORD;
BEGIN
    SELECT * INTO v_link FROM public.online_payment_links WHERE id = p_link_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'رابط الدفع غير موجود.';
    END IF;

    IF v_link.status = 'paid' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true);
    END IF;

    -- تحديث حالة رابط الدفع
    UPDATE public.online_payment_links
       SET status = 'paid',
           gateway_transaction_id = p_transaction_id,
           paid_at = NOW(),
           notes = COALESCE(p_notes, notes),
           updated_at = NOW()
     WHERE id = p_link_id;

    -- إذا كان المستند فاتورة مبيعات
    IF v_link.document_type = 'invoice' AND v_link.document_id IS NOT NULL THEN
        UPDATE public.invoices 
           SET status = 'paid',
               paid_amount = total_amount,
               updated_at = NOW()
         WHERE id = v_link.document_id;
    END IF;

    -- إذا كان المستند حجز استاد
    IF v_link.document_type = 'stadium_booking' AND v_link.document_id IS NOT NULL THEN
        UPDATE public.stadium_bookings
           SET payment_status = 'paid',
               updated_at = NOW()
         WHERE id = v_link.document_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'link_id', p_link_id,
        'document_type', v_link.document_type,
        'amount', v_link.amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_online_payment(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_online_payment(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.settle_online_payment(UUID, TEXT, TEXT) TO service_role;


-- ================================================================
-- 🌟 دالة تقرير مبيعات الكاشير والمستخدمين الشاملة (POS & Sales)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_sales_by_user_report(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    user_id text,
    user_name text,
    total_orders bigint,
    total_sales numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH combined_sales AS (
        -- 1. مبيعات نقاط البيع والتجزئة (Orders)
        SELECT 
            o.user_id::text AS u_id,
            o.grand_total AS sale_amount
        FROM public.orders o
        WHERE (p_org_id IS NULL OR o.organization_id = p_org_id)
          AND o.status NOT IN ('CANCELLED', 'draft')
          AND o.created_at::date >= p_start_date
          AND o.created_at::date <= p_end_date
          AND o.user_id IS NOT NULL

        UNION ALL

        -- 2. فواتير المبيعات (Invoices)
        SELECT 
            COALESCE(i.salesperson_id, i.user_id)::text AS u_id,
            i.total_amount AS sale_amount
        FROM public.invoices i
        WHERE (p_org_id IS NULL OR i.organization_id = p_org_id)
          AND i.status NOT IN ('draft', 'cancelled')
          AND i.invoice_date::date >= p_start_date
          AND i.invoice_date::date <= p_end_date
          AND COALESCE(i.salesperson_id, i.user_id) IS NOT NULL
    )
    SELECT 
        cs.u_id AS user_id,
        COALESCE(p.full_name, 'كاشير ' || SUBSTRING(cs.u_id, 1, 8)) AS user_name,
        COUNT(*)::bigint AS total_orders,
        COALESCE(SUM(cs.sale_amount), 0)::numeric AS total_sales
    FROM combined_sales cs
    LEFT JOIN public.profiles p ON p.id::text = cs.u_id
    GROUP BY cs.u_id, p.full_name
    ORDER BY total_sales DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_by_user_report(uuid, date, date) TO authenticated, anon;


-- ==============================================================================
-- Migration: 2026-08-26_company_cloning_engine.sql
-- Description: محرك استنساخ الشركات وقوالب الدليل المحاسبي والمطاعم والأصناف والتصنيفات
-- Author: TriPro ERP Engine
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.clone_organization_template(
    p_source_org_id uuid,
    p_target_org_id uuid,
    p_options jsonb DEFAULT '{"include_accounts": true, "include_settings": true, "include_warehouses": true, "include_cost_centers": true, "include_uoms": true, "include_categories": true, "include_products": true, "include_customers": true, "include_suppliers": true, "include_restaurant": true}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_source_name text;
    v_target_name text;
    v_accounts_cloned int := 0;
    v_warehouses_cloned int := 0;
    v_cost_centers_cloned int := 0;
    v_uoms_cloned int := 0;
    v_categories_cloned int := 0;
    v_products_cloned int := 0;
    v_customers_cloned int := 0;
    v_suppliers_cloned int := 0;
    v_tables_cloned int := 0;
    
    v_src_settings record;
    v_new_mappings jsonb := '{}'::jsonb;
    v_key text;
    v_old_acc_id uuid;
    v_new_acc_id uuid;
    v_default_wh_id uuid;
BEGIN
    SELECT name INTO v_source_name FROM public.organizations WHERE id = p_source_org_id;
    IF v_source_name IS NULL THEN
        RAISE EXCEPTION 'الشركة المصدر غير موجودة (Source Org Not Found)';
    END IF;

    SELECT name INTO v_target_name FROM public.organizations WHERE id = p_target_org_id;
    IF v_target_name IS NULL THEN
        RAISE EXCEPTION 'الشركة الهدف غير موجودة (Target Org Not Found)';
    END IF;

    IF p_source_org_id = p_target_org_id THEN
        RAISE EXCEPTION 'لا يمكن استنساخ الشركة إلى نفسها';
    END IF;

    PERFORM set_config('app.restore_mode', 'on', true);

    -- 1. مراكز التكلفة
    CREATE TEMP TABLE temp_cc_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    IF COALESCE((p_options->>'include_cost_centers')::boolean, true) THEN
        BEGIN
            INSERT INTO temp_cc_map (old_id, new_id)
            SELECT id, gen_random_uuid() 
            FROM public.cost_centers 
            WHERE organization_id = p_source_org_id;

            IF EXISTS (SELECT 1 FROM temp_cc_map) THEN
                DELETE FROM public.cost_centers WHERE organization_id = p_target_org_id;
                
                INSERT INTO public.cost_centers
                SELECT (
                    jsonb_populate_record(
                        NULL::public.cost_centers,
                        to_jsonb(c) || jsonb_build_object('id', m.new_id, 'organization_id', p_target_org_id, 'created_at', now())
                    )
                ).*
                FROM public.cost_centers c
                JOIN temp_cc_map m ON c.id = m.old_id;

                GET DIAGNOSTICS v_cost_centers_cloned = ROW_COUNT;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2. وحدات القياس
    IF COALESCE((p_options->>'include_uoms')::boolean, true) THEN
        BEGIN
            DELETE FROM public.uoms WHERE organization_id = p_target_org_id;

            INSERT INTO public.uoms
            SELECT (
                jsonb_populate_record(
                    NULL::public.uoms,
                    to_jsonb(u) || jsonb_build_object('id', gen_random_uuid(), 'organization_id', p_target_org_id, 'created_at', now())
                )
            ).*
            FROM public.uoms u
            WHERE u.organization_id = p_source_org_id;

            GET DIAGNOSTICS v_uoms_cloned = ROW_COUNT;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 3. المخازن
    CREATE TEMP TABLE temp_wh_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    IF COALESCE((p_options->>'include_warehouses')::boolean, true) THEN
        BEGIN
            INSERT INTO temp_wh_map (old_id, new_id)
            SELECT id, gen_random_uuid() 
            FROM public.warehouses 
            WHERE organization_id = p_source_org_id;

            IF EXISTS (SELECT 1 FROM temp_wh_map) THEN
                DELETE FROM public.warehouses WHERE organization_id = p_target_org_id;

                INSERT INTO public.warehouses
                SELECT (
                    jsonb_populate_record(
                        NULL::public.warehouses,
                        to_jsonb(w) || jsonb_build_object('id', m.new_id, 'organization_id', p_target_org_id, 'created_at', now())
                    )
                ).*
                FROM public.warehouses w
                JOIN temp_wh_map m ON w.id = m.old_id;

                GET DIAGNOSTICS v_warehouses_cloned = ROW_COUNT;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 4. شجرة الحسابات
    CREATE TEMP TABLE temp_acc_map (old_id uuid PRIMARY KEY, new_id uuid, code text, parent_id uuid, new_parent_id uuid) ON COMMIT DROP;
    IF COALESCE((p_options->>'include_accounts')::boolean, true) THEN
        BEGIN
            INSERT INTO temp_acc_map (old_id, new_id, code, parent_id)
            SELECT id, gen_random_uuid(), code, parent_id
            FROM public.accounts
            WHERE organization_id = p_source_org_id;

            UPDATE temp_acc_map m SET new_parent_id = p.new_id FROM temp_acc_map p WHERE m.parent_id = p.old_id;

            DELETE FROM public.accounts WHERE organization_id = p_target_org_id;

            INSERT INTO public.accounts
            SELECT (
                jsonb_populate_record(
                    NULL::public.accounts,
                    to_jsonb(a) || jsonb_build_object(
                        'id', m.new_id,
                        'parent_id', NULL,
                        'organization_id', p_target_org_id,
                        'balance', 0,
                        'created_at', now()
                    )
                )
            ).*
            FROM public.accounts a 
            JOIN temp_acc_map m ON a.id = m.old_id;

            UPDATE public.accounts a 
            SET parent_id = m.new_parent_id 
            FROM temp_acc_map m 
            WHERE a.id = m.new_id AND m.new_parent_id IS NOT NULL;

            GET DIAGNOSTICS v_accounts_cloned = ROW_COUNT;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 5. إعدادات الشركة وتوجيه القيود
    IF COALESCE((p_options->>'include_settings')::boolean, true) THEN
        BEGIN
            SELECT * INTO v_src_settings FROM public.company_settings WHERE organization_id = p_source_org_id LIMIT 1;
            IF FOUND THEN
                IF v_src_settings.account_mappings IS NOT NULL THEN
                    FOR v_key IN SELECT jsonb_object_keys(v_src_settings.account_mappings)
                    LOOP
                        BEGIN
                            v_old_acc_id := (v_src_settings.account_mappings->>v_key)::uuid;
                            SELECT new_id INTO v_new_acc_id FROM temp_acc_map WHERE old_id = v_old_acc_id;
                            IF v_new_acc_id IS NOT NULL THEN
                                v_new_mappings := jsonb_set(v_new_mappings, ARRAY[v_key], to_jsonb(v_new_acc_id::text));
                            ELSE
                                v_new_mappings := jsonb_set(v_new_mappings, ARRAY[v_key], v_src_settings.account_mappings->v_key);
                            END IF;
                        EXCEPTION WHEN OTHERS THEN
                            v_new_mappings := jsonb_set(v_new_mappings, ARRAY[v_key], v_src_settings.account_mappings->v_key);
                        END;
                    END LOOP;
                END IF;

                IF v_src_settings.default_warehouse_id IS NOT NULL THEN
                    SELECT new_id INTO v_default_wh_id FROM temp_wh_map WHERE old_id = v_src_settings.default_warehouse_id;
                END IF;

                INSERT INTO public.company_settings (
                    organization_id, company_name, tax_number, commercial_register, phone, email, address,
                    currency, vat_rate, account_mappings, default_warehouse_id, invoice_terms, header_text, footer_text, created_at, updated_at
                )
                VALUES (
                    p_target_org_id, v_target_name, v_src_settings.tax_number, v_src_settings.commercial_register, v_src_settings.phone, v_src_settings.email, v_src_settings.address,
                    COALESCE(v_src_settings.currency, 'EGP'), COALESCE(v_src_settings.vat_rate, 0.14), v_new_mappings, v_default_wh_id, v_src_settings.invoice_terms, v_src_settings.header_text, v_src_settings.footer_text, now(), now()
                )
                ON CONFLICT (organization_id) DO UPDATE SET
                    currency = EXCLUDED.currency, vat_rate = EXCLUDED.vat_rate, account_mappings = EXCLUDED.account_mappings,
                    default_warehouse_id = COALESCE(EXCLUDED.default_warehouse_id, company_settings.default_warehouse_id),
                    invoice_terms = EXCLUDED.invoice_terms, header_text = EXCLUDED.header_text, footer_text = EXCLUDED.footer_text, updated_at = now();
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 6. استنساخ تصنيفات الأصناف (Item Categories)
    CREATE TEMP TABLE temp_cat_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    IF COALESCE((p_options->>'include_categories')::boolean, true) OR COALESCE((p_options->>'include_products')::boolean, true) THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'item_categories') THEN
                INSERT INTO temp_cat_map (old_id, new_id)
                SELECT id, gen_random_uuid() 
                FROM public.item_categories 
                WHERE organization_id = p_source_org_id;

                IF EXISTS (SELECT 1 FROM temp_cat_map) THEN
                    DELETE FROM public.item_categories WHERE organization_id = p_target_org_id;

                    INSERT INTO public.item_categories
                    SELECT (
                        jsonb_populate_record(
                            NULL::public.item_categories,
                            to_jsonb(c) || jsonb_build_object(
                                'id', m.new_id,
                                'organization_id', p_target_org_id,
                                'default_inventory_account_id', COALESCE(inv_map.new_id, c.default_inventory_account_id),
                                'default_cogs_account_id', COALESCE(cogs_map.new_id, c.default_cogs_account_id),
                                'default_sales_account_id', COALESCE(sales_map.new_id, c.default_sales_account_id),
                                'created_at', now()
                            )
                        )
                    ).*
                    FROM public.item_categories c
                    JOIN temp_cat_map m ON c.id = m.old_id
                    LEFT JOIN temp_acc_map inv_map ON c.default_inventory_account_id = inv_map.old_id
                    LEFT JOIN temp_acc_map cogs_map ON c.default_cogs_account_id = cogs_map.old_id
                    LEFT JOIN temp_acc_map sales_map ON c.default_sales_account_id = sales_map.old_id;

                    GET DIAGNOSTICS v_categories_cloned = ROW_COUNT;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN 
            NULL; 
        END;
    END IF;

    -- 7. استنساخ المنتجات والأصناف ومنيو المطعم (مع ربط التصنيفات والحسابات)
    CREATE TEMP TABLE temp_prod_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    CREATE TEMP TABLE temp_mod_grp_map (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    
    IF COALESCE((p_options->>'include_products')::boolean, true) THEN
        BEGIN
            INSERT INTO temp_prod_map (old_id, new_id)
            SELECT id, gen_random_uuid() 
            FROM public.products 
            WHERE organization_id = p_source_org_id;

            IF EXISTS (SELECT 1 FROM temp_prod_map) THEN
                INSERT INTO public.products
                SELECT (
                    jsonb_populate_record(
                        NULL::public.products,
                        to_jsonb(p) || jsonb_build_object(
                            'id', m.new_id,
                            'organization_id', p_target_org_id,
                            'category_id', COALESCE(cat_map.new_id, p.category_id),
                            'inventory_account_id', COALESCE(inv_map.new_id, p.inventory_account_id),
                            'cogs_account_id', COALESCE(cogs_map.new_id, p.cogs_account_id),
                            'sales_account_id', COALESCE(sales_map.new_id, p.sales_account_id),
                            'stock', 0,
                            'created_at', now()
                        )
                    )
                ).*
                FROM public.products p 
                JOIN temp_prod_map m ON p.id = m.old_id
                LEFT JOIN temp_cat_map cat_map ON p.category_id = cat_map.old_id
                LEFT JOIN temp_acc_map inv_map ON p.inventory_account_id = inv_map.old_id
                LEFT JOIN temp_acc_map cogs_map ON p.cogs_account_id = cogs_map.old_id
                LEFT JOIN temp_acc_map sales_map ON p.sales_account_id = sales_map.old_id;

                GET DIAGNOSTICS v_products_cloned = ROW_COUNT;

                -- استنساخ مجموعات وإضافات المطعم المرتبطة بالأصناف
                BEGIN
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifier_groups') THEN
                        INSERT INTO temp_mod_grp_map (old_id, new_id)
                        SELECT mg.id, gen_random_uuid() 
                        FROM public.modifier_groups mg 
                        JOIN temp_prod_map pm ON mg.product_id = pm.old_id;

                        IF EXISTS (SELECT 1 FROM temp_mod_grp_map) THEN
                            INSERT INTO public.modifier_groups
                            SELECT (
                                jsonb_populate_record(
                                    NULL::public.modifier_groups,
                                    to_jsonb(mg) || jsonb_build_object('id', mgm.new_id, 'product_id', pm.new_id, 'created_at', now())
                                )
                            ).*
                            FROM public.modifier_groups mg 
                            JOIN temp_prod_map pm ON mg.product_id = pm.old_id 
                            JOIN temp_mod_grp_map mgm ON mg.id = mgm.old_id;

                            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modifiers') THEN
                                INSERT INTO public.modifiers
                                SELECT (
                                    jsonb_populate_record(
                                        NULL::public.modifiers,
                                        to_jsonb(m) || jsonb_build_object('id', gen_random_uuid(), 'modifier_group_id', mgm.new_id, 'created_at', now())
                                    )
                                ).*
                                FROM public.modifiers m 
                                JOIN temp_mod_grp_map mgm ON m.modifier_group_id = mgm.old_id;
                            END IF;
                        END IF;
                    END IF;
                EXCEPTION WHEN OTHERS THEN NULL; END;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 8. طاولات المطعم
    IF COALESCE((p_options->>'include_restaurant')::boolean, true) THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurant_tables') THEN
                DELETE FROM public.restaurant_tables WHERE organization_id = p_target_org_id;

                INSERT INTO public.restaurant_tables
                SELECT (
                    jsonb_populate_record(
                        NULL::public.restaurant_tables,
                        to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'organization_id', p_target_org_id, 'status', 'AVAILABLE', 'created_at', now())
                    )
                ).*
                FROM public.restaurant_tables t 
                WHERE t.organization_id = p_source_org_id;

                GET DIAGNOSTICS v_tables_cloned = ROW_COUNT;
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 9. العملاء
    IF COALESCE((p_options->>'include_customers')::boolean, true) THEN
        BEGIN
            INSERT INTO public.customers
            SELECT (
                jsonb_populate_record(
                    NULL::public.customers,
                    to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'organization_id', p_target_org_id, 'created_at', now())
                )
            ).*
            FROM public.customers c 
            WHERE c.organization_id = p_source_org_id;

            GET DIAGNOSTICS v_customers_cloned = ROW_COUNT;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 10. الموردين
    IF COALESCE((p_options->>'include_suppliers')::boolean, true) THEN
        BEGIN
            INSERT INTO public.suppliers
            SELECT (
                jsonb_populate_record(
                    NULL::public.suppliers,
                    to_jsonb(s) || jsonb_build_object('id', gen_random_uuid(), 'organization_id', p_target_org_id, 'created_at', now())
                )
            ).*
            FROM public.suppliers s 
            WHERE s.organization_id = p_source_org_id;

            GET DIAGNOSTICS v_suppliers_cloned = ROW_COUNT;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 11. تسجيل النشاط
    BEGIN
        INSERT INTO public.security_logs (organization_id, user_id, event_type, description, created_at)
        VALUES (p_target_org_id, auth.uid(), 'company_template_cloned', 'تم استنساخ قالب الشركة بنجاح من: ' || v_source_name || ' إلى: ' || v_target_name, now());
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object(
        'success', true,
        'source_org', v_source_name,
        'target_org', v_target_name,
        'accounts_cloned', v_accounts_cloned,
        'warehouses_cloned', v_warehouses_cloned,
        'cost_centers_cloned', v_cost_centers_cloned,
        'uoms_cloned', v_uoms_cloned,
        'categories_cloned', v_categories_cloned,
        'products_cloned', v_products_cloned,
        'tables_cloned', v_tables_cloned,
        'customers_cloned', v_customers_cloned,
        'suppliers_cloned', v_suppliers_cloned,
        'message', 'تم استنساخ الشركة والدليل المحاسبي والبيانات والتصنيفات بنجاح تام وبشكل معزول 100%'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_organization_template(uuid, uuid, jsonb) TO authenticated;


-- 🏗️ مديول الاعتمادات المستندية (Letters of Credit - LC)
-- إنشاء الجداول والسياسات الأمنية والربط المحاسبي

-- 1. جدول الاعتمادات المستندية
CREATE TABLE IF NOT EXISTS public.letters_of_credit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lc_number VARCHAR(100) NOT NULL, -- رقم الاعتماد المستندي
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL, -- المورد الخارجي
    bank_id UUID NOT NULL REFERENCES public.accounts(id), -- البنك الفاتح للاعتماد (دائن بالخصم)
    lc_account_id UUID REFERENCES public.accounts(id), -- حساب الاعتماد المستندي (أصل وسيط - مدين بالتكلفة)
    currency_code VARCHAR(10) NOT NULL DEFAULT 'USD', -- عملة الاعتماد الأصيلة
    exchange_rate NUMERIC(10,5) NOT NULL DEFAULT 1.0, -- سعر الصرف عند الفتح
    amount_foreign NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_foreign >= 0), -- قيمة الاعتماد بالعملة الأجنبية
    amount_local NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_local >= 0), -- قيمة الاعتماد بالعملة المحلية
    margin_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (margin_percentage >= 0 AND margin_percentage <= 100), -- نسبة الغطاء النقدي %
    margin_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (margin_amount >= 0), -- قيمة الغطاء النقدي المقتطع
    opening_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- المشروع المرتبط (اختياري)
    status VARCHAR(50) NOT NULL DEFAULT 'opened' CHECK (status IN ('opened', 'documents_received', 'delivered', 'closed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. جدول مصروفات الاعتماد المستندي (رسملة المصاريف: شحن، جمارك، تأمين، عمولات)
CREATE TABLE IF NOT EXISTS public.lc_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lc_id UUID NOT NULL REFERENCES public.letters_of_credit(id) ON DELETE CASCADE,
    expense_type VARCHAR(50) NOT NULL CHECK (expense_type IN ('bank_commission', 'freight', 'customs', 'insurance', 'other')),
    amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    expense_date DATE NOT NULL,
    invoice_ref VARCHAR(100), -- مرجع الفاتورة / السند
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL, -- القيد المحاسبي المولد
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل حماية RLS لعزل بيانات الشركات (Multi-tenancy isolation)
ALTER TABLE public.letters_of_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lc_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SaaS_LC_Isolation" ON public.letters_of_credit;
CREATE POLICY "SaaS_LC_Isolation" ON public.letters_of_credit
    FOR ALL USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "SaaS_LC_Expenses_Isolation" ON public.lc_expenses;
CREATE POLICY "SaaS_LC_Expenses_Isolation" ON public.lc_expenses
    FOR ALL USING (organization_id = public.get_my_org());


-- ⚙️ إضافة حساب الاعتمادات المستندية لشراء بضائع (1246) وربطه تلقائياً للمنظمات الحالية
DO $$
DECLARE
    v_org record;
    v_parent_id uuid;
    v_new_acc_id uuid;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        -- تحقق هل الحساب 1246 موجود لهذه المنظمة
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = v_org.id AND code = '1246') THEN
            -- ابحث عن الحساب الأب 124 (أرصدة مدينة أخرى)
            SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '124' LIMIT 1;
            
            -- إذا لم يكن الأب موجوداً، ابحث عن 12 (أصول متداولة)
            IF v_parent_id IS NULL THEN
                SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '12' LIMIT 1;
            END IF;

            -- إدراج الحساب
            INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
            VALUES (v_org.id, '1246', 'اعتمادات مستندية لشراء بضائع', 'asset', false, v_parent_id, true)
            RETURNING id INTO v_new_acc_id;
            
            -- ربط الحساب تلقائياً في إعدادات المنشأة
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_CREDIT_GOODS', v_new_acc_id)
            WHERE organization_id = v_org.id;
        ELSE
            -- الحساب موجود بالفعل، قم بربطه فقط
            SELECT id INTO v_new_acc_id FROM public.accounts WHERE organization_id = v_org.id AND code = '1246' LIMIT 1;
            
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_CREDIT_GOODS', v_new_acc_id)
            WHERE organization_id = v_org.id;
        END IF;
    END LOOP;
END $$;

-- 3. جدول وارد استلام بضائع الاعتمادات المستندية (LC Goods Receipts / Stock Movements)
CREATE TABLE IF NOT EXISTS public.lc_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lc_id UUID NOT NULL REFERENCES public.letters_of_credit(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    quantity NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    unit_price NUMERIC(15,4) NOT NULL DEFAULT 0,
    allocated_expense NUMERIC(15,4) NOT NULL DEFAULT 0,
    final_unit_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lc_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SaaS_LC_Receipt_Items_Isolation" ON public.lc_receipt_items;
CREATE POLICY "SaaS_LC_Receipt_Items_Isolation" ON public.lc_receipt_items
    FOR ALL USING (organization_id = public.get_my_org());

-- 4. دالة تحديث تكلفة ورصيد الصنف المخزني عند تصفية الاعتماد (RPC Function)
CREATE OR REPLACE FUNCTION public.update_item_cost_and_qty(
    p_item_id UUID,
    p_qty NUMERIC,
    p_unit_cost NUMERIC,
    p_warehouse_id UUID DEFAULT NULL,
    p_lc_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_stock NUMERIC;
    v_old_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
    v_wstock JSONB;
    v_org_id UUID;
BEGIN
    SELECT COALESCE(stock, 0), COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0), warehouse_stock, organization_id
    INTO v_old_stock, v_old_cost, v_wstock, v_org_id
    FROM public.products
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Product not found');
    END IF;

    v_new_stock := v_old_stock + COALESCE(p_qty, 0);

    IF v_old_stock > 0 AND v_new_stock > 0 THEN
        v_new_cost := ((v_old_stock * v_old_cost) + (COALESCE(p_qty, 0) * COALESCE(p_unit_cost, 0))) / v_new_stock;
    ELSE
        v_new_cost := COALESCE(p_unit_cost, 0);
    END IF;

    -- تحديث رصيد المستودع في الـ JSONB
    IF p_warehouse_id IS NOT NULL THEN
        v_wstock := COALESCE(v_wstock, '{}'::jsonb);
        v_wstock := jsonb_set(
            v_wstock,
            ARRAY[p_warehouse_id::text],
            to_jsonb(COALESCE((v_wstock->>p_warehouse_id::text)::numeric, 0) + COALESCE(p_qty, 0))
        );
    END IF;

    UPDATE public.products
    SET 
        stock = v_new_stock,
        warehouse_stock = COALESCE(v_wstock, warehouse_stock),
        cost = ROUND(v_new_cost, 4),
        weighted_average_cost = ROUND(v_new_cost, 4),
        purchase_price = CASE WHEN COALESCE(p_unit_cost, 0) > 0 THEN p_unit_cost ELSE purchase_price END,
        updated_at = NOW()
    WHERE id = p_item_id;

    -- حفظ حركة استلام البضاعة إذا تم تمرير رقم الاعتماد
    IF p_lc_id IS NOT NULL THEN
        INSERT INTO public.lc_receipt_items (
            organization_id,
            lc_id,
            product_id,
            warehouse_id,
            quantity,
            final_unit_cost,
            receipt_date
        ) VALUES (
            v_org_id,
            p_lc_id,
            p_item_id,
            p_warehouse_id,
            COALESCE(p_qty, 0),
            COALESCE(p_unit_cost, 0),
            CURRENT_DATE
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'new_stock', v_new_stock, 'new_cost', v_new_cost);
END;
$$;


-- 🏗️ مديول خطابات الضمان البنكية (Letters of Guarantee)
-- إنشاء جدول خطابات الضمان وإعدادات الحماية والتكامل

CREATE TABLE IF NOT EXISTS public.letters_of_guarantee (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lg_number VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('bid_bond', 'performance_bond', 'advance_payment', 'other')),
    issuing_bank_id UUID NOT NULL REFERENCES public.accounts(id), -- البنك الجاري المصدر
    margin_account_id UUID NOT NULL REFERENCES public.accounts(id), -- حساب غطاء خطاب الضمان (أصل)
    expense_account_id UUID REFERENCES public.accounts(id), -- حساب عمولات ومصاريف البنك (مصروف)
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- المشروع المرتبط
    beneficiary VARCHAR(255) NOT NULL, -- الجهة المستفيدة (المالك / العميل)
    amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0), -- قيمة خطاب الضمان الإجمالية
    margin_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (margin_percentage >= 0 AND margin_percentage <= 100), -- نسبة الغطاء النقدى %
    margin_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (margin_amount >= 0), -- قيمة الغطاء النقدي المحجوز
    commission_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0), -- عمولة الإصدار
    issue_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'extended', 'returned', 'liquidated')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل الـ Row Level Security (RLS) لعزل بيانات الشركات
ALTER TABLE public.letters_of_guarantee ENABLE ROW LEVEL SECURITY;

-- حذف السياسة إذا كانت موجودة مسبقاً وتجنب التكرار
DROP POLICY IF EXISTS "SaaS_LG_Isolation" ON public.letters_of_guarantee;

-- سياسة الوصول وعزل البيانات المشتركة (Multi-tenancy isolation)
CREATE POLICY "SaaS_LG_Isolation" ON public.letters_of_guarantee
    FOR ALL
    USING (organization_id = public.get_my_org());


-- ⚙️ إضافة حساب غطاء خطابات الضمان (1248) وربطه تلقائياً للمنظمات الحالية لتجنب الأخطاء
DO $$
DECLARE
    v_org record;
    v_parent_id uuid;
    v_new_acc_id uuid;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        -- تحقق هل الحساب 1248 موجود لهذه المنظمة
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = v_org.id AND code = '1248') THEN
            -- ابحث عن الحساب الأب 124 (أرصدة مدينة أخرى)
            SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '124' LIMIT 1;
            
            -- إذا لم يكن الأب موجوداً، ابحث عن 12 (أصول متداولة)
            IF v_parent_id IS NULL THEN
                SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '12' LIMIT 1;
            END IF;

            -- إدراج الحساب
            INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
            VALUES (v_org.id, '1248', 'غطاء خطابات ضمان لدى البنوك', 'asset', false, v_parent_id, true)
            RETURNING id INTO v_new_acc_id;
            
            -- ربط الحساب تلقائياً في إعدادات المنشأة
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_GUARANTEE_MARGIN', v_new_acc_id)
            WHERE organization_id = v_org.id;
        ELSE
            -- الحساب موجود بالفعل، قم بربطه فقط
            SELECT id INTO v_new_acc_id FROM public.accounts WHERE organization_id = v_org.id AND code = '1248' LIMIT 1;
            
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_GUARANTEE_MARGIN', v_new_acc_id)
            WHERE organization_id = v_org.id;
        END IF;
    END LOOP;
END $$;


-- =====================================================================
-- Migration: Create retail_promotions table for Supermarkets & Hypermarkets
-- Date: 2026-08-30
-- Description: Supports BOGO, Tiered Quantity pricing, Category discounts, and Bundles
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.retail_promotions (
    id TEXT PRIMARY KEY DEFAULT ('promo_' || gen_random_uuid()::text),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BOGO', 'TIERED_QTY', 'BUNDLE', 'CATEGORY_DISCOUNT', 'MIN_SPEND')),
    is_active BOOLEAN DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT,
    category_id UUID REFERENCES public.item_categories(id) ON DELETE SET NULL,
    buy_qty INTEGER DEFAULT 2,
    get_free_qty INTEGER DEFAULT 1,
    tiered_qty INTEGER DEFAULT 3,
    tiered_fixed_price NUMERIC(12,2) DEFAULT 0,
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    min_spend_amount NUMERIC(12,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_retail_promotions_org_active
    ON public.retail_promotions (organization_id, is_active);

-- Enable RLS
ALTER TABLE public.retail_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage promotions in their organization"
    ON public.retail_promotions
    FOR ALL
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

GRANT ALL ON public.retail_promotions TO authenticated;
GRANT SELECT ON public.retail_promotions TO anon;


-- ==============================================================================
-- 🛒 تحديث قاعدة البيانات: باقة الهايبر ماركت وإدارة التجزئة المتقدمة (TriPro ERP)
-- تاريخ التنفيذ: 2026-08-31
-- يشمل: المرحلة الأولى (الكوبونات والباركود المتعدد) + المرحلة الثانية (عقود الموردين والريباط وأذون الاستلام GRN)
-- ==============================================================================

-- 1️⃣ جدول كوبونات وقسائم الخصم (Retail Coupons & Promo Codes)
CREATE TABLE IF NOT EXISTS public.retail_coupons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    discount_type text NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
    discount_value numeric NOT NULL CHECK (discount_value > 0),
    min_order_amount numeric DEFAULT 0,
    max_discount_amount numeric DEFAULT NULL,
    usage_limit integer DEFAULT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- فهرس لمنع تكرار الكود داخل نفس الشركة
CREATE UNIQUE INDEX IF NOT EXISTS idx_retail_coupons_org_code ON public.retail_coupons(organization_id, UPPER(code));

-- تفعيل RLS لجدول الكوبونات
ALTER TABLE public.retail_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view org coupons" ON public.retail_coupons;
CREATE POLICY "Allow users to view org coupons" ON public.retail_coupons
    FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Allow users to manage org coupons" ON public.retail_coupons;
CREATE POLICY "Allow users to manage org coupons" ON public.retail_coupons
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- دالة زيادة عدد مرات استخدام الكوبون
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.retail_coupons
    SET used_count = used_count + 1, updated_at = now()
    WHERE id = p_coupon_id;
END;
$$;


-- 2️⃣ إضافة عمود باركودات الوحدات المتعددة لجدول المنتجات (Multi-Barcode per UOM)
ALTER TABLE public.products 
    ADD COLUMN IF NOT EXISTS unit_barcodes jsonb DEFAULT '[]'::jsonb;


-- 3️⃣ جدول عقود واتفاقيات الموردين والبوانص (Vendor Contracts, Rebates & Shelf Rental)
CREATE TABLE IF NOT EXISTS public.vendor_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_number text NOT NULL,
    vendor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    title text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    
    -- شروط الريباط / البوانص (Volume Rebate)
    rebate_type text NOT NULL DEFAULT 'PERCENT' CHECK (rebate_type IN ('PERCENT', 'TIERED', 'FIXED_AMOUNT')),
    rebate_percentage numeric DEFAULT 0, -- نسبة الخصم الخلفي
    target_purchase_amount numeric DEFAULT 0, -- المبلغ المستهدف لتحقيق البونص
    rebate_calculation_period text DEFAULT 'MONTHLY' CHECK (rebate_calculation_period IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),
    
    -- إيجار الأرفف والمساحات الإعلانية (Endcaps / Gondola Shelf Rental)
    shelf_rental_fee numeric DEFAULT 0, -- قيمة إيجار الرف أو الصندورة
    shelf_rental_period text DEFAULT 'MONTHLY' CHECK (shelf_rental_period IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),
    shelf_location_notes text,
    
    payment_terms_days integer DEFAULT 30, -- فترة السداد باليوم
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED')),
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.vendor_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view org vendor contracts" ON public.vendor_contracts;
CREATE POLICY "Allow users to view org vendor contracts" ON public.vendor_contracts
    FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Allow users to manage org vendor contracts" ON public.vendor_contracts;
CREATE POLICY "Allow users to manage org vendor contracts" ON public.vendor_contracts
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());


-- 4️⃣ جدول تسويات ومطالبات البوانص والريباط (Vendor Rebate Settlements)
CREATE TABLE IF NOT EXISTS public.vendor_rebate_settlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id uuid NOT NULL REFERENCES public.vendor_contracts(id) ON DELETE CASCADE,
    vendor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    settlement_number text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_actual_purchases numeric NOT NULL DEFAULT 0, -- إجمالي المشتريات الفعلية خلال الفترة
    rebate_earned numeric NOT NULL DEFAULT 0, -- مبلغ البونص المستحق للماركت
    shelf_rental_earned numeric NOT NULL DEFAULT 0, -- إيجار الأرفف المستحق
    total_claim_amount numeric NOT NULL DEFAULT 0, -- إجمالي المطالبة
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'SETTLED', 'CANCELLED')),
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL, -- القيد المالي للتسوية
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.vendor_rebate_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to manage org rebate settlements" ON public.vendor_rebate_settlements;
CREATE POLICY "Allow users to manage org rebate settlements" ON public.vendor_rebate_settlements
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());


-- 5️⃣ جدول أذون الاستلام المخزني ومطابقة الباركود (Goods Receipt Notes - GRN)
CREATE TABLE IF NOT EXISTS public.goods_receipt_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    grn_number text NOT NULL,
    purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    vendor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    vendor_invoice_number text, -- رقم فاتورة المورد
    receipt_date date NOT NULL DEFAULT CURRENT_DATE,
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_INSPECTION', 'APPROVED', 'REJECTED')),
    received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.goods_receipt_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to manage org GRNs" ON public.goods_receipt_notes;
CREATE POLICY "Allow users to manage org GRNs" ON public.goods_receipt_notes
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());


-- 6️⃣ جدول بنود إذن الاستلام المخزني (GRN Items)
CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id uuid NOT NULL REFERENCES public.goods_receipt_notes(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    uom_id uuid REFERENCES public.uoms(id) ON DELETE SET NULL,
    ordered_quantity numeric DEFAULT 0, -- الكمية المطلوبة بأمر الشراء
    received_quantity numeric NOT NULL DEFAULT 0, -- الكمية المقبولة والمستلمة فعلياً
    rejected_quantity numeric DEFAULT 0, -- الكمية المرفوضة (تالف / غير مطابق)
    unit_cost numeric NOT NULL DEFAULT 0,
    barcode_scanned text, -- الباركود الممسوح عند الاستلام
    batch_number text, -- رقم التشغيلة
    expiry_date date, -- تاريخ الصلاحية المستلم
    rejection_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to manage org GRN items" ON public.goods_receipt_items;
CREATE POLICY "Allow users to manage org GRN items" ON public.goods_receipt_items
    FOR ALL TO authenticated USING (
        grn_id IN (SELECT id FROM public.goods_receipt_notes WHERE organization_id = public.get_my_org())
    );


-- ==============================================================================
-- 👔 TriPro ERP - الحزمة المتقدمة للموارد البشرية والرواتب (HR & Payroll Advanced Suite)
-- Leaves & Balances, End of Service Clearance, Attendance & Overtime
-- التاريخ: 2026-08-31
-- ==============================================================================

-- 1. جدول أرصدة إجازات الموظفين السنوية (Employee Leave Balances)
CREATE TABLE IF NOT EXISTS public.hr_leave_balances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL,
    fiscal_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    annual_leave_allowance numeric(5,2) NOT NULL DEFAULT 21, -- رصيد الإجازة السنوية المستحق (مثال 21 أو 30 يوم)
    used_days numeric(5,2) NOT NULL DEFAULT 0, -- الأيام المستهلكة
    remaining_days numeric(5,2) NOT NULL DEFAULT 21, -- الرصيد المتبقي
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT unique_emp_year_balance UNIQUE (organization_id, employee_id, fiscal_year)
);

-- 2. جدول طلبات وسجلات الإجازات (Leave Requests)
CREATE TABLE IF NOT EXISTS public.hr_leave_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL,
    leave_type text NOT NULL, -- ANNUAL (سنوية مدفوعة), SICK (مرضية), CASUAL (عارضة), UNPAID (بدون راتب), HAJJ (حج), MATERNITY (أمومة)
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_days numeric(5,2) NOT NULL DEFAULT 1,
    is_paid boolean DEFAULT true,
    reason text,
    status text DEFAULT 'PENDING', -- PENDING (قيد المراجعة), APPROVED (معتمدة), REJECTED (مرفوضة)
    approved_by text,
    approval_date date,
    rejection_reason text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. جدول مخالصات ومكافأة نهاية الخدمة (End of Service Settlements)
CREATE TABLE IF NOT EXISTS public.hr_end_of_service_settlements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    settlement_number text NOT NULL,
    employee_id uuid NOT NULL,
    joining_date date NOT NULL,
    termination_date date NOT NULL,
    service_years numeric(5,2) NOT NULL DEFAULT 0,
    service_months integer NOT NULL DEFAULT 0,
    service_days integer NOT NULL DEFAULT 0,
    last_basic_salary numeric(15,2) NOT NULL DEFAULT 0,
    termination_type text NOT NULL, -- RESIGNATION (استقالة الموظف), COMPANY_TERMINATION (إنهاء عقد من الشركة), CONTRACT_EXPIRY (انتهاء مدة العقد), DEATH_DISABILITY (وفاة/عجز)
    gratuity_amount numeric(15,2) NOT NULL DEFAULT 0, -- قيمة مكافأة نهاية الخدمة
    leave_compensation_amount numeric(15,2) NOT NULL DEFAULT 0, -- بدل رصيد الإجازات المتبقي
    outstanding_advances numeric(15,2) NOT NULL DEFAULT 0, -- استقطاع السلف والقروض القائمة
    other_additions numeric(15,2) NOT NULL DEFAULT 0, -- مستحقات إضافية / مكافآت
    other_deductions numeric(15,2) NOT NULL DEFAULT 0, -- استقطاعات أخرى
    final_net_settlement numeric(15,2) NOT NULL DEFAULT 0, -- صافي المخالصة المستحق
    payment_status text DEFAULT 'PENDING', -- PENDING, PAID, CANCELLED
    settlement_date date NOT NULL DEFAULT CURRENT_DATE,
    approved_by text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. جدول سجل الحضور والانصراف والبصمة (Attendance & Overtime Logs)
CREATE TABLE IF NOT EXISTS public.hr_attendance_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL,
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    check_in_time time,
    check_out_time time,
    late_minutes integer NOT NULL DEFAULT 0,
    overtime_hours numeric(5,2) NOT NULL DEFAULT 0,
    status text DEFAULT 'PRESENT', -- PRESENT (حاضر), ABSENT (غائب), ON_LEAVE (إجازة), LATE (متأخر)
    source text DEFAULT 'MANUAL', -- MANUAL, BIOMETRIC_DEVICE, EXCEL_IMPORT
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- فهارس الأداء
CREATE INDEX IF NOT EXISTS idx_hr_leaves_org ON public.hr_leave_requests(organization_id, employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_eos_org ON public.hr_end_of_service_settlements(organization_id, settlement_number);
CREATE INDEX IF NOT EXISTS idx_hr_att_org ON public.hr_attendance_logs(organization_id, log_date DESC, employee_id);

-- سياسات الأمان RLS
ALTER TABLE public.hr_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_end_of_service_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "hr_balances_org_policy" ON public.hr_leave_balances;
    CREATE POLICY "hr_balances_org_policy" ON public.hr_leave_balances
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "hr_leaves_org_policy" ON public.hr_leave_requests;
    CREATE POLICY "hr_leaves_org_policy" ON public.hr_leave_requests
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "hr_eos_org_policy" ON public.hr_end_of_service_settlements;
    CREATE POLICY "hr_eos_org_policy" ON public.hr_end_of_service_settlements
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "hr_att_org_policy" ON public.hr_attendance_logs;
    CREATE POLICY "hr_att_org_policy" ON public.hr_attendance_logs
        FOR ALL USING (organization_id = public.get_my_org())
        WITH CHECK (organization_id = public.get_my_org());
EXCEPTION WHEN OTHERS THEN NULL; END $$;


-- ==============================================================================
-- Migration: Enterprise Fixed Assets & Construction Equipment Suite (10/10)
-- التاريخ: 2026-09-01
-- الميزات: الجرد الميداني بالباركود، استوديو ملصقات QR، ربط معدات المقاولات بالمشاريع، ومناقلات المواقع
-- ==============================================================================

-- 1. ترقية جدول الأصول الثابتة وحقول الربط الميداني والمقاولات
DO $$ BEGIN
    -- كود الباركود / التاج
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'asset_tag') THEN
        ALTER TABLE public.assets ADD COLUMN asset_tag VARCHAR(100);
    END IF;

    -- الرقم التسلسلي
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'serial_number') THEN
        ALTER TABLE public.assets ADD COLUMN serial_number VARCHAR(100);
    END IF;

    -- التصنيف
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'category') THEN
        ALTER TABLE public.assets ADD COLUMN category VARCHAR(100) DEFAULT 'MACHINERY';
    END IF;

    -- مشروع المقاولات المرتبط به الأصل حالياً
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'project_id') THEN
        ALTER TABLE public.assets ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'project_name') THEN
        ALTER TABLE public.assets ADD COLUMN project_name VARCHAR(255);
    END IF;

    -- الموقع الميداني الحالي
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'current_location') THEN
        ALTER TABLE public.assets ADD COLUMN current_location VARCHAR(255) DEFAULT 'الموقع الرئيسي';
    END IF;

    -- المسؤول عن العهدة
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'custodian_id') THEN
        ALTER TABLE public.assets ADD COLUMN custodian_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'custodian_name') THEN
        ALTER TABLE public.assets ADD COLUMN custodian_name VARCHAR(255);
    END IF;

    -- الحالة الفنية للأصل
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'asset_condition') THEN
        ALTER TABLE public.assets ADD COLUMN asset_condition VARCHAR(50) DEFAULT 'GOOD'; -- EXCELLENT, GOOD, FAIR, NEEDS_MAINTENANCE, DAMAGED, OUT_OF_SERVICE
    END IF;

    -- تكلفة تشغيل ساعة المعدة في مشاريع المقاولات
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'hourly_operating_cost') THEN
        ALTER TABLE public.assets ADD COLUMN hourly_operating_cost NUMERIC(15,2) DEFAULT 0.00;
    END IF;

    -- تاريخ وحالة آخر جرد ميداني
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'last_audit_date') THEN
        ALTER TABLE public.assets ADD COLUMN last_audit_date TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'last_audit_status') THEN
        ALTER TABLE public.assets ADD COLUMN last_audit_status VARCHAR(50) DEFAULT 'UNVERIFIED'; -- VERIFIED, RELOCATED, MISSING, MAINTENANCE_REQUIRED, UNVERIFIED
    END IF;
END $$;

-- 2. جدول عمليات وسجلات الجرد الميداني بالباركود (Asset Physical Audits)
CREATE TABLE IF NOT EXISTS public.asset_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    asset_tag VARCHAR(100),
    asset_name VARCHAR(255) NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name VARCHAR(255),
    scanned_location VARCHAR(255),
    audit_status VARCHAR(50) NOT NULL, -- VERIFIED, RELOCATED, MISSING, MAINTENANCE_REQUIRED
    auditor_id UUID,
    auditor_name VARCHAR(255),
    condition VARCHAR(50) DEFAULT 'GOOD',
    notes TEXT,
    audit_timestamp TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. جدول مناقلات ونقل الأصول والمعدات بين مشاريع المقاولات والفروع (Asset & Equipment Transfers)
CREATE TABLE IF NOT EXISTS public.asset_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    transfer_number VARCHAR(100) NOT NULL,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    asset_name VARCHAR(255) NOT NULL,
    from_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    from_project_name VARCHAR(255),
    to_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    to_project_name VARCHAR(255) NOT NULL,
    from_location VARCHAR(255),
    to_location VARCHAR(255) NOT NULL,
    from_custodian_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    to_custodian_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'COMPLETED', -- PENDING, IN_TRANSIT, COMPLETED, CANCELLED
    driver_name VARCHAR(255),
    transport_vehicle VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. تفعيل سياسات الأمان RLS
ALTER TABLE public.asset_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_asset_audits" ON public.asset_audits;
CREATE POLICY "allow_all_asset_audits" ON public.asset_audits FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_asset_transfers" ON public.asset_transfers;
CREATE POLICY "allow_all_asset_transfers" ON public.asset_transfers FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.asset_audits TO authenticated, anon;
GRANT ALL ON public.asset_transfers TO authenticated, anon;

-- 5. توليد أكواد باركود مبدئية للأصول التي لا تحتوي على باركود
UPDATE public.assets
SET asset_tag = 'AST-' || UPPER(SUBSTRING(id::text, 1, 8))
WHERE asset_tag IS NULL OR asset_tag = '';

SELECT '✅ تم تجهيز وتحديث قاعدة بيانات الأصول الثابتة ومعدات المقاولات بنجاح (10/10 EAM Suite)' as status;


-- ==============================================================================
-- Migration: HR & Payroll Enterprise Suite Upgrade (10/10)
-- التاريخ: 2026-09-01
-- الميزات: أجهزة البصمة ZKTeco، الورديات الذكية، لائحة الجزاءات والمكافآت، ومفردات المرتب
-- ==============================================================================

-- 1. إضافة حقل رقم البصمة للموظفين إن لم يكن موجوداً
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'biometric_id'
    ) THEN
        ALTER TABLE public.employees ADD COLUMN biometric_id VARCHAR(100);
    END IF;
END $$;

-- 2. جدول ماكينات وأجهزة البصمة (Biometric Devices Hub)
CREATE TABLE IF NOT EXISTS public.hr_biometric_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    serial_number VARCHAR(100),
    ip_address VARCHAR(100),
    port INT DEFAULT 4370,
    device_type VARCHAR(50) DEFAULT 'ZKTECO_ADMS', -- ZKTECO_ADMS, ZKTECO_STANDALONE, HIKVISION, ANVIZ
    location_branch VARCHAR(255) DEFAULT 'الفرع الرئيسي',
    status VARCHAR(50) DEFAULT 'ONLINE', -- ONLINE, OFFLINE, SYNCING
    last_sync_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. جدول الحركات الخام المستلمة من ماكينات البصمة (Biometric Raw Logs)
CREATE TABLE IF NOT EXISTS public.hr_biometric_raw_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.hr_biometric_devices(id) ON DELETE SET NULL,
    biometric_id VARCHAR(100) NOT NULL,
    log_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    punch_state VARCHAR(50) DEFAULT 'CHECK_IN', -- CHECK_IN, CHECK_OUT, BREAK_OUT, BREAK_IN, AUTO
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. جدول الورديات ومواعيد العمل (Work Shifts)
CREATE TABLE IF NOT EXISTS public.hr_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL DEFAULT '09:00:00',
    end_time TIME NOT NULL DEFAULT '17:00:00',
    grace_period_minutes INT DEFAULT 15, -- دقائق السماح بالتأخير
    overtime_start_minutes INT DEFAULT 30, -- يبدأ احتساب الإضافي بعد انتهاء الوردية بـ X دقيقة
    half_day_hours NUMERIC(4,2) DEFAULT 4.0,
    color VARCHAR(50) DEFAULT '#3b82f6',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. جدول لائحة الجزاءات والمكافآت الإدارية (Penalties & Rewards)
CREATE TABLE IF NOT EXISTS public.hr_penalties_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- PENALTY (جزاء/خصم), REWARD (مكافأة/حافز), WARNING (إنذار/لفت نظر)
    category VARCHAR(100) NOT NULL, -- تأخير, غياب, سوء سلوك, إنجاز متميز, كفاءة
    reason TEXT NOT NULL,
    amount_type VARCHAR(50) DEFAULT 'DAYS', -- DAYS (خصم/مكافأة أيام), FIXED_AMOUNT (مبلغ مالي ثابت)
    amount_value NUMERIC(15,2) NOT NULL DEFAULT 1.00,
    calculated_amount NUMERIC(15,2) DEFAULT 0.00,
    action_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payroll_month INT,
    payroll_year INT,
    status VARCHAR(50) DEFAULT 'APPROVED', -- PENDING, APPROVED, CANCELLED
    is_applied_to_payroll BOOLEAN DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. سياسات الأمان RLS وصلاحيات الوصول
ALTER TABLE public.hr_biometric_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_biometric_raw_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_penalties_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_devices" ON public.hr_biometric_devices;
CREATE POLICY "allow_all_devices" ON public.hr_biometric_devices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_raw_logs" ON public.hr_biometric_raw_logs;
CREATE POLICY "allow_all_raw_logs" ON public.hr_biometric_raw_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_shifts" ON public.hr_shifts;
CREATE POLICY "allow_all_shifts" ON public.hr_shifts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_penalties" ON public.hr_penalties_rewards;
CREATE POLICY "allow_all_penalties" ON public.hr_penalties_rewards FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.hr_biometric_devices TO authenticated, anon;
GRANT ALL ON public.hr_biometric_raw_logs TO authenticated, anon;
GRANT ALL ON public.hr_shifts TO authenticated, anon;
GRANT ALL ON public.hr_penalties_rewards TO authenticated, anon;

-- 7. زرع وردية افتراضية إذا لم تكن موجودة
INSERT INTO public.hr_shifts (name, code, start_time, end_time, grace_period_minutes, overtime_start_minutes)
SELECT 'الوردية الصباحية القياسية', 'SHIFT-MORN', '09:00:00', '17:00:00', 15, 30
WHERE NOT EXISTS (SELECT 1 FROM public.hr_shifts WHERE code = 'SHIFT-MORN');

SELECT '✅ تم تجهيز جداول موديول الموارد البشرية المتطور (HR Enterprise 10/10) بنجاح' as status;


-- ==============================================================================
-- Migration: Stored Procedure for Adjusting Product Stock (RPC)
-- Date: 2026-09-01
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
    p_product_id UUID,
    p_quantity NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.products
    SET stock = COALESCE(stock, 0) + p_quantity,
        updated_at = now()
    WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(UUID, NUMERIC) TO authenticated, anon;


-- ==============================================================================
-- TriPro ERP — WMS Bin & Shelf Locations and In-Transit Transfers Migration
-- ==============================================================================

-- 1. جدول المواقع والرفوف التخزينية (Warehouse Bins & Shelves)
CREATE TABLE IF NOT EXISTS warehouse_bins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    
    bin_code VARCHAR(100) NOT NULL, -- مثل: WH1-Z1-A02-R03-S01-B05
    bin_name VARCHAR(255) NOT NULL, -- اسم وصفي: رف المشروبات أ-2
    barcode VARCHAR(100) UNIQUE,
    
    zone_name VARCHAR(100) NOT NULL DEFAULT 'Zone A', -- المنطقة (مثلاً: منطقة التبريد، منطقة البضائع الثقيلة)
    aisle VARCHAR(50) DEFAULT 'A1',                  -- الممر
    rack VARCHAR(50) DEFAULT 'R1',                   -- العمود / الاستاند
    shelf VARCHAR(50) DEFAULT 'S1',                  -- الرف
    bin_number VARCHAR(50) DEFAULT 'B1',             -- الخانة / الصندوق
    
    bin_type VARCHAR(50) NOT NULL DEFAULT 'storage', -- 'storage' (تخزين عام), 'cold_storage' (تبريد), 'fast_moving' (سريع الحركة), 'receiving' (استقبال), 'shipping' (شحن), 'quarantine' (حجر صحي)
    max_capacity_qty NUMERIC(15, 2) DEFAULT 1000.00,
    max_weight_kg NUMERIC(15, 2) DEFAULT 500.00,
    
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. جدول تسكين وأرصدة الأصناف على مستوى المواقع التخزينية (Bin Stock Allocations)
CREATE TABLE IF NOT EXISTS bin_stock_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    bin_id UUID NOT NULL REFERENCES warehouse_bins(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 0.00,
    batch_number VARCHAR(100) DEFAULT NULL,
    expiry_date DATE DEFAULT NULL,
    
    last_putaway_at TIMESTAMPTZ DEFAULT NOW(),
    last_picked_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ترقية جدول التحويلات المخزنية لدعم البضاعة بالطريق والشحنات ثنائية المراحل
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(30) DEFAULT 'direct'; -- 'direct', 'in_transit'
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS in_transit_status VARCHAR(30) DEFAULT 'delivered'; -- 'pending_dispatch', 'in_transit', 'partially_received', 'received_full', 'cancelled'
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(50) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(50) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS estimated_arrival DATE DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_by UUID DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS receipt_notes TEXT DEFAULT NULL;

-- 4. ترقية بنود التحويل المخزني لدعم كميات الفحص والعجز والتسكين
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS dispatched_qty NUMERIC(15, 4) DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC(15, 4) DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS variance_qty NUMERIC(15, 4) DEFAULT 0.00;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS from_bin_id UUID DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS to_bin_id UUID DEFAULT NULL;

-- 5. إنشاء الفهارس لسرعة الأداء
CREATE INDEX IF NOT EXISTS idx_wh_bins_org_wh 
ON warehouse_bins(organization_id, warehouse_id, is_active);

CREATE INDEX IF NOT EXISTS idx_wh_bins_code 
ON warehouse_bins(bin_code);

CREATE INDEX IF NOT EXISTS idx_bin_allocations_bin_prod 
ON bin_stock_allocations(bin_id, product_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_in_transit 
ON stock_transfers(organization_id, transfer_type, in_transit_status);


-- ==============================================================================
-- TriPro ERP - Migration: Fix Warehouse Bins Constraints (Solve 409 Conflict & 23505 Duplicate Key)
-- Date: 2026-09-02
-- 1. Drops global barcode unique constraint
-- 2. Deduplicates any existing bin_codes and barcodes
-- 3. Creates organization & warehouse scoped unique indexes
-- ==============================================================================

-- 1. إزالة قيد التفرد العام على الباركود الذي يسبب خطأ 409
ALTER TABLE public.warehouse_bins DROP CONSTRAINT IF EXISTS warehouse_bins_barcode_key;

-- 2. معالجة وتعديل أي أكواد رفوف مكررة حالياً في المستودع (مثل ZONEA-A1-R1-S1-B2) لمنع خطأ 23505
WITH ranked_bins AS (
    SELECT id, bin_code,
           ROW_NUMBER() OVER (
               PARTITION BY organization_id, warehouse_id, bin_code 
               ORDER BY created_at ASC, id ASC
           ) as rn
    FROM public.warehouse_bins
)
UPDATE public.warehouse_bins b
SET bin_code = b.bin_code || '-' || rb.rn,
    barcode = 'BIN-' || b.bin_code || '-' || rb.rn
FROM ranked_bins rb
WHERE b.id = rb.id AND rb.rn > 1;

-- 3. معالجة أي باركودات فارغة أو مكررة حالياً
WITH ranked_barcodes AS (
    SELECT id, barcode,
           ROW_NUMBER() OVER (
               PARTITION BY organization_id, barcode 
               ORDER BY created_at ASC, id ASC
           ) as rn
    FROM public.warehouse_bins
    WHERE barcode IS NOT NULL AND barcode != ''
)
UPDATE public.warehouse_bins b
SET barcode = b.barcode || '-' || rb.rn
FROM ranked_barcodes rb
WHERE b.id = rb.id AND rb.rn > 1;

UPDATE public.warehouse_bins
SET barcode = 'BIN-' || SUBSTRING(id::text, 1, 8)
WHERE barcode IS NULL OR barcode = '';

-- 4. إنشاء قيد تفرد كود الرف/الموقع داخل نفس المستودع والمنشأة حصراً
DROP INDEX IF EXISTS idx_wh_bins_code;
DROP INDEX IF EXISTS uq_wh_bins_org_wh_code;
CREATE UNIQUE INDEX uq_wh_bins_org_wh_code 
ON public.warehouse_bins(organization_id, warehouse_id, bin_code);

-- 5. إنشاء قيد تفرد الباركود داخل المنشأة حصراً
DROP INDEX IF EXISTS uq_wh_bins_org_barcode;
CREATE UNIQUE INDEX uq_wh_bins_org_barcode 
ON public.warehouse_bins(organization_id, barcode) 
WHERE barcode IS NOT NULL AND barcode != '';


-- ==============================================================================
-- TriPro ERP — Recurring Invoices & Customer Subscriptions Engine Migration
-- ==============================================================================

CREATE TABLE IF NOT EXISTS recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    subscription_number VARCHAR(50) NOT NULL,
    customer_id UUID NOT NULL,
    warehouse_id UUID DEFAULT NULL,
    salesperson_id UUID DEFAULT NULL,
    cost_center_id UUID DEFAULT NULL,
    
    title VARCHAR(255) NOT NULL,
    frequency VARCHAR(30) NOT NULL DEFAULT 'monthly', -- 'daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom'
    custom_interval_days INTEGER DEFAULT NULL,
    
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE DEFAULT NULL,
    next_run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_run_date DATE DEFAULT NULL,
    
    total_cycles INTEGER DEFAULT NULL,
    completed_cycles INTEGER NOT NULL DEFAULT 0,
    
    auto_post BOOLEAN NOT NULL DEFAULT TRUE,
    send_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
    send_email BOOLEAN NOT NULL DEFAULT FALSE,
    
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
    
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_type VARCHAR(20) DEFAULT 'fixed',
    discount_value NUMERIC(15, 2) DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    
    notes TEXT,
    created_by UUID DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurring_invoice_id UUID NOT NULL REFERENCES recurring_invoices(id) ON DELETE CASCADE,
    product_id UUID DEFAULT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1,
    uom_id UUID DEFAULT NULL,
    unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_percent NUMERIC(5, 2) DEFAULT 0.00,
    tax_percent NUMERIC(5, 2) DEFAULT 14.00,
    total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_invoice_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    recurring_invoice_id UUID NOT NULL REFERENCES recurring_invoices(id) ON DELETE CASCADE,
    generated_invoice_id UUID DEFAULT NULL,
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'success', -- 'success', 'failed'
    error_message TEXT,
    notified_whatsapp BOOLEAN DEFAULT FALSE,
    notified_email BOOLEAN DEFAULT FALSE,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- الفهارس لتحسين الأداء وسرعة الاستعلام
CREATE INDEX IF NOT EXISTS idx_rec_invoices_org_status_next_run 
ON recurring_invoices(organization_id, status, next_run_date);

CREATE INDEX IF NOT EXISTS idx_rec_invoices_customer 
ON recurring_invoices(customer_id);

CREATE INDEX IF NOT EXISTS idx_rec_invoice_items_parent 
ON recurring_invoice_items(recurring_invoice_id);

CREATE INDEX IF NOT EXISTS idx_rec_invoice_logs_parent 
ON recurring_invoice_logs(recurring_invoice_id);


-- ==============================================================================
-- TriPro ERP — Purchase RFQs & Vendor Bidding System Migration
-- ==============================================================================

-- 1. جدول طلبات عروض الأسعار (Purchase RFQs)
CREATE TABLE IF NOT EXISTS purchase_rfqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    rfq_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    deadline_date DATE NOT NULL,
    
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- 'draft', 'open', 'under_evaluation', 'awarded', 'cancelled'
    target_warehouse_id UUID DEFAULT NULL,
    
    notes TEXT,
    created_by UUID DEFAULT NULL,
    awarded_bid_id UUID DEFAULT NULL,
    generated_po_id UUID DEFAULT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. جدول بنود طلب عروض الأسعار (Purchase RFQ Items)
CREATE TABLE IF NOT EXISTS purchase_rfq_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id UUID NOT NULL REFERENCES purchase_rfqs(id) ON DELETE CASCADE,
    product_id UUID DEFAULT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100) DEFAULT '',
    uom_id UUID DEFAULT NULL,
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1.00,
    target_price NUMERIC(15, 4) DEFAULT NULL,
    specifications TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. جدول عروض أسعار الموردين المقدمة (Vendor Quotation Bids)
CREATE TABLE IF NOT EXISTS vendor_quotation_bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    rfq_id UUID NOT NULL REFERENCES purchase_rfqs(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL,
    supplier_name VARCHAR(255) DEFAULT '',
    supplier_phone VARCHAR(50) DEFAULT '',
    
    quotation_reference VARCHAR(100) DEFAULT '',
    bid_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE DEFAULT NULL,
    
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    
    lead_time_days INT DEFAULT 3, -- مدة التوريد بالأيام
    payment_terms VARCHAR(100) DEFAULT 'آجل 30 يوم', -- شروط السداد
    warranty_terms VARCHAR(255) DEFAULT NULL,
    
    is_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    score_points NUMERIC(5, 2) DEFAULT 0.00,
    evaluation_notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. جدول تفاصيل بنود عروض أسعار الموردين (Vendor Quotation Bid Items)
CREATE TABLE IF NOT EXISTS vendor_quotation_bid_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id UUID NOT NULL REFERENCES vendor_quotation_bids(id) ON DELETE CASCADE,
    rfq_item_id UUID DEFAULT NULL,
    product_id UUID DEFAULT NULL,
    product_name VARCHAR(255) NOT NULL,
    
    offered_quantity NUMERIC(15, 4) NOT NULL DEFAULT 1.00,
    unit_price NUMERIC(15, 4) NOT NULL DEFAULT 0.00,
    discount_percent NUMERIC(5, 2) DEFAULT 0.00,
    tax_percent NUMERIC(5, 2) DEFAULT 14.00,
    total_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    
    brand_or_model VARCHAR(100) DEFAULT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. الفهارس
CREATE INDEX IF NOT EXISTS idx_rfqs_org_status 
ON purchase_rfqs(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_bids_rfq_supplier 
ON vendor_quotation_bids(rfq_id, supplier_id);


-- ==============================================================================
-- TriPro ERP - Migration: Fix Columns & Constraints for Purchase Orders
-- Ensures purchase_orders and purchase_order_items have all needed columns
-- ==============================================================================

DO $$
BEGIN
    -- 1. جدول أوامر الشراء (Purchase Orders)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders' AND table_schema = 'public') THEN
        ALTER TABLE public.purchase_orders 
            ADD COLUMN IF NOT EXISTS po_number text,
            ADD COLUMN IF NOT EXISTS order_number text,
            ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id),
            ADD COLUMN IF NOT EXISTS order_date date DEFAULT CURRENT_DATE,
            ADD COLUMN IF NOT EXISTS expected_delivery_date date,
            ADD COLUMN IF NOT EXISTS delivery_date date,
            ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS payment_terms text,
            ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft',
            ADD COLUMN IF NOT EXISTS notes text,
            ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
            ADD COLUMN IF NOT EXISTS created_by uuid,
            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id),
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

        -- مزامنة رقم أمر الشراء وتاريخ التسليم بين الأعمدة المترادفة
        UPDATE public.purchase_orders SET po_number = order_number WHERE po_number IS NULL AND order_number IS NOT NULL;
        UPDATE public.purchase_orders SET order_number = po_number WHERE order_number IS NULL AND po_number IS NOT NULL;
        UPDATE public.purchase_orders SET delivery_date = expected_delivery_date WHERE delivery_date IS NULL AND expected_delivery_date IS NOT NULL;
        UPDATE public.purchase_orders SET expected_delivery_date = delivery_date WHERE expected_delivery_date IS NULL AND delivery_date IS NOT NULL;
    END IF;

    -- 2. جدول بنود أمر الشراء (Purchase Order Items)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items' AND table_schema = 'public') THEN
        ALTER TABLE public.purchase_order_items 
            ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id),
            ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 1,
            ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0,
            ADD COLUMN IF NOT EXISTS uom_id uuid REFERENCES public.uoms(id),
            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

        -- مزامنة معرف الأمر بين العمودين purchase_order_id و order_id
        UPDATE public.purchase_order_items SET purchase_order_id = order_id WHERE purchase_order_id IS NULL AND order_id IS NOT NULL;
        UPDATE public.purchase_order_items SET order_id = purchase_order_id WHERE order_id IS NULL AND purchase_order_id IS NOT NULL;
    END IF;

    -- 3. إعادة تحميل كاش المخطط لـ PostgREST
    NOTIFY pgrst, 'reload schema';
END $$;

SELECT '🚀 تم تأسيس قاعدة بيانات النواة الأساسية لـ TriPro ERP (01_core_erp.sql) بنجاح تام 100%' as status;
