-- =============================================================================
-- Migration  : 2026-10-04_fix6_fx_revaluation_and_year_end_closing.sql
-- الترحيل    : إضافة إعادة تقييم العملات الأجنبية وإجراء الإقفال السنوي
-- Date / التاريخ : 2026-10-04
-- Author     : TriPro ERP – Database Engineering
-- Description:
--   FEATURE 1 – FX Revaluation RPC (IAS 21 / معيار المحاسبة الدولي 21)
--     • Creates table public.fx_rates to store daily exchange rates per org
--     • Enables RLS with tenant isolation policy
--     • Creates RPC public.run_fx_revaluation() that saves rates and drafts
--       the revaluation journal entry
--
--   FEATURE 2 – Year-End Closing Automation RPC
--     • Creates RPC public.run_year_end_closing() that:
--         - Validates all periods are closed for the target fiscal year
--         - Aggregates revenue / expense into net income
--         - Posts the closing journal entry transferring net income to
--           retained earnings account
--         - Locks all remaining unlocked periods for the closing year
--         - Returns a JSON summary report
--
-- Notes / ملاحظات:
--   • All functions use SECURITY DEFINER + SET search_path = public
--   • Idempotent – safe to run multiple times (IF NOT EXISTS / OR REPLACE)
--   • Roles required: super_admin / admin / manager (see per-function checks)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FEATURE 1: FX Rates Table  |  جدول أسعار صرف العملات الأجنبية
-- ---------------------------------------------------------------------------

DO $$
BEGIN

    -- -----------------------------------------------------------------------
    -- 1.1  Create table public.fx_rates  |  إنشاء جدول أسعار الصرف
    -- -----------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS public.fx_rates (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID        NOT NULL,
        -- رمز العملة: USD, EUR, GBP …
        currency_code   TEXT        NOT NULL,
        rate_date       DATE        NOT NULL,
        -- سعر التحويل إلى العملة المحلية: مثال 1 دولار = 30.9 جنيه
        rate_to_local   NUMERIC(19, 8) NOT NULL,
        -- مصدر السعر: يدوي أو عبر API
        source          TEXT        DEFAULT 'manual',
        created_by      UUID,
        created_at      TIMESTAMPTZ DEFAULT NOW(),

        CONSTRAINT uq_fx_rate_org_curr_date
            UNIQUE (organization_id, currency_code, rate_date)
    );

    RAISE NOTICE '[1.1] Table public.fx_rates created / تم إنشاء جدول أسعار الصرف';

    -- -----------------------------------------------------------------------
    -- 1.2  Index for fast lookup  |  فهرس للبحث السريع
    -- -----------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename  = 'fx_rates'
          AND indexname  = 'idx_fx_rates_org_curr'
    ) THEN
        CREATE INDEX idx_fx_rates_org_curr
            ON public.fx_rates (organization_id, currency_code, rate_date DESC);
        RAISE NOTICE '[1.2] Index idx_fx_rates_org_curr created / تم إنشاء الفهرس';
    ELSE
        RAISE NOTICE '[1.2] Index idx_fx_rates_org_curr already exists / الفهرس موجود مسبقاً';
    END IF;

    -- -----------------------------------------------------------------------
    -- 1.3  Enable Row Level Security  |  تفعيل أمان مستوى الصف
    -- -----------------------------------------------------------------------
    ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE '[1.3] RLS enabled on fx_rates / تم تفعيل RLS على جدول أسعار الصرف';

    -- -----------------------------------------------------------------------
    -- 1.4  Drop old policy if exists, then recreate
    --      حذف السياسة القديمة إن وجدت ثم إعادة إنشائها
    -- -----------------------------------------------------------------------
    DROP POLICY IF EXISTS fx_rates_tenant_isolation ON public.fx_rates;

    CREATE POLICY fx_rates_tenant_isolation ON public.fx_rates
        FOR ALL
        TO authenticated
        USING (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        )
        WITH CHECK (
            organization_id = public.get_my_org()
            OR public.get_my_role() = 'super_admin'
        );

    RAISE NOTICE '[1.4] RLS policy fx_rates_tenant_isolation created / تم إنشاء سياسة العزل';

END;
$$;


-- ---------------------------------------------------------------------------
-- FEATURE 1 – RPC: run_fx_revaluation  |  دالة إعادة تقييم العملات (IAS 21)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_fx_revaluation(
    p_org_id           UUID,
    p_revaluation_date DATE,
    -- أسعار الصرف الجديدة: مثال {"USD": 30.9, "EUR": 33.5}
    p_rates            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_journal_id  UUID;
    v_fx_gain_acc UUID;
    v_fx_loss_acc UUID;
    v_rate_key    TEXT;
    v_new_rate    NUMERIC;
BEGIN
    -- -------------------------------------------------------------------
    -- تحقق من الصلاحية  |  Permission check
    -- -------------------------------------------------------------------
    IF public.get_my_role() NOT IN ('super_admin', 'admin', 'manager') THEN
        RAISE EXCEPTION
            'FX_REVALUATION_ACCESS_DENIED: غير مصرح لك بتشغيل إعادة التقييم';
    END IF;

    -- -------------------------------------------------------------------
    -- جلب حساب أرباح العملة الأجنبية (IAS 21)  |  FX Gain account
    -- -------------------------------------------------------------------
    SELECT id INTO v_fx_gain_acc
    FROM public.accounts
    WHERE code IN ('441', '4410', '7200')
      AND organization_id = p_org_id
    ORDER BY code
    LIMIT 1;

    -- -------------------------------------------------------------------
    -- جلب حساب خسائر العملة الأجنبية (IAS 21)  |  FX Loss account
    -- -------------------------------------------------------------------
    SELECT id INTO v_fx_loss_acc
    FROM public.accounts
    WHERE code IN ('541', '5410', '8200')
      AND organization_id = p_org_id
    ORDER BY code
    LIMIT 1;

    IF v_fx_gain_acc IS NULL OR v_fx_loss_acc IS NULL THEN
        RAISE EXCEPTION
            'FX_ACCOUNTS_MISSING: يجب تعريف حسابي أرباح/خسائر العملة (441/541)';
    END IF;

    -- -------------------------------------------------------------------
    -- حفظ أسعار الصرف في جدول fx_rates  |  Persist exchange rates
    -- -------------------------------------------------------------------
    FOR v_rate_key IN SELECT jsonb_object_keys(p_rates) LOOP
        v_new_rate := (p_rates ->> v_rate_key)::NUMERIC;

        INSERT INTO public.fx_rates (
            organization_id, currency_code, rate_date,
            rate_to_local, source, created_by
        )
        VALUES (
            p_org_id, v_rate_key, p_revaluation_date,
            v_new_rate, 'manual', auth.uid()
        )
        ON CONFLICT (organization_id, currency_code, rate_date)
        DO UPDATE SET rate_to_local = EXCLUDED.rate_to_local;
    END LOOP;

    RAISE NOTICE '[run_fx_revaluation] Exchange rates saved / تم حفظ أسعار الصرف للتاريخ %',
        p_revaluation_date;

    -- -------------------------------------------------------------------
    -- إنشاء قيد إعادة التقييم  |  Create revaluation journal entry
    -- -------------------------------------------------------------------
    INSERT INTO public.journal_entries (
        transaction_date,
        description,
        reference,
        status,
        organization_id,
        is_posted
    )
    VALUES (
        p_revaluation_date,
        'إعادة تقييم العملات الأجنبية بتاريخ ' || p_revaluation_date::TEXT,
        'FX-REV-' || to_char(p_revaluation_date, 'YYYYMMDD'),
        'posted',
        p_org_id,
        TRUE
    )
    RETURNING id INTO v_journal_id;

    RAISE NOTICE '[run_fx_revaluation] Revaluation journal entry created: % / تم إنشاء قيد إعادة التقييم',
        v_journal_id;

    -- -------------------------------------------------------------------
    -- ملاحظة للمطورين / Developer note:
    --   تفاصيل توزيع الفروق على حسابات بعملات أجنبية تتطلب وجود حقل
    --   currency_code في جدول accounts. يُدخل المحاسب الفروق يدوياً
    --   عبر واجهة القيد اليدوي، أو يُحدَّث هذا الـ RPC لاحقاً عند
    --   إضافة currency_code للحسابات.
    --   Detailed per-account FX diff lines require accounts.currency_code.
    --   Until that column exists, the accountant enters diff lines manually
    --   via the manual journal UI, or this RPC can be extended later.
    -- -------------------------------------------------------------------

    RETURN jsonb_build_object(
        'success',          TRUE,
        'journal_id',       v_journal_id,
        'revaluation_date', p_revaluation_date,
        'fx_gain_account',  v_fx_gain_acc,
        'fx_loss_account',  v_fx_loss_acc,
        'message',
            'تم إنشاء قيد إعادة التقييم. يرجى إدخال قيود فروق التقييم يدوياً.'
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'run_fx_revaluation ERROR: % | %', SQLERRM, SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_fx_revaluation(UUID, DATE, JSONB)
    TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '[1.5] Function public.run_fx_revaluation() created and granted / تم إنشاء دالة إعادة التقييم';
END;
$$;


-- ---------------------------------------------------------------------------
-- FEATURE 2 – RPC: run_year_end_closing  |  دالة الإقفال السنوي التلقائي
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_year_end_closing(
    p_org_id          UUID,
    p_closing_year    INTEGER,
    -- معرف حساب الأرباح المحتجزة  |  Retained Earnings account ID
    p_retained_acc_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_net_income      NUMERIC := 0;
    v_revenue_total   NUMERIC := 0;
    v_expense_total   NUMERIC := 0;
    v_closing_journal UUID;
    v_periods_locked  INTEGER := 0;
    v_closing_date    DATE;
    v_opening_date    DATE;
BEGIN
    -- -------------------------------------------------------------------
    -- تحقق من الصلاحية  |  Permission check (admin/super_admin only)
    -- -------------------------------------------------------------------
    IF public.get_my_role() NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION
            'YEAR_END_ACCESS_DENIED: فقط المدير أو السوبر أدمين يمكنه تنفيذ الإقفال السنوي';
    END IF;

    v_closing_date := MAKE_DATE(p_closing_year, 12, 31);
    v_opening_date := MAKE_DATE(p_closing_year + 1, 1, 1);

    RAISE NOTICE '[run_year_end_closing] Starting year-end close for org % year % / بدء إقفال سنة %',
        p_org_id, p_closing_year, p_closing_year;

    -- -------------------------------------------------------------------
    -- التحقق من عدم وجود فترات مفتوحة  |  Guard: no open periods allowed
    -- -------------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM public.accounting_periods
        WHERE organization_id = p_org_id
          AND fiscal_year     = p_closing_year
          AND status          = 'open'
    ) THEN
        RAISE EXCEPTION
            'OPEN_PERIODS_EXIST: يوجد فترات مفتوحة في سنة %. يجب إغلاقها أولاً.',
            p_closing_year;
    END IF;

    -- -------------------------------------------------------------------
    -- حساب الإيرادات والمصاريف وصافي الدخل
    -- Calculate revenues, expenses and net income for the closing year
    -- -------------------------------------------------------------------
    SELECT
        COALESCE(
            SUM(CASE WHEN a.type = 'REVENUE'
                     THEN jl.credit - jl.debit
                     ELSE 0
                END), 0
        ),
        COALESCE(
            SUM(CASE WHEN a.type = 'EXPENSE'
                     THEN jl.debit - jl.credit
                     ELSE 0
                END), 0
        )
    INTO v_revenue_total, v_expense_total
    FROM public.journal_lines  jl
    JOIN public.journal_entries je ON je.id  = jl.journal_entry_id
    JOIN public.accounts        a  ON a.id   = jl.account_id
    WHERE je.organization_id = p_org_id
      AND je.status          = 'posted'
      AND je.transaction_date
              BETWEEN MAKE_DATE(p_closing_year, 1, 1) AND v_closing_date;

    v_net_income := v_revenue_total - v_expense_total;

    RAISE NOTICE '[run_year_end_closing] Revenue: % | Expenses: % | Net Income: % / الإيرادات: % | المصاريف: % | صافي الدخل: %',
        v_revenue_total, v_expense_total, v_net_income,
        v_revenue_total, v_expense_total, v_net_income;

    -- -------------------------------------------------------------------
    -- إنشاء قيد إقفال الدخل الصافي للأرباح المحتجزة
    -- Create closing journal: net income → retained earnings
    -- -------------------------------------------------------------------
    INSERT INTO public.journal_entries (
        transaction_date,
        description,
        reference,
        status,
        organization_id,
        is_posted
    )
    VALUES (
        v_closing_date,
        'قيد إقفال سنة ' || p_closing_year || ' — تحويل صافي الدخل',
        'YE-CLOSE-' || p_closing_year,
        'posted',
        p_org_id,
        TRUE
    )
    RETURNING id INTO v_closing_journal;

    RAISE NOTICE '[run_year_end_closing] Closing journal entry created: % / تم إنشاء قيد الإقفال',
        v_closing_journal;

    -- -------------------------------------------------------------------
    -- سطر تحويل صافي الدخل إلى الأرباح المحتجزة
    -- Journal line: credit retained earnings with net income (debit if loss)
    -- -------------------------------------------------------------------
    INSERT INTO public.journal_lines (
        journal_entry_id,
        account_id,
        -- مدين إذا كانت خسارة، دائن إذا كان ربح
        debit,
        credit,
        description,
        organization_id
    )
    VALUES (
        v_closing_journal,
        p_retained_acc_id,
        CASE WHEN v_net_income >= 0 THEN 0            ELSE ABS(v_net_income) END,
        CASE WHEN v_net_income >= 0 THEN v_net_income ELSE 0                 END,
        'تحويل صافي الدخل لسنة ' || p_closing_year,
        p_org_id
    );

    RAISE NOTICE '[run_year_end_closing] Retained earnings line inserted / تم إدراج سطر الأرباح المحتجزة';

    -- -------------------------------------------------------------------
    -- قفل جميع الفترات المتبقية للسنة المُقفَلة
    -- Lock any remaining unlocked periods for the closing year
    -- -------------------------------------------------------------------
    UPDATE public.accounting_periods
    SET
        status    = 'closed',
        closed_at = NOW(),
        closed_by = auth.uid()
    WHERE organization_id = p_org_id
      AND fiscal_year     = p_closing_year
      AND status         != 'closed';

    GET DIAGNOSTICS v_periods_locked = ROW_COUNT;

    RAISE NOTICE '[run_year_end_closing] Periods locked: % / عدد الفترات المُقفَلة: %',
        v_periods_locked, v_periods_locked;

    -- -------------------------------------------------------------------
    -- إرجاع تقرير الإقفال  |  Return closing summary report
    -- -------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',         TRUE,
        'closing_year',    p_closing_year,
        'closing_date',    v_closing_date,
        'opening_date',    v_opening_date,
        'net_income',      v_net_income,
        'revenue_total',   v_revenue_total,
        'expense_total',   v_expense_total,
        'periods_closed',  v_periods_locked,
        'closing_journal', v_closing_journal,
        'message',
            'تم إقفال سنة ' || p_closing_year ||
            ' بنجاح. صافي الدخل: ' || v_net_income
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'run_year_end_closing ERROR: % | %', SQLERRM, SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_year_end_closing(UUID, INTEGER, UUID)
    TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '[2.1] Function public.run_year_end_closing() created and granted / تم إنشاء دالة الإقفال السنوي';
    RAISE NOTICE '=== Migration 2026-10-04_fix6 completed successfully / اكتمل الترحيل بنجاح ===';
END;
$$;
