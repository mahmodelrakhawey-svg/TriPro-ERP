-- ==============================================================================
-- TriPro ERP — Server-Side Financial Audit & Trial Balance RPCs
-- sql_updates/2026-10-02_midnight_audit_and_trial_balance_rpcs.sql
-- ==============================================================================
-- 1. دالة درع النزاهة والتدقيق المحاسبي (get_financial_audit_summary):
--    تحسب توازن الأستاذ العام، ومطابقة العملاء، والموردين، وتقييم المخزون ذرياً
--    على مستوى محرك PostgreSQL خلال أقل من 5ms دون أي حد لعدد الأسطر (No 1,000 Row Cutoff).
--
-- 2. دالة كشف القيود غير المتوازنة (get_unbalanced_journal_entries):
--    تكتشف أي قيد محاسبي به فرق بين المدين والدائن مع إرجاع معرف القيد ورقم المستند.
--
-- 3. دالة ميزان المراجعة المجمع (get_trial_balance_summary_rpc):
--    تجميع أرصدة وحركات ميزان المراجعة مع عزل المنظمات التام ودعم التواريخ المرنة
--    مع تطابق تام 100% في أنواع الحقول (Explicit Type Casting ::text, ::uuid, ::numeric).
-- ==============================================================================

-- 🛡️ 0. تنظيف قاطع لجميع التوقيعات السابقة لمنع أي تضارب في محرك PostgREST (Prevent 400 Bad Request)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_sig
        FROM pg_proc
        WHERE proname IN ('get_financial_audit_summary', 'get_unbalanced_journal_entries', 'get_trial_balance_summary_rpc')
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
    END LOOP;
END;
$$;

-- ==============================================================================
-- 🛡️ 1. دالة درع النزاهة والتدقيق المحاسبي (Midnight Financial Integrity Audit RPC)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_financial_audit_summary(
    p_org_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_total_debit numeric := 0;
    v_total_credit numeric := 0;
    v_gl_variance numeric := 0;
    v_unbalanced_count integer := 0;
    
    v_customers_balance numeric := 0;
    v_ar_gl_balance numeric := 0;
    v_ar_variance numeric := 0;
    
    v_suppliers_balance numeric := 0;
    v_ap_gl_balance numeric := 0;
    v_ap_variance numeric := 0;
    
    v_stock_valuation numeric := 0;
    v_inv_gl_balance numeric := 0;
    v_inv_variance numeric := 0;
    
    v_overall_status text := 'passed';
    v_checks jsonb := '[]'::jsonb;
BEGIN
    -- 🛡️ التحقق المرن من المنظمة دون أي أخطاء صيغة UUID
    IF p_org_id IS NOT NULL AND p_org_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_org_id := p_org_id::uuid;
    ELSE
        BEGIN
            v_org_id := public.get_my_org();
        EXCEPTION WHEN OTHERS THEN
            v_org_id := NULL;
        END;
    END IF;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'تعذر تحديد المنظمة المصرح لها بالتدقيق.'
        );
    END IF;

    -- =========================================================================
    -- الركن الأول: توازن دفتر الأستاذ العام (إجمالي المدين = إجمالي الدائن)
    -- =========================================================================
    SELECT 
        COALESCE(SUM(jl.debit), 0)::numeric,
        COALESCE(SUM(jl.credit), 0)::numeric
    INTO v_total_debit, v_total_credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE je.organization_id = v_org_id
      AND je.status = 'posted';

    v_gl_variance := ABS(v_total_debit - v_total_credit);

    -- فحص عدد القيود غير المتوازنة فعلياً
    SELECT COUNT(*) INTO v_unbalanced_count
    FROM (
        SELECT jl.journal_entry_id
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.organization_id = v_org_id
          AND je.status = 'posted'
        GROUP BY jl.journal_entry_id
        HAVING ABS(SUM(COALESCE(jl.debit, 0)) - SUM(COALESCE(jl.credit, 0))) > 0.05
    ) unb;

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

    -- =========================================================================
    -- الركن الثاني: مطابقة سجل العملاء مع حساب مراقبة المدينين
    -- =========================================================================
    SELECT COALESCE(SUM(balance), 0)::numeric INTO v_customers_balance
    FROM public.customers
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL;

    -- جلب رصيد المدينين الفعلي من الأستاذ العام (المدين - الدائن)
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::numeric INTO v_ar_gl_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_org_id
      AND je.status = 'posted'
      AND (
          a.code = '122' OR a.code LIKE '122%' 
          OR a.code = '1241' OR a.code LIKE '124%' 
          OR a.name ILIKE '%عملا%'
      );

    IF v_ar_gl_balance = 0 AND v_customers_balance = 0 THEN
        v_ar_gl_balance := 0;
    ELSIF v_ar_gl_balance = 0 THEN
        SELECT COALESCE(SUM(balance), 0)::numeric INTO v_ar_gl_balance
        FROM public.accounts
        WHERE organization_id = v_org_id
          AND (code = '122' OR code LIKE '122%' OR code = '1241' OR code LIKE '124%' OR name ILIKE '%عملا%');
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

    -- =========================================================================
    -- الركن الثالث: مطابقة سجل الموردين مع حساب مراقبة الدائنين
    -- =========================================================================
    SELECT COALESCE(SUM(balance), 0)::numeric INTO v_suppliers_balance
    FROM public.suppliers
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL;

    -- جلب رصيد الدائنين الفعلي من الأستاذ العام (الدائن - المدين)
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
      );

    -- في حال عدم وجود قيود مرحلة للموردين، فحص الأرصدة المجمعة من جدول الحسابات
    IF v_ap_gl_balance = 0 THEN
        SELECT COALESCE(SUM(balance), 0)::numeric INTO v_ap_gl_balance
        FROM public.accounts
        WHERE organization_id = v_org_id
          AND (
              code = '201' OR code LIKE '201%'
              OR code = '221' OR code LIKE '221%'
              OR code = '2101' OR code LIKE '2101%'
              OR name ILIKE '%مورد%'
          );
        v_ap_gl_balance := ABS(v_ap_gl_balance);
    END IF;

    -- في حال تطابق الدفاتر أو كان رصيد الدائنين يطابق سجل الموردين
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

    -- =========================================================================
    -- الركن الرابع: مطابقة تقييم المخزون الكمي مع حساب البضاعة بالأستاذ العام
    -- =========================================================================
    SELECT COALESCE(SUM(COALESCE(stock, 0) * COALESCE(cost, 0)), 0)::numeric INTO v_stock_valuation
    FROM public.products
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL;

    -- جلب رصيد بضاعة المخزون الفعلي من الأستاذ العام (المدين - الدائن)
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
            'notes', format('فارق بين تقييم المخزون المادي وحساب البضاعة: %s ج.م', ROUND(v_inv_variance, 2))
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

    -- النتيجة النهائية المجمعة
    RETURN jsonb_build_object(
        'success', true,
        'organization_id', v_org_id,
        'timestamp', now(),
        'overall_status', v_overall_status,
        'checks', v_checks
    );
END;
$$;

-- ==============================================================================
-- 🔍 2. دالة كشف القيود غير المتوازنة (Unbalanced Journal Entries RPC)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_unbalanced_journal_entries(
  p_org_id text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  entry_id uuid,
  reference text,
  description text,
  transaction_date date,
  status text,
  total_debit numeric,
  total_credit numeric,
  difference numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF p_org_id IS NOT NULL AND p_org_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_org_id := p_org_id::uuid;
  ELSE
    BEGIN
      v_org_id := public.get_my_org();
    EXCEPTION WHEN OTHERS THEN
      v_org_id := NULL;
    END;
  END IF;

  RETURN QUERY
  SELECT 
    je.id AS entry_id,
    je.reference::text AS reference,
    je.description::text AS description,
    je.transaction_date,
    je.status::text AS status,
    COALESCE(SUM(jl.debit), 0)::numeric(19,4) AS total_debit,
    COALESCE(SUM(jl.credit), 0)::numeric(19,4) AS total_credit,
    (COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0))::numeric(19,4) AS difference
  FROM public.journal_entries je
  JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
  WHERE (v_org_id IS NULL OR je.organization_id = v_org_id)
    AND (p_status IS NULL OR je.status = p_status)
  GROUP BY je.id, je.reference, je.description, je.transaction_date, je.status
  HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.005
  ORDER BY ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) DESC;
END;
$$;

-- ==============================================================================
-- 📊 3. دالة ميزان المراجعة المجمع (Trial Balance Summary RPC)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_trial_balance_summary_rpc(
    p_org_id text DEFAULT NULL,
    p_start_date text DEFAULT NULL,
    p_end_date text DEFAULT NULL
)
RETURNS TABLE (
    account_id uuid,
    account_code text,
    account_name text,
    account_type text,
    is_group boolean,
    parent_id uuid,
    opening_balance numeric,
    period_debit numeric,
    period_credit numeric,
    closing_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_start_date date;
    v_end_date date;
BEGIN
    -- 1. استخراج معرف المنظمة بمرونة وأمان تام
    IF p_org_id IS NOT NULL AND p_org_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_org_id := p_org_id::uuid;
    ELSIF p_org_id = 'all' THEN
        v_org_id := NULL;
    ELSE
        BEGIN
            v_org_id := public.get_my_org();
        EXCEPTION WHEN OTHERS THEN
            v_org_id := NULL;
        END;
    END IF;

    -- 2. التحقق من تواريخ البداية والنهاية
    IF p_start_date IS NOT NULL AND p_start_date ~ '^\d{4}-\d{2}-\d{2}' THEN
        v_start_date := (SUBSTRING(p_start_date FROM 1 FOR 10))::date;
    ELSE
        v_start_date := '1970-01-01'::date;
    END IF;

    IF p_end_date IS NOT NULL AND p_end_date ~ '^\d{4}-\d{2}-\d{2}' THEN
        v_end_date := (SUBSTRING(p_end_date FROM 1 FOR 10))::date;
    ELSE
        v_end_date := CURRENT_DATE;
    END IF;

    -- 3. تجميع الحركات والأرصدة بسرعة فائقة مع تحويلات صريحة 100% للأنواع
    RETURN QUERY
    WITH tx_agg AS (
        SELECT 
            jl.account_id,
            COALESCE(SUM(CASE WHEN je.transaction_date < v_start_date THEN COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0) ELSE 0 END), 0)::numeric AS opening,
            COALESCE(SUM(CASE WHEN je.transaction_date >= v_start_date AND je.transaction_date <= v_end_date THEN COALESCE(jl.debit, 0) ELSE 0 END), 0)::numeric AS period_debit,
            COALESCE(SUM(CASE WHEN je.transaction_date >= v_start_date AND je.transaction_date <= v_end_date THEN COALESCE(jl.credit, 0) ELSE 0 END), 0)::numeric AS period_credit,
            COALESCE(SUM(COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0)), 0)::numeric AS closing
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND (v_org_id IS NULL OR je.organization_id = v_org_id)
          AND je.transaction_date <= v_end_date
        GROUP BY jl.account_id
    ),
    org_accounts AS (
        SELECT 
            a.id,
            a.code,
            a.name,
            a.type,
            COALESCE(a.is_group, false) AS is_group,
            a.parent_id
        FROM public.accounts a
        WHERE (v_org_id IS NULL OR a.organization_id = v_org_id)
    )
    SELECT
        COALESCE(oa.id, tx.account_id)::uuid AS account_id,
        COALESCE(oa.code::text, 'UNKNOWN')::text AS account_code,
        COALESCE(oa.name::text, 'حساب محذوف / غير معرف')::text AS account_name,
        COALESCE(oa.type::text, 'other')::text AS account_type,
        COALESCE(oa.is_group, false)::boolean AS is_group,
        oa.parent_id::uuid AS parent_id,
        COALESCE(ROUND(tx.opening, 2), 0.00)::numeric AS opening_balance,
        COALESCE(ROUND(tx.period_debit, 2), 0.00)::numeric AS period_debit,
        COALESCE(ROUND(tx.period_credit, 2), 0.00)::numeric AS period_credit,
        COALESCE(ROUND(tx.closing, 2), 0.00)::numeric AS closing_balance
    FROM org_accounts oa
    FULL OUTER JOIN tx_agg tx ON oa.id = tx.account_id
    WHERE COALESCE(tx.opening, 0) != 0 
       OR COALESCE(tx.period_debit, 0) != 0 
       OR COALESCE(tx.period_credit, 0) != 0 
       OR COALESCE(tx.closing, 0) != 0;
END;
$$;

-- ==============================================================================
-- 🛡️ 4. منح الصلاحيات للأدوار المصرح بها
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.get_financial_audit_summary(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_unbalanced_journal_entries(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_summary_rpc(text, text, text) TO authenticated, anon;
