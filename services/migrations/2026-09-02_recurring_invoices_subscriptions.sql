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
