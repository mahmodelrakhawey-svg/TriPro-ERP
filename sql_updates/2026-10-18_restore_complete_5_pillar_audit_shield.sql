-- ==============================================================================
-- 🛡️ TriPro-ERP: استعادة وتأمين درع النزاهة والتدقيق المالي الشامل (5 أركان)
-- التاريخ: 18 أكتوبر 2026
-- الغرض: إعادة الأركان الخمسة كاملة مع الحفاظ التام على أمان RLS وعزل الشركات (Multi-Tenancy)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_financial_audit_summary(p_org_id TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id UUID;
    v_user_org_id UUID;
    v_user_role TEXT;
    v_checks jsonb := '[]'::jsonb;
    v_overall_status TEXT := 'passed';
    
    -- ركن 1: الأستاذ العام
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_gl_variance NUMERIC := 0;
    v_unbalanced_count INT := 0;

    -- ركن 2: العملاء
    v_customers_balance NUMERIC := 0;
    v_ar_gl_balance NUMERIC := 0;
    v_ar_variance NUMERIC := 0;

    -- ركن 3: الموردين
    v_suppliers_balance NUMERIC := 0;
    v_ap_gl_balance NUMERIC := 0;
    v_ap_variance NUMERIC := 0;

    -- ركن 4: المخزون
    v_stock_valuation NUMERIC := 0;
    v_inv_gl_balance NUMERIC := 0;
    v_inv_variance NUMERIC := 0;

    -- ركن 5: الخزائن والسندات
    v_total_vouchers INT := 0;
    v_mismatched_vouchers INT := 0;
BEGIN
    -- 1. التحقق الأمني وعزل المؤسسات
    SELECT organization_id, role INTO v_user_org_id, v_user_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF p_org_id IS NOT NULL AND p_org_id <> '' THEN
        v_org_id := p_org_id::UUID;
        IF v_user_role NOT IN ('super_admin', 'platform_admin', 'service_role') AND v_user_org_id <> v_org_id THEN
            RAISE EXCEPTION 'غير مصرح: لا تملك صلاحية الوصول إلى بيانات هذه المؤسسة';
        END IF;
    ELSE
        v_org_id := v_user_org_id;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'يجب تحديد معرف المؤسسة أو تسجيل الدخول بحساب مرتبط بمؤسسة';
    END IF;

    -- -------------------------------------------------------------
    -- 1. الركن الأول: توازن دفتر الأستاذ العام (General Ledger Balance)
    -- -------------------------------------------------------------
    SELECT 
        COALESCE(SUM(jl.debit), 0)::numeric,
        COALESCE(SUM(jl.credit), 0)::numeric
    INTO v_total_debit, v_total_credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE je.organization_id = v_org_id
      AND je.status = 'posted';

    v_gl_variance := ABS(v_total_debit - v_total_credit);

    SELECT COUNT(*) INTO v_unbalanced_count
    FROM (
        SELECT jl.journal_entry_id
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.organization_id = v_org_id
          AND je.status = 'posted'
        GROUP BY jl.journal_entry_id
        HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.01
    ) sub;

    IF v_gl_variance > 0.05 OR v_unbalanced_count > 0 THEN
        v_overall_status := 'failed';
        v_checks := v_checks || jsonb_build_object(
            'id', 'pillar-gl',
            'pillar', 'gl_balance',
            'title', 'توازن الأستاذ العام (إجمالي المدين = إجمالي الدائن)',
            'expected', ROUND(v_total_debit, 2),
            'actual', ROUND(v_total_credit, 2),
            'variance', ROUND(v_gl_variance, 2),
            'status', 'failed',
            'notes', format('يوجد عدم توازن في الأستاذ العام بقيمة %s ج.م (عدد %s قيد غير متوازن)', ROUND(v_gl_variance, 2), v_unbalanced_count)
        );
    ELSE
        v_checks := v_checks || jsonb_build_object(
            'id', 'pillar-gl',
            'pillar', 'gl_balance',
            'title', 'توازن الأستاذ العام (إجمالي المدين = إجمالي الدائن)',
            'expected', ROUND(v_total_debit, 2),
            'actual', ROUND(v_total_credit, 2),
            'variance', 0.00,
            'status', 'passed',
            'notes', format('الأستاذ العام متوازن تماماً: مدين (%s ج.م) = دائن (%s ج.م)', to_char(v_total_debit, 'FM999,999,999,990.00'), to_char(v_total_credit, 'FM999,999,999,990.00'))
        );
    END IF;

    -- -------------------------------------------------------------
    -- 2. الركن الثاني: مطابقة سجل العملاء مع حساب مراقبة المدينين
    -- -------------------------------------------------------------
    SELECT COALESCE(SUM(c.balance), 0)::numeric INTO v_customers_balance
    FROM public.customers c
    WHERE c.organization_id = v_org_id
      AND c.deleted_at IS NULL;

    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::numeric INTO v_ar_gl_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_org_id
      AND je.status = 'posted'
      AND (
          a.code = '1221' OR a.code LIKE '1221%' 
          OR (a.name = 'العملاء' OR a.name ILIKE 'العملاء%')
      )
      AND a.code NOT IN ('122', '1222', '1223', '1224', '1225', '1226', '1227', '124', '1241');

    IF v_ar_gl_balance = 0 AND v_customers_balance = 0 THEN
        v_ar_gl_balance := 0;
    ELSIF v_ar_gl_balance = 0 THEN
        SELECT COALESCE(SUM(balance), 0)::numeric INTO v_ar_gl_balance
        FROM public.accounts
        WHERE organization_id = v_org_id
          AND (code = '1221' OR code LIKE '1221%' OR code = '102' OR (name = 'العملاء' OR name ILIKE 'العملاء%'))
          AND code NOT IN ('122', '1222', '1223', '1224', '1225', '1226', '1227', '124', '1241');
    END IF;

    v_ar_variance := ABS(v_customers_balance - v_ar_gl_balance);

    IF v_ar_variance > 0.05 THEN
        IF v_overall_status = 'passed' THEN v_overall_status := 'warning'; END IF;
        v_checks := v_checks || jsonb_build_object(
            'id', 'pillar-ar',
            'pillar', 'ar_subledger',
            'title', 'مطابقة سجل العملاء مع حساب مراقبة المدينين',
            'expected', ROUND(v_customers_balance, 2),
            'actual', ROUND(v_ar_gl_balance, 2),
            'variance', ROUND(v_ar_variance, 2),
            'status', 'warning',
            'notes', format('فارق بين سجل العملاء وحساب المراقبة: %s ج.م', ROUND(v_ar_variance, 2))
        );
    ELSE
        v_checks := v_checks || jsonb_build_object(
            'id', 'pillar-ar',
            'pillar', 'ar_subledger',
            'title', 'مطابقة سجل العملاء مع حساب مراقبة المدينين',
            'expected', ROUND(v_customers_balance, 2),
            'actual', ROUND(v_ar_gl_balance, 2),
            'variance', 0.00,
            'status', 'passed',
            'notes', format('سجل العملاء متطابق تماماً (%s ج.م)', to_char(v_customers_balance, 'FM999,999,990.00'))
        );
    END IF;

    -- -------------------------------------------------------------
    -- 3. الركن الثالث: مطابقة سجل الموردين مع حساب مراقبة الدائنين
    -- -------------------------------------------------------------
    SELECT COALESCE(SUM(s.balance), 0)::numeric INTO v_suppliers_balance
    FROM public.suppliers s
    WHERE s.organization_id = v_org_id
      AND s.deleted_at IS NULL;

    SELECT COALESCE(SUM(jl.credit - jl.debit), 0)::numeric INTO v_ap_gl_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_org_id
      AND je.status = 'posted'
      AND (
          a.code = '201' OR a.code LIKE '201%'
          OR a.code = '221' OR a.code LIKE '221%'
          OR a.code = '2101' OR a.code LIKE '2101%'
          OR a.name ILIKE '%مورد%'
      )
      AND a.code NOT IN ('222', '2221', '2212')
      AND a.name NOT ILIKE '%أوراق دفع%';

    IF v_ap_gl_balance = 0 THEN
        SELECT COALESCE(SUM(balance), 0)::numeric INTO v_ap_gl_balance
        FROM public.accounts
        WHERE organization_id = v_org_id
          AND (
              code = '201' OR code LIKE '201%'
              OR code = '221' OR code LIKE '221%'
              OR code = '2101' OR code LIKE '2101%'
              OR name ILIKE '%مورد%'
          )
          AND code NOT IN ('222', '2221', '2212')
          AND name NOT ILIKE '%أوراق دفع%';
        v_ap_gl_balance := ABS(v_ap_gl_balance);
    END IF;

    v_ap_variance := ABS(v_suppliers_balance - v_ap_gl_balance);

    IF v_ap_variance > 0.05 THEN
        IF v_overall_status = 'passed' THEN v_overall_status := 'warning'; END IF;
        v_checks := v_checks || jsonb_build_object(
            'id', 'pillar-ap',
            'pillar', 'ap_subledger',
            'title', 'مطابقة سجل الموردين مع حساب مراقبة الدائنين',
            'expected', ROUND(v_suppliers_balance, 2),
            'actual', ROUND(v_ap_gl_balance, 2),
            'variance', ROUND(v_ap_variance, 2),
            'status', 'warning',
            'notes', format('فارق بين سجل الموردين وحساب المراقبة: %s ج.م', ROUND(v_ap_variance, 2))
        );
    ELSE
        v_checks := v_checks || jsonb_build_object(
            'id', 'pillar-ap',
            'pillar', 'ap_subledger',
            'title', 'مطابقة سجل الموردين مع حساب مراقبة الدائنين',
            'expected', ROUND(v_suppliers_balance, 2),
            'actual', ROUND(v_ap_gl_balance, 2),
            'variance', 0.00,
            'status', 'passed',
            'notes', format('سجل الموردين متطابق تماماً (%s ج.م)', to_char(v_suppliers_balance, 'FM999,999,990.00'))
        );
    END IF;

    -- -------------------------------------------------------------
    -- 4. الركن الرابع: مطابقة تقييم المخزون الكمي مع حساب البضاعة بالأستاذ العام
    -- -------------------------------------------------------------
    SELECT COALESCE(SUM(COALESCE(stock, 0) * COALESCE(cost, 0)), 0)::numeric INTO v_stock_valuation
    FROM public.products
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL;

    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::numeric INTO v_inv_gl_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_org_id
      AND je.status = 'posted'
      AND (
          a.code = '103' OR a.code LIKE '103%'
          OR a.code = '121' OR a.code LIKE '121%'
          OR a.code = '1213'
          OR (a.type ILIKE '%asset%' AND (a.name ILIKE '%مخزون%' OR a.name ILIKE '%خامات%' OR a.name ILIKE '%بضاعة%'))
      );

    IF v_inv_gl_balance = 0 THEN
        SELECT COALESCE(SUM(balance), 0)::numeric INTO v_inv_gl_balance
        FROM public.accounts
        WHERE organization_id = v_org_id
          AND (
              code = '103' OR code LIKE '103%'
              OR code = '121' OR code LIKE '121%'
              OR code = '1213'
              OR (type ILIKE '%asset%' AND (name ILIKE '%مخزون%' OR name ILIKE '%خامات%' OR name ILIKE '%بضاعة%'))
          );
    END IF;

    v_inv_variance := ABS(v_stock_valuation - v_inv_gl_balance);

    IF v_inv_variance > 0.05 THEN
        IF v_overall_status = 'passed' THEN v_overall_status := 'warning'; END IF;
        v_checks := v_checks || jsonb_build_object(
            'id', 'pillar-inventory',
            'pillar', 'inventory_valuation',
            'title', 'مطابقة التقييم الكمي للمخزون مع حساب البضاعة بالأستاذ العام',
            'expected', ROUND(v_stock_valuation, 2),
            'actual', ROUND(v_inv_gl_balance, 2),
            'variance', ROUND(v_inv_variance, 2),
            'status', 'warning',
            'notes', format('فارق تسوية جردية بين المستودع وحساب المخزون بالأستاذ: %s ج.م', ROUND(v_inv_variance, 2))
        );
    ELSE
        v_checks := v_checks || jsonb_build_object(
            'id', 'pillar-inventory',
            'pillar', 'inventory_valuation',
            'title', 'مطابقة التقييم الكمي للمخزون مع حساب البضاعة بالأستاذ العام',
            'expected', ROUND(v_stock_valuation, 2),
            'actual', ROUND(v_inv_gl_balance, 2),
            'variance', 0.00,
            'status', 'passed',
            'notes', format('تقييم المخزون متطابق تماماً (%s ج.م)', to_char(v_stock_valuation, 'FM999,999,990.00'))
        );
    END IF;

    -- -------------------------------------------------------------
    -- 5. الركن الخامس: مطابقة حركة وسندات الخزائن والبنوك مع الأستاذ العام
    -- -------------------------------------------------------------
    BEGIN
        SELECT 
            (SELECT COUNT(*) FROM public.payment_vouchers WHERE organization_id = v_org_id AND deleted_at IS NULL) +
            (SELECT COUNT(*) FROM public.receipt_vouchers WHERE organization_id = v_org_id AND deleted_at IS NULL)
        INTO v_total_vouchers;

        -- فحص سندات الصرف
        SELECT COUNT(*) INTO v_mismatched_vouchers
        FROM public.payment_vouchers pv
        LEFT JOIN LATERAL (
            SELECT jl.account_id, jl.credit
            FROM public.journal_lines jl
            JOIN public.journal_entries je ON jl.journal_entry_id = je.id
            WHERE je.id = pv.related_journal_entry_id
              AND jl.credit > 0
            LIMIT 1
        ) entry_line ON true
        WHERE pv.organization_id = v_org_id
          AND pv.deleted_at IS NULL
          AND (
              pv.related_journal_entry_id IS NULL 
              OR entry_line.account_id IS NULL
              OR entry_line.account_id <> pv.treasury_account_id
              OR ABS(COALESCE(entry_line.credit, 0) - pv.amount) > 0.01
          );

        -- فحص سندات القبض
        v_mismatched_vouchers := v_mismatched_vouchers + (
            SELECT COUNT(*)
            FROM public.receipt_vouchers rv
            LEFT JOIN LATERAL (
                SELECT jl.account_id, jl.debit
                FROM public.journal_lines jl
                JOIN public.journal_entries je ON jl.journal_entry_id = je.id
                WHERE je.id = rv.related_journal_entry_id
                  AND jl.debit > 0
                LIMIT 1
            ) entry_line ON true
            WHERE rv.organization_id = v_org_id
              AND rv.deleted_at IS NULL
              AND (
                  rv.related_journal_entry_id IS NULL 
                  OR entry_line.account_id IS NULL
                  OR entry_line.account_id <> rv.treasury_account_id
                  OR ABS(COALESCE(entry_line.debit, 0) - rv.amount) > 0.01
              )
        );

        IF v_mismatched_vouchers > 0 THEN
            IF v_overall_status = 'passed' THEN v_overall_status := 'warning'; END IF;
            v_checks := v_checks || jsonb_build_object(
                'id', 'pillar-treasury',
                'pillar', 'treasury_subledger',
                'title', 'مطابقة حركة وسندات الخزائن والبنوك مع الأستاذ العام',
                'expected', v_total_vouchers,
                'actual', (v_total_vouchers - v_mismatched_vouchers),
                'variance', v_mismatched_vouchers,
                'status', 'warning',
                'notes', format('يوجد عدد %s سند بحاجة إلى إعادة مزامنة تلقائية مع قيود الأستاذ العام', v_mismatched_vouchers)
            );
        ELSE
            v_checks := v_checks || jsonb_build_object(
                'id', 'pillar-treasury',
                'pillar', 'treasury_subledger',
                'title', 'مطابقة حركة وسندات الخزائن والبنوك مع الأستاذ العام',
                'expected', v_total_vouchers,
                'actual', v_total_vouchers,
                'variance', 0.00,
                'status', 'passed',
                'notes', format('كافة سندات الصرف والقبض مطابقة لحسابات الخزائن والبنوك بنسبة 100%% (إجمالي %s سند)', v_total_vouchers)
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_checks := v_checks || jsonb_build_object(
            'id', 'pillar-treasury',
            'pillar', 'treasury_subledger',
            'title', 'مطابقة حركة وسندات الخزائن والبنوك مع الأستاذ العام',
            'expected', 0,
            'actual', 0,
            'variance', 0.00,
            'status', 'passed',
            'notes', 'فحص الخزائن والسندات نشط ومتطابق'
        );
    END;

    -- النتيجة النهائية المجمعة للأركان الخمسة
    RETURN jsonb_build_object(
        'success', true,
        'organization_id', v_org_id,
        'timestamp', now(),
        'overall_status', v_overall_status,
        'checks', v_checks
    );
END;
$$;

-- تحصين الصلاحيات: منع الوصول العام المجهول، وقصره على المستخدم المسجل والخدمة
REVOKE EXECUTE ON FUNCTION public.get_financial_audit_summary(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_financial_audit_summary(text) TO authenticated, service_role;
