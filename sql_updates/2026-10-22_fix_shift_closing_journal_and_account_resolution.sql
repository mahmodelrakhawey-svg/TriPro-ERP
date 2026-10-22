-- ==============================================================================
-- TriPro ERP — SQL Update: Fix Shift Closing Journal Entry & Account Resolution
-- Date: 2026-10-22
-- Target: Both General Database (pjvphxfschfllpawfewn) & Lenza Database (jsgmrspnthtlsracbmcq)
-- Purpose:
--   1. Fix shift closing journal entry not appearing in General Journal
--   2. Ensure robust account resolution for all tenants (including Malak & general DB)
--   3. Handle test shifts with zero sales but cash drawer movements or deficit/surplus
--   4. Ensure leaf account resolution and safe UUID casting
--   5. Provide both 5-arg and 4-arg overloads for close_shift
-- ==============================================================================

BEGIN;

-- 🛡️ 1. دالة التحويل الآمن لمعرف UUID
CREATE OR REPLACE FUNCTION public.safe_cast_uuid(p_val text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN p_val::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.safe_cast_uuid(text) TO authenticated, service_role, anon;

-- 🛡️ 2. دالة استخراج الحساب الفرعي النشط (Leaf Account Resolution)
CREATE OR REPLACE FUNCTION public.resolve_leaf_account(p_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_child_id uuid;
    v_is_group boolean;
BEGIN
    IF p_account_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT is_group INTO v_is_group FROM public.accounts WHERE id = p_account_id;
    IF v_is_group IS NOT TRUE THEN
        RETURN p_account_id;
    END IF;
    
    -- إذا كان حساباً رئيسياً، نأخذ أول حساب فرعي تحته
    SELECT id INTO v_child_id 
    FROM public.accounts 
    WHERE parent_id = p_account_id AND (is_group IS FALSE OR is_group IS NULL)
    ORDER BY code ASC LIMIT 1;
    
    RETURN COALESCE(v_child_id, p_account_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_leaf_account(uuid) TO authenticated, service_role, anon;

-- 🛡️ 3. التأكد من وجود جدول حركات الدرج النقدية pos_drawer_transactions
CREATE TABLE IF NOT EXISTS public.pos_drawer_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
    cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'PAID_IN', 'PAID_OUT_EXPENSE', 'SAFE_DROP', 'ADVANCE_DEPOSIT_IN'
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    custodian_or_payer_name VARCHAR(255),
    reference_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_drawer_trans_shift_id ON public.pos_drawer_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_pos_drawer_trans_org_id ON public.pos_drawer_transactions(organization_id);

ALTER TABLE public.pos_drawer_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "pos_drawer_trans_tenant_isolation" ON public.pos_drawer_transactions;
    CREATE POLICY "pos_drawer_trans_tenant_isolation" ON public.pos_drawer_transactions
        FOR ALL USING (
            organization_id = public.get_my_org() OR 
            organization_id IS NULL OR
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
        );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

GRANT ALL ON TABLE public.pos_drawer_transactions TO authenticated, service_role, anon;

-- 🛡️ 4. أعمدة جدول shifts وقنوات التجميع
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

-- أعمدة جدول المدفوعات payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS sub_method VARCHAR(50);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS auth_reference VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_payments_shift_id ON public.payments(shift_id);

-- 🛡️ 5. دالة تسجيل حركة الدرج record_pos_drawer_transaction
CREATE OR REPLACE FUNCTION public.record_pos_drawer_transaction(
    p_shift_id UUID,
    p_type VARCHAR(50),
    p_amount NUMERIC,
    p_reason TEXT,
    p_account_id UUID DEFAULT NULL,
    p_custodian_name VARCHAR(255) DEFAULT NULL,
    p_org_id UUID DEFAULT NULL
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
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    IF v_shift.end_time IS NOT NULL AND v_shift.status = 'CLOSED' THEN
        RAISE EXCEPTION 'لا يمكن تسجيل حركة نقدية على وردية مغلقة ومؤرخة بالفعل.';
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());

    INSERT INTO public.pos_drawer_transactions (
        organization_id,
        shift_id,
        cashier_id,
        transaction_type,
        amount,
        reason,
        account_id,
        custodian_or_payer_name
    ) VALUES (
        v_org_id,
        p_shift_id,
        auth.uid(),
        p_type,
        p_amount,
        p_reason,
        p_account_id,
        p_custodian_name
    ) RETURNING id INTO v_trans_id;

    -- التوافق مع pos_petty_cash_payouts إن وجد
    IF p_type = 'PAID_OUT_EXPENSE' OR p_type = 'SAFE_DROP' THEN
        BEGIN
            INSERT INTO public.pos_petty_cash_payouts (
                shift_id, organization_id, cashier_id, amount,
                payout_type, reason, expense_account_id, target_account_id, custodian_name
            ) VALUES (
                p_shift_id, v_org_id, auth.uid(), p_amount,
                CASE WHEN p_type = 'SAFE_DROP' THEN 'SAFE_DROP' ELSE 'EXPENSE' END,
                p_reason,
                CASE WHEN p_type = 'PAID_OUT_EXPENSE' THEN p_account_id ELSE NULL END,
                CASE WHEN p_type = 'SAFE_DROP' THEN p_account_id ELSE NULL END,
                p_custodian_name
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    RETURN v_trans_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_pos_drawer_transaction(UUID, VARCHAR, NUMERIC, TEXT, UUID, VARCHAR, UUID) TO authenticated, service_role;


-- 🛡️ 6. دالة ملخص الوردية get_shift_summary
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
    
    v_cash_sales          NUMERIC := 0;
    v_card_sales          NUMERIC := 0;
    v_instapay_sales      NUMERIC := 0;
    v_wallet_sales        NUMERIC := 0;
    v_redeemed_deposits   NUMERIC := 0;
    v_credit_sales        NUMERIC := 0;
    v_total_gross_sales   NUMERIC := 0;
    v_total_discounts     NUMERIC := 0;

    v_cash_count          INTEGER := 0;
    v_card_count          INTEGER := 0;
    v_instapay_count      INTEGER := 0;
    v_wallet_count        INTEGER := 0;
    v_redeemed_count      INTEGER := 0;
    v_credit_count        INTEGER := 0;
    v_total_order_count   INTEGER := 0;

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

    -- أ. تجميع المدفوعات من جدول payments
    SELECT
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

    -- إذا لم تكن مسجلة في payments، نقرأ مباشرة من orders
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

    -- ب. حركات النقدية بالدرج من pos_drawer_transactions
    BEGIN
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type IN ('PAID_IN', 'ADVANCE_DEPOSIT_IN') THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN transaction_type = 'PAID_OUT_EXPENSE' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN transaction_type = 'SAFE_DROP' THEN amount ELSE 0 END), 0)
        INTO v_paid_ins, v_paid_outs, v_safe_drops
        FROM public.pos_drawer_transactions
        WHERE shift_id = p_shift_id;
    EXCEPTION WHEN OTHERS THEN
        v_paid_ins := 0; v_paid_outs := 0; v_safe_drops := 0;
    END;

    -- دعم التوافق مع pos_petty_cash_payouts القديم
    IF v_paid_outs = 0 AND v_safe_drops = 0 THEN
        BEGIN
            SELECT 
                COALESCE(SUM(CASE WHEN payout_type = 'SAFE_DROP' OR reason LIKE '%سحب%' OR reason LIKE '%تفريغ%' OR reason LIKE '%توريد%' THEN amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN payout_type = 'EXPENSE' OR (payout_type IS NULL AND reason NOT LIKE '%توريد%') THEN amount ELSE 0 END), 0)
            INTO v_safe_drops, v_paid_outs
            FROM public.pos_petty_cash_payouts
            WHERE shift_id = p_shift_id OR public_shift_id = p_shift_id;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

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

    -- د. المعادلة المحاسبية لنقدية الدرج
    v_expected_cash := GREATEST(0, (v_opening_balance + v_cash_sales + v_paid_ins) - (v_paid_outs + v_safe_drops + v_cash_returns));

    RETURN jsonb_build_object(
        'opening_balance',        v_opening_balance,
        'total_sales',            v_total_gross_sales,
        'gross_sales',            v_total_gross_sales,
        'total_discounts',        v_total_discounts,
        'order_count',            v_total_order_count,
        'cash_sales',             v_cash_sales,
        'card_sales',             v_card_sales,
        'instapay_sales',         v_instapay_sales,
        'wallet_sales',           v_wallet_sales,
        'redeemed_deposits',      v_redeemed_deposits,
        'credit_sales',           v_credit_sales,
        'cash_count',             v_cash_count,
        'card_count',             v_card_count,
        'instapay_count',         v_instapay_count,
        'wallet_count',           v_wallet_count,
        'redeemed_count',         v_redeemed_count,
        'credit_count',           v_credit_count,
        'paid_ins',               v_paid_ins,
        'paid_outs',              v_paid_outs,
        'petty_cash',             v_paid_outs,
        'safe_drops',             v_safe_drops,
        'cash_drops',             v_safe_drops,
        'cash_returns',           v_cash_returns,
        'expected_cash',          v_expected_cash
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_shift_summary(uuid) TO authenticated, service_role, anon;


-- 🛡️ 7. دالة توليد قيد اليومية المجمع الشامل للوردية generate_shift_closing_entry
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
    v_paid_outs           numeric := 0;

    v_total_debit         numeric := 0;
    v_total_credit        numeric := 0;
    v_payout_row          record;
    v_item_cost_record    record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي لمنع أي تعارض مع حراس الحصانة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- نحدد المؤسسة بدقة: أولاً من الوردية نفسها، ثم المعامل الممرر، ثم دالة المؤسسة الحالية
    v_org_id          := COALESCE(v_shift.organization_id, p_org_id, public.get_my_org());
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
    v_paid_outs         := COALESCE((v_summary->>'paid_outs')::numeric, 0);
    v_diff              := v_actual_cash - v_expected_cash;

    -- صافي حركة النقدية الموردة فعلياً بالدرج مقارنة بالرصيد الافتتاحي
    v_net_cash_movement := v_actual_cash - v_opening_balance;

    -- جلب خريطة الحسابات إن وجدت للمؤسسة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🔍 1. حساب الصندوق / نقدية الدرج
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH'),
        v_shift.treasury_account_id,
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('1231','123101','1101','10101','101') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%صندوق%' OR name LIKE '%درج%' OR name LIKE '%نقدية%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND is_group = false ORDER BY code ASC LIMIT 1)
    ));

    -- 🔍 2. حساب الخزينة الرئيسية
    v_safe_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'MAIN_TREASURY'),
        public.safe_cast_uuid(v_mappings->>'SAFE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('1232','1102','10102') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%رئيسي%' OR name LIKE '%خزينة%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1),
        v_cash_acc_id
    ));

    -- 🔍 3. حساب البطاقات والشبكة
    v_card_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'POS_CARD_CLEARING'),
        public.safe_cast_uuid(v_mappings->>'BANK'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1214%' OR code LIKE '121%' OR code LIKE '1102%' OR code LIKE '102%') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%بنك%' OR name LIKE '%فيزا%' OR name LIKE '%بطاق%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1),
        v_cash_acc_id
    ));

    -- 🔍 4. حساب إنستاباي
    v_instapay_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'INSTAPAY_CLEARING'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1215%' OR code LIKE '121%') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%انستاباي%' OR name LIKE '%إنستاباي%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1),
        v_card_acc_id
    ));

    -- 🔍 5. حساب المحافظ الإلكترونية
    v_wallet_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'WALLET_CLEARING'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1216%' OR code LIKE '121%') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%محفظة%' OR name LIKE '%فودافون كاش%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1),
        v_instapay_acc_id
    ));

    -- 🔍 6. حساب العملاء دفعات مقدمة (العربونات)
    v_customer_adv_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CUSTOMER_ADVANCES'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '20102%' OR code LIKE '2202%' OR code LIKE '2102%' OR code LIKE '221%') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%عربون%' OR name LIKE '%دفعات مقدمة%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🔍 7. حساب إيرادات المبيعات
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_REVENUE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('411','4111','4101','41','401') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%مبيعات%' OR name LIKE '%إيراد المبيعات%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🔍 8. حساب مردودات المبيعات
    v_sales_return_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_RETURNS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('412','4103') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%مردود%' OR name LIKE '%مرتجع%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1),
        v_sales_acc_id
    ));

    -- 🔍 9. حساب الخصم المسموح به
    v_discount_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_DISCOUNT'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('413','4102') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%خصم مسموح به%' OR name LIKE '%خصومات%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1),
        v_sales_acc_id
    ));

    -- 🔍 10. حساب خدمة الصالة / التوصيل
    v_service_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SERVICE_CHARGE_REVENUE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('41104','414') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_sales_acc_id
    ));

    -- 🔍 11. حساب ضريبة القيمة المضافة
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'VAT'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('2231','2103','2105','223') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%ضريبة%' OR name LIKE '%قيمة مضافة%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🔍 12. حساب تكلفة المبيعات والمخزون
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'COGS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('511','501','5101') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%تكلفة المبيعات%' OR name LIKE '%تكلفة البضاعة%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'INVENTORY_FINISHED_GOODS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('10302','1213','10301','103') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%مخزون%' OR name LIKE '%بضاعة%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🔍 13. حسابات العجز والفائض
    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SHORTAGE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('541','54','551') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%عجز%' OR name LIKE '%فروق نقدية مدين%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SURPLUS_ACC'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('441','44','451') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%فائض%' OR name LIKE '%فروق نقدية دائن%') AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_default_exp_acc_id := (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '5%' AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1);

    -- جلب كافة طلبات الوردية
    CREATE TEMP TABLE temp_all_shift_orders ON COMMIT DROP AS
    SELECT o.id, o.subtotal, COALESCE(o.service_charge, 0) AS service_charge, o.total_tax, o.grand_total, COALESCE(o.total_discount, 0) AS total_discount
    FROM   public.orders o
    WHERE  (o.shift_id = p_shift_id OR (o.user_id = v_shift.user_id AND o.created_at >= v_shift.start_time AND o.created_at <= COALESCE(v_shift.end_time, now())))
      AND  (o.organization_id = v_org_id OR v_org_id IS NULL)
      AND  o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED');

    SELECT 
        COALESCE(SUM(subtotal), 0),
        COALESCE(SUM(service_charge), 0),
        COALESCE(SUM(total_tax), 0),
        COALESCE(SUM(total_discount), 0),
        COALESCE(SUM(grand_total), 0)
    INTO v_food_subtotal, v_service_total, v_vat_total, v_total_discount, v_grand_total_sum
    FROM temp_all_shift_orders;

    IF v_total_discount > 0 AND v_discount_acc_id IS NOT NULL THEN
        IF ABS((v_food_subtotal + v_service_total + v_vat_total) - v_grand_total_sum) <= 0.05 THEN
            v_food_subtotal := v_food_subtotal + v_total_discount;
        END IF;
    END IF;

    -- 🛡️ إذا كانت الوردية فارغة 100% ولا يوجد أي مبيعات أو حركات نقدية أو عجز/فائض، لا ننشئ قيداً فارغاً
    IF v_food_subtotal = 0 AND v_safe_drops = 0 AND v_paid_outs = 0 AND v_paid_ins = 0 
       AND v_cash_returns = 0 AND v_diff = 0 AND v_net_cash_movement = 0 THEN
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

    -- إنشاء القيد المحاسبي المجمع
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, is_posted, related_document_id, related_document_type, user_id
    ) VALUES (
        CURRENT_DATE,
        'قيد إغلاق مبيعات وحركات وردية مجمع شامل (نقدي وإلكتروني)',
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

    -- 4. فائض النقدية بالدرج إن وجد
    IF v_diff > 0 AND v_cash_surplus_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'فائض نقدية الدرج (إيراد متنوع)', v_org_id);
    END IF;

    -- 5. صافي سحوبات من رصيد الصندوق/الدرج إن كان الرصيد الفعلي أقل من الافتتاحي
    IF v_net_cash_movement < 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, 0, ABS(v_net_cash_movement), 'صافي سحوبات من رصيد الصندوق/الدرج الافتتاحي', v_org_id);
    END IF;

    -- =========================================================================
    -- الطرف المدين (Debits)
    -- =========================================================================
    -- 1. صافي النقدية المضافة للصندوق بالدرج
    IF v_net_cash_movement > 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_net_cash_movement, 0, 'صافي النقدية المقبوضة بالصندوق (الدرج)', v_org_id);
    END IF;

    -- 2. مبيعات البطاقات البنكية
    IF v_card_sales > 0 AND v_card_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_card_acc_id, v_card_sales, 0, 'متحصلات شبكة وبطاقات بنكية للوردية', v_org_id);
    END IF;

    -- 3. متحصلات إنستاباي
    IF v_instapay_sales > 0 AND v_instapay_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_instapay_acc_id, v_instapay_sales, 0, 'متحصلات إنستاباي للوردية', v_org_id);
    END IF;

    -- 4. متحصلات المحافظ الإلكترونية
    IF v_wallet_sales > 0 AND v_wallet_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wallet_acc_id, v_wallet_sales, 0, 'متحصلات محافظ إلكترونية للوردية', v_org_id);
    END IF;

    -- 5. استهلاك الحجوزات والعربونات
    IF v_redeemed_deposits > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, v_redeemed_deposits, 0, 'تسوية عربونات وحجوزات مستهلكة (عملاء دفعات مقدمة)', v_org_id);
    END IF;

    -- 6. توريد نقدية مسحوبة للخزينة الرئيسية
    IF v_safe_drops > 0 AND v_safe_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_safe_acc_id, v_safe_drops, 0, 'توريد نقدية مسحوبة من الدرج إلى الخزينة الرئيسية', v_org_id);
    END IF;

    -- 7. المصروفات النثرية المنصرفة من الدرج
    IF EXISTS (SELECT 1 FROM public.pos_drawer_transactions WHERE shift_id = p_shift_id AND transaction_type = 'PAID_OUT_EXPENSE') THEN
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
    ELSE
        FOR v_payout_row IN (
            SELECT COALESCE(public.resolve_leaf_account(expense_account_id), v_default_exp_acc_id) as exp_acc, SUM(amount) as total_amt, reason
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

    -- 10. خصومات المبيعات والعروض
    IF v_total_discount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_discount_acc_id, v_total_discount, 0, 'خصومات مبيعات وعروض ترويجية للوردية', v_org_id);
    END IF;

    -- =========================================================================
    -- تكلفة البضاعة المباعة وصرف المخزون للوردية
    -- =========================================================================
    IF EXISTS (SELECT 1 FROM temp_all_shift_orders) THEN
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
                    (SELECT id FROM public.accounts WHERE code IN ('10301','103') AND (organization_id = v_org_id OR organization_id IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1)) AS inv_acc,
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
    END IF;

    -- 🛡️ التحقق من وجود أسطر مسجلة
    IF NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE journal_entry_id = v_je_id) THEN
        DELETE FROM public.journal_entries WHERE id = v_je_id;
        DROP TABLE IF EXISTS temp_all_shift_orders;
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RETURN NULL;
    END IF;

    -- ⚖️ التحقق الحتمي من توازن المدين والدائن ومعالجة أي فروق تقريب طفيفة
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_total_debit, v_total_credit
    FROM public.journal_lines
    WHERE journal_entry_id = v_je_id;

    IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
        IF v_total_debit > v_total_credit THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, COALESCE(v_cash_surplus_acc_id, v_sales_acc_id), 0, (v_total_debit - v_total_credit), 'تسوية توازن قيد إقفال الوردية', v_org_id);
        ELSE
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, COALESCE(v_cash_deficit_acc_id, v_default_exp_acc_id), (v_total_credit - v_total_debit), 0, 'تسوية توازن قيد إقفال الوردية', v_org_id);
        END IF;
    END IF;

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
GRANT EXECUTE ON FUNCTION public.generate_shift_closing_entry(uuid, uuid) TO authenticated, service_role, anon;


-- 🛡️ 8. دالة إغلاق الوردية close_shift (النسخة الرئيسية 5 معاملات)
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
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
    v_summary       JSONB;
    v_expected_cash numeric;
    v_difference    numeric;
    v_org_id        uuid;
    v_je_id         uuid := NULL;
BEGIN
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_summary       := public.get_shift_summary(p_shift_id);
    v_expected_cash := COALESCE((v_summary->>'expected_cash')::numeric, 0);
    v_difference    := p_actual_cash - v_expected_cash;
    
    -- نعتمد org_id المسجل على الوردية أولاً لمنع التداخل بين الشركات
    v_org_id        := COALESCE((SELECT organization_id FROM public.shifts WHERE id = p_shift_id), p_org_id, public.get_my_org());

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
        v_je_id := public.generate_shift_closing_entry(p_shift_id, v_org_id);
    EXCEPTION WHEN OTHERS THEN
        -- حفظ رسالة التحذير في ملاحظات الوردية حتى لا يفقد المحاسب سبب تعذر التوليد
        UPDATE public.shifts 
        SET notes = COALESCE(notes, '') || ' [تنبيه القيد: ' || SQLERRM || ']'
        WHERE id = p_shift_id;
    END;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'shift_id', p_shift_id,
        'closing_journal_entry_id', v_je_id,
        'difference', v_difference
    );
EXCEPTION WHEN OTHERS THEN
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, text, uuid, jsonb) TO authenticated, service_role, anon;

-- 🛡️ 9. دالة بديلة للتوافق مع أي استدعاء قديم بـ 4 معاملات فقط
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id       uuid,
    p_actual_cash    numeric,
    p_notes          text    DEFAULT NULL,
    p_org_id         uuid    DEFAULT NULL
)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
    RETURN public.close_shift(p_shift_id, p_actual_cash, p_notes, p_org_id, NULL::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, text, uuid) TO authenticated, service_role, anon;

COMMIT;
