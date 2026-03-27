-- =================================================================
-- إصلاح مشكلة عدم توازن قيود إقفال الورديات
-- التاريخ: 30 مارس 2026 (تحديث: 15 أبريل 2026 - إصلاح الصلاحيات)
-- =================================================================

CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_shift RECORD;
    v_sales_acc UUID;
    v_vat_acc UUID;
    v_cash_acc UUID;
    v_bank_acc UUID;
    v_shortage_acc UUID;
    v_overage_acc UUID;
    v_cogs_acc UUID;
    v_inventory_acc UUID;
    v_rounding_diff_acc UUID; -- حساب فروقات التقريب
    v_enable_tax BOOLEAN := FALSE; -- هل الضريبة مفعلة في إعدادات الشركة
    v_vat_rate NUMERIC := 0; -- نسبة الضريبة من إعدادات الشركة
    
    v_journal_entry_id UUID;
    v_journal_lines JSONB[] := ARRAY[]::JSONB[];
    
    v_total_grand_total NUMERIC := 0; -- إجمالي المبيعات الكلي (شامل الضريبة)
    v_total_tax NUMERIC := 0;
    v_net_sales NUMERIC := 0;
    
    v_cash_sales NUMERIC := 0;
    v_card_sales NUMERIC := 0;
    v_wallet_sales NUMERIC := 0;
    
    v_diff NUMERIC := 0; -- فرق العجز/الزيادة في الصندوق
    v_total_cogs NUMERIC := 0;
    
    v_total_debits NUMERIC := 0;
    v_total_credits NUMERIC := 0;
    v_balancing_diff NUMERIC := 0;
BEGIN
    -- 1. التحقق من الوردية
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF v_shift IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
    IF v_shift.end_time IS NULL THEN RAISE EXCEPTION 'Shift is not closed yet'; END IF;

    -- منع التكرار: إذا كان هناك قيد مرتبط مسبقاً، نرجعه فوراً ولا ننشئ واحداً جديداً (حل مشكلة الخطأ 409)
    IF v_shift.related_journal_entry_id IS NOT NULL THEN
        RETURN v_shift.related_journal_entry_id;
    END IF;

    -- 2. جلب نسبة الضريبة وحالة تفعيلها من إعدادات الشركة
    SELECT vat_rate, enable_tax INTO v_vat_rate, v_enable_tax FROM public.company_settings LIMIT 1;
    -- إذا كانت الضريبة مفعلة ولكن النسبة صفر، نستخدم 15% كافتراضي
    IF v_enable_tax AND COALESCE(v_vat_rate, 0) = 0 THEN
        v_vat_rate := 0.15;
    ELSIF NOT v_enable_tax THEN
        v_vat_rate := 0; -- إذا كانت الضريبة غير مفعلة، تكون النسبة صفر
    ELSE
        v_vat_rate := COALESCE(v_vat_rate, 0); -- استخدام النسبة الموجودة أو صفر إذا كانت NULL
        -- تصحيح: إذا كانت النسبة مسجلة كرقم صحيح (مثلاً 14) وليس كسر عشري (0.14)
        IF v_vat_rate >= 1 THEN
            v_vat_rate := v_vat_rate / 100;
        END IF;
    END IF;

    -- 3 & 5. جلب إحصائيات التحصيل بناءً على "وقت الوردية" حصراً
    -- هذا هو الحل الجذري: أي مبلغ دخل الصندوق بين وقت الفتح والإغلاق سيتم تسجيله
    SELECT 
        COALESCE(SUM(amount), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'CARD' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'WALLET' THEN amount ELSE 0 END), 0)
    INTO v_total_grand_total, v_cash_sales, v_card_sales, v_wallet_sales
    FROM public.payments
    WHERE created_at >= v_shift.start_time 
      AND created_at <= v_shift.end_time
      AND status = 'COMPLETED';

    -- 4. استنتاج المبيعات الصافية والضريبة من الإجمالي الكلي ونسبة الضريبة
    IF v_vat_rate > 0 THEN
        v_total_tax := v_total_grand_total * (v_vat_rate / (1 + v_vat_rate));
        v_net_sales := v_total_grand_total - v_total_tax;
    ELSE
        v_total_tax := 0;
        v_net_sales := v_total_grand_total;
    END IF;

    -- 6. حساب التكلفة (COGS) - الربط عبر المدفوعات لضمان شمول كل ما تم بيعه فعلياً
    -- تم تعديل الاستعلام ليشمل كافة المكونات لكل صنف مباع لضمان دقة التكلفة والمخزون
    SELECT COALESCE(SUM(item_cost), 0)
    INTO v_total_cogs
    FROM (
        -- أ. حساب تكلفة الأصناف التي لها وصفات (مثل الوجبات) - نجمع كافة المكونات
        SELECT 
            COALESCE(r.quantity_required, 0) * COALESCE(oi.quantity, 0) * COALESCE(ing.cost, ing.purchase_price, 0) as item_cost
        FROM public.order_items oi
        JOIN public.orders o ON oi.order_id = o.id
        JOIN public.payments p ON o.id = p.order_id -- الربط بالمدفوعات
        JOIN public.bill_of_materials r ON oi.product_id = r.product_id
        JOIN public.products ing ON r.raw_material_id = ing.id -- المكونات الخام
        WHERE p.created_at >= v_shift.start_time AND p.created_at <= v_shift.end_time 
          AND p.status = 'COMPLETED' AND o.status = 'COMPLETED'

        UNION ALL

        -- ب. حساب تكلفة الأصناف المخزنية المباشرة (مثل المشروبات) التي ليس لها وصفة
        SELECT 
            COALESCE(oi.quantity, 0) * COALESCE(prod.cost, prod.purchase_price, 0) as item_cost
        FROM public.order_items oi
        JOIN public.orders o ON oi.order_id = o.id
        JOIN public.payments p ON o.id = p.order_id
        JOIN public.products prod ON oi.product_id = prod.id
        WHERE prod.item_type = 'STOCK' 
          AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials WHERE product_id = prod.id)
          AND p.created_at >= v_shift.start_time AND p.created_at <= v_shift.end_time 
          AND p.status = 'COMPLETED' AND o.status = 'COMPLETED'
    ) subquery;

    v_diff := COALESCE(v_shift.difference, 0);

    -- 7. جلب الحسابات الأساسية (مع فحص صارم لوجودها)
    SELECT id INTO v_sales_acc FROM public.accounts WHERE code = '411' LIMIT 1;
    IF v_sales_acc IS NULL THEN RAISE EXCEPTION 'Account with code 411 (Sales Revenue) not found. Please create it.'; END IF;

    SELECT id INTO v_vat_acc FROM public.accounts WHERE code = '2231' LIMIT 1;
    IF v_vat_acc IS NULL THEN RAISE EXCEPTION 'Account with code 2231 (Output VAT) not found. Please create it.'; END IF;

    SELECT id INTO v_cash_acc FROM public.accounts WHERE code = '1231' LIMIT 1;
    IF v_cash_acc IS NULL THEN RAISE EXCEPTION 'Account with code 1231 (Cash) not found. Please create it.'; END IF;

    SELECT id INTO v_bank_acc FROM public.accounts WHERE code = '123201' LIMIT 1; -- البنك الأهلي كافتراضي
    IF v_bank_acc IS NULL THEN SELECT id INTO v_bank_acc FROM public.accounts WHERE code = '1232' LIMIT 1; END IF;
    IF v_bank_acc IS NULL THEN RAISE EXCEPTION 'Bank Account (123201 or 1232) not found. Please create it.'; END IF;
    
    SELECT id INTO v_shortage_acc FROM public.accounts WHERE code = '541' LIMIT 1;
    IF v_shortage_acc IS NULL THEN RAISE EXCEPTION 'Account with code 541 (Cash Shortage) not found. Please create it.'; END IF;

    SELECT id INTO v_overage_acc FROM public.accounts WHERE code = '421' LIMIT 1;
    IF v_overage_acc IS NULL THEN RAISE EXCEPTION 'Account with code 421 (Miscellaneous Revenue/Overage) not found. Please create it.'; END IF;

    SELECT id INTO v_cogs_acc FROM public.accounts WHERE code = '511' LIMIT 1;
    IF v_cogs_acc IS NULL THEN RAISE EXCEPTION 'Account with code 511 (COGS) not found. Please create it.'; END IF;

    SELECT id INTO v_inventory_acc FROM public.accounts WHERE code = '10301' LIMIT 1;
    IF v_inventory_acc IS NULL THEN SELECT id INTO v_inventory_acc FROM public.accounts WHERE code = '103' LIMIT 1; END IF;
    IF v_inventory_acc IS NULL THEN RAISE EXCEPTION 'Account with code 10301 (Raw Material Inventory) not found. Please create it.'; END IF;
    
    -- حساب لتسوية الفروقات (مثلاً إيرادات متنوعة أو مصروفات متنوعة)
    SELECT id INTO v_rounding_diff_acc FROM public.accounts WHERE code = '421' LIMIT 1; 
    IF v_rounding_diff_acc IS NULL THEN RAISE EXCEPTION 'Account with code 421 (Rounding Difference) not found. Please create it.'; END IF;

    -- 8. بناء أسطر القيد
    
    -- أ. الإيرادات (دائن)
    IF v_net_sales > 0 THEN 
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_sales_acc, 'debit', 0, 'credit', v_net_sales, 'description', 'إيراد مبيعات وردية'));
        v_total_credits := v_total_credits + v_net_sales;
    END IF;
    
    -- ب. الضريبة (دائن)
    IF v_total_tax > 0 THEN 
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_vat_acc, 'debit', 0, 'credit', v_total_tax, 'description', 'ضريبة مبيعات وردية'));
        v_total_credits := v_total_credits + v_total_tax;
    END IF;

    -- ج. المدفوعات البنكية (مدين)
    IF (v_card_sales + v_wallet_sales) > 0 AND v_bank_acc IS NOT NULL THEN 
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_bank_acc, 'debit', (v_card_sales + v_wallet_sales), 'credit', 0, 'description', 'متحصلات شبكة/محفظة'));
        v_total_debits := v_total_debits + (v_card_sales + v_wallet_sales);
    END IF;
    
    -- د. المدفوعات النقدية "المتوقعة" (مدين)
    -- ملاحظة: نحن نثبت النقدية المتوقعة أولاً، ثم نعالج العجز/الزيادة في خطوة منفصلة
    IF v_cash_sales > 0 THEN 
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cash_acc, 'debit', v_cash_sales, 'credit', 0, 'description', 'متحصلات نقدية (مبيعات)'));
        v_total_debits := v_total_debits + v_cash_sales;
    END IF;

    -- هـ. موازنة القيد (إجباري لضمان ظهور القيد)
    v_balancing_diff := v_total_debits - v_total_credits;
    
    IF ABS(v_balancing_diff) > 0 THEN
        IF v_balancing_diff > 0 THEN
            v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_rounding_diff_acc, 'debit', 0, 'credit', ABS(v_balancing_diff), 'description', 'تسوية فروقات مبيعات - مراجعة يدوية مطلوبة'));
        ELSE
            v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_rounding_diff_acc, 'debit', ABS(v_balancing_diff), 'credit', 0, 'description', 'تسوية فروقات مبيعات - مراجعة يدوية مطلوبة'));
        END IF;
    END IF;

    -- و. قيد التكلفة والمخزون (منفصل ومتوازن ذاتياً)
    IF v_total_cogs > 0 THEN
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cogs_acc, 'debit', v_total_cogs, 'credit', 0, 'description', 'تكلفة مبيعات الوردية'));
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_inventory_acc, 'debit', 0, 'credit', v_total_cogs, 'description', 'صرف مخزون للوردية'));
    END IF;

    -- ز. تسوية العجز والزيادة الفعلي (Shift Difference)
    -- هذا يعالج الفرق بين الكاش المتوقع (v_cash_sales) والكاش الفعلي المدخل
    IF v_diff < 0 THEN -- عجز
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cash_acc, 'debit', 0, 'credit', ABS(v_diff), 'description', 'إثبات عجز وردية'));
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_shortage_acc, 'debit', ABS(v_diff), 'credit', 0, 'description', 'مصروف عجز وردية'));
    ELSIF v_diff > 0 THEN -- زيادة
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cash_acc, 'debit', v_diff, 'credit', 0, 'description', 'إثبات زيادة وردية'));
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_overage_acc, 'debit', 0, 'credit', v_diff, 'description', 'إيراد زيادة وردية'));
    END IF;

    -- 9. إنشاء القيد
    IF array_length(v_journal_lines, 1) > 0 THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, user_id)
        VALUES (now(), 'إقفال وردية - ' || to_char(v_shift.start_time, 'YYYY-MM-DD HH24:MI'), 'SHIFT-' || substring(p_shift_id::text, 1, 8), 'posted', v_shift.user_id)
        RETURNING id INTO v_journal_entry_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
        SELECT v_journal_entry_id, (line->>'account_id')::uuid, (line->>'debit')::numeric, (line->>'credit')::numeric, line->>'description'
        FROM jsonb_array_elements(to_jsonb(v_journal_lines)) AS line;

        UPDATE public.shifts SET related_journal_entry_id = v_journal_entry_id WHERE id = p_shift_id;
    END IF;
    
    RETURN v_journal_entry_id;
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
