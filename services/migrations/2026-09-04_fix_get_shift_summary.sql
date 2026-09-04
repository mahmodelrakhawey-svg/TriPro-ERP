-- ==============================================================================
-- TriPro ERP — Patch: Fix get_shift_summary to use public_shift_id
-- Date: 2026-09-04
-- المشكلة: get_shift_summary تبحث بـ shift_id القديم (cashier_shifts) لكن
--           السجلات الجديدة تُخزن في public_shift_id (public.shifts UUID)
--           → السحوبات لا تُخصم من expected_cash → يرى الكاشير رقماً خاطئاً
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift        RECORD;
    v_start_time   TIMESTAMPTZ;
    v_end_time     TIMESTAMPTZ;
    v_summary      JSONB;
    v_petty_cash   NUMERIC := 0;
    v_cash_returns NUMERIC := 0;
    v_org_id       UUID;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية غير موجودة: %', p_shift_id;
    END IF;

    v_start_time := v_shift.start_time;
    v_end_time   := COALESCE(v_shift.end_time, now());
    v_org_id     := v_shift.organization_id;

    -- ─── جلب إجمالي المسحوبات ────────────────────────────────────────────────
    -- يبحث أولاً بـ public_shift_id (الطريقة الجديدة)
    -- ثم بـ shift_id::text كـ fallback للسجلات القديمة
    SELECT COALESCE(SUM(amount), 0) INTO v_petty_cash
    FROM public.pos_petty_cash_payouts
    WHERE public_shift_id = p_shift_id
       OR shift_id::text = p_shift_id::text;

    -- دعم تكميلي: قيود اليومية المرجع PC-% إن لم يوجد سجلات
    IF v_petty_cash = 0 THEN
        SELECT COALESCE(SUM(jl.credit), 0) INTO v_petty_cash
        FROM public.journal_entries je
        JOIN public.journal_lines jl ON je.id = jl.journal_entry_id
        JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.reference LIKE 'PC-%'
          AND je.organization_id = v_org_id
          AND (a.code = '1231' OR a.code LIKE '1231%' OR a.code = '1101' OR a.name LIKE '%صندوق%')
          AND je.created_at >= v_start_time
          AND je.created_at <= v_end_time;
    END IF;

    -- ─── جلب مرتجعات المبيعات النقدية ───────────────────────────────────────
    SELECT COALESCE(SUM(sr.total_amount), 0) INTO v_cash_returns
    FROM public.sales_returns sr
    WHERE (
        sr.shift_id = p_shift_id
        OR (
            sr.user_id = v_shift.user_id
            AND sr.created_at >= v_start_time
            AND sr.created_at <= v_end_time
            AND (sr.organization_id = v_org_id OR sr.organization_id IS NULL)
        )
    )
    AND (
        sr.refund_method = 'CASH'
        OR sr.refund_method IS NULL
        OR sr.notes LIKE '%نقدي%'
    );

    -- ─── بناء الملخص الإجمالي ────────────────────────────────────────────────
    SELECT jsonb_build_object(
        'opening_balance', v_shift.opening_balance,
        'total_sales',     COALESCE(SUM(p.amount), 0),
        'cash_sales',      COALESCE(SUM(CASE WHEN UPPER(p.payment_method) = 'CASH'   THEN p.amount ELSE 0 END), 0),
        'card_sales',      COALESCE(SUM(CASE WHEN UPPER(p.payment_method) = 'CARD'   THEN p.amount ELSE 0 END), 0),
        'wallet_sales',    COALESCE(SUM(CASE WHEN UPPER(p.payment_method) = 'WALLET' THEN p.amount ELSE 0 END), 0),
        'petty_cash',      v_petty_cash,
        'cash_returns',    v_cash_returns,
        'expected_cash',   (
            COALESCE(v_shift.opening_balance, 0)
            + COALESCE(SUM(CASE WHEN UPPER(p.payment_method) = 'CASH' THEN p.amount ELSE 0 END), 0)
            - v_petty_cash
            - v_cash_returns
        )
    ) INTO v_summary
    FROM public.payments p
    JOIN public.orders   o ON p.order_id = o.id
    WHERE (
            o.shift_id = p_shift_id
            OR (
                o.user_id    = v_shift.user_id
                AND o.created_at >= v_start_time
                AND o.created_at <= v_end_time
            )
          )
      AND o.status  IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
      AND p.status   = 'COMPLETED';

    RETURN v_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shift_summary(uuid) TO authenticated;
