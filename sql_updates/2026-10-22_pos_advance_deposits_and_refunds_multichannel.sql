-- ==============================================================================
-- 💎 TriPro ERP • Multi-Channel Advance Deposits & Refunds for POS & Cashier
-- التاريخ: 2026-10-22
-- التحديث:
-- 1. دعم استلام العربون بكافة الطرق (نقداً، محفظة فودافون، إنستاباي، فيزا)
-- 2. دعم رد وإلغاء العربون للعميل (نقداً من الدرج، أو إلكترونياً بالمحفظة/إنستاباي)
-- 3. عزل الحركات غير النقدية عن نقدية الدرج لمنع العجز الوهمي في الوردية
-- 4. إثبات القيود المحاسبية التلقائية بدقة متوازنة 100% في قيد إغلاق الوردية
-- ==============================================================================

-- 1. إضافة الأعمدة المطلوبة لجدول حركات الدرج pos_drawer_transactions
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'CASH';
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS booking_notes TEXT;

-- 2. ترقية دالة تسجيل حركة الدرج record_pos_drawer_transaction
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR, UUID);
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR, UUID, VARCHAR, VARCHAR, DATE, TEXT);
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR, UUID, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR);

CREATE OR REPLACE FUNCTION public.record_pos_drawer_transaction(
    p_shift_id UUID,
    p_transaction_type VARCHAR DEFAULT NULL,
    p_amount NUMERIC DEFAULT 0,
    p_reason TEXT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_custodian_name VARCHAR(255) DEFAULT NULL,
    p_org_id UUID DEFAULT NULL,
    p_payment_method VARCHAR(50) DEFAULT 'CASH',
    p_customer_phone VARCHAR(50) DEFAULT NULL,
    p_delivery_date DATE DEFAULT NULL,
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
        RAISE EXCEPTION 'لا يمكن تسجيل حركة على وردية مغلقة ومؤرخة بالفعل.';
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());
    v_method := COALESCE(NULLIF(UPPER(TRIM(p_payment_method)), ''), 'CASH');

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
        auth.uid(),
        v_actual_type,
        p_amount,
        p_reason,
        p_account_id,
        p_custodian_name,
        v_method,
        p_customer_phone,
        p_delivery_date,
        p_booking_notes
    ) RETURNING id INTO v_trans_id;

    -- التوافق مع pos_petty_cash_payouts إن وجد
    IF v_actual_type IN ('PAID_OUT_EXPENSE', 'SAFE_DROP') THEN
        BEGIN
            INSERT INTO public.pos_petty_cash_payouts (
                shift_id, organization_id, cashier_id, amount,
                payout_type, reason, expense_account_id, target_account_id, custodian_name
            ) VALUES (
                p_shift_id, v_org_id, auth.uid(), p_amount,
                CASE WHEN v_actual_type = 'SAFE_DROP' THEN 'SAFE_DROP' ELSE 'EXPENSE' END,
                p_reason,
                CASE WHEN v_actual_type = 'PAID_OUT_EXPENSE' THEN p_account_id ELSE NULL END,
                CASE WHEN v_actual_type = 'SAFE_DROP' THEN p_account_id ELSE NULL END,
                p_custodian_name
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    RETURN v_trans_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_pos_drawer_transaction TO authenticated, service_role, anon;


-- 3. ترقية دالة ملخص الوردية get_shift_summary لفصل العربونات النقدية عن الإلكترونية بدقة
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

    -- تفاصيل العربونات المستلمة والمردودة
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

    -- أ. مبيعات الوردية
    CREATE TEMP TABLE temp_summary_orders ON COMMIT DROP AS
    SELECT 
        o.id,
        COALESCE(o.grand_total, o.total_amount, 0)::numeric as grand_total,
        COALESCE(o.total_discount, 0)::numeric as total_discount,
        o.payment_method
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

    SELECT 
        COALESCE(SUM(grand_total), 0),
        COALESCE(SUM(total_discount), 0),
        COUNT(*)
    INTO v_total_gross_sales, v_total_discounts, v_total_order_count
    FROM temp_summary_orders;

    -- مبيعات القنوات المختلفة من جدول payments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
        SELECT 
            COALESCE(SUM(CASE WHEN UPPER(method) IN ('CASH', 'NAQD', 'نقد') THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(method) IN ('CARD', 'VISA', 'MASTERCARD', 'فيزا', 'بطاقة') THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(method) IN ('INSTAPAY', 'INSTA', 'إنستاباي', 'انستاباي') THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(method) IN ('WALLET', 'VODAFONE', 'VODAFONE_CASH', 'محفظة', 'فودافون كاش') THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(method) IN ('DEPOSIT_REDEEMED', 'DEPOSIT', 'عربون', 'عربون مستهلك') THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(method) IN ('CREDIT', 'ON_ACCOUNT', 'آجل', 'اجل') THEN amount ELSE 0 END), 0),
            COUNT(CASE WHEN UPPER(method) IN ('CASH', 'NAQD', 'نقد') THEN 1 END),
            COUNT(CASE WHEN UPPER(method) IN ('CARD', 'VISA', 'MASTERCARD', 'فيزا', 'بطاقة') THEN 1 END),
            COUNT(CASE WHEN UPPER(method) IN ('INSTAPAY', 'INSTA', 'إنستاباي', 'انستاباي') THEN 1 END),
            COUNT(CASE WHEN UPPER(method) IN ('WALLET', 'VODAFONE', 'VODAFONE_CASH', 'محفظة', 'فودافون كاش') THEN 1 END),
            COUNT(CASE WHEN UPPER(method) IN ('DEPOSIT_REDEEMED', 'DEPOSIT', 'عربون', 'عربون مستهلك') THEN 1 END),
            COUNT(CASE WHEN UPPER(method) IN ('CREDIT', 'ON_ACCOUNT', 'آجل', 'اجل') THEN 1 END)
        INTO 
            v_cash_sales, v_card_sales, v_instapay_sales, v_wallet_sales, v_redeemed_deposits, v_credit_sales,
            v_cash_count, v_card_count, v_instapay_count, v_wallet_count, v_redeemed_count, v_credit_count
        FROM public.payments
        WHERE order_id IN (SELECT id FROM temp_summary_orders);
    END IF;

    -- احتياطي إذا لم توجد مدفوعات مسجلة في payments
    IF (v_cash_sales + v_card_sales + v_instapay_sales + v_wallet_sales + v_redeemed_deposits + v_credit_sales) = 0 THEN
        SELECT 
            COALESCE(SUM(CASE WHEN UPPER(payment_method) IN ('CASH', 'NAQD', 'نقد') THEN grand_total ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(payment_method) IN ('CARD', 'VISA', 'MASTERCARD', 'فيزا', 'بطاقة') THEN grand_total ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(payment_method) IN ('INSTAPAY', 'INSTA', 'إنستاباي', 'انستاباي') THEN grand_total ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(payment_method) IN ('WALLET', 'VODAFONE', 'محفظة', 'فودافون كاش') THEN grand_total ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(payment_method) IN ('CREDIT', 'آجل') THEN grand_total ELSE 0 END), 0),
            COUNT(CASE WHEN UPPER(payment_method) IN ('CASH', 'NAQD', 'نقد') THEN 1 END),
            COUNT(CASE WHEN UPPER(payment_method) IN ('CARD', 'VISA', 'MASTERCARD', 'فيزا', 'بطاقة') THEN 1 END),
            COUNT(CASE WHEN UPPER(payment_method) IN ('INSTAPAY', 'INSTA', 'إنستاباي', 'انستاباي') THEN 1 END),
            COUNT(CASE WHEN UPPER(payment_method) IN ('WALLET', 'VODAFONE', 'محفظة', 'فودافون كاش') THEN 1 END),
            COUNT(CASE WHEN UPPER(payment_method) IN ('CREDIT', 'آجل') THEN 1 END)
        INTO 
            v_cash_sales, v_card_sales, v_instapay_sales, v_wallet_sales, v_credit_sales,
            v_cash_count, v_card_count, v_instapay_count, v_wallet_count, v_credit_count
        FROM temp_summary_orders;
    END IF;

    -- ب. حركات النقدية وحركات العربونات المفصلة من pos_drawer_transactions
    BEGIN
        SELECT
            -- فكة نقدية عادية بالدرج
            COALESCE(SUM(CASE WHEN transaction_type = 'PAID_IN' THEN amount ELSE 0 END), 0),
            -- مصروفات نقدية خارجة من الدرج
            COALESCE(SUM(CASE WHEN transaction_type = 'PAID_OUT_EXPENSE' THEN amount ELSE 0 END), 0),
            -- توريدات نقدية للخزينة
            COALESCE(SUM(CASE WHEN transaction_type = 'SAFE_DROP' THEN amount ELSE 0 END), 0),

            -- عربونات مستلمة نقداً بالدرج (تزيد نقدية الدرج الفعلي)
            COALESCE(SUM(CASE WHEN (transaction_type = 'ADVANCE_DEPOSIT_IN' AND COALESCE(payment_method, 'CASH') = 'CASH') THEN amount ELSE 0 END), 0),
            -- عربونات مستلمة محفظة فودافون (لا تمس نقدية الدرج الورقية)
            COALESCE(SUM(CASE WHEN (transaction_type = 'ADVANCE_DEPOSIT_WALLET' OR (transaction_type = 'ADVANCE_DEPOSIT_IN' AND payment_method = 'WALLET')) THEN amount ELSE 0 END), 0),
            -- عربونات مستلمة إنستاباي (لا تمس نقدية الدرج الورقية)
            COALESCE(SUM(CASE WHEN (transaction_type = 'ADVANCE_DEPOSIT_INSTAPAY' OR (transaction_type = 'ADVANCE_DEPOSIT_IN' AND payment_method = 'INSTAPAY')) THEN amount ELSE 0 END), 0),
            -- عربونات مستلمة فيزا (لا تمس نقدية الدرج الورقية)
            COALESCE(SUM(CASE WHEN (transaction_type = 'ADVANCE_DEPOSIT_CARD' OR (transaction_type = 'ADVANCE_DEPOSIT_IN' AND payment_method = 'CARD')) THEN amount ELSE 0 END), 0),

            -- عربونات مردودة نقداً من الدرج (تنقص نقدية الدرج الفعلي)
            COALESCE(SUM(CASE WHEN (transaction_type = 'REFUND_DEPOSIT_CASH' OR (transaction_type = 'REFUND_DEPOSIT_OUT' AND COALESCE(payment_method, 'CASH') = 'CASH')) THEN amount ELSE 0 END), 0),
            -- عربونات مردودة محفظة
            COALESCE(SUM(CASE WHEN (transaction_type = 'REFUND_DEPOSIT_WALLET' OR (transaction_type = 'REFUND_DEPOSIT_OUT' AND payment_method = 'WALLET')) THEN amount ELSE 0 END), 0),
            -- عربونات مردودة إنستاباي
            COALESCE(SUM(CASE WHEN (transaction_type = 'REFUND_DEPOSIT_INSTAPAY' OR (transaction_type = 'REFUND_DEPOSIT_OUT' AND payment_method = 'INSTAPAY')) THEN amount ELSE 0 END), 0)

        INTO 
            v_paid_ins, v_paid_outs, v_safe_drops,
            v_cash_deposits_in, v_wallet_deposits_in, v_instapay_deposits_in, v_card_deposits_in,
            v_cash_deposits_refund, v_wallet_deposits_refund, v_instapay_deposits_refund
        FROM public.pos_drawer_transactions
        WHERE shift_id = p_shift_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- ج. مرتجعات المبيعات النقدية
    BEGIN
        SELECT COALESCE(SUM(sr.total_amount), 0) INTO v_cash_returns
        FROM public.sales_returns sr
        WHERE (
            sr.shift_id = p_shift_id
            OR (sr.user_id = v_shift.user_id AND sr.created_at >= v_start_time AND sr.created_at <= v_end_time)
        )
        AND (
            sr.refund_method = 'CASH' OR sr.refund_method IS NULL OR sr.notes LIKE '%نقدي%' OR sr.notes LIKE '%CASH%'
        );
    EXCEPTION WHEN OTHERS THEN
        v_cash_returns := 0;
    END;

    -- د. المعادلة المحاسبية الذهبية لنقدية الدرج الفعلي:
    -- النقدية المتوقعة = (افتتاحي + مبيعات كاش + تزويد فكة + عربونات نقدية) - (مصروفات درج + توريد خزينة + مرتجعات نقدية + عربونات مردودة نقداً)
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
        -- العربونات التفصيلية
        'cash_deposits_in',         v_cash_deposits_in,
        'wallet_deposits_in',       v_wallet_deposits_in,
        'instapay_deposits_in',     v_instapay_deposits_in,
        'card_deposits_in',         v_card_deposits_in,
        'total_deposits_in',        (v_cash_deposits_in + v_wallet_deposits_in + v_instapay_deposits_in + v_card_deposits_in),
        'cash_deposits_refund',     v_cash_deposits_refund,
        'wallet_deposits_refund',   v_wallet_deposits_refund,
        'instapay_deposits_refund', v_instapay_deposits_refund,
        'total_deposits_refund',    (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund),
        'expected_cash',            v_expected_cash
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shift_summary(uuid) TO authenticated, service_role, anon;


-- 4. ترقية دالة توليد قيد اليومية المجمع generate_shift_closing_entry للتوازن المحاسبي الكامل
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(
    p_shift_id uuid,
    p_org_id   uuid DEFAULT NULL
)
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
    v_shift                 public.shifts;
    v_org_id                uuid;
    v_summary               jsonb;
    v_je_id                 uuid;
    v_mappings              jsonb;

    -- حسابات الدليل
    v_cash_acc_id           uuid;
    v_safe_acc_id           uuid;
    v_card_acc_id           uuid;
    v_instapay_acc_id       uuid;
    v_wallet_acc_id         uuid;
    v_customer_adv_acc_id   uuid;
    v_sales_acc_id          uuid;
    v_sales_return_acc_id   uuid;
    v_discount_acc_id       uuid;
    v_service_acc_id        uuid;
    v_vat_acc_id            uuid;
    v_cogs_acc_id           uuid;
    v_inventory_acc_id      uuid;
    v_cash_deficit_acc_id   uuid;
    v_cash_surplus_acc_id   uuid;
    v_default_exp_acc_id    uuid;

    -- إجماليات مالية
    v_food_subtotal         numeric := 0;
    v_service_total         numeric := 0;
    v_vat_total             numeric := 0;
    v_cost_total            numeric := 0;
    v_total_discount        numeric := 0;
    v_grand_total_sum       numeric := 0;
    v_actual_cash           numeric := 0;
    v_opening_balance       numeric := 0;
    v_expected_cash         numeric := 0;
    v_diff                  numeric := 0;
    v_net_cash_movement     numeric := 0;

    v_card_sales            numeric := 0;
    v_instapay_sales        numeric := 0;
    v_wallet_sales          numeric := 0;
    v_redeemed_deposits     numeric := 0;
    v_safe_drops            numeric := 0;
    v_cash_returns          numeric := 0;
    v_paid_ins              numeric := 0;
    v_paid_outs             numeric := 0;

    -- حركات العربونات
    v_cash_deposits_in         numeric := 0;
    v_wallet_deposits_in       numeric := 0;
    v_instapay_deposits_in     numeric := 0;
    v_card_deposits_in         numeric := 0;
    v_cash_deposits_refund     numeric := 0;
    v_wallet_deposits_refund   numeric := 0;
    v_instapay_deposits_refund numeric := 0;

    v_payout_row            record;
    v_item_cost_record      record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id          := COALESCE(v_shift.organization_id, p_org_id, public.get_my_org());
    v_actual_cash     := COALESCE(v_shift.actual_cash, 0);
    v_opening_balance := COALESCE(v_shift.opening_balance, 0);

    -- جلب ملخص الوردية المفصل
    v_summary                  := public.get_shift_summary(p_shift_id);
    v_expected_cash            := COALESCE((v_summary->>'expected_cash')::numeric, 0);
    v_card_sales               := COALESCE((v_summary->>'card_sales')::numeric, 0);
    v_instapay_sales           := COALESCE((v_summary->>'instapay_sales')::numeric, 0);
    v_wallet_sales             := COALESCE((v_summary->>'wallet_sales')::numeric, 0);
    v_redeemed_deposits        := COALESCE((v_summary->>'redeemed_deposits')::numeric, 0);
    v_safe_drops               := COALESCE((v_summary->>'safe_drops')::numeric, 0);
    v_cash_returns             := COALESCE((v_summary->>'cash_returns')::numeric, 0);
    v_paid_ins                 := COALESCE((v_summary->>'paid_ins')::numeric, 0);
    v_paid_outs                := COALESCE((v_summary->>'paid_outs')::numeric, 0);

    v_cash_deposits_in         := COALESCE((v_summary->>'cash_deposits_in')::numeric, 0);
    v_wallet_deposits_in       := COALESCE((v_summary->>'wallet_deposits_in')::numeric, 0);
    v_instapay_deposits_in     := COALESCE((v_summary->>'instapay_deposits_in')::numeric, 0);
    v_card_deposits_in         := COALESCE((v_summary->>'card_deposits_in')::numeric, 0);

    v_cash_deposits_refund     := COALESCE((v_summary->>'cash_deposits_refund')::numeric, 0);
    v_wallet_deposits_refund   := COALESCE((v_summary->>'wallet_deposits_refund')::numeric, 0);
    v_instapay_deposits_refund := COALESCE((v_summary->>'instapay_deposits_refund')::numeric, 0);

    v_diff                     := v_actual_cash - v_expected_cash;
    v_net_cash_movement        := v_actual_cash - v_opening_balance;

    -- جلب خريطة الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- حل الحسابات التفصيلية
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH'),
        v_shift.treasury_account_id,
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('1231','123101','1101','10101','101') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND is_group = false ORDER BY code ASC LIMIT 1)
    ));

    v_safe_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'MAIN_TREASURY'),
        public.safe_cast_uuid(v_mappings->>'SAFE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('1232','1102','10102') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_cash_acc_id
    ));

    v_card_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'POS_CARD_CLEARING'),
        public.safe_cast_uuid(v_mappings->>'BANK'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1214%' OR code LIKE '121%') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_cash_acc_id
    ));

    v_instapay_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'INSTAPAY_CLEARING'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1215%' OR code LIKE '121%') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_card_acc_id
    ));

    v_wallet_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'WALLET_CLEARING'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1216%' OR code LIKE '121%') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_instapay_acc_id
    ));

    -- حساب دفعات مقدمة من العملاء (العربونات)
    v_customer_adv_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CUSTOMER_ADVANCES'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '20102%' OR code LIKE '2202%' OR code LIKE '2102%' OR code LIKE '221%') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%عربون%' OR name LIKE '%دفعات مقدمة%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_sales_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_REVENUE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('411','4111','4101','41','401') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_sales_return_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_RETURNS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('412','4103') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_sales_acc_id
    ));

    v_vat_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'VAT'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('2231','2103','2105','223') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_DEFICIT'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('5219','5109') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SURPLUS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('4219','4209') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_default_exp_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'OPERATING_EXPENSES'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('5201','5101','501') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- جلب أوامر الوردية لحساب إجمالي المبيعات
    CREATE TEMP TABLE temp_all_shift_orders ON COMMIT DROP AS
    SELECT 
        o.id,
        COALESCE(o.subtotal, 0)::numeric as food_subtotal,
        COALESCE(o.service_fee, 0)::numeric as service_charge,
        COALESCE(o.tax, 0)::numeric as total_tax,
        COALESCE(o.total_discount, 0)::numeric as total_discount,
        COALESCE(o.grand_total, o.total_amount, 0)::numeric as grand_total
    FROM public.orders o
    WHERE (
        o.shift_id = p_shift_id
        OR (
            o.shift_id IS NULL
            AND (o.user_id = v_shift.user_id OR o.cashier_id = v_shift.user_id)
            AND o.created_at >= v_shift.start_time
            AND o.created_at <= COALESCE(v_shift.end_time, NOW())
        )
    )
    AND o.status NOT IN ('CANCELLED', 'VOID', 'REFUNDED');

    SELECT 
        COALESCE(SUM(food_subtotal), 0),
        COALESCE(SUM(service_charge), 0),
        COALESCE(SUM(total_tax), 0),
        COALESCE(SUM(total_discount), 0),
        COALESCE(SUM(grand_total), 0)
    INTO v_food_subtotal, v_service_total, v_vat_total, v_total_discount, v_grand_total_sum
    FROM temp_all_shift_orders;

    -- فحص ما إذا كانت الوردية خالية تماماً
    IF v_food_subtotal = 0 AND v_safe_drops = 0 AND v_paid_outs = 0 AND v_paid_ins = 0 
       AND v_cash_returns = 0 AND v_diff = 0 AND v_net_cash_movement = 0
       AND v_cash_deposits_in = 0 AND v_wallet_deposits_in = 0 AND v_instapay_deposits_in = 0 AND v_card_deposits_in = 0
       AND v_cash_deposits_refund = 0 AND v_wallet_deposits_refund = 0 AND v_instapay_deposits_refund = 0 THEN
        DROP TABLE IF EXISTS temp_all_shift_orders;
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RETURN NULL;
    END IF;

    -- تنظيف أي قيد قديم لنفس الوردية
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE (related_document_id = p_shift_id AND related_document_type = 'shift')
           OR id = v_shift.closing_journal_entry_id
    );
    DELETE FROM public.journal_entries 
    WHERE (related_document_id = p_shift_id AND related_document_type = 'shift')
       OR id = v_shift.closing_journal_entry_id;

    -- إنشاء القيد المحاسبي المجمع
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, is_posted, related_document_id, related_document_type, user_id
    ) VALUES (
        CURRENT_DATE,
        'قيد إغلاق مبيعات وحركات وردية مجمع شامل (نقدي وعربونات وإلكتروني)',
        'SHIFT-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4),
        'draft', v_org_id, false, p_shift_id, 'shift', v_shift.user_id
    ) RETURNING id INTO v_je_id;

    -- =========================================================================
    -- الطرف الدائن (Credits)
    -- =========================================================================
    -- 1. إيرادات المبيعات
    IF v_food_subtotal > 0 AND v_sales_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_food_subtotal, 'إيرادات مبيعات الوردية الكلية (Gross Sales)', v_org_id);
    END IF;

    -- 2. إيرادات رسوم الخدمة
    IF v_service_total > 0 AND v_service_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_service_acc_id, 0, v_service_total, 'إيرادات رسوم الخدمة للوردية', v_org_id);
    END IF;

    -- 3. ضريبة القيمة المضافة
    IF v_vat_total > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_vat_total, 'ضريبة مخرجات مبيعات الوردية', v_org_id);
    END IF;

    -- 4. إثبات العربونات المستلمة بالوردية كالتزام (دفعات مقدمة من العملاء)
    IF (v_cash_deposits_in + v_wallet_deposits_in + v_instapay_deposits_in + v_card_deposits_in) > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, 0, (v_cash_deposits_in + v_wallet_deposits_in + v_instapay_deposits_in + v_card_deposits_in), 'عربونات وحجوزات جديدة مستلمة بالوردية (دفعات مقدمة عملاء)', v_org_id);
    END IF;

    -- 5. فائض النقدية بالدرج إن وجد
    IF v_diff > 0 AND v_cash_surplus_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'فائض نقدية الدرج (إيراد متنوع)', v_org_id);
    END IF;

    -- 6. صافي سحوبات من رصيد الصندوق/الدرج إن كان الرصيد الفعلي أقل من الافتتاحي
    IF v_net_cash_movement < 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, 0, ABS(v_net_cash_movement), 'صافي سحوبات من رصيد الصندوق/الدرج الافتتاحي', v_org_id);
    END IF;

    -- 7. عربونات مردودة إلكترونياً (سحب من المحافظ/إنستاباي للعميل)
    IF v_wallet_deposits_refund > 0 AND v_wallet_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wallet_acc_id, 0, v_wallet_deposits_refund, 'رد عربون حجز ملغي عبر محفظة إلكترونية للعميل', v_org_id);
    END IF;

    IF v_instapay_deposits_refund > 0 AND v_instapay_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_instapay_acc_id, 0, v_instapay_deposits_refund, 'رد عربون حجز ملغي عبر إنستاباي للعميل', v_org_id);
    END IF;

    -- =========================================================================
    -- الطرف المدين (Debits)
    -- =========================================================================
    -- 1. صافي النقدية المضافة للصندوق بالدرج
    IF v_net_cash_movement > 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_net_cash_movement, 0, 'صافي النقدية المقبوضة بالصندوق (الدرج)', v_org_id);
    END IF;

    -- 2. مبيعات وعربونات البطاقات البنكية
    IF (v_card_sales + v_card_deposits_in) > 0 AND v_card_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_card_acc_id, (v_card_sales + v_card_deposits_in), 0, 'متحصلات شبكة وبطاقات بنكية (مبيعات وعربونات)', v_org_id);
    END IF;

    -- 3. متحصلات وعربونات إنستاباي
    IF (v_instapay_sales + v_instapay_deposits_in) > 0 AND v_instapay_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_instapay_acc_id, (v_instapay_sales + v_instapay_deposits_in), 0, 'متحصلات إنستاباي (مبيعات وعربونات حجز)', v_org_id);
    END IF;

    -- 4. متحصلات وعربونات المحافظ الإلكترونية (فودافون كاش)
    IF (v_wallet_sales + v_wallet_deposits_in) > 0 AND v_wallet_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wallet_acc_id, (v_wallet_sales + v_wallet_deposits_in), 0, 'متحصلات محافظ إلكترونية (مبيعات وعربونات حجز)', v_org_id);
    END IF;

    -- 5. استهلاك الحجوزات والعربونات في مبيعات الوردية (Redeemed Advances)
    IF v_redeemed_deposits > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, v_redeemed_deposits, 0, 'تسوية عربونات وحجوزات مستهلكة (عملاء دفعات مقدمة)', v_org_id);
    END IF;

    -- 6. عربونات مردودة للعميل (إقفال التزام الدفعة المقدمة عند الإلغاء)
    IF (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund) > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund), 0, 'إلغاء ورد عربونات حجز للعملاء (إقفال التزام)', v_org_id);
    END IF;

    -- 7. توريد نقدية مسحوبة للخزينة الرئيسية
    IF v_safe_drops > 0 AND v_safe_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_safe_acc_id, v_safe_drops, 0, 'توريد نقدية مسحوبة من الدرج إلى الخزينة الرئيسية', v_org_id);
    END IF;

    -- 8. المصروفات النثرية المنصرفة من الدرج
    FOR v_payout_row IN (
        SELECT COALESCE(public.resolve_leaf_account(account_id), v_default_exp_acc_id) as exp_acc, SUM(amount) as total_amt, reason
        FROM public.pos_drawer_transactions
        WHERE shift_id = p_shift_id AND transaction_type = 'PAID_OUT_EXPENSE'
        GROUP BY 1, 3
    ) LOOP
        IF v_payout_row.total_amt > 0 AND v_payout_row.exp_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_payout_row.exp_acc, v_payout_row.total_amt, 0, 'صرف نثري من الدرج: ' || COALESCE(v_payout_row.reason, 'مصروفات تشغيلية'), v_org_id);
        END IF;
    END LOOP;

    -- 9. مردودات المبيعات النقدية
    IF v_cash_returns > 0 AND v_sales_return_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_return_acc_id, v_cash_returns, 0, 'مردودات مبيعات نقدية من الدرج للوردية', v_org_id);
    END IF;

    -- 10. عجز نقدية الدرج الفعلي إن وجد
    IF v_diff < 0 AND v_cash_deficit_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية بالدرج عند الجرد (مصروف خسائر عجز)', v_org_id);
    END IF;

    -- ترحيل القيد وربطه بالوردية
    UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_je_id;
    UPDATE public.shifts SET closing_journal_entry_id = v_je_id WHERE id = p_shift_id;

    DROP TABLE IF EXISTS temp_all_shift_orders;
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN v_je_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_shift_closing_entry(uuid, uuid) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
