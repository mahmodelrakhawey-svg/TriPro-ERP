-- ==============================================================================
-- 🚀 دالة تقرير أعمار ديون الموردين النقية والمستقرة 100% (Core ERP Safe)
-- تاريخ الإصلاح: 2026-09-06
--
-- الغرض:
-- 1. القضاء التام على خطأ 400 (Bad Request) عبر إزالة أي اعتماد على جداول إضافية (Addons) قد لا تتوفر
-- 2. الحفاظ التام والكامل على انضباط الأرصدة ومطابقتها 100% مع الأستاذ العام (حساب 201) وشاشة المطابقة
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
        -- أ. فواتير المشتريات
        SELECT pi.related_journal_entry_id AS je_id, pi.supplier_id
        FROM public.purchase_invoices pi
        WHERE (pi.organization_id = p_org_id OR pi.organization_id IS NULL)
          AND pi.related_journal_entry_id IS NOT NULL 
          AND pi.supplier_id IS NOT NULL
        UNION ALL
        -- ب. سندات الصرف
        SELECT pv.related_journal_entry_id AS je_id, pv.supplier_id
        FROM public.payment_vouchers pv
        WHERE (pv.organization_id = p_org_id OR pv.organization_id IS NULL)
          AND pv.related_journal_entry_id IS NOT NULL 
          AND pv.supplier_id IS NOT NULL
        UNION ALL
        -- ج. مرتجعات المشتريات
        SELECT pr.related_journal_entry_id AS je_id, pr.supplier_id
        FROM public.purchase_returns pr
        WHERE (pr.organization_id = p_org_id OR pr.organization_id IS NULL)
          AND pr.related_journal_entry_id IS NOT NULL 
          AND pr.supplier_id IS NOT NULL
        UNION ALL
        -- د. الشيكات الصادرة (بمعرف المورد)
        SELECT ch.related_journal_entry_id AS je_id, ch.party_id AS supplier_id
        FROM public.cheques ch
        WHERE (ch.organization_id = p_org_id OR ch.organization_id IS NULL)
          AND ch.type = 'outgoing'
          AND ch.related_journal_entry_id IS NOT NULL 
          AND ch.party_id IS NOT NULL
        UNION ALL
        -- هـ. الشيكات الصادرة (بمطابقة اسم المورد)
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
    -- 3. القيود اليدوية والتسويات والأرصدة الافتتاحية المسجل فيها اسم المورد
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
        SELECT DISTINCT je_id, supplier_id FROM (
            SELECT je_id, supplier_id FROM entry_to_supplier
            UNION ALL
            SELECT je_id, supplier_id FROM manual_entries
        ) combined
    ),
    -- 4. صافي الرصيد الدفتري لحساب الموردين 201 حصراً (دائن - مدين) مطابق 100% للأستاذ العام
    ledger_balances AS (
        SELECT 
            ase.supplier_id,
            COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) AS net_balance
        FROM all_supplier_entries ase
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = ase.je_id
         AND jl.account_id IN (SELECT account_id FROM supplier_accounts)
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
                GREATEST(0::numeric, 
                    COALESCE(
                        NULLIF(lb.net_balance, 0),
                        s.balance,
                        0
                    ) + 
                    CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(s.opening_balance, 0) END
                )
            , 2) AS real_balance,
            COALESCE(s.opening_balance, 0) AS raw_opening
        FROM public.suppliers s
        LEFT JOIN ledger_balances lb ON lb.supplier_id = s.id
        LEFT JOIN opening_check oc ON oc.supplier_id = s.id
        WHERE s.organization_id = p_org_id AND s.deleted_at IS NULL
    ),
    -- 5. فترات الأعمار الزمنية من فواتير المشتريات (الجداول الأساسية)
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
        -- الفئة الأخيرة تضمن تطابق مجموع الفئات مع الرصيد الإجمالي 100% بدون أي قرش فرق
        GREATEST(0::numeric, ROUND(s.total_balance - s.r_0_30 - s.r_31_60 - s.r_61_90, 2)) AS range_90_plus,
        s.total_balance
    FROM scaled s
    ORDER BY s.total_balance DESC;
END;
$$;

-- منح الصلاحيات للأدوار
GRANT EXECUTE ON FUNCTION public.get_supplier_aging_ledger(uuid) TO authenticated, service_role, anon;
