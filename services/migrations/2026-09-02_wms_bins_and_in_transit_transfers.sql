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
