-- ==============================================================================
-- TriPro ERP — Final Production Combined Migration Script
-- تاريخ التجميع: 2026-09-02
-- يجمع كافة جداول:
-- 1. الفواتير الدورية والاشتراكات (Recurring Invoices & Subscriptions)
-- 2. المواقع والرفوف التخزينية (WMS Bin & Shelf Locations)
-- 3. التحويلات ثنائية المراحل وبضاعة بالطريق (In-Transit Inter-Warehouse Transfers)
-- 4. طلبات عروض الأسعار ومناقصات الموردين (Purchase RFQs & Vendor Bidding)
-- ==============================================================================

-- 1️⃣ جداول الفواتير الدورية والاشتراكات (Recurring Invoices)
CREATE TABLE IF NOT EXISTS recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    subscription_number VARCHAR(100) NOT NULL,
    customer_id UUID NOT NULL,
    warehouse_id UUID DEFAULT NULL,
    salesperson_id UUID DEFAULT NULL,
    cost_center_id UUID DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    frequency VARCHAR(50) NOT NULL DEFAULT 'monthly',
    custom_interval_days INT DEFAULT NULL,
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    next_run_date DATE NOT NULL,
    last_run_date DATE DEFAULT NULL,
    total_cycles INT DEFAULT NULL,
    completed_cycles INT NOT NULL DEFAULT 0,
    auto_post BOOLEAN NOT NULL DEFAULT TRUE,
    send_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
    send_email BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
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
    product_sku VARCHAR(100) DEFAULT '',
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 1.00,
    uom_id UUID DEFAULT NULL,
    unit_price NUMERIC(15, 4) NOT NULL DEFAULT 0.00,
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
    status VARCHAR(50) NOT NULL DEFAULT 'success',
    error_message TEXT DEFAULT NULL,
    notified_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
    notified_email BOOLEAN NOT NULL DEFAULT FALSE,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2️⃣ جداول المواقع والرفوف التخزينية (WMS Bins & Shelves)
CREATE TABLE IF NOT EXISTS warehouse_bins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    bin_code VARCHAR(100) NOT NULL,
    bin_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(100),
    zone_name VARCHAR(100) NOT NULL DEFAULT 'Zone A',
    aisle VARCHAR(50) DEFAULT 'A1',
    rack VARCHAR(50) DEFAULT 'R1',
    shelf VARCHAR(50) DEFAULT 'S1',
    bin_number VARCHAR(50) DEFAULT 'B1',
    bin_type VARCHAR(50) NOT NULL DEFAULT 'storage',
    max_capacity_qty NUMERIC(15, 2) DEFAULT 1000.00,
    max_weight_kg NUMERIC(15, 2) DEFAULT 500.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- 3️⃣ ترقية جداول التحويلات المخزنية والبضاعة بالطريق (In-Transit Transfers)
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(30) DEFAULT 'direct';
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS in_transit_status VARCHAR(30) DEFAULT 'delivered';
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

ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS dispatched_qty NUMERIC(15, 4) DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC(15, 4) DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS variance_qty NUMERIC(15, 4) DEFAULT 0.00;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS from_bin_id UUID DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS to_bin_id UUID DEFAULT NULL;

-- 4️⃣ جداول طلبات عروض الأسعار والمناقصات (Purchase RFQs & Vendor Bids)
CREATE TABLE IF NOT EXISTS purchase_rfqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    rfq_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    deadline_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    target_warehouse_id UUID DEFAULT NULL,
    notes TEXT,
    created_by UUID DEFAULT NULL,
    awarded_bid_id UUID DEFAULT NULL,
    generated_po_id UUID DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    lead_time_days INT DEFAULT 3,
    payment_terms VARCHAR(100) DEFAULT 'آجل 30 يوم',
    warranty_terms VARCHAR(255) DEFAULT NULL,
    is_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    score_points NUMERIC(5, 2) DEFAULT 0.00,
    evaluation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- 5️⃣ إنشاء الفهارس لسرعة الاستعلامات ومنع البطء
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_org 
ON recurring_invoices(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_wh_bins_org 
ON warehouse_bins(organization_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_type_status 
ON stock_transfers(organization_id, transfer_type, in_transit_status);

CREATE INDEX IF NOT EXISTS idx_rfqs_org 
ON purchase_rfqs(organization_id, status);
