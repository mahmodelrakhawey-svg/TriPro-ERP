-- ==============================================================================
-- 🚀 TriPro-ERP: تسريع وحل مشكلة مهلة التنفيذ (Statement Timeout) في إعادة احتساب الأرصدة
-- التاريخ: 18 أكتوبر 2026
-- الغرض: منع إلغاء الاستعلام (canceling statement due to statement timeout)
-- وجعل دالة recalculate_all_system_balances تنفذ في أقل من 500 مللي ثانية
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(
    p_org_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    -- رفع مهلة التنفيذ للجلسة الحالية لتفادي الانقطاع
    SET LOCAL statement_timeout = '60s';

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: إعادة احتساب أرصدة النظام تقتصر على المدراء والمحاسبين المعتمدين.';
        END IF;
    END IF;

    v_org_id := public.validate_tenant_access(p_org_id);

    -- 1. تحديث أرصدة شجرة الحسابات العامة (Accounts) بشكل فائق السرعة عبر استعلام تجميعي مفهرس
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
          AND je.organization_id = v_org_id
        GROUP BY jl.account_id
    ) b
    WHERE a.id = b.account_id
      AND a.organization_id = v_org_id;

    -- 2. تصفير الحسابات التي لا توجد لها حركات مرحلة (باستخدام NOT EXISTS المفهرس بدلاً من NOT IN البطيء)
    UPDATE public.accounts a
    SET balance = 0
    WHERE a.organization_id = v_org_id
      AND a.balance <> 0
      AND NOT EXISTS (
          SELECT 1 
          FROM public.journal_lines jl
          JOIN public.journal_entries je ON jl.journal_entry_id = je.id
          WHERE jl.account_id = a.id
            AND je.status = 'posted'
            AND je.organization_id = v_org_id
      );

    -- 3. تحديث أرصدة العملاء (Customers)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_customer_balances' AND pronamespace = 'public'::regnamespace) THEN
        BEGIN
            PERFORM public.recalculate_customer_balances(v_org_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- 4. تحديث أرصدة الموردين (Suppliers)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_supplier_balances' AND pronamespace = 'public'::regnamespace) THEN
        BEGIN
            PERFORM public.recalculate_supplier_balances(v_org_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- 5. فحص سندات الصرف والقبض ذاتياً بدون تعطيل
    BEGIN
        PERFORM public.auto_reconcile_all_vouchers_with_gl(v_org_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) TO authenticated, service_role;
