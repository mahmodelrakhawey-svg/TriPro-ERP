-- =============================================================================
-- 🌟 TriPro ERP — Commercial Core Database Package (01_core_erp.sql)
-- 🏢 النواة الأساسية الإلزامية: الحسابات، المخازن، WMS، المبيعات، المشتريات، POS
-- 🛡️ Idempotent: آمن للتشغيل عدة مرات دون فقدان بيانات
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. جدول المنظمات والشركات (Multi-tenancy Organizations)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    trade_name TEXT,
    tax_number TEXT,
    commercial_reg_no TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    currency TEXT DEFAULT 'EGP',
    logo_url TEXT,
    footer_text TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    allowed_modules TEXT[] DEFAULT '{"accounting", "inventory", "sales", "purchases", "retail"}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- دالة استخراج منظمة المستخدم النشط (Helper RPC)
CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS UUID AS $$
BEGIN
    RETURN COALESCE(
        (current_setting('app.current_org_id', true))::uuid,
        (SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1),
        (SELECT (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. جدول المستخدمين والملفات الشخصية (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول الأدوار والصلاحيات (Roles & RBAC)
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. شجرة الحسابات (Chart of Accounts)
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    type TEXT NOT NULL, -- 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
    parent_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    is_group BOOLEAN DEFAULT FALSE,
    balance NUMERIC(19,4) DEFAULT 0,
    currency TEXT DEFAULT 'EGP',
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_accounts_org_code UNIQUE(organization_id, code)
);

-- 5. مراكز التكلفة والسنوات المالية (Cost Centers & Fiscal Years)
CREATE TABLE IF NOT EXISTS public.cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_cost_centers_org_code UNIQUE(organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.fiscal_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_closed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_fiscal_years_org_name UNIQUE(organization_id, name)
);

-- 6. قيود اليومية والأستاذ العام (Journal Entries & General Ledger)
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    entry_number TEXT NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    status TEXT DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'void')),
    source_document_type TEXT,
    source_document_id UUID,
    total_debit NUMERIC(19,4) DEFAULT 0,
    total_credit NUMERIC(19,4) DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_journal_entries_org_num UNIQUE(organization_id, entry_number)
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id),
    cost_center_id UUID REFERENCES public.cost_centers(id),
    project_id UUID,
    debit NUMERIC(19,4) DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC(19,4) DEFAULT 0 CHECK (credit >= 0),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. البنوك والخزينة والشيكات (Banking & Treasury)
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    iban TEXT,
    swift_code TEXT,
    currency TEXT DEFAULT 'EGP',
    gl_account_id UUID REFERENCES public.accounts(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cheques (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    cheque_number TEXT NOT NULL,
    cheque_type TEXT NOT NULL CHECK (cheque_type IN ('received', 'issued')),
    bank_name TEXT,
    amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    payee_name TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'bounced', 'cancelled')),
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. العملاء والموردين (Customers & Vendors)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    tax_number TEXT,
    address TEXT,
    credit_limit NUMERIC(19,4) DEFAULT 0,
    balance NUMERIC(19,4) DEFAULT 0,
    gl_account_id UUID REFERENCES public.accounts(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    tax_number TEXT,
    address TEXT,
    balance NUMERIC(19,4) DEFAULT 0,
    gl_account_id UUID REFERENCES public.accounts(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. وحدات القياس (Units of Measure - UOM)
CREATE TABLE IF NOT EXISTS public.uom_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.uoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    category_id UUID REFERENCES public.uom_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    uom_type TEXT CHECK (uom_type IN ('reference', 'smaller', 'bigger')),
    ratio NUMERIC(19,4) DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_uoms_org_name UNIQUE(organization_id, name)
);

-- 10. المستودعات وهيكلة الرفوف (Warehouses & WMS Bins)
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    code TEXT,
    location TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_in_transit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.warehouse_bins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    zone TEXT NOT NULL,
    aisle TEXT NOT NULL,
    shelf TEXT NOT NULL,
    bin_code TEXT NOT NULL,
    barcode TEXT,
    capacity NUMERIC(15,2) DEFAULT 1000,
    current_occupancy NUMERIC(15,2) DEFAULT 0,
    storage_type TEXT DEFAULT 'SHELF',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_wh_bins_org_wh_code UNIQUE(organization_id, warehouse_id, bin_code)
);

CREATE TABLE IF NOT EXISTS public.bin_stock_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    bin_id UUID NOT NULL REFERENCES public.warehouse_bins(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    allocated_quantity NUMERIC(15,2) NOT NULL DEFAULT 0,
    batch_number TEXT,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_bin_stock_alloc_product UNIQUE(bin_id, product_id, batch_number)
);

-- 11. تصنيفات وأصناف المخزون (Product Categories & Catalog)
CREATE TABLE IF NOT EXISTS public.item_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.item_categories(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    name_en TEXT,
    sku TEXT,
    barcode TEXT,
    category_id UUID REFERENCES public.item_categories(id),
    product_type TEXT DEFAULT 'STOCK', -- 'STOCK', 'RAW_MATERIAL', 'MANUFACTURED', 'SERVICE'
    stock NUMERIC(19,4) DEFAULT 0,
    warehouse_stock JSONB DEFAULT '{}', -- mapping: warehouse_id -> quantity
    cost NUMERIC(19,4) DEFAULT 0,
    purchase_price NUMERIC(19,4) DEFAULT 0,
    sales_price NUMERIC(19,4) DEFAULT 0,
    weighted_average_cost NUMERIC(19,4) DEFAULT 0,
    base_uom_id UUID REFERENCES public.uoms(id),
    purchase_uom_id UUID REFERENCES public.uoms(id),
    sale_uom_id UUID REFERENCES public.uoms(id),
    min_stock NUMERIC(19,4) DEFAULT 0,
    max_stock NUMERIC(19,4) DEFAULT 0,
    station_id VARCHAR(100),
    prep_time_minutes INT DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. حركات المخزون والتحويلات والتسويات (Inventory Movements & Adjustments)
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    transfer_number TEXT NOT NULL,
    source_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    destination_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    quantity NUMERIC(19,4) NOT NULL CHECK (quantity > 0),
    uom_id UUID REFERENCES public.uoms(id),
    unit_cost NUMERIC(19,4) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    adjustment_number TEXT NOT NULL,
    adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    reason TEXT,
    status TEXT DEFAULT 'APPROVED',
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adjustment_id UUID NOT NULL REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    system_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
    actual_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
    difference_quantity NUMERIC(19,4) GENERATED ALWAYS AS (actual_quantity - system_quantity) STORED,
    unit_cost NUMERIC(19,4) DEFAULT 0,
    total_cost NUMERIC(19,4) GENERATED ALWAYS AS (abs(actual_quantity - system_quantity) * unit_cost) STORED
);

-- 13. فواتير المبيعات ونقاط البيع (Sales & Invoicing)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_id UUID REFERENCES public.customers(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    subtotal NUMERIC(19,4) DEFAULT 0,
    tax_amount NUMERIC(19,4) DEFAULT 0,
    discount_amount NUMERIC(19,4) DEFAULT 0,
    total NUMERIC(19,4) DEFAULT 0,
    paid_amount NUMERIC(19,4) DEFAULT 0,
    remaining_amount NUMERIC(19,4) GENERATED ALWAYS AS (total - paid_amount) STORED,
    status TEXT DEFAULT 'PAID' CHECK (status IN ('DRAFT', 'POSTED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED')),
    payment_method TEXT DEFAULT 'CASH',
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    quantity NUMERIC(19,4) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(19,4) NOT NULL DEFAULT 0,
    subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(19,4) DEFAULT 0,
    discount_amount NUMERIC(19,4) DEFAULT 0,
    total NUMERIC(19,4) NOT NULL DEFAULT 0,
    uom_id UUID REFERENCES public.uoms(id),
    unit_cost NUMERIC(19,4) DEFAULT 0
);

-- 14. فواتير المشتريات والموردين (Purchasing & Payables)
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    supplier_id UUID REFERENCES public.suppliers(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    subtotal NUMERIC(19,4) DEFAULT 0,
    tax_amount NUMERIC(19,4) DEFAULT 0,
    discount_amount NUMERIC(19,4) DEFAULT 0,
    total NUMERIC(19,4) DEFAULT 0,
    paid_amount NUMERIC(19,4) DEFAULT 0,
    status TEXT DEFAULT 'PAID',
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    quantity NUMERIC(19,4) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(19,4) NOT NULL DEFAULT 0,
    total NUMERIC(19,4) NOT NULL DEFAULT 0,
    uom_id UUID REFERENCES public.uoms(id)
);

-- 15. دوال محرك النظام وإعادة احتساب الأرصدة (Central RPC Functions)
CREATE OR REPLACE FUNCTION public.recalculate_stock_rpc(
    p_org_id UUID,
    p_product_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
    v_total_stock NUMERIC := 0;
    v_wstock JSONB := '{}'::jsonb;
    rec RECORD;
BEGIN
    -- حساب الأرصدة لكل مستودع بناء على الحركات
    FOR rec IN 
        SELECT 
            w.id AS warehouse_id,
            COALESCE((
                -- 1. فواتير المشتريات (+)
                SELECT COALESCE(SUM(pii.quantity), 0)
                FROM public.purchase_invoice_items pii
                JOIN public.purchase_invoices pi ON pi.id = pii.invoice_id
                WHERE pii.product_id = p_product_id AND pi.warehouse_id = w.id AND pi.organization_id = p_org_id
            ), 0)
            + COALESCE((
                -- 2. تحويلات واردة (+)
                SELECT COALESCE(SUM(ti.quantity), 0)
                FROM public.stock_transfer_items ti
                JOIN public.stock_transfers t ON t.id = ti.transfer_id
                WHERE ti.product_id = p_product_id AND t.destination_warehouse_id = w.id AND t.status = 'COMPLETED' AND t.organization_id = p_org_id
            ), 0)
            - COALESCE((
                -- 3. تحويلات صادرة (-)
                SELECT COALESCE(SUM(ti.quantity), 0)
                FROM public.stock_transfer_items ti
                JOIN public.stock_transfers t ON t.id = ti.transfer_id
                WHERE ti.product_id = p_product_id AND t.source_warehouse_id = w.id AND t.status = 'COMPLETED' AND t.organization_id = p_org_id
            ), 0)
            - COALESCE((
                -- 4. فواتير مبيعات (-)
                SELECT COALESCE(SUM(ii.quantity), 0)
                FROM public.invoice_items ii
                JOIN public.invoices inv ON inv.id = ii.invoice_id
                WHERE ii.product_id = p_product_id AND inv.warehouse_id = w.id AND inv.organization_id = p_org_id
            ), 0)
            + COALESCE((
                -- 5. تسويات الجرد (فرق الكمية)
                SELECT COALESCE(SUM(sai.difference_quantity), 0)
                FROM public.stock_adjustment_items sai
                JOIN public.stock_adjustments sa ON sa.id = sai.adjustment_id
                WHERE sai.product_id = p_product_id AND sa.warehouse_id = w.id AND sa.organization_id = p_org_id
            ), 0) AS net_qty
        FROM public.warehouses w
        WHERE w.organization_id = p_org_id AND w.is_active = TRUE
    LOOP
        v_total_stock := v_total_stock + rec.net_qty;
        v_wstock := jsonb_set(v_wstock, ARRAY[rec.warehouse_id::text], to_jsonb(rec.net_qty));
    END LOOP;

    -- تحديث الصنف
    UPDATE public.products
    SET stock = v_total_stock,
        warehouse_stock = v_wstock,
        updated_at = NOW()
    WHERE id = p_product_id AND organization_id = p_org_id;

    RETURN v_total_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 16. تفعيل سياسات الأمان والعزل للمنظمات (Row Level Security)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bin_stock_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_accounts ON public.accounts FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_journals ON public.journal_entries FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_products ON public.products FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_warehouses ON public.warehouses FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_invoices ON public.invoices FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- تم إعداد النواة الأساسية للـ Core بنجاح ✅
