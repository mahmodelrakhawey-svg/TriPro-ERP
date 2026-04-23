-- =================================================================
-- إصلاح مشكلة عدم توازن قيود إقفال الورديات
-- التاريخ: 30 مارس 2026 (تحديث: 15 أبريل 2026 - إصلاح الصلاحيات)
-- =================================================================

DROP FUNCTION IF EXISTS public.generate_shift_closing_entry(uuid);
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
    v_shift RECORD;
    v_summary record; v_je_id uuid; v_mappings jsonb;
    v_cash_acc_id uuid; v_card_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid;
    v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_diff numeric := 0; v_actual_cash_collected numeric := 0;
BEGIN
    -- 1. التحقق من الوردية
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF v_shift IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
    IF v_shift.end_time IS NULL THEN RAISE EXCEPTION 'Shift is not closed yet'; END IF;

    -- 🛡️ ضمان مبدأ Idempotency: حذف أي قيد إغلاق قديم لهذه الوردية منعاً لتكرار المبالغ في الأستاذ العام
    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    WITH shift_orders AS (
        SELECT id, subtotal, total_tax FROM public.orders
        WHERE (user_id = v_shift.user_id OR user_id IS NULL)
        AND status IN ('COMPLETED', 'PAID', 'posted')
        AND organization_id = v_shift.organization_id
        AND created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())
    )
    SELECT
        COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((SELECT SUM(delivery_fee) FROM public.delivery_orders WHERE order_id IN (SELECT id FROM shift_orders)), 0) as total_delivery_fees,
        -- محرك التكلفة المطور: يجمع تكلفة المكونات من BOM وتكلفة الأصناف المخزنية المباشرة
        COALESCE((
            SELECT SUM(item_cost) FROM (
                -- أ. حساب تكلفة الأصناف التي لها وصفات (مثل الوجبات) - نجمع كافة المكونات
                SELECT
                    COALESCE(bom.quantity_required, 0) * oi.quantity * COALESCE(ing.weighted_average_cost, ing.cost, ing.purchase_price, 0) as item_cost
                FROM public.order_items oi
                JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products ing ON bom.raw_material_id = ing.id -- المكونات الخام
                WHERE oi.order_id IN (SELECT id FROM shift_orders)
                AND oi.organization_id = v_shift.organization_id

                UNION ALL

                -- ب. حساب تكلفة الأصناف المخزنية المباشرة (مثل المشروبات) التي ليس لها وصفة
                SELECT
                    oi.quantity * COALESCE(prod.weighted_average_cost, prod.cost, prod.purchase_price, 0) as item_cost
                FROM public.order_items oi
                JOIN public.products prod ON oi.product_id = prod.id
                WHERE oi.order_id IN (SELECT id FROM shift_orders)
                AND oi.organization_id = v_shift.organization_id
                AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = prod.id)
            ) as cogs_sub
        ), 0) as cost_total,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND payment_method = 'CASH' AND status = 'COMPLETED'), 0) as cash_total,
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE order_id IN (SELECT id FROM shift_orders) AND payment_method = 'CARD' AND status = 'COMPLETED'), 0) as card_total
    INTO v_summary
    FROM shift_orders;

    -- تحديد المنظمة بذكاء (الهوية الهيكلية الموحدة)
    v_shift.organization_id := COALESCE(v_shift.organization_id, (SELECT organization_id FROM public.profiles WHERE id = v_shift.user_id), public.get_my_org());

    -- تحديث حساب الفرق ليشمل رسوم التوصيل المحصلة
    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    v_actual_cash_collected := v_summary.cash_total + v_diff;

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_shift.organization_id;

    v_cash_acc_id := COALESCE((v_mappings->>'CASH')::uuid, (SELECT id FROM public.accounts WHERE code = '1231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_card_acc_id := COALESCE((v_mappings->>'BANK_ACCOUNTS')::uuid, (SELECT id FROM public.accounts WHERE code = '123201' AND organization_id = v_shift.organization_id LIMIT 1));
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_shift.organization_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_OUTPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code = '2231' AND organization_id = v_shift.organization_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_shift.organization_id LIMIT 1));
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_shift.organization_id LIMIT 1));
    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type)
    VALUES (now()::date, 'إغلاق وردية شامل - ID: ' || substring(p_shift_id::text, 1, 8), 'SHIFT-' || to_char(now(), 'YYMMDD'), 'posted', COALESCE(v_shift.organization_id, (SELECT organization_id FROM public.profiles WHERE id = v_shift.user_id), public.get_my_org()), true, p_shift_id, 'shift') RETURNING id INTO v_je_id;
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيراد مبيعات الوردية', v_shift.organization_id);
    IF v_summary.total_delivery_fees > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_sales_acc_id, 0, v_summary.total_delivery_fees, 'إيراد رسوم توصيل الوردية', v_shift.organization_id); END IF;
    IF v_summary.tax > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_shift.organization_id); END IF;
    IF v_actual_cash_collected > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cash_acc_id, v_actual_cash_collected, 0, 'النقدية الفعلية', v_shift.organization_id); END IF;
    IF v_summary.card_total > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_card_acc_id, v_summary.card_total, 0, 'متحصلات شبكة', v_shift.organization_id); END IF;
    IF v_diff < 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_shift.organization_id LIMIT 1), ABS(v_diff), 0, 'عجز نقدية الوردية', v_shift.organization_id);
    ELSIF v_diff > 0 THEN INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, (SELECT id FROM public.accounts WHERE code = '421' AND organization_id = v_shift.organization_id LIMIT 1), 0, v_diff, 'زيادة نقدية الوردية', v_shift.organization_id); END IF;
    IF v_summary.cost_total > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cogs_acc_id, v_summary.cost_total, 0, 'تكلفة مبيعات الوردية', v_shift.organization_id),
               (v_je_id, v_inventory_acc_id, 0, v_summary.cost_total, 'صرف مخزون الوردية', v_shift.organization_id);
    END IF;
    RETURN v_je_id;
END;
$$;

-- =================================================================
-- إضافة المشغل التلقائي (Trigger) لضمان توليد القيد فور إغلاق الوردية
-- =================================================================

CREATE OR REPLACE FUNCTION public.trg_after_shift_close()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا تم وضع وقت النهاية (إغلاق) ولم يكن هناك قيد مسبقاً
    IF (NEW.end_time IS NOT NULL AND OLD.end_time IS NULL) THEN
        PERFORM public.generate_shift_closing_entry(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_journal_on_shift_close ON public.shifts;
CREATE TRIGGER trg_create_journal_on_shift_close
    AFTER UPDATE ON public.shifts
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_after_shift_close();

-- =================================================================
-- تشغيل الإصلاح بأثر رجعي للورديات التاريخية المذكورة في القائمة
-- =================================================================
DO $$
DECLARE
    v_s RECORD;
BEGIN
    FOR v_s IN 
        SELECT id FROM public.shifts 
        WHERE end_time IS NOT NULL 
        AND (related_journal_entry_id IS NULL OR id IN ('10864264-1ab1-4c2e-a1f8-205374203766', '1db80ae5-667a-464d-8f78-04f41b43af1a'))
    LOOP
        -- 1. فك الارتباط في جدول الورديات أولاً لتجنب خطأ المفتاح الخارجي (Foreign Key)
        UPDATE public.shifts 
        SET related_journal_entry_id = NULL,
            closing_entry_id = NULL 
        WHERE id = v_s.id;

        -- 2. الآن يمكن حذف القيود القديمة الخاطئة بأمان من جدول القيود
        DELETE FROM public.journal_entries WHERE reference = 'SHIFT-' || substring(v_s.id::text, 1, 8);
        
        -- 3. توليد القيد الجديد بالمنطق المطور (الذي يشمل المبيعات والمخزون والضريبة)
        PERFORM public.generate_shift_closing_entry(v_s.id);
    END LOOP;
END;
$$;

-- =================================================================
-- نظام التحديث التلقائي لتكلفة الوجبات في كرت الصنف
-- =================================================================

-- 1. دالة مركزية لحساب التكلفة الإجمالية (خام + عمالة + مصاريف)
CREATE OR REPLACE FUNCTION public.fn_calculate_and_update_product_cost(p_product_id UUID)
RETURNS VOID AS $$
DECLARE
    v_ings_cost NUMERIC := 0;
BEGIN
    -- أ. حساب تكلفة المكونات من الوصفة
    SELECT COALESCE(SUM(r.quantity_required * COALESCE(ing.cost, ing.purchase_price, 0)), 0)
    INTO v_ings_cost
    FROM public.bill_of_materials r
    JOIN public.products ing ON r.raw_material_id = ing.id
    WHERE r.product_id = p_product_id;

    -- ب. تحديث الصنف بالمعادلة المحاسبية الشاملة
    UPDATE public.products
    SET 
        cost = CASE 
            WHEN is_overhead_percentage THEN (v_ings_cost + COALESCE(labor_cost, 0)) * (1 + COALESCE(overhead_cost, 0) / 100)
            ELSE (v_ings_cost + COALESCE(labor_cost, 0) + COALESCE(overhead_cost, 0))
        END,
        -- مزامنة سعر الشراء/التكلفة التقديري ليظهر في الواجهة فوراً
        purchase_price = CASE 
            WHEN is_overhead_percentage THEN (v_ings_cost + COALESCE(labor_cost, 0)) * (1 + COALESCE(overhead_cost, 0) / 100)
            ELSE (v_ings_cost + COALESCE(labor_cost, 0) + COALESCE(overhead_cost, 0))
        END
    WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- 2. مشغل عند تغيير الوصفة
CREATE OR REPLACE FUNCTION public.fn_trigger_recipe_sync()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.fn_calculate_and_update_product_cost(COALESCE(NEW.product_id, OLD.product_id));
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_recipe_cost ON public.bill_of_materials;
CREATE TRIGGER trg_sync_recipe_cost
AFTER INSERT OR UPDATE OR DELETE ON public.bill_of_materials
FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_recipe_sync();

-- 3. مشغل عند تغيير تكلفة المكون الخام نفسه
CREATE OR REPLACE FUNCTION public.fn_update_parent_costs_when_ingredient_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.cost IS DISTINCT FROM NEW.cost) THEN
        -- تحديث كافة الوجبات التي تستخدم هذا المكون
        DECLARE
            v_parent_id UUID;
        BEGIN
            FOR v_parent_id IN SELECT product_id FROM public.bill_of_materials WHERE raw_material_id = NEW.id LOOP
                PERFORM public.fn_calculate_and_update_product_cost(v_parent_id);
            END LOOP;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_parents_on_ing_change ON public.products;
CREATE TRIGGER trg_update_parents_on_ing_change
AFTER UPDATE OF cost ON public.products
FOR EACH ROW EXECUTE FUNCTION public.fn_update_parent_costs_when_ingredient_changes();

-- 4. مشغل عند تغيير العمالة أو المصاريف في الصنف نفسه (الحل لمشكلتك الحالية)
CREATE OR REPLACE FUNCTION public.fn_trigger_product_self_cost_sync()
RETURNS TRIGGER AS $$
BEGIN
    -- الحساب عند الإضافة الجديدة أو عند تعديل مكونات التكلفة
    IF (TG_OP = 'INSERT' OR 
        COALESCE(OLD.labor_cost, 0) IS DISTINCT FROM NEW.labor_cost OR 
        COALESCE(OLD.overhead_cost, 0) IS DISTINCT FROM NEW.overhead_cost OR 
        COALESCE(OLD.is_overhead_percentage, false) IS DISTINCT FROM NEW.is_overhead_percentage) THEN
        PERFORM public.fn_calculate_and_update_product_cost(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_self_cost_sync ON public.products;
CREATE TRIGGER trg_product_self_cost_sync
AFTER INSERT OR UPDATE OF labor_cost, overhead_cost, is_overhead_percentage ON public.products
FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_product_self_cost_sync();

-- 5. تشغيل تحديث شامل الآن لكل الوجبات لملء البيانات التاريخية
DO $$
DECLARE
    v_p RECORD;
BEGIN
    FOR v_p IN SELECT id FROM public.products WHERE EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = public.products.id) LOOP
        PERFORM public.fn_calculate_and_update_product_cost(v_p.id);
    END LOOP;
END;
$$;

-- دالة مساعدة للواجهة لجلب تكلفة المكونات فقط (BOM Cost)
CREATE OR REPLACE FUNCTION public.get_product_recipe_cost(p_product_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cost NUMERIC;
BEGIN
    SELECT COALESCE(SUM(r.quantity_required * COALESCE(ing.cost, ing.purchase_price, 0)), 0) INTO v_cost
    FROM public.bill_of_materials r
    JOIN public.products ing ON r.raw_material_id = ing.id
    WHERE r.product_id = p_product_id;
    RETURN v_cost;
END;
$$;

-- رسالة تأكيد للمحاسب العزيز
SELECT '✅ تم تحديث نظام التكاليف: سيتم الآن تحديث تكلفة الوجبات آلياً في كروت الأصناف، وستظهر قيود المخزون والتكلفة في الوردية بدقة.' as status;
