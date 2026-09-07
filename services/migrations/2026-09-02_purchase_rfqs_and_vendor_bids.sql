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
