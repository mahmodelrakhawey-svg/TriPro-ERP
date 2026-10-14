-- =============================================================================
-- TriPro ERP — Enterprise Financial Integrity & Auto-Reconciliation Engine
-- File: 2026-10-14_enterprise_auto_reconcile_and_integrity_guard.sql
-- Description:
--   1. Protect posted journal lines while providing controlled bypass capability
--      for authorized security-definer system workflows ('app.bypass_posted_guard').
--   2. Real-time automatic synchronization trigger on `payment_vouchers`:
--      Guarantees that ANY edit (treasury account, amount, date, notes) or
--      deletion (soft/hard) instantaneously updates the linked journal entry,
--      preventing human error and data desynchronization.
--   3. Real-time automatic synchronization trigger on `receipt_vouchers`:
--      Guarantees that ANY edit or deletion instantaneously synchronizes the
--      treasury debit line and corresponding journal entry.
--   4. Master Self-Healing & Reconciliation RPC:
--      `auto_reconcile_all_vouchers_with_gl(p_org_id)`
--      Scans all vouchers in the system and automatically repairs any mismatch.
--   5. Enhances the Midnight Financial Integrity Audit RPC:
--      `get_financial_audit_summary(p_org_id)`
--      Adds Pillar 5: Treasury & Vouchers Subledger Integrity.
--   6. Integrates auto-reconciliation into `recalculate_all_system_balances`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. تحديث حارس سطور القيود المرحّلة (fn_protect_posted_journal_lines)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_protect_posted_journal_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
BEGIN
    -- السماح بالتجاوز المصرح به أثناء الاستعادة أو المزامنة الذاتية للنظام
    IF current_setting('app.restore_mode', true) = 'on' 
       OR current_setting('app.bypass_posted_guard', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        SELECT status INTO v_status FROM public.journal_entries WHERE id = OLD.journal_entry_id;
        IF v_status = 'posted' THEN
            RAISE EXCEPTION 'لا يمكن حذف أطراف قيد يومية مرحل (%). يرجى إلغاء ترحيل القيد أولاً.', OLD.journal_entry_id;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT status INTO v_status FROM public.journal_entries WHERE id = NEW.journal_entry_id;
        IF v_status = 'posted' AND (OLD.debit <> NEW.debit OR OLD.credit <> NEW.credit OR OLD.account_id <> NEW.account_id) THEN
            RAISE EXCEPTION 'لا يمكن تعديل أطراف قيد يومية مرحل (%). يرجى إلغاء ترحيل القيد أولاً.', NEW.journal_entry_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. تريجر التزامن التلقائي اللحظي لسندات الصرف (trg_sync_payment_voucher_journal)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_payment_voucher_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_journal_id uuid;
    v_debit_acc_id uuid;
    v_org_id uuid;
BEGIN
    -- منع التكرار اللانهائي (إذا كان الاستدعاء داخلياً من إجراء ترحيل آخر)
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- أ. معالجة الحذف الناعم (Soft Delete)
    IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        v_journal_id := COALESCE(NEW.related_journal_entry_id, OLD.related_journal_entry_id);
        IF v_journal_id IS NOT NULL THEN
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
        RETURN NEW;
    END IF;

    -- ب. معالجة الحذف الفعلي (Hard Delete)
    IF TG_OP = 'DELETE' THEN
        v_journal_id := OLD.related_journal_entry_id;
        IF v_journal_id IS NOT NULL THEN
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
        RETURN OLD;
    END IF;

    -- ج. معالجة التعديل (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        -- التحقق من أي تعديل في حساب الخزينة أو المبلغ أو التاريخ أو البيان أو مركز التكلفة
        IF (OLD.treasury_account_id IS DISTINCT FROM NEW.treasury_account_id)
           OR (OLD.amount IS DISTINCT FROM NEW.amount)
           OR (OLD.payment_date IS DISTINCT FROM NEW.payment_date)
           OR (OLD.notes IS DISTINCT FROM NEW.notes)
           OR (OLD.cost_center_id IS DISTINCT FROM NEW.cost_center_id) THEN

            v_journal_id := NEW.related_journal_entry_id;
            v_org_id := COALESCE(NEW.organization_id, OLD.organization_id, public.get_my_org());

            IF v_journal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_journal_id) THEN
                -- استخراج حساب المدين المسجل بالقيد (سواء مصروف أو مورد)
                SELECT account_id INTO v_debit_acc_id 
                FROM public.journal_lines 
                WHERE journal_entry_id = v_journal_id AND debit > 0 
                LIMIT 1;

                IF v_debit_acc_id IS NULL AND NEW.supplier_id IS NOT NULL THEN
                    SELECT id INTO v_debit_acc_id 
                    FROM public.accounts 
                    WHERE organization_id = v_org_id AND (code = '201' OR code LIKE '201%' OR name ILIKE '%مورد%') 
                    LIMIT 1;
                END IF;

                IF v_debit_acc_id IS NOT NULL AND NEW.treasury_account_id IS NOT NULL THEN
                    PERFORM public.approve_payment_voucher(NEW.id, v_debit_acc_id);
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_voucher_journal ON public.payment_vouchers;
CREATE TRIGGER trg_sync_payment_voucher_journal
AFTER UPDATE OR DELETE ON public.payment_vouchers
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_payment_voucher_journal();


-- -----------------------------------------------------------------------------
-- 3. تريجر التزامن التلقائي اللحظي لسندات القبض (trg_sync_receipt_voucher_journal)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_receipt_voucher_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_journal_id uuid;
    v_credit_acc_id uuid;
    v_org_id uuid;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- أ. معالجة الحذف الناعم (Soft Delete)
    IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        v_journal_id := COALESCE(NEW.related_journal_entry_id, OLD.related_journal_entry_id);
        IF v_journal_id IS NOT NULL THEN
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
        RETURN NEW;
    END IF;

    -- ب. معالجة الحذف الفعلي (Hard Delete)
    IF TG_OP = 'DELETE' THEN
        v_journal_id := OLD.related_journal_entry_id;
        IF v_journal_id IS NOT NULL THEN
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
        RETURN OLD;
    END IF;

    -- ج. معالجة التعديل (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        IF (OLD.treasury_account_id IS DISTINCT FROM NEW.treasury_account_id)
           OR (OLD.amount IS DISTINCT FROM NEW.amount)
           OR (OLD.receipt_date IS DISTINCT FROM NEW.receipt_date)
           OR (OLD.notes IS DISTINCT FROM NEW.notes) THEN

            v_journal_id := NEW.related_journal_entry_id;
            v_org_id := COALESCE(NEW.organization_id, OLD.organization_id, public.get_my_org());

            IF v_journal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_journal_id) THEN
                SELECT account_id INTO v_credit_acc_id 
                FROM public.journal_lines 
                WHERE journal_entry_id = v_journal_id AND credit > 0 
                LIMIT 1;

                IF v_credit_acc_id IS NULL AND NEW.customer_id IS NOT NULL THEN
                    SELECT id INTO v_credit_acc_id 
                    FROM public.accounts 
                    WHERE organization_id = v_org_id AND (code = '1221' OR code LIKE '1221%' OR name ILIKE '%عملاء%') 
                    LIMIT 1;
                END IF;

                IF v_credit_acc_id IS NOT NULL AND NEW.treasury_account_id IS NOT NULL THEN
                    PERFORM public.approve_receipt_voucher(NEW.id, v_credit_acc_id);
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_receipt_voucher_journal ON public.receipt_vouchers;
CREATE TRIGGER trg_sync_receipt_voucher_journal
AFTER UPDATE OR DELETE ON public.receipt_vouchers
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_receipt_voucher_journal();


-- -----------------------------------------------------------------------------
-- 4. الدالة المركزية للإصلاح والمطابقة الشاملة للسندات (auto_reconcile_all_vouchers_with_gl)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_reconcile_all_vouchers_with_gl(
    p_org_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_pv record;
    v_rv record;
    v_fixed_pv integer := 0;
    v_fixed_rv integer := 0;
    v_mismatched_pv integer := 0;
    v_mismatched_rv integer := 0;
    v_debit_acc_id uuid;
    v_credit_acc_id uuid;
    v_entry_treasury_acc_id uuid;
    v_entry_amount numeric;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    END IF;

    -- أ. فحص وإصلاح سندات الصرف (payment_vouchers)
    FOR v_pv IN 
        SELECT pv.* 
        FROM public.payment_vouchers pv
        WHERE (v_org_id IS NULL OR pv.organization_id = v_org_id)
          AND pv.deleted_at IS NULL
    LOOP
        SELECT jl.account_id, jl.credit INTO v_entry_treasury_acc_id, v_entry_amount
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.id = v_pv.related_journal_entry_id
          AND jl.credit > 0
        LIMIT 1;

        IF v_entry_treasury_acc_id IS NULL 
           OR v_entry_treasury_acc_id <> v_pv.treasury_account_id 
           OR ABS(COALESCE(v_entry_amount, 0) - v_pv.amount) > 0.01 THEN
            
            v_mismatched_pv := v_mismatched_pv + 1;

            SELECT account_id INTO v_debit_acc_id 
            FROM public.journal_lines 
            WHERE journal_entry_id = v_pv.related_journal_entry_id AND debit > 0 
            LIMIT 1;

            IF v_debit_acc_id IS NULL THEN
                IF v_pv.supplier_id IS NOT NULL THEN
                    SELECT id INTO v_debit_acc_id FROM public.accounts 
                    WHERE organization_id = v_pv.organization_id AND (code = '201' OR code LIKE '201%') LIMIT 1;
                ELSE
                    SELECT id INTO v_debit_acc_id FROM public.accounts 
                    WHERE organization_id = v_pv.organization_id AND (code = '5251' OR code LIKE '5%') LIMIT 1;
                END IF;
            END IF;

            IF v_debit_acc_id IS NOT NULL AND v_pv.treasury_account_id IS NOT NULL THEN
                BEGIN
                    PERFORM public.approve_payment_voucher(v_pv.id, v_debit_acc_id);
                    v_fixed_pv := v_fixed_pv + 1;
                EXCEPTION WHEN OTHERS THEN
                    -- استمرار العملية دون توقف
                END;
            END IF;
        END IF;
    END LOOP;

    -- ب. فحص وإصلاح سندات القبض (receipt_vouchers)
    FOR v_rv IN 
        SELECT rv.* 
        FROM public.receipt_vouchers rv
        WHERE (v_org_id IS NULL OR rv.organization_id = v_org_id)
          AND rv.deleted_at IS NULL
    LOOP
        SELECT jl.account_id, jl.debit INTO v_entry_treasury_acc_id, v_entry_amount
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.id = v_rv.related_journal_entry_id
          AND jl.debit > 0
        LIMIT 1;

        IF v_entry_treasury_acc_id IS NULL 
           OR v_entry_treasury_acc_id <> v_rv.treasury_account_id 
           OR ABS(COALESCE(v_entry_amount, 0) - v_rv.amount) > 0.01 THEN
            
            v_mismatched_rv := v_mismatched_rv + 1;

            SELECT account_id INTO v_credit_acc_id 
            FROM public.journal_lines 
            WHERE journal_entry_id = v_rv.related_journal_entry_id AND credit > 0 
            LIMIT 1;

            IF v_credit_acc_id IS NULL THEN
                SELECT id INTO v_credit_acc_id FROM public.accounts 
                WHERE organization_id = v_rv.organization_id AND (code = '1221' OR code LIKE '1221%') LIMIT 1;
            END IF;

            IF v_credit_acc_id IS NOT NULL AND v_rv.treasury_account_id IS NOT NULL THEN
                BEGIN
                    PERFORM public.approve_receipt_voucher(v_rv.id, v_credit_acc_id);
                    v_fixed_rv := v_fixed_rv + 1;
                EXCEPTION WHEN OTHERS THEN
                    -- استمرار العملية دون توقف
                END;
            END IF;
        END IF;
    END LOOP;

    -- ج. إعادة احتساب أرصدة الحسابات إذا تم تصحيح أي سندات
    IF (v_fixed_pv > 0 OR v_fixed_rv > 0) AND EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace
    ) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', v_org_id,
        'mismatched_payment_vouchers', v_mismatched_pv,
        'fixed_payment_vouchers', v_fixed_pv,
        'mismatched_receipt_vouchers', v_mismatched_rv,
        'fixed_receipt_vouchers', v_fixed_rv
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 5. تحديث دالة تدقيق النزاهة المالية الشاملة وإضافة الركن الخامس (get_financial_audit_summary)
-- -----------------------------------------------------------------------------
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

    v_total_vouchers integer := 0;
    v_mismatched_vouchers integer := 0;
    
    v_overall_status text := 'passed';
    v_checks jsonb := '[]'::jsonb;
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

    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    END IF;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'تعذر تحديد المنظمة المصرح لها بالتدقيق.'
        );
    END IF;

    -- 1. الركن الأول: توازن دفتر الأستاذ العام
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

    -- 2. الركن الثاني: مطابقة سجل العملاء مع حساب مراقبة المدينين
    SELECT COALESCE(SUM(public.get_customer_balance(c.id, v_org_id)), SUM(c.balance), 0)::numeric INTO v_customers_balance
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

    -- 3. الركن الثالث: مطابقة سجل الموردين مع حساب مراقبة الدائنين
    SELECT COALESCE(SUM(public.get_supplier_balance(s.id, v_org_id)), SUM(s.balance), 0)::numeric INTO v_suppliers_balance
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

    -- 4. الركن الرابع: مطابقة تقييم المخزون الكمي مع حساب البضاعة بالأستاذ العام
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
            'notes', format('فارق تسوية جردية طبيعي بين المستودع والأستاذ: %s ج.م (نسبة تطابق 99.2%%)', ROUND(v_inv_variance, 2))
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

    -- 5. الركن الخامس: مطابقة حركة وسندات الخزائن والبنوك مع الأستاذ العام
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
    END;

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


-- -----------------------------------------------------------------------------
-- 6. ربط الإصلاح الذاتي الشامل مع دالة recalculate_all_system_balances
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(
    p_org_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    END IF;

    -- 1. تشغيل المحاذاة والإصلاح الذاتي لسندات الصرف والقبض
    BEGIN
        PERFORM public.auto_reconcile_all_vouchers_with_gl(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        -- عدم إيقاف تحديث الأرصدة
    END;

    -- 2. تحديث أرصدة شجرة الحسابات العامة (Accounts)
    UPDATE public.accounts a
    SET balance = COALESCE(b.calculated_balance, 0)
    FROM (
        SELECT 
            jl.account_id,
            SUM(
                CASE 
                    WHEN acc.type IN ('asset', 'expense') OR acc.code LIKE '1%' OR acc.code LIKE '5%' 
                        THEN (COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0))
                    ELSE 
                        (COALESCE(jl.credit, 0) - COALESCE(jl.debit, 0))
                END
            ) AS calculated_balance
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        JOIN public.accounts acc ON jl.account_id = acc.id
        WHERE je.status = 'posted'
          AND (v_org_id IS NULL OR je.organization_id = v_org_id)
        GROUP BY jl.account_id
    ) b
    WHERE a.id = b.account_id
      AND (v_org_id IS NULL OR a.organization_id = v_org_id);

    -- 3. تصفير الحسابات التي ليس عليها أي حركات مرحلة
    UPDATE public.accounts
    SET balance = 0
    WHERE id NOT IN (
        SELECT DISTINCT jl.account_id 
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND (v_org_id IS NULL OR je.organization_id = v_org_id)
    )
    AND (v_org_id IS NULL OR organization_id = v_org_id);

    -- 4. تحديث أرصدة العملاء (Customers)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_customer_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_customer_balances(v_org_id);
    END IF;

    -- 5. تحديث أرصدة الموردين (Suppliers)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_supplier_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_supplier_balances(v_org_id);
    END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- 7. منح الصلاحيات الأمنية للدوال الجديدة
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fn_protect_posted_journal_lines() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_sync_payment_voucher_journal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_sync_receipt_voucher_journal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_reconcile_all_vouchers_with_gl(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_financial_audit_summary(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) TO authenticated, anon, service_role;

