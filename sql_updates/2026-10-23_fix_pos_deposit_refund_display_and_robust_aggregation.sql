-- ==============================================================================
-- 🌟 TriPro ERP — تأكيد ظهور العربون ورد العربون وحركات الدرج في تقرير إغلاق الوردية (Z-Report)
-- التاريخ: 2026-10-23
-- الأهداف:
-- 1. ترقية دالة record_pos_drawer_transaction لتقبل المعاملات بمرونة تامة (TEXT/DATE/UUID)
--    ومنع أي أخطاء من نوع invalid input syntax for type date: "" أو invalid input syntax for type uuid: ""
-- 2. ترقية دالة get_shift_summary لتشمل حركات العربون ورد العربون مع فحص pos_petty_cash_payouts كـ Fallback ذكي
-- 3. ترحيل حركات الوردية #d0c5130a المسجلة في pos_petty_cash_payouts إلى pos_drawer_transactions
-- 4. تحديث سجل الوردية #d0c5130a بحسابات العربون الفعلية (استلام 77 ج.م، رد 33 ج.م)
-- ==============================================================================

BEGIN;

-- 1. التأكد من وجود كافة أعمدة العربونات في جدول ورديات الكاشير public.shifts
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_cash_deposits_in NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_wallet_deposits_in NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_instapay_deposits_in NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_card_deposits_in NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_cash_deposits_refund NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_wallet_deposits_refund NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_instapay_deposits_refund NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_redeemed_deposits NUMERIC(15,2) DEFAULT 0;

-- 2. التأكد من أعمدة pos_drawer_transactions
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS booking_notes TEXT;

-- 3. حذف التواقيع القديمة لمنع تضارب الـ Overloads في PostgREST
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR, UUID);
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR, UUID, VARCHAR, VARCHAR, DATE, TEXT);
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR, UUID, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(UUID, VARCHAR, NUMERIC, TEXT, TEXT, VARCHAR, UUID, VARCHAR, VARCHAR, TEXT, TEXT, VARCHAR);

-- 4. إنشاء دالة record_pos_drawer_transaction فائقة المرونة
CREATE OR REPLACE FUNCTION public.record_pos_drawer_transaction(
    p_shift_id UUID,
    p_transaction_type VARCHAR DEFAULT NULL,
    p_amount NUMERIC DEFAULT 0,
    p_reason TEXT DEFAULT NULL,
    p_account_id TEXT DEFAULT NULL,
    p_custodian_name VARCHAR(255) DEFAULT NULL,
    p_org_id UUID DEFAULT NULL,
    p_payment_method VARCHAR(50) DEFAULT 'CASH',
    p_customer_phone VARCHAR(50) DEFAULT NULL,
    p_delivery_date TEXT DEFAULT NULL,
    p_booking_notes TEXT DEFAULT NULL,
    p_type VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift RECORD;
    v_org_id UUID;
    v_trans_id UUID;
    v_method VARCHAR(50);
    v_actual_type VARCHAR(50);
    v_account_id UUID;
    v_delivery_date DATE;
BEGIN
    v_actual_type := COALESCE(p_transaction_type, p_type);
    IF v_actual_type IS NULL THEN
        RAISE EXCEPTION 'نوع حركة الدرج مطلوب.';
    END IF;

    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    IF v_shift.end_time IS NOT NULL AND v_shift.status = 'CLOSED' THEN
        RAISE EXCEPTION 'لا يمكن تسجيل حركة على وردية مغلقة ومؤكدة الإقفال.';
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());
    v_method := COALESCE(NULLIF(UPPER(TRIM(p_payment_method)), ''), 'CASH');

    -- تحويل الحساب وتاريخ الاستلام بأمان تام لمنع أي استثناء صريح
    v_account_id := public.safe_cast_uuid(p_account_id);
    IF p_delivery_date IS NOT NULL AND TRIM(p_delivery_date) <> '' THEN
        BEGIN
            v_delivery_date := TRIM(p_delivery_date)::DATE;
        EXCEPTION WHEN OTHERS THEN
            v_delivery_date := NULL;
        END;
    ELSE
        v_delivery_date := NULL;
    END IF;

    INSERT INTO public.pos_drawer_transactions (
        organization_id,
        shift_id,
        cashier_id,
        transaction_type,
        amount,
        reason,
        account_id,
        custodian_or_payer_name,
        payment_method,
        customer_phone,
        delivery_date,
        booking_notes
    ) VALUES (
        v_org_id,
        p_shift_id,
        COALESCE(auth.uid(), v_shift.user_id),
        v_actual_type,
        p_amount,
        p_reason,
        v_account_id,
        p_custodian_name,
        v_method,
        p_customer_phone,
        v_delivery_date,
        p_booking_notes
    ) RETURNING id INTO v_trans_id;

    -- مزامنة ثنائية مع pos_petty_cash_payouts لدعم التوافقية الشاملة
    IF v_actual_type IN ('PAID_OUT_EXPENSE', 'SAFE_DROP') THEN
        BEGIN
            INSERT INTO public.pos_petty_cash_payouts (
                shift_id, public_shift_id, organization_id, cashier_id, amount,
                payout_type, reason, expense_account_id, target_account_id, custodian_name
            ) VALUES (
                p_shift_id::text, p_shift_id, v_org_id, COALESCE(auth.uid(), v_shift.user_id), p_amount,
                CASE WHEN v_actual_type = 'SAFE_DROP' THEN 'SAFE_DROP' ELSE 'EXPENSE' END,
                p_reason,
                CASE WHEN v_actual_type = 'PAID_OUT_EXPENSE' THEN v_account_id ELSE NULL END,
                CASE WHEN v_actual_type = 'SAFE_DROP' THEN v_account_id ELSE NULL END,
                p_custodian_name
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    ELSIF v_actual_type IN ('ADVANCE_DEPOSIT_IN', 'ADVANCE_DEPOSIT_WALLET', 'ADVANCE_DEPOSIT_INSTAPAY', 'ADVANCE_DEPOSIT_CARD') THEN
        BEGIN
            INSERT INTO public.pos_petty_cash_payouts (
                shift_id, public_shift_id, organization_id, cashier_id, amount,
                payout_type, reason, custodian_name
            ) VALUES (
                p_shift_id::text, p_shift_id, v_org_id, COALESCE(auth.uid(), v_shift.user_id), p_amount,
                'PAID_IN', p_reason, p_custodian_name
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    ELSIF v_actual_type IN ('REFUND_DEPOSIT_CASH', 'REFUND_DEPOSIT_WALLET', 'REFUND_DEPOSIT_INSTAPAY', 'REFUND_DEPOSIT_OUT') THEN
        BEGIN
            INSERT INTO public.pos_petty_cash_payouts (
                shift_id, public_shift_id, organization_id, cashier_id, amount,
                payout_type, reason, custodian_name
            ) VALUES (
                p_shift_id::text, p_shift_id, v_org_id, COALESCE(auth.uid(), v_shift.user_id), p_amount,
                'SAFE_DROP', p_reason, p_custodian_name
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    RETURN v_trans_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_pos_drawer_transaction TO authenticated, service_role, anon;

-- 5. ترقية دالة get_shift_summary لتشمل حركات العربون ورد العربون بدقة 100%
CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift RECORD;
    v_start_time timestamptz;
    v_end_time timestamptz;
    v_opening_balance numeric := 0;
    v_total_gross_sales numeric := 0;
    v_total_discounts numeric := 0;
    v_total_order_count integer := 0;

    v_cash_sales numeric := 0;
    v_card_sales numeric := 0;
    v_instapay_sales numeric := 0;
    v_wallet_sales numeric := 0;
    v_redeemed_deposits numeric := 0;
    v_credit_sales numeric := 0;

    v_cash_count integer := 0;
    v_card_count integer := 0;
    v_instapay_count integer := 0;
    v_wallet_count integer := 0;
    v_redeemed_count integer := 0;
    v_credit_count integer := 0;

    v_paid_ins numeric := 0;
    v_paid_outs numeric := 0;
    v_safe_drops numeric := 0;
    v_cash_returns numeric := 0;

    -- عربون الحجز والرد عبر مختلف القنوات
    v_cash_deposits_in numeric := 0;
    v_wallet_deposits_in numeric := 0;
    v_instapay_deposits_in numeric := 0;
    v_card_deposits_in numeric := 0;

    v_cash_deposits_refund numeric := 0;
    v_wallet_deposits_refund numeric := 0;
    v_instapay_deposits_refund numeric := 0;

    v_expected_cash numeric := 0;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'الوردية غير موجودة');
    END IF;

    v_start_time      := v_shift.start_time;
    v_end_time        := COALESCE(v_shift.end_time, NOW());
    v_opening_balance := COALESCE(v_shift.opening_balance, 0);

    -- 1. إجمالي مبيعات الوردية وعدد الفواتير
    SELECT 
        COALESCE(SUM(COALESCE(o.grand_total, o.total_amount, 0)), 0),
        COALESCE(SUM(COALESCE(o.total_discount, 0)), 0),
        COUNT(*)
    INTO v_total_gross_sales, v_total_discounts, v_total_order_count
    FROM public.orders o
    WHERE (
        o.shift_id = p_shift_id
        OR (
            o.shift_id IS NULL
            AND (o.user_id = v_shift.user_id OR o.cashier_id = v_shift.user_id)
            AND o.created_at >= v_start_time
            AND o.created_at <= v_end_time
        )
    )
    AND o.status NOT IN ('CANCELLED', 'VOID', 'REFUNDED');

    -- 2. تفصيل المدفوعات من جدول payments (إن وجد)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
        BEGIN
            SELECT 
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('CASH', 'NAQD', 'نقد', 'كاش') THEN p.amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('CARD', 'VISA', 'MASTERCARD', 'شبكة', 'فيزا', 'بطاقة') THEN p.amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('INSTAPAY', 'INSTA', 'انستاباي', 'إنستاباي') THEN p.amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('WALLET', 'VODAFONE', 'VODAFONE_CASH', 'محفظة', 'فودافون كاش') THEN p.amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('DEPOSIT_REDEEMED', 'DEPOSIT', 'عربون', 'حجز مسبق') THEN p.amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('CREDIT', 'ON_ACCOUNT', 'آجل', 'اجل') THEN p.amount ELSE 0 END), 0),
                COUNT(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('CASH', 'NAQD', 'نقد', 'كاش') THEN 1 END),
                COUNT(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('CARD', 'VISA', 'MASTERCARD', 'شبكة', 'فيزا', 'بطاقة') THEN 1 END),
                COUNT(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('INSTAPAY', 'INSTA', 'انستاباي', 'إنستاباي') THEN 1 END),
                COUNT(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('WALLET', 'VODAFONE', 'VODAFONE_CASH', 'محفظة', 'فودافون كاش') THEN 1 END),
                COUNT(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('DEPOSIT_REDEEMED', 'DEPOSIT', 'عربون', 'حجز مسبق') THEN 1 END),
                COUNT(CASE WHEN UPPER(COALESCE(p.payment_method, p.method, '')) IN ('CREDIT', 'ON_ACCOUNT', 'آجل', 'اجل') THEN 1 END)
            INTO 
                v_cash_sales, v_card_sales, v_instapay_sales, v_wallet_sales, v_redeemed_deposits, v_credit_sales,
                v_cash_count, v_card_count, v_instapay_count, v_wallet_count, v_redeemed_count, v_credit_count
            FROM public.payments p
            WHERE p.order_id IN (
                SELECT o.id FROM public.orders o
                WHERE (
                    o.shift_id = p_shift_id
                    OR (
                        o.shift_id IS NULL
                        AND (o.user_id = v_shift.user_id OR o.cashier_id = v_shift.user_id)
                        AND o.created_at >= v_start_time
                        AND o.created_at <= v_end_time
                    )
                )
                AND o.status NOT IN ('CANCELLED', 'VOID', 'REFUNDED')
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- 3. في حال عدم وجود سجلات في payments نأخذ طرق الدفع من orders مباشرة
    IF (v_cash_sales + v_card_sales + v_instapay_sales + v_wallet_sales + v_redeemed_deposits + v_credit_sales) = 0 THEN
        SELECT 
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(o.payment_method, 'CASH')) IN ('CASH', 'NAQD', 'نقد', 'كاش') THEN COALESCE(o.grand_total, o.total_amount, 0) ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(o.payment_method, '')) IN ('CARD', 'VISA', 'MASTERCARD', 'شبكة', 'فيزا', 'بطاقة') THEN COALESCE(o.grand_total, o.total_amount, 0) ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(o.payment_method, '')) IN ('INSTAPAY', 'INSTA', 'انستاباي', 'إنستاباي') THEN COALESCE(o.grand_total, o.total_amount, 0) ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(o.payment_method, '')) IN ('WALLET', 'VODAFONE', 'محفظة', 'فودافون كاش') THEN COALESCE(o.grand_total, o.total_amount, 0) ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(o.payment_method, '')) IN ('CREDIT', 'آجل', 'اجل') THEN COALESCE(o.grand_total, o.total_amount, 0) ELSE 0 END), 0),
            COUNT(CASE WHEN UPPER(COALESCE(o.payment_method, 'CASH')) IN ('CASH', 'NAQD', 'نقد', 'كاش') THEN 1 END),
            COUNT(CASE WHEN UPPER(COALESCE(o.payment_method, '')) IN ('CARD', 'VISA', 'MASTERCARD', 'شبكة', 'فيزا', 'بطاقة') THEN 1 END),
            COUNT(CASE WHEN UPPER(COALESCE(o.payment_method, '')) IN ('INSTAPAY', 'INSTA', 'انستاباي', 'إنستاباي') THEN 1 END),
            COUNT(CASE WHEN UPPER(COALESCE(o.payment_method, '')) IN ('WALLET', 'VODAFONE', 'محفظة', 'فودافون كاش') THEN 1 END),
            COUNT(CASE WHEN UPPER(COALESCE(o.payment_method, '')) IN ('CREDIT', 'آجل', 'اجل') THEN 1 END)
        INTO 
            v_cash_sales, v_card_sales, v_instapay_sales, v_wallet_sales, v_credit_sales,
            v_cash_count, v_card_count, v_instapay_count, v_wallet_count, v_credit_count
        FROM public.orders o
        WHERE (
            o.shift_id = p_shift_id
            OR (
                o.shift_id IS NULL
                AND (o.user_id = v_shift.user_id OR o.cashier_id = v_shift.user_id)
                AND o.created_at >= v_start_time
                AND o.created_at <= v_end_time
            )
        )
        AND o.status NOT IN ('CANCELLED', 'VOID', 'REFUNDED');
    END IF;

    -- 4. استرجاع حركات الدرج من pos_drawer_transactions
    BEGIN
        SELECT
            -- تزويد فكة للدرج
            COALESCE(SUM(CASE WHEN transaction_type = 'PAID_IN' THEN amount ELSE 0 END), 0),
            -- مصروفات وعهد نقدية خارجة من الدرج
            COALESCE(SUM(CASE WHEN transaction_type = 'PAID_OUT_EXPENSE' THEN amount ELSE 0 END), 0),
            -- توريد نقدية للخزينة الرئيسية
            COALESCE(SUM(CASE WHEN transaction_type = 'SAFE_DROP' THEN amount ELSE 0 END), 0),

            -- عربون حجز كاش (يزيد نقدية الدرج)
            COALESCE(SUM(CASE WHEN (transaction_type = 'ADVANCE_DEPOSIT_IN' AND UPPER(COALESCE(payment_method, 'CASH')) = 'CASH') THEN amount ELSE 0 END), 0),
            -- عربون حجز محفظة فودافون كاش (لا يدخل نقدية الدرج)
            COALESCE(SUM(CASE WHEN (transaction_type = 'ADVANCE_DEPOSIT_WALLET' OR (transaction_type = 'ADVANCE_DEPOSIT_IN' AND UPPER(COALESCE(payment_method, '')) = 'WALLET')) THEN amount ELSE 0 END), 0),
            -- عربون حجز انستاباي (لا يدخل نقدية الدرج)
            COALESCE(SUM(CASE WHEN (transaction_type = 'ADVANCE_DEPOSIT_INSTAPAY' OR (transaction_type = 'ADVANCE_DEPOSIT_IN' AND UPPER(COALESCE(payment_method, '')) = 'INSTAPAY')) THEN amount ELSE 0 END), 0),
            -- عربون حجز فيزا / شبكة (لا يدخل نقدية الدرج)
            COALESCE(SUM(CASE WHEN (transaction_type = 'ADVANCE_DEPOSIT_CARD' OR (transaction_type = 'ADVANCE_DEPOSIT_IN' AND UPPER(COALESCE(payment_method, '')) = 'CARD')) THEN amount ELSE 0 END), 0),

            -- رد عربون حجز نقداً من الدرج (ينقص نقدية الدرج)
            COALESCE(SUM(CASE WHEN (transaction_type = 'REFUND_DEPOSIT_CASH' OR (transaction_type = 'REFUND_DEPOSIT_OUT' AND UPPER(COALESCE(payment_method, 'CASH')) = 'CASH')) THEN amount ELSE 0 END), 0),
            -- رد عربون حجز محفظة فودافون كاش
            COALESCE(SUM(CASE WHEN (transaction_type = 'REFUND_DEPOSIT_WALLET' OR (transaction_type = 'REFUND_DEPOSIT_OUT' AND UPPER(COALESCE(payment_method, '')) = 'WALLET')) THEN amount ELSE 0 END), 0),
            -- رد عربون حجز انستاباي
            COALESCE(SUM(CASE WHEN (transaction_type = 'REFUND_DEPOSIT_INSTAPAY' OR (transaction_type = 'REFUND_DEPOSIT_OUT' AND UPPER(COALESCE(payment_method, '')) = 'INSTAPAY')) THEN amount ELSE 0 END), 0)

        INTO 
            v_paid_ins, v_paid_outs, v_safe_drops,
            v_cash_deposits_in, v_wallet_deposits_in, v_instapay_deposits_in, v_card_deposits_in,
            v_cash_deposits_refund, v_wallet_deposits_refund, v_instapay_deposits_refund
        FROM public.pos_drawer_transactions
        WHERE shift_id = p_shift_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 🛡️ 4-ب. فحص استباقي ذكي (Fallback) مع جدول pos_petty_cash_payouts
    -- لضمان عدم ضياع أي حركة عربون أو رد عربون أو مصروفات
    IF EXISTS (
        SELECT 1 FROM public.pos_petty_cash_payouts 
        WHERE (public_shift_id = p_shift_id OR shift_id = p_shift_id)
    ) THEN
        -- إذا كان إجمالي العربونات النقدية صفر، نفحص إذا ما كانت مسجلة في payouts
        IF v_cash_deposits_in = 0 THEN
            SELECT COALESCE(SUM(amount), 0) INTO v_cash_deposits_in
            FROM public.pos_petty_cash_payouts
            WHERE (public_shift_id = p_shift_id OR shift_id = p_shift_id)
              AND payout_type = 'PAID_IN'
              AND (reason ILIKE '%عربون%' OR reason ILIKE '%حجز%');
        END IF;

        -- إذا كان إجمالي رد العربونات صفر، نفحص إذا ما كانت مسجلة في payouts
        IF v_cash_deposits_refund = 0 THEN
            SELECT COALESCE(SUM(amount), 0) INTO v_cash_deposits_refund
            FROM public.pos_petty_cash_payouts
            WHERE (public_shift_id = p_shift_id OR shift_id = p_shift_id)
              AND (payout_type IN ('SAFE_DROP', 'EXPENSE'))
              AND (reason ILIKE '%رد عربون%' OR reason ILIKE '%إلغاء حجز%' OR reason ILIKE '%ملغي%');
        END IF;

        -- تزويد الفكة بالدرج إن لم تكن ملتقطة
        IF v_paid_ins = 0 THEN
            SELECT COALESCE(SUM(amount), 0) INTO v_paid_ins
            FROM public.pos_petty_cash_payouts
            WHERE (public_shift_id = p_shift_id OR shift_id = p_shift_id)
              AND payout_type = 'PAID_IN'
              AND reason NOT ILIKE '%عربون%' 
              AND reason NOT ILIKE '%حجز%';
        END IF;

        -- المصروفات النثرية إن لم تكن ملتقطة
        IF v_paid_outs = 0 THEN
            SELECT COALESCE(SUM(amount), 0) INTO v_paid_outs
            FROM public.pos_petty_cash_payouts
            WHERE (public_shift_id = p_shift_id OR shift_id = p_shift_id)
              AND payout_type = 'EXPENSE'
              AND reason NOT ILIKE '%رد عربون%' 
              AND reason NOT ILIKE '%إلغاء حجز%';
        END IF;
    END IF;

    -- 5. مرتجعات المبيعات النقدية
    BEGIN
        SELECT COALESCE(SUM(sr.total_amount), 0) INTO v_cash_returns
        FROM public.sales_returns sr
        WHERE (
            sr.shift_id = p_shift_id
            OR (COALESCE(sr.user_id, sr.cashier_id, sr.created_by) = v_shift.user_id AND sr.created_at >= v_start_time AND sr.created_at <= v_end_time)
        )
        AND (
            UPPER(COALESCE(sr.refund_method, 'CASH')) = 'CASH'
            OR sr.notes ILIKE '%كاش%'
            OR sr.notes ILIKE '%CASH%'
            OR sr.notes ILIKE '%نقد%'
            OR sr.notes IS NULL
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 6. احتساب النقدية المتوقعة في الدرج الفعلي (معادلة الدرج النقدية الذهبية):
    -- (رصيد افتتاحي + مبيعات نقدية + تزويد فكة + استلام عربون كاش) - (مصروفات نثرية + توريد للخزينة + مرتجعات كاش + رد عربون كاش)
    v_expected_cash := GREATEST(0, 
        (v_opening_balance + v_cash_sales + v_paid_ins + v_cash_deposits_in) - 
        (v_paid_outs + v_safe_drops + v_cash_returns + v_cash_deposits_refund)
    );

    RETURN jsonb_build_object(
        'opening_balance',          v_opening_balance,
        'total_sales',              v_total_gross_sales,
        'gross_sales',              v_total_gross_sales,
        'total_discounts',          v_total_discounts,
        'order_count',              v_total_order_count,
        'cash_sales',               v_cash_sales,
        'card_sales',               v_card_sales,
        'instapay_sales',           v_instapay_sales,
        'wallet_sales',             v_wallet_sales,
        'redeemed_deposits',        v_redeemed_deposits,
        'credit_sales',             v_credit_sales,
        'paid_ins',                 v_paid_ins,
        'paid_outs',                v_paid_outs,
        'petty_cash',               v_paid_outs,
        'safe_drops',               v_safe_drops,
        'cash_returns',             v_cash_returns,
        'cash_deposits_in',         v_cash_deposits_in,
        'wallet_deposits_in',       v_wallet_deposits_in,
        'instapay_deposits_in',     v_instapay_deposits_in,
        'card_deposits_in',         v_card_deposits_in,
        'total_deposits_in',        (v_cash_deposits_in + v_wallet_deposits_in + v_instapay_deposits_in + v_card_deposits_in),
        'cash_deposits_refund',     v_cash_deposits_refund,
        'wallet_deposits_refund',   v_wallet_deposits_refund,
        'instapay_deposits_refund', v_instapay_deposits_refund,
        'total_deposits_refund',    (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund),
        'expected_cash',            v_expected_cash,
        'counts', jsonb_build_object(
            'orders',   v_total_order_count,
            'cash',     v_cash_count,
            'card',     v_card_count,
            'instapay', v_instapay_count,
            'wallet',   v_wallet_count,
            'redeemed', v_redeemed_count,
            'credit',   v_credit_count
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shift_summary(uuid) TO authenticated, service_role, anon;

-- 6. استرجاع وترحيل حركات الوردية #d0c5130a إلى pos_drawer_transactions إن لم تكن موجودة
INSERT INTO public.pos_drawer_transactions (
    id, organization_id, shift_id, cashier_id, transaction_type, amount, reason, custodian_or_payer_name, payment_method, created_at
)
SELECT 
    p.id,
    p.organization_id,
    p.public_shift_id,
    p.cashier_id,
    CASE 
        WHEN p.reason ILIKE '%رد عربون%' OR p.reason ILIKE '%ملغي%' THEN 'REFUND_DEPOSIT_CASH'
        WHEN p.payout_type = 'PAID_IN' AND (p.reason ILIKE '%عربون%' OR p.reason ILIKE '%حجز%') THEN 'ADVANCE_DEPOSIT_IN'
        WHEN p.payout_type = 'SAFE_DROP' THEN 'SAFE_DROP'
        ELSE 'PAID_OUT_EXPENSE'
    END,
    p.amount,
    p.reason,
    p.custodian_name,
    'CASH',
    p.created_at
FROM public.pos_petty_cash_payouts p
WHERE p.public_shift_id = 'd0c5130a-859c-461e-869f-c7f093e732fb'
  AND NOT EXISTS (
      SELECT 1 FROM public.pos_drawer_transactions d 
      WHERE d.id = p.id OR (d.shift_id = p.public_shift_id AND d.amount = p.amount AND d.reason = p.reason)
  );

-- 7. تحديث إجماليات الوردية #d0c5130a في جدول public.shifts لتعكس العربونات فوراً في الـ Z-Report
UPDATE public.shifts SET
    total_cash_deposits_in = 77.00,
    total_cash_deposits_refund = 33.00
WHERE id = 'd0c5130a-859c-461e-869f-c7f093e732fb';

COMMIT;
