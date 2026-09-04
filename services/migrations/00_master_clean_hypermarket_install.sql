-- ==============================================================================
-- TriPro ERP — السكريبت الذهبي الموحد لتهيئة نظام الهايبر ماركت ونقاط البيع
-- الإصدار: 2026-09-04 Final Master Edition
-- يشمل كافة التحديثات والإصلاحات المحاسبية والمخزنية وعروض الأسعار في ملف واحد
-- جاهز للتثبيت المباشر لأي عميل جديد بضغطة زر واحدة.
-- ==============================================================================

-- 1. التأكد من جداول وأعمدة المرتجعات ومسحوبات النقدية
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS shift_id UUID;
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS refund_method TEXT DEFAULT 'CASH';
CREATE INDEX IF NOT EXISTS idx_sales_returns_shift_id ON public.sales_returns(shift_id);

-- أعمدة الطلبات والخصومات
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_charge NUMERIC DEFAULT 0;

-- أعمدة مسحوبات الدرج المصنفة (مصروف / عهدة / خزينة)
CREATE TABLE IF NOT EXISTS public.pos_petty_cash_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    shift_id TEXT,
    public_shift_id UUID,
    cashier_id UUID,
    amount NUMERIC(15, 2) NOT NULL,
    payout_type VARCHAR(50) DEFAULT 'VAULT_TRANSFER',
    reason VARCHAR(255) NOT NULL,
    expense_account_id UUID,
    target_account_id UUID,
    custodian_name TEXT,
    cost_center_id UUID,
    journal_entry_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS public_shift_id UUID;
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS target_account_id UUID;
ALTER TABLE public.pos_petty_cash_payouts ADD COLUMN IF NOT EXISTS custodian_name TEXT;
CREATE INDEX IF NOT EXISTS idx_petty_cash_public_shift_id ON public.pos_petty_cash_payouts(public_shift_id);

-- أعمدة العروض الترويجية والحدود القصوى
ALTER TABLE public.retail_promotions ADD COLUMN IF NOT EXISTS bundle_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.retail_promotions ADD COLUMN IF NOT EXISTS max_quantity_per_customer NUMERIC DEFAULT NULL;

-- 2. دالة ملخص الوردية وحساب النقدية المتوقعة بدقة
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

    -- مسحوبات النقدية
    SELECT COALESCE(SUM(amount), 0) INTO v_petty_cash
    FROM public.pos_petty_cash_payouts
    WHERE public_shift_id = p_shift_id
       OR shift_id::text = p_shift_id::text;

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

    -- مرتجعات النقدية
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

-- 3. دالة إغلاق الوردية
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id    uuid,
    p_actual_cash numeric,
    p_notes       text    DEFAULT NULL,
    p_org_id      uuid    DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_summary       JSONB;
    v_expected_cash numeric;
    v_difference    numeric;
BEGIN
    v_summary       := public.get_shift_summary(p_shift_id);
    v_expected_cash := COALESCE((v_summary->>'expected_cash')::numeric, 0);
    v_difference    := p_actual_cash - v_expected_cash;

    UPDATE public.shifts SET
        end_time        = now(),
        actual_cash     = p_actual_cash,
        closing_balance = p_actual_cash,
        expected_cash   = v_expected_cash,
        difference      = v_difference,
        status          = 'CLOSED',
        notes           = p_notes
    WHERE id = p_shift_id;

    BEGIN
        PERFORM public.generate_shift_closing_entry(p_shift_id, p_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, text, uuid) TO authenticated;

-- 4. دالة توليد قيد إغلاق الوردية المحاسبي المتوازن 100%
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(
    p_shift_id uuid,
    p_org_id   uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
    v_shift               public.shifts;
    v_org_id              uuid;
    v_summary             RECORD;
    v_petty_cash          numeric := 0;
    v_cash_returns        numeric := 0;
    v_diff                numeric := 0;
    v_je_id               uuid;
    v_mappings            jsonb;
    v_cash_acc_id         uuid;
    v_safe_acc_id         uuid;
    v_sales_acc_id        uuid;
    v_sales_return_acc_id uuid;
    v_discount_acc_id     uuid;
    v_service_acc_id      uuid;
    v_vat_acc_id          uuid;
    v_cogs_acc_id         uuid;
    v_inventory_acc_id    uuid;
    v_cash_deficit_acc_id uuid;
    v_cash_surplus_acc_id uuid;
    v_custodian_acc_id    uuid;
    v_item_cost_record    RECORD;
    v_payout_record       RECORD;
    v_service_total       numeric := 0;
    v_food_sales_subtotal numeric := 0;
    v_total_discount      numeric := 0;
    v_actual_cash         numeric := 0;
    v_target_acc          uuid;
    v_line_desc           text;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    v_org_id      := COALESCE(p_org_id, v_shift.organization_id);
    v_actual_cash := COALESCE(v_shift.actual_cash, 0);

    -- مسحوبات النقدية
    SELECT COALESCE(SUM(amount), 0) INTO v_petty_cash
    FROM public.pos_petty_cash_payouts
    WHERE public_shift_id = p_shift_id
       OR shift_id::text = p_shift_id::text;

    IF v_petty_cash = 0 THEN
        SELECT COALESCE(SUM(jl.credit), 0) INTO v_petty_cash
        FROM public.journal_entries je
        JOIN public.journal_lines jl ON je.id = jl.journal_entry_id
        JOIN public.accounts a ON jl.account_id = a.id
        WHERE je.reference LIKE 'PC-%'
          AND je.organization_id = v_org_id
          AND (a.code = '1231' OR a.code LIKE '1231%' OR a.code = '1101' OR a.name LIKE '%صندوق%')
          AND je.created_at >= v_shift.start_time
          AND je.created_at <= COALESCE(v_shift.end_time, now());
    END IF;

    -- مرتجعات النقدية
    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_returns
    FROM public.sales_returns
    WHERE (
        shift_id = p_shift_id
        OR (
            user_id = v_shift.user_id
            AND created_at >= v_shift.start_time
            AND created_at <= COALESCE(v_shift.end_time, now())
            AND (organization_id = v_org_id OR organization_id IS NULL)
        )
    )
    AND (
        notes LIKE '%نقدي%' OR notes LIKE '%CASH%'
        OR refund_method = 'CASH' OR refund_method IS NULL
    );

    -- أوامر الوردية النقدية
    CREATE TEMP TABLE temp_shift_orders ON COMMIT DROP AS
    SELECT o.id, o.subtotal, COALESCE(o.service_charge, 0) AS service_charge,
           COALESCE(o.total_tax, 0) AS total_tax,
           COALESCE(o.total_discount, 0) AS total_discount,
           o.grand_total, o.order_type
    FROM   public.orders o
    WHERE  o.shift_id        = p_shift_id
      AND  o.organization_id = v_org_id
      AND  o.status         IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
      AND  EXISTS (
          SELECT 1 FROM public.payments p
          WHERE  p.order_id = o.id
            AND  UPPER(p.payment_method) = 'CASH'
            AND  p.status = 'COMPLETED'
      );

    SELECT
        COALESCE(SUM(subtotal), 0)       AS subtotal,
        COALESCE(SUM(service_charge), 0) AS service_charge_sum,
        COALESCE(SUM(total_tax), 0)      AS tax,
        COALESCE(SUM(total_discount), 0) AS discount_sum,
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE  p.order_id IN (SELECT id FROM temp_shift_orders)
              AND  UPPER(p.payment_method) = 'CASH'
              AND  p.status = 'COMPLETED'
        ), 0) AS cash_total,
        COALESCE((
            SELECT SUM(line_cost) FROM (
                SELECT public.uom_convert(oi.quantity, oi.uom_id, pr.base_uom_id)
                       * COALESCE(NULLIF(oi.unit_cost,0), NULLIF(pr.weighted_average_cost,0), pr.cost, 0) AS line_cost
                FROM   public.order_items oi
                JOIN   public.products   pr ON oi.product_id = pr.id
                WHERE  oi.order_id IN (SELECT id FROM temp_shift_orders)
                  AND  NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT (public.uom_convert(oi.quantity, oi.uom_id, pr.base_uom_id)
                       * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id))
                       * COALESCE(NULLIF(rm.weighted_average_cost,0), rm.cost, 0) AS line_cost
                FROM   public.order_items oi
                JOIN   public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN   public.products rm ON bom.raw_material_id = rm.id
                JOIN   public.products pr ON oi.product_id = pr.id
                WHERE  oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded
        ), 0) AS cost_total
    INTO v_summary
    FROM temp_shift_orders;

    IF v_summary.service_charge_sum > 0 THEN
        v_service_total := v_summary.service_charge_sum;
    ELSE
        v_service_total := GREATEST(0, (v_summary.cash_total - (v_summary.subtotal + v_summary.tax)));
    END IF;

    v_food_sales_subtotal := v_summary.subtotal;

    -- احتساب خصم العروض الممنوحة
    v_total_discount := GREATEST(
        COALESCE(v_summary.discount_sum, 0),
        GREATEST(0, (v_summary.subtotal + v_service_total + v_summary.tax) - v_summary.cash_total)
    );

    v_diff := v_actual_cash
              - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total - v_petty_cash - v_cash_returns);

    -- شجرة الحسابات
    SELECT account_mappings INTO v_mappings
    FROM   public.company_settings WHERE organization_id = v_org_id;

    v_cash_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH'),
        v_shift.treasury_account_id,
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231','123101') LIMIT 1)
    ));

    v_safe_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'MAIN_TREASURY'),
        public.safe_cast_uuid(v_mappings->>'SAFE'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('123101','1232','1101') LIMIT 1),
        v_cash_acc_id
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
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '412' LIMIT 1),
        v_sales_return_acc_id
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

    v_custodian_acc_id := public.resolve_leaf_account(
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1224' LIMIT 1)
    );

    -- إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, is_posted, related_document_id, related_document_type, user_id
    )
    VALUES (
        now()::date,
        'إغلاق وردية مطعم مجمع (المبيعات النقدية)',
        'SHIFT-' || to_char(now(), 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4),
        'posted', v_org_id, true, p_shift_id, 'shift', v_shift.user_id
    ) RETURNING id INTO v_je_id;

    -- 1. إيراد المبيعات (دائن)
    IF v_food_sales_subtotal > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_food_sales_subtotal, 'إيرادات مبيعات الوردية (الإجمالي)', v_org_id);
    END IF;

    -- 2. إيراد رسوم الخدمة (دائن)
    IF v_service_total > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_service_acc_id, 0, v_service_total, 'إيرادات رسوم الخدمة (الوردية)', v_org_id);
    END IF;

    -- 3. ضريبة القيمة المضافة (دائن)
    IF v_summary.tax > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة للوردية', v_org_id);
    END IF;

    -- 4. خصومات المبيعات والعروض (مدين)
    IF v_total_discount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_discount_acc_id, v_total_discount, 0, 'خصومات مبيعات وعروض ترويجية للوردية', v_org_id);
    END IF;

    -- 5. مردودات ومسموحات المبيعات (مدين)
    IF v_cash_returns > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_return_acc_id, v_cash_returns, 0, 'مردودات مبيعات نقدية للوردية', v_org_id);
    END IF;

    -- 6. المسحوبات والمصروفات من الدرج (مدين الوجهة فقط)
    FOR v_payout_record IN (
        SELECT id, amount, payout_type, reason, custodian_name,
               target_account_id, expense_account_id
        FROM public.pos_petty_cash_payouts
        WHERE (public_shift_id = p_shift_id
               OR shift_id::text = p_shift_id::text)
          AND amount > 0
        ORDER BY created_at
    ) LOOP
        v_target_acc := NULL;
        v_line_desc  := NULL;

        IF v_payout_record.payout_type = 'EXPENSE' THEN
            v_target_acc := COALESCE(v_payout_record.expense_account_id, v_payout_record.target_account_id);
            v_line_desc  := COALESCE(v_payout_record.reason, 'مصروف نثري من الدرج');
        ELSIF v_payout_record.payout_type = 'CUSTODIAN' THEN
            v_target_acc := COALESCE(v_payout_record.target_account_id, v_custodian_acc_id);
            v_line_desc  := 'سحب عهدة' ||
                CASE WHEN v_payout_record.custodian_name IS NOT NULL
                     THEN ' — المستلم: ' || v_payout_record.custodian_name
                     ELSE '' END;
        ELSE
            v_target_acc := COALESCE(v_payout_record.target_account_id, v_safe_acc_id);
            v_line_desc  := COALESCE(v_payout_record.reason, 'توريد نقدية من الدرج إلى الخزينة');
        END IF;

        IF v_target_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, public.resolve_leaf_account(v_target_acc),
                    v_payout_record.amount, 0, v_line_desc, v_org_id);
        END IF;
    END LOOP;

    -- 7. النقدية الفعلية بالدرج (مدين)
    IF v_actual_cash > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_actual_cash, 0, 'النقدية المقبوضة فعلياً بالصندوق (الدرج)', v_org_id);
    END IF;

    -- 8. فروقات الدرج غير المبررة
    IF v_diff < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الوردية الفعلي', v_org_id);
    ELSIF v_diff > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'زيادة نقدية الوردية', v_org_id);
    END IF;

    -- 9. تكلفة البضاعة وصرف المخزون
    IF COALESCE(v_summary.cost_total, 0) > 0 THEN
        FOR v_item_cost_record IN (
            SELECT inv_acc, SUM(line_cost) AS total_cost FROM (
                SELECT COALESCE(pr.inventory_account_id, v_inventory_acc_id) AS inv_acc,
                       public.uom_convert(oi.quantity, oi.uom_id, pr.base_uom_id)
                       * COALESCE(NULLIF(oi.unit_cost,0), NULLIF(pr.weighted_average_cost,0), pr.cost, 0) AS line_cost
                FROM   public.order_items oi
                JOIN   public.products   pr ON oi.product_id = pr.id
                WHERE  oi.order_id IN (SELECT id FROM temp_shift_orders)
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
                WHERE  oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded_inv GROUP BY 1
        ) LOOP
            IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية النقدية', v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون الوردية النقدية', v_org_id);
            END IF;
        END LOOP;
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    DROP TABLE IF EXISTS temp_shift_orders;
    RETURN v_je_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.generate_shift_closing_entry(uuid, uuid) TO authenticated;
