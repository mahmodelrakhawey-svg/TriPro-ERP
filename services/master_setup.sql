-- 🌟 ملف التأسيس الشامل (Master Setup) - TriPro ERP
-- 📅 تاريخ التحديث: 2026-03-01 (مطابق للهيكل الفعلي)
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
    avatar_url text,
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
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    type text NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    parent_id uuid REFERENCES public.accounts(id),
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
    organization_id uuid REFERENCES public.organizations(id),
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
    customer_type text DEFAULT 'individual', -- individual, store, online
    balance numeric DEFAULT 0, -- حقل محسوب (اختياري للأداء)
    deleted_at timestamptz,
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
    deleted_at timestamptz,
    deletion_reason text
);

-- تصنيفات الأصناف (موجود في الهيكل الحالي)
CREATE TABLE public.item_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name varchar NOT NULL,
    default_inventory_account_id uuid REFERENCES public.accounts(id),
    default_cogs_account_id uuid REFERENCES public.accounts(id),
    default_sales_account_id uuid REFERENCES public.accounts(id)
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
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.invoice_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric,    unit_price numeric,
    total numeric,
    discount numeric DEFAULT 0,
    tax_rate numeric DEFAULT 0,
    custom_fields jsonb,
    cost numeric DEFAULT 0 -- Cost at time of sale
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
    created_by uuid REFERENCES auth.users(id),
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
    created_by uuid REFERENCES auth.users(id),
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
    created_by uuid REFERENCES auth.users(id),
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
    salesperson_id uuid REFERENCES public.profiles(id),
    quotation_date date,
    expiry_date date,
    total_amount numeric,
    tax_amount numeric,
    subtotal numeric,
    status text DEFAULT 'draft', -- draft, sent, accepted, rejected, converted
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
    delivery_date date,
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
    cost_center_id uuid REFERENCES public.cost_centers(id),
    payment_method text DEFAULT 'cash',
    currency text DEFAULT 'SAR',
    exchange_rate numeric DEFAULT 1,
    type text DEFAULT 'receipt', -- receipt, deposit
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
    original_invoice_number text,
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
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
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
    year integer,
    month integer,
    items jsonb,
    name text,
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

-- جدول صلاحيات المستخدمين المباشرة (موجود في الهيكل)
CREATE TABLE public.user_permissions (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
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
    created_by uuid REFERENCES auth.users(id),
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
    reason text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.stock_adjustment_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    stock_adjustment_id uuid REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id),
    quantity numeric, -- الموجب زيادة، السالب عجز
    type text -- in / out
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
    system_qty numeric,
    actual_qty numeric,
    difference numeric,
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
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.work_order_costs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    work_order_id uuid REFERENCES public.work_orders(id) ON DELETE CASCADE,
    cost_type text, -- labor, overhead, other
    amount numeric,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.notification_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================================
-- 3. الدوال البرمجية (Functions)
-- ================================================================

-- دالة اعتماد الفاتورة
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_invoice record; v_item record; v_org_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_customer_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid; v_discount_acc_id uuid; v_treasury_acc_id uuid; v_journal_id uuid; v_total_cost numeric := 0; v_item_cost numeric; v_exchange_rate numeric; v_total_amount_base numeric; v_paid_amount_base numeric; v_subtotal_base numeric; v_tax_amount_base numeric; v_discount_amount_base numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF v_invoice.status = 'posted' OR v_invoice.status = 'paid' THEN RAISE EXCEPTION 'الفاتورة مرحلة بالفعل'; END IF;

    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    v_exchange_rate := COALESCE(v_invoice.exchange_rate, 1);
    IF v_exchange_rate <= 0 THEN v_exchange_rate := 1; END IF;

    SELECT id INTO v_sales_acc_id FROM public.accounts WHERE code = '411' LIMIT 1;
    SELECT id INTO v_vat_acc_id FROM public.accounts WHERE code = '2231' LIMIT 1;
    SELECT id INTO v_customer_acc_id FROM public.accounts WHERE code = '1221' LIMIT 1;
    SELECT id INTO v_cogs_acc_id FROM public.accounts WHERE code = '511' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM public.accounts WHERE code = '10302' LIMIT 1; -- استخدام حساب المنتج التام
    SELECT id INTO v_discount_acc_id FROM public.accounts WHERE code = '413' LIMIT 1;
    v_treasury_acc_id := v_invoice.treasury_account_id;

    FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
        SELECT weighted_average_cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id;
        IF v_item_cost IS NULL OR v_item_cost = 0 THEN SELECT cost INTO v_item_cost FROM public.products WHERE id = v_item.product_id; END IF;
        IF v_item_cost IS NULL OR v_item_cost = 0 THEN SELECT purchase_price INTO v_item_cost FROM public.products WHERE id = v_item.product_id; END IF;
        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_item.quantity);

        UPDATE public.products SET stock = stock - v_item.quantity, warehouse_stock = jsonb_set(COALESCE(warehouse_stock, '{}'::jsonb), ARRAY[v_invoice.warehouse_id::text], to_jsonb(COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_item.quantity)) WHERE id = v_item.product_id;
    END LOOP;

    v_total_amount_base := v_invoice.total_amount * v_exchange_rate;
    v_paid_amount_base := COALESCE(v_invoice.paid_amount, 0) * v_exchange_rate;
    v_subtotal_base := v_invoice.subtotal * v_exchange_rate;
    v_tax_amount_base := COALESCE(v_invoice.tax_amount, 0) * v_exchange_rate;
    v_discount_amount_base := COALESCE(v_invoice.discount_amount, 0) * v_exchange_rate;

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted) VALUES (v_invoice.invoice_date, 'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_invoice.invoice_number, 'posted', v_org_id, p_invoice_id, 'invoice', true) RETURNING id INTO v_journal_id;

    IF (v_total_amount_base - v_paid_amount_base) > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_customer_acc_id, (v_total_amount_base - v_paid_amount_base), 0, 'استحقاق عميل', v_org_id); END IF;
    IF v_paid_amount_base > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_treasury_acc_id, v_paid_amount_base, 0, 'تحصيل نقدي', v_org_id); END IF;
    IF v_discount_amount_base > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_discount_acc_id, v_discount_amount_base, 0, 'خصم ممنوح', v_org_id); END IF;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_sales_acc_id, 0, v_subtotal_base, 'إيراد مبيعات', v_org_id);
    IF v_tax_amount_base > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_vat_acc_id, 0, v_tax_amount_base, 'ضريبة القيمة المضافة', v_org_id); END IF;
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة', v_org_id); INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون', v_org_id); END IF;

    UPDATE public.invoices SET status = CASE WHEN (total_amount - COALESCE(paid_amount, 0)) <= 0 THEN 'paid' ELSE 'posted' END, related_journal_entry_id = v_journal_id WHERE id = p_invoice_id;
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

-- دالة إعادة احتساب المخزون
CREATE OR REPLACE FUNCTION recalculate_stock_rpc()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE prod_record RECORD; wh_record RECORD; total_qty NUMERIC; wh_json JSONB; wh_qty NUMERIC;
BEGIN
    FOR prod_record IN SELECT id FROM products WHERE deleted_at IS NULL LOOP
        total_qty := 0; wh_json := '{}'::jsonb;
        FOR wh_record IN SELECT id FROM warehouses WHERE deleted_at IS NULL LOOP
            wh_qty := 0;
            SELECT wh_qty - COALESCE(SUM(ii.quantity), 0) INTO wh_qty FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE ii.product_id = prod_record.id AND i.warehouse_id = wh_record.id AND i.status != 'draft';
            SELECT wh_qty + COALESCE(SUM(pii.quantity), 0) INTO wh_qty FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id WHERE pii.product_id = prod_record.id AND pi.warehouse_id = wh_record.id AND pi.status != 'draft';
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

-- تفعيل RLS على الجداول
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- دالة مساعدة للتحقق من دور المستخدم
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT role::text FROM public.profiles WHERE id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (get_my_role() IN ('super_admin', 'admin'));
END;
$$;

-- سياسات الوصول (Policies)
-- 1. Profiles
CREATE POLICY "Profiles viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Settings
CREATE POLICY "Settings viewable by authenticated" ON company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins update settings" ON company_settings FOR UPDATE USING (is_admin());

-- 3. Basic Data (Read for all, Write for Staff)
CREATE POLICY "Data viewable by authenticated" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage products" ON products FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'sales', 'purchases'));

CREATE POLICY "Customers viewable by authenticated" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage customers" ON customers FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'sales'));

CREATE POLICY "Suppliers viewable by authenticated" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage suppliers" ON suppliers FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'purchases'));

CREATE POLICY "Accounts viewable by authenticated" ON accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage accounts" ON accounts FOR ALL USING (is_admin());

-- 4. Transactions
CREATE POLICY "Invoices viewable by authenticated" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sales manage invoices" ON invoices FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'sales'));

CREATE POLICY "Journals viewable by authenticated" ON journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountants manage journals" ON journal_entries FOR ALL USING (get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant'));

-- 5. Notifications (User specific)
CREATE POLICY "Users view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- 6. Security Logs (Insert for all, View for Admin)
CREATE POLICY "Everyone insert logs" ON security_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = performed_by);
CREATE POLICY "Admins view logs" ON security_logs FOR SELECT USING (is_admin());

-- تم الانتهاء من إعداد قاعدة البيانات بالكامل! ✅
