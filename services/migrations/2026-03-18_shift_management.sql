-- =================================================================
-- TriPro ERP - Phase 2: Shift Management & Z-Report
-- التاريخ: 18 مارس 2026
-- الوصف: دوال إدارة الورديات (فتح، تقرير، إغلاق)
-- =================================================================

-- 1. دالة لبدء وردية جديدة
CREATE OR REPLACE FUNCTION public.start_shift(
    p_user_id UUID,
    p_opening_balance NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_shift_id UUID;
    v_new_shift_id UUID;
BEGIN
    -- التحقق مما إذا كانت هناك وردية مفتوحة بالفعل للمستخدم
    SELECT id INTO v_existing_shift_id
    FROM public.shifts
    WHERE user_id = p_user_id AND end_time IS NULL
    LIMIT 1;

    IF v_existing_shift_id IS NOT NULL THEN
        RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم (ID: %)', v_existing_shift_id;
    END IF;

    -- إنشاء وردية جديدة
    INSERT INTO public.shifts (user_id, start_time, opening_balance)
    VALUES (p_user_id, now(), p_opening_balance)
    RETURNING id INTO v_new_shift_id;

    RETURN v_new_shift_id;
END;
$$;

-- 2. دالة للحصول على ملخص الوردية (Z-Report Logic)
-- تقوم هذه الدالة بتجميع مبيعات الكاشير خلال فترته
CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_shift RECORD;
    v_start_time TIMESTAMPTZ;
    v_end_time TIMESTAMPTZ;
    v_summary JSONB;
BEGIN
    -- جلب تفاصيل الوردية
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'الوردية غير موجودة';
    END IF;

    v_start_time := v_shift.start_time;
    v_end_time := COALESCE(v_shift.end_time, now()); -- إذا كانت مفتوحة، نستخدم الوقت الحالي

    -- حساب الإجماليات من جدول المدفوعات المرتبط بطلبات المستخدم في الفترة الزمنية
    SELECT jsonb_build_object(
        'opening_balance', v_shift.opening_balance,
        'total_sales', COALESCE(SUM(p.amount), 0),
        'cash_sales', COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount ELSE 0 END), 0),
        'card_sales', COALESCE(SUM(CASE WHEN p.payment_method = 'CARD' THEN p.amount ELSE 0 END), 0),
        'wallet_sales', COALESCE(SUM(CASE WHEN p.payment_method = 'WALLET' THEN p.amount ELSE 0 END), 0),
        'expected_cash', v_shift.opening_balance + COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount ELSE 0 END), 0)
    ) INTO v_summary
    FROM public.payments p
    JOIN public.orders o ON p.order_id = o.id
    WHERE o.user_id = v_shift.user_id
      AND o.created_at >= v_start_time
      AND o.created_at <= v_end_time
      AND p.status = 'COMPLETED';

    RETURN v_summary;
END;
$$;

-- 3. دالة لإغلاق الوردية
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id UUID,
    p_actual_cash NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_summary JSONB;
    v_expected_cash NUMERIC;
BEGIN
    -- أ. حساب المتوقع قبل الإغلاق لضمان الدقة
    v_summary := public.get_shift_summary(p_shift_id);
    v_expected_cash := (v_summary->>'expected_cash')::NUMERIC;

    -- ب. تحديث سجل الوردية بالإغلاق والفروقات
    UPDATE public.shifts
    SET 
        end_time = now(),
        closing_balance = p_actual_cash, -- المبلغ الموجود فعلياً في الدرج
        expected_cash = v_expected_cash, -- المبلغ المفترض وجوده
        actual_cash = p_actual_cash,
        difference = p_actual_cash - v_expected_cash, -- الفرق (عجز بالسالب أو زيادة بالموجب)
        notes = p_notes
    WHERE id = p_shift_id;
END;
$$;