-- =============================================================================
-- 🌟 TriPro ERP — Master Enterprise Suite (00_full_enterprise_all_in_one.sql)
-- 🏢 الحزمة الشاملة الكاملة لجميع المديولات: النواة + المطاعم + المقاولات + التصنيع + النوادي + المستشفيات
-- 🛡️ تثبيت كامل بضغطة زر واحدة (1-Click Full Install)
-- =============================================================================

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


-- =============================================================================
-- 🍔 TriPro ERP — Commercial Add-on: Restaurants & Cafes (02_addon_restaurants.sql)
-- 🍽️ مديول المطاعم والكافيهات: الصالة والطاولات، KDS المطبخ، الوصفات، التشفية، التوصيل
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. جدول طاولات المطعم وتخطيط الصالة (Restaurant Tables)
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    floor TEXT DEFAULT 'Main Floor',
    capacity INT DEFAULT 4,
    status TEXT DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'DIRTY', 'OUT_OF_SERVICE')),
    qr_key TEXT UNIQUE,
    pos_x INT DEFAULT 0,
    pos_y INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جلسات الطاولات وحساب الشيك (Table Sessions)
CREATE TABLE IF NOT EXISTS public.table_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    table_id UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    server_name TEXT,
    guest_count INT DEFAULT 2,
    status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'BILL_REQUESTED', 'PAID', 'CLOSED')),
    total_amount NUMERIC(15,2) DEFAULT 0,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- 3. محطات تحضير المطبخ (Kitchen Stations)
CREATE TABLE IF NOT EXISTS public.kitchen_stations (
    id VARCHAR(100) PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    color VARCHAR(50) DEFAULT '#e11d48',
    icon VARCHAR(50) DEFAULT 'Flame',
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- زرع المحطات الافتراضية
INSERT INTO public.kitchen_stations (id, name, code, color, icon, display_order, is_active)
VALUES 
  ('st_grill', 'محطة الشواية والبرجر (Grill)', 'GRILL', '#e11d48', 'Flame', 1, true),
  ('st_oven', 'محطة الفرن والبيتزا (Oven)', 'OVEN', '#d97706', 'Utensils', 2, true),
  ('st_barista', 'محطة البار والمشروبات (Barista)', 'BAR', '#0284c7', 'Coffee', 3, true),
  ('st_salad', 'محطة المقبلات والسلطات (Cold)', 'COLD', '#16a34a', 'Leaf', 4, true)
ON CONFLICT (id) DO NOTHING;

-- 4. أوامر وتذاكر المطبخ الذكية (KDS Tickets)
CREATE TABLE IF NOT EXISTS public.kitchen_ticket_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    order_item_id UUID,
    station_id VARCHAR(100) REFERENCES public.kitchen_stations(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'NEW' CHECK (status IN ('NEW', 'PREPARING', 'READY', 'SERVED')),
    fired_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. مجموعات الإضافات وخيارات الوجبات (Modifiers)
CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    name_en TEXT,
    min_selection INT DEFAULT 0,
    max_selection INT DEFAULT 1,
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    group_id UUID NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(15,2) DEFAULT 0,
    cost NUMERIC(15,2) DEFAULT 0,
    recipe_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, group_id)
);

-- 6. شجرة مكونات الوجبة والخصم المخزني الآلي (Recipe / BOM with Shrinkage)
CREATE TABLE IF NOT EXISTS public.bill_of_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    raw_material_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity_required NUMERIC(15,4) NOT NULL DEFAULT 1,
    shrinkage_pct NUMERIC(5,2) DEFAULT 0, -- نسبة الانكماش وهالك الطهي %
    uom_id UUID REFERENCES public.uoms(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. تشفية وتفكيك اللحوم والدواجن (Butchering & Yield Management)
CREATE TABLE IF NOT EXISTS public.butchering_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    category TEXT DEFAULT 'beef',
    description TEXT,
    default_expected_yield_pct NUMERIC(5,2) DEFAULT 95.0,
    default_max_shrinkage_pct NUMERIC(5,2) DEFAULT 5.0,
    cost_allocation_method TEXT DEFAULT 'relative_value',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.butchering_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.butchering_templates(id) ON DELETE CASCADE,
    output_name TEXT NOT NULL,
    expected_yield_pct NUMERIC(5,2) NOT NULL,
    relative_value_weight NUMERIC(5,2) DEFAULT 1.0,
    is_by_product BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.butchering_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    order_number TEXT NOT NULL,
    template_id UUID REFERENCES public.butchering_templates(id),
    source_product_id UUID NOT NULL REFERENCES public.products(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    destination_warehouse_id UUID REFERENCES public.warehouses(id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    input_weight NUMERIC(15,3) NOT NULL,
    input_cost_per_kg NUMERIC(15,2) NOT NULL,
    total_input_cost NUMERIC(15,2) NOT NULL,
    additional_labor_cost NUMERIC(15,2) DEFAULT 0,
    additional_overhead_cost NUMERIC(15,2) DEFAULT 0,
    total_net_cost NUMERIC(15,2) NOT NULL,
    total_output_weight NUMERIC(15,3) DEFAULT 0,
    shrinkage_weight NUMERIC(15,3) DEFAULT 0,
    shrinkage_pct NUMERIC(5,2) DEFAULT 0,
    useful_yield_pct NUMERIC(5,2) DEFAULT 0,
    cost_allocation_method TEXT DEFAULT 'relative_value',
    status TEXT DEFAULT 'completed',
    butcher_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.butchering_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.butchering_orders(id) ON DELETE CASCADE,
    output_name TEXT NOT NULL,
    output_product_id UUID REFERENCES public.products(id),
    actual_weight NUMERIC(15,3) NOT NULL,
    yield_pct NUMERIC(5,2) DEFAULT 0,
    relative_value_weight NUMERIC(5,2) DEFAULT 1.0,
    allocated_cost_per_kg NUMERIC(15,2) NOT NULL,
    total_allocated_cost NUMERIC(15,2) NOT NULL,
    is_by_product BOOLEAN DEFAULT FALSE,
    notes TEXT
);

-- 8. طياري التوصيل وتسوية العهد (Delivery Drivers & Settlements)
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    vehicle_type TEXT DEFAULT 'موتوسيكل',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    driver_id UUID REFERENCES public.delivery_drivers(id),
    order_id UUID REFERENCES public.invoices(id),
    order_number TEXT NOT NULL,
    delivery_fee NUMERIC(15,2) DEFAULT 0,
    cash_to_collect NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.driver_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    driver_id UUID NOT NULL REFERENCES public.delivery_drivers(id),
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_orders INT DEFAULT 0,
    total_cash_expected NUMERIC(15,2) DEFAULT 0,
    total_cash_received NUMERIC(15,2) DEFAULT 0,
    difference NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. ساعات التخفيض السعيدة (Happy Hour Schedules)
CREATE TABLE IF NOT EXISTS public.happy_hour_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    discount_pct NUMERIC(5,2) NOT NULL,
    days_of_week INT[] DEFAULT '{0,1,2,3,4,5,6}',
    start_time TIME NOT NULL DEFAULT '16:00',
    end_time TIME NOT NULL DEFAULT '19:00',
    applies_to_all_products BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. تفعيل RLS والصلاحيات
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.butchering_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_tables ON public.restaurant_tables FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_sessions ON public.table_sessions FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_stations ON public.kitchen_stations FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- 🏗️ TriPro ERP — Commercial Add-on: Contracting & Projects (03_addon_contracting.sql)
-- 🏢 مديول المقاولات: المشاريع، جداول الكميات BOQ، المستخلصات، مقاولي الباطن، ونسب الهالك
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. جدول المشاريع الإنشائية وعقود العملاء
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    description TEXT,
    customer_id UUID REFERENCES public.customers(id),
    contract_value NUMERIC(15,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    cost_center_account_id UUID REFERENCES public.accounts(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. المراحل الزمنية ومخطط جانت للمشروع (Project Milestones)
CREATE TABLE IF NOT EXISTS public.project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    expected_start_date DATE NOT NULL,
    expected_end_date DATE NOT NULL,
    actual_completion_date DATE,
    progress_percentage NUMERIC(5,2) DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delayed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. مقايسات الأعمال وجداول الكميات (BOQ)
CREATE TABLE IF NOT EXISTS public.project_boq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    unit TEXT DEFAULT 'م3',
    estimated_quantity NUMERIC(15,2) DEFAULT 0,
    unit_price NUMERIC(15,2) DEFAULT 0,
    total_price NUMERIC(15,2) GENERATED ALWAYS AS (estimated_quantity * unit_price) STORED,
    material_cost_per_unit NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. مستخلصات العميل الجارية والختامية (Client Progress Billings)
CREATE TABLE IF NOT EXISTS public.project_progress_billings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    billing_number TEXT NOT NULL,
    billing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completion_percentage NUMERIC(5,2) DEFAULT 0,
    gross_amount NUMERIC(15,2) NOT NULL,
    retention_amount NUMERIC(15,2) DEFAULT 0, -- تأمين أعمال محتجز
    advance_deduction NUMERIC(15,2) DEFAULT 0, -- استهلاك دفعة مقدمة
    net_amount NUMERIC(15,2) GENERATED ALWAYS AS (gross_amount - retention_amount - advance_deduction) STORED,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    status TEXT DEFAULT 'approved' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    items_progress JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. مقاولو الباطن وعقودهم ومستخلصاتهم (Subcontractors)
CREATE TABLE IF NOT EXISTS public.subcontractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    specialty TEXT,
    phone TEXT,
    tax_number TEXT,
    balance NUMERIC(15,2) DEFAULT 0,
    gl_account_id UUID REFERENCES public.accounts(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subcontractor_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    subcontractor_id UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
    contract_number TEXT NOT NULL,
    scope_of_work TEXT,
    total_amount NUMERIC(15,2) NOT NULL,
    start_date DATE,
    end_date DATE,
    retention_pct NUMERIC(5,2) DEFAULT 5.0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subcontractor_billings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    contract_id UUID NOT NULL REFERENCES public.subcontractor_contracts(id) ON DELETE CASCADE,
    billing_number TEXT NOT NULL,
    billing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    gross_amount NUMERIC(15,2) NOT NULL,
    retention_amount NUMERIC(15,2) DEFAULT 0,
    penalty_deduction NUMERIC(15,2) DEFAULT 0,
    net_amount NUMERIC(15,2) GENERATED ALWAYS AS (gross_amount - retention_amount - penalty_deduction) STORED,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    status TEXT DEFAULT 'approved',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. أذون صرف المواد للمواقع (Material Issues)
CREATE TABLE IF NOT EXISTS public.project_material_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    issue_number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'APPROVED',
    notes TEXT,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_material_issue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES public.project_material_issues(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    boq_item_id UUID REFERENCES public.project_boq(id),
    quantity NUMERIC(15,2) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(15,2) DEFAULT 0,
    total_cost NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
);

-- 7. مطالبات فروق الأسعار والتضخم (Price Escalations)
CREATE TABLE IF NOT EXISTS public.project_price_escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    claim_number TEXT NOT NULL,
    billing_period TEXT,
    material_category TEXT NOT NULL,
    contract_base_price NUMERIC(15,2) NOT NULL,
    current_market_price NUMERIC(15,2) NOT NULL,
    weight_factor NUMERIC(5,2) NOT NULL,
    executed_work_value NUMERIC(15,2) NOT NULL,
    calculated_escalation_amount NUMERIC(15,2) NOT NULL,
    status TEXT DEFAULT 'PENDING_APPROVAL',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. الرؤى التحليلية لمؤشرات الأداء للمشاريع
CREATE OR REPLACE VIEW public.v_project_performance_dashboard AS
SELECT 
    p.id AS project_id,
    p.organization_id,
    p.name AS project_name,
    p.status,
    p.contract_value AS bac,
    COALESCE((SELECT SUM(gross_amount) FROM public.project_progress_billings WHERE project_id = p.id AND status = 'approved'), 0) AS earned_value,
    COALESCE((SELECT SUM(jl.debit - jl.credit) FROM public.journal_lines jl WHERE jl.cost_center_id = p.cost_center_account_id), 0) AS actual_cost,
    ROUND(COALESCE((SELECT AVG(progress_percentage) FROM public.project_milestones WHERE project_id = p.id), 0), 1) AS progress_pct
FROM public.projects p;

-- 9. تفعيل RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_boq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_progress_billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_issues ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_projects ON public.projects FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_boq ON public.project_boq FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- ⚙️ TriPro ERP — Commercial Add-on: Manufacturing & Production (04_addon_manufacturing.sql)
-- 🏭 مديول التصنيع: خطوط الإنتاج، مراكز العمل، أوامر الشغل، جانت، كفاءة الآلات OEE
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. مراكز العمل وخطوط الإنتاج (Work Centers)
CREATE TABLE IF NOT EXISTS public.mfg_work_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    description TEXT,
    hourly_rate NUMERIC(15,2) DEFAULT 0,
    overhead_rate NUMERIC(15,2) DEFAULT 0,
    capacity_hours_per_day NUMERIC(5,2) DEFAULT 8.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. الماكينات ومعدات المصنع (Factory Machinery)
CREATE TABLE IF NOT EXISTS public.mfg_machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    work_center_id UUID REFERENCES public.mfg_work_centers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT,
    model TEXT,
    status TEXT DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL', 'MAINTENANCE', 'DOWN', 'OFFLINE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. مسارات العمل والعمليات التشغيلية (Routings & Operations)
CREATE TABLE IF NOT EXISTS public.mfg_routings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mfg_routing_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routing_id UUID NOT NULL REFERENCES public.mfg_routings(id) ON DELETE CASCADE,
    operation_name TEXT NOT NULL,
    work_center_id UUID REFERENCES public.mfg_work_centers(id),
    sequence_order INT DEFAULT 1,
    setup_time_mins NUMERIC(10,2) DEFAULT 15,
    run_time_mins NUMERIC(10,2) DEFAULT 60
);

-- 4. أوامر التشغيل والإنتاج (Production Orders)
CREATE TABLE IF NOT EXISTS public.mfg_production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    order_number TEXT NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id),
    routing_id UUID REFERENCES public.mfg_routings(id),
    target_quantity NUMERIC(15,2) NOT NULL CHECK (target_quantity > 0),
    produced_quantity NUMERIC(15,2) DEFAULT 0,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'released', 'in_progress', 'completed', 'closed', 'cancelled')),
    raw_material_warehouse_id UUID REFERENCES public.warehouses(id),
    finished_goods_warehouse_id UUID REFERENCES public.warehouses(id),
    total_cost NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. استهلاك المواد الخام الفعلي (Actual Material Usage)
CREATE TABLE IF NOT EXISTS public.mfg_actual_material_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    production_order_id UUID NOT NULL REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    raw_material_id UUID NOT NULL REFERENCES public.products(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    quantity_used NUMERIC(15,4) NOT NULL CHECK (quantity_used > 0),
    cost_per_unit NUMERIC(15,4) DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. سجلات الهالك والتوالف الصناعية (Scrap Logs)
CREATE TABLE IF NOT EXISTS public.mfg_scrap_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    production_order_id UUID NOT NULL REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    scrap_quantity NUMERIC(15,2) NOT NULL CHECK (scrap_quantity > 0),
    scrap_cost NUMERIC(15,2) DEFAULT 0,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. المنتجات الثانوية المستخرجة (By-products Logs)
CREATE TABLE IF NOT EXISTS public.mfg_byproducts_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    production_order_id UUID NOT NULL REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE,
    byproduct_product_id UUID NOT NULL REFERENCES public.products(id),
    destination_warehouse_id UUID REFERENCES public.warehouses(id),
    quantity_produced NUMERIC(15,2) NOT NULL CHECK (quantity_produced > 0),
    allocated_value NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. صيانة الآلات وتتبع الأعطال (Machine Maintenance)
CREATE TABLE IF NOT EXISTS public.mfg_machine_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    machine_id UUID NOT NULL REFERENCES public.mfg_machines(id) ON DELETE CASCADE,
    maintenance_type TEXT DEFAULT 'PREVENTIVE' CHECK (maintenance_type IN ('PREVENTIVE', 'CORRECTIVE', 'OVERHAUL')),
    scheduled_date DATE NOT NULL,
    actual_date DATE,
    description TEXT,
    cost NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. تفعيل RLS
ALTER TABLE public.mfg_work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_scrap_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfg_byproducts_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_mfg_orders ON public.mfg_production_orders FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_work_centers ON public.mfg_work_centers FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- ⚽ TriPro ERP — Commercial Add-on: Stadiums & Sports Clubs (05_addon_stadium_clubs.sql)
-- 🏆 مديول النوادي والملاعب: العضويات والاشتراكات، بوابات Turnstile الذكية، حجز الملاعب، الأكاديميات
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. جدول المرافق والملاعب (Stadium Facilities)
CREATE TABLE IF NOT EXISTS public.stadium_facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'football' CHECK (type IN ('football','tennis','basketball','gym','multi_purpose','swimming','other')),
    capacity INT DEFAULT 100,
    price_per_hour NUMERIC(12,2) NOT NULL DEFAULT 0,
    peak_price_per_hour NUMERIC(12,2) DEFAULT 0,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. جدول الأعضاء وبطاقات العضوية الذكية (Members)
CREATE TABLE IF NOT EXISTS public.stadium_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    full_name TEXT NOT NULL,
    national_id TEXT,
    phone TEXT,
    email TEXT,
    membership_no TEXT NOT NULL,
    membership_type TEXT NOT NULL DEFAULT 'individual' CHECK (membership_type IN ('individual','family','corporate','vip','honorary')),
    category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended','pending')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    photo_url TEXT,
    qr_code TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stadium_members_no UNIQUE(organization_id, membership_no)
);

-- 3. سجل الاشتراكات والدفعات (Subscriptions)
CREATE TABLE IF NOT EXISTS public.stadium_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    member_id UUID NOT NULL REFERENCES public.stadium_members(id) ON DELETE CASCADE,
    membership_type TEXT NOT NULL,
    duration_months INT NOT NULL DEFAULT 12,
    amount_paid NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    receipt_no TEXT,
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. سجل مسح بوابات الدخول والأمان (Smart Gate Access Logs)
CREATE TABLE IF NOT EXISTS public.stadium_gate_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    member_id UUID REFERENCES public.stadium_members(id) ON DELETE SET NULL,
    gate_name TEXT NOT NULL,
    scan_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_granted BOOLEAN NOT NULL DEFAULT TRUE,
    denial_reason TEXT,
    direction TEXT DEFAULT 'IN' CHECK (direction IN ('IN', 'OUT'))
);

-- 5. حجوزات الملاعب والمرافق بالساعة (Hourly Pitch Bookings)
CREATE TABLE IF NOT EXISTS public.stadium_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    facility_id UUID NOT NULL REFERENCES public.stadium_facilities(id) ON DELETE CASCADE,
    booker_name TEXT NOT NULL,
    booker_phone TEXT,
    member_id UUID REFERENCES public.stadium_members(id),
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    is_peak_hours BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'paid', 'cancelled', 'completed')),
    related_journal_entry_id UUID REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. الأكاديميات والبرامج الرياضية (Training Programs)
CREATE TABLE IF NOT EXISTS public.stadium_coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    full_name TEXT NOT NULL,
    phone TEXT,
    specialty TEXT,
    commission_pct NUMERIC(5,2) DEFAULT 0,
    monthly_salary NUMERIC(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stadium_training_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    coach_id UUID REFERENCES public.stadium_coaches(id),
    capacity INT DEFAULT 30,
    fee_per_participant NUMERIC(12,2) NOT NULL,
    schedule_description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stadium_program_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    program_id UUID NOT NULL REFERENCES public.stadium_training_programs(id) ON DELETE CASCADE,
    participant_name TEXT NOT NULL,
    participant_phone TEXT,
    member_id UUID REFERENCES public.stadium_members(id),
    amount_paid NUMERIC(12,2) NOT NULL,
    enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. عقود تأجير المحلات والمرافق (Rental Contracts)
CREATE TABLE IF NOT EXISTS public.stadium_rental_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    facility_id UUID NOT NULL REFERENCES public.stadium_facilities(id),
    tenant_name TEXT NOT NULL,
    tenant_phone TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('weekly', 'monthly', 'annual')),
    amount_per_cycle NUMERIC(12,2) NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stadium_rental_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    contract_id UUID NOT NULL REFERENCES public.stadium_rental_contracts(id) ON DELETE CASCADE,
    amount_paid NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. تفعيل RLS
ALTER TABLE public.stadium_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stadium_gate_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_stadium_members ON public.stadium_members FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_stadium_facilities ON public.stadium_facilities FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- 🏥 TriPro ERP — Commercial Add-on: Healthcare & Hospitals (06_addon_hims_healthcare.sql)
-- 🩺 مديول المستشفيات: المرضى، العيادات، الطوارئ، التنويم، العمليات، المعمل، الأشعة، بنك الدم، التأمين
-- 🛡️ المتطلبات السابقة: تشغيل ملف 01_core_erp.sql أولاً
-- =============================================================================

-- 1. جدول المرضى والسجلات الطبية (Patients Directory)
CREATE TABLE IF NOT EXISTS public.hims_patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    mrn TEXT NOT NULL, -- Medical Record Number
    full_name TEXT NOT NULL,
    national_id TEXT,
    phone TEXT,
    gender TEXT CHECK (gender IN ('male', 'female')),
    dob DATE,
    blood_type TEXT,
    allergies TEXT[] DEFAULT '{}',
    chronic_diseases TEXT[] DEFAULT '{}',
    insurance_policy_no TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hims_patients_org_mrn UNIQUE(organization_id, mrn)
);

-- 2. الأطباء والعيادات والأقسام (Doctors & Clinics)
CREATE TABLE IF NOT EXISTS public.hims_doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    user_id UUID,
    full_name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    license_number TEXT,
    consultation_fee NUMERIC(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hims_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    patient_id UUID NOT NULL REFERENCES public.hims_patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.hims_doctors(id),
    appointment_date DATE NOT NULL,
    time_slot TIME NOT NULL,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'arrived', 'completed', 'cancelled', 'no_show')),
    fee NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. زيارات الكشف وفرز الطوارئ (Visits & ER Triage)
CREATE TABLE IF NOT EXISTS public.hims_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    patient_id UUID NOT NULL REFERENCES public.hims_patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES public.hims_doctors(id),
    visit_type TEXT DEFAULT 'outpatient' CHECK (visit_type IN ('outpatient', 'emergency', 'inpatient')),
    triage_level TEXT CHECK (triage_level IN ('level_1_resuscitation', 'level_2_emergent', 'level_3_urgent', 'level_5_non_urgent')),
    chief_complaint TEXT,
    vital_signs JSONB DEFAULT '{}', -- { bp, pulse, temp, spo2 }
    diagnosis TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'completed', 'admitted', 'discharged')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. الملاحظات الطبية السريرية (Clinical SOAP Notes)
CREATE TABLE IF NOT EXISTS public.hims_clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id UUID NOT NULL REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. الروشتات وصرف الأدوية (Prescriptions)
CREATE TABLE IF NOT EXISTS public.hims_prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id UUID NOT NULL REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hims_prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES public.hims_prescriptions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    drug_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    duration_days INT DEFAULT 5,
    quantity NUMERIC(10,2) DEFAULT 1,
    is_dispensed BOOLEAN DEFAULT FALSE
);

-- 6. التنويم والأجنحة والأسرة (Inpatient Wards & Beds)
CREATE TABLE IF NOT EXISTS public.hims_wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    name TEXT NOT NULL,
    ward_type TEXT DEFAULT 'GENERAL',
    daily_rate NUMERIC(12,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.hims_beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_id UUID NOT NULL REFERENCES public.hims_wards(id) ON DELETE CASCADE,
    bed_number TEXT NOT NULL,
    status TEXT DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'))
);

CREATE TABLE IF NOT EXISTS public.hims_admissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    patient_id UUID NOT NULL REFERENCES public.hims_patients(id) ON DELETE CASCADE,
    bed_id UUID NOT NULL REFERENCES public.hims_beds(id),
    admission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    discharge_date TIMESTAMPTZ,
    status TEXT DEFAULT 'ADMITTED' CHECK (status IN ('ADMITTED', 'DISCHARGED'))
);

-- 7. العمليات الجراحية (Operating Theaters & Surgeries)
CREATE TABLE IF NOT EXISTS public.hims_surgeries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    surgery_name TEXT NOT NULL,
    lead_surgeon_id UUID REFERENCES public.hims_doctors(id),
    room_number TEXT DEFAULT 'OR-1',
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. التحاليل والمختبر وبنك الدم (Lab & Blood Bank)
CREATE TABLE IF NOT EXISTS public.hims_lab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    test_name TEXT NOT NULL,
    test_code TEXT,
    category TEXT,
    price NUMERIC(12,2) DEFAULT 0,
    unit TEXT,
    normal_range TEXT
);

CREATE TABLE IF NOT EXISTS public.hims_lab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id UUID REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES public.hims_lab_tests(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sample_collected', 'in_analysis', 'completed')),
    result_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hims_blood_donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    donor_name TEXT NOT NULL,
    blood_type TEXT NOT NULL,
    quantity_ml NUMERIC(10,2) DEFAULT 450,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'used', 'expired')),
    expiry_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. الأشعة والتصوير الطبي (Radiology & PACS)
CREATE TABLE IF NOT EXISTS public.hims_radiology_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    visit_id UUID REFERENCES public.hims_visits(id) ON DELETE CASCADE,
    scan_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scanned', 'reported')),
    report_text TEXT,
    dicom_pacs_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. تفعيل RLS
ALTER TABLE public.hims_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hims_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hims_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hims_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hims_lab_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY allow_org_hims_patients ON public.hims_patients FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
    CREATE POLICY allow_org_hims_visits ON public.hims_visits FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- 🎉 تهانينا! تم تأسيس كافة جداول ودوال ومحركات نظام TriPro ERP الشامل بنجاح تام!
-- =============================================================================
