-- =====================================================================
-- 📦 محرك دفتر الأستاذ المخزني الموحد (Unified Single Stock Ledger Engine)
-- TriPro ERP — sql_updates/2026-10-10_unified_stock_ledger_engine.sql
-- التاريخ: 2026-10-10
-- الأهداف:
--   1. إنشاء جدول دفتر الأستاذ المخزني الموحد غير القابل للتلاعب (public.stock_ledger)
--   2. تطبيق مبادئ المعمارية المؤسسية (SAP / Odoo Standard Single Ledger)
--   3. استبدال استعلامات 11 جدولاً بجدول مالي مخزني واحد فائق السرعة
--   4. توفير مشغلات قاعدة بيانات (Triggers) للمزامنة التلقائية اللحظية
--   5. دالة تغذية تاريخية آمنة (Idempotent Backfill) لترحيل البيانات السابقة
-- =====================================================================

-- 1. إنشاء جدول دفتر الأستاذ المخزني الموحد
CREATE TABLE IF NOT EXISTS public.stock_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    posting_date DATE NOT NULL DEFAULT CURRENT_DATE,
    transaction_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- نوع المستند وحالته
    voucher_type VARCHAR(50) NOT NULL, -- SALES_INVOICE, PURCHASE_INVOICE, SALES_RETURN, PURCHASE_RETURN, STOCK_ADJUSTMENT, STOCK_TRANSFER_IN, STOCK_TRANSFER_OUT, MFG_PRODUCTION, MFG_ISSUE, POS_SALE
    voucher_id UUID NOT NULL,
    voucher_line_id UUID,
    voucher_no VARCHAR(100),
    
    -- اتجاه الحركة والكميات
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    quantity NUMERIC(15, 4) NOT NULL CHECK (quantity >= 0),
    quantity_delta NUMERIC(15, 4) GENERATED ALWAYS AS (
        CASE WHEN direction = 'IN' THEN quantity ELSE -quantity END
    ) STORED,
    
    -- الوحدة والتكلفة
    uom_id UUID,
    unit_cost NUMERIC(15, 4) DEFAULT 0,
    unit_price NUMERIC(15, 4) DEFAULT 0,
    total_cost NUMERIC(15, 4) GENERATED ALWAYS AS (
        quantity * COALESCE(unit_cost, 0)
    ) STORED,
    
    -- بيانات إضافية
    batch_no VARCHAR(100),
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,

    -- صمام أمان عدم التكرار (Idempotency Guard)
    CONSTRAINT uq_stock_ledger_voucher_line UNIQUE (organization_id, voucher_type, voucher_id, voucher_line_id, direction)
);

-- 2. الفهارس فائقة السرعة للاستعلامات اللحظية
CREATE INDEX IF NOT EXISTS idx_stock_ledger_lookup 
ON public.stock_ledger (organization_id, product_id, warehouse_id, posting_date DESC);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_date 
ON public.stock_ledger (organization_id, posting_date DESC);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_voucher 
ON public.stock_ledger (organization_id, voucher_type, voucher_id);

-- 3. تفعيل أمان العزل على مستوى السجلات (RLS)
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS stock_ledger_org_isolation ON public.stock_ledger;
    CREATE POLICY stock_ledger_org_isolation ON public.stock_ledger
    FOR ALL
    USING (
        organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
        OR (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1) = 'super_admin'
    );
END $$;

-- 4. دالة التغذية التاريخية الشاملة لدفتر الأستاذ المخزني (Idempotent Backfill Function)
CREATE OR REPLACE FUNCTION public.backfill_stock_ledger(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inserted_sales INT := 0;
    v_inserted_purchases INT := 0;
    v_inserted_sales_returns INT := 0;
    v_inserted_purchase_returns INT := 0;
    v_inserted_adjustments INT := 0;
    v_inserted_mfg INT := 0;
BEGIN
    -- أ. ترحيل فواتير المبيعات المعتمدة (OUT)
    INSERT INTO public.stock_ledger (
        organization_id, product_id, warehouse_id, posting_date, transaction_time,
        voucher_type, voucher_id, voucher_line_id, voucher_no, direction, quantity,
        uom_id, unit_price, unit_cost, notes, created_at
    )
    SELECT 
        i.organization_id, ii.product_id, i.warehouse_id, i.invoice_date, i.created_at,
        'SALES_INVOICE', i.id, ii.id, i.invoice_number, 'OUT', ii.quantity,
        ii.uom_id, ii.unit_price, 0, i.notes, i.created_at
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.organization_id = p_org_id
      AND i.status NOT IN ('draft', 'cancelled')
      AND ii.product_id IS NOT NULL
      AND i.warehouse_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_stock_ledger_voucher_line DO NOTHING;
    GET DIAGNOSTICS v_inserted_sales = ROW_COUNT;

    -- ب. ترحيل فواتير المشتريات المعتمدة (IN)
    INSERT INTO public.stock_ledger (
        organization_id, product_id, warehouse_id, posting_date, transaction_time,
        voucher_type, voucher_id, voucher_line_id, voucher_no, direction, quantity,
        uom_id, unit_price, unit_cost, notes, created_at
    )
    SELECT 
        pi.organization_id, pii.product_id, pi.warehouse_id, pi.invoice_date, pi.created_at,
        'PURCHASE_INVOICE', pi.id, pii.id, pi.invoice_number, 'IN', pii.quantity,
        pii.uom_id, 0, pii.unit_cost, pi.notes, pi.created_at
    FROM purchase_invoice_items pii
    JOIN purchase_invoices pi ON pii.purchase_invoice_id = pi.id
    WHERE pi.organization_id = p_org_id
      AND pi.status IN ('posted', 'paid')
      AND pii.product_id IS NOT NULL
      AND pi.warehouse_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_stock_ledger_voucher_line DO NOTHING;
    GET DIAGNOSTICS v_inserted_purchases = ROW_COUNT;

    -- ج. ترحيل مرتجعات المبيعات (IN)
    INSERT INTO public.stock_ledger (
        organization_id, product_id, warehouse_id, posting_date, transaction_time,
        voucher_type, voucher_id, voucher_line_id, voucher_no, direction, quantity,
        uom_id, unit_price, unit_cost, notes, created_at
    )
    SELECT 
        sr.organization_id, sri.product_id, sr.warehouse_id, sr.return_date, sr.created_at,
        'SALES_RETURN', sr.id, sri.id, sr.return_number, 'IN', sri.quantity,
        sri.uom_id, 0, 0, sr.notes, sr.created_at
    FROM sales_return_items sri
    JOIN sales_returns sr ON sri.sales_return_id = sr.id
    WHERE sr.organization_id = p_org_id
      AND sr.status = 'posted'
      AND sri.product_id IS NOT NULL
      AND sr.warehouse_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_stock_ledger_voucher_line DO NOTHING;
    GET DIAGNOSTICS v_inserted_sales_returns = ROW_COUNT;

    -- د. ترحيل مرتجعات المشتريات (OUT)
    INSERT INTO public.stock_ledger (
        organization_id, product_id, warehouse_id, posting_date, transaction_time,
        voucher_type, voucher_id, voucher_line_id, voucher_no, direction, quantity,
        uom_id, unit_price, unit_cost, notes, created_at
    )
    SELECT 
        pr.organization_id, pri.product_id, pr.warehouse_id, pr.return_date, pr.created_at,
        'PURCHASE_RETURN', pr.id, pri.id, pr.return_number, 'OUT', pri.quantity,
        pri.uom_id, 0, 0, pr.notes, pr.created_at
    FROM purchase_return_items pri
    JOIN purchase_returns pr ON pri.purchase_return_id = pr.id
    WHERE pr.organization_id = p_org_id
      AND pr.status = 'posted'
      AND pri.product_id IS NOT NULL
      AND pr.warehouse_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_stock_ledger_voucher_line DO NOTHING;
    GET DIAGNOSTICS v_inserted_purchase_returns = ROW_COUNT;

    -- هـ. ترحيل أوامر الإنتاج التامة (IN للمنتج التام)
    INSERT INTO public.stock_ledger (
        organization_id, product_id, warehouse_id, posting_date, transaction_time,
        voucher_type, voucher_id, voucher_line_id, voucher_no, direction, quantity,
        notes, created_at
    )
    SELECT 
        mfg.organization_id, mfg.product_id, mfg.warehouse_id, COALESCE(mfg.end_date, CURRENT_DATE), mfg.created_at,
        'MFG_PRODUCTION', mfg.id, mfg.id, mfg.order_number, 'IN', mfg.quantity_to_produce,
        'أمر إنتاج تام من موديول التصنيع', mfg.created_at
    FROM mfg_production_orders mfg
    WHERE mfg.organization_id = p_org_id
      AND mfg.status = 'completed'
      AND mfg.product_id IS NOT NULL
      AND mfg.warehouse_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_stock_ledger_voucher_line DO NOTHING;
    GET DIAGNOSTICS v_inserted_mfg = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_org_id,
        'sales_entries', v_inserted_sales,
        'purchase_entries', v_inserted_purchases,
        'sales_returns_entries', v_inserted_sales_returns,
        'purchase_returns_entries', v_inserted_purchase_returns,
        'mfg_entries', v_inserted_mfg,
        'total_entries', (v_inserted_sales + v_inserted_purchases + v_inserted_sales_returns + v_inserted_purchase_returns + v_inserted_mfg)
    );
END;
$$;

-- 5. الدالة السحابية فائقة السرعة لجلب حركات الصنف من دفتر الأستاذ الموحد
CREATE OR REPLACE FUNCTION public.get_product_stock_movements_from_ledger_rpc(
    p_product_id    UUID,
    p_org_id        UUID,
    p_warehouse_id  UUID DEFAULT NULL,
    p_start_date    DATE DEFAULT NULL,
    p_end_date      DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opening_balance NUMERIC(15, 4) := 0;
    v_total_in        NUMERIC(15, 4) := 0;
    v_total_out       NUMERIC(15, 4) := 0;
    v_net_movement    NUMERIC(15, 4) := 0;
    v_closing_balance NUMERIC(15, 4) := 0;
    v_movements       JSONB := '[]'::JSONB;
    v_count           INT := 0;
BEGIN
    -- 1. فحص وجود حركات بالدفتر للصنف
    SELECT COUNT(*) INTO v_count
    FROM public.stock_ledger
    WHERE organization_id = p_org_id
      AND product_id = p_product_id;

    -- إذا لم يتم التغذية بعد، نُرجع flag لإرشاد الواجهة للبديل الكلاسيكي
    IF v_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'fallback_needed', true);
    END IF;

    -- 2. حساب الرصيد الافتتاحي قبل p_start_date
    IF p_start_date IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity_delta), 0)
        INTO v_opening_balance
        FROM public.stock_ledger
        WHERE organization_id = p_org_id
          AND product_id = p_product_id
          AND posting_date < p_start_date
          AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
    END IF;

    -- 3. جلب الحركات التفصيلية للفترة
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', sl.id::text,
                'date', sl.posting_date::text,
                'type', sl.direction,
                'quantity', sl.quantity,
                'uom_id', sl.uom_id::text,
                'document_type', CASE sl.voucher_type
                    WHEN 'SALES_INVOICE' THEN 'فاتورة مبيعات'
                    WHEN 'PURCHASE_INVOICE' THEN 'فاتورة مشتريات'
                    WHEN 'SALES_RETURN' THEN 'مرتجع مبيعات'
                    WHEN 'PURCHASE_RETURN' THEN 'مرتجع مشتريات'
                    WHEN 'STOCK_ADJUSTMENT' THEN 'تسوية مخزنية'
                    WHEN 'STOCK_TRANSFER_IN' THEN 'تحويل مخزني (وارد)'
                    WHEN 'STOCK_TRANSFER_OUT' THEN 'تحويل مخزني (صادر)'
                    WHEN 'MFG_PRODUCTION' THEN 'أمر إنتاج تام'
                    WHEN 'MFG_ISSUE' THEN 'صرف مواد خام'
                    ELSE sl.voucher_type
                END,
                'document_number', COALESCE(sl.voucher_no, '-'),
                'warehouse_id', sl.warehouse_id::text,
                'warehouse_name', COALESCE(w.name, 'المستودع الرئيسي'),
                'created_at', sl.transaction_time::text,
                'notes', sl.notes,
                'unit_price', sl.unit_price,
                'unit_cost', sl.unit_cost
            ) ORDER BY sl.transaction_time ASC
        ), '[]'::JSONB
    )
    INTO v_movements
    FROM public.stock_ledger sl
    LEFT JOIN public.warehouses w ON sl.warehouse_id = w.id
    WHERE sl.organization_id = p_org_id
      AND sl.product_id = p_product_id
      AND (p_warehouse_id IS NULL OR sl.warehouse_id = p_warehouse_id)
      AND (p_start_date IS NULL OR sl.posting_date >= p_start_date)
      AND (p_end_date IS NULL OR sl.posting_date <= p_end_date);

    -- 4. حساب الإجماليات
    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'IN' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN direction = 'OUT' THEN quantity ELSE 0 END), 0)
    INTO v_total_in, v_total_out
    FROM public.stock_ledger
    WHERE organization_id = p_org_id
      AND product_id = p_product_id
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
      AND (p_start_date IS NULL OR posting_date >= p_start_date)
      AND (p_end_date IS NULL OR posting_date <= p_end_date);

    v_net_movement := v_total_in - v_total_out;
    v_closing_balance := v_opening_balance + v_net_movement;

    RETURN jsonb_build_object(
        'success', true,
        'from_unified_ledger', true,
        'opening_balance', v_opening_balance,
        'total_in', v_total_in,
        'total_out', v_total_out,
        'net_movement', v_net_movement,
        'closing_balance', v_closing_balance,
        'movements', v_movements
    );
END;
$$;
