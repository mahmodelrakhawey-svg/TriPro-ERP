-- ==============================================================================
-- 🚀 تحصين الأداء وقواعد البيانات المؤسسية (Enterprise Indexing & Fast Summaries)
-- التاريخ: 05 سبتمبر 2026
-- ==============================================================================
-- 1. دوال تجميع أرصدة ومبيعات ومشتريات العملاء والموردين على مستوى السيرفر (Server-side Aggregation)
-- 2. فهارس مركبة عالية الأداء (Composite Indexes) لتسريع الفلاتر والتقارير بأقل من 10ms

BEGIN;

-- ==============================================================================
-- 1. دالة تجميع أرصدة ومبيعات العملاء السحابية السريعة
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_customers_summary(p_org_id uuid)
RETURNS TABLE (
    customer_id uuid,
    balance numeric,
    total_sales numeric,
    last_invoice text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH inv_summary AS (
        SELECT 
            i.customer_id,
            COALESCE(SUM(i.total_amount), 0) AS total_sales,
            COALESCE(SUM(i.total_amount - COALESCE(i.paid_amount, 0)), 0) AS unpaid_invoices,
            MAX(i.invoice_date::text) AS max_invoice_date
        FROM public.invoices i
        WHERE i.organization_id = p_org_id 
          AND (i.status IS NULL OR i.status NOT IN ('draft', 'cancelled'))
        GROUP BY i.customer_id
    ),
    rec_summary AS (
        SELECT 
            r.customer_id,
            COALESCE(SUM(r.amount), 0) AS total_receipts
        FROM public.receipt_vouchers r
        WHERE r.organization_id = p_org_id
          AND (r.voucher_number NOT LIKE 'DEP-%' OR r.voucher_number IS NULL)
        GROUP BY r.customer_id
    ),
    ret_summary AS (
        SELECT 
            sr.customer_id,
            COALESCE(SUM(sr.total_amount), 0) AS total_returns
        FROM public.sales_returns sr
        WHERE sr.organization_id = p_org_id 
          AND (sr.status IS NULL OR sr.status NOT IN ('draft', 'cancelled'))
        GROUP BY sr.customer_id
    ),
    cn_summary AS (
        SELECT 
            cn.customer_id,
            COALESCE(SUM(cn.total_amount), 0) AS total_credit_notes
        FROM public.credit_notes cn
        WHERE cn.organization_id = p_org_id 
          AND (cn.status IS NULL OR cn.status NOT IN ('draft', 'cancelled'))
        GROUP BY cn.customer_id
    ),
    chq_summary AS (
        SELECT 
            ch.party_id AS customer_id,
            COALESCE(SUM(ch.amount), 0) AS total_cheques
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id 
          AND ch.type = 'incoming' 
          AND ch.status != 'rejected'
        GROUP BY ch.party_id
    )
    SELECT 
        c.id AS customer_id,
        COALESCE(
            ROUND(
                COALESCE(c.opening_balance, 0)
                + COALESCE(inv.unpaid_invoices, 0)
                - COALESCE(rec.total_receipts, 0)
                - COALESCE(ret.total_returns, 0)
                - COALESCE(cn.total_credit_notes, 0)
                - COALESCE(chq.total_cheques, 0)
            , 2),
            0
        ) AS balance,
        COALESCE(ROUND(inv.total_sales, 2), 0) AS total_sales,
        inv.max_invoice_date AS last_invoice
    FROM public.customers c
    LEFT JOIN inv_summary inv ON inv.customer_id = c.id
    LEFT JOIN rec_summary rec ON rec.customer_id = c.id
    LEFT JOIN ret_summary ret ON ret.customer_id = c.id
    LEFT JOIN cn_summary cn ON cn.customer_id = c.id
    LEFT JOIN chq_summary chq ON chq.customer_id = c.id
    WHERE c.organization_id = p_org_id
      AND (c.deleted_at IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customers_summary(uuid) TO authenticated, service_role, anon;

-- ==============================================================================
-- 2. دالة تجميع أرصدة ومشتريات الموردين السحابية السريعة
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_suppliers_summary(p_org_id uuid)
RETURNS TABLE (
    supplier_id uuid,
    balance numeric,
    total_purchases numeric,
    last_invoice text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH pinv_summary AS (
        SELECT 
            pi.supplier_id,
            COALESCE(SUM(pi.total_amount), 0) AS total_purchases,
            COALESCE(SUM(pi.total_amount - COALESCE(pi.paid_amount, 0)), 0) AS unpaid_invoices,
            MAX(pi.invoice_date::text) AS max_invoice_date
        FROM public.purchase_invoices pi
        WHERE pi.organization_id = p_org_id 
          AND (pi.status IS NULL OR pi.status NOT IN ('draft', 'cancelled'))
        GROUP BY pi.supplier_id
    ),
    pay_summary AS (
        SELECT 
            pv.supplier_id,
            COALESCE(SUM(pv.amount), 0) AS total_payments
        FROM public.payment_vouchers pv
        WHERE pv.organization_id = p_org_id 
          AND pv.supplier_id IS NOT NULL
        GROUP BY pv.supplier_id
    ),
    pret_summary AS (
        SELECT 
            pr.supplier_id,
            COALESCE(SUM(pr.total_amount), 0) AS total_returns
        FROM public.purchase_returns pr
        WHERE pr.organization_id = p_org_id 
          AND (pr.status IS NULL OR pr.status NOT IN ('draft', 'cancelled'))
        GROUP BY pr.supplier_id
    ),
    dn_summary AS (
        SELECT 
            dn.supplier_id,
            COALESCE(SUM(dn.total_amount), 0) AS total_debit_notes
        FROM public.debit_notes dn
        WHERE dn.organization_id = p_org_id 
          AND (dn.status IS NULL OR dn.status NOT IN ('draft', 'cancelled'))
        GROUP BY dn.supplier_id
    ),
    chq_summary AS (
        SELECT 
            ch.party_id AS supplier_id,
            COALESCE(SUM(ch.amount), 0) AS total_cheques
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id 
          AND ch.type = 'outgoing' 
          AND ch.status != 'rejected'
        GROUP BY ch.party_id
    )
    SELECT 
        s.id AS supplier_id,
        COALESCE(
            ROUND(
                COALESCE(s.opening_balance, 0)
                + COALESCE(pinv.unpaid_invoices, 0)
                - COALESCE(pay.total_payments, 0)
                - COALESCE(pret.total_returns, 0)
                - COALESCE(dn.total_debit_notes, 0)
                - COALESCE(chq.total_cheques, 0)
            , 2),
            0
        ) AS balance,
        COALESCE(ROUND(pinv.total_purchases, 2), 0) AS total_purchases,
        pinv.max_invoice_date AS last_invoice
    FROM public.suppliers s
    LEFT JOIN pinv_summary pinv ON pinv.supplier_id = s.id
    LEFT JOIN pay_summary pay ON pay.supplier_id = s.id
    LEFT JOIN pret_summary pret ON pret.supplier_id = s.id
    LEFT JOIN dn_summary dn ON dn.supplier_id = s.id
    LEFT JOIN chq_summary chq ON chq.supplier_id = s.id
    WHERE s.organization_id = p_org_id
      AND (s.deleted_at IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_suppliers_summary(uuid) TO authenticated, service_role, anon;

-- ==============================================================================
-- 3. الفهارس المركبة عالية الأداء لعمليات التوسع (Composite Indexes)
-- ==============================================================================

-- فواتير المبيعات
CREATE INDEX IF NOT EXISTS idx_invoices_org_status_date ON public.invoices(organization_id, status, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_org_cust ON public.invoices(organization_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_rel_journal ON public.invoices(related_journal_entry_id) WHERE related_journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

-- فواتير المشتريات
CREATE INDEX IF NOT EXISTS idx_pinv_org_status_date ON public.purchase_invoices(organization_id, status, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_pinv_org_supp ON public.purchase_invoices(organization_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_pinv_rel_journal ON public.purchase_invoices(related_journal_entry_id) WHERE related_journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_pinv_id ON public.purchase_invoice_items(purchase_invoice_id);

-- القيود المحاسبية ودفتر الأستاذ
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_status_date ON public.journal_entries(organization_id, status, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_acc ON public.journal_lines(journal_entry_id, account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_org_acc ON public.journal_lines(organization_id, account_id);

-- سندات القبض والصرف
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_org_cust ON public.receipt_vouchers(organization_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_org_sup ON public.payment_vouchers(organization_id, supplier_id);

-- المردودات والإشعارات
CREATE INDEX IF NOT EXISTS idx_sales_returns_org_cust ON public.sales_returns(organization_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_org_sup ON public.purchase_returns(organization_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_org_cust ON public.credit_notes(organization_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_debit_notes_org_sup ON public.debit_notes(organization_id, supplier_id);

-- الشيكات
CREATE INDEX IF NOT EXISTS idx_cheques_org_party ON public.cheques(organization_id, party_id);
CREATE INDEX IF NOT EXISTS idx_cheques_org_type_status ON public.cheques(organization_id, type, status);

-- المنتجات والمخزون
CREATE INDEX IF NOT EXISTS idx_products_org_active ON public.products(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_org_sku ON public.products(organization_id, sku);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_org_date ON public.stock_transfers(organization_id, transfer_date DESC);

-- ==============================================================================
-- 4. تحديث إحصائيات المخطط لتحسين قرارات الـ Query Planner
-- ==============================================================================
ANALYZE public.invoices;
ANALYZE public.purchase_invoices;
ANALYZE public.journal_entries;
ANALYZE public.journal_lines;
ANALYZE public.receipt_vouchers;
ANALYZE public.payment_vouchers;
ANALYZE public.customers;
ANALYZE public.suppliers;
ANALYZE public.products;

COMMIT;
