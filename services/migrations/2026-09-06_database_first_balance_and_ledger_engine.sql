-- ==============================================================================
-- 🚀 محرك الأرصدة وحسابات الأستاذ المساعد المباشر بقاعدة البيانات (Database-First Balance Engine)
-- تاريخ الإنشاء: 2026-09-06
-- الغرض: نقل احتساب أرصدة العملاء والموردين وأعمار الديون بالكامل إلى داخل PostgreSQL
-- لمنع التجميع في المتصفح، ودعم البحث والترقيم الصفحي (Pagination) بسرعة أجزاء من الثانية.
-- ==============================================================================

-- 1. الفهارس المركبة لرفع سرعة الاستعلامات الحسابية (Performance Composite Indexes)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_invoices_perf_agg 
  ON public.invoices (organization_id, customer_id, status, invoice_date)
  WHERE status NOT IN ('draft', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_perf_agg 
  ON public.purchase_invoices (organization_id, supplier_id, status, invoice_date)
  WHERE status != 'draft';

CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_cust_perf 
  ON public.receipt_vouchers (organization_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_vouchers_supp_perf 
  ON public.payment_vouchers (organization_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_notes_perf_agg 
  ON public.credit_notes (organization_id, customer_id, status)
  WHERE status = 'posted';

CREATE INDEX IF NOT EXISTS idx_debit_notes_perf_agg 
  ON public.debit_notes (organization_id, supplier_id, status)
  WHERE status = 'posted';

CREATE INDEX IF NOT EXISTS idx_cheques_perf_agg 
  ON public.cheques (organization_id, party_id, type, status)
  WHERE status != 'rejected';

CREATE INDEX IF NOT EXISTS idx_opening_inv_perf 
  ON public.opening_inventories (organization_id, product_id, warehouse_id);


-- ==============================================================================
-- 2. دالة جلب أرصدة العملاء فائقة السرعة مع البحث والترقيم الصفحي
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_all_customer_balances_fast(
    p_org_id uuid,
    p_search text DEFAULT NULL,
    p_limit int DEFAULT 1000,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    customer_id uuid,
    customer_name text,
    phone text,
    tax_number text,
    opening_balance numeric,
    total_sales numeric,
    balance numeric,
    last_invoice text,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_search text;
    v_total_rows bigint;
BEGIN
    v_search := NULLIF(TRIM(p_search), '');

    -- حساب العدد الإجمالي للسجلات المطابقة للبحث لتشغيل شريط الترقيم الصفحي (Pagination)
    SELECT COUNT(*) INTO v_total_rows
    FROM public.customers c
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR c.name ILIKE '%' || v_search || '%'
          OR c.phone ILIKE '%' || v_search || '%'
          OR c.tax_number ILIKE '%' || v_search || '%'
      );

    RETURN QUERY
    WITH 
    -- 1. تجميع الفواتير والمبيعات غير المسددة
    agg_invoices AS (
        SELECT 
            si.customer_id,
            COALESCE(SUM(si.total_amount), 0) AS gross_sales,
            COALESCE(SUM(si.total_amount - COALESCE(si.paid_amount, 0)), 0) AS unpaid_invoiced,
            MAX(si.invoice_date::text) AS max_inv_date
        FROM public.invoices si
        WHERE si.organization_id = p_org_id
          AND si.customer_id IS NOT NULL
          AND si.status NOT IN ('draft', 'cancelled')
        GROUP BY si.customer_id
    ),
    -- 2. تجميع مستخلصات المشاريع (مدين للعميل)
    agg_billings AS (
        SELECT 
            ppb.customer_id,
            COALESCE(SUM(ppb.net_amount), 0) AS total_billings
        FROM public.project_progress_billings ppb
        WHERE ppb.organization_id = p_org_id
          AND ppb.customer_id IS NOT NULL
          AND ppb.status != 'draft'
        GROUP BY ppb.customer_id
    ),
    -- 3. تجميع سندات القبض (تخفيض للرصيد)
    agg_receipts AS (
        SELECT 
            rv.customer_id,
            COALESCE(SUM(rv.amount), 0) AS total_receipts
        FROM public.receipt_vouchers rv
        WHERE rv.organization_id = p_org_id
          AND rv.customer_id IS NOT NULL
        GROUP BY rv.customer_id
    ),
    -- 4. تجميع الإشعارات الدائنة المرحلة (تخفيض للرصيد)
    agg_credits AS (
        SELECT 
            cn.customer_id,
            COALESCE(SUM(cn.total_amount), 0) AS total_credits
        FROM public.credit_notes cn
        WHERE cn.organization_id = p_org_id
          AND cn.customer_id IS NOT NULL
          AND cn.status = 'posted'
        GROUP BY cn.customer_id
    ),
    -- 5. تجميع الشيكات الواردة غير المرفوضة
    agg_cheques AS (
        SELECT 
            ch.party_id AS customer_id,
            COALESCE(SUM(ch.amount), 0) AS total_cheques
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id
          AND ch.party_id IS NOT NULL
          AND ch.type = 'incoming'
          AND ch.status != 'rejected'
        GROUP BY ch.party_id
    )
    SELECT 
        c.id AS customer_id,
        c.name::text AS customer_name,
        COALESCE(c.phone, '')::text AS phone,
        COALESCE(c.tax_number, '')::text AS tax_number,
        COALESCE(c.opening_balance, 0)::numeric AS opening_balance,
        COALESCE(inv.gross_sales, 0)::numeric AS total_sales,
        ROUND(
            COALESCE(c.opening_balance, 0)
            + COALESCE(inv.unpaid_invoiced, 0)
            + COALESCE(bil.total_billings, 0)
            - COALESCE(rec.total_receipts, 0)
            - COALESCE(crd.total_credits, 0)
            - COALESCE(chq.total_cheques, 0)
        , 2)::numeric AS balance,
        inv.max_inv_date AS last_invoice,
        v_total_rows AS total_count
    FROM public.customers c
    LEFT JOIN agg_invoices inv ON inv.customer_id = c.id
    LEFT JOIN agg_billings bil ON bil.customer_id = c.id
    LEFT JOIN agg_receipts rec ON rec.customer_id = c.id
    LEFT JOIN agg_credits crd ON crd.customer_id = c.id
    LEFT JOIN agg_cheques chq ON chq.customer_id = c.id
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR c.name ILIKE '%' || v_search || '%'
          OR c.phone ILIKE '%' || v_search || '%'
          OR c.tax_number ILIKE '%' || v_search || '%'
      )
    ORDER BY c.name ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$;


-- ==============================================================================
-- 3. دالة جلب أرصدة الموردين فائقة السرعة مع البحث والترقيم الصفحي
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_all_supplier_balances_fast(
    p_org_id uuid,
    p_search text DEFAULT NULL,
    p_limit int DEFAULT 1000,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    supplier_id uuid,
    supplier_name text,
    phone text,
    tax_number text,
    opening_balance numeric,
    total_purchases numeric,
    balance numeric,
    last_invoice text,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_search text;
    v_total_rows bigint;
BEGIN
    v_search := NULLIF(TRIM(p_search), '');

    -- حساب إجمالي السجلات للترقيم الصفحي
    SELECT COUNT(*) INTO v_total_rows
    FROM public.suppliers s
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR s.name ILIKE '%' || v_search || '%'
          OR s.phone ILIKE '%' || v_search || '%'
          OR s.tax_number ILIKE '%' || v_search || '%'
      );

    RETURN QUERY
    WITH 
    -- 1. تجميع فواتير المشتريات (مع خصم السداد الفوري غير المغطى بسند صرف لمنع الازدواج)
    agg_invoices AS (
        SELECT 
            pi.supplier_id,
            COALESCE(SUM(pi.total_amount), 0) AS gross_purchases,
            COALESCE(SUM(
                pi.total_amount - GREATEST(0, COALESCE(pi.paid_amount, 0) - COALESCE((
                    SELECT SUM(pv.amount) 
                    FROM public.payment_vouchers pv 
                    WHERE pv.supplier_id = pi.supplier_id 
                      AND pi.invoice_number IS NOT NULL
                      AND pv.notes ILIKE '%' || pi.invoice_number || '%'
                ), 0))
            ), 0) AS total_invoiced,
            MAX(pi.invoice_date::text) AS max_inv_date
        FROM public.purchase_invoices pi
        WHERE pi.organization_id = p_org_id
          AND pi.supplier_id IS NOT NULL
          AND pi.status != 'draft'
        GROUP BY pi.supplier_id
    ),
    -- 2. تجميع سندات الصرف
    agg_payments AS (
        SELECT 
            pv.supplier_id,
            COALESCE(SUM(pv.amount), 0) AS total_payments
        FROM public.payment_vouchers pv
        WHERE pv.organization_id = p_org_id
          AND pv.supplier_id IS NOT NULL
        GROUP BY pv.supplier_id
    ),
    -- 3. تجميع مردودات المشتريات
    agg_returns AS (
        SELECT 
            pr.supplier_id,
            COALESCE(SUM(pr.total_amount), 0) AS total_returns
        FROM public.purchase_returns pr
        WHERE pr.organization_id = p_org_id
          AND pr.supplier_id IS NOT NULL
          AND pr.status != 'draft'
        GROUP BY pr.supplier_id
    ),
    -- 4. تجميع إشعارات الخصم (مدينة للمورد / تخفيض مستحقاته)
    agg_debits AS (
        SELECT 
            dn.supplier_id,
            COALESCE(SUM(dn.total_amount), 0) AS total_debits
        FROM public.debit_notes dn
        WHERE dn.organization_id = p_org_id
          AND dn.supplier_id IS NOT NULL
          AND dn.status = 'posted'
        GROUP BY dn.supplier_id
    ),
    -- 5. تجميع الشيكات الصادرة غير المرفوضة
    agg_cheques AS (
        SELECT 
            ch.party_id AS supplier_id,
            COALESCE(SUM(ch.amount), 0) AS total_cheques
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id
          AND ch.party_id IS NOT NULL
          AND ch.type = 'outgoing'
          AND ch.status != 'rejected'
        GROUP BY ch.party_id
    ),
    -- 6. تجميع خصومات/تسويات الموردين المعتمدة (Rebates)
    agg_rebates AS (
        SELECT 
            vrs.vendor_id AS supplier_id,
            COALESCE(SUM(vrs.total_claim_amount), 0) AS total_rebates
        FROM public.vendor_rebate_settlements vrs
        WHERE vrs.organization_id = p_org_id
          AND vrs.vendor_id IS NOT NULL
          AND vrs.status IN ('APPROVED', 'SETTLED')
        GROUP BY vrs.vendor_id
    ),
    -- 7. تجميع مستخلصات مقاولي الباطن المرتبطين كموردين
    agg_sub_billings AS (
        SELECT 
            sc.subcontractor_id,
            COALESCE(SUM(sb.net_amount), 0) AS total_sub_billings
        FROM public.subcontractor_billings sb
        JOIN public.subcontractor_contracts sc ON sc.id = sb.contract_id
        WHERE sb.organization_id = p_org_id
          AND sb.status != 'draft'
        GROUP BY sc.subcontractor_id
    ),
    sub_map AS (
        SELECT 
            s.id AS supplier_id,
            COALESCE(SUM(asb.total_sub_billings), 0) AS contractor_billings
        FROM public.suppliers s
        JOIN public.subcontractors sub ON sub.organization_id = p_org_id 
          AND (sub.supplier_id = s.id OR TRIM(LOWER(sub.name)) = TRIM(LOWER(s.name)) OR sub.id::text = s.id::text)
        JOIN agg_sub_billings asb ON asb.subcontractor_id = sub.id
        WHERE s.organization_id = p_org_id
        GROUP BY s.id
    )
    SELECT 
        s.id AS supplier_id,
        s.name::text AS supplier_name,
        COALESCE(s.phone, '')::text AS phone,
        COALESCE(s.tax_number, '')::text AS tax_number,
        COALESCE(s.opening_balance, 0)::numeric AS opening_balance,
        COALESCE(inv.gross_purchases, 0)::numeric AS total_purchases,
        ROUND(
            COALESCE(s.opening_balance, 0)
            + COALESCE(inv.total_invoiced, 0)
            + COALESCE(sm.contract_billings, 0)
            - COALESCE(pmt.total_payments, 0)
            - COALESCE(ret.total_returns, 0)
            - COALESCE(deb.total_debits, 0)
            - COALESCE(chq.total_cheques, 0)
            - COALESCE(reb.total_rebates, 0)
        , 2)::numeric AS balance,
        inv.max_inv_date AS last_invoice,
        v_total_rows AS total_count
    FROM public.suppliers s
    LEFT JOIN agg_invoices inv ON inv.supplier_id = s.id
    LEFT JOIN agg_payments pmt ON pmt.supplier_id = s.id
    LEFT JOIN agg_returns ret ON ret.supplier_id = s.id
    LEFT JOIN agg_debits deb ON deb.supplier_id = s.id
    LEFT JOIN agg_cheques chq ON chq.supplier_id = s.id
    LEFT JOIN agg_rebates reb ON reb.supplier_id = s.id
    LEFT JOIN sub_map sm ON sm.supplier_id = s.id
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR s.name ILIKE '%' || v_search || '%'
          OR s.phone ILIKE '%' || v_search || '%'
          OR s.tax_number ILIKE '%' || v_search || '%'
      )
    ORDER BY s.name ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$;


-- ==============================================================================
-- 4. دالة تقرير أعمار ديون العملاء المباشرة بقاعدة البيانات (شاملة الفواتير، المستخلصات، الأرصدة الافتتاحية، الشيكات، والمرتجعات)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_customer_aging_ledger(p_org_id uuid)
RETURNS TABLE (
    customer_id uuid,
    customer_name text,
    phone text,
    range_0_30 numeric,
    range_31_60 numeric,
    range_61_90 numeric,
    range_90_plus numeric,
    total_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH 
    -- 1. فواتير المبيعات مجزأة حسب العمر الزمني
    inv_items AS (
        SELECT 
            i.customer_id,
            (CURRENT_DATE - i.invoice_date::date) AS age_days,
            (i.total_amount - COALESCE(i.paid_amount, 0)) AS amount
        FROM public.invoices i
        WHERE i.organization_id = p_org_id
          AND i.customer_id IS NOT NULL
          AND i.status NOT IN ('draft', 'cancelled')
    ),
    -- 2. مستخلصات مشاريع المقاولات مجزأة حسب العمر الزمني
    billing_items AS (
        SELECT 
            ppb.customer_id,
            (CURRENT_DATE - ppb.billing_date::date) AS age_days,
            ppb.net_amount AS amount
        FROM public.project_progress_billings ppb
        WHERE ppb.organization_id = p_org_id
          AND ppb.customer_id IS NOT NULL
          AND ppb.status != 'draft'
    ),
    -- 3. تجميع كافة بنود الاستحقاق (فواتير + مستخلصات)
    all_debit_items AS (
        SELECT inv_items.customer_id, inv_items.age_days, inv_items.amount FROM inv_items
        UNION ALL
        SELECT billing_items.customer_id, billing_items.age_days, billing_items.amount FROM billing_items
    ),
    debit_buckets AS (
        SELECT 
            di.customer_id,
            COALESCE(SUM(CASE WHEN di.age_days <= 30 THEN di.amount ELSE 0 END), 0) AS b_0_30,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 31 AND 60 THEN di.amount ELSE 0 END), 0) AS b_31_60,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 61 AND 90 THEN di.amount ELSE 0 END), 0) AS b_61_90,
            COALESCE(SUM(CASE WHEN di.age_days > 90 THEN di.amount ELSE 0 END), 0) AS b_90_plus,
            COALESCE(SUM(di.amount), 0) AS total_debits
        FROM all_debit_items di
        GROUP BY di.customer_id
    ),
    -- 4. تجميع كافة المسددات والتخفيضات (سندات قبض + إشعارات دائنة + مردودات + شيكات واردة)
    total_deductions AS (
        SELECT 
            c.id AS customer_id,
            COALESCE(rec.total_receipts, 0)
            + COALESCE(crd.total_credits, 0)
            + COALESCE(ret.total_returns, 0)
            + COALESCE(chq.total_cheques, 0) AS total_paid
        FROM public.customers c
        LEFT JOIN (
            SELECT customer_id, SUM(amount) AS total_receipts
            FROM public.receipt_vouchers
            WHERE organization_id = p_org_id AND customer_id IS NOT NULL
            GROUP BY customer_id
        ) rec ON rec.customer_id = c.id
        LEFT JOIN (
            SELECT customer_id, SUM(total_amount) AS total_credits
            FROM public.credit_notes
            WHERE organization_id = p_org_id AND customer_id IS NOT NULL AND status = 'posted'
            GROUP BY customer_id
        ) crd ON crd.customer_id = c.id
        LEFT JOIN (
            SELECT customer_id, SUM(total_amount) AS total_returns
            FROM public.sales_returns
            WHERE organization_id = p_org_id AND customer_id IS NOT NULL AND (status IS NULL OR status NOT IN ('draft', 'cancelled'))
            GROUP BY customer_id
        ) ret ON ret.customer_id = c.id
        LEFT JOIN (
            SELECT party_id AS customer_id, SUM(amount) AS total_cheques
            FROM public.cheques
            WHERE organization_id = p_org_id AND party_id IS NOT NULL AND type = 'incoming' AND status != 'rejected'
            GROUP BY party_id
        ) chq ON chq.customer_id = c.id
        WHERE c.organization_id = p_org_id
    ),
    calculated AS (
        SELECT 
            c.id AS customer_id,
            c.name::text AS customer_name,
            COALESCE(c.phone, '')::text AS phone,
            COALESCE(c.opening_balance, 0) AS op_balance,
            COALESCE(db.b_0_30, 0) AS raw_0_30,
            COALESCE(db.b_31_60, 0) AS raw_31_60,
            COALESCE(db.b_61_90, 0) AS raw_61_90,
            (COALESCE(db.b_90_plus, 0) + COALESCE(c.opening_balance, 0)) AS raw_90_plus,
            (COALESCE(db.total_debits, 0) + COALESCE(c.opening_balance, 0)) AS gross_receivable,
            COALESCE(td.total_paid, 0) AS total_paid
        FROM public.customers c
        LEFT JOIN debit_buckets db ON db.customer_id = c.id
        LEFT JOIN total_deductions td ON td.customer_id = c.id
        WHERE c.organization_id = p_org_id AND c.deleted_at IS NULL
    )
    scaled AS (
        SELECT 
            calc.customer_id,
            calc.customer_name,
            calc.phone,
            ROUND(GREATEST(0::numeric, calc.raw_0_30 * 
                CASE WHEN calc.gross_receivable > 0 
                     THEN GREATEST(0::numeric, (calc.gross_receivable - calc.total_paid)) / calc.gross_receivable 
                     ELSE 0::numeric END), 2) AS range_0_30,
            ROUND(GREATEST(0::numeric, calc.raw_31_60 * 
                CASE WHEN calc.gross_receivable > 0 
                     THEN GREATEST(0::numeric, (calc.gross_receivable - calc.total_paid)) / calc.gross_receivable 
                     ELSE 0::numeric END), 2) AS range_31_60,
            ROUND(GREATEST(0::numeric, calc.raw_61_90 * 
                CASE WHEN calc.gross_receivable > 0 
                     THEN GREATEST(0::numeric, (calc.gross_receivable - calc.total_paid)) / calc.gross_receivable 
                     ELSE 0::numeric END), 2) AS range_61_90,
            ROUND(GREATEST(0::numeric, calc.raw_90_plus * 
                CASE WHEN calc.gross_receivable > 0 
                     THEN GREATEST(0::numeric, (calc.gross_receivable - calc.total_paid)) / calc.gross_receivable 
                     ELSE 0::numeric END), 2) AS range_90_plus,
            ROUND(GREATEST(0::numeric, (calc.gross_receivable - calc.total_paid)), 2) AS total_balance
        FROM calculated calc
        WHERE (calc.gross_receivable - calc.total_paid) > 0.01
    )
    SELECT 
        s.customer_id,
        s.customer_name,
        s.phone,
        s.range_0_30,
        s.range_31_60,
        s.range_61_90,
        CASE 
            WHEN (s.range_0_30 + s.range_31_60 + s.range_61_90 + s.range_90_plus) = 0 AND s.total_balance > 0 
            THEN s.total_balance 
            ELSE s.range_90_plus 
        END AS range_90_plus,
        s.total_balance
    FROM scaled s
    ORDER BY s.total_balance DESC;
END;
$$;


-- ==============================================================================
-- 5. دالة تقرير أعمار ديون الموردين المباشرة بقاعدة البيانات (شاملة الفواتير والمستخلصات والأرصدة الافتتاحية والشيكات والمرتجعات)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_supplier_aging_ledger(p_org_id uuid)
RETURNS TABLE (
    supplier_id uuid,
    supplier_name text,
    phone text,
    range_0_30 numeric,
    range_31_60 numeric,
    range_61_90 numeric,
    range_90_plus numeric,
    total_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH 
    -- 1. فواتير المشتريات (مع خصم السداد الفوري غير المغطى بسند صرف)
    inv_items AS (
        SELECT 
            pi.supplier_id,
            (CURRENT_DATE - pi.invoice_date::date) AS age_days,
            GREATEST(0::numeric, pi.total_amount - GREATEST(0, COALESCE(pi.paid_amount, 0) - COALESCE((
                SELECT SUM(pv.amount) 
                FROM public.payment_vouchers pv 
                WHERE pv.supplier_id = pi.supplier_id 
                  AND pi.invoice_number IS NOT NULL
                  AND pv.notes ILIKE '%' || pi.invoice_number || '%'
            ), 0))) AS amount
        FROM public.purchase_invoices pi
        WHERE pi.organization_id = p_org_id
          AND pi.supplier_id IS NOT NULL
          AND pi.status != 'draft'
    ),
    -- 2. مستخلصات مقاولي الباطن المعتمدة (المرتبطين كموردين)
    sub_billings AS (
        SELECT 
            sc.subcontractor_id,
            (CURRENT_DATE - sb.billing_date::date) AS age_days,
            sb.net_amount AS amount
        FROM public.subcontractor_billings sb
        JOIN public.subcontractor_contracts sc ON sc.id = sb.contract_id
        WHERE sb.organization_id = p_org_id
          AND sb.status != 'draft'
    ),
    sub_map AS (
        SELECT 
            s.id AS supplier_id,
            sb.age_days,
            sb.amount
        FROM public.suppliers s
        JOIN public.subcontractors sub ON sub.organization_id = p_org_id 
          AND (sub.supplier_id = s.id OR TRIM(LOWER(sub.name)) = TRIM(LOWER(s.name)) OR sub.id::text = s.id::text)
        JOIN sub_billings sb ON sb.subcontractor_id = sub.id
        WHERE s.organization_id = p_org_id
    ),
    all_debit_items AS (
        SELECT inv_items.supplier_id, inv_items.age_days, inv_items.amount FROM inv_items
        UNION ALL
        SELECT sub_map.supplier_id, sub_map.age_days, sub_map.amount FROM sub_map
    ),
    debit_buckets AS (
        SELECT 
            di.supplier_id,
            COALESCE(SUM(CASE WHEN di.age_days <= 30 THEN di.amount ELSE 0 END), 0) AS b_0_30,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 31 AND 60 THEN di.amount ELSE 0 END), 0) AS b_31_60,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 61 AND 90 THEN di.amount ELSE 0 END), 0) AS b_61_90,
            COALESCE(SUM(CASE WHEN di.age_days > 90 THEN di.amount ELSE 0 END), 0) AS b_90_plus,
            COALESCE(SUM(di.amount), 0) AS total_invoiced
        FROM all_debit_items di
        GROUP BY di.supplier_id
    ),
    -- 3. كافة المسددات والتخفيضات للمورد
    total_deductions AS (
        SELECT 
            s.id AS supplier_id,
            COALESCE(pmt.total_payments, 0)
            + COALESCE(ret.total_returns, 0)
            + COALESCE(deb.total_debits, 0)
            + COALESCE(chq.total_cheques, 0)
            + COALESCE(reb.total_rebates, 0) AS total_paid
        FROM public.suppliers s
        LEFT JOIN (
            SELECT supplier_id, SUM(amount) AS total_payments
            FROM public.payment_vouchers
            WHERE organization_id = p_org_id AND supplier_id IS NOT NULL
            GROUP BY supplier_id
        ) pmt ON pmt.supplier_id = s.id
        LEFT JOIN (
            SELECT supplier_id, SUM(total_amount) AS total_returns
            FROM public.purchase_returns
            WHERE organization_id = p_org_id AND supplier_id IS NOT NULL AND status != 'draft'
            GROUP BY supplier_id
        ) ret ON ret.supplier_id = s.id
        LEFT JOIN (
            SELECT supplier_id, SUM(total_amount) AS total_debits
            FROM public.debit_notes
            WHERE organization_id = p_org_id AND supplier_id IS NOT NULL AND status = 'posted'
            GROUP BY supplier_id
        ) deb ON deb.supplier_id = s.id
        LEFT JOIN (
            SELECT party_id AS supplier_id, SUM(amount) AS total_cheques
            FROM public.cheques
            WHERE organization_id = p_org_id AND party_id IS NOT NULL AND type = 'outgoing' AND status != 'rejected'
            GROUP BY party_id
        ) chq ON chq.supplier_id = s.id
        LEFT JOIN (
            SELECT vendor_id AS supplier_id, SUM(total_claim_amount) AS total_rebates
            FROM public.vendor_rebate_settlements
            WHERE organization_id = p_org_id AND vendor_id IS NOT NULL AND status IN ('APPROVED', 'SETTLED')
            GROUP BY vendor_id
        ) reb ON reb.supplier_id = s.id
        WHERE s.organization_id = p_org_id
    ),
    calculated AS (
        SELECT 
            s.id AS supplier_id,
            s.name::text AS supplier_name,
            COALESCE(s.phone, '')::text AS phone,
            COALESCE(s.opening_balance, 0) AS op_balance,
            COALESCE(db.b_0_30, 0) AS raw_0_30,
            COALESCE(db.b_31_60, 0) AS raw_31_60,
            COALESCE(db.b_61_90, 0) AS raw_61_90,
            (COALESCE(db.b_90_plus, 0) + COALESCE(s.opening_balance, 0)) AS raw_90_plus,
            (COALESCE(db.total_invoiced, 0) + COALESCE(s.opening_balance, 0)) AS gross_payable,
            COALESCE(td.total_paid, 0) AS total_paid
        FROM public.suppliers s
        LEFT JOIN debit_buckets db ON db.supplier_id = s.id
        LEFT JOIN total_deductions td ON td.supplier_id = s.id
        WHERE s.organization_id = p_org_id AND s.deleted_at IS NULL
    ),
    scaled AS (
        SELECT 
            calc.supplier_id,
            calc.supplier_name,
            calc.phone,
            ROUND(GREATEST(0::numeric, calc.raw_0_30 * 
                CASE WHEN calc.gross_payable > 0 
                     THEN GREATEST(0::numeric, (calc.gross_payable - calc.total_paid)) / calc.gross_payable 
                     ELSE 0::numeric END), 2) AS range_0_30,
            ROUND(GREATEST(0::numeric, calc.raw_31_60 * 
                CASE WHEN calc.gross_payable > 0 
                     THEN GREATEST(0::numeric, (calc.gross_payable - calc.total_paid)) / calc.gross_payable 
                     ELSE 0::numeric END), 2) AS range_31_60,
            ROUND(GREATEST(0::numeric, calc.raw_61_90 * 
                CASE WHEN calc.gross_payable > 0 
                     THEN GREATEST(0::numeric, (calc.gross_payable - calc.total_paid)) / calc.gross_payable 
                     ELSE 0::numeric END), 2) AS range_61_90,
            ROUND(GREATEST(0::numeric, calc.raw_90_plus * 
                CASE WHEN calc.gross_payable > 0 
                     THEN GREATEST(0::numeric, (calc.gross_payable - calc.total_paid)) / calc.gross_payable 
                     ELSE 0::numeric END), 2) AS range_90_plus,
            ROUND(GREATEST(0::numeric, (calc.gross_payable - calc.total_paid)), 2) AS total_balance
        FROM calculated calc
        WHERE (calc.gross_payable - calc.total_paid) > 0.01
    )
    SELECT 
        s.supplier_id,
        s.supplier_name,
        s.phone,
        s.range_0_30,
        s.range_31_60,
        s.range_61_90,
        CASE 
            WHEN (s.range_0_30 + s.range_31_60 + s.range_61_90 + s.range_90_plus) = 0 AND s.total_balance > 0 
            THEN s.total_balance 
            ELSE s.range_90_plus 
        END AS range_90_plus,
        s.total_balance
    FROM scaled s
    ORDER BY s.total_balance DESC;
END;
$$;


-- ==============================================================================
-- 6. دالة كارت الصنف التراكمي المباشر بقاعدة البيانات (Stock Card Ledger with Running Balance)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_stock_card_ledger(
    p_org_id uuid,
    p_product_id uuid,
    p_warehouse_id uuid DEFAULT NULL,
    p_from_date date DEFAULT NULL,
    p_to_date date DEFAULT NULL,
    p_limit int DEFAULT 100,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    movement_id text,
    movement_date text,
    movement_type text,
    quantity numeric,
    document_type text,
    document_number text,
    warehouse_id uuid,
    warehouse_name text,
    notes text,
    unit_cost numeric,
    running_balance numeric,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opening_qty numeric := 0;
    v_total_rows bigint;
BEGIN
    -- 1. حساب الرصيد الافتتاحي والحركات السابقة لتاريخ البداية (إذا تم تحديد p_from_date)
    SELECT COALESCE(SUM(oi.quantity), 0) INTO v_opening_qty
    FROM public.opening_inventories oi
    WHERE oi.organization_id = p_org_id
      AND oi.product_id = p_product_id
      AND (p_warehouse_id IS NULL OR oi.warehouse_id = p_warehouse_id);

    RETURN QUERY
    WITH raw_movements AS (
        -- رصيد افتتاحي
        SELECT 
            oi.id::text AS m_id,
            oi.created_at::date AS m_date,
            'IN'::text AS m_type,
            oi.quantity::numeric AS m_qty,
            'افتتاحي'::text AS doc_type,
            'OPENING'::text AS doc_num,
            oi.warehouse_id AS wh_id,
            w.name::text AS wh_name,
            'رصيد افتتاحي مسجل'::text AS m_notes,
            0::numeric AS u_cost,
            oi.created_at AS order_ts
        FROM public.opening_inventories oi
        LEFT JOIN public.warehouses w ON w.id = oi.warehouse_id
        WHERE oi.organization_id = p_org_id
          AND oi.product_id = p_product_id
          AND (p_warehouse_id IS NULL OR oi.warehouse_id = p_warehouse_id)

        UNION ALL

        -- فواتير مشتريات (وارد IN)
        SELECT 
            pii.id::text,
            pi.invoice_date::date,
            'IN'::text,
            pii.quantity::numeric,
            'فاتورة مشتريات'::text,
            pi.invoice_number::text,
            pi.warehouse_id,
            w.name::text,
            COALESCE(pi.notes, '')::text,
            COALESCE(pii.unit_cost, 0)::numeric,
            pi.created_at
        FROM public.purchase_invoice_items pii
        JOIN public.purchase_invoices pi ON pi.id = pii.purchase_invoice_id
        LEFT JOIN public.warehouses w ON w.id = pi.warehouse_id
        WHERE pi.organization_id = p_org_id
          AND pii.product_id = p_product_id
          AND pi.status IN ('posted', 'paid')
          AND (p_warehouse_id IS NULL OR pi.warehouse_id = p_warehouse_id)

        UNION ALL

        -- فواتير مبيعات (صادر OUT)
        SELECT 
            ii.id::text,
            inv.invoice_date::date,
            'OUT'::text,
            ii.quantity::numeric,
            'فاتورة مبيعات'::text,
            inv.invoice_number::text,
            inv.warehouse_id,
            w.name::text,
            COALESCE(inv.notes, '')::text,
            COALESCE(ii.unit_price, 0)::numeric,
            inv.created_at
        FROM public.invoice_items ii
        JOIN public.invoices inv ON inv.id = ii.invoice_id
        LEFT JOIN public.warehouses w ON w.id = inv.warehouse_id
        WHERE inv.organization_id = p_org_id
          AND ii.product_id = p_product_id
          AND inv.status NOT IN ('draft', 'cancelled')
          AND (p_warehouse_id IS NULL OR inv.warehouse_id = p_warehouse_id)

        UNION ALL

        -- مرتجع مبيعات (وارد IN)
        SELECT 
            sri.id::text,
            sr.return_date::date,
            'IN'::text,
            sri.quantity::numeric,
            'مرتجع مبيعات'::text,
            sr.return_number::text,
            sr.warehouse_id,
            w.name::text,
            COALESCE(sr.notes, '')::text,
            0::numeric,
            sr.created_at
        FROM public.sales_return_items sri
        JOIN public.sales_returns sr ON sr.id = sri.sales_return_id
        LEFT JOIN public.warehouses w ON w.id = sr.warehouse_id
        WHERE sr.organization_id = p_org_id
          AND sri.product_id = p_product_id
          AND sr.status = 'posted'
          AND (p_warehouse_id IS NULL OR sr.warehouse_id = p_warehouse_id)

        UNION ALL

        -- مرتجع مشتريات (صادر OUT)
        SELECT 
            pri.id::text,
            pr.return_date::date,
            'OUT'::text,
            pri.quantity::numeric,
            'مرتجع مشتريات'::text,
            pr.return_number::text,
            pr.warehouse_id,
            w.name::text,
            COALESCE(pr.notes, '')::text,
            0::numeric,
            pr.created_at
        FROM public.purchase_return_items pri
        JOIN public.purchase_returns pr ON pr.id = pri.purchase_return_id
        LEFT JOIN public.warehouses w ON w.id = pr.warehouse_id
        WHERE pr.organization_id = p_org_id
          AND pri.product_id = p_product_id
          AND pr.status = 'posted'
          AND (p_warehouse_id IS NULL OR pr.warehouse_id = p_warehouse_id)
    ),
    filtered_movements AS (
        SELECT *
        FROM raw_movements rm
        WHERE (p_from_date IS NULL OR rm.m_date >= p_from_date)
          AND (p_to_date IS NULL OR rm.m_date <= p_to_date)
    ),
    with_running AS (
        SELECT 
            fm.m_id,
            fm.m_date::text,
            fm.m_type,
            fm.m_qty,
            fm.doc_type,
            fm.doc_num,
            fm.wh_id,
            fm.wh_name,
            fm.m_notes,
            fm.u_cost,
            SUM(CASE WHEN fm.m_type = 'IN' THEN fm.m_qty ELSE -fm.m_qty END) 
                OVER (ORDER BY fm.m_date ASC, fm.order_ts ASC) AS run_balance,
            COUNT(*) OVER() AS full_count
        FROM filtered_movements fm
    )
    SELECT 
        wr.m_id,
        wr.m_date,
        wr.m_type,
        wr.m_qty,
        wr.doc_type,
        wr.doc_num,
        wr.wh_id,
        wr.wh_name,
        wr.m_notes,
        wr.u_cost,
        ROUND(wr.run_balance, 2)::numeric AS running_balance,
        wr.full_count AS total_count
    FROM with_running wr
    ORDER BY wr.m_date DESC, wr.order_ts DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;


-- ==============================================================================
-- 7. منح الصلاحيات لجميع المستخدمين الموثقين
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.get_all_customer_balances_fast(uuid, text, int, int) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid, text, int, int) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_aging_ledger(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_aging_ledger(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_card_ledger(uuid, uuid, uuid, date, date, int, int) TO authenticated, service_role, anon;

