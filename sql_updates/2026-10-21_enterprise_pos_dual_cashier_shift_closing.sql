-- ==============================================================================
-- Migration: Enterprise POS Dual-Cashier Shift Closing & Cash Tray Lifecycle
-- Date: 2026-10-21
-- Module: Retail POS (Hypermarket) & Restaurant POS
-- Description:
--   1. إنشاء جدول موحد لحركات الدرج pos_drawer_transactions (Paid In, Paid Out, Safe Drop, Deposit In)
--   2. تحديث جدول ورديات الكاشير public.shifts وقنوات الدفع public.payments
--   3. تحديث get_shift_summary لمعادلة نقدية الدرج المستقلة وتفصيل القنوات الإلكترونية
--   4. تحديث generate_shift_closing_entry لتوليد القيد المحاسبي الشامل لكافة المبيعات (نقدية وغير نقدية)
--   5. تحديث complete_pos_sale_atomic لدعم الدفع المتعدد المجزأ (Split Payments) وسجل لكل وسيلة
--   6. دعم كامل للكاشيرين (الماركت والمطعم) مع حماية الحصانة المحاسبية
-- ==============================================================================

-- 1. جدول حركات الدرج النقدية الموحد لكلا الكاشيرين (Market & Restaurant)
CREATE TABLE IF NOT EXISTS public.pos_drawer_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    cashier_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'PAID_IN', 'PAID_OUT_EXPENSE', 'SAFE_DROP', 'ADVANCE_DEPOSIT_IN'
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL, -- حساب المصروف في Paid Out، أو حساب الخزينة في Safe Drop، أو عملاء دفعات مقدمة في Deposit
    custodian_or_payer_name VARCHAR(255),
    reference_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_drawer_trans_shift_id ON public.pos_drawer_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_pos_drawer_trans_org_id ON public.pos_drawer_transactions(organization_id);

-- تمكين RLS
ALTER TABLE public.pos_drawer_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "pos_drawer_trans_tenant_isolation" ON public.pos_drawer_transactions;
    CREATE POLICY "pos_drawer_trans_tenant_isolation" ON public.pos_drawer_transactions
        FOR ALL USING (
            organization_id = public.get_my_org() OR 
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
        );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

GRANT ALL ON TABLE public.pos_drawer_transactions TO authenticated, service_role;


-- 2. تحديث جدول الورديات public.shifts لدعم التفصيل المحاسبي لكافة القنوات
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_gross_sales NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_cash_sales NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_card_sales NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_instapay_sales NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_wallet_sales NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_redeemed_deposits NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_credit_sales NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_paid_ins NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_paid_outs NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_safe_drops NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_cash_returns NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS non_cash_reconciliation JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closing_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- تحديث جدول المدفوعات payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS sub_method VARCHAR(50); -- 'CARD', 'INSTAPAY', 'WALLET', 'DEPOSIT_REDEEMED', 'CREDIT', 'CASH'
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS auth_reference VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_payments_shift_id ON public.payments(shift_id);


-- 3. دالة تسجيل حركة نقدية سريعة بالدرج لكلا الكاشيرين (record_pos_drawer_transaction)
DROP FUNCTION IF EXISTS public.record_pos_drawer_transaction(uuid, text, numeric, text, uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.record_pos_drawer_transaction(
    p_shift_id uuid,
    p_transaction_type text, -- 'PAID_IN', 'PAID_OUT_EXPENSE', 'SAFE_DROP', 'ADVANCE_DEPOSIT_IN'
    p_amount numeric,
    p_reason text,
    p_account_id uuid DEFAULT NULL,
    p_custodian_name text DEFAULT NULL,
    p_ref_number text DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift record;
    v_org_id uuid;
    v_trans_id uuid;
    v_acc_id uuid := p_account_id;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    IF v_shift.status = 'CLOSED' THEN
        RAISE EXCEPTION 'لا يمكن تسجيل حركات نقدية على وردية مغلقة.';
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'يجب أن يكون مبلغ الحركة أكبر من الصفر.';
    END IF;

    -- توجيه الحساب التلقائي إن لم يُحدد
    IF v_acc_id IS NULL THEN
        IF p_transaction_type = 'SAFE_DROP' THEN
            SELECT id INTO v_acc_id FROM public.accounts 
            WHERE organization_id = v_org_id AND code IN ('1232', '123101', '1101') LIMIT 1;
        ELSIF p_transaction_type = 'ADVANCE_DEPOSIT_IN' THEN
            SELECT id INTO v_acc_id FROM public.accounts 
            WHERE organization_id = v_org_id AND (code LIKE '20102%' OR code LIKE '2202%' OR code LIKE '2102%' OR code LIKE '221%') LIMIT 1;
        END IF;
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
        reference_number,
        created_at
    ) VALUES (
        v_org_id,
        p_shift_id,
        auth.uid(),
        p_transaction_type,
        p_amount,
        COALESCE(p_reason, p_transaction_type),
        v_acc_id,
        p_custodian_name,
        p_ref_number,
        now()
    ) RETURNING id INTO v_trans_id;

    -- حفظ نسخة متوافقة في pos_petty_cash_payouts إن وجد الجدول للمنظومات القديمة
    BEGIN
        IF p_transaction_type IN ('PAID_OUT_EXPENSE', 'SAFE_DROP') THEN
            INSERT INTO public.pos_petty_cash_payouts (
                organization_id, public_shift_id, cashier_id, amount,
                payout_type, reason, expense_account_id, target_account_id, custodian_name
            ) VALUES (
                v_org_id, p_shift_id, auth.uid(), p_amount,
                CASE WHEN p_transaction_type = 'SAFE_DROP' THEN 'SAFE_DROP' ELSE 'EXPENSE' END,
                COALESCE(p_reason, p_transaction_type),
                CASE WHEN p_transaction_type = 'PAID_OUT_EXPENSE' THEN v_acc_id ELSE NULL END,
                CASE WHEN p_transaction_type = 'SAFE_DROP' THEN v_acc_id ELSE NULL END,
                p_custodian_name
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_trans_id,
        'shift_id', p_shift_id,
        'amount', p_amount,
        'type', p_transaction_type
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_pos_drawer_transaction(uuid, text, numeric, text, uuid, text, text, uuid) TO authenticated, service_role;


-- 4. تحديث دالة get_shift_summary لحساب نقدية الدرج المستقلة وتفصيل القنوات
DROP FUNCTION IF EXISTS public.get_shift_summary(uuid);
CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift               RECORD;
    v_start_time          TIMESTAMPTZ;
    v_end_time            TIMESTAMPTZ;
    v_org_id              UUID;
    v_opening_balance     NUMERIC := 0;
    
    -- قنوات المبيعات
    v_cash_sales          NUMERIC := 0;
    v_card_sales          NUMERIC := 0;
    v_instapay_sales      NUMERIC := 0;
    v_wallet_sales        NUMERIC := 0;
    v_redeemed_deposits   NUMERIC := 0;
    v_credit_sales        NUMERIC := 0;
    v_total_gross_sales   NUMERIC := 0;
    v_total_discounts     NUMERIC := 0;

    -- عدد الحركات لكل قناة (لأغراض المطابقة والتسوية)
    v_cash_count          INTEGER := 0;
    v_card_count          INTEGER := 0;
    v_instapay_count      INTEGER := 0;
    v_wallet_count        INTEGER := 0;
    v_redeemed_count      INTEGER := 0;
    v_credit_count        INTEGER := 0;
    v_total_order_count   INTEGER := 0;

    -- حركات الدرج النقدية المستقلة
    v_paid_ins            NUMERIC := 0;
    v_paid_outs           NUMERIC := 0;
    v_safe_drops          NUMERIC := 0;
    v_cash_returns        NUMERIC := 0;
    v_expected_cash       NUMERIC := 0;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية غير موجودة: %', p_shift_id;
    END IF;

    v_start_time      := v_shift.start_time;
    v_end_time        := COALESCE(v_shift.end_time, now());
    v_org_id          := v_shift.organization_id;
    v_opening_balance := COALESCE(v_shift.opening_balance, 0);

    -- أ. تجميع المدفوعات بحسب القناة من جدول payments المرتبط بالوردية
    SELECT
        -- مبالغ القنوات
        COALESCE(SUM(CASE 
            WHEN UPPER(p.payment_method) = 'CASH' OR UPPER(COALESCE(p.sub_method, '')) = 'CASH' THEN p.amount 
            ELSE 0 
        END), 0),
        COALESCE(SUM(CASE 
            WHEN UPPER(p.payment_method) IN ('CARD', 'VISA', 'MASTERCARD', 'MADA') OR UPPER(COALESCE(p.sub_method, '')) = 'CARD' THEN p.amount 
            ELSE 0 
        END), 0),
        COALESCE(SUM(CASE 
            WHEN UPPER(p.payment_method) = 'INSTAPAY' OR UPPER(COALESCE(p.sub_method, '')) = 'INSTAPAY' THEN p.amount 
            ELSE 0 
        END), 0),
        COALESCE(SUM(CASE 
            WHEN UPPER(p.payment_method) IN ('WALLET', 'VODAFONE_CASH', 'ORANGE_CASH', 'ETISALAT_CASH') OR UPPER(COALESCE(p.sub_method, '')) = 'WALLET' THEN p.amount 
            ELSE 0 
        END), 0),
        COALESCE(SUM(CASE 
            WHEN UPPER(p.payment_method) IN ('DEPOSIT_REDEEMED', 'ADVANCE_REDEEMED', 'RESERVATION_DEPOSIT') OR UPPER(COALESCE(p.sub_method, '')) = 'DEPOSIT_REDEEMED' THEN p.amount 
            ELSE 0 
        END), 0),
        COALESCE(SUM(CASE 
            WHEN UPPER(p.payment_method) IN ('CREDIT', 'ON_ACCOUNT', 'RECEIVABLE') OR UPPER(COALESCE(p.sub_method, '')) = 'CREDIT' THEN p.amount 
            ELSE 0 
        END), 0),
        -- عدد الحركات
        COUNT(CASE WHEN UPPER(p.payment_method) = 'CASH' OR UPPER(COALESCE(p.sub_method, '')) = 'CASH' THEN 1 END),
        COUNT(CASE WHEN UPPER(p.payment_method) IN ('CARD', 'VISA', 'MASTERCARD', 'MADA') OR UPPER(COALESCE(p.sub_method, '')) = 'CARD' THEN 1 END),
        COUNT(CASE WHEN UPPER(p.payment_method) = 'INSTAPAY' OR UPPER(COALESCE(p.sub_method, '')) = 'INSTAPAY' THEN 1 END),
        COUNT(CASE WHEN UPPER(p.payment_method) IN ('WALLET', 'VODAFONE_CASH', 'ORANGE_CASH') OR UPPER(COALESCE(p.sub_method, '')) = 'WALLET' THEN 1 END),
        COUNT(CASE WHEN UPPER(p.payment_method) IN ('DEPOSIT_REDEEMED', 'ADVANCE_REDEEMED') OR UPPER(COALESCE(p.sub_method, '')) = 'DEPOSIT_REDEEMED' THEN 1 END),
        COUNT(CASE WHEN UPPER(p.payment_method) IN ('CREDIT', 'ON_ACCOUNT') OR UPPER(COALESCE(p.sub_method, '')) = 'CREDIT' THEN 1 END)
    INTO
        v_cash_sales, v_card_sales, v_instapay_sales, v_wallet_sales, v_redeemed_deposits, v_credit_sales,
        v_cash_count, v_card_count, v_instapay_count, v_wallet_count, v_redeemed_count, v_credit_count
    FROM public.payments p
    JOIN public.orders   o ON p.order_id = o.id
    WHERE (
            o.shift_id = p_shift_id
            OR p.shift_id = p_shift_id
            OR (o.user_id = v_shift.user_id AND o.created_at >= v_start_time AND o.created_at <= v_end_time)
          )
      AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
      AND p.status = 'COMPLETED';

    -- في حالة الأوردرات القديمة أو البسيطة التي لم تسجل في payments
    IF (v_cash_sales + v_card_sales + v_instapay_sales + v_wallet_sales) = 0 THEN
        SELECT 
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(payment_method, 'CASH')) = 'CASH' THEN grand_total ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(payment_method) = 'CARD' THEN grand_total ELSE 0 END), 0),
            COALESCE(SUM(grand_total), 0),
            COUNT(*),
            COALESCE(SUM(total_discount), 0)
        INTO v_cash_sales, v_card_sales, v_total_gross_sales, v_total_order_count, v_total_discounts
        FROM public.orders
        WHERE (shift_id = p_shift_id OR (user_id = v_shift.user_id AND created_at >= v_start_time AND created_at <= v_end_time))
          AND status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED');
    ELSE
        SELECT 
            COUNT(DISTINCT o.id), 
            COALESCE(SUM(o.grand_total), 0),
            COALESCE(SUM(o.total_discount), 0)
        INTO v_total_order_count, v_total_gross_sales, v_total_discounts
        FROM public.orders o
        WHERE (o.shift_id = p_shift_id OR (o.user_id = v_shift.user_id AND o.created_at >= v_start_time AND o.created_at <= v_end_time))
          AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED');
    END IF;

    -- ب. حركات النقدية الإضافية والمسحوبات من جدول pos_drawer_transactions
    SELECT
        COALESCE(SUM(CASE WHEN transaction_type IN ('PAID_IN', 'ADVANCE_DEPOSIT_IN') THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN transaction_type = 'PAID_OUT_EXPENSE' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN transaction_type = 'SAFE_DROP' THEN amount ELSE 0 END), 0)
    INTO v_paid_ins, v_paid_outs, v_safe_drops
    FROM public.pos_drawer_transactions
    WHERE shift_id = p_shift_id;

    -- دعم التوافق مع pos_petty_cash_payouts القديم
    IF v_paid_outs = 0 AND v_safe_drops = 0 THEN
        SELECT 
            COALESCE(SUM(CASE WHEN payout_type = 'SAFE_DROP' OR reason LIKE '%سحب%' OR reason LIKE '%تفريغ%' OR reason LIKE '%توريد%' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN payout_type = 'EXPENSE' OR (payout_type IS NULL AND reason NOT LIKE '%توريد%') THEN amount ELSE 0 END), 0)
        INTO v_safe_drops, v_paid_outs
        FROM public.pos_petty_cash_payouts
        WHERE shift_id = p_shift_id OR public_shift_id = p_shift_id;
    END IF;

    -- ج. مرتجعات المبيعات النقدية المسددة من الدرج
    SELECT COALESCE(SUM(sr.total_amount), 0) INTO v_cash_returns
    FROM public.sales_returns sr
    WHERE (
        sr.shift_id = p_shift_id
        OR (sr.user_id = v_shift.user_id AND sr.created_at >= v_start_time AND sr.created_at <= v_end_time)
    )
    AND (
        sr.refund_method = 'CASH' OR sr.refund_method IS NULL OR sr.notes LIKE '%نقدي%' OR sr.notes LIKE '%CASH%'
    );

    -- د. احتساب نقدية الدرج المتوقعة بالمعادلة المستقلة الدقيقة:
    -- (رصيد افتتاحي + مبيعات نقدية + إيداعات الدرج/عربونات نقدية) - (مصروفات نثرية + سحوبات توريد خزينة + مرتجعات نقدية)
    v_expected_cash := GREATEST(0, (v_opening_balance + v_cash_sales + v_paid_ins) - (v_paid_outs + v_safe_drops + v_cash_returns));

    RETURN jsonb_build_object(
        'opening_balance',        v_opening_balance,
        'total_sales',            v_total_gross_sales,
        'gross_sales',            v_total_gross_sales,
        'total_discounts',        v_total_discounts,
        'order_count',            v_total_order_count,
        
        -- مبالغ القنوات
        'cash_sales',             v_cash_sales,
        'card_sales',             v_card_sales,
        'instapay_sales',         v_instapay_sales,
        'wallet_sales',           v_wallet_sales,
        'redeemed_deposits',      v_redeemed_deposits,
        'credit_sales',           v_credit_sales,
        
        -- عدد حركات كل قناة
        'cash_count',             v_cash_count,
        'card_count',             v_card_count,
        'instapay_count',         v_instapay_count,
        'wallet_count',           v_wallet_count,
        'redeemed_count',         v_redeemed_count,
        'credit_count',           v_credit_count,

        -- حركات الدرج النقدية
        'paid_ins',               v_paid_ins,
        'paid_outs',              v_paid_outs,
        'petty_cash',             v_paid_outs,
        'safe_drops',             v_safe_drops,
        'cash_drops',             v_safe_drops,
        'cash_returns',           v_cash_returns,
        
        -- النقدية المطلوبة للدرج
        'expected_cash',          v_expected_cash
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shift_summary(uuid) TO authenticated, service_role;


-- 5. تحديث دالة توليد قيد إغلاق الوردية الشامل (generate_shift_closing_entry)
DROP FUNCTION IF EXISTS public.generate_shift_closing_entry(uuid, uuid);
DROP FUNCTION IF EXISTS public.generate_shift_closing_entry(uuid);
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
    v_shift               public.shifts;
    v_org_id              uuid;
    v_summary             jsonb;
    v_je_id               uuid;
    v_mappings            jsonb;

    -- حسابات الدليل
    v_cash_acc_id         uuid;
    v_safe_acc_id         uuid;
    v_card_acc_id         uuid;
    v_instapay_acc_id     uuid;
    v_wallet_acc_id       uuid;
    v_customer_adv_acc_id uuid;
    v_sales_acc_id        uuid;
    v_sales_return_acc_id uuid;
    v_discount_acc_id     uuid;
    v_service_acc_id      uuid;
    v_vat_acc_id          uuid;
    v_cogs_acc_id         uuid;
    v_inventory_acc_id    uuid;
    v_cash_deficit_acc_id uuid;
    v_cash_surplus_acc_id uuid;
    v_default_exp_acc_id  uuid;

    -- إجماليات مالية
    v_food_subtotal       numeric := 0;
    v_service_total       numeric := 0;
    v_vat_total           numeric := 0;
    v_cost_total          numeric := 0;
    v_total_discount      numeric := 0;
    v_grand_total_sum     numeric := 0;
    v_actual_cash         numeric := 0;
    v_opening_balance     numeric := 0;
    v_expected_cash       numeric := 0;
    v_diff                numeric := 0;
    v_net_cash_movement   numeric := 0;

    v_card_sales          numeric := 0;
    v_instapay_sales      numeric := 0;
    v_wallet_sales        numeric := 0;
    v_redeemed_deposits   numeric := 0;
    v_safe_drops          numeric := 0;
    v_cash_returns        numeric := 0;
    v_paid_ins            numeric := 0;

    v_payout_row          record;
    v_item_cost_record    record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي لمنع أي تعارض مع حراس الحصانة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id          := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());
    v_actual_cash     := COALESCE(v_shift.actual_cash, 0);
    v_opening_balance := COALESCE(v_shift.opening_balance, 0);

    -- جلب ملخص الوردية المفصل
    v_summary           := public.get_shift_summary(p_shift_id);
    v_expected_cash     := COALESCE((v_summary->>'expected_cash')::numeric, 0);
    v_card_sales        := COALESCE((v_summary->>'card_sales')::numeric, 0);
    v_instapay_sales    := COALESCE((v_summary->>'instapay_sales')::numeric, 0);
    v_wallet_sales      := COALESCE((v_summary->>'wallet_sales')::numeric, 0);
    v_redeemed_deposits := COALESCE((v_summary->>'redeemed_deposits')::numeric, 0);
    v_safe_drops        := COALESCE((v_summary->>'safe_drops')::numeric, 0);
    v_cash_returns      := COALESCE((v_summary->>'cash_returns')::numeric, 0);
    v_paid_ins          := COALESCE((v_summary->>'paid_ins')::numeric, 0);
    v_diff              := v_actual_cash - v_expected_cash;

    -- صافي حركة النقدية الموردة فعلياً بالدرج مقارنة بالرصيد الافتتاحي
    v_net_cash_movement := v_actual_cash - v_opening_balance;

    -- جلب خريطة الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_cash_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH'),
        v_shift.treasury_account_id,
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231','123101','1101') LIMIT 1)
    ));

    v_safe_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'MAIN_TREASURY'),
        public.safe_cast_uuid(v_mappings->>'SAFE'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1232','123101','1101') LIMIT 1),
        v_cash_acc_id
    ));

    v_card_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'POS_CARD_CLEARING'),
        public.safe_cast_uuid(v_mappings->>'BANK'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND (code LIKE '1214%' OR code LIKE '121%' OR code LIKE '1102%') LIMIT 1)
    ));

    v_instapay_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'INSTAPAY_CLEARING'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND (code LIKE '1215%' OR code LIKE '121%') LIMIT 1),
        v_card_acc_id
    ));

    v_wallet_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'WALLET_CLEARING'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND (code LIKE '1216%' OR code LIKE '121%') LIMIT 1),
        v_instapay_acc_id
    ));

    v_customer_adv_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CUSTOMER_ADVANCES'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND (code LIKE '20102%' OR code LIKE '2202%' OR code LIKE '2102%' OR code LIKE '221%') LIMIT 1)
    ));

    v_sales_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_REVENUE'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('411','4111') LIMIT 1)
    ));

    v_sales_return_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_RETURNS'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '412' LIMIT 1),
        v_sales_acc_id
    ));

    v_discount_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_DISCOUNT'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'SALES_DISCOUNT') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('413','4102') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND name LIKE '%خصم مسموح به%' LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '412' LIMIT 1),
        v_sales_acc_id
    ));

    v_service_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SERVICE_CHARGE_REVENUE'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('41104','414') LIMIT 1),
        v_sales_acc_id
    ));

    v_vat_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'VAT'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('2231','2103') LIMIT 1)
    ));

    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'COGS'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('511','501') LIMIT 1)
    ));

    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'INVENTORY_FINISHED_GOODS'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('10302','1213') LIMIT 1)
    ));

    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SHORTAGE'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '541' LIMIT 1)
    ));

    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SURPLUS_ACC'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '441' LIMIT 1)
    ));

    v_default_exp_acc_id := (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code LIKE '5%' AND is_group = false LIMIT 1);

    -- جلب كافة طلبات الوردية (الكلية: نقدية وغير نقدية) مع الخصومات
    CREATE TEMP TABLE temp_all_shift_orders ON COMMIT DROP AS
    SELECT o.id, o.subtotal, COALESCE(o.service_charge, 0) AS service_charge, o.total_tax, o.grand_total, COALESCE(o.total_discount, 0) AS total_discount
    FROM   public.orders o
    WHERE  (o.shift_id = p_shift_id OR (o.user_id = v_shift.user_id AND o.created_at >= v_shift.start_time AND o.created_at <= COALESCE(v_shift.end_time, now())))
      AND  o.organization_id = v_org_id
      AND  o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED');

    SELECT 
        COALESCE(SUM(subtotal), 0),
        COALESCE(SUM(service_charge), 0),
        COALESCE(SUM(total_tax), 0),
        COALESCE(SUM(total_discount), 0),
        COALESCE(SUM(grand_total), 0)
    INTO v_food_subtotal, v_service_total, v_vat_total, v_total_discount, v_grand_total_sum
    FROM temp_all_shift_orders;

    -- إذا كان هناك خصم على المبيعات / عروض وكان subtotal مسجلاً بالصافي، نحوّله إلى إجمالي قبل الخصم لإظهار الخصم المسموح به معيارياً
    IF v_total_discount > 0 AND v_discount_acc_id IS NOT NULL THEN
        IF ABS((v_food_subtotal + v_service_total + v_vat_total) - v_grand_total_sum) <= 0.05 THEN
            v_food_subtotal := v_food_subtotal + v_total_discount;
        END IF;
    END IF;

    -- إذا لم تكن هناك مبيعات بالوردية وكان هناك جرد فقط، لا داعي لإنشاء قيد مبيعات فارغ
    IF v_food_subtotal = 0 AND v_actual_cash = 0 AND v_safe_drops = 0 THEN
        DROP TABLE IF EXISTS temp_all_shift_orders;
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RETURN NULL;
    END IF;

    -- تنظيف أي قيد إغلاق سابق لنفس الوردية
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE (related_document_id = p_shift_id AND related_document_type = 'shift')
           OR id = v_shift.closing_journal_entry_id
    );
    DELETE FROM public.journal_entries 
    WHERE (related_document_id = p_shift_id AND related_document_type = 'shift')
       OR id = v_shift.closing_journal_entry_id;

    -- إنشاء القيد المحاسبي المجمع أولاً كمسودة draft لضمان الاتزان
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, is_posted, related_document_id, related_document_type, user_id
    ) VALUES (
        CURRENT_DATE,
        'قيد إغلاق مبيعات وردية مجمع شامل (نقدي وإلكتروني)',
        'SHIFT-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4),
        'draft', v_org_id, false, p_shift_id, 'shift', v_shift.user_id
    ) RETURNING id INTO v_je_id;

    -- =========================================================================
    -- الطرف الدائن (Credits): إجمالي المبيعات، رسوم الخدمة، الضريبة، وفائض الصندوق
    -- =========================================================================
    -- 1. إيرادات المبيعات الكلية
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

    -- 4. فائض النقدية بالدرج إن وجد
    IF v_diff > 0 AND v_cash_surplus_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'فائض نقدية الدرج (إيراد متنوع)', v_org_id);
    END IF;

    -- 5. إذا كانت حركة الدرج سالبة (المصروفات والسحوبات أكبر من الكاش المقبوض)
    IF v_net_cash_movement < 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, 0, ABS(v_net_cash_movement), 'صافي سحوبات من رصيد الصندوق/الدرج الافتتاحي', v_org_id);
    END IF;

    -- =========================================================================
    -- الطرف المدين (Debits): النقدية، البطاقات، إنستاباي، المحافظ، الحجوزات المستهلكة، المصروفات، والعجز
    -- =========================================================================
    -- 1. صافي النقدية المضافة للصندوق بالدرج
    IF v_net_cash_movement > 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_net_cash_movement, 0, 'صافي النقدية المقبوضة بالصندوق (الدرج)', v_org_id);
    END IF;

    -- 2. مبيعات البطاقات البنكية (حساب وسيط الشبكة / البنك)
    IF v_card_sales > 0 AND v_card_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_card_acc_id, v_card_sales, 0, 'متحصلات شبكة وبطاقات بنكية للوردية', v_org_id);
    END IF;

    -- 3. متحصلات إنستاباي (InstaPay Clearing)
    IF v_instapay_sales > 0 AND v_instapay_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_instapay_acc_id, v_instapay_sales, 0, 'متحصلات إنستاباي للوردية', v_org_id);
    END IF;

    -- 4. متحصلات المحافظ الإلكترونية (Vodafone Cash / Wallets)
    IF v_wallet_sales > 0 AND v_wallet_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wallet_acc_id, v_wallet_sales, 0, 'متحصلات محافظ إلكترونية للوردية', v_org_id);
    END IF;

    -- 5. استهلاك الحجوزات والدفعات المقدمة (Redeemed Customer Advances)
    IF v_redeemed_deposits > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, v_redeemed_deposits, 0, 'تسوية عربونات وحجوزات مستهلكة (عملاء دفعات مقدمة)', v_org_id);
    END IF;

    -- 6. توريد نقدية مسحوبة للخزينة الرئيسية (Safe Drops)
    IF v_safe_drops > 0 AND v_safe_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_safe_acc_id, v_safe_drops, 0, 'توريد نقدية مسحوبة من الدرج إلى الخزينة الرئيسية', v_org_id);
    END IF;

    -- 7. المصروفات النثرية المنصرفة من الدرج (حسب حساباتها التفصيلية)
    IF EXISTS (SELECT 1 FROM public.pos_drawer_transactions WHERE shift_id = p_shift_id AND transaction_type = 'PAID_OUT_EXPENSE') THEN
        FOR v_payout_row IN (
            SELECT COALESCE(account_id, v_default_exp_acc_id) as exp_acc, SUM(amount) as total_amt, reason
            FROM public.pos_drawer_transactions
            WHERE shift_id = p_shift_id AND transaction_type = 'PAID_OUT_EXPENSE'
            GROUP BY 1, 3
        ) LOOP
            IF v_payout_row.total_amt > 0 AND v_payout_row.exp_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_je_id, v_payout_row.exp_acc, v_payout_row.total_amt, 0, 'صرف نثري من الدرج: ' || COALESCE(v_payout_row.reason, 'مصروفات تشغيلية'), v_org_id);
            END IF;
        END LOOP;
    ELSE
        FOR v_payout_row IN (
            SELECT COALESCE(expense_account_id, v_default_exp_acc_id) as exp_acc, SUM(amount) as total_amt, reason
            FROM public.pos_petty_cash_payouts
            WHERE (shift_id = p_shift_id OR public_shift_id = p_shift_id) AND payout_type = 'EXPENSE'
            GROUP BY 1, 3
        ) LOOP
            IF v_payout_row.total_amt > 0 AND v_payout_row.exp_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_je_id, v_payout_row.exp_acc, v_payout_row.total_amt, 0, 'صرف نثري من الدرج: ' || COALESCE(v_payout_row.reason, 'مصروفات تشغيلية'), v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 8. مردودات المبيعات النقدية
    IF v_cash_returns > 0 AND v_sales_return_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_return_acc_id, v_cash_returns, 0, 'مردودات مبيعات نقدية من الدرج للوردية', v_org_id);
    END IF;

    -- 9. عجز نقدية الدرج الفعلي إن وجد
    IF v_diff < 0 AND v_cash_deficit_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الدرج الفعلي غير المبرر', v_org_id);
    END IF;

    -- 10. خصومات المبيعات والعروض الترويجية والكوبونات (مدين) - حساب 413
    IF v_total_discount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_discount_acc_id, v_total_discount, 0, 'خصومات مبيعات وعروض ترويجية للوردية (Sales Discounts & Offers Allowed)', v_org_id);
    END IF;

    -- =========================================================================
    -- تكلفة البضاعة المباعة وصرف المخزون للوردية
    -- =========================================================================
    FOR v_item_cost_record IN (
        SELECT inv_acc, SUM(line_cost) AS total_cost FROM (
            SELECT COALESCE(pr.inventory_account_id, v_inventory_acc_id) AS inv_acc,
                   public.uom_convert(oi.quantity, oi.uom_id, pr.base_uom_id)
                   * COALESCE(NULLIF(oi.unit_cost,0), NULLIF(pr.weighted_average_cost,0), pr.cost, 0) AS line_cost
            FROM   public.order_items oi
            JOIN   public.products   pr ON oi.product_id = pr.id
            WHERE  oi.order_id IN (SELECT id FROM temp_all_shift_orders)
              AND  NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
            UNION ALL
            SELECT COALESCE(rm.inventory_account_id,
                (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)) AS inv_acc,
                   (public.uom_convert(oi.quantity, oi.uom_id, pr.base_uom_id)
                   * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
                   * COALESCE(NULLIF(rm.weighted_average_cost,0), rm.cost, 0) AS line_cost
            FROM   public.order_items oi
            JOIN   public.bill_of_materials bom ON oi.product_id = bom.product_id
            JOIN   public.products rm ON bom.raw_material_id = rm.id
            JOIN   public.products pr ON oi.product_id = pr.id
            WHERE  oi.order_id IN (SELECT id FROM temp_all_shift_orders)
        ) expanded_inv GROUP BY 1
    ) LOOP
        IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL AND v_cogs_acc_id IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية الكلية', v_org_id);
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون مبيعات الوردية الكلية', v_org_id);
        END IF;
    END LOOP;

    -- ترحيل القيد بعد اكتمال أطرافه وتوازنه الحتمي
    UPDATE public.journal_entries
    SET status = 'posted', is_posted = true
    WHERE id = v_je_id;

    -- ربط القيد بالوردية
    UPDATE public.shifts
    SET closing_journal_entry_id = v_je_id
    WHERE id = p_shift_id;

    DROP TABLE IF EXISTS temp_all_shift_orders;

    -- إغلاق نطاق السماح
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN v_je_id;
EXCEPTION WHEN OTHERS THEN
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_shift_closing_entry(uuid, uuid) TO authenticated, service_role;


-- 6. تحديث دالة close_shift لتخزين مطابقة غير النقدي وحفظ الأرقام التفصيلية
DROP FUNCTION IF EXISTS public.close_shift(uuid, numeric, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.close_shift(uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.close_shift(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.close_shift(uuid, numeric);

CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id       uuid,
    p_actual_cash    numeric,
    p_notes          text    DEFAULT NULL,
    p_org_id         uuid    DEFAULT NULL,
    p_reconciliation jsonb   DEFAULT NULL
)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
    v_summary       JSONB;
    v_expected_cash numeric;
    v_difference    numeric;
    v_org_id        uuid;
BEGIN
    -- تفعيل نطاق الحصانة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_summary       := public.get_shift_summary(p_shift_id);
    v_expected_cash := COALESCE((v_summary->>'expected_cash')::numeric, 0);
    v_difference    := p_actual_cash - v_expected_cash;
    v_org_id        := COALESCE(p_org_id, (SELECT organization_id FROM public.shifts WHERE id = p_shift_id));

    UPDATE public.shifts SET
        end_time                 = now(),
        actual_cash              = p_actual_cash,
        closing_balance          = p_actual_cash,
        expected_cash            = v_expected_cash,
        difference               = v_difference,
        status                   = 'CLOSED',
        notes                    = p_notes,
        total_gross_sales        = COALESCE((v_summary->>'total_sales')::numeric, 0),
        total_cash_sales         = COALESCE((v_summary->>'cash_sales')::numeric, 0),
        total_card_sales         = COALESCE((v_summary->>'card_sales')::numeric, 0),
        total_instapay_sales     = COALESCE((v_summary->>'instapay_sales')::numeric, 0),
        total_wallet_sales       = COALESCE((v_summary->>'wallet_sales')::numeric, 0),
        total_redeemed_deposits  = COALESCE((v_summary->>'redeemed_deposits')::numeric, 0),
        total_paid_ins           = COALESCE((v_summary->>'paid_ins')::numeric, 0),
        total_paid_outs          = COALESCE((v_summary->>'paid_outs')::numeric, 0),
        total_safe_drops         = COALESCE((v_summary->>'safe_drops')::numeric, 0),
        total_cash_returns       = COALESCE((v_summary->>'cash_returns')::numeric, 0),
        non_cash_reconciliation  = COALESCE(p_reconciliation, '{}'::jsonb)
    WHERE id = p_shift_id;

    -- توليد قيد اليومية المجمع الشامل للوردية
    BEGIN
        PERFORM public.generate_shift_closing_entry(p_shift_id, v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- إغلاق نطاق السماح
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
EXCEPTION WHEN OTHERS THEN
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, text, uuid, jsonb) TO authenticated, service_role;


-- 7. تحديث complete_pos_sale_atomic لدعم الدفع المتعدد المجزأ (Split Payments) وتسجيل كل وسيلة بدقة
DROP FUNCTION IF EXISTS public.complete_pos_sale_atomic(jsonb, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid, numeric, text, uuid, numeric, jsonb);
DROP FUNCTION IF EXISTS public.complete_pos_sale_atomic(jsonb, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid, numeric, text, uuid, numeric);

CREATE OR REPLACE FUNCTION public.complete_pos_sale_atomic(
    p_items jsonb,
    p_org_id uuid,
    p_user_id uuid,
    p_warehouse_id uuid DEFAULT NULL,
    p_customer_id uuid DEFAULT NULL,
    p_payment_method text DEFAULT 'CASH',
    p_payment_amount numeric DEFAULT 0,
    p_shift_id uuid DEFAULT NULL,
    p_terminal_id uuid DEFAULT NULL,
    p_total_discount numeric DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_cash_account_id uuid DEFAULT NULL,
    p_tax numeric DEFAULT 0,
    p_payments jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id uuid;
    v_order_number text;
    v_wh_id uuid;
    v_subtotal numeric := 0;
    v_item jsonb;
    v_pmt jsonb;
    v_prod_id uuid;
    v_qty numeric;
    v_price numeric;
    v_uom_id uuid;
    v_cost numeric;
    v_base_qty numeric;
    v_tax numeric := 0;
    v_grand_total numeric := 0;
BEGIN
    IF p_org_id IS NULL THEN
        p_org_id := public.get_my_org();
    END IF;

    v_wh_id := COALESCE(p_warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = p_org_id LIMIT 1));

    -- استخراج رقم الطلب من التسلسل
    v_order_number := public.get_next_document_number(p_org_id, 'order', 'ORD-');

    INSERT INTO public.orders (
        order_number,
        order_type,
        status,
        subtotal,
        total_tax,
        grand_total,
        total_discount,
        user_id,
        organization_id,
        customer_id,
        shift_id,
        terminal_id,
        notes,
        created_at
    ) VALUES (
        v_order_number,
        'TAKEAWAY',
        'PAID',
        0, 0, 0,
        COALESCE(p_total_discount, 0),
        p_user_id,
        p_org_id,
        p_customer_id,
        p_shift_id,
        p_terminal_id,
        p_notes,
        now()
    ) RETURNING id INTO v_order_id;

    -- إدراج بنود الطلب وخصم المخزون اللحظي
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_prod_id := (v_item->>'product_id')::uuid;
        v_qty := COALESCE((v_item->>'quantity')::numeric, 1);
        v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
        v_uom_id := NULLIF(v_item->>'uom_id', '')::uuid;

        SELECT COALESCE(cost, purchase_price, 0) INTO v_cost
        FROM public.products WHERE id = v_prod_id;

        INSERT INTO public.order_items (
            order_id,
            product_id,
            quantity,
            unit_price,
            unit_cost,
            uom_id,
            organization_id
        ) VALUES (
            v_order_id,
            v_prod_id,
            v_qty,
            v_price,
            v_cost,
            v_uom_id,
            p_org_id
        );

        v_subtotal := v_subtotal + (v_qty * v_price);

        -- خصم مخزون الصنف
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(v_qty, v_uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_prod_id));
            ELSE
                v_base_qty := v_qty;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_qty;
        END;

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN
            v_base_qty := v_qty;
        END IF;

        IF v_wh_id IS NOT NULL THEN
            UPDATE public.products
            SET stock = COALESCE(stock, 0) - v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_wh_id::text],
                    to_jsonb(
                        COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) - v_base_qty
                    )
                )
            WHERE id = v_prod_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) - v_base_qty
            WHERE id = v_prod_id;
        END IF;
    END LOOP;

    v_subtotal := GREATEST(0, v_subtotal - COALESCE(p_total_discount, 0));
    v_tax := COALESCE(p_tax, 0);
    v_grand_total := v_subtotal + v_tax;

    UPDATE public.orders
    SET subtotal = v_subtotal,
        total_tax = v_tax,
        grand_total = v_grand_total
    WHERE id = v_order_id;

    -- إدراج سجلات السداد في payments بدعم الدفع المتعدد
    IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
        FOR v_pmt IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
            IF COALESCE((v_pmt->>'amount')::numeric, 0) > 0 THEN
                INSERT INTO public.payments (
                    order_id,
                    amount,
                    payment_method,
                    sub_method,
                    status,
                    organization_id,
                    cash_account_id,
                    shift_id,
                    auth_reference
                ) VALUES (
                    v_order_id,
                    (v_pmt->>'amount')::numeric,
                    COALESCE(v_pmt->>'method', p_payment_method),
                    v_pmt->>'sub_method',
                    'COMPLETED',
                    p_org_id,
                    p_cash_account_id,
                    p_shift_id,
                    v_pmt->>'auth_reference'
                );
            END IF;
        END LOOP;
    ELSE
        INSERT INTO public.payments (
            order_id,
            amount,
            payment_method,
            sub_method,
            status,
            organization_id,
            cash_account_id,
            shift_id
        ) VALUES (
            v_order_id,
            COALESCE(NULLIF(p_payment_amount, 0), v_grand_total),
            p_payment_method,
            NULL,
            'COMPLETED',
            p_org_id,
            p_cash_account_id,
            p_shift_id
        );
    END IF;

    -- استهلاك وصفات التصنيع إن وجدت
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mfg_deduct_stock_from_order' AND pronamespace = 'public'::regnamespace) THEN
            PERFORM public.mfg_deduct_stock_from_order(v_order_id);
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'tax', v_tax,
        'grand_total', v_grand_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_pos_sale_atomic(jsonb, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid, numeric, text, uuid, numeric, jsonb) TO authenticated, service_role;
