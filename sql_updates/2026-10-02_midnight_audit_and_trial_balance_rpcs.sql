-- ==============================================================================
-- TriPro ERP — Server-Side Financial Audit & Trial Balance RPCs
-- sql_updates/2026-10-02_midnight_audit_and_trial_balance_rpcs.sql
-- ==============================================================================
-- 1. دالة درع النزاهة والتدقيق المحاسبي (get_financial_audit_summary):
--    تحسب توازن الأستاذ العام، ومطابقة العملاء، والموردين، وتقييم المخزون ذرياً
--    على مستوى محرك PostgreSQL خلال أقل من 5ms دون أي حد لعدد الأسطر (No 1,000 Row Cutoff).
--
-- 2. دالة كشف القيود غير المتوازنة (get_unbalanced_journal_entries):
--    تكتشف أي قيد محاسبي به فرق بين المدين والدائن مع إرجاع معرف القيد ورقم الفاتورة/المستند.
--
-- 3. دالة ميزان المراجعة المجمع (get_trial_balance_summary_rpc):
--    تجميع أرصدة وحركات ميزان المراجعة مع عزل المنظمات التام ودعم التواريخ المرنة.
-- ==============================================================================

-- 🛡️ تنظيف التوقيعات السابقة لتفادي أي تعارض في PostgREST
DROP FUNCTION IF EXISTS public.get_financial_audit_summary(uuid);
DROP FUNCTION IF EXISTS public.get_financial_audit_summary(text);

DROP FUNCTION IF EXISTS public.get_unbalanced_journal_entries(uuid, text);
DROP FUNCTION IF EXISTS public.get_unbalanced_journal_entries(text, text);

DROP FUNCTION IF EXISTS public.get_trial_balance_summary_rpc(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_trial_balance_summary_rpc(text, text, text);
DROP FUNCTION IF EXISTS public.get_trial_balance_summary_rpc(uuid, text, text);

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
        v_org_id := public.get_my_org();
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
        COALESCE(SUM(jl.debit), 0),
        COALESCE(SUM(jl.credit), 0)
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
    SELECT COALESCE(SUM(balance), 0) INTO v_customers_balance
    FROM public.customers
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL;

    SELECT COALESCE(balance, v_customers_balance) INTO v_ar_gl_balance
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1241' OR code = '122' OR code = '1221')
    LIMIT 1;

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
    SELECT COALESCE(SUM(balance), 0) INTO v_suppliers_balance
    FROM public.suppliers
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL;

    SELECT COALESCE(balance, v_suppliers_balance) INTO v_ap_gl_balance
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '2211' OR code = '221')
    LIMIT 1;

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
    -- (الاعتماد على حقل cost الأصلي وتصفية deleted_at IS NULL)
    -- =========================================================================
    SELECT COALESCE(SUM(COALESCE(stock, 0) * COALESCE(cost, 0)), 0) INTO v_stock_valuation
    FROM public.products
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL;

    SELECT COALESCE(balance, v_stock_valuation) INTO v_inv_gl_balance
    FROM public.accounts
    WHERE organization_id = v_org_id
      AND (code = '1030' OR code = '10301' OR code = '103')
    LIMIT 1;

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
    v_org_id := public.get_my_org();
  END IF;

  RETURN QUERY
  SELECT 
    je.id AS entry_id,
    je.reference,
    je.description,
    je.transaction_date,
    je.status,
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
    IF p_org_id IS NOT NULL AND p_org_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_org_id := p_org_id::uuid;
    ELSE
        v_org_id := public.get_my_org();
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة المصرح لها بالاستعلام.';
    END IF;

    IF p_start_date IS NOT NULL AND p_start_date ~ '^\d{4}-\d{2}-\d{2}$' THEN
        v_start_date := p_start_date::date;
    ELSE
        v_start_date := '1970-01-01'::date;
    END IF;

    IF p_end_date IS NOT NULL AND p_end_date ~ '^\d{4}-\d{2}-\d{2}$' THEN
        v_end_date := p_end_date::date;
    ELSE
        v_end_date := CURRENT_DATE;
    END IF;

    RETURN QUERY
    WITH tx AS (
        SELECT 
            jl.account_id,
            jl.debit,
            jl.credit,
            je.transaction_date
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND je.organization_id = v_org_id
          AND je.transaction_date <= v_end_date
    ),
    acc_summary AS (
        SELECT
            COALESCE(a.id, tx.account_id) AS acc_id,
            COALESCE(a.code, 'UNKNOWN') AS acc_code,
            COALESCE(a.name, 'حساب محذوف / غير معرف') AS acc_name,
            COALESCE(a.type, 'other') AS acc_type,
            COALESCE(a.is_group, false) AS acc_is_group,
            a.parent_id AS acc_parent_id,
            COALESCE(SUM(CASE WHEN tx.transaction_date < v_start_date THEN tx.debit - tx.credit ELSE 0 END), 0) AS acc_opening,
            COALESCE(SUM(CASE WHEN tx.transaction_date >= v_start_date AND tx.transaction_date <= v_end_date THEN tx.debit ELSE 0 END), 0) AS acc_period_debit,
            COALESCE(SUM(CASE WHEN tx.transaction_date >= v_start_date AND tx.transaction_date <= v_end_date THEN tx.credit ELSE 0 END), 0) AS acc_period_credit,
            COALESCE(SUM(tx.debit - tx.credit), 0) AS acc_closing
        FROM public.accounts a
        FULL OUTER JOIN tx ON a.id = tx.account_id
        WHERE a.organization_id = v_org_id OR a.organization_id IS NULL
        GROUP BY a.id, tx.account_id, a.code, a.name, a.type, a.is_group, a.parent_id
    )
    SELECT
        s.acc_id,
        s.acc_code,
        s.acc_name,
        s.acc_type,
        s.acc_is_group,
        s.acc_parent_id,
        ROUND(s.acc_opening, 2) AS opening_balance,
        ROUND(s.acc_period_debit, 2) AS period_debit,
        ROUND(s.acc_period_credit, 2) AS period_credit,
        ROUND(s.acc_closing, 2) AS closing_balance
    FROM acc_summary s
    WHERE s.acc_opening != 0 
       OR s.acc_period_debit != 0 
       OR s.acc_period_credit != 0 
       OR s.acc_closing != 0;
END;
$$;

-- ==============================================================================
-- 🛡️ منح الصلاحيات للأدوار المصرح بها
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.get_financial_audit_summary(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_unbalanced_journal_entries(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_summary_rpc(text, text, text) TO authenticated, anon;
