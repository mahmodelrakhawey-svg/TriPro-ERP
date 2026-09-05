-- ==============================================================================
-- 🚀 ملف توحيد احتساب أرصدة العملاء والموردين بدفتر الأستاذ العام (Single Source of Truth)
-- تاريخ الإنشاء: 2026-09-05
-- الغرض: القضاء التام على فارق الأرصدة وازدواجية الخصم وتوحيد النتيجة مع كشف الحساب
-- ==============================================================================

-- ==============================================================================
-- 1. دالة تجميع أرصدة العملاء فائقة السرعة والمطابقة التامة لكشف الحساب والأستاذ العام
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_customers_summary_v2(p_org_id uuid)
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
DECLARE
    v_cust_acc_id uuid;
BEGIN
    -- 1. تحديد حساب العملاء الرئيسي للمنظمة (كود 1221 في الدليل المحاسبي المصري)
    SELECT id INTO v_cust_acc_id
    FROM public.accounts
    WHERE organization_id = p_org_id
      AND (code = '1221' OR code = '1103' OR name ILIKE '%العملاء%')
    ORDER BY CASE WHEN code = '1221' THEN 1 WHEN code = '1103' THEN 2 ELSE 3 END
    LIMIT 1;

    RETURN QUERY
    WITH 
    -- 1. خريطة ربط القيود اليومية بالعملاء (مطابقة تامة لكشف الحساب لمنع أي ازدواجية)
    entry_customer_map AS (
        -- فواتير المبيعات
        SELECT i.related_journal_entry_id AS journal_entry_id, i.customer_id
        FROM public.invoices i
        WHERE i.organization_id = p_org_id 
          AND i.related_journal_entry_id IS NOT NULL 
          AND i.customer_id IS NOT NULL
        UNION
        -- سندات القبض
        SELECT rv.related_journal_entry_id, rv.customer_id
        FROM public.receipt_vouchers rv
        WHERE rv.organization_id = p_org_id 
          AND rv.related_journal_entry_id IS NOT NULL 
          AND rv.customer_id IS NOT NULL
        UNION
        -- مردودات المبيعات
        SELECT sr.related_journal_entry_id, sr.customer_id
        FROM public.sales_returns sr
        WHERE sr.organization_id = p_org_id 
          AND sr.related_journal_entry_id IS NOT NULL 
          AND sr.customer_id IS NOT NULL
        UNION
        -- الإشعارات الدائنة
        SELECT cn.related_journal_entry_id, cn.customer_id
        FROM public.credit_notes cn
        WHERE cn.organization_id = p_org_id 
          AND cn.related_journal_entry_id IS NOT NULL 
          AND cn.customer_id IS NOT NULL
        UNION
        -- الشيكات الواردة
        SELECT ch.related_journal_entry_id, ch.party_id AS customer_id
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id 
          AND ch.related_journal_entry_id IS NOT NULL 
          AND ch.party_id IS NOT NULL
        UNION
        -- طلبات المطاعم ونقاط البيع
        SELECT ord.related_journal_entry_id, ord.customer_id
        FROM public.orders ord
        WHERE ord.organization_id = p_org_id 
          AND ord.related_journal_entry_id IS NOT NULL 
          AND ord.customer_id IS NOT NULL
        UNION
        -- مستخلصات المشاريع
        SELECT pb.related_journal_entry_id, p.customer_id
        FROM public.project_progress_billings pb
        JOIN public.projects p ON p.id = pb.project_id
        WHERE pb.organization_id = p_org_id 
          AND pb.related_journal_entry_id IS NOT NULL 
          AND p.customer_id IS NOT NULL
        UNION
        -- القيود اليدوية المرتبطة بالعميل (بالمعرف أو بالاسم في البيان أو بالمرجع)
        SELECT je.id AS journal_entry_id, c.id AS customer_id
        FROM public.journal_entries je
        JOIN public.customers c ON c.organization_id = p_org_id AND c.deleted_at IS NULL
        WHERE je.organization_id = p_org_id 
          AND je.status = 'posted'
          AND (
              je.related_document_id = c.id
              OR je.description ILIKE '%' || c.name || '%'
              OR je.reference ILIKE '%' || c.id::text || '%'
          )
    ),
    -- 2. تجميع قيود الأستاذ العام لحساب العملاء (مدين - دائن)
    gl_summary AS (
        SELECT 
            m.customer_id,
            COALESCE(SUM(jl.debit - jl.credit), 0) AS gl_movement,
            BOOL_OR(
                je.reference ILIKE 'OP-CUST-%' 
                OR je.reference ILIKE 'OB-%' 
                OR je.description ILIKE '%رصيد افتتاحي%'
            ) AS has_opening_entry
        FROM entry_customer_map m
        JOIN public.journal_lines jl ON jl.journal_entry_id = m.journal_entry_id
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
        WHERE (v_cust_acc_id IS NULL OR jl.account_id = v_cust_acc_id)
          AND jl.organization_id = p_org_id
        GROUP BY m.customer_id
    ),
    -- 3. مبيعات المطاعم غير المرحلة (طلبات لم ينشأ لها قيد بعد)
    unposted_orders AS (
        SELECT 
            o.customer_id,
            COALESCE(SUM(o.grand_total), 0) AS unposted_sales
        FROM public.orders o
        WHERE o.organization_id = p_org_id 
          AND o.related_journal_entry_id IS NULL
          AND o.status != 'CANCELLED'
        GROUP BY o.customer_id
    ),
    -- 4. إجمالي مبيعات الفواتير وآخر تاريخ فاتورة
    inv_summary AS (
        SELECT 
            i.customer_id,
            COALESCE(SUM(i.total_amount), 0) AS total_sales,
            MAX(i.invoice_date::text) AS max_invoice_date
        FROM public.invoices i
        WHERE i.organization_id = p_org_id 
          AND (i.status IS NULL OR i.status NOT IN ('draft', 'cancelled'))
        GROUP BY i.customer_id
    )
    SELECT 
        c.id AS customer_id,
        COALESCE(
            ROUND(
                -- إذا كان هناك قيد افتتاحي مسجل بالأستاذ العام نبدأ من 0، وإلا نستخدم opening_balance للعميل
                CASE WHEN COALESCE(gl.has_opening_entry, false) THEN 0 ELSE COALESCE(c.opening_balance, 0) END
                + COALESCE(gl.gl_movement, 0)
                + COALESCE(uo.unposted_sales, 0)
            , 2),
            0
        ) AS balance,
        COALESCE(ROUND(inv.total_sales, 2), 0) AS total_sales,
        inv.max_invoice_date AS last_invoice
    FROM public.customers c
    LEFT JOIN gl_summary gl ON gl.customer_id = c.id
    LEFT JOIN unposted_orders uo ON uo.customer_id = c.id
    LEFT JOIN inv_summary inv ON inv.customer_id = c.id
    WHERE c.organization_id = p_org_id
      AND (c.deleted_at IS NULL);
END;
$$;

-- تحديث دالة get_customers_summary القديمة لتعود بنفس النتيجة الموحدة
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
    RETURN QUERY SELECT * FROM public.get_customers_summary_v2(p_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customers_summary_v2(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_customers_summary(uuid) TO authenticated, service_role, anon;

-- ==============================================================================
-- 2. دالة تجميع أرصدة الموردين فائقة السرعة والمطابقة التامة لكشف الحساب والأستاذ العام
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_suppliers_summary_v2(p_org_id uuid)
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
DECLARE
    v_supp_acc_id uuid;
BEGIN
    -- 1. تحديد حساب الموردين الرئيسي للمنظمة (كود 201 في دليل TriPro-ERP وكافة بدائله المعيارية مع استبعاد القروض)
    SELECT id INTO v_supp_acc_id
    FROM public.accounts
    WHERE organization_id = p_org_id
      AND (
          code = '201' 
          OR code = '20101' 
          OR code = '2101' 
          OR code = '2201' 
          OR code = '2111' 
          OR name ILIKE '%الموردين%' 
          OR name ILIKE '%موردين%'
      )
      AND name NOT ILIKE '%قروض%'
      AND code NOT IN ('211', '2110', '21101') -- 🛡️ استبعاد صريح لحساب القروض طويلة الأجل
    ORDER BY 
      CASE 
        WHEN code = '201' THEN 1 
        WHEN code = '20101' THEN 2 
        WHEN code = '2101' THEN 3 
        WHEN code = '2201' THEN 4 
        WHEN code = '2111' THEN 5 
        WHEN name ILIKE '%الموردين%' THEN 6 
        ELSE 7 
      END
    LIMIT 1;

    RETURN QUERY
    WITH 
    -- 1. خريطة ربط القيود بالموردين
    entry_supplier_map AS (
        -- فواتير المشتريات المرتبطة بمعرف القيد
        SELECT pi.related_journal_entry_id AS journal_entry_id, pi.supplier_id
        FROM public.purchase_invoices pi
        WHERE pi.organization_id = p_org_id 
          AND pi.related_journal_entry_id IS NOT NULL 
          AND pi.supplier_id IS NOT NULL
        UNION
        -- فواتير المشتريات المرتبطة برقم الفاتورة في المرجع (كاحتياط أمان)
        SELECT je.id AS journal_entry_id, pi.supplier_id
        FROM public.purchase_invoices pi
        JOIN public.journal_entries je ON je.organization_id = p_org_id AND je.reference = pi.invoice_number AND je.status = 'posted'
        WHERE pi.organization_id = p_org_id 
          AND pi.supplier_id IS NOT NULL
        UNION
        -- سندات الصرف المرتبطة بمعرف القيد
        SELECT pv.related_journal_entry_id, pv.supplier_id
        FROM public.payment_vouchers pv
        WHERE pv.organization_id = p_org_id 
          AND pv.related_journal_entry_id IS NOT NULL 
          AND pv.supplier_id IS NOT NULL
        UNION
        -- سندات الصرف المرتبطة برقم السند في المرجع
        SELECT je.id AS journal_entry_id, pv.supplier_id
        FROM public.payment_vouchers pv
        JOIN public.journal_entries je ON je.organization_id = p_org_id AND je.reference = pv.voucher_number AND je.status = 'posted'
        WHERE pv.organization_id = p_org_id 
          AND pv.supplier_id IS NOT NULL
        UNION
        -- مردودات المشتريات
        SELECT pr.related_journal_entry_id, pr.supplier_id
        FROM public.purchase_returns pr
        WHERE pr.organization_id = p_org_id 
          AND pr.related_journal_entry_id IS NOT NULL 
          AND pr.supplier_id IS NOT NULL
        UNION
        -- الإشعارات المدينة
        SELECT dn.related_journal_entry_id, dn.supplier_id
        FROM public.debit_notes dn
        WHERE dn.organization_id = p_org_id 
          AND dn.related_journal_entry_id IS NOT NULL 
          AND dn.supplier_id IS NOT NULL
        UNION
        -- الشيكات الصادرة
        SELECT ch.related_journal_entry_id, ch.party_id AS supplier_id
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id 
          AND ch.related_journal_entry_id IS NOT NULL 
          AND ch.party_id IS NOT NULL
        UNION
        -- مستخلصات مقاولي الباطن
        SELECT sb.related_journal_entry_id, sc.subcontractor_id AS supplier_id
        FROM public.subcontractor_billings sb
        JOIN public.subcontractor_contracts sc ON sc.id = sb.contract_id
        WHERE sb.organization_id = p_org_id 
          AND sb.related_journal_entry_id IS NOT NULL 
          AND sc.subcontractor_id IS NOT NULL
        UNION
        -- القيود اليدوية المرتبطة بالمورد (بالمعرف أو بالاسم في البيان أو بالمرجع)
        SELECT je.id AS journal_entry_id, s.id AS supplier_id
        FROM public.journal_entries je
        JOIN public.suppliers s ON s.organization_id = p_org_id AND s.deleted_at IS NULL
        WHERE je.organization_id = p_org_id 
          AND je.status = 'posted'
          AND (
              je.related_document_id = s.id
              OR je.description ILIKE '%' || s.name || '%'
              OR je.reference ILIKE '%' || s.id::text || '%'
          )
    ),
    -- 2. تجميع قيود الأستاذ العام لحساب الموردين (دائن - مدين) لأن حساب المورد دائن بطبيعته
    gl_summary AS (
        SELECT 
            m.supplier_id,
            COALESCE(SUM(jl.credit - jl.debit), 0) AS gl_movement,
            BOOL_OR(
                je.reference ILIKE 'OP-SUPP-%' 
                OR je.reference ILIKE 'OB-%' 
                OR je.description ILIKE '%رصيد افتتاحي%'
            ) AS has_opening_entry
        FROM entry_supplier_map m
        JOIN public.journal_lines jl ON jl.journal_entry_id = m.journal_entry_id
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
        WHERE (
            (v_supp_acc_id IS NOT NULL AND jl.account_id = v_supp_acc_id)
            OR (v_supp_acc_id IS NULL AND jl.account_id IN (
                SELECT a.id FROM public.accounts a 
                WHERE a.organization_id = p_org_id 
                  AND (a.code LIKE '201%' OR a.code LIKE '2101%' OR a.code LIKE '2201%' OR a.name ILIKE '%مورد%')
                  AND a.name NOT ILIKE '%قروض%'
                  AND a.code NOT IN ('211', '2110')
            ))
        )
        AND jl.organization_id = p_org_id
        GROUP BY m.supplier_id
    ),
    -- 3. إجمالي مشتريات الفواتير وآخر تاريخ فاتورة
    pinv_summary AS (
        SELECT 
            pi.supplier_id,
            COALESCE(SUM(pi.total_amount), 0) AS total_purchases,
            MAX(pi.invoice_date::text) AS max_invoice_date
        FROM public.purchase_invoices pi
        WHERE pi.organization_id = p_org_id 
          AND (pi.status IS NULL OR pi.status NOT IN ('draft', 'cancelled'))
        GROUP BY pi.supplier_id
    )
    SELECT 
        s.id AS supplier_id,
        COALESCE(
            ROUND(
                CASE WHEN COALESCE(gl.has_opening_entry, false) THEN 0 ELSE COALESCE(s.opening_balance, 0) END
                + COALESCE(gl.gl_movement, 0)
            , 2),
            0
        ) AS balance,
        COALESCE(ROUND(pinv.total_purchases, 2), 0) AS total_purchases,
        pinv.max_invoice_date AS last_invoice
    FROM public.suppliers s
    LEFT JOIN gl_summary gl ON gl.supplier_id = s.id
    LEFT JOIN pinv_summary pinv ON pinv.supplier_id = s.id
    WHERE s.organization_id = p_org_id
      AND (s.deleted_at IS NULL);
END;
$$;

-- تحديث دالة get_suppliers_summary القديمة لتعود بنفس النتيجة الموحدة
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
    RETURN QUERY SELECT * FROM public.get_suppliers_summary_v2(p_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_suppliers_summary_v2(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_suppliers_summary(uuid) TO authenticated, service_role, anon;
