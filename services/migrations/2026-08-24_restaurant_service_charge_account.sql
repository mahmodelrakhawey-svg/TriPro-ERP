-- ============================================================
-- Migration: Add Service Charge to Orders, Chart of Accounts & Shift Closing
-- Date: 2026-08-24
-- ============================================================

-- 1. إضافة عمود رسوم الخدمة في جدول الطلبات وإعدادات المنشأة
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS enable_service_charge BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS service_charge_rate NUMERIC DEFAULT 0.12;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS service_charge NUMERIC DEFAULT 0;

-- 2. دالة آمنة لتحويل النصوص إلى UUID
CREATE OR REPLACE FUNCTION public.safe_cast_uuid(p_val text) 
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_val IS NOT NULL AND p_val ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN p_val::uuid;
    END IF;
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- 3. إنشاء حساب 41104 في شجرة الحسابات
DO $$
DECLARE
    v_org RECORD;
    v_parent_41_id UUID;
    v_acc_id UUID;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        SELECT id INTO v_parent_41_id
        FROM public.accounts
        WHERE organization_id = v_org.id AND code = '41'
        LIMIT 1;

        SELECT id INTO v_acc_id
        FROM public.accounts
        WHERE organization_id = v_org.id AND code = '41104'
        LIMIT 1;

        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (
                organization_id, code, name, type, is_group, is_active, parent_id
            ) VALUES (
                v_org.id, '41104', 'إيرادات رسوم الخدمة (المطاعم)', 'REVENUE', false, true, v_parent_41_id
            )
            RETURNING id INTO v_acc_id;
        END IF;

        IF v_acc_id IS NOT NULL THEN
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('SERVICE_CHARGE_REVENUE', v_acc_id::text)
            WHERE organization_id = v_org.id;
        END IF;
    END LOOP;
END $$;

-- 4. تحديث دالة إنشاء طلب المطعم لحساب رسوم الخدمة والضريبة بدقة
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id    uuid,
    p_user_id       uuid,
    p_order_type    text,
    p_notes         text,
    p_items         jsonb,
    p_customer_id   uuid    DEFAULT NULL,
    p_warehouse_id  uuid    DEFAULT NULL,
    p_delivery_info jsonb   DEFAULT NULL,
    p_org_id        uuid    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order_id          uuid;
    v_item              jsonb;
    v_order_num         text;
    v_tax_rate          numeric := 0.14;
    v_tax_enabled       boolean := true;
    v_service_enabled   boolean := false;
    v_service_rate      numeric := 0.12;
    v_service_charge    numeric := 0;
    v_total_tax         numeric := 0;
    v_subtotal          numeric := 0;
    v_final_wh_id       uuid;
    v_org_id            uuid;
    v_order_item_id     uuid;
    v_delivery_fee      numeric := 0;
    v_item_cost         numeric;
    v_active_shift_id   uuid;
BEGIN
    v_org_id      := COALESCE(p_org_id, public.get_my_org());
    v_final_wh_id := COALESCE(p_warehouse_id,
                        (SELECT default_warehouse_id FROM public.company_settings
                         WHERE organization_id = v_org_id LIMIT 1));

    SELECT 
        COALESCE(vat_rate, 0.14), 
        COALESCE(enable_tax, true),
        COALESCE(enable_service_charge, (account_mappings->>'enable_service_charge')::boolean, false),
        COALESCE(service_charge_rate, (account_mappings->>'service_charge_rate')::numeric, 0.12)
    INTO   
        v_tax_rate, 
        v_tax_enabled,
        v_service_enabled,
        v_service_rate
    FROM   public.company_settings
    WHERE  organization_id = v_org_id;

    IF NOT v_tax_enabled THEN
        v_tax_rate := 0;
    END IF;

    IF NOT v_service_enabled THEN
        v_service_rate := 0;
    END IF;

    IF p_user_id IS NOT NULL THEN
        SELECT id INTO v_active_shift_id
        FROM   public.shifts
        WHERE  user_id         = p_user_id
          AND  end_time        IS NULL
          AND  organization_id = v_org_id
        ORDER  BY start_time DESC
        LIMIT  1;
    END IF;

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-'
                   || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (
        session_id, user_id, order_type, notes, status,
        customer_id, order_number, organization_id, warehouse_id, shift_id
    )
    VALUES (
        p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED',
        p_customer_id, v_order_num, v_org_id, v_final_wh_id, v_active_shift_id
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0), base_uom_id
        INTO   v_item_cost, v_final_wh_id
        FROM   public.products
        WHERE  id = (v_item->>'product_id')::uuid;

        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price, unit_cost,
            organization_id, modifiers, uom_id
        )
        VALUES (
            v_order_id,
            (v_item->>'product_id')::uuid,
            (v_item->>'quantity')::numeric,
            (v_item->>'unit_price')::numeric,
            v_item_cost,
            v_org_id,
            COALESCE(v_item->'modifiers', '[]'::jsonb),
            (v_item->>'uom_id')::uuid
        ) RETURNING id INTO v_order_item_id;

        v_subtotal := v_subtotal
                      + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);

        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id)
        VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    IF p_delivery_info IS NOT NULL THEN
        v_delivery_fee := COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0);
        INSERT INTO public.delivery_orders (
            order_id, customer_name, customer_phone,
            delivery_address, delivery_fee, organization_id
        )
        VALUES (
            v_order_id,
            p_delivery_info->>'customer_name',
            p_delivery_info->>'customer_phone',
            p_delivery_info->>'delivery_address',
            v_delivery_fee,
            v_org_id
        );
    END IF;

    -- حساب الخدمة والضريبة والإجمالي بدقة
    v_service_charge := v_subtotal * COALESCE(v_service_rate, 0);
    v_total_tax      := (v_subtotal + v_service_charge) * COALESCE(v_tax_rate, 0);

    UPDATE public.orders SET
        subtotal       = v_subtotal,
        service_charge = v_service_charge,
        delivery_fee   = v_delivery_fee,
        total_tax      = v_total_tax,
        grand_total    = v_subtotal + v_service_charge + v_total_tax + v_delivery_fee
    WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

-- 5. تحديث دالة إتمام الطلب لتحديث إجماليات الطلب بدقة عند السداد
CREATE OR REPLACE FUNCTION public.complete_restaurant_order(
    p_order_id uuid, p_payment_method text, p_amount numeric, p_cash_account_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order record;
    v_org_id uuid;
    v_table_id uuid;
    v_subtotal numeric;
    v_tax_rate numeric := 0.14;
    v_tax_enabled boolean := true;
    v_service_rate numeric := 0.12;
    v_service_enabled boolean := false;
    v_service_charge numeric := 0;
    v_total_tax numeric := 0;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.status IN ('PAID', 'COMPLETED') THEN RETURN; END IF;
    v_org_id := v_order.organization_id;

    IF p_warehouse_id IS NOT NULL AND p_warehouse_id != COALESCE(v_order.warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        UPDATE public.orders SET warehouse_id = p_warehouse_id WHERE id = p_order_id;
    END IF;

    -- قراءة إعدادات الخدمة والضريبة
    SELECT 
        COALESCE(vat_rate, 0.14), 
        COALESCE(enable_tax, true),
        COALESCE(enable_service_charge, (account_mappings->>'enable_service_charge')::boolean, false),
        COALESCE(service_charge_rate, (account_mappings->>'service_charge_rate')::numeric, 0.12)
    INTO   
        v_tax_rate, 
        v_tax_enabled,
        v_service_enabled,
        v_service_rate
    FROM   public.company_settings
    WHERE  organization_id = v_org_id;

    IF NOT v_tax_enabled THEN v_tax_rate := 0; END IF;
    IF NOT v_service_enabled THEN v_service_rate := 0; END IF;

    v_subtotal := COALESCE(v_order.subtotal, 0);
    
    -- إذا كانت الخدمة مسجلة أو تحسب
    IF v_service_enabled AND COALESCE(v_order.service_charge, 0) = 0 THEN
        v_service_charge := v_subtotal * v_service_rate;
    ELSE
        v_service_charge := COALESCE(v_order.service_charge, 0);
    END IF;

    IF v_tax_enabled THEN
        v_total_tax := (v_subtotal + v_service_charge) * v_tax_rate;
    ELSE
        v_total_tax := 0;
    END IF;

    -- 1. تسجيل الدفع
    INSERT INTO public.payments (order_id, amount, payment_method, status, organization_id, cash_account_id)
    VALUES (p_order_id, p_amount, p_payment_method, 'COMPLETED', v_org_id, p_cash_account_id);

    -- 2. تحديث حالة الطلب والإجماليات
    UPDATE public.orders SET 
        status = 'PAID',
        service_charge = v_service_charge,
        total_tax = v_total_tax,
        grand_total = p_amount
    WHERE id = p_order_id;

    -- 3. تحرير الطاولة والجلسة
    IF v_order.session_id IS NOT NULL THEN
        SELECT table_id INTO v_table_id FROM public.table_sessions WHERE id = v_order.session_id;
        UPDATE public.table_sessions SET end_time = now(), status = 'CLOSED' WHERE id = v_order.session_id;
        UPDATE public.restaurant_tables SET status = 'AVAILABLE', session_start = NULL WHERE id = v_table_id;
    END IF;

    PERFORM public.recalculate_stock_rpc(v_org_id);
END; $$;

-- 6. تحديث دالة توليد قيد إغلاق الوردية
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(
    p_shift_id uuid,
    p_org_id   uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift               public.shifts;
    v_org_id              uuid;
    v_summary             RECORD;
    v_diff                numeric;
    v_je_id               uuid;
    v_mappings            jsonb;
    v_cash_acc_id         uuid;
    v_sales_acc_id        uuid;
    v_service_acc_id      uuid;
    v_vat_acc_id          uuid;
    v_cogs_acc_id         uuid;
    v_inventory_acc_id    uuid;
    v_cash_deficit_acc_id uuid;
    v_cash_surplus_acc_id uuid;
    v_item_cost_record    RECORD;
    v_service_total       numeric := 0;
    v_food_sales_subtotal numeric := 0;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id);

    CREATE TEMP TABLE temp_shift_orders ON COMMIT DROP AS
    SELECT o.id, o.subtotal, COALESCE(o.service_charge, 0) AS service_charge, o.total_tax, o.grand_total, o.order_type
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
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE  p.order_id IN (SELECT id FROM temp_shift_orders)
              AND  UPPER(p.payment_method) = 'CASH'
              AND  p.status = 'COMPLETED'
        ), 0)                            AS cash_total,
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
        ), 0)                            AS cost_total
    INTO v_summary
    FROM temp_shift_orders;

    -- حساب رسوم الخدمة بدقة
    IF v_summary.service_charge_sum > 0 THEN
        v_service_total := v_summary.service_charge_sum;
    ELSE
        v_service_total := GREATEST(0, (v_summary.cash_total - (v_summary.subtotal + v_summary.tax)));
    END IF;

    v_food_sales_subtotal := v_summary.subtotal;

    v_diff := COALESCE(v_shift.actual_cash, 0)
              - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);

    SELECT account_mappings INTO v_mappings
    FROM   public.company_settings WHERE organization_id = v_org_id;

    v_cash_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH'),
        v_shift.treasury_account_id,
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'CASH') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231','123101') LIMIT 1)
    ));

    v_sales_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_REVENUE'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'SALES_REVENUE') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('411','4111') LIMIT 1)
    ));

    v_service_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SERVICE_CHARGE_REVENUE'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'SERVICE_CHARGE_REVENUE') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('41104','414') LIMIT 1),
        v_sales_acc_id
    ));

    v_vat_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'VAT'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'VAT') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('2231','2103') LIMIT 1)
    ));

    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'COGS'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'COGS') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('511','501') LIMIT 1)
    ));

    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'INVENTORY_FINISHED_GOODS'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'INVENTORY_FINISHED_GOODS') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('10302','1213') LIMIT 1)
    ));

    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SHORTAGE'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'CASH_SHORTAGE') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '541' LIMIT 1)
    ));

    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SURPLUS_ACC'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'CASH_SURPLUS_ACC') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '441' LIMIT 1)
    ));

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

    -- 1. إيرادات مبيعات الطعام
    IF v_food_sales_subtotal > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_food_sales_subtotal, 'إيرادات مبيعات الوجبات (الوردية)', v_org_id);
    END IF;

    -- 2. إيرادات رسوم الخدمة (بند مستقل 41104)
    IF v_service_total > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_service_acc_id, 0, v_service_total, 'إيرادات رسوم الخدمة (الوردية)', v_org_id);
    END IF;

    -- 3. ضريبة القيمة المضافة
    IF v_summary.tax > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة للوردية', v_org_id);
    END IF;

    -- 4. إجمالي النقدية المحصلة بالدرج
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
    VALUES (v_je_id, v_cash_acc_id, (v_summary.cash_total + v_diff), 0, 'صافي تحصيل الوردية (الدرج)', v_org_id);

    -- 5. تكلفة البضاعة المباعة وصرف المخزون
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

    -- 6. الفروقات (عجز / زيادة)
    IF v_diff < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الوردية', v_org_id);
    ELSIF v_diff > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'زيادة نقدية الوردية (إيراد متنوع)', v_org_id);
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    DROP TABLE IF EXISTS temp_shift_orders;
    RETURN v_je_id;
END;
$$;
