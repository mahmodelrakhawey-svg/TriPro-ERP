-- ==============================================================================
-- 🛠️ TriPro ERP — Fix: Allow Treasury Transfer RPC to Recalculate System Balances
-- File: services/migrations/2026-11-28_fix_treasury_transfer_recalc_role_guard.sql
-- Date: 2026-11-28
-- ==============================================================================
-- السبب:
--   دالة recalculate_all_system_balances تتحقق من أن دور auth.uid() ضمن
--   ('super_admin', 'admin', 'manager', 'accountant').
--   عندما ينفذ مستخدم مخوّل للتحويل بين الخزن (بدور مختلف مثل cashier/treasury/user)
--   دالة add_treasury_transfer، فإن الدالة تستدعي recalculate_all_system_balances
--   داخلياً، فيتم رفض التحويل بالخطأ P0001:
--   "TRIPRO_SECURITY_ALERT: إعادة احتساب أرصدة النظام تقتصر على المدراء والمحاسبين المعتمدين."
-- الحل:
--   1. السماح لدوال الخادم الموثوقة (SECURITY DEFINER) بتمرير متغير الجلسة المحلي
--      app.internal_balance_recalc = 'true' لتجاوز فحص الدور عند الاستدعاء الداخلي
--      مع استمرار فرض validate_tenant_access(p_org_id) ومنع الاستدعاء المباشر لغير المخولين.
--   2. تحديث add_treasury_transfer لتعيين app.internal_balance_recalc = 'true' مؤقتاً
--      أثناء استدعاء recalculate_all_system_balances ثم إعادته إلى 'false'.
-- ==============================================================================

BEGIN;

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
    v_is_internal_recalc boolean := (
        COALESCE(current_setting('app.internal_balance_recalc', true), '') = 'true'
        OR COALESCE(current_setting('app.allow_financial_ledger_mutation', true), '') = 'true'
    );
BEGIN
    -- رفع مهلة التنفيذ للجلسة الحالية لتفادي الانقطاع
    SET LOCAL statement_timeout = '60s';

    IF v_caller_id IS NOT NULL AND NOT v_is_internal_recalc THEN
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

    -- 2. تصفير الحسابات التي لا توجد لها حركات مرحلة
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

REVOKE ALL ON FUNCTION public.recalculate_all_system_balances(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.add_treasury_transfer(
  p_from_account_id  uuid,
  p_to_account_id    uuid,
  p_amount           numeric,
  p_transfer_date    date,
  p_notes            text,
  p_org_id           uuid,
  p_user_id          uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id uuid;
  v_ref      text;
BEGIN
  -- 0. توليد مرجع فريد (يتضمن الثواني + كود عشوائي)
  v_ref := 'TRF-' || TO_CHAR(NOW(), 'YYMMDD-HH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 1000)::text, 3, '0');

  -- 1. إنشاء رأس القيد بحالة DRAFT أولاً (لتجنب إطلاق أي Trigger على حالة posted عند INSERT)
  INSERT INTO public.journal_entries (
    transaction_date,
    description,
    status,
    is_posted,
    organization_id,
    user_id,
    reference,
    related_document_type
  ) VALUES (
    p_transfer_date,
    p_notes,
    'draft',
    false,
    p_org_id,
    p_user_id,
    v_ref,
    'treasury_transfer'
  ) RETURNING id INTO v_entry_id;

  -- 2. سطر القيد المدين (الخزينة المستلمة تزيد)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    v_entry_id,
    p_to_account_id,
    p_amount,
    0,
    'تحويل وارد: ' || COALESCE(p_notes, ''),
    p_org_id
  );

  -- 3. سطر القيد الدائن (الخزينة المحولة تنقص)
  INSERT INTO public.journal_lines (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description,
    organization_id
  ) VALUES (
    v_entry_id,
    p_from_account_id,
    0,
    p_amount,
    'تحويل صادر: ' || COALESCE(p_notes, ''),
    p_org_id
  );

  -- 4. ترحيل القيد الآن بعد أن أسطره مكتملة
  UPDATE public.journal_entries
  SET status    = 'posted',
      is_posted = true
  WHERE id = v_entry_id;

  -- 5. إعادة احتساب الأرصدة داخلياً مع السماح للاستدعاء الموثوق
  PERFORM set_config('app.internal_balance_recalc', 'true', true);
  PERFORM public.recalculate_all_system_balances(p_org_id);
  PERFORM set_config('app.internal_balance_recalc', 'false', true);

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_treasury_transfer(uuid, uuid, numeric, date, text, uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.add_treasury_transfer(uuid, uuid, numeric, date, text, uuid, uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
