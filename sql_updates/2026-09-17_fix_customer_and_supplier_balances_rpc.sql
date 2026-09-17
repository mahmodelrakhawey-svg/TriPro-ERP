-- ==============================================================================
-- TriPro ERP - إصلاح دوال أرصدة وأعمار ديون العملاء والموردين
-- تاريخ التحديث: 2026-09-17
-- المشكلة المعالجة: خطأ 42702 (column reference is ambiguous) عند استدعاء RPC
-- ==============================================================================

-- 1. إضافة حقل الرقم القومي لجدول العملاء (مفيد للفاتورة والإيصال الإلكتروني B2C)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS national_id text;

-- ==============================================================================
-- 2. دالة قائمة أرصدة العملاء فائقة السرعة (get_all_customer_balances_fast)
-- ==============================================================================
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
    total_count bigint
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
        v_total_rows AS total_count
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
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ==============================================================================
-- 3. دالة تقرير أعمار ديون العملاء المباشرة (get_customer_aging_ledger)
-- ==============================================================================
DROP FUNCTION IF EXISTS public.get_customer_aging_ledger(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_customer_aging_ledger(p_org_id uuid)
RETURNS TABLE (
    customer_id   uuid,
    customer_name text,
    phone         text,
    range_0_30    numeric,
    range_31_60   numeric,
    range_61_90   numeric,
    range_90_plus numeric,
    total_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH
    -- 1. حساب مراقبة العملاء حصراً (1221 وفروعه فقط، واستبعاد أوراق القبض 1222)
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
    -- 2. خريطة ربط أرقام القيود بالعملاء عبر كل المستندات
    entry_to_customer AS (
        SELECT i.related_journal_entry_id AS je_id, i.customer_id
        FROM public.invoices i
        WHERE i.organization_id = p_org_id 
          AND i.related_journal_entry_id IS NOT NULL 
          AND i.customer_id IS NOT NULL
        UNION ALL
        SELECT ppb.related_journal_entry_id AS je_id, p.customer_id
        FROM public.project_progress_billings ppb
        JOIN public.projects p ON p.id = ppb.project_id
        WHERE ppb.organization_id = p_org_id 
          AND ppb.related_journal_entry_id IS NOT NULL 
          AND p.customer_id IS NOT NULL
        UNION ALL
        SELECT rv.related_journal_entry_id AS je_id, rv.customer_id
        FROM public.receipt_vouchers rv
        WHERE rv.organization_id = p_org_id 
          AND rv.related_journal_entry_id IS NOT NULL 
          AND rv.customer_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, ch.party_id AS customer_id
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id 
          AND ch.related_journal_entry_id IS NOT NULL 
          AND ch.party_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, c.id AS customer_id
        FROM public.cheques ch
        JOIN public.customers c 
          ON c.organization_id = p_org_id 
         AND (
             ch.party_name ILIKE '%' || TRIM(c.name) || '%'
             OR TRIM(c.name) ILIKE '%' || TRIM(ch.party_name) || '%'
         )
        WHERE ch.organization_id = p_org_id 
          AND ch.related_journal_entry_id IS NOT NULL 
          AND (ch.party_id IS NULL OR ch.party_id != c.id)
          AND c.name IS NOT NULL 
          AND LENGTH(TRIM(c.name)) > 1
        UNION ALL
        SELECT cn.related_journal_entry_id AS je_id, cn.customer_id
        FROM public.credit_notes cn
        WHERE cn.organization_id = p_org_id 
          AND cn.related_journal_entry_id IS NOT NULL 
          AND cn.customer_id IS NOT NULL
        UNION ALL
        SELECT sr.related_journal_entry_id AS je_id, sr.customer_id
        FROM public.sales_returns sr
        WHERE sr.organization_id = p_org_id 
          AND sr.related_journal_entry_id IS NOT NULL 
          AND sr.customer_id IS NOT NULL
        UNION ALL
        SELECT o.related_journal_entry_id AS je_id, o.customer_id
        FROM public.orders o
        WHERE o.organization_id = p_org_id 
          AND o.related_journal_entry_id IS NOT NULL 
          AND o.customer_id IS NOT NULL
    ),
    -- 3. القيود اليومية اليدوية والتسويات والشيكات المسجل فيها اسم العميل
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
    -- 4. صافي الرصيد الدفتري لحساب العملاء 1221 حصراً (مطابق 100% لكشف الحساب)
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
    true_balances AS (
        SELECT 
            c.id AS customer_id,
            c.name::text AS customer_name,
            COALESCE(c.phone, '')::text AS phone,
            ROUND(
                COALESCE(lb.net_balance, 0) + 
                CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(c.opening_balance, 0) END +
                COALESCE(uo.unposted_total, 0)
            , 2) AS real_balance,
            CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(c.opening_balance, 0) END AS raw_opening
        FROM public.customers c
        LEFT JOIN ledger_balances lb ON lb.customer_id = c.id
        LEFT JOIN opening_check oc ON oc.customer_id = c.id
        LEFT JOIN unposted_orders uo ON uo.customer_id = c.id
        WHERE c.organization_id = p_org_id
          AND c.deleted_at IS NULL
    ),
    inv_items AS (
        SELECT 
            si.customer_id,
            (CURRENT_DATE - si.invoice_date::date) AS age_days,
            GREATEST(0::numeric, si.total_amount) AS amount
        FROM public.invoices si
        WHERE si.organization_id = p_org_id
          AND si.customer_id IS NOT NULL
          AND si.status NOT IN ('draft', 'cancelled')
    ),
    billing_items AS (
        SELECT 
            p.customer_id,
            (CURRENT_DATE - ppb.billing_date::date) AS age_days,
            GREATEST(0::numeric, ppb.net_amount) AS amount
        FROM public.project_progress_billings ppb
        JOIN public.projects p ON p.id = ppb.project_id
        WHERE ppb.organization_id = p_org_id
          AND p.customer_id IS NOT NULL
          AND ppb.status != 'draft'
    ),
    all_debit_items AS (
        SELECT ii.customer_id, ii.age_days, ii.amount FROM inv_items ii
        UNION ALL
        SELECT bi.customer_id, bi.age_days, bi.amount FROM billing_items bi
    ),
    debit_buckets AS (
        SELECT 
            di.customer_id,
            COALESCE(SUM(CASE WHEN di.age_days <= 30 THEN di.amount ELSE 0 END), 0) AS b_0_30,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 31 AND 60 THEN di.amount ELSE 0 END), 0) AS b_31_60,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 61 AND 90 THEN di.amount ELSE 0 END), 0) AS b_61_90,
            COALESCE(SUM(CASE WHEN di.age_days > 90 THEN di.amount ELSE 0 END), 0) AS b_90_plus,
            COALESCE(SUM(di.amount), 0) AS total_deb
        FROM all_debit_items di
        GROUP BY di.customer_id
    ),
    final_merged AS (
        SELECT 
            tb.customer_id,
            tb.customer_name,
            tb.phone,
            tb.real_balance,
            COALESCE(db.b_0_30, 0) AS raw_0_30,
            COALESCE(db.b_31_60, 0) AS raw_31_60,
            COALESCE(db.b_61_90, 0) AS raw_61_90,
            (COALESCE(db.b_90_plus, 0) + tb.raw_opening) AS raw_90_plus,
            (COALESCE(db.total_deb, 0) + tb.raw_opening) AS total_gross
        FROM true_balances tb
        LEFT JOIN debit_buckets db ON db.customer_id = tb.customer_id
        WHERE tb.real_balance > 0.01
    ),
    scaled AS (
        SELECT 
            fm.customer_id,
            fm.customer_name,
            fm.phone,
            fm.real_balance AS total_balance,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_0_30 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_0_30,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_31_60 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_31_60,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_61_90 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_61_90
        FROM final_merged fm
    )
    SELECT 
        s.customer_id,
        s.customer_name,
        s.phone,
        s.r_0_30 AS range_0_30,
        s.r_31_60 AS range_31_60,
        s.r_61_90 AS range_61_90,
        GREATEST(0::numeric, ROUND(s.total_balance - s.r_0_30 - s.r_31_60 - s.r_61_90, 2)) AS range_90_plus,
        s.total_balance
    FROM scaled s
    ORDER BY s.total_balance DESC;
END;
$$;

-- ==============================================================================
-- 4. دالة تقرير أعمار ديون الموردين المباشرة (get_supplier_aging_ledger)
-- ==============================================================================
DROP FUNCTION IF EXISTS public.get_supplier_aging_ledger(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_supplier_aging_ledger(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (
    supplier_id   uuid,
    supplier_name text,
    phone         text,
    range_0_30    numeric,
    range_31_60   numeric,
    range_61_90   numeric,
    range_90_plus numeric,
    total_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    p_org_id := COALESCE(p_org_id, public.get_my_org());
    IF p_org_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH
    -- 1. حساب مراقبة الموردين حصراً (201 وفروعه و 2101)
    supplier_accounts AS (
        SELECT a.id AS account_id
        FROM public.accounts a
        WHERE (a.organization_id = p_org_id OR a.organization_id IS NULL)
          AND (
              a.code = '201' 
              OR a.code LIKE '201%' 
              OR a.code = '2101'
              OR a.code LIKE '2101%'
              OR (
                  (a.name ILIKE '%الموردين%' OR a.name ILIKE '%موردين%')
                  AND a.name NOT ILIKE '%أوراق%'
                  AND a.name NOT ILIKE '%اوراق%'
                  AND a.code NOT LIKE '202%'
                  AND a.code != '20'
              )
          )
    ),
    -- 2. خريطة ربط القيود بالموردين من الجداول الأساسية المعتمدة فقط
    entry_to_supplier AS (
        SELECT pi.related_journal_entry_id AS je_id, pi.supplier_id
        FROM public.purchase_invoices pi
        WHERE (pi.organization_id = p_org_id OR pi.organization_id IS NULL)
          AND pi.related_journal_entry_id IS NOT NULL 
          AND pi.supplier_id IS NOT NULL
        UNION ALL
        SELECT pv.related_journal_entry_id AS je_id, pv.supplier_id
        FROM public.payment_vouchers pv
        WHERE (pv.organization_id = p_org_id OR pv.organization_id IS NULL)
          AND pv.related_journal_entry_id IS NOT NULL 
          AND pv.supplier_id IS NOT NULL
        UNION ALL
        SELECT pr.related_journal_entry_id AS je_id, pr.supplier_id
        FROM public.purchase_returns pr
        WHERE (pr.organization_id = p_org_id OR pr.organization_id IS NULL)
          AND pr.related_journal_entry_id IS NOT NULL 
          AND pr.supplier_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, ch.party_id AS supplier_id
        FROM public.cheques ch
        WHERE (ch.organization_id = p_org_id OR ch.organization_id IS NULL)
          AND ch.type = 'outgoing'
          AND ch.related_journal_entry_id IS NOT NULL 
          AND ch.party_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, s.id AS supplier_id
        FROM public.cheques ch
        JOIN public.suppliers s 
          ON (s.organization_id = p_org_id OR s.organization_id IS NULL)
         AND (
             ch.party_name ILIKE '%' || TRIM(s.name) || '%'
             OR TRIM(s.name) ILIKE '%' || TRIM(ch.party_name) || '%'
         )
        WHERE (ch.organization_id = p_org_id OR ch.organization_id IS NULL)
          AND ch.type = 'outgoing'
          AND ch.related_journal_entry_id IS NOT NULL 
          AND (ch.party_id IS NULL OR ch.party_id != s.id)
          AND s.name IS NOT NULL 
          AND LENGTH(TRIM(s.name)) > 1
    ),
    manual_entries AS (
        SELECT je.id AS je_id, s.id AS supplier_id
        FROM public.suppliers s
        JOIN public.journal_entries je 
          ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
         AND (
             je.description ILIKE '%' || TRIM(s.name) || '%'
             OR je.reference ILIKE '%' || TRIM(s.name) || '%'
             OR je.reference ILIKE '%OP-SUPP-' || s.id::text || '%'
             OR je.reference ILIKE '%OB-' || s.id::text || '%'
         )
        WHERE s.organization_id = p_org_id
          AND s.deleted_at IS NULL
          AND s.name IS NOT NULL
          AND LENGTH(TRIM(s.name)) > 1
    ),
    all_supplier_entries AS (
        SELECT DISTINCT combined.je_id, combined.supplier_id FROM (
            SELECT ets.je_id, ets.supplier_id FROM entry_to_supplier ets
            UNION ALL
            SELECT me.je_id, me.supplier_id FROM manual_entries me
        ) combined
    ),
    ledger_balances AS (
        SELECT 
            ase.supplier_id,
            COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) AS net_balance
        FROM all_supplier_entries ase
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = ase.je_id
         AND jl.account_id IN (SELECT sa.account_id FROM supplier_accounts sa)
        JOIN public.journal_entries je
          ON je.id = ase.je_id
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
        GROUP BY ase.supplier_id
    ),
    opening_check AS (
        SELECT 
            ase.supplier_id,
            COUNT(*) FILTER (
                WHERE je.description ILIKE '%رصيد افتتاحي%' 
                   OR je.reference ILIKE 'OP-%' 
                   OR je.reference ILIKE 'OB-%'
                   OR je.related_document_type = 'opening_balance'
            ) AS op_count
        FROM all_supplier_entries ase
        JOIN public.journal_entries je ON je.id = ase.je_id
        GROUP BY ase.supplier_id
    ),
    true_balances AS (
        SELECT 
            s.id AS supplier_id,
            s.name::text AS supplier_name,
            COALESCE(s.phone, '')::text AS phone,
            ROUND(
                COALESCE(lb.net_balance, 0) + 
                CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(s.opening_balance, 0) END
            , 2) AS real_balance,
            CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(s.opening_balance, 0) END AS raw_opening
        FROM public.suppliers s
        LEFT JOIN ledger_balances lb ON lb.supplier_id = s.id
        LEFT JOIN opening_check oc ON oc.supplier_id = s.id
        WHERE s.organization_id = p_org_id
          AND s.deleted_at IS NULL
    ),
    inv_items AS (
        SELECT 
            pi.supplier_id,
            (CURRENT_DATE - pi.invoice_date::date) AS age_days,
            GREATEST(0::numeric, pi.total_amount) AS amount
        FROM public.purchase_invoices pi
        WHERE pi.organization_id = p_org_id
          AND pi.supplier_id IS NOT NULL
          AND pi.status NOT IN ('draft', 'cancelled')
    ),
    debit_buckets AS (
        SELECT 
            di.supplier_id,
            COALESCE(SUM(CASE WHEN di.age_days <= 30 THEN di.amount ELSE 0 END), 0) AS b_0_30,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 31 AND 60 THEN di.amount ELSE 0 END), 0) AS b_31_60,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 61 AND 90 THEN di.amount ELSE 0 END), 0) AS b_61_90,
            COALESCE(SUM(CASE WHEN di.age_days > 90 THEN di.amount ELSE 0 END), 0) AS b_90_plus,
            COALESCE(SUM(di.amount), 0) AS total_deb
        FROM inv_items di
        GROUP BY di.supplier_id
    ),
    final_merged AS (
        SELECT 
            tb.supplier_id,
            tb.supplier_name,
            tb.phone,
            tb.real_balance,
            COALESCE(db.b_0_30, 0) AS raw_0_30,
            COALESCE(db.b_31_60, 0) AS raw_31_60,
            COALESCE(db.b_61_90, 0) AS raw_61_90,
            (COALESCE(db.b_90_plus, 0) + tb.raw_opening) AS raw_90_plus,
            (COALESCE(db.total_deb, 0) + tb.raw_opening) AS total_gross
        FROM true_balances tb
        LEFT JOIN debit_buckets db ON db.supplier_id = tb.supplier_id
        WHERE tb.real_balance > 0.01
    ),
    scaled AS (
        SELECT 
            fm.supplier_id,
            fm.supplier_name,
            fm.phone,
            fm.real_balance AS total_balance,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_0_30 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_0_30,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_31_60 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_31_60,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_61_90 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_61_90
        FROM final_merged fm
    )
    SELECT 
        s.supplier_id,
        s.supplier_name,
        s.phone,
        s.r_0_30 AS range_0_30,
        s.r_31_60 AS range_31_60,
        s.r_61_90 AS range_61_90,
        GREATEST(0::numeric, ROUND(s.total_balance - s.r_0_30 - s.r_31_60 - s.r_61_90, 2)) AS range_90_plus,
        s.total_balance
    FROM scaled s
    ORDER BY s.total_balance DESC;
END;
$$;

-- ==============================================================================
-- 5. منح الصلاحيات لجميع الأدوار
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.get_all_customer_balances_fast(uuid, text, int, int) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_aging_ledger(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_aging_ledger(uuid) TO authenticated, service_role, anon;
