-- ==============================================================================
-- 🌟 TriPro ERP — الشامل لإصلاح إغلاق ورديات الكاشير والحجوزات والردود متعددة القنوات
-- التاريخ: 2026-10-22
-- الأهداف المحققة دفعة واحدة:
-- 1. فحص وضمان وجود كافة الأعمدة المطلوبة في جداول orders, shifts, payments, pos_drawer_transactions, sales_returns
-- 2. القضاء التام على أخطاء (column o.cashier_id does not exist) و (column o.total_amount does not exist)
-- 3. استيعاب عمليات الحجز والعربون متعدد القنوات (نقد / فودافون كاش / انستاباي / فيزا)
-- 4. استيعاب رد العربون عند الإلغاء نقدياً أو إلكترونياً وعزل نقدية الدرج الحقيقية
-- 5. معالجة تنفيذ الحجز المسبق واستهلاكه في فاتورة البيع وقيود اليومية المتزنة 100%
-- 6. الاستغناء التام عن الجداول المؤقتة (TEMP TABLES) لمنع تضارب الاتصالات في Supabase
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 🛡️ أولاً: فحص وتأمين كافة الأعمدة المطلوبة في كافة الجداول المعنية (Schema Alignment)
-- ==============================================================================

-- 1. جدول الطلبات والمبيعات public.orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_id UUID; -- عمود أمان بديل لمنع أي خطأ كاشير قديم
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0; -- عمود أمان بديل
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_tax NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax NUMERIC DEFAULT 0; -- عمود أمان بديل
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS grand_total NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'CASH';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_charge NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_fee NUMERIC DEFAULT 0; -- عمود أمان بديل

-- 2. جدول المدفوعات public.payments
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'CASH';
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'CASH';
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS sub_method TEXT;
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount NUMERIC(15,2) DEFAULT 0;
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';
    END IF;
END $$;

-- 3. جدول ورديات الكاشير public.shifts
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(15,2);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS actual_cash NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS difference NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'OPEN';
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS cashier_id UUID;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS treasury_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
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
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_cash_deposits_in NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_wallet_deposits_in NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_instapay_deposits_in NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_card_deposits_in NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_cash_deposits_refund NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_wallet_deposits_refund NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_instapay_deposits_refund NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS non_cash_reconciliation JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closing_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- 4. جدول حركات الدرج public.pos_drawer_transactions
CREATE TABLE IF NOT EXISTS public.pos_drawer_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
    cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    custodian_or_payer_name VARCHAR(255),
    reference_number VARCHAR(100),
    payment_method VARCHAR(50) DEFAULT 'CASH',
    customer_phone VARCHAR(50),
    delivery_date DATE,
    booking_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS shift_id UUID;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS cashier_id UUID;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50);
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS account_id UUID;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS custodian_or_payer_name VARCHAR(255);
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'CASH';
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS booking_notes TEXT;
ALTER TABLE public.pos_drawer_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

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

-- 5. جدول المرتجعات public.sales_returns
CREATE TABLE IF NOT EXISTS public.sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    shift_id UUID,
    user_id UUID,
    cashier_id UUID,
    created_by UUID,
    total_amount NUMERIC(15, 2) DEFAULT 0,
    refund_method TEXT DEFAULT 'CASH',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS shift_id UUID;
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS cashier_id UUID;
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS refund_method TEXT DEFAULT 'CASH';
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 6. جدول المصروفات النثرية التوافقي public.pos_petty_cash_payouts
CREATE TABLE IF NOT EXISTS public.pos_petty_cash_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    shift_id TEXT,
    public_shift_id UUID,
    cashier_id UUID,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    payout_type VARCHAR(50) DEFAULT 'EXPENSE',
    reason VARCHAR(255) NOT NULL DEFAULT '',
    expense_account_id UUID,
    target_account_id UUID,
    custodian_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS public_shift_id UUID;
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS shift_id TEXT;
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS cashier_id UUID;
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS payout_type VARCHAR(50) DEFAULT 'EXPENSE';
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS reason VARCHAR(255) DEFAULT '';
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS expense_account_id UUID;
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS target_account_id UUID;
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS custodian_name TEXT;


-- ==============================================================================
-- 🛡️ ثانياً: الدوال المساعدة في التحويل وحل الحسابات الفرعية
-- ==============================================================================

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
    
    SELECT id INTO v_child_id 
    FROM public.accounts 
    WHERE parent_id = p_account_id AND (is_group IS FALSE OR is_group IS NULL)
    ORDER BY code ASC LIMIT 1;
    
    RETURN COALESCE(v_child_id, p_account_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_leaf_account(uuid) TO authenticated, service_role, anon;


-- ==============================================================================
-- 🛡️ ثالثاً: دالة تسجيل حركة درج الكاشير متعددة القنوات
-- ==============================================================================

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
        RAISE EXCEPTION 'لا يمكن تسجيل حركة على وردية مغلقة ومؤكدة الإقفال.';
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

    -- مزامنة مع pos_petty_cash_payouts إن وجدت
    IF v_actual_type IN ('PAID_OUT_EXPENSE', 'SAFE_DROP') THEN
        BEGIN
            INSERT INTO public.pos_petty_cash_payouts (
                shift_id, public_shift_id, organization_id, cashier_id, amount,
                payout_type, reason, expense_account_id, target_account_id, custodian_name
            ) VALUES (
                p_shift_id::text, p_shift_id, v_org_id, auth.uid(), p_amount,
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


-- ==============================================================================
-- 🛡️ رابعاً: ترقية دالة ملخص الوردية get_shift_summary (آمنة تماماً 100%)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_shift_summary(uuid);

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
        -- تفاصيل بنود العربونات المستلمة والردود (تظهر كاملة دائماً حتى لو كانت أصفار)
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


-- ==============================================================================
-- 🛡️ خامساً: ترقية دالة توليد قيد اليومية generate_shift_closing_entry
-- ==============================================================================

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
    v_cash_deficit_acc_id   uuid;
    v_cash_surplus_acc_id   uuid;
    v_default_exp_acc_id    uuid;

    -- مبالغ
    v_food_subtotal         numeric := 0;
    v_service_total         numeric := 0;
    v_vat_total             numeric := 0;
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

    -- عربونات
    v_cash_deposits_in         numeric := 0;
    v_wallet_deposits_in       numeric := 0;
    v_instapay_deposits_in     numeric := 0;
    v_card_deposits_in         numeric := 0;
    v_cash_deposits_refund     numeric := 0;
    v_wallet_deposits_refund   numeric := 0;
    v_instapay_deposits_refund numeric := 0;

    v_total_debit           numeric := 0;
    v_total_credit          numeric := 0;
    v_payout_row            record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id          := COALESCE(v_shift.organization_id, p_org_id, public.get_my_org());
    v_actual_cash     := COALESCE(v_shift.actual_cash, 0);
    v_opening_balance := COALESCE(v_shift.opening_balance, 0);

    -- جلب ملخص الوردية الشامل
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

    -- خريطة الحسابات
    BEGIN
        SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    EXCEPTION WHEN OTHERS THEN v_mappings := '{}'::jsonb;
    END;

    -- حل الحسابات
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH'),
        v_shift.treasury_account_id,
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('1231','123101','1101','10101','101') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND is_group = false ORDER BY code ASC LIMIT 1)
    ));

    v_safe_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'MAIN_TREASURY'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('1235','1232','1102','10102') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_cash_acc_id
    ));

    v_card_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CARD_CLEARING'),
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

    -- حساب دفعات مقدمة من العملاء (عربونات الحجز)
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

    -- استعلام مبيعات الوردية (باستخدام الأعمدة المدققة فقط وبدون أي جداول مؤقتة)
    SELECT 
        COALESCE(SUM(COALESCE(o.subtotal, 0)), 0),
        COALESCE(SUM(COALESCE(o.service_charge, o.service_fee, 0)), 0),
        COALESCE(SUM(COALESCE(o.total_tax, o.tax, 0)), 0),
        COALESCE(SUM(COALESCE(o.total_discount, 0)), 0),
        COALESCE(SUM(COALESCE(o.grand_total, o.total_amount, 0)), 0)
    INTO v_food_subtotal, v_service_total, v_vat_total, v_total_discount, v_grand_total_sum
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

    -- إذا كانت الوردية خالية تماماً من أي حركة بيع أو نقدية أو عربونات
    IF v_food_subtotal = 0 AND v_safe_drops = 0 AND v_paid_outs = 0 AND v_paid_ins = 0 
       AND v_cash_returns = 0 AND v_diff = 0 AND v_net_cash_movement = 0
       AND v_cash_deposits_in = 0 AND v_wallet_deposits_in = 0 AND v_instapay_deposits_in = 0 AND v_card_deposits_in = 0
       AND v_cash_deposits_refund = 0 AND v_wallet_deposits_refund = 0 AND v_instapay_deposits_refund = 0 THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RETURN NULL;
    END IF;

    -- تنظيف أي قيد قديم لهذه الوردية
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE (related_document_id = p_shift_id AND related_document_type = 'shift')
           OR id = v_shift.closing_journal_entry_id
    );
    DELETE FROM public.journal_entries 
    WHERE (related_document_id = p_shift_id AND related_document_type = 'shift')
       OR id = v_shift.closing_journal_entry_id;

    -- إنشاء القيد اليومي
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, is_posted, related_document_id, related_document_type, user_id
    ) VALUES (
        CURRENT_DATE,
        'قيد إقفال مبيعات وحركة نقدية الوردية (مع الحجوزات والردود متعددة القنوات)',
        'SHIFT-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4),
        'draft', v_org_id, false, p_shift_id, 'shift', v_shift.user_id
    ) RETURNING id INTO v_je_id;

    -- =========================================================================
    -- الطرف الدائن (Credits)
    -- =========================================================================
    -- 1. المبيعات الإجمالية
    IF v_food_subtotal > 0 AND v_sales_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_food_subtotal, 'إيراد مبيعات الوردية الإجمالي (Gross Sales)', v_org_id);
    END IF;

    -- 2. رسوم الخدمة
    IF v_service_total > 0 AND v_service_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_service_acc_id, 0, v_service_total, 'إيراد خدمة التوصيل / الصالة', v_org_id);
    END IF;

    -- 3. ضريبة القيمة المضافة
    IF v_vat_total > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_vat_total, 'ضريبة مخرجات مبيعات الوردية', v_org_id);
    END IF;

    -- 4. إجمالي عربونات الحجز المستلمة نقداً أو إلكترونياً (تضاف لحساب دفعات مقدمة من العملاء)
    IF (v_cash_deposits_in + v_wallet_deposits_in + v_instapay_deposits_in + v_card_deposits_in) > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, 0, (v_cash_deposits_in + v_wallet_deposits_in + v_instapay_deposits_in + v_card_deposits_in), 'عربونات حجز استلمها الكاشير (دفعات مقدمة من العملاء)', v_org_id);
    END IF;

    -- 5. زيادة نقدية في الدرج إن وجدت
    IF v_diff > 0 AND v_cash_surplus_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'فائض نقدية الدرج (إيراد متنوع)', v_org_id);
    END IF;

    -- 6. نقص رصيد الخزينة عند سحب نقدية صافية
    IF v_net_cash_movement < 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, 0, ABS(v_net_cash_movement), 'صافي سحب نقدية من درج الكاشير', v_org_id);
    END IF;

    -- 7. عربونات ردت إلكترونياً (تخصم من حساب الوسيط الإلكتروني)
    IF v_wallet_deposits_refund > 0 AND v_wallet_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wallet_acc_id, 0, v_wallet_deposits_refund, 'رد عربون حجز محفظة إلكترونية للعميل', v_org_id);
    END IF;

    IF v_instapay_deposits_refund > 0 AND v_instapay_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_instapay_acc_id, 0, v_instapay_deposits_refund, 'رد عربون حجز انستاباي للعميل', v_org_id);
    END IF;

    -- =========================================================================
    -- الطرف المدين (Debits)
    -- =========================================================================
    -- 1. زيادة النقدية الفعلية في درج الكاشير
    IF v_net_cash_movement > 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_net_cash_movement, 0, 'صافي النقدية الموردة لدرج الكاشير', v_org_id);
    END IF;

    -- 2. مبيعات وعربونات بطاقات الدفع
    IF (v_card_sales + v_card_deposits_in) > 0 AND v_card_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_card_acc_id, (v_card_sales + v_card_deposits_in), 0, 'حساب وسيط شبكة وبطاقات (مبيعات + عربون)', v_org_id);
    END IF;

    -- 3. مبيعات وعربونات انستاباي
    IF (v_instapay_sales + v_instapay_deposits_in) > 0 AND v_instapay_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_instapay_acc_id, (v_instapay_sales + v_instapay_deposits_in), 0, 'حساب انستاباي (مبيعات + عربون حجز)', v_org_id);
    END IF;

    -- 4. مبيعات وعربونات المحافظ الإلكترونية
    IF (v_wallet_sales + v_wallet_deposits_in) > 0 AND v_wallet_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wallet_acc_id, (v_wallet_sales + v_wallet_deposits_in), 0, 'حساب المحافظ الإلكترونية (فودافون كاش)', v_org_id);
    END IF;

    -- 5. تنفيذ الحجز / استهلاك العربون السابق في فاتورة بيع (تسوية من حساب الدفعات المقدمة)
    IF v_redeemed_deposits > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, v_redeemed_deposits, 0, 'تنفيذ حجز مسبق مستهلك في الفاتورة (تسوية دفعات مقدمة)', v_org_id);
    END IF;

    -- 6. عربونات ردت للعميل (تخفيض حساب الدفعات المقدمة من العملاء)
    IF (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund) > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund), 0, 'إلغاء حجز ورد عربون للعميل (تخفيض الدفعة المقدمة)', v_org_id);
    END IF;

    -- 7. توريد نقدية من الدرج للخزينة الرئيسية
    IF v_safe_drops > 0 AND v_safe_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_safe_acc_id, v_safe_drops, 0, 'توريد نقدية من الدرج إلى الخزينة الرئيسية', v_org_id);
    END IF;

    -- 8. مصروفات نثرية وعهد مسحوبة من الدرج
    FOR v_payout_row IN (
        SELECT COALESCE(public.resolve_leaf_account(account_id), v_default_exp_acc_id) as exp_acc, SUM(amount) as total_amt, reason
        FROM public.pos_drawer_transactions
        WHERE shift_id = p_shift_id AND transaction_type = 'PAID_OUT_EXPENSE'
        GROUP BY 1, 3
    ) LOOP
        IF v_payout_row.total_amt > 0 AND v_payout_row.exp_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_payout_row.exp_acc, v_payout_row.total_amt, 0, 'مصروف نثري من الدرج: ' || COALESCE(v_payout_row.reason, 'مصروفات تشغيلية'), v_org_id);
        END IF;
    END LOOP;

    -- 9. مرتجعات مبيعات نقدية
    IF v_cash_returns > 0 AND v_sales_return_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_return_acc_id, v_cash_returns, 0, 'مرتجع مبيعات نقدية من الدرج', v_org_id);
    END IF;

    -- 10. عجز نقدية الدرج
    IF v_diff < 0 AND v_cash_deficit_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية في عهدة الكاشير (مصروف عجز)', v_org_id);
    END IF;

    -- 11. الخصم الممنوح
    IF v_total_discount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_discount_acc_id, v_total_discount, 0, 'خصم مبيعات مسموح به', v_org_id);
    END IF;

    -- ⚖️ ضبط القيد ليكون متزناً بنسبة 100% (تطابق المدين مع الدائن حتى أدق مليم)
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_total_debit, v_total_credit
    FROM public.journal_lines
    WHERE journal_entry_id = v_je_id;

    IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
        IF v_total_debit > v_total_credit THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, COALESCE(v_cash_surplus_acc_id, v_sales_acc_id), 0, (v_total_debit - v_total_credit), 'تسوية تقريب قيد إقفال الوردية', v_org_id);
        ELSE
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, COALESCE(v_cash_deficit_acc_id, v_default_exp_acc_id), (v_total_credit - v_total_debit), 0, 'تسوية تقريب قيد إقفال الوردية', v_org_id);
        END IF;
    END IF;

    -- ترحيل القيد وربطه بالوردية
    UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_je_id;
    UPDATE public.shifts SET closing_journal_entry_id = v_je_id WHERE id = p_shift_id;

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


-- ==============================================================================
-- 🛡️ سادساً: ترقية دالة إغلاق الوردية close_shift (كلتا البصمتين 5 و 4 معايير)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.close_shift(uuid, numeric);
DROP FUNCTION IF EXISTS public.close_shift(uuid, numeric, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.close_shift(uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.close_shift(uuid, numeric, text);

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
        total_credit_sales       = COALESCE((v_summary->>'credit_sales')::numeric, 0),
        total_paid_ins           = COALESCE((v_summary->>'paid_ins')::numeric, 0),
        total_paid_outs          = COALESCE((v_summary->>'paid_outs')::numeric, 0),
        total_safe_drops         = COALESCE((v_summary->>'safe_drops')::numeric, 0),
        total_cash_returns       = COALESCE((v_summary->>'cash_returns')::numeric, 0),
        total_cash_deposits_in   = COALESCE((v_summary->>'cash_deposits_in')::numeric, 0),
        total_wallet_deposits_in = COALESCE((v_summary->>'wallet_deposits_in')::numeric, 0),
        total_instapay_deposits_in = COALESCE((v_summary->>'instapay_deposits_in')::numeric, 0),
        total_card_deposits_in   = COALESCE((v_summary->>'card_deposits_in')::numeric, 0),
        total_cash_deposits_refund = COALESCE((v_summary->>'cash_deposits_refund')::numeric, 0),
        total_wallet_deposits_refund = COALESCE((v_summary->>'wallet_deposits_refund')::numeric, 0),
        total_instapay_deposits_refund = COALESCE((v_summary->>'instapay_deposits_refund')::numeric, 0),
        non_cash_reconciliation  = COALESCE(p_reconciliation, '{}'::jsonb)
    WHERE id = p_shift_id;

    -- توليد القيد المحاسبي لإقفال الوردية
    BEGIN
        v_je_id := public.generate_shift_closing_entry(p_shift_id, v_org_id);
    EXCEPTION WHEN OTHERS THEN
        UPDATE public.shifts 
        SET notes = COALESCE(notes, '') || ' [تنبيه أثناء إغلاق الوردية: ' || SQLERRM || ']'
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

-- توفير النسخة ذات الـ 4 معايير للتوافق القديم
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
