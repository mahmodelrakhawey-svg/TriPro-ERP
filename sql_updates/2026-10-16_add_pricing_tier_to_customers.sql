-- ==============================================================================
-- 🏷️ TriPro ERP - ربط كارت العميل بمستوى وفئة التسعير الافتراضية
-- التاريخ: 2026-10-16
-- الهدف:
--   1. إضافة عمود pricing_tier لجدول العملاء customers ('retail', 'wholesale', 'half').
--   2. تحديث دالة get_all_customer_balances_fast لدعم إرجاع فئة التسعير مع أرصدة العملاء.
-- ==============================================================================

-- 1. إضافة عمود pricing_tier لجدول customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pricing_tier TEXT DEFAULT 'retail';

-- 2. فهرس لتحسين الاستعلامات والفلترة
CREATE INDEX IF NOT EXISTS idx_customers_pricing_tier ON public.customers(pricing_tier);

-- 3. تحديث دالة get_all_customer_balances_fast
DROP FUNCTION IF EXISTS public.get_all_customer_balances_fast(uuid, text, int, int) CASCADE;

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
    total_count bigint,
    pricing_tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_search text;
    v_total_rows bigint;
BEGIN
    v_search := NULLIF(TRIM(p_search), '');

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
    customer_accounts AS (
        SELECT a.id AS account_id
        FROM public.accounts a
        WHERE (a.organization_id = p_org_id OR a.organization_id IS NULL)
          AND (
              a.code = '1221' 
              OR a.code LIKE '1221%' 
              OR (
                  (a.name ILIKE '%العملاء%' OR a.name ILIKE '%عملاء%')
                  AND a.name NOT ILIKE '%أوراق%'
                  AND a.name NOT ILIKE '%اوراق%'
                  AND a.code NOT LIKE '1222%'
                  AND a.code != '122'
              )
          )
    ),
    entry_to_customer AS (
        SELECT i.related_journal_entry_id AS je_id, i.customer_id
        FROM public.invoices i
        WHERE i.organization_id = p_org_id AND i.related_journal_entry_id IS NOT NULL AND i.customer_id IS NOT NULL
        UNION ALL
        SELECT ppb.related_journal_entry_id AS je_id, p.customer_id
        FROM public.project_progress_billings ppb
        JOIN public.projects p ON p.id = ppb.project_id
        WHERE ppb.organization_id = p_org_id AND ppb.related_journal_entry_id IS NOT NULL AND p.customer_id IS NOT NULL
        UNION ALL
        SELECT rv.related_journal_entry_id AS je_id, rv.customer_id
        FROM public.receipt_vouchers rv
        WHERE rv.organization_id = p_org_id AND rv.related_journal_entry_id IS NOT NULL AND rv.customer_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, ch.party_id AS customer_id
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id AND ch.related_journal_entry_id IS NOT NULL AND ch.party_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, c.id AS customer_id
        FROM public.cheques ch
        JOIN public.customers c 
          ON c.organization_id = p_org_id 
         AND (
             ch.party_name ILIKE '%' || TRIM(c.name) || '%' 
             OR TRIM(c.name) ILIKE '%' || TRIM(ch.party_name) || '%'
         )
        WHERE ch.organization_id = p_org_id AND ch.related_journal_entry_id IS NOT NULL AND (ch.party_id IS NULL OR ch.party_id != c.id)
        UNION ALL
        SELECT cn.related_journal_entry_id AS je_id, cn.customer_id
        FROM public.credit_notes cn
        WHERE cn.organization_id = p_org_id AND cn.related_journal_entry_id IS NOT NULL AND cn.customer_id IS NOT NULL
        UNION ALL
        SELECT sr.related_journal_entry_id AS je_id, sr.customer_id
        FROM public.sales_returns sr
        WHERE sr.organization_id = p_org_id AND sr.related_journal_entry_id IS NOT NULL AND sr.customer_id IS NOT NULL
        UNION ALL
        SELECT o.related_journal_entry_id AS je_id, o.customer_id
        FROM public.orders o
        WHERE o.organization_id = p_org_id AND o.related_journal_entry_id IS NOT NULL AND o.customer_id IS NOT NULL
    ),
    manual_entries AS (
        SELECT je.id AS je_id, c.id AS customer_id
        FROM public.customers c
        JOIN public.journal_entries je 
          ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
         AND (
             je.description ILIKE '%' || TRIM(c.name) || '%'
             OR je.reference ILIKE '%' || TRIM(c.name) || '%'
             OR je.reference ILIKE '%OP-CUST-' || c.id::text || '%'
             OR je.reference ILIKE '%OB-' || c.id::text || '%'
         )
        WHERE c.organization_id = p_org_id
          AND c.deleted_at IS NULL
          AND c.name IS NOT NULL
          AND LENGTH(TRIM(c.name)) > 1
    ),
    all_customer_entries AS (
        SELECT DISTINCT combined.je_id, combined.customer_id FROM (
            SELECT etc.je_id, etc.customer_id FROM entry_to_customer etc
            UNION ALL
            SELECT me.je_id, me.customer_id FROM manual_entries me
        ) combined
    ),
    ledger_balances AS (
        SELECT 
            ace.customer_id,
            COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS net_balance
        FROM all_customer_entries ace
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = ace.je_id
         AND jl.account_id IN (SELECT ca.account_id FROM customer_accounts ca)
        JOIN public.journal_entries je
          ON je.id = ace.je_id
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
        GROUP BY ace.customer_id
    ),
    opening_check AS (
        SELECT 
            ace.customer_id,
            COUNT(*) FILTER (
                WHERE je.description ILIKE '%رصيد افتتاحي%' 
                   OR je.reference ILIKE 'OP-%' 
                   OR je.reference ILIKE 'OB-%'
                   OR je.related_document_type = 'opening_balance'
            ) AS op_count
        FROM all_customer_entries ace
        JOIN public.journal_entries je ON je.id = ace.je_id
        GROUP BY ace.customer_id
    ),
    unposted_orders AS (
        SELECT o.customer_id, COALESCE(SUM(o.grand_total), 0) AS unposted_total
        FROM public.orders o
        WHERE o.organization_id = p_org_id
          AND o.related_journal_entry_id IS NULL
          AND o.status != 'CANCELLED'
          AND o.customer_id IS NOT NULL
        GROUP BY o.customer_id
    ),
    agg_invoices AS (
        SELECT 
            si.customer_id,
            COALESCE(SUM(si.total_amount), 0) AS gross_sales,
            MAX(si.invoice_date::text) AS max_inv_date
        FROM public.invoices si
        WHERE si.organization_id = p_org_id
          AND si.customer_id IS NOT NULL
          AND si.status NOT IN ('draft', 'cancelled')
        GROUP BY si.customer_id
    )
    SELECT 
        c.id AS customer_id,
        c.name::text AS customer_name,
        COALESCE(c.phone, '')::text AS phone,
        COALESCE(c.tax_number, '')::text AS tax_number,
        COALESCE(c.opening_balance, 0)::numeric AS opening_balance,
        COALESCE(inv.gross_sales, 0)::numeric AS total_sales,
        ROUND(
            COALESCE(lb.net_balance, 0) + 
            CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(c.opening_balance, 0) END +
            COALESCE(uo.unposted_total, 0)
        , 2)::numeric AS balance,
        inv.max_inv_date AS last_invoice,
        v_total_rows AS total_count,
        COALESCE(c.pricing_tier, 'retail')::text AS pricing_tier
    FROM public.customers c
    LEFT JOIN ledger_balances lb ON lb.customer_id = c.id
    LEFT JOIN opening_check oc ON oc.customer_id = c.id
    LEFT JOIN unposted_orders uo ON uo.customer_id = c.id
    LEFT JOIN agg_invoices inv ON inv.customer_id = c.id
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR c.name ILIKE '%' || v_search || '%'
          OR c.phone ILIKE '%' || v_search || '%'
          OR c.tax_number ILIKE '%' || v_search || '%'
      )
    ORDER BY c.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_customer_balances_fast(uuid, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_customer_balances_fast(uuid, text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_customer_balances_fast(uuid, text, int, int) TO service_role;
