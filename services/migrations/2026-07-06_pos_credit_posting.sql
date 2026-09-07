-- 🚀 ترحيل طلبات المبيعات الآجلة (Credit POS Orders) وتحديث إغلاق الوردية

-- 1. دالة ترحيل طلب مبيعات منفرد كقيد يومية (خاص بالطلبات الآجلة أو التي على الحساب)
CREATE OR REPLACE FUNCTION public.post_order_journal_entry(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order record;
    v_je_id uuid;
    v_org_id uuid;
    v_mappings jsonb;
    v_cust_acc_id uuid;
    v_sales_acc_id uuid;
    v_vat_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inventory_acc_id uuid;
    v_cash_acc_id uuid;
    v_bank_acc_id uuid;
    v_cash_paid numeric := 0;
    v_card_paid numeric := 0;
    v_credit_amount numeric := 0;
    v_item_cost_record record;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود.'; END IF;
    
    v_org_id := v_order.organization_id;

    -- تنظيف أي قيد قديم لتجنب التكرار
    IF v_order.related_journal_entry_id IS NOT NULL THEN
        DELETE FROM public.journal_entries WHERE id = v_order.related_journal_entry_id;
    END IF;
    
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    
    -- تحديد الحسابات
    v_cust_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CUSTOMERS', '')::uuid, (SELECT id FROM public.accounts WHERE code = '1221' AND organization_id = v_org_id LIMIT 1)));
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'SALES_REVENUE', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4111') AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'VAT', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1)));
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'COGS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '501') AND organization_id = v_org_id LIMIT 1)));
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'INVENTORY_FINISHED_GOODS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1213') AND organization_id = v_org_id LIMIT 1)));
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH', '')::uuid, v_order.warehouse_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231', '123101') LIMIT 1)));
    v_bank_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'BANK', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1232', '123201') AND organization_id = v_org_id LIMIT 1)));

    -- حساب المبالغ المدفوعة كاش أو بطاقة
    SELECT COALESCE(SUM(amount), 0) INTO v_cash_paid
    FROM public.payments
    WHERE order_id = p_order_id AND UPPER(payment_method) = 'CASH' AND status = 'COMPLETED';

    SELECT COALESCE(SUM(amount), 0) INTO v_card_paid
    FROM public.payments
    WHERE order_id = p_order_id AND UPPER(payment_method) = 'CARD' AND status = 'COMPLETED';

    v_credit_amount := v_order.grand_total - v_cash_paid - v_card_paid;

    -- إنشاء رأس القيد
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id)
    VALUES (COALESCE(v_order.created_at::date, now()::date), 'قيد إثبات طلب مبيعات رقم ' || v_order.order_number, 'ORD-' || v_order.order_number, 'posted', v_org_id, true, v_order.id, 'order', v_order.user_id)
    RETURNING id INTO v_je_id;

    -- 1. ذمم العملاء (مدين بالجزء الآجل)
    IF v_credit_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cust_acc_id, v_credit_amount, 0, 'مبيعات آجلة للطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 2. النقدية (مدين بالجزء الكاش)
    IF v_cash_paid > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_cash_paid, 0, 'سداد نقدي للطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 3. البنك/البطاقة (مدين بجزء الشبكة)
    IF v_card_paid > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_bank_acc_id, v_card_paid, 0, 'سداد شبكة للطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 4. إيرادات المبيعات (دائن)
    IF v_order.subtotal > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_order.subtotal, 'إيرادات الطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 5. ضريبة القيمة المضافة (دائن)
    IF v_order.total_tax > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_order.total_tax, 'ضريبة القيمة المضافة للطلب رقم ' || v_order.order_number, v_org_id);
    END IF;

    -- 6. تكلفة المبيعات وصرف المخزون
    FOR v_item_cost_record IN (
        SELECT inv_acc, SUM(line_cost) as total_cost FROM (
            -- الأصناف المباشرة (10302)
            SELECT COALESCE(p.inventory_account_id, v_inventory_acc_id) as inv_acc,
                   public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
            FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
            WHERE oi.order_id = p_order_id AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
            UNION ALL
            -- الأصناف بوصفة (الخامات 10301)
            SELECT COALESCE(rm.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)) as inv_acc,
                   (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                   COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
            FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
            JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
            WHERE oi.order_id = p_order_id
        ) expanded_inv GROUP BY 1
    ) LOOP
        IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الطلب رقم ' || v_order.order_number, v_org_id);
            
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون للطلب رقم ' || v_order.order_number, v_org_id);
        END IF;
    END LOOP;

    -- توازن القيد تلقائياً وحفظ المعرف
    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    UPDATE public.orders SET related_journal_entry_id = v_je_id WHERE id = p_order_id;
    RETURN v_je_id;
END;
$$;

-- 2. تحديث دالة إنشاء طلب مطعم لتسجيل الوردية تلقائياً
CREATE OR REPLACE FUNCTION public.create_restaurant_order(
    p_session_id uuid, p_user_id uuid, p_order_type text, p_notes text, p_items jsonb,
    p_customer_id uuid DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_delivery_info jsonb DEFAULT NULL,
    p_org_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_order_id uuid; v_item jsonb; v_order_num text; v_tax_rate numeric; 
    v_tax_enabled boolean;
    v_subtotal numeric := 0; v_final_wh_id uuid; v_org_id uuid; v_order_item_id uuid; v_delivery_fee numeric := 0; v_item_cost numeric;
    v_active_shift_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    v_final_wh_id := COALESCE(p_warehouse_id, (SELECT default_warehouse_id FROM public.company_settings WHERE organization_id = v_org_id LIMIT 1));
    
    SELECT vat_rate, COALESCE(enable_tax, true) INTO v_tax_rate, v_tax_enabled 
    FROM public.company_settings WHERE organization_id = v_org_id;
    
    IF NOT v_tax_enabled THEN
        v_tax_rate := 0;
    END IF;

    -- البحث التلقائي عن الوردية النشطة للمستخدم
    SELECT id INTO v_active_shift_id FROM public.shifts
    WHERE user_id = p_user_id AND end_time IS NULL AND organization_id = v_org_id
    ORDER BY start_time DESC LIMIT 1;

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 4));

    INSERT INTO public.orders (session_id, user_id, order_type, notes, status, customer_id, order_number, organization_id, warehouse_id, shift_id)
    VALUES (p_session_id, p_user_id, p_order_type, p_notes, 'CONFIRMED', p_customer_id, v_order_num, v_org_id, v_final_wh_id, v_active_shift_id) 
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT COALESCE(cost, weighted_average_cost, purchase_price, 0), base_uom_id INTO v_item_cost, v_final_wh_id
        FROM public.products WHERE id = (v_item->>'product_id')::uuid;

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, unit_cost, organization_id, modifiers, uom_id)
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

        v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
        
        INSERT INTO public.kitchen_orders (order_item_id, status, organization_id) VALUES (v_order_item_id, 'NEW', v_org_id);
    END LOOP;

    IF p_delivery_info IS NOT NULL THEN
        v_delivery_fee := COALESCE((p_delivery_info->>'delivery_fee')::numeric, 0);
        INSERT INTO public.delivery_orders (order_id, customer_name, customer_phone, delivery_address, delivery_fee, organization_id)
        VALUES (v_order_id, p_delivery_info->>'customer_name', p_delivery_info->>'customer_phone', p_delivery_info->>'delivery_address', v_delivery_fee, v_org_id);
    END IF;

    UPDATE public.orders SET 
        subtotal = v_subtotal, 
        delivery_fee = v_delivery_fee,
        total_tax = v_subtotal * COALESCE(v_tax_rate, 0.14), 
        grand_total = (v_subtotal * (1 + COALESCE(v_tax_rate, 0.14))) + v_delivery_fee 
    WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

-- 3. تحديث دالة إغلاق الوردية لترحيل الآجل أولاً واستبعاده من التجميعي
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb; v_org_id uuid;
    v_cash_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_diff numeric := 0; v_item_cost_record record; v_cash_surplus_acc_id uuid; v_cash_deficit_acc_id uuid;
    v_order_to_post record;
BEGIN
    IF p_shift_id IS NULL THEN RAISE EXCEPTION 'خطأ: لم يتم تحديد وردية للإغلاق.'; END IF;

    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'عذراً، لم يتم العثور على سجل وردية حقيقي في النظام للرقم (%).', p_shift_id; 
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());

    -- 🚀 خطوة ذكية: ترحيل كافة طلبات البيع الآجل أو غير المدفوعة بالكامل بشكل منفرد أولاً
    FOR v_order_to_post IN (
        SELECT o.id FROM public.orders o
        WHERE o.organization_id = v_org_id
          AND o.customer_id IS NOT NULL
          AND o.related_journal_entry_id IS NULL
          AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
          AND (
              (o.created_at BETWEEN v_shift.start_time - interval '5 seconds' AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
              OR 
              (o.id IN (SELECT order_id FROM public.payments WHERE created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())))
          )
          AND (
              SELECT COALESCE(SUM(p.amount), 0) FROM public.payments p 
              WHERE p.order_id = o.id AND p.status = 'COMPLETED'
          ) < o.grand_total
    ) LOOP
        PERFORM public.post_order_journal_entry(v_order_to_post.id);
    END LOOP;

    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    -- إنشاء الجدول المؤقت للطلبات غير المرحلة
    DROP TABLE IF EXISTS temp_shift_orders;
    CREATE TEMP TABLE temp_shift_orders AS
    SELECT o.id, o.subtotal, o.total_tax, o.grand_total, o.user_id
    FROM public.orders o 
    WHERE o.organization_id = v_org_id 
    AND (
        (o.created_at BETWEEN v_shift.start_time - interval '5 seconds' AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
        OR 
        (o.id IN (SELECT order_id FROM public.payments WHERE created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())))
    )
    AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
    AND o.related_journal_entry_id IS NULL; -- 🚀 استبعاد الطلبات المرحلة بشكل منفرد

    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, 
        COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE p.order_id IN (SELECT id FROM temp_shift_orders)
              AND UPPER(p.payment_method) = 'CASH' AND p.status = 'COMPLETED'
        ), 0) as cash_total,
        COALESCE((
            SELECT SUM(line_cost) FROM (
                SELECT public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded
        ), 0) as cost_total INTO v_summary
    FROM temp_shift_orders;

    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    v_cash_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH', '')::uuid, v_shift.treasury_account_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231', '123101') LIMIT 1)));
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'SALES_REVENUE', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4111') AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'VAT', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1)));
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'COGS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '501') AND organization_id = v_org_id LIMIT 1)));
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'INVENTORY_FINISHED_GOODS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1213') AND organization_id = v_org_id LIMIT 1)));
    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SHORTAGE', '')::uuid, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1)));
    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SURPLUS_ACC', '')::uuid, (SELECT id FROM public.accounts WHERE code = '441' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id)
    VALUES (now()::date, 'إغلاق وردية مطعم مجمع (المبيعات النقدية)', 'SHIFT-' || to_char(now(), 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4), 'posted', v_org_id, true, p_shift_id, 'shift', v_shift.user_id) RETURNING id INTO v_je_id;
    
    IF v_summary.subtotal > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيرادات الوردية (المدفوع كاش)', v_org_id);
    END IF;

    IF v_summary.tax > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة للوردية', v_org_id); 
    END IF;

    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_cash_acc_id, (v_summary.cash_total + v_diff), 0, 'صافي تحصيل الوردية (الدرج)', v_org_id);

    IF COALESCE(v_summary.cost_total, 0) > 0 THEN
        FOR v_item_cost_record IN (
            SELECT inv_acc, SUM(line_cost) as total_cost FROM (
                SELECT COALESCE(p.inventory_account_id, v_inventory_acc_id) as inv_acc,
                       public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT COALESCE(rm.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)) as inv_acc,
                       (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded_inv GROUP BY 1
        ) LOOP
            IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية النقدية', v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون الوردية النقدية', v_org_id);
            END IF;
        END LOOP;
    END IF;

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
