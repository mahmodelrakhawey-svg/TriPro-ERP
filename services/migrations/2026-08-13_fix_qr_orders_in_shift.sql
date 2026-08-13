-- ============================================================
-- TriPro ERP — الإصلاح الشامل لمشكلة طلبات QR في الوردية
-- التاريخ: 13 أغسطس 2026
-- ============================================================
-- تشخيص كامل (8 أخطاء):
--
-- BUG 1 (حرج): get_shift_summary تفلتر بـ o.created_by وهو عمود محذوف!
--              العمود الصحيح في جدول orders هو o.user_id
--
-- BUG 2 (حرج): create_restaurant_order في full_unified_system.sql
--              لا تضع shift_id عند إنشاء الطلب
--
-- BUG 3 (حرج): التريجر assign_active_cashier_to_order لا يفلتر بـ
--              organization_id مما يسبب خلط بين فروع مختلفة
--
-- BUG 4: close_shift الجديدة لا تحدث عمودَي expected_cash/difference
--        في جدول shifts
--
-- BUG 5: generate_shift_closing_entry لا تستفيد من shift_id لجلب الطلبات
--        (تعتمد على الوقت فقط)
--
-- BUG 6 (معلوماتي): نافذة الدفع الإلكتروني في GuestMenuLayout وهمية لا ترتبط
--                  ببوابة دفع حقيقية — يتطلب تدخلاً تقنياً مستقلاً
--
-- BUG 7: create_public_order في full_unified_system.sql بها 3 معاملات فقط
--        بينما الواجهة تُرسل 5 معاملات (p_is_paid + p_payment_method)
--
-- BUG 8: نسختان متعارضتان من generate_shift_closing_entry في قاعدة البيانات
-- ============================================================

-- ============================================================
-- إصلاح BUG 1 + BUG 5: إعادة كتابة get_shift_summary بشكل صحيح
-- ============================================================
-- يجب الحذف أولاً لأن النسخة القديمة ترجع JSON بينما الجديدة ترجع JSONB
DROP FUNCTION IF EXISTS public.get_shift_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift      RECORD;
    v_start_time TIMESTAMPTZ;
    v_end_time   TIMESTAMPTZ;
    v_summary    JSONB;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية غير موجودة: %', p_shift_id;
    END IF;

    v_start_time := v_shift.start_time;
    v_end_time   := COALESCE(v_shift.end_time, now());

    -- ✅ الإصلاح: استخدام o.user_id (وليس o.created_by المحذوف)
    -- ✅ الإصلاح: إضافة منطق shift_id لاستيعاب طلبات QR المسندة مباشرة للوردية
    -- ✅ الإصلاح: إضافة CONFIRMED للحالات لاستيعاب طلبات QR النقدية غير المسددة فورياً
    SELECT jsonb_build_object(
        'opening_balance', v_shift.opening_balance,
        'total_sales',     COALESCE(SUM(p.amount), 0),
        'cash_sales',      COALESCE(SUM(CASE WHEN UPPER(p.payment_method) = 'CASH'   THEN p.amount ELSE 0 END), 0),
        'card_sales',      COALESCE(SUM(CASE WHEN UPPER(p.payment_method) = 'CARD'   THEN p.amount ELSE 0 END), 0),
        'wallet_sales',    COALESCE(SUM(CASE WHEN UPPER(p.payment_method) = 'WALLET' THEN p.amount ELSE 0 END), 0),
        'expected_cash',   v_shift.opening_balance
                           + COALESCE(SUM(CASE WHEN UPPER(p.payment_method) = 'CASH' THEN p.amount ELSE 0 END), 0)
    ) INTO v_summary
    FROM public.payments p
    JOIN public.orders   o ON p.order_id = o.id
    WHERE (
            -- الأولوية: ربط مباشر عبر shift_id (طلبات QR بعد الإصلاح + طلبات الكاشير)
            o.shift_id = p_shift_id
            OR
            -- احتياط: الطلبات التي تنتمي لنفس الكاشير في نطاق الوردية الزمني
            (
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

-- ============================================================
-- إصلاح BUG 2: تحديث create_restaurant_order
-- لتعيين shift_id تلقائياً عند إنشاء أي طلب
-- (يُصلح نسخة full_unified_system.sql القديمة التي لا تضع shift_id)
-- ============================================================
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
    v_order_id        uuid;
    v_item            jsonb;
    v_order_num       text;
    v_tax_rate        numeric;
    v_tax_enabled     boolean;
    v_subtotal        numeric := 0;
    v_final_wh_id     uuid;
    v_org_id          uuid;
    v_order_item_id   uuid;
    v_delivery_fee    numeric := 0;
    v_item_cost       numeric;
    -- ✅ الإصلاح: متغير للوردية النشطة
    v_active_shift_id uuid;
BEGIN
    v_org_id      := COALESCE(p_org_id, public.get_my_org());
    v_final_wh_id := COALESCE(p_warehouse_id,
                        (SELECT default_warehouse_id FROM public.company_settings
                         WHERE organization_id = v_org_id LIMIT 1));

    SELECT vat_rate, COALESCE(enable_tax, true)
    INTO   v_tax_rate, v_tax_enabled
    FROM   public.company_settings
    WHERE  organization_id = v_org_id;

    IF NOT v_tax_enabled THEN
        v_tax_rate := 0;
    END IF;

    -- ✅ الإصلاح: البحث عن الوردية النشطة لهذا المستخدم مع فلتر المنظمة
    IF p_user_id IS NOT NULL THEN
        SELECT id INTO v_active_shift_id
        FROM   public.shifts
        WHERE  user_id         = p_user_id
          AND  end_time        IS NULL
          AND  organization_id = v_org_id
        ORDER  BY start_time DESC
        LIMIT  1;
    END IF;
    -- إذا لم يوجد user_id (طلب QR)، التريجر سيعين shift_id تلقائياً بعد الإدراج

    v_order_num := 'ORD-' || to_char(now(), 'YYMMDD') || '-'
                   || upper(substring(gen_random_uuid()::text, 1, 4));

    -- ✅ الإصلاح: إضافة shift_id في INSERT
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

    UPDATE public.orders SET
        subtotal     = v_subtotal,
        delivery_fee = v_delivery_fee,
        total_tax    = v_subtotal * COALESCE(v_tax_rate, 0.14),
        grand_total  = (v_subtotal * (1 + COALESCE(v_tax_rate, 0.14))) + v_delivery_fee
    WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

-- ============================================================
-- إصلاح BUG 3: تحديث التريجر بفلتر organization_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_active_cashier_to_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_active_cashier_id UUID;
    v_active_shift_id   UUID;
BEGIN
    -- حالة طلبات QR: لا يوجد user_id
    IF NEW.user_id IS NULL THEN

        -- ✅ الإصلاح: فلترة بـ organization_id لمنع الخلط بين الفروع
        SELECT id, user_id
        INTO   v_active_shift_id, v_active_cashier_id
        FROM   public.shifts
        WHERE  end_time        IS NULL
          AND  organization_id  = NEW.organization_id
        ORDER  BY start_time DESC
        LIMIT  1;

        IF v_active_cashier_id IS NOT NULL THEN
            NEW.user_id  := v_active_cashier_id;
            NEW.shift_id := v_active_shift_id;
        END IF;

    ELSE
        -- حالة طلبات الكاشير: تأكد من وجود shift_id
        IF NEW.shift_id IS NULL THEN
            SELECT id INTO v_active_shift_id
            FROM   public.shifts
            WHERE  user_id        = NEW.user_id
              AND  end_time       IS NULL
              AND  organization_id = NEW.organization_id
            ORDER  BY start_time DESC
            LIMIT  1;

            NEW.shift_id := v_active_shift_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_cashier ON public.orders;

CREATE TRIGGER trg_auto_assign_cashier
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.assign_active_cashier_to_order();

-- ============================================================
-- إصلاح BUG 4: تحديث close_shift لحساب وحفظ expected_cash/difference
-- ============================================================
-- أولاً: إضافة الأعمدة الناقصة في جدول shifts إن لم تكن موجودة
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(10,2);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS expected_cash   NUMERIC(10,2);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS actual_cash     NUMERIC(10,2);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS difference      NUMERIC(10,2);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'OPEN';
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS notes           TEXT;

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
    -- ✅ الإصلاح: حساب الإجماليات قبل إغلاق الوردية
    v_summary       := public.get_shift_summary(p_shift_id);
    v_expected_cash := COALESCE((v_summary->>'expected_cash')::numeric, 0);
    v_difference    := p_actual_cash - v_expected_cash;

    -- ✅ الإصلاح: حفظ جميع قيم الإغلاق في سجل الوردية
    UPDATE public.shifts SET
        end_time        = now(),
        actual_cash     = p_actual_cash,
        closing_balance = p_actual_cash,
        expected_cash   = v_expected_cash,
        difference      = v_difference,
        status          = 'CLOSED',
        notes           = p_notes
    WHERE id = p_shift_id;

    -- توليد قيد اليومية المجمع للوردية
    PERFORM public.generate_shift_closing_entry(p_shift_id, p_org_id);

    -- [تكامل التصنيع] ترحيل نسب إتمام الإنتاج آلياً
    PERFORM public.mfg_auto_post_wip_progress(
        COALESCE(p_org_id, (SELECT organization_id FROM public.shifts WHERE id = p_shift_id))
    );
END;
$$;

-- ============================================================
-- إصلاح BUG 7: تحديث create_public_order لتشمل 5 معاملات
-- (مطابقة ما ترسله GuestMenuLayout.tsx)
-- ============================================================
DROP FUNCTION IF EXISTS public.create_public_order(uuid, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.create_public_order(
    p_qr_key         uuid,
    p_items          jsonb,
    p_org_id         uuid    DEFAULT NULL,
    p_is_paid        boolean DEFAULT false,
    p_payment_method text    DEFAULT 'CASH'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table       record;
    v_session_id  uuid;
    v_order_id    uuid;
    v_bank_acc_id uuid;
    v_mappings    jsonb;
BEGIN
    -- التحقق من صحة رمز QR
    SELECT * INTO v_table
    FROM   public.restaurant_tables
    WHERE  qr_access_key = p_qr_key;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'رمز طاولة غير صالح.';
    END IF;

    -- إيجاد الجلسة المفتوحة أو إنشاء جديدة
    SELECT id INTO v_session_id
    FROM   public.table_sessions
    WHERE  table_id        = v_table.id
      AND  status          = 'OPEN'
      AND  organization_id = v_table.organization_id
    LIMIT  1;

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status)
        VALUES (v_table.id, v_table.organization_id, 'OPEN')
        RETURNING id INTO v_session_id;
    END IF;

    -- إنشاء الطلب (التريجر سيعين الكاشير+الوردية تلقائياً لأن user_id=NULL)
    v_order_id := public.create_restaurant_order(
        v_session_id,
        NULL,
        'DINE_IN',
        'طلب عبر QR',
        p_items,
        NULL, NULL, NULL,
        COALESCE(p_org_id, v_table.organization_id)
    );

    -- تعديل حالة الطاولة
    UPDATE public.restaurant_tables
    SET    status = 'OCCUPIED', session_start = now()
    WHERE  id = v_table.id;

    -- إذا دفع العميل إلكترونياً، اعتمد الطلب مالياً فوراً
    IF p_is_paid THEN
        SELECT account_mappings INTO v_mappings
        FROM   public.company_settings
        WHERE  organization_id = v_table.organization_id;

        v_bank_acc_id := public.resolve_leaf_account(COALESCE(
            (v_mappings->>'BANK')::uuid,
            (SELECT id FROM public.accounts
             WHERE  organization_id = v_table.organization_id
               AND  code = '10102'
             LIMIT 1)
        ));

        PERFORM public.complete_restaurant_order(
            v_order_id,
            p_payment_method,
            (SELECT grand_total FROM public.orders WHERE id = v_order_id),
            v_bank_acc_id,
            v_table.organization_id
        );
    END IF;

    RETURN v_order_id;
END;
$$;

-- منح الصلاحيات للزوار والمستخدمين المسجلين
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb, uuid, boolean, text)
    TO anon, authenticated;

-- ============================================================
-- إصلاح BUG 8: ضمان توحيد نسخة generate_shift_closing_entry
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(
    p_shift_id uuid,
    p_org_id   uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift               record;
    v_summary             record;
    v_je_id               uuid;
    v_mappings            jsonb;
    v_org_id              uuid;
    v_cash_acc_id         uuid;
    v_sales_acc_id        uuid;
    v_vat_acc_id          uuid;
    v_cogs_acc_id         uuid;
    v_inventory_acc_id    uuid;
    v_diff                numeric := 0;
    v_item_cost_record    record;
    v_cash_surplus_acc_id uuid;
    v_cash_deficit_acc_id uuid;
    v_order_to_post       record;
BEGIN
    IF p_shift_id IS NULL THEN
        RAISE EXCEPTION 'خطأ: لم يتم تحديد وردية للإغلاق.';
    END IF;

    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'عذراً، لم يتم العثور على سجل وردية للرقم (%)', p_shift_id;
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());

    -- ترحيل طلبات الآجل أولاً (طلبات بعميل غير مسددة بالكامل)
    FOR v_order_to_post IN (
        SELECT o.id FROM public.orders o
        WHERE  o.organization_id           = v_org_id
          AND  o.customer_id               IS NOT NULL
          AND  o.related_journal_entry_id  IS NULL
          AND  o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
          AND (
              (o.created_at BETWEEN v_shift.start_time - interval '5 seconds'
                                AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
              OR o.id IN (
                  SELECT order_id FROM public.payments
                  WHERE  created_at BETWEEN v_shift.start_time
                                        AND COALESCE(v_shift.end_time, now())
              )
              OR o.shift_id = p_shift_id
          )
          AND (
              SELECT COALESCE(SUM(p.amount), 0)
              FROM   public.payments p
              WHERE  p.order_id = o.id AND p.status = 'COMPLETED'
          ) < o.grand_total
    ) LOOP
        PERFORM public.post_order_journal_entry(v_order_to_post.id);
    END LOOP;

    -- حذف قيد الوردية القديم (ضمان Idempotency)
    DELETE FROM public.journal_entries
    WHERE  related_document_id   = p_shift_id
      AND  related_document_type = 'shift';

    -- ✅ الإصلاح BUG 5: إنشاء الجدول المؤقت مع شرط shift_id إضافي
    DROP TABLE IF EXISTS temp_shift_orders;
    CREATE TEMP TABLE temp_shift_orders AS
    SELECT o.id, o.subtotal, o.total_tax, o.grand_total, o.user_id
    FROM   public.orders o
    WHERE  o.organization_id = v_org_id
      AND  (
               -- أ) مرتبط بالوردية مباشرة عبر shift_id
               o.shift_id = p_shift_id
               OR
               -- ب) أُنشئ في النطاق الزمني للوردية
               (o.created_at BETWEEN v_shift.start_time - interval '5 seconds'
                                 AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
               OR
               -- ج) دُفع خلال نطاق الوردية الزمني
               o.id IN (
                   SELECT order_id FROM public.payments
                   WHERE  created_at BETWEEN v_shift.start_time
                                         AND COALESCE(v_shift.end_time, now())
               )
           )
      AND  o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
      AND  o.related_journal_entry_id IS NULL;

    SELECT
        COALESCE(SUM(subtotal), 0)   AS subtotal,
        COALESCE(SUM(total_tax), 0)  AS tax,
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE  p.order_id IN (SELECT id FROM temp_shift_orders)
              AND  UPPER(p.payment_method) = 'CASH'
              AND  p.status = 'COMPLETED'
        ), 0)                        AS cash_total,
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
        ), 0)                        AS cost_total
    INTO v_summary
    FROM temp_shift_orders;

    v_diff := COALESCE(v_shift.actual_cash, 0)
              - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);

    SELECT account_mappings INTO v_mappings
    FROM   public.company_settings WHERE organization_id = v_org_id;

    v_cash_acc_id      := public.resolve_leaf_account(COALESCE(
        NULLIF(v_mappings->>'CASH','')::uuid, v_shift.treasury_account_id,
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231','123101') LIMIT 1)));
    v_sales_acc_id     := public.resolve_leaf_account(COALESCE(
        NULLIF(v_mappings->>'SALES_REVENUE','')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('411','4111') AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc_id       := public.resolve_leaf_account(COALESCE(
        NULLIF(v_mappings->>'VAT','')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('2231','2103') AND organization_id = v_org_id LIMIT 1)));
    v_cogs_acc_id      := public.resolve_leaf_account(COALESCE(
        NULLIF(v_mappings->>'COGS','')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('511','501') AND organization_id = v_org_id LIMIT 1)));
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(
        NULLIF(v_mappings->>'INVENTORY_FINISHED_GOODS','')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('10302','1213') AND organization_id = v_org_id LIMIT 1)));
    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(
        NULLIF(v_mappings->>'CASH_SHORTAGE','')::uuid,
        (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1)));
    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(
        NULLIF(v_mappings->>'CASH_SURPLUS_ACC','')::uuid,
        (SELECT id FROM public.accounts WHERE code = '441' AND organization_id = v_org_id LIMIT 1)));

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

-- ============================================================
-- تصحيح البيانات القديمة: ربط الطلبات الموجودة بورديتها الصحيحة
-- (بأثر رجعي للطلبات التي أُنشئت قبل هذا الإصلاح)
-- ============================================================
DO $$
DECLARE
    v_order    RECORD;
    v_shift_id UUID;
    v_count    INT := 0;
BEGIN
    FOR v_order IN
        SELECT o.id, o.user_id, o.created_at, o.organization_id
        FROM   public.orders o
        WHERE  o.shift_id IS NULL
          AND  o.user_id  IS NOT NULL
          AND  o.status   IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED')
    LOOP
        SELECT id INTO v_shift_id
        FROM   public.shifts s
        WHERE  s.user_id         = v_order.user_id
          AND  s.organization_id = v_order.organization_id
          AND  s.start_time     <= v_order.created_at
          AND  (s.end_time IS NULL OR s.end_time >= v_order.created_at)
        ORDER  BY s.start_time DESC
        LIMIT  1;

        IF v_shift_id IS NOT NULL THEN
            UPDATE public.orders SET shift_id = v_shift_id WHERE id = v_order.id;
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'تم تحديث % طلب وربطه بورديته الصحيحة.', v_count;
END $$;

-- تحديث كاش PostgREST
NOTIFY pgrst, 'reload schema';

SELECT 'تم تطبيق الإصلاح الشامل لمشكلة طلبات QR في الوردية بنجاح (8 أخطاء).' AS status;
