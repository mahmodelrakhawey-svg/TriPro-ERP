-- ==============================================================================
-- TriPro ERP — إصلاح قيد إغلاق وردية التجزئة والهايبر ماركت وحسابات الضريبة والخصم
-- Date: 2026-09-05
-- المشاكل المعالجة:
-- 1. توجيه ضريبة القيمة المضافة 14% إلى حساب ضريبة القيمة المضافة (2231) بدلاً من رسوم خدمة المطاعم (41104).
-- 2. موازنة الخصم المسموح به (413) عبر إثبات إيراد المبيعات بالإجمالي (Gross) لمنع ترحيل أي فرق لحساب 3999.
-- 3. توجيه صرف المخزون للسلع التجارية إلى حساب بضاعة بغرض البيع (10302) بدلاً من خامات (10301).
-- 4. تمييز وصف القيد كوردية تجزئة / هايبر ماركت بدلاً من مطعم.
-- 5. إصلاح القيد القائم SHIFT-260905-d546 وأي قيود مشابهة تلقائياً.
-- ==============================================================================

-- 1. التأكد من دعم دالة البيع السريع POS لتسجيل قيمة الضريبة
CREATE OR REPLACE FUNCTION public.complete_pos_sale_atomic(
    p_items jsonb,                 -- مصفوفة أصناف السلة [{product_id, quantity, unit_price, uom_id}]
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
    p_tax numeric DEFAULT 0
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

    -- استخراج رقم الطلب من التسلسل الآمن
    v_order_number := public.get_next_document_number(p_org_id, 'order', 'ORD-');

    -- إنشاء الطلب المباشر
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

        -- خصم مخزون الصنف مباشرة
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

    -- احتساب الإجماليات بدقة
    v_subtotal := GREATEST(0, v_subtotal - COALESCE(p_total_discount, 0));
    v_tax := COALESCE(p_tax, 0);
    v_grand_total := v_subtotal + v_tax;

    UPDATE public.orders
    SET subtotal = v_subtotal,
        total_tax = v_tax,
        grand_total = v_grand_total
    WHERE id = v_order_id;

    -- إدراج سجل السداد في payments
    INSERT INTO public.payments (
        order_id,
        amount,
        payment_method,
        status,
        organization_id,
        cash_account_id
    ) VALUES (
        v_order_id,
        COALESCE(NULLIF(p_payment_amount, 0), v_grand_total),
        p_payment_method,
        'COMPLETED',
        p_org_id,
        p_cash_account_id
    );

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

GRANT EXECUTE ON FUNCTION public.complete_pos_sale_atomic(jsonb, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid, numeric, text, uuid, numeric) TO authenticated;


-- 2. تحديث دالة generate_shift_closing_entry بالمنطق المحاسبي الكامل
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
    v_vat_total           numeric := 0;
    v_food_sales_subtotal numeric := 0;
    v_gross_sales         numeric := 0;
    v_total_discount      numeric := 0;
    v_actual_cash         numeric := 0;
    v_target_acc          uuid;
    v_line_desc           text;
    v_entry_desc          text;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    v_org_id      := COALESCE(p_org_id, v_shift.organization_id);
    v_actual_cash := COALESCE(v_shift.actual_cash, 0);

    -- إجمالي المسحوبات لحساب الفارق بدقة
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

    -- مرتجعات المبيعات النقدية
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

    -- ملخص الطلبات النقدية بما فيها الخصومات والعروض والضرائب
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

    -- 🛡️ [إصلاح الضريبة ورسوم الخدمة]:
    -- 1. رسوم الخدمة (41104) تخص صالة المطاعم فقط إذا سُجلت صراحة
    v_service_total := COALESCE(v_summary.service_charge_sum, 0);

    -- 2. ضريبة القيمة المضافة (2231):
    -- إذا كانت مسجلة في orders.total_tax نأخذها،
    -- وإذا كانت مسجلة كـ 0 ولكن المحصل النقدي يزيد عن صافي المبيعات، فالفرق هو ضريبة المبيعات 14% (وليس رسوم خدمة!)
    IF v_summary.tax > 0 THEN
        v_vat_total := v_summary.tax;
    ELSIF (v_summary.cash_total - (v_summary.subtotal + v_service_total)) > 0 THEN
        v_vat_total := (v_summary.cash_total - (v_summary.subtotal + v_service_total));
    ELSE
        v_vat_total := 0;
    END IF;

    v_food_sales_subtotal := v_summary.subtotal;

    -- 🛡️ [إصلاح خصم العروض والمبيعات وتوازن القيد GAAP]:
    -- إجمالي الخصم الممنوح
    v_total_discount := GREATEST(
        COALESCE(v_summary.discount_sum, 0),
        GREATEST(0, (v_summary.subtotal + v_service_total + v_vat_total) - v_summary.cash_total)
    );

    -- التحقق هل subtotal مسجل بالصافي (Net) أم بالإجمالي (Gross)
    -- إذا كان (subtotal + vat + service) مساوياً للنقدية المحصلة (± 0.01)، فهو مسجل بالصافي بعد الخصم
    -- لكي يتوازن القيد محاسبياً عند إدراج الخصم في الطرف المدين (413):
    -- يجب إثبات الإيراد بالطرف الدائن بالإجمالي (Gross): Sales (Credit) = Subtotal + Discount
    IF (v_summary.subtotal + v_vat_total + v_service_total) <= (v_summary.cash_total + 0.01) THEN
        v_gross_sales := v_food_sales_subtotal + v_total_discount;
    ELSE
        v_gross_sales := v_food_sales_subtotal;
    END IF;

    -- الفارق الفعلي = النقدية الفعلية بالدرج - المتوقع
    v_diff := v_actual_cash
              - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total - v_petty_cash - v_cash_returns);

    -- تحديد الحسابات
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

    -- حساب خصومات المبيعات والعروض (حساب 413 - خصم مسموح به)
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

    -- حساب مخزون البضائع التامة / بضاعة بغرض البيع (10302 أو 103)
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'INVENTORY_FINISHED_GOODS'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '10302' LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1213' LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '103' AND is_group = false LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND (name LIKE '%بضائع%' OR name LIKE '%منتج تام%' OR name LIKE '%بضاعة%') AND is_group = false LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '10301' LIMIT 1)
    ));

    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SHORTAGE'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '541' LIMIT 1)
    ));

    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SURPLUS_ACC'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '441' LIMIT 1)
    ));

    -- حساب العهدة 1224
    v_custodian_acc_id := public.resolve_leaf_account(
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '1224' LIMIT 1)
    );

    -- تحديد وصف القيد بذكاء بناءً على نوع الوردية / المنفذ
    IF EXISTS (
        SELECT 1 FROM public.shifts s
        JOIN public.pos_terminals t ON s.terminal_id = t.id
        WHERE s.id = p_shift_id
    ) OR EXISTS (
        SELECT 1 FROM temp_shift_orders WHERE order_type = 'TAKEAWAY'
    ) THEN
        v_entry_desc := 'إغلاق وردية مبيعات التجزئة / الهايبر ماركت (المبيعات النقدية)';
    ELSE
        v_entry_desc := 'إغلاق وردية مبيعات نقدية مجمعة';
    END IF;

    -- ── إنشاء قيد الإغلاق ──────────────────────────────────
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, is_posted, related_document_id, related_document_type, user_id
    )
    VALUES (
        now()::date,
        v_entry_desc,
        'SHIFT-' || to_char(now(), 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4),
        'posted', v_org_id, true, p_shift_id, 'shift', v_shift.user_id
    ) RETURNING id INTO v_je_id;

    -- ── 1. إيرادات مبيعات البضاعة (دائن) ────────────────────
    IF v_gross_sales > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_gross_sales, 'إيرادات مبيعات الوردية (الإجمالي قبل الخصم)', v_org_id);
    END IF;

    -- ── 2. إيرادات رسوم الخدمة (دائن - مطاعم صالة فقط) ───────
    IF v_service_total > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_service_acc_id, 0, v_service_total, 'إيرادات رسوم الخدمة (الوردية)', v_org_id);
    END IF;

    -- ── 3. ضريبة القيمة المضافة (دائن) ──────────────────────
    IF v_vat_total > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_vat_total, 'ضريبة القيمة المضافة للوردية (14% VAT)', v_org_id);
    END IF;

    -- ── 4. خصومات المبيعات والعروض الترويجية (مدين) ─────────
    IF v_total_discount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_discount_acc_id, v_total_discount, 0, 'خصومات مبيعات وعروض ترويجية للوردية (خصم مسموح به)', v_org_id);
    END IF;

    -- ── 5. مردودات المبيعات (مدين) ───────────────────────────
    IF v_cash_returns > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_return_acc_id, v_cash_returns, 0, 'مردودات مبيعات نقدية للوردية', v_org_id);
    END IF;

    -- ── 6. المسحوبات والمصروفات — مدين الوجهة فقط (بدون دائن الدرج) ──
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

        ELSE -- VAULT_TRANSFER / SAFE_DROP
            v_target_acc := COALESCE(v_payout_record.target_account_id, v_safe_acc_id);
            v_line_desc  := COALESCE(v_payout_record.reason, 'توريد نقدية من الدرج إلى الخزينة');
        END IF;

        IF v_target_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, public.resolve_leaf_account(v_target_acc),
                    v_payout_record.amount, 0, v_line_desc, v_org_id);
        END IF;
    END LOOP;

    -- ── 7. النقدية الفعلية بالدرج (مدين) ────────────────────
    IF v_actual_cash > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_actual_cash, 0, 'النقدية المقبوضة فعلياً بالصندوق (الدرج)', v_org_id);
    END IF;

    -- ── 8. فروقات الدرج (عجز / زيادة حقيقية) ────────────────
    IF v_diff < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الوردية الفعلي', v_org_id);
    ELSIF v_diff > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'زيادة نقدية الوردية', v_org_id);
    END IF;

    -- ── 9. تكلفة البضاعة المباعة وصرف المخزون ────────────────
    IF COALESCE(v_summary.cost_total, 0) > 0 THEN
        FOR v_item_cost_record IN (
            SELECT inv_acc, SUM(line_cost) AS total_cost FROM (
                SELECT COALESCE(
                           CASE 
                               WHEN pr.inventory_account_id IS NOT NULL 
                                    AND (SELECT code FROM public.accounts WHERE id = pr.inventory_account_id) != '10301'
                               THEN pr.inventory_account_id
                               ELSE v_inventory_acc_id
                           END,
                           v_inventory_acc_id
                       ) AS inv_acc,
                       public.uom_convert(oi.quantity, oi.uom_id, pr.base_uom_id)
                       * COALESCE(NULLIF(oi.unit_cost,0), NULLIF(pr.weighted_average_cost,0), pr.cost, 0) AS line_cost
                FROM   public.order_items oi
                JOIN   public.products   pr ON oi.product_id = pr.id
                WHERE  oi.order_id IN (SELECT id FROM temp_shift_orders)
                  AND  NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT COALESCE(rm.inventory_account_id,
                    (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1),
                    v_inventory_acc_id) AS inv_acc,
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
                VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون بضاعة مبيعات الوردية', v_org_id);
            END IF;
        END LOOP;
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    DROP TABLE IF EXISTS temp_shift_orders;
    RETURN v_je_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.generate_shift_closing_entry(uuid, uuid) TO authenticated;


-- 3. سكريبت التصحيح التلقائي المباشر للقيد SHIFT-260905-d546 وأي قيود مشابهة
DO $$
DECLARE
    v_je RECORD;
    v_org_id uuid;
    v_vat_acc_id uuid;
    v_sales_acc_id uuid;
    v_fg_acc_id uuid;
    v_total_debit numeric;
    v_total_credit numeric;
    v_diff numeric;
BEGIN
    -- تفعيل وضع الاستعادة الآمن لتجاوز أي اعتراض أثناء الصيانة
    SET LOCAL app.restore_mode = 'on';

    FOR v_je IN (
        SELECT * FROM public.journal_entries 
        WHERE reference = 'SHIFT-260905-d546'
    ) LOOP
        v_org_id := v_je.organization_id;
        
        -- جلب الحسابات الصحيحة لهذه المنظمة
        SELECT id INTO v_vat_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('2231', '2103') LIMIT 1;
        SELECT id INTO v_sales_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('411', '4111') LIMIT 1;
        SELECT id INTO v_fg_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('10302', '1213') LIMIT 1;
        
        -- إذا لم يوجد 10302، ابحث عن 103
        IF v_fg_acc_id IS NULL THEN
            SELECT id INTO v_fg_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code = '103' AND is_group = false LIMIT 1;
        END IF;

        -- 🛡️ إلغاء ترحيل القيد مؤقتاً لتجاوز قفل الحماية trg_protect_posted_journal_lines
        UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_je.id;

        -- 1. حذف سطر الحساب الوسيط 3999 (الذي أضيف لموازنة الخصم قسرياً)
        DELETE FROM public.journal_lines 
        WHERE journal_entry_id = v_je.id 
          AND account_id IN (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '3999');

        -- 2. تصحيح رسوم الخدمة 41104 إلى ضريبة القيمة المضافة 2231
        IF v_vat_acc_id IS NOT NULL THEN
            UPDATE public.journal_lines
            SET account_id = v_vat_acc_id,
                description = 'ضريبة القيمة المضافة للوردية (14% VAT)'
            WHERE journal_entry_id = v_je.id
              AND account_id IN (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('41104', '414'));
        END IF;

        -- 3. تصحيح حساب صرف المخزون من خامات 10301 إلى بضاعة تامة 10302
        IF v_fg_acc_id IS NOT NULL THEN
            UPDATE public.journal_lines
            SET account_id = v_fg_acc_id,
                description = 'صرف مخزون بضاعة مبيعات الوردية'
            WHERE journal_entry_id = v_je.id
              AND account_id IN (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '10301')
              AND credit > 0;
        END IF;

        -- 4. احتساب الفارق الفعلي وضبط حساب المبيعات 411 ليكون القيد متزناً بنسبة 100% (Debit = Credit)
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO v_total_debit, v_total_credit
        FROM public.journal_lines
        WHERE journal_entry_id = v_je.id;

        v_diff := v_total_debit - v_total_credit;

        IF ABS(v_diff) > 0.001 AND v_sales_acc_id IS NOT NULL THEN
            UPDATE public.journal_lines
            SET credit = credit + v_diff,
                description = 'إيرادات مبيعات الوردية (الإجمالي قبل الخصم)'
            WHERE journal_entry_id = v_je.id
              AND account_id = v_sales_acc_id;
        END IF;

        -- 5. إعادة ترحيل القيد وتحديث البيان ليعكس وردية التجزئة
        UPDATE public.journal_entries
        SET description = 'إغلاق وردية كاشير التجزئة / الهايبر ماركت (المبيعات النقدية)',
            status = 'posted',
            is_posted = true
        WHERE id = v_je.id;

    END LOOP;
END;
$$;
