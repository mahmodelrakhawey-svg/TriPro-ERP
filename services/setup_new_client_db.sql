-- 🌟 ملف إعداد قاعدة بيانات لعميل جديد (New Client Setup) - النسخة الشاملة
-- يقوم بإنشاء الهيكل الكامل (الجداول) + الدوال البرمجية + دليل الحسابات القياسي + الإعدادات الأساسية.
-- ⚠️ تحذير: هذا الملف يقوم بمسح قاعدة البيانات بالكامل قبل الإنشاء! استخدمه فقط في المشاريع الجديدة.

-- ========= 0. تنظيف وإعداد المخطط =========
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
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
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
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
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id uuid REFERENCES public.products(id),
    quantity_required numeric NOT NULL DEFAULT 1
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
    invoice_number text,
    supplier_id uuid REFERENCES public.suppliers(id),
    invoice_date date,
    total_amount numeric,
    tax_amount numeric,
    status text,
    warehouse_id uuid REFERENCES public.warehouses(id),
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
