-- =============================================================================
-- تسريع محرك حركة ورصيد المخزون (Server-Side Stock Movements Acceleration RPC)
-- TriPro ERP — sql_updates/2026-09-30_phase1_stock_engine_acceleration.sql
-- التاريخ: 2026-09-30
-- الأولوية: 🔴 أداء عالي — تجميع حركات المخزون في استعلام سيرفر واحد فائق السرعة
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_product_stock_movements_rpc(
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
BEGIN
    -- 1. جمع كافة الحركات المخزنية عبر UNION ALL في استعلام خادم واحد فائق السرعة
    WITH all_movements AS (
        -- مبيعات (OUT)
        SELECT 
            ii.id::text AS id,
            i.invoice_date::text AS date,
            'OUT' AS type,
            ii.quantity::numeric AS quantity,
            ii.uom_id::text AS uom_id,
            'فاتورة مبيعات' AS document_type,
            COALESCE(i.invoice_number, '-') AS document_number,
            i.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            i.created_at::text AS created_at,
            i.notes,
            ii.unit_price::numeric AS unit_price,
            NULL::numeric AS unit_cost
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        LEFT JOIN warehouses w ON i.warehouse_id = w.id
        WHERE ii.product_id = p_product_id
          AND i.organization_id = p_org_id
          AND i.status NOT IN ('draft', 'cancelled')
          AND (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR i.invoice_date >= p_start_date)
          AND (p_end_date IS NULL OR i.invoice_date <= p_end_date)

        UNION ALL

        -- مشتريات (IN)
        SELECT 
            pii.id::text AS id,
            pi.invoice_date::text AS date,
            'IN' AS type,
            pii.quantity::numeric AS quantity,
            pii.uom_id::text AS uom_id,
            'فاتورة مشتريات' AS document_type,
            COALESCE(pi.invoice_number, '-') AS document_number,
            pi.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            pi.created_at::text AS created_at,
            pi.notes,
            NULL::numeric AS unit_price,
            pii.unit_cost::numeric AS unit_cost
        FROM purchase_invoice_items pii
        JOIN purchase_invoices pi ON pii.purchase_invoice_id = pi.id
        LEFT JOIN warehouses w ON pi.warehouse_id = w.id
        WHERE pii.product_id = p_product_id
          AND pi.organization_id = p_org_id
          AND pi.status IN ('posted', 'paid')
          AND (p_warehouse_id IS NULL OR pi.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR pi.invoice_date >= p_start_date)
          AND (p_end_date IS NULL OR pi.invoice_date <= p_end_date)

        UNION ALL

        -- مرتجع مبيعات (IN)
        SELECT 
            sri.id::text AS id,
            sr.return_date::text AS date,
            'IN' AS type,
            sri.quantity::numeric AS quantity,
            sri.uom_id::text AS uom_id,
            'مرتجع مبيعات' AS document_type,
            COALESCE(sr.return_number, '-') AS document_number,
            sr.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            sr.created_at::text AS created_at,
            sr.notes,
            NULL::numeric AS unit_price,
            NULL::numeric AS unit_cost
        FROM sales_return_items sri
        JOIN sales_returns sr ON sri.sales_return_id = sr.id
        LEFT JOIN warehouses w ON sr.warehouse_id = w.id
        WHERE sri.product_id = p_product_id
          AND sr.organization_id = p_org_id
          AND sr.status = 'posted'
          AND (p_warehouse_id IS NULL OR sr.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR sr.return_date >= p_start_date)
          AND (p_end_date IS NULL OR sr.return_date <= p_end_date)

        UNION ALL

        -- مرتجع مشتريات (OUT)
        SELECT 
            pri.id::text AS id,
            pr.return_date::text AS date,
            'OUT' AS type,
            pri.quantity::numeric AS quantity,
            pri.uom_id::text AS uom_id,
            'مرتجع مشتريات' AS document_type,
            COALESCE(pr.return_number, '-') AS document_number,
            pr.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            pr.created_at::text AS created_at,
            pr.notes,
            NULL::numeric AS unit_price,
            NULL::numeric AS unit_cost
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pri.purchase_return_id = pr.id
        LEFT JOIN warehouses w ON pr.warehouse_id = w.id
        WHERE pri.product_id = p_product_id
          AND pr.organization_id = p_org_id
          AND pr.status = 'posted'
          AND (p_warehouse_id IS NULL OR pr.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR pr.return_date >= p_start_date)
          AND (p_end_date IS NULL OR pr.return_date <= p_end_date)

        UNION ALL

        -- تسويات مخزنية (IN / OUT)
        SELECT 
            sai.id::text AS id,
            sa.adjustment_date::text AS date,
            CASE WHEN sai.quantity >= 0 THEN 'IN' ELSE 'OUT' END AS type,
            ABS(sai.quantity::numeric) AS quantity,
            sai.uom_id::text AS uom_id,
            'تسوية جردية' AS document_type,
            COALESCE(sa.adjustment_number, '-') AS document_number,
            sa.warehouse_id::text AS warehouse_id,
            w.name AS warehouse_name,
            sa.created_at::text AS created_at,
            sa.reason AS notes,
            NULL::numeric AS unit_price,
            NULL::numeric AS unit_cost
        FROM stock_adjustment_items sai
        JOIN stock_adjustments sa ON sai.stock_adjustment_id = sa.id
        LEFT JOIN warehouses w ON sa.warehouse_id = w.id
        WHERE sai.product_id = p_product_id
          AND sa.organization_id = p_org_id
          AND sa.status NOT IN ('draft', 'cancelled')
          AND (p_warehouse_id IS NULL OR sa.warehouse_id = p_warehouse_id)
          AND (p_start_date IS NULL OR sa.adjustment_date >= p_start_date)
          AND (p_end_date IS NULL OR sa.adjustment_date <= p_end_date)
    )
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0),
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'date', date,
                'type', type,
                'quantity', quantity,
                'uomId', uom_id,
                'documentType', document_type,
                'documentNumber', document_number,
                'warehouseId', warehouse_id,
                'warehouseName', warehouse_name,
                'createdAt', created_at,
                'notes', notes,
                'unitPrice', unit_price,
                'unitCost', unit_cost
            ) ORDER BY date ASC, created_at ASC
        ), '[]'::jsonb)
    INTO v_total_in, v_total_out, v_movements
    FROM all_movements;

    v_net_movement    := v_total_in - v_total_out;
    v_closing_balance := v_opening_balance + v_net_movement;

    RETURN jsonb_build_object(
        'success',         true,
        'opening_balance', v_opening_balance,
        'total_in',        v_total_in,
        'total_out',       v_total_out,
        'net_movement',    v_net_movement,
        'closing_balance', v_closing_balance,
        'movements',       v_movements
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'خطأ في جلب حركات المخزون: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_stock_movements_rpc(UUID, UUID, UUID, DATE, DATE) TO authenticated;

-- فهارس مركبة لتسريع استعلامات بطاقة الصنف والمخازن
CREATE INDEX IF NOT EXISTS idx_inv_items_prod_org ON invoice_items(product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_purch_items_prod_org ON purchase_invoice_items(product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_ret_items_prod ON sales_return_items(product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_purch_ret_items_prod ON purchase_return_items(product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_items_prod ON stock_adjustment_items(product_id, organization_id);

DO $$
BEGIN
    RAISE NOTICE '✅ تم تفعيل دالة تسريع المخزون (get_product_stock_movements_rpc)';
    RAISE NOTICE '✅ تم إنشاء 5 فهارس متخصصة لبطاقة الصنف وحركات المخازن';
    RAISE NOTICE '🚀 استعلامات بطاقة الصنف أصبحت تعمل في استعلام خادم واحد فائق السرعة.';
END;
$$;
