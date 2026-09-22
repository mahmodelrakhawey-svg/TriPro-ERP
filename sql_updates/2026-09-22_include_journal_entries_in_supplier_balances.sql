-- ==============================================================================
-- TriPro ERP - تحديث محرك أرصدة الموردين ليشمل قيود اليومية اليدوية والافتتاحية
-- تاريخ التحديث: 2026-09-22
-- المشكلة المعالجة: عدم ظهور حركات قيود اليومية في رصيد المورد داخل فاتورة المشتريات
-- وبجوار اسم المورد في كشف الحساب وشاشات المشتريات الأخرى
-- ==============================================================================

-- 1. تحديث دالة جلب أرصدة الموردين فائقة السرعة (get_all_supplier_balances_fast)
-- ==============================================================================
DROP FUNCTION IF EXISTS public.get_all_supplier_balances_fast(uuid, text, int, int) CASCADE;

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
#variable_conflict use_column
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
    -- أ. حسابات الموردين في شجرة الحسابات (201 / 221 / 2101 / الموردين)
    supplier_accounts AS (
        SELECT a.id AS account_id
        FROM public.accounts a
        WHERE (a.organization_id = p_org_id OR a.organization_id IS NULL)
          AND (
              a.code = '201' 
              OR a.code LIKE '201%' 
              OR a.code = '2101'
              OR a.code LIKE '2101%'
              OR a.code = '221'
              OR a.code LIKE '221%'
              OR (
                  (a.name ILIKE '%الموردين%' OR a.name ILIKE '%موردين%')
                  AND a.name NOT ILIKE '%أوراق%'
                  AND a.name NOT ILIKE '%اوراق%'
                  AND a.code NOT LIKE '202%'
                  AND a.code != '20'
              )
          )
    ),
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
            COALESCE(SUM(asb.total_sub_billings), 0) AS contract_billings
        FROM public.suppliers s
        JOIN public.subcontractors sub ON sub.organization_id = p_org_id 
          AND (sub.supplier_id = s.id OR TRIM(LOWER(sub.name)) = TRIM(LOWER(s.name)) OR sub.id::text = s.id::text)
        JOIN agg_sub_billings asb ON asb.subcontractor_id = sub.id
        WHERE s.organization_id = p_org_id
        GROUP BY s.id
    ),
    -- 8. تجميع قيود اليومية اليدوية والتسويات المؤثرة على حسابات الموردين
    manual_entries AS (
        SELECT 
            s.id AS supplier_id,
            COALESCE(SUM(jl.credit), 0) AS manual_credit,
            COALESCE(SUM(jl.debit), 0) AS manual_debit
        FROM public.suppliers s
        JOIN public.journal_entries je 
          ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
         AND (
             je.related_document_id = s.id
             OR je.description ILIKE '%' || TRIM(s.name) || '%'
             OR je.reference ILIKE '%' || TRIM(s.name) || '%'
         )
         -- استبعاد القيود المتولدة تلقائياً عن المستندات الأساسية لمنع الازدواج
         AND (je.related_document_type IS NULL OR je.related_document_type NOT IN ('purchase_invoice', 'payment_voucher', 'purchase_return', 'debit_note', 'cheque'))
         AND (je.reference IS NULL OR (
             je.reference NOT LIKE 'PINV-%' 
             AND je.reference NOT LIKE 'PUR-%' 
             AND je.reference NOT LIKE 'PV-%' 
             AND je.reference NOT LIKE 'PR-%' 
             AND je.reference NOT LIKE 'DN-%' 
             AND je.reference NOT LIKE 'CHQ-%'
             AND je.reference NOT LIKE 'OP-%'
             AND je.reference NOT LIKE 'OB-%'
         ))
         AND (je.description IS NULL OR je.description NOT ILIKE '%رصيد افتتاحي%')
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = je.id
         AND jl.account_id IN (SELECT sa.account_id FROM supplier_accounts sa)
        WHERE s.organization_id = p_org_id
          AND s.deleted_at IS NULL
          AND s.name IS NOT NULL
          AND LENGTH(TRIM(s.name)) > 1
        GROUP BY s.id
    ),
    -- 9. فحص القيود الافتتاحية للموردين المسجلة في دفتر اليومية
    opening_check AS (
        SELECT 
            s.id AS supplier_id,
            COUNT(*) AS op_count,
            COALESCE(SUM(jl.credit - jl.debit), 0) AS op_amount
        FROM public.suppliers s
        JOIN public.journal_entries je 
          ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
         AND (
             je.related_document_id = s.id
             OR je.description ILIKE '%' || TRIM(s.name) || '%'
             OR je.reference ILIKE '%' || TRIM(s.name) || '%'
         )
         AND (
             je.description ILIKE '%رصيد افتتاحي%' 
             OR je.reference ILIKE 'OP-%' 
             OR je.reference ILIKE 'OB-%'
             OR je.related_document_type = 'opening_balance'
         )
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = je.id
         AND jl.account_id IN (SELECT sa.account_id FROM supplier_accounts sa)
        WHERE s.organization_id = p_org_id
          AND s.deleted_at IS NULL
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
            (CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN COALESCE(oc.op_amount, 0) ELSE COALESCE(s.opening_balance, 0) END)
            + COALESCE(inv.total_invoiced, 0)
            + COALESCE(sm.contract_billings, 0)
            + COALESCE(me.manual_credit, 0)
            - COALESCE(me.manual_debit, 0)
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
    LEFT JOIN manual_entries me ON me.supplier_id = s.id
    LEFT JOIN opening_check oc ON oc.supplier_id = s.id
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
-- 2. تحديث دالة حساب رصيد المورد الفردي (get_supplier_balance)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_supplier_name         TEXT := '';
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;
    v_immediate_payments    NUMERIC := 0;
    v_sub_billings          NUMERIC := 0;
    v_payments              NUMERIC := 0;
    v_cheques               NUMERIC := 0;
    v_returns               NUMERIC := 0;
    v_debit_notes           NUMERIC := 0;
    v_manual_credit         NUMERIC := 0;
    v_manual_debit          NUMERIC := 0;
    v_has_op_journal        BOOLEAN := false;
    v_op_journal_amount     NUMERIC := 0;
BEGIN
    -- أ. جلب بيانات بطاقة المورد
    SELECT COALESCE(opening_balance, 0), COALESCE(name, '')
      INTO v_opening_balance, v_supplier_name
      FROM public.suppliers
     WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير المشتريات المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المسددة فوراً من داخل فواتير المشتريات
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مقاولي الباطن
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subcontractor_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'supplier_id'
    ) THEN
        SELECT COALESCE(SUM(sb.net_amount), 0)
          INTO v_sub_billings
          FROM public.subcontractor_billings sb
          JOIN public.subcontractor_contracts sc ON (sb.contract_id = sc.id)
          JOIN public.subcontractors s ON sc.subcontractor_id = s.id
         WHERE s.supplier_id = p_supplier_id
           AND sb.organization_id = p_org_id
           AND sb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات الصرف المستقلة (غير الشيكات)
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- و. الشيكات الصادرة غير المرفوضة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cheques'
    ) THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE party_id = p_supplier_id
           AND organization_id = p_org_id
           AND type = 'outgoing'
           AND status != 'rejected';
    END IF;

    -- ز. مرتجعات المشتريات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات المدينة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'debit_notes'
    ) THEN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_debit_notes
          FROM public.debit_notes
         WHERE supplier_id = p_supplier_id
           AND organization_id = p_org_id
           AND status = 'posted';
    END IF;

    -- ط. فحص قيود الرصيد الافتتاحي في اليومية
    SELECT 
        COUNT(*) > 0,
        COALESCE(SUM(jl.credit - jl.debit), 0)
      INTO v_has_op_journal, v_op_journal_amount
      FROM public.journal_entries je
      JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
      JOIN public.accounts a ON a.id = jl.account_id
     WHERE (je.organization_id = p_org_id OR je.organization_id IS NULL)
       AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
       AND (
           je.related_document_id = p_supplier_id
           OR (v_supplier_name != '' AND (je.description ILIKE '%' || TRIM(v_supplier_name) || '%' OR je.reference ILIKE '%' || TRIM(v_supplier_name) || '%'))
       )
       AND (
           je.description ILIKE '%رصيد افتتاحي%' 
           OR je.reference ILIKE 'OP-%' 
           OR je.reference ILIKE 'OB-%'
           OR je.related_document_type = 'opening_balance'
       )
       AND (
           a.code = '201' OR a.code LIKE '201%' OR a.code = '2101' OR a.code LIKE '2101%' 
           OR a.code = '221' OR a.code LIKE '221%' OR a.name ILIKE '%الموردين%' OR a.name ILIKE '%موردين%'
       );

    -- ي. قيود اليومية اليدوية والتسويات المؤثرة على حساب المورد
    SELECT 
        COALESCE(SUM(jl.credit), 0),
        COALESCE(SUM(jl.debit), 0)
      INTO v_manual_credit, v_manual_debit
      FROM public.journal_entries je
      JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
      JOIN public.accounts a ON a.id = jl.account_id
     WHERE (je.organization_id = p_org_id OR je.organization_id IS NULL)
       AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
       AND (
           je.related_document_id = p_supplier_id
           OR (v_supplier_name != '' AND (je.description ILIKE '%' || TRIM(v_supplier_name) || '%' OR je.reference ILIKE '%' || TRIM(v_supplier_name) || '%'))
       )
       AND (je.related_document_type IS NULL OR je.related_document_type NOT IN ('purchase_invoice', 'payment_voucher', 'purchase_return', 'debit_note', 'cheque'))
       AND (je.reference IS NULL OR (
           je.reference NOT LIKE 'PINV-%' 
           AND je.reference NOT LIKE 'PUR-%' 
           AND je.reference NOT LIKE 'PV-%' 
           AND je.reference NOT LIKE 'PR-%' 
           AND je.reference NOT LIKE 'DN-%' 
           AND je.reference NOT LIKE 'CHQ-%'
           AND je.reference NOT LIKE 'OP-%'
           AND je.reference NOT LIKE 'OB-%'
       ))
       AND (je.description IS NULL OR je.description NOT ILIKE '%رصيد افتتاحي%')
       AND (
           a.code = '201' OR a.code LIKE '201%' OR a.code = '2101' OR a.code LIKE '2101%' 
           OR a.code = '221' OR a.code LIKE '221%' OR a.name ILIKE '%الموردين%' OR a.name ILIKE '%موردين%'
       );

    -- ك. المعادلة المحاسبية الشاملة
    RETURN (CASE WHEN v_has_op_journal THEN v_op_journal_amount ELSE v_opening_balance END)
         + v_gross_invoices 
         + v_sub_billings 
         + v_manual_credit
         - (v_immediate_payments + v_payments + v_cheques + v_returns + v_debit_notes + v_manual_debit);
END;
$$;


-- ==============================================================================
-- 3. تحديث دالة إعادة احتساب أرصدة النظام (recalculate_all_balances)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_org_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RETURN; END IF;

    -- أ. تحديث أرصدة الحسابات في الأستاذ العام
    UPDATE public.accounts a
       SET balance = (
           SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
             FROM public.journal_lines jl
             JOIN public.journal_entries je ON jl.journal_entry_id = je.id
            WHERE jl.account_id = a.id
              AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
              AND je.organization_id = v_org_id
       )
     WHERE a.organization_id = v_org_id;

    -- ب. تحديث أرصدة العملاء
    UPDATE public.customers c
       SET balance = public.get_customer_balance(c.id, v_org_id)
     WHERE c.organization_id = v_org_id
       AND c.deleted_at IS NULL;

    -- ج. تحديث أرصدة الموردين بالمنطق المحاسبي الشامل (المطابق 100% لكشف الحساب واليومية)
    UPDATE public.suppliers s
       SET balance = public.get_supplier_balance(s.id, v_org_id)
     WHERE s.organization_id = v_org_id
       AND s.deleted_at IS NULL;

    -- د. إعادة حساب المخزون
    BEGIN
        PERFORM public.recalculate_stock_rpc(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END;
$$;

-- دالة مرادفة لتوافق الاستدعاءات
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.recalculate_all_balances(p_org_id);
END;
$$;


-- ==============================================================================
-- 4. منح الصلاحيات
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid, text, int, int) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_all_balances(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
